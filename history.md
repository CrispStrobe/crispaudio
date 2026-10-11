# CrispAudio history

Historical implementation notes moved from README.md. These describe the state
at each increment; later entries supersede earlier limitations. For the current
application, see [README.md](README.md). For subsequent changes, see
[CHANGELOG.md](CHANGELOG.md), and for detailed implementation/validation records,
see [release status](docs/RELEASE_STATUS.md) and [PLAN.md](PLAN.md).

## Timeline workflow — local 0.6.4

Desktop interview synchronization, external microphone alignment, video preview
and edited-audio video export are available in the Timeline and standalone CLI.
Local version 0.6.4 aligns video and audio under one ruler, zoom and scroll, with a
separate project overview for navigation. The optional viewer keeps its picture
fitted. Linked clips, transitions, magnetic edges, fades and track auto-sync work
in the generic timeline. See [the timeline workflow](docs/TIMELINE_WORKFLOW.md)
and [Media workspace](docs/MEDIA_WORKSPACE.md). Use **?** for control help. POS and
DUR accept typed timecodes; row height includes video. Import audio chooses an
existing or new track. Partial picture overlaps dissolve; selected audio overlaps
can crossfade. Expanded video opens a separate fullscreen viewer.
See [Interview editing and CLI](docs/INTERVIEW_EDITING.md) for setup, the
[Canon/H6 walkthrough](docs/INTERVIEW_WALKTHROUGH.md) for concrete steps, and
[iOS/macOS release status](docs/RELEASE_STATUS.md) for platform limits. The audio
editor has touch controls; automatic video sync and MP4 export remain desktop-only.


## Media workspace (local 0.6.0)

Multiple camera files and linked audio/picture clips, frame trims/slip/ripple,
markers, reviewed microphone switching, gain automation, transcript editing,
lightweight proxies and recovery are described in [Media workspace](docs/MEDIA_WORKSPACE.md).
The desktop CLI also edits project recipes and renders linked arrangements.
Video remains desktop-only; GUI audio is decoded in memory. See the workflow for
limits and supported CLI processing.

### Media formats and native backend (local 0.7.0)

Audio export now includes 24-bit FLAC alongside WAV, MP3, AAC and Opus. Mac video
export offers a native Apple backend for MP4/MOV cuts, dissolves, fades, colour and
orientation, plus explicitly optional FFmpeg compatibility for other transitions
and VP9/AV1 WebM. See [formats, CLI and licensing](docs/MEDIA_FORMATS_AND_LICENSES.md)
for the exact support matrix and remaining platform limitations.

Local 0.7.1 also renders every listed picture transition through Apple frameworks.
Whip, glitch and page peel require a compatible Metal GPU; the export selector
retains optional FFmpeg compatibility. Complex preview/native/FFmpeg renderers
are approximate equivalents, with a shaded 2D page fold rather than 3D geometry.

Local 0.7.2 adds streaming native CLI mixing of linked projects to float WAV,
including pan, fades, automation and low/high-pass racks. On Mac, supported
linked projects can render directly to MP4/MOV with `--video --backend apple`,
without FFmpeg. Unsupported DSP fails explicitly; GUI rendering retains broader
FX support and currently uses decoded audio buffers.

Local 0.7.3 extends native CLI racks with bit crushing and ring modulation.
It also fixes their GUI processing: bit crushing keeps silence at zero, and
ring modulation now has a working wet/dry control. Delay, chorus, reverb,
oversampled distortion and compression still require GUI rendering.

Local 0.7.4 adds native CLI delay and chorus with stereo tails and bounded delay
buffers, checked against actual macOS WebKit rendering. Reverb, oversampled
distortion and compression still require GUI export. See the reusable DSP
comparison instructions in `docs/MEDIA_WORKSPACE.md`.

Local 0.7.5 adds native convolution reverb matching the GUI's seeded stereo
response and macOS WebKit level calibration, with bounded FFT buffers and no
added latency. Distortion and compression still require GUI export.

Local 0.7.6 adds native timeline distortion with four-times oversampling and
the GUI's wet-path filter delay. Its WebKit resampling adaptation carries
BSD-3-Clause notices. Compression still requires GUI export.

### Local 0.7.7 — native compressor

Native linked-project export now supports every current timeline rack effect,
including stereo-linked compression with WebKit soft knee, adaptive release,
automatic makeup and 6 ms lookahead. The GUI already had these controls; the CLI
now matches its timing and mono/stereo behavior. The BSD-3-Clause kernel notice
is included in source and About. See `docs/MEDIA_WORKSPACE.md` for CLI usage.

### Local 0.7.8 — disk-backed desktop video export

Mac GUI video export now reuses the native streaming mixer for linked 48 kHz
mono/stereo projects. Full-clock DSP preserves effect history in section exports,
without a second full Web Audio mix or PCM transfer through IPC. In-memory sounds
and other project rates retain Web Audio. Import/playback buffers remain loaded;
this is an export improvement. See `docs/MEDIA_WORKSPACE.md` for the workflow.

### Local 0.7.9 — direct timeline WAV export

Eligible Mac timeline WAV exports now stream directly to disk with the chosen
8/16/24/32-bit integer PCM setting. Cancellation and errors stay in the export
UI; other formats keep the worker. CLI `--wav-bit-depth` selects the same integer
writer while its omitted default remains float WAV. See `docs/MEDIA_WORKSPACE.md`.

### Local 0.7.10 — native timeline FLAC

Eligible Mac timeline FLAC exports now stream from disk using the system encoder,
with signed 24-bit quantisation and final MD5 verification. CLI `render-project`
accepts a `.flac` destination on Mac. Other projects keep the libFLAC worker;
compressed bytes can differ by preset while decoded PCM is preserved. No new
codec dependency is added. See `docs/MEDIA_WORKSPACE.md` for usage and disk space.

### Local 0.7.11 — native timeline AAC

Eligible Mac timeline AAC exports now stream from disk with the selected bitrate.
CLI `.aac` output uses the same native AAC-LC/ADTS path; `--audio-bitrate-kbps`
selects 96/128/192/256/320 kbps (default 192). Packet validation checks actual
length and layout. ADTS has codec priming/padding; use WAV/FLAC for exact timing.
No new codec dependency is added. See `docs/MEDIA_WORKSPACE.md` for details.

Local 0.7.12 adds native M4A/AAC output: choose M4A in the Mac timeline's AAC
save dialog or give CLI `render-project` a `.m4a` output. The file records
priming/padding metadata for gapless-aware decoders, with its valid frame count
checked against the source. ADTS `.aac` remains available; WAV/FLAC remain
lossless options. No codec dependency is added.


## Local 0.8.8 — transition-aware rolling

Rolling trims preserve an existing two-clip picture transition's type and overlap
length while moving its window, with linked audio following the same displacement.
Source handles, frame boundaries, locks and neighbouring transition topology are
validated. Slide/ripple/range operations through blends remain future work.


## Local 0.8.9 — sliding across transitions

Fixed-content slides retain incoming/outgoing picture overlap windows, transition
types and linked audio offsets. Linked edit boundaries account for picture handles,
while the middle source content and outer timeline endpoints stay fixed.
Ripple/range edits through picture blends remain unfinished.


## Local 0.8.10 — ripple trims through transitions

Linked ripple trims retain incoming/outgoing picture transition windows and types,
preserve clip/source-link identities and retime following scoped material. Locks,
groups, markers, automation and transcript checks share the range-edit contract.
Generic range boundaries through blends remain a separate unfinished increment.


## Reviewed range edits through picture blends — local 0.8.11

Range dialogs now list crossed blends and their resulting cut positions. Explicit
hard-cut replacement trims incoming picture handles at the original blend end;
linked source clocks and unaffected transitions remain intact for lift, extract
and insert. The native CLI accepts the same `transitionPolicy` choice. Preserve
is the default; spoken-word/pasted-text edits keep that conservative policy.
Lifting the tail or the whole arrangement preserves its original canvas.

Validation includes dialog/undo/CLI comparisons, German phone-sized layout,
Apple-rendered colour clips and a private linked Canon/H6 extraction. Original
recordings and project files remain unchanged. Details belong in
[release status](docs/RELEASE_STATUS.md), not the capability overview in README.


## Source-handle feedback and desktop M1 audit — local 0.8.12

Direct clip-edge dragging now displays source-clock spans and available material
on either side for linked partners. Audio uses the same bounded trim geometry as
picture, computed from a stable press snapshot. Linked picture clamps inward to
project frames and retains a frame. Escape/cancel restores arrangement/history,
including redo. Idle waveform rendering still avoids transport/metadata rerenders.

The desktop M1 completion workflow was checked with actual dialogs, playback,
save/open and range export, fixed music, two linked microphones and picture,
undo/redo and native audio/video export. A real Canon/H6 extract-plus-roll matched
expected PCM byte for byte. M2's dockable mixer is next; iOS device validation
and musical loop precision remain separate work. See PLAN.md and release status.

## Mixer foundation — local 0.8.13

Added the bottom mixer dock, horizontally scrollable strips, existing inserts,
post-pan stereo meters and persisted master output gain. Faders/audition switches
update the existing graph rather than rescheduling playback. Buses, sends,
graphical EQ and advanced dynamics remain subsequent roadmap work.

## Graphical EQ — local 0.8.14

Added bell/shelf bands alongside existing pass filters, a combined response graph,
point/keyboard/numeric editing and native DSP. Filter parameter changes update
live nodes without rescheduling audio. Shelf Q remains unused; pass Q retains
Web Audio's dB convention. Limiter and compressor gain-reduction remain next.

## Output limiter and gain reduction — local 0.8.15

Added a stereo-linked sample-peak limiter after master gain, with instant attack,
adjustable release and no lookahead or added latency. Realtime playback uses an
AudioWorklet; browser offline export and native CLI apply the same algorithm.
Compressor inserts/strips and the limiter show live attenuation without updating
project state. Limiter settings persist, support undo and have a CLI recipe
operation. Older projects remain limiter-disabled. Automation lanes are next.


### 2026-10-11 — local 0.8.16: direct track-gain editing

Continued M2.3 with a focused lane sharing timeline zoom/scroll: pointer/touch,
keyboard and numeric point editing, snapping, locks, one-step release and local
preview cancellation that preserves redo. Committed edits reschedule only the
running gain envelope. GUI/native duplicate clocks now keep the last supplied
point; linear interpolation, held endpoints, microphone envelopes and format-3
save/open remain compatible. Chrome/WebKit exercise actual Save/Open, touch,
keyboard focus, undo/cancel and narrow German layout. Frontend 1,401 and native
65+3 tests pass; automation PCM parity is bounded rather than claimed exact.
See RELEASE_STATUS.md for measured errors and evidence. Installed app/CLI with
recovery preserved; no release tag or Apple upload. M2.3 still needs envelope
copy, pan/FX lanes and recording modes before M2.4 routing.


### 2026-10-11 — local 0.8.17: copy and retime gain envelopes

Continued M2.3 with an independent session gain clipboard and reviewed cross-track
paste. Selections acquire interpolated edge values; destination length stretches
point clocks while gain stays linear. One-sample guards preserve the surrounding
curve, with locks, stale-dialog rejection, one-step undo and equivalent-paste
no-ops. Both native source-range and portable-envelope recipe forms produce the
GUI project. Chrome/WebKit actual Save/Open and live playback checks pass;
1,407 frontend and 67+3 native tests pass. Native 20-second float output and
boundary samples were checked with measured tolerances; see RELEASE_STATUS.md.
Installed local app/CLI with recovery preserved; no release tag/Apple upload.
M2.3 continues next with pan/selected FX lanes and recording modes.

### 2026-10-11 — local 0.8.18: editable absolute pan envelopes

Continued M2.3 with a pan parameter selector in the shared automation lane,
signed points, live scheduling without source restarts, empty-lane static fallback,
locks, Save/Open and range retiming. Native recipes/rendering use the same held
linear endpoints and duplicate policy. Mixer shows Auto while pan points exist.
Corrected centered mono exports to match playback's equal-power law; stereo
center remains unchanged. All 1,410 frontend and 70+3 native tests pass; Chrome
and WebKit full mono/stereo comparisons stay within 1.64×10⁻⁷ full scale.
Gain direct/copy regressions pass. Local app/CLI installed with autosave preserved;
no release tag/Apple upload. Pan copy/retime, FX lanes and recording modes remain.

### 2026-10-11 — local 0.8.19: pan envelope copy and retime

Extended the reviewed envelope workflow to signed pan with an independent session
clipboard, static-pan snapshots, interpolated selection edges and one-sample
outside guards. Destination length stretches point clocks without changing gain,
static pan, media clocks or metadata. GUI and native track-range/portable recipe
forms agree; mismatched parameter tags fail. All 1,412 frontend and 71+3 native
tests pass. Chrome/WebKit actual UI, live, Save/Open and compact German touch
checks pass; measured native boundary-sample error stays below 5.96×10⁻⁸ full
scale. Gain regression also passes. Local install preserves recovery; no Apple
release. Continue M2.3 with selected FX lanes and protected recording modes.

### 2026-10-11 — local 0.8.20: delay wet/dry automation

Continued M2.3 with the first selected FX lane: track delay mix, using timeline
point editing, percent fields, locks and one-step undo/cancel. Envelopes stay with
rack inserts; complementary wet/dry ramps update live without rebuilding delay
history. Scoped insert/extract retimes FX points and lift retains clocks. Format-3
save/open and native effect-automation recipes preserve geometry. GUI/native
range exports process preceding history before cropping. Chrome/WebKit checks
cover actual lane controls, Save/Open, reorder, locks and German phone touch;
complete four-second stereo native comparisons differ by at most 2.39e-7 full scale.
Other FX parameters, FX clipboard and protected recording modes remain M2.3 work.

### 2026-10-11 — local 0.8.21: delay feedback automation

Added an independent delay feedback lane with 0–95% linear ramps, held endpoints
and static fallback. Live edits preserve echo history and the wet/dry envelope.
Track point editing, locks, undo/cancel, format-3 save/open, rack copying/reorder
and scoped range retiming retain both parameters. Native effect-automation recipes
accept feedback and preserve mix/media geometry. Chrome/WebKit real-control and
full stereo PCM checks pass; further selected FX parameters, FX clipboard and
protected recording modes remain M2.3 work.


### 2026-10-11 — local 0.8.22: protected automation recording

Added explicitly armed Read/Touch/Latch/Write capture on gain, pan, delay mix and
feedback. Live audition is a session draft; Stop presents bounded intervals for
review and one-step Apply, with original outside guards and cancel/redo protection.
Seeks, loops and interruptions discard capture. Native automation-pass recipes
match GUI points; float-roundtrip JSON preserves clocks. Fixed live delay
scheduling after seeks into a running AudioContext. All 1,417 frontend and 76+3
native tests pass; Chrome/WebKit real-control and full stereo PCM comparisons
pass. Local app/CLI install preserves recovery. FX envelope copy/retime and
additional curves/parameters remain M2.3 work; no Apple release.


### 2026-10-11 — local 0.8.23: delay envelope copy/retime

Added independent mix/feedback session clipboards to track delay lanes, including
interpolated range edges and static snapshots of empty lanes. Reviewed paste
retimes a bounded interval on another delay insert while preserving other settings,
outside envelopes, media geometry, cancel/redo and one-step undo. Locks, stale
rack reviews and recording protection apply. Native source-range and tagged portable
paste-effect-automation recipes match GUI. All 1,421 frontend and 77+3 native tests
pass; Chrome/WebKit actual UI and complete stereo PCM comparisons pass. App/CLI
install preserves autosave; additional curves and selected FX parameters remain
M2.3 work. No Apple release.
