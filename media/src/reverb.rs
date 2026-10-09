//! Zero-latency, bounded-state stereo convolution for the GUI's seeded reverb.
//! Own MIT DSP using the existing MIT/Apache-2.0 rustfft dependency.
use crate::Result;
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::sync::Arc;
const RATE: f64 = 48000.0;
const HEAD: usize = 32;
const MAX_BLOCK: usize = 4096;

struct Group {
    block: usize,
    kernels: Vec<[Vec<Complex<f32>>; 2]>,
    history: Vec<[Vec<Complex<f32>>; 2]>,
    history_cursor: usize,
    input: Vec<[f32; 2]>,
    input_cursor: usize,
    output: Vec<[f64; 2]>,
    output_cursor: usize,
    work: Vec<Complex<f32>>,
    scratch: Vec<Complex<f32>>,
    forward: Arc<dyn Fft<f32>>,
    inverse: Arc<dyn Fft<f32>>,
}
impl Group {
    fn new(impulse: &[[f32; 2]], block: usize, planner: &mut FftPlanner<f32>) -> Self {
        let size = block * 2;
        let forward = planner.plan_fft_forward(size);
        let inverse = planner.plan_fft_inverse(size);
        let mut scratch = vec![
            Complex::default();
            forward
                .get_inplace_scratch_len()
                .max(inverse.get_inplace_scratch_len())
        ];
        let mut kernels = Vec::new();
        for part in impulse.chunks(block) {
            let mut pair = std::array::from_fn(|_| vec![Complex::default(); size]);
            for ch in 0..2 {
                for (i, sample) in part.iter().enumerate() {
                    pair[ch][i].re = sample[ch];
                }
                forward.process_with_scratch(&mut pair[ch], &mut scratch);
            }
            kernels.push(pair);
        }
        let history = (0..kernels.len())
            .map(|_| std::array::from_fn(|_| vec![Complex::default(); size]))
            .collect();
        Self {
            block,
            kernels,
            history,
            history_cursor: 0,
            input: vec![[0.0; 2]; block],
            input_cursor: 0,
            output: vec![[0.0; 2]; size],
            output_cursor: 0,
            work: vec![Complex::default(); size],
            scratch,
            forward,
            inverse,
        }
    }
    fn at(&mut self, sample: [f32; 2]) -> [f64; 2] {
        let output = self.output[self.output_cursor];
        self.output[self.output_cursor] = [0.0; 2];
        self.input[self.input_cursor] = sample;
        self.input_cursor += 1;
        if self.input_cursor == self.block {
            let count = self.kernels.len();
            let size = self.block * 2;
            for ch in 0..2 {
                let spectrum = &mut self.history[self.history_cursor][ch];
                spectrum.fill(Complex::default());
                for (i, input) in self.input.iter().enumerate() {
                    spectrum[i].re = input[ch];
                }
                self.forward
                    .process_with_scratch(spectrum, &mut self.scratch);
                self.work.fill(Complex::default());
                for part in 0..count {
                    let past = &self.history[(self.history_cursor + count - part) % count][ch];
                    let kernel = &self.kernels[part][ch];
                    for i in 0..size {
                        self.work[i] += past[i] * kernel[i];
                    }
                }
                self.inverse
                    .process_with_scratch(&mut self.work, &mut self.scratch);
                // Each group starts at IR offset=block, so the freshly computed
                // block arrives beginning with the next frame: no added latency.
                // Linear convolution has at most 2*block-1 nonzero samples.
                for i in 0..size - 1 {
                    let target = (self.output_cursor + 1 + i) % size;
                    self.output[target][ch] += self.work[i].re as f64 / size as f64;
                }
            }
            self.input_cursor = 0;
            self.history_cursor = (self.history_cursor + 1) % count;
        }
        self.output_cursor = (self.output_cursor + 1) % self.output.len();
        output
    }
}

pub(crate) struct Reverb {
    head: [[f32; 2]; HEAD],
    history: [[f32; 2]; HEAD],
    cursor: usize,
    groups: Vec<Group>,
    wet: f64,
    dry: f64,
}
impl Reverb {
    /// Conservative reservation includes IR generation, spectra, history, FFT
    /// work/scratch and pending overlap buffers. It is independent of duration.
    pub(crate) fn state_bytes(length: usize) -> usize {
        // rustfft plan metadata is small and separate from this buffer budget.
        length * 96 + 1024 * 1024
    }
    pub(crate) fn length(size: f64) -> usize {
        ((0.1 + size.clamp(0.0, 1.0) * 4.9) * RATE).round() as usize
    }
    pub(crate) fn new(size: f64, decay: f64, mix: f64) -> Result<Self> {
        if !size.is_finite() || !decay.is_finite() || !mix.is_finite() {
            return Err("Non-finite reverb parameters".into());
        }
        let decay = decay.max(0.01);
        let mix = mix.clamp(0.0, 1.0);
        let length = Self::length(size);
        let mut impulse = vec![[0.0; 2]; length];
        for ch in 0..2 {
            let mut seed = 0x9e3779b9u32 ^ (ch as u32 + 1).wrapping_mul(0x85ebca6b);
            for (i, sample) in impulse.iter_mut().enumerate() {
                if i % 1024 == 0 && crate::jobs::cancelled() {
                    return Err("Operation cancelled".into());
                }
                let t = i as f64 / RATE;
                let envelope = (-3.0 * t / decay.max(0.001)).exp();
                let early = (-t / 0.1).exp() * 0.3;
                let late = (-t / (decay * 0.5).max(0.001)).exp() * 0.7;
                seed ^= seed << 13;
                seed ^= seed >> 17;
                seed ^= seed << 5;
                let noise = (seed as f64 / 4294967296.0 * 2.0 - 1.0) * 0.1;
                sample[ch] = ((early + late + noise) * envelope) as f32;
            }
        }
        // WebKit's ConvolverNode normalizes by RMS with -58 dB calibration.
        // The Web Audio text rounds this factor to 0.00125; use the actual
        // macOS renderer calibration for reproducible GUI/CLI levels.
        let power = (impulse
            .iter()
            .flat_map(|s| s.iter())
            .map(|&v| (v as f64).powi(2))
            .sum::<f64>()
            / (length * 2) as f64)
            .sqrt()
            .max(0.000125);
        let scale = ((1.0f32 / power as f32)
            * 10.0f32.powf(-58.0 * 0.05)
            * (44100.0f32 / RATE as f32)) as f64;
        for sample in &mut impulse {
            for v in sample {
                *v = (*v as f64 * scale) as f32;
            }
        }
        Ok(Self::from_impulse(&impulse, mix))
    }
    fn from_impulse(impulse: &[[f32; 2]], mix: f64) -> Self {
        let mut head = [[0.0; 2]; HEAD];
        for (i, sample) in impulse.iter().take(HEAD).enumerate() {
            head[i] = *sample;
        }
        let mut planner = FftPlanner::new();
        let mut groups = Vec::new();
        let mut offset = HEAD;
        while offset < impulse.len() {
            let block = offset.min(MAX_BLOCK);
            let end = if block == MAX_BLOCK {
                impulse.len()
            } else {
                (offset + block).min(impulse.len())
            };
            groups.push(Group::new(&impulse[offset..end], block, &mut planner));
            offset = end;
        }
        Self {
            head,
            history: [[0.0; 2]; HEAD],
            cursor: 0,
            groups,
            wet: mix as f32 as f64,
            dry: (1.0 - mix * 0.7) as f32 as f64,
        }
    }
    pub(crate) fn at(&mut self, input: [f64; 2]) -> [f64; 2] {
        let sample = input.map(|v| v as f32);
        self.history[self.cursor] = sample;
        let mut wet = [0.0; 2];
        for i in 0..HEAD {
            let past = self.history[(self.cursor + HEAD - i) % HEAD];
            for ch in 0..2 {
                wet[ch] += past[ch] as f64 * self.head[i][ch] as f64;
            }
        }
        self.cursor = (self.cursor + 1) % HEAD;
        for group in &mut self.groups {
            let delayed = group.at(sample);
            for ch in 0..2 {
                wet[ch] += delayed[ch];
            }
        }
        std::array::from_fn(|ch| input[ch] * self.dry + wet[ch] * self.wet)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn partition_boundaries_match_independent_sparse_convolution() {
        let impulse: Vec<_> = (0..10001)
            .map(|i| {
                [
                    ((i as f64 * 0.13).sin() * 0.02) as f32,
                    ((i as f64 * 0.37).cos() * 0.01) as f32,
                ]
            })
            .collect();
        let inputs = [
            (0, [0.3f32, -0.2]),
            (31, [-0.1, 0.7]),
            (4097, [0.4, 0.2]),
            (9000, [-0.3, 0.1]),
        ];
        let mut reverb = Reverb::from_impulse(&impulse, 1.0);
        for frame in 0usize..20010 {
            let input = inputs
                .iter()
                .find(|(i, _)| *i == frame)
                .map(|(_, s)| s.map(|v| v as f64))
                .unwrap_or([0.0; 2]);
            let actual = reverb.at(input);
            for ch in 0..2 {
                let expected = input[ch] * reverb.dry
                    + inputs
                        .iter()
                        .filter_map(|(i, v)| {
                            frame
                                .checked_sub(*i)
                                .and_then(|j| impulse.get(j))
                                .map(|h| h[ch] as f64 * v[ch] as f64)
                        })
                        .sum::<f64>();
                assert!(
                    (actual[ch] - expected).abs() < 1e-7,
                    "frame={frame}, ch={ch}, actual={}, expected={expected}",
                    actual[ch]
                );
            }
        }
    }
    #[test]
    fn seeded_response_is_reproducible_and_stereo() {
        let mut a = Reverb::new(0.0, 1.5, 1.0).unwrap();
        let mut b = Reverb::new(0.0, 1.5, 1.0).unwrap();
        let first = a.at([1.0; 2]);
        assert_eq!(first, b.at([1.0; 2]));
        assert_ne!(first[0], first[1]);
        for _ in 0..6000 {
            assert_eq!(a.at([0.0; 2]), b.at([0.0; 2]));
        }
    }
}
