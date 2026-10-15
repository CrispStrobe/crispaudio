# Native Mac distribution preparation

CrispAudio **0.3.0 is already released for iPhone/iPad**. Its public listing also
allows the iOS app on compatible Apple Silicon Macs. This document concerns the
separate native desktop build. As checked through the VPS on 2026-10-15, that
Mac App Store version is a draft with no build, and the bundle ID has an active
iOS profile but no Mac App Store profile. The existing API credentials are usable;
creating a Mac profile does not require a new account or replacing the shared
certificate. See [verified distribution status](RELEASE_STATUS.md).

The Mac bundle contains `crispaudio-apple-media` and `crispaudio-vst3-host` beside
the main executable. Both helpers use the same compiler recipe as the development
and CLI helpers. A Store bundle missing a helper fails instead of extracting an
unsigned replacement. Development/CLI execution retains the embedded fallback.

The Store workflow makes the staged bundle readable/searchable by regular users,
then signs helpers first and the main app last. Helpers inherit the
parent sandbox and carry the public library-validation exception for independently
signed plugins. The main app retains its microphone and user-selected-file rights.
See Apple's [sandbox inheritance rules](https://developer.apple.com/library/archive/documentation/Miscellaneous/Reference/EntitlementKeyReference/Chapters/EnablingAppSandbox.html)
and [library-validation entitlement](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.disable-library-validation).

Before packaging, `scripts/release/check-macos-app.py APP --team TEAM_ID` checks
deep signatures, matching helper teams/architectures, sandbox entitlements, a
privacy manifest in `Contents/Resources`, regular-user file permissions, and an
embedded profile. It also requires hardened runtime, rejects debugging rights,
and compares the final app identifier, team entitlements and actual leaf signing
certificate against the embedded profile. The workflow separately validates
the profile's integrity,
expiry, platform, app identifier and certificate. An Apple-issued Mac App Store profile is needed for that native desktop route; local ad-hoc signing does not replace it. The Store
workflow derives the app/team identity entitlements from that validated profile;
local builds retain their independent signing setup. See Apple's
[provisioning profile reference](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles).

For a local muted sandbox check after building the native-validation executable:

```sh
python3 scripts/test-macos-sandbox.py --vst3-fixture /path/to/ADelay.vst3
```

This makes an isolated hardened, ad-hoc signed sandbox app and verifies actual
bundled helper processes, AU/VST3 wet backing, generated recording, cancellation
and cleanup. It does not access the physical microphone or establish Store review
acceptance. The test plugin is copied inside the app's bundle.

Add `--plugin-location downloads` to exercise a generated external VST3 fixture
in Downloads using the app's existing static folder entitlement. Successful runs
remove that fixture. Both bundled and Downloads runs pass wet accompaniment,
generated recording, stalled-UI loops, cancellation and helper cleanup. Downloads
access does not establish access to folders selected through PowerBox.

Release gate regression tests:

```sh
python3 tests/release/test_macos_signing.py
python3 tests/release/test_macos_signing_actual.py # macOS, real disposable signatures
```

The first suite runs in frontend CI; the real-signature suite runs in Mac CI.

Remaining acceptance needs a Store-signed build, selected external media and
plugins, commercial plugin installations and external audio interfaces. Child
processes do not automatically inherit dynamic PowerBox access; external resource
access must be checked through the actual file-selection workflow. See Apple's
[file access guidance](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox).
No Apple upload, release tag or release-workflow dispatch accompanies this local
checkpoint.
