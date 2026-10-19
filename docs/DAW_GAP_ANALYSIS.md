# CrispAudio: product boundary and audio workstation gaps

Reviewed 16 October 2026 against local 0.13.26 and current official product pages.
This is a workflow and architecture comparison, not a claim of feature parity or
an independent listening/performance benchmark. Competitor editions differ.

Source progress **0.13.67** adds bounded ordered replay for verified mixed source
histories: saved external effects plus basic audio/channel tools, explicit effect
selection, per-operation windows and one owned replacement/Undo. Initial limits are
eight operations, a 30-second first window and 44.1/48-kHz mono/stereo within the PCM
budget. Legacy/retimed and chain/restoration histories stay gated. Next: qualified
legacy migration, ordinary source-preview owned staging and deliberate admission
expansions; the remaining workstation/platform phases stay open.

Source progress **0.13.66** captures complete window coordinates for new source
operation histories and validates retained PCM on save/reopen/recovery. Later trims
preserve earlier full windows. This is mixed-replay groundwork; processor replay,
selection and qualification remain open, and insufficient legacy histories stay
gated. [Contract](SOURCE_EDIT_JOURNALS.md), [current handoff](WORK_HANDOFF.md).

Source progress **0.13.65** adds editable masks for the saved single-effect slice:
exact/disjoint sample ranges, all/individual channels and saved/clip/full-window
presets. Full-window original rendering, outside dry PCM, one Undo/Redo and portable
reopen remain the contract. Mixed replay still needs explicit operation-window
provenance; Native recall/admission and the rest of the workstation roadmap remain
open. See the current handoff for scoped acceptance criteria.

Source progress **0.13.64**: one saved external-effect recipe can now be revised
from its retained original, using full-window history and one undoable replacement,
including trimmed/split clips and portable reopen. This is a bounded Rendered slice;
mixed journals and retimed cases remain gated. It does not complete arbitrary
recipe replay, Native admission, long-session memory or physical qualification.
See the current handoff for the next implementation slices.

Source progress **0.13.63**: native source FX now refresh a bounded, labelled
source-rate waveform snapshot while playback continues. This closes automatic
external-FX visualization within the admitted snapshot budget, not original-based
recipe recall, arbitrary source formats, long-session memory or physical native
acceptance. Current next work is scoped in [WORK_HANDOFF.md](WORK_HANDOFF.md).

## Product boundary

| Product | Owns | Exchange with CrispAudio |
|---|---|---|
| CrispAudio | Recording, detailed waveform editing, restoration, comping, mixing, audio mastering/delivery and sound for video | Audio, stems, projects, timed transcripts/captions |
| CometBeat | Composition, beats, instruments, pattern/song sequencing and music generation | Rendered tracks/stems; future shared timing/marker metadata |
| CrisperWeaver | ASR/TTS generation, speech models, voices and transcription services | Generated audio; timed JSON, SRT/VTT and corrections |

TTS creation is removed from CrispAudio in 0.13.22, including its server settings,
iOS synthesis commands and menus. Existing generated audio is ordinary source
media and remains editable. Transcript import, correction, captions and word-based
editing stay in CrispAudio. ASR launch/setup and app commands are removed in
0.13.25; guarded transcript import replaces them. The independent CLI retains
its existing external-helper command for compatibility, with no new generation
roadmap. Existing MIDI utilities remain,
but instrument tracks, beat sequencing and a second composition environment are
outside the active plan. SFX creation and Voice processing remain existing audio
and sound-design tools; no new synthesizer/composition roadmap is implied.

## Accepted scope

The user accepted **all audio-workstation gaps below** on 16 October, including
the larger engine, restoration, timing, session and scale work. They are authorized
work, not completed features or a delivery-date promise. Composition and ASR/TTS
creation remain with CometBeat and CrisperWeaver. Physical device/platform checks require the actual hardware.
The remaining sequence was reaffirmed on 19 October; use
[AUDIO_WORKSTATION_ROADMAP.md](AUDIO_WORKSTATION_ROADMAP.md) for ordered acceptance.
Effect-aware segment waveforms are implemented through the bounded 0.13.24
continuous-refresh checkpoint; continue the execution order below.

Source checkpoint **0.13.62** admits mono/stereo 44.1-kHz source audition on the
48-kHz native clock, with explicit mode/help semantics. Fresh rendering and Apply
retain source rate/shape; processing at different rates can sound different.
Other rates/ranges/channels, native waveform snapshots and original-based recipe
recall remain separate work.
[Current handoff](WORK_HANDOFF.md#441-khz-source-audition--01362-checkpoint).

Source checkpoint **0.13.61** adds one contiguous native source selection with
clip-history preroll, a selection-relative cursor and partial Apply preserving
outside samples/original offsets. Full real-Wry/device acceptance, other formats,
multiple ranges, individual channels, native waveform snapshots and original-based
recipe recall remain open.
[Current handoff](WORK_HANDOFF.md#contiguous-source-selection--01361-checkpoint).

Source checkpoint **0.13.60** adds whole mono 48-kHz native source audition to the
existing stereo candidate, with unity stereo monitoring and mono render/Apply.
Broader ranges/rates, bounded native waveforms and original-based recipe recall
remain next. [Current handoff](WORK_HANDOFF.md#whole-mono-source-audition--01360-checkpoint).

Source checkpoint **0.13.59** combines actual Tauri command dispatch with the
production native worker/DSP through MockRuntime and a guarded null consumer.
Actual recording-command exclusion, live parameters, real Apple limiter bypass/
helper loss and cleanup pass. Full real-Wry playback and physical acceptance remain
open; continue independent source-editor formats/ranges, waveforms and recipe recall.
[Current handoff](WORK_HANDOFF.md#native-command-and-dsp-qualification--01359-checkpoint).

Source checkpoint **0.13.58** qualifies actual Wry/WebKit snapshot upload and
window/exit cleanup with generated PCM and isolated test assets. It does not run
native audio workers or plug-ins; combined command/native DSP, full product
registration and physical acceptance remain open.
[Current handoff](WORK_HANDOFF.md#real-runtime-snapshot-qualification--01358-checkpoint).

Source checkpoint **0.13.56** adds actual Tauri command-dispatch tests with mock
windows and synthetic output workers, covering decoding, ownership and cleanup.
Real Wry/WebKit, native events, shipped capabilities and combined device/DSP
acceptance remain open. [Current handoff](WORK_HANDOFF.md#tauri-native-command-ipc--01356-checkpoint).

Source checkpoint **0.13.55** closes the native window/exit admission gap and
adds production owner-registry tests with synthetic workers and generated PCM.
Actual Tauri IPC/window event delivery, WebKit and physical acceptance remain
open. [Current handoff](WORK_HANDOFF.md#native-teardown-admission--01355-checkpoint).

Source checkpoint **0.13.54** exposes compact opt-in native source controls on
Mac, sharing Play/Stop with Rendered (the default). Initial admission is whole
unretimed stereo 48 kHz clips, 2048 frames–120 seconds. Parameters, warm bypass and
monitor gain update one graph; private sample-peak protection never enters Apply.
Prepared edits keep fresh first-pass state, originals and one Undo. The actual
React controls are qualified through a hardware-free Rust bridge with real AU/VST3
DSP; Tauri/window ownership, WebKit and physical device/load acceptance remain.
Waveform/analysis remain snapshots. Broader source formats/ranges, recipe recall,
live native waveform snapshots and scale/restoration work remain open.
See the [current handoff](WORK_HANDOFF.md#shared-native-source-controls--01354-checkpoint).

## What the comparisons tell us

| Reference | Relevant strengths in the official description | Lesson for CrispAudio |
|---|---|---|
| [ocenaudio](https://www.ocenaudio.com/features) | Immediate effect preview, simultaneous selections, adjustable spectrogram, efficient long-file editing and desktop consistency | A list of editor tools is insufficient: audition must stay fluid, selection work must be quick, and large-file limits matter. 0.13.28 keeps buffered source comparison/cleanup previews playing, but does not replace offline preparation with a running FX graph. |
| [Ardour](https://ardour.org/features.html) | Cue monitoring, playlists/takes, routing matrix, VCA/foldback, monitor controls and export analysis | Recording, routing and monitoring form one continuous workflow. Our prepared wet accompaniment does not process live microphone input through native inserts. |
| [LMMS](https://lmms.github.io/lmms/) | Piano roll, beat sequencer, song editor and mixer | Composition belongs in CometBeat. Reuse workflow ideas for finding assets and arranging rendered audio; do not recreate its instruments/sequencer. |
| [openDAW](https://opendaw.org/) and [architecture](https://github.com/andremichelle/openDAW/blob/main/introduction.md) | Browser music production, audio/MIDI input and modular editor/engine packages | Browser delivery can support a coherent creation workflow. Learn from its separation of editor, engine and assets; its composition tools are a CometBeat comparison. |
| [Waveform Free](https://www.tracktion.com/products/waveform-free), [Pro comparison](https://www.tracktion.com/products/waveform-pro-buy) | Recording, tagged asset browser and rack processing; the product comparison also lists comping, bounce-in-place and track freeze | Prioritize asset audition, useful templates and reversible render/freeze. Do not assume every Pro/expansion feature is included in Free. |
| [MusE](https://github.com/muse-sequencer/muse/wiki/Documentation) | Explicit input, output, wave, group and aux tracks, routing and audio automation | Make the physical input-to-monitor/output path clear and controllable. Its MIDI/instrument environment belongs to CometBeat. “MusE” here means the Linux audio/MIDI sequencer. |
| [REAPER](https://www.reaper.fm/about.php) | Input FX/monitor mixes, multichannel routing, extensive automation, project tabs and region rendering | Use a mature audio-production workflow as the benchmark for recording, session management and delivery; avoid equating our current subset with this depth. |
| [Cubase recording](https://www.steinberg.net/cubase/learn/recording-vocals/) | Pre/post-roll, comping, alignment and independent cue/monitor paths | Count-in is a useful small step; recording preparation, take review and monitoring are the larger workflow. |

## Gap inventory

“Present” describes implemented software, not universal hardware acceptance.
“Partial” means a narrower workflow or a material architectural limitation exists.

| Capability | State | Important remaining work |
|---|---|---|
| Basic arrangement, trims, fades, ripple, groups, source selections and analysis | Present | Measure completion time and friction in complete editing jobs; improve inline/context actions from findings. |
| Effect-aware timeline waveforms | Partial in 0.13.24 | Built-in segment DSP refreshes during continuous edits for visible clips up to 60 s / 32 MiB. Native inserts, longer clips and track/bus/master processing still show source or remain excluded. Extend with scalable caches and safe native-render ownership; modulation follows a clip-range render, not the running graph phase. |
| Source FX audition | Partial in 0.13.54 | Position-preserving Original/Preview, cleanup replacement/reset, loop changes and source cursor are implemented. Active normalization follows its target. Native source Apply still needs a fresh helper render. Separate audition level and hot-float sample-peak headroom are present in 0.13.30. 0.13.42 adds optional cancellable monitor-only matching for measurable mono/stereo selections of 0.4–120 seconds, with per-voice gains and shared sample-peak headroom. 0.13.45 adds persistent built-in high/low-pass and output controls with smooth bypass; Prepare creates a waveform preview and reversible edit. 0.13.46 adds debounced, versioned waveform snapshots with serialized 64 MiB admission and source fallback; playback is independent. 0.13.47 adds ordered six-stage high/low-pass, level and clipper chains with per-stage bypass and versioned printed-source recipes; topology edits stop audition. 0.13.48 adds a hidden native-clock source adapter. 0.13.49 resolves its measured AU offline parity blocker with complete source-window reads, end drain and unity mono routing (52 generated AU cases exact); 0.13.50 qualifies the production real-time worker/DSP with a synthetic null consumer (15 native tests) and restricts audition to 48 kHz. 0.13.54 adds shared opt-in native Play/Stop for whole stereo 48 kHz clips with live controls, monitor-only protection and joined owners; the actual UI uses the null bridge for qualification. Rendered remains default. Actual Tauri/device/WebKit/load acceptance, broader stages, seamless topology, recipe recall, multichannel/short-selection matching and larger-file/resident-memory qualification remain. |
| Repair and restoration | Partial in 0.13.30 | Manual click repair, mains/harmonic de-hum, selected-band spectral attenuation and conservative hard-clip reconstruction use cancellable previews/A-B/Apply with retained originals and unchanged boundaries. Spectral healing/inpainting, general click detection, drift tracking and real-recording/listening qualification remain. Version 0.13.31 adds nonstationary synthetic material checks and logarithmic band selection. Declipping gains are modest on noisy/transient fixtures; these measurements do not establish perceptual recovery. |
| Recording and takes | Partial | Built-in mic accepted; punch/loop/multi-arm/comping implemented. Bar-based audible count-in and pre-roll are implemented in 0.13.26 with bounded scheduled lead-in. Local track/input/FX templates are implemented in 0.13.27; real interface/channel checks remain. |
| Live input DSP | Partial in 0.13.32 | Buffered native cue inserts preserve dry capture and display added delay; 0.13.33 shares a single 4096-sample transport buffer across up to two inserts; faults mute the cue independently. Low-latency native ingress, wet/dry capture, broader plug-in/rate/load/device-loss qualification remain. One/two AU and SDK VST3 cue chains have bounded eight-second Mac checks. Prepared wet backing remains separate. |
| Monitor/cue routing | Partial in 0.13.32 | Per-input cue level/pan/mono and buffered native track inserts preserve dry takes. Added delay is shown; this shares the playback output and does not provide a separate headphone/backing mix. The Mac output picker currently changes the system output. Add app-local device routing, arbitrary input-channel maps, independent headphone mixes, PFL/AFL and dim/mono. Native playback currently targets 48 kHz stereo; broader channel/rate support needs a defined use case. |
| Native FX and automation | Partial | AU/VST3 generic controls and saved curves exist on Mac. Custom plug-in windows, broader live built-in parameter coverage and stronger event-timing guarantees remain. Some edits restart playback. |
| Freeze/render in place | Partial since 0.13.43 | Bounded reversible pre-fader track freeze/thaw retains originals/racks, supports tails and preserves downstream routing. Remaining: streaming, linked/grouped/ducked/bus workflows, frozen-package remapping and physical/arbitrary plug-in qualification. See [TRACK_FREEZE.md](TRACK_FREEZE.md). |
| Assets and sessions | Partial | Local track/input/FX templates exist in 0.13.27. Add searchable audition of local files/regions, portable/session templates and more useful session navigation/version workflows. No multiple-open-project workflow is established. |
| Recorded-audio timing | Partial | Current global tempo and offline speed/pitch tools do not provide tempo maps, transient/warp markers or grouped timing edits with qualified phase coherence. Composition remains outside scope. |
| Mastering precision | Partial | LUFS/estimated true-peak analysis and a sample-peak limiter exist. A true-peak limiter, dither/noise-shaping choices and systematic resampling/stretch quality qualification remain. |
| Large sessions | Partial, architectural gap | GUI PCM is memory-resident; native snapshots and recording backing have explicit budgets. Long-file streaming, scalable waveform caches and native seek preparation require measured redesign. Streaming/paging is accepted in the scale phase; first measure real sessions and define memory/seek budgets. |
| Cross-platform/native hardware behavior | Partial | Mac is the qualified native-hosting path. Physical iOS, commercial plug-ins, external interfaces and Windows/Linux media/hosting parity need separate acceptance. |
| Cross-app exchange | Basic file exchange present | Define and test a portable stem/timing/marker contract with CometBeat. CrisperWeaver cue JSON imports work; its current standard exporter omits words, so word-preserving export/handoff remains pending. Do not add a second model manager or generation service. |

## Execution order

For the 17 October implementation checkpoint, concrete dependencies and acceptance
criteria, use [WORK_HANDOFF.md](WORK_HANDOFF.md). Native queues, files, session/group
ownership, cue scheduling, Mac output and a portable mixer are implemented as
internal foundations; hardware/app wiring and synchronized project placement remain
open. The comparison below retains its earlier feature-level execution order.

1. **Release qualification and scope cleanup.** Keep the current CI run alive long
   enough to finish, refresh Apple state, remove TTS creation and retain old audio.
   Update release notes and listing drafts; publish no new parity claims. ASR launch/setup is retired in 0.13.25, retaining existing aligned transcripts
   and word editing. Cue import is verified against the current CrisperWeaver
   export schema; its missing word export remains a separate cross-app task.
2. **Complete-session acceptance.** Exercise audio-only editing, sound-for-video,
   recording/comping, reopen and actual saved-file review on desktop/touch.
   Capture concrete defects and fix those before adding controls.
3. **Recording preparation.** Bar-based audible count-in/pre-roll is implemented
   in 0.13.26; local track/input/FX templates follow in 0.13.27. Continue cue/input state;
   keep advanced settings collapsed and qualify real interfaces when available.
4. **Source editing and restoration.** Buffered continuous original/processed
   comparison exists in 0.13.28; channel/polarity and bounded manual click repair
   follow in 0.13.29. Continue full live FX/level matching.
   Scoped spectral attenuation, de-hum and short hard-clip reconstruction follow in 0.13.30. Monitor-only source loudness matching follows in 0.13.42. Continue varied-material listening, spectral editing/healing and live source FX with explicit targets and original/processed comparison.
5. **Live recording and monitoring.** Buffered native input monitoring arrives in 0.13.32. Continue low-latency native input DSP, dry/wet capture choices,
   latency reporting and cue routing; software fixtures first, then real interfaces.
6. **Session efficiency.** Reversible freeze/render in place, asset audition and
   portable/session templates (local track/FX chains exist), project versions/tabs and custom plug-in windows; expand
   automation and recorded-audio tempo/warp/grouped timing with phase-coherence tests.
7. **Finishing quality and scale.** True-peak/dither/resampling qualification,
   long-session measurements and the resulting memory/streaming work. Hardware
   acceptance can proceed whenever devices are available.

The previously accepted release → real workflows → count-in → physical devices →
plug-in usability order remains the immediate sequence. Steps 4–7 above describe
the accepted larger audio-workstation backlog around that sequence. Count-in alone
is not the next major product milestone. Native input DSP and paging/streaming are
authorized, substantial projects with their own acceptance criteria. Keep each
checkpoint reviewable and preserve earlier work. Composition and ASR/TTS model UI
remain excluded. Public release/upload remains gated by validation and the release task.

## Reversible track freeze update — 0.13.43

Bounded pre-fader audio-track freeze/thaw now retains original clips/racks and
routing, with a manual tail, live mixer values and Undo/reopen support. This closes
the independent audio-track foundation, not clip/bus/sidechain freeze or streaming.
See [supported cases and remaining limits](TRACK_FREEZE.md). Native physical and
sustained-load qualification remains separate.

The 0.13.44 follow-up qualifies single saved-state AU/VST3 track inserts through
the production offline graph and a test helper bridge, including nonzero plug-in
latency and linked/portable thaw. Frozen Mix A/B live values are now restorable.
This does not qualify arbitrary native chains, physical outputs or native WebKit.
See [the checked native fixtures](evidence/native-track-freeze.json).
