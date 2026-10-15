#[allow(dead_code)]
mod native_helpers {
    include!("../media/build.rs");
}
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let root = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
        let output = root.join("generated/native-helpers");
        let target = std::env::var("TARGET").unwrap();
        native_helpers::build_helpers(&root.join("../media"), &output, &target);
        for name in ["crispaudio-apple-media", "crispaudio-vst3-host"] {
            std::fs::copy(output.join(name), output.join(format!("{name}-{target}")))
                .expect("Cannot stage signed-bundle sidecar");
        }
    }
    tauri_build::build()
}
