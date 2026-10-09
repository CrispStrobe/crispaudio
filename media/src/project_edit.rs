//! CLI project recipes. Preserve unknown metadata and never rewrite input media.
use crate::{run, strings, Result};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
fn number(v: &Value, key: &str) -> Result<f64> {
    v[key]
        .as_f64()
        .filter(|v| v.is_finite())
        .ok_or_else(|| format!("Missing finite {key}"))
}
fn id() -> String {
    use std::sync::atomic::{AtomicUsize, Ordering};
    static COUNT: AtomicUsize = AtomicUsize::new(0);
    format!(
        "cli-{}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        COUNT.fetch_add(1, Ordering::Relaxed)
    )
}
fn clips(project: &Value) -> Vec<Value> {
    let mut list: Vec<Value> = project["tracks"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|t| t["segments"].as_array().into_iter().flatten().cloned())
        .collect();
    if let Some(video) = project.get("video").filter(|v| !v.is_null()) {
        if let Some(clips) = video["clips"].as_array() {
            list.extend(clips.clone());
        } else {
            list.push(json!({"id":"source-video","startTime":0,"duration":video["duration"],"sourceOffset":0,"fadeIn":0,"fadeOut":0,"transition":"cut","transitionDuration":0}));
        }
    }
    list
}
fn mutate(project: &mut Value, mut edit: impl FnMut(&Value) -> Result<Vec<Value>>) -> Result<()> {
    if let Some(tracks) = project["tracks"].as_array_mut() {
        for track in tracks {
            let segments = track["segments"].as_array().ok_or("Missing segments")?;
            let mut out = Vec::new();
            for c in segments {
                out.extend(edit(c)?);
            }
            track["segments"] = json!(out);
        }
    }
    if project.get("video").is_some_and(|v| !v.is_null()) {
        let picture: Vec<Value> = clips(project)
            .into_iter()
            .filter(|c| c.get("trackId").is_none())
            .collect();
        let mut out = Vec::new();
        for c in picture {
            out.extend(edit(&c)?);
        }
        project["video"]["clips"] = json!(out);
        project["video"].as_object_mut().unwrap().remove("inPoint");
        project["video"].as_object_mut().unwrap().remove("outPoint");
    }
    Ok(())
}
fn bounds(doc: &Value, clip: &Value) -> Result<f64> {
    if clip.get("trackId").is_some() {
        doc["sources"]
            .as_array()
            .ok_or("Missing audio sources")?
            .iter()
            .find(|s| s["id"] == clip["sourceId"])
            .ok_or_else(|| "Missing audio source".to_string())
            .and_then(|s| number(s, "duration"))
    } else if let Some(source) = clip["sourceId"].as_str() {
        doc["project"]["video"]["sources"]
            .as_array()
            .ok_or("Missing video sources")?
            .iter()
            .find(|s| s["id"] == source)
            .ok_or_else(|| "Missing video source".to_string())
            .and_then(|s| number(s, "duration"))
    } else {
        number(&doc["project"]["video"], "duration")
    }
}
fn trim_fades(c: &mut Value) {
    let duration = c["duration"].as_f64().unwrap();
    for key in ["fadeInDuration", "fadeOutDuration", "fadeIn", "fadeOut"] {
        if let Some(value) = c[key].as_f64() {
            c[key] = json!(value.min(duration / 2.0));
        }
    }
}
pub fn apply(doc: &Value, recipe: &Value) -> Result<Value> {
    if doc["format"] != "crispaudio-project" || !doc["project"]["tracks"].is_array() {
        return Err("Expected CrispAudio project".into());
    }
    let operations = recipe
        .as_array()
        .ok_or("Recipe must be an array of operations")?;
    let mut out = doc.clone();
    out["version"] = json!(3);
    for op in operations {
        let all = clips(&out["project"]);
        let requested: HashSet<&str> = op["ids"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .collect();
        let groups: HashSet<&str> = all
            .iter()
            .filter(|c| requested.contains(c["id"].as_str().unwrap_or("")))
            .filter_map(|c| c["linkGroup"].as_str())
            .collect();
        let selected: HashSet<String> = all
            .iter()
            .filter(|c| {
                requested.contains(c["id"].as_str().unwrap_or(""))
                    || c["linkGroup"].as_str().is_some_and(|g| groups.contains(g))
            })
            .filter_map(|c| c["id"].as_str().map(str::to_owned))
            .collect();
        let chosen: Vec<&Value> = all
            .iter()
            .filter(|c| selected.contains(c["id"].as_str().unwrap_or("")))
            .collect();
        let operation = op["op"].as_str().ok_or("Missing operation")?;
        match operation {
            "color" | "orientation" => {
                let settings = op
                    .get("settings")
                    .ok_or("Missing colour settings; use null to reset")?;
                if !settings.is_null() {
                    let valid = if operation == "color" {
                        serde_json::from_value::<crate::video_edit::VideoColor>(settings.clone())
                            .map_err(|e| e.to_string())?
                            .valid()
                    } else {
                        serde_json::from_value::<crate::video_edit::VideoTransform>(
                            settings.clone(),
                        )
                        .map_err(|e| e.to_string())?
                        .valid()
                    };
                    if !valid {
                        return Err("Invalid picture settings".into());
                    }
                }
                let mut pictures: Vec<Value> = all
                    .iter()
                    .filter(|c| c.get("trackId").is_none())
                    .cloned()
                    .collect();
                if !pictures
                    .iter()
                    .any(|c| requested.contains(c["id"].as_str().unwrap_or("")))
                {
                    return Err("No selected picture clips".into());
                }
                let field = if operation == "color" {
                    "colorCorrection"
                } else {
                    "transform"
                };
                for picture in &mut pictures {
                    if requested.contains(picture["id"].as_str().unwrap_or("")) {
                        if settings.is_null() {
                            picture.as_object_mut().unwrap().remove(field);
                        } else {
                            picture[field] = settings.clone();
                        }
                    }
                }
                out["project"]["video"]["clips"] = json!(pictures);
            }
            "move" | "slip" | "trim" => {
                if chosen.is_empty() {
                    return Err("No selected clips".into());
                }
                let side = op["side"].as_str().unwrap_or("right");
                if operation == "trim" && !matches!(side, "left" | "right") {
                    return Err("Invalid trim side".into());
                }
                let mut lower = f64::NEG_INFINITY;
                let mut upper = f64::INFINITY;
                for c in &chosen {
                    let start = number(c, "startTime")?;
                    let offset = number(c, "sourceOffset")?;
                    let duration = number(c, "duration")?;
                    if operation == "move" {
                        lower = lower.max(-start);
                    } else if operation == "slip" {
                        lower = lower.max(-offset);
                        upper = upper.min(bounds(&out, c)? - offset - duration);
                    } else if side == "left" {
                        lower = lower.max(-offset).max(-start);
                        upper = upper.min(duration - 0.01);
                    } else {
                        lower = lower.max(0.01 - duration);
                        upper = upper.min(bounds(&out, c)? - offset - duration);
                    }
                }
                let delta = number(op, "seconds")?.max(lower).min(upper);
                mutate(&mut out["project"], |c| {
                    let mut c = c.clone();
                    if selected.contains(c["id"].as_str().unwrap_or("")) {
                        if operation == "move" {
                            c["startTime"] = json!(number(&c, "startTime")? + delta);
                        } else if operation == "slip" {
                            c["sourceOffset"] = json!(number(&c, "sourceOffset")? + delta);
                        } else {
                            if side == "left" {
                                c["startTime"] = json!(number(&c, "startTime")? + delta);
                                c["sourceOffset"] = json!(number(&c, "sourceOffset")? + delta);
                            }
                            c["duration"] = json!(
                                number(&c, "duration")?
                                    + if side == "left" { -delta } else { delta }
                            );
                            trim_fades(&mut c);
                        }
                    }
                    Ok(vec![c])
                })?;
            }
            "link" | "unlink" => {
                let group = id();
                mutate(&mut out["project"], |c| {
                    let mut c = c.clone();
                    if (operation == "unlink" && selected.contains(c["id"].as_str().unwrap_or("")))
                        || (operation == "link"
                            && requested.contains(c["id"].as_str().unwrap_or("")))
                    {
                        if operation == "unlink" {
                            c.as_object_mut().unwrap().remove("linkGroup");
                        } else {
                            c["linkGroup"] = json!(group);
                        }
                    }
                    Ok(vec![c])
                })?;
            }
            "split" => {
                let time = number(op, "at")?;
                let mut right_groups = HashMap::new();
                mutate(&mut out["project"], |c| {
                    let start = number(c, "startTime")?;
                    let duration = number(c, "duration")?;
                    if !selected.contains(c["id"].as_str().unwrap_or(""))
                        || time <= start
                        || time >= start + duration
                    {
                        return Ok(vec![c.clone()]);
                    }
                    let mut left = c.clone();
                    let mut right = c.clone();
                    left["duration"] = json!(time - start);
                    right["id"] = json!(id());
                    right["startTime"] = json!(time);
                    right["duration"] = json!(start + duration - time);
                    right["sourceOffset"] = json!(number(c, "sourceOffset")? + time - start);
                    if let Some(group) = c["linkGroup"].as_str() {
                        right["linkGroup"] =
                            json!(right_groups.entry(group.to_owned()).or_insert_with(id));
                    }
                    let audio = c.get("trackId").is_some();
                    left[if audio { "fadeOutDuration" } else { "fadeOut" }] = json!(0);
                    right[if audio { "fadeInDuration" } else { "fadeIn" }] = json!(0);
                    if !audio {
                        right["transition"] = json!("cut");
                        right["transitionDuration"] = json!(0);
                    }
                    trim_fades(&mut left);
                    trim_fades(&mut right);
                    Ok(vec![left, right])
                })?;
            }
            "ripple" => {
                let start = number(op, "start")?;
                let end = number(op, "end")?;
                if start < 0.0 || end <= start {
                    return Err("Invalid ripple range".into());
                }
                if all
                    .iter()
                    .any(|c| c.get("trackId").is_none() && c["transition"] != "cut")
                {
                    return Err("Remove video transitions before ripple editing".into());
                }
                let gap = end - start;
                mutate(&mut out["project"], |c| {
                    let a = number(c, "startTime")?;
                    let b = a + number(c, "duration")?;
                    if b <= start {
                        return Ok(vec![c.clone()]);
                    }
                    if a >= end {
                        let mut c = c.clone();
                        c["startTime"] = json!(a - gap);
                        return Ok(vec![c]);
                    }
                    let mut pieces = Vec::new();
                    if a < start {
                        let mut left = c.clone();
                        left["duration"] = json!(start - a);
                        left[if c.get("trackId").is_some() {
                            "fadeOutDuration"
                        } else {
                            "fadeOut"
                        }] = json!(0);
                        trim_fades(&mut left);
                        pieces.push(left);
                    }
                    if b > end {
                        let mut right = c.clone();
                        right["id"] = json!(id());
                        right["startTime"] = json!(start);
                        right["sourceOffset"] = json!(number(c, "sourceOffset")? + end - a);
                        right["duration"] = json!(b - end);
                        right[if c.get("trackId").is_some() {
                            "fadeInDuration"
                        } else {
                            "fadeIn"
                        }] = json!(0);
                        trim_fades(&mut right);
                        pieces.push(right);
                    }
                    Ok(pieces)
                })?;
                for key in ["markers", "transcript"] {
                    if let Some(items) = out["project"][key].as_array_mut() {
                        items.retain(|v| {
                            let a = v[if key == "markers" { "time" } else { "start" }]
                                .as_f64()
                                .unwrap_or(0.0);
                            let b = v["end"].as_f64().unwrap_or(a);
                            a >= end || b <= start
                        });
                        for item in items {
                            for time in if key == "markers" {
                                vec!["time"]
                            } else {
                                vec!["start", "end"]
                            } {
                                let value = number(item, time)?;
                                if value >= end {
                                    item[time] = json!(value - gap);
                                }
                            }
                        }
                    }
                }
                if let Some(tracks) = out["project"]["tracks"].as_array_mut() {
                    for track in tracks {
                        if let Some(points) = track["automation"].as_array_mut() {
                            for point in points {
                                let time = number(point, "time")?;
                                point["time"] = json!(if time < start {
                                    time
                                } else if time >= end {
                                    time - gap
                                } else {
                                    start
                                });
                            }
                        }
                    }
                }
            }
            "marker" => {
                let time = number(op, "at")?;
                if time < 0.0 {
                    return Err("Negative marker time".into());
                }
                if !out["project"]["markers"].is_array() {
                    out["project"]["markers"] = json!([]);
                }
                out["project"]["markers"].as_array_mut().unwrap().push(
                    json!({"id":id(),"time":time,"name":op["name"].as_str().unwrap_or("Marker")}),
                );
            }
            "automation" => {
                let track = out["project"]["tracks"]
                    .as_array_mut()
                    .unwrap()
                    .iter_mut()
                    .find(|t| t["id"] == op["trackId"])
                    .ok_or("Missing track")?;
                let mut points = op["points"]
                    .as_array()
                    .ok_or("Missing automation points")?
                    .clone();
                for p in &points {
                    if number(p, "time")? < 0.0 || number(p, "value")? < 0.0 {
                        return Err("Invalid automation".into());
                    }
                }
                points.sort_by(|a, b| {
                    a["time"]
                        .as_f64()
                        .unwrap()
                        .total_cmp(&b["time"].as_f64().unwrap())
                });
                track["automation"] = json!(points);
            }
            _ => return Err(format!("Unknown recipe operation: {operation}")),
        }
    }
    if operations
        .iter()
        .any(|op| op["op"] != "color" && op["op"] != "orientation")
    {
        out["project"]["duration"] = json!(clips(&out["project"])
            .iter()
            .map(|c| c["startTime"].as_f64().unwrap_or(0.0) + c["duration"].as_f64().unwrap_or(0.0))
            .fold(
                out["project"]["minimumDuration"].as_f64().unwrap_or(0.0),
                f64::max
            ));
    }
    Ok(out)
}
fn curve(progress: &str, kind: &str) -> String {
    match kind {
        "exponential" => format!("(exp(6*({progress}))-1)/(exp(6)-1)"),
        "scurve" => format!("({progress})*({progress})*(3-2*({progress}))"),
        _ => format!("({progress})"),
    }
}
fn envelope(
    time: &str,
    duration: f64,
    fade_in: f64,
    fade_out: f64,
    in_curve: &str,
    out_curve: &str,
) -> String {
    let a = if fade_in > 0.0 {
        curve(&format!("min(1,max(0,({time})/{fade_in}))"), in_curve)
    } else {
        "1".into()
    };
    let b = if fade_out > 0.0 {
        curve(
            &format!("min(1,max(0,({duration}-({time}))/{fade_out}))"),
            out_curve,
        )
    } else {
        "1".into()
    };
    format!("({a})*({b})")
}
fn automation(points: &Value, time: &str) -> Result<String> {
    let Some(points) = points.as_array().filter(|p| !p.is_empty()) else {
        return Ok("1".into());
    };
    let mut points = points.clone();
    points.sort_by(|a, b| {
        a["time"]
            .as_f64()
            .unwrap_or(0.0)
            .total_cmp(&b["time"].as_f64().unwrap_or(0.0))
    });
    for p in &points {
        if number(p, "time")? < 0.0 || number(p, "value")? < 0.0 {
            return Err("Invalid automation".into());
        }
    }
    let mut expr = number(points.last().unwrap(), "value")?.to_string();
    for i in (1..points.len()).rev() {
        let a = &points[i - 1];
        let b = &points[i];
        let at = number(a, "time")?;
        let bt = number(b, "time")?;
        let av = number(a, "value")?;
        let bv = number(b, "value")?;
        if bt > at {
            expr =
                format!("if(lt({time},{bt}),{av}+({bv}-{av})*(({time})-{at})/({bt}-{at}),{expr})");
        }
    }
    Ok(format!(
        "if(lte({time},{}),{},{expr})",
        number(&points[0], "time")?,
        number(&points[0], "value")?
    ))
}
/// Linked-media CLI mix. Unsupported DSP fails explicitly instead of producing
/// a plausible export with effects silently omitted.
pub fn render_audio(doc: &Value, output: &str) -> Result<()> {
    if std::path::Path::new(output)
        .extension()
        .is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case("aac"))
    {
        return crate::audio_encode::render_aac(doc, output, 192);
    }
    if std::path::Path::new(output)
        .extension()
        .is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case("flac"))
    {
        return crate::audio_encode::render_flac(doc, output);
    }
    if !std::path::Path::new(output)
        .extension()
        .is_some_and(|e| e.to_string_lossy().eq_ignore_ascii_case("wav"))
    {
        return Err(
            "CLI audio rendering exports WAV or native Mac FLAC/AAC; choose .wav, .flac or .aac"
                .into(),
        );
    }
    let backend = crate::apple::Backend::configured()?;
    if backend != crate::apple::Backend::Ffmpeg {
        match crate::audio_mix::render(doc, output) {
            Ok(()) => return Ok(()),
            Err(error) if backend == crate::apple::Backend::Auto && !crate::jobs::cancelled() => {
                eprintln!("Native audio mix: {error}; using optional FFmpeg compatibility backend")
            }
            Err(error) => return Err(error),
        }
    }
    render_audio_ffmpeg(doc, output)
}
fn render_audio_ffmpeg(doc: &Value, output: &str) -> Result<()> {
    let project = &doc["project"];
    let duration = number(project, "duration")?;
    if duration <= 0.0 {
        return Err("Empty arrangement".into());
    }
    let tracks = project["tracks"].as_array().ok_or("Missing tracks")?;
    if project["masterEffects"]
        .as_array()
        .is_some_and(|e| e.iter().any(|e| e["enabled"] == true))
    {
        return Err("CLI cannot render master effects; render this project in the GUI".into());
    }
    let has_solo = tracks.iter().any(|t| t["solo"] == true);
    let mut nodes = Vec::new();
    let mut args = strings(&[
        "-v",
        "error",
        "-nostdin",
        "-n",
        "-filter_complex_threads",
        "1",
    ]);
    let mut input = 0;
    let mut buses = Vec::new();
    for track in tracks {
        if if has_solo {
            track["solo"] != true
        } else {
            track["muted"] == true
        } {
            continue;
        }
        if track["pan"].as_f64().unwrap_or(0.0) != 0.0 {
            return Err("CLI pan rendering is unsupported; use GUI export".into());
        }
        let segments = track["segments"].as_array().ok_or("Missing clips")?;
        let start = segments
            .iter()
            .filter_map(|c| c["startTime"].as_f64())
            .fold(f64::INFINITY, f64::min);
        let stop = segments
            .iter()
            .map(|c| c["startTime"].as_f64().unwrap_or(0.0) + c["duration"].as_f64().unwrap_or(0.0))
            .fold(0.0, f64::max);
        let mut labels = Vec::new();
        for c in segments {
            let source = doc["sources"]
                .as_array()
                .ok_or("Missing sources")?
                .iter()
                .find(|s| s["id"] == c["sourceId"])
                .ok_or("Missing audio source")?;
            let path = source["path"].as_str().ok_or(
                "CLI render requires linked audio files; save a linked project in the desktop app",
            )?;
            let length = number(c, "duration")?;
            let position = number(c, "startTime")?;
            if length <= 0.0 || position < 0.0 {
                return Err("Invalid clip timing".into());
            }
            args.extend(strings(&[
                "-threads",
                "1",
                "-ss",
                &number(c, "sourceOffset")?.to_string(),
                "-t",
                &length.to_string(),
                "-i",
                path,
            ]));
            let fades = envelope(
                "t",
                length,
                c["fadeInDuration"].as_f64().unwrap_or(0.0),
                c["fadeOutDuration"].as_f64().unwrap_or(0.0),
                c["fadeInCurve"].as_str().unwrap_or("linear"),
                c["fadeOutCurve"].as_str().unwrap_or("linear"),
            );
            let fx = effect_filters(&c["effects"])?;
            let gain = c["gain"].as_f64().unwrap_or(1.0);
            let factor = format!("({gain})*({fades})");
            let label = format!("clip{input}");
            nodes.push(format!("[{input}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS{fx},aeval=exprs='val(0)*({factor})|val(1)*({factor})',adelay={}S:all=1[{label}]",(position*48000.0).round() as u64));
            labels.push(format!("[{label}]"));
            input += 1;
        }
        if !labels.is_empty() {
            let label = format!("track{}", buses.len());
            let fades = envelope(
                &format!("t-{start}"),
                stop - start,
                track["fadeInDuration"].as_f64().unwrap_or(0.0),
                track["fadeOutDuration"].as_f64().unwrap_or(0.0),
                track["fadeInCurve"].as_str().unwrap_or("linear"),
                track["fadeOutCurve"].as_str().unwrap_or("linear"),
            );
            let gain = track["volume"].as_f64().unwrap_or(1.0);
            let automation = automation(&track["automation"], "t")?;
            let factor = format!("({fades})*({automation})");
            let fx = effect_filters(&track["effects"])?;
            nodes.push(format!("{}amix=inputs={}:normalize=0,aeval=exprs='val(0)*({factor})|val(1)*({factor})'{fx},volume={gain}[{label}]",labels.join(""),labels.len()));
            buses.push(format!("[{label}]"));
        }
    }
    if buses.is_empty() {
        args.extend(strings(&[
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=48000:cl=stereo",
        ]));
        nodes.push("[0:a]anull[out]".into());
    } else {
        nodes.push(format!(
            "{}amix=inputs={}:normalize=0,apad,atrim=duration={duration}[out]",
            buses.join(""),
            buses.len()
        ));
    }
    args.extend(strings(&[
        "-filter_complex",
        &nodes.join(";"),
        "-map",
        "[out]",
        "-t",
        &duration.to_string(),
        "-c:a",
        "pcm_f32le",
        output,
    ]));
    run("ffmpeg", &args)?;
    Ok(())
}
fn effect_filters(effects: &Value) -> Result<String> {
    let mut filters = String::new();
    for effect in effects
        .as_array()
        .into_iter()
        .flatten()
        .filter(|e| e["enabled"] == true)
    {
        let params = &effect["params"];
        match effect["type"].as_str().unwrap_or("") {
            "highpass" | "lowpass" => {
                let kind = effect["type"].as_str().unwrap();
                filters += &format!(
                    ",{kind}=f={}:t=q:w={}",
                    number(params, "freq")?,
                    number(params, "q")?
                );
            }
            // Web Audio's compressor and FFmpeg's have different detector behavior.
            _ => {
                return Err(
                    "CLI cannot match this effect exactly; render this project in the GUI".into(),
                )
            }
        }
    }
    Ok(filters)
}

pub fn render_project(doc: &Value, output: &str, video: bool) -> Result<()> {
    if !video {
        return render_audio(doc, output);
    }
    let picture = &doc["project"]["video"];
    if picture.is_null() {
        return Err("Project has no picture".into());
    }
    let mix_folder = tempfile::tempdir().map_err(|e| e.to_string())?;
    let mix = mix_folder
        .path()
        .join("mix.wav")
        .to_string_lossy()
        .into_owned();
    let result = (|| {
        render_audio(doc, &mix)?;
        let picture_clips: Vec<Value> = clips(&doc["project"])
            .into_iter()
            .filter(|c| c.get("trackId").is_none())
            .collect();
        let edit=serde_json::from_value(json!({"path":picture["path"],"sources":picture.get("sources").cloned().unwrap_or(json!([])),"frameRate":doc["project"].get("frameRate"),"backend":picture.get("backend"),"outputFormat":picture.get("outputFormat"),"duration":doc["project"]["duration"],"clips":picture_clips})).map_err(|e|e.to_string())?;
        let duration = picture_clips
            .iter()
            .map(|c| c["startTime"].as_f64().unwrap_or(0.0) + c["duration"].as_f64().unwrap_or(0.0))
            .fold(doc["project"]["duration"].as_f64().unwrap_or(0.0), f64::max);
        crate::video_edit::export_edit(
            &edit,
            output,
            Some(&mix),
            picture["inPoint"].as_f64().unwrap_or(0.0),
            picture["outPoint"].as_f64().unwrap_or(duration),
            false,
        )
    })();
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    fn doc() -> Value {
        json!({"format":"crispaudio-project","version":2,"project":{"id":"p","duration":6,"tracks":[{"id":"t","segments":[{"id":"a","linkGroup":"g","trackId":"t","sourceId":"s","startTime":1,"sourceOffset":2,"duration":5}]}],"video":{"path":"unused","duration":10,"clips":[{"id":"v","linkGroup":"g","startTime":1,"sourceOffset":2,"duration":5,"transition":"cut"}]}},"sources":[{"id":"s","duration":10}]})
    }
    #[test]
    fn linked_move_and_slip_are_clamped_together() {
        let d=apply(&doc(),&json!([{"op":"move","ids":["a"],"seconds":-20},{"op":"slip","ids":["v"],"seconds":100}])).unwrap();
        let c = clips(&d["project"]);
        assert!(c
            .iter()
            .all(|c| c["startTime"] == 0.0 && c["sourceOffset"] == 5.0));
    }
    #[test]
    fn split_preserves_separate_linked_halves() {
        let d = apply(&doc(), &json!([{"op":"split","ids":["v"],"at":3}])).unwrap();
        let audio = d["project"]["tracks"][0]["segments"].as_array().unwrap();
        let picture = d["project"]["video"]["clips"].as_array().unwrap();
        assert_eq!(audio[1]["linkGroup"], picture[1]["linkGroup"]);
        assert_ne!(audio[0]["linkGroup"], audio[1]["linkGroup"]);
        assert_eq!(audio[1]["sourceOffset"], 4.0);
    }
    #[test]
    fn unknown_operations_do_not_modify_original() {
        let d = doc();
        assert!(apply(&d, &json!([{"op":"delete_everything"}])).is_err());
        assert_eq!(d, doc());
    }
    #[test]
    fn ripple_closes_interval_on_all_tracks() {
        let d = apply(&doc(), &json!([{"op":"ripple","start":2,"end":4}])).unwrap();
        let c = &d["project"]["tracks"][0]["segments"];
        assert_eq!(c[0]["duration"], 1.0);
        assert_eq!(c[1]["sourceOffset"], 5.0);
        assert_eq!(c[1]["startTime"], 2.0);
        assert_eq!(d["project"]["duration"], 4.0);
    }
    #[test]
    fn colour_recipe_preserves_linked_audio_range_and_canvas() {
        let mut original = doc();
        original["project"]["duration"] = json!(20);
        original["project"]["video"]["inPoint"] = json!(2);
        original["project"]["video"]["outPoint"] = json!(4);
        let settings = json!({"enabled":true,"exposure":0.5,"contrast":1.1,"saturation":0.8});
        let edited = apply(
            &original,
            &json!([{"op":"color","ids":["v"],"settings":settings}]),
        )
        .unwrap();
        assert_eq!(edited["project"]["tracks"], original["project"]["tracks"]);
        assert_eq!(edited["project"]["duration"], 20);
        assert_eq!(edited["project"]["video"]["inPoint"], 2);
        assert_eq!(
            edited["project"]["video"]["clips"][0]["colorCorrection"],
            settings
        );
        let reset = apply(
            &edited,
            &json!([{"op":"color","ids":["v"],"settings":null}]),
        )
        .unwrap();
        assert!(reset["project"]["video"]["clips"][0]
            .get("colorCorrection")
            .is_none());
        assert!(apply(
            &original,
            &json!([{"op":"color","ids":["a"],"settings":settings}])
        )
        .is_err());
        assert!(apply(&original,&json!([{"op":"color","ids":["v"],"settings":{"enabled":true,"exposure":3,"contrast":1,"saturation":1}}])).is_err());
    }
    #[test]
    fn orientation_recipe_preserves_audio_and_duration_and_rejects_bad_rotation() {
        let mut original = doc();
        original["project"]["duration"] = json!(20);
        let settings = json!({"rotation":90,"flipHorizontal":true,"flipVertical":false});
        let edited = apply(
            &original,
            &json!([{"op":"orientation","ids":["v"],"settings":settings}]),
        )
        .unwrap();
        assert_eq!(edited["project"]["tracks"], original["project"]["tracks"]);
        assert_eq!(edited["project"]["duration"], 20);
        assert_eq!(
            edited["project"]["video"]["clips"][0]["transform"],
            settings
        );
        let reset = apply(
            &edited,
            &json!([{"op":"orientation","ids":["v"],"settings":null}]),
        )
        .unwrap();
        assert!(reset["project"]["video"]["clips"][0]
            .get("transform")
            .is_none());
        assert!(apply(&original,&json!([{"op":"orientation","ids":["v"],"settings":{"rotation":45,"flipHorizontal":false,"flipVertical":false}}])).is_err());
    }
}
