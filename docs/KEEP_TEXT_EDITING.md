# Keep a shortened transcript (local 0.8.6)

1. Open **Timeline → Workspace → Transcript** and transcribe/align the recording
   with CrispASR, or import its full word-timed JSON. Subtitle timing alone is
   insufficient. Save the source arrangement before editing if you want a copy.
2. Under **Keep pasted text**, paste the shortened transcript. Alternatively use
   **Load transcript into field** and delete unwanted words/sentences/paragraphs
   there. Editing this draft changes no media until Apply.
3. Click **Compare text**. Review the kept word count, resulting duration and the
   source time ranges. Their time buttons seek the original timeline.
4. Repeated words/phrases can match multiple occurrences. Choose the timestamp
   and surrounding context from the occurrence list, or explicitly choose the
   earliest/latest complete matching sequence. Comparison continues to expose
   unresolved ambiguity. Apply is disabled until the mapping is resolved.
5. Click **Keep these audio/video passages**. Only the selected passages remain,
   joined in their original chronological order across all audio and picture lanes.
   **Undo** restores the complete arrangement and transcript in one step.

## Matching and cut boundaries

This is a deletion-only text edit. Unicode normalization, case, curly apostrophes,
whitespace, line breaks and punctuation differences are accepted. New wording,
translations and reordered passages are rejected rather than guessed. A timed
compound word such as `E-Mail` must be kept/deleted as a whole; splitting its
written form does not create extra acoustic timestamps.

Earliest/latest ordered subsequence passes detect ambiguity without a quadratic
alignment matrix. A resolved mapping retains the existing word IDs and genuine
CrispASR timing. It requires a complete valid transcript, and refuses stale ASR
alignment after audio movement/slipping. Limits: 1 MB pasted text, 100,000 lexical
tokens and 2,000 removal intervals. Occurrence lists show up to 200 candidates;
provide more context or use the explicit earliest/latest policy for longer lists.

Contiguous retained source words keep the audio/video between them, including
natural pauses. Omitting words separates passages and removes the intervening
material. Intro/outro and other material outside the selected timed passages are
also removed, including other tracks' content at those times. Video retention
bounds expand outward to whole frames; audio-only bounds follow the word timing.
An original non-frame-aligned canvas end is removed exactly without leaving a
tiny residual clip. A retained frame containing a word marked for removal blocks
Apply: review/correct its word timing first. Cuts inside picture blends and
changes to locked affected lanes remain protected.

Source files are unchanged. All tracks participate even if ordinary ripple is
disabled for a lane. Clips keep their source offsets, outside fades, effects and
AV/edit-group membership. Later words, markers, automation and the canvas floor
are retimed. Internal joins are cuts; no automatic crossfade is added. The saved
project retains the shortened timed transcript. Changing the draft or project
invalidates the review; compare again before applying.

## CLI

The GUI's **Export reviewed CLI recipe** saves the resolved word IDs:

```json
[{"op":"keep-words","wordIds":["first-persisted-word-id","next-persisted-word-id"]}]
```

Use that recipe against the same saved word-timed project:

```sh
crispaudio edit-project --input interview.crispaudio \
  --recipe interview.keep-text.json --output shortened.crispaudio
crispaudio render-project --input shortened.crispaudio --output shortened.wav
crispaudio render-project --input shortened.crispaudio --output shortened.mp4 --video
```

The recipe uses chronological source order; its array order does not reorder
speech. Native editing validates word IDs, alignment, frame coverage, lane locks
and cut topology. It never overwrites an existing output. CLI accepts the reviewed
ID recipe; pasted-text comparison and ambiguity resolution currently run in GUI.

## Relation to crisp-docx

[crisp-docx](https://github.com/CrispStrobe/crisp-docx) provides SimAlign token
alignment using contextual embeddings and maps translated text formatting. That
is useful for cross-language or rewritten text; it supplies no acoustic word
boundaries. This implementation independently matches deletion-only text to the
existing timed word sequence. No code/crate was copied or linked: crisp-docx is
AGPL-3.0-or-later while CrispAudio's current dependency policy is permissive.
Future correction/rewrite support can re-align the corrected full transcript with
CrispASR and then use this same timed retention workflow.

## Real interview validation

Cohere Q8 + German wav2vec2 aligned a 44–59 s MVI_8251 excerpt. Pasting:

> Zwischen Muslimen und Christen.
>
> die Werte, da sind viele: das ist die Barmherzigkeit.

retains 13 words and omits 22 from the timed excerpt. Source ranges are
44.24–46.16 s and 56.04–59.00 s; all other arrangement material is removed. The
result is 4.88 s. Actual headless Chrome GUI checks verify all three microphone
lanes and picture, undo/redo, saved-project round-trip, German phone controls and
GUI/native recipe parity. Its WAV contains exactly 234,240 stereo frames and is
byte-identical to the two corresponding original PCM passages concatenated.
Exported MP4 audio/picture measure 4.879979/4.879983 s (within one audio sample of
4.88 s), picture rate 25 fps. Private recordings and derived files remain outside
Git. `scripts/test-keep-speech.mjs` reruns with the same explicit fixture/browser/CLI
environment variables as `scripts/test-spoken-editor.mjs`.
