//! Persisted native recording timing. Integer 48 kHz frames, never JS/callback
//! arrival time. This validates clock consistency; it does not resample drift or
//! establish physical ADC/DAC accuracy without separate calibration/acceptance.
use super::{
    output::{ClockMap, Timebase},
    recording,
    session::group::{Clip, Input},
};
use crate::Result;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    path::{Component, Path},
};
const RATE: i64 = 48000;
const MAX_PROJECT: i64 = u32::MAX as i64;
const KEY: &str = "nativeRecordingTiming";
const MAX_PLACEMENTS: usize = 4096;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Context {
    /// Opaque boot + unique recording-run identity, supplied before preparation.
    pub scope: String,
    pub numerator: u32,
    pub denominator: u32,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Basis {
    Unqualified,
    Manual,
    Measured,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Correction {
    /// Additional placement adjustment, not cue/plug-in/queue delay.
    pub frames: i32,
    pub basis: Basis,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Intent {
    pub context: Context,
    pub project_id: String,
    /// Silent delay/count-in before the project clock starts advancing.
    pub lead_frames: u32,
    pub project_start_frame: i64,
    pub record_start_frame: i64,
    pub record_end_frame: Option<i64>,
    /// After the first pass, repeat record_start..record_end on the output clock.
    pub cycle: bool,
    pub max_drift_frames: u32,
    pub corrections: BTreeMap<String, Correction>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Snapshot {
    pub numerator: u32,
    pub denominator: u32,
    /// Decimal string preserves exact host ticks across JavaScript/JSON.
    pub anchor_host: String,
    pub anchor_frame: i64,
    pub first_mixed_frame: i64,
    pub end_queued_frame: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Placement {
    pub track_id: String,
    pub pass: u32,
    pub project_start_frame: u64,
    pub source_offset_frames: u64,
    pub frames: u64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Trace {
    pub track_id: String,
    pub first_output_frame: i64,
    pub min_drift_frames: i64,
    pub max_drift_frames: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Timing {
    pub version: u32,
    pub intent: Intent,
    pub output: Snapshot,
    pub traces: Vec<Trace>,
    pub placements: Vec<Placement>,
}
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && !id.chars().any(char::is_control)
}
impl Intent {
    pub(crate) fn validate(&self, ids: &[&str]) -> Result<()> {
        Timebase::new(self.context.numerator, self.context.denominator)?;
        if !valid_id(&self.context.scope)
            || !valid_id(&self.project_id)
            || self.lead_frames > 60 * RATE as u32
            || self.project_start_frame < 0
            || self.project_start_frame > self.record_start_frame
            || self.record_start_frame > MAX_PROJECT
            || self
                .record_end_frame
                .is_some_and(|end| end <= self.record_start_frame || end > MAX_PROJECT)
            || (self.cycle && self.record_end_frame.is_none())
            || !(1..=512).contains(&self.max_drift_frames)
            || ids.is_empty()
            || ids.len() > 16
            || ids.len() != self.corrections.len()
            || ids.iter().collect::<HashSet<_>>().len() != ids.len()
            || ids
                .iter()
                .any(|id| !valid_id(id) || !self.corrections.contains_key(*id))
            || self.corrections.values().any(|c| {
                c.frames.abs_diff(0) > RATE as u32
                    || (c.basis == Basis::Unqualified && c.frames != 0)
            })
        {
            return Err("Invalid native recording timing intent".into());
        }
        Ok(())
    }
    /// Freeze the whole intent into immutable take metadata BEFORE preparation.
    /// Patches are all-or-none; pre-existing timing slots cannot be reused.
    pub fn stamp(&self, inputs: &mut [Input]) -> Result<()> {
        self.validate(
            &inputs
                .iter()
                .map(|input| input.track_id.as_str())
                .collect::<Vec<_>>(),
        )?;
        let encoded = serde_json::to_value(self).map_err(|e| e.to_string())?;
        let patches = inputs
            .iter()
            .map(|input| {
                let mut context = input.recording.context.clone();
                let object = context
                    .as_object_mut()
                    .ok_or("Recording context must be an object")?;
                if object.contains_key(KEY) {
                    return Err("Recording timing was already stamped".into());
                }
                object.insert(KEY.into(), encoded.clone());
                if context.to_string().len() > 16000 {
                    return Err("Recording timing context exceeds limit".into());
                }
                Ok(context)
            })
            .collect::<Result<Vec<_>>>()?;
        for (input, context) in inputs.iter_mut().zip(patches) {
            input.recording.context = context;
        }
        Ok(())
    }
}
impl Snapshot {
    pub fn new(clock: ClockMap, first: i64, end: u64) -> Result<Self> {
        let (numerator, denominator) = clock.timebase().ratio();
        let (host, frame) = clock.anchor();
        let snapshot = Self {
            numerator,
            denominator,
            anchor_host: host.to_string(),
            anchor_frame: frame,
            first_mixed_frame: first,
            end_queued_frame: i64::try_from(end).map_err(|_| "Recording output clock overflow")?,
        };
        snapshot.clock()?;
        Ok(snapshot)
    }
    fn clock(&self) -> Result<ClockMap> {
        let host = self
            .anchor_host
            .parse::<u64>()
            .map_err(|_| "Invalid recording host anchor")?;
        if host.to_string() != self.anchor_host
            || self.anchor_frame < 0
            || self.first_mixed_frame < self.anchor_frame
            || self.end_queued_frame <= self.first_mixed_frame
        {
            return Err("Invalid recording output extent".into());
        }
        Ok(ClockMap::new(
            Timebase::new(self.numerator, self.denominator)?,
            host,
            self.anchor_frame,
        ))
    }
    #[cfg(target_os = "macos")]
    pub fn from_output(report: &super::macos::playback::Report) -> Result<Self> {
        if !report.stopped || !report.armed || report.fault.is_some() {
            return Err("Recording output did not stop cleanly".into());
        }
        Self::new(
            report.clock.ok_or("Recording output has no clock")?,
            report
                .first_mixed_frame
                .ok_or("Recording output never mixed")?,
            report.queued_frames,
        )
    }
}
fn place(
    intent: &Intent,
    id: &str,
    first: i64,
    frames: u64,
    result: &mut Vec<Placement>,
) -> Result<()> {
    if first < -(MAX_PROJECT + 32_000_000) || first > MAX_PROJECT {
        return Err("Recording origin is outside the project clock".into());
    }
    let end = first
        .checked_add(i64::try_from(frames).map_err(|_| "Recording extent overflow")?)
        .ok_or("Recording extent overflow")?;
    let mut position = first;
    let initial_end = intent
        .record_end_frame
        .map(|end| end - intent.project_start_frame);
    let cycle_length = intent
        .record_end_frame
        .map(|end| end - intent.record_start_frame);
    while position < end {
        if result.len() >= MAX_PLACEMENTS {
            return Err("Recording placement budget exceeded".into());
        }
        let (pass, project, boundary) = if intent.cycle && position >= initial_end.unwrap() {
            let after = position - initial_end.unwrap();
            let length = cycle_length.unwrap();
            let pass = 1 + after / length;
            (
                u32::try_from(pass).map_err(|_| "Recording pass overflow")?,
                intent.record_start_frame + after % length,
                position
                    .checked_add(length - after % length)
                    .ok_or("Recording cycle overflow")?,
            )
        } else {
            (
                0,
                intent
                    .project_start_frame
                    .checked_add(position)
                    .ok_or("Recording project clock overflow")?,
                if intent.cycle {
                    initial_end.unwrap()
                } else {
                    end
                },
            )
        };
        let length = (end - position).min(boundary - position);
        let trim = (intent.record_start_frame - project).max(0).min(length);
        let start = project + trim;
        let count = (length - trim).min(
            intent
                .record_end_frame
                .map_or(i64::MAX, |limit| (limit - start).max(0)),
        );
        if count > 0 {
            if start < 0 || start.checked_add(count).is_none_or(|end| end > MAX_PROJECT) {
                return Err("Recording placement exceeds project clock".into());
            }
            result.push(Placement {
                track_id: id.into(),
                pass,
                project_start_frame: start as u64,
                source_offset_frames: (position - first + trim) as u64,
                frames: count as u64,
            });
        }
        position = position
            .checked_add(length)
            .ok_or("Recording position overflow")?;
    }
    Ok(())
}
/// Construct only after raw file workers have stopped, before publishing the
/// group marker. Every source/index is verified; a failure returns NO aligned set.
pub(crate) fn build(
    directory: &Path,
    clips: &[Clip],
    intent: &Intent,
    output: &Snapshot,
) -> Result<Timing> {
    intent.validate(
        &clips
            .iter()
            .map(|clip| clip.track_id.as_str())
            .collect::<Vec<_>>(),
    )?;
    let clock = output.clock()?;
    if (intent.context.numerator, intent.context.denominator)
        != (output.numerator, output.denominator)
    {
        return Err("Recording clock timebase mismatch".into());
    }
    let encoded = serde_json::to_value(intent).map_err(|e| e.to_string())?;
    let (mut traces, mut placements, mut total) = (Vec::new(), Vec::new(), 0u64);
    for clip in clips {
        total = total
            .checked_add(clip.info.frames)
            .ok_or("Recording source budget overflow")?;
        if total > 32_000_000 || clip.info.context["source"][KEY] != encoded {
            return Err("Recording timing intent/source mismatch".into());
        }
        let parts = Path::new(&clip.audio).components().collect::<Vec<_>>();
        if parts.len() != 2
            || !matches!(parts[0],Component::Normal(name) if name.to_str().is_some_and(|n|n.starts_with("native-take-")))
            || parts[1] != Component::Normal("take.wav".as_ref())
        {
            return Err("Invalid timed recording source path".into());
        }
        let mapped = clock
            .frame_at(clip.info.first_host_time)
            .ok_or("Recording clock range overflow")?;
        if mapped as i128 + clip.info.frames as i128
            > output.end_queued_frame as i128 + intent.max_drift_frames as i128
        {
            return Err("Capture extends beyond queued backing output".into());
        }
        let (mut min, mut max) = (0i64, 0i64);
        recording::visit_verified_clocks(
            directory.join(&clip.audio).parent().unwrap(),
            &clip.info,
            |frame, host, _| {
                let elapsed = frame
                    .checked_sub(clip.info.first_input_frame)
                    .ok_or("Invalid recording input origin")?;
                let mapped = clock
                    .frame_at(host)
                    .ok_or("Recording clock range overflow")? as i128;
                let drift = mapped
                    - clock.frame_at(clip.info.first_host_time).unwrap() as i128
                    - elapsed as i128;
                if drift.abs() > intent.max_drift_frames as i128 {
                    return Err("Recording input/output drift exceeds limit".into());
                }
                min = min.min(drift as i64);
                max = max.max(drift as i64);
                Ok(())
            },
        )?;
        let first = mapped
            .checked_sub(output.first_mixed_frame)
            .and_then(|frame| frame.checked_sub(intent.lead_frames as i64))
            .and_then(|frame| frame.checked_add(intent.corrections[&clip.track_id].frames as i64))
            .ok_or("Recording origin overflow")?;
        let before = placements.len();
        place(
            intent,
            &clip.track_id,
            first,
            clip.info.frames,
            &mut placements,
        )?;
        if placements.len() == before {
            return Err("No recording samples in the requested window".into());
        }
        traces.push(Trace {
            track_id: clip.track_id.clone(),
            first_output_frame: mapped,
            min_drift_frames: min,
            max_drift_frames: max,
        });
    }
    Ok(Timing {
        version: 1,
        intent: intent.clone(),
        output: output.clone(),
        traces,
        placements,
    })
}
pub(crate) fn verify(directory: &Path, clips: &[Clip], timing: &Timing) -> Result<()> {
    if timing.version != 1 || build(directory, clips, &timing.intent, &timing.output)? != *timing {
        return Err("Timed recording manifest mismatch".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests;
