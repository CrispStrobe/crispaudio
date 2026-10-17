//! Shared cue/backing summing, constructed and dropped off the audio callback.
//! Backing PCM must be rendered ahead of time on a worker: Graph/plugin rendering
//! is deliberately not called here. The hardware owner must stop synchronized
//! recording when this mix faults; individual cue faults leave backing and dry intact.
use super::{output, CueOutput, MAX_FRAMES};
use crate::{native_graph::Stereo, Result};

pub const MAX_INPUTS: usize = 16;
const RAMP_FRAMES: usize = 64;

#[derive(Clone, Copy, Debug)]
pub struct Controls {
    /// Linear gain, 0..4; summing preserves headroom (no implicit limiter).
    pub gain: f32,
    /// Stereo balance, -1 left .. 1 right. Mono averages channels before balance.
    pub pan: f32,
    pub mono: bool,
}
impl Controls {
    fn coefficients(self) -> Result<[[f32; 2]; 2]> {
        if !self.gain.is_finite()
            || !(0.0..=4.0).contains(&self.gain)
            || !self.pan.is_finite()
            || !(-1.0..=1.0).contains(&self.pan)
        {
            return Err("Invalid cue mix controls".into());
        }
        let left = self.gain * (1.0 - self.pan.max(0.0));
        let right = self.gain * (1.0 + self.pan.min(0.0));
        Ok(if self.mono {
            [[left * 0.5; 2], [right * 0.5; 2]]
        } else {
            [[left, 0.0], [0.0, right]]
        })
    }
}
struct Lane {
    scheduler: output::Scheduler,
    current: [[f32; 2]; 2],
    target: [[f32; 2]; 2],
    remaining: usize,
}
/// Silent is intentional silence/EOF. Unavailable means a missed worker deadline,
/// never permission to advance the backing timeline silently.
pub enum Backing<'a> {
    Silent,
    Audio {
        first_frame: i64,
        samples: &'a [Stereo],
    },
    Unavailable,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fault {
    Buffer,
    Clock,
    Backing,
    NonFinite,
}
pub struct Mixer {
    lanes: Vec<Lane>,
    next: i64,
    fault: Option<Fault>,
    scratch: [Stereo; MAX_FRAMES],
}
impl Mixer {
    /// All inputs must share one output clock and initial frame. Allocation and
    /// any helper preparation belong on the control thread before construction.
    pub fn new(inputs: Vec<(CueOutput, output::Config, Controls)>, start: i64) -> Result<Self> {
        if inputs.len() > MAX_INPUTS {
            return Err("Too many cue inputs".into());
        }
        let clock = inputs.first().map(|(_, config, _)| config.clock);
        let mut lanes = Vec::with_capacity(inputs.len());
        for (input, config, controls) in inputs {
            if config.start_frame != start || Some(config.clock) != clock {
                return Err("Cue inputs must share the output clock".into());
            }
            let current = controls.coefficients()?;
            lanes.push(Lane {
                scheduler: output::Scheduler::new(input, config)?,
                current,
                target: current,
                remaining: 0,
            });
        }
        Ok(Self {
            lanes,
            next: start,
            fault: None,
            scratch: [[0.; 2]; MAX_FRAMES],
        })
    }
    /// Called by the exclusive render owner after a bounded command handoff.
    /// Matrix interpolation smooths level, balance and mono changes over 64 frames.
    pub fn set_controls(&mut self, index: usize, controls: Controls) -> Result<()> {
        let target = controls.coefficients()?;
        let lane = self.lanes.get_mut(index).ok_or("Unknown cue input")?;
        lane.target = target;
        lane.remaining = RAMP_FRAMES;
        Ok(())
    }
    pub fn cue_report(&self, index: usize) -> Option<output::Report> {
        self.lanes.get(index).map(|lane| lane.scheduler.report())
    }
    pub fn fault(&self) -> Option<Fault> {
        self.fault
    }
    fn fail(&mut self, fault: Fault, output: &mut [Stereo]) {
        self.fault.get_or_insert(fault);
        output.fill([0.; 2]);
        for lane in &mut self.lanes {
            lane.scheduler.cancel();
        }
    }
    /// Bounded by 16 schedulers and 512 frames. No allocations, app locks, file
    /// access or helper IPC. A cue failure mutes only that lane; a backing/clock
    /// failure latches whole-output silence until the owner shuts down/restarts.
    pub fn render(&mut self, first: i64, backing: Backing<'_>, output: &mut [Stereo]) {
        output.fill([0.; 2]);
        if self.fault.is_some() {
            return;
        }
        if output.is_empty() || output.len() > MAX_FRAMES {
            self.fail(Fault::Buffer, output);
            return;
        }
        let Some(next) = first.checked_add(output.len() as i64) else {
            self.fail(Fault::Clock, output);
            return;
        };
        if first != self.next {
            self.fail(Fault::Clock, output);
            return;
        }
        match backing {
            Backing::Silent => (),
            Backing::Audio {
                first_frame,
                samples,
            } if first_frame == first && samples.len() == output.len() => {
                if samples.iter().flatten().any(|value| !value.is_finite()) {
                    self.fail(Fault::NonFinite, output);
                    return;
                }
                output.copy_from_slice(samples);
            }
            _ => {
                self.fail(Fault::Backing, output);
                return;
            }
        }
        self.next = next;
        for lane in &mut self.lanes {
            let scratch = &mut self.scratch[..output.len()];
            lane.scheduler.render(first, scratch);
            for (sample, mixed) in scratch.iter().zip(output.iter_mut()) {
                if lane.remaining != 0 {
                    for (row, target) in lane.current.iter_mut().zip(lane.target) {
                        for (value, target) in row.iter_mut().zip(target) {
                            *value += (target - *value) / lane.remaining as f32;
                        }
                    }
                    lane.remaining -= 1;
                }
                for (value, row) in mixed.iter_mut().zip(lane.current) {
                    *value += sample[0] * row[0] + sample[1] * row[1];
                }
            }
        }
        if output.iter().flatten().any(|value| !value.is_finite()) {
            self.fail(Fault::NonFinite, output);
        }
    }
}

#[cfg(test)]
mod tests;
