# Canon M50 + Zoom H6 interview: walkthrough

This example uses `MVI_8251.MP4` and the two recordings from `ZOOM0014`.
`Tr1` is the RØDE Wireless GO on the main speaker's jacket. `LR` is the H6 room
stereo recording of both people. The Canon's internal microphone is a reference
for synchronization and a fallback. Prefer the jacket mic for answers and check
the room mic for interviewer questions; this is a listening decision, not a rule
that automatically identifies the speaker.

The finished local example is in:

```text
/Users/christianstrobele/code/transcripts/2026-Studienwoche/CrispAudio-validation/
  MVI_8251.crispaudio       editable project with linked aligned WAVs
  MVI_8251.verified.mp4     verified export, jacket microphone as default
  aligned-final/          camera and microphone WAVs + session.json
  validation.json         stream hashes and timing checks
```

The verified MP4 contains alternative audio streams; it is not yet an automatic
question/answer microphone edit. Original video and camera audio stream hashes
match the source. Measured audio alignment against the camera was within 1.75 ms
at beginning/middle/end. That does not independently verify visual lip sync.

## CLI: reproduce alignment and an initial export on this Mac

1. Check the installed CLI and media tools:

   ```sh
   /Users/christianstrobele/.local/bin/crispaudio --help
   /opt/homebrew/bin/ffmpeg -version
   /opt/homebrew/bin/ffprobe -version
   ```

   The CLI symlink currently points into the local repository's release build.
   See [build instructions](INTERVIEW_EDITING.md) for another machine.

2. Set source paths and a **new** output directory. Reusing an existing render
   directory or output file is rejected rather than overwriting it.

   ```sh
   CLI='/Users/christianstrobele/.local/bin/crispaudio'
   SOURCE='/Users/christianstrobele/Downloads/2026 Studienwoche'
   WORK="$HOME/Documents/CrispAudio/MVI_8251-$(date +%Y%m%d-%H%M%S)"
   mkdir -p "$WORK"
   "$CLI" probe "$SOURCE/MVI_8251.MP4"
   "$CLI" levels "$SOURCE/Interviews/ZOOM0014/ZOOM0014_Tr1.WAV"
   "$CLI" levels "$SOURCE/Interviews/ZOOM0014/ZOOM0014_LR.WAV"
   ```

3. Analyze both microphones against camera audio, putting Tr1 first:

   ```sh
   "$CLI" analyze \
     --video "$SOURCE/MVI_8251.MP4" \
     --audio "$SOURCE/Interviews/ZOOM0014/ZOOM0014_Tr1.WAV" \
     --audio "$SOURCE/Interviews/ZOOM0014/ZOOM0014_LR.WAV" \
     --output "$WORK/analysis.json"
   ```

   Inspect `analysis.json`: the previous measurement found approximately
   214.622 s for Tr1, 214.614 s for LR, and small clock drift. These offsets mean
   the recorder began well before this camera clip. Let analysis estimate them;
   don't copy these offsets into the other camera files. Unreliable alignments
   require review/manual confirmation; don't routinely use `--allow-uncertain`.

4. Render aligned production audio:

   ```sh
   "$CLI" align --session "$WORK/analysis.json" --output-dir "$WORK/aligned"
   ```

   Results: `track-01.aligned.wav` (Tr1), `track-02.aligned.wav` (LR),
   `camera.aligned.wav`, and `session.json`. WAVs are 48 kHz/24-bit, with mono
   Tr1 and stereo LR retained. They all start at camera time zero. Missing audio
   is padded; clock drift is corrected.

5. Export an initial video with matched listening levels:

   ```sh
   "$CLI" export --session "$WORK/aligned/session.json" \
     --match-levels --output "$WORK/MVI_8251.synced.mp4"
   ```

   Tr1 is the default audio stream because it was supplied first. LR and the
   original camera audio remain alternatives. Video is copied without encoding.
   Level matching is constant gain with peak headroom, not denoising or speaker
   detection. Listen to questions and answers before deciding on the final mix.

6. For a manually edited mix exported from CrispAudio (or another editor), remux:

   ```sh
   "$CLI" export --session "$WORK/aligned/session.json" \
     --mix "$WORK/interview-mix.wav" --output "$WORK/MVI_8251.edited.mp4"
   ```

   The mix must start at camera time zero and cover the complete camera clip.
   Do not ripple-edit the mix independently of the picture. For a single section,
   add `--start 30.2 --end 55.6`; the CLI cuts both using source-clock seconds.
   The CLI does not yet expose a per-section microphone edit list.

Repeat analysis/alignment for `MVI_8250.MP4` and `MVI_8249.MP4` separately, using
the recorder files that overlap each video. Do not concatenate the camera clips
or assume one offset applies to every clip. A montage/picture editing workflow
is future work.

## GUI on macOS: fastest route using the prepared project

1. Launch `/Users/christianstrobele/Applications/CrispAudio-local.app`.
   Open **Timeline**, then **Open project** and select the prepared
   `MVI_8251.crispaudio`. Keep `aligned-final/` and the original video in place:
   this project links those files rather than embedding them.
2. Tap/click **Fit all / reset view** to see the whole interview. Play, pause, and use the
   position slider to seek. Open **View & tools** for zoom, snapping, undo/redo, and adding tracks.
   Zoom in for editing individual question boundaries. The video filmstrip stays
   on the same ruler as all audio tracks; click it to seek. Waveforms are visually
   normalized by default without changing the mix. In **View & tools**, switch
   waveform display if you need to see mix gain.
   Open **View & tools → Check alignment**, choose Camera and Tr1 (then LR), and inspect matching
   speech starts at Beginning/Middle/End. Try a 0.2–0.5 s window. This overlay
   does not change offsets; re-analyze/re-import if a correction is needed.
3. Compare Tr1, LR, and Camera using **S** on their track headers. Solo temporarily
   overrides saved mute; clear solos in **Tracks & microphones** to restore the
   saved mix. Solo affects export too. The green dot marks effective audibility.
4. Open **Tracks & microphones**. Rename tracks to e.g. `Main speaker — RØDE`,
   `Interviewer — H6 room`, and `Camera reference`. Adjust levels while listening.
   **Listen only** compares a single microphone; close the dialog when done.
5. To use LR for a question and Tr1 for the answer:
   - Seek to the start of the question. Press **Split all at playhead**.
   - Seek to its end. Press **Split all at playhead** again.
   - Select the Tr1 clip covering the question and press **Delete**. This leaves
     a gap; it does not move the remaining clips or cut the video.
   - Delete the complementary LR clips where Tr1 should be used. Repeat at each
     question/answer boundary. Keep LR for any section where it actually sounds
     better, including overlapping speech if appropriate.
   - In **Tracks & microphones**, unmute Tr1 and LR, turn off both solo buttons,
     and keep Camera muted. Ensure the retained Tr1/LR clips are complementary;
     overlapping active microphones can produce comb filtering or excess level.
   - Select a clip and open **Clip settings** to adjust gain/fades. Start with
     natural pauses; short fades can soften switching clicks. This is manual
     source selection, not automatic speaker recognition.
6. Play across every switch and check lip sync at the beginning and end. If a
   solo button is used again, clear solos and restore the intended track
   mute states before export.
7. **Save project** to a new project file. Keep its linked media folder.
8. Optionally open **Export range** below the microphone controls. Set the start
   and end at the playhead or enter seconds. Green IN/OUT markers and dark areas
   in the video lane show the selected section. **Full recording** resets it.
   The timeline/audio clips stay on the original clock.
   **Export edited video** writes an MP4 with the active timeline mix, original
   picture, and original camera audio as an alternative. **Export video section**
   instead cuts picture and mix together, encoding picture for accurate boundaries.
   Choose a new filename. Use fullscreen video to inspect lips, and ±33 ms for
   approximate fine seeking; hide preview to gain vertical waveform space.
   **Export** in the general timeline toolbar exports audio only, according to
   the format in Settings (select WAV/24-bit for the CLI `--mix` workflow).

Undo/redo is available under **View & tools** (and via keyboard shortcuts). Deleting or trimming an audio clip does not delete the
source WAV or original video. Multiple picture clips, ripple editing of picture, and
multi-camera assembly are not implemented.

## GUI on macOS: start from the originals

1. Open **Timeline → Add video + recordings**.
2. Choose `MVI_8251.MP4` in the camera step.
3. Choose both `ZOOM0014_Tr1.WAV` and `ZOOM0014_LR.WAV` in the recorder step.
   Check the displayed filenames, then press **Analyze synchronization**.
4. Review confidence/drift/residuals. Reliable results can be imported; weak
   matches need a corrected offset and explicit manual confirmation.
5. Enable **Match listening levels** if desired. Choose **Align and import**,
   then choose a parent folder for generated audio. The app creates a fresh
   `CrispAudio-<UUID>` subfolder there. It imports only after decoding all tracks.
6. Follow the editing/comparison/export steps above. File-picker order can vary:
   choose the desired microphone explicitly after import rather than assuming
   the first imported track is always Tr1.

Alternatively, **More → Open sync session** opens a CLI `analysis.json` for review
or an aligned `session.json` for direct import. A sync session JSON is different
from a saved editable `.crispaudio` project.

## iPhone/iPad: audio editing, with desktop preparation for now

Full video sync/MP4 export is **not available on iOS**. The current implementation
launches desktop FFmpeg processes; a mobile media backend is still required.

1. On the Mac, run CLI steps 1–4. Copy the two aligned microphone WAVs to Files on
   the device (AirDrop/iCloud Drive). Start with a short excerpt when validating
   a new device: import/render currently holds decoded audio in memory.
2. Open **Timeline**, stop playback, and return to the start. **Import audio**
   and select both aligned WAVs together. Batch import creates separate tracks
   at the same playhead position and initially mutes all but the first new track.
3. Use **Tracks & microphones** for full track names, levels, mute, solo, and
   reorder controls. Track headers retain simple mute/solo controls.
4. Drag the position slider to seek. Tap a clip to select it. Use the visible
   split/delete/settings buttons; a long press also opens the context menu.
   By default a finger scrolls vertically instead of moving audio. Enable
   **Move & trim** deliberately when dragging clips/edges, then turn it off.
5. Follow the complementary-clip editing steps above. **Clip settings** opens a
   dialog instead of shrinking the waveform area with a sidebar. **Fit all / reset view**
   shows the full interview; zoom in for precision.
6. Save an audio project and export the audio mix (WAV/24-bit in Settings).
   iOS project saves embed audio; desktop linked paths cannot be opened there.
7. Transfer the mix back to the Mac and use CLI step 6 to combine it with video.

This is the implemented interaction design, verified in a browser at phone and
tablet sizes. Real-device audio, Files permissions, interruptions/backgrounding,
VoiceOver, and long-recording memory use remain release gates; browser emulation
is not a substitute for testing a signed iPhone/iPad build.

For the generic audio-only or audio/video editor and updated mute/solo, file and
scroll controls, see [Timeline workflow](TIMELINE_WORKFLOW.md).
