//! Experimental prepared native-worker graph. No output device or frontend dependency.
//! Owns a compiled project snapshot and immutable decoded 48 kHz PCM. Not CLI playback.
use crate::{
    audio_mix::{
        block_dsp::{Budget, Curve, Fade, Rack},
        finite, frames, pan, positive,
    },
    Result,
};
use serde_json::Value;
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
    fn process(&mut self, pcm: &mut [Stereo], frame: u32) -> Result<()>;
}
struct NativeRack {
    inserts: Vec<Box<dyn Insert>>,
    delays: Vec<usize>,
    latency: usize,
}
fn native(
    value: &Value,
    count: &mut usize,
    factory: &mut impl FnMut(&Value) -> Result<Box<dyn Insert>>,
) -> Result<NativeRack> {
    let mut inserts = Vec::new();
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
        }
    }
    let delays = inserts.iter().map(|insert| insert.latency()).collect();
    Ok(NativeRack {
        inserts,
        delays,
        latency,
    })
}
impl NativeRack {
    fn process(&mut self, pcm: &mut [Stereo], frame: u32) -> Result<()> {
        for (i, insert) in self.inserts.iter_mut().enumerate() {
            if insert.latency() != self.delays[i] {
                return Err("Native insert latency changed".into());
            }
            insert.process(pcm, frame)?;
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
    target: Option<usize>,
    gain: f64,
    pre: bool,
    delay: Delay,
}
struct Track {
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
/// Prepared immutable snapshot. A processing error latches until dropped/reprepared.
pub struct Graph {
    tracks: Vec<Track>,
    master: Rack,
    native: NativeRack,
    limiter: Option<crate::limiter::Limiter>,
    gain: f64,
    position: u32,
    latency: usize,
    duration: u32,
    fault: Option<String>,
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
                let builtin = Rack::new(&clip["effects"], &mut budget)?;
                let native = native(&clip["nativeEffects"], &mut count, &mut factory)?;
                mono &= source.mono && !builtin.stereo() && native.inserts.is_empty();
                input_latency = input_latency.max(native.latency);
                start = start.min(position);
                end = end.max(position + length);
                clips.push(Clip {
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
            let builtin = Rack::new(&doc["effects"], &mut budget)?;
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
                    pre: *pre,
                    delay,
                });
            }
        }
        let master = Rack::new(&project["masterEffects"], &mut budget)?;
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
        Ok(Self {
            tracks,
            master,
            native,
            limiter,
            gain: positive(project, "masterVolume", Some(1.))?,
            position: 0,
            latency,
            duration,
            fault: None,
        })
    }
    pub fn render(&mut self, output: &mut [Stereo]) -> Result<()> {
        output.fill([0.; 2]);
        if let Some(error) = &self.fault {
            return Err(error.clone());
        }
        if output.is_empty() || output.len() > 4096 {
            return Err("Invalid native graph block length".into());
        }
        let result = self.block(output);
        if let Err(error) = &result {
            output.fill([0.; 2]);
            self.fault = Some(error.clone());
        }
        result
    }
    fn block(&mut self, output: &mut [Stereo]) -> Result<()> {
        let n = output.len();
        let block = self.position;
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
                    let frame = block + i as u32;
                    let raw = if frame >= clip.start && frame < clip.end {
                        double(clip.source.pcm[clip.offset + (frame - clip.start) as usize])
                            .map(|v| v * clip.gain)
                    } else {
                        [0.; 2]
                    };
                    *sample = float(clip.builtin.at(raw, frame));
                }
                clip.native.process(&mut pcm, block)?;
                for (i, sample) in pcm.iter_mut().enumerate() {
                    let time =
                        (block + i as u32) as f64 - clip.native.latency as f64 - clip.start as f64;
                    let gain = clip.fade.at(time / RATE);
                    let value = clip.align.at(sample.map(|v| (v as f64 * gain) as f32));
                    for (ch, v) in value.iter().enumerate() {
                        inputs[t][i][ch] += *v as f64;
                    }
                }
            }
            let mut pcm = vec![[0.; 2]; n];
            for (i, sample) in pcm.iter_mut().enumerate() {
                let frame = (block + i as u32).saturating_sub(track.input_latency as u32);
                let time = frame as f64 / RATE;
                let gain = track.fade.at(time - track.start) * track.automation.at(time);
                *sample = float(track.builtin.at(
                    inputs[t][i].map(|v| ((v as f32) * (gain as f32)) as f64),
                    frame,
                ));
            }
            track.native.process(&mut pcm, block)?;
            for (i, sample) in pcm.iter().enumerate() {
                let mut value = double(track.program.at(*sample));
                if let Some(duck) = &mut track.duck {
                    let detector = double(track.detector.at(float(posts[duck.source][i])));
                    let gain = duck.gain(detector);
                    value = value.map(|v| (v * gain) as f32 as f64);
                }
                let pre = if track.audible { value } else { [0.; 2] };
                let time =
                    (block + i as u32).saturating_sub(track.output_latency as u32) as f64 / RATE;
                let post = pan(pre.map(|v| v * track.gain), track.pan.at(time), track.mono);
                posts[t][i] = post;
                for route in &mut track.routes {
                    let sample = double(route.delay.at(float(if route.pre { pre } else { post })));
                    let target = if let Some(target) = route.target {
                        &mut inputs[target][i]
                    } else {
                        &mut master[i]
                    };
                    for ch in 0..2 {
                        target[ch] += sample[ch] * route.gain;
                    }
                }
            }
        }
        let master_input = self.latency - self.native.latency;
        for (i, sample) in output.iter_mut().enumerate() {
            *sample = float(self.master.at(
                master[i],
                (block + i as u32).saturating_sub(master_input as u32),
            ));
        }
        self.native.process(output, block)?;
        for sample in output {
            let value = double(*sample).map(|v| v * self.gain);
            *sample = float(if let Some(limiter) = &mut self.limiter {
                limiter.at(value)
            } else {
                value
            });
            if sample.iter().any(|v| !v.is_finite()) {
                return Err("Native graph mix exceeded finite float range".into());
            }
        }
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
