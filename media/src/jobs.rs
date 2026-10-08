//! Cooperative job cancellation, propagated through blocking FFmpeg operations.
use std::{
    cell::RefCell,
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};
type Token = Arc<AtomicBool>;
static JOBS: OnceLock<Mutex<HashMap<String, Token>>> = OnceLock::new();
thread_local! { static ACTIVE:RefCell<Option<Token>>=const {RefCell::new(None)}; }
pub fn cancel(id: &str) -> bool {
    let jobs = JOBS.get_or_init(Default::default).lock().unwrap();
    if let Some(token) = jobs.get(id) {
        token.store(true, Ordering::Relaxed);
        true
    } else {
        false
    }
}
pub fn cancelled() -> bool {
    ACTIVE.with(|slot| {
        slot.borrow()
            .as_ref()
            .is_some_and(|token| token.load(Ordering::Relaxed))
    })
}
pub fn run<T>(id: Option<String>, task: impl FnOnce() -> crate::Result<T>) -> crate::Result<T> {
    let Some(id) = id else {
        return task();
    };
    let token = Arc::new(AtomicBool::new(false));
    {
        let mut jobs = JOBS.get_or_init(Default::default).lock().unwrap();
        if jobs.contains_key(&id) {
            return Err("Job ID already active".into());
        }
        jobs.insert(id.clone(), token.clone());
    }
    ACTIVE.with(|slot| *slot.borrow_mut() = Some(token));
    let result = task();
    ACTIVE.with(|slot| *slot.borrow_mut() = None);
    JOBS.get().unwrap().lock().unwrap().remove(&id);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cancellation_is_scoped_and_removed_after_completion() {
        let id = format!("test-{}", std::process::id());
        let worker_id = id.clone();
        let (send, receive) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            run(Some(worker_id), || {
                send.send(()).unwrap();
                while !cancelled() {
                    std::thread::sleep(std::time::Duration::from_millis(1));
                }
                Err::<(), _>("Operation cancelled".into())
            })
        });
        receive
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        assert!(cancel(&id));
        assert!(worker.join().unwrap().is_err());
        assert!(!cancel(&id));
        assert!(!cancelled());
    }
}
