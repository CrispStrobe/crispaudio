//! Bounded automation copy/paste on a relative clock. Mirrors gainEnvelope.ts.
use crate::Result;
use serde_json::{json, Value};
fn number(v: &Value, key: &str) -> Result<f64> {
    v[key]
        .as_f64()
        .filter(|n| n.is_finite())
        .ok_or_else(|| format!("Missing finite {key}"))
}
#[cfg(test)]
fn points(v: &Value) -> Result<Vec<Value>> {
    parameter_points(v, false)
}
fn parameter_points(v: &Value, pan: bool) -> Result<Vec<Value>> {
    let mut out = if v.is_null() {
        vec![]
    } else {
        v.as_array().ok_or("Invalid gain envelope")?.clone()
    };
    for p in &out {
        if number(p, "time")? < 0.0
            || if pan {
                !(-1.0..=1.0).contains(&number(p, "value")?)
            } else {
                number(p, "value")? < 0.0
            }
        {
            return Err("Invalid gain envelope".into());
        }
    }
    out.sort_by(|a, b| {
        a["time"]
            .as_f64()
            .unwrap()
            .total_cmp(&b["time"].as_f64().unwrap())
    });
    out.reverse();
    out.dedup_by(|a, b| a["time"].as_f64() == b["time"].as_f64());
    out.reverse();
    Ok(out)
}
#[cfg(test)]
fn at(points: &[Value], t: f64) -> f64 {
    at_parameter(points, t, 1.0)
}
fn at_parameter(points: &[Value], t: f64, fallback: f64) -> f64 {
    if points.is_empty() {
        return fallback;
    }
    let time = |p: &Value| p["time"].as_f64().unwrap();
    let value = |p: &Value| p["value"].as_f64().unwrap();
    if t <= time(&points[0]) {
        return value(&points[0]);
    }
    for pair in points.windows(2) {
        let a = &pair[0];
        let b = &pair[1];
        if t < time(b) {
            return value(a) + (value(b) - value(a)) * (t - time(a)) / (time(b) - time(a));
        }
    }
    value(points.last().unwrap())
}
fn track<'a>(project: &'a Value, id: &Value) -> Result<&'a Value> {
    project["tracks"]
        .as_array()
        .ok_or("Missing tracks")?
        .iter()
        .find(|t| t["id"] == *id && id.is_string())
        .ok_or_else(|| "Missing automation track".into())
}
pub fn paste(project: &Value, op: &Value) -> Result<Value> {
    let pan = match op.get("parameter") {
        None => false,
        Some(v) => match v.as_str() {
            Some("gain") => false,
            Some("pan") => true,
            _ => return Err("Unknown automation parameter".into()),
        },
    };
    let field = if pan { "panAutomation" } else { "automation" };
    let parameter = if pan { "pan" } else { "gain" };
    let target = track(project, &op["trackId"])?;
    if target["locked"].as_bool() == Some(true) {
        return Err("Unlock destination track before pasting automation".into());
    }
    let canvas = crate::project_edit::timeline_duration(project);
    let envelope = if let Some(envelope) = op.get("envelope") {
        if !envelope.is_object()
            || !envelope["points"].is_array()
            || op.get("sourceTrackId").is_some()
        {
            return Err("Expected one gain envelope source".into());
        }
        if envelope["parameter"].as_str().unwrap_or("gain") != parameter {
            return Err("Envelope parameter mismatch".into());
        }
        envelope.clone()
    } else {
        let source = track(project, &op["sourceTrackId"])?;
        let start = number(op, "sourceStart")?;
        let end = number(op, "sourceEnd")?;
        if start < 0.0 || end <= start || end > canvas {
            return Err("Invalid automation copy range".into());
        }
        let fallback = if pan {
            source["pan"]
                .as_f64()
                .filter(|n| n.is_finite())
                .unwrap_or(0.0)
                .clamp(-1.0, 1.0)
        } else {
            1.0
        };
        let source = parameter_points(&source[field], pan)?;
        let mut copied = vec![json!({"time":0,"value":at_parameter(&source,start,fallback)})];
        for point in source
            .iter()
            .filter(|p| p["time"].as_f64().unwrap() > start && p["time"].as_f64().unwrap() < end)
        {
            let mut point = point.clone();
            point["time"] = json!(point["time"].as_f64().unwrap() - start);
            copied.push(point);
        }
        copied.push(json!({"time":end-start,"value":at_parameter(&source,end,fallback)}));
        json!({"duration":end-start,"points":copied})
    };
    let source_duration = number(&envelope, "duration")?;
    if source_duration <= 0.0 {
        return Err("Invalid gain envelope duration".into());
    }
    let source = parameter_points(&envelope["points"], pan)?;
    let source_fallback = if pan { 0.0 } else { 1.0 };
    if source
        .iter()
        .any(|p| p["time"].as_f64().unwrap() > source_duration)
    {
        return Err("Point outside copied envelope".into());
    }
    let time = number(op, "time")?;
    let duration = if op.get("duration").is_some() {
        number(op, "duration")?
    } else {
        source_duration
    };
    let rate = number(project, "sampleRate")?;
    let end = time + duration;
    if rate <= 0.0 || time < 0.0 || duration < 1.0 / rate || end > canvas || !end.is_finite() {
        return Err("Invalid automation paste range".into());
    }
    let before = parameter_points(&target[field], pan)?;
    let fallback = if pan {
        target["pan"]
            .as_f64()
            .filter(|n| n.is_finite())
            .unwrap_or(0.0)
            .clamp(-1.0, 1.0)
    } else {
        1.0
    };
    let left = (time - 1.0 / rate).max(0.0);
    let right = (end + 1.0 / rate).min(canvas);
    let mut result: Vec<Value> = before
        .iter()
        .filter(|p| {
            let t = p["time"].as_f64().unwrap();
            t < left || t > right
        })
        .cloned()
        .collect();
    if time > 0.0 {
        result.push(json!({"time":left,"value":at_parameter(&before,left,fallback)}));
    }
    result.push(json!({"time":time,"value":at_parameter(&source,0.0,source_fallback)}));
    for point in source.iter().filter(|p| {
        let t = p["time"].as_f64().unwrap();
        t > 0.0 && t < source_duration
    }) {
        let mut point = point.clone();
        point["time"] = json!(time + point["time"].as_f64().unwrap() / source_duration * duration);
        result.push(point);
    }
    result.push(json!({"time":end,"value":at_parameter(&source,source_duration,source_fallback)}));
    if end < canvas {
        result.push(json!({"time":right,"value":at_parameter(&before,right,fallback)}));
    }
    let result = parameter_points(&json!(result), pan)?;
    if before.iter().chain(&result).all(|p| {
        let t = p["time"].as_f64().unwrap();
        let a = at_parameter(&before, t, fallback);
        let b = at_parameter(&result, t, fallback);
        (a - b).abs() <= 1e-12 * a.abs().max(b.abs()).max(1.0)
    }) {
        return Ok(project.clone());
    }
    let mut out = project.clone();
    out["tracks"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|t| t["id"] == op["trackId"])
        .unwrap()[field] = json!(result);
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn project() -> Value {
        json!({"sampleRate":48000,"duration":10,"minimumDuration":10,"tracks":[{"id":"a","locked":true,"automation":[{"time":0,"value":0},{"time":4,"value":1}],"segments":[]},{"id":"b","automation":[{"time":0,"value":0.2},{"time":10,"value":0.7}],"segments":[]}]})
    }
    #[test]
    fn pan_copy_static_fallback_guards_noops_and_portable_parameter_validation() {
        let mut p = project();
        p["tracks"][0]["panAutomation"] =
            json!([{"time":0,"value":-1},{"time":4,"value":1},{"time":8,"value":-1}]);
        p["tracks"][1]["pan"] = json!(0.6);
        let op = json!({"parameter":"pan","trackId":"b","sourceTrackId":"a","sourceStart":1,"sourceEnd":7,"time":4,"duration":3});
        let out = paste(&p, &op).unwrap();
        let ps = parameter_points(&out["tracks"][1]["panAutomation"], true).unwrap();
        assert_eq!(at_parameter(&ps, 5.5, 0.6), 1.0);
        assert_eq!(at_parameter(&ps, 0.0, 0.6), 0.6);
        assert_eq!(out["tracks"][1]["automation"], p["tracks"][1]["automation"]);
        let portable = json!({"parameter":"pan","trackId":"b","time":4,"duration":3,"envelope":{"parameter":"pan","duration":6,"points":[{"time":0,"value":-0.5},{"time":3,"value":1},{"time":6,"value":-0.5}]}});
        assert_eq!(paste(&p, &portable).unwrap(), out);
        let mut wrong = portable.clone();
        wrong["envelope"]["parameter"] = json!("gain");
        assert!(paste(&p, &wrong).is_err());
        wrong["envelope"]["parameter"] = json!("pan");
        wrong["envelope"]["points"][0]["value"] = json!(-2);
        assert!(paste(&p, &wrong).is_err());
        assert_eq!(paste(&p,&json!({"parameter":"pan","trackId":"b","sourceTrackId":"b","sourceStart":1,"sourceEnd":3,"time":4})).unwrap(),p);
    }
    #[test]
    fn stretched_copy_keeps_outside_gain_and_does_not_move_media() {
        let p = project();
        let out=paste(&p,&json!({"trackId":"b","sourceTrackId":"a","sourceStart":1,"sourceEnd":3,"time":4,"duration":4})).unwrap();
        let ps = points(&out["tracks"][1]["automation"]).unwrap();
        assert_eq!(at(&ps, 4.0), 0.25);
        assert_eq!(at(&ps, 6.0), 0.5);
        assert_eq!(at(&ps, 8.0), 0.75);
        let old = points(&p["tracks"][1]["automation"]).unwrap();
        for time in [
            0.0,
            3.0,
            4.0 - 1.0 / 48000.0,
            8.0 + 1.0 / 48000.0,
            9.0,
            10.0,
        ] {
            assert!((at(&ps, time) - at(&old, time)).abs() < 1e-12);
        }
        assert_eq!(out["tracks"][0], p["tracks"][0]);
        assert_eq!(out["duration"], p["duration"]);
    }
    #[test]
    fn portable_identity_is_noop_and_invalid_or_locked_pastes_fail() {
        let p = project();
        assert_eq!(
            paste(
                &p,
                &json!({"trackId":"b","sourceTrackId":"b","sourceStart":0,"sourceEnd":10,"time":0})
            )
            .unwrap(),
            p
        );
        let mut op = json!({"trackId":"b","envelope":{"duration":2,"points":[{"time":0,"value":0},{"time":2,"value":1}]},"time":9});
        assert!(paste(&p, &op).is_err());
        op["time"] = json!(2);
        op["trackId"] = json!("a");
        assert!(paste(&p, &op).is_err());
        op["trackId"] = json!("b");
        op["envelope"]["points"][0]["value"] = json!(-1);
        assert!(paste(&p, &op).is_err());
    }
}
