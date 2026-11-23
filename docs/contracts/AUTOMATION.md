# Automation passes, curves and shape handles — implementation contracts

Binding rules for automation recording/passes, envelope copy, curves, mix/chorus/reverb automation, shape handles. Read before changing that code.
Moved verbatim from CLAUDE.md on 2026-11-23; version numbers mark when each
contract was introduced. User-facing guides live in the other docs/ files.

## Protected automation passes (0.8.22)

AutomationRecorder uses TimelineEngine.automationClock and previewAutomation to
capture/monitor gain, pan, delay mix/feedback without project/history mutations.
Explicit stopped-session arm; Read is default. Touch releases to the old lane;
Latch continues after first touch; Write starts at playback start. Capture is
frame driven on the audio clock, with point clocks quantized to project samples.
Stop reviews bounded spans. applyAutomationPass uses original one-sample guards,
retains other parameters/geometry and returns identity for equivalent passes.
Native automation-pass mirrors this; serde_json float_roundtrip preserves clocks.
Seeks/loops/generation changes, blur/hidden tab, pointer cancellation, source/project
changes and lane unmount discard drafts. Apply rechecks project/source identity
and locks, and requires stopped playback. Modes/arming/drafts never serialize or
autosave. Existing offline/native outputs render committed points as usual.
Live FX scheduling must distinguish realtime via scope, not AudioContext identity:
the realtime context is proxied for node cleanup. Never reset delay history to
preview automation. Preserve source/project recovery during local installs.

## Delay envelope copy/retime (0.8.23)

effectEnvelope.ts snapshots a selected range/full canvas as a tagged relative-clock
mix/feedback envelope, including static fallback for an empty lane. Independent
session clipboards survive loads but are omitted from project serialization and
undo. GainEnvelopePaste reviews the destination insert/clock/length against its
project snapshot; locks and rack/project changes reject stale reviews. Playback
can continue without resetting delay history. Paste uses applyAutomationPass's
original outside guards/identity rules, preserving other parameters and geometry.
Native paste-effect-automation accepts sourceTrackId/sourceEffectIndex plus
sourceStart/sourceEnd, or envelope:{effectType:"delay",parameter,duration,points}.
Destination trackId/effectIndex and parameter are explicit; indices are zero-based.
Portable mix/feedback tags must match; untargeted effect settings never change.
An empty portable envelope uses delay defaults (.3 mix/.4 feedback), while GUI
copy of an empty lane captures its actual static value. Delay history may affect
audio after a replaced interval although the outside envelope is preserved.
Optional actual-UI/native harness: scripts/test-effect-envelope-copy.mjs.

## Outgoing automation curves (0.8.24)

GainPoint.curve is optional "linear"|"step"; absent means Linear. Curve controls
that point's segment to the next clock, not the incoming segment. Step holds then
jumps exactly at the next point; endpoints hold. All gain/pan/delay mix/feedback
lanes and clip/master delay metadata use these rules. schedulePoints implements
Web Audio jumps/ramp scheduling; native Automation keeps the outgoing Step flag.
Curve selector appears for a selected point and respects locks/recording. Pointer,
keyboard and numeric edits must carry the point's metadata (including gain dB).
Format3 save/open preserves curves; unknown/null curves reject before opening.
Native point edits and enabled DSP accept the supported curves and reject unknown shapes.

Partial copies inherit the original outgoing curve at their first boundary.
Paste/pass outside right guards restore the original curve; final supplied points
use Linear for the one-sample boundary bridge. Equivalent checks evaluate interval
midpoints as well as point clocks so Step and Linear cannot be mistaken as equal.
Range resume boundaries inherit their original curve; insertion into Step holds
its preceding value through the gap. Capture drafts remain frame-sampled Linear
points; committed passes restore the outside Step segments. GUI range exports use
renderMixRange (prefix/crop), not renderToBuffer(start,end) which starts fresh DSP.
Optional real UI/native PCM audit: scripts/test-step-automation.mjs.

## Selected mix automation (0.8.28–0.8.30)

Ring-modulator, bit-crusher and distortion mix reuse the shared 0–1 lane,
shape/pass guards and independent tagged clipboards. Empty static mix defaults to
0.5. Native effect_envelope::supports and GUI supportsEffectParameter admit mix
only for these types; drive/bits/carrier frequency remain static. Live mix edits
retain each effect graph; other static settings still rebuild. Track controls are
direct; clip/master envelopes also render and retime with range scope.

Keep source clip durations intact in offline prefix renders. The context crops
output; stopping a source at the range boundary changes the final oversampling
block. Test-distortion-{automation,copy,recording,racks}.mjs audit actual UI/native
PCM. The rack fixture reaches dry mix at the clip end; abrupt wet ends have a
separate inherited tail limit, explicitly audited by test-distortion-tail.mjs.
That audit fails unless an explicit baseline proves unchanged native static WAVs;
known-limit reporting is not a parity pass. See RELEASE_STATUS.md for the measured
limits, including long WebKit delay and upstream gain/bit-crushing precision.

## Chorus mix automation (0.8.31)

Chorus uses the same mix point/shape/pass/clipboard paths, with its own chorusMix
clipboard and chorus portable tag. Empty mix defaults to 0.3, unlike ringmod,
bitcrush and distortion (0.5). Rate and depth remain static. Live mix changes
retain both delay lines and LFO phase. Native static/empty-envelope DSP stays
unchanged. Chorus UI/native audits use the established chorus DSP budget of
1e-4 peak / 1e-5 RMS and report stricter 2e-6 mix diagnostic failures separately;
do not describe those cases as passing 2e-6 parity. Range/full crop remains exact.

## Reverb mix automation (0.8.32)

Reverb joins the shared mix editing/shape/pass/tagged clipboard paths. Empty
mix defaults to 0.3; size and decay remain static. scheduleMix has an optional
seventh dryScale argument, default 1; reverb passes 0.7 on graph creation, live
update and recording preview/restoration. Its mixNodes entry must retain that
scale. Do not turn reverb into a fully wet blend at mix=1. Native set_mix changes
only wet/dry gains, preserving direct-head and FFT partition history. Empty
native envelopes retain the old static DSP. Both GUI/native convolve through
mix=0 so later wet changes reveal the existing tail.

## Saved shape review handles (0.8.33)

GainPoint.shapeReview is optional advisory metadata: shape, intervals (2..16),
and controls for custom shapes. Validate it alongside curve metadata in GUI and
native paths. Playback uses the existing linear baked points. Reopen a whole span
only when every point matches the saved shape and spacing; changed/truncated
spans fall back to adjacent-segment review. Full copy/stretch keeps dimensionless
controls, with exact-boundary shapeReview fields carried by curveFields/decorate.
Reapplying the saved shape preserves identity/redo. Linear removes its interior
points and metadata; use the entire old segment for equivalence checks. Older
shapes without metadata stay ordinary points; never infer handles from their audio.

## Direct automation shape handles (0.8.34)

AutomationCurveHandles edits only intact custom shapeReview spans on the lane's
clock/value scale. Local CurveDraft points preview without store writes; pointer
release or arrow keyup commits once against the original project identity.
Escape, pointer cancellation, blur and stale project changes discard drafts.
Recording and locks hide handles. No DSP/native representation change.

## Direct Linear/preset handles (0.8.35)

curveHandleSegment distinguishes an intact saved span from ordinary adjacent
Linear points; damaged shapeReview must not silently fall back to a shorter
handle span. shapeHandleControls expresses polynomial presets as exact cubic
controls with x1=1/3,x2=2/3. Exposing/moving back to baseline must preserve project
identity; only a changed curve becomes custom through shapeAutomationSegment.
Exclude Step/flat/last/short/out-of-bounds spans before pointer gestures.

## Chorus depth automation (0.8.36)

Chorus alone supports depth 0..1, default .5, with chorusDepth clipboard. The
shared legacy DelayParameter union now includes depth; effect predicates still
restrict depth to chorus. scheduleChorusDepth multiplies values by .01 seconds on
both LFO gains. createChorus optional seventh callback preserves old arity5.
TimelineEngine schedules/updates/previews both gains without graph restart;
transport key strips chorus depth and mix only. Native Chorus.depth_automation
sets per-frame amplitude, while empty/static branches keep the previous scalar.

## Interior shape selection (0.8.37)

`reviewedShapeForPoint` resolves a saved shape's start or strict interior point,
using the existing integrity check and at most sixteen preceding points. Right
endpoints belong to the outgoing span; damaged hints and older unannotated
curves never infer parent shapes. Direct handles use the resolved `a.time` for
`shapeAutomationSegment`; the review dialog also uses that original start. The
lane keeps its actual selected point for numeric, movement and deletion edits.
No native recipe, DSP or project format changes. Native shape recipes still
address the original start point, not an interior selection.

## Chorus rate automation (0.8.39)

Rate is chorus-only, 0..8 Hz, default1.5, independent chorusRate clipboard. The
optional eighth createChorus callback exposes both oscillator frequencies;
createChorus.length stays5. Schedule frequencies at ratio1/1.2; live update and
Read restoration retain oscillator phase and buffer history. NativeChorus rate
phase integrates prior per-frame frequency, including silent time before a late
clip. Empty-rate branch retains legacy static DSP. Rate copy protects outside
parameter values, not later audio phase. Preserve existing delay keyboard steps.
