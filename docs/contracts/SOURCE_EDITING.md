# Source editor, restoration and saved effects — implementation contracts

Binding rules for Source Editor audition/utilities/restoration, saved-effect recall/masks, operation journals, Apply ownership. Read before changing that code.
Moved verbatim from CLAUDE.md on 2026-11-23; version numbers mark when each
contract was introduced. User-facing guides live in the other docs/ files.

## Source audition (0.13.28)

`SourceAudition` replaces equal-size source buffers at the concatenated selection
clock, crossfading for 10 ms. Every fading voice is explicitly anchored and reramped
on rapid switches; do not rely on cancelAndHoldAtTime alone for static gain (actual
Chrome PCM caught a dip). At most eight fading voices plus the active voice remain.
SourceEditor lazily caches its audition buffer; opening/redrawing does not duplicate
PCM. Original/Preview, normalization-target updates, Reset and loop toggles keep
playing. Range/channel edits, source replacement, recording, timeline playback,
Apply and close stop/release audition. RAF moves an overlay cursor without repainting
the full waveform; mapping uses the normalized joined ranges. Native source helpers
still render offline; only completed preview results replace the playing buffer.
No new true live native FX graph or loudness matching. Browser qualification:
`scripts/test-source-audition.mjs`; existing source-editor regression uses explicit
Original/Preview choices and muted Chrome. No new physical listening acceptance.

## Source utilities and click repair (0.13.29)

`sourceRepair.ts` supplies static polarity inversion, stereo swap/dual-mono/copy and
manual cubic gap interpolation. Keep channels/sample length and untouched samples
identical. Stereo tools require two channels and channel=-1; invert/repair respect
the selected channel(s). Every repair gap is <= floor(sampleRate*.001) samples with
two clean samples either side and between gaps; validate the whole request before
copying/processing. Slopes are limited and output clamped to clean anchor levels.
No invented spectral/declipping/click-detection claims. Repair quality evidence is
synthetic, not physical/varied-material acceptance. Utility previews share existing
source Apply/retained-original/Undo logic, and replace the current draft. The compact
section has one dropdown, wand, (i), and conditional repair-focus icon. SourceEditor
now draws connected samples and dots when zoomed closely (old zero-length min/max
lines vanished). Browser regression `scripts/test-source-repair.mjs` uses real temp
float WAV files through a fixture Tauri bridge; this is not a new production storage
implementation or physical listening test.

Repair-mode audition adds 100 ms each side and merges listening windows; repair
and saved operation ranges remain exact. The buffer cache keys context mode, and
entering/leaving repair mode stops audition before changing its window length.
Original/Preview then use identical context buffers, preserving their audition clock.

## Source restoration (0.13.30)

`sourceRestoration.ts` provides pure offline DSP; `runSourceRestoration` validates
budgets before copying/transferring PCM to one dedicated module worker per request.
Terminate on completion/error/abort. Limits: 32 MiB window, 8 channels, 8–192 kHz,
30 s selected and 120 s accumulated de-hum context. De-hum uses forward/backward
RBJ notches with 2 s source padding and 5 ms internal transitions. Spectral mode
uses 2048-point Hann STFT/OLA, normalized window weights, two-bin soft band edges
and internal transitions, writing only selected samples. Declip uses unclamped
cubic reconstruction of same-polarity flat hard-clipped runs of 2 samples to 2 ms with two clean
neighbours, rejects unsuitable estimates/long plateaus, and reports repaired/skipped
counts. Do not market this as full spectral healing or a universal declipper.

`SourceRestoration` has compact controls, advanced de-hum settings collapsed,
worker cancellation/stale source/selection/settings/record/project guards, and a
prepare-again indicator. SpectrogramDisplay optionally drags a frequency band;
numeric bounds remain the precise/touch/keyboard alternative. SourceEditor shares
a preview generation guard with native source helpers: only the newest requested
preview can install. Range/channel edits and Reset invalidate pending previews.

Source-edit operations retain numeric `parameters` alongside their derived PCM.
Clip ceiling is stored in dBFS but shown as percent of full scale to allow exact
50%/100% entry. Monitoring is a separate GainNode and dB control shared by A/B;
sourceAuditionHeadroom and preview peak checks lower hot monitoring, never saved
PCM. The monitor is released on stop, natural end, source/record/timeline changes,
errors and unmount; gain changes do not rebuild the source buffer. Auto headroom
is sample-peak based, not true-peak limiting or automatic loudness matching.

`scripts/test-source-restoration.mjs` exercises real workers, synthetic quality,
temporary float WAV fixture-bridge persistence, reopen/render, Undo/Redo, headroom,
manual A/B gain and cancellation. One worker dispatch is delayed ONLY by the test
fixture to deterministically prove newer Normalize supersedes an older request.
Other processing/cancel tests use real worker timing. Codec workers are persistent
by design; termination assertions filter restoration workers. No physical listening
or actual native plug-in DSP qualification is added. See docs/RESTORATION.md.

Integer-PCM full-scale plateaus are accepted within a small ceiling tolerance;
non-flat ordinary peaks and isolated single-sample candidates are skipped.

## Restoration qualification (0.13.31)

`node scripts/qualify-source-restoration.mjs` runs nonstationary synthetic DSP
fixtures without audio hardware or network media. It owns an isolated temporary
Vite cache; do not share optimizer caches with a running app dev server. Spectral
restoration uses a log1p frequency axis including DC; rendering, overlays and
pointers share frequencyAxis helpers. Other spectrograms retain linear defaults.
Keep real-recording/listening and native-input/cue qualification separate.

## Saved source-effect recipes (0.13.64)

Use `sourcePluginRecallPlan` and `commitSourcePluginRecall` for explicit saved-FX
editing. Render the complete retained original processing window before trimming;
keep the edited clip's source offset inside the full derived buffer. Replace the
saved operation instead of appending it to processed PCM. Other clips and original
assets must retain their references. A fresh source-rate pass need not reproduce
legacy file-rate or real-time/loop history byte for byte.

Mixed operation journals and retimed cases stay gated until their coordinate
windows and replay are implemented. Do not silently omit previous edits. Use the
owned source helper pass and conversion transaction for staging/protect/publication;
retain files if publication may already have begun. Snapshot memory and Native
admission remain separate from the Rendered recall slice. See the current handoff
for acceptance evidence and the next scoped work.

Before recalled Render/audition, stop and await the arrangement's native close
barrier through TimelineEngineContext. Recheck cancellation/ownership after that
await before stopping a source owner, so a late acknowledgement cannot stop the
replacement editor's audition.

## Saved-effect masks (0.13.65)

`prepareSourcePluginRecall` validates/copies the edited channel/ranges into its
prepared result. Apply persists that exact mask together with the recipe, rather
than consulting current UI state. Removing an old range restores dry original PCM.
All helper input remains the full original processing window; never crop a pass to
the new mask and lose effect history. Numeric drafts clear prepared audio. Keep
advanced mask controls collapsed and sample coordinates explicit. Mixed journal
replay remains gated until per-operation windows/crops/rates have safe provenance.

## Source operation coordinates (0.13.66)

Ordinary SourceEditor Apply calls `appendSourceEdit` BEFORE encoding/persisting PCM.
New complete histories carry journal v1 decoded sampleRate/channels and per-operation
original-source `window.start/frames`; ranges remain local to their own window.
Crop only between operations and never rewrite earlier windows. Offset is the last
window's exact sample origin in seconds. `validateSourceJournalAudio` runs through
the shared project/recovery validation path, including comp/frozen originals.
Reversible retime validates the retained pre-retime derivative; later destructive
retime processing and truncation drop completeness. Do not infer legacy provenance.
The marker establishes coordinates, not processor validity, historical DSP rate,
byte parity or mixed replay admission. See docs/SOURCE_EDIT_JOURNALS.md.

## Ordered saved-effect replay (0.13.67)

`sourcePluginRecallPlan` admits verified mixed journals only for explicitly known
processors, <=8 operations/30-second first window, decoded 44.1/48-kHz mono/stereo
and the PCM estimate. `SourcePluginRecallRender` processes the first original window
fully, crops preceding output into the next window and restores each saved plug-in
base. Replace only the chosen recipe/mask; never skip unsupported operations or
seed another edit from processed output/transient helper state.

`plan.frames/input/selectionVisible` describe the selected effect's processing
window; `outputFrames/displayInput/visible` describe the final derivative. Range
controls use the former; waveform/audition/owned Apply use the latter. Mixed
waveforms show all output channels, because later utilities can move an earlier
single-channel effect. Map mask overlays by original sample origins. Keep the
root epoch state/ref sticky across operation switches, plus close/join-before-helper
ownership ordering. Utilities yield between bounded synchronous stages. The marker
alone does not admit chains/restoration, arbitrary settings, legacy journals or
larger windows. Per the user's 19 October 2026 decision, legacy compatibility and
migration are not required: nobody depends on old development projects. Do not add
legacy migration or compatibility-only UI/tests. Target the current format, preserve
original media and active session/Undo assets, and reject unverifiable histories.
Next is ordinary source plug-in owned staging/publication. See the current handoff
and source editing guide.

## Ordinary source Apply ownership (0.13.68)

`SourceEditCommit.ts` owns ordinary draft publication: validate/copy PCM and capture
journal, encode/begin/write, protect, fresh check, one synchronous project/sources
publication, finish. Set publicationStarted BEFORE calling the store; subscribers
can throw after mutation. Unpublished owned files roll back; uncertain published
files stay retained for Undo/unsaved projects. No await between final check and
publication. SourceEditor subscribes to project/source-map/playback/recording during
Apply and latches abort through transient round trips; unmount aborts and duplicate
Apply is blocked. Keep subscriptions until finally. Preserve ordinary format support;
this is separate from recalled-effect admission. Ordinary external-effect preview
input staging is still pending; do not claim all source-file ownership is complete.
