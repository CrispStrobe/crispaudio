use super::*;
#[test]
fn recovery_job_ownership_cancellation_and_shutdown_join_before_releasing_reservation() {
    let state = NativeRecording::default();
    let lease = state.reserve_recovery().unwrap();
    let job = Arc::new(Job {
        owner: "main".into(),
        id: "job".into(),
        cancel: AtomicBool::new(false),
        blocks: AtomicU64::new(4),
        result: Mutex::new(None),
        worker: Mutex::new(None),
    });
    let task = job.clone();
    *job.worker.lock().unwrap() = Some(thread::spawn(move || {
        let _lease = lease;
        while !task.cancel.load(Ordering::Acquire) {
            thread::sleep(Duration::from_millis(1));
        }
        *task.result.lock().unwrap() = Some(Err("cancelled".into()));
    }));
    *state.recovery.lock().unwrap() = Some(job.clone());
    assert!(state.recovery_job("other", "job").is_err());
    assert!(state.reserve_recovery().is_err());
    assert_eq!(job.report()["blocks"], 4);
    state.stop_recovery_owner("other");
    assert!(!job.cancel.load(Ordering::Acquire));
    state.stop_recovery_owner("main");
    assert!(job.worker.lock().unwrap().is_none());
    assert_eq!(job.report()["phase"], "cancelled");
    assert!(state.reserve_recovery().is_ok());
    assert!(state.recovery_job("main", "job").is_err());
}
#[test]
fn discovery_cursor_is_owned_bound_to_project_and_closed_on_refresh_or_window_close() {
    let state = NativeRecording::default();
    let first = state
        .scan_session("main", "cursor-1", false, Some("p".into()))
        .unwrap();
    assert!(state
        .scan_session("other", "cursor-1", true, Some("p".into()))
        .is_err());
    assert!(state
        .scan_session("main", "cursor-1", true, Some("other".into()))
        .is_err());
    assert!(state
        .scan_session("main", "cursor-1", true, Some("p".into()))
        .is_ok());
    let second = state.scan_session("main", "cursor-2", false, None).unwrap();
    assert!(first.cancel.load(Ordering::Acquire));
    state.close_scan("other", "cursor-2");
    assert!(!second.cancel.load(Ordering::Acquire));
    state.stop_recovery_owner("main");
    assert!(second.cancel.load(Ordering::Acquire));
    assert!(state
        .scan_session("main", "../outside", false, None)
        .is_err());
}
#[test]
fn worker_error_is_terminal_and_close_keeps_the_result_until_joined() {
    let root = std::env::temp_dir();
    let state = NativeRecording::default();
    let id = state
        .start_recovery("main".into(), root, "../outside".into())
        .unwrap();
    let job = state.recovery_job("main", &id).unwrap();
    assert!(job.finish(false).is_err());
    assert_eq!(job.report()["phase"], "fault");
    assert!(job.finish(false).is_err());
    state.shutdown();
    assert!(state.recovery.lock().unwrap().is_none());
}

#[test]
fn panicked_worker_reports_fault_so_the_client_can_join_instead_of_polling_forever() {
    let job = Job {
        owner: "main".into(),
        id: "panic".into(),
        cancel: AtomicBool::new(false),
        blocks: AtomicU64::new(0),
        result: Mutex::new(None),
        worker: Mutex::new(Some(thread::spawn(|| panic!("fixture worker failure")))),
    };
    while !job.worker.lock().unwrap().as_ref().unwrap().is_finished() {
        thread::yield_now();
    }
    assert_eq!(job.report()["phase"], "fault");
    assert!(job.finish(false).unwrap_err().contains("panicked"));
    assert!(job.worker.lock().unwrap().is_none());
}
