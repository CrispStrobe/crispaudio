//! Experimental prepared native-worker graph. No output device or frontend dependency.
//! Owns a compiled project snapshot and immutable decoded 48 kHz PCM. Not CLI playback.
use crate::{
    audio_mix::{
        block_dsp::{Budget, Curve, EffectUpdate, Fade, Rack},
        finite, frames, pan, positive,
    },
    Result,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};
pub type Stereo = [f32; 2];
const RATE: f64 = 48000.;
#[derive(Clone)]
pub struct Source {
    pcm: Arc<[Stereo]>,
    mono: bool,
}
impl Source {
    pub(crate) fn uploaded(pcm: Vec<Stereo>, mono: bool) -> Self {
        Self {
            pcm: pcm.into(),
            mono,
        }
    }
    pub fn new(channels: Vec<Vec<f32>>) -> Result<Self> {
        let n = channels.first().map_or(0, Vec::len);
        if !(1..=2).contains(&channels.len())
            || n == 0
            || n > 32_000_000
            || channels
                .iter()
                .any(|c| c.len() != n || c.iter().any(|v| !v.is_finite()))
        {
            return Err("Invalid native graph source PCM".into());
        }
        Ok(Self {
            pcm: (0..n)
                .map(|i| [channels[0][i], channels[channels.len() - 1][i]])
                .collect::<Vec<_>>()
                .into(),
            mono: channels.len() == 1,
        })
    }
}
/// All implementations must return finite stereo of identical block length and
/// keep latency fixed for the prepared lifetime. Errors fault the whole graph.
pub trait Insert: Send {
    fn latency(&self) -> usize;
    /// Called before a block with latency-compensated project time. DSP sample
    /// clocks remain contiguous when project time wraps at a cycle boundary.
    fn timeline(&mut self, _frame: i64) {}
    fn update(&mut self, _parameters: &Value, _bypass: bool) -> Result<()> {
        Err("Insert controls unavailable".into())
    }
    fn process(&mut self, pcm: &mut [Stereo], frame: u32) -> Result<()>;
}
struct NativeRack {
    inserts: Vec<Box<dyn Insert>>,
    ids: Vec<String>,
    delays: Vec<usize>,
    latency: usize,
}
fn native(
    value: &Value,
    count: &mut usize,
    factory: &mut impl FnMut(&Value) -> Result<Box<dyn Insert>>,
) -> Result<NativeRack> {
    let mut inserts = Vec::new();
    let mut identities = Vec::new();
    let mut latency = 0usize;
    let mut ids = HashSet::new();
    if !value.is_null() {
        for entry in value.as_array().ok_or("Invalid native rack")? {
            let id = entry["instanceId"]
                .as_str()
                .ok_or("Missing native instance ID")?;
            if id.is_empty()
                || !ids.insert(id)
                || !entry["enabled"].is_boolean()
                || !entry["bypass"].is_boolean()
                || !entry["parameters"].is_object()
                || entry["parameters"]
                    .as_object()
                    .unwrap()
                    .values()
                    .any(|v| v.as_f64().is_none_or(|x| !x.is_finite()))
            {
                return Err("Invalid native rack entry".into());
            }
            if entry["enabled"] == false {
                continue;
            }
            if entry["pluginId"]
                .as_str()
                .is_none_or(|s| s.is_empty() || s.len() > 4096)
                || entry["state"].as_str().is_none_or(|s| s.len() > 1_048_576)
                || entry["parameters"].to_string().len()
                    + entry["parameters"].as_object().unwrap().len() * 3
                    + 512
                    > 8192
            {
                return Err("Invalid native plugin configuration".into());
            }
            *count += 1;
            if *count > 8 {
                return Err("At most eight native graph inserts".into());
            }
            let insert = factory(entry)?;
            let delay = insert.latency();
            if delay > 480000 {
                return Err("Native insert latency exceeds ten seconds".into());
            }
            latency = latency
                .checked_add(delay)
                .ok_or("Native latency overflow")?;
            inserts.push(insert);
            identities.push(id.to_string());
        }
    }
    let delays = inserts.iter().map(|insert| insert.latency()).collect();
    Ok(NativeRack {
        inserts,
        ids: identities,
        delays,
        latency,
    })
}
impl NativeRack {
    fn process(
        &mut self,
        pcm: &mut [Stereo],
        frame: u32,
        clock: ProjectClock,
        upstream: usize,
    ) -> Result<()> {
        let mut delay = upstream;
        for (i, insert) in self.inserts.iter_mut().enumerate() {
            if insert.latency() != self.delays[i] {
                return Err("Native insert latency changed".into());
            }
            insert.timeline(clock.at(frame as i64 - delay as i64));
            insert.process(pcm, frame)?;
            delay += self.delays[i];
            if insert.latency() != self.delays[i] {
                return Err("Native insert latency changed".into());
            }
            if pcm.iter().flatten().any(|x| !x.is_finite()) {
                return Err("Non-finite native graph output".into());
            }
        }
        Ok(())
    }
}
struct Delay {
    buffer: Vec<Stereo>,
    cursor: usize,
}
impl Delay {
    fn new(frames: usize, budget: &mut usize) -> Result<Self> {
        *budget = budget
            .checked_add(frames)
            .ok_or("Compensation budget overflow")?;
        if *budget > 8_000_000 {
            return Err("Native compensation exceeds 64 MiB".into());
        }
        Ok(Self {
            buffer: vec![[0.; 2]; frames],
            cursor: 0,
        })
    }
    fn at(&mut self, mut sample: Stereo) -> Stereo {
        if !self.buffer.is_empty() {
            std::mem::swap(&mut sample, &mut self.buffer[self.cursor]);
            self.cursor = (self.cursor + 1) % self.buffer.len();
        }
        sample
    }
}
struct Clip {
    id: String,
    source: Source,
    start: u32,
    end: u32,
    offset: usize,
    gain: f64,
    fade: Fade,
    builtin: Rack,
    native: NativeRack,
    align: Delay,
}
struct Route {
    slew: Slew,
    target: Option<usize>,
    gain: f64,
    pre: bool,
    delay: Delay,
}
struct Track {
    id: String,
    gain_slew: Slew,
    audible_slew: Slew,
    pan_slew: Slew,
    pan_automated: bool,
    levels: [f64; 2],
    clips: Vec<Clip>,
    builtin: Rack,
    native: NativeRack,
    fade: Fade,
    start: f64,
    gain: f64,
    automation: Curve,
    pan: Curve,
    mono: bool,
    audible: bool,
    input_latency: usize,
    output_latency: usize,
    duck: Option<crate::ducking::Ducking>,
    program: Delay,
    detector: Delay,
    routes: Vec<Route>,
}
#[derive(Clone, Copy)]
struct Slew {
    value: f64,
    target: f64,
    left: u32,
}
impl Slew {
    fn new(value: f64) -> Self {
        Self {
            value,
            target: value,
            left: 0,
        }
    }
    fn set(&mut self, target: f64) {
        if self.target != target {
            self.target = target;
            self.left = 240;
        }
    }
    fn next(&mut self) -> f64 {
        if self.left > 0 {
            self.value += (self.target - self.value) / self.left as f64;
            self.left -= 1;
        }
        self.value
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MixControls {
    pub master_volume: f64,
    pub tracks: Vec<TrackControls>,
    #[serde(default)]
    pub native: Vec<NativeControls>,
    #[serde(default)]
    pub effect_scopes: Vec<ScopedEffectControls>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScopedEffectControls {
    pub scope: String,
    pub controls: Vec<EffectAutomationControls>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TrackControls {
    pub id: String,
    pub volume: f64,
    pub pan: f64,
    pub muted: bool,
    pub solo: bool,
    #[serde(default)]
    pub automation: Value,
    #[serde(default)]
    pub pan_automation: Value,
    #[serde(default, alias = "effectMixes")]
    pub effect_automation: Vec<EffectAutomationControls>,
    #[serde(default)]
    pub sends: Vec<f64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EffectAutomationControls {
    pub index: usize,
    #[serde(default = "mix_parameter")]
    pub parameter: String,
    #[serde(default)]
    pub value: Option<f64>,
    pub points: Value,
}
fn mix_parameter() -> String {
    "mix".into()
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeControls {
    pub scope: String,
    pub instance_id: String,
    pub parameters: Value,
    pub bypass: bool,
}
/// Project time can wrap while the render/processor clock stays monotonic.
#[derive(Clone, Copy, Default)]
struct ProjectClock {
    cycle: Option<(u32, u32)>,
}
impl ProjectClock {
    fn at(self, frame: i64) -> i64 {
        match self.cycle {
            Some((start, end)) if frame >= end as i64 => {
                start as i64 + (frame - start as i64).rem_euclid((end - start) as i64)
            }
            _ => frame,
        }
    }
    fn remaining(self, frame: i64) -> usize {
        match self.cycle {
            Some((_, end)) => (end as i64 - self.at(frame)) as usize,
            None => usize::MAX,
        }
    }
}
/// Prepared immutable snapshot. A processing error latches until dropped/reprepared.
pub struct Graph {
    tracks: Vec<Track>,
    master: Rack,
    master_effects: Value,
    native: NativeRack,
    limiter: Option<crate::limiter::Limiter>,
    gain: f64,
    gain_slew: Slew,
    levels: [f64; 2],
    routing_docs: Vec<Value>,
    position: u32,
    latency: usize,
    duration: u32,
    fault: Option<String>,
    clock: ProjectClock,
    context_delays: Vec<usize>,
}
fn float(x: [f64; 2]) -> Stereo {
    x.map(|v| v as f32)
}
fn double(x: Stereo) -> [f64; 2] {
    x.map(|v| v as f64)
}
impl Graph {
    pub fn latency(&self) -> usize {
        self.latency
    }
    pub fn duration(&self) -> u32 {
        self.duration
    }
    pub fn prepare(
        project: &Value,
        sources: HashMap<String, Source>,
        mut factory: impl FnMut(&Value) -> Result<Box<dyn Insert>>,
    ) -> Result<Self> {
        if project["sampleRate"].as_u64() != Some(48000) {
            return Err("Native graph requires decoded 48 kHz sources".into());
        }
        let duration = frames(positive(project, "duration", None)?)?;
        if duration == 0 {
            return Err("Empty native graph".into());
        }
        if sources.values().map(|s| s.pcm.len()).sum::<usize>() > 32_000_000 {
            return Err("Native source snapshot exceeds 256 MiB".into());
        }
        let docs = project["tracks"]
            .as_array()
            .ok_or("Missing native tracks")?;
        if docs.len() > 128 {
            return Err("At most 128 native graph tracks".into());
        }
        let order = crate::routing::order(docs)?;
        let audible = crate::routing::audible(docs);
        let index: HashMap<&str, usize> = order
            .iter()
            .enumerate()
            .map(|(i, n)| (docs[*n]["id"].as_str().unwrap(), i))
            .collect();
        let target = |id: &str| {
            if id == "master" {
                None
            } else {
                Some(index[id])
            }
        };
        let mut budget = Budget::default();
        let mut delay_budget = 0;
        let mut count = 0;
        let mut clip_ids = HashSet::new();
        let mut incoming = vec![0; docs.len()];
        let mut tracks: Vec<Track> = Vec::new();
        let mut route_targets = Vec::new();
        let mut master_input = 0;
        for (i, original) in order.iter().enumerate() {
            let doc = &docs[*original];
            let segments = doc["segments"]
                .as_array()
                .ok_or("Missing native track segments")?;
            let mut clips = Vec::new();
            let mut input_latency = incoming[i];
            let mut start = f64::INFINITY;
            let mut end = 0f64;
            let mut mono = doc["kind"] != "bus";
            for clip in segments {
                let id = clip["id"].as_str().ok_or("Missing native clip ID")?;
                if id.is_empty() || !clip_ids.insert(id) || clip_ids.len() > 256 {
                    return Err("Duplicate native clip ID or more than 256 clips".into());
                }
                let source = sources
                    .get(
                        clip["sourceId"]
                            .as_str()
                            .ok_or("Missing native source ID")?,
                    )
                    .ok_or("Missing native source PCM")?
                    .clone();
                let length = positive(clip, "duration", None)?;
                let position = positive(clip, "startTime", None)?;
                let offset = frames(positive(clip, "sourceOffset", None)?)? as usize;
                let first = frames(position)?;
                let last = frames(position + length)?;
                if last <= first
                    || last > duration
                    || offset + (last - first) as usize > source.pcm.len()
                {
                    return Err("Native clip exceeds source/project extent".into());
                }
                let builtin = Rack::new_live(&clip["effects"], &mut budget)?;
                let native = native(&clip["nativeEffects"], &mut count, &mut factory)?;
                mono &= source.mono && !builtin.stereo() && native.inserts.is_empty();
                input_latency = input_latency.max(native.latency);
                start = start.min(position);
                end = end.max(position + length);
                clips.push(Clip {
                    id: clip["id"].as_str().unwrap().into(),
                    source,
                    start: first,
                    end: last,
                    offset,
                    gain: positive(clip, "gain", Some(1.))?,
                    fade: Fade::new(clip, length)?,
                    builtin,
                    native,
                    align: Delay::new(0, &mut delay_budget)?,
                });
            }
            for clip in &mut clips {
                clip.align = Delay::new(input_latency - clip.native.latency, &mut delay_budget)?;
            }
            let builtin = Rack::new_live(&doc["effects"], &mut budget)?;
            let native = native(&doc["nativeEffects"], &mut count, &mut factory)?;
            mono &= !builtin.stereo() && native.inserts.is_empty();
            let rack_output = input_latency + native.latency;
            let duck = if let Some(config) = doc.get("ducking") {
                Some(crate::ducking::Ducking::new(
                    config,
                    index[config["source"]
                        .as_str()
                        .ok_or("Missing sidechain source")?],
                )?)
            } else {
                None
            };
            let has_duck = duck.is_some();
            let detector_latency = duck.as_ref().map_or(0, |d| tracks[d.source].output_latency);
            let output_latency = rack_output.max(detector_latency);
            let mut routes = vec![(
                target(doc["output"].as_str().unwrap_or("master")),
                1.,
                false,
            )];
            if let Some(sends) = doc["sends"].as_array() {
                for send in sends {
                    routes.push((
                        target(send["target"].as_str().unwrap()),
                        send["gain"].as_f64().unwrap(),
                        send["preFader"] == true,
                    ));
                }
            }
            if routes.len() > 65 {
                return Err("At most 64 sends per native track".into());
            }
            for (target, _, _) in &routes {
                if let Some(target) = target {
                    incoming[*target] = incoming[*target].max(output_latency);
                } else {
                    master_input = master_input.max(output_latency);
                }
            }
            if clips.is_empty() {
                start = 0.;
                end = duration as f64 / RATE;
            }
            let pan = finite(doc, "pan", Some(0.))?;
            if !(-1.0..=1.0).contains(&pan) {
                return Err("Invalid native pan".into());
            }
            tracks.push(Track {
                id: doc["id"].as_str().unwrap().into(),
                gain_slew: Slew::new(positive(doc, "volume", Some(1.))?),
                audible_slew: Slew::new(if audible.contains(doc["id"].as_str().unwrap()) {
                    1.
                } else {
                    0.
                }),
                pan_slew: Slew::new(finite(doc, "pan", Some(0.))?),
                pan_automated: doc["panAutomation"]
                    .as_array()
                    .is_some_and(|v| !v.is_empty()),
                levels: [0.; 2],
                clips,
                builtin,
                native,
                fade: Fade::new(doc, end - start)?,
                start,
                gain: positive(doc, "volume", Some(1.))?,
                automation: Curve::gain(&doc["automation"])?,
                pan: Curve::pan(&doc["panAutomation"], pan)?,
                mono,
                audible: audible.contains(doc["id"].as_str().unwrap()),
                input_latency,
                output_latency,
                duck,
                program: Delay::new(output_latency - rack_output, &mut delay_budget)?,
                detector: Delay::new(
                    if has_duck {
                        output_latency - detector_latency
                    } else {
                        0
                    },
                    &mut delay_budget,
                )?,
                routes: Vec::new(),
            });
            route_targets.push(routes);
        }
        for i in 0..tracks.len() {
            for (target, gain, pre) in &route_targets[i] {
                let arrival = target.map_or(master_input, |t| tracks[t].input_latency);
                let delay = Delay::new(arrival - tracks[i].output_latency, &mut delay_budget)?;
                tracks[i].routes.push(Route {
                    target: *target,
                    gain: *gain,
                    slew: Slew::new(*gain),
                    pre: *pre,
                    delay,
                });
            }
        }
        let master = Rack::new_live(&project["masterEffects"], &mut budget)?;
        let native = native(&project["nativeEffects"], &mut count, &mut factory)?;
        let latency = master_input + native.latency;
        let limiter = if let Some(config) = project.get("outputLimiter") {
            if !config["enabled"].is_boolean() {
                return Err("Invalid native limiter".into());
            }
            if config["enabled"] == true {
                Some(crate::limiter::Limiter::new(
                    RATE,
                    finite(config, "ceiling", Some(-1.))?,
                    finite(config, "release", Some(0.1))?,
                ))
            } else {
                None
            }
        } else {
            None
        };
        let mut graph = Self {
            tracks,
            master,
            master_effects: project["masterEffects"].clone(),
            native,
            limiter,
            gain: positive(project, "masterVolume", Some(1.))?,
            gain_slew: Slew::new(positive(project, "masterVolume", Some(1.))?),
            levels: [0.; 2],
            routing_docs: docs.clone(),
            position: 0,
            latency,
            duration,
            fault: None,
            clock: ProjectClock::default(),
            context_delays: vec![0],
        };
        let mut collect = |rack: &NativeRack, mut delay: usize| {
            for insert in &rack.inserts {
                graph.context_delays.push(delay);
                delay += insert.latency();
            }
        };
        for track in &graph.tracks {
            for clip in &track.clips {
                collect(&clip.native, 0);
            }
            collect(&track.native, track.input_latency);
        }
        collect(&graph.native, master_input);
        graph.context_delays.sort_unstable();
        graph.context_delays.dedup();
        Ok(graph)
    }
    pub fn meters(&self) -> Value {
        let mut result = serde_json::Map::new();
        result.insert(
            "master".into(),
            json!({"peak":self.levels[0],"rms":self.levels[1]}),
        );
        for track in &self.tracks {
            result.insert(
                track.id.clone(),
                json!({"peak":track.levels[0],"rms":track.levels[1]}),
            );
        }
        Value::Object(result)
    }
    fn rack_mut(&mut self, scope: &str) -> Option<&mut NativeRack> {
        if scope == "master" {
            return Some(&mut self.native);
        }
        for track in &mut self.tracks {
            if scope == format!("track:{}", track.id) {
                return Some(&mut track.native);
            }
            for clip in &mut track.clips {
                if scope == format!("clip:{}", clip.id) {
                    return Some(&mut clip.native);
                }
            }
        }
        None
    }
    fn builtin_rack(&self, scope: &str) -> Option<&Rack> {
        if scope == "master" {
            return Some(&self.master);
        }
        let id = scope.strip_prefix("clip:")?;
        self.tracks
            .iter()
            .flat_map(|track| &track.clips)
            .find(|clip| clip.id == id)
            .map(|clip| &clip.builtin)
    }
    fn builtin_rack_mut(&mut self, scope: &str) -> Option<&mut Rack> {
        if scope == "master" {
            return Some(&mut self.master);
        }
        let id = scope.strip_prefix("clip:")?;
        self.tracks
            .iter_mut()
            .flat_map(|track| &mut track.clips)
            .find(|clip| clip.id == id)
            .map(|clip| &mut clip.builtin)
    }
    fn builtin_doc(&self, scope: &str) -> Option<&Value> {
        if scope == "master" {
            return Some(&self.master_effects);
        }
        let id = scope.strip_prefix("clip:")?;
        self.routing_docs
            .iter()
            .filter_map(|track| track["segments"].as_array())
            .flatten()
            .find(|clip| clip["id"].as_str() == Some(id))
            .map(|clip| &clip["effects"])
    }
    fn prepare_effect_controls(
        rack: &Rack,
        doc: &Value,
        controls: &[EffectAutomationControls],
    ) -> Result<Vec<EffectUpdate>> {
        if controls.len() > 3072 {
            return Err("Too many native effect controls".into());
        }
        let mut parsed = Vec::new();
        let mut indices = HashSet::new();
        for control in controls {
            let effects = doc.as_array().ok_or("Unknown native effect controls")?;
            let effect = effects
                .get(control.index)
                .ok_or("Unknown native effect control")?;
            if !indices.insert((control.index, &control.parameter))
                || effect["enabled"] != true
                || !crate::effect_envelope::supports(effect, &control.parameter)
            {
                return Err("Invalid native effect control".into());
            }
            let index = effects[..control.index]
                .iter()
                .filter(|effect| effect["enabled"] == true)
                .count();
            parsed.push(rack.prepare_value_control(
                index,
                &control.parameter,
                &control.points,
                control.value,
            )?);
        }
        Ok(parsed)
    }
    /// Topology is immutable; this packet can only change existing controls.
    pub fn update_controls(&mut self, update: MixControls) -> Result<()> {
        if !update.master_volume.is_finite()
            || update.master_volume < 0.
            || update.tracks.len() != self.tracks.len()
            || update.native.len() > 8
        {
            return Err("Invalid native mix controls".into());
        }
        let mut ids = HashSet::new();
        let mut parsed = Vec::new();
        let mut docs = self.routing_docs.clone();
        for control in &update.tracks {
            if !ids.insert(&control.id)
                || !control.volume.is_finite()
                || control.volume < 0.
                || !control.pan.is_finite()
                || !(-1.0..=1.0).contains(&control.pan)
                || control.sends.iter().any(|v| !v.is_finite() || *v < 0.)
            {
                return Err("Invalid native track controls".into());
            }
            let track = self
                .tracks
                .iter()
                .find(|t| t.id == control.id)
                .ok_or("Unknown native track controls")?;
            if track.routes.len() != control.sends.len() + 1 {
                return Err("Native send topology changed".into());
            }
            let effect_doc = &self
                .routing_docs
                .iter()
                .find(|doc| doc["id"].as_str() == Some(&control.id))
                .unwrap()["effects"];
            let mixes = Self::prepare_effect_controls(
                &track.builtin,
                effect_doc,
                &control.effect_automation,
            )?;
            parsed.push((
                Curve::gain(&control.automation)?,
                Curve::pan(&control.pan_automation, control.pan)?,
                mixes,
            ));
            let doc = docs
                .iter_mut()
                .find(|t| t["id"].as_str() == Some(&control.id))
                .unwrap();
            doc["muted"] = json!(control.muted);
            doc["solo"] = json!(control.solo);
        }
        if update.effect_scopes.len() > 257 {
            return Err("Too many native effect scopes".into());
        }
        let mut scopes = HashSet::new();
        let mut scoped = Vec::new();
        for control in &update.effect_scopes {
            if !scopes.insert(&control.scope) {
                return Err("Duplicate native effect scope".into());
            }
            let rack = self
                .builtin_rack(&control.scope)
                .ok_or("Unknown native effect scope")?;
            let doc = self
                .builtin_doc(&control.scope)
                .ok_or("Unknown native effect scope")?;
            scoped.push((
                &control.scope,
                Self::prepare_effect_controls(rack, doc, &control.controls)?,
            ));
        }
        let mut native_ids = HashSet::new();
        for control in &update.native {
            if !native_ids.insert((&control.scope, &control.instance_id))
                || !control.parameters.is_object()
                || control
                    .parameters
                    .as_object()
                    .unwrap()
                    .values()
                    .any(|v| v.as_f64().is_none_or(|x| !x.is_finite()))
                || control.parameters.to_string().len()
                    + control.parameters.as_object().unwrap().len() * 3
                    + 512
                    > 8192
            {
                return Err("Invalid native insert controls".into());
            }
            let rack = self
                .rack_mut(&control.scope)
                .ok_or("Unknown native control scope")?;
            if !rack.ids.contains(&control.instance_id) {
                return Err("Unknown native insert controls".into());
            }
        }
        let audible = crate::routing::audible(&docs);
        for (control, (gain, pan, mixes)) in update.tracks.iter().zip(parsed) {
            let track = self.tracks.iter_mut().find(|t| t.id == control.id).unwrap();
            track.gain = control.volume;
            track.gain_slew.set(control.volume);
            track.audible = audible.contains(control.id.as_str());
            track.audible_slew.set(if track.audible { 1. } else { 0. });
            track.automation = gain;
            track.pan = pan;
            for mix in mixes {
                track.builtin.apply_control(mix);
            }
            track.pan_slew.set(control.pan);
            track.pan_automated = control
                .pan_automation
                .as_array()
                .is_some_and(|v| !v.is_empty());
            for (route, gain) in track.routes.iter_mut().skip(1).zip(&control.sends) {
                route.gain = *gain;
                route.slew.set(*gain);
            }
        }
        for (scope, controls) in scoped {
            let rack = self.builtin_rack_mut(scope).unwrap();
            for control in controls {
                rack.apply_control(control);
            }
        }
        self.gain = update.master_volume;
        self.gain_slew.set(update.master_volume);
        self.routing_docs = docs;
        for control in update.native {
            let rack = self.rack_mut(&control.scope).unwrap();
            let index = rack
                .ids
                .iter()
                .position(|id| id == &control.instance_id)
                .unwrap();
            if let Err(error) = rack.inserts[index].update(&control.parameters, control.bypass) {
                self.fault = Some(error.clone());
                return Err(error);
            }
        }
        Ok(())
    }
    /// Preserve DSP tails across a cycle. Call before rendering preroll so all
    /// compensated paths see the same source and musical-time discontinuity.
    pub fn set_cycle(&mut self, start: u32, end: u32) -> Result<()> {
        if self.position != 0 || start >= end || end > self.duration {
            return Err("Invalid native cycle".into());
        }
        self.clock.cycle = Some((start, end));
        Ok(())
    }
    pub fn render(&mut self, output: &mut [Stereo]) -> Result<()> {
        output.fill([0.; 2]);
        if let Some(error) = &self.fault {
            return Err(error.clone());
        }
        if output.is_empty() || output.len() > 4096 {
            return Err("Invalid native graph block length".into());
        }
        let mut offset = 0;
        let mut track_levels = vec![[0f64; 2]; self.tracks.len()];
        let mut levels = [0f64; 2];
        let total = output.len();
        let result: Result<()> = (|| {
            while offset < output.len() {
                let length = self
                    .context_delays
                    .iter()
                    .map(|delay| self.clock.remaining(self.position as i64 - *delay as i64))
                    .min()
                    .unwrap_or(usize::MAX)
                    .min(output.len() - offset);
                if length == 0 {
                    return Err("Invalid cycle boundary".into());
                }
                self.block(&mut output[offset..offset + length])?;
                for (sum, track) in track_levels.iter_mut().zip(&self.tracks) {
                    sum[0] = sum[0].max(track.levels[0]);
                    sum[1] += track.levels[1] * track.levels[1] * length as f64;
                }
                levels[0] = levels[0].max(self.levels[0]);
                levels[1] += self.levels[1] * self.levels[1] * length as f64;
                offset += length;
            }
            Ok(())
        })();
        for (track, sum) in self.tracks.iter_mut().zip(track_levels) {
            track.levels = if result.is_ok() {
                [sum[0], (sum[1] / total as f64).sqrt()]
            } else {
                [0.; 2]
            };
        }
        self.levels = if result.is_ok() {
            [levels[0], (levels[1] / total as f64).sqrt()]
        } else {
            [0.; 2]
        };
        if let Err(error) = &result {
            output.fill([0.; 2]);
            self.fault = Some(error.clone());
        }
        result
    }
    fn block(&mut self, output: &mut [Stereo]) -> Result<()> {
        let n = output.len();
        let block = self.position;
        let clock = self.clock;
        self.position = self
            .position
            .checked_add(n as u32)
            .ok_or("Native graph clock overflow")?;
        let mut inputs = vec![vec![[0f64; 2]; n]; self.tracks.len()];
        let mut posts = vec![vec![[0f64; 2]; n]; self.tracks.len()];
        let mut master = vec![[0f64; 2]; n];
        for (t, track) in self.tracks.iter_mut().enumerate() {
            for clip in &mut track.clips {
                let mut pcm = vec![[0.; 2]; n];
                for (i, sample) in pcm.iter_mut().enumerate() {
                    let frame = clock.at(block as i64 + i as i64) as u32;
                    let raw = if frame >= clip.start && frame < clip.end {
                        double(clip.source.pcm[clip.offset + (frame - clip.start) as usize])
                            .map(|v| v * clip.gain)
                    } else {
                        [0.; 2]
                    };
                    *sample = float(clip.builtin.at(raw, frame));
                }
                clip.native.process(&mut pcm, block, clock, 0)?;
                for (i, sample) in pcm.iter_mut().enumerate() {
                    let time = clock.at(block as i64 + i as i64 - clip.native.latency as i64)
                        as f64
                        - clip.start as f64;
                    let gain = clip.fade.at(time / RATE);
                    let value = clip.align.at(sample.map(|v| (v as f64 * gain) as f32));
                    for (ch, v) in value.iter().enumerate() {
                        inputs[t][i][ch] += *v as f64;
                    }
                }
            }
            let mut pcm = vec![[0.; 2]; n];
            for (i, sample) in pcm.iter_mut().enumerate() {
                let frame = clock
                    .at(block as i64 + i as i64 - track.input_latency as i64)
                    .max(0) as u32;
                let time = frame as f64 / RATE;
                let gain = track.fade.at(time - track.start) * track.automation.at(time);
                *sample = float(track.builtin.at(
                    inputs[t][i].map(|v| ((v as f32) * (gain as f32)) as f64),
                    frame,
                ));
            }
            track
                .native
                .process(&mut pcm, block, clock, track.input_latency)?;
            track.levels = [0.; 2];
            for (i, sample) in pcm.iter().enumerate() {
                let mut value = double(track.program.at(*sample));
                if let Some(duck) = &mut track.duck {
                    let detector = double(track.detector.at(float(posts[duck.source][i])));
                    let gain = duck.gain(detector);
                    value = value.map(|v| (v * gain) as f32 as f64);
                }
                let audible_gain = track.audible_slew.next();
                let pre = value.map(|v| v * audible_gain);
                let time = clock
                    .at(block as i64 + i as i64 - track.output_latency as i64)
                    .max(0) as f64
                    / RATE;
                let gain = track.gain_slew.next();
                let position = if track.pan_automated {
                    track.pan.at(time)
                } else {
                    track.pan_slew.next()
                };
                let post = pan(pre.map(|v| v * gain), position, track.mono);
                track.levels[0] = track.levels[0].max(post[0].abs()).max(post[1].abs());
                track.levels[1] += (post[0] * post[0] + post[1] * post[1]) * 0.5;
                posts[t][i] = post;
                for route in &mut track.routes {
                    let sample = double(route.delay.at(float(if route.pre { pre } else { post })));
                    let gain = route.slew.next();
                    let target = if let Some(target) = route.target {
                        &mut inputs[target][i]
                    } else {
                        &mut master[i]
                    };
                    for ch in 0..2 {
                        target[ch] += sample[ch] * gain;
                    }
                }
            }
            track.levels[1] = (track.levels[1] / n as f64).sqrt();
        }
        let master_input = self.latency - self.native.latency;
        for (i, sample) in output.iter_mut().enumerate() {
            *sample = float(
                self.master.at(
                    master[i],
                    clock
                        .at(block as i64 + i as i64 - master_input as i64)
                        .max(0) as u32,
                ),
            );
        }
        self.native.process(output, block, clock, master_input)?;
        self.levels = [0.; 2];
        for sample in output {
            let gain = self.gain_slew.next();
            let value = double(*sample).map(|v| v * gain);
            *sample = float(if let Some(limiter) = &mut self.limiter {
                limiter.at(value)
            } else {
                value
            });
            self.levels[0] = self.levels[0]
                .max(sample[0].abs() as f64)
                .max(sample[1].abs() as f64);
            self.levels[1] +=
                (sample[0] as f64 * sample[0] as f64 + sample[1] as f64 * sample[1] as f64) * 0.5;
            if sample.iter().any(|v| !v.is_finite()) {
                return Err("Native graph mix exceeded finite float range".into());
            }
        }
        self.levels[1] = (self.levels[1] / n as f64).sqrt();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn clip(id: &str) -> Value {
        json!({"id":id,"sourceId":"s","startTime":0,"sourceOffset":0,"duration":4096./48000.,"gain":1,"effects":[]})
    }
    fn insert(delay: usize) -> Value {
        json!([{"instanceId":"i","enabled":true,"bypass":false,"parameters":{},"pluginId":"test","state":"","delay":delay}])
    }
    fn source() -> HashMap<String, Source> {
        let mut pcm = vec![vec![0.; 4096]; 2];
        pcm[0][22] = 1.;
        pcm[1][22] = -0.5;
        HashMap::from([("s".into(), Source::new(pcm).unwrap())])
    }
    fn project() -> Value {
        json!({"sampleRate":48000,"duration":4096./48000.,"masterVolume":0.5,"tracks":[{"id":"a","volume":0.5,"pan":0,"output":"bus","segments":[clip("a")],"sends":[{"id":"pre","target":"master","gain":0.25,"preFader":true},{"id":"post","target":"master","gain":0.25,"preFader":false}]},{"id":"b","volume":0.375,"pan":0,"segments":[clip("b")]},{"id":"bus","kind":"bus","volume":0.5,"segments":[]}]})
    }
    struct Delayed {
        delay: Delay,
        latency: usize,
    }
    impl Insert for Delayed {
        fn latency(&self) -> usize {
            self.latency
        }
        fn process(&mut self, pcm: &mut [Stereo], _: u32) -> Result<()> {
            for sample in pcm {
                *sample = self.delay.at(*sample);
            }
            Ok(())
        }
    }
    fn fake(v: &Value) -> Result<Box<dyn Insert>> {
        let n = v["delay"].as_u64().unwrap() as usize;
        Ok(Box::new(Delayed {
            delay: Delay::new(n, &mut 0)?,
            latency: n,
        }))
    }
    #[test]
    fn compensated_clips_buses_and_pre_post_sends_are_chunk_invariant() {
        let mut doc = project();
        doc["tracks"][0]["segments"][0]["nativeEffects"] = insert(7);
        doc["tracks"][0]["nativeEffects"] = insert(11);
        doc["tracks"][2]["nativeEffects"] = insert(13);
        doc["nativeEffects"] = insert(3);
        let mut a = Graph::prepare(&doc, source(), fake).unwrap();
        let mut b = Graph::prepare(&doc, source(), fake).unwrap();
        assert_eq!(a.latency, 34);
        let mut one = vec![[0.; 2]; 4096];
        a.render(&mut one).unwrap();
        let mut split = vec![[0.; 2]; 4096];
        let mut offset = 0;
        for n in [1, 17, 512, 3, 1024, 2539] {
            b.render(&mut split[offset..offset + n]).unwrap();
            offset += n;
        }
        assert_eq!(one, split);
        for (i, sample) in one.iter().enumerate() {
            assert_eq!(*sample, if i == 56 { [0.5, -0.25] } else { [0.; 2] });
        }
        // Compiled values survive arbitrary caller-side project edits.
        doc["masterVolume"] = json!(100);
        assert_eq!(a.gain, 0.5);
    }
    #[test]
    fn cycles_keep_delayed_routes_aligned_and_scope_clocks_split_at_wraps() {
        use std::sync::Mutex;
        struct ContextInsert {
            d: Delayed,
            position: i64,
            seen: Arc<Mutex<Vec<(usize, u32, i64, usize)>>>,
        }
        impl Insert for ContextInsert {
            fn latency(&self) -> usize {
                self.d.latency
            }
            fn timeline(&mut self, frame: i64) {
                self.position = frame;
            }
            fn process(&mut self, pcm: &mut [Stereo], frame: u32) -> Result<()> {
                self.seen
                    .lock()
                    .unwrap()
                    .push((self.d.latency, frame, self.position, pcm.len()));
                self.d.process(pcm, frame)
            }
        }
        let mut doc = project();
        doc["tracks"][0]["segments"][0]["nativeEffects"] = insert(7);
        doc["tracks"][0]["nativeEffects"] = insert(11);
        doc["tracks"][2]["nativeEffects"] = insert(13);
        doc["nativeEffects"] = insert(3);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let mut graph = Graph::prepare(&doc, source(), |entry| {
            let n = entry["delay"].as_u64().unwrap() as usize;
            Ok(Box::new(ContextInsert {
                d: Delayed {
                    delay: Delay::new(n, &mut 0)?,
                    latency: n,
                },
                position: 0,
                seen: seen.clone(),
            }))
        })
        .unwrap();
        graph.set_cycle(10, 41).unwrap();
        let mut output = vec![[0.; 2]; 4096];
        graph.render(&mut output).unwrap();
        for (i, frame) in output.iter().enumerate() {
            assert_eq!(
                *frame,
                if i >= 56 && (i - 56) % 31 == 0 {
                    [0.5, -0.25]
                } else {
                    [0.; 2]
                },
                "cycle frame {i}"
            );
        }
        let clock = ProjectClock {
            cycle: Some((10, 41)),
        };
        let log = seen.lock().unwrap();
        assert!(log.iter().any(|(_, _, position, _)| *position < 0));
        for (delay, frame, position, length) in log.iter() {
            let upstream = match delay {
                7 => 0,
                11 => 7,
                13 => 18,
                3 => 31,
                _ => panic!(),
            };
            assert_eq!(*position, clock.at(*frame as i64 - upstream));
            assert!(*length <= clock.remaining(*frame as i64 - upstream));
        }
        assert!(graph.set_cycle(10, 41).is_err());
    }
    #[test]
    fn track_effect_mix_updates_preserve_dsp_history_restore_static_and_validate_atomically() {
        for (kind, params) in [
            ("delay", json!({"time":0.001,"feedback":0.5,"mix":0})),
            ("chorus", json!({"rate":1.5,"depth":0.5,"mix":0})),
            ("reverb", json!({"size":0.01,"decay":0.05,"mix":0})),
            ("distortion", json!({"drive":0.8,"mix":0})),
            ("ringmod", json!({"freq":200,"mix":0})),
            ("bitcrush", json!({"bits":4,"mix":0})),
        ] {
            let dry: Vec<f32> = (0..4096).map(|i| 0.3 * (i as f32 * 0.173).sin()).collect();
            let source = || {
                HashMap::from([(
                    "s".into(),
                    Source::new(vec![dry.clone(), dry.clone()]).unwrap(),
                )])
            };
            // UI indices include disabled effects; prepared racks do not.
            let mut doc = json!({"sampleRate":48000,"duration":4096./48000.,"nativeEffects":insert(0),"tracks":[{"id":"a","volume":1,"pan":0,"effects":[{"type":"delay","enabled":false,"params":{}},{"type":kind,"enabled":true,"params":params}],"segments":[clip("c")]}]});
            let mut graph = Graph::prepare(&doc, source(), fake).unwrap();
            doc["tracks"][0]["effects"][1]["params"]["mix"] = json!(1);
            let mut wet = Graph::prepare(&doc, source(), fake).unwrap();
            let mut out = vec![[0.; 2]; 256];
            let mut reference = out.clone();
            graph.render(&mut out).unwrap();
            wet.render(&mut reference).unwrap();
            let controls = |points: Value| json!({"masterVolume":1,"tracks":[{"id":"a","volume":1,"pan":0,"muted":false,"solo":false,"effectMixes":[{"index":1,"points":points}]}]});
            let mut invalid = controls(json!([{"time":0,"value":1}]));
            invalid["masterVolume"] = json!(0);
            invalid["tracks"][0]["effectMixes"]
                .as_array_mut()
                .unwrap()
                .push(json!({"index":0,"points":null}));
            assert!(graph
                .update_controls(serde_json::from_value(invalid).unwrap())
                .is_err());
            graph.render(&mut out).unwrap();
            wet.render(&mut reference).unwrap();
            for (i, sample) in out.iter().enumerate() {
                assert!(
                    (sample[0] - dry[256 + i]).abs() < 1e-6,
                    "{kind}: invalid packet partly applied"
                );
            }
            let position = graph.position;
            graph
                .update_controls(
                    serde_json::from_value(controls(json!([{"time":0,"value":1}]))).unwrap(),
                )
                .unwrap();
            assert_eq!(graph.position, position);
            graph.render(&mut out).unwrap();
            wet.render(&mut reference).unwrap();
            assert!(
                out.iter()
                    .zip(&dry[512..768])
                    .any(|(sample, dry)| (sample[0] - dry).abs() > 1e-4),
                "{kind}: wet control missing"
            );
            for (sample, reference) in out.iter().zip(&reference) {
                assert!(
                    (sample[0] - reference[0]).abs() < 1e-6,
                    "{kind}: effect history restarted"
                );
            }
            for points in [
                json!([{"time":0,"value":1.01}]),
                json!([{"time":0,"value":-0.1}]),
                json!("invalid"),
            ] {
                assert!(graph
                    .update_controls(serde_json::from_value(controls(points)).unwrap())
                    .is_err());
            }
            graph
                .update_controls(serde_json::from_value(controls(Value::Null)).unwrap())
                .unwrap();
            graph.render(&mut out).unwrap();
            for (i, sample) in out.iter().enumerate() {
                assert!(
                    (sample[0] - dry[768 + i]).abs() < 1e-6,
                    "{kind}: static Read mix not restored"
                );
            }
        }
    }
    #[test]
    fn track_parameter_controls_match_continuous_read_without_resetting_history() {
        for (kind, parameter, params, original, held, maximum) in [
            (
                "delay",
                "feedback",
                json!({"time":0.003,"feedback":0.2,"mix":0.8}),
                0.2,
                0.8,
                0.95,
            ),
            (
                "chorus",
                "depth",
                json!({"rate":1.5,"depth":0.2,"mix":0.8}),
                0.2,
                0.9,
                1.0,
            ),
            (
                "delay",
                "time",
                json!({"time":0.003,"feedback":0.3,"mix":0.8}),
                0.003,
                0.018,
                2.0,
            ),
            (
                "chorus",
                "rate",
                json!({"rate":1.5,"depth":0.7,"mix":0.8}),
                1.5,
                4.7,
                8.0,
            ),
            (
                "ringmod",
                "freq",
                json!({"freq":200,"mix":0.8}),
                200.0,
                731.0,
                2000.0,
            ),
        ] {
            let source = || {
                HashMap::from([(
                    "s".into(),
                    Source::new(vec![
                        (0..4096)
                            .map(|i| 0.3 * (i as f32 * 0.173).sin())
                            .collect();
                        2
                    ])
                    .unwrap(),
                )])
            };
            let mut doc = json!({"sampleRate":48000,"duration":4096./48000.,"nativeEffects":insert(0),"tracks":[{"id":"a","volume":1,"pan":0,"effects":[{"type":kind,"enabled":true,"params":params}],"segments":[clip("c")]}]});
            let mut graph = Graph::prepare(&doc, source(), fake).unwrap();
            doc["tracks"][0]["effects"][0]["automation"][parameter] = json!([
                {"time":0,"value":original,"curve":"step"},
                {"time":1024./48000.,"value":held,"curve":"step"},
                {"time":2048./48000.,"value":original}
            ]);
            let mut reference = Graph::prepare(&doc, source(), fake).unwrap();
            let controls = |points: Value| json!({"masterVolume":1,"tracks":[{"id":"a","volume":1,"pan":0,"muted":false,"solo":false,"effectAutomation":[{"index":0,"parameter":parameter,"points":points}]}]});
            let mut out = vec![[0.; 2]; 1024];
            let mut expected = out.clone();
            for block in 0..4 {
                if block == 1 {
                    for points in [
                        json!([{"time":0,"value":maximum + 0.01}]),
                        json!([{"time":0,"value":-0.1}]),
                    ] {
                        assert!(graph
                            .update_controls(serde_json::from_value(controls(points)).unwrap())
                            .is_err());
                    }
                    let mut duplicate = controls(json!([{"time":0,"value":held}]));
                    let copy = duplicate["tracks"][0]["effectAutomation"][0].clone();
                    duplicate["tracks"][0]["effectAutomation"]
                        .as_array_mut()
                        .unwrap()
                        .push(copy);
                    assert!(graph
                        .update_controls(serde_json::from_value(duplicate).unwrap())
                        .is_err());
                    let mut unsupported = controls(json!([{"time":0,"value":held}]));
                    unsupported["tracks"][0]["effectAutomation"][0]["parameter"] =
                        json!(if kind == "delay" { "depth" } else { "feedback" });
                    assert!(graph
                        .update_controls(serde_json::from_value(unsupported).unwrap())
                        .is_err());
                    graph
                        .update_controls(
                            serde_json::from_value(controls(json!([{"time":0,"value":held}])))
                                .unwrap(),
                        )
                        .unwrap();
                } else if block == 2 {
                    graph
                        .update_controls(serde_json::from_value(controls(Value::Null)).unwrap())
                        .unwrap();
                }
                graph.render(&mut out).unwrap();
                reference.render(&mut expected).unwrap();
                for (sample, expected) in out.iter().zip(&expected) {
                    assert!(
                        (sample[0] - expected[0]).abs() < 1e-6,
                        "{kind} {parameter} history or static Read changed at block {block}"
                    );
                }
            }
        }
    }
    #[test]
    fn scoped_effect_values_keep_history_and_validate_packets_before_applying() {
        for (kind, parameter, params, original, held) in [
            (
                "delay",
                "time",
                json!({"time":0.003,"feedback":0.3,"mix":0.8}),
                0.003,
                0.018,
            ),
            (
                "delay",
                "feedback",
                json!({"time":0.003,"feedback":0.2,"mix":0.8}),
                0.2,
                0.8,
            ),
            (
                "chorus",
                "depth",
                json!({"rate":1.5,"depth":0.2,"mix":0.8}),
                0.2,
                0.9,
            ),
            (
                "chorus",
                "rate",
                json!({"rate":1.5,"depth":0.7,"mix":0.8}),
                1.5,
                4.7,
            ),
            ("ringmod", "freq", json!({"freq":200,"mix":0.8}), 200., 731.),
            (
                "delay",
                "mix",
                json!({"time":0.003,"feedback":0.3,"mix":0.3}),
                0.3,
                0.8,
            ),
            (
                "chorus",
                "mix",
                json!({"rate":1.5,"depth":0.7,"mix":0.3}),
                0.3,
                0.8,
            ),
            ("ringmod", "mix", json!({"freq":200,"mix":0.3}), 0.3, 0.8),
            (
                "distortion",
                "mix",
                json!({"drive":0.8,"mix":0.3}),
                0.3,
                0.8,
            ),
            ("bitcrush", "mix", json!({"bits":4,"mix":0.3}), 0.3, 0.8),
            (
                "reverb",
                "mix",
                json!({"size":0.01,"decay":0.05,"mix":0.3}),
                0.3,
                0.8,
            ),
        ] {
            for scope in ["track:a", "master", "clip:c"] {
                let source = || {
                    HashMap::from([(
                        "s".into(),
                        Source::new(vec![
                            (0..4096)
                                .map(|i| 0.3 * (i as f32 * 0.173).sin())
                                .collect();
                            2
                        ])
                        .unwrap(),
                    )])
                };
                let mut doc = json!({"sampleRate":48000,"duration":4096./48000.,"nativeEffects":insert(0),"tracks":[{"id":"a","volume":1,"pan":0,"effects":[{"type":kind,"enabled":true,"params":params}],"segments":[clip("c")]}]});
                let (path, index) = if scope == "master" {
                    let effect = doc["tracks"][0]["effects"][0].clone();
                    doc["tracks"][0]["effects"] = json!([]);
                    doc["masterEffects"] =
                        json!([{"type":"delay","enabled":false,"params":{}},effect]);
                    ("/masterEffects", 1)
                } else if scope == "clip:c" {
                    let effect = doc["tracks"][0]["effects"][0].clone();
                    doc["tracks"][0]["effects"] = json!([]);
                    doc["tracks"][0]["segments"][0]["effects"] =
                        json!([{"type":"delay","enabled":false,"params":{}},effect]);
                    doc["tracks"][0]["segments"][0]["startTime"] = json!(512. / 48000.);
                    doc["duration"] = json!(4608. / 48000.);
                    ("/tracks/0/segments/0/effects", 1)
                } else {
                    ("/tracks/0/effects", 0)
                };
                // Reprepare after assigning the real scope; curves below are the oracle.
                let mut graph = Graph::prepare(&doc, source(), fake).unwrap();
                doc.pointer_mut(path).unwrap()[index]["automation"][parameter] = json!([
                    {"time":0,"value":original,"curve":"step"},
                    {"time":1024./48000.,"value":held,"curve":"step"},
                    {"time":2048./48000.,"value":original}
                ]);
                let mut reference = Graph::prepare(&doc, source(), fake).unwrap();
                let controls = |value: f64| {
                    let effect =
                        json!({"index":index,"parameter":parameter,"value":value,"points":null});
                    let mut packet = json!({"masterVolume":1,"tracks":[{"id":"a","volume":1,"pan":0,"muted":false,"solo":false}]});
                    if scope == "track:a" {
                        packet["tracks"][0]["effectAutomation"] = json!([effect]);
                    } else {
                        packet["effectScopes"] = json!([{"scope":scope,"controls":[effect]}]);
                    }
                    packet
                };
                let mut invalid = controls(held);
                invalid["masterVolume"] = json!(0);
                invalid
                    .pointer_mut(if scope == "track:a" {
                        "/tracks/0/effectAutomation"
                    } else {
                        "/effectScopes/0/controls"
                    })
                    .unwrap()
                    .as_array_mut()
                    .unwrap()
                    .push(json!({"index":99,"parameter":"mix","value":0,"points":null}));
                assert!(graph
                    .update_controls(serde_json::from_value(invalid).unwrap())
                    .is_err());
                if scope != "track:a" {
                    let mut duplicate = controls(held);
                    let entry = duplicate["effectScopes"][0].clone();
                    duplicate["effectScopes"]
                        .as_array_mut()
                        .unwrap()
                        .push(entry);
                    assert!(graph
                        .update_controls(serde_json::from_value(duplicate).unwrap())
                        .is_err());
                    for unknown in ["clip:missing", "track:a"] {
                        let mut invalid = controls(held);
                        invalid["effectScopes"][0]["scope"] = json!(unknown);
                        assert!(graph
                            .update_controls(serde_json::from_value(invalid).unwrap())
                            .is_err());
                    }
                }
                let mut out = vec![[0.; 2]; 1024];
                let mut expected = out.clone();
                for block in 0..4 {
                    if block == 1 || block == 2 {
                        graph
                            .update_controls(
                                serde_json::from_value(controls(if block == 1 {
                                    held
                                } else {
                                    original
                                }))
                                .unwrap(),
                            )
                            .unwrap();
                    }
                    graph.render(&mut out).unwrap();
                    reference.render(&mut expected).unwrap();
                    for (sample, expected) in out.iter().zip(&expected) {
                        for channel in 0..2 {
                            assert!(
                                (sample[channel] - expected[channel]).abs() < 1e-6,
                                "{scope} {kind} {parameter} lost state at block {block}"
                            );
                        }
                    }
                }
            }
        }
    }
    #[test]
    fn master_and_clip_audition_restore_independently_and_reject_cross_scope_partial_updates() {
        let source = || {
            HashMap::from([(
                "s".into(),
                Source::new(vec![
                    (0..4096)
                        .map(|i| 0.3 * (i as f32 * 0.173).sin())
                        .collect();
                    2
                ])
                .unwrap(),
            )])
        };
        let mut doc = json!({"sampleRate":48000,"duration":4096./48000.,"nativeEffects":insert(0),"masterEffects":[{"type":"delay","enabled":true,"params":{"time":0.001,"feedback":0.2,"mix":0.3}}],"tracks":[{"id":"a","volume":1,"pan":0,"segments":[clip("c")]}]});
        doc["tracks"][0]["segments"][0]["effects"] =
            json!([{"type":"ringmod","enabled":true,"params":{"freq":200,"mix":0.8}}]);
        let mut graph = Graph::prepare(&doc, source(), fake).unwrap();
        doc["masterEffects"][0]["automation"]["mix"] = json!([{"time":0,"value":0.3,"curve":"step"},{"time":1024./48000.,"value":0.8,"curve":"step"},{"time":2048./48000.,"value":0.3}]);
        doc["tracks"][0]["segments"][0]["effects"][0]["automation"]["freq"] = json!([{"time":0,"value":200,"curve":"step"},{"time":1024./48000.,"value":731,"curve":"step"},{"time":3072./48000.,"value":200}]);
        let mut reference = Graph::prepare(&doc, source(), fake).unwrap();
        let controls = |master: Value, clip: Value| json!({"masterVolume":1,"tracks":[{"id":"a","volume":1,"pan":0,"muted":false,"solo":false}],"effectScopes":[{"scope":"master","controls":[{"index":0,"parameter":"mix","points":master}]},{"scope":"clip:c","controls":[{"index":0,"parameter":"freq","points":clip}]}]});
        let mut invalid = controls(json!([{"time":0,"value":0.8}]), Value::Null);
        invalid["effectScopes"][1]["scope"] = json!("clip:missing");
        assert!(graph
            .update_controls(serde_json::from_value(invalid).unwrap())
            .is_err());
        let mut out = vec![[0.; 2]; 1024];
        let mut expected = out.clone();
        for block in 0..4 {
            if block > 0 {
                let master = if block == 1 {
                    json!([{"time":0,"value":0.8}])
                } else {
                    Value::Null
                };
                let clip = if block < 3 {
                    json!([{"time":0,"value":731}])
                } else {
                    Value::Null
                };
                graph
                    .update_controls(serde_json::from_value(controls(master, clip)).unwrap())
                    .unwrap();
            }
            graph.render(&mut out).unwrap();
            reference.render(&mut expected).unwrap();
            for (sample, expected) in out.iter().zip(&expected) {
                for channel in 0..2 {
                    assert!(
                        (sample[channel] - expected[channel]).abs() < 1e-6,
                        "Scoped automation or phase changed at block {block}"
                    );
                }
            }
        }
    }
    #[test]
    fn temporary_gain_and_pan_curves_restore_read_without_resetting_native_history() {
        struct Counter(usize);
        impl Insert for Counter {
            fn latency(&self) -> usize {
                0
            }
            fn process(&mut self, pcm: &mut [Stereo], _: u32) -> Result<()> {
                for sample in pcm {
                    sample[0] += self.0 as f32 / 10000.;
                    sample[1] -= self.0 as f32 / 10000.;
                    self.0 += 1;
                }
                Ok(())
            }
        }
        let doc = json!({"sampleRate":48000,"duration":4096./48000.,"masterVolume":1,"nativeEffects":insert(0),"tracks":[{"id":"a","volume":0.5,"pan":0,"segments":[clip("c")]}]});
        let pcm = HashMap::from([("s".into(), Source::new(vec![vec![1.; 4096]; 2]).unwrap())]);
        let mut graph = Graph::prepare(&doc, pcm, |_| Ok(Box::new(Counter(0)))).unwrap();
        let mut out = vec![[0.; 2]; 256];
        graph.render(&mut out).unwrap();
        assert_eq!(out[0], [0.5; 2]);
        for (gain, pan, expected) in [
            (Some(0.25), Some(0.), [0.125, 0.125]),
            (Some(0.25), Some(1.), [0., 0.25]),
            (None, None, [0.5, 0.5]),
        ] {
            let position = graph.position;
            let update = json!({"masterVolume":1,"tracks":[{"id":"a","volume":0.5,"pan":0,"muted":false,"solo":false,"automation":gain.map(|v|json!([{"time":0,"value":v}])),"panAutomation":pan.map(|v|json!([{"time":0,"value":v}]))}]});
            graph
                .update_controls(serde_json::from_value(update).unwrap())
                .unwrap();
            assert_eq!(graph.position, position);
            graph.render(&mut out).unwrap();
            for (index, sample) in out.iter().enumerate() {
                let history = (position as usize + index) as f32 / 10000.;
                assert!((sample[0] - (expected[0] + history)).abs() < 1e-6);
                assert!((sample[1] - (expected[1] - history)).abs() < 1e-6);
            }
        }
    }
    #[test]
    fn live_mix_controls_ramp_without_rebuilding_or_advancing_on_rejection() {
        let doc = json!({"sampleRate":48000,"duration":4096./48000.,"masterVolume":1,"tracks":[{"id":"a","volume":1,"pan":0,"segments":[clip("c")]}]});
        let pcm = HashMap::from([("s".into(), Source::new(vec![vec![1.; 4096]; 2]).unwrap())]);
        let mut graph = Graph::prepare(&doc, pcm, fake).unwrap();
        let mut out = vec![[0.; 2]; 512];
        graph.render(&mut out).unwrap();
        assert!(out.iter().all(|p| *p == [1.; 2]));
        let controls = |volume: f64, muted: bool| {
            serde_json::from_value::<MixControls>(json!({"masterVolume":volume,"tracks":[{"id":"a","volume":1,"pan":0,"muted":muted,"solo":false}]})).unwrap()
        };
        let mut invalid = controls(0., false);
        invalid.tracks[0].id = "missing".into();
        assert!(graph.update_controls(invalid).is_err());
        graph.render(&mut out).unwrap();
        assert!(out.iter().all(|p| *p == [1.; 2]));
        graph.update_controls(controls(0., false)).unwrap();
        graph.render(&mut out).unwrap();
        for (i, p) in out.iter().enumerate() {
            assert!((p[0] - (239usize.saturating_sub(i)) as f32 / 240.).abs() < 1e-6);
        }
        assert_eq!(graph.meters()["a"]["peak"], 1.);
        graph.update_controls(controls(1., true)).unwrap();
        graph.render(&mut out).unwrap();
        assert!(out[240..].iter().all(|p| *p == [0.; 2]));
    }
    struct Fail;
    impl Insert for Fail {
        fn latency(&self) -> usize {
            0
        }
        fn process(&mut self, pcm: &mut [Stereo], _: u32) -> Result<()> {
            pcm.fill([99.; 2]);
            Err("helper fault".into())
        }
    }
    #[test]
    fn any_insert_failure_latches_whole_graph_silence() {
        let mut doc = project();
        doc["nativeEffects"] = insert(0);
        let mut graph = Graph::prepare(&doc, source(), |_| Ok(Box::new(Fail))).unwrap();
        let mut out = vec![[1.; 2]; 512];
        assert!(graph.render(&mut out).is_err());
        assert!(out.iter().all(|x| *x == [0.; 2]));
        out.fill([1.; 2]);
        assert!(graph.render(&mut out).is_err());
        assert!(out.iter().all(|x| *x == [0.; 2]));
    }
    struct ChangedLatency(usize);
    impl Insert for ChangedLatency {
        fn latency(&self) -> usize {
            self.0
        }
        fn process(&mut self, _: &mut [Stereo], _: u32) -> Result<()> {
            self.0 += 1;
            Ok(())
        }
    }
    #[test]
    fn changing_reported_latency_faults_instead_of_misaligning_audio() {
        let mut doc = project();
        doc["nativeEffects"] = insert(0);
        let mut graph =
            Graph::prepare(&doc, source(), |_| Ok(Box::new(ChangedLatency(0)))).unwrap();
        let mut out = vec![[1.; 2]; 512];
        assert!(graph
            .render(&mut out)
            .unwrap_err()
            .contains("latency changed"));
        assert!(out.iter().all(|x| *x == [0.; 2]));
    }
    #[test]
    fn sidechain_program_and_detector_share_compensated_clock() {
        let mut base = project();
        base["masterVolume"] = json!(1);
        base["tracks"] = json!([
         {"id":"detector","segments":[clip("detector")],"volume":1,"pan":0},
         {"id":"program","segments":[clip("program")],"volume":1,"pan":0,"ducking":{"source":"detector","threshold":-30,"ratio":4,"attack":0.001,"release":0.1,"maximum":60}}]);
        base["tracks"][1]["segments"][0]["fadeInDuration"] = json!(0.01);
        for (detector, program) in [(13, 7), (7, 13)] {
            let mut shifted = base.clone();
            shifted["tracks"][0]["nativeEffects"] = insert(detector);
            shifted["tracks"][1]["nativeEffects"] = insert(program);
            let mut a = Graph::prepare(&base, source(), fake).unwrap();
            let mut b = Graph::prepare(&shifted, source(), fake).unwrap();
            assert_eq!(b.latency, 13);
            let mut plain = vec![[0.; 2]; 4096];
            let mut delayed = plain.clone();
            a.render(&mut plain).unwrap();
            for block in delayed.chunks_mut(127) {
                b.render(block).unwrap();
            }
            for i in 13..4096 {
                for ch in 0..2 {
                    assert!(
                        (plain[i - 13][ch] - delayed[i][ch]).abs() < 1e-6,
                        "sidechain frame {i}"
                    );
                }
            }
        }
    }
    #[test]
    fn invalid_snapshot_routes_extents_and_duplicates_reject() {
        let doc = project();
        let mut bad = doc.clone();
        bad["tracks"][2]["output"] = json!("bus");
        assert!(Graph::prepare(&bad, source(), fake).is_err());
        let mut bad = doc.clone();
        bad["tracks"][1]["segments"][0]["id"] = json!("a");
        assert!(Graph::prepare(&bad, source(), fake).is_err());
        let mut bad = doc.clone();
        bad["tracks"][0]["segments"][0]["sourceOffset"] = json!(2);
        assert!(Graph::prepare(&bad, source(), fake).is_err());
        assert!(Source::new(vec![vec![f32::NAN]]).is_err());
    }
    #[test]
    fn builtins_fades_automation_and_limiter_match_existing_file_mixer() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("source.wav");
        let out = dir.path().join("mix.wav");
        let mut writer = hound::WavWriter::create(
            &path,
            hound::WavSpec {
                channels: 2,
                sample_rate: 48000,
                bits_per_sample: 32,
                sample_format: hound::SampleFormat::Float,
            },
        )
        .unwrap();
        let pcm: Vec<Vec<f32>> = (0..2)
            .map(|ch| {
                (0..4096)
                    .map(|i| (((i as f64 * 0.031).sin()) * (ch as f64 + 0.5)) as f32)
                    .collect()
            })
            .collect();
        for i in 0..4096 {
            for channel in &pcm {
                writer.write_sample(channel[i]).unwrap();
            }
        }
        writer.finalize().unwrap();
        let mut project = project();
        project["tracks"][0]["fadeInDuration"] = json!(0.02);
        project["tracks"][0]["automation"] =
            json!([{"time":0,"value":0.5},{"time":0.08,"value":1}]);
        project["tracks"][1]["panAutomation"] =
            json!([{"time":0,"value":-1},{"time":0.08,"value":1}]);
        project["tracks"][0]["effects"] = json!([{"id":"filter","type":"lowpass","enabled":true,"params":{"frequency":500,"q":0.7}}]);
        project["outputLimiter"] = json!({"enabled":true,"ceiling":-3,"release":0.1});
        crate::audio_mix::render(
            &json!({"project":project,"sources":[{"id":"s","path":path}]}),
            out.to_str().unwrap(),
        )
        .unwrap();
        let expected = hound::WavReader::open(&out)
            .unwrap()
            .samples::<f32>()
            .map(|v| v.unwrap())
            .collect::<Vec<_>>();
        let mut graph = Graph::prepare(
            &project,
            HashMap::from([("s".into(), Source::new(pcm).unwrap())]),
            fake,
        )
        .unwrap();
        let mut actual = vec![[0.; 2]; 4096];
        for block in actual.chunks_mut(127) {
            graph.render(block).unwrap();
        }
        let error = actual
            .iter()
            .flatten()
            .zip(expected)
            .map(|(a, b)| (a - b).abs())
            .fold(0f32, f32::max);
        assert!(error < 2e-6, "parity error {error}");
    }
}
