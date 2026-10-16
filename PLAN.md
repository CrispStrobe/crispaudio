# CrispAudio — Active roadmap

Updated 2026-10-16, for local 0.13.21. This section is the current plan.
The implementation records below are historical; their old missing-feature lists
and test counts do not describe the current application.

Local 0.13.20 adds a native-clocked monitor metronome to Mac Live playback.
The existing musical controls enable clicks and change their level without a DSP
restart. Absolute project-frame scheduling follows seeks, fractional beat periods
and loop boundaries. Clicks stay outside effects, exports and mix meters. Native
Preview and prepared recording backing gain monitor clicks in 0.13.21. Continuous native input
DSP, custom plug-in windows, MIDI and disk paging remain separate work.

Local 0.13.21 completes monitor clicks for rendered Preview and recording.
Preview follows the actual source-loop clock. Recording owns the click on its
capture-pass anchor, including after backing audio ends; punch boundaries,
regular-loop restarts and prepared-backing loops retain their own clocks. Stop,
cancellation and unmount clean up clicks. Native Live keeps its existing native
clicks; no second Web Audio metronome runs alongside them. Clicks are not routed
into exports or recorded input. Software PCM/synthetic-capture checks pass;
physical input/output acceptance is unchanged.

## Completed local software work: interaction and recording

The user accepted this order after 0.12.1:

1. Check CI: preceding main and iOS runs passed. New checkpoint runs are tracked separately.
2. Refine numeric controls: useful touch scales, explicit units/bounds, cancellation,
   one Undo per gesture and live feedback for mixer values.
3. Consolidate recording, track, clip and FX inspectors: compact rows and dropdowns,
   explanations behind info buttons, advanced sections collapsed, timeline visible.
4. Exercise complete sample-session workflows on desktop/touch: import/drop,
   selection/trim/fade/mix, generated recording, save/reopen, undo and delivery.
5. Support microphone recording alongside native-effects playback with a measured
   clock relationship, safe cancellation and no dry playback substitution.
6. Prepare distribution: profile/signing checks and signed/sandboxed hosting.
   Native Mac profile setup can use the existing VPS API credentials. Physical
   external-device/plugin acceptance requires the relevant hardware and plugins.


Implemented in 0.13.0: accelerated touch scrubbing with precise keyboard steps,
live editable mixer values with one Undo, one-track modeless settings and collapsed
recording options. Native-rack recording uses a prepared wet backing on the capture
clock; microphone takes and monitoring remain dry. Actual AU/VST3 and local hardened
sandbox probes pass with bundled helpers. Sample editing, comping, save/reopen and
exports pass desktop/touch browser checks. See [checkpoint evidence](docs/evidence/interaction-recording-0.13.0.json).

Distribution follow-up: the hardened sandbox test also passes a VST3 fixture in
Downloads through the existing static entitlement. Final signature/profile identity
and certificate checks, profile-derived Store entitlements and 21 release gate
regressions are implemented; real Mac signature checks run in CI.

TestFlight submission is complete for **iOS and native macOS 0.13.0/build 14**:
Apple processing is valid, internal testing is enabled, and both external Beta
App Review submissions are waiting for review. Both existing groups contain the
correct platform build. A Mac profile was created using the existing account
and canonical certificate. [Submission evidence](docs/evidence/testflight-0.13.0-build14.json).

Local 0.13.1 adds persistent macOS bookmarks for selected plug-in folders and
passes fresh folder access to native scan/render/stream helpers. A real NSOpenPanel
selection outside Downloads and a separate relaunch both pass the isolated hardened
sandbox probe, including external VST3 streaming and Swift helper input reads.
[Folder-access evidence](docs/evidence/macos-folder-bookmarks.json).

Local 0.13.2 extends persistence to selected media/project files and writable
media/output folders, including helper access and native-export staging. File →
Media Folder Access… supports grouped source folders. Dropped/Finder-opened projects
resolve relative media and accept saved format 4. Real sandbox tests pass file reads,
read-only source boundaries, writable project reopening and native AAC output across
five launches; unselected neighboring input remains inaccessible.
[Resource-access evidence](docs/evidence/macos-resource-bookmarks.json).

Local 0.13.3 stages Mac exports privately on the destination volume, avoiding
the extra folder picker for ordinary single-file exports. Other volumes retain
sibling staging and explicit folder access; final publication remains atomic and
exclusive. Project sidecar assets and delivery-folder selections remain explicit.
[Export staging checks](docs/evidence/native-export-staging.json).

Local 0.13.4 restores moved media paths from selected-resource bookmark identities
on Mac relaunch. Project loading, autosave recovery and saved-delivery decoding
apply unambiguous missing-path replacements, retaining manual relinking for
unavailable sources. Existing paths are never substituted.
[Moved-media checks](docs/evidence/macos-moved-media.json).

Next: collect beta feedback, check physical iOS devices and Finder gestures,
commercial plugins and external interfaces.
Local 0.13.6 enables track level/pan and built-in track wet/dry automation passes
during Mac Live playback,
with session-only audition, Touch/Latch/Write, review and one Undo. Preview and
microphone capture remain guarded. Native control updates no longer lose the
last queued value. The Windows recovery-test fixture now uses portable paths.
[Native mix automation checks](docs/evidence/native-mix-automation.json).

Wet/dry passes preserve the six supported effects’ DSP history and restore static
mix or the original Read envelope.
[Native effect mix checks](docs/evidence/native-effect-mix-automation.json).

Local 0.13.7 adds delay feedback and chorus depth passes without resetting running
effect history. [Parameter pass checks](docs/evidence/native-feedback-depth-automation.json).
Local 0.13.8 adds delay time, chorus rate and ring frequency passes. Track delays
reserve history before playback within the existing budget; native oscillators
retain phase across edits, Read restoration and loops.
[Delay and oscillator checks](docs/evidence/native-time-phase-automation.json).
Local 0.13.9 also updates these track effect knobs live, including Undo/Redo,
without resetting processors. Base values follow constructor clamping and remain
subordinate to saved curves. Other built-in settings and rack edits still restart.
[Live knob checks](docs/evidence/native-static-track-effects.json).
Local 0.13.11 makes same-type built-in effect reorders structural in Mac Live
playback, including Undo, Redo and paused resume. Stable optional processor IDs
survive ordinary edits and saved projects; reordering upgrades legacy racks and
pasting creates fresh processors. Knob changes still retain running DSP history.
[Effect identity checks](docs/evidence/native-effect-identity.json).

Local 0.13.10 extends live controls and reviewed passes to master and clip effects,
with scope validation, shared delay-history budgeting and native-fault guards.
[Scoped native checks](docs/evidence/native-scoped-effects.json).
Local 0.13.12 adds native AU/VST3 parameter Touch/Latch/Write passes at every
rack scope, with review, one Undo, independent Read restoration and saved curves
in Live, Preview and GUI exports. Curves use stable scope/instance/address IDs,
normalized values and explicit parameter ranges. Processing is block based.
[Native parameter checks](docs/evidence/native-parameter-passes.json).
Local 0.13.13 integrates native parameter curves with clip moves/nudges/paste,
speed changes and scoped range edits, including comp backups and locked empty
tracks. Splits, trims and slips retain the original timeline clock. Existing mix
snapshots retain curves and reject stale arrangement geometry.
[Native timeline-edit checks](docs/evidence/native-automation-edits.json).
Local 0.13.14 adds a compact native parameter curve editor: graph point editing,
actual-unit numeric fields, Linear/Step, keyboard/touch/pen, bounded dense overview
and one Apply/Undo. Record pass is collapsed; local edits protect locks, stale
projects, capture, metadata ranges and saved state.
[Native curve editor checks](docs/evidence/native-parameter-curve-editor.json).
Local 0.13.15 reuses that editor for built-in clip/master effects with readable
%, ms and Hz, preserves untouched stored precision, and makes built-in clip
curves follow moves, nudges, slides and paste. Speed scaling preserves valid
Linear/Step values at project zero.
[Built-in curve checks](docs/evidence/builtin-parameter-curve-editor.json).
Local 0.13.16 adds compact inspector range selection/copy/paste, numeric bounds,
mouse/touch dragging, playhead paste and time stretching. Built-in clip/master
inspectors share track-lane clipboards; native compatibility includes plug-in,
address and parameter range. Local drafts, boundary guards and one Apply/Undo
remain in place.
[Curve range checks](docs/evidence/curve-range-tools.json).
Local 0.13.17 consolidates track-lane paste review into two fields and a live
before/after curve comparison. Detailed interval/boundary information moves to
an info button. Typing/touch scrubbing remain visual drafts until one Paste/Undo;
carrier-frequency copy/paste labels are corrected in EN/DE.
[Paste review checks](docs/evidence/automation-paste-review.json).
Local 0.13.18 adds inspector segment shaping for built-in clip/master and native
clip/track/master curves. Presets and custom Bézier controls reuse the track-shape
math with raw/normalized bounds. Local review, cancellation, intact-shape reopen,
endpoint preservation and one Apply/Undo remain in place.
[Scoped shape checks](docs/evidence/scoped-curve-shapes.json).
Local 0.13.19 consolidates the remaining track gain/pan/effect shape review into
the same compact controls, with explicit pan minimum, raw effect units and a
single direct Apply/Undo. Detailed guidance and unit context stay behind Info;
snapshot/locks/capture/no-op guards remain intact.
[Track shape checks](docs/evidence/compact-track-shapes.json).
Continuous native input DSP remains future work.
Public App Store review is a separate release decision; iOS 0.3.0 stays published.

Audio troubleshooting interrupted the start: distortion persisted after quitting
CrispAudio. A reversible built-in-speaker format change from 96 to 48 kHz helped;
quitting Firefox and Amazon Music cleared the reported residual crackling. Their
individual roles and the initial cause are unproven. The app is reopened idle,
48 kHz is retained, and the user explicitly requested coding continue. Avoid extra
speaker/microphone checks unless requested. MIDI/codecs/paging remain deferred.

## Completed checkpoint: native playback and delivery

The user authorized these six steps in order on 2026-10-15:

1. Repair CI: the legacy sparse-track validation fix passed general and iOS CI.
2. Continuous native playback: Play/Stop/Pause, history-preserving seek, loops,
   per-insert project/tempo context and a separate monotonic DSP clock.
3. Live mixing: fader/pan/mute/solo/send controls, native parameters and bypass,
   track/master meters, loudness, device rebind and visible fault recovery.
4. Native-rack delivery: direct and queued wet WAV/FLAC/AAC exports with
   cancellation and saved-job source/settings ownership.
5. Qualification: exact loop/seek captures, UI stalls, 44.1 kHz sources,
   eight AU/VST3 instances for a minute including background playback,
   injected helper/underrun faults, recovery and German transport controls.
6. Consolidate the local app, notices, native sample session and documentation;
   diagnose Mac Store signing and prepare a checked dry-run workflow.

Local 0.12.0 implements this native transport on macOS, with an explicit rendered
Preview fallback. Native processing stays at 48 kHz; sources are frozen and
converted when required. Structural edits and unsupported built-in settings restart playback.
Native microphone/automation-pass recording, monitor clicks, custom plugin windows, commercial-plugin and
external-interface acceptance remain outside this checkpoint. Mac Store submission
still needs its native Mac profile setup and signed/sandboxed hosting acceptance;
no upload or release tag is authorized by the local checkpoint.

See [native playback](docs/NATIVE_PLAYBACK.md) and
[distribution status](docs/RELEASE_STATUS.md). The following implementation
records describe earlier increments; their then-pending native transport work is
superseded by this section.

## Accepted ocenaudio comparison stack (2026-10-13)

The user authorized all six steps in the recommended order after local 0.10.12:

1. Complete import/edit/FX/mix/save-reopen/export workflow and compact GUI consolidation.
2. Focused source waveform editor: precise ranges, channel selection, loop audition, sample detail and zero-crossing snapping.
3. Multiple separate ranges and cleanup: audition, silence trim, normalization and protective fades, retaining originals and undo.
4. Timeline-linked analysis: spectrum/spectrogram and selected-range peak/RMS/loudness/clipping statistics in optional panels.
5. Finishing: region exports, naming, metadata, restartable queue and pre-master summing stems.
6. Desktop external audio effect hosting: scanning, bypass, saved state and latency compensation. Audio effects do not require MIDI expansion.

Local 0.11.0 implements the first scope of all six steps: edited sample workflow,
clip FX audition, source-window editing, separate sample ranges/channel processing,
cleanup preview/commit with retained originals, optional spectral/statistical analysis,
named-region delivery, WAV metadata/naming, recovered export snapshots and summing
stems. The initial desktop plugin host supports Audio Unit and VST3 source effects
with generic controls, state, bypass and reported-latency compensation on macOS.
It renders visible source windows up to two minutes and refreshes audition after
parameter edits. Continuous timeline inserts, custom plugin windows, wider plugin
compatibility and Windows/Linux hosting are subsequent extensions, not implemented
by this source-processing host. Native third-party commercial plugins and physical
iPad/interface acceptance remain separate hardware/software acceptance checks.
Local 0.11.1 isolates each VST3 discovery operation with a ten-second deadline,
retains healthy results after scan failures and exposes collapsed failure details.
Local 0.11.2 stores export audio snapshots once, restores queue metadata without
media decoding, supports saved-job media relinking and cleans completed history
without deleting output files. Continuous native inserts remain a larger engine
extension: the current Web Audio playback path needs a streaming DSP bridge.
Local 0.11.3 adds the internal persistent native block transport and bounded frontend
session API. Real AU/VST3 tests compare variable-sized streaming blocks against
whole-file renders and exercise state, bypass, cancellation and hung-child cleanup.
Timeline inserts are still pending AudioWorklet scheduling, graph-wide latency
compensation, seek/loop integration, compact track controls and export parity.
Local 0.11.4 adds and validates the native AudioWorklet bridge with fixed sample
clock, pooled transfers and hard underrun/fault handling. Native VST3 timing and AU
bypass headroom pass through actual Chromium/WebKit worklets. It remains internal
until graph-wide compensation, timeline transport, track UI and export are ready.
Local 0.11.5 adds graph latency planning, integer-frame compensation and two-phase
native preparation/activation. Bypass retains declared plugin latency. Compensated
native/dry bus graphs are tested separately from production TimelineEngine; engine
integration, transport context, track controls and equivalent exports remain next.
Local 0.11.6 connects the planner to an internal TimelineEngine native playback
entry point: scope clocks, compensated clip/bus/send/sidechain paths, audible capture
anchor, cancellable loading and range-end disposal. Streaming IPC now carries binary
float32 packets. The ordinary UI playback command still uses the existing path;
native rack controls/persistence and export remain pending.
Local 0.11.7 supplies per-block project position, tempo, meter and musical origin
to VST3 realtime context and AU host callbacks. State queries require paused audio;
seeks/restarts use new sessions and discontinuous block positions are rejected.
Background/load qualification, equivalent native exports and compact rack UI with
persistence remain pending before ordinary playback activation.
Local 0.11.8 adds internal native whole-graph and history-preserving range exports,
with coordinated offline pauses, accepted-output barriers and cancellation cleanup.
An isolated actual Tauri executable validates wet DSP through production raw IPC
and the same timeline engine, including eight-second silent gaps in visible/hidden
windows. UI-load stress is intermittently failing with underruns and remains a
blocker for normal native rack activation. Wider graph/export qualification,
compact controls, persisted state/recovery and ordinary transport/loop wiring are
still pending. The new export API is not yet connected to delivery queue controls.
Local 0.11.9 persists clip/track/master native racks, program state and parameters
in version-4 projects and migrated recovery storage, with compact controls and
automatic native offline rendering from saved racks. Local 0.11.10 adds inline
AU/VST3 discovery and independent native rack copy/paste. New inserts are disabled;
ordinary native realtime playback remains gated on deadline qualification.
Validation-only backend timing now separates dispatch/helper round trips from
frontend residual delay and retains diagnostics on early failures. A controlled
500 ms UI stall reproduces missed worklet-input delivery despite fast completed
helper calls. Earlier output-delivery failure under heavy system load remains
unexplained. Next: measure worker input, backend completion and worklet acceptance
independently before choosing an off-main transport; then qualify graph-wide fault
handling, normal transport/loops, playback/export session ownership and remaining
FLAC/AAC native-rack delivery. Do not activate native playback or increase buffering
based on an isolated passing run.
The isolated worker probe now demonstrates that transferred worklet messages and
direct custom-protocol fetch both stall with the UI, while worker heartbeat tasks
continue. An independent worker native call waited about 489 ms before Rust receipt
during a controlled 500 ms UI stall; helper processing then took under 1 ms.
Worker-only relocation of the current bridge is rejected. The subsequent isolated
shared-memory/loopback HTTP experiment fixes worklet-to-worker delivery, but worker
HTTP dispatch still waits for the UI. Ordinary `tauri://` assets expose no shared
memory in the measured setup, even with isolation headers; a disposable isolated
HTTP frontend enables it. This frontend was used only for validation, with no
installed-app origin/storage migration. Native realtime remains gated. Stop adding
speculative browser transport variants: native realtime needs a render/audio path
whose deadlines do not depend on WebKit's document thread. Upstream WebKit also
routes worker WebSocket traffic through a main-thread peer; this is source evidence,
not a separately tested WebSocket result on the installed WebKit.

Local 0.11.11 adds explicit rendered preview for saved native racks. Play renders
the finished stereo mix once, then uses the existing monitor/device path. The
compact Preview indicator explains this mode; Play cancels a render while busy.
One memory-only cache serves pause/resume, seeks and source-level range loops.
Audio edits stop/invalidate it; cancelled or stale output cannot start later, and
replacement renders wait for earlier helper cleanup. Master output/loudness meters
remain available; per-track/FX meters, live mixing, microphone recording and monitor
clicks are unavailable in this mode. Existing ordinary playback remains unchanged.
Real Tauri checks capture exact wet stereo PCM during a 500 ms UI stall, seeking
and repeating loops, with zero native DSP calls during playback and helpers closed
before it starts. German GUI checks cover cache reuse, mix invalidation, cancellation
and the recording guard. This does not qualify continuous live native processing.
A validation-only native-owned worker/output experiment now passes exact VST3 wet
PCM through a 500 ms UI stall, with both native DSP and Audio Queue sample-clock
progress. Fixed bounded PCM slots connect the helper worker directly to the native
callback; WebKit carries no per-block audio. Deliberate starvation faults silently,
cancellation closes the helper, and output stays muted during digital capture.
This is a single-insert foundation, not enabled production timeline processing.
The opt-in native-engine graph now compiles owned project/source snapshots and
renders clip/track/bus/master racks, pre/post sends and sidechains on that worker.
It reuses the existing native built-in DSP; integer-frame compensation aligns
merges and both detector/program arrival orders. Insert failures, non-finite output
and changed reported latency latch the entire graph silent. Unit checks cover
varying block sizes and selected file-export parity; real four-instance AU/VST3
capture checks the routed mix, UI stall, starvation and collective cancellation.
These fixtures use generated PCM, with nonzero reported latency exercised by
synthetic inserts. An internal GUI snapshot client now freezes actual decoded
AudioBuffers and project values, uploads bounded binary chunks and seals owned
native snapshots. Cancelled/stale uploads and owner destruction release resources;
active native capture retains its source memory lease until cleanup. Muted range
capture reconstructs DSP history before a seek and gates the unaligned end. It is
not production Play. Next add continuous hardware-clock transport, seek/loop/state
transitions, scope-specific plugin tempo/position, live controls and device
lifecycle before switching the production timeline. See [native engine foundation](docs/NATIVE_AUDIO_ENGINE.md).
Graph-wide faults, transport/loops, session ownership and FLAC/AAC native-rack
delivery remain required before realtime activation.
Record scope and remaining requirements honestly; these are initial complete
workflows, not full commercial-editor parity. Large-file
paging remains deferred unless actual project measurements justify it. MIDI remains
deferred. Built-in microphone, playback and window movement are user-confirmed fixed.

## Accepted next stack (in order)

The user authorized all seven steps on 2026-10-13:

1. Recording reliability, preview input ownership and physical-device acceptance.
2. Take audition, comp-region removal/replacement/reset and version comparison.
3. Track folders, collapse, grouped selection/editing and mute/solo controls.
4. Keyboard navigation, contextual trim tools and precise clip placement.
5. Supported clip/master automation passes and additional useful FX parameters.
6. Mix A/B, metering and export review.
7. Short sample walkthroughs for recording, comping, mixing and video editing.

Work through these in order and preserve compact menus/inspectors. Hardware
acceptance can remain pending user/device availability while independent software
work proceeds; never describe synthetic streams as physical validation.

## Current priority: audio DAW workflow

The user explicitly lowered MIDI priority after 0.9.4. Further MIDI sequencing,
instrument tracks and MIDI interchange are deferred. Continue improving audio
recording, editing and mixing before expanding music sequencing.

The 0.9.5 consolidation moves secondary timeline tools into desktop menus and
command search, keeps compact editing controls visible and folds explanations
into Help. This GUI correction takes precedence over adding more permanent tools.

Clip/master supported FX automation inspectors are implemented in 0.9.6.
They use absolute project time, protected local drafts, one undo on Apply and
save/reopen. Live commits retain the running graph; offline/native comparisons
pass the existing moving-delay tolerance. Track lane/pass tools remain separate.
Supported clip/master recording passes and ring-carrier frequency automation
are implemented in 0.10.2. Arbitrary FX/plugin parameters remain broader work.

Coordinated recording of one to eight armed audio tracks is implemented in
0.9.7, using per-track device/channel/latency and a shared capture clock. Captures
are published together as one undo. Synthetic browser streams pass; physical
multi-device synchronization/drift remains an acceptance check.

The requested sample sessions ship in 0.9.8: audio mix, picture edit with sound
and titles, and alternate-take/comp practice. They open through File/command
search, retain the previous session in Undo and use original bundled/generated
media. Playback, save/open and native audio/video export are locally checked.

Input ownership and take audition/comp removal/reset/version comparison are
implemented in 0.9.9. Built-in MacBook microphone capture and audible speech playback are user-confirmed; additional
physical inputs can be checked later when connected. Track folders, collapse, shared mute/solo and linked clip selection are now
implemented and browser-checked. Faster editing is implemented: visible clip keyboard navigation, exact group
placement, context trims and multi-selection drag. The requested GUI pass is implemented: actual editing mode, boundary handles,
expanded context actions, focused clip dialog, information buttons, touch ribbon,
expanded help and persisted default Fit all. Clip/master Touch/Latch/Write passes and ring-carrier frequency automation are
implemented and checked across GUI/offline/native playback. Mix A/B with synchronized
audition, optional loudness matching, saved mix snapshots and one-undo restore is
implemented in 0.10.3. Actual exported-file audio review and meters are available
from File and completed delivery jobs. Four short modeless walkthroughs use the
original recording, comp, mixing and picture samples. All seven software steps
are complete at this checkpoint. See [mix review](docs/MIX_REVIEW.md) and
[sample walkthroughs](docs/SAMPLE_WALKTHROUGHS.md). Shared frame scheduling does not remove independent-device drift. Track folders
and grouped controls are distinct from routing.
0.10.5 moves direct Record/Stop into the transport, with a separate setup arrow
and live input meters in the transport and active track headers. Default count-in
is zero. Short-clip trim hit targets stay separate and above the playhead.
0.10.6 consolidates track headers with a shared right-click/touch action menu,
readable names at compact heights, per-track recording setup and protected actions
during capture. Trim handles follow the focused selected clip to avoid collisions.
0.10.7 brings video clips the same focused boundary handles and desktop/touch
context actions, retaining linked audio/video edits and protected cancellation.
0.10.8 adds explicit track selection highlights, modeless live fade/clip inspectors,
optional navigation and master loudness, and compact picture track/preview tools.
0.10.9 makes video plain-click/Shift-click selection consistent with audio and
protects track ranges from removed anchors.
0.10.10 preserves compact inspector geometry after dragging/rotation and starts
picture header ranges from a selected clip.
0.10.11 completes empty-track deselection/counts, collapsed-folder and legacy
video markers, displayed-order Shift ranges and selected empty recording targets.
0.10.12 keeps title/caption headers inside compact rows and protects timeline
and dialog changes during recording, with cancellable one-undo drags.
Window movement remains working per the latest user confirmation.
Keep secondary controls in menus or focused inspectors, with concise labels.

Playback remains fixed per user confirmation. M9 paging/codecs remains deferred.
Completed editing/mixing/video milestones and existing MIDI features are retained.

## Requested checkpoint: M2.3–M7

The selected feature stack is implemented and locally validated. The 0.9.0 app
and optimized CLI are installed with autosave preserved. Playback is regarded as fixed
following the user's audible installed-app test. No Apple release is authorized.

- M2.3: twelve selected gain/pan/FX lanes, saved curve handles, protected passes
  and independent copy/retime. The selection is gain/pan, delay mix/feedback/time,
  ring-modulator/bit-crusher/distortion/chorus/reverb mix, chorus depth/rate.
  Arbitrary insert parameters and new clip/master lane inspectors are broader work.
- M2.4: buses, acyclic outputs, pre/post sends and routed ducking, with live,
  offline and native render checks.
- M2.5: master loudness/true-peak estimates and measured, reviewed finishing.
- M3–M4: ordered picture layers, source In/Out placement, composition/keyframes,
  titles, stills, reusable presets and separate captions/sidecars/burn-in.
- M5: explicit timeline input/arming/monitoring, count-in, calibration, punch/loop
  takes, retained originals, comp regions and adjustable crossfades.
- M6: linked speed/reverse, voice-oriented pitch-preserving stretch/transposition,
  retained original mapping and native CLI derivation/recipe export.
- M7: reviewed multicam scenes/shot switching without restarting sound, source
  transcript mapping/search/correction, reviewed multiword lift/extract and sections.

[Checkpoint workflow and limits](docs/EDITOR_CHECKPOINT.md) defines the working
platform boundary: Apple layered/graphic export, nearest-frame retiming, physical capture acceptance,
external CrispASR and device acceptance still required for physical mobile capture.
Browser responsive tests are not physical iOS/Android validation. Existing DSP
precision/tail limits remain explicit. Wider paging/codec rewrites stay deferred.
M8 delivery/interchange is implemented in local 0.9.1: per-export settings,
solo track/bus stems, queue, media collection and reviewed cut-only OTIO export.
See [delivery workflows and limits](docs/DELIVERY.md). Local validation passes and app/CLI 0.9.1
are installed with recovery preserved. Queue persistence, pre-master summing stems,
ZIP packaging and OTIO import are beyond this first interchange subset.
M9 paging/codecs remains deferred by user preference; no rewrite starts implicitly.

M10 foundation is implemented in local 0.9.2: saved constant tempo/signature,
bars/beats ruler, musical snapping, transport-clock monitor metronome and
bar-aligned edit ranges. The absolute AV clock is preserved. See
[musical timeline workflow](docs/MUSICAL_TIME.md). Sample-accurate loop restarts,
tempo maps and live instrument tracks/plugin hosting remain future M10 increments.
M10 notes are implemented in 0.9.3: native Mac/Web MIDI input, piano roll,
quantisation, sine/bell rendering with retained editable notes and type-0 pattern
MIDI export. 0.9.4 adds a reviewed audio-clock MIDI capture pass alongside timeline
playback, ending on stop/seek/loop restart and publishing one placed pattern in
one undo step. See [MIDI workflow](docs/MIDI.md). Live instrument tracks, automatic
MIDI loop takes, arrangement MIDI import/export and richer instruments are now
deferred behind the audio DAW priorities above.

## Historical acceptance: ASR and spoken-word editing (0.8.5–0.8.6)

Implemented local 0.8.5: desktop CrispASR adapter, mix/microphone choice, German
forced word alignment, spoken-word deletion across all sound/picture, frame
coverage, undo/save/load, CLI transcription and word recipes. See
[Speech editing](docs/SPEECH_EDITING.md) for scope and real interview checks.
Implemented local 0.8.6: paste a shortened transcript, review ordered word
matches, resolve repeated occurrences, retain only matched audio/video passages,
one undo step, and export a reviewed CLI recipe. See
[Keep text editing](docs/KEEP_TEXT_EDITING.md) for real interview verification.
This fulfills the newly requested speech-editing increments; it does not complete
the remaining DAW/video roadmap. Embedded/mobile ASR, multiword text selection,
inline forced re-alignment remain future extensions. The source mapping, multiword
review and speaker-label workflow is implemented in 0.9.0. Existing priority/deferred paging decisions below remain in force.

## Product direction and priority decision

Build a useful general audio and video editor in complete, reviewable increments.
The first target is recording, arranging, mixing and finishing interviews,
voiceovers and short videos, with SFX/Voice integrated into the same project.
Grow toward music-production DAW workflows afterward. This ordering reflects our
current footage and feature base; it is not a claim of parity with an established
DAW or NLE.

**Long-recording import/playback optimisation is recorded but deferred.** The user
does not currently regard it as urgent. Native exports already stream the mix;
additional format/export milestones and a disk-paging rewrite must not displace
core editing, mixing and picture tools. Fix reproducible crashes, data loss or
incorrect results as part of the affected feature, even when performance work
is deferred. Reconsider paging only if measured memory/latency blocks the actual
projects needed for a milestone.

## Evidence and existing baseline

Verified by inspecting the current data model, editing helpers, timeline workspace,
playback/render paths and native media backends. Existing capabilities include:

- Audio tracks; multiple picture sources on **one** composition lane; linked AV
  groups; move/split/trim/slip; copy/cut/paste; basic all-track range ripple deletion.
- Clip/track fades, reviewed audio crossfades, picture transitions, source offsets,
  magnetic/grid snapping, frame/sample nudges, markers, editable POS/canvas length.
- Track gain/pan/mute/solo; gain automation points and waveform overlay; built-in
  clip/track/master effects. Voice processing can return to a timeline clip.
- Media bin/inspector, offset/drift analysis, reviewed microphone switching,
  transcript import/edit/navigation/export, basic picture orientation and colour.
- Save/load, linked/portable audio projects, recovery and relinking; native Mac
  WAV/FLAC/AAC/M4A and MP4/MOV paths; optional installed FFmpeg compatibility.

These are foundations to extend, not features to reinvent. In particular,
Range edits preserve unaffected picture transitions and offer reviewed hard-cut
replacement for crossed blends; the default preserve policy rejects such boundaries; gain/pan automation have a focused direct-edit lane; `project.video.clips` is a single
composition lane; timeline effects now include parametric EQ and a sample-peak
limiter, but still lack sends/buses and general parameter automation. Timeline recording/takes are not
implemented. SFX/Voice recording elsewhere does not fulfil that requirement.
Several older workflow documents describe superseded layouts/limits; update the
relevant document with each milestone rather than treating it as current evidence.

Established-product references used to organise the gaps:
[REAPER's recording, routing, automation and takes](https://www.reaper.fm/about.php),
[REAPER User Guide](https://www.reaper.fm/userguide.php), and
[Resolve's editing, trim, layered picture, titles and multicam workflows](https://www.blackmagicdesign.com/products/davinciresolve/edit/).
This roadmap's priority ordering is our product judgement, not a ranking from
those sources or an instruction to reproduce their entire UI.

## Order of importance

| Order | Feature gap | Why it matters |
|---|---|---|
| 1 | Complete range/trim/ripple editing and track protection | Cutting, rearranging and tightening material is the central editor workflow. |
| 2 | Proper mixer, parametric EQ, limiter, metering and editable automation | We must be able to balance and finish the sound, not merely apply effects. |
| 3 | Stacked video tracks and basic compositing | B-roll, overlays and picture-in-picture require more than one picture lane. |
| 4 | Titles, lower thirds, still images and real caption tracks | These are essential deliverables for interviews and short videos. |
| 5 | Timeline recording, monitoring, punch/loop and takes | Import-only editing is insufficient for a recording DAW and voiceover workflow. |
| 6 | Non-destructive speed/time/pitch tools | Needed for timing corrections, slow motion and arranging recorded material. |
| 7 | Multicam and deeper transcript-based editing | High value once the underlying timeline and picture stack are mature. |
| 8 | Delivery presets, stems, queue and project interchange | Enables repeatable finishing and collaboration with other tools. |
| 9 | Long-recording performance and additional streaming codecs | Important scaling work, deliberately deferred behind usable editing features. |
| 10 | Music sequencing, MIDI/instruments and plugin hosting | Required for broad music DAW parity, but a separate substantial product expansion. |

## Implementation roadmap

The desktop M1 editing milestone is complete; M2–M10 remain planned. Deliver small slices in the listed
order; update this plan with actual completion and validation evidence. Do not
assign release numbers or dates before the work is scoped. Desktop implementation,
web fallback and iOS support/device validation must be recorded separately.

### M1 — Make everyday timeline editing complete (desktop milestone complete)

Local 0.8.0 implements the first slice: saved independent time ranges, ruler
selection/handles/numeric bounds, selected-range playback and loop boundaries,
contextual help/EN–DE/macOS playback commands, and persisted audio/picture clip
locks enforced on direct/linked edits and CLI recipes. Range shading covers audio
and picture. Local 0.8.1 adds reviewed scoped lift/extract/insert-gap, saved ripple
participation, linked scope checks, automation boundary values and explicit
canvas/marker/transcript retiming, with GUI/CLI parity and undo validation.
Unaffected picture transitions remain; boundaries through blends or transcript
cues require review rather than silently damaging them. Generic range blend
handling is explicit (see 0.8.11 below). Local 0.8.12 completes the desktop
workflow audit and interactive source-handle/limit feedback. Mobile device
validation remains a separate release gate; musical sample-accurate looping is deferred.
Local 0.8.2 adds explicit selected audio-range export with full DSP preroll,
native bounded output, CLI audio/video export bounds and a reviewed action to
reuse the selected range for picture export. Real interview WAV samples match
the full mix slice; WebKit preserves delay history and exact sample counts.
Local 0.8.3 adds reviewed rolling cuts, ripple trims and trim-to-playhead with
source-handle/link/lock checks, edit-point navigation and macOS commands. GUI/CLI
parity covers eight cases; real linked Canon/H6 trims were rendered. Rolling
requires abutting cuts, not blends. These conservative limits remain explicit.
Local 0.8.4 adds named edit groups distinct from AV links, a persisted grouping
toggle, independent clipboard/track-import copies, and command search with
shortcut hints. Grouped scopes/locks are enforced in GUI and CLI; WebKit covers
group controls, command execution and German phone-sized layouts. Snap targets
exclude moving group members. These additions do not add effects or mixing routes.
Local 0.8.7 adds reviewed slide editing: fixed middle content moves between two
abutting neighbours, with linked AV, source-handle limits, locks, frame quantisation
and one undo. Incoming picture blends and ambiguous overlapping lanes are rejected.
Local 0.8.8 allows rolling existing two-clip picture transitions while preserving
their type and overlap length; linked audio moves by the same frame displacement.
Source handles, frame edges, locks and surrounding transition topology are checked.
Local 0.8.9 extends slide to incoming/outgoing picture overlaps, preserving both
windows and fixed middle source content while linked sound moves with it.
Local 0.8.10 adds linked ripple trims through picture overlaps: trim selected
source content, retain both transition windows and shift following participating
lanes. Clip IDs/links survive, with common scope/lock/global retiming checks.
Local 0.8.11 adds an explicit range policy: review each crossed picture overlap
and replace it with a hard cut at the original blend end before lift/extract/insert.
The preview includes resulting cut times; unaffected transitions/source clocks and
linked sound remain consistent. The CLI defaults to preserving blends and accepts
`transitionPolicy: "cut"` explicitly. Lift retains the canvas even after removing
its entire contents. Transcript boundaries still need review/adjustment; speech
edits keep their conservative default.
Local 0.8.12 completes the desktop M1 audit: actual extract/roll dialogs, linked
picture/two microphones, excluded fixed music, selected-range playback, actual
save/reopen and byte-identical range exports, undo/redo and native audio/video
render checks. A real Canon/H6 extract-plus-roll also matches the expected PCM
exactly. Direct audio/video edge dragging now shares bounded source/timeline
clocks, inward frame limits and a source-reserve display for linked partners.
Escape/cancel restores the original arrangement and pre-drag history/redo.
Local 0.8.13 adds the M2.1 mixer foundation: bottom dock, horizontal track/master
strips, stereo peak/RMS and held peak/clipping reset, dB faders, pan, mute/solo
and existing inserts. Mixer changes update the running graph without rebuilding
playback; persisted master gain applies to GUI/native exports. Browser narrow
layout checks do not substitute for physical iOS validation. Local 0.8.14 adds the graphical EQ portion of M2.2: pass, bell and shelving
bands with response/drag/keyboard/numeric controls and native DSP parity. Local
0.8.15 completes the limiter/gain-reduction portion: stereo-linked sample peaks,
instant attack, adjustable release, no lookahead or added latency, and GUI/native
export support. Local 0.8.16 adds the focused direct-edit gain lane; further M2.3 automation work precedes routing/buses. Desktop M1 completion does not imply iOS device
validation or sample-accurate musical loop restarts.
Loop restarts use the existing frame-driven scheduler; this is not sample-accurate
seamless musical looping. Paging and new codec work remain deferred.

1. Add explicit **time-range selection**, with range handles and a visible choice
   between clip selection and range selection. Reuse the existing selection model.
   Play/loop/export a selected range; clear it without losing clip selection.
2. Introduce track lock and explicit ripple participation/sync-lock. Locked tracks
   cannot be moved, trimmed, split or deleted by indirect edits; explain any blocked
   operation. Define how linked groups interact with locks before exposing controls.
3. Extend existing ripple deletion to lift versus extract, close-gap and insert-gap
   operations, with selected-track/all-participating-track scope. Handle transition
   boundaries and retime automation, markers and transcript cues deliberately.
   Do not silently discard those objects or require all transitions to be removed.
4. Add rolling trim (adjust a shared cut while keeping total length), ripple trim,
   trim-to-playhead and previous/next edit navigation. Keep slip editing visible;
   add slide after rolling/ripple semantics are stable. Show source handles and
   limits while dragging, with numeric/frame/sample control in the inspector.
5. Add persistent named edit groups distinct from AV source links, and a simple
   command search/shortcut reference for these actions. Keep common actions in the
   timeline/context menus and macOS menus; use the existing inspector on touch.

Completion example: remove an interview digression and tighten a cut with the
camera and two microphones in sync; music may stay fixed or ripple by explicit
choice. Preview, range export, save/reopen and undo/redo preserve the same result.
CLI recipes expose deterministic range/trim/ripple operations where applicable.

### M2 — Make sound mixing a first-class workflow

1. **Foundation complete in local 0.8.13.** Dockable track/master strips: peak/RMS meters, peak hold,
   clipping indication, dB faders, pan, mute/solo and inserts. On phones/tablets,
   show a focused strip or horizontal strip list rather than shrinking everything.
2. **Complete in local 0.8.14–0.8.15.** Graphical parametric EQ (high/low-pass,
   shelves and bell bands), sample-peak output limiter and compressor gain reduction.
   Existing effect presets remain compatible. Limiter follows master gain, has
   instant attack/adjustable release and adds no latency. True-peak is M2.5.
3. **Selected workflow complete in local 0.9.0.** The incremental implementation
   record follows; the twelve selected targets are enumerated in the active section.
   **Gain-lane slice implemented in local 0.8.16.** Focused lane shares timeline
   zoom/scroll; mouse/touch add/move/delete, keyboard/numeric edits, snapping,
   locks, one-step commit/cancel, save/open and existing range retiming. Linear
   gain with held endpoints; last supplied duplicate timestamp wins. Playback
   updates without restarting. **Local 0.8.17 adds envelope copy/paste and time
   stretching**, with selected-range/whole-envelope snapshots, interpolated edges,
   one-sample outside guards, locked destination protection, no-op/cancel history
   preservation and native recipes. Local 0.8.18 adds absolute pan points with the same direct editing, live updates,
   save/load and range retiming. Local 0.8.19 adds reviewed pan envelope copy/retime with an independent clipboard,
   static-pan snapshots and native recipes. Local 0.8.20 adds track delay wet/dry mix lanes,
   live complementary ramps, rack-attached envelopes, scoped range retiming and native recipes. Local 0.8.21 adds independent delay feedback lanes (0–95%)
   with live history preservation and native parity. Local 0.8.22 adds protected
   Read/Touch/Latch/Write pass capture on gain/pan/delay mix/feedback, explicit
   session arming, live audition, bounded review/apply, cancel/redo and native recipes.
   Capture uses audio-clock/frame samples; seeks, loops and interruptions discard
   drafts. Local 0.8.23 adds reviewed delay mix/feedback envelope copy/retime,
   separate session clipboards and native source-range/portable recipes.
   Local 0.8.24 adds outgoing Linear/Step point curves on all available lanes,
   with native/GUI scheduling, curve-aware clipboard/range/pass guards and validation.
   Local 0.8.25 adds delay-time lanes (0–2000 ms), live scheduling without clearing
   history, protected pass recording, an independent copy/retime clipboard and native DSP.
   Local 0.8.26 adds reviewed Ease-in/Ease-out/S-curve segment shaping on all five
   targets, baked into editable linear points with native recipes and outside
   protection. Local 0.8.27 adds reviewed custom Bézier with two pointer/keyboard/
   numeric handles and matching native recipes. Further selected FX parameters
   and persistent curve handles remain open. Local 0.8.28 adds ring-modulator mix
   lanes, protected recording, an independent clipboard and GUI/native rendering.
   Local 0.8.29 adds the same workflow for bit-crusher mix; local 0.8.30 adds distortion mix while preserving oversampling history.
   Local 0.8.31 adds chorus mix with delay-history and modulation-phase preservation.
   Local 0.8.32 adds reverb mix, retaining convolution history and the existing dry blend.
   Local 0.8.33 persists applied shape review handles with whole-span revision;
   Local 0.8.34 adds direct timeline handles for intact saved custom spans;
   Local 0.8.35 extends direct handles to ordinary Linear and saved preset spans;
   Local 0.8.36 adds chorus depth editing/recording/copy-retime and native recipes;
   Local 0.8.37 lets any intact saved shape interior point expose whole-span
   direct handles and review, while retaining individual point editing.
   Chorus rate completes the selected twelve-target workflow in 0.9.0; arbitrary
   additional parameters and new clip/master inspectors remain broader work.
4. Add buses and sends: start with track-to-bus routing and shared reverb/delay;
   specify pre/post-fader sends and feedback-cycle rejection. Sidechain/ducking
   follows the routing model; it should not be an unrelated special-case graph.
5. Add master loudness/true-peak readout and a target-based finishing action with
   a reviewable result. Keep existing microphone automation and loudness analysis
   integrated rather than duplicating them.

Completion example: balance question/answer microphones, EQ both, automate level,
add shared room reverb and export a controlled mix. Playback and supported native
renders use the same routing, automation and effects, with meaningful audio checks.

### M3 — Allow layered video and basic compositing

1. Migrate the single picture lane to ordered video tracks, reading all existing
   projects unchanged. Persist order, visibility, lock, linked audio and clips;
   update editing/selection/overview/serialization before adding compositor effects.
2. Implement top-down picture composition with opacity and normal alpha blending,
   gaps, independent lane overlaps and transitions. Preview and native exports must
   interpret the same stack. Remove the current two-picture/single-lane assumptions
   only when the new renderer supports those cases.
3. Add position, scale, crop and rotation controls with handles in the viewer;
   then keyframes for transform/opacity. Start with ordinary linear interpolation
   and extend to easing. Retain source orientation and frame-accurate timing.
4. Add source preview with source In/Out, insert/overwrite and append actions,
   reusing the media bin. Support silent picture imports. Make project resolution,
   frame rate and aspect ratio explicit, including portrait output.

Completion example: add B-roll above the interview, a picture-in-picture shot and
an opacity fade; reopen and export the same composition without moving its sound.

### M4 — Finish videos with titles, graphics and captions

1. Add still-image clips and a text/title track: editable text, font/size/alignment,
   colour/background, safe-area guides and a small set of lower-third templates.
2. Add a distinct caption track with timed cue editing and preview. Reuse existing
   transcript exchange; transcript text and delivery captions are related objects,
   not automatically the same artifact. Support SRT/VTT export and optional burn-in.
3. Add simple keyframed title position/opacity and reusable title presets. Validate
   wrapping, DE text, missing fonts and touch editing at the target output size.

Completion example: deliver the interview with speaker names, opening/closing title
and corrected German captions. Native picture export includes the selected text
and graphics; sidecar captions remain separately available.

### M5 — Record directly into the arrangement

1. Add timeline track arming, input device/channel selection, input meters and
   explicit monitoring state. Record at the playhead with a count-in, preserve
   original captured media and allow immediate playback/undo. Begin with one input
   track; simultaneous multi-input recording requires platform-specific validation.
2. Add recording latency calibration/placement and dropped-frame/device-change
   reporting. Ensure monitored sound is not recorded again as an unintended loop.
3. Add punch In/Out and loop recording; store passes as takes, then take lanes and
   comp regions with adjustable crossfades. Keep the source takes recoverable.
4. Add appropriate macOS menu/keyboard/touch controls; document mobile permission,
   interruption and background behaviour only after device testing.

Completion example: record a voiceover with the attached USB microphone over an
existing scene, replace a sentence by punch-in, choose the best take and export.

### M6 — Change timing without destructive round trips

1. Add explicit clip playback rate and reverse, with linked AV time mapping and
   source bounds. Distinguish changing speed/pitch together from preserving pitch.
2. Add pitch-preserving stretch for audio and explicit pitch transposition; use
   cached derived media if needed, retaining the original and the editable settings.
3. Add video speed changes and later speed ramps. Define frame duplication versus
   interpolation clearly; optical-flow slow motion is a later quality extension.
4. Keep automation/fades/source offsets and linked clips correct under rate changes;
   expand precision/sync tests and CLI recipe/export support alongside the GUI.

Completion example: retime a scene and its linked sound, adjust a voiceover to fit,
then revert the processing without losing the original source.

### M7 — Multicam and transcript-driven interview editing

1. Build a multicam clip/group using saved sync results and the layered picture
   model. Display angle previews and switch angle at the playhead while keeping
   continuous independently mixed microphone sound.
2. Separate source transcript timestamps from edited-timeline cues. Add word-level
   selection/search and a reviewed proposal to lift/extract selected speech; reuse
   M1 edits so picture, linked sound, markers and automation remain consistent.
3. Add scene/section organisation, transcript correction and speaker labels;
   retain human review for ambiguous microphone/speaker/angle decisions.
4. Integrate CrispASR through an explicit CLI/backend contract when transcription
   is added. Do not create a new shared cross-app engine just for this integration.

Completion example: shorten a multi-angle interview by transcript selection and
choose shots while preserving the reviewed Tr1/LR microphone mix.

### M8 — Repeatable delivery and interchange

1. Add per-export settings/presets for resolution/frame rate, range, audio layout,
   codec/quality and caption delivery. Do not hide all delivery choices in global
   defaults. Validate before rendering and explain unsupported platform choices.
2. Add track/bus stems, selected-clip exports and a cancellable render queue with
   clear progress, output paths and retry. Reuse current job ownership/publication.
3. Add collect/copy project media and portable project packaging with missing-media
   review. Extend current relinking/recovery rather than replacing it.
4. Add interchange incrementally: first an honest cut-only EDL/OTIO-style subset,
   then broader exchange if licenses and mappings allow. Report omitted FX/routing/
   titles; never present a lossy interchange as a complete project round trip.

Completion example: deliver a landscape/portrait version, caption sidecar and
separate dialogue/music stems from one saved project, with reproducible settings.

### M9 — Deferred scaling and codec work

This records the previous performance proposal; it is not the next priority.

1. Measure real Canon/H6 import time, peak memory, waveform readiness, seek latency
   and playback stability, including reopen/recovery. Establish actual constraints.
2. Add native chunked decoding, cached multiresolution waveform peaks and bounded
   audio read-ahead around the playhead for linked desktop sources. Adapt import,
   project loading and recovery together; retain browser/in-memory paths.
3. Validate crossfades, FX history, seeking and AV synchronization with the paged
   path. Share the source/routing contract with the existing native mixer; no need
   for a separate shared cross-application engine.
4. Extend MP3/Opus streaming only through a genuine incremental encoder/container
   API; the existing whole-buffer Glint call is not streaming. A bundled permissive
   WebM path is separate work, not implied by invoking optional installed FFmpeg.

Move an individual item forward only when it blocks a higher-priority milestone
or measured real-project use, and record why the priority changed.

### M10 — Broader music DAW capabilities (later product expansion)

- Add tempo/time-signature and bars/beats rulers, metronome, musical snapping and
  loops before MIDI sequencing; preserve the existing absolute AV clock.
- Add MIDI device input, piano roll, quantisation and basic instruments, then
  instrument tracks and MIDI export. These are substantial new engine features.
- Evaluate desktop plugin hosting after the bus/automation/latency model is solid;
  check SDK/dependency licences and build/platform isolation before choosing a
  format. Desktop plugins do not automatically work in web/iOS builds.
- Add advanced musical stretch/warp, freeze/render-in-place, folders and larger
  session organisation once the preceding workflows justify them.

This milestone is necessary for broad music-production parity, but it should not
consume the interview/video editor's near-term milestones.

## Delivery rules and milestone acceptance

- Prefer built-in MIT/BSD/Apache-compatible implementations and existing system
  APIs; review each new dependency's actual license/notices before adding it.
  Optional installed FFmpeg remains explicit; do not silently bundle GPL tools.
- Implement project state, migration, undo/redo and saved representation with the
  feature. CLI edit/render behaviour should match GUI semantics where meaningful;
  GUI-only gestures and live device workflows do not need artificial CLI mirrors.
- Desktop video preview and export must share composition/time semantics; label
  approximations explicitly. Never ship a control whose renderer ignores it.
- EN/DE, keyboard/macOS menus, mouse and touch, contextual help, accessibility and
  compact layouts are part of each feature, not a final polishing phase.
- Test relevant edit invariants and audio/picture results, then validate the actual
  Canon/H6 interview or USB-mic voiceover workflow. Browser headless checks and
  simulator CI do not establish physical iOS recording/video correctness.
- Update the relevant workflow docs and RELEASE_STATUS with actual support/limits.
  Build/install a reviewable local milestone; tags and Apple distribution remain
  separate actions governed by the existing release workflow.

## Next concrete implementation slice

M2.1 and M2.2's EQ/limiter/gain-reduction controls are available in local 0.8.15.
M2.3's gain/pan direct lanes and gain envelope copy/retime are available in local
0.8.33, including independent pan envelope copy/retime, track delay mix/feedback/time
lanes, independent delay envelope copy/retime and protected Read/Touch/Latch/Write capture with explicit review.
Outgoing Linear/Step curves and reviewed Ease-in/Ease-out/S-curve point generation
and custom Bézier review handles are available, with ring-modulator mix added in 0.8.28 and bit-crusher mix in 0.8.29, followed by distortion mix in 0.8.30 and chorus mix in 0.8.31, then reverb mix in 0.8.32. Next add further selected FX parameters;
M2.3 remains open. Keep
buses/sends as M2.4 and loudness/true-peak finishing as M2.5. Codecs and disk paging
remain deferred; physical iOS validation remains outstanding.

---

# Historical implementation records (archived)

The following material is retained for provenance. Completed items and obsolete
baselines below must not override the active roadmap above.

# Interaction follow-up — local 0.6.4

Implemented fullscreen focus/keyboard isolation, long-list track drag scrolling,
Escape/capture cancellation, compact touch header geometry and status indicators.
Playhead hit targets no longer extend into neighbouring track controls.

# Preview and seeking follow-up — local 0.6.3

Fixed gap/tail preview loading, fullscreen request completion after close, visible
fullscreen failure notices, frame stepping across the extended canvas and typed
position viewport follow. Browser playback in intentional black is covered.

# Timeline usability — local 0.6.2

Implemented video removal/undo, pointer and keyboard track ordering, shared row
height extremes, help, editable position/canvas duration, automatic partial-video
dissolves, reviewed audio crossfades, portal fullscreen viewer and staged audio
import into existing/new tracks. Longer canvas exports black picture and silence.
Two simultaneous picture clips on one lane remain the composition limit.

# Shared timeline — local 0.6.1

Video clips now follow the audio ruler, zoom and horizontal scroll. A separate
ProjectOverview navigates the entire arrangement; VideoViewer remains fitted.
This supersedes the earlier fitted editable picture lane.

# Media workspace progress — local 0.6.0

Implemented multiple picture sources on one composition lane; linked AV editing;
frame trim/slip/ripple, configurable grid and markers; saved sync and optional audio
drift correction; reviewed mic switching, shared automation, noise reduction and
loudness measurement; transcript exchange/editing; optional resizable workspace;
proxies, cancellation, recovery and media relocation. CLI recipes and linked-source
rendering share the internal desktop media crate. See docs/MEDIA_WORKSPACE.md.

Remaining architecture work: fully paged GUI audio (CLI already streams files),
stacked multicam/linked clip rate changes, native mobile video composition and
physical-device tests. These are not claimed by 0.6.0. Browser/touch checks do not
prove iOS native behavior. Keep advanced transition preview limitations visible.

## Precision and picture editing (2026-10-08, local 0.5.0)

Implemented fitted video overview, draggable playhead, magnetic edges, exact/ms/sample
nudges, track fade envelopes and Voice round trips. Single-source picture clips now
support split/move/source trim/delete and timed transitions in GUI + CLI. Export
validates overlaps and never ripples audio implicitly. See TIMELINE_WORKFLOW.md.
Remaining: multiple picture sources/lanes, linked AV groups/ripple editing, frame-rate
selection, full 3D page simulation, native mobile video engine and device validation.

# CrispAudio — Production Readiness Plan

## Generic timeline workflow (2026-10-08, local 0.4.1)

- Replace the interview workspace with generic optional media tools.
- Move transport adjacent to tracks; expose Fit all, time zoom, track height,
  horizontal navigation and correct trackpad wheel axes.
- Implement New project/reset with undo, full project files, reusable track files,
  standalone camera import, and offset-only track auto-sync with drift reporting.
- Guard video readiness, retry loading, expand viewer with native fullscreen and
  fallback; preserve video duration through audio edits.
- Define consistent temporary Solo override of saved Mute for playback/export.
- Remaining: drift correction for arbitrary already edited tracks, silent-video
  import, multiple picture clips/multicam, native/device UX validation.

## Interview editing (2026-10-08, Codex — implemented)

- Merge `ios-native-features` into main and verify existing gates.
- Add an internal desktop media module and standalone `crispaudio` CLI: probe,
  correlate multiple anchors, estimate offset/drift, preserve channel count,
  render aligned 24-bit audio, and remux video without re-encoding its picture.
- Add a GUI sync/import workflow, video preview, confidence review, manual offset
  adjustment, and export of the edited timeline onto the original video.
- Preserve sample precision in portable projects and persist video/source metadata.
- Verify synthetic offset/drift cases plus the real Canon/H6 interview. Keep all
  personal recordings and generated media outside the repository.
- Verified: frontend lint/build/tests; native macOS app build and 16 Rust tests;
  five media DSP tests; generated-media CLI integration tests; browser GUI flow
  calling the real CLI; full Canon/H6 export with unchanged picture/camera hashes
  and residual alignment <= 1.75 ms across beginning/middle/end checks.
- Multiple picture clips/ripple editing/multicam, speaker-to-mic automation, and transcript navigation are
  follow-up work, documented in `docs/INTERVIEW_EDITING.md`.
- No separate cross-application engine. FFmpeg/FFprobe are desktop prerequisites;
  web/mobile keep the existing audio editor.

## Visual timeline and video workflow (2026-10-08, local 0.4.0)

- Implemented source-normalized waveforms, transient-preserving aggregation and
  deep-zoom samples, plus a normalized two-mic alignment overlay.
- Added the shared-clock filmstrip lane, larger/fullscreen video viewer and
  approximate time stepping. Single locked video; no arbitrary montage yet.
- Persisted in/out range; GUI and CLI export accurate encoded sections while
  preserving stream-copy behavior for the full recording.
- Local version bumped to 0.4.0; this does not itself submit an Apple release.

## Touch workflow and release readiness (2026-10-08)

- Fixed global CSS reset overriding Tailwind spacing utilities.
- Implemented guided file setup, explicit microphone comparison, preview toggle,
  waveform fit, position scrubber, visible clip split/delete actions, track mixer,
  and dialog-based clip inspector. Shared vertical scrolling keeps headers aligned.
- Touch selects/scrolls by default; moving/trimming is an explicit mode. Batch WAV
  import creates separate microphone tracks. iOS saves portable embedded audio.
- Documented exact Canon/H6 CLI and GUI steps and current distribution evidence.
- Open: real-device iPhone/iPad validation; full native mobile video workflow;
  macOS App Store signing and sandbox/media packaging. Do not describe the new
  interview feature as available on iOS or submitted to Apple.

## Historical v0.3.0 baseline

> **Status: COMPLETE (v0.3.0)** — All items addressed. CI gates green: eslint clean,
> `tsc --noEmit` clean, 845 JS + 11 Rust tests pass, `vite build` succeeds.
> PWA service worker, full i18n (EN+DE), WCAG accessible, mobile responsive.
>
> | Item | Status |
> |------|--------|
> | P0.1 SFX presets/waveforms/sliders dead (immer MapSet) | ✅ done |
> | P0.2 Voice processing stub → real VoiceEngine | ✅ done |
> | P1.1 Settings screen | ✅ done |
> | P1.2 About dialog | ✅ done |
> | P1.3 Third-party licenses list | ✅ done |
> | P1.4 i18n init + full string migration | ✅ done (init + all 3 panels + nav/modals/status bar; EN/DE at 263-key parity, all `t()` keys verified) |
> | P1.5 Timeline audio import | ✅ done |
> | P1.6 Timeline export mix | ✅ done |
> | P1.7 Tauri backend / persistence | ✅ done — project save/load (audio embedded as base64 WAV) via Tauri dialog + save_project/load_project; dead `ProjectData` removed. (`export_wav` command still unused; exports use the JS WAV encoder by design.) |
> | P2.1 SFX auto-generate on mount | ✅ done |
> | P2.2 StatusBar clock | ✅ done (panel-aware live playhead) |
> | P2.3 Timeline undo/redo hook misuse | ✅ done |
> | P2.4 Fake spectrum (SpectrumCanvas) | ✅ done (real radix-2 FFT magnitude spectrum + tests) |
> | P2.5 Dead/duplicated code | ✅ done (removed unused EffectsPanel, SpectrumAnalyzer) |
> | P2.6 A/B copy ignores locks | ✅ resolved by design — "copy to other" / swap are slot-level ops that intentionally replace the whole target slot; locks only guard preset/randomise within a slot |
> | P2.7 Build-fix commit | ✅ done |
>
> **All plan items addressed.** Remaining backend command `export_wav` is left
> as scaffolding (exports use the JS encoder); not a blocker.


Status of the build: **compiles, lints clean, 331 unit tests pass, `tauri build` produces a
signed-less `.dmg`/`.app`.** The problem is not the build — it is that large parts of the app
are **not wired end-to-end**. The UI renders but most interactions are dead.

This document captures the findings from a full audit of `crispaudio` compared against the
original working apps it was assembled from:

- **crispfxr-app** (`/Volumes/backups/code/crispfxr-app`) — original working SFX synth.
- **voicelab** (`/Volumes/backups/code/voicelab`) — original working voice processor.
- **CrispSorter** (`/Volumes/backups/code/CrispSorter`) — sibling Tauri+React app (only the Rust
  backend is present locally; its frontend isn't on disk, so Settings/About/Licenses are rebuilt
  from crispaudio's own primitives rather than copied).

---

## 0. Severity legend

- **P0 — blocker**: a headline feature is completely dead. Ship-stopper.
- **P1 — major**: a whole feature area is unusable or absent.
- **P2 — polish**: correctness/quality issues, not blockers.

---

## P0 — Blockers (core interactions dead)

### P0.1 — SFX: clicking presets / waveforms / sliders does nothing  ✅ ROOT CAUSE FOUND
**Symptom:** clicking any preset or waveform (and moving any SFX slider, and "Randomise")
has no effect — no sound, no visual change.

**Root cause:** immer's MapSet plugin is never enabled in the running app.
- `synthStore` is created with the `immer` middleware and stores `lockedParams: new Set()`
  (`src/stores/synthStore.ts:110`).
- `setParams` (`synthStore.ts:121`) and `loadPreset` (`synthStore.ts:164`) read that Set
  **through the immer draft** (`state.lockedParams.has(key)`), which forces immer to proxy the Set.
- `enableMapSet()` is only called in `tests/setup.ts:7` — **never** in `src/main.tsx`.
- At runtime immer throws `[Immer] The plugin for 'MapSet' has not been loaded`. The throw happens
  inside the Zustand `set()` call inside the React `onClick`; React swallows it, no state update,
  no re-render, no audio. The click is a silent no-op.

This single defect kills **all** SFX parameter interaction (presets, waveforms, every slider,
randomise) because they all funnel through `setParams`/`loadPreset`.

**Fix:** call `enableMapSet()` once at app startup in `src/main.tsx` (mirror `tests/setup.ts`).
Belt-and-suspenders: also call it at the top of `synthStore.ts` before `create(...)`.

**Reference behaviour (crispfxr-app):** generation and playback are decoupled — clicking a preset
regenerates the buffer but does **not** auto-play; the user presses Play/Space. crispaudio already
mirrors this (`handlePreset` → `loadPreset` + `generate`; explicit Play button). So no UX change is
needed beyond unblocking the throw.

**Acceptance:** click a preset → waveform canvas redraws + Play enabled; click waveform → buffer
changes; sliders update the waveform; Play produces sound; WAV export works.

### P0.2 — Voice: processing is a stub; every effect is a no-op  ✅ CONFIRMED
**Symptom:** loading audio, selecting a voice preset, and moving effect sliders produce no audible
change; "Processed" output always equals the source; export writes the unmodified input.

**Root cause:** `handleProcess` in `src/components/voice/VoicePanel.tsx:483-492` is a literal
pass-through stub:
```ts
// Stub process — in a real build this would call VoiceEngine
setTimeout(() => { setProcessedBuffer(sourceBuffer); ... }, 400);
```
The real DSP pipeline `src/audio/engine/VoiceEngine.ts` is complete and correct
(`class VoiceEngine { async processAudio(source, settings): Promise<AudioBuffer> }`,
granular pitch shift + formant + time-stretch + a 10-node OfflineAudioContext effect chain) but is
**never imported or instantiated anywhere**.

**Fix:** replace the stub with a real call:
```ts
const engine = new VoiceEngine();               // or module-singleton
const out = await engine.processAudio(sourceBuffer, currentSettings);
setProcessedBuffer(out);
```
`currentSettings` = the active slot's settings (or morphed) from `voiceStore`. Make `handleProcess`
async and guard against overlapping runs. Consider debounced auto-process on settings change to
match voicelab's `throttledProcess` (150 ms), or keep the explicit "Process" button — pick one and
make it consistent.

**Acceptance:** load a clip, pick "Robot"/"Chipmunk" → processed waveform differs and playback sounds
transformed; export writes the processed audio.

---

## P1 — Major gaps

### P1.1 — No Settings screen  ✅ CONFIRMED ABSENT
- There is **no** settings/preferences UI anywhere. The Sidebar **already renders a Settings gear
  button** (`src/components/layout/Sidebar.tsx:108-131`) but it has **no `onClick`** — dead element.
- A reusable `Modal` already exists (`src/components/common/Modal.tsx`: portal, Esc, focus-trap,
  backdrop click, `X` button) — build Settings as Modal content.
**Plan:**
  - Add modal state to `uiStore` (`activeModal: 'settings'|'about'|'licenses'|null`, `openModal`,
    `closeModal`).
  - Wire the gear button `onClick={() => openModal('settings')}`.
  - New `settingsStore` with zustand `persist` (localStorage to start; optionally back with
    `@tauri-apps/plugin-store` later to match CrispSorter).
  - Settings to expose: **theme**, **language (EN/DE)**, **default export sample rate / bit depth**.
  - Language dropdown calls `i18n.changeLanguage(lng)` and persists it (see P1.4).

### P1.2 — No About dialog  ✅ CONFIRMED ABSENT
**Plan:** `AboutModal` (Modal content) showing app name, version, identifier
(`com.crispstrobe.crispaudio`), short description, and repo/homepage links.
  - Version via `getVersion()` from `@tauri-apps/api/app` (source of truth:
    `src-tauri/tauri.conf.json:4` `"version": "0.1.0"`).
  - External links opened via `@tauri-apps/plugin-opener` (`openUrl`) — add the plugin (npm
    `@tauri-apps/plugin-opener` + `tauri-plugin-opener` crate + register in `lib.rs` + capability),
    mirroring CrispSorter. Fallback: `<a target="_blank">` if we choose not to add the plugin.

### P1.3 — No third-party licenses list  ✅ CONFIRMED ABSENT
**Plan:** `LicensesModal` rendering a scrollable list.
  - **JS deps**: add a script `licenses:gen` using `license-checker`/`license-checker-rspack`
    → `src/generated/licenses.json`, imported into the component.
  - **Rust deps** (optional): `cargo-about generate` with `about.toml` for `src-tauri` crates.
  - Each row: name, version, SPDX license, repo link (opened via opener).

### P1.4 — i18n built but never initialized or used  ✅ CONFIRMED
- `src/i18n/index.ts` configures i18next (EN+DE, detector, fallback `en`) and full EN/DE
  translation files exist — but `src/i18n/index.ts` is **never imported** (notably not in
  `main.tsx`) and **no component calls `t()`** (all strings hardcoded English). DE is unreachable.
**Plan (incremental):**
  - Import `./i18n` in `src/main.tsx` so i18next initializes.
  - Add the language switcher in Settings (P1.1).
  - Migrate user-facing strings to `t()` progressively (panels first). Full migration is large;
    do high-traffic surfaces (panel titles, buttons, Settings/About) now, backfill the rest.

### P1.5 — Timeline: cannot import audio (unusable)  ✅ CONFIRMED
- `projectStore.addSource` / `addSegment` are **never called by any component** — there is no media
  pool, no file import, no drag-drop that creates a segment. Tracks exist but are permanently empty,
  so `project.duration` stays 0 and playback has nothing to schedule. The TimelineEngine itself is
  real and fully wired for playback.
**Plan:** add a media-import affordance (toolbar "Import audio" button + drag-drop onto a track) that
  decodes the file to an AudioBuffer, calls `addSource`, and creates a segment via `addSegment` at the
  playhead. Reuse `FileDropZone` decode logic.

### P1.6 — Timeline: no export  ✅ CONFIRMED
- `TimelineEngine.renderToBuffer` (`TimelineEngine.ts:131`) is never called; no "Export Mix" button
  (the `timeline.export` i18n key exists but is unused).
**Plan:** add an "Export Mix" button to the transport/toolbar → `renderToBuffer()` → WAV encode →
  download (reuse the shared WAV writer; ideally the Rust `export_wav`, see P1.7).

### P1.7 — Entire Tauri backend is unused  ✅ CONFIRMED
- No `invoke`/`@tauri-apps/api` usage anywhere in `src`. The 5 registered commands
  (`open_audio_file`, `save_audio_file`, `export_wav`, `save_project`, `load_project`) are all dead.
- `struct ProjectData` is never constructed (the dead-code warning). Project save/load is not wired
  on either side; there is **no persistence at all** (closing the app loses everything).
**Plan (phased):**
  - Short term: at least one real `invoke` path — use Rust `export_wav` (proper multi-bit-depth
    encoder) for SFX/Voice/Timeline export instead of the three hand-rolled JS WAV writers, OR keep
    JS export and explicitly decide the Rust export is for "Save As…" via native dialog.
  - Decide project persistence: wire `save_project`/`load_project` to a real Save/Open flow, fix
    `ProjectData` (construct it or remove it), and add autosave/restore. If out of scope for now,
    document it as a known limitation rather than leaving dead code.

---

## P2 — Polish / correctness

- **P2.1 SFX auto-generate on mount:** `buffer` starts `null` and nothing calls `generate()` on
  load, so Play/Export are disabled until the first interaction. Call `generate()` once on mount
  (after `enableMapSet`) so the default sound is ready.
- **P2.2 StatusBar clock is fake:** `StatusBar.tsx:64` hardcodes `formatTime(0)`; it also only reads
  `useSynthStore`, so it's blank in Voice/Timeline modes. Wire it to the active panel's playhead.
- **P2.3 Timeline undo/redo misuses hooks:** `TimelinePanel.tsx:208-209` call `useTimelineHistory()`
  (a hook) inside a `useCallback` body, operating on a stale snapshot. Refactor to call
  `useProjectStore.temporal.getState().undo()/.redo()` directly in the handler.
- **P2.4 SpectrumCanvas is a fake static RMS approximation** (`SFXPanel.tsx:249`), not a real FFT.
  Cosmetic; optionally replace with an AnalyserNode FFT.
- **P2.5 Dead/duplicated code:** `samplesToAudioBuffer`/`playSamples` exported from `SynthEngine.ts`
  are unused (SFXPanel re-implements playback inline); `useAudioEngine` hook is unused. Consolidate.
- **P2.6 A/B `copyToOther`/`swapSlots`** do a full overwrite that ignores locked params (design
  quirk; confirm intended).
- **P2.7 Build-tree edits already made** (to get it compiling) are uncommitted: typed-array generic
  annotations + unused-var removals across 8 files, plus `Cargo.toml` feature-list no-op change.
  Commit these on a branch with the rest.

---

## Suggested execution order

1. **P0.1** SFX immer fix (one line, unblocks the whole synth) + **P2.1** auto-generate on mount.
2. **P0.2** Voice: wire `VoiceEngine.processAudio` (kills the biggest "doesn't work" complaint).
3. **P1.4** init i18n in `main.tsx` (prereq for Settings language switch).
4. **P1.1 / P1.2 / P1.3** Settings + About + Licenses modals; wire the Sidebar gear button.
5. **P1.5 / P1.6** Timeline import + export (makes the third feature usable).
6. **P1.7** one real Tauri `invoke` path (export_wav) + decide project persistence.
7. **P2** polish pass; commit on a branch; rebuild + retest + manual smoke test.

## Verification per step
- `npm run typecheck && npm run lint && npm run test` after each change.
- Manual smoke test via `npm run tauri dev` for audio (unit tests can't hear sound).
- Final `npm run tauri build` to confirm the bundle still builds.
