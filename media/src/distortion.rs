//! Four-times oversampled saturation, matching the Mac GUI's WebKit filters.
//! Source revision: ae88abe108bcccf28bd309adeed1d0522595e901
//! The resampling kernels/phase conventions below adapt WebKit UpSampler and
//! DownSampler (Copyright (C) 2013 Google Inc.). BSD-3-Clause notice is bundled
//! at src/lib/licenses/webkit-oversampling.txt and reproduced below.
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
// 1. Redistributions of source code must retain the above copyright notice,
//    this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
// 3. Neither the name of Apple Inc. ("Apple") nor the names of its contributors
//    may be used to endorse or promote products derived from this software
//    without specific prior written permission.
// THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
// DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
use std::f64::consts::PI;
const TAPS: usize = 128;
type Stereo = [f32; 2];
struct Up {
    history: [Stereo; TAPS],
    cursor: usize,
}
impl Up {
    fn new() -> Self {
        Self {
            history: [[0.0; 2]; TAPS],
            cursor: 0,
        }
    }
    fn at(&mut self, input: Stereo, kernel: &[f32; TAPS]) -> [Stereo; 2] {
        self.history[self.cursor] = input;
        let even = self.history[(self.cursor + TAPS - 64) % TAPS];
        let odd = convolve(&self.history, self.cursor, kernel);
        self.cursor = (self.cursor + 1) % TAPS;
        [even, odd]
    }
}
struct Down {
    even: [Stereo; TAPS],
    odd: [Stereo; TAPS],
    previous_odd: Stereo,
    cursor: usize,
}
impl Down {
    fn new() -> Self {
        Self {
            even: [[0.0; 2]; TAPS],
            odd: [[0.0; 2]; TAPS],
            previous_odd: [0.0; 2],
            cursor: 0,
        }
    }
    fn at(&mut self, input: [Stereo; 2], kernel: &[f32; TAPS]) -> Stereo {
        self.even[self.cursor] = input[0];
        // Decimation reads the odd source sample preceding the even phase.
        self.odd[self.cursor] = self.previous_odd;
        let filtered = convolve(&self.odd, self.cursor, kernel);
        let center = self.even[(self.cursor + TAPS - 64) % TAPS];
        self.previous_odd = input[1];
        self.cursor = (self.cursor + 1) % TAPS;
        std::array::from_fn(|ch| filtered[ch] + center[ch] * 0.5)
    }
}
fn convolve(history: &[Stereo; TAPS], cursor: usize, kernel: &[f32; TAPS]) -> Stereo {
    let mut sum = [0.0f64; 2];
    for (i, &coefficient) in kernel.iter().enumerate() {
        let past = history[(cursor + TAPS - i) % TAPS];
        for ch in 0..2 {
            sum[ch] += past[ch] as f64 * coefficient as f64;
        }
    }
    sum.map(|v| v as f32)
}
fn blackman(position: f64) -> f64 {
    0.42 - 0.5 * (2.0 * PI * position).cos() + 0.08 * (4.0 * PI * position).cos()
}
fn sinc(phase: f64) -> f64 {
    if phase == 0.0 {
        1.0
    } else {
        phase.sin() / phase
    }
}
pub(crate) struct Distortion {
    up: [Up; 2],
    down: [Down; 2],
    up_kernel: [f32; TAPS],
    down_kernel: [f32; TAPS],
    curve: [f32; 256],
    wet: f64,
    dry: f64,
}
impl Distortion {
    pub(crate) fn new(drive: f64, mix: f64) -> Self {
        let drive = drive.clamp(0.0, 1.0);
        let mix = mix.clamp(0.0, 1.0);
        Self {
            up: std::array::from_fn(|_| Up::new()),
            down: std::array::from_fn(|_| Down::new()),
            up_kernel: std::array::from_fn(|i| {
                let shifted = i as f64 + 0.5;
                (sinc(PI * (shifted - 64.0)) * blackman(shifted / 128.0)) as f32
            }),
            down_kernel: std::array::from_fn(|i| {
                let tap = (i * 2 + 1) as f64;
                (0.5 * sinc(0.5 * PI * (tap - 128.0)) * blackman(tap / 256.0)) as f32
            }),
            curve: std::array::from_fn(|i| {
                let x = i as f64 * 2.0 / 255.0 - 1.0;
                ((x * (1.0 + drive * 4.0)).tanh() / (1.0 + drive * 0.5)).clamp(-1.0, 1.0) as f32
            }),
            wet: mix as f32 as f64,
            dry: (1.0 - mix) as f32 as f64,
        }
    }
    fn shape(&self, input: Stereo) -> Stereo {
        input.map(|v| {
            let index = (v.clamp(-1.0, 1.0) as f64 + 1.0) * 127.5;
            let left = index.floor() as usize;
            let right = (left + 1).min(255);
            (self.curve[left] as f64
                + (self.curve[right] as f64 - self.curve[left] as f64) * (index - left as f64))
                as f32
        })
    }
    pub(crate) fn at(&mut self, input: [f64; 2]) -> [f64; 2] {
        let first = self.up[0].at(input.map(|v| v as f32), &self.up_kernel);
        let mut twice = [[0.0; 2]; 2];
        for i in 0..2 {
            let high = self.up[1].at(first[i], &self.up_kernel);
            let shaped = high.map(|v| self.shape(v));
            twice[i] = self.down[0].at(shaped, &self.down_kernel);
        }
        let wet = self.down[1].at(twice, &self.down_kernel);
        std::array::from_fn(|ch| input[ch] * self.dry + wet[ch] as f64 * self.wet)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dry_endpoint_is_exact_and_silence_stays_silent() {
        let mut dry = Distortion::new(1.0, 0.0);
        let mut wet = Distortion::new(1.0, 1.0);
        for i in 0..1000 {
            let input = [(i as f64).sin() * 0.5, (i as f64).cos() * 0.2];
            assert_eq!(dry.at(input), input);
            assert_eq!(wet.at([0.0; 2]), [0.0; 2]);
        }
    }
    #[test]
    fn wet_impulse_has_filter_delay_and_independent_stereo_polarity() {
        let mut effect = Distortion::new(0.5, 1.0);
        let pcm: Vec<_> = (0..600)
            .map(|i| effect.at(if i == 0 { [0.5, -0.5] } else { [0.0; 2] }))
            .collect();
        let peak = pcm
            .iter()
            .enumerate()
            .max_by(|a, b| a.1[0].abs().total_cmp(&b.1[0].abs()))
            .unwrap()
            .0;
        assert_eq!(peak, 192);
        for frame in &pcm {
            assert!((frame[0] + frame[1]).abs() < 1e-7);
        }
        assert!(pcm[450..].iter().all(|v| v.iter().all(|x| x.abs() < 1e-7)));
    }
}
