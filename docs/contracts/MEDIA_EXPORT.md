# Media formats and export pipelines — implementation contracts

Binding rules for export backends, native WAV/FLAC/AAC/M4A, CLI mixing, video mix, range export. Read before changing that code.
Moved verbatim from CLAUDE.md on 2026-11-23; version numbers mark when each
contract was introduced. User-facing guides live in the other docs/ files.

## Formats and backend policy 0.7.0

Read docs/MEDIA_FORMATS_AND_LICENSES.md. FLAC export uses the pinned MIT libflacjs
wrapper and BSD libFLAC 1.3.4 in the codec worker; signed 24-bit quantization and
STREAMINFO MD5 are deliberate. Regenerate vendored assets with scripts/vendor-flac.mjs.
Full codec notices are bundled through AboutModal raw imports.
Apple media uses a build-time Swift helper embedded in the Rust crate, extracted
into an owned private temp directory per cancellable job. Apple-only mode must
never silently use FFmpeg. Export backend/format are explicit per edit; WebM VP9
and AV1 still require optional FFmpeg. Strict Apple supports every listed picture transition,
colour/orientation/fades, gaps/tails and supplied mixed audio. Whip/glitch/page peel
use a cached Metal kernel and require dynamic-library GPU support; fail explicitly
on unsupported hardware. Native and FFmpeg complex effects are not pixel-identical.
CLI project audio mixing now uses audio_mix.rs for supported DSP;
see the 0.7.2 section below. Never claim a permissive-only
WebM backend or iOS video implementation exists. GUI mixed audio is range-trimmed;
CLI mix-is-trimmed remains explicit. Preserve atomic no-overwrite publication.

## Native CLI mixing 0.7.2

media/src/audio_mix.rs streams 1024-frame stereo float WAV blocks via Apache-2.0
Hound. Never silently omit enabled DSP: support low/high-pass filters at all
racks; bitcrush/ringmod added in 0.7.3; other effects fail explicitly. Preserve Web Audio pan law, Q in dB,
100 Hz sampled fade ramps, automation, mute/solo and source offsets. Direct
48 kHz PCM WAV decoding works without Apple; other mono/stereo sources use
Apple audio-f32 decoding. AVAssetWriter rejects float WAVE output, so that helper
operation streams AVAssetReader blocks into a WAV header directly. Keep owned
staging folders, finite PCM checks, clip/source bounds and job cancellation.
Round timing to the 48 kHz grid; permit only one rounding sample or at most 1 ms
of short native converter tail padding. CLI output is bounded by standard WAV
limits and 256 audible clips. GUI Web Audio rendering is not disk-paged yet.

## Native GUI video mix 0.7.8

linkedRenderDocument inspects only audible referenced sources, honoring solo's
stored-mute override. Never base64-encode PCM to prepare the native request.
Choose native on Mac only for 48 kHz projects with linked mono/stereo sources;
keep Web Audio for audible in-memory/multichannel sources and other rates.
export_linked_project_video runs jobs::run off the UI thread, calls the native
mixer directly (no compatibility audio fallback), then exports the picture with
its selected backend. Its owned full-clock mix uses mix_is_trimmed=false so a
section is sought once and retains prior effect history. Native failures must
stay visible. mediaJob owns cancellation registration/retry for both paths;
the Web Audio path removes its staged mix even if cancellation arrives after
staging. This avoids a second render/IPC buffer; import/playback are still decoded.

## Direct GUI WAV 0.7.9

useAudioExport accepts direct run jobs as well as Blob-producing requests. Direct
jobs create no Blob/cache entry, retain current-controller guards, and expose
rendering only after the save dialog returns. Cancellation must prevent stale
results/errors from replacing a restarted job. Use mediaJob for native cancels.
render_pcm writes directly in blocks at 8/16/24/32 bits. Match Timeline's JS
integer encoder, not the older mono Rust float-WAV command: clamp float to [-1,1],
quantise in double, and round with floor(x+0.5), including negative ties. WAV8
maps unsigned JS bytes to signed Hound samples by subtracting 128. WAV32 here is
integer PCM; default render()/video intermediates remain float32 and preserve
headroom. CLI --wav-bit-depth explicitly selects native PCM and conflicts with
video/explicit FFmpeg. Count output bytes at the selected depth for RIFF limits.

## Native FLAC 0.7.10

media/src/audio_encode.rs mixes to an owned float WAV, invokes the strict Apple
encode-flac helper and validates final STREAMINFO before atomic hard-link
publication. No codec dependency/FFmpeg fallback is added. Native FLAC is Mac
only, stereo 48 kHz, signed 24-bit; WAV semantics stay unchanged. Quantise with
floor(value*8388608+0.5), clamp [-8388608,8388607], then feed exactly representable
float values to AVAudioFile. This matches flacRuntime, not WAV's 8388607 scale.
Read only remaining frames: an extra read at EOF can throw on some AVAudioFile
layouts. Keep 4096-frame buffers and a function scope that releases the output
before checking STREAMINFO; ARC finalises the header/checksum. Cancel kills the
owned helper process and removes staging. No populated metadata means failure.
linkedAudioExport now handles WAV and FLAC with direct jobs; all other formats
keep the worker. Numeric stable-version comparisons handle 0.7.9 → 0.7.10.

## Native AAC 0.7.11

The shared audio_encode pipeline now handles FLAC and AAC without changing their
DSP/float intermediates. AAC uses AVAudioFile, AAC-LC stereo 48 kHz, ADTS .aac,
selected 96/128/192/256/320 kbps and constant bitrate strategy. Clip samples at
full scale, do not normalise. Validate headers/payloads with bounded buffers,
check cancellation per packet and reject excess packets early. Actual ADTS
packet count *1024, not FFprobe's bitrate estimate, defines decoded duration.
Accept source frames through source+4096 for priming/padding; tested priming is
2112 frames, 44 ms. ADTS has no gapless trim metadata: never call it sample-exact
or use it for the video's already-trimmed PCM mix. GUI forwards bitrateKbps;
CLI --audio-bitrate-kbps requires AAC and conflicts with video/WAV depth.
Other platforms, rates and in-memory sources keep the Glint worker. Rerun the
native FLAC integration after shared pipeline changes. No dependency added.

## Native M4A 0.7.12

render_aac accepts .aac ADTS or real .m4a based on the output suffix. M4A uses
AVAudioFile's system container, then a strict validate-m4a helper reads the final
Core Audio packet table. kAudioFormatMPEG4AAC identifies LC with flags=0 here;
CAF object-type flags are not appropriate for this M4A ASBD. Verify valid frames
against the source and packets*1024 == valid+priming+remainder with checked
arithmetic, positive source, bounded priming/remainder and stereo 48 kHz.
Do not validate gapless duration using bitrate or encoded timestamps. The AAC
save dialog offers both containers; other platform/worker and SFX/Voice paths
remain ADTS. No global format option or codec dependency is added. Re-run both
AAC and FLAC integrations after changes to the shared orchestration/helper.

## Range export 0.8.2

Native transient document.renderRange bounds (not saved project metadata) instruct
audio_mix to process frames from zero through end, writing only frames >= start.
Round both boundaries at 48 kHz, reject empty/invalid ranges before staging, and
size-check output frames. Never seek directly to start: DSP history would change.
FLAC/AAC encoders validate the cropped WAV's frame count. FFmpeg audio fallback
rejects renderRange. CLI --start/--end sets transient audio bounds or picture
In/Out on its document copy. GUI audio action is explicit; video range has a
reviewed reuse action. TimelineEngine.renderMixRange renders 0→rounded end then
crops; this browser path still uses preroll memory. Optional WebKit range harness
checks a delay tail against full-render samples. Never claim packet-based M4A
duration is decoded length; packet padding may remain while decode is exact.
