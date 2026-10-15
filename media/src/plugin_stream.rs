//! Internal persistent AU/VST3 block transport. It does not yet drive timeline playback.
use crate::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
#[derive(Debug, Serialize, Deserialize)]
pub struct StreamReply {
    pub metadata: Value,
    pub samples: Vec<Vec<f32>>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StreamTransport {
    pub sample_position: u64,
    /// Musical/project clock, distinct from the strictly contiguous DSP clock.
    /// Signed positions support latency preroll; wraps support continuous loops.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_position: Option<i64>,
    pub tempo: f64,
    pub numerator: u32,
    pub denominator: u32,
    pub origin_seconds: f64,
    pub playing: bool,
}
impl StreamTransport {
    pub fn validate(&self) -> Result<()> {
        if self
            .project_position
            .is_some_and(|p| !(-9_007_199_254_736_895..=9_007_199_254_736_895).contains(&p))
            || self.sample_position > 9_007_199_254_740_991 - 4096
            || !self.tempo.is_finite()
            || !(20.0..=300.0).contains(&self.tempo)
            || !(1..=32).contains(&self.numerator)
            || ![1, 2, 4, 8, 16].contains(&self.denominator)
            || !self.origin_seconds.is_finite()
            || !(0.0..=86400.0).contains(&self.origin_seconds)
        {
            return Err("Invalid plugin transport".into());
        }
        Ok(())
    }
}
#[cfg(target_os = "macos")]
mod native {
    use super::*;
    use std::{
        io::{Read, Write},
        process::{Child, Command, Stdio},
        sync::{
            mpsc::{self, Receiver, SyncSender},
            Arc, Mutex,
        },
        thread::{self, JoinHandle},
        time::Duration,
    };
    #[derive(Clone)]
    pub struct StreamStop(Arc<Mutex<Child>>);
    impl StreamStop {
        pub fn is_alive(&self) -> bool {
            self.0
                .lock()
                .is_ok_and(|mut child| matches!(child.try_wait(), Ok(None)))
        }
        pub fn stop(&self) {
            if let Ok(mut child) = self.0.lock() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
    pub struct PluginStream {
        child: StreamStop,
        request: Option<SyncSender<Vec<u8>>>,
        reply: Receiver<Result<StreamReply>>,
        worker: Option<JoinHandle<()>>,
        _directory: tempfile::TempDir,
        _helper: crate::apple::HelperExecutable,
        channels: usize,
        rate: f64,
        sequence: u32,
        transport_position: Option<u64>,
        closed: bool,
        pub info: Value,
    }
    fn read_reply(reader: &mut impl Read) -> Result<StreamReply> {
        let mut header = [0; 4];
        reader
            .read_exact(&mut header)
            .map_err(|e| format!("Plugin stream response: {e}"))?;
        let length = u32::from_le_bytes(header) as usize;
        if length == 0 || length > 16_000_000 {
            return Err("Invalid stream response size".into());
        }
        let mut json = vec![0; length];
        reader.read_exact(&mut json).map_err(|e| e.to_string())?;
        let metadata: Value = serde_json::from_slice(&json).map_err(|e| e.to_string())?;
        let frames = metadata["frames"].as_u64().ok_or("Missing stream frames")? as usize;
        let channels = metadata["channels"]
            .as_u64()
            .ok_or("Missing stream channels")? as usize;
        if frames > 4096 || !(1..=2).contains(&channels) {
            return Err("Invalid stream response format".into());
        }
        let mut samples = Vec::new();
        if frames > 0 {
            for _ in 0..channels {
                let mut bytes = vec![0; frames * 4];
                reader.read_exact(&mut bytes).map_err(|e| e.to_string())?;
                let pcm = bytes
                    .chunks_exact(4)
                    .map(|v| f32::from_le_bytes(v.try_into().unwrap()))
                    .collect::<Vec<_>>();
                if pcm.iter().any(|v| !v.is_finite()) {
                    return Err("Invalid stream output samples".into());
                }
                samples.push(pcm);
            }
        }
        Ok(StreamReply { metadata, samples })
    }
    impl PluginStream {
        pub fn open(request: &Value) -> Result<Self> {
            Self::open_with_stop(request, |_| {})
        }
        pub fn open_with_stop(request: &Value, on_spawn: impl FnOnce(StreamStop)) -> Result<Self> {
            let rate = request["sampleRate"]
                .as_f64()
                .ok_or("Missing stream sample rate")?;
            let channels = request["channels"]
                .as_u64()
                .ok_or("Missing stream channels")? as usize;
            let id = request["id"].as_str().ok_or("Missing stream plugin")?;
            if !rate.is_finite()
                || !(8000.0..=192000.0).contains(&rate)
                || !(1..=2).contains(&channels)
                || request.to_string().len() > 16_000_000
            {
                return Err("Invalid plugin stream configuration".into());
            }
            let directory = tempfile::tempdir().map_err(|e| e.to_string())?;
            let helper = crate::apple::helper_executable(id.starts_with("vst3:"))?;
            let json = directory.path().join("request.json");
            std::fs::write(&json, request.to_string()).map_err(|e| e.to_string())?;
            let mut command = Command::new(&helper.path);
            command.arg("plugin-stream").arg(json);
            crate::security_scope::configure_helper(&mut command, directory.path())?;
            let mut child = command
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| e.to_string())?;
            let mut stdin = child.stdin.take().unwrap();
            let mut stdout = child.stdout.take().unwrap();
            let control = StreamStop(Arc::new(Mutex::new(child)));
            on_spawn(control.clone());
            let (send, requests) = mpsc::sync_channel::<Vec<u8>>(1);
            let (replies, receive) = mpsc::sync_channel(1);
            let realtime = request["processMode"] != "offline";
            let worker = thread::spawn(move || {
                match read_reply(&mut stdout) {
                    Ok(value) => {
                        if replies.send(Ok(value)).is_err() {
                            return;
                        }
                    }
                    Err(e) => {
                        let _ = replies.send(Err(e));
                        return;
                    }
                }
                let mut scheduled = false;
                while let Ok(packet) = requests.recv() {
                    // The caller waits on this pipe thread too. Leaving it at
                    // ordinary QoS creates a priority inversion in live graphs.
                    if realtime && !scheduled {
                        if let Err(error) = crate::realtime_macos::configure(512, rate) {
                            let _ = replies.send(Err(error));
                            return;
                        }
                        scheduled = true;
                    }
                    let result = stdin
                        .write_all(&packet)
                        .and_then(|_| stdin.flush())
                        .map_err(|e| e.to_string())
                        .and_then(|_| read_reply(&mut stdout));
                    let failed = result.is_err();
                    if replies.send(result).is_err() || failed {
                        return;
                    }
                }
            });
            let mut stream = Self {
                child: control,
                request: Some(send),
                reply: receive,
                worker: Some(worker),
                _directory: directory,
                _helper: helper,
                channels,
                rate,
                sequence: 0,
                transport_position: None,
                closed: false,
                info: Value::Null,
            };
            let initial = stream.receive(Duration::from_secs(10))?;
            stream.validate(&initial, 0, 0)?;
            if initial.metadata["processMode"].as_str()
                != Some(request["processMode"].as_str().unwrap_or("realtime"))
            {
                return Err("Invalid native process mode".into());
            }
            stream.info = initial.metadata;
            Ok(stream)
        }
        #[cfg(test)]
        pub(crate) fn process_id(&self) -> u32 {
            self.child.0.lock().unwrap().id()
        }
        pub fn stop_handle(&self) -> StreamStop {
            self.child.clone()
        }
        fn receive(&mut self, timeout: Duration) -> Result<StreamReply> {
            match self.reply.recv_timeout(timeout) {
                Ok(Ok(value)) => Ok(value),
                result => {
                    self.closed = true;
                    self.child.stop();
                    Err(match result {
                        Ok(Err(error)) => error,
                        Err(mpsc::RecvTimeoutError::Timeout) => "Plugin stream timed out".into(),
                        _ => "Plugin stream closed".into(),
                    })
                }
            }
        }
        fn validate(&mut self, reply: &StreamReply, sequence: u32, frames: usize) -> Result<()> {
            if reply.metadata["sequence"].as_u64() != Some(sequence as u64)
                || reply.metadata["frames"].as_u64() != Some(frames as u64)
                || reply.metadata["channels"].as_u64() != Some(self.channels as u64)
                || reply.metadata["sampleRate"].as_f64() != Some(self.rate)
                || reply.metadata["latencySamples"]
                    .as_u64()
                    .is_none_or(|v| v as f64 > self.rate * 10.0)
            {
                self.closed = true;
                self.child.stop();
                return Err("Invalid stream response identity".into());
            }
            Ok(())
        }
        fn exchange(
            &mut self,
            kind: u32,
            samples: &[Vec<f32>],
            settings: &Value,
        ) -> Result<StreamReply> {
            if self.closed {
                return Err("Plugin stream closed".into());
            }
            let frames = samples.first().map_or(0, Vec::len);
            if kind == 1
                && (samples.len() != self.channels
                    || frames == 0
                    || frames > 4096
                    || samples
                        .iter()
                        .any(|s| s.len() != frames || s.iter().any(|v| !v.is_finite())))
            {
                return Err("Invalid plugin stream audio".into());
            }
            let json = serde_json::to_vec(settings).map_err(|e| e.to_string())?;
            if json.len() > 8192 {
                return Err("Plugin stream parameters too large".into());
            }
            let sequence = self
                .sequence
                .checked_add(1)
                .ok_or("Plugin stream sequence exhausted")?;
            let mut packet = Vec::with_capacity(16 + json.len() + frames * self.channels * 4);
            for value in [kind, frames as u32, sequence, json.len() as u32] {
                packet.extend(value.to_le_bytes());
            }
            packet.extend(json);
            for channel in samples {
                for sample in channel {
                    packet.extend(sample.to_le_bytes());
                }
            }
            self.request
                .as_ref()
                .ok_or("Plugin stream closed")?
                .send(packet)
                .map_err(|_| "Plugin stream closed")?;
            self.sequence = sequence;
            let reply = self.receive(Duration::from_secs(2))?;
            self.validate(&reply, sequence, frames)?;
            Ok(reply)
        }
        pub fn process(
            &mut self,
            samples: &[Vec<f32>],
            parameters: &Value,
            bypass: bool,
        ) -> Result<StreamReply> {
            self.process_with_transport(samples, parameters, bypass, None)
        }
        pub fn process_with_transport(
            &mut self,
            samples: &[Vec<f32>],
            parameters: &Value,
            bypass: bool,
            transport: Option<&StreamTransport>,
        ) -> Result<StreamReply> {
            if !parameters.is_object() {
                return Err("Invalid stream parameters".into());
            }
            if let Some(value) = transport {
                value.validate()?;
                if self
                    .transport_position
                    .is_some_and(|position| position != value.sample_position)
                {
                    return Err("Plugin transport discontinuity requires a new session".into());
                }
            } else if self.transport_position.is_some() {
                return Err("Missing plugin transport".into());
            }
            let mut settings = serde_json::json!({"parameters":parameters,"bypass":bypass});
            if let Some(value) = transport {
                settings["transport"] = serde_json::to_value(value).map_err(|e| e.to_string())?;
            }
            let reply = self.exchange(1, samples, &settings)?;
            if let Some(value) = transport {
                let applied =
                    serde_json::from_value::<StreamTransport>(reply.metadata["transport"].clone());
                if applied.as_ref().ok() != Some(value) {
                    self.closed = true;
                    self.child.stop();
                    return Err("Invalid native transport acknowledgement".into());
                }
                self.transport_position = Some(value.sample_position + samples[0].len() as u64);
            }
            Ok(reply)
        }

        pub fn snapshot(&mut self) -> Result<StreamReply> {
            self.exchange(2, &[], &serde_json::json!({}))
        }
    }
    impl Drop for PluginStream {
        fn drop(&mut self) {
            self.child.stop();
            self.request.take();
            if let Some(worker) = self.worker.take() {
                let _ = worker.join();
            }
        }
    }
}
#[cfg(target_os = "macos")]
pub use native::{PluginStream, StreamStop};
#[cfg(not(target_os = "macos"))]
mod unsupported {
    use super::*;
    #[derive(Clone)]
    pub struct StreamStop;
    impl StreamStop {
        pub fn is_alive(&self) -> bool {
            false
        }
        pub fn stop(&self) {}
    }
    pub struct PluginStream {
        pub info: Value,
    }
    impl PluginStream {
        pub fn open(_: &Value) -> Result<Self> {
            Err("Plugin streams require macOS".into())
        }
        pub fn open_with_stop(request: &Value, _: impl FnOnce(StreamStop)) -> Result<Self> {
            Self::open(request)
        }
        pub fn stop_handle(&self) -> StreamStop {
            StreamStop
        }
        pub fn process(&mut self, _: &[Vec<f32>], _: &Value, _: bool) -> Result<StreamReply> {
            Err("Plugin streams require macOS".into())
        }
        pub fn process_with_transport(
            &mut self,
            _: &[Vec<f32>],
            _: &Value,
            _: bool,
            _: Option<&StreamTransport>,
        ) -> Result<StreamReply> {
            Err("Plugin streams require macOS".into())
        }
        pub fn snapshot(&mut self) -> Result<StreamReply> {
            Err("Plugin streams require macOS".into())
        }
    }
}
#[cfg(not(target_os = "macos"))]
pub use unsupported::{PluginStream, StreamStop};

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use serde_json::json;
    fn au() -> Value {
        let plugins = crate::apple::plugin("plugin-scan", "{}").unwrap();
        let id = plugins
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["name"] == "AUBandpass")
            .unwrap()["id"]
            .clone();
        json!({"id":id,"sampleRate":48000,"channels":2,"parameters":{"0":440.0}})
    }
    fn reference(request: &Value, input: &[Vec<f32>]) -> Vec<Vec<f32>> {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("input.wav");
        let output = root.path().join("output.wav");
        let mut wav = hound::WavWriter::create(
            &source,
            hound::WavSpec {
                channels: input.len() as u16,
                sample_rate: 48000,
                bits_per_sample: 32,
                sample_format: hound::SampleFormat::Float,
            },
        )
        .unwrap();
        for i in 0..input[0].len() {
            for ch in input {
                wav.write_sample(ch[i]).unwrap();
            }
        }
        wav.finalize().unwrap();
        crate::apple::plugin("plugin-render",&json!({"id":request["id"],"state":request["state"],"parameters":request["parameters"],"path":source,"output":output,"offset":0.0,"duration":input[0].len() as f64/48000.0}).to_string()).unwrap();
        let mut channels = vec![Vec::new(); input.len()];
        for (i, value) in hound::WavReader::open(output)
            .unwrap()
            .samples::<f32>()
            .enumerate()
        {
            channels[i % input.len()].push(value.unwrap());
        }
        channels
    }
    fn continuous(request: &Value, input: &[Vec<f32>], blocks: &[usize]) -> Vec<Vec<f32>> {
        let mut stream = PluginStream::open(request).unwrap();
        let mut output = vec![Vec::new(); input.len()];
        let mut cursor = 0;
        for frames in blocks {
            let chunk = input
                .iter()
                .map(|ch| ch[cursor..cursor + frames].to_vec())
                .collect::<Vec<_>>();
            let reply = stream.process(&chunk, &json!({}), false).unwrap();
            for (out, pcm) in output.iter_mut().zip(reply.samples) {
                out.extend(pcm);
            }
            cursor += frames;
        }
        assert_eq!(cursor, input[0].len());
        output
    }
    fn context_requests() -> Vec<Value> {
        let mut requests = vec![au()];
        if let Ok(folder) = std::env::var("CRISPAUDIO_TEST_PLUGIN_FOLDER") {
            let plugins =
                crate::apple::plugin("plugin-scan", &json!({"folders":[folder]}).to_string())
                    .unwrap();
            let plugin = plugins
                .as_array()
                .unwrap()
                .iter()
                .find(|p| p["name"] == "ADelay")
                .expect("ADelay fixture");
            requests.push(json!({"id":plugin["id"],"sampleRate":48000,"channels":2,"parameters":{"100":0.002,"101":0.0}}));
        }
        let alternate = requests
            .iter()
            .cloned()
            .map(|mut request| {
                request["sampleRate"] = json!(44100);
                request
            })
            .collect::<Vec<_>>();
        requests.extend(alternate);
        requests
    }
    #[test]
    fn offline_and_realtime_modes_preserve_fixture_dsp_and_transport() {
        for request in context_requests() {
            let rate = request["sampleRate"].as_f64().unwrap();
            let samples = (0..2)
                .map(|channel| {
                    (0..2048)
                        .map(|frame| {
                            ((frame as f64
                                * (if channel == 0 { 440.0 } else { 2200.0 })
                                * std::f64::consts::TAU
                                / rate)
                                .sin()
                                * 0.2) as f32
                        })
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>();
            let transport = StreamTransport {
                project_position: None,
                sample_position: (rate * 2.0) as u64,
                tempo: 90.0,
                numerator: 7,
                denominator: 8,
                origin_seconds: 3.0,
                playing: true,
            };
            let mut results = Vec::new();
            for mode in ["realtime", "offline"] {
                let mut settings = request.clone();
                settings["processMode"] = json!(mode);
                let mut stream = PluginStream::open(&settings).unwrap();
                assert_eq!(stream.info["processMode"], mode);
                let reply = stream
                    .process_with_transport(&samples, &json!({}), false, Some(&transport))
                    .unwrap();
                results.push(reply.samples);
            }
            let delta = results[0]
                .iter()
                .flatten()
                .zip(results[1].iter().flatten())
                .map(|(a, b)| (a - b).abs())
                .fold(0.0f32, f32::max);
            assert!(delta < 1e-5, "Offline DSP difference {delta}");
        }
    }
    #[test]
    fn project_transport_reaches_native_render_context_and_advances_without_drift() {
        for request in context_requests() {
            let rate = request["sampleRate"].as_f64().unwrap();
            let mut stream = PluginStream::open(&request).unwrap();
            let mut transport = StreamTransport {
                project_position: None,
                sample_position: (rate * 2.0) as u64,
                tempo: 90.0,
                numerator: 7,
                denominator: 8,
                origin_seconds: 3.0,
                playing: true,
            };
            for frames in [128, 17, 4096] {
                let reply = stream
                    .process_with_transport(
                        &[vec![0.25; frames], vec![-0.25; frames]],
                        &json!({}),
                        false,
                        Some(&transport),
                    )
                    .unwrap();
                assert_eq!(
                    serde_json::from_value::<StreamTransport>(reply.metadata["transport"].clone())
                        .unwrap(),
                    transport
                );
                let beat = (transport.sample_position as f64 / rate - transport.origin_seconds)
                    * transport.tempo
                    / 60.0;
                let bar = transport.numerator as f64 * 4.0 / transport.denominator as f64;
                assert!((reply.metadata["musicalPosition"].as_f64().unwrap() - beat).abs() < 1e-12);
                assert!(
                    (reply.metadata["barPosition"].as_f64().unwrap() - (beat / bar).floor() * bar)
                        .abs()
                        < 1e-12
                );
                if request["id"].as_str().unwrap().starts_with("vst3:") {
                    assert_eq!(reply.metadata["processMode"], "realtime");
                }
                transport.sample_position += frames as u64;
                transport.tempo = 150.0;
                transport.playing = false;
            }
            let state = stream.snapshot().unwrap();
            assert_eq!(
                state.metadata["transport"]["samplePosition"],
                transport.sample_position
            );
        }
    }
    #[test]
    fn project_clock_can_preroll_and_cycle_without_discontinuity_in_dsp_clock() {
        for request in context_requests() {
            let mut stream = PluginStream::open(&request).unwrap();
            for (index, project) in [-48000, 96000, 24000].iter().enumerate() {
                let transport = StreamTransport {
                    sample_position: index as u64 * 128,
                    project_position: Some(*project),
                    tempo: 90.,
                    numerator: 7,
                    denominator: 8,
                    origin_seconds: 3.,
                    playing: true,
                };
                let reply = stream
                    .process_with_transport(
                        &[vec![0.25; 128], vec![-0.25; 128]],
                        &json!({}),
                        false,
                        Some(&transport),
                    )
                    .unwrap();
                assert_eq!(
                    serde_json::from_value::<StreamTransport>(reply.metadata["transport"].clone())
                        .unwrap(),
                    transport
                );
                let rate = request["sampleRate"].as_f64().unwrap();
                let expected = (*project as f64 / rate - 3.) * 1.5;
                assert!(
                    (reply.metadata["musicalPosition"].as_f64().unwrap() - expected).abs() < 1e-12
                );
            }
        }
    }
    #[test]
    fn seeks_require_fresh_sessions_and_invalid_context_does_not_advance_dsp() {
        for request in context_requests() {
            let rate = request["sampleRate"].as_f64().unwrap();
            let mut stream = PluginStream::open(&request).unwrap();
            let mut transport = StreamTransport {
                project_position: None,
                sample_position: (rate * 10.0) as u64,
                tempo: 120.0,
                numerator: 4,
                denominator: 4,
                origin_seconds: 0.0,
                playing: true,
            };
            stream
                .process_with_transport(
                    &[vec![1.0; 128], vec![1.0; 128]],
                    &json!({}),
                    false,
                    Some(&transport),
                )
                .unwrap();
            assert!(stream
                .process_with_transport(
                    &[vec![0.0; 128], vec![0.0; 128]],
                    &json!({}),
                    false,
                    Some(&transport)
                )
                .unwrap_err()
                .contains("discontinuity"));
            assert!(stream
                .process(&[vec![0.0; 128], vec![0.0; 128]], &json!({}), false)
                .unwrap_err()
                .contains("Missing"));
            transport.sample_position += 128;
            let valid = transport.clone();
            transport.tempo = 0.0;
            assert!(stream
                .process_with_transport(
                    &[vec![0.0; 128], vec![0.0; 128]],
                    &json!({}),
                    false,
                    Some(&transport)
                )
                .is_err());
            stream
                .process_with_transport(
                    &[vec![0.0; 128], vec![0.0; 128]],
                    &json!({}),
                    false,
                    Some(&valid),
                )
                .unwrap();
            let state = stream.snapshot().unwrap();
            drop(stream);
            let mut restored = request.clone();
            restored["state"] = state.metadata["state"].clone();
            let mut fresh = PluginStream::open(&restored).unwrap();
            transport.sample_position = (rate * 0.5) as u64;
            transport.tempo = 120.0;
            let reply = fresh
                .process_with_transport(
                    &[vec![0.0; 128], vec![0.0; 128]],
                    &json!({}),
                    false,
                    Some(&transport),
                )
                .unwrap();
            assert!(reply.samples.iter().flatten().all(|v| v.abs() < 1e-6));
        }
    }
    #[test]
    fn au_variable_blocks_match_whole_render_and_bypass_preserves_headroom() {
        let request = au();
        let input = (0..2)
            .map(|ch| {
                (0..8192)
                    .map(|i| {
                        (i as f32 * (if ch == 0 { 440.0 } else { 2200.0 }) * std::f32::consts::TAU
                            / 48000.0)
                            .sin()
                            * 0.25
                    })
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>();
        let expected = reference(&request, &input);
        let actual = continuous(&request, &input, &[113, 2048, 17, 4096, 1918]);
        let difference = actual
            .iter()
            .zip(&expected)
            .flat_map(|(a, b)| a.iter().zip(b).map(|(a, b)| (a - b).abs()))
            .fold(0.0f32, f32::max);
        assert!(difference < 1e-5, "Block boundary delta {difference}");
        let mut stream = PluginStream::open(&request).unwrap();
        let dry = vec![vec![1.5; 128], vec![-1.25; 128]];
        assert_eq!(
            stream
                .process(&dry, &json!({"0":880.0}), true)
                .unwrap()
                .samples,
            dry
        );
        let state = stream.snapshot().unwrap();
        assert!(state.metadata["state"].as_str().unwrap().len() > 10);
        assert!(state.metadata["parameters"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["address"] == "0" && p["value"] == 880.0));
    }
    #[test]
    fn vst_delay_spans_blocks_and_state_restores_without_old_audio() {
        let Ok(folder) = std::env::var("CRISPAUDIO_TEST_PLUGIN_FOLDER") else {
            return;
        };
        let plugins =
            crate::apple::plugin("plugin-scan", &json!({"folders":[folder]}).to_string()).unwrap();
        let id = plugins
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["name"] == "ADelay")
            .unwrap()["id"]
            .clone();
        let request =
            json!({"id":id,"sampleRate":48000,"channels":1,"parameters":{"100":0.002,"101":0.0}});
        let mut input = vec![vec![0.0; 9600]];
        input[0][4090] = 1.5;
        let expected = reference(&request, &input);
        let actual = continuous(&request, &input, &[4096, 123, 4096, 1285]);
        assert_eq!(actual, expected);
        assert_eq!(actual[0][4186], 1.5);
        let mut stream = PluginStream::open(&request).unwrap();
        stream
            .process(&[vec![1.5; 128]], &json!({"100":0.004}), false)
            .unwrap();
        let state = stream.snapshot().unwrap();
        let mut restored = PluginStream::open(
            &json!({"id":id,"sampleRate":48000,"channels":1,"state":state.metadata["state"]}),
        )
        .unwrap();
        let pcm = restored
            .process(&[vec![0.0; 512]], &json!({}), false)
            .unwrap();
        assert!(pcm.samples[0].iter().all(|v| *v == 0.0));
        assert!(restored.snapshot().unwrap().metadata["parameters"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["address"] == "100" && (p["value"].as_f64().unwrap() - 0.004).abs() < 1e-7));
    }
    #[test]
    fn stopped_processor_times_out_and_reaps_child_even_during_pipe_write() {
        let mut stream = PluginStream::open(&au()).unwrap();
        let pid = stream.process_id();
        assert!(std::process::Command::new("/bin/kill")
            .args(["-STOP", &pid.to_string()])
            .status()
            .unwrap()
            .success());
        let start = std::time::Instant::now();
        let result = stream.process(&[vec![0.0; 4096], vec![0.0; 4096]], &json!({}), false);
        assert_eq!(result.unwrap_err(), "Plugin stream timed out");
        assert!(start.elapsed() < std::time::Duration::from_secs(3));
        assert!(stream.snapshot().is_err());
        drop(stream);
    }
    #[test]
    fn cancel_during_open_and_invalid_audio_are_bounded() {
        let request = au();
        let start = std::time::Instant::now();
        assert!(PluginStream::open_with_stop(&request, |stop| stop.stop()).is_err());
        assert!(start.elapsed() < std::time::Duration::from_secs(2));
        let mut stream = PluginStream::open(&request).unwrap();
        assert!(stream
            .process(&[vec![f32::NAN], vec![0.0]], &json!({}), false)
            .is_err());
        assert!(stream
            .process(&[vec![0.0; 4097], vec![0.0; 4097]], &json!({}), false)
            .is_err());
        assert!(stream.snapshot().is_ok());
        let stop = stream.stop_handle();
        stop.stop();
        assert!(stream.snapshot().is_err());
    }
}
