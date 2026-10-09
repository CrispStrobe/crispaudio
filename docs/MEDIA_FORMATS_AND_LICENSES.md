# Formats and licensing — local 0.7.12

## Current GUI

Audio import offers WAV, MP3, M4A/AAC, FLAC, Ogg/Opus, AIFF/AIF and CAF. Platform
Web Audio decoding runs first, with the bundled Glint fallback afterward. An
extension does not guarantee every codec/profile variant is decodable.

Audio export in SFX, Voice and Timeline supports WAV, MP3, ADTS AAC, Ogg Opus and
**native FLAC, signed 24-bit PCM**. FLAC runs at the source sample rate, uses level
5 compression in the worker and retains the final STREAMINFO MD5 checksum.
Eligible Mac timeline FLAC exports now use the Apple system encoder in bounded
chunks with the same signed 24-bit quantisation; its compression preset differs
from the worker, so encoded file bytes/size can differ while decoded PCM matches. It is lossless after
float-to-24-bit quantization; it does not preserve arbitrary 32-bit float values.
Bitrate does not apply to WAV/FLAC. Mac timeline AAC save dialogs additionally offer M4A (`.m4a`), retaining
priming/padding metadata for gapless-aware decoders. Final packet tables
must match the source frame count. This is the same lossy AAC-LC codec, not ALAC.
Mac timeline WAV export for linked 48 kHz
mono/stereo projects streams directly to disk, honoring the 8/16/24/32-bit integer
PCM preference. Integer export clips to full scale and matches the GUI worker's
rounding without dither. Linked Mac FLAC and AAC exports also write directly to disk; other audio exports
use the cancellable encoder worker. Native AAC uses AAC-LC in ADTS `.aac` at the
selected 96/128/192/256/320 kbps with constant bitrate strategy. It is lossy;
encoder output can differ from the worker. ADTS carries no gapless metadata:
measured priming is 2,112 frames (44 ms), with a final packet-padding tail.
Use WAV/FLAC when exact decoded timing is needed. Packet counts give duration
more reliably than tools that estimate ADTS duration from bitrate.

Video import offers MP4, MOV, MKV, M4V, WebM, AVI, OGV and MPEG/MPG. Apple handles
its supported containers/codecs first on macOS; optional installed FFmpeg handles
other inputs in automatic mode. Original source media stays unchanged.

Click video export to choose:

| Choice | Video/audio | Backend |
|---|---|---|
| MP4 | H.264 / AAC | Apple native or optional FFmpeg |
| MOV | H.264 / AAC | Apple native or optional FFmpeg |
| WebM VP9 | VP9 / Opus | Optional FFmpeg |
| WebM AV1 | AV1 / Opus | Optional FFmpeg; generally more encoding work |

Apple is the default export choice on Mac. **Apple** never falls back. **Automatic**
may use FFmpeg and says so in the selector. **FFmpeg compatibility** explicitly
uses the separately installed tool. Backend selection is per export, not a global
change to another running job. Output extensions must match the selected container.

The bundled MIT Swift helper uses macOS 13+ AVFoundation/CoreImage. It supports
probing, first thumbnail, proxy, stereo 48 kHz/16-bit WAV extraction, multi-source
cuts, cross dissolves, dips to black/white, all directional wipes and pushes,
blur, zoom, pixelation, whip, glitch and page peel, plus black gaps/tails,
per-clip colour, orientation and fades.
For linked 48 kHz projects with mono/stereo audible sources, macOS GUI video
export now streams its audio mix directly from disk through the native mixer.
Only paths and edit settings cross IPC. The full-clock mix preserves effect
history before the selected section; composition seeks it once. In-memory sounds,
other project rates and other desktop platforms retain the range-trimmed Web
Audio mix. The selected backend controls picture export; eligible native audio
mixing does not silently fall back on errors.
Whip, glitch and page peel use cached native Metal kernels and require a GPU
with dynamic library support. They passed on this Apple Silicon Mac; older Intel
GPU support is not established. Unsupported hardware fails in strict Apple mode;
optional FFmpeg remains available. Complex effects and browser previews are
visually approximate across renderers, not pixel-identical FFmpeg replacements.
Page peel is a shaded 2D fold, not a physically simulated 3D page.
Source thumbnails are not previews of edits. Desktop subprocesses are not an
implementation of video composition on iOS.

## CLI

```sh
# Strict native Apple export: no FFmpeg fallback, source audio never reused.
crispaudio edit-video --edit picture.json --mix mix.wav --output native.mp4 --backend apple
crispaudio edit-video --edit picture.json --mix mix.wav --output native.mov --backend apple --video-format mov

# Optional installed FFmpeg, with permissively licensed VP9/AV1 codec libraries.
crispaudio edit-video --edit picture.json --mix mix.wav --output vp9.webm --backend ffmpeg --video-format vp9
crispaudio edit-video --edit picture.json --mix mix.wav --output av1.webm --backend ffmpeg --video-format av1
crispaudio render-project --input saved.crispaudio --video --output project.webm --video-format vp9 --backend ffmpeg

# Native preparation/probe; environment policy applies to all media commands.
crispaudio probe recording.mov --backend apple
crispaudio prepare --input recording.mov --output extracted.wav --backend apple
```

`--mix-is-trimmed` means the supplied audio starts at the exported range's start;
without it the mix uses the full timeline clock. `--backend` accepts `apple`,
`ffmpeg` or `auto`. `CRISPAUDIO_MEDIA_BACKEND=apple` also forbids FFmpeg operations,
including ones that do not yet have an Apple implementation. `edit-video` JSON
may set `backend` and `outputFormat`. CLI flags override those fields. Saved-project
rendering uses the global backend policy; picture JSON export options are retained.

CLI project mixing now streams to **48 kHz, stereo, 32-bit float WAV** using
Apache-2.0 Hound, MIT DSP and BSD-3-Clause WebKit adaptations. It supports linked mono/stereo sources, source
trims/offsets, overlaps, mute/solo, gains, pan, track/clip fade curves, gain
automation and enabled low/high-pass, bit-crusher, ring-modulator, delay and
chorus, convolution reverb, oversampled distortion and compressor at clip, track and master
level. `render-project --wav-bit-depth 8|16|24|32` selects native integer PCM;
omitting it preserves float WAV. The flag requires native mixing, conflicts with
`--video`, and rejects explicit FFmpeg mode. Both outputs share the same DSP.
Filter resonance and pan follow Web Audio definitions; fades match the GUI's
sampled ramp schedule. Ring modulation uses the project clock and a true wet/dry
blend; bit crushing preserves silence and interpolates the GUI waveshaper curve.
Delay and chorus include fractional delay interpolation and tails within the
chosen canvas. Delay feedback timing follows measured macOS WebKit behavior;
other browser engines may differ. Chorus preserves the GUI's two wet delay lines
and uses the project clock for modulation. All audible racks share a 64 MiB
DSP-buffer limit and a 1024-enabled-effect limit; larger racks fail explicitly.
Reverb reproduces the GUI's seeded stereo response, WebKit level calibration
and wet/dry blend, using zero-latency FFT convolution. It turns mono sound
into stereo before pan. Its 0.1–5 second response buffers share the state budget.
WebKit calibration/timing is the reference; other browser engines can differ.
Timeline distortion uses the GUI's tanh curve, interpolated from 256 Float32
entries with four-times oversampling. Its wet path includes the same filter
delay (192 frames at 48 kHz); dry sound stays immediate. Filter tails fit within
the chosen canvas. Stereo-linked compression matches WebKit's soft knee,
adaptive release, automatic makeup gain and 288-frame (6 ms) lookahead at 48 kHz.
Its detector follows the louder channel; mono becomes stereo before track pan.
Compression keeps its GUI latency rather than shifting clips or automation.
All nine current timeline rack types work natively; unknown enabled types fail
explicitly. WebKit DSP adaptations retain their BSD-3-Clause notices in About.

Native 48 kHz PCM WAVs (8/16/24/32-bit integer or 32-bit float) are read directly.
On Mac, Apple decodes/resamples other inputs into an owned float WAV without an
intermediate 16-bit conversion. Temporary decoded media needs disk space, while
the mix uses 1024-frame blocks rather than duration-sized audio buffers. At most
256 audible clips are supported per render. Output stays within standard WAV's
4 GiB size limit. Positions round to the 48 kHz grid; one final sample may be
padded for rounding. A short Apple converter tail can be zero-padded by up to
one millisecond, within the measured source extent. Longer missing audio fails.

`render-project --video --backend apple` now creates the native full-clock mix
and exports the selected picture range, so a linked project can become MP4/MOV
without FFmpeg. Automatic mode prefers native mixing, then reports any optional
FFmpeg fallback; explicit FFmpeg mode keeps the older compatibility mix. That
older mixer has narrower pan/master-effect support and different filter behaviour.

Long-file alignment, denoising and EBU loudness still use FFmpeg. GUI import and playback still use Web Audio and duration-sized decoded buffers.
Eligible macOS video exports avoid a second duration-sized render buffer;
Eligible timeline WAV exports also stream from disk; MP3/Opus exports
and other projects still render with Web Audio. CLI also exports native Mac FLAC when the output ends in `.flac`, preserving
stereo 48 kHz and signed 24-bit PCM. It uses an owned float mix on disk and the
Apple encoder; explicit FFmpeg mode fails rather than choosing another FLAC
backend. CLI native Mac `.aac` output is also supported: AAC-LC, ADTS, stereo 48 kHz.
`--audio-bitrate-kbps` selects the same five bitrates, default 192. It requires
`.aac` or `.m4a` output and conflicts with `--video`/`--wav-bit-depth`; native audio never
falls back to FFmpeg. MP3/Opus remain in the GUI codec worker. No permissive-only bundled WebM implementation is claimed.

```sh
crispaudio render-project --input saved.crispaudio --output mix.wav --backend apple
crispaudio render-project --input saved.crispaudio --output edited.mp4 --video --backend apple
```

The native mixer uses the [Web Audio filter and pan definitions](https://www.w3.org/TR/webaudio-1.0/).

## Licence boundary

CrispAudio and its native helper are MIT. Hound 3.5.1 is Apache-2.0; its copyright
and full notice are bundled in About. Glint is MIT. The FLAC wrapper is MIT;
its bundled libFLAC 1.3.4 encoder is BSD-3-Clause. Notices are in `src/lib/glint/`
and `src/lib/flac/` and listed in About. The vendoring adapter is reproducible with
`node scripts/vendor-flac.mjs` against pinned libflacjs 5.6.0. It isolates upstream
fetch configuration instead of modifying the worker's global fetch function.

Apple frameworks are proprietary OS facilities, not codec libraries redistributed
under MIT. Using them avoids bundling an independent AAC/H.264 encoder but is not
a blanket statement about every patent obligation of every product/distribution.

FFmpeg is **not** permissively licensed: LGPL at minimum, GPL when enabled components
require it. The Homebrew FFmpeg 9.0.2 inspected here reports GPLv3 and enables
x264/x265. CrispAudio invokes it as a separate executable, not a linked library;
we do not bundle that binary. The executable's own licence still applies. Selecting
VP9 or AV1 does not turn a GPL FFmpeg binary into BSD software.

libvpx (VP9) and SVT-AV1 have permissive source licences, but WebM currently still
runs through optional FFmpeg. A bundled permissive-only WebM decoder/muxer/encoder
path is **not completed**. Long-file DSP and iOS video composition also remain separate work. No GPL binary has
been added to the application bundle for this milestone.

Sources: [FFmpeg licensing](https://ffmpeg.org/legal.html),
[Glint MIT](https://github.com/CrispStrobe/glint/blob/main/LICENSE),
[libFLAC BSD](https://github.com/xiph/flac/blob/1.3.4/COPYING.Xiph),
[libflacjs MIT wrapper](https://github.com/mmig/libflac.js/blob/master/LICENSE),
[libvpx BSD](https://github.com/webmproject/libvpx/blob/main/LICENSE),
[SVT-AV1 BSD](https://github.com/AOMediaCodec/SVT-AV1/blob/main/LICENSE-BSD2.md).

## What codec patents mean for Glint

Copyright permission to use source code and permission to practise a patented
method are different rights. Clean-room code avoids copying another implementation;
it does not by itself avoid a patent covering a method in a standard. MIT does
not supply licences to unrelated third-party patents. Apache-2.0's contributor
patent grant would not supply all unrelated codec patents either.

- **MP3:** Fraunhofer says the last core patents in its Fraunhofer/Technicolor
  licensing programme expired in 2017. That substantially reduces the historical
  concern; it is not a worldwide search for every possible implementation patent.
- **AAC:** Glint implements AAC-LC, not all AAC profiles. Via LA still operates an
  AAC patent pool covering several profiles and countries and lists patents.
  An active pool alone does not prove that a still-valid claim covers this exact
  AAC-LC implementation in a particular country. Conversely, MIT/clean-room status
  is not evidence that none do. Worldwide patent clearance has not been established
  by this engineering audit; product distribution needs a profile/country/claim
  assessment before claiming unconditional royalty-free AAC.
- **Opus:** its standard has published royalty-free patent licensing commitments.
  Compliance and the terms of those commitments matter; this is not an assertion
  that no third party could ever make a claim. FLAC/WAV remain lossless alternatives.

No Glint-specific infringement or copied-code issue was identified in this audit.
This is a review of source licensing, supported profiles and published licensing
statements, not a legal opinion or a full patent clearance search. We have not
removed AAC or introduced a speculative user consent prompt.

Sources: [Fraunhofer on MP3 patents](https://www.audioblog.iis.fraunhofer.com/mp3-software-patents-licenses),
[Via LA AAC programme](https://www.via-la.com/licensing-programs/aac/),
[Opus copyright and patent-licence references](https://github.com/xiph/opus/blob/main/COPYING),
[Glint source and profile description](https://github.com/CrispStrobe/glint).

Native convolution uses the already-linked RustFFT 6.4.1. RustFFT and its
strength_reduce, transpose, num-complex, num-integer, num-traits and primal-check
dependencies offer MIT OR Apache-2.0; the app distributes their MIT notices in
About. This adds no new codec or GPL dependency.

Reverb normalisation references: [WebKit calibration implementation](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/audio/Reverb.cpp)
and [Web Audio ConvolverNode semantics](https://www.w3.org/TR/webaudio-1.0/#ConvolverNode).
The native convolver is our implementation. Distortion's resampling kernels and
phase conventions adapt WebKit UpSampler/DownSampler under BSD-3-Clause. Their
copyright and complete licence are bundled in About. Source revision
`ae88abe108bcccf28bd309adeed1d0522595e901` is recorded in the source and notice.
This adds no codec or GPL dependency.
