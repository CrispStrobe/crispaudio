# Range, trim, slide and group editing — implementation contracts

Binding rules for range edits, locks, trims, roll/slide/ripple, transitions, named groups, pointer trim feedback. Read before changing that code.
Moved verbatim from CLAUDE.md on 2026-11-23; version numbers mark when each
contract was introduced. User-facing guides live in the other docs/ files.

## Range/lock foundation 0.8.0

Optional project.editRange is independent of clip selection and video export In/Out.
Selection mode and rangePlayback are transport/view state. Play range snapshots its
bounds; the live engine takes optional endTime and gates its master output on the
audio clock. Offline/native exports remain unchanged. Existing loop restart is RAF
based, not seamless sample-accurate looping. Range pointer gestures coalesce history.

projectStore wraps action and public setState commits to reject changed segments or
removed/replaced sources on locked audio tracks, and changed clip/source/path data
on the locked picture lane. Reject the whole linked/clipboard operation. Mixing,
copy and lane order remain available. Temporal undo/redo restores full historical
snapshots; explicit loadProjectState bypasses protection and clears rangePlayback.
Use i18next's existing singleton for notices, not the UI-initialising i18n module.
CLI recipes compare protected clip data before publishing an edited document.
No API control is a substitute for this central commit guard.

## Scoped range edits 0.8.1

rangeEdits.ts and media/src/range_edit.rs share lift/extract/insert semantics.
Track/video rippleEnabled defaults true. Require the whole affected link group
in scope; locked affected lanes reject atomically. Preserve excluded lanes and
unaffected transitions. Block boundaries inside blends/cues; validate resulting
picture topology. Retime included track automation with boundary values; optional
global retiming includes minimumDuration, markers and transcript cues. GUI previews
the immutable project then commits once, rechecking project identity. CLI range-edit
and legacy ripple share this helper. Optional scripts/test-range-edits.mjs checks
the real dialog/undo and native semantic parity without comparing generated IDs.

## Advanced trim slice 0.8.3

trimEdits.ts and project_edit::advanced_trim share roll/ripple-trim/playhead trim.
Select left clips of a common cut, resolve one abutting neighbour per lane, and
require the whole right link group. Source bounds and locks reject before commit;
rolling blends/ambiguous neighbours remain unsupported. Right roll durations use
the original outer endpoint. Compare sample counts/tolerance for floating sums,
not bitwise decimal duration equality. Ripple extension inserts the gap before
growing the target; validating a standalone extension first would wrongly reject
the old neighbour overlap. Ripple shortening delegates to range-edit. Picture
participation requires a frame-aligned ripple edge. GUI previews immutable state
and commits once; native recipes preserve unknown metadata and final lock checks.
Edit navigation skips equal boundaries and stops playback. Native accelerators
own macOS navigation; browser handles Cmd/Ctrl+Alt+Left/Right. Optional actual
WebKit script checks dialog/source limits/undo/navigation and eight recipe cases.

## Named groups / command search 0.8.4

Clip.editGroup {id,name} is separate from linkGroup and survives spread-based
splits/range fragments. Optional project.groupEditingEnabled defaults true.
linkedIds computes transitive closure across enabled named groups and AV links;
sourceOnly is used by unlink so unrelated links in an edit group are not broken.
Direct audio move/trim/split/delete paths and selection honor groups. Central lane
locks still reject whole commits. Paste and Load tracks remap edit-group IDs
independently from AV IDs; never reuse the original group's identity for copies.
Range helpers reject excluded members of affected named groups unless grouping
is explicitly disabled. Native recipe selection uses the same closure; advanced
rolling checks right-hand group completeness. Snap targets exclude all movers.

CommandSearch closes its portal synchronously before dispatchNativeMenu; otherwise
the modal guard rejects its own command. Cmd/Ctrl+K is native-owned on macOS.
EditGroups and command search use the existing Modal/ToolButton patterns, EN/DE
labels and phone wrapping. Optional test-edit-groups.mjs checks actual UI and
four native semantic cases. This metadata changes neither DSP nor codec licensing.

## Slide editing 0.8.7

`trimEdits.slideClips` and `slideLimits` implement reviewed fixed-content slides;
`media/src/project_edit.rs` accepts `slide` with ids/seconds. Require matching
middle spans, abutting unique neighbours, complete link/group closure, unlocked
lanes and source handles. Picture edges/movement use project frame rate; incoming
blends are rejected. Preserve middle source offsets/durations and outer endpoints;
clamp only neighbour fades. Markers/automation remain on the timeline; existing
transcriptLayout signatures become stale and block speech cuts until re-ASR.
Optional `scripts/test-trim-edits.mjs` supports headless Chrome or WebKit, actual
dialog/undo and GUI/CLI recipe parity. M1 still requires advanced transition trims.
CrispEmbed/crisp-docx contextual word alignment is unnecessary for deletion-only
transcript matching; acoustic timestamps still come from CrispASR forced alignment.
No AGPL crisp-docx source/dependencies were copied into this MIT application.

## Transition rolling 0.8.8

`rollCut`/CLI `roll` accept existing two-clip picture overlaps matching the incoming
transition duration. Keep transition properties unchanged; move left end and right
start/source offset by the same frame displacement. Preserve outer endpoints and
relative linked audio/picture offsets. Validate original/final topology, source
handles, frame-aligned overlap edges, locks/groups and at least one frame beyond
the overlap on each clip. Slide/ripple/range blend semantics remain unfinished.
`test-trim-edits.mjs` covers real dialog/undo and recipe parity; optional macOS
`test-roll-blend.py` checks actual native dissolve colours and output duration.
Keep README about current capabilities; version narratives belong in history.md,
CHANGELOG.md and implementation records, not append-only README sections.

## Transition slide 0.8.9

Slide matches logical start (`picture.startTime + incoming overlap`) and outer end
across linked clips, rather than requiring equal raw AV spans. Find left by logical
start and right by its logical start at middle end. Preserve middle offsets/lengths
and both transition properties; shift all middle starts and right starts/offsets,
trim left/right neighbours. Limits retain one frame outside overlaps. Original/final
picture validation, source limits, locks/group closure and ambiguous-lane rejection
remain enforced. Markers/automation stay fixed; old acoustic alignment is stale.
Optional `test-slide-blend.py` verifies both native Apple transition windows;
`test-trim-edits.mjs` covers dialog/undo and GUI/CLI recipe parity.

## Transition ripple trims 0.8.10

Ripple left trims compare logical incoming picture boundaries with linked audio.
Reviewed trim shapes preserve selected IDs/links and transition metadata; following
picture shifts with duration change. `rangeEdits.trimmedClips` and crate-internal
`range_edit::apply_trim` share original scope/lock/group/global retiming checks.
Changed overrides count as affected even when a clip ends at an insertion point.
Recipe JSON cannot supply native overrides; ordinary range edits retain the blend
boundary guard. Initial/final picture topology and source/body/frame limits apply.
Shortening retimes surviving alignment; extending source speech keeps its old layout
signature stale. Optional `test-ripple-blend.py` checks all four native edge/direction
cases; trim browser harness verifies GUI/CLI parity and one-step undo.

## Reviewed range blend policy 0.8.11

`rangeEdits` / native `range_edit` default to preserve; public range recipes may
explicitly set `transitionPolicy: "cut"`. Convert only actual overlaps crossed by
normalized boundaries, at the outgoing clip end: advance incoming start/source
by its overlap, shorten duration and set transition cut/0. Preserve original scope
and lock checks before conversion. Validate initial/final topology, frame edges
and surviving body; fit shortened picture fades. RangeEditDialog lists resulting
cut times before commit. Internal ripple shapes still bypass only their reviewed
blend boundaries. Speech edits must not silently opt into cut conversion. Lift
retains the original canvas even without a previous minimumDuration. Optional
browser and native Apple harnesses: test-range-edits.mjs / test-range-blend.py.

## Pointer trim source feedback 0.8.12

`trimFeedback.pointerTrim` uses the press snapshot for audio and picture; never
independently clamp audio duration/offset. Bound the same displacement across all
linked/named-group partners, timeline zero and source ends. Linked picture clamps
inward to frame edges and retains one frame. Existing topology guards still apply.
`TrimSourceFeedback` portals outside clipped rows; mount its project subscription
only while active so idle metadata/transport does not commit canvas React work.
Capture pre-gesture temporal history using pointerHistory; Escape/cancel restores
project and history (including redo), while release commits one step. Idle views
must not end another view's gesture. Trim stops audio playback; blur/unmount finish
the last valid edit. Optional source-pointer/workflow browser harnesses validate
these controls plus real file actions and native range renders. M2 mixer is next.
