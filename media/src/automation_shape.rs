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
fn cubic(p: f64, a: f64, b: f64) -> f64 {
    3.0 * (1.0 - p) * (1.0 - p) * p * a + 3.0 * (1.0 - p) * p * p * b + p * p * p
}
fn custom_progress(x: f64, c: [f64; 4]) -> f64 {
    if x == 0.0 || x == 1.0 {
        return x;
    }
    let (mut lo, mut hi) = (0.0, 1.0);
    for _ in 0..48 {
        let mid = (lo + hi) / 2.0;
        if cubic(mid, c[0], c[2]) < x {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    cubic((lo + hi) / 2.0, c[1], c[3])
}
pub(crate) fn validate_review(point: &Value) -> Result<()> {
    let Some(m) = point.get("shapeReview") else {
        return Ok(());
    };
    let shape = m["shape"].as_str().ok_or("Invalid shape review")?;
    if !m.is_object()
        || !["ease-in", "ease-out", "s-curve", "custom"].contains(&shape)
        || !m["intervals"]
            .as_u64()
            .is_some_and(|n| (2..=16).contains(&n))
    {
        return Err("Invalid shape review".into());
    }
    if shape == "custom" {
        let c = &m["controls"];
        let values = [
            number(c, "x1")?,
            number(c, "y1")?,
            number(c, "x2")?,
            number(c, "y2")?,
        ];
        if !c.is_object() || values.iter().any(|v| *v < 0.0 || *v > 1.0) || values[0] > values[2] {
            return Err("Invalid shape controls".into());
        }
    } else if m.get("controls").is_some() {
        return Err("Unexpected shape controls".into());
    }
    Ok(())
}
fn reviewed_end(points: &[Value], i: usize) -> Option<usize> {
    let a = points.get(i)?;
    validate_review(a).ok()?;
    let m = a.get("shapeReview")?;
    let n = m["intervals"].as_u64()? as usize;
    let end = i + n;
    let b = points.get(end)?;
    let at = a["time"].as_f64()?;
    let bt = b["time"].as_f64()?;
    let av = a["value"].as_f64()?;
    let bv = b["value"].as_f64()?;
    if bt <= at {
        return None;
    }
    for j in 0..n {
        let point = points.get(i + j)?;
        if point["curve"] == "step" || j > 0 && point.get("shapeReview").is_some() {
            return None;
        }
        let phase = j as f64 / n as f64;
        let progress = match m["shape"].as_str()? {
            "ease-in" => phase * phase,
            "ease-out" => phase * (2.0 - phase),
            "s-curve" => phase * phase * (3.0 - 2.0 * phase),
            "custom" => {
                let c = &m["controls"];
                custom_progress(
                    phase,
                    [
                        c["x1"].as_f64()?,
                        c["y1"].as_f64()?,
                        c["x2"].as_f64()?,
                        c["y2"].as_f64()?,
                    ],
                )
            }
            _ => return None,
        };
        let value = av + (bv - av) * progress;
        let actual = point["value"].as_f64()?;
        if (point["time"].as_f64()? - (at + (bt - at) * phase)).abs() > 1e-9 * (bt - at).max(1.0)
            || (actual - value).abs() > 1e-12 * actual.abs().max(value.abs()).max(1.0)
        {
            return None;
        }
    }
    Some(end)
}
pub(crate) fn apply(project: &Value, op: &Value) -> Result<Value> {
    let parameter = op["parameter"].as_str().ok_or("Missing parameter")?;
    let maximum = match parameter {
        "gain" => f64::INFINITY,
        "pan" | "mix" | "depth" => 1.0,
        "feedback" => 0.95,
        "time" => 2.0,
        _ => return Err("Unsupported automation parameter".into()),
    };
    let shape = op["shape"].as_str().ok_or("Missing shape")?;
    if !["linear", "ease-in", "ease-out", "s-curve", "custom"].contains(&shape) {
        return Err("Unsupported automation shape".into());
    }
    let controls = if shape == "custom" {
        let c = &op["controls"];
        let values = [
            number(c, "x1")?,
            number(c, "y1")?,
            number(c, "x2")?,
            number(c, "y2")?,
        ];
        if values.iter().any(|v| *v < 0.0 || *v > 1.0) || values[0] > values[2] {
            return Err("Invalid shape controls".into());
        }
        Some(values)
    } else {
        None
    };
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
        if !crate::effect_envelope::supports(effect, parameter) {
            return Err("Unsupported effect parameter".into());
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
    let end_index = reviewed_end(&original, i).unwrap_or(i + 1);
    let b = original.get(end_index).ok_or("Missing following point")?;
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
    if original.len() + intervals - (end_index - i) > 100000 {
        return Err("Automation point limit".into());
    }
    let mut first = a.clone();
    first
        .as_object_mut()
        .ok_or("Invalid point")?
        .remove("curve");
    first.as_object_mut().unwrap().remove("shapeReview");
    if shape != "linear" {
        let mut review = json!({"shape":shape,"intervals":intervals});
        if shape == "custom" {
            review["controls"] = op["controls"].clone();
        }
        first["shapeReview"] = review;
    }
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
            "custom" => custom_progress(p, controls.unwrap()),
            _ => p,
        };
        result.push(json!({"time":point_time+duration*j as f64/intervals as f64,"value":av+(bv-av)*progress}));
    }
    result.extend_from_slice(&original[end_index..]);
    let old_segment = original[i..end_index + 1].to_vec();
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
    fn whole_shape_copy_and_stretch_preserve_reopening() {
        let p = json!({"sampleRate":48000,"minimumDuration":8,"tracks":[{"id":"t","segments":[],"automation":[{"time":0,"value":0.2},{"time":2,"value":0.8},{"time":8,"value":0.1}]}]});
        let op = json!({"trackId":"t","parameter":"gain","pointTime":0,"shape":"custom","controls":{"x1":0.2,"y1":0.9,"x2":0.7,"y2":0.2}});
        let shaped = apply(&p, &op).unwrap();
        let copied=crate::gain_envelope::paste(&shaped,&json!({"trackId":"t","sourceTrackId":"t","sourceStart":0,"sourceEnd":2,"time":3,"duration":4})).unwrap();
        let points = copied["tracks"][0]["automation"].as_array().unwrap();
        let i = points
            .iter()
            .position(|p| p["time"].as_f64() == Some(3.0))
            .unwrap();
        let end = reviewed_end(points, i).unwrap();
        assert_eq!(points[end]["time"].as_f64(), Some(7.0));
    }
    #[test]
    fn saved_controls_reopen_whole_span_and_linear_removes_the_baked_shape() {
        let p = json!({"sampleRate":48000,"minimumDuration":8,"tracks":[{"id":"t","segments":[],"automation":[{"time":0,"value":0.2},{"time":2,"value":0.8},{"time":8,"value":0.1}]}]});
        let mut op = json!({"trackId":"t","parameter":"gain","pointTime":0,"shape":"custom","controls":{"x1":0.2,"y1":0.9,"x2":0.7,"y2":0.2}});
        let a = apply(&p, &op).unwrap();
        assert_eq!(apply(&a, &op).unwrap(), a);
        op["controls"]["y1"] = json!(0.3);
        let b = apply(&a, &op).unwrap();
        assert_eq!(b["tracks"][0]["automation"].as_array().unwrap().len(), 18);
        op["shape"] = json!("linear");
        assert_eq!(apply(&b, &op).unwrap(), p);
        let mut edited = a.clone();
        edited["tracks"][0]["automation"][5]["value"] = json!(0.5);
        op["shape"] = json!("ease-in");
        assert_eq!(
            apply(&edited, &op).unwrap()["tracks"][0]["automation"]
                .as_array()
                .unwrap()
                .len(),
            33
        );
    }
    #[test]
    fn malformed_shape_review_is_rejected_before_editing() {
        for review in [
            json!(null),
            json!({"shape":"custom","intervals":17,"controls":{"x1":0.2,"y1":0.9,"x2":0.7,"y2":0.2}}),
            json!({"shape":"custom","intervals":16,"controls":{"x1":0.9,"y1":0,"x2":0.1,"y2":1}}),
        ] {
            assert!(crate::automation_curve::validate(
                &json!({"time":0,"value":1,"shapeReview":review})
            )
            .is_err());
        }
    }
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
    #[test]
    fn custom_controls_match_cubic_value_and_validate_bounds() {
        let p = json!({"sampleRate":48000,"minimumDuration":4,"tracks":[{"id":"t","segments":[],"automation":[{"time":0,"value":1.5},{"time":2,"value":0.2,"curve":"step"}]}]});
        let mut op = json!({"trackId":"t","parameter":"gain","pointTime":0,"shape":"custom","controls":{"x1":1.0/3.0,"y1":0,"x2":2.0/3.0,"y2":0}});
        let out = apply(&p, &op).unwrap();
        let points = out["tracks"][0]["automation"].as_array().unwrap();
        assert_eq!(points.len(), 17);
        assert!((at_parameter(points, 1.0, 0.0) - 1.3375).abs() < 1e-12);
        assert_eq!(points.last().unwrap()["curve"], "step");
        for controls in [
            json!({"x1":0.9,"y1":0,"x2":0.2,"y2":1}),
            json!({"x1":0,"y1":-0.1,"x2":1,"y2":1}),
            Value::Null,
        ] {
            op["controls"] = controls;
            assert!(apply(&p, &op).is_err());
        }
        op["controls"] = json!({"x1":0,"y1":1,"x2":0,"y2":0});
        assert!(apply(&p, &op).is_ok());
        let flat = json!({"sampleRate":48000,"minimumDuration":4,"tracks":[{"id":"t","segments":[],"automation":[{"time":0,"value":0},{"time":4,"value":1}]}]});
        op["controls"] = json!({"x1":0.2,"y1":0.2,"x2":0.8,"y2":0.8});
        assert_eq!(apply(&flat, &op).unwrap(), flat);
    }
}
