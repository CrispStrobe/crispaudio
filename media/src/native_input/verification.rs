//! Cooperative file-work cancellation/progress, never used by audio callbacks.
use crate::Result;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
static NEVER: AtomicBool = AtomicBool::new(false);
#[derive(Clone, Copy)]
pub struct Verification<'a> {
    cancel: &'a AtomicBool,
    blocks: Option<&'a AtomicU64>,
}
impl Default for Verification<'_> {
    fn default() -> Self {
        Self {
            cancel: &NEVER,
            blocks: None,
        }
    }
}
impl<'a> Verification<'a> {
    pub fn new(cancel: &'a AtomicBool, blocks: Option<&'a AtomicU64>) -> Self {
        Self { cancel, blocks }
    }
    pub fn cancelled(self) -> bool {
        self.cancel.load(Ordering::Acquire)
    }
    pub fn check(self) -> Result<()> {
        if self.cancel.load(Ordering::Acquire) {
            Err("Recording verification cancelled".into())
        } else {
            Ok(())
        }
    }
    pub fn block(self) -> Result<()> {
        self.check()?;
        if let Some(blocks) = self.blocks {
            blocks.fetch_add(1, Ordering::Relaxed);
        }
        Ok(())
    }
}
