# Interview synchronization and editing

CrispAudio now has a desktop interview workflow and a standalone CLI. The code
lives inside this repository (`media/`), and the Tauri app calls the same internal
operations. There is no separate engine shared with CrisperWeaver.

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

The CLI is built independently of Tauri and needs no window server. The GUI
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

1. Open **Timeline → Sync video + audio**, select the camera video and recordings.
2. Review correlation, drift, residuals and offsets. Weak matches require an
   explicit manual confirmation. Optionally match listening levels.
3. Choose a folder for the aligned WAVs and sync session, then import the project.
4. Use solo/mute to compare tracks. Initially only the first microphone plays.
   Trim/split clips, adjust fades and track gain, and preview against the video.
5. **Save project** keeps linked media references for imported interviews. Keep the
   aligned folder and original video; moving them requires restoring their paths.
6. **Export edited video** renders the active timeline mix to the original video's
   duration, then copies the original picture and retains camera audio as an
   alternative track. It does not cut or retime the picture.

Project version 2 can also embed 32-bit PCM WAV for portable audio projects;
version 1 projects still load. Linked projects avoid repeated PCM/base64 copies
when saving long interviews. Missing linked audio fails visibly instead of
silently exporting an incomplete interview. Interview autosaves store linked
references; **Recover interview autosave** restores both the arrangement and its
audio. Other audio projects retain the prior layout-only autosave behavior.

Level matching aims for -24 dBFS at the 80th percentile of 100 ms RMS windows,
constrained to a -1.5 dBFS sample peak. It applies constant gain only, with no
compression or denoising. This is an activity estimate, not calibrated loudness,
SNR, a speaker label or a microphone quality score. Multiple simultaneously
enabled microphones can produce comb filtering; select the desired source.

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

Next work: picture cuts/multicam, transcript navigation, microphone changes by
speaker with reviewed crossfades, long-file streaming, cancellable native jobs,
and packaging/discovery of FFmpeg on fresh installations.
