//! Owner-scoped finite file jobs and one bounded discovery iterator. No audio IO.
use super::*;
use crispaudio_media::native_input::{recovery, verification::Verification};
pub(super) struct Job {
    owner: String,
    id: String,
    cancel: AtomicBool,
    blocks: AtomicU64,
    result: Mutex<Option<Result<Value, String>>>,
    worker: Mutex<Option<JoinHandle<()>>>,
}
impl Job {
    fn finish(&self, cancel: bool) -> Result<Value, String> {
        if cancel {
            self.cancel.store(true, Ordering::Release);
        }
        let mut worker = self.worker.lock().unwrap();
        if let Some(handle) = worker.take() {
            if handle.join().is_err() {
                *self.result.lock().unwrap() = Some(Err("Recovery worker panicked".into()));
            }
        }
        self.result
            .lock()
            .unwrap()
            .clone()
            .ok_or("Recovery has not finished")?
    }
    fn report(&self) -> Value {
        // A panicked worker has no result. Report a terminal fault so the client
        // joins it and receives the error instead of polling forever. Never
        // hold the worker and result locks together (finish joins under worker).
        let finished = self
            .worker
            .try_lock()
            .ok()
            .is_some_and(|worker| worker.as_ref().is_some_and(JoinHandle::is_finished));
        let result = self.result.lock().unwrap();
        let phase = match result.as_ref() {
            Some(Ok(_)) => "complete",
            Some(Err(_)) if self.cancel.load(Ordering::Acquire) => "cancelled",
            Some(Err(_)) => "fault",
            None if self.cancel.load(Ordering::Acquire) => "cancelling",
            None if finished => "fault",
            None => "verifying",
        };
        json!({"phase":phase,"blocks":self.blocks.load(Ordering::Relaxed)})
    }
}
pub(super) struct Scan {
    owner: String,
    id: String,
    project: Option<String>,
    cancel: AtomicBool,
    scanner: Mutex<Option<recovery::Scanner>>,
}
impl NativeRecording {
    fn recovery_job(&self, owner: &str, id: &str) -> Result<Arc<Job>, String> {
        self.recovery
            .lock()
            .unwrap()
            .as_ref()
            .filter(|job| job.owner == owner && job.id == id)
            .cloned()
            .ok_or("Unknown recovery job".into())
    }
    fn start_recovery(
        &self,
        owner: String,
        root: PathBuf,
        group: String,
    ) -> Result<String, String> {
        let lease = self.reserve_recovery()?;
        let mut slot = self.recovery.lock().unwrap();
        if slot.is_some() {
            return Err("Close existing recovery job first".into());
        }
        let id = run_token(self.sequence.fetch_add(1, Ordering::Relaxed))?;
        let job = Arc::new(Job {
            owner,
            id: id.clone(),
            cancel: AtomicBool::new(false),
            blocks: AtomicU64::new(0),
            result: Mutex::new(None),
            worker: Mutex::new(None),
        });
        let task = job.clone();
        let worker=thread::Builder::new().name("recording-recovery".into()).spawn(move||{
   let _lease=lease;let verification=Verification::new(&task.cancel, Some(&task.blocks));
   let result=(||{
    verification.check()?;let directory=recovery::managed_group(&root,&group)?;
    if directory.join("completed.json").symlink_metadata().is_ok(){
     let manifest=group::load_completed_checked(&directory,verification)?;
     if manifest.version!=2{return Err("Recording has no verified timing".into());}
     verification.check()?;
     return Ok(json!({"phase":"complete","incomplete":false,"group":group,"directory":directory,"manifest":manifest,"reasons":[]}));
    }
    let (directory,result)=recovery::recover_checked(&root,&group,verification)?;verification.check()?;
    Ok(json!({"phase":"recovered","incomplete":true,"group":group,"directory":directory,"manifest":result.manifest,"reasons":result.reasons}))
   })();*task.result.lock().unwrap()=Some(result);
  }).map_err(|e|e.to_string())?;
        *job.worker.lock().unwrap() = Some(worker);
        *slot = Some(job);
        Ok(id)
    }
    pub(super) fn stop_recovery_owner(&self, owner: &str) {
        let job = {
            let mut slot = self.recovery.lock().unwrap();
            if slot.as_ref().is_some_and(|j| j.owner == owner) {
                slot.take()
            } else {
                None
            }
        };
        if let Some(job) = job {
            let _ = job.finish(true);
        }
        let mut scan = self.scan.lock().unwrap();
        if scan.as_ref().is_some_and(|s| s.owner == owner) {
            scan.take().unwrap().cancel.store(true, Ordering::Release);
        }
    }
    pub(super) fn invalidate_discovery(&self) {
        if let Some(scan) = self.scan.lock().unwrap().take() {
            scan.cancel.store(true, Ordering::Release);
        }
    }
    pub(super) fn stop_recovery(&self) {
        if let Some(job) = self.recovery.lock().unwrap().take() {
            let _ = job.finish(true);
        }
        if let Some(scan) = self.scan.lock().unwrap().take() {
            scan.cancel.store(true, Ordering::Release);
        }
    }
    fn scan_session(
        &self,
        owner: &str,
        id: &str,
        more: bool,
        project: Option<String>,
    ) -> Result<Arc<Scan>, String> {
        if project.as_ref().is_some_and(|p| !valid_id(p)) {
            return Err("Invalid discovery project".into());
        }
        if id.is_empty()
            || id.len() > 64
            || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        {
            return Err("Invalid discovery cursor".into());
        }
        let mut slot = self.scan.lock().unwrap();
        if more {
            return slot
                .as_ref()
                .filter(|s| {
                    s.owner == owner
                        && s.id == id
                        && s.project == project
                        && !s.cancel.load(Ordering::Acquire)
                })
                .cloned()
                .ok_or("recording.recoveryRefresh".into());
        }
        if let Some(old) = slot.take() {
            old.cancel.store(true, Ordering::Release);
        }
        let scan = Arc::new(Scan {
            owner: owner.into(),
            id: id.into(),
            project,
            cancel: AtomicBool::new(false),
            scanner: Mutex::new(None),
        });
        *slot = Some(scan.clone());
        Ok(scan)
    }
    fn close_scan(&self, owner: &str, id: &str) {
        let mut slot = self.scan.lock().unwrap();
        if slot
            .as_ref()
            .is_some_and(|s| s.owner == owner && s.id == id)
        {
            slot.take().unwrap().cancel.store(true, Ordering::Release);
        }
    }
}
fn root(window: &tauri::WebviewWindow) -> Result<PathBuf, String> {
    if window
        .app_handle()
        .get_webview_window(window.label())
        .is_none()
    {
        return Err("Recording window closed".into());
    }
    Ok(window
        .app_handle()
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("recordings"))
}
#[tauri::command]
pub fn native_recording_recovery_start(
    window: tauri::WebviewWindow,
    state: tauri::State<NativeRecording>,
    group: String,
) -> Result<String, String> {
    let directory = root(&window)?;
    let id = state.start_recovery(window.label().into(), directory, group)?;
    if window
        .app_handle()
        .get_webview_window(window.label())
        .is_none()
    {
        state.stop_recovery_owner(window.label());
        return Err("Recording window closed".into());
    }
    Ok(id)
}
#[tauri::command]
pub fn native_recording_recovery_status(
    window: tauri::WebviewWindow,
    state: tauri::State<NativeRecording>,
    job: String,
) -> Result<Value, String> {
    Ok(state.recovery_job(window.label(), &job)?.report())
}
#[tauri::command]
pub async fn native_recording_recovery_close(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativeRecording>,
    job: String,
    cancel: bool,
) -> Result<Value, String> {
    let task = state.recovery_job(window.label(), &job)?;
    if cancel {
        task.cancel.store(true, Ordering::Release);
    }
    let result = tauri::async_runtime::spawn_blocking(move || task.finish(cancel))
        .await
        .map_err(|e| e.to_string())?;
    let mut slot = state.recovery.lock().unwrap();
    if slot
        .as_ref()
        .is_some_and(|j| j.id == job && j.owner == window.label())
    {
        slot.take();
    }
    result
}
#[tauri::command]
pub async fn native_recording_discover(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, NativeRecording>,
    scan: String,
    more: bool,
    project: Option<String>,
) -> Result<Value, String> {
    let root = root(&window)?;
    let lease = state.reserve_recovery()?;
    let session = state.scan_session(window.label(), &scan, more, project)?;
    if window
        .app_handle()
        .get_webview_window(window.label())
        .is_none()
    {
        state.close_scan(window.label(), &scan);
        return Err("Recording window closed".into());
    }
    let done = session.clone();
    let result=tauri::async_runtime::spawn_blocking(move||{
  let _lease=lease;let verification=Verification::new(&session.cancel, None);verification.check()?;
  let mut scanner=session.scanner.lock().unwrap();if scanner.is_none(){*scanner=Some(recovery::Scanner::open(&root)?);}
  let page=scanner.as_mut().unwrap().page_for(verification,session.project.as_deref())?;verification.check()?;
  Ok::<_,String>(json!({"candidates":page.candidates,"scanned":page.scanned,"rejected":page.rejected,"truncated":page.truncated,"nextCursor":if page.truncated{Some(session.id.clone())}else{None}}))
 }).await.map_err(|e|e.to_string())?;
    if result.as_ref().map_or(true, |r| r["nextCursor"].is_null()) {
        state.close_scan(&done.owner, &done.id);
    }
    result
}
#[tauri::command]
pub fn native_recording_discovery_close(
    window: tauri::WebviewWindow,
    state: tauri::State<NativeRecording>,
    scan: String,
) {
    state.close_scan(window.label(), &scan);
}
#[cfg(test)]
mod tests;
