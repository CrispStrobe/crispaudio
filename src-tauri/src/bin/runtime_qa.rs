//! Isolated debug-only WebKit snapshot qualification. No audio commands are registered.
#[cfg(all(debug_assertions, target_os = "macos"))]
fn main() {
    // Keep the guards in the final executable even when the linker removes all
    // unreachable audio code. Taking their addresses does not create a queue.
    std::hint::black_box(AudioQueueNewOutput as *const ());
    std::hint::black_box(AudioQueueNewInput as *const ());
    crispaudio_lib::run_native_runtime_qa();
}
#[cfg(not(all(debug_assertions, target_os = "macos")))]
fn main() {
    panic!("Runtime qualification requires a debug macOS build");
}
// These strong symbols intercept native queue creation in this executable only.
// The ordinary app and its libraries retain their actual platform implementations.
#[cfg(all(debug_assertions, target_os = "macos"))]
macro_rules! forbid_queue {
    ($name:ident) => {
        #[no_mangle]
        pub unsafe extern "C" fn $name(
            _: *const std::ffi::c_void,
            _: *const std::ffi::c_void,
            _: *mut std::ffi::c_void,
            _: *const std::ffi::c_void,
            _: *const std::ffi::c_void,
            _: u32,
            _: *mut *mut std::ffi::c_void,
        ) -> i32 {
            eprintln!("Audio queue creation forbidden in runtime QA");
            std::process::abort()
        }
    };
}
#[cfg(all(debug_assertions, target_os = "macos"))]
forbid_queue!(AudioQueueNewOutput);
#[cfg(all(debug_assertions, target_os = "macos"))]
forbid_queue!(AudioQueueNewInput);
