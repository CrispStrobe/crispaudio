//! Bounded cue consumer and integer host-clock mapping. No hardware queue, helper
//! IPC, resampling, project placement or WebKit calls. Construct/drop off callback.
use super::{CueOutput, Fault as InputFault, Packet, CUE_SLOTS, MAX_FRAMES};
use crate::{native_graph::Stereo, Result};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Timebase {
    numerator: u32,
    denominator: u32,
}
impl Timebase {
    /// Nanoseconds per hardware tick, e.g. mach_timebase_info numer/denom.
    pub fn new(numerator: u32, denominator: u32) -> Result<Self> {
        if numerator == 0 || denominator == 0 {
            return Err("Invalid host timebase".into());
        }
        Ok(Self {
            numerator,
            denominator,
        })
    }
    pub fn ratio(self) -> (u32, u32) {
        (self.numerator, self.denominator)
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClockMap {
    timebase: Timebase,
    anchor_host: u64,
    anchor_frame: i64,
}
impl ClockMap {
    /// Anchor must describe the OUTPUT render/audible frame clock, not callback
    /// arrival time or a looping arrangement playhead. Hardware must establish it.
    pub fn new(timebase: Timebase, anchor_host: u64, anchor_frame: i64) -> Self {
        Self {
            timebase,
            anchor_host,
            anchor_frame,
        }
    }
    pub fn anchor(self) -> (u64, i64) {
        (self.anchor_host, self.anchor_frame)
    }
    pub fn timebase(self) -> Timebase {
        self.timebase
    }
    /// Rounded nearest frame (ties away from zero). Subtract epochs BEFORE
    /// scaling so large uptime ticks retain sub-frame precision; no allocation.
    pub fn frame_at(self, host: u64) -> Option<i64> {
        let ticks = host as i128 - self.anchor_host as i128;
        let numerator = ticks
            .checked_mul(self.timebase.numerator as i128)?
            .checked_mul(48000)?;
        let denominator = self.timebase.denominator as i128 * 1_000_000_000;
        let magnitude = numerator.abs().checked_add(denominator / 2)? / denominator;
        let delta = if numerator < 0 { -magnitude } else { magnitude };
        i64::try_from((self.anchor_frame as i128).checked_add(delta)?).ok()
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fault {
    Cancelled,
    InvalidBuffer,
    OutputClock,
    InputClock,
    ClockRange,
    Drift,
    StartupTimeout,
    Late,
    Underrun,
    PacketBudget,
    Upstream(InputFault),
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Waiting,
    Running,
    Ended,
    Fault,
}
#[derive(Clone, Copy, Debug)]
pub struct Report {
    pub phase: Phase,
    pub fault: Option<Fault>,
    pub copied_frames: usize,
    pub played_frames: u64,
    pub drift_frames: i64,
}
pub struct Config {
    pub clock: ClockMap,
    pub start_frame: i64,
    /// Native transport delay only; plug-in delay is additional. Not a shipped
    /// latency promise. Bound by the existing cue ring's frame capacity.
    pub delay_frames: u32,
    /// Initial missing data may stay silent for this many output frames.
    pub startup_grace_frames: u32,
    /// Maximum accumulated rounded input/host drift. We detect and mute; we do
    /// not silently resample, retime clips or promise independent-device sync.
    pub max_drift_frames: u32,
}
struct Pending {
    packet: Packet,
    due: i64,
    offset: usize,
}
pub struct Scheduler {
    input: CueOutput,
    config: Config,
    pending: Option<Pending>,
    next_output: i64,
    startup_deadline: i64,
    origin: Option<(u64, i64)>,
    next_input: Option<u64>,
    last_host: Option<u64>,
    next_due: Option<i64>,
    phase: Phase,
    fault: Option<Fault>,
    played: u64,
    drift: i64,
}
impl Scheduler {
    pub fn new(input: CueOutput, config: Config) -> Result<Self> {
        if config.delay_frames == 0
            || config.delay_frames as usize > CUE_SLOTS * MAX_FRAMES
            || !(1..=48000).contains(&config.startup_grace_frames)
            || !(1..=MAX_FRAMES as u32).contains(&config.max_drift_frames)
        {
            return Err("Invalid native cue scheduling limits".into());
        }
        let startup_deadline = config
            .start_frame
            .checked_add(config.startup_grace_frames as i64)
            .ok_or("Output startup clock overflow")?;
        let next_output = config.start_frame;
        Ok(Self {
            input,
            config,
            pending: None,
            next_output,
            startup_deadline,
            origin: None,
            next_input: None,
            last_host: None,
            next_due: None,
            phase: Phase::Waiting,
            fault: None,
            played: 0,
            drift: 0,
        })
    }
    pub fn report(&self) -> Report {
        self.report_with(0)
    }
    fn report_with(&self, copied_frames: usize) -> Report {
        Report {
            phase: self.phase,
            fault: self.fault,
            copied_frames,
            played_frames: self.played,
            drift_frames: self.drift,
        }
    }
    fn fail(&mut self, fault: Fault) {
        if self.fault.is_none() {
            self.fault = Some(fault);
        }
        self.phase = Phase::Fault;
        // Atomic only. Session polling kills/reaps helpers OFF callback. Cancelling
        // cue has no effect on the independent raw/file ingress.
        self.input.status().cancel();
    }
    pub fn cancel(&mut self) {
        self.fail(Fault::Cancelled);
    }
    fn stage(&mut self, packet: Packet) -> std::result::Result<Pending, Fault> {
        let frames = packet.samples().len();
        if frames == 0
            || frames > MAX_FRAMES
            || self
                .next_input
                .is_some_and(|next| next != packet.first_frame)
            || self.last_host.is_some_and(|host| packet.host_time <= host)
        {
            return Err(Fault::InputClock);
        }
        let mapped = self
            .config
            .clock
            .frame_at(packet.host_time)
            .ok_or(Fault::ClockRange)?;
        let due = if let Some((input_origin, host_origin)) = self.origin {
            let elapsed = packet
                .first_frame
                .checked_sub(input_origin)
                .ok_or(Fault::InputClock)?;
            let drift = mapped as i128 - host_origin as i128 - elapsed as i128;
            self.drift = i64::try_from(drift).map_err(|_| Fault::ClockRange)?;
            if drift.abs() > self.config.max_drift_frames as i128 {
                return Err(Fault::Drift);
            }
            self.next_due.ok_or(Fault::InputClock)?
        } else {
            self.origin = Some((packet.first_frame, mapped));
            let due = mapped
                .checked_add(self.config.delay_frames as i64)
                .ok_or(Fault::ClockRange)?;
            if due > self.startup_deadline {
                return Err(Fault::StartupTimeout);
            }
            due
        };
        self.next_input = Some(
            packet
                .first_frame
                .checked_add(frames as u64)
                .ok_or(Fault::InputClock)?,
        );
        self.last_host = Some(packet.host_time);
        self.next_due = Some(due.checked_add(frames as i64).ok_or(Fault::ClockRange)?);
        Ok(Pending {
            packet,
            due,
            offset: 0,
        })
    }
    /// With valid adapter buffers (1..=512 frames), callback work is bounded:
    /// zero/copy <=512 frames and pop <=8 queued packets.
    /// integer clock checks and atomic status only. No alloc, locks, IPC, disk or
    /// helper destruction. On any fault the WHOLE current block is silence.
    /// The adapter must bound its buffer and provide contiguous OUTPUT frames
    /// (including startup). Invalid caller buffers are cleared in full and fault.
    pub fn render(&mut self, first_frame: i64, output: &mut [Stereo]) -> Report {
        output.fill([0.; 2]);
        let played = self.played;
        let result = self.render_inner(first_frame, output);
        match result {
            Ok(copied) => self.report_with(copied),
            Err(fault) => {
                self.played = played;
                output.fill([0.; 2]);
                self.fail(fault);
                self.report_with(0)
            }
        }
    }
    fn render_inner(
        &mut self,
        first_frame: i64,
        output: &mut [Stereo],
    ) -> std::result::Result<usize, Fault> {
        if let Some(fault) = self.fault {
            return Err(fault);
        }
        if output.is_empty() || output.len() > MAX_FRAMES {
            return Err(Fault::InvalidBuffer);
        }
        if first_frame != self.next_output {
            return Err(Fault::OutputClock);
        }
        self.next_output = first_frame
            .checked_add(output.len() as i64)
            .ok_or(Fault::ClockRange)?;
        if let Some(fault) = self.input.status().fault() {
            return Err(Fault::Upstream(fault));
        }
        if self.phase == Phase::Ended {
            return Ok(0);
        }
        let mut cursor = 0;
        let mut pops = 0;
        let mut copied = 0;
        while cursor < output.len() {
            if self.pending.is_none() {
                if pops == CUE_SLOTS {
                    let closed = self.input.status().closed();
                    let queued = self.input.queued_packets(); // AFTER closed acquire.
                    if let Some(fault) = self.input.status().fault() {
                        return Err(Fault::Upstream(fault));
                    }
                    if closed && queued == 0 {
                        self.phase = Phase::Ended;
                        break;
                    }
                    return Err(if queued != 0 {
                        Fault::PacketBudget
                    } else {
                        Fault::Underrun
                    });
                }
                if let Some(packet) = self.input.pop() {
                    pops += 1;
                    self.pending = Some(self.stage(packet)?);
                } else if let Some(fault) = self.input.status().fault() {
                    return Err(Fault::Upstream(fault));
                } else if self.input.status().closed() {
                    // A final packet may have been published between pop(None)
                    // and acquiring closed. Recheck AFTER the close publication.
                    if self.input.queued_packets() != 0 {
                        continue;
                    }
                    self.phase = Phase::Ended;
                    break;
                } else if self.origin.is_none() {
                    if self.next_output > self.startup_deadline {
                        return Err(Fault::StartupTimeout);
                    }
                    break;
                } else {
                    return Err(Fault::Underrun);
                }
            }
            let pending = self.pending.as_mut().unwrap();
            let due = pending
                .due
                .checked_add(pending.offset as i64)
                .ok_or(Fault::ClockRange)?;
            let position = first_frame
                .checked_add(cursor as i64)
                .ok_or(Fault::ClockRange)?;
            if due < position {
                return Err(Fault::Late);
            }
            if due > position {
                let silence =
                    (due as i128 - position as i128).min((output.len() - cursor) as i128) as usize;
                cursor += silence;
                continue;
            }
            let count =
                (pending.packet.samples().len() - pending.offset).min(output.len() - cursor);
            output[cursor..cursor + count]
                .copy_from_slice(&pending.packet.samples()[pending.offset..pending.offset + count]);
            cursor += count;
            pending.offset += count;
            copied += count;
            if pending.offset == pending.packet.samples().len() {
                self.pending = None;
            }
            self.phase = Phase::Running;
        }
        if let Some(fault) = self.input.status().fault() {
            return Err(Fault::Upstream(fault));
        }
        self.played = self
            .played
            .checked_add(copied as u64)
            .ok_or(Fault::ClockRange)?;
        Ok(copied)
    }
}
#[cfg(test)]
mod tests;
