//! Desktop delivery publication and portable media collection. Never overwrite.
use serde_json::{json, Value};
use std::{
    collections::{BTreeSet, HashMap},
    fs::{self, OpenOptions},
    io::{Read, Write},
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
            .is_some_and(|version| (1..=3).contains(&version))
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
    fs::File::open(staged)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())?;
    fs::hard_link(staged, output).map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
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
    fn legacy_project_paths_still_resolve_on_open() {
        for version in 1..=3 {
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
