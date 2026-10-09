# Speech transcription and word editing (local 0.8.5)

Open **Timeline → Workspace → Transcript**. Choose the current audible mix or one
microphone track. A selected microphone is transcribed even if it is muted in the
mix; its gain, automation and effects still apply. Transcription renders the edited
arrangement, including clip source offsets and gaps, not the original file clock.

On this development Mac, ASR setup detects the existing CrispASR executable and
Cohere Q8 model. Elsewhere choose both local files under **ASR setup**, or configure
`CRISPAUDIO_ASR_EXECUTABLE` and `CRISPAUDIO_ASR_MODEL`. Settings persist locally.
Language defaults to `de`. `auto` alignment selects the German wav2vec2 aligner
for `de`; the first invocation downloads it through CrispASR. A local aligner path
or a `wav2vec2-aligner-<language>` registry alias is also accepted.

Click **Transcribe with CrispASR**. This desktop integration runs the installed
CrispASR CLI without a shell. It renders linked 48 kHz mono/stereo sources through
the native mixer, uses 15-second ASR chunks, requests full JSON and forced alignment,
and requires word timestamps. Cancel stops the native job and its process; a
changed arrangement cannot receive a stale transcription. The ASR executable,
ASR models and alignment models are external, not bundled dependencies. Cohere
Transcribe 03-2026 and the German xlsr-53 wav2vec2 alignment model have Apache 2.0
model cards in the existing CrispASR checkout. No new codec dependency is added.

Select a word in the spoken-word editor. Use the seek button to review it, and
inspect/correct its start and end if necessary. **Delete / Backspace** while the
word editor is focused, or its trash button, extracts that interval and closes the
gap across **every audio lane and the picture lane**, including lanes excluded
from ordinary ripple edits. Video bounds expand outward to whole frames to cover
the word; the actual cut interval is displayed. Audio-only cuts use word times
on the audio sample clock. An adjacent word crossing the proposed frame cut, a
locked affected lane, or a boundary inside a picture blend blocks the operation.

The operation preserves source files, source offsets, AV/edit groups and unrelated
mix settings. Later words, markers, automation and the canvas floor are retimed.
It commits once: **Undo** restores words, sound and picture together. Word timing
is saved with the project. Moving, slipping or otherwise rearranging audio after
ASR invalidates its arrangement guard; transcribe again before a word cut.

Caption textareas below are explicitly **text-only corrections**. Editing a cue
clears its word alignment instead of retaining timestamps for different words.
SRT/VTT imports have cue timing only; they cannot supply word deletion. Full
CrispASR JSON imports retain genuine `words[].offsets` in milliseconds, not the
legacy centisecond token fields. Saving the project retains word timings; SRT
export retains only captions. ASR is not implemented on iOS/Android or the web.
Saved aligned words can still be edited there; a browser viewport test does not
validate physical iOS behavior. Alignment remains a model estimate: review cuts.

## CLI

```sh
crispaudio transcribe-project --input interview.crispaudio \
  --output interview.words.json --executable /path/to/crispasr \
  --model /path/to/cohere-transcribe-q8_0.gguf --language de --aligner auto
```

Output is full CrispASR JSON, suitable for Transcript import. A document's optional
`renderRange` is respected; `crispaudioOffset` restores its arrangement offset when
imported. The GUI transcribes the full arrangement. To automate deletion in an
already saved word-timed project, use `edit-project` with a recipe:

```json
[{"op":"delete-word","wordId":"the-persisted-word-id"}]
```

Native recipes use the same all-lane extraction, frame coverage, lock and adjacent
word rules. Render that edited project as usual. Outputs do not overwrite files.

## Validation

The real Canon/H6 MVI_8251 interview supplied a 44–59 s excerpt. Cohere Q8 plus
German wav2vec2 forced alignment produced 35 timed words. The browser test selects
“Muslimen”, deletes it through the actual editor, checks all three microphone
source offsets and the picture source offset, undo/redo, project round-trip and
German phone controls. Its frame-covering cut is 44.96–45.48 s (0.52 s).
Native `delete-word` recipe clocks agree with GUI clocks to sub-sample tolerance.
The resulting project is rendered to WAV and MP4 for a 44–46 s review interval.
The WAV’s 96,000 stereo frames are byte-identical to the original PCM with the
selected interval removed. MP4 sound/picture durations are both exactly 2 seconds
at 25 fps. Re-transcribing the edited excerpt no longer yielded “Muslimen”;
recognition also changed nearby wording, so the exact PCM comparison is the
stronger cut check. The final UI harness used installed headless Chrome; the external
WebKit runtime stalled on startup after its initial word-deletion checks.

`scripts/test-spoken-editor.mjs` reruns this with explicit private fixture paths.
Unit tests cover imported timestamp units, missing/invalid timestamps, locked
lanes, adjacent words, stale arrangement guards, ASR invocation and changes during
ASR. Fixtures, recordings and derived projects stay outside git.
