fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let root = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
        let output = root.join("generated/native-helpers");
        let target = std::env::var("TARGET").unwrap();
        // Keep architecture-specific source copies stable while other targets stage aliases.
        let sources = output.join(&target);
        crispaudio_native_helper_build::build_helpers(&root.join("../media"), &sources, &target);
        for name in ["crispaudio-apple-media", "crispaudio-vst3-host"] {
            // Retain the unqualified names used by local resource checks.
            crispaudio_native_helper_build::stage_helper(&sources.join(name), &output.join(name))
                .expect("Cannot stage native helper compatibility copy");
            crispaudio_native_helper_build::stage_helper(
                &sources.join(name),
                &output.join(format!("{name}-{target}")),
            )
            .expect("Cannot stage signed-bundle sidecar");
        }
    }
    tauri_build::build()
}
