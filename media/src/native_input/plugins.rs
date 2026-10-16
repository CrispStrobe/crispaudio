//! Static AU/VST3 input rack. Open/process/drop on the native DSP worker only.
use super::{Processor, MAX_FRAMES};
use crate::{
    native_graph::Stereo,
    plugin_stream::{PluginStream, StreamStop, StreamTransport},
    Result,
};
use serde_json::{json, Value};

pub struct PluginConfig {
    pub id: String,
    pub state: String,
    pub parameters: Value,
    pub bypass: bool,
}
struct Insert {
    stream: PluginStream,
    latency: usize,
    bypass: bool,
    dry: Vec<Stereo>,
    cursor: usize,
}
fn delayed(history: &mut [Stereo], cursor: &mut usize, input: Stereo) -> Stereo {
    if history.is_empty() {
        return input;
    }
    let sample = std::mem::replace(&mut history[*cursor], input);
    *cursor = (*cursor + 1) % history.len();
    sample
}
pub struct PluginRack {
    inserts: Vec<Insert>,
    latency: usize,
    next: Option<u64>,
}
impl PluginRack {
    /// Fixed 48 kHz stereo foundation. The caller registers helper stop handles
    /// to interrupt opening/processing during cancellation. Partial-open failures
    /// drop every prepared helper. This does not reserve app-wide stream slots;
    /// a future recording owner must enforce the group budget before opening.
    pub fn open(configs: &[PluginConfig], mut register: impl FnMut(StreamStop)) -> Result<Self> {
        if configs.len() > 2
            || configs.iter().any(|config| {
                config.id.is_empty()
                    || config.state.len() > 1_500_000
                    || !config.parameters.is_object()
                    || config.parameters.to_string().len() > 64_000
            })
        {
            return Err("Invalid native input rack configuration".into());
        }
        let mut inserts = Vec::with_capacity(configs.len());
        let mut latency = 0;
        for config in configs {
            let stream = PluginStream::open_with_stop(
                &json!({"id":config.id,"state":config.state,
                "parameters":config.parameters,"sampleRate":48000,"channels":2,"processMode":"realtime"}),
                &mut register,
            )?;
            let delay = stream.info["latencySamples"]
                .as_u64()
                .filter(|delay| *delay <= 480000)
                .ok_or("Invalid native input plugin latency")? as usize;
            latency += delay;
            inserts.push(Insert {
                stream,
                latency: delay,
                bypass: config.bypass,
                dry: vec![[0.; 2]; if config.bypass { delay } else { 0 }],
                cursor: 0,
            });
        }
        Ok(Self {
            inserts,
            latency,
            next: None,
        })
    }
    /// Plug-in delay only. Input/output/ring scheduling has no fixed latency here.
    pub fn latency_samples(&self) -> usize {
        self.latency
    }
}
impl Processor for PluginRack {
    fn process(&mut self, first_frame: u64, pcm: &mut [Stereo]) -> Result<()> {
        let end = first_frame
            .checked_add(pcm.len() as u64)
            .ok_or("Input clock overflow")?;
        if pcm.is_empty()
            || pcm.len() > MAX_FRAMES
            || pcm.iter().flatten().any(|v| !v.is_finite())
            || self.next.is_some_and(|next| next != first_frame)
        {
            return Err("Invalid native input rack block".into());
        }
        self.next = Some(end);
        for insert in &mut self.inserts {
            let input = vec![
                pcm.iter().map(|v| v[0]).collect(),
                pcm.iter().map(|v| v[1]).collect(),
            ];
            let reply = insert.stream.process_with_transport(
                &input,
                &json!({}),
                false,
                Some(&StreamTransport {
                    sample_position: first_frame,
                    project_position: None,
                    tempo: 120.,
                    numerator: 4,
                    denominator: 4,
                    origin_seconds: 0.,
                    playing: true,
                }),
            )?;
            if reply.metadata["latencySamples"].as_u64() != Some(insert.latency as u64) {
                return Err("Native input plugin latency changed".into());
            }
            for (i, sample) in pcm.iter_mut().enumerate() {
                if insert.bypass {
                    let dry = [input[0][i], input[1][i]];
                    *sample = delayed(&mut insert.dry, &mut insert.cursor, dry);
                } else {
                    *sample = [reply.samples[0][i], reply.samples[1][i]];
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_input::{input, CueWorker, Fault, Step};

    fn config(id: String, bypass: bool) -> PluginConfig {
        PluginConfig {
            id,
            bypass,
            state: String::new(),
            parameters: json!({"0":1000.0}),
        }
    }
    #[test]
    fn bypass_delay_preserves_history_across_unequal_blocks() {
        let mut history = vec![[0.; 2]; 5];
        let mut cursor = 0;
        let mut actual = Vec::new();
        let pcm = (1..=17)
            .map(|n| [n as f32, -(n as f32)])
            .collect::<Vec<_>>();
        let mut start = 0;
        for length in [3, 1, 7, 6] {
            for sample in &pcm[start..start + length] {
                actual.push(delayed(&mut history, &mut cursor, *sample));
            }
            start += length;
        }
        assert_eq!(&actual[..5], &[[0.; 2]; 5]);
        assert_eq!(&actual[5..], &pcm[..12]);
        assert_eq!(delayed(&mut [], &mut 0, [0.5, -1.5]), [0.5, -1.5]);
    }
    #[test]
    fn empty_rack_passthrough_and_preflight_limits() {
        let mut rack = PluginRack::open(&[], |_| panic!("No helper expected")).unwrap();
        let mut pcm = [[0.5, -1.5]; 128];
        rack.process(0, &mut pcm).unwrap();
        assert_eq!(pcm, [[0.5, -1.5]; 128]);
        assert_eq!(rack.latency_samples(), 0);
        assert!(rack.process(0, &mut pcm).is_err());
        for configs in [
            vec![
                config("fake".into(), false),
                config("fake".into(), false),
                config("fake".into(), false),
            ],
            vec![config(String::new(), false)],
            vec![PluginConfig {
                parameters: Value::Null,
                ..config("fake".into(), false)
            }],
            vec![PluginConfig {
                state: "a".repeat(1_500_001),
                ..config("fake".into(), false)
            }],
        ] {
            assert!(
                PluginRack::open(&configs, |_| panic!("Preflight must run before spawning"))
                    .is_err()
            );
        }
    }

    #[cfg(target_os = "macos")]
    fn apple_id() -> String {
        let plugins = crate::apple::plugin("plugin-scan", "{}").unwrap();
        plugins
            .as_array()
            .unwrap()
            .iter()
            .find(|plugin| plugin["name"] == "AUBandpass")
            .expect("Apple AUBandpass fixture")["id"]
            .as_str()
            .unwrap()
            .into()
    }
    #[cfg(target_os = "macos")]
    fn reference(configs: &[PluginConfig], pcm: &[Stereo]) -> Vec<Stereo> {
        let root = tempfile::tempdir().unwrap();
        let mut current = pcm.to_vec();
        for (index, config) in configs.iter().enumerate() {
            assert!(!config.bypass);
            let source = root.path().join(format!("input-{index}.wav"));
            let output = root.path().join(format!("output-{index}.wav"));
            let mut wav = hound::WavWriter::create(
                &source,
                hound::WavSpec {
                    channels: 2,
                    sample_rate: 48000,
                    bits_per_sample: 32,
                    sample_format: hound::SampleFormat::Float,
                },
            )
            .unwrap();
            for frame in &current {
                for value in frame {
                    wav.write_sample(*value).unwrap();
                }
            }
            wav.finalize().unwrap();
            crate::apple::plugin(
                "plugin-render",
                &json!({"id":config.id,"state":config.state,
                "parameters":config.parameters,"path":source,"output":output,"offset":0.,
                "duration":pcm.len() as f64/48000.})
                .to_string(),
            )
            .unwrap();
            let samples = hound::WavReader::open(&output)
                .unwrap()
                .samples::<f32>()
                .map(|sample| sample.unwrap())
                .collect::<Vec<_>>();
            current = samples
                .chunks_exact(2)
                .map(|frame| [frame[0], frame[1]])
                .collect();
            assert_eq!(current.len(), pcm.len());
        }
        current
    }
    #[cfg(target_os = "macos")]
    fn qualify(configs: &[PluginConfig], expected_dry: bool) {
        let pcm = (0..48000)
            .map(|frame| {
                let phase = frame as f64 * std::f64::consts::TAU / 48000.;
                [
                    (0.2 * (phase * 1000.).sin() + 0.1 * (phase * 6000.).sin()) as f32,
                    if frame % 4093 == 0 { -0.625 } else { 0. },
                ]
            })
            .collect::<Vec<_>>();
        let expected = if expected_dry {
            pcm.clone()
        } else {
            reference(configs, &pcm)
        };
        let mut handles = Vec::new();
        let rack = PluginRack::open(configs, |handle| handles.push(handle)).unwrap();
        assert_eq!(rack.latency_samples(), 0); // Both bundled fixtures report zero.
        let (mut writer, mut dry, cue) = input();
        let (mut worker, mut wet) = CueWorker::new(cue, rack);
        let (send, received) = std::sync::mpsc::sync_channel(1);
        let task = std::thread::spawn(move || loop {
            match worker.step() {
                Step::Processed => send.send(()).unwrap(),
                Step::Idle => std::thread::yield_now(),
                Step::Ended => break,
                fault => panic!("Native cue worker failed: {fault:?}"),
            }
        });
        let mut cursor = 0;
        let mut actual = Vec::new();
        for frames in [512, 128, 1, 379].into_iter().cycle() {
            let end = (cursor + frames).min(pcm.len());
            assert!(writer.push(cursor as u64, cursor as u64 * 7, &pcm[cursor..end]));
            received
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap();
            let raw = dry.pop().unwrap();
            let output = wet.pop().unwrap();
            assert_eq!(raw.samples(), &pcm[cursor..end]);
            assert_eq!(
                (output.first_frame, output.host_time),
                (cursor as u64, cursor as u64 * 7)
            );
            actual.extend_from_slice(output.samples());
            cursor = end;
            if cursor == pcm.len() {
                break;
            }
        }
        assert_eq!(dry.status().fault(), None);
        assert_eq!(wet.status().fault(), None);
        drop(writer);
        task.join().unwrap();
        assert!(wet.status().closed());
        assert!(handles.iter().all(|handle| !handle.is_alive()));
        let error = actual
            .iter()
            .flatten()
            .zip(expected.iter().flatten())
            .map(|(a, b)| (a - b).abs())
            .fold(0f32, f32::max);
        assert!(
            error < 2e-6,
            "Input worker/offline reference difference: {error}"
        );
        eprintln!("native input: {} inserts; 48000 dry frames exact; offline max error {error}; helpers closed", configs.len());
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn apple_rack_on_native_worker_matches_offline_and_preserves_dry() {
        let id = apple_id();
        qualify(&[config(id.clone(), false)], false);
        qualify(
            &[config(id.clone(), false), config(id.clone(), false)],
            false,
        );
        qualify(&[config(id.clone(), true), config(id, true)], true);
    }
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "Requires SDK ADelay fixture; set CRISPAUDIO_TEST_PLUGIN_FOLDER"]
    fn vst3_rack_on_native_worker_matches_offline_and_preserves_dry() {
        let folder =
            std::env::var("CRISPAUDIO_TEST_PLUGIN_FOLDER").expect("ADelay fixture folder required");
        let plugins =
            crate::apple::plugin("plugin-scan", &json!({"folders":[folder]}).to_string()).unwrap();
        let id = plugins
            .as_array()
            .unwrap()
            .iter()
            .find(|plugin| plugin["name"] == "ADelay")
            .expect("SDK ADelay fixture")["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let config = || PluginConfig {
            parameters: json!({"100":0.002,"101":0}),
            ..config(id.clone(), false)
        };
        qualify(&[config()], false);
        qualify(&[config(), config()], false);
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn failed_open_and_killed_helper_release_rack_without_stopping_dry() {
        let id = apple_id();
        let mut handles = Vec::new();
        assert!(PluginRack::open(
            &[
                config(id.clone(), false),
                config("au:invalid".into(), false)
            ],
            |handle| handles.push(handle)
        )
        .is_err());
        assert!(!handles.is_empty());
        assert!(handles.iter().all(|handle| !handle.is_alive()));
        handles.clear();
        let rack = PluginRack::open(&[config(id, false)], |handle| handles.push(handle)).unwrap();
        let (mut writer, mut dry, cue) = input();
        let (mut worker, mut wet) = CueWorker::new(cue, rack);
        assert!(writer.push(0, 0, &[[0.5; 2]; 128]));
        assert_eq!(worker.step(), Step::Processed);
        dry.pop().unwrap();
        wet.pop().unwrap();
        handles[0].stop();
        assert!(writer.push(128, 0, &[[0.75; 2]; 128]));
        assert_eq!(worker.step(), Step::Fault(Fault::Processor));
        assert!(wet.pop().is_none());
        assert!(handles.iter().all(|handle| !handle.is_alive()));
        assert_eq!(dry.pop().unwrap().samples(), &[[0.75; 2]; 128]);
        assert!(writer.push(256, 0, &[[0.25; 2]; 128]));
        assert_eq!(dry.pop().unwrap().samples(), &[[0.25; 2]; 128]);
        assert_eq!(dry.status().fault(), None);
    }
}
