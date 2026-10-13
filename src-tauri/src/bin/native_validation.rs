#[cfg(target_os = "macos")]
fn main() {
    crispaudio_lib::run_native_validation();
}
#[cfg(not(target_os = "macos"))]
fn main() {
    panic!("Native validation requires macOS");
}
