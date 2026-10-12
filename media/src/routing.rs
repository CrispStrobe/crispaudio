use crate::Result;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

pub(crate) fn order(tracks: &[Value]) -> Result<Vec<usize>> {
    let mut ids = HashMap::new();
    for (i, track) in tracks.iter().enumerate() {
        let id = track["id"].as_str().ok_or("Missing routing track ID")?;
        if id == "master" || ids.insert(id, i).is_some() {
            return Err("Duplicate routing track ID".into());
        }
    }
    let mut edges = vec![Vec::new(); tracks.len()];
    for (i, track) in tracks.iter().enumerate() {
        if track["kind"] == "bus" && track["segments"].as_array().is_some_and(|a| !a.is_empty()) {
            return Err("Bus cannot contain audio clips".into());
        }
        let mut targets = vec![track["output"].as_str().unwrap_or("master")];
        if let Some(sends) = track.get("sends") {
            let mut send_ids = HashSet::new();
            for send in sends.as_array().ok_or("Invalid audio sends")? {
                let id = send["id"].as_str().ok_or("Missing send ID")?;
                let gain = send["gain"].as_f64().ok_or("Invalid send gain")?;
                if id.is_empty()
                    || !send_ids.insert(id)
                    || !gain.is_finite()
                    || !(0.0..=4.0).contains(&gain)
                    || !send["preFader"].is_boolean()
                {
                    return Err("Invalid send settings".into());
                }
                targets.push(send["target"].as_str().ok_or("Missing send destination")?);
            }
        }
        for target in targets {
            if target == "master" {
                continue;
            }
            let index = *ids.get(target).ok_or("Missing routing destination")?;
            if tracks[index]["kind"] != "bus" {
                return Err("Routing destination must be a bus".into());
            }
            edges[i].push(index);
        }
    }
    for (i, track) in tracks.iter().enumerate() {
        if let Some(config) = track.get("ducking") {
            let source = *ids
                .get(
                    config["source"]
                        .as_str()
                        .ok_or("Missing sidechain source")?,
                )
                .ok_or("Missing sidechain track")?;
            crate::ducking::Ducking::new(config, source)?;
            edges[source].push(i);
        }
    }
    fn visit(i: usize, edges: &[Vec<usize>], state: &mut [u8], out: &mut Vec<usize>) -> Result<()> {
        if state[i] == 1 {
            return Err("Audio routing feedback cycle".into());
        }
        if state[i] == 2 {
            return Ok(());
        }
        state[i] = 1;
        for &target in &edges[i] {
            visit(target, edges, state, out)?;
        }
        state[i] = 2;
        out.push(i);
        Ok(())
    }
    let mut state = vec![0; tracks.len()];
    let mut out = Vec::new();
    for i in (0..tracks.len()).rev() {
        visit(i, &edges, &mut state, &mut out)?;
    }
    out.reverse();
    Ok(out)
}

pub(crate) fn audible(tracks: &[Value]) -> HashSet<String> {
    let solo: HashSet<String> = tracks
        .iter()
        .filter(|t| t["solo"] == true)
        .filter_map(|t| t["id"].as_str().map(str::to_owned))
        .collect();
    if solo.is_empty() {
        return tracks
            .iter()
            .filter(|t| t["muted"] != true)
            .filter_map(|t| t["id"].as_str().map(str::to_owned))
            .collect();
    }
    let mut selected = solo.clone();
    let mut ancestors: HashSet<String> = tracks
        .iter()
        .filter(|t| t["kind"] == "bus" && t["solo"] == true)
        .filter_map(|t| t["id"].as_str().map(str::to_owned))
        .collect();
    loop {
        let before = selected.len();
        for track in tracks {
            let Some(id) = track["id"].as_str() else {
                continue;
            };
            let mut targets = vec![track["output"].as_str().unwrap_or("master")];
            if let Some(sends) = track["sends"].as_array() {
                targets.extend(sends.iter().filter_map(|s| s["target"].as_str()));
            }
            if targets.iter().any(|target| ancestors.contains(*target)) && !selected.contains(id) {
                selected.insert(id.into());
                if track["kind"] == "bus" {
                    ancestors.insert(id.into());
                }
            }
        }
        if before == selected.len() {
            break;
        }
    }
    loop {
        let before = selected.len();
        for track in tracks {
            let Some(id) = track["id"].as_str() else {
                continue;
            };
            if !selected.contains(id) {
                continue;
            }
            let mut targets = vec![track["output"].as_str().unwrap_or("master")];
            if let Some(sends) = track["sends"].as_array() {
                targets.extend(sends.iter().filter_map(|s| s["target"].as_str()));
            }
            for target in targets {
                if target != "master" {
                    selected.insert(target.into());
                }
            }
        }
        if before == selected.len() {
            break;
        }
    }
    selected.retain(|id| {
        tracks
            .iter()
            .find(|t| t["id"] == *id)
            .is_some_and(|t| t["kind"] != "bus" || t["muted"] != true || t["solo"] == true)
    });
    selected
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn orders_source_before_bus_and_rejects_even_zero_gain_cycles() {
        let mut tracks = vec![
            json!({"id":"b","kind":"bus","segments":[]}),
            json!({"id":"a","output":"b"}),
        ];
        assert_eq!(order(&tracks).unwrap(), vec![1, 0]);
        tracks[0]["sends"] = json!([{"id":"s","target":"b","gain":0,"preFader":true}]);
        assert!(order(&tracks).is_err());
    }
}
