//! Mach deadlines for dedicated native audio/pipe threads; never UI executors.
//! Configure after preparation. Threads block when idle and release on exit.
use std::ffi::c_void;
#[repr(C)]
struct Timebase {
    numer: u32,
    denom: u32,
}
extern "C" {
    fn mach_timebase_info(base: *mut Timebase) -> i32;
    fn pthread_self() -> *mut c_void;
    fn pthread_mach_thread_np(thread: *mut c_void) -> u32;
    fn thread_policy_set(thread: u32, flavor: i32, policy: *mut i32, count: u32) -> i32;
}
pub fn configure(frames: u32, rate: f64) -> Result<(), String> {
    if !(1..=4096).contains(&frames) || !rate.is_finite() || !(8000.0..=192000.0).contains(&rate) {
        return Err("Invalid audio scheduling interval".into());
    }
    let mut base = Timebase { numer: 0, denom: 0 };
    if unsafe { mach_timebase_info(&mut base) } != 0 || base.numer == 0 {
        return Err("Cannot read native scheduling clock".into());
    }
    let period =
        (frames as f64 * 1_000_000_000. / rate * base.denom as f64 / base.numer as f64) as u32;
    let mut policy = [period, period / 2, period, 1];
    let code = unsafe {
        thread_policy_set(
            pthread_mach_thread_np(pthread_self()),
            2,
            policy.as_mut_ptr().cast(),
            4,
        )
    };
    if code != 0 {
        return Err(format!("Cannot schedule real-time native worker ({code})"));
    }
    Ok(())
}
