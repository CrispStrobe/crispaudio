//! Portable delay envelopes retimed into a bounded reviewed automation pass.
use crate::gain_envelope::{at_parameter, parameter_points};
use crate::Result;
use serde_json::{json, Value};
fn number(v: &Value, key: &str) -> Result<f64> {
    v[key]
        .as_f64()
        .filter(|n| n.is_finite())
        .ok_or_else(|| format!("Missing finite {key}"))
}
fn points(v: &Value, maximum: f64) -> Result<Vec<Value>> {
    let points = parameter_points(v, false)?;
    if points
        .iter()
        .any(|p| p["value"].as_f64().unwrap() > maximum)
    {
        return Err("Invalid delay envelope value".into());
    }
    Ok(points)
}
fn effect<'a>(project: &'a Value, id: &Value, index: &Value) -> Result<&'a Value> {
    let track = project["tracks"]
        .as_array()
        .ok_or("Missing tracks")?
        .iter()
        .find(|t| id.is_string() && t["id"] == *id)
        .ok_or("Missing track")?;
    let effect = track["effects"]
        .as_array()
        .and_then(|effects| index.as_u64().and_then(|index| effects.get(index as usize)))
        .ok_or("Missing effect")?;
    if effect["type"] != "delay" {
        return Err("Only delay envelopes supported".into());
    }
    Ok(effect)
}
pub(crate) fn paste(project: &Value, op: &Value) -> Result<Value> {
    let parameter = op["parameter"].as_str().ok_or("Missing parameter")?;
    let (maximum, fallback) = match parameter {
        "mix" => (1.0, 0.3),
        "feedback" => (0.95, 0.4),
        _ => return Err("Unknown delay parameter".into()),
    };
    effect(project, &op["trackId"], &op["effectIndex"])?;
    let canvas = crate::project_edit::timeline_duration(project);
    let envelope = if let Some(envelope) = op.get("envelope") {
        if !envelope.is_object()
            || !envelope["points"].is_array()
            || op.get("sourceTrackId").is_some()
            || op.get("sourceEffectIndex").is_some()
        {
            return Err("Expected one envelope source".into());
        }
        if envelope["effectType"] != "delay" || envelope["parameter"] != parameter {
            return Err("Envelope parameter mismatch".into());
        }
        envelope.clone()
    } else {
        let source = effect(project, &op["sourceTrackId"], &op["sourceEffectIndex"])?;
        let start = number(op, "sourceStart")?;
        let end = number(op, "sourceEnd")?;
        if start < 0.0 || end <= start || end > canvas {
            return Err("Invalid copy bounds".into());
        }
        let source_points = points(&source["automation"][parameter], maximum)?;
        let static_value = source["params"][parameter]
            .as_f64()
            .filter(|n| n.is_finite())
            .unwrap_or(fallback)
            .clamp(0.0, maximum);
        let mut copied =
            vec![json!({"time":0,"value":at_parameter(&source_points,start,static_value)})];
        for point in source_points
            .iter()
            .filter(|p| p["time"].as_f64().unwrap() > start && p["time"].as_f64().unwrap() < end)
        {
            let mut point = point.clone();
            point["time"] = json!(point["time"].as_f64().unwrap() - start);
            copied.push(point)
        }
        copied
            .push(json!({"time":end-start,"value":at_parameter(&source_points,end,static_value)}));
        json!({"duration":end-start,"points":copied})
    };
    let source_duration = number(&envelope, "duration")?;
    if source_duration <= 0.0 {
        return Err("Invalid envelope duration".into());
    }
    let source = points(&envelope["points"], maximum)?;
    if source
        .iter()
        .any(|p| p["time"].as_f64().unwrap() > source_duration)
    {
        return Err("Point outside envelope".into());
    }
    let time = number(op, "time")?;
    let duration = if op.get("duration").is_some() {
        number(op, "duration")?
    } else {
        source_duration
    };
    let end = time + duration;
    let mut supplied = vec![json!({"time":time,"value":at_parameter(&source,0.0,fallback)})];
    for point in source.iter().filter(|p| {
        p["time"].as_f64().unwrap() > 0.0 && p["time"].as_f64().unwrap() < source_duration
    }) {
        let mut point = point.clone();
        point["time"] = json!(time + point["time"].as_f64().unwrap() / source_duration * duration);
        supplied.push(point)
    }
    supplied.push(json!({"time":end,"value":at_parameter(&source,source_duration,fallback)}));
    crate::automation_pass::apply(
        project,
        &json!({"trackId":op["trackId"],"effectIndex":op["effectIndex"],"parameter":parameter,"spans":[{"points":supplied}]}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retimes_tagged_delay_envelopes_and_preserves_other_parameters() {
        let project = json!({"duration":10,"minimumDuration":10,"sampleRate":48000,"tracks":[{"id":"a","locked":true,"segments":[],"effects":[{"type":"delay","params":{"mix":0.3,"feedback":0.4},"automation":{"mix":[{"time":0,"value":0},{"time":4,"value":1},{"time":8,"value":0}]}}]},{"id":"b","segments":[],"effects":[{"type":"delay","params":{"mix":0.2,"feedback":0.6},"automation":{"feedback":[{"time":0,"value":0.1}]}}]}]});
        let op = json!({"parameter":"mix","trackId":"b","effectIndex":0,"sourceTrackId":"a","sourceEffectIndex":0,"sourceStart":1,"sourceEnd":7,"time":4,"duration":3});
        let out = paste(&project, &op).unwrap();
        assert_eq!(out["tracks"][0], project["tracks"][0]);
        assert_eq!(out["duration"], project["duration"]);
        assert_eq!(
            out["tracks"][1]["effects"][0]["automation"]["feedback"],
            project["tracks"][1]["effects"][0]["automation"]["feedback"]
        );
        assert_eq!(
            out["tracks"][1]["effects"][0]["automation"]["mix"][2],
            json!({"time":5.5,"value":1})
        );
        let portable = json!({"parameter":"mix","trackId":"b","effectIndex":0,"time":4,"duration":3,"envelope":{"effectType":"delay","parameter":"mix","duration":6,"points":[{"time":0,"value":0.25},{"time":3,"value":1},{"time":6,"value":0.25}]}});
        assert_eq!(paste(&project, &portable).unwrap(), out);
        let mut bad = portable.clone();
        bad["envelope"]["parameter"] = json!("feedback");
        assert!(paste(&project, &bad).is_err());
        bad = portable.clone();
        bad["envelope"]["points"][0]["value"] = json!(1.1);
        assert!(paste(&project, &bad).is_err());
        bad = portable.clone();
        bad["effectIndex"] = json!(9);
        assert!(paste(&project, &bad).is_err());
        bad = portable.clone();
        bad["trackId"] = json!("a");
        assert!(paste(&project, &bad).is_err());
        let identity = json!({"parameter":"feedback","trackId":"b","effectIndex":0,"sourceTrackId":"b","sourceEffectIndex":0,"sourceStart":1,"sourceEnd":3,"time":4});
        assert_eq!(paste(&project, &identity).unwrap(), project);
    }
}
