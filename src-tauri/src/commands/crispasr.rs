//! GUI bridge to the in-process CrispASR audio tasks. PCM travels as raw IPC
//! bytes (planar little-endian f32), never base64/JSON. Jobs are cancellable
//! through cancel_media_job between model chunks.
use crispaudio_media::{self as media, crispasr::Audio};
use serde::Deserialize;
use tauri::ipc::{InvokeBody, Request, Response};

/// 20 minutes of 48 kHz stereo f32 is ~461 MB; bound the request body.
const MAX_BODY: usize = 512 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Header {
    task: String,
    library: Option<String>,
    model: String,
    rate: u32,
    channels: usize,
    job_id: Option<String>,
    #[serde(default)]
    vad: media::crispasr::VadOptions,
}

fn header(request: &Request<'_>) -> Result<Header, String> {
    let raw = request
        .headers()
        .get("x-crispasr")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing CrispASR request header")?;
    serde_json::from_str(raw).map_err(|e| e.to_string())
}

fn audio(request: &Request<'_>, header: &Header) -> Result<Audio, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw PCM".into());
    };
    if bytes.len() > MAX_BODY || bytes.len() % 4 != 0 || header.channels == 0 || header.channels > 2
    {
        return Err("Invalid CrispASR PCM request".into());
    }
    let samples = bytes.len() / 4;
    if samples % header.channels != 0 {
        return Err("PCM length does not match its channel count".into());
    }
    let frames = samples / header.channels;
    let values: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect();
    Ok(Audio {
        rate: header.rate,
        channels: values.chunks_exact(frames).map(<[f32]>::to_vec).collect(),
    })
}

fn path(value: &Option<String>) -> Option<&std::path::Path> {
    value
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(std::path::Path::new)
}

#[tauri::command]
pub async fn crispasr_status(
    library: Option<String>,
) -> Result<media::crispasr::LibraryStatus, String> {
    tauri::async_runtime::spawn_blocking(move || media::crispasr::library_status(path(&library)))
        .await
        .map_err(|e| e.to_string())
}

/// Audio-producing tasks. Response: u32 stem count, then per stem
/// u32 name length, UTF-8 name, u32 channels, u32 frames, planar f32 PCM.
#[tauri::command]
pub async fn crispasr_process(request: Request<'_>) -> Result<Response, String> {
    let header = header(&request)?;
    let input = audio(&request, &header)?;
    tauri::async_runtime::spawn_blocking(move || {
        media::jobs::run(header.job_id.clone(), || {
            let library = path(&header.library);
            let model = std::path::Path::new(&header.model);
            let stems: Vec<(String, Audio)> = match header.task.as_str() {
                "separate" => media::crispasr::separate(library, model, &input)?
                    .into_iter()
                    .map(|s| (s.name, s.audio))
                    .collect(),
                "speech" => vec![(
                    "speech".into(),
                    media::crispasr::regenerate_speech(library, model, &input)?,
                )],
                _ => return Err("Unknown CrispASR audio task".into()),
            };
            let mut out = Vec::new();
            out.extend((stems.len() as u32).to_le_bytes());
            for (name, audio) in stems {
                out.extend((name.len() as u32).to_le_bytes());
                out.extend(name.as_bytes());
                out.extend((audio.channels.len() as u32).to_le_bytes());
                out.extend((audio.frames() as u32).to_le_bytes());
                for channel in &audio.channels {
                    for value in channel {
                        out.extend(value.to_le_bytes());
                    }
                }
            }
            Ok(Response::new(out))
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Analysis tasks returning JSON: speech regions/pauses or a beat grid.
#[tauri::command]
pub async fn crispasr_analyze(request: Request<'_>) -> Result<serde_json::Value, String> {
    let header = header(&request)?;
    let input = audio(&request, &header)?;
    tauri::async_runtime::spawn_blocking(move || {
        media::jobs::run(header.job_id.clone(), || {
            let library = path(&header.library);
            let model = std::path::Path::new(&header.model);
            match header.task.as_str() {
                "regions" => {
                    let regions =
                        media::crispasr::speech_regions(library, model, &input, &header.vad)?;
                    Ok(serde_json::json!({"regions":regions}))
                }
                "beats" => serde_json::to_value(media::crispasr::beats(library, model, &input)?)
                    .map_err(|e| e.to_string()),
                _ => Err("Unknown CrispASR analysis task".into()),
            }
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
