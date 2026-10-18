//! Recording accompaniment and monitor-only clicks on the same integer frame
//! axis as timing::Intent. Rendering and graph preroll run only on the worker.
use super::{Control, Graph, Reader, Renderer, Stereo, Worker, MAX_FRAMES};
use crate::{native_input::timing::Intent, Result};
use std::time::Duration;
const RATE: f64 = 48000.;
/// Musical monitor settings, separate from the saved/exported graph. Count-in
/// clicks remain audible even when the project metronome is disabled.
#[derive(Clone, Debug, serde::Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Click {
    pub tempo: f64,
    pub numerator: u32,
    pub denominator: u32,
    pub origin_seconds: f64,
    pub level: f32,
    pub metronome: bool,
}
impl Click {
    fn validate(&self) -> Result<()> {
        if !self.tempo.is_finite()
            || !(20. ..=300.).contains(&self.tempo)
            || !(1..=32).contains(&self.numerator)
            || ![1, 2, 4, 8, 16].contains(&self.denominator)
            || !self.origin_seconds.is_finite()
            || !(0. ..=86400.).contains(&self.origin_seconds)
            || !self.level.is_finite()
            || !(0. ..=1.).contains(&self.level)
        {
            return Err("Invalid native recording click".into());
        }
        Ok(())
    }
    fn sample(&self, frame: i64, start: i64, end: i64, count_in: bool) -> f32 {
        if self.level == 0. || (!count_in && !self.metronome) || frame < start || frame >= end {
            return 0.;
        }
        let period = RATE * 60. / self.tempo * 4. / self.denominator as f64;
        let origin = if count_in {
            0.
        } else {
            self.origin_seconds * RATE
        };
        // Round each onset independently; never accumulate a rounded beat period.
        let mut index = ((frame as f64 - origin + 0.5) / period).floor() as i64;
        let mut onset = (origin + index as f64 * period).round() as i64;
        if onset > frame {
            index -= 1;
            onset = (origin + index as f64 * period).round() as i64;
        }
        let age = frame - onset;
        // The half-open transport window owns its onsets. Do not introduce a
        // stale click tail when starting/seeking or crossing a loop boundary.
        if onset < start || !(0..1920).contains(&age) {
            return 0.;
        }
        let peak = 0.08 * self.level as f64;
        let envelope = if age < 96 {
            peak * age as f64 / 96.
        } else if age < 1680 {
            peak * (0.00001_f64.min(peak) / peak).powf((age - 96) as f64 / 1584.)
        } else {
            0.00001_f64.min(peak)
        };
        let frequency = if index.rem_euclid(self.numerator as i64) == 0 {
            1200.
        } else {
            800.
        };
        (envelope * (std::f64::consts::TAU * frequency * age as f64 / RATE).sin()) as f32
    }
}
/// `frames` includes silent delay/count-in and every capture pass. It is a finite
/// admission budget, not the current project duration or a full PCM allocation.
#[derive(Clone, Debug)]
pub struct Plan {
    pub intent: Intent,
    pub frames: u64,
    /// Suffix of Intent.lead_frames; the preceding frames are silent delay.
    pub count_in_frames: u32,
    pub click: Option<Click>,
}
impl Plan {
    fn validate(&self, graph: &Graph) -> Result<()> {
        self.intent.validate(
            &self
                .intent
                .corrections
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
        )?;
        if self.frames == 0
            || self.frames > 32_000_000
            || self.frames <= self.intent.lead_frames as u64
            || self.count_in_frames > self.intent.lead_frames
            || (self.count_in_frames != 0 && self.click.is_none())
            || self.intent.project_start_frame as u64 + graph.latency() as u64 + self.frames
                - self.intent.lead_frames as u64
                > u32::MAX as u64
            || (self.intent.cycle
                && self.intent.record_end_frame.unwrap() > graph.duration() as i64)
        {
            return Err("Invalid native recording backing plan".into());
        }
        if let Some(click) = &self.click {
            click.validate()?;
        }
        Ok(())
    }
}
struct Recording {
    graph: Graph,
    plan: Plan,
    position: u64,
}
impl Recording {
    fn prepare(mut graph: Graph, plan: Plan, control: &Control) -> Result<Self> {
        plan.validate(&graph)?;
        if plan.intent.cycle {
            graph.set_cycle(
                plan.intent.record_start_frame as u32,
                plan.intent.record_end_frame.unwrap() as u32,
            )?;
        }
        let mut remaining = plan.intent.project_start_frame as u64 + graph.latency() as u64;
        let mut scratch = [[0.; 2]; MAX_FRAMES];
        while remaining > 0 {
            if control.cancelled() {
                return Err("Recording backing preparation cancelled".into());
            }
            let count = remaining.min(MAX_FRAMES as u64) as usize;
            graph.render(&mut scratch[..count])?;
            remaining -= count as u64;
        }
        Ok(Self {
            graph,
            plan,
            position: 0,
        })
    }
    fn project_window(&self, output: u64) -> (i64, i64, i64) {
        let intent = &self.plan.intent;
        let project = intent.project_start_frame + (output - intent.lead_frames as u64) as i64;
        if intent.cycle && project >= intent.record_end_frame.unwrap() {
            let start = intent.record_start_frame;
            let end = intent.record_end_frame.unwrap();
            (start + (project - end) % (end - start), start, end)
        } else {
            (
                project,
                intent.project_start_frame,
                intent.record_end_frame.unwrap_or(i64::MAX),
            )
        }
    }
}
impl Renderer for Recording {
    fn render(&mut self, output: &mut [Stereo]) -> Result<()> {
        output.fill([0.; 2]);
        if output.is_empty()
            || output.len() > MAX_FRAMES
            || self.position + output.len() as u64 > self.plan.frames
        {
            return Err("Invalid recording backing block".into());
        }
        let lead = self.plan.intent.lead_frames as u64;
        let silent = lead.saturating_sub(self.position).min(output.len() as u64) as usize;
        if silent < output.len() {
            self.graph.render(&mut output[silent..])?;
        }
        if let Some(click) = &self.plan.click {
            for (index, sample) in output.iter_mut().enumerate() {
                let frame = self.position + index as u64;
                let value = if frame < lead {
                    let begin = lead - self.plan.count_in_frames as u64;
                    if frame < begin {
                        0.
                    } else {
                        click.sample(
                            (frame - begin) as i64,
                            0,
                            self.plan.count_in_frames as i64,
                            true,
                        )
                    }
                } else {
                    let (project, start, end) = self.project_window(frame);
                    click.sample(project, start, end, false)
                };
                sample[0] += value;
                sample[1] += value;
            }
        }
        self.position += output.len() as u64;
        Ok(())
    }
}
impl Worker {
    /// Uses the exact same frozen intent as raw take placement. Helpers and graph
    /// history warm before capture opens; count-in never advances project time.
    /// Cycle DSP history is retained, and clicks never enter dry files or exports.
    pub fn recording(
        timeout: Duration,
        plan: Plan,
        prepare: impl FnOnce(Control) -> Result<Graph> + Send + 'static,
    ) -> Result<(Self, Reader)> {
        Self::recording_cancellable(timeout, plan, &|| false, prepare)
    }
    pub fn recording_cancellable(
        timeout: Duration,
        plan: Plan,
        cancelled: &dyn Fn() -> bool,
        prepare: impl FnOnce(Control) -> Result<Graph> + Send + 'static,
    ) -> Result<(Self, Reader)> {
        Self::start_cancellable(timeout, cancelled, move |control| {
            let frames = plan.frames;
            let renderer = Recording::prepare(prepare(control.clone())?, plan, &control)?;
            Ok((renderer, frames))
        })
    }
}
#[cfg(test)]
mod tests;
