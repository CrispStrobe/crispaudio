# CrispAudio

**Record, edit and mix audio. Build sound effects, process voices and cut video in the same project.**

CrispAudio is an audio workstation with a multitrack timeline, a source waveform
editor, a sound-effect synthesizer and voice-processing tools. Use it for spoken
recordings, interviews, voiceovers, sound design and videos with several audio
sources. The interface supports English, German, keyboard shortcuts and touch.

[App Store](https://apps.apple.com/app/crispaudio/id6791876962) · [TestFlight](https://testflight.apple.com/join/YpRwC6wF) · [Try the web app](https://crispaudio-psi.vercel.app) · [Download builds](https://github.com/CrispStrobe/crispaudio/releases) · [Roadmap](PLAN.md)

[![CI](https://github.com/CrispStrobe/crispaudio/actions/workflows/ci.yml/badge.svg)](https://github.com/CrispStrobe/crispaudio/actions/workflows/ci.yml)

This guide describes the current source tree. Published builds and the web app
may have fewer features. The App Store currently carries iOS **0.3.0**; the native
Mac editor and iOS **0.13.0 (14)** are in TestFlight; external testing awaits Apple
Beta App Review. See [platform and release status](docs/RELEASE_STATUS.md).

## Start a project

1. Open **File → Sample sessions** to try an audio mix, a video with music and
   titles, or a recording with alternate takes. **Sample walkthroughs** guides
   you through recording, comping, mixing and video editing.
2. Import your recordings into **Timeline**. In the desktop app, drop an MP4 onto
   the window to import linked picture and camera audio. Use the media workspace
   to manage sources and synchronize separate microphones or cameras.
3. Select a clip and enable **Move & trim** to move it or drag its start/end
   handles. Right-click a clip, or hold it on touch, for editing actions.
4. Press **Space** to play or pause. Open **Mixer** to adjust levels and effects,
   or press the red **Record** button to capture a microphone. The arrow beside
   Record opens input, take and recording settings; input meters stay visible
   while the dialog is closed.
5. Save the project to continue editing later. Use **Export** for audio or
   **Delivery** for ranges, regions, stems, video and queued outputs.

On macOS, secondary tools live in the desktop menus. **Find command**
(⌘/Ctrl K) searches the same actions; touch users can use the tabbed ribbon.
**Settings → Playback device** selects speakers or headphones and provides an
output test. On macOS this changes the system output for all apps.

[Sample sessions](docs/SAMPLE_SESSIONS.md) · [Guided walkthroughs](docs/SAMPLE_WALKTHROUGHS.md) · [Timeline controls](docs/TIMELINE_UX.md)

## Edit and organize audio

- Arrange audio clips on multiple tracks. Split, trim, slip, copy, cut and paste;
  use snapping, sample/frame nudges and numeric position or duration fields.
- Select time ranges to audition, loop, export, lift, extract or insert silence.
  Ripple, rolling and slide trims help adjust edits without rebuilding the sequence.
- Link audio with picture, group clips for shared edits, lock tracks and control
  which tracks participate in ripple edits.
- Fit the whole project, zoom to samples or frames, adjust track heights and hide
  optional panels. Choose normalized or mix-level waveforms in View, or override
  the display for one track in its context menu or Track Settings.
- Edit slider readouts with exact numeric entries. On touch screens, drag a number up or down to adjust
  it, or tap to type; Enter confirms and Escape cancels a typed draft.
- Organize tracks in collapsible folders with shared selection, mute and solo.
  Track and clip selection have separate visible highlights.
- Shape clip/track fades and crossfades with live visual feedback. Floating
  inspectors let you listen and adjust while keeping the timeline in view.
- Change speed, reverse audio or video, preserve voice pitch during time changes,
  or transpose pitch. Retained originals allow further changes and restoration.

[Timeline editing](docs/TIMELINE_WORKFLOW.md) · [Precise placement and keyboard editing](docs/FAST_EDITING.md) · [Track folders](docs/TRACK_FOLDERS.md)

## Clean up a source recording

Select a clip and open **Source Editor** for detailed work on its source window.

- Zoom to individual samples, select channels and snap boundaries to zero crossings.
  Make several separate selections and loop them for listening.
- Preview normalization, silence, DC removal and protective fades. Find the useful
  sound within surrounding silence, or keep a selected interval.
- Compare the original with the processed preview before applying it. Originals
  remain available for undo and restoration.
- Inspect peak, RMS, DC offset, clipping, loudness and true-peak readings. Open a
  spectrum or spectrogram and adjust its analysis settings.
- Save selections as named regions for later delivery. On macOS, apply supported
  Audio Unit or VST3 effects to the selected source window.

## Record and choose takes

Record directly into an audio track, with device/channel selection and optional
input monitoring. Recording options include count-in, punch ranges, loop takes
and simultaneous capture into up to eight armed tracks. Input calibration can
measure a real return path, or you can enter a known correction.

Audition an original take or listen to its comp through the project mix. Choose
parts of different takes, edit region boundaries and crossfades, replace or remove
regions, and save named comp versions. Recorded originals remain available.

[Recording and take review](docs/RECORDING_REVIEW.md)

## Mix, automate and compare

- Use track and master faders, pan, mute/solo and stereo peak/RMS meters with
  clipping and peak hold. Monitor volume is separate from the saved master level.
- Add clip, track, bus and master FX: high/low-pass filters, bell/shelf EQ,
  compression, distortion, bit crushing, ring modulation, delay, chorus and reverb.
  EQ has an interactive response graph; dynamics show gain reduction.
- Route tracks through buses and pre/post-fader sends. Use a sidechain source to
  duck another track, and protect the output with the master limiter.
- Automate gain and pan; delay mix/feedback/time; chorus mix/depth/rate; ring
  modulation mix/frequency; and bit-crusher, distortion and reverb mix.
- Shape envelopes with points, Linear/Step curves, easing curves and Bézier handles.
  Copy and stretch compatible envelopes. Read follows existing automation;
  Touch/Latch/Write record passes for review. Clip/master FX have automation inspectors.
- Compare saved **Mix A/B** versions with optional loudness matching. Measure LUFS
  and estimated true peak, then review a loudness adjustment before applying it.

On macOS, discover AU/VST3 effects and add them to clip, track, bus or master
racks. **Live** playback keeps native effects running through pause and loops.
Adjust faders, pan, mute, solo, sends, plugin parameters and bypass while listening;
track meters and master loudness remain visible. Seeking rebuilds effect history.
Use the compact **Live / Preview** selector beside Play for a rendered fallback.

Use **VST3 folder…** to add effects from another location. The Mac app remembers
up to eight selected folders across launches. If an older selection or an external
drive is unavailable, select its folder again.

The Mac app also remembers selected media and project files. Use **File → Media
Folder Access…** for a folder of linked recordings. Most single-file Mac exports
use just the Save dialog. Exports to other drives and projects saved with separate
audio assets may ask for their output folder once; later work in that folder reuses the selection. After restarting the app, macOS bookmarks can recover renamed or moved sources
when their identity is still available. Existing paths stay unchanged. If a drive
is unavailable or a move cannot be resolved, use the relink picker when opening
the project.

Native inserts include generic parameter controls, saved state and rack copy/paste.
Mac Live playback records track level and pan passes in Touch, Latch or Write,
with review before applying and one Undo. Effect-parameter passes remain unavailable
with native inserts.

Structural or built-in effect edits restart live playback. To record a microphone
with native effects in the session, CrispAudio first prepares a fixed wet backing
mix. Backing and capture share one clock; takes and input monitoring stay dry.
Live plug-in input monitoring, monitor clicks and custom plug-in windows remain
pending. Native playback processes at 48 kHz and converts other source rates
when needed.

[FX and automation](docs/DAW_EFFECTS.md) · [Clip/master recording passes](docs/SCOPED_AUTOMATION_PASSES.md) · [Mix A/B and export review](docs/MIX_REVIEW.md) · [Native playback](docs/NATIVE_PLAYBACK.md) · [Native effect support](docs/MEDIA_FORMATS_AND_LICENSES.md)

## Work with video

- Arrange linked sound and picture on a shared timeline. Add ordered picture
  layers, hide or lock layers, and preview the composition in a larger viewer.
- Trim source In/Out points and insert, overwrite or append footage. Edit
  transitions, color, orientation, position, scale, rotation, crop and opacity;
  keyframes animate supported transforms.
- Add titles, lower thirds, still images and reusable title presets. Edit captions,
  import/export SRT or VTT, and choose caption sidecars or burned-in subtitles.
  Preview safe-area guides help place text.
- Synchronize separate recordings and correct offset/drift. For aligned cameras,
  build a multicam scene and switch angles while the independently mixed audio
  continues.

[Media workspace](docs/MEDIA_WORKSPACE.md) · [Picture layers, graphics and multicam](docs/EDITOR_CHECKPOINT.md) · [Color](docs/VIDEO_COLOR.md) · [Orientation](docs/VIDEO_ORIENTATION.md)

## Edit speech and create voiceovers

Use a transcript to find and select passages, remove timed words across sound and
picture, or paste a shortened transcript and review which passages to keep.
Source transcripts map through trims, repeated clips, speed and reverse. Correct
words and speaker labels, search occurrences and organize named sections.

Desktop transcription and word alignment use a separately configured local
**CrispASR** executable and model. Existing timed transcripts can also be imported.
Text-to-speech can generate a voiceover, preview it and place it in the timeline;
it uses a configured speech service, or system voices in the iOS app.

[Speech editing and setup](docs/SPEECH_EDITING.md) · [Keep-text editing](docs/KEEP_TEXT_EDITING.md) · [Interview walkthrough](docs/INTERVIEW_WALKTHROUGH.md)

## Design sounds, process voices and add notes

**SFX** creates sounds from sine, square, sawtooth and noise sources. Start with a
preset, then adjust envelopes, FM, vibrato, arpeggiation and effects. Lock parameters
while mutating a sound, compare/morph A/B versions, inspect waveforms and spectra,
and export audio or load/save JSON presets. Preset links share settings; **Send to timeline**
adds the sound to a project.

**Voice** loads or records audio for voice presets, pitch/time/formant processing
and effects. Compare source and processed sound or A/B versions, inspect the result,
then export it or return it to a timeline clip.

**Musical tools** add tempo/time-signature settings, a bars/beats ruler, musical
snapping and a metronome. The piano roll supports note editing, velocity,
quantization, basic sine/bell instruments and controller capture alongside timeline
playback. Apply a pattern as an editable audio clip or export a MIDI file. MIDI
file import and full live instrument-track sequencing are not available.

[SFX guide](docs/SFX_WORKFLOW.md) · [Musical time](docs/MUSICAL_TIME.md) · [MIDI and piano roll](docs/MIDI.md)

## Save, export and deliver

Save projects with embedded or linked audio, recover autosaves, relink missing
media and collect portable projects. Import/export track arrangements when reusing
material between projects. Undo/redo covers editing and processing workflows.

Export a whole mix, selected range or clips, named regions, or track/bus stems.
Delivery includes presets, output naming templates, WAV metadata and a cancellable,
restartable queue. Choose solo stems for isolated listening or pre-master summing
stems for supported mixes. Export video with captions, or exchange a reviewed
cut-only sequence through OTIO. **Review Export** plays the actual saved file and
shows its audio measurements and file information.

[Delivery, queue, regions and interchange](docs/DELIVERY.md) · [Saved-file review](docs/MIX_REVIEW.md)

## Formats and availability

| Media | Supported formats and routes |
|---|---|
| Audio import | WAV, MP3, M4A/AAC, FLAC, Ogg/Opus, AIFF/AIF and CAF; decoding depends on platform and codec profile |
| Audio export | WAV, FLAC, MP3, AAC and Ogg Opus; eligible Mac timeline delivery also supports M4A |
| Desktop video import | MP4, MOV, MKV, M4V, WebM, AVI, OGV and MPEG/MPG, depending on the backend |
| Desktop video export | MP4/MOV with H.264/AAC; compatible Mac encoders also support ProRes/LPCM in MOV; optional FFmpeg provides WebM paths |
| Projects and exchange | Embedded/linked projects, portable media collection, JSON presets, SRT/VTT captions, MIDI pattern export and cut-only OTIO |

The browser provides audio editing, SFX and voice tools. Video composition, local
CrispASR integration and desktop delivery require the app. The native media backend
uses macOS 13+; other desktop media paths may require FFmpeg/FFprobe. Some Mac
transitions require compatible Metal hardware. Codec availability and export scopes
vary by route; the [format matrix](docs/MEDIA_FORMATS_AND_LICENSES.md) lists the details.

AU/VST3 hosting is currently Mac-only. Direct and queued WAV, FLAC and AAC exports
include enabled native racks; video export uses the finished audio mix. Export
stops live native playback before opening offline plugin instances. The standalone
CLI rejects enabled native inserts. GUI audio is decoded into
memory, so long recordings can need substantial RAM. iOS does not yet have desktop
feature parity; newer touch, device and multi-input workflows need device-specific
checks. See [platform status](docs/RELEASE_STATUS.md) for availability.

## Run from source

For the web app, use Node.js 22.12+ and npm:

```sh
npm ci
npm run dev
```

For the desktop app, also install a current stable Rust toolchain and the platform
build tools: Xcode Command Line Tools on macOS, Visual Studio C++ Build Tools and
WebView2 on Windows, or the Linux development packages listed in
[CI](.github/workflows/ci.yml).

```sh
npm run tauri dev    # Run the desktop app
npm run tauri build  # Build a desktop bundle
```

The standalone CLI probes and prepares media, analyzes levels/loudness, synchronizes
sources, applies project edit recipes, cleans or retimes audio, transcribes and
renders linked arrangements:

```sh
cargo build --release --manifest-path media/Cargo.toml --bin crispaudio
media/target/release/crispaudio --help
```

[CLI examples](docs/INTERVIEW_EDITING.md) · [Contributor guide](CLAUDE.md) · [Roadmap](PLAN.md) · [Changelog](CHANGELOG.md)

<details>
<summary>Development checks</summary>

```sh
npm run lint
npm run build
npm test
cargo test --manifest-path media/Cargo.toml --features native-engine --locked
cargo test --manifest-path src-tauri/Cargo.toml
```

Frontend code is in `src/`, desktop commands in `src-tauri/`, and native media
processing and the CLI in `media/`. Tests are in `tests/` and `scripts/`.

</details>

## License

MIT. Dependencies, plugins, external tools and ASR models retain their own licenses.
See the app's About view and [third-party licensing](docs/MEDIA_FORMATS_AND_LICENSES.md).
