use crate::Result;
use serde_json::Value;
pub(crate) struct Ducking {
    pub source: usize,
    envelope: f64,
    threshold: f64,
    ratio: f64,
    attack: f64,
    release: f64,
    maximum: f64,
}
impl Ducking {
    pub fn new(config: &Value, source: usize) -> Result<Self> {
        let read = |key: &str, min: f64, max: f64| -> Result<f64> {
            let value = config[key].as_f64().ok_or("Invalid ducking parameter")?;
            if !value.is_finite() || !(min..=max).contains(&value) {
                return Err("Ducking parameter out of bounds".into());
            }
            Ok(value as f32 as f64)
        };
        Ok(Self {
            source,
            envelope: 0.0,
            threshold: read("threshold", -60.0, 0.0)?,
            ratio: read("ratio", 1.0, 20.0)?,
            attack: read("attack", 0.001, 1.0)?,
            release: read("release", 0.005, 3.0)?,
            maximum: read("maximum", 0.0, 60.0)?,
        })
    }
    pub fn gain(&mut self, detector: [f64; 2]) -> f64 {
        let detector = detector
            .into_iter()
            .map(|v| (v as f32).abs() as f64)
            .fold(0.0, f64::max);
        let coefficient = (-1.0
            / (48000.0
                * if detector > self.envelope {
                    self.attack
                } else {
                    self.release
                }))
        .exp();
        self.envelope = coefficient * self.envelope + (1.0 - coefficient) * detector;
        let db = 20.0 * self.envelope.max(1e-12).log10();
        let reduction =
            ((db - self.threshold).max(0.0) * (1.0 - 1.0 / self.ratio)).min(self.maximum);
        10.0f64.powf(-reduction / 20.0)
    }
}
