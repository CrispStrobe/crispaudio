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
    /// Inspect duration, channels, sample rate and video presence (JSON).
    Probe { input: String },
    /// Measure sample peak, RMS, activity proxy and a conservative gain suggestion (JSON).
    Levels { input: String },
    /// Find external recordings on the camera clock; writes a reviewable JSON session.
    Analyze {
        #[arg(long)]
        video: String,
        #[arg(long, required = true)]
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
    /// Export aligned tracks (or an edited mix) onto the original picture, without video encoding.
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
    },
}

fn execute(cli: Cli) -> media::Result<()> {
    match cli.command {
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
        } => {
            media::export(
                &media::read_session(&session)?,
                &output,
                mix.as_deref(),
                allow_uncertain,
                match_levels,
            )?;
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
