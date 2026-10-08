fn main() {
    println!("cargo:rerun-if-changed=apple/MediaHelper.swift");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let target = std::env::var("TARGET").unwrap();
    let arch = if target.starts_with("aarch64") {
        "arm64"
    } else {
        "x86_64"
    };
    let output = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap())
        .join("crispaudio-apple-media");
    let status = std::process::Command::new("xcrun")
        .args([
            "swiftc",
            "-parse-as-library",
            "-swift-version",
            "5",
            "-O",
            "-target",
            &format!("{arch}-apple-macosx13.0"),
            "apple/MediaHelper.swift",
            "-o",
        ])
        .arg(output)
        .status()
        .expect("Apple media backend needs Xcode command-line tools at build time");
    assert!(status.success(), "Apple media helper compilation failed");
}
