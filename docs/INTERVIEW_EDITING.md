# Interview synchronization and editing

CrispAudio now has a desktop interview workflow and a standalone CLI. The code
lives inside this repository (`media/`), and the Tauri app calls the same internal
operations. There is no separate engine shared with CrisperWeaver.

For the actual Canon/RØDE/H6 recordings, see the [step-by-step walkthrough](INTERVIEW_WALKTHROUGH.md).
For iOS/macOS distribution limits, see [release status](RELEASE_STATUS.md).

## Prerequisites and build

Install FFmpeg/FFprobe (macOS: `brew install ffmpeg`). The desktop app also looks in
`/opt/homebrew/bin`, `/usr/local/bin` and `/usr/bin`, so launching from Finder works.
`CRISPAUDIO_FFMPEG` and `CRISPAUDIO_FFPROBE` can specify other executable paths.

```sh
cargo build --release --manifest-path media/Cargo.toml
media/target/release/crispaudio --help
npm ci
npm run tauri build
```

The CLI is built independently of Tauri and needs no window server.
The iOS simulator workflow checks compilation/launch on main without uploading. The GUI
workflow is desktop-only; existing web/mobile audio features remain available.
FFmpeg executables are prerequisites, not bundled into the application.

## CLI

```sh
crispaudio probe camera.mp4
crispaudio levels room.wav

crispaudio analyze --video camera.mp4 \
  --audio rode.wav --audio room.wav --output analysis.json

crispaudio align --session analysis.json --output-dir aligned

crispaudio export --session aligned/session.json --output synced.mp4
crispaudio export --session aligned/session.json --match-levels --output level-matched.mp4

# Optional: use a separately edited mix starting at video time zero.
crispaudio export --session aligned/session.json --mix edited.wav --output edited.mp4
```

Commands emit JSON on stdout and errors on stderr, returning a nonzero exit code
on failure. Use a new analysis filename, an empty alignment directory and a new
video filename. Existing files are not overwritten.

`analyze` writes a reviewable session even if an alignment is uncertain. To review
it, use the GUI or edit the corresponding track's `alignment.offset`, optionally
`alignment.rate`, and set `alignment.manual` to `true`. The mapping is:

```
recorder_time = offset + rate * video_time
```

Positive offsets trim the recorder's beginning. Negative offsets insert silence
before a late-starting recorder. Missing recording tails are padded with silence.
`align` and `export` reject unconfirmed uncertain results; `--allow-uncertain` is an
explicit CLI override, not a recommendation to trust a weak match.

The first external recording is the default video audio track. Other external
recordings and the original camera audio are selectable alternatives. The picture
and original camera audio are copied without re-encoding. External audio and edited
mixes are encoded to AAC; aligned intermediate WAVs are 48 kHz, 24-bit PCM, with
each source's original number of channels retained.

## GUI

1. Open **Timeline → Add video + recordings**, choose the camera and recorder files in
   the labeled steps, check their names, then analyze synchronization.
2. Review correlation, drift, residuals and offsets. Weak matches require an
   explicit manual confirmation. Optionally match listening levels.
3. Choose a folder for the aligned WAVs and sync session, then import the project.
4. Use the microphone buttons or **Tracks & microphones** to compare tracks.
   Initially only the first microphone plays. These controls change the export mix.
   **Fit all / reset view** shows the full timeline. Select clips and use **Split selected**,
   **Split all at playhead**, **Delete**, and **Clip settings** to edit without
   right-clicking. The inspector opens in a dialog. Use the position slider to seek.
   On touch, enable **Move & trim** explicitly for clip dragging; otherwise tap
   selects and vertical swipes scroll. Video preview can be hidden.
5. **Save project** keeps linked media references for imported interviews. Keep the
   aligned folder and original video; moving them requires restoring their paths.
6. **Export edited video** renders the active timeline mix to the original video's
   duration, then copies the original picture and retains camera audio as an
   alternative track. Full length copies the picture; **Export range** selects
   a single section and encodes an accurate picture/audio cut.

Project version 2 can also embed 32-bit PCM WAV for portable audio projects;
version 1 projects still load. Linked projects avoid repeated PCM/base64 copies
when saving long interviews. Missing linked audio fails visibly instead of
silently exporting an incomplete interview. On iOS, saves embed audio rather than linking desktop paths. Interview autosaves store linked
references; **Recover interview autosave** restores both the arrangement and its
audio. Other audio projects retain the prior layout-only autosave behavior.

Level matching aims for -24 dBFS at the 80th percentile of 100 ms RMS windows,
constrained to a -1.5 dBFS sample peak. It applies constant gain only, with no
compression or denoising. This is an activity estimate, not calibrated loudness,
SNR, a speaker label or a microphone quality score. Multiple simultaneously
enabled microphones can produce comb filtering; select the desired source.

## Touch and layout

Primary Open/Save/Import/Export actions remain visible on phones. View & tools
opens zoom/snapping/undo in a dialog. The mixer and clip inspector also use
dialogs, leaving the waveform area available. Controls target 44 CSS pixels for
touch; this follows [Apple’s touch control guidance](https://developer.apple.com/design/tips/)
but does not itself establish native accessibility compliance. The global reset
now sits in the CSS base layer so Tailwind spacing utilities apply normally.

## Alignment limits

Analysis uses 4 kHz mono audio filtered to 250–1600 Hz, normalized correlation at
nine distributed six-second anchors (shorter for short clips), and robust offset/
linear-drift fitting. Gain changes and inverted polarity are tolerated. Analysis
downmixing does not alter the production audio channels.

A reliable result needs at least three consistent anchor windows spanning 40% of the
reference, median correlation ≥ 0.25, maximum residual ≤ 20 ms, and estimated
clock drift ≤ 1000 ppm. Silence, repeated sounds and dissimilar recordings can
still confuse correlation: inspect uncertain results and verify lip sync. The
score is not a statistical probability. There is no nonlinear clock correction.

Rendering resamples through a 384 kHz intermediate clock because FFmpeg's
`asetrate` accepts integers. Rounding error is bounded to 1.303 ppm (about 0.33 ms
over a 4:14 interview); `rendered_rate` records the actual rate used. This is
separate from the measured anchor residual. Files are decoded into memory during
analysis/import, so very long recordings need a future streaming/cache pipeline.

## Verification

```sh
npm run lint
npm run build
npm test
cargo test --manifest-path media/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib
python3 scripts/test-media-cli.py media/target/release/crispaudio
```

The CLI integration test generates disposable stereo recordings and camera video.
It checks offsets in both directions, late-recorder silence, channels, sample
rate/precision, level measurement, confidence and overwrite guards, and compressed
stream hashes for both picture and retained camera audio.

Next work: multiple picture clips/ripple cuts/multicam, transcript navigation, microphone changes by
speaker with reviewed crossfades, long-file streaming, cancellable native jobs,
and packaging/discovery of FFmpeg on fresh installations.

## Visual alignment and video sections (local 0.4.0)

The video lane shares the audio ruler, horizontal scroll, zoom, and playhead.
Eight overview thumbnails show picture context; they are not frame-accurate
edit handles. Click the lane to seek. The viewer offers fullscreen and ±33 ms
steps (approximate time steps, not frame-rate detection). Hide the viewer when
more vertical audio space is needed.

Waveforms default to display normalization per source; this does not change
mix gain, measured recording quality, or export audio. **View & tools** can
switch to mix-gain display. Deep zoom uses decoded channel-one samples; wider
views aggregate all covered cached peaks so narrow transients stay visible.

**Check alignment** overlays two pre-effect, window-normalized audio envelopes.
Choose Camera as reference and compare Tr1/LR near speech starts at beginning,
middle, and end; use a 100–500 ms window for close inspection. Different mic
positions and room reverberation change envelope shape. Also listen and check
lips in the video. This is an inspection tool, not proof of sync or an automatic
offset correction. Actual offset corrections remain in the sync session review,
followed by a fresh aligned import.

**Export range** sets in/out on the original video clock, with buttons at the
playhead or numeric seconds. Undo restores a range change. It does not move or
trim the stored audio clips. Export section renders that interval of the current
mix and encodes H.264/AAC for an accurate cut, retaining section camera audio as
an alternative. Full-length export still copies compressed picture and camera
audio. This is one locked source video and one export interval, not a multicam
or arbitrary multi-clip montage editor. Camera + external audio setup is still
required; silent video and standalone video import are not supported yet.

CLI equivalent (seconds on the original camera clock):

```sh
crispaudio export --session aligned/session.json \
  --start 30.2 --end 55.6 --output interview-section.mp4
```

With CLI `--mix`, supply the full source-clock mix, starting at camera time zero,
covering at least the selected end. The CLI seeks it with the picture. The GUI
renders an already trimmed temporary mix and uses the backend's trimmed-mix path.

For the generic audio-only or audio/video editor and updated mute/solo, file and
scroll controls, see [Timeline workflow](TIMELINE_WORKFLOW.md).
