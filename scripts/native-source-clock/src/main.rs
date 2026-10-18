//! Standalone test driver: production native worker, ring, DSP and helper transport.
//! It has no Tauri app/window or device inventory. Queue creation aborts locally,
//! before a hardware output could open. Run tests with --include-ignored.
#![allow(dead_code)]
#[cfg(not(target_os = "macos"))]
compile_error!("Native source clock qualification requires macOS");
#[cfg(all(test, target_os = "macos"))]
#[path = "../../../src-tauri/src/native_audio_clock.rs"]
mod native_audio_clock;

#[cfg(all(test, target_os = "macos"))]
mod commands {
    pub mod audio_output {
        pub struct Device {
            pub id: String,
        }
        pub fn list_audio_outputs() -> Result<Vec<Device>, String> {
            panic!("Null-output qualification must not enumerate devices")
        }
    }
}

#[cfg(all(test, target_os = "macos"))]
#[allow(non_snake_case)]
#[no_mangle]
pub unsafe extern "C" fn AudioQueueNewOutput(
    _: *const std::ffi::c_void,
    _: *const std::ffi::c_void,
    _: *mut std::ffi::c_void,
    _: *const std::ffi::c_void,
    _: *const std::ffi::c_void,
    _: u32,
    _: *mut *mut std::ffi::c_void,
) -> i32 {
    eprintln!("Hardware queue creation is forbidden in the null-output test driver");
    std::process::abort()
}
fn main() {
    eprintln!("Use cargo test --manifest-path scripts/native-source-clock/Cargo.toml -- --include-ignored --test-threads=1 --nocapture on macOS");
    std::process::exit(2);
}

#[cfg(all(test, target_os = "macos"))]
mod bridge;
