//! Saved delivery graphics and captions; independent of the source transcript.
use crate::video_edit::{PictureComposition, VideoTrack};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleStyle {
    pub font: String,
    pub size: f64,
    pub align: String,
    pub color: String,
    pub background: String,
    pub background_opacity: f64,
    pub box_width: f64,
    pub line_height: f64,
}
impl TitleStyle {
    fn valid(&self) -> bool {
        let color = |s: &str| {
            s.len() == 7
                && s.starts_with('#')
                && s.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
        };
        ["Arial", "Georgia", "Courier New"].contains(&self.font.as_str())
            && self.size.is_finite()
            && (0.01..=0.3).contains(&self.size)
            && ["left", "center", "right"].contains(&self.align.as_str())
            && color(&self.color)
            && color(&self.background)
            && self.background_opacity.is_finite()
            && (0.0..=1.0).contains(&self.background_opacity)
            && self.box_width.is_finite()
            && (0.1..=1.0).contains(&self.box_width)
            && self.line_height.is_finite()
            && (1.0..=2.0).contains(&self.line_height)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphicClip {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    pub start_time: f64,
    pub duration: f64,
    pub text: Option<String>,
    pub path: Option<String>,
    pub style: Option<TitleStyle>,
    pub composition: PictureComposition,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GraphicTrack {
    #[serde(flatten)]
    pub track: VideoTrack,
    pub clips: Vec<GraphicClip>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CaptionCue {
    pub id: String,
    pub start: f64,
    pub end: f64,
    pub text: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptionTrack {
    #[serde(flatten)]
    pub track: VideoTrack,
    pub burn_in: bool,
    pub style: TitleStyle,
    pub cues: Vec<CaptionCue>,
}
pub fn validate(tracks: &[GraphicTrack], caption: Option<&CaptionTrack>) -> crate::Result<()> {
    let mut ids = std::collections::HashSet::new();
    let mut add = |id: &str| !id.is_empty() && ids.insert(id.to_owned());
    if tracks.len() > 32 {
        return Err("Too many graphics tracks".into());
    }
    for track in tracks {
        if !add(&track.track.id) || track.clips.len() > 1000 {
            return Err("Invalid graphics track".into());
        }
        for clip in &track.clips {
            if !add(&clip.id)
                || !clip.start_time.is_finite()
                || clip.start_time < 0.0
                || !clip.duration.is_finite()
                || clip.duration < 1.0 / 120.0
                || !clip.composition.valid()
                || match clip.kind.as_str() {
                    "title" => {
                        clip.text
                            .as_ref()
                            .is_none_or(|s| s.trim().is_empty() || s.chars().count() > 4000)
                            || clip.style.as_ref().is_none_or(|s| !s.valid())
                    }
                    "image" => clip.path.as_ref().is_none_or(|s| s.is_empty()),
                    _ => true,
                }
            {
                return Err("Invalid graphics clip".into());
            }
        }
    }
    if let Some(track) = caption {
        if !add(&track.track.id) || !track.style.valid() || track.cues.len() > 10000 {
            return Err("Invalid caption track".into());
        }
        for cue in &track.cues {
            if !add(&cue.id)
                || !cue.start.is_finite()
                || cue.start < 0.0
                || !cue.end.is_finite()
                || cue.end <= cue.start
                || cue.text.trim().is_empty()
                || cue.text.chars().count() > 4000
            {
                return Err("Invalid caption cue".into());
            }
        }
    }
    Ok(())
}
pub fn duration(tracks: &[GraphicTrack], caption: Option<&CaptionTrack>) -> f64 {
    tracks
        .iter()
        .flat_map(|t| t.clips.iter().map(|c| c.start_time + c.duration))
        .chain(
            caption
                .into_iter()
                .flat_map(|t| t.cues.iter().map(|c| c.end)),
        )
        .fold(0.0, f64::max)
}

pub fn json_duration(video: &serde_json::Value) -> f64 {
    video["graphics"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|t| t["clips"].as_array().into_iter().flatten())
        .map(|c| c["startTime"].as_f64().unwrap_or(0.0) + c["duration"].as_f64().unwrap_or(0.0))
        .chain(
            video["captions"]["cues"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|c| c["end"].as_f64().unwrap_or(0.0)),
        )
        .fold(0.0, f64::max)
}
