# Distribution and platform status — 2026-10-08

Pushing `main` runs CI/web deployment workflows and the unsigned iOS simulator
check. It does **not** automatically
submit an iOS or macOS build to Apple. No release tag or Apple upload was triggered
for the October interview features or touch workflow changes.

| Route | Trigger | Current evidence |
|---|---|---|
| Desktop GitHub bundles | `v*` tag or `release.yml` dispatch | macOS ARM, Windows, Linux jobs configured |
| iOS App Store Connect upload | `v*` tag or `ios-release.yml` dispatch with dry run off | Last run Aug 17 succeeded, including upload step; not independently checked against ASC processing/review status in this audit |
| macOS App Store upload | `mac-v*` tag or `macos-release.yml` dispatch | Last Sep 13 run failed: invalid provisioning profile signature |
| Local macOS testing | local Tauri build | Installed ad-hoc-signed `~/Applications/CrispAudio-local.app`; not an Apple-distributed release |

Evidence: [iOS workflow run](https://github.com/CrispStrobe/crispaudio/actions/runs/32039732193),
[macOS failed run](https://github.com/CrispStrobe/crispaudio/actions/runs/34760697731).
A successful upload step is not proof of Apple processing success, TestFlight
availability, review approval, or public release. Those states need an ASC check.
Note that a generic `v*` release tag also triggers the iOS upload workflow.

## Features by platform

| Capability | Local desktop | iOS/iPadOS | Browser |
|---|---|---|---|
| SFX, voice tools, audio timeline | Yes | Existing mobile implementation | Yes, subject to browser codecs |
| Touch clip actions, mixer, scrubber | Yes | Shared frontend; device validation pending | Yes |
| Automatic Canon/H6 synchronization | Installed FFmpeg/FFprobe required | No | No |
| Video preview + edited MP4 remux | Desktop only | No | No |
| Linked interview project paths | Local desktop | Mac paths inaccessible | No |
| Portable audio project | Yes | Embedded audio | Embedded audio |

## Remaining release gates

- Test the shared editor on actual iPhone and iPad: portrait/landscape, Files,
  export/share, VoiceOver, audio interruptions, foreground/background transitions,
  and memory use with the intended interview length.
- For a complete mobile interview product, implement in-process/native media
  extraction, correlation input, production resampling, video preview, and MP4
  composition/export. Do not expose desktop subprocess commands as working iOS
  features. Add security-scoped media persistence/relocation and a streaming cache.
- For macOS App Store, fix signing/profile validation and validate sandbox file
  access. The Homebrew FFmpeg dependency of the local app has not been established
  as a usable Mac App Store deployment strategy. Bundle/integrate an appropriate
  licensed media implementation before advertising that workflow in the store.
- Check current main CI before tagging. Verify Apple builds in ASC after upload.

See [the interview walkthrough](INTERVIEW_WALKTHROUGH.md) for the working desktop
workflow and the current iOS audio-only preparation/edit/remux workflow.

## Local verification of the October touch changes

Frontend lint/build and 1,147 tests pass. The macOS app was rebuilt and its local
ad-hoc signature verified. Browser workflow checks passed at 375×667, 390×844,
844×390, 1024×768, and 1440×1000, including microphone import/switching, common
splits, seeking, inspector dialogs, touch selection vs. deliberate arrangement,
and undo. The guided desktop setup used mocked native IPC with real excerpt WAV
decoding/video preview; this is not a native dialog/IPC end-to-end test.
No native screenshot capture was repeated after the WindowServer crash.
