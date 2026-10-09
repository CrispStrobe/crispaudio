# Formats and licensing — local 0.7.1

## Current GUI

Audio import offers WAV, MP3, M4A/AAC, FLAC, Ogg/Opus, AIFF/AIF and CAF. Platform
Web Audio decoding runs first, with the bundled Glint fallback afterward. An
extension does not guarantee every codec/profile variant is decodable.

Audio export in SFX, Voice and Timeline supports WAV, MP3, ADTS AAC, Ogg Opus and
**native FLAC, signed 24-bit PCM**. FLAC runs at the source sample rate, uses level
5 compression and retains the final STREAMINFO MD5 checksum. It is lossless after
float-to-24-bit quantization; it does not preserve arbitrary 32-bit float values.
Bitrate does not apply to WAV/FLAC. Encoding runs in the cancellable worker.

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
The GUI supplies its already edited/range-trimmed Web Audio mix; the native
composition inserts it on the correct timeline clock before exporting the range.
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

CLI project audio mixing, long-file alignment/rendering, denoising and EBU loudness
still use FFmpeg. Thus strict Apple mode can prepare/extract/probe and render a
picture edit with a supplied mix, but does not yet render arbitrary project audio.
The GUI mix/export path uses Web Audio and has broader effects support. CLI WAV
rendering remains separate from the GUI's FLAC/MP3/AAC/Opus encoder worker.

## Licence boundary

CrispAudio and its native helper are MIT. Glint is MIT. The FLAC wrapper is MIT;
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
