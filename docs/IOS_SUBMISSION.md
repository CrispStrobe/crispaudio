# CrispAudio — iOS App Store submission

CrispAudio-specific companion to the general playbook (`~/code/appstore.md`).
It records the concrete values, what's already automated in this repo, and the
steps that only a human (browser/Apple account) can do.

## Constants

| Field | Value |
|-------|-------|
| App name | CrispAudio |
| Bundle id | `com.crispstrobe.crispaudio` |
| Team id (`DEVELOPMENT_TEAM`) | `N9XSJ4M3GT` |
| ASC API key id | `9RMU3C7422` |
| ASC issuer id | `5f618ba3-98ef-42ad-835c-fbbef6c76cf5` |
| Xcode scheme | `crispaudio_iOS` |
| Provisioning profile (to create) | `CrispAudio AppStore CI` |

## Already done in this repo (automated / committed)

- iOS project scaffolded: `src-tauri/gen/apple/` (built & verified on the
  `ios-ci.yml` simulator workflow).
- App icon: 1024×1024 opaque source at `src-tauri/app-icon-1024.png`; iOS
  appiconset generated.
- `Info.plist` (via `project.yml`): `NSMicrophoneUsageDescription`,
  `ITSAppUsesNonExemptEncryption=false`, arm64, version synced.
- Privacy manifest: `PrivacyInfo.xcprivacy` (Required-Reason APIs), auto-wired
  to Resources.
- App Store export config: `src-tauri/ExportOptions-appstore.plist` (manual
  signing).
- Privacy policy page: `public/privacy.html` → served at
  `https://crispaudio-psi.vercel.app/privacy.html`.
- License is **MIT** — no App Store ToS conflict (unlike AGPL).

## Human-only steps (cannot be automated)

1. **Register the bundle id** (API-doable, see playbook Step 2), or via the
   Developer portal. Identifier `com.crispstrobe.crispaudio`, platform IOS.
2. **Create the app record** — App Store Connect → Apps → New App (playbook
   Step 3; `POST /v1/apps` is 403 for all API keys). Pick the bundle id above.
   Note the numeric app id it returns.
3. **Create the provisioning profile** `CrispAudio AppStore CI` for the bundle
   id, bound to the account's Distribution cert(s) (bind to BOTH `L9PHHNLY9Y`
   and `X48Y45DL9F` — see playbook; which one a `.p12` holds is ambiguous).
4. **App Privacy nutrition label** — App Store Connect → App Privacy → "Data
   Not Collected" (playbook Step 10; not API-doable).
5. **Set the repo secrets** (see below).
6. **Hit Submit** — the final review submission is a deliberate human decision.

## Repo secrets to set (canonical manual-signing set)

| Secret | Value |
|--------|-------|
| `ASC_API_KEY_P8_BASE64` | base64 of `AuthKey_9RMU3C7422.p8` |
| `ASC_KEY_ID` | `9RMU3C7422` |
| `ASC_ISSUER_ID` | `5f618ba3-98ef-42ad-835c-fbbef6c76cf5` |
| `ASC_APP_ID` | numeric app id from step 2 |
| `DIST_CERT_P12_BASE64` | the account's Distribution `.p12` |
| `DIST_CERT_PASSWORD` | its password |
| `ASC_PROFILE_BASE64` | base64 of `CrispAudio AppStore CI.mobileprovision` |

## App Store metadata (draft — ready to paste / API-set)

| Field | Value |
|-------|-------|
| Subtitle (≤30) | `SFX, Voice FX & Audio Editor` |
| Primary category | `MUSIC` |
| Secondary category | `UTILITIES` |
| Keywords | `audio,sound,synth,sfx,voice,effects,waveform,editor,wav,recorder,dsp,music` |
| Support URL | `https://github.com/CrispStrobe/crispaudio` |
| Marketing URL | `https://crispaudio-psi.vercel.app` |
| Privacy policy URL | `https://crispaudio-psi.vercel.app/privacy.html` |
| Copyright | `2024–2026 Christian Ströbele` |
| `usesIdfa` | `false` |
| `usesNonExemptEncryption` | `false` (set in Info.plist) |
| Age rating | all NONE / false → 4+ |
| Pricing | Free |
| `whatsNew` | omit on the first version (playbook gotcha) |

**Description (draft):**

> CrispAudio is a cross-platform audio workstation that brings sound-effect
> synthesis, voice processing, and a timeline waveform editor into one app.
> Design retro game SFX from 16 preset generators, shape ADSR envelopes and
> effects, record and transform your voice with 9 effect presets, and arrange
> everything on a multi-track timeline. Export to WAV. Everything runs on your
> device — no account, no cloud, no tracking.

**App Review notes (draft):**

> No account or login required. CrispAudio is fully offline; all audio
> processing runs on-device. To test the microphone/voice feature, open the
> Voice tab and tap Record. The text-to-speech feature is optional and inactive
> unless a speech-server URL is entered in Settings.

## Known Tauri-iOS signing gotchas (from the playbook)

- **NEVER** `-allowProvisioningUpdates` in CI — it can revoke the account's
  shared Distribution cert and break every other app. Manual signing only.
- **`tauri ios build --export-method` produces a DEVELOPMENT-signed IPA** (Tauri
  doesn't forward the API-key auth flags to its internal export). `ios-release.yml`
  therefore builds the `.xcarchive` only, then does a separate
  `xcodebuild -exportArchive` with `ExportOptions-appstore.plist`. Don't "simplify"
  it back.
- **Bind the profile to BOTH Distribution certs** (`L9PHHNLY9Y` and `X48Y45DL9F`)
  — which one this repo's `DIST_CERT_P12_BASE64` holds is ambiguous; a mismatch
  fails export with `profile doesn't include signing certificate`.
- **Install the profile in BOTH** `~/Library/MobileDevice/Provisioning Profiles/`
  and `~/Library/Developer/Xcode/UserData/Provisioning Profiles/` (Xcode 16+/26).
  Already done in the workflow.
- **base64 every secret** (`.p8`, `.p12`, profile) — raw multi-line PEM in a
  GitHub secret loses newlines and silently corrupts the key.
- **`altool` "accepted, no errors" ≠ a VALID build.** Watch ASC
  `processingState` until VALID — SDK-pulled purpose strings (e.g. a missing
  `NSPhotoLibraryUsageDescription`, ITMS-90683) surface only at processing. Add
  the string and bump the build number if that happens.
- **Verify success via the ASC API** (`GET /v1/builds?filter[app]=<id>`), **not**
  a green CI run — a dry run reports success while uploading nothing.
- Every embedded app-extension (none here) would need its own profile + a
  resolving `CFBundleVersion`.
- `usesNonExemptEncryption=false` is already in Info.plist; the API PATCH will
  409 (that's the desired state, no action needed).
