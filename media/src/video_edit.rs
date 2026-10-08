//! Non-destructive multi-source picture edits, shared by CLI and desktop.
use crate::{probe, run, strings, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VideoColor {
    pub enabled: bool,
    pub exposure: f64,
    pub contrast: f64,
    pub saturation: f64,
}
impl VideoColor {
    pub(crate) fn valid(&self) -> bool {
        self.exposure.is_finite()
            && (-2.0..=2.0).contains(&self.exposure)
            && self.contrast.is_finite()
            && (0.0..=2.0).contains(&self.contrast)
            && self.saturation.is_finite()
            && (0.0..=2.0).contains(&self.saturation)
    }
}

/// RGB ordering matches browser brightness → contrast → saturation.
fn color_filters(color: Option<&VideoColor>) -> String {
    let Some(c) = color.filter(|c| c.enabled) else {
        return String::new();
    };
    if c.exposure == 0.0 && c.contrast == 1.0 && c.saturation == 1.0 {
        return String::new();
    }
    let exposure = 2.0_f64.powf(c.exposure);
    let expression = format!("clip(val*{exposure},0,255)");
    let contrast = format!("clip((val-127.5)*{}+127.5,0,255)", c.contrast);
    let s = c.saturation;
    let r = 0.213 * (1.0 - s);
    let g = 0.715 * (1.0 - s);
    let b = 0.072 * (1.0 - s);
    format!(",format=rgb24,lutrgb=r='{expression}':g='{expression}':b='{expression}',lutrgb=r='{contrast}':g='{contrast}':b='{contrast}',colorchannelmixer=rr={}:rg={g}:rb={b}:gr={r}:gg={}:gb={b}:br={r}:bg={g}:bb={},format=yuv420p",r+s,g+s,b+s)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoClip {
    #[serde(default)]
    pub color_correction: Option<VideoColor>,
    pub id: String,
    #[serde(default)]
    pub source_id: Option<String>,
    pub start_time: f64,
    pub source_offset: f64,
    pub duration: f64,
    #[serde(default)]
    pub fade_in: f64,
    #[serde(default)]
    pub fade_out: f64,
    pub transition: String,
    #[serde(default)]
    pub transition_duration: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VideoSource {
    pub id: String,
    pub path: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoEdit {
    pub path: String,
    #[serde(default)]
    pub sources: Vec<VideoSource>,
    #[serde(default)]
    pub frame_rate: Option<f64>,
    #[serde(default)]
    pub duration: Option<f64>,
    pub clips: Vec<VideoClip>,
}
const TRANSITIONS: &[&str] = &[
    "cut",
    "fade",
    "fadeblack",
    "fadewhite",
    "wipeleft",
    "wiperight",
    "wipeup",
    "wipedown",
    "slideleft",
    "slideright",
    "slideup",
    "slidedown",
    "hblur",
    "zoomin",
    "pixelize",
    "whip",
    "glitch",
    "pagepeel",
];

pub fn validate(edit: &VideoEdit, source_duration: f64) -> Result<Vec<VideoClip>> {
    if edit
        .duration
        .is_some_and(|duration| !duration.is_finite() || duration < 0.0)
    {
        return Err("Invalid project duration".into());
    }
    if edit.clips.is_empty() || edit.clips.len() > 256 {
        return Err("Video edit needs 1–256 clips".into());
    }
    let mut clips = edit.clips.clone();
    for c in &clips {
        if ![
            c.start_time,
            c.source_offset,
            c.duration,
            c.fade_in,
            c.fade_out,
            c.transition_duration,
        ]
        .iter()
        .all(|v| v.is_finite())
            || c.color_correction
                .as_ref()
                .is_some_and(|color| !color.valid())
            || c.start_time < 0.0
            || c.source_offset < 0.0
            || c.duration < 1.0 / 120.0
            || (c.source_id.is_none() && c.source_offset + c.duration > source_duration + 1e-6)
            || c.source_id
                .as_ref()
                .is_some_and(|id| !edit.sources.iter().any(|s| &s.id == id))
            || c.fade_in < 0.0
            || c.fade_out < 0.0
            || c.fade_in > c.duration
            || c.fade_out > c.duration
            || c.transition_duration < 0.0
            || !TRANSITIONS.contains(&c.transition.as_str())
        {
            return Err("Invalid video clip timing or transition".into());
        }
    }
    clips.sort_by(|a, b| a.start_time.total_cmp(&b.start_time));
    for i in 1..clips.len() {
        let c = &clips[i];
        let p = &clips[i - 1];
        let overlap = p.start_time + p.duration - c.start_time;
        if overlap > 1e-6
            && (c.transition == "cut"
                || (overlap - c.transition_duration).abs() > 1e-6
                || overlap >= p.duration.min(c.duration)
                || (i > 1 && clips[i - 2].start_time + clips[i - 2].duration > c.start_time + 1e-6))
        {
            return Err("Overlapping clips require a transition matching their overlap; triple overlaps are unsupported".into());
        }
    }
    Ok(clips)
}

/// Mix is already cropped to [start,end] by the GUI. CLI explicitly selects
/// whether its mix is range-trimmed; source camera audio is never silently reused.
pub fn export_edit(
    edit: &VideoEdit,
    output: &str,
    mix: Option<&str>,
    start: f64,
    end: f64,
    mix_is_trimmed: bool,
) -> Result<()> {
    if Path::new(output).exists() {
        return Err("Output already exists; choose a new filename".into());
    }
    let info = probe(&edit.path)?;
    if !info.has_video {
        return Err("Source has no video".into());
    }
    let mut clips = validate(edit, info.duration)?;
    let mut durations = std::collections::HashMap::new();
    for source in &edit.sources {
        if durations.contains_key(&source.id) {
            return Err("Duplicate video source ID".into());
        }
        let source_info = probe(&source.path)?;
        if !source_info.has_video {
            return Err("Source has no video".into());
        }
        durations.insert(source.id.clone(), source_info.duration);
    }
    for clip in &clips {
        let duration = clip
            .source_id
            .as_ref()
            .map(|id| durations[id])
            .unwrap_or(info.duration);
        if clip.source_offset + clip.duration > duration + 1e-6 {
            return Err("Clip exceeds its video source".into());
        }
    }
    let total = (clips.last().unwrap().start_time + clips.last().unwrap().duration)
        .max(edit.duration.unwrap_or(0.0));
    if !start.is_finite() || !end.is_finite() || start < 0.0 || end <= start || end > total + 1e-6 {
        return Err("Invalid edited video range".into());
    }
    if let Some(path) = mix {
        if probe(path)?.duration + 0.01 < if mix_is_trimmed { end - start } else { end } {
            return Err("Mix does not cover the edited video range".into());
        }
    }
    let geometry = run(
        "ffprobe",
        &strings(&[
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,avg_frame_rate:stream_side_data=rotation",
            "-of",
            "json",
            &edit.path,
        ]),
    )?;
    let geometry: serde_json::Value =
        serde_json::from_slice(&geometry).map_err(|e| e.to_string())?;
    let width = geometry["streams"][0]["width"]
        .as_u64()
        .ok_or("Missing video width")?;
    let height = geometry["streams"][0]["height"]
        .as_u64()
        .ok_or("Missing video height")?;
    let stream = &geometry["streams"][0];
    let rate = stream["avg_frame_rate"].as_str().unwrap_or("30/1");
    let ratio: Vec<f64> = rate
        .split('/')
        .filter_map(|v| v.parse::<f64>().ok())
        .collect();
    let mut fps =
        if ratio.len() == 2 && ratio[1] > 0.0 && (1.0..=240.0).contains(&(ratio[0] / ratio[1])) {
            format!("{}/{}", ratio[0], ratio[1])
        } else {
            "30/1".into()
        };
    if let Some(rate) = edit.frame_rate {
        if !rate.is_finite() || !(1.0..=240.0).contains(&rate) {
            return Err("Invalid output frame rate".into());
        }
        fps = rate.to_string();
    }
    let numeric_fps = if let Some((a, b)) = fps.split_once('/') {
        a.parse::<f64>().unwrap() / b.parse::<f64>().unwrap()
    } else {
        fps.parse::<f64>().unwrap()
    };
    let quantize = |time: f64| (time * numeric_fps).round() / numeric_fps;
    // Quantize absolute boundaries, not each clip length, so repeated cuts do not drift.
    for clip in &mut clips {
        let stop = quantize(clip.start_time + clip.duration);
        clip.start_time = quantize(clip.start_time);
        clip.duration = stop - clip.start_time;
        clip.transition_duration = quantize(clip.transition_duration);
        if clip.duration < 0.5 / numeric_fps {
            return Err("Video clip shorter than one output frame".into());
        }
    }
    for i in 1..clips.len() {
        let overlap = clips[i - 1].start_time + clips[i - 1].duration - clips[i].start_time;
        if overlap > 1e-6 {
            clips[i].transition_duration = overlap;
        }
    }
    let rotation = stream["side_data_list"]
        .as_array()
        .and_then(|list| list.iter().find_map(|item| item["rotation"].as_f64()))
        .unwrap_or(0.0);
    let (width, height) = if (rotation.abs() % 180.0 - 90.0).abs() < 1.0 {
        (height, width)
    } else {
        (width, height)
    };
    let mut args = strings(&[
        "-v",
        "error",
        "-nostdin",
        "-n",
        "-filter_complex_threads",
        "1",
    ]);
    let mut nodes = Vec::new();
    let mut pieces: Vec<(String, f64, Option<(String, f64)>)> = Vec::new();
    let mut clock = 0.0;
    let mut input = 0;
    for c in &clips {
        if c.start_time > clock + 1e-6 {
            let gap = c.start_time - clock;
            args.extend(strings(&[
                "-f",
                "lavfi",
                "-i",
                &format!(
                    "color=c=black:s={}x{}:r={fps}:d={gap}",
                    width / 2 * 2,
                    height / 2 * 2
                ),
            ]));
            let label = format!("p{input}");
            nodes.push(format!("[{input}:v]settb=AVTB,format=yuv420p[{label}]"));
            pieces.push((label, gap, None));
            input += 1;
        }
        args.extend(strings(&[
            "-threads",
            "1",
            "-ss",
            &c.source_offset.to_string(),
            "-t",
            &c.duration.to_string(),
            "-i",
            &c.source_id
                .as_ref()
                .and_then(|id| edit.sources.iter().find(|s| &s.id == id))
                .map(|s| s.path.as_str())
                .unwrap_or(&edit.path),
        ]));
        let label = format!("p{input}");
        let mut filters=format!("[{input}:v]fps={fps},scale={}:{}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad={}:{}:(ow-iw)/2:(oh-ih)/2,setsar=1,settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p",width/2*2,height/2*2,width/2*2,height/2*2);
        filters += &color_filters(c.color_correction.as_ref());
        if c.fade_in > 0.0 {
            filters += &format!(",fade=t=in:st=0:d={}", c.fade_in);
        }
        if c.fade_out > 0.0 {
            filters += &format!(
                ",fade=t=out:st={}:d={}",
                c.duration - c.fade_out,
                c.fade_out
            );
        }
        filters += &format!("[{label}]");
        nodes.push(filters);
        let overlap = (clock - c.start_time).max(0.0);
        pieces.push((
            label,
            c.duration,
            if overlap > 1e-6 {
                Some((c.transition.clone(), overlap))
            } else {
                None
            },
        ));
        clock = c.start_time + c.duration;
        input += 1;
    }
    let mut previous = pieces[0].0.clone();
    let mut length = pieces[0].1;
    for (i, (label, duration, transition)) in pieces.iter().enumerate().skip(1) {
        let next = format!("chain{i}");
        if let Some((kind, overlap)) = transition {
            let filter = transition_filter(kind, *overlap, length - overlap);
            nodes.push(format!("[{previous}][{label}]{filter}[{next}]"));
            length += duration - overlap;
        } else {
            nodes.push(format!(
                "[{previous}][{label}]concat=n=2:v=1:a=0,settb=AVTB[{next}]"
            ));
            length += duration;
        }
        previous = next;
    }
    let tail = (quantize(total) - clock).max(0.0);
    nodes.push(format!(
        "[{previous}]tpad=stop_mode=add:stop_duration={tail}:color=black,trim=start={start}:end={end},setpts=PTS-STARTPTS[outv]"
    ));
    if let Some(path) = mix {
        if !mix_is_trimmed {
            args.extend(strings(&["-ss", &start.to_string()]));
        }
        args.extend(strings(&["-i", path]));
    }
    args.extend(strings(&[
        "-filter_complex",
        &nodes.join(";"),
        "-map",
        "[outv]",
    ]));
    if mix.is_some() {
        args.extend(strings(&[
            "-map",
            &format!("{input}:a:0"),
            "-c:a",
            "aac",
            "-b:a",
            "192k",
        ]));
    }
    let output_path = Path::new(output);
    let parent = output_path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let staged = parent.join(format!(
        ".crispaudio-edit-{}-{stamp}.mp4",
        std::process::id()
    ));
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staged)
        .map_err(|e| e.to_string())?;
    // We own only this staging file. Never remove an output another writer made.
    args.retain(|arg| arg != "-n");
    args.push("-y".into());
    args.extend(strings(&[
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-t",
        &(end - start).to_string(),
        "-movflags",
        "+faststart",
        &staged.to_string_lossy(),
    ]));
    let result = run("ffmpeg", &args).and_then(|_| {
        std::fs::hard_link(&staged, output_path)
            .map_err(|e| format!("Cannot publish edited video: {e}"))
    });
    let _ = std::fs::remove_file(&staged);
    result
}

/// Custom effects are distinct from stock pixelization or a simple slide.
fn transition_filter(kind: &str, duration: f64, offset: f64) -> String {
    let sample = |which: &str, x: &str| {
        format!("if(eq(PLANE,0),{which}0({x},Y),if(eq(PLANE,1),{which}1({x},Y),{which}2({x},Y)))")
    };
    let expression = match kind {
        "fadeblack" | "fadewhite" => {
            let luminance = if kind == "fadeblack" { 16 } else { 235 };
            let bg = format!("if(eq(PLANE,0),{luminance},128)");
            format!("if(gt(P,0.5),{bg}+(A-{bg})*(2*P-1),{bg}+(B-{bg})*(1-2*P))")
        }
        "glitch" => {
            let x = "mod(X+W*0.12*sin(floor(Y/12)*9+floor((1-P)*24)*7+PLANE*2)*sin(PI*P)+W,W)";
            format!("if(gt(P,0.5),{},{})", sample("a", x), sample("b", x))
        }
        "whip" => {
            let progress = "((1-P)*(1-P)*(1+2*P))";
            let ax = format!("X+W*{progress}");
            let bx = format!("X-W*(1-{progress})");
            let main = format!("if(lt({ax},W),{},{})", sample("a", &ax), sample("b", &bx));
            // Five displaced samples create directional motion blur.
            let mut terms = vec![main];
            for shift in [-0.04, -0.02, 0.02, 0.04] {
                let ax = format!("X+W*{progress}+W*{shift}*sin(PI*P)");
                let bx = format!("X-W*(1-{progress})+W*{shift}*sin(PI*P)");
                terms.push(format!(
                    "if(lt({ax},W),{},{})",
                    sample("a", &ax),
                    sample("b", &bx)
                ));
            }
            format!("({})/5", terms.join("+"))
        }
        "pagepeel" => {
            let edge = "W*P";
            let band = "W*0.15*sin(PI*P)";
            let reflected = sample("a", &format!("min(W-1,2*{edge}-X)"));
            // Mirrored underside with luminance shading along a curved fold.
            format!("if(gt(X,{edge}),B,if(gt(X,{edge}-{band}),if(eq(PLANE,0),{reflected}*(0.55+0.4*cos((X-{edge}+{band})/max(1,{band})*PI/2)),128),A))")
        }
        _ => return format!("xfade=transition={kind}:duration={duration}:offset={offset}"),
    };
    format!("xfade=transition=custom:duration={duration}:offset={offset}:expr='{expression}'")
}

#[cfg(test)]
mod tests {
    use super::*;
    fn clip(start: f64, duration: f64) -> VideoClip {
        VideoClip {
            color_correction: None,
            id: "c".into(),
            source_id: None,
            start_time: start,
            source_offset: 0.0,
            duration,
            fade_in: 0.0,
            fade_out: 0.0,
            transition: "cut".into(),
            transition_duration: 0.0,
        }
    }
    #[test]
    fn ambiguous_overlap_and_invalid_fades_are_rejected() {
        let mut edit = VideoEdit {
            path: "unused".into(),
            sources: vec![],
            frame_rate: None,
            duration: None,
            clips: vec![clip(0.0, 3.0), clip(2.0, 3.0)],
        };
        assert!(validate(&edit, 10.0).is_err());
        edit.clips[1].transition = "fade".into();
        edit.clips[1].transition_duration = 1.0;
        assert!(validate(&edit, 10.0).is_ok());
        edit.clips[1].fade_in = 2.0;
        edit.clips[1].fade_out = 2.0;
        assert!(validate(&edit, 10.0).is_ok()); // overlapping envelopes multiply
        edit.clips[1].fade_out = 4.0;
        assert!(validate(&edit, 10.0).is_err());
    }
    #[test]
    #[ignore = "Requires FFmpeg; run explicitly on desktop"]
    fn overlapping_fades_render_with_multiplicative_opacity() {
        use std::process::Command;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let folder =
            std::env::temp_dir().join(format!("crispaudio-fades-{}-{stamp}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let source = folder.join("white.mp4");
        let output = folder.join("faded.mp4");
        assert!(Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=white:s=128x72:r=25:d=2",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p"
            ])
            .arg(&source)
            .status()
            .unwrap()
            .success());
        let mut picture = clip(0.0, 2.0);
        picture.fade_in = 2.0;
        picture.fade_out = 2.0;
        let edit = VideoEdit {
            path: source.to_string_lossy().into(),
            sources: vec![],
            frame_rate: Some(25.0),
            duration: Some(2.0),
            clips: vec![picture],
        };
        export_edit(&edit, output.to_str().unwrap(), None, 0.0, 2.0, false).unwrap();
        let frame = Command::new("ffmpeg")
            .args(["-v", "error", "-ss", "1", "-i"])
            .arg(&output)
            .args([
                "-frames:v",
                "1",
                "-pix_fmt",
                "gray",
                "-f",
                "rawvideo",
                "pipe:1",
            ])
            .output()
            .unwrap();
        assert!(frame.status.success());
        assert_eq!(frame.stdout.len(), 128 * 72);
        let average =
            frame.stdout.iter().map(|v| *v as f64).sum::<f64>() / frame.stdout.len() as f64;
        assert!(
            (55.0..75.0).contains(&average),
            "midpoint should be 25% white, got {average}"
        );
        std::fs::remove_dir_all(folder).unwrap();
    }
    #[test]
    fn colour_settings_are_optional_and_strictly_bounded() {
        let mut picture = clip(0.0, 2.0);
        let mut edit = VideoEdit {
            path: "unused".into(),
            sources: vec![],
            frame_rate: None,
            duration: None,
            clips: vec![picture.clone()],
        };
        assert!(validate(&edit, 3.0).is_ok());
        picture.color_correction = Some(VideoColor {
            enabled: true,
            exposure: 1.0,
            contrast: 0.75,
            saturation: 0.0,
        });
        edit.clips[0] = picture.clone();
        assert!(validate(&edit, 3.0).is_ok());
        assert!(color_filters(picture.color_correction.as_ref()).contains("colorchannelmixer"));
        edit.clips[0].color_correction.as_mut().unwrap().exposure = 3.0;
        assert!(validate(&edit, 3.0).is_err());
        edit.clips[0].color_correction.as_mut().unwrap().enabled = false;
        assert!(validate(&edit, 3.0).is_err());
    }

    #[test]
    #[ignore = "Requires FFmpeg; run explicitly on desktop"]
    fn colour_export_matches_rgb_reference_and_bypass() {
        use std::process::Command;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let folder =
            std::env::temp_dir().join(format!("crispaudio-colour-{}-{stamp}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let source = folder.join("source.mp4");
        assert!(Command::new("ffmpeg")
            .args([
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=0x804020:s=128x72:r=25:d=1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p"
            ])
            .arg(&source)
            .status()
            .unwrap()
            .success());
        let pixels = |path: &std::path::Path| {
            let frame = Command::new("ffmpeg")
                .args(["-v", "error", "-i"])
                .arg(path)
                .args([
                    "-frames:v",
                    "1",
                    "-pix_fmt",
                    "rgb24",
                    "-f",
                    "rawvideo",
                    "pipe:1",
                ])
                .output()
                .unwrap();
            assert!(frame.status.success());
            assert_eq!(frame.stdout.len(), 128 * 72 * 3);
            let mut rgb = [0.0; 3];
            for pixel in frame.stdout.chunks_exact(3) {
                for channel in 0..3 {
                    rgb[channel] += pixel[channel] as f64 / (128.0 * 72.0);
                }
            }
            rgb
        };
        let original = pixels(&source);
        let mut picture = clip(0.0, 1.0);
        picture.color_correction = Some(VideoColor {
            enabled: true,
            exposure: 1.0,
            contrast: 0.75,
            saturation: 0.0,
        });
        let mut edit = VideoEdit {
            path: source.to_string_lossy().into(),
            sources: vec![],
            frame_rate: Some(25.0),
            duration: Some(1.0),
            clips: vec![picture],
        };
        let graded = folder.join("graded.mp4");
        export_edit(&edit, graded.to_str().unwrap(), None, 0.0, 1.0, false).unwrap();
        let transformed = original.map(|v| ((v * 2.0).clamp(0.0, 255.0) - 127.5) * 0.75 + 127.5);
        let expected = 0.213 * transformed[0] + 0.715 * transformed[1] + 0.072 * transformed[2];
        let actual = pixels(&graded);
        assert!(
            actual.iter().all(|value| (value - expected).abs() < 8.0),
            "expected {expected}, got {actual:?}"
        );
        edit.clips[0].color_correction.as_mut().unwrap().enabled = false;
        let bypass = folder.join("bypass.mp4");
        export_edit(&edit, bypass.to_str().unwrap(), None, 0.0, 1.0, false).unwrap();
        let bypassed = pixels(&bypass);
        assert!((0..3).all(|channel| (bypassed[channel] - original[channel]).abs() < 5.0));
        std::fs::remove_dir_all(folder).unwrap();
    }
}
