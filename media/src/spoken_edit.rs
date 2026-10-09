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

/// Retain reviewed words in chronological order; contiguous words keep natural pauses.
pub fn keep_words(p: &Value, ids: &[String]) -> Result<Value> {
    use std::collections::HashSet;
    if !p["transcriptLayout"].is_null() && p["transcriptLayout"] != layout(p) {
        return Err("Audio arrangement changed: transcribe or realign again".into());
    }
    let cues = p["transcript"]
        .as_array()
        .filter(|c| !c.is_empty())
        .ok_or("No word-timed transcript")?;
    if cues
        .iter()
        .any(|c| !c["words"].as_array().is_some_and(|w| !w.is_empty()))
    {
        return Err("Every cue needs word alignment".into());
    }
    let words: Vec<_> = cues
        .iter()
        .flat_map(|c| c["words"].as_array().unwrap())
        .collect();
    let all: HashSet<_> = words.iter().filter_map(|w| w["id"].as_str()).collect();
    let kept: HashSet<_> = ids.iter().map(String::as_str).collect();
    if kept.is_empty()
        || kept.len() != ids.len()
        || all.len() != words.len()
        || kept.iter().any(|id| !all.contains(id))
    {
        return Err("Invalid kept word IDs".into());
    }
    let duration = time(p, "duration")?;
    let picture = !p["video"].is_null();
    let fps = p["frameRate"].as_f64().unwrap_or(25.0);
    if !fps.is_finite() || fps <= 0.0 {
        return Err("Invalid frame rate".into());
    }
    for (i, w) in words.iter().enumerate() {
        let a = time(w, "start")?;
        let b = time(w, "end")?;
        if a < 0.0 || b <= a || b > duration + 1e-6 || (i > 0 && a < time(words[i - 1], "start")?) {
            return Err("Invalid aligned words".into());
        }
    }
    let mut ranges: Vec<(f64, f64)> = vec![];
    let mut i = 0;
    while i < words.len() {
        if !kept.contains(words[i]["id"].as_str().unwrap()) {
            i += 1;
            continue;
        }
        let first = i;
        while i + 1 < words.len() && kept.contains(words[i + 1]["id"].as_str().unwrap()) {
            i += 1;
        }
        let mut a = time(words[first], "start")?;
        let mut b = time(words[i], "end")?;
        if picture {
            a = (a * fps + 1e-7).floor() / fps;
            b = (b * fps - 1e-7).ceil() / fps;
        }
        a = a.max(0.0);
        b = b.min(duration);
        if let Some(last) = ranges.last_mut().filter(|r| a <= r.1 + 1e-7) {
            last.1 = last.1.max(b);
        } else {
            ranges.push((a, b));
        }
        i += 1;
    }
    let mut at = 0;
    for w in &words {
        let a = time(w, "start")?;
        let b = time(w, "end")?;
        while at < ranges.len() && ranges[at].1 <= a + 1e-6 {
            at += 1;
        }
        if !kept.contains(w["id"].as_str().unwrap())
            && at < ranges.len()
            && a < ranges[at].1 - 1e-6
            && b > ranges[at].0 + 1e-6
        {
            return Err("Retained frame overlaps removed speech".into());
        }
    }
    let mut removed = vec![];
    let mut cursor = 0.0;
    for &(a, b) in &ranges {
        if a > cursor + 1e-7 {
            removed.push((cursor, a));
        }
        cursor = b;
    }
    if cursor < duration - 1e-7 {
        removed.push((cursor, duration));
    }
    if removed.len() > 2000 {
        return Err("More than 2000 cuts: edit a shorter section".into());
    }
    let mut out = p.clone();
    out.as_object_mut()
        .ok_or("Invalid project")?
        .remove("transcript");
    let tracks: Vec<_> = p["tracks"]
        .as_array()
        .ok_or("Missing tracks")?
        .iter()
        .map(|t| t["id"].clone())
        .collect();
    for &(start, end) in removed.iter().rev() {
        out = crate::range_edit::apply(
            &out,
            &json!({"operation":"extract","start":start,"end":end,"trackIds":tracks,"includeVideo":picture,"retimeGlobal":true}),
        )?;
    }
    let mut prefix = vec![0.0];
    for &(a, b) in &removed {
        prefix.push(prefix.last().unwrap() + b - a);
    }
    let retime = |t: f64| {
        let i = removed.partition_point(|r| r.1 <= t);
        t - prefix[i] - removed.get(i).map_or(0.0, |r| (t - r.0).max(0.0))
    };
    let mut transcript = vec![];
    for c in cues {
        let mut c = c.clone();
        let mut next = vec![];
        for w in c["words"].as_array().unwrap() {
            if kept.contains(w["id"].as_str().unwrap()) {
                let mut w = w.clone();
                w["start"] = json!(retime(time(&w, "start")?));
                w["end"] = json!(retime(time(&w, "end")?));
                next.push(w);
            }
        }
        if next.is_empty() {
            continue;
        }
        c["start"] = next[0]["start"].clone();
        c["end"] = next.last().unwrap()["end"].clone();
        c["text"] = json!(next
            .iter()
            .map(|w| w["text"].as_str().unwrap_or("").trim())
            .collect::<Vec<_>>()
            .join(" "));
        c["words"] = json!(next);
        transcript.push(c);
    }
    out["transcript"] = json!(transcript);
    out["transcriptLayout"] = layout(&out);
    Ok(out)
}

#[cfg(test)]
mod keep_tests {
    use super::*;
    fn project() -> Value {
        let words:Vec<_>=["Wir","lernen","heute","morgen"].iter().enumerate().map(|(i,w)|json!({"id":i.to_string(),"text":w,"start":i as f64+0.2,"end":i as f64+0.7})).collect();
        json!({"duration":5.001,"minimumDuration":5.001,"sampleRate":48000,"frameRate":25,"tracks":[{"id":"t","rippleEnabled":false,"segments":[{"id":"a","trackId":"t","sourceId":"s","linkGroup":"av","startTime":0,"duration":5.001,"sourceOffset":0}]}],"video":{"duration":10,"path":"v.mp4","rippleEnabled":false,"clips":[{"id":"v","linkGroup":"av","startTime":0,"duration":5.001,"sourceOffset":0,"fadeIn":0,"fadeOut":0,"transition":"cut","transitionDuration":0}]},"transcript":[{"id":"c","start":0.2,"end":3.7,"text":"Wir lernen heute morgen","words":words}]})
    }
    #[test]
    fn keeps_reviewed_passages_picture_and_nonframe_tail() {
        let p = project();
        let out = keep_words(&p, &["0".into(), "3".into()]).unwrap();
        assert!((out["duration"].as_f64().unwrap() - 1.04).abs() < 1e-9);
        assert_eq!(out["tracks"][0]["segments"].as_array().unwrap().len(), 2);
        assert_eq!(out["tracks"][0]["segments"][1]["sourceOffset"], 3.2);
        assert_eq!(out["video"]["clips"][1]["sourceOffset"], 3.2);
        assert_eq!(out["transcript"][0]["text"], "Wir morgen");
        assert_eq!(out["transcriptLayout"], layout(&out));
    }
    #[test]
    fn rejects_locks_invalid_ids_and_boundary_speech() {
        let mut p = project();
        p["tracks"][0]["locked"] = json!(true);
        assert!(keep_words(&p, &["0".into()]).is_err());
        p["tracks"][0]["locked"] = json!(false);
        assert!(keep_words(&p, &["unknown".into()]).is_err());
        p["transcript"][0]["words"][1]["start"] = json!(0.71);
        assert!(keep_words(&p, &["0".into()]).is_err());
    }
}
