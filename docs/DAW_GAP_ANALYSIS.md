# CrispAudio: product boundary and audio workstation gaps

Reviewed 16 October 2026 against local 0.13.26 and current official product pages.
This is a workflow and architecture comparison, not a claim of feature parity or
an independent listening/performance benchmark. Competitor editions differ.

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
Effect-aware segment waveforms are implemented through the bounded 0.13.24
continuous-refresh checkpoint; continue the execution order below.

## What the comparisons tell us

| Reference | Relevant strengths in the official description | Lesson for CrispAudio |
|---|---|---|
| [ocenaudio](https://www.ocenaudio.com/features) | Immediate effect preview, simultaneous selections, adjustable spectrogram, efficient long-file editing and desktop consistency | A list of editor tools is insufficient: audition must stay fluid, selection work must be quick, and large-file limits matter. Our source edits currently prepare a draft rather than continuously updating a running FX graph. |
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
| Source FX audition | Partial | Continuous, cancellable audition while changing parameters; fast original/processed comparison with level control and no mandatory render/apply cycle. |
| Repair and restoration | Partial | Existing DC/normalization/fades and desktop denoise do not cover manual sample repair, click interpolation, de-hum, declipping or editable spectral repair. Add bounded, reviewable repairs with listening tests. |
| Recording and takes | Partial | Built-in mic accepted; punch/loop/multi-arm/comping implemented. Bar-based audible count-in and pre-roll are implemented in 0.13.26 with bounded scheduled lead-in. Useful track templates and real interface/channel checks remain. |
| Live input DSP | Missing for native inserts | Monitor input through inserts while keeping an optional dry take; report latency, use one coherent clock and prove cancellation/device-loss cleanup. Prepared wet backing is not a substitute. |
| Monitor/cue routing | Partial | The Mac output picker currently changes the system output. Add app-local device routing, arbitrary input-channel maps, independent headphone mixes, PFL/AFL and dim/mono. Native playback currently targets 48 kHz stereo; broader channel/rate support needs a defined use case. |
| Native FX and automation | Partial | AU/VST3 generic controls and saved curves exist on Mac. Custom plug-in windows, broader live built-in parameter coverage and stronger event-timing guarantees remain. Some edits restart playback. |
| Freeze/render in place | Missing as a reversible track workflow | Render a track/clip with tails and routing semantics, release its DSP, retain source/rack state and unfreeze safely. Whole-project Preview is different. |
| Assets and sessions | Partial | Add searchable audition of local files/regions, reusable track/FX templates and more useful session navigation/version workflows. No multiple-open-project workflow is established. |
| Recorded-audio timing | Partial | Current global tempo and offline speed/pitch tools do not provide tempo maps, transient/warp markers or grouped timing edits with qualified phase coherence. Composition remains outside scope. |
| Mastering precision | Partial | LUFS/estimated true-peak analysis and a sample-peak limiter exist. A true-peak limiter, dither/noise-shaping choices and systematic resampling/stretch quality qualification remain. |
| Large sessions | Partial, architectural gap | GUI PCM is memory-resident; native snapshots and recording backing have explicit budgets. Long-file streaming, scalable waveform caches and native seek preparation require measured redesign. Streaming/paging is accepted in the scale phase; first measure real sessions and define memory/seek budgets. |
| Cross-platform/native hardware behavior | Partial | Mac is the qualified native-hosting path. Physical iOS, commercial plug-ins, external interfaces and Windows/Linux media/hosting parity need separate acceptance. |
| Cross-app exchange | Basic file exchange present | Define and test a portable stem/timing/marker contract with CometBeat. CrisperWeaver cue JSON imports work; its current standard exporter omits words, so word-preserving export/handoff remains pending. Do not add a second model manager or generation service. |

## Execution order

1. **Release qualification and scope cleanup.** Keep the current CI run alive long
   enough to finish, refresh Apple state, remove TTS creation and retain old audio.
   Update release notes and listing drafts; publish no new parity claims. ASR launch/setup is retired in 0.13.25, retaining existing aligned transcripts
   and word editing. Cue import is verified against the current CrisperWeaver
   export schema; its missing word export remains a separate cross-app task.
2. **Complete-session acceptance.** Exercise audio-only editing, sound-for-video,
   recording/comping, reopen and actual saved-file review on desktop/touch.
   Capture concrete defects and fix those before adding controls.
3. **Recording preparation.** Bar-based audible count-in/pre-roll is implemented
   in 0.13.26. Continue with clear cue/input state and useful track templates;
   keep advanced settings collapsed and qualify real interfaces when available.
4. **Source editing and restoration.** Continuous audition, original/processed
   comparison, channel/polarity utilities and a small manual click-repair workflow.
   Include spectral repair, de-hum and declipping, each with explicit quality targets and original/processed comparison.
5. **Live recording and monitoring.** Native input FX, dry/wet capture choices,
   latency reporting and cue routing; software fixtures first, then real interfaces.
6. **Session efficiency.** Reversible freeze/render in place, asset audition and
   reusable track/FX chains, project versions/tabs and custom plug-in windows; expand
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
