// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "tauri-plugin-crispaudio-native",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "tauri-plugin-crispaudio-native", type: .static,
                 targets: ["tauri-plugin-crispaudio-native"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
    ],
    targets: [
        .target(name: "tauri-plugin-crispaudio-native",
                dependencies: [.byName(name: "Tauri")],
                path: "Sources/CrispAudioNative"),
    ]
)
