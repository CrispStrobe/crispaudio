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

The macOS source-effect host includes a pinned subset of Steinberg's MIT VST3 SDK
(see media/vst3/vendor/UPSTREAM.json and included notices). Its helper is built and
embedded at compile time and uses Apple system frameworks at runtime. Audio Unit
and VST3 source processing produces ordinary saved PCM; export does not require
loading the plugin again. Temporary SDK test plugins are not distributed.

VST3 discovery enumerates bundles without loading their code, then scans each bundle
in a separate cancellable helper with a ten-second deadline. A crash, timeout or
invalid bundle leaves healthy AU/VST3 effects available; skipped paths and failure
details are shown in a collapsed section. Re-scan retries failed bundles.

### Internal streaming transport (0.11.3)

Persistent macOS AU/VST3 helper sessions process mono/stereo float32 blocks of
1–4096 frames at 8–192 kHz. DSP state carries across blocks; parameters update at
block boundaries, and a state snapshot captures the current plugin document.
Bypass returns exact dry samples while continuing the effect's processing state.
Reported plugin latency stays in metadata; this transport does not compensate it.
AU rendering uses Core Audio's input callback and AudioUnitRender with explicit
sample timestamps ([Apple's rendering API](https://developer.apple.com/documentation/audiotoolbox/audiounitrender(_:_:_:_:_:_:))).
VST3 uses a persistent processor with offline ProcessContext and sample position.
Both transports currently begin their processing clock at sample zero.

The helper pipe uses bounded little-endian headers and planar float32 payloads.
The current Tauri-facing API exchanges sample arrays; optimizing that boundary and
AudioWorklet scheduling are subsequent work. Initialisation has a ten-second
response deadline; each block/state reply has a two-second failure deadline.
These are process-failure bounds, not realtime audio latency guarantees. Helpers
also expire after sixty seconds without requests. At most eight owned sessions
may be opening or running; destroyed windows and app exit stop their sessions.
Frontend requests are ordered, with at most four queued/in-flight operations.
Closing discards late responses and faults close the session. Seek/loop resets
will create a fresh processor from saved state so old audio cannot leak through.

The transport is internal and does not add timeline rack controls yet. Continuous
track inserts need worklet buffering, underrun policy, latency compensation across
routing paths, seek/loop resets and equivalent export processing. Existing source
preview/render commands keep their documented two-minute limit. AU v3/commercial
plugin coverage, native plugin windows and other desktop platforms remain future
acceptance work; current tests use Apple AUBandpass and Steinberg ADelay fixtures.

### Worklet bridge (0.11.4)

The internal NativePluginNode processes 1024-frame blocks through the persistent
native stream. PluginBlockBuffer pools its input buffers, transfers them across
MessagePort and schedules output at a fixed 4096-frame delay (85.33 ms at 48 kHz).
Reported plugin latency adds to that delay; the node exposes both values for the
future graph compensation planner. Input and output preserve mono/stereo float
headroom. Parameter/bypass updates take effect at block boundaries.

The worklet never waits for native I/O. Missing output at its exact sample deadline,
invalid/out-of-order replies, clock discontinuities, input corruption, processor
errors and changes to reported plugin latency stop the bridge and mute output.
Late output is discarded; the clock is never shifted and there is no automatic dry
fallback. Disposal/abort closes the native session and ignores outstanding replies.
The node's scheduled origin must remain in the future after plugin initialization.

Actual Chromium/WebKit worklet tests use native Steinberg ADelay and Apple
AUBandpass helper processes through a simulated Tauri IPC binding. An impulse stays
at source frame + transport delay + intentional effect delay; dry stereo samples
1.5/-1.25 remain exact. A deliberately delayed native reply verifies underrun mute
and session cleanup. This validates the isolated bridge, not the complete installed
timeline graph or physical output latency. Tauri still exchanges sample arrays.

The bridge is internal: TimelineEngine keeps its existing playback path. Enabling
track inserts still requires graph-wide compensation, synchronized graph origins,
seek/loop reset, saved rack state, compact track controls and offline-export parity.

### Compensation planning (0.11.5)

planGraphLatency consumes declared integer-frame latencies for clip/track/master
racks and validates the existing routing graph. It aligns clip merges, bus feeds,
pre/post sends, master contributions and both ducking program/detector inputs.
Muted paths retain their declared latency, so live fader changes do not shift the
clock. Unknown identities, invalid frame counts and routing cycles reject the plan.
Intrinsic processing latency is compensated; intentional musical effect delays are
preserved. The planner does not estimate unknown DSP latency from effect settings.

FrameDelay implements exact integer-sample buffering without fractional AudioParam
interpolation. Compensated connections support a selected target input, including
sidechains, and are disposed with their owning graph. NativePluginNode preparation
opens the processor before activation; callers choose a shared future frame only
after all resources are ready. graphClock distinguishes input and audible origins,
holds the playhead at the requested start during pre-roll and supplies an audible
recording anchor/end gate. This clock is not yet installed in TimelineEngine.

Bridge bypass maintains a dry delay line equal to reported native latency while
continuing wet processing, so bypass retains the same path arrival time. The raw
native block transport still exposes its original uncompensated bypass contract.
New instances/reset graphs have fresh delay buffers and native state.

Browser routing tests combine native VST3 and AU bridges with dry bus/master paths.
With both inserts bypassed, opposing contributions cancel exactly; an independent
bus tap verifies the nonzero stereo impulse rather than accepting an empty graph.
Wet VST3 intentional delay is checked separately. Real native DSP uses simulated
Tauri IPC. A simultaneous Chromium/WebKit run exceeded a block deadline in Chromium;
load/performance acceptance remains pending, and missed deadlines still mute/fault.
Production graph integration, automated absolute project/tempo context, seek/loop
reset, rack UI/save/recovery and equivalent exports remain required before activation.

Native stream initialization now renders a short silent block before its ready
response, then resets rendering state (and restores VST3 document/parameters).
This prepares lazy DSP resources without shifting the first audible block. The
bridge sends parameters when changed rather than repeating them on every block.

For this internal sample-array transport, the default native block size is now
4096 with four blocks of fixed buffering (341.33 ms at 48 kHz per insert). This
reduces IPC frequency and provides a larger scheduling budget. Callers can select
128–4096 frames in multiples of 128; each graph plans the chosen delay explicitly.
The conservative default is not a low-latency monitoring mode. Smaller buffers and
installed Tauri performance need separate qualification before production activation.

The compensated null-mix test ends at its declared source duration and suspends
the test clock before cleanup/snapshots. Additional idle/silent-tail timing runs
also exceeded deadlines; long gaps and background playback remain unqualified.
State snapshots wait for queued audio requests to drain, and tests freeze their
audio clock before querying state. Production save/preset handling still needs an
explicit policy for state queries during playback.


### Internal native timeline playback (0.11.6)

`TimelineEngine.playNative` prepares up to eight stereo inserts at the actual
playback sample rate. Clip, track/bus and master chains append after their existing
built-in racks. All sessions prepare before the engine chooses a common future
origin; successive inserts activate at the preceding insert's output arrival.
The graph compensates clip merges, output routes, sends and both ducking inputs.
Clip fades run at clip-rack output time; track fades/gain automation run at track
input time, and pan automation at track output time. Existing effect automation
uses its rack input clock. The public playback clock and recording anchor use the
master's audible origin and hold at the selected start during pre-roll.

The engine captures project, source registry and request settings before awaiting
preparation. Stop/replacement abort pending opens, partial failures release earlier
sessions, and a runtime fault stops the complete graph with its rack scope. A
scheduled silent boundary source disposes the graph at audible range end; stale
callbacks cannot stop a newer graph. Seeking/restarting opens fresh DSP sessions.
Pre-seek DSP history is not reconstructed. Version 0.11.7 supplies native project
time/tempo as described below.

Native stream PCM uses Tauri raw request/response bodies: LE u32 JSON-header length,
UTF-8 metadata, then planar LE float32 samples. The request identifies its owned
session and carries dimensions, parameter changes and bypass. Headers, channels,
frame counts and payload lengths are bounded; non-finite PCM is rejected. Replies
validate format and preserve float32 headroom. Open/state/close still use JSON.
The legacy JSON processing command remains available; the streaming frontend uses
binary processing. The conservative 16384-frame bridge delay remains unchanged.

Browser acceptance uses actual native helpers and an AudioWorklet capture of the
TimelineEngine output, with a separate bus tap to prove signal presence. Foreground
checks in Chromium and WebKit include a fade inside a native clip and a 50000-frame
(1.04-second at 48 kHz) silent gap before an impulse. Native/dry cancellation is
exact; the float32 fade amplitude check allows two millionths absolute error. Playwright
bindings carry encoded binary packets for this test; production Tauri raw IPC is
not simulated at its runtime implementation level. Silent digital capture does
not claim physical latency or installed-app native-insert acceptance. Timing under
background/heavy load remains unqualified. Native racks are still an internal API,
separate from saved EffectConfig: track controls, persistence and native
export parity must be completed before normal UI activation.


### Native project transport and state queries (0.11.7)

Each timeline insert receives an absolute sample position at the playback context's
rate, tempo in quarter-note BPM, time-signature numerator/denominator, musical
origin in project seconds and a playing flag. The first position is the selected
project start rounded to a sample; subsequent block positions add the worklet
block offset. Compensated stages share project positions even though their context
activation times differ. Settings are captured at playback preparation; changing
project tempo/meter/origin requires restarting this internal graph. There is no
tempo-map or native looping flag support yet. Musical position is
`(samplePosition / sampleRate - originSeconds) * tempo / 60`; bar position uses
`numerator * 4 / denominator` quarter notes and floor, allowing negative positions
before the project's musical origin.

Streaming VST3 uses realtime setup/process mode, supplies valid tempo, meter,
quarter-note and bar fields through ProcessContext, and sets its playing bit from
the requested state. Source-window rendering retains its offline mode. AU streaming
provides both AUAudioUnit musical/transport blocks and AUv2 HostCallbackInfo, with
absolute render timestamps and sample position, tempo, meter, next-beat offset,
bar position and initial transport-change notification. Cycling/recording flags
are not asserted. Native replies acknowledge the applied transport; Rust and the
frontend reject mismatches. Frames, tempo, signature and origin are bounded and
validated at their respective IPC boundaries.

A session rejects missing transport after explicit context begins, or a position
other than the next expected sample. Invalid context is checked before DSP and
cannot advance it. Seek/restart uses newly initialized plugin sessions with saved
program state; prior processing audio is discarded. Existing AU and SDK VST3
fixtures verify this at 44.1 and 48 kHz. This does not reconstruct processing
history before a seek or promise that every third-party state blob excludes audio
history. Loop wiring into normal playback remains pending.

Attached native nodes allow state queries only while AudioContext is suspended.
They drain queued audio and recheck suspension before requesting state; resuming
while the queue drains rejects the query. Closing wakes/rejects pending queries.
Prepared, unattached nodes can be queried
without pausing. Saved DSP state reflects processed blocks, which may be ahead of
the audible cursor because of bridge buffering. The low-level stream snapshot API
still supports sequential non-worklet clients; bridge users must use the node's
pause policy. Normal GUI native racks, persistence and matching graph exports are
still pending, along with actual Tauri runtime/background/load qualification.


### Coordinated native export and actual Tauri validation (0.11.8)

`renderNativeToBuffer` prepares native sessions in offline mode using a small seed
OfflineAudioContext, reads the actual rack latencies, then binds the same prepared
sessions to an exactly sized render context at project sample rate. It reuses
TimelineEngine's playback graph, including clip/track/master built-in effects,
native inserts, routing, sends, ducking, envelopes, automation and output limiting.
Native request settings and source/project registries are captured before awaiting
preparation. Requested range endpoints round to samples; results remove shared
lead time and compensated native bridge latency without clamping float32 headroom.

Offline rendering pauses every 4096 frames. The main thread waits for native DSP
and explicit worklet acceptance before resuming; asynchronous processing cannot
run behind an unchecked offline sample clock. Worklet barriers flush earlier fault
messages. A final pause/barrier after the selected output interval prevents an
end-of-render fault from being mistaken for valid output; padding is discarded.
VST3 and AU streams explicitly select realtime/offline mode, and their initial
mode acknowledgement is checked. Rebinding is allowed only before node activation
and at the same sample rate. Mode-dependent native latency is read after offline
initialization. There is no silent bypass on processing failure.

`renderNativeMixRange` renders from project zero to retain DSP history, then crops
the requested interval. Cancellation closes native sessions and disconnects the
render graph, wakes pending waits, resumes any scheduled suspension for cheap
remaining zero rendering and discards that result. OfflineAudioContext cannot
cancel its underlying render allocation/CPU work; caller cancellation remains
prompt and produces no publishable buffer. These APIs are internal and not yet
connected to native rack controls or delivery queue persistence.

`scripts/test-native-timeline-tauri.mjs` builds a separate feature-gated validation
executable and temporary frontend. It uses production engine modules, native
helpers, commands, binary IPC and production CSP in an actual Tauri WebView.
Its own identifier and WebKit data-store UUID isolate storage from the installed
app; the default executable does not register validation commands. Capture output
is silent. On macOS 26.2/Apple Silicon, visible and hidden-window checks pass wet
SDK VST3 delay, native AU bus bypass, exact native/dry cancellation, independent
bus signal/headroom, project transport and an eight-second gap. Offline checks
cover sample count, clip fade, stereo headroom, history-preserving range crop and
cancellation during native block processing, with zero retained owned sessions.

The default validation includes 8 ms of main-thread work per 16 ms interval. This
stress check passes some runs but repeatedly exposes realtime underruns; transport
telemetry can be fast before failure, so ordinary native UI activation remains
blocked on scheduling stability. Do not describe the load case as qualified or
increase buffering merely to hide it. `CRISPAUDIO_NATIVE_VALIDATION_MODES` selects
explicit visible/hidden/load subsets for focused export checks; the default still
runs all three and fails on underrun. Physical output latency, eight simultaneous
inserts, commercial/AUv3 compatibility and seamless looping remain unqualified.

The validation executable now adds backend timing to binary replies only when
compiled with `native-validation`. Queue timing covers packet decoding and dispatch
to the blocking pool; processing timing covers the locked helper pipe round trip,
including native processing and response validation. The fixture measures total
frontend round-trip time and its residual after those backend intervals. That
residual includes frontend stream queueing, IPC, reply decoding and JavaScript
scheduling; it is not a measurement of native DSP time. Per-session identity and
project sample position disambiguate serial inserts. The report retains the last
32 calls, whole-run maxima and worklet input/reply/acceptance traces, including
failures before the paused-state snapshot completes. Ordinary builds add no timing
metadata. The runner always uses this repository's Cargo target directory to avoid
an unrelated inherited shell target.

On 2026-10-14, a focused foreground/modest-load check passed with maximum helper
round-trip time 2.825 ms and maximum complete round-trip time 11 ms. A separate
deliberate 500 ms main-thread stall failed with a bus underrun: the missing input
block reached JavaScript 21,888 frames (456 ms at 48 kHz) after worklet emission,
after its deadline. Completed helper calls stayed below 1.4 ms in that run. This
isolates input delivery as the failure stage for this controlled stall; it does
not explain the earlier foreground output-delivery failure under heavy system
load. Native realtime remains gated. `CRISPAUDIO_NATIVE_VALIDATION_STALL_MS=500`
reproduces the stall; `CRISPAUDIO_NATIVE_VALIDATION_SKIP_EXPORTS=1` selects a focused
playback investigation and explicitly reports export/state-restoration checks as
skipped, never as a full-suite pass.

The full eight-insert run in the same investigation failed in the load case.
Its maximum dispatch, helper-round-trip and residual durations were 20.3, 47.4
and 61.2 ms respectively. The failed AU block had a frontend reply event about
155 ms before its deadline but no worklet acceptance event. Reply events occur
before preparing/transferring the outgoing packet, so that trace alone cannot
attribute the whole gap to worklet delivery. Diagnostics now separately record
`posted` immediately after `postMessage` returns; output-delivery timing starts
there and packet preparation/posting gets its own sample-clock interval. The last
256 trace events are retained. A later focused eight-insert load run passed with
the new timestamp, which does not erase the earlier full-suite failure or qualify
realtime playback.

`CRISPAUDIO_NATIVE_VALIDATION_WORKER_AUDIO_ONLY=1` runs a separate worker isolation
probe, with a 500 ms UI stall by default (`...STALL_MS=0` selects unstalled controls).
It transfers the production worklet port to a module worker, processes real VST3
PCM through direct custom-protocol fetch, and captures the wet stereo impulse
silently. An independent second VST3 session submits 128-frame zero blocks from
the worker every 40 ms. This separates worklet-message delivery from worker-to-Rust
IPC. Bounded traces include a 20 ms worker heartbeat, input emission frames, worker
arrival/reply/post timestamps, actual worklet acceptance frames, and backend
receipt/completion epoch timestamps. Epoch/frame calibration is approximate;
sample-accurate impulse positions and worklet deadlines remain authoritative.
The fixture checks that both sessions close after each run. It has no rack
controls, native timeline state/transport, multi-insert graph or export coverage
and is never imported by the installed app.

On 2026-10-14 the unstalled worker passed at stereo impulse index 192096, retaining
1.5/-1.25 float32 peaks. During a 500 ms UI stall, 22 worker heartbeat ticks ran,
but no worklet inputs arrived and the native rack underrun muted the output. The
independent native call sent 16 ms into the stall reached Rust 504.9 ms after the
stall began and completed native processing in 0.471 ms. Thus this experiment
shows that both transferred worklet messages and custom-protocol fetch dispatch
depend on UI progress in this WebKit/Tauri setup, despite a running worker.
Moving the existing bridge into a worker is insufficient. The next transport
experiment must bypass both delivery paths, retain bounded session ownership,
and prove whole-graph fault handling before normal playback activation.

The runner type-checks its fixtures before building; the wrapper also stops only
its owned process group if validation exceeds its hard deadline. Validation
commands, invoke credentials and diagnostic epoch metadata remain feature-only.

The 2026-10-15 shared-memory/HTTP experiment is selected with
`CRISPAUDIO_NATIVE_VALIDATION_TRANSPORT=shared-http`. It starts a disposable local
HTTP frontend with COOP/COEP headers and a separate, owner-scoped Rust processing
endpoint. The normal installed frontend, CSP, storage origin and playback stay
unchanged. `...TRANSPORT=capabilities` measures shared-memory availability;
`...HTTP_FRONTEND=1` and `...ISOLATED=1` enable the disposable origin/headers for
that probe. In the measured WebKit, `tauri://` exposes no SharedArrayBuffer even
with those headers, while the isolated HTTP fixture supports shared memory in its
window, worker and worklet. Changing production origin would require an explicit
storage/recovery/resource-policy design; this experiment performs no migration.

The worklet uses the existing PluginBlockBuffer with unchanged 4096-frame blocks
and four-block delay. Single-producer/consumer rings have four slots in each
direction, atomic publication counters and a shared fault flag. The worklet never
waits for the worker. Tests cover sample-exact stereo transfer over multiple slot
wraps and complete quantum muting at the original missing-block deadline. The
native endpoint binds only 127.0.0.1 on an ephemeral port, accepts binary processing
only for its owning window's existing sessions, checks the exact frontend origin
and a fresh 256-bit token, caps requests/clients and uses absolute read deadlines.
Shutdown revokes the endpoint and joins its bounded client tasks. Authentication,
origin, size limits, delayed headers and endpoint shutdown are tested. The delayed
header test reproduced inherited nonblocking socket behavior on macOS; explicitly
switching accepted sockets to blocking reads with deadlines fixed the initial
intermittent load errors. Credentials and raw PCM buffers are omitted from diagnostic reports.

After that fix, the unstalled native impulse passed at index 192096 with stereo
peaks 1.5/-1.25. The 500 ms UI-stall case still failed. Shared-ring input arrived
at the worker about 26 ms into the stall, proving that leg advanced without UI
messages, and 25 worker heartbeats ran. But a worker HTTP pulse sent about 20 ms
into the stall reached Rust only after UI recovery; no native replies completed
during the stall. The worklet faulted at its original deadline and muted output.
This is failed realtime acceptance, not a qualified transport. It has no whole-graph
or live transport/state/export qualification, and the installed native rack remains
gated. The new loopback server and shared worklet are validation-only.

This finding is consistent with upstream WebKit's
[worker loader main-thread bridge](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/loader/WorkerThreadableLoader.cpp)
reviewed on 2026-10-15. Its
[worker WebSocket bridge](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/websockets/WorkerThreadableWebSocketChannel.cpp)
also forwards binary sends and receives through a main-thread peer. These sources
describe current upstream code, not proof of the exact installed binary or an
independent WebSocket benchmark. Further socket variants are not the next step:
use the existing offline renderer for an explicitly rendered preview, and evaluate
a native-owned render/audio clock for continuous live native processing.
