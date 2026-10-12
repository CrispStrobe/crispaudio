//! Explicitly reviewed, bounded automation intervals; project modes are session-only.
use crate::Result;
use serde_json::{json, Value};
fn num(v: &Value, key: &str) -> Result<f64> {
    v[key]
        .as_f64()
        .filter(|n| n.is_finite())
        .ok_or_else(|| format!("Missing finite {key}"))
}
fn at(points: &[Value], time: f64, fallback: f64) -> Result<f64> {
    if points.is_empty() {
        return Ok(fallback);
    }
    if time <= num(&points[0], "time")? {
        return num(&points[0], "value");
    }
    let i = points.partition_point(|p| p["time"].as_f64().unwrap() <= time);
    if i == points.len() {
        return num(points.last().unwrap(), "value");
    }
    let a = num(&points[i - 1], "time")?;
    let b = num(&points[i], "time")?;
    let value = num(&points[i - 1], "value")?;
    Ok(if crate::automation_curve::step(&points[i - 1]) {
        value
    } else {
        value + (num(&points[i], "value")? - value) * (time - a) / (b - a)
    })
}
pub(crate) fn apply(project: &Value, op: &Value) -> Result<Value> {
    let parameter = op["parameter"].as_str().ok_or("Missing parameter")?;
    if !["gain", "pan", "mix", "feedback", "time", "depth", "rate"].contains(&parameter) {
        return Err("Unsupported parameter".into());
    }
    let tracks = project["tracks"].as_array().ok_or("Missing tracks")?;
    let ti = tracks
        .iter()
        .position(|t| t["id"] == op["trackId"])
        .ok_or("Missing track")?;
    let track = &tracks[ti];
    if track["locked"] == true {
        return Err("Track is locked".into());
    }
    let index = if ["mix", "feedback", "time", "depth", "rate"].contains(&parameter) {
        Some(op["effectIndex"].as_u64().ok_or("Missing effect index")? as usize)
    } else {
        None
    };
    let field = if parameter == "gain" {
        "automation"
    } else {
        "panAutomation"
    };
    let (before, fallback) = if let Some(index) = index {
        let e = track["effects"]
            .as_array()
            .and_then(|r| r.get(index))
            .ok_or("Missing effect")?;
        if !crate::effect_envelope::supports(e, parameter) {
            return Err("Unsupported effect parameter".into());
        }
        (
            e["automation"][parameter].clone(),
            e["params"][parameter]
                .as_f64()
                .unwrap_or(if parameter == "rate" {
                    1.5
                } else if parameter == "depth" {
                    0.5
                } else if e["type"] == "ringmod"
                    || e["type"] == "bitcrush"
                    || e["type"] == "distortion"
                {
                    0.5
                } else if parameter == "feedback" {
                    0.4
                } else {
                    0.3
                })
                .clamp(
                    0.0,
                    match parameter {
                        "time" => 2.0,
                        "rate" => 8.0,
                        "feedback" => 0.95,
                        _ => 1.0,
                    },
                ),
        )
    } else {
        (
            track[field].clone(),
            if parameter == "gain" {
                1.0
            } else {
                track["pan"].as_f64().unwrap_or(0.0).clamp(-1.0, 1.0)
            },
        )
    };
    let mut before = if before.is_null() {
        vec![]
    } else {
        before.as_array().ok_or("Invalid envelope")?.clone()
    };
    let minimum = if parameter == "pan" { -1.0 } else { 0.0 };
    let maximum = match parameter {
        "pan" | "mix" | "depth" => 1.0,
        "feedback" => 0.95,
        "time" => 2.0,
        "rate" => 8.0,
        _ => f64::INFINITY,
    };
    for p in &before {
        crate::automation_curve::validate(p)?;
        if num(p, "time")? < 0.0 || num(p, "value")? < minimum || num(p, "value")? > maximum {
            return Err("Invalid envelope".into());
        }
    }
    before.sort_by(|a, b| {
        a["time"]
            .as_f64()
            .unwrap()
            .total_cmp(&b["time"].as_f64().unwrap())
    });
    before.reverse();
    before.dedup_by(|a, b| a["time"].as_f64() == b["time"].as_f64());
    before.reverse();
    let rate = num(project, "sampleRate")?;
    let canvas = crate::project_edit::timeline_duration(project);
    if rate <= 0.0 {
        return Err("Invalid sample rate".into());
    }
    let spans = op["spans"].as_array().ok_or("Missing spans")?;
    if spans.len() > 1000 {
        return Err("Too many spans".into());
    }
    let mut points = before.clone();
    let mut last = f64::NEG_INFINITY;
    let mut count = 0;
    for span in spans {
        let supplied = span["points"].as_array().ok_or("Missing points")?;
        count += supplied.len();
        if supplied.len() < 2 || count > 100000 {
            return Err("Invalid pass size".into());
        }
        let mut prior = f64::NEG_INFINITY;
        for p in supplied {
            crate::automation_curve::validate(p)?;
            let time = num(p, "time")?;
            let value = num(p, "value")?;
            if time <= prior || value < minimum || value > maximum {
                return Err("Invalid pass points".into());
            }
            prior = time;
        }
        let start = num(&supplied[0], "time")?;
        let end = num(supplied.last().unwrap(), "time")?;
        if start < 0.0 || end > canvas || end - start < 1.0 / rate || start <= last {
            return Err("Invalid pass bounds".into());
        }
        last = end;
        let left = (start - 1.0 / rate).max(0.0);
        let right = (end + 1.0 / rate).min(canvas);
        points
            .retain(|p| p["time"].as_f64().unwrap() < left || p["time"].as_f64().unwrap() > right);
        if start > 0.0 {
            points.push(json!({"time":left,"value":at(&before,left,fallback)?}))
        }
        points.extend(supplied.iter().enumerate().map(|(i, p)| {
            let mut p = p.clone();
            if i == supplied.len() - 1 {
                p.as_object_mut().unwrap().remove("curve");
            }
            p
        }));
        if end < canvas {
            let mut guard = json!({"time":right,"value":at(&before,right,fallback)?});
            crate::automation_curve::decorate(&mut guard, &before, right);
            points.push(guard)
        }
    }
    points.sort_by(|a, b| {
        a["time"]
            .as_f64()
            .unwrap()
            .total_cmp(&b["time"].as_f64().unwrap())
    });
    points.reverse();
    points.dedup_by(|a, b| a["time"].as_f64() == b["time"].as_f64());
    points.reverse();
    if crate::automation_curve::check_times(&before, &points)
        .iter()
        .all(|&time| {
            let a = at(&before, time, fallback).unwrap();
            let b = at(&points, time, fallback).unwrap();
            (a - b).abs() <= 1e-12 * a.abs().max(1.0)
        })
    {
        return Ok(project.clone());
    }
    let mut out = project.clone();
    if let Some(index) = index {
        let e = &mut out["tracks"][ti]["effects"][index];
        if e["automation"].is_null() {
            e["automation"] = json!({})
        }
        if !e["automation"].is_object() {
            return Err("Invalid effect automation".into());
        }
        e["automation"][parameter] = json!(points)
    } else {
        out["tracks"][ti][field] = json!(points)
    }
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_other_parameters_and_geometry() {
        let p = json!({"duration":5,"minimumDuration":5,"sampleRate":48000,"tracks":[{"id":"t","pan":0.2,"segments":[],"effects":[{"type":"delay","params":{"mix":0.3},"automation":{"feedback":[{"time":0,"value":0.4}]}}]}]});
        let op = json!({"trackId":"t","parameter":"mix","effectIndex":0,"spans":[{"points":[{"time":1,"value":1},{"time":2,"value":0}]}]});
        let out = apply(&p, &op).unwrap();
        assert_eq!(out["duration"], p["duration"]);
        assert_eq!(
            out["tracks"][0]["effects"][0]["automation"]["feedback"],
            p["tracks"][0]["effects"][0]["automation"]["feedback"]
        );
        assert_eq!(
            out["tracks"][0]["effects"][0]["automation"]["mix"][0]["value"],
            json!(0.3)
        );
        let mut locked = p.clone();
        locked["tracks"][0]["locked"] = json!(true);
        assert!(apply(&locked, &op).is_err());
        let mut bad = op.clone();
        bad["spans"][0]["points"][0]["value"] = json!(2);
        assert!(apply(&p, &bad).is_err());
    }
    #[test]
    fn delay_time_pass_accepts_seconds_above_one_and_keeps_other_lanes() {
        let p = json!({"duration":8,"minimumDuration":8,"sampleRate":48000,"tracks":[{"id":"t","segments":[],"effects":[{"type":"delay","params":{"time":1.5},"automation":{"mix":[{"time":0,"value":0.5}],"time":[{"time":0,"value":1.2,"curve":"step"},{"time":4,"value":2}]}}]}]});
        let op = json!({"trackId":"t","effectIndex":0,"parameter":"time","spans":[{"points":[{"time":1,"value":1.8},{"time":2,"value":1.9}]}]});
        let out = apply(&p, &op).unwrap();
        assert_eq!(
            out["tracks"][0]["effects"][0]["automation"]["mix"],
            p["tracks"][0]["effects"][0]["automation"]["mix"]
        );
        assert_eq!(
            out["tracks"][0]["effects"][0]["automation"]["time"][4]["curve"],
            "step"
        );
        let mut bad = op;
        bad["spans"][0]["points"][0]["value"] = json!(2.001);
        assert!(apply(&p, &bad).is_err());
    }
}
