//! Word deletion uses the same all-lane range operation as the GUI.
use crate::Result;
use serde_json::{json, Value};
fn time(v: &Value, key: &str) -> Result<f64> {
    v[key]
        .as_f64()
        .filter(|x| x.is_finite())
        .ok_or_else(|| format!("Invalid word {key}"))
}
pub fn layout(p: &Value) -> Value {
    json!(p["tracks"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|t| t["segments"]
            .as_array()
            .into_iter()
            .flatten()
            .map(move |c| json!([
                t["id"],
                c["id"],
                c["sourceId"],
                c["startTime"],
                c["sourceOffset"],
                c["duration"]
            ])))
        .collect::<Vec<_>>())
}
pub fn delete_word(p: &Value, id: &str) -> Result<Value> {
    if !p["transcriptLayout"].is_null() && p["transcriptLayout"] != layout(p) {
        return Err("Audio arrangement changed: transcribe or realign again".into());
    }
    let cues = p["transcript"].as_array().ok_or("No timed transcript")?;
    let word = cues
        .iter()
        .flat_map(|c| c["words"].as_array().into_iter().flatten())
        .find(|w| w["id"] == id)
        .ok_or("Unknown timed word")?;
    let (mut start, mut end) = (time(word, "start")?, time(word, "end")?);
    if start < 0.0 || end <= start {
        return Err("Invalid word timestamps".into());
    }
    let video = !p["video"].is_null();
    if video {
        let fps = p["frameRate"].as_f64().unwrap_or(25.0);
        if !fps.is_finite() || fps <= 0.0 {
            return Err("Invalid frame rate".into());
        }
        start = (start * fps + 1e-7).floor() / fps;
        end = (end * fps - 1e-7).ceil() / fps;
    }
    if end <= start {
        return Err("Word is shorter than one picture frame".into());
    }
    let retime = |t: f64| {
        if t >= end {
            t - (end - start)
        } else if t > start {
            start
        } else {
            t
        }
    };
    let mut remaining = vec![];
    for c in cues {
        let mut next = c.clone();
        if let Some(words) = c["words"].as_array().filter(|w| !w.is_empty()) {
            let mut kept = vec![];
            for w in words {
                if w["id"] == id {
                    continue;
                }
                let a = time(w, "start")?;
                let b = time(w, "end")?;
                if a < end - 1e-6 && b > start + 1e-6 {
                    return Err("Frame cut overlaps an adjacent word".into());
                }
                let mut w = w.clone();
                w["start"] = json!(retime(a));
                w["end"] = json!(retime(b));
                kept.push(w);
            }
            if kept.is_empty() {
                continue;
            }
            next["start"] = kept[0]["start"].clone();
            next["end"] = kept.last().unwrap()["end"].clone();
            next["text"] = json!(kept
                .iter()
                .map(|w| w["text"].as_str().unwrap_or("").trim())
                .collect::<Vec<_>>()
                .join(" "));
            next["words"] = json!(kept);
        } else {
            let a = time(c, "start")?;
            let b = time(c, "end")?;
            if a < end && b > start {
                return Err("Cut crosses an unaligned cue".into());
            }
            next["start"] = json!(retime(a));
            next["end"] = json!(retime(b));
        }
        remaining.push(next);
    }
    let mut input = p.clone();
    input
        .as_object_mut()
        .ok_or("Invalid project")?
        .remove("transcript");
    let ids: Vec<_> = p["tracks"]
        .as_array()
        .ok_or("Missing tracks")?
        .iter()
        .map(|t| t["id"].clone())
        .collect();
    let mut out = crate::range_edit::apply(
        &input,
        &json!({"operation":"extract","start":start,"end":end,"trackIds":ids,"includeVideo":video,"retimeGlobal":true}),
    )?;
    if !p["transcriptLayout"].is_null() {
        out["transcriptLayout"] = layout(&out);
    }
    out["transcript"] = json!(remaining);
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_lanes_words_and_locks() {
        let p = json!({"duration":5,"sampleRate":48000,"tracks":[{"id":"t","rippleEnabled":false,"segments":[{"id":"a","trackId":"t","sourceId":"s","startTime":0,"duration":5,"sourceOffset":0}]}],"transcript":[{"id":"c","start":1,"end":3,"text":"Hallo Welt","words":[{"id":"a","start":1,"end":2,"text":"Hallo"},{"id":"b","start":2.1,"end":3,"text":"Welt"}]}]});
        let out = delete_word(&p, "a").unwrap();
        assert_eq!(out["duration"], 4.0);
        assert_eq!(out["transcript"][0]["text"], "Welt");
        assert_eq!(out["tracks"][0]["segments"][1]["sourceOffset"], 2.0);
        let mut locked = p.clone();
        locked["tracks"][0]["locked"] = json!(true);
        assert!(delete_word(&locked, "a").is_err());
        assert!(delete_word(&p, "unknown").is_err());
    }
}
