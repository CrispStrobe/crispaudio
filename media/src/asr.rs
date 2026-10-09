//! Desktop CrispASR adapter. Runs a user-installed permissively licensed engine;
//! model files stay external. No shell invocation and no estimated word timings.
use crate::{audio_mix, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{path::Path, process::Command};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AsrOptions {
    pub executable: String,
    pub model: String,
    pub aligner: String,
    pub language: String,
}
pub fn transcribe(document: &Value, options: &AsrOptions) -> Result<Value> {
    if cfg!(any(target_os = "ios", target_os = "android")) {
        return Err("CrispASR desktop integration is unavailable on mobile".into());
    }
    if !Path::new(&options.executable).is_file() || !Path::new(&options.model).is_file() {
        return Err("Choose the CrispASR executable and a local ASR model".into());
    }
    if options.aligner != "auto"
        && !options.aligner.starts_with("wav2vec2-aligner-")
        && !Path::new(&options.aligner).is_file()
    {
        return Err("Choose a local forced aligner, or auto".into());
    }
    if options.language.is_empty()
        || !options
            .language
            .chars()
            .all(|c| c.is_ascii_alphabetic() || c == '-')
    {
        return Err("Invalid language code".into());
    }
    let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let wav = dir.path().join("speech.wav");
    audio_mix::render_pcm(document, wav.to_str().ok_or("Invalid temporary path")?, 16)?;
    let output = dir.path().join("transcript");
    let aligner = if options.aligner == "auto" && options.language == "de" {
        "wav2vec2-aligner-de"
    } else {
        &options.aligner
    };
    let result = crate::run_command(Command::new(&options.executable).args([
        "-m",
        &options.model,
        "-f",
        wav.to_str().unwrap(),
        "-l",
        &options.language,
        "-am",
        aligner,
        "--auto-download",
        "--force-aligner",
        "--strict-pipeline",
        "--require-word-timestamps",
        "--chunk-seconds",
        "15",
        "-t",
        "4",
        "-ojf",
        "-of",
        output.to_str().unwrap(),
    ]))?;
    if !result.status.success() {
        return Err(format!(
            "CrispASR failed: {}",
            String::from_utf8_lossy(&result.stderr)
                .chars()
                .rev()
                .take(4000)
                .collect::<String>()
                .chars()
                .rev()
                .collect::<String>()
        ));
    }
    let json = output.with_extension("json");
    if std::fs::metadata(&json).map_err(|e| e.to_string())?.len() > 32 * 1024 * 1024 {
        return Err("Transcript exceeds 32 MiB".into());
    }
    let bytes =
        std::fs::read(json).map_err(|e| format!("CrispASR produced no word-timed JSON: {e}"))?;
    if bytes.len() > 32 * 1024 * 1024 {
        return Err("Transcript exceeds 32 MiB".into());
    }
    let mut result: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let segments = result
        .get("transcription")
        .and_then(Value::as_array)
        .ok_or("CrispASR returned invalid transcript JSON")?;
    if segments.is_empty() {
        return Err("CrispASR found no speech".into());
    }
    for segment in segments {
        if segment["text"]
            .as_str()
            .is_some_and(|t| !t.trim().is_empty())
            && !segment["words"].as_array().is_some_and(|w| !w.is_empty())
        {
            return Err("CrispASR returned text without aligned words".into());
        }
    }
    // Render ranges produce a local clock; restore the arrangement clock.
    let offset = document["renderRange"]["start"].as_f64().unwrap_or(0.0);
    result["crispaudioOffset"] = Value::from((offset * 48000.0).round() / 48000.0);
    Ok(result)
}
