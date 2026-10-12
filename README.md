# CrispAudio

CrispAudio combines a multitrack audio and video timeline, voice processing and
sound-effect synthesis. It supports arranging recordings, synchronizing camera
and microphone sources, mixing sound and editing footage through its transcript.
The desktop app uses Tauri, React and TypeScript; the audio tools also run in a
browser.

[![CI](https://github.com/CrispStrobe/crispaudio/actions/workflows/ci.yml/badge.svg)](https://github.com/CrispStrobe/crispaudio/actions/workflows/ci.yml)
[![Release](https://github.com/CrispStrobe/crispaudio/actions/workflows/release.yml/badge.svg)](https://github.com/CrispStrobe/crispaudio/actions/workflows/release.yml)

[Web demo](https://crispaudio-psi.vercel.app) ·
[Releases](https://github.com/CrispStrobe/crispaudio/releases) ·
[Roadmap](PLAN.md)

Delivery adds per-export presets, range/clip/stem jobs, a cancellable queue,
caption sidecars, portable media collection and reviewed cut-only OTIO export.
See [Delivery workflows and limits](docs/DELIVERY.md).

Musical time adds a saved tempo/signature overlay, bars/beats ruler, musical
snapping and a monitor metronome. [Musical timeline workflow](docs/MUSICAL_TIME.md)
describes the first M10 increment and its limits.

The MIDI piano roll adds editable notes, quantisation, controller input, sine/bell
instruments, pattern MIDI export and a reviewed capture pass alongside timeline
playback. [MIDI workflow and limits](docs/MIDI.md) describes rendered audio clips,
input support and capture placement.

## Timeline and media editing

- Multitrack audio waveforms and ordered picture layers share the timeline
  ruler, playhead, zoom and scrolling. Video preview can open in a fullscreen viewer.
- Move, split, trim, slip, copy/cut/paste and reorder clips; use magnetic/grid
  snapping, frame/sample nudges and editable timecodes.
- Link sound and picture, create named edit groups, lock lanes and choose which
  lanes participate in ripple edits.
- Select and play/loop/export time ranges; lift, extract or insert gaps. Rolling
  trims, ripple trims, trim-to-playhead and slide edits have reviewed source limits.
- Apply clip/track fades, audio crossfades, picture transitions, colour correction
  and orientation changes.
- Mix with gain, pan, mute/solo, gain/pan, delay mix/feedback/time and ring-modulator/bit-crusher/distortion/chorus/reverb mix automation, plus chorus depth and rate automation,
  with clip/track/master effect racks.
  Current timeline effects include filters, bit crushing, ring modulation, delay,
  chorus, reverb, distortion and compression.
- Route tracks through buses and pre/post sends; duck one track from another.
  Measure master loudness/true peak and review a target gain before applying it.
- Composite picture layers with position/scale/rotation/crop/opacity and keyframes.
  Add titles, stills, saved title presets and separately editable captions with
  SRT/VTT sidecars or burn-in. Place source picture using In/Out selections.
- Record into an armed track with explicit input/channel/monitoring, count-in,
  punch or loop takes. Choose comp regions, adjust crossfades and retain originals.
- Review clip speed/reverse, pitch-preserving stretch or pitch transposition;
  linked sound/picture retain their original sources and editable settings.
- Build multicam scenes from reviewed aligned camera layers. Switch shots at the
  playhead while the microphone mix continues independently.
- Import camera and microphone recordings, review offset/drift synchronization,
  switch microphones and manage sources in the optional media workspace.
- Save/load projects with embedded or linked audio, recover autosaves and relink
  missing files. SFX and processed voice audio can be sent into the timeline.

See [Timeline workflow](docs/TIMELINE_WORKFLOW.md),
[Media workspace](docs/MEDIA_WORKSPACE.md) and the
[Canon/H6 interview walkthrough](docs/INTERVIEW_WALKTHROUGH.md) and
[Mixing, picture, recording and interview tools](docs/EDITOR_CHECKPOINT.md).

## Transcription and spoken-text editing

Desktop transcription uses an external local **CrispASR** executable and model.
Select the timeline mix or a microphone, transcribe and obtain genuine word
timestamps through forced alignment. Deleting a timed word removes its matching
interval across audio and video. Alternatively, paste a shortened transcript,
review its matching words and retain only those passages, with one-step undo.
Repeated phrases require explicit occurrence review; rewritten/reordered wording
is rejected. Mix-based transcript alignment is guarded against unrelated arrangement changes.
Source transcripts keep their original timestamps: timeline words map through
trims, repeated clips, speed and reverse. Search/select words, review lift/extract
ranges, correct source words/speaker labels and organise named sections.

See [Speech editing](docs/SPEECH_EDITING.md) and
[Keep text editing](docs/KEEP_TEXT_EDITING.md) for setup and limitations.

## SFX and voice

**SFX:** square/sawtooth/sine/noise synthesis, preset generators, ADSR, FM,
vibrato, arpeggiation, effects, parameter locking and mutation. Compare A/B slots
with morphing, parallel waveforms, spectrum/spectrogram and level displays.
Export audio or JSON presets, share preset links and send sounds to the timeline.

**Voice:** load or record audio, apply voice presets, pitch/time/formant processing
and an effects chain. Compare source/processed sound and A/B slots, inspect audio
visualizations, export or return processed sound to a timeline clip.

Both views provide undo/redo, numeric controls and contextual parameter help.
The interface supports English and German, keyboard commands and touch controls.
macOS menus expose file, edit, playback and view actions.

## Formats and platform limits

| Area | Current support |
|---|---|
| GUI audio import | WAV, MP3, M4A/AAC, FLAC, Ogg/Opus, AIFF/AIF and CAF; decoding depends on codec/profile and platform |
| GUI audio export | WAV, FLAC, MP3, AAC and Ogg Opus; eligible macOS timeline exports also offer M4A |
| Desktop video import | MP4, MOV, MKV, M4V, WebM, AVI, OGV and MPEG/MPG, subject to backend codec support |
| Desktop video export | MP4/MOV H.264 + AAC through Apple frameworks or optional FFmpeg; VP9/AV1 WebM through optional FFmpeg |
| Native CLI audio export | Linked projects to WAV; macOS also supports FLAC and AAC/M4A |

On desktop, drag an MP4 or other supported video from Finder onto any part of the
app window to create linked picture and camera-audio clips. Imported camera audio
starts unmuted. Settings → Playback device lists Mac outputs (selection changes
macOS output for all apps) and offers a short output test. Browser device selection
is available where supported; other browsers follow the system output. If the
installed app becomes silent while the system can play audio, quit and reopen it
to reset its WebKit audio process.

macOS 13+ provides the native media backend. Whip, glitch and page-peel transitions
require compatible Metal hardware. Automatic synchronization, denoising/loudness
preparation and some format paths require separately installed FFmpeg/FFprobe.

Video composition and local CrispASR integration are desktop features. The browser
and mobile app provide audio tools; mobile ASR/video composition and iOS device
validation for newer timeline controls remain incomplete. The timeline currently
has **one picture composition lane**. GUI audio import/playback uses decoded
in-memory buffers; eligible macOS linked-project exports use native disk streaming.
Rolling, slide and linked ripple trims preserve existing picture transitions.
Range edits can explicitly replace crossed picture blends with reviewed hard cuts;
other transitions stay intact. Transcript cue boundaries still require adjustment.
Dragging audio/video clip edges shows source spans and the available material on
both sides, including linked partners. Trims stop at source/timeline limits;
linked picture trims use project frames. Escape cancels the drag and retains redo.

The Timeline mixer opens as a bottom dock with horizontally scrollable track
and master strips. Adjust dB level, pan, mute/solo and existing effects; fader and
audition changes keep playback running. Meters show stereo peak/RMS with held
peak and clipping indicators; click a meter to reset. The project master level
is saved and applies to both GUI and native CLI exports, independently of monitor
volume. New projects and older files default to unity output gain.
EQ racks include high/low-pass, bell and shelving bands, with a collapsible
frequency-response graph. Drag band points or use keyboard/numeric controls;
EQ parameter changes update playback smoothly. The curve combines enabled EQ
bands only. Bell/shelf DSP also works in the native linked-project mixer.
The master strip offers an optional stereo-linked sample-peak limiter after the
master fader, with ceiling and release controls. It adds no delay. Compressor
inserts and mixer strips show gain reduction; the limiter shows its own reduction.
These are sample-peak controls; true-peak and LUFS tools remain future work.

The automation button opens a focused track lane beneath the timeline.
Choose a track and gain, panorama, a delay insert’s mix, feedback or time, chorus depth, or ring modulation/bit-crusher/distortion/chorus/reverb mix, click/tap to add points, drag to move, or use numeric time/dB/pan
fields and keyboard arrows. Point edits commit on release; Escape cancels without
losing redo. Track locks protect envelopes. Select a point to choose its outgoing Linear or
Step curve. Linear ramps to the next point; Step holds the value and jumps at the
next point's clock. Missing curve metadata keeps the existing Linear behavior.
The shape tool previews Ease-in, Ease-out and S-curve transitions between the
selected point and its next neighbour. Custom Bézier offers two draggable handles
with keyboard and numeric time/value controls. Time handles cannot cross; values
stay between the endpoints. Apply creates up to 15 editable linear
points in one undo step, keeping endpoints and outside automation fixed. Gain
shapes interpolate amplitude. Copy/retime, recording guards and exports retain
the generated points. Newly applied shapes save their review handles. Select the
start or any interior shaped point to reopen and revise the original whole span,
or choose Linear to flatten it. Two purple timeline handles appear for intact
saved preset/custom spans and ordinary Linear segments. Drag or use arrows to
reshape the span; release commits one undo step, Escape cancels. Shared endpoints
select the outgoing span; individual point edits still affect the selected point.
Preset handles start at equivalent Bézier controls;
changing a handle converts the whole span to custom points. Selecting or returning
to the original curve preserves history. Gain follows the lane’s dB scale.
Reapplying the same shape keeps history unchanged. Interior point edits or partial
cuts invalidate whole-span review; ordinary point editing remains available. Endpoints hold; an empty gain envelope is unity. Edits update running playback,
save/open and GUI/native exports. Copy the selected time range (or whole envelope) and paste it onto another track
or time with a reviewed destination length. Time stretching changes point clocks
while retaining parameter values; outside automation is preserved with one-sample boundary
guards. Copy does not change the project, and paste is one undo step. Pan uses absolute −1 (left) to +1 (right), with the selected curves and held endpoints.
An empty pan lane uses the static track pan; an active lane marks the mixer pan
as Auto. Gain and pan have separate session clipboards. Copying an empty pan lane captures
its static pan value. Delay mix uses 0–100% values with the same curve choices and held endpoints; an empty lane
uses the insert’s static mix. The envelope follows its insert when the rack is reordered.
Delay feedback automation uses 0–95% values with the same curve choices and held endpoints; an empty
lane uses static feedback. Editing either parameter preserves the other envelope.
Delay time uses 0–2000 ms controls (stored in seconds), with Linear/Step curves,
held endpoints and the static insert time when empty. Live edits retain the echo
history. Linear time changes can shift pitch; Step changes can jump the read head.
Mix, feedback and time have separate session clipboards: copy a selected range or
whole canvas, including the static value of an empty lane, and review a stretched
paste into the same parameter of another delay insert. The other envelopes and
insert settings stay fixed. Clipboards survive project loads within the session;
copy is not undoable or saved. Locks and an open recording pass protect paste.
Delay keeps its history during live mix/feedback/time edits; GUI/native range exports
process the preceding audio before cropping. Range insert/extract retimes FX envelopes
with the selected scope; lift retains their clocks. The direct lane edits track inserts. Ring modulation mix uses 0–100% (dry to
modulated), held endpoints and static mix when empty (default 50%). Its separate
clipboard supports reviewed copy/stretch paste, and curves/recording use the same
protections. Live mix edits keep the carrier phase running; frequency changes
still rebuild the graph. Clip/master ring, bit-crusher, distortion, chorus and reverb mix metadata also renders in GUI/native
exports. Delay, ring, bit-crusher, distortion, chorus and reverb envelopes stay with their effect type.
Bit-crusher mix also supports the same reviewed editing, recording and copy/retime
workflow. It has its own clipboard; an empty envelope uses the static mix (default
50%). Live mix changes retain the waveshaper graph; bit-depth changes rebuild it.
Bit-depth automation is not implemented. Distortion mix uses the same 0–100%
workflow and its own clipboard, with static mix (default 50%) when empty. Live
mix edits retain the oversampling filters; drive remains a static insert setting.
Chorus mix adds the same workflow and a separate clipboard, with 30% default when
empty. Live edits retain the delayed voices and modulation phase. Chorus depth
also supports 0–100% automation (up to ±10 ms), protected recording, saved curve
handles and a separate clipboard. Empty depth envelopes use insert depth, default
50%. Depth edits update both LFO amplitudes while retaining phase and delayed
audio; rate remains static.
Reverb mix also has its own clipboard and retains convolution history during live
edits. Its existing blend keeps 30% dry at maximum mix; empty envelopes use the
insert value, default 30%. Size and decay remain static.

Automation modes are available on these lanes. Read follows the existing envelope.
Choose Touch (write while holding), Latch (hold the last touched value until Stop),
or Write (write continuously), then explicitly arm while stopped and press Play.
The recording control auditions a local draft; Stop opens a review. Apply changes
only the recorded intervals in one undo step; Cancel keeps the original and redo.
Seeks, loops, Escape, interruptions and project changes discard the draft. Modes
and arming are session-only and reset to Read; saved points work in GUI/native exports.
Capture is driven by the audio clock and animation frames, not hardware automation
recording. Further selected FX parameters and broader curve editing remain planned.

See [Formats, backends and licensing](docs/MEDIA_FORMATS_AND_LICENSES.md) for the
exact support matrix and [Platform/distribution status](docs/RELEASE_STATUS.md)
for release availability. The web demo and published releases can differ from
this source tree.

## Build and run

Use Node.js 22.12+ (or a newer supported LTS), npm and a current stable Rust
toolchain. Desktop builds also require:

- **macOS:** Xcode Command Line Tools.
- **Linux:** WebKitGTK 4.1, Ayatana AppIndicator, librsvg, OpenSSL, ALSA development
  packages and patchelf; see the CI workflow for package names.
- **Windows:** Visual Studio C++ Build Tools and WebView2.

```sh
npm ci
npm run dev          # Browser development
npm run tauri dev    # Desktop development
npm run build        # TypeScript check and production web build
npm run tauri build  # Desktop bundle
```

Build the standalone media CLI:

```sh
cargo build --release --manifest-path media/Cargo.toml --bin crispaudio
media/target/release/crispaudio --help
```

The CLI can probe/prepare recordings, synchronize sources, apply project edit
recipes, transcribe and render linked arrangements. See
[Interview editing and CLI](docs/INTERVIEW_EDITING.md) and the workflow guides
above for complete examples.

## Development and checks

```sh
npm run lint
npm run build
npm test
cargo test --manifest-path media/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

React components live in `src/components/`, audio engines/DSP in `src/audio/`,
editing helpers in `src/lib/` and Zustand/undo state in `src/stores/`. `src-tauri/`
contains desktop commands; `media/` contains native media processing and the CLI.
Vitest tests live in `tests/`; optional integration harnesses are in `scripts/`.

Contributions should use focused branches, include appropriate checks and open a
pull request against `main`. CI checks the frontend, Rust and media CLI. Desktop
release bundles and web deployments use version tags/manual workflows; Apple
uploads have separate workflows. Pushing `main` does not submit an Apple release.

## Documentation

- [PLAN.md](PLAN.md): priorities and unfinished roadmap items.
- [CHANGELOG.md](CHANGELOG.md): changes by version.
- [history.md](history.md): historical implementation notes formerly in this README.
- [CLAUDE.md](CLAUDE.md): repository architecture and contributor guidance.

## License

MIT. Third-party components retain their own notices; see the app's About view
and [licensing details](docs/MEDIA_FORMATS_AND_LICENSES.md). External ASR models
have separate licenses. Optional installed tools are not bundled with the app.
