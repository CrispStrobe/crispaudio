# Sample sessions

Use **File → Sample sessions…**, or Find command (⌘/Ctrl K). Choose a session
and Open. Loading stops playback, opens the sample, and keeps the current project
and its audio in Undo. Save creates an ordinary editable project.

| Session | Contents |
|---|---|
| Audio mix | Rhythm, keys and atmosphere tracks; delay/reverb, master compression, gain/FX automation, fades and a range |
| Picture edit | The audio mix plus two video clips and an editable title |
| Take workshop | Two alternate keys takes, a comp region and crossfades; rhythm and atmosphere remain separate |

All sessions contain 12 seconds of original generated media and a two-second
export tail. They are editable examples, with actual audio buffers and a bundled
H.264 motion graphic. No downloads, microphone access or external recordings are
needed. The media and synthesis code use the repository's MIT license.

Press Play to audition. In the audio mix, open Mixer → Inserts or the automation
lane to change the sound. In Picture edit, select a picture or title and open
Clip settings. In Take workshop, open Record / Takes and select the keys track
to review its alternate takes and comp. Recording is not armed automatically.

The desktop app persists generated WAVs and copies the video into its own data
folder before opening the session, so linked save/export keeps stable media paths.
The browser decodes the bundled video directly and portable save retains audio;
browser video paths refer to that site's asset. Desktop picture export uses the
existing supported media backend. Samples do not change physical-device support.

Developers can regenerate the video with `sh scripts/generate-sample-video.sh`.
The deterministic audio generator is `src/lib/sampleSessions.ts`.
