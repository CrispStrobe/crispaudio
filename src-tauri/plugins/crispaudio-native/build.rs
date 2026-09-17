// Command names must match the @objc methods in
// ios/Sources/CrispAudioNative/CrispAudioNativePlugin.swift. Tauri bridges them
// by name, so a mismatch only shows up at runtime.
const COMMANDS: &[&str] = &["listVoices", "synthesize", "shareFile", "haptic"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
