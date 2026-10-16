# Import transcripts and edit speech

Create transcripts and generated speech in **CrisperWeaver**. CrispAudio imports
the resulting audio and timed text for captions, editing and mixing. TTS creation
was removed in 0.13.22; ASR launch/setup controls and their app commands are removed
in 0.13.25. Existing audio and saved transcripts remain editable.

## Choose the matching clock

| What was transcribed? | Import destination | Timestamp meaning |
|---|---|---|
| The exact current timeline mix | Workspace → Transcript → Import timed transcript | Project time; use the offset field for an exported excerpt |
| An original recording before timeline edits | Source transcript → choose that recording → Import | Original source time, starting at zero |

JSON, SRT and VTT import through a desktop file picker or a browser/mobile file
input. The source view maps original times through trims, repeats, reverse and
speed changes. Use the current mix view only when the transcribed audio matches
that arrangement. Neither view can detect whether you chose the correct recording.

Imports reject invalid timing and times beyond their destination duration. A
changed project, replaced source or closed view cannot receive a late file read.
A successful import is one undoable edit. Source records replace only that source's
transcript; other source transcripts stay intact.

## Cue timing and word timing

CrisperWeaver's current standard JSON exporter writes `segments` with `text`,
`startTime`, `endTime`, `speaker` and `confidence`. CrispAudio reads that format,
including its disclosure-wrapped form. **That exporter currently omits words.**
Its JSON export and SRT/VTT therefore support timed captions, search and passage
selection, but do not provide word cuts. A word-preserving CrisperWeaver export
remains a cross-app follow-up; it was not added by changing CrispAudio.

For word editing, import genuine aligned word timestamps, for example:

```json
{"segments":[{"text":"Hallo Welt","startTime":1,"endTime":3,"words":[
  {"word":"Hallo","startTime":1,"endTime":2},
  {"word":"Welt","startTime":2.1,"endTime":3}
]}]}
```

CrispAudio accepts `text` or `word` for each word, `start`/`end` or
`startTime`/`endTime` in seconds, and existing CrispASR `offsets.from`/`to` in
milliseconds. It never derives word timing by dividing subtitle duration.
JSON's optional `crispaudioOffset` and the timeline import offset shift both
cue and word times. Source imports use source time rather than an arrangement
offset. Saving a project retains word times; SRT export retains cue timing only.

## Cut and review

Select a timed word in the speech editor. Seek to review it and correct its
start/end when necessary. **Delete / Backspace** in the word group, or its trash
button, extracts the interval across every audio and picture lane and closes the
gap. Video cuts expand to whole frames. An adjacent word crossing that cut,
a locked affected lane or a boundary inside a picture blend blocks the edit.

Cuts preserve original media, AV/edit groups and unrelated mix settings. Later
words, markers, automation and the canvas floor move with the edit. **Undo**
restores words, sound and picture together. Genuine word-timed timeline imports
capture an arrangement guard: moving or slipping clips afterward blocks stale
word cuts until you import alignment for the current mix. Existing saved guards
are retained; older projects without a guard remain readable.

In Source transcript, select mapped words, choose Lift or Extract and review the
ranges before applying. Source-word corrections and speaker labels remain on the
original recording clock. Partial words and cuts into unselected neighbouring
words are blocked. The original source transcript survives timeline edits.

Caption text corrections change text only and clear that cue's word alignment.
For deletion-only edits to a pasted shortened transcript, see
[Keep-text editing](KEEP_TEXT_EDITING.md).

## Existing CLI compatibility

The independent media CLI retains its existing external ASR helper command for
scripts. It is not exposed by the app and is not the recommended creation workflow:

```sh
crispaudio transcribe-project --input interview.crispaudio \
  --output interview.words.json --executable /path/to/crispasr \
  --model /path/to/model.gguf --language de --aligner auto
```

Existing word-timed projects also support `edit-project` recipes such as
`[{"op":"delete-word","wordId":"the-persisted-word-id"}]`. These preserve the
same all-lane, frame, lock and neighbouring-word rules. The media CLI and its
external tools/models retain their existing platform and license requirements.

## Validation

The 0.13.25 handoff checks cover the current CrisperWeaver cue-export schema,
genuine word JSON, caption-only formats, import cancellation, late reads,
arrangement guards, source mapping and word deletion/Undo. The browser workflow
uses the bundled audio/video sample, actual file inputs, project save/reopen and
WAV encode/decode. It does not establish physical iOS acceptance or recognition
quality. See [checkpoint evidence](evidence/transcript-handoff.json).

Earlier real Canon/H6 word-cut validation remains reproducible through
`scripts/test-spoken-editor.mjs` with explicit private fixture paths. The legacy
ASR creation checks in that history describe an older app, not the current GUI.
