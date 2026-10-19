# Source edit window provenance

Source 0.13.66 records complete **coordinate provenance** for new, unretimed source
edit histories. This is groundwork for mixed-history replay; the mixed-history
editor remains gated. The existing single external-effect editor is unchanged.

## Stored contract

`SourceEdit.journal` version 1 fixes a uniform decoded PCM `sampleRate` and
`channels` for the history. `sourceId` names the retained original. Each operation
has `window: {start, frames}` in that original's sample clock. Its effect ranges
remain half-open samples local to that operation's window.

A new operation can keep or crop the previous window; it cannot expand it. Earlier
windows and ranges remain intact. `SourceEdit.offset` equals the last window start
in seconds. The current derivative has exactly that last window's frame count.
Subsequent timeline trim/split offsets remain inside the derivative and do not
rewrite the recorded windows.

For example, at 48 kHz:

| Step | Original window start | Frames | Local effect range |
|---|---:|---:|---|
| First effect, beginning 0.5 s into original | 24,000 | 48,000 | 0–48,000 |
| Trim 0.25 s, process the next 0.5 s | 36,000 | 24,000 | 0–24,000 |

A future replay must process the entire first window, then crop 12,000 frames from
that result before running the second operation. Processing only the last window
from the original would lose the first effect's preceding history. Neither fitting
ranges nor matching the final offset can establish missing earlier windows.

## Capture and validation

`appendSourceEdit` records metadata before ordinary Source Editor Apply encodes or
persists its derivative. It copies the new recipe/ranges and quantizes the origin
to the sample boundaries actually copied. It preserves earlier operation windows.
The original and intermediate sources keep their existing Undo/Redo references.

A first edit starts a verified coordinate history. Appending to a previously
verified history preserves it after checking the retained original and complete
current derivative. Legacy histories are not promoted automatically. Truncation
beyond the existing 64-operation limit drops the completeness marker; it must not
suggest that the remaining suffix can be replayed from dry original PCM.

Reversible retiming preserves the pre-retime history and validates it against the
retained pre-retime derivative. Destructive processing after retiming drops the
completeness marker. Retimed recipe editing remains unavailable.

Portable/linked project saves and recovery share decoded-audio checks. Reopen
checks structural metadata before decoding and checks the actual buffers afterward.
Missing originals, wrong decoded rates/channels, out-of-original windows, expanded
crop windows and mismatched final frame counts cannot publish a verified history.
The checks cover visible clips, comp bases and frozen originals. Legacy projects
without the marker keep their existing behavior.

## What this does not establish

Coordinate provenance does not validate a processor's parameters, prove historical
byte equivalence or enable replay by itself. In particular, the coordinate sample
rate does not assert the old external helper's file/DSP rate. Older app versions
may discard the optional completeness marker when editing; such histories remain
unverified when reopened here. No project format version bump is required for this
optional metadata.

The next implementation must admit explicit processor types, validate their saved
parameters/state, replay in order with each recorded crop and preserve unselected
PCM/channels. Use fresh plug-in base states and owned helper/conversion paths. Apply
must replace the chosen operation while preserving every other operation, one
Undo/Redo, original mapping, sibling sources and portable reopen. Reject unsupported
processors or insufficient legacy provenance; do not silently omit them. Partial
publication, stale replies, cancellation and working-set limits need qualification
before opening the mixed-history UI. Built-in chains/restoration and additional
Native admission retain their separate DSP/rate/history acceptance requirements.


One possible legacy migration is an explicit fresh Render + Apply in the existing
single-effect recall editor. The newly observed pass could seed a verified window
for subsequent edits. That promotion is not implemented here; qualify exact sample
origin/offset handling, originals, siblings and Undo/reopen before adding it.
