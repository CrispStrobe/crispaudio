//! Non-destructive single-source picture edits, shared by CLI and desktop.
use crate::{probe, run, strings, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoClip {
    pub id: String,
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
pub struct VideoEdit {
    pub path: String,
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
            || c.start_time < 0.0
            || c.source_offset < 0.0
            || c.duration < 1.0 / 120.0
            || c.source_offset + c.duration > source_duration + 1e-6
            || c.fade_in < 0.0
            || c.fade_out < 0.0
            || c.fade_in + c.fade_out > c.duration
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
    let clips = validate(edit, info.duration)?;
    let total = clips.last().unwrap().start_time + clips.last().unwrap().duration;
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
    let fps =
        if ratio.len() == 2 && ratio[1] > 0.0 && (1.0..=240.0).contains(&(ratio[0] / ratio[1])) {
            format!("{}/{}", ratio[0], ratio[1])
        } else {
            "30/1".into()
        };
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
            &edit.path,
        ]));
        let label = format!("p{input}");
        let mut filters=format!("[{input}:v]fps={fps},scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p");
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
    nodes.push(format!(
        "[{previous}]trim=start={start}:end={end},setpts=PTS-STARTPTS[outv]"
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
            id: "c".into(),
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
            clips: vec![clip(0.0, 3.0), clip(2.0, 3.0)],
        };
        assert!(validate(&edit, 10.0).is_err());
        edit.clips[1].transition = "fade".into();
        edit.clips[1].transition_duration = 1.0;
        assert!(validate(&edit, 10.0).is_ok());
        edit.clips[1].fade_out = 4.0;
        assert!(validate(&edit, 10.0).is_err());
    }
}
