//! Test-only consumer for the standalone frontend bridge. Never linked into a
//! normal app. Uses production worker/fill/clock code, with synthetic queue time.
use super::*;
use std::collections::VecDeque;

pub fn helpers_closed(control: &LiveControl) -> bool {
    control
        .stop
        .helper
        .lock()
        .unwrap()
        .iter()
        .all(|helper| !helper.is_alive())
}

pub fn run(
    snapshot: Arc<crispaudio_media::native_snapshot::Snapshot>,
    start: u32,
    end: u32,
    cycle: bool,
    loop_start: Option<u32>,
    control: Arc<LiveControl>,
) -> Result<Value, String> {
    run_with_output(
        snapshot,
        start,
        end,
        cycle,
        loop_start,
        true,
        control,
        0,
        |state| {
            let mut pending = VecDeque::new();
            for _ in 0..2 {
                let mut block = [0.; SAMPLES];
                state.fill(&mut block);
                pending.push_back(block);
            }
            let epoch = Instant::now();
            let mut elapsed = 0;
            loop {
                if state.control.stop.stop.load(Ordering::Acquire) {
                    break;
                }
                if epoch.elapsed() > Duration::from_secs(30) {
                    return Err("Null bridge playback deadline exceeded".into());
                }
                let fault = state.ring.fault.load(Ordering::Acquire);
                if fault != 0 {
                    state.control.fault.store(fault, Ordering::Release);
                    return Err(format!("Null bridge ring fault ({fault})"));
                }
                let paused = state.control.paused.load(Ordering::Acquire);
                state
                    .control
                    .phase
                    .store(if paused { 2 } else { 1 }, Ordering::Release);
                if paused {
                    thread::sleep(Duration::from_millis(2));
                    continue;
                }
                let count = if cycle {
                    FRAMES as u64
                } else {
                    (end - start) as u64 - elapsed
                }
                .min(FRAMES as u64);
                let _consumed = pending.pop_front().unwrap();
                elapsed += count;
                if publish_clock(
                    &state.control,
                    start,
                    end,
                    cycle,
                    loop_start.unwrap_or(start),
                    elapsed,
                ) {
                    break;
                }
                let mut next = [0.; SAMPLES];
                state.fill(&mut next);
                pending.push_back(next);
                thread::sleep(Duration::from_secs_f64(count as f64 / 48000.));
            }
            Ok(())
        },
    )
}
