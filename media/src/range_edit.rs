//! Scoped non-destructive range edits. Mirrors the timeline range contract.
use crate::Result;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
fn number(v: &Value, key: &str) -> Result<f64> {
    v[key]
        .as_f64()
        .filter(|v| v.is_finite())
        .ok_or_else(|| format!("Missing finite {key}"))
}
fn newid() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    format!(
        "range-{}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}
fn pictures(p: &Value) -> Vec<Value> {
    if p["video"].is_null() {
        vec![]
    } else {
        p["video"]["clips"].as_array().cloned().unwrap_or_else(||vec![json!({"id":"source-video","startTime":0,"duration":p["video"]["duration"],"sourceOffset":0,"fadeIn":0,"fadeOut":0,"transition":"cut","transitionDuration":0})])
    }
}
fn gain_at(points: &[Value], t: f64) -> Result<f64> {
    if points.is_empty() {
        return Ok(1.0);
    }
    let mut sorted = points.to_vec();
    for p in &sorted {
        if number(p, "time")? < 0.0 || number(p, "value")? < 0.0 {
            return Err("Invalid automation".into());
        }
    }
    sorted.sort_by(|a, b| {
        a["time"]
            .as_f64()
            .unwrap()
            .total_cmp(&b["time"].as_f64().unwrap())
    });
    if t <= number(&sorted[0], "time")? {
        return number(&sorted[0], "value");
    }
    for pair in sorted.windows(2) {
        let a = number(&pair[0], "time")?;
        let b = number(&pair[1], "time")?;
        if t < b {
            let x = number(&pair[0], "value")?;
            return Ok(x + (number(&pair[1], "value")? - x) * (t - a) / (b - a));
        }
    }
    number(sorted.last().unwrap(), "value")
}
pub fn apply(p: &Value, op: &Value) -> Result<Value> {
    let operation = op["operation"].as_str().unwrap_or("extract");
    let mut start = number(op, "start")?;
    let mut end = number(op, "end")?;
    let tracks = p["tracks"].as_array().ok_or("Missing tracks")?;
    let video = op["includeVideo"]
        .as_bool()
        .unwrap_or(!p["video"].is_null() && p["video"]["rippleEnabled"] != false);
    let ids: HashSet<String> = if let Some(ids) = op["trackIds"].as_array() {
        ids.iter()
            .map(|id| id.as_str().map(str::to_owned).ok_or("Invalid track id"))
            .collect::<std::result::Result<_, _>>()?
    } else {
        tracks
            .iter()
            .filter(|t| t["rippleEnabled"] != false)
            .filter_map(|t| t["id"].as_str().map(str::to_owned))
            .collect()
    };
    if (video && p["video"].is_null())
        || ids
            .iter()
            .any(|id| !tracks.iter().any(|t| t["id"] == id.as_str()))
        || (ids.is_empty() && !video)
    {
        return Err("Include existing tracks".into());
    }
    let global = op["retimeGlobal"]
        .as_bool()
        .unwrap_or(video || (p["video"].is_null() && ids.len() == tracks.len()));
    let picture = pictures(p);
    let all: Vec<Value> = tracks
        .iter()
        .flat_map(|t| t["segments"].as_array().into_iter().flatten().cloned())
        .chain(picture.clone())
        .collect();
    let duration = all
        .iter()
        .map(|c| c["startTime"].as_f64().unwrap_or(0.0) + c["duration"].as_f64().unwrap_or(0.0))
        .fold(p["minimumDuration"].as_f64().unwrap_or(0.0), f64::max);
    if !["lift", "extract", "insert"].contains(&operation)
        || start < 0.0
        || end <= start
        || start > duration
        || (operation != "insert" && end > duration)
    {
        return Err("Invalid range".into());
    }
    if video {
        let rate = p["frameRate"].as_f64().unwrap_or(25.0);
        if !rate.is_finite() || rate <= 0.0 {
            return Err("Invalid frame rate".into());
        }
        start = (start * rate).round() / rate;
        end = (end * rate).round() / rate;
        if end <= start {
            return Err("Invalid range".into());
        }
    }
    let included = |c: &Value| c["trackId"].as_str().map_or(video, |id| ids.contains(id));
    let affected = |c: &Value| {
        let a = c["startTime"].as_f64().unwrap_or(0.0);
        let b = a + c["duration"].as_f64().unwrap_or(0.0);
        if operation == "insert" || operation == "extract" {
            b > start
        } else {
            a < end && b > start
        }
    };
    let groups: HashSet<&str> = all
        .iter()
        .filter(|c| included(c) && affected(c))
        .filter_map(|c| c["linkGroup"].as_str())
        .collect();
    if all
        .iter()
        .any(|c| !included(c) && c["linkGroup"].as_str().is_some_and(|g| groups.contains(g)))
    {
        return Err("Include all linked picture and sound tracks".into());
    }
    if p["groupEditingEnabled"] != false {
        let groups: HashSet<_> = all
            .iter()
            .filter(|c| included(c) && affected(c))
            .filter_map(|c| c["editGroup"]["id"].as_str())
            .collect();
        if all.iter().any(|c| {
            !included(c)
                && c["editGroup"]["id"]
                    .as_str()
                    .is_some_and(|g| groups.contains(g))
        }) {
            return Err("Include all named edit-group tracks, or disable group editing".into());
        }
    }
    if tracks.iter().any(|t| {
        t["locked"] == true
            && t["id"].as_str().is_some_and(|id| ids.contains(id))
            && t["segments"]
                .as_array()
                .is_some_and(|cs| cs.iter().any(&affected))
    }) || (video && p["video"]["locked"] == true && picture.iter().any(&affected))
    {
        return Err("Unlock affected tracks".into());
    }
    let boundaries = if operation == "insert" {
        vec![start]
    } else {
        vec![start, end]
    };
    if video
        && picture.iter().any(|c| {
            c["transition"] != "cut"
                && boundaries.iter().any(|t| {
                    *t > c["startTime"].as_f64().unwrap_or(0.0)
                        && *t
                            < c["startTime"].as_f64().unwrap_or(0.0)
                                + c["transitionDuration"].as_f64().unwrap_or(0.0)
                })
        })
    {
        return Err("Range boundary crosses a video transition".into());
    }
    if global
        && p["transcript"].as_array().is_some_and(|cs| {
            cs.iter().any(|c| {
                boundaries.iter().any(|t| {
                    *t > c["start"].as_f64().unwrap_or(0.0) && *t < c["end"].as_f64().unwrap_or(0.0)
                })
            })
        })
    {
        return Err("Range boundary crosses a transcript cue".into());
    }
    let length = end - start;
    let mut right_groups: HashMap<String, String> = HashMap::new();
    let mut edit = |c: &Value| -> Result<Vec<Value>> {
        if !included(c) || !affected(c) {
            return Ok(vec![c.clone()]);
        }
        let a = number(c, "startTime")?;
        let b = a + number(c, "duration")?;
        let audio = c.get("trackId").is_some();
        let mut left = c.clone();
        let mut right = c.clone();
        if operation == "insert" && a >= start {
            right["startTime"] = json!(a + length);
            return Ok(vec![right]);
        }
        if operation != "insert" && a >= end {
            if operation == "extract" {
                right["startTime"] = json!(a - length)
            }
            return Ok(vec![right]);
        }
        let mut parts = vec![];
        if a < start {
            left["duration"] = json!(start - a);
            left[if audio { "fadeOutDuration" } else { "fadeOut" }] = json!(0);
            parts.push(left)
        }
        if operation == "insert" || b > end {
            right["id"] = json!(newid());
            if let Some(group) = c["linkGroup"].as_str() {
                right["linkGroup"] =
                    json!(right_groups.entry(group.to_owned()).or_insert_with(newid))
            }
            right["startTime"] = json!(if operation == "extract" { start } else { end });
            let cut = if operation == "insert" { start } else { end };
            right["sourceOffset"] = json!(number(c, "sourceOffset")? + cut - a);
            right["duration"] = json!(b - cut);
            right[if audio { "fadeInDuration" } else { "fadeIn" }] = json!(0);
            if !audio {
                right["transition"] = json!("cut");
                right["transitionDuration"] = json!(0)
            }
            parts.push(right)
        }
        Ok(parts)
    };
    let retime = |t: f64| {
        if operation == "insert" {
            if t >= start {
                t + length
            } else {
                t
            }
        } else if operation == "extract" {
            if t >= end {
                t - length
            } else if t > start {
                start
            } else {
                t
            }
        } else {
            t
        }
    };
    let mut out = p.clone();
    for track in out["tracks"].as_array_mut().unwrap() {
        if !track["id"].as_str().is_some_and(|id| ids.contains(id)) {
            continue;
        }
        let mut clips = vec![];
        for c in track["segments"].as_array().ok_or("Missing segments")? {
            clips.extend(edit(c)?)
        }
        track["segments"] = json!(clips);
        if operation != "lift" {
            if let Some(points) = track["automation"].as_array().filter(|p| !p.is_empty()) {
                let mut changed = vec![];
                for p in points {
                    let t = number(p, "time")?;
                    if operation == "insert" || t < start || t >= end {
                        let mut p = p.clone();
                        p["time"] = json!(retime(t));
                        changed.push(p)
                    }
                }
                if start > 0.0 {
                    let rate = p["sampleRate"].as_f64().unwrap_or(48000.0);
                    if !rate.is_finite() || rate <= 0.0 {
                        return Err("Invalid sample rate".into());
                    }
                    changed.push(
                        json!({"time":(start-1.0/rate).max(0.0),"value":gain_at(points,start)?}),
                    )
                }
                changed.push(json!({"time":if operation=="insert"{end}else{start},"value":gain_at(points,if operation=="insert"{start}else{end})?}));
                changed.sort_by(|a, b| {
                    a["time"]
                        .as_f64()
                        .unwrap()
                        .total_cmp(&b["time"].as_f64().unwrap())
                });
                let mut unique: Vec<Value> = vec![];
                for p in changed {
                    if unique.last().is_some_and(|v| v["time"] == p["time"]) {
                        unique.pop();
                    }
                    unique.push(p)
                }
                track["automation"] = json!(unique);
            }
        }
    }
    if video {
        let mut cs = vec![];
        for c in &picture {
            cs.extend(edit(c)?)
        }
        cs.sort_by(|a, b| {
            a["startTime"]
                .as_f64()
                .unwrap()
                .total_cmp(&b["startTime"].as_f64().unwrap())
        });
        for (i, c) in cs.iter().enumerate() {
            let duration = number(c, "duration")?;
            let offset = number(c, "sourceOffset")?;
            let bound = if let Some(id) = c["sourceId"].as_str() {
                p["video"]["sources"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .find(|s| s["id"] == id)
                    .and_then(|s| s["duration"].as_f64())
                    .unwrap_or(-1.0)
            } else {
                number(&p["video"], "duration")?
            };
            for key in ["fadeIn", "fadeOut"] {
                if let Some(v) = c.get(key) {
                    let fade = v
                        .as_f64()
                        .filter(|n| n.is_finite())
                        .ok_or("Invalid picture fade")?;
                    if fade < 0.0 || fade > duration {
                        return Err("Invalid picture fade after range edit".into());
                    }
                }
            }
            if number(c, "startTime")? < 0.0 || offset < 0.0 || offset + duration > bound + 1e-6 {
                return Err("Invalid picture source bounds".into());
            }
            if number(c, "duration")? < 1.0 / 120.0 {
                return Err("Unsupported picture topology".into());
            }
            if i > 0 {
                let prev = &cs[i - 1];
                let overlap = number(prev, "startTime")? + number(prev, "duration")?
                    - number(c, "startTime")?;
                if overlap > 1e-6
                    && (c["transition"] == "cut"
                        || (overlap - number(c, "transitionDuration")?).abs() > 1e-6
                        || overlap >= number(prev, "duration")?.min(number(c, "duration")?)
                        || (i > 1
                            && number(&cs[i - 2], "startTime")? + number(&cs[i - 2], "duration")?
                                > number(c, "startTime")? + 1e-6))
                {
                    return Err("Unsupported picture overlap after range edit".into());
                }
            }
        }
        out["video"]["clips"] = json!(cs);
        let v = out["video"].as_object_mut().unwrap();
        v.remove("inPoint");
        v.remove("outPoint");
    }
    if global {
        if let Some(floor) = p["minimumDuration"].as_f64() {
            out["minimumDuration"] = json!(retime(floor));
        }
        if let Some(markers) = p["markers"].as_array() {
            out["markers"] = json!(markers
                .iter()
                .filter(|m| operation != "extract"
                    || m["time"].as_f64().unwrap_or(0.0) < start
                    || m["time"].as_f64().unwrap_or(0.0) >= end)
                .map(|m| {
                    let mut m = m.clone();
                    m["time"] = json!(retime(m["time"].as_f64().unwrap_or(0.0)));
                    m
                })
                .collect::<Vec<_>>())
        }
        if let Some(cues) = p["transcript"].as_array() {
            out["transcript"] = json!(cues
                .iter()
                .filter(|c| operation == "insert"
                    || c["end"].as_f64().unwrap_or(0.0) <= start
                    || c["start"].as_f64().unwrap_or(0.0) >= end)
                .map(|c| {
                    let mut c = c.clone();
                    c["start"] = json!(retime(c["start"].as_f64().unwrap_or(0.0)));
                    c["end"] = json!(retime(c["end"].as_f64().unwrap_or(0.0)));
                    c
                })
                .collect::<Vec<_>>())
        }
    }
    if operation == "lift" {
        out["editRange"] = json!({"start":start,"end":end})
    } else {
        out.as_object_mut().unwrap().remove("editRange");
    }
    let new_duration = out["tracks"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|t| t["segments"].as_array().into_iter().flatten())
        .cloned()
        .chain(pictures(&out))
        .map(|c| c["startTime"].as_f64().unwrap_or(0.0) + c["duration"].as_f64().unwrap_or(0.0))
        .fold(out["minimumDuration"].as_f64().unwrap_or(0.0), f64::max);
    out["duration"] = json!(new_duration);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn project() -> Value {
        json!({"sampleRate":48000,"duration":10,"tracks":[{"id":"mic","segments":[{"id":"a","trackId":"mic","linkGroup":"av","sourceId":"s","startTime":0,"duration":10,"sourceOffset":0}],"automation":[{"time":0,"value":0},{"time":10,"value":1}]},{"id":"music","rippleEnabled":false,"segments":[]}],"video":{"path":"a.mp4","duration":10,"clips":[{"id":"v","linkGroup":"av","startTime":0,"duration":10,"sourceOffset":0,"fadeIn":0,"fadeOut":0,"transition":"cut","transitionDuration":0}]},"markers":[{"id":"m","time":8}],"transcript":[{"id":"c","start":7,"end":9,"text":"answer"}]})
    }
    #[test]
    fn named_scope_requires_all_members_until_grouping_is_disabled() {
        let group = json!({"id":"group","name":"Section"});
        let mut p = json!({"sampleRate":48000,"duration":10,"tracks":[{"id":"a","segments":[{"id":"one","trackId":"a","startTime":0,"duration":10,"sourceOffset":0,"editGroup":group}]},{"id":"b","segments":[{"id":"two","trackId":"b","startTime":0,"duration":10,"sourceOffset":0,"editGroup":group}]}]});
        let operation = json!({"start":3,"end":5,"trackIds":["a"]});
        assert!(apply(&p, &operation).is_err());
        p["groupEditingEnabled"] = json!(false);
        let out = apply(&p, &operation).unwrap();
        assert_eq!(out["tracks"][1], p["tracks"][1]);
    }
    #[test]
    fn scoped_extract_preserves_links_and_global_clock() {
        let p = project();
        let out = apply(&p, &json!({"start":3,"end":5})).unwrap();
        assert_eq!(out["duration"], 8.0);
        assert_eq!(out["tracks"][1], p["tracks"][1]);
        assert_eq!(out["tracks"][0]["segments"][1]["sourceOffset"], 5.0);
        assert_eq!(
            out["tracks"][0]["segments"][1]["linkGroup"],
            out["video"]["clips"][1]["linkGroup"]
        );
        assert_eq!(out["markers"][0]["time"], 6.0);
        assert_eq!(out["transcript"][0]["start"], 5.0);
        assert!(
            (gain_at(out["tracks"][0]["automation"].as_array().unwrap(), 5.0).unwrap() - 0.7).abs()
                < 1e-6
        );
    }
    #[test]
    fn lift_and_insert_preserve_source_offsets() {
        let p = project();
        let lift = apply(&p, &json!({"operation":"lift","start":3,"end":5})).unwrap();
        let insert = apply(&p, &json!({"operation":"insert","start":3,"end":5})).unwrap();
        assert_eq!(lift["tracks"][0]["segments"][1]["startTime"], 5.0);
        assert_eq!(lift["tracks"][0]["segments"][1]["sourceOffset"], 5.0);
        assert_eq!(insert["tracks"][0]["segments"][1]["sourceOffset"], 3.0);
        assert_eq!(insert["duration"], 12.0);
    }
    #[test]
    fn rejects_partial_links_locks_and_crossed_cues() {
        let mut p = project();
        assert!(apply(&p, &json!({"start":3,"end":5,"includeVideo":false})).is_err());
        p["tracks"][0]["locked"] = json!(true);
        assert!(apply(&p, &json!({"start":3,"end":5})).is_err());
        p["tracks"][0]["locked"] = json!(false);
        assert!(apply(&p, &json!({"start":8,"end":9})).is_err());
    }
}
