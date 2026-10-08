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
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&helper)
        .map_err(|e| e.to_string())?;
    file.write_all(include_bytes!(concat!(
        env!("OUT_DIR"),
        "/crispaudio-apple-media"
    )))
    .map_err(|e| e.to_string())?;
    file.set_permissions(std::fs::Permissions::from_mode(0o700))
        .map_err(|e| e.to_string())?;
    drop(file);
    let mut args = args.to_vec();
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
