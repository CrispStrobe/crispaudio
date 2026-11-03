use clap::{Parser, Subcommand};
use crispaudio_media as media;

#[derive(Parser)]
#[command(
    name = "crispaudio",
    about = "CrispAudio interview synchronization and video export"
)]
struct Cli {
    /// Native Apple or optional FFmpeg compatibility backend. Apple never falls back.
    #[arg(long,global=true,value_parser=["auto","apple","ffmpeg"])]
    backend: Option<String>,
    /// Picture export: mp4, mov, vp9 (WebM), av1 (WebM).
    #[arg(long,global=true,value_parser=["mp4","mov","vp9","av1"])]
    video_format: Option<String>,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Transcribe linked arrangement audio with CrispASR; outputs aligned-word JSON.
    TranscribeProject {
        #[arg(long)]
        input: String,
        #[arg(long)]
        output: String,
        #[arg(long)]
        executable: String,
        #[arg(long)]
        model: String,
        #[arg(long, default_value = "auto")]
        aligner: String,
        #[arg(long, default_value = "de")]
        language: String,
    },
    /// Split audio into stems with an in-process CrispASR separation model.
    SeparateAudio {
        /// Audio file (WAV directly; other formats via native Apple decode).
        #[arg(long)]
        input: String,
        /// Separation GGUF, e.g. mel-band-roformer-vocals or htdemucs.
        #[arg(long)]
        model: String,
        /// Existing folder; receives one float WAV per stem (never overwritten).
        #[arg(long)]
        output_dir: String,
        /// libcrispasr path; defaults to CRISPASR_LIB or a copy beside this tool.
        #[arg(long)]
        crispasr_lib: Option<String>,
    },
    /// Resynthesise speech with a CrispASR restoration model (generative, mono).
    RegenerateSpeech {
        #[arg(long)]
        input: String,
        /// Speech-to-speech GGUF such as sidon or voxcpm2-vae.
        #[arg(long)]
        model: String,
        #[arg(long)]
        output: String,
        #[arg(long)]
        crispasr_lib: Option<String>,
    },
    /// Detect speech regions and pauses (JSON) in audio or a project's mix.
    SpeechRegions {
        /// Audio file, or a .crispaudio project whose native mix is analysed.
        #[arg(long)]
        input: String,
        /// VAD model, e.g. ggml-silero-v6.2.0.bin or a FireRedVAD GGUF.
        #[arg(long)]
        model: String,
        #[arg(long)]
        output: String,
        /// Shortest interior silence reported as a pause (seconds).
        #[arg(long, default_value_t = 0.7)]
        min_pause: f64,
        /// VAD options JSON {threshold,minSpeechMs,minSilenceMs,padMs}.
        #[arg(long)]
        vad: Option<String>,
        #[arg(long)]
        crispasr_lib: Option<String>,
    },
    /// Detect beats/downbeats and tempo (JSON) in audio or a project's mix.
    DetectBeats {
        #[arg(long)]
        input: String,
        /// Beat This! GGUF.
        #[arg(long)]
        model: String,
        #[arg(long)]
        output: String,
        #[arg(long)]
        crispasr_lib: Option<String>,
    },
    /// Create derived speed/reverse/pitch media without changing the input.
    RetimeMedia {
        #[arg(long)]
        input: String,
        #[arg(long)]
        output: String,
        /// JSON Settings (offset/duration/rate/reverse/preservePitch/semitones/video/frameRate).
        #[arg(long)]
        settings: String,
    },
    /// Conservative rumble and FFT noise reduction, preserving the original recording.
    CleanAudio {
        #[arg(long)]
        input: String,
        #[arg(long)]
        output: String,
        #[arg(long, default_value_t = -45.0, allow_hyphen_values = true)]
        noise_floor: f64,
    },
    /// Apply a JSON recipe to a .crispaudio project; never changes source media.
    EditProject {
        #[arg(long)]
        input: String,
        #[arg(long)]
        recipe: String,
        #[arg(long)]
        output: String,
    },
    /// Render linked project audio to WAV or native macOS FLAC/AAC.
    RenderProject {
        #[arg(long)]
        input: String,
        #[arg(long)]
        output: String,
        #[arg(long)]
        video: bool,
        /// Native integer PCM WAV depth; omitted keeps 32-bit float WAV.
        #[arg(long, conflicts_with="video", value_parser=["8","16","24","32"])]
        wav_bit_depth: Option<String>,
        /// Native AAC bitrate for .aac/.m4a; AAC output defaults to 192 kbps.
        #[arg(long, conflicts_with_all=["video","wav_bit_depth"],value_parser=["96","128","192","256","320"])]
        audio_bitrate_kbps: Option<String>,
        /// Export bounds on the arrangement clock; omitted means the full mix.
        #[arg(long)]
        start: Option<f64>,
        #[arg(long)]
        end: Option<f64>,
    },
    /// Export a picture edit JSON {path, clips}; mix uses the edited timeline clock.
    EditVideo {
        #[arg(long)]
        edit: String,
        #[arg(long)]
        output: String,
        #[arg(long)]
        mix: Option<String>,
        #[arg(long, default_value_t = 0.0)]
        start: f64,
        #[arg(long)]
        end: Option<f64>,
        #[arg(long)]
        mix_is_trimmed: bool,
    },
    /// Inspect duration, channels, sample rate and video presence (JSON).
    Probe { input: String },
    /// Measure EBU R128 loudness and gain toward -16 LUFS, limited to -1 dBTP.
    Loudness { input: String },
    /// Prepare a video proxy, first thumbnail, or extracted 48 kHz stereo WAV.
    Prepare {
        #[arg(long)]
        input: String,
        #[arg(long)]
        output: String,
        #[arg(long)]
        proxy: bool,
        #[arg(long, conflicts_with = "proxy")]
        thumbnail: bool,
    },
    /// Measure sample peak, RMS, activity proxy and a conservative gain suggestion (JSON).
    Levels { input: String },
    /// Find external recordings on the camera clock; writes a reviewable JSON session.
    Analyze {
        #[arg(long)]
        video: String,
        #[arg(long)]
        audio: Vec<String>,
        #[arg(long)]
        output: String,
    },
    /// Render aligned 48 kHz / 24-bit WAV tracks and session.json into a new folder.
    Align {
        #[arg(long)]
        session: String,
        #[arg(long)]
        output_dir: String,
        #[arg(long)]
        allow_uncertain: bool,
    },
    /// Export audio onto the picture. Full-length exports copy video; sections encode exact cuts.
    Export {
        #[arg(long)]
        session: String,
        #[arg(long)]
        output: String,
        #[arg(long)]
        mix: Option<String>,
        #[arg(long)]
        allow_uncertain: bool,
        #[arg(long)]
        match_levels: bool,
        /// Section start on the original video clock (seconds).
        #[arg(long)]
        start: Option<f64>,
        /// Section end on the original video clock (seconds).
        #[arg(long)]
        end: Option<f64>,
    },
}

fn execute(cli: Cli) -> media::Result<()> {
    // CLI initialization precedes media jobs/threads; GUI uses per-edit fields.
    if let Some(ref backend) = cli.backend {
        std::env::set_var("CRISPAUDIO_MEDIA_BACKEND", backend);
    }

    match cli.command {
        Commands::TranscribeProject {
            input,
            output,
            executable,
            model,
            aligner,
            language,
        } => {
            let document =
                serde_json::from_slice(&std::fs::read(input).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            if std::path::Path::new(&output).exists() {
                return Err("Output already exists".into());
            }
            let transcript = media::asr::transcribe(
                &document,
                &media::asr::AsrOptions {
                    executable,
                    model,
                    aligner,
                    language,
                },
            )?;
            use std::io::Write;
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(output)
                .map_err(|e| e.to_string())?;
            file.write_all(
                serde_json::to_string_pretty(&transcript)
                    .unwrap()
                    .as_bytes(),
            )
            .map_err(|e| e.to_string())?;
        }
        Commands::SeparateAudio {
            input,
            model,
            output_dir,
            crispasr_lib,
        } => {
            let directory = std::path::Path::new(&output_dir);
            if !directory.is_dir() {
                return Err("Output folder must already exist".into());
            }
            let audio = media::crispasr::read_audio(&input)?;
            let stems = media::crispasr::separate(
                crispasr_lib.as_deref().map(std::path::Path::new),
                std::path::Path::new(&model),
                &audio,
            )?;
            let stem = std::path::Path::new(&input)
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "audio".into());
            let mut written = vec![];
            for item in &stems {
                let name: String = item
                    .name
                    .chars()
                    .map(|c| {
                        if c.is_ascii_alphanumeric() || c == '-' {
                            c
                        } else {
                            '_'
                        }
                    })
                    .collect();
                let path = directory.join(format!("{stem}_{name}.wav"));
                media::crispasr::write_audio(&path, &item.audio)?;
                written.push(serde_json::json!({"stem":item.name,"path":path}));
            }
            println!("{}", serde_json::json!({"stems":written}));
        }
        Commands::RegenerateSpeech {
            input,
            model,
            output,
            crispasr_lib,
        } => {
            let audio = media::crispasr::read_audio(&input)?;
            let speech = media::crispasr::regenerate_speech(
                crispasr_lib.as_deref().map(std::path::Path::new),
                std::path::Path::new(&model),
                &audio,
            )?;
            media::crispasr::write_audio(std::path::Path::new(&output), &speech)?;
            println!("{}", serde_json::json!({"output":output,"generative":true}));
        }
        Commands::SpeechRegions {
            input,
            model,
            output,
            min_pause,
            vad,
            crispasr_lib,
        } => {
            if !min_pause.is_finite() || min_pause <= 0.0 {
                return Err("--min-pause must be positive".into());
            }
            let options: media::crispasr::VadOptions = match vad {
                Some(json) => serde_json::from_str(&json).map_err(|e| e.to_string())?,
                None => Default::default(),
            };
            let audio = analysis_audio(&input)?;
            let regions = media::crispasr::speech_regions(
                crispasr_lib.as_deref().map(std::path::Path::new),
                std::path::Path::new(&model),
                &audio,
                &options,
            )?;
            let pauses = media::crispasr::pauses(&regions, min_pause);
            write_json(
                &output,
                &serde_json::json!({
                    "duration": audio.frames() as f64 / audio.rate as f64,
                    "regions": regions,
                    "pauses": pauses,
                }),
            )?;
        }
        Commands::DetectBeats {
            input,
            model,
            output,
            crispasr_lib,
        } => {
            let audio = analysis_audio(&input)?;
            let grid = media::crispasr::beats(
                crispasr_lib.as_deref().map(std::path::Path::new),
                std::path::Path::new(&model),
                &audio,
            )?;
            let mut value = serde_json::to_value(&grid).map_err(|e| e.to_string())?;
            value["duration"] = serde_json::json!(audio.frames() as f64 / audio.rate as f64);
            write_json(&output, &value)?;
        }
        Commands::RetimeMedia {
            input,
            output,
            settings,
        } => {
            let options: media::retime::Settings = serde_json::from_str(
                &std::fs::read_to_string(settings).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            media::retime::derive(&input, &output, &options)?;
        }
        Commands::CleanAudio {
            input,
            output,
            noise_floor,
        } => media::clean_audio(&input, &output, noise_floor)?,
        Commands::EditProject {
            input,
            recipe,
            output,
        } => {
            let load = |path: &str| -> media::Result<serde_json::Value> {
                serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())
            };
            let edited = media::project_edit::apply(&load(&input)?, &load(&recipe)?)?;
            use std::io::Write;
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(output)
                .map_err(|e| e.to_string())?;
            file.write_all(serde_json::to_string_pretty(&edited).unwrap().as_bytes())
                .map_err(|e| e.to_string())?;
        }
        Commands::RenderProject {
            input,
            output,
            video,
            wav_bit_depth,
            audio_bitrate_kbps,
            start,
            end,
        } => {
            let mut doc: serde_json::Value =
                serde_json::from_slice(&std::fs::read(input).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            if start.is_some() || end.is_some() {
                let a = start.unwrap_or(0.0);
                let b = end.unwrap_or(
                    doc["project"]["duration"]
                        .as_f64()
                        .ok_or("Missing project duration")?,
                );
                if !a.is_finite()
                    || !b.is_finite()
                    || a < 0.0
                    || b <= a
                    || b > doc["project"]["duration"]
                        .as_f64()
                        .ok_or("Missing project duration")?
                {
                    return Err("Invalid export range".into());
                }
                if video {
                    doc["project"]["video"]["inPoint"] = serde_json::json!(a);
                    doc["project"]["video"]["outPoint"] = serde_json::json!(b);
                } else {
                    doc["renderRange"] = serde_json::json!({"start":a,"end":b});
                }
            }
            if video {
                if let Some(backend) = cli.backend.as_ref() {
                    doc["project"]["video"]["backend"] = serde_json::json!(backend);
                }
                if let Some(format) = cli.video_format.as_ref() {
                    doc["project"]["video"]["outputFormat"] = serde_json::json!(format);
                }
            }
            if let Some(bitrate) = audio_bitrate_kbps {
                media::audio_encode::render_aac(&doc, &output, bitrate.parse().unwrap())?;
            } else if let Some(depth) = wav_bit_depth {
                if media::apple::Backend::configured()? == media::apple::Backend::Ffmpeg {
                    return Err(
                        "--wav-bit-depth requires the native mixer; select --backend apple or auto"
                            .into(),
                    );
                }
                media::audio_mix::render_pcm(&doc, &output, depth.parse().unwrap())?;
            } else {
                media::project_edit::render_project(&doc, &output, video)?;
            }
        }
        Commands::EditVideo {
            edit,
            output,
            mix,
            start,
            end,
            mix_is_trimmed,
        } => {
            let mut edit: media::video_edit::VideoEdit =
                serde_json::from_slice(&std::fs::read(edit).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            if cli.backend.is_some() {
                edit.backend = cli.backend.clone();
            }
            if cli.video_format.is_some() {
                edit.output_format = cli.video_format.clone();
            }
            let total = edit
                .clips
                .iter()
                .map(|c| c.start_time + c.duration)
                .fold(edit.duration.unwrap_or(0.0), f64::max);
            media::video_edit::export_edit(
                &edit,
                &output,
                mix.as_deref(),
                start,
                end.unwrap_or(total),
                mix_is_trimmed,
            )?;
            println!("{}", serde_json::json!({"output":output}));
        }
        Commands::Prepare {
            input,
            output,
            proxy,
            thumbnail,
        } => {
            if thumbnail {
                media::first_thumbnail(&input, &output)?;
            } else {
                media::prepare_asset(&input, &output, proxy)?;
            }
            println!("{}", serde_json::json!({"output":output}));
        }
        Commands::Loudness { input } => println!(
            "{}",
            serde_json::to_string_pretty(&media::loudness(&input)?).unwrap()
        ),
        Commands::Probe { input } => println!(
            "{}",
            serde_json::to_string_pretty(&media::probe(&input)?).unwrap()
        ),
        Commands::Levels { input } => println!(
            "{}",
            serde_json::to_string_pretty(&media::measure(&input)?).unwrap()
        ),
        Commands::Analyze {
            video,
            audio,
            output,
        } => {
            let session = media::analyze(&video, &audio)?;
            media::save_session(std::path::Path::new(&output), &session)?;
            println!("{}", serde_json::to_string_pretty(&session).unwrap());
        }
        Commands::Align {
            session,
            output_dir,
            allow_uncertain,
        } => {
            let result = media::align(
                &media::read_session(&session)?,
                &output_dir,
                allow_uncertain,
            )?;
            println!("{}", serde_json::to_string_pretty(&result).unwrap());
        }
        Commands::Export {
            session,
            output,
            mix,
            allow_uncertain,
            match_levels,
            start,
            end,
        } => {
            let session = media::read_session(&session)?;
            if start.is_some() || end.is_some() {
                media::export_segment(
                    &session,
                    &output,
                    mix.as_deref(),
                    start.unwrap_or(0.0)..end.unwrap_or(session.video.duration),
                    allow_uncertain,
                    match_levels,
                    false,
                )?;
            } else {
                media::export(
                    &session,
                    &output,
                    mix.as_deref(),
                    allow_uncertain,
                    match_levels,
                )?;
            }
            println!("{}", serde_json::json!({ "output": output }));
        }
    }
    Ok(())
}

fn main() {
    if let Err(error) = execute(Cli::parse()) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

/// A .crispaudio project is analysed through its native mix; other inputs are audio.
fn analysis_audio(input: &str) -> media::Result<media::crispasr::Audio> {
    if input.ends_with(".crispaudio") {
        let doc: serde_json::Value =
            serde_json::from_slice(&std::fs::read(input).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        media::crispasr::render_project_mix(&doc)
    } else {
        media::crispasr::read_audio(input)
    }
}

fn write_json(output: &str, value: &serde_json::Value) -> media::Result<()> {
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)
        .map_err(|e| e.to_string())?;
    file.write_all(serde_json::to_string_pretty(value).unwrap().as_bytes())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod cli_tests {
    use super::*;
    #[test]
    fn aac_bitrate_flags_validate_and_reject_other_export_modes() {
        for bitrate in ["96", "128", "192", "256", "320"] {
            assert!(Cli::try_parse_from([
                "crispaudio",
                "render-project",
                "--input",
                "p.crispaudio",
                "--output",
                "mix.aac",
                "--audio-bitrate-kbps",
                bitrate
            ])
            .is_ok());
        }
        assert!(Cli::try_parse_from([
            "crispaudio",
            "render-project",
            "--input",
            "p.crispaudio",
            "--output",
            "mix.aac",
            "--audio-bitrate-kbps",
            "12"
        ])
        .is_err());
        assert!(Cli::try_parse_from([
            "crispaudio",
            "render-project",
            "--input",
            "p.crispaudio",
            "--output",
            "mix.mp4",
            "--video",
            "--audio-bitrate-kbps",
            "192"
        ])
        .is_err());
        assert!(Cli::try_parse_from([
            "crispaudio",
            "render-project",
            "--input",
            "p.crispaudio",
            "--output",
            "mix.wav",
            "--wav-bit-depth",
            "24",
            "--audio-bitrate-kbps",
            "192"
        ])
        .is_err());
    }
    #[test]
    fn pcm_depth_flags_validate_and_conflict_with_video() {
        for depth in ["8", "16", "24", "32"] {
            assert!(Cli::try_parse_from([
                "crispaudio",
                "render-project",
                "--input",
                "p.crispaudio",
                "--output",
                "mix.wav",
                "--wav-bit-depth",
                depth
            ])
            .is_ok());
        }
        assert!(Cli::try_parse_from([
            "crispaudio",
            "render-project",
            "--input",
            "p.crispaudio",
            "--output",
            "mix.wav",
            "--wav-bit-depth",
            "12"
        ])
        .is_err());
        assert!(Cli::try_parse_from([
            "crispaudio",
            "render-project",
            "--input",
            "p.crispaudio",
            "--output",
            "mix.mp4",
            "--video",
            "--wav-bit-depth",
            "24"
        ])
        .is_err());
    }
    #[test]
    fn global_format_and_backend_flags_validate_before_work() {
        let cli = Cli::try_parse_from([
            "crispaudio",
            "probe",
            "sample.mov",
            "--backend",
            "apple",
            "--video-format",
            "vp9",
        ])
        .unwrap();
        assert_eq!(cli.backend.as_deref(), Some("apple"));
        assert_eq!(cli.video_format.as_deref(), Some("vp9"));
        assert!(
            Cli::try_parse_from(["crispaudio", "probe", "sample.mov", "--backend", "unknown"])
                .is_err()
        );
        assert!(Cli::try_parse_from([
            "crispaudio",
            "probe",
            "sample.mov",
            "--video-format",
            "unknown"
        ])
        .is_err());
    }
}
