//! Zero-latency stereo-linked sample-peak limiter. Original MIT implementation.
pub(crate) struct Limiter {
    gain: f64,
    ceiling: f64,
    coefficient: f64,
}
impl Limiter {
    pub(crate) fn new(rate: f64, ceiling: f64, release: f64) -> Self {
        let ceiling = ceiling as f32 as f64;
        let release = release as f32 as f64;
        Self {
            gain: 1.0,
            ceiling: 10.0f64.powf(ceiling.clamp(-24.0, 0.0) / 20.0),
            coefficient: -(-1.0 / (release.clamp(0.01, 2.0) * rate)).exp_m1(),
        }
    }
    pub(crate) fn at(&mut self, input: [f64; 2]) -> [f64; 2] {
        // Same float input buffers as the browser worklet; retain double envelope.
        let input = input.map(|v| v as f32 as f64);
        let peak = input[0].abs().max(input[1].abs());
        let target = if peak > self.ceiling {
            self.ceiling / peak
        } else {
            1.0
        };
        self.gain = target.min(self.gain + (1.0 - self.gain) * self.coefficient);
        input.map(|v| v * self.gain)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ceiling_stereo_link_release_and_zero_delay() {
        let mut limiter = Limiter::new(48000.0, -1.0, 0.1);
        let limited = limiter.at([4.0, -1.0]);
        assert!((limited[0] - 10.0f64.powf(-1.0 / 20.0)).abs() < 1e-12);
        assert!((limited[0] / limited[1] + 4.0).abs() < 1e-12);
        let initial = limiter.gain;
        for _ in 0..4800 {
            limiter.at([0.0, 0.0]);
        }
        assert!((limiter.gain - (1.0 - (1.0 - initial) * (-1.0f64).exp())).abs() < 1e-7);
    }
    #[test]
    fn isolated_impulses_and_silence_are_bounded() {
        let mut limiter = Limiter::new(48000.0, -6.0, 0.01);
        for i in 0..96000 {
            let input = if i % 997 == 0 {
                [1000.0, -500.0]
            } else {
                [0.0, 0.0]
            };
            let output = limiter.at(input);
            assert!(output
                .iter()
                .all(|v| v.abs() <= 10.0f64.powf(-6.0 / 20.0) + 1e-12));
            if input == [0.0, 0.0] {
                assert_eq!(output, [0.0, 0.0]);
            }
        }
    }
}
