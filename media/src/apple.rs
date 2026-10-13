//! Apple system-framework backend. No redistributed FFmpeg/codec library.
use crate::{video_edit::VideoEdit, Result};
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Backend {
    Auto,
    Apple,
    Ffmpeg,
}
impl Backend {
    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "auto" => Ok(Self::Auto),
            "apple" => Ok(Self::Apple),
            "ffmpeg" => Ok(Self::Ffmpeg),
            _ => Err("Backend must be auto, apple or ffmpeg".into()),
        }
    }
    pub fn configured() -> Result<Self> {
        Self::parse(&std::env::var("CRISPAUDIO_MEDIA_BACKEND").unwrap_or_else(|_| "auto".into()))
    }
}
#[cfg(target_os = "macos")]
fn invoke(args: &[String], edit: Option<&VideoEdit>) -> Result<Vec<u8>> {
    use std::{io::Write, os::unix::fs::PermissionsExt, process::Command};
    let directory = tempfile::tempdir().map_err(|e| e.to_string())?;
    let helper = directory.path().join("media-helper");
    let vst = args.first().is_some_and(|op| op.starts_with("vst3-"));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&helper)
        .map_err(|e| e.to_string())?;
    file.write_all(if vst {
        include_bytes!(concat!(env!("OUT_DIR"), "/crispaudio-vst3-host"))
    } else {
        include_bytes!(concat!(env!("OUT_DIR"), "/crispaudio-apple-media"))
    })
    .map_err(|e| e.to_string())?;
    file.set_permissions(std::fs::Permissions::from_mode(0o700))
        .map_err(|e| e.to_string())?;
    drop(file);
    let mut args = args.to_vec();
    if vst {
        args[0] = args[0].trim_start_matches("vst3-").to_string();
    }
    if let Some(edit) = edit {
        let path = directory.path().join("edit.json");
        std::fs::write(&path, serde_json::to_vec(edit).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        args[1] = path.to_string_lossy().into_owned();
    }
    let result = crate::run_command(Command::new(helper).args(args))?;
    if !result.status.success() {
        return Err(format!(
            "Apple media backend: {}",
            String::from_utf8_lossy(&result.stderr)
        ));
    }
    Ok(result.stdout)
}
#[cfg(not(target_os = "macos"))]
fn invoke(_: &[String], _: Option<&VideoEdit>) -> Result<Vec<u8>> {
    Err("Apple media backend requires macOS 13 or later".into())
}
pub fn attempt(
    backend: Backend,
    args: &[String],
    edit: Option<&VideoEdit>,
) -> Result<Option<Vec<u8>>> {
    if backend == Backend::Ffmpeg || (backend == Backend::Auto && !cfg!(target_os = "macos")) {
        return Ok(None);
    }
    match invoke(args, edit) {
        Ok(result) => Ok(Some(result)),
        Err(error) if backend == Backend::Auto && !crate::jobs::cancelled() => {
            eprintln!("{error}; using optional FFmpeg compatibility backend");
            Ok(None)
        }
        Err(error) => Err(error),
    }
}
pub fn prepare(operation: &str, path: &str, output: &str) -> Result<bool> {
    let backend = Backend::configured()?;
    if backend == Backend::Ffmpeg || (backend == Backend::Auto && !cfg!(target_os = "macos")) {
        return Ok(false);
    }
    if std::path::Path::new(output).exists() {
        return Err("Output already exists".into());
    }
    let parent = std::path::Path::new(output)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(std::path::Path::new("."));
    let directory = tempfile::tempdir_in(parent).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(output)
        .extension()
        .unwrap_or_default()
        .to_string_lossy();
    let staging = directory.path().join(format!("prepared.{ext}"));
    if attempt(
        backend,
        &[
            operation.into(),
            path.into(),
            staging.to_string_lossy().into_owned(),
        ],
        None,
    )?
    .is_none()
    {
        return Ok(false);
    }
    std::fs::hard_link(staging, output)
        .map_err(|e| format!("Cannot publish prepared Apple media: {e}"))?;
    Ok(true)
}
pub fn export(
    edit: &VideoEdit,
    output: &str,
    mix: Option<&str>,
    start: f64,
    end: f64,
    trimmed: bool,
    backend: Backend,
) -> Result<bool> {
    if backend == Backend::Ffmpeg {
        return Ok(false);
    }
    let parent = std::path::Path::new(output)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(std::path::Path::new("."));
    let directory = tempfile::tempdir_in(parent).map_err(|e| e.to_string())?;
    let ext = if output.to_lowercase().ends_with(".mov") {
        "mov"
    } else {
        "mp4"
    };
    let staging = directory.path().join(format!("export.{ext}"));
    let args = vec![
        "edit".into(),
        String::new(),
        staging.to_string_lossy().into_owned(),
        start.to_string(),
        end.to_string(),
        mix.unwrap_or("").into(),
        trimmed.to_string(),
    ];
    if attempt(backend, &args, Some(edit))?.is_none() {
        return Ok(false);
    }
    std::fs::hard_link(staging, output).map_err(|e| format!("Cannot publish Apple video: {e}"))?;
    Ok(true)
}

/// Audio Unit processing is isolated in the cancellable native helper process.
pub fn plugin(operation: &str, request: &str) -> Result<serde_json::Value> {
    if !["plugin-scan", "plugin-info", "plugin-render"].contains(&operation) {
        return Err("Invalid plugin operation".into());
    }
    let directory = tempfile::tempdir().map_err(|e| e.to_string())?;
    let path = directory.path().join("plugin.json");
    std::fs::write(&path, request).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(request).map_err(|e| e.to_string())?;
    if operation == "plugin-scan" {
        let mut result: serde_json::Value = serde_json::from_slice(&invoke(
            &[operation.into(), path.to_string_lossy().into_owned()],
            None,
        )?)
        .map_err(|e| e.to_string())?;
        let vst: serde_json::Value = serde_json::from_slice(&invoke(
            &[
                "vst3-plugin-scan".into(),
                path.to_string_lossy().into_owned(),
            ],
            None,
        )?)
        .map_err(|e| e.to_string())?;
        result
            .as_array_mut()
            .ok_or("Invalid AU scan")?
            .extend(vst.as_array().ok_or("Invalid VST3 scan")?.iter().cloned());
        return Ok(result);
    }
    let operation = if value["id"]
        .as_str()
        .is_some_and(|id| id.starts_with("vst3:"))
    {
        format!("vst3-{operation}")
    } else {
        operation.into()
    };
    let bytes = invoke(&[operation, path.to_string_lossy().into_owned()], None)?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}
#[cfg(all(test, target_os = "macos"))]
mod plugin_tests {
    use super::*;
    #[test]
    fn installed_audio_unit_parameters_and_document_state_roundtrip() {
        let effects = plugin("plugin-scan", "{}").unwrap();
        let effect = effects
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["name"] == "AUBandpass")
            .unwrap();
        let info = plugin(
            "plugin-info",
            &serde_json::json!({"id":effect["id"],"parameters":{"0":440.0}}).to_string(),
        )
        .unwrap();
        let restored = plugin(
            "plugin-info",
            &serde_json::json!({"id":effect["id"],"state":info["state"]}).to_string(),
        )
        .unwrap();
        let frequency = restored["parameters"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["address"] == "0")
            .unwrap();
        assert_eq!(frequency["value"], 440.0);
        assert!(!info["state"].as_str().unwrap().is_empty());
    }
    #[test]
    fn vst3_source_fixture_renders_and_restores_state_when_supplied() {
        let Ok(folder) = std::env::var("CRISPAUDIO_TEST_PLUGIN_FOLDER") else {
            return;
        };
        let effects = plugin(
            "plugin-scan",
            &serde_json::json!({"folders":[folder]}).to_string(),
        )
        .unwrap();
        let effect = effects
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["name"] == "ADelay")
            .unwrap();
        let directory = tempfile::tempdir().unwrap();
        let input = directory.path().join("input.wav");
        let output = directory.path().join("output.wav");
        let mut writer = hound::WavWriter::create(
            &input,
            hound::WavSpec {
                channels: 1,
                sample_rate: 48000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .unwrap();
        for i in 0..4800 {
            writer
                .write_sample(if i == 1000 { 16384i16 } else { 0 })
                .unwrap();
        }
        writer.finalize().unwrap();
        let rendered=plugin("plugin-render",&serde_json::json!({"id":effect["id"],"path":input,"output":output,"offset":0.0,"duration":0.1,"parameters":{"100":0.002,"101":0.0}}).to_string()).unwrap();
        let pcm = hound::WavReader::open(&output)
            .unwrap()
            .samples::<f32>()
            .map(|sample| sample.unwrap())
            .collect::<Vec<_>>();
        assert_eq!(pcm.len(), 4800);
        let peak = pcm
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.abs().partial_cmp(&b.abs()).unwrap())
            .unwrap()
            .0;
        assert_eq!(peak, 1096);
        let restored = plugin(
            "plugin-info",
            &serde_json::json!({"id":effect["id"],"state":rendered["state"]}).to_string(),
        )
        .unwrap();
        let delay = restored["parameters"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["address"] == "100")
            .unwrap()["value"]
            .as_f64()
            .unwrap();
        assert!((delay - 0.002).abs() < 1e-6);
    }
}
