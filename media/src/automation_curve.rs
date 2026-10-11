//! Outgoing point segment: absent/linear ramps, step holds until the next clock.
use crate::Result;
use serde_json::{json, Value};
pub(crate) fn validate(point: &Value) -> Result<()> {
    if point.get("curve").is_some() && !matches!(point["curve"].as_str(), Some("linear" | "step")) {
        return Err("Unsupported automation curve".into());
    }
    Ok(())
}
pub(crate) fn step(point: &Value) -> bool {
    point["curve"] == "step"
}
pub(crate) fn decorate(point: &mut Value, points: &[Value], time: f64) {
    let old = points
        .iter()
        .filter(|p| p["time"].as_f64().is_some_and(|t| t <= time))
        .max_by(|a, b| {
            a["time"]
                .as_f64()
                .unwrap()
                .total_cmp(&b["time"].as_f64().unwrap())
        });
    if old.is_some_and(step) {
        point["curve"] = json!("step")
    }
}
pub(crate) fn check_times(a: &[Value], b: &[Value]) -> Vec<f64> {
    let mut times: Vec<f64> = a
        .iter()
        .chain(b)
        .map(|p| p["time"].as_f64().unwrap())
        .collect();
    times.sort_by(f64::total_cmp);
    times.dedup();
    let mids: Vec<f64> = times
        .windows(2)
        .map(|p| p[0] + (p[1] - p[0]) / 2.0)
        .collect();
    times.extend(mids);
    times
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stepped_copy_pass_and_range_guards_preserve_outside_segments() {
        let points = json!([{"time":0,"value":0,"curve":"step"},{"time":4,"value":0.9,"curve":"step"},{"time":8,"value":0.2}]);
        let project = json!({"id":"p","sampleRate":48000,"minimumDuration":10,"duration":10,"tracks":[{"id":"t","pan":0,"segments":[],"automation":points,"panAutomation":points,"effects":[{"type":"delay","enabled":true,"params":{"mix":0.3,"feedback":0.4},"automation":{"mix":points,"feedback":points}}]}]});
        for parameter in ["gain", "pan", "mix", "feedback"] {
            let op = json!({"parameter":parameter,"trackId":"t","effectIndex":0,"sourceTrackId":"t","sourceEffectIndex":0,"sourceStart":1,"sourceEnd":7,"time":1,"duration":3});
            let out = if parameter == "gain" || parameter == "pan" {
                crate::gain_envelope::paste(&project, &op).unwrap()
            } else {
                crate::effect_envelope::paste(&project, &op).unwrap()
            };
            let result = if parameter == "gain" {
                &out["tracks"][0]["automation"]
            } else if parameter == "pan" {
                &out["tracks"][0]["panAutomation"]
            } else {
                &out["tracks"][0]["effects"][0]["automation"][parameter]
            };
            let result = result.as_array().unwrap();
            assert_eq!(crate::gain_envelope::at_parameter(result, 2.0, 0.0), 0.0);
            assert_eq!(crate::gain_envelope::at_parameter(result, 2.5, 0.0), 0.9);
            assert_eq!(crate::gain_envelope::at_parameter(result, 6.0, 0.0), 0.9);
        }
        let pass=crate::automation_pass::apply(&project,&json!({"trackId":"t","parameter":"gain","spans":[{"points":[{"time":1,"value":0.5},{"time":2,"value":0.5}]}]})).unwrap();
        assert_eq!(
            crate::gain_envelope::at_parameter(
                pass["tracks"][0]["automation"].as_array().unwrap(),
                3.0,
                1.0
            ),
            0.0
        );
        for op in ["insert", "extract"] {
            let out =
                crate::range_edit::apply(&project, &json!({"operation":op,"start":2,"end":3}))
                    .unwrap();
            let result = out["tracks"][0]["automation"].as_array().unwrap();
            assert_eq!(
                crate::gain_envelope::at_parameter(
                    result,
                    if op == "insert" { 4.5 } else { 2.5 },
                    1.0
                ),
                0.0
            );
            assert_eq!(
                crate::gain_envelope::at_parameter(
                    result,
                    if op == "insert" { 5.0 } else { 3.0 },
                    1.0
                ),
                0.9
            );
        }
    }
    #[test]
    fn changing_only_interpolation_is_not_an_identity_and_unknown_curves_reject() {
        let p = json!({"duration":4,"minimumDuration":4,"sampleRate":48000,"tracks":[{"id":"t","segments":[],"automation":[{"time":0,"value":0,"curve":"step"},{"time":4,"value":1}]}]});
        let op = json!({"trackId":"t","time":0,"envelope":{"duration":4,"points":[{"time":0,"value":0},{"time":4,"value":1}]}});
        assert_ne!(crate::gain_envelope::paste(&p, &op).unwrap(), p);
        assert!(validate(&json!({"time":0,"value":1,"curve":"bezier"})).is_err());
        assert!(validate(&json!({"time":0,"value":1,"curve":null})).is_err());
    }
}
