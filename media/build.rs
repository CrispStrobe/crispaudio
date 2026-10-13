fn main() {
    println!("cargo:rerun-if-changed=apple/MediaHelper.swift");
    println!("cargo:rerun-if-changed=apple/Transitions.swift");
    println!("cargo:rerun-if-changed=apple/Graphics.swift");
    println!("cargo:rerun-if-changed=apple/Retime.swift");
    println!("cargo:rerun-if-changed=apple/Plugins.swift");
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
            "apple/Transitions.swift",
            "apple/Graphics.swift",
            "apple/Retime.swift",
            "apple/Plugins.swift",
            "-o",
        ])
        .arg(output)
        .status()
        .expect("Apple media backend needs Xcode command-line tools at build time");
    assert!(status.success(), "Apple media helper compilation failed");
    println!("cargo:rerun-if-changed=vst3");
    let sdk = "vst3/vendor";
    let sources = [
        "vst3/PluginHost.mm",
        "pluginterfaces/base/funknown.cpp",
        "pluginterfaces/base/coreiids.cpp",
        "pluginterfaces/base/ustring.cpp",
        "public.sdk/source/vst/vstinitiids.cpp",
        "public.sdk/source/common/memorystream.cpp",
        "public.sdk/source/common/commonstringconvert.cpp",
        "public.sdk/source/common/threadchecker_mac.mm",
        "public.sdk/source/vst/hosting/module.cpp",
        "public.sdk/source/vst/hosting/module_mac.mm",
        "public.sdk/source/vst/hosting/plugprovider.cpp",
        "public.sdk/source/vst/hosting/connectionproxy.cpp",
        "public.sdk/source/vst/hosting/hostclasses.cpp",
        "public.sdk/source/vst/hosting/pluginterfacesupport.cpp",
        "public.sdk/source/vst/hosting/parameterchanges.cpp",
        "public.sdk/source/vst/utility/stringconvert.cpp",
    ];
    let mut command = std::process::Command::new("xcrun");
    command.args([
        "clang++",
        "-std=c++17",
        "-O2",
        "-fobjc-arc",
        "-DRELEASE=1",
        "-target",
        &format!("{arch}-apple-macosx13.0"),
        "-I",
        sdk,
    ]);
    for source in sources {
        command.arg(if source.starts_with("vst3/") {
            source.to_string()
        } else {
            format!("{sdk}/{source}")
        });
    }
    let output =
        std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("crispaudio-vst3-host");
    command
        .args([
            "-framework",
            "Foundation",
            "-framework",
            "Cocoa",
            "-framework",
            "AVFoundation",
            "-framework",
            "AudioToolbox",
            "-o",
        ])
        .arg(output);
    assert!(
        command
            .status()
            .expect("VST3 host needs Xcode at build time")
            .success(),
        "VST3 host compilation failed"
    );
}
