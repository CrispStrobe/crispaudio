# CrispASR audio tools

CrispAudio uses [CrispASR](https://github.com/CrispStrobe/CrispASR) as an
in-process audio engine for four tasks that fit its recording, editing and
restoration scope:

| Task | Typical model | Model licence | Where |
|---|---|---|---|
| Stem separation (dialogue/music, 4 stems) | `mel-band-roformer-vocals`, `htdemucs` | MIT | Source editor → CrispASR audio tools |
| Speech regeneration (generative restoration) | `sidon-v0.1`, `voxcpm2-vae` | MIT / Apache-2.0 | Source editor → CrispASR audio tools |
| Voice activity → pause tightening | `ggml-silero-v6.2.0.bin` (Silero) | MIT | Workspace → Text → Tighten pauses |
| Beat/downbeat tracking | `beat-this` (Beat This!) | MIT | Musical grid dialog → Detect beats |

Speech recognition, TTS and translation stay in **CrisperWeaver**; nothing here
creates transcripts or voices from text. Chord recognition (BTC, CC-BY-NC-SA) is
deliberately not exposed.

## How it is connected

`media/src/crispasr.rs` loads `libcrispasr` at runtime through its C ABI
(`dlopen`/`LoadLibraryW`), the same way the Dart/Flutter wrapper does. There is
no subprocess, no Cargo dependency on CrispASR and no build-time CMake/ggml step,
so CI and ordinary builds are unchanged. The library is found from, in order: the
path chosen in the tool, `CRISPASR_LIB`, or a copy beside the executable
(`../Frameworks` in a Mac bundle); debug builds also try the checkout's
`src-tauri/generated/crispasr`. Model files are always chosen explicitly;
CrispAudio never downloads or bundles models. A loaded library is never unloaded:
choosing a different library requires a restart. One CrispASR task runs at a time.

Long audio is processed in overlapping chunks (separation 30 s/2 s overlap,
speech 20 s/1 s) with linear crossfades, and cooperative cancellation is checked
between chunks; a single native call cannot be interrupted. All conversion uses a
Kaiser-windowed sinc resampler to the model rate and back. Results must match
the input length within one rounding frame (speech models: 50 ms of codec
padding per chunk); larger differences are errors, never silent stretching.
Per-run limits: 20 minutes for separation/speech, 4 hours for VAD, 1 hour for beats.

Voice activity uses the raw Silero segment entry point (`crispasr_vad_segments`).
CrispASR's ASR slice dispatcher is intentionally not used: it merges close
segments for transcription chunking and can fail over to fixed chunks, which
would hide real pauses.

## Bundled macOS library

`scripts/build-crispasr.sh` builds the revision pinned in
`scripts/crispasr-revision.txt` (v0.8.49) from a clean shallow clone into
`~/.cache/crispaudio-crispasr`, then stages `src-tauri/generated/crispasr/`
(gitignored): `libcrispasr.dylib` plus the five ggml dylibs (~23 MB, arm64 or
`ARCH=x86_64`, macOS 13). Options: Release, Metal with the shader library
embedded, portable CPU code, and **opus/ogg, FFmpeg, curl and CoreML off**.
CrispAudio only hands PCM to CrispASR and decodes files with its own stack
(Glint/Apple), so no codec or download code ships in the library. Every install
name is `@rpath/…` with `@loader_path` as the only rpath; the script refuses
non-system absolute dependencies, codec/network libraries or missing symbols,
and writes `manifest.json` (revision, options, SHA-256) and a `tauri.conf.json`
overlay listing the frameworks.

Release workflows (`release.yml` macOS jobs, `macos-release.yml`) cache and run
the script, then build with `--config src-tauri/generated/crispasr/tauri.conf.json`
so Tauri copies the dylibs into `Contents/Frameworks`. The App Store job signs
them with the other dylibs; `check-macos-app.py` verifies team, hardened
runtime, architecture and relocatable dependencies of every bundled library.
Ordinary builds without the overlay are unchanged and simply report the library
as unavailable. Windows/Linux/iOS bundles do not include CrispASR yet; on
desktop the library can still be selected manually. CrispASR's MIT licence and
third-party notices are shown in About.

## GUI behaviour

- **Separate / Regenerate speech** produce an ordinary source-editor draft for
  the selection (processed with 2 s of surrounding context, 5 ms ramps inside each
  selected range, unselected samples and channels bit-identical). A/B audition,
  owned Apply publication, retained originals and Undo are the existing source
  editor paths. The journal records `separate`/`speech` operations; saved-effect
  replay does not admit them.
- **Separate whole clip into stem tracks** writes every stem through one owned
  conversion transaction (≤ 8 files / 256 MiB), then adds one track per stem
  below the clip's track in a single Undo step. Stem clips copy the clip's
  timing, gain, fades and effects and join its named edit group (created if
  needed). The original clip is kept; its track is muted only when that clip is
  its only content.
- **Regenerated speech** is labelled generative: the voice is resynthesised (mono),
  not repaired.
- **Tighten pauses** renders the mix (or only the edit range), finds interior
  silences of at least the minimum length and removes their centres so each
  keeps the chosen length. Cuts apply to every audio track and the picture lane,
  are rounded inward to whole frames for picture projects, retime markers,
  automation and transcript timing, and commit once. Locks, link/group scope and
  picture blends follow the existing range-edit rules. The review goes stale if
  the project changes.
- **Detect beats** sets tempo and, when the model's downbeats are consistent
  (spacing ≥ 2 beats agreeing in ≥ 60 % of bars), beats-per-bar and bar origin,
  and offers one marker per bar. With unclear downbeats it applies tempo only
  (bar 1 at the first beat, meter unchanged) and offers no bar markers. A single
  tempo cannot represent tempo changes inside a recording.
- Sections load the library only when expanded. Browser/iOS builds show a
  desktop-only notice.

## CLI

```sh
export CRISPASR_LIB=/path/to/libcrispasr.dylib   # or pass --crispasr-lib

crispaudio separate-audio --input mix.wav --model mel-band-roformer-vocals-f16.gguf \
  --output-dir stems/          # stems/mix_vocals.wav, stems/mix_other.wav
crispaudio regenerate-speech --input noisy.wav --model sidon-v0.1-q8_0.gguf \
  --output restored.wav        # generative, mono
crispaudio speech-regions --input interview.crispaudio \
  --model ggml-silero-v6.2.0.bin --min-pause 0.7 --output speech.json
crispaudio detect-beats --input song.wav --model beat-this-f16.gguf --output beats.json
```

Audio inputs are WAV (any rate, mono/stereo) or other formats through the explicit
Apple decoder. A `.crispaudio` input is analysed through its native mix. Outputs
are float WAV/JSON, published without overwriting. `edit-project` recipes apply
the results with the same semantics as the GUI:

```json
[{"op":"tighten-pauses","pauses":[[2.3,3.24],[4.44,5.35]],"keep":0.3},
 {"op":"beat-markers","beats":[{"time":0.5,"downbeat":true}],"downbeatsOnly":true}]
```

## Validation

- `cargo test --lib crispasr` covers the resampler, chunk assembly, region/pause
  planning and loader errors; `project_edit` tests cover both recipes. With
  `CRISPASR_TEST_MODELS` set (and `CRISPASR_LIB`, or the staged debug fallback),
  the ignored `real_models` test runs separation, Silero VAD, Beat This! and Sidon
  in-process; it passes against both a developer build and the staged bundle.
- Vitest covers the IPC codec, cancellation, selection blending, pause/beat
  planning, downbeat reliability and stem-track publication.
- `scripts/test-crispasr-ui.mjs` drives the actual UI in headless Chrome: a fixture
  Tauri bridge runs the real `crispaudio` CLI with the staged library and real
  models. It checks separation (outside the selection bit-identical, inside equal
  to the chosen stem), stem tracks (owned files, edit group, muted original, one
  Undo), regenerated speech, pause tightening (same 1.67 s removal as the CLI on
  the JFK sample), tempo-only beat handling and German phone-width layout. It does
  not exercise Tauri's IPC transport or the installed app.
- Objective quality on the JFK sample (2026-11-03, not a listening test):
  mel-band-roformer on speech + synthetic music raised speech SDR from 8.3 to
  22.6 dB and music SDR from −8.3 to 12.4 dB. Sidon on speech + white noise
  reduced the log-spectral distance to the clean speech in speech frames from
  65.5 to 35.8 dB and returned pauses to −62.5 dB (clean −63.9 dB), with a 3 ms
  envelope offset. Physical listening and varied real recordings remain open.
- `scripts/benchmark-separation.py` measures separation against known ground
  truth: TTS speech (exact text) mixed with generated music (exact notes) and an
  optional real track at several speech-to-music ratios, scored by SI-SDR,
  leakage, ASR word error rate (several ASR models) and note-transcription F1
  (several transcribers) before and after separation. Its first full run was
  interrupted (see the handoff, lane C1); results are not published yet.
- The pinned v0.8.49 library cannot open mini-bs-roformer models; use
  mel-band-roformer or htdemucs until the pin is bumped (handoff lane C2).

Evidence: [evidence/crispasr-audio.json](evidence/crispasr-audio.json). Pending
work with exact steps: [WORK_HANDOFF.md](WORK_HANDOFF.md#crispasr-audio-tools--checkpoint-after-01368).
