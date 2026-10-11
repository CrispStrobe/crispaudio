//! Reviewed shapes baked into ordinary points for portable editing/rendering.
use crate::gain_envelope::{at_parameter, parameter_points};
use crate::Result;
use serde_json::{json, Value};
fn number(v: &Value, key: &str) -> Result<f64> {
    v[key]
        .as_f64()
        .filter(|n| n.is_finite())
        .ok_or_else(|| format!("Missing finite {key}"))
}
pub(crate) fn apply(project: &Value, op: &Value) -> Result<Value> {
    let parameter = op["parameter"].as_str().ok_or("Missing parameter")?;
    let maximum = match parameter {
        "gain" => f64::INFINITY,
        "pan" | "mix" => 1.0,
        "feedback" => 0.95,
        "time" => 2.0,
        _ => return Err("Unsupported automation parameter".into()),
    };
    let shape = op["shape"].as_str().ok_or("Missing shape")?;
    if !["linear", "ease-in", "ease-out", "s-curve"].contains(&shape) {
        return Err("Unsupported automation shape".into());
    }
    let id = op["trackId"].as_str().ok_or("Missing track id")?;
    let tracks = project["tracks"].as_array().ok_or("Missing tracks")?;
    let ti = tracks
        .iter()
        .position(|t| t["id"] == id)
        .ok_or("Missing track")?;
    let track = &tracks[ti];
    if track["locked"] == true {
        return Err("Track is locked".into());
    }
    let fx = !["gain", "pan"].contains(&parameter);
    let index = if fx {
        Some(op["effectIndex"].as_u64().ok_or("Missing effect index")? as usize)
    } else {
        None
    };
    let field = if parameter == "gain" {
        "automation"
    } else {
        "panAutomation"
    };
    let before = if let Some(index) = index {
        let effect = track["effects"]
            .as_array()
            .and_then(|r| r.get(index))
            .ok_or("Missing effect")?;
        if effect["type"] != "delay" {
            return Err("Only delay parameters supported".into());
        }
        &effect["automation"][parameter]
    } else {
        &track[field]
    };
    let original = parameter_points(before, parameter == "pan")?;
    if original
        .iter()
        .any(|p| p["value"].as_f64().unwrap() > maximum)
    {
        return Err("Invalid automation value".into());
    }
    let point_time = number(op, "pointTime")?;
    let rate = number(project, "sampleRate")?;
    let i = original
        .iter()
        .position(|p| p["time"].as_f64() == Some(point_time))
        .ok_or("Missing point")?;
    let a = &original[i];
    let b = original.get(i + 1).ok_or("Missing following point")?;
    let end = number(b, "time")?;
    let duration = end - point_time;
    if rate <= 0.0
        || end > crate::project_edit::timeline_duration(project)
        || duration < 2.0 / rate - 1e-12
    {
        return Err("Invalid shape bounds".into());
    }
    let intervals = if shape == "linear" {
        1
    } else {
        ((duration * rate + 1e-9).floor() as usize).clamp(2, 16)
    };
    if original.len() + intervals - 1 > 100000 {
        return Err("Automation point limit".into());
    }
    let mut first = a.clone();
    first
        .as_object_mut()
        .ok_or("Invalid point")?
        .remove("curve");
    let mut result = original[..i].to_vec();
    result.push(first);
    let av = number(a, "value")?;
    let bv = number(b, "value")?;
    for j in 1..intervals {
        let p = j as f64 / intervals as f64;
        let progress = match shape {
            "ease-in" => p * p,
            "ease-out" => p * (2.0 - p),
            "s-curve" => p * p * (3.0 - 2.0 * p),
            _ => p,
        };
        result.push(json!({"time":point_time+duration*j as f64/intervals as f64,"value":av+(bv-av)*progress}));
    }
    result.extend_from_slice(&original[i + 1..]);
    let old_segment = vec![a.clone(), b.clone()];
    let new_segment = &result[i..i + intervals + 1];
    if crate::automation_curve::check_times(&old_segment, new_segment)
        .iter()
        .all(|&t| {
            let a = at_parameter(&old_segment, t, 0.0);
            let b = at_parameter(new_segment, t, 0.0);
            (a - b).abs() <= 1e-12 * a.abs().max(b.abs()).max(1.0)
        })
    {
        return Ok(project.clone());
    }
    let mut out = project.clone();
    if let Some(index) = index {
        out["tracks"][ti]["effects"][index]["automation"][parameter] = json!(result)
    } else {
        out["tracks"][ti][field] = json!(result)
    };
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shapes_all_parameters_without_changing_outside_or_geometry() {
        let points = json!([{"time":0,"value":0.2,"curve":"step"},{"time":1,"value":0.1},{"time":3,"value":0.8,"curve":"step"},{"time":5,"value":0.3}]);
        let p = json!({"sampleRate":48000,"minimumDuration":8,"duration":8,"tracks":[{"id":"t","segments":[],"automation":points,"panAutomation":points,"effects":[{"type":"delay","params":{"time":1.5},"automation":{"mix":points,"feedback":points,"time":points}}]}]});
        for parameter in ["gain", "pan", "mix", "feedback", "time"] {
            for shape in ["ease-in", "ease-out", "s-curve"] {
                let op = json!({"trackId":"t","parameter":parameter,"effectIndex":0,"pointTime":1,"shape":shape});
                let out = apply(&p, &op).unwrap();
                let points = if parameter == "gain" {
                    &out["tracks"][0]["automation"]
                } else if parameter == "pan" {
                    &out["tracks"][0]["panAutomation"]
                } else {
                    &out["tracks"][0]["effects"][0]["automation"][parameter]
                };
                let points = points.as_array().unwrap();
                assert_eq!(points.len(), 19);
                assert_eq!(points[0], p["tracks"][0]["automation"][0]);
                assert_eq!(points[17], p["tracks"][0]["automation"][2]);
                assert_eq!(points[18], p["tracks"][0]["automation"][3]);
                let expected = match shape {
                    "ease-in" => 0.275,
                    "ease-out" => 0.625,
                    _ => 0.45,
                };
                assert!((at_parameter(points, 2.0, 0.0) - expected).abs() < 1e-14);
            }
        }
    }
    #[test]
    fn locks_last_points_invalid_shapes_and_identity_are_protected() {
        let p = json!({"sampleRate":48000,"minimumDuration":4,"tracks":[{"id":"t","segments":[],"automation":[{"time":0,"value":0},{"time":4,"value":1}]}]});
        let op = json!({"trackId":"t","parameter":"gain","pointTime":0,"shape":"linear"});
        assert_eq!(apply(&p, &op).unwrap(), p);
        let mut bad = op.clone();
        bad["pointTime"] = json!(4);
        assert!(apply(&p, &bad).is_err());
        bad = op.clone();
        bad["shape"] = json!("bezier");
        assert!(apply(&p, &bad).is_err());
        let mut locked = p;
        locked["tracks"][0]["locked"] = json!(true);
        assert!(apply(&locked, &op).is_err());
    }
}
