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
mod hardware_guards {
    macro_rules! forbidden_queue {
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
                eprintln!("Native source null QA forbids hardware queues");
                std::process::abort()
            }
        };
    }
    forbidden_queue!(AudioQueueNewOutput);
    forbidden_queue!(AudioQueueNewInput);
    #[no_mangle]
    pub unsafe extern "C" fn AudioObjectGetPropertyDataSize(
        _: u32,
        _: *const std::ffi::c_void,
        _: u32,
        _: *const std::ffi::c_void,
        _: *mut u32,
    ) -> i32 {
        eprintln!("Native source null QA forbids device inventory");
        std::process::abort()
    }
    #[no_mangle]
    pub unsafe extern "C" fn AudioObjectGetPropertyData(
        _: u32,
        _: *const std::ffi::c_void,
        _: u32,
        _: *const std::ffi::c_void,
        _: *mut u32,
        _: *mut std::ffi::c_void,
    ) -> i32 {
        eprintln!("Native source null QA forbids device property queries");
        std::process::abort()
    }

    pub fn retain() {
        // Keep definitions even if this fixture's reachable graph needs no CoreAudio.
        std::hint::black_box(AudioQueueNewOutput as *const ());
        std::hint::black_box(AudioQueueNewInput as *const ());
        std::hint::black_box(AudioObjectGetPropertyDataSize as *const ());
        std::hint::black_box(AudioObjectGetPropertyData as *const ());
    }

    #[test]
    fn guard_definitions_are_retained() {
        retain();
    }
}
fn main() {
    eprintln!("Use cargo test --manifest-path scripts/native-source-clock/Cargo.toml -- --include-ignored --test-threads=1 --nocapture on macOS");
    std::process::exit(2);
}

#[cfg(all(test, target_os = "macos"))]
mod bridge;
