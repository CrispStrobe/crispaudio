# Native recording qualification

The native path is opt-in and still needs physical acceptance. Existing Compatible
recording acceptance does not qualify the new hardware queues, timing or recovery.
Use this protocol after reading [WORK_HANDOFF.md](WORK_HANDOFF.md).

## Keep working sessions separate

On macOS 14 or newer:

```sh
npm run native:preview -- --launch
```

This builds a sandboxed **CrispAudio Native Preview** with a separate bundle/app-data
identity and WebKit store, without project-file associations. The installed app is
not overwritten, quit or imported into the preview. Its in-memory session stays in
that process. Do not launch another production-identity candidate against a working
autosave store. Preview projects, recordings and permission grants stay separate.

The preparer checks the built plist, helper/sandbox signatures and the actual
embedded runtime identity/store before opening a window. This is a local ad-hoc
preview, not a Store-signed build or an Apple submission. It does not start audio
or request microphone permission. Recording and playback require user actions.

`--check` validates the profile without a build. `--verify-only` verifies/signs an
existing matching preview without rebuilding; it does not establish source
freshness. Rebuild/sign refuses a running preview; save and close that test session
first. `--target-dir` selects an explicit build directory. An unrelated global
`CARGO_TARGET_DIR` is ignored, and no second toolchain is installed.

The current SDK cannot generate its WebKit store array from JSON correctly. The
Mac debug preview sets the fixed 16-byte store in `app_context` before any window
opens. Production/release contexts keep their usual identity/store. The read-only
debug flag `--print-native-preview-identity` reports selected embedded config fields
and exits before constructing app/window/audio owners; the preparer verifies it.

## First built-in microphone check

1. Use the **CrispAudio Native Preview** window. Open the arrow beside Record,
   expand Input and choose **Mode → Native · Preview**
   (**Modus → Nativ · Vorschau** in German).
2. Select the built-in microphone and speakers/headphones. Keep input monitoring
   off. Record can create and arm an audio track in an empty project.
3. Press Record and allow microphone access if prompted. First use briefly obtains
   the WebKit permission stream, closes every track, then rechecks native access
   before opening the selected CoreAudio input. No permission-stream samples or
   browser timestamps enter the take. Device inventory itself never prompts.
4. Speak for five seconds. Check that the main input meter moves outside settings.
   Stop, then Play. Confirm that speech is audible and the clip is not truncated.
5. Save/reopen in the preview. Undo/Redo the group and verify all takes remain
   playable. Preserve the original files and report an error rather than salvaging
   an incomplete take as a completed recording.

If access was denied or restricted, enable this preview in macOS Privacy & Security
→ Microphone, then retry. Stop/project change while permission is pending must
release any stream returned later and must not start native capture.

Record the actual result for meter, speech/playback, frame count, underruns/faults
and save/reopen. Never infer a listening result from generated tests or file peaks.
Keep personal paths, device UIDs and recordings in ignored local evidence; publish
only appropriate aggregate measurements and acceptance scope.

## Remaining physical matrix

| Check | Procedure and acceptance |
|---|---|
| Placement/round trip | Use an explicit known physical return/reference; quantify offset and stability across repeated starts. Speaker/microphone acoustic delay is part of that path. Do not infer it from browser time or plug-in delay. |
| Lead-in and loop/punch | Confirm monitor-only count-in, backing continuity, pass boundaries and aligned dry takes; keep original samples on every failure. |
| Converted recovery | Include a non-48 kHz project, explicit Recovery Import, linked/portable reopen, audible native playback and Undo/Redo file retention. |
| Sustained/load/background | Measure memory, callbacks and underruns for a stated duration/load; test background/minimized operation and avoid calling a short capture a long-session result. |
| Lifecycle | Test stop/cancel in preparation/recording, repeated starts, output switching, sleep/wake, app exit and relaunch. Check workers/device queues close and unfinished groups remain honestly incomplete. |
| External input/output | Run channel-map, hot-plug and independent clock checks once interfaces/webcams/headphones are available. Generated callback tests do not substitute for devices. |
| Signed platforms | Repeat relevant checks in the actual sandboxed distribution build and on physical iOS; simulator/local ad-hoc success does not establish those results. |

Builtin-only availability limits the physical matrix. Continue independent source
FX/restoration work while unavailable hardware checks stay explicitly open. Native
recording remains opt-in until the required acceptance boundaries are met.
