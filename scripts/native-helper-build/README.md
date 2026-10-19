# Native helper build cache

Build-only library shared by `media/build.rs` and `src-tauri/build.rs`. It compiles
Mac Swift media/AU and C++ VST3 helpers once and copies the same verified bytes to
Cargo's embedded-helper directory and the bundle's sidecar staging directory.
Other target operating systems skip native helper compilation.

The key hashes helper sources, vendored VST3 sources/headers, the selected macOS
SDK and complete selected toolchain contents, target architecture, SDK identity
and this crate's build recipe (including flags and compiler environment policy).
Symlinks contribute their target and resolved contents, with cycle detection.
Content changes invalidate reuse even when file sizes and timestamps are equal.
Compilers use explicit SDK/target arguments and a cleared environment, with private
temporary HOME/module caches. A post-build input check refuses publication if
inputs changed while compiling. Keep the source/toolchain stable during builds.

An OS file lock serializes processes through verification, build, publication and
staging. Entries require SHA-256 checksums, executable permissions and the requested
64-bit Mach-O architecture. Missing or damaged entries rebuild. Compilation failures
retain the previous generation and outputs. Cache publication uses an atomic rename
under the lock; interrupted stage/retired entries are cleaned on the next build.
An unrecognized cache directory is refused rather than emptied.

Only one current generation is retained under the existing Cargo target directory:
`target/crispaudio-native-helpers-v1` (under the target triple when cross-compiling).
Debug/release builds with identical native inputs share it. Switching architecture,
SDK or source versions replaces that generation. No SDK/toolchain copy is made.
Temporary compiler caches are removed before publication. Staging copies are
separate files, so signing them cannot alter the verified cache. Matching outputs
keep their inode/mtime; replacements are renamed individually. A successful build
verifies both helpers; the pair of output copies is not a filesystem transaction.
Architecture-specific staging sources keep suffixed bundle aliases separate during
cross-target builds. Killing a process during an output copy may leave an unpublished
`.helper-stage-*` directory there; remove these only when no build is running.

To reclaim this small, rebuildable cache, remove only `crispaudio-native-helpers-v1`
when no build is running. Leave live app bundles, Cargo dependencies and toolchains
alone. Full input hashing adds some warm-build I/O; it avoids trusting timestamps.

Run the hardware-free tests from the repository root using the existing target:

```sh
CARGO_TARGET_DIR="$PWD/src-tauri/target" cargo test \
  --manifest-path scripts/native-helper-build/Cargo.toml --locked
```

Cache/lock tests require Unix; content-key and target-layout tests are portable.
These tests never launch helpers, open audio devices or change app sessions.
