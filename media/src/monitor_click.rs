//! Monitor-only metronome for the 48 kHz native transport; never used by exports.
use serde::Deserialize;
use serde_json::Value;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorClick {
    tempo: f64,
    numerator: u32,
    denominator: u32,
    origin: f64,
    metronome: bool,
    click_level: f64,
}
impl MonitorClick {
    /// Missing music means no click, including projects saved before musical time.
    pub fn parse(value: &Value) -> Result<Option<Self>, String> {
        if value.is_null() {
            return Ok(None);
        }
        let music: Self = serde_json::from_value(value.clone())
            .map_err(|e| format!("Invalid monitor click: {e}"))?;
        if !music.tempo.is_finite()
            || !(20. ..=300.).contains(&music.tempo)
            || !(1..=32).contains(&music.numerator)
            || ![1, 2, 4, 8, 16].contains(&music.denominator)
            || !music.origin.is_finite()
            || !(0. ..=86400.).contains(&music.origin)
            || !music.click_level.is_finite()
            || !(0. ..=1.).contains(&music.click_level)
        {
            return Err("Invalid monitor click settings".into());
        }
        Ok(Some(music))
    }

    /// Absolute project-frame arithmetic prevents block-size and long-run drift.
    /// Seeking into a click resumes its tail; loop boundaries follow project time.
    pub fn mix(&self, pcm: &mut [[f32; 2]], first: u64, cycle: Option<(u32, u32)>) {
        if !self.metronome || self.click_level == 0. {
            return;
        }
        let period = 48000. * 60. / self.tempo * 4. / self.denominator as f64;
        let origin = self.origin * 48000.;
        for (i, sample) in pcm.iter_mut().enumerate() {
            let mut frame = first + i as u64;
            if let Some((start, end)) = cycle {
                if frame >= end as u64 {
                    frame = start as u64 + (frame - start as u64) % (end - start) as u64;
                }
            }
            let beat = ((frame as f64 - origin + 0.5) / period).floor();
            let age = frame as f64 - (origin + beat * period).round();
            if !(0. ..1920.).contains(&age) {
                continue;
            }
            let time = age / 48000.;
            let envelope = if time < 0.002 {
                time / 0.002
            } else {
                (0.000125_f64).powf((time - 0.002) / 0.033)
            };
            let frequency = if (beat as i64).rem_euclid(self.numerator as i64) == 0 {
                1200.
            } else {
                800.
            };
            let click = (std::f64::consts::TAU * frequency * time).sin()
                * envelope
                * 0.08
                * self.click_level;
            for channel in sample {
                // Safety saturation only on the monitor sum; project PCM/meters stay untouched.
                *channel = (*channel as f64 + click).clamp(-1., 1.) as f32;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn settings() -> MonitorClick {
        MonitorClick::parse(&json!({"tempo":120,"numerator":4,"denominator":4,
            "origin":0,"metronome":true,"clickLevel":0.5}))
        .unwrap()
        .unwrap()
    }
    #[test]
    fn absolute_beats_are_partition_independent_and_seekable() {
        let m = settings();
        let mut whole = vec![[0.; 2]; 98000];
        m.mix(&mut whole, 0, None);
        let mut blocks = vec![[0.; 2]; whole.len()];
        for (i, block) in blocks.chunks_mut(512).enumerate() {
            m.mix(block, (i * 512) as u64, None);
        }
        assert_eq!(whole, blocks);
        assert!(whole[1920..24000].iter().all(|v| *v == [0.; 2]));
        assert!(whole[24001][0].abs() > 0.);
        assert_ne!(whole[1], whole[24001]); // downbeat has a different pitch
        let mut seek = vec![[0.; 2]; 512];
        m.mix(&mut seek, 24200, None);
        assert_eq!(seek, whole[24200..24712]);
    }
    #[test]
    fn loop_inside_a_block_restarts_project_clock_not_dsp_clock() {
        let m = settings();
        let mut repeated = vec![[0.; 2]; 4000];
        m.mix(&mut repeated, 47900, Some((24000, 48000)));
        let mut before = vec![[0.; 2]; 100];
        let mut after = vec![[0.; 2]; 3900];
        m.mix(&mut before, 47900, None);
        m.mix(&mut after, 24000, None);
        before.extend(after);
        assert_eq!(repeated, before);
    }
    #[test]
    fn noninteger_period_and_long_session_have_no_drift() {
        let mut m = settings();
        m.tempo = 137.;
        m.denominator = 8;
        m.origin = 0.123;
        for beat in [-1_i64, 0, 1, 100000] {
            let onset = (m.origin * 48000. + beat as f64 * 48000. * 60. / 137. * 0.5).round();
            if onset < 1. {
                continue;
            }
            let mut pcm = [[0.; 2]; 4];
            m.mix(&mut pcm, onset as u64 - 1, None);
            assert_eq!(pcm[0], [0.; 2]);
            assert_eq!(pcm[1], [0.; 2]);
            assert!(pcm[2][0].abs() > 0.);
        }
    }
    #[test]
    fn disabled_click_is_transparent_and_sum_is_bounded() {
        let mut m = settings();
        let mut pcm = [[0.99, -0.99]; 2000];
        m.mix(&mut pcm, 0, None);
        assert!(pcm.iter().flatten().all(|v| v.is_finite() && v.abs() <= 1.));
        for zero in [true, false] {
            let mut m = settings();
            if zero {
                m.click_level = 0.;
            } else {
                m.metronome = false;
            }
            let mut pcm = [[0.7, -0.2]; 2000];
            let original = pcm;
            m.mix(&mut pcm, 0, None);
            assert_eq!(pcm, original);
        }
        m.numerator = 3;
        let mut a = [[0.; 2]; 8];
        let mut b = a;
        m.mix(&mut a, 72000, None);
        settings().mix(&mut b, 72000, None);
        assert_ne!(a, b);
    }
    #[test]
    fn missing_and_malformed_music_are_distinguished() {
        assert!(MonitorClick::parse(&Value::Null).unwrap().is_none());
        for (key, value) in [
            ("tempo", json!(0)),
            ("numerator", json!(1.5)),
            ("denominator", json!(3)),
            ("origin", json!(-1)),
            ("clickLevel", json!(2)),
            ("metronome", json!("yes")),
        ] {
            let mut v = serde_json::to_value(json!({"tempo":120,"numerator":4,
                "denominator":4,"origin":0,"metronome":true,"clickLevel":0.5}))
            .unwrap();
            v[key] = value;
            assert!(MonitorClick::parse(&v).is_err());
        }
    }
}
