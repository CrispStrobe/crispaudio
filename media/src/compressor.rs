//! Stereo-linked WebKit dynamics compressor; fixed 48 kHz, 6 ms lookahead.
//! Adapted from WebKit revision ae88abe108bcccf28bd309adeed1d0522595e901.
/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
use std::f32::consts::PI;
fn db(x: f32) -> f32 {
    20.0 * x.log10()
}
fn linear(x: f32) -> f32 {
    10.0f32.powf(0.05 * x)
}

pub(crate) struct Compressor {
    history: [[f32; 2]; 1024],
    cursor: usize,
    threshold: f32,
    knee: f32,
    knee_db: f32,
    knee_y_db: f32,
    slope: f32,
    k: f32,
    makeup: f32,
    attack_frames: f32,
    release: [f32; 5],
    detector: f32,
    gain: f32,
    max_attack_db: f32,
    desired: f32,
    rate: f32,
}
impl Compressor {
    pub(crate) fn new(threshold: f64, knee: f64, ratio: f64, attack: f64, release: f64) -> Self {
        let threshold = threshold.clamp(-100.0, 0.0) as f32;
        let knee = knee.clamp(0.0, 40.0) as f32;
        let ratio = ratio.clamp(1.0, 20.0) as f32;
        let mut s = Self {
            history: [[0.0; 2]; 1024],
            cursor: 0,
            threshold: linear(threshold),
            knee: linear(threshold + knee),
            knee_db: threshold + knee,
            knee_y_db: 0.0,
            slope: 1.0 / ratio,
            k: 5.0,
            makeup: 1.0,
            attack_frames: (attack.clamp(0.0, 1.0) as f32).max(0.001) * 48000.0,
            release: [0.0; 5],
            detector: 0.0,
            gain: 1.0,
            max_attack_db: -1.0,
            desired: 0.0,
            rate: 0.0,
        };
        let (mut low, mut high) = (0.1, 10000.0);
        for _ in 0..15 {
            let x = s.knee;
            let x2 = (x as f64 * 1.001) as f32;
            let slope = (db(s.knee_curve(x2)) - db(s.knee_curve(x))) / (db(x2) - db(x));
            if slope < s.slope {
                high = s.k;
            } else {
                low = s.k;
            }
            s.k = (low * high).sqrt();
        }
        s.knee_y_db = db(s.knee_curve(s.knee));
        s.makeup = (1.0 / s.saturate(1.0)).powf(0.6);
        let frames = release.clamp(0.0, 1.0) as f32 * 48000.0;
        let y = [frames * 0.09, frames * 0.16, frames * 0.42, frames * 0.98];
        #[allow(clippy::excessive_precision)]
        let coefficients: [[f32; 4]; 5] = [
            [
                0.9999999999999998,
                1.8432219684323923e-16,
                -1.9373394351676423e-16,
                8.824516011816245e-18,
            ],
            [
                -1.5788320352845888,
                2.3305837032074286,
                -0.9141194204840429,
                0.1623677525612032,
            ],
            [
                0.5334142869106424,
                -1.272736789213631,
                0.9258856042207512,
                -0.18656310191776226,
            ],
            [
                0.08783463138207234,
                -0.1694162967925622,
                0.08588057951595272,
                -0.00429891410546283,
            ],
            [
                -0.042416883008123074,
                0.1115693827987602,
                -0.09764676325265872,
                0.028494263462021576,
            ],
        ];
        s.release = coefficients.map(|c| c[0] * y[0] + c[1] * y[1] + c[2] * y[2] + c[3] * y[3]);
        s
    }
    fn knee_curve(&self, x: f32) -> f32 {
        if x < self.threshold {
            x
        } else {
            self.threshold + (1.0 - (-self.k * (x - self.threshold)).exp()) / self.k
        }
    }
    fn saturate(&self, x: f32) -> f32 {
        if x < self.knee {
            self.knee_curve(x)
        } else {
            linear(self.knee_y_db + self.slope * (db(x) - self.knee_db))
        }
    }
    fn division(&mut self) {
        if !self.detector.is_finite() {
            self.detector = 1.0;
        }
        self.desired = self.detector.asin() / (0.5 * PI);
        let releasing = self.desired > self.gain;
        let mut diff = db(self.gain / self.desired);
        if releasing {
            self.max_attack_db = -1.0;
            if !diff.is_finite() {
                diff = -1.0;
            }
            let x = 0.25 * (diff.clamp(-12.0, 0.0) + 12.0);
            let x2 = x * x;
            let [a, b, c, d, e] = self.release;
            let frames = a + b * x + c * x2 + d * x2 * x + e * x2 * x2;
            self.rate = linear(5.0 / frames);
        } else {
            if !diff.is_finite() {
                diff = 1.0;
            }
            self.max_attack_db = self.max_attack_db.max(diff);
            self.rate = 1.0 - (0.25 / self.max_attack_db.max(0.5)).powf(1.0 / self.attack_frames);
        }
    }
    pub(crate) fn at(&mut self, input: [f64; 2], frame: u32) -> [f64; 2] {
        if frame % 32 == 0 {
            self.division();
        }
        let input = input.map(|v| v as f32);
        self.history[(self.cursor + 288) & 1023] = input;
        let level = input[0].abs().max(input[1].abs());
        let attenuation = if level <= 0.0001 {
            1.0
        } else {
            self.saturate(level) / level
        };
        let rate = if attenuation > self.detector {
            linear((-db(attenuation)).max(2.0) / 120.0) - 1.0
        } else {
            1.0
        };
        self.detector = (self.detector + (attenuation - self.detector) * rate).min(1.0);
        if !self.detector.is_finite() {
            self.detector = 1.0;
        }
        if self.rate < 1.0 {
            self.gain += (self.desired - self.gain) * self.rate;
        } else {
            self.gain = (self.gain * self.rate).min(1.0);
        }
        let total = self.makeup * (0.5 * PI * self.gain).sin();
        let output = self.history[self.cursor].map(|v| (v * total) as f64);
        self.cursor = (self.cursor + 1) & 1023;
        if frame % 32 == 31 {
            if self.detector.abs() < f32::MIN_POSITIVE {
                self.detector = 0.0;
            }
            if self.gain.abs() < f32::MIN_POSITIVE {
                self.gain = 0.0;
            }
        }
        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lookahead_is_288_frames_and_stereo_is_linked() {
        let mut c = Compressor::new(-24.0, 5.0, 4.0, 0.003, 0.25);
        for frame in 0..1000 {
            let x = if frame == 200 { [0.8, -0.2] } else { [0.0; 2] };
            let y = c.at(x, frame);
            assert!(y.iter().all(|x| x.is_finite()));
            if frame == 488 {
                assert!(y[0] > 0.0);
                assert!((y[0] + y[1] * 4.0).abs() < 1e-7);
            } else {
                assert_eq!(y, [0.0; 2]);
            }
        }
    }
    #[test]
    fn silence_and_zero_release_are_finite() {
        let mut c = Compressor::new(-100.0, 40.0, 20.0, 0.0, 0.0);
        for frame in 0..48000 {
            assert_eq!(c.at([0.0; 2], frame), [0.0; 2]);
        }
    }
}
