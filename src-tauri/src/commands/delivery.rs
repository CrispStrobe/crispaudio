//! Desktop delivery publication and portable media collection. Never overwrite.
use serde_json::{json, Value};
use std::{
    collections::{BTreeSet, HashMap},
    fs::{self, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};
fn paths(value: &Value, result: &mut BTreeSet<String>) {
    match value {
        Value::Object(map) => {
            for (key, v) in map {
                if matches!(key.as_str(), "path" | "originalPath") {
                    if let Some(path) = v.as_str() {
                        if !path.is_empty() {
                            result.insert(path.into());
                        }
                    }
                } else {
                    paths(v, result);
                }
            }
        }
        Value::Array(items) => {
            for v in items {
                paths(v, result);
            }
        }
        _ => {}
    }
}
fn rewrite(value: &mut Value, replacements: &HashMap<String, String>) {
    match value {
        Value::Object(map) => {
            for (key, v) in map {
                if matches!(key.as_str(), "path" | "originalPath") {
                    if let Some(new) = v.as_str().and_then(|s| replacements.get(s)) {
                        *v = json!(new);
                    }
                } else {
                    rewrite(v, replacements);
                }
            }
        }
        Value::Array(items) => {
            for v in items {
                rewrite(v, replacements);
            }
        }
        _ => {}
    }
}
fn document(json: &str) -> Result<Value, String> {
    let doc: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    if doc["format"] != "crispaudio-project"
        || !doc["version"]
            .as_u64()
            .is_some_and(|version| (1..=4).contains(&version))
    {
        return Err("Unsupported project".into());
    }
    Ok(doc)
}
#[tauri::command]
pub fn review_project_media(json: String) -> Result<Value, String> {
    let doc = document(&json)?;
    let mut refs = BTreeSet::new();
    paths(&doc, &mut refs);
    Ok(
        json!({"files":refs.into_iter().map(|path|{let meta=fs::metadata(&path);json!({"path":path,"missing":!meta.as_ref().is_ok_and(|m|m.is_file()),"bytes":meta.map(|m|m.len()).unwrap_or(0)})}).collect::<Vec<_>>()}),
    )
}
#[tauri::command]
pub fn resolve_project_media(json: String, project_path: String) -> Result<String, String> {
    let mut doc = document(&json)?;
    let parent = Path::new(&project_path)
        .parent()
        .ok_or("No project directory")?;
    let mut refs = BTreeSet::new();
    paths(&doc, &mut refs);
    let mut replacements = HashMap::new();
    for path in refs {
        if !Path::new(&path).is_absolute() {
            replacements.insert(
                path.clone(),
                parent.join(path).to_string_lossy().into_owned(),
            );
        }
    }
    rewrite(&mut doc, &replacements);
    restore_project_media(serde_json::to_string(&doc).map_err(|e| e.to_string())?)
}
/// Bookmarked identities can recover moved sources after a Mac app relaunch.
fn restore_project_media(json: String) -> Result<String, String> {
    let doc = document(&json)?;
    restore_document(doc, |path| {
        #[cfg(target_os = "macos")]
        {
            crispaudio_media::security_scope::relocated_resource(path)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = path;
            Ok(None)
        }
    })
}
fn restore_document(
    mut doc: Value,
    mut locate: impl FnMut(&Path) -> Result<Option<PathBuf>, String>,
) -> Result<String, String> {
    let mut refs = BTreeSet::new();
    paths(&doc, &mut refs);
    let mut replacements = HashMap::new();
    for path in refs {
        if Path::new(&path).is_absolute() {
            if let Some(current) = locate(Path::new(&path))? {
                replacements.insert(path, current.to_string_lossy().into_owned());
            }
        }
    }
    rewrite(&mut doc, &replacements);
    serde_json::to_string(&doc).map_err(|e| e.to_string())
}
fn collect(json: &str, directory: &Path) -> Result<String, String> {
    let mut doc = document(json)?;
    let mut refs = BTreeSet::new();
    paths(&doc, &mut refs);
    // Full preflight happens before creating any destination.
    for path in &refs {
        if !fs::metadata(path)
            .map_err(|e| format!("Missing media {path}: {e}"))?
            .is_file()
        {
            return Err(format!("Media is not a file: {path}"));
        }
    }
    fs::create_dir(directory).map_err(|e| format!("Choose a new package folder: {e}"))?;
    let media = directory.join("media");
    let mut owned: Vec<PathBuf> = Vec::new();
    let result = (|| {
        fs::create_dir(&media).map_err(|e| e.to_string())?;
        let mut replacements = HashMap::new();
        let mut canonical: HashMap<PathBuf, String> = HashMap::new();
        let mut count = 0;
        for path in refs {
            if crispaudio_media::jobs::cancelled() {
                return Err("Collection cancelled".into());
            }
            let source = fs::canonicalize(&path).map_err(|e| e.to_string())?;
            let relative = if let Some(existing) = canonical.get(&source) {
                existing.clone()
            } else {
                count += 1;
                let extension = source
                    .extension()
                    .and_then(|s| s.to_str())
                    .filter(|s| s.len() < 12 && s.chars().all(|c| c.is_ascii_alphanumeric()))
                    .unwrap_or("bin");
                let relative = format!("media/asset-{count:04}.{extension}");
                let destination = directory.join(&relative);
                let mut input = fs::File::open(&source).map_err(|e| e.to_string())?;
                let before = input.metadata().map_err(|e| e.to_string())?;
                let mut output = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&destination)
                    .map_err(|e| e.to_string())?;
                owned.push(destination);
                let mut buffer = vec![0; 1024 * 1024];
                let mut bytes = 0;
                loop {
                    if crispaudio_media::jobs::cancelled() {
                        return Err("Collection cancelled".into());
                    }
                    let size = input.read(&mut buffer).map_err(|e| e.to_string())?;
                    if size == 0 {
                        break;
                    }
                    output
                        .write_all(&buffer[..size])
                        .map_err(|e| e.to_string())?;
                    bytes += size as u64;
                }
                output.sync_all().map_err(|e| e.to_string())?;
                let after = input.metadata().map_err(|e| e.to_string())?;
                if bytes != before.len()
                    || before.len() != after.len()
                    || before.modified().ok() != after.modified().ok()
                {
                    return Err("Source changed during collection".into());
                }
                canonical.insert(source, relative.clone());
                relative
            };
            replacements.insert(path, relative);
        }
        rewrite(&mut doc, &replacements);
        if crispaudio_media::jobs::cancelled() {
            return Err("Collection cancelled".into());
        }
        let project = directory.join("project.crispaudio.json");
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&project)
            .map_err(|e| e.to_string())?;
        owned.push(project.clone());
        file.write_all(
            serde_json::to_string_pretty(&doc)
                .map_err(|e| e.to_string())?
                .as_bytes(),
        )
        .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        Ok(project.to_string_lossy().into_owned())
    })();
    if result.is_err() {
        for path in owned {
            let _ = fs::remove_file(path);
        }
        let _ = fs::remove_dir(media);
        let _ = fs::remove_dir(directory);
    }
    result
}
#[tauri::command]
pub async fn collect_project_media(
    json: String,
    directory: String,
    job_id: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crispaudio_media::jobs::run(job_id, || collect(&json, Path::new(&directory)))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn publish_delivery_stage(staged: String, output: String) -> Result<(), String> {
    let staged = Path::new(&staged);
    let output = Path::new(&output);
    if staged.parent() != output.parent() {
        return Err("Delivery staging must share the output directory".into());
    }
    // FlushFileBuffers requires write access on Windows. Open the owned stage
    // without truncation; close the handle before publishing its hard link.
    OpenOptions::new()
        .write(true)
        .open(staged)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())?;
    fs::hard_link(staged, output).map_err(|e| e.to_string())
}
/// Add RIFF INFO to an unpublished WAV stage without buffering the audio data.
#[tauri::command]
pub fn annotate_delivery_wav(staged: String, metadata: Value) -> Result<(), String> {
    let mut info = b"INFO".to_vec();
    for (key, tag) in [
        ("title", b"INAM"),
        ("artist", b"IART"),
        ("comment", b"ICMT"),
    ] {
        if let Some(value) = metadata.get(key) {
            let text = value.as_str().ok_or("Invalid metadata")?;
            if text.len() > 4000 || text.contains('\0') {
                return Err("Invalid metadata".into());
            }
            if text.is_empty() {
                continue;
            }
            let bytes = text.as_bytes();
            info.extend(tag);
            info.extend(((bytes.len() + 1) as u32).to_le_bytes());
            info.extend(bytes);
            info.push(0);
            if (bytes.len() + 1) % 2 != 0 {
                info.push(0);
            }
        }
    }
    if info.len() == 4 {
        return Ok(());
    }
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(staged)
        .map_err(|e| e.to_string())?;
    let length = file.metadata().map_err(|e| e.to_string())?.len();
    let mut header = [0u8; 12];
    file.read_exact(&mut header).map_err(|e| e.to_string())?;
    if &header[0..4] != b"RIFF"
        || &header[8..12] != b"WAVE"
        || u32::from_le_bytes(header[4..8].try_into().unwrap()) as u64 + 8 != length
    {
        return Err("Invalid WAV stage".into());
    }
    let padding = length % 2;
    let final_size = length + padding + 8 + info.len() as u64 - 8;
    if final_size > u32::MAX as u64 {
        return Err("WAV metadata requires RIFF below 4 GiB".into());
    }
    file.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
    if padding != 0 {
        file.write_all(&[0]).map_err(|e| e.to_string())?;
    }
    file.write_all(b"LIST")
        .and_then(|_| file.write_all(&(info.len() as u32).to_le_bytes()))
        .and_then(|_| file.write_all(&info))
        .map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(4))
        .and_then(|_| file.write_all(&(final_size as u32).to_le_bytes()))
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wav_metadata_preserves_audio_and_publishes_without_overwrite() {
        let folder = root();
        let stage = folder.join("tagged.partial.wav");
        let output = folder.join("finished.wav");
        let mut writer = hound::WavWriter::create(
            &stage,
            hound::WavSpec {
                channels: 1,
                sample_rate: 48000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .unwrap();
        for sample in [0i16, 1000, -1000, 1234] {
            writer.write_sample(sample).unwrap();
        }
        writer.finalize().unwrap();
        annotate_delivery_wav(
            stage.to_string_lossy().into(),
            json!({"title":"Title","artist":"Artist","comment":"Comment"}),
        )
        .unwrap();
        let pcm = hound::WavReader::open(&stage)
            .unwrap()
            .samples::<i16>()
            .map(Result::unwrap)
            .collect::<Vec<_>>();
        assert_eq!(pcm, vec![0, 1000, -1000, 1234]);
        let bytes = fs::read(&stage).unwrap();
        assert!(bytes.windows(5).any(|s| s == b"Title"));
        assert_eq!(
            u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize + 8,
            bytes.len()
        );
        publish_delivery_stage(
            stage.to_string_lossy().into(),
            output.to_string_lossy().into(),
        )
        .unwrap();
        assert!(publish_delivery_stage(
            stage.to_string_lossy().into(),
            output.to_string_lossy().into()
        )
        .is_err());
        assert!(annotate_delivery_wav(
            stage.to_string_lossy().into(),
            json!({"title":"bad\0value"})
        )
        .is_err());
        fs::remove_dir_all(folder).unwrap();
    }
    #[test]
    fn wav_metadata_pads_odd_mono24_data() {
        let folder = root();
        let stage = folder.join("odd.wav");
        let mut bytes = vec![0u8; 47];
        bytes[..4].copy_from_slice(b"RIFF");
        bytes[4..8].copy_from_slice(&39u32.to_le_bytes());
        bytes[8..12].copy_from_slice(b"WAVE");
        bytes[12..16].copy_from_slice(b"fmt ");
        bytes[16..20].copy_from_slice(&16u32.to_le_bytes());
        bytes[20..22].copy_from_slice(&1u16.to_le_bytes());
        bytes[22..24].copy_from_slice(&1u16.to_le_bytes());
        bytes[24..28].copy_from_slice(&48000u32.to_le_bytes());
        bytes[28..32].copy_from_slice(&144000u32.to_le_bytes());
        bytes[32..34].copy_from_slice(&3u16.to_le_bytes());
        bytes[34..36].copy_from_slice(&24u16.to_le_bytes());
        bytes[36..40].copy_from_slice(b"data");
        bytes[40..44].copy_from_slice(&3u32.to_le_bytes());
        bytes[44..].copy_from_slice(&[0x33, 0x22, 0x11]);
        fs::write(&stage, bytes).unwrap();
        annotate_delivery_wav(stage.to_string_lossy().into(), json!({"title":"Odd"})).unwrap();
        let bytes = fs::read(&stage).unwrap();
        assert_eq!(bytes[47], 0);
        assert_eq!(&bytes[48..52], b"LIST");
        let pcm = hound::WavReader::open(&stage)
            .unwrap()
            .samples::<i32>()
            .map(Result::unwrap)
            .collect::<Vec<_>>();
        assert_eq!(pcm, vec![0x112233]);
        fs::remove_dir_all(folder).unwrap();
    }
    fn root() -> PathBuf {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let p = std::env::temp_dir().join(format!(
            "crispaudio-delivery-{}-{}",
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&p).unwrap();
        p
    }
    #[test]
    fn restored_locations_rewrite_all_media_references_without_touching_other_text() {
        let root = root();
        let old_audio = root.join("old.wav");
        let old_video = root.join("old.mov");
        let old_still = root.join("old.png");
        let audio = root.join("current/audio.wav");
        let video = root.join("current/video.mov");
        let still = root.join("current/still.png");
        let offline = root.join("offline.wav");
        let doc = json!({"format":"crispaudio-project","version":4,"sources":[{"path":old_audio,"name":old_audio}],"project":{"video":{"path":old_video,"graphics":[{"clips":[{"path":old_still}]}]},"tracks":[{"segments":[{"retime":{"original":{"path":old_audio}},"sourceEdit":{"originalPath":old_audio}}]}]},"relative":{"path":"media/relative.wav"},"offline":{"path":offline}});
        let restored = restore_document(doc, |path| {
            Ok(if path == old_audio {
                Some(audio.clone())
            } else if path == old_video {
                Some(video.clone())
            } else if path == old_still {
                Some(still.clone())
            } else {
                None
            })
        })
        .unwrap();
        let doc: Value = serde_json::from_str(&restored).unwrap();
        assert_eq!(doc["sources"][0]["path"], json!(audio));
        assert_eq!(doc["sources"][0]["name"], json!(old_audio));
        assert_eq!(doc["project"]["video"]["path"], json!(video));
        assert_eq!(
            doc["project"]["video"]["graphics"][0]["clips"][0]["path"],
            json!(still)
        );
        assert_eq!(
            doc["project"]["tracks"][0]["segments"][0]["retime"]["original"]["path"],
            json!(audio)
        );
        assert_eq!(
            doc["project"]["tracks"][0]["segments"][0]["sourceEdit"]["originalPath"],
            json!(audio)
        );
        assert_eq!(doc["relative"]["path"], "media/relative.wav");
        assert_eq!(doc["offline"]["path"], json!(offline));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn collection_is_relocatable_and_retains_originals_and_stills() {
        let root = root();
        let source = root.join("original.wav");
        fs::write(&source, b"unchanged media").unwrap();
        let json=json!({"format":"crispaudio-project","version":3,"sources":[{"path":source}],"project":{"video":{"path":source,"graphics":[{"clips":[{"path":source}]}]},"tracks":[{"segments":[{"retime":{"original":{"path":source}}}]}]}}).to_string();
        let destination = root.join("package");
        let file = collect(&json, &destination).unwrap();
        let saved = fs::read_to_string(&file).unwrap();
        assert!(!saved.contains(&source.to_string_lossy().to_string()));
        assert_eq!(fs::read_dir(destination.join("media")).unwrap().count(), 1);
        let relocated = root.join("moved");
        fs::rename(&destination, &relocated).unwrap();
        let resolved = resolve_project_media(
            saved,
            relocated
                .join("project.crispaudio.json")
                .to_string_lossy()
                .into_owned(),
        )
        .unwrap();
        let doc: Value = serde_json::from_str(&resolved).unwrap();
        assert_eq!(
            fs::read(doc["sources"][0]["path"].as_str().unwrap()).unwrap(),
            b"unchanged media"
        );
        assert!(collect(&json, &relocated).is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn current_and_legacy_project_paths_resolve_on_open() {
        for version in 1..=4 {
            let json=json!({"format":"crispaudio-project","version":version,"sources":[{"path":"media/source.wav"}]}).to_string();
            let root = root();
            let project = root.join("project.crispaudio.json");
            let resolved =
                resolve_project_media(json, project.to_string_lossy().into_owned()).unwrap();
            let doc: Value = serde_json::from_str(&resolved).unwrap();
            assert_eq!(
                doc["sources"][0]["path"],
                json!(root.join("media/source.wav").to_string_lossy())
            );
            fs::remove_dir_all(root).unwrap();
        }
    }
    #[test]
    fn missing_media_does_not_publish_a_package() {
        let root = root();
        let dest = root.join("package");
        let json=json!({"format":"crispaudio-project","version":3,"sources":[{"path":root.join("missing.wav")}]}).to_string();
        assert!(collect(&json, &dest).is_err());
        assert!(!dest.exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn delivery_publication_does_not_overwrite() {
        let root = root();
        let staged = root.join("stage");
        let output = root.join("mix.wav");
        fs::write(&staged, b"new").unwrap();
        publish_delivery_stage(
            staged.to_string_lossy().into(),
            output.to_string_lossy().into(),
        )
        .unwrap();
        fs::write(root.join("second"), b"other").unwrap();
        assert!(publish_delivery_stage(
            root.join("second").to_string_lossy().into(),
            output.to_string_lossy().into()
        )
        .is_err());
        assert_eq!(fs::read(output).unwrap(), b"new");
        fs::remove_dir_all(root).unwrap();
    }
}
