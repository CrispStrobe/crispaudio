//! Stereo 48 kHz BS.1770 K weighting / two-stage gating / Annex 2 4x FIR peak.
//! Same coefficients and calibration as src/audio/dsp/loudness.ts. Worker only.
use serde::Serialize;
use std::collections::VecDeque;
const FIR: [[f64; 4]; 12] = [
    [
        0.001708984375,
        -0.0291748046875,
        -0.0189208984375,
        -0.00830078125,
    ],
    [0.010986328125, 0.029296875, 0.0330810546875, 0.014892578125],
    [
        -0.0196533203125,
        -0.0517578125,
        -0.0582275390625,
        -0.026611328125,
    ],
    [0.033203125, 0.089111328125, 0.1015625, 0.047607421875],
    [
        -0.0594482421875,
        -0.16650390625,
        -0.2003173828125,
        -0.102294921875,
    ],
    [
        0.1373291015625,
        0.465087890625,
        0.77978515625,
        0.97216796875,
    ],
    [
        0.97216796875,
        0.77978515625,
        0.465087890625,
        0.1373291015625,
    ],
    [
        -0.102294921875,
        -0.2003173828125,
        -0.16650390625,
        -0.0594482421875,
    ],
    [0.047607421875, 0.1015625, 0.089111328125, 0.033203125],
    [
        -0.026611328125,
        -0.0582275390625,
        -0.0517578125,
        -0.0196533203125,
    ],
    [0.014892578125, 0.0330810546875, 0.029296875, 0.010986328125],
    [
        -0.00830078125,
        -0.0189208984375,
        -0.0291748046875,
        0.001708984375,
    ],
];
#[derive(Clone, Copy)]
struct Filter {
    b: [f64; 3],
    a: [f64; 2],
    z: [f64; 2],
}
impl Filter {
    fn at(&mut self, input: f64) -> f64 {
        let value = self.b[0] * input + self.z[0];
        self.z[0] = self.b[1] * input - self.a[0] * value + self.z[1];
        self.z[1] = self.b[2] * input - self.a[1] * value;
        value
    }
}
fn weighting() -> [Filter; 2] {
    [
        Filter {
            b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
            a: [-1.69065929318241, 0.73248077421585],
            z: [0.; 2],
        },
        Filter {
            b: [1., -2., 1.],
            a: [-1.99004745483398, 0.99007225036621],
            z: [0.; 2],
        },
    ]
}
fn db(power: f64) -> Option<f64> {
    (power > 0.).then(|| -0.691 + 10. * power.log10())
}
fn average(values: impl Iterator<Item = f64>) -> f64 {
    let (sum, count) = values.fold((0., 0usize), |(sum, count), v| (sum + v, count + 1));
    if count > 0 {
        sum / count as f64
    } else {
        0.
    }
}
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Reading {
    pub integrated: Option<f64>,
    pub momentary: Option<f64>,
    pub short_term: Option<f64>,
    pub true_peak: Option<f64>,
}
pub struct Meter {
    filters: [[Filter; 2]; 2],
    history: [[f64; 12]; 2],
    cursor: usize,
    peak: f64,
    energy: f64,
    count: usize,
    recent: VecDeque<f64>,
    blocks: Vec<f64>,
}
impl Default for Meter {
    fn default() -> Self {
        Self {
            filters: [weighting(), weighting()],
            history: [[0.; 12]; 2],
            cursor: 0,
            peak: 0.,
            energy: 0.,
            count: 0,
            recent: VecDeque::with_capacity(31),
            blocks: Vec::new(),
        }
    }
}
impl Meter {
    fn peak(&mut self, sample: [f32; 2]) {
        for (ch, value) in sample.iter().enumerate() {
            let value = *value as f64;
            self.peak = self.peak.max(value.abs());
            self.history[ch][self.cursor] = value;
            for phase in 0..4 {
                let value = (0..12)
                    .map(|tap| FIR[tap][phase] * self.history[ch][(self.cursor + 12 - tap) % 12])
                    .sum::<f64>();
                self.peak = self.peak.max(value.abs());
            }
        }
        self.cursor = (self.cursor + 1) % 12;
    }
    /// Returns true at each 100 ms update; no allocation per sample.
    pub fn frame(&mut self, sample: [f32; 2]) -> bool {
        self.peak(sample);
        for (ch, value) in sample.iter().enumerate() {
            let head = self.filters[ch][0].at(*value as f64);
            let weighted = self.filters[ch][1].at(head);
            self.energy += weighted * weighted;
        }
        self.count += 1;
        if self.count != 4800 {
            return false;
        }
        self.recent.push_back(self.energy / 4800.);
        if self.recent.len() > 30 {
            self.recent.pop_front();
        }
        // At most ~28 hours of gated windows; the graph's u32 clock bounds playback
        // before this limit. Meter reset begins a fresh history without resetting DSP.
        if self.recent.len() >= 4 && self.blocks.len() < 1_000_000 {
            self.blocks
                .push(average(self.recent.iter().rev().take(4).copied()));
        }
        self.count = 0;
        self.energy = 0.;
        true
    }
    pub fn reading(&self) -> Reading {
        let absolute = self
            .blocks
            .iter()
            .copied()
            .filter(|v| db(*v).is_some_and(|v| v > -70.))
            .collect::<Vec<_>>();
        let threshold = db(average(absolute.iter().copied())).map_or(f64::INFINITY, |v| v - 10.);
        let gated = absolute
            .iter()
            .copied()
            .filter(|v| db(*v).is_some_and(|v| v > threshold));
        Reading {
            integrated: db(average(gated)),
            momentary: if self.recent.len() >= 4 {
                db(average(self.recent.iter().rev().take(4).copied()))
            } else {
                None
            },
            short_term: if self.recent.len() >= 30 {
                db(average(self.recent.iter().copied()))
            } else {
                None
            },
            true_peak: (self.peak > 0.).then(|| 20. * self.peak.log10()),
        }
    }
    pub fn finish(&mut self) -> Reading {
        for _ in 0..12 {
            self.peak([0.; 2]);
        }
        self.reading()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matches_browser_float32_reference_and_true_peak() {
        let mut meter = Meter::default();
        for i in 0..153600 {
            let value =
                (0.1 * (2. * std::f64::consts::PI * 1000. * i as f64 / 48000.).sin()) as f32;
            meter.frame([value; 2]);
        }
        let reading = meter.finish();
        assert!((reading.integrated.unwrap() - (-19.99330592110378)).abs() < 1e-9);
        assert!((reading.true_peak.unwrap() - (-19.993303920245964)).abs() < 1e-9);
        assert!((reading.short_term.unwrap() - (-19.99329558660073)).abs() < 1e-9);
    }
    #[test]
    fn silence_and_intersample_peak_are_distinct_from_sample_peak() {
        let mut silence = Meter::default();
        for _ in 0..48000 {
            silence.frame([0.; 2]);
        }
        assert!(silence.finish().integrated.is_none());
        let mut meter = Meter::default();
        let mut peak = 0f64;
        for i in 0..48000 {
            let value = (2. * std::f64::consts::PI * 12000. * i as f64 / 48000.
                + std::f64::consts::PI / 4.)
                .sin() as f32;
            peak = peak.max(value.abs() as f64);
            meter.frame([value; 2]);
        }
        assert!(meter.finish().true_peak.unwrap() > 20. * peak.log10() + 2.5);
    }
}
