# Speech, transcripts and CrispASR audio tools — implementation contracts

Binding rules for transcripts, word/keep-text editing, CrispASR separation/VAD/beats. Read before changing that code.
Moved verbatim from CLAUDE.md on 2026-11-23; version numbers mark when each
contract was introduced. User-facing guides live in the other docs/ files.

## CrispASR / speech editing 0.8.5

Read docs/SPEECH_EDITING.md. media::asr calls a selected external CrispASR CLI on
native rendered timeline audio (15 s chunks, strict forced alignment, full JSON).
No shell or bundled model. German auto uses wav2vec2-aligner-de. Do not invent
word times from tokens/subtitles. transcriptLayout guards moved/slipped sound;
only valid globally retimed range edits refresh it. Caption corrections clear
word alignment. Spoken deletion explicitly includes all lanes, covers whole video
frames outward, rejects adjacent speech/blends/locks and commits once. Rust
spoken_edit mirrors GUI spokenEdits; compare doubles with sub-sample tolerance.
Optional real browser harness supports WebKit or installed Chrome headlessly.

## Pasted text retention 0.8.6

Read docs/KEEP_TEXT_EDITING.md. keepSpeech.ts independently tokenizes normalized
Unicode and computes earliest/latest ordered subsequences: never replace speech
using semantic similarity or infer timestamps from text. Ambiguous mapping needs
occurrence pins or explicit earliest/latest review. Keep contiguous word runs with
natural pauses; remove the complement, including untranscribed intro/outro, across
all lanes in descending time order. Commit once, preserve locked/linked/grouped
range rules and retime transcript/markers/automation. Rust keep_words consumes
reviewed IDs, not free text; GUI exports its recipe. Native/GUI range helpers keep
an exact terminal canvas end rather than leaving a sub-frame tail. Do not import
AGPL crisp-docx code under the existing permissive dependency policy. Optional
headless script test-keep-speech.mjs uses private interview media and actual GUI.

## Transcript handoff (0.13.25)

The app no longer discovers ASR executables/models or exposes transcribe_project /
crispasr_defaults. Keep the independent media CLI helper compatible. Use shared
TranscriptImportButton for desktop and browser/iOS file inputs; reject late reads
against the captured project, source and view lifetime. importedTranscript.ts
validates destination bounds and records speechLayout for genuine word-timed mix
imports. Source imports retain the original clock. Do not infer words from cues:
CrisperWeaver's current standard JSON exporter omits them. Its cue schema imports
successfully; word-preserving export remains a cross-app task. Source word records
must pass project roundtrip validation before commit. Old ASR preferences are
inert and ignored; do not delete user model files during this cleanup.

## CrispASR audio tools (development after 0.13.68)

Read docs/CRISPASR_AUDIO.md. media/src/crispasr.rs dlopens libcrispasr's C ABI
in-process (no subprocess, no Cargo/CMake dependency); never bundle/download
models. Only separation, speech regeneration, Silero VAD and Beat This! beats;
ASR/TTS stay in CrisperWeaver. Use crispasr_vad_segments, NOT vad_slices (it
merges close segments/fails over to ASR chunks and hides pauses). Chunk with
crossfades and check jobs::cancelled between chunks; bounded length mismatch only.
GUI drafts reuse SourceEditor Apply; stem tracks use one owned conversion
transaction and one Undo step. Pause tightening and beat markers share CLI recipe
semantics (tighten-pauses, beat-markers). Sections probe the library only when
expanded. scripts/build-crispasr.sh builds the pinned revision with opus/ffmpeg/
curl OFF into gitignored src-tauri/generated/crispasr (@rpath, @loader_path only)
plus a --config overlay; mac release workflows use it. Never link Homebrew libs.
Downbeats are trusted only when consistent; otherwise tempo only, no bar markers.
Pending CrispASR lanes C1–C10 (benchmark, pin bump for mini-bs-roformer, signed
build, real Tauri check, IPC tests, listening, Win/Linux bundling, cancellation,
stem/pause scope) are scoped with commands in docs/WORK_HANDOFF.md.
