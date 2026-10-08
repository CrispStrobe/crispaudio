use clap::{Parser, Subcommand};
use crispaudio_media as media;

#[derive(Parser)]
#[command(
    name = "crispaudio",
    about = "CrispAudio interview synchronization and video export"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
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
    /// Render linked project audio to WAV (unsupported effects fail explicitly).
    RenderProject {
        #[arg(long)]
        input: String,
        #[arg(long)]
        output: String,
        #[arg(long)]
        video: bool,
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
    /// Prepare a lightweight silent video proxy or extracted 48 kHz stereo WAV.
    Prepare {
        #[arg(long)]
        input: String,
        #[arg(long)]
        output: String,
        #[arg(long)]
        proxy: bool,
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
    match cli.command {
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
        } => {
            let doc: serde_json::Value =
                serde_json::from_slice(&std::fs::read(input).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            media::project_edit::render_project(&doc, &output, video)?;
        }
        Commands::EditVideo {
            edit,
            output,
            mix,
            start,
            end,
            mix_is_trimmed,
        } => {
            let edit: media::video_edit::VideoEdit =
                serde_json::from_slice(&std::fs::read(edit).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            let total = edit
                .clips
                .iter()
                .map(|c| c.start_time + c.duration)
                .fold(0.0, f64::max);
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
        } => {
            media::prepare_asset(&input, &output, proxy)?;
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
