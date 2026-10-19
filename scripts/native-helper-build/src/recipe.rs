use crate::cache::{self, hex, ARM, X86};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    env, fs,
    io::{self, Read},
    path::{Path, PathBuf},
    process::Command,
};

const SWIFT: &[&str] = &[
    "apple/MediaHelper.swift",
    "apple/Transitions.swift",
    "apple/Graphics.swift",
    "apple/Retime.swift",
    "apple/Plugins.swift",
];
const VST: &[&str] = &[
    "vst3/PluginHost.mm",
    "vst3/vendor/pluginterfaces/base/funknown.cpp",
    "vst3/vendor/pluginterfaces/base/coreiids.cpp",
    "vst3/vendor/pluginterfaces/base/ustring.cpp",
    "vst3/vendor/public.sdk/source/vst/vstinitiids.cpp",
    "vst3/vendor/public.sdk/source/common/memorystream.cpp",
    "vst3/vendor/public.sdk/source/common/commonstringconvert.cpp",
    "vst3/vendor/public.sdk/source/common/threadchecker_mac.mm",
    "vst3/vendor/public.sdk/source/vst/hosting/module.cpp",
    "vst3/vendor/public.sdk/source/vst/hosting/module_mac.mm",
    "vst3/vendor/public.sdk/source/vst/hosting/plugprovider.cpp",
    "vst3/vendor/public.sdk/source/vst/hosting/connectionproxy.cpp",
    "vst3/vendor/public.sdk/source/vst/hosting/hostclasses.cpp",
    "vst3/vendor/public.sdk/source/vst/hosting/pluginterfacesupport.cpp",
    "vst3/vendor/public.sdk/source/vst/hosting/parameterchanges.cpp",
    "vst3/vendor/public.sdk/source/vst/utility/stringconvert.cpp",
];
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn probe(program: &str, args: &[&str]) -> io::Result<String> {
    let output = Command::new(program).args(args).output()?;
    if !output.status.success() {
        return Err(invalid(&format!(
            "Toolchain probe failed: {program} {args:?}"
        )));
    }
    Ok(String::from_utf8(output.stdout)
        .map_err(|_| invalid("Non-UTF8 toolchain identity"))?
        .trim()
        .to_owned())
}
fn field(hash: &mut Sha256, bytes: &[u8]) {
    hash.update((bytes.len() as u64).to_le_bytes());
    hash.update(bytes);
}
// Hash contents, names and symlink destinations, including external link targets once.
// Canonical directories prevent cycles. No mtime/size shortcut can hide edited headers.
fn tree(hash: &mut Sha256, path: &Path, seen: &mut HashSet<PathBuf>) -> io::Result<()> {
    field(hash, path.as_os_str().as_encoded_bytes());
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() {
        field(hash, b"link");
        field(hash, fs::read_link(path)?.as_os_str().as_encoded_bytes());
        // SDKs contain optional dangling links. Their literal targets are still keyed.
        match fs::canonicalize(path) {
            Ok(target) => tree(hash, &target, seen)?,
            Err(e) if e.kind() == io::ErrorKind::NotFound => field(hash, b"dangling"),
            Err(e) => return Err(e),
        }
    } else if metadata.is_dir() {
        field(hash, b"directory");
        if !seen.insert(fs::canonicalize(path)?) {
            return Ok(());
        }
        let mut entries = fs::read_dir(path)?
            .map(|e| e.map(|e| e.path()))
            .collect::<io::Result<Vec<_>>>()?;
        entries.sort();
        for entry in entries {
            tree(hash, &entry, seen)?;
        }
    } else if metadata.is_file() {
        field(hash, b"file");
        if !seen.insert(fs::canonicalize(path)?) {
            return Ok(());
        }
        hash.update(metadata.len().to_le_bytes());
        let mut file = fs::File::open(path)?;
        let mut bytes = [0; 65536];
        loop {
            let count = file.read(&mut bytes)?;
            if count == 0 {
                break;
            }
            hash.update(&bytes[..count]);
        }
    } else {
        return Err(invalid("Unsupported file in native build inputs"));
    }
    Ok(())
}
struct Recipe {
    root: PathBuf,
    sdk: PathBuf,
    toolchain: PathBuf,
    swift: PathBuf,
    clang: PathBuf,
    target: String,
    architecture: &'static str,
    cpu: u32,
    identity: String,
}
impl Recipe {
    fn discover(root: &Path, target: &str) -> io::Result<Self> {
        let (architecture, cpu) = match target {
            "aarch64-apple-darwin" => ("arm64", ARM),
            "x86_64-apple-darwin" => ("x86_64", X86),
            _ => return Err(invalid("Unsupported native Mac helper target")),
        };
        let swift = PathBuf::from(probe(
            "/usr/bin/xcrun",
            &["--sdk", "macosx", "--find", "swiftc"],
        )?);
        let clang = PathBuf::from(probe(
            "/usr/bin/xcrun",
            &["--sdk", "macosx", "--find", "clang++"],
        )?);
        let toolchain = swift
            .parent()
            .and_then(Path::parent)
            .and_then(Path::parent)
            .ok_or_else(|| invalid("Invalid Swift toolchain path"))?
            .to_path_buf();
        if !clang.starts_with(&toolchain) {
            return Err(invalid(
                "Swift and C++ must use the same selected toolchain",
            ));
        }
        let sdk = PathBuf::from(probe(
            "/usr/bin/xcrun",
            &["--sdk", "macosx", "--show-sdk-path"],
        )?);
        let identity = format!(
            "{}\n{}\n{}",
            probe("/usr/bin/xcrun", &["--sdk", "macosx", "--show-sdk-version"])?,
            probe(
                "/usr/bin/xcrun",
                &["--sdk", "macosx", "--show-sdk-build-version"]
            )?,
            probe("/usr/bin/xcode-select", &["-p"])?
        );
        Ok(Self {
            root: fs::canonicalize(root)?,
            sdk,
            toolchain,
            swift,
            clang,
            target: target.into(),
            architecture,
            cpu,
            identity,
        })
    }
    fn key(&self) -> io::Result<String> {
        let mut hash = Sha256::new();
        for bytes in [
            include_bytes!("recipe.rs").as_slice(),
            include_bytes!("cache.rs").as_slice(),
            include_bytes!("../Cargo.toml").as_slice(),
            self.target.as_bytes(),
            self.identity.as_bytes(),
            self.swift.as_os_str().as_encoded_bytes(),
            self.clang.as_os_str().as_encoded_bytes(),
        ] {
            field(&mut hash, bytes);
        }
        let mut seen = HashSet::new();
        for path in [
            self.root.join("apple"),
            self.root.join("vst3"),
            self.sdk.clone(),
            self.toolchain.clone(),
        ] {
            tree(&mut hash, &path, &mut seen)?;
        }
        Ok(hex(&hash.finalize()))
    }
    fn command(&self, program: &Path, stage: &Path) -> io::Result<Command> {
        let home = stage.join("home");
        let temp = stage.join("tmp");
        fs::create_dir_all(&home)?;
        fs::create_dir_all(&temp)?;
        let mut command = Command::new(program);
        // Do not let user compiler configs, search paths or cache overrides change
        // a build whose key is otherwise identical. The selected tools/SDK are explicit.
        command
            .env_clear()
            .env(
                "PATH",
                format!(
                    "{}:/usr/bin:/bin:/usr/sbin:/sbin",
                    self.toolchain.join("usr/bin").display()
                ),
            )
            .env("HOME", &home)
            .env("TMPDIR", &temp)
            .env("LC_ALL", "C")
            .env("TZ", "UTC")
            .current_dir(&self.root);
        Ok(command)
    }
    fn compile(&self, stage: &Path) -> io::Result<()> {
        let triple = format!("{}-apple-macosx13.0", self.architecture);
        let mut swift = self.command(&self.swift, stage)?;
        swift
            .arg("-module-cache-path")
            .arg(stage.join("home/swift-modules"));
        swift
            .args([
                "-parse-as-library",
                "-swift-version",
                "5",
                "-O",
                "-target",
                &triple,
                "-sdk",
            ])
            .arg(&self.sdk)
            .args(SWIFT)
            .arg("-o")
            .arg(stage.join(cache::HELPERS[0]));
        if !swift.status()?.success() {
            return Err(invalid("Apple media helper compilation failed"));
        }
        let mut clang = self.command(&self.clang, stage)?;
        clang.arg(format!(
            "-fmodules-cache-path={}",
            stage.join("home/clang-modules").display()
        ));
        clang
            .args([
                "-std=c++17",
                "-O2",
                "-fobjc-arc",
                "-DRELEASE=1",
                "-target",
                &triple,
                "-isysroot",
            ])
            .arg(&self.sdk)
            .args(["-I", "vst3/vendor"])
            .args(VST)
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
            .arg(stage.join(cache::HELPERS[1]));
        if !clang.status()?.success() {
            return Err(invalid("VST3 helper compilation failed"));
        }
        // Temporary compiler module caches must not accumulate in the published entry.
        fs::remove_dir_all(stage.join("home"))?;
        fs::remove_dir_all(stage.join("tmp"))?;
        Ok(())
    }
}
fn target_root(out: &Path) -> io::Result<PathBuf> {
    // Cargo OUT_DIR: target[/triple]/profile/build/package-hash/out.
    let build = out
        .ancestors()
        .find(|p| p.file_name().is_some_and(|n| n == "build"))
        .ok_or_else(|| invalid("Cannot locate Cargo build directory"))?;
    let root = build
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| invalid("Cannot locate Cargo target directory"))?;
    Ok(root.to_path_buf())
}
/// Shared by embedded development helpers and signed Mac sidecars. One bounded,
/// verified generation lives under Cargo's existing target/profile parent.
pub fn build_helpers(root: &Path, out: &Path, target: &str) {
    build(root, out, target).unwrap_or_else(|error| panic!("Native helper build failed: {error}"));
}
fn build(root: &Path, out: &Path, target: &str) -> io::Result<()> {
    let recipe = Recipe::discover(root, target)?;
    for path in [
        recipe.root.join("apple"),
        recipe.root.join("vst3"),
        recipe.sdk.clone(),
        recipe.toolchain.clone(),
    ] {
        println!("cargo:rerun-if-changed={}", path.display());
    }
    for key in ["DEVELOPER_DIR", "TOOLCHAINS", "SDKROOT"] {
        println!("cargo:rerun-if-env-changed={key}");
    }
    println!("cargo:rerun-if-changed=/var/db/xcode_select_link");
    let cargo_out =
        PathBuf::from(env::var_os("OUT_DIR").ok_or_else(|| invalid("OUT_DIR is required"))?);
    let cache_root = target_root(&cargo_out)?.join("crispaudio-native-helpers-v1");
    let key = recipe.key()?;
    let hit = cache::materialize(&cache_root, &key, recipe.cpu, out, |stage| {
        recipe.compile(stage)?;
        if Recipe::discover(root, target)?.key()? != key {
            return Err(invalid(
                "Native helper inputs changed during compilation; retry with stable inputs",
            ));
        }
        Ok(())
    })?;
    println!(
        "cargo:warning=Native helpers: {} (verified content key)",
        if hit { "cache hit" } else { "built and cached" }
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cargo_target_layout() {
        assert_eq!(
            target_root(Path::new("/repo/target/debug/build/media-a/out")).unwrap(),
            Path::new("/repo/target")
        );
        assert_eq!(
            target_root(Path::new(
                "/repo/target/aarch64-apple-darwin/release/build/media-a/out"
            ))
            .unwrap(),
            Path::new("/repo/target/aarch64-apple-darwin")
        );
        assert!(target_root(Path::new("/unexpected/out")).is_err());
    }
    #[test]
    fn content_key_tracks_headers_compilers_links_and_flags() {
        let temp = crate::cache::Directory(env::temp_dir().join(cache::unique("crispaudio-key-")));
        fs::create_dir(&temp.0).unwrap();
        for name in ["source", "vendor", "sdk", "compiler"] {
            fs::write(temp.0.join(name), "same-size").unwrap();
        }
        fn key(root: &Path, flags: &str) -> String {
            let mut hash = Sha256::new();
            field(&mut hash, flags.as_bytes());
            tree(&mut hash, root, &mut HashSet::new()).unwrap();
            hex(&hash.finalize())
        }
        for name in ["source", "vendor", "sdk", "compiler"] {
            let before = key(&temp.0, "arm64 -O");
            fs::write(temp.0.join(name), "edit-size").unwrap();
            assert_ne!(before, key(&temp.0, "arm64 -O"));
        }
        assert_ne!(key(&temp.0, "arm64 -O"), key(&temp.0, "x86_64 -O"));
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("source", temp.0.join("link")).unwrap();
            let before = key(&temp.0, "");
            fs::remove_file(temp.0.join("link")).unwrap();
            std::os::unix::fs::symlink("vendor", temp.0.join("link")).unwrap();
            assert_ne!(before, key(&temp.0, ""));
        }
    }
}
