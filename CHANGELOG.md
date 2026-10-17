# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

- Add an internal native cue scheduler with integer host-clock mapping, bounded startup and silence on late data, underrun or excessive drift. Scheduler failure releases cue helpers while dry recording continues. Preserve final cue packets when publication races EOF. Hardware output/app integration remains pending.

- Add a native recording-group coordinator with whole-group preflight, startup rollback, retained recovery files and atomic completion manifests. Failed groups do not return a partial clip set. Native app recording integration remains pending.

- Extend native recording ownership to the cue worker and AU/VST3 helpers, with a shared recording-group stream budget. Cue faults mute wet output while dry recording continues; cancellation joins workers and releases helpers. App/output integration remains pending.

- Add a native dry-recording session owner with device/callback watchdog checks, worker cleanup and retained recovery files after cancellation or failure. This is an internal foundation; the installed recording workflow is unchanged.

- Add native dry-file checkpointing and prefix recovery. Completion requires clean capture closure and matching frame counts; interrupted takes retain their originals. Software integration covers partial stop buffers and dry WAV recording after a cue plug-in fails. App integration remains pending.
- Add an internal Mac capture adapter with explicit device/channel mapping, permission checks, input clocks and safe shutdown. It remains outside the installed recording workflow pending native file/output integration and hardware qualification.
- Add internal native input queues and an AU/VST3 worker with independent dry capture and cue fault handling. Hardware capture and recording UI integration remain pending; the installed recorder is unchanged.

## 0.13.33 — 2026-10-16

- Share one audio bridge across a native recording cue rack. Two inserts now add 85.3 ms of bridge delay at 48 kHz instead of 170.7 ms; reported plug-in latency is additional.
- Preserve static insert order, latency-matched bypass, dry capture and fault cleanup. Reject changed plug-in latency and release the entire cue rack on an error.
- Measure one/two AU and VST3 cue chains and exact bypassed-impulse timing through actual Mac Tauri/WebKit. Smaller per-insert buffers failed deadline checks and are not offered.

## 0.13.32 — 2026-10-16

- Add a collapsed recording cue mix with editable level, pan and mono, independent of track faders and recorded PCM.
- Monitor through up to two saved native track inserts on Mac, with added buffering/plugin delay displayed. Keep takes dry; mute a faulty cue without losing raw capture.
- Release cue plug-in sessions on monitoring stop, cancellation, input/source changes and close. Bound simultaneous cue inserts and preserve settings in projects/templates, with new templates unarmed and monitoring off.
- Validate generated input through actual Mac Tauri/WebKit AU cue chains, dry capture, cue controls, fault cleanup, Undo and project reopen.

## 0.13.31 — 2026-10-16

- Expand low-frequency detail in the restoration spectrogram with a logarithmic frequency axis. Band shading, mouse/touch dragging and exact numeric bounds share the same mapping; cancelled gestures restore the previous band.
- Show the selected FFT window and colour floor accurately in spectrogram captions.
- Add repeatable restoration quality checks for changing voice-like envelopes, percussion and sweeps, including clean-signal damage and multiple sample rates. Document the much smaller declipping gains on noisy/transient material.

## 0.13.30 — 2026-10-16

- Add cancellable source restoration previews: mains/harmonic de-hum, selected-band spectral attenuation and conservative reconstruction of short hard-clipped peaks.
- Select frequency bands by dragging the spectrogram or entering bounds. Retain originals, unchanged channels/ranges, saved parameters and one Undo per Apply.
- Add a separate editable audition level shared by Original/Preview, with sample-peak headroom for hot float sources and restoration previews. Saved source levels stay intact.
- Bound worker memory/duration/context work, cancel stale requests and mark previews that need preparing again after settings change.

## 0.13.29 — 2026-10-16

- Add source polarity inversion, stereo L/R swap, dual-mono averaging and channel copying in a compact Channels & repair dropdown.
- Preview and apply manual click repairs to gaps up to 1 ms using bounded cubic interpolation with clean context. Retain originals, selected-channel/range boundaries and one Undo per Apply.
- Add Zoom to selection for repair and draw connected samples/dots at close waveform zoom. Show the prepared operation beside Apply; keep A/B audition running.

## 0.13.28 — 2026-10-16

- Keep source audition running when switching Original/Preview, updating cleanup previews, resetting or toggling loop. Crossfade at the current selection position; show comparison controls beside playback.
- Add a moving source cursor across joined ranges and update an active normalization preview when its target changes.
- Anchor and bound crossfade voices, allocate audition buffers only when needed, and stop/release audition on recording, source replacement, timeline playback or editor close. Apply remains a separate undoable edit.

## 0.13.27 — 2026-10-16

- Add reusable track templates through Edit → Track Templates, the touch command ribbon and Track Settings. Start with mono, stereo or a gentle speech low-cut; save custom input/FX setups locally.
- Create selected empty tracks in one Undo step with independent FX identities. Exclude audio, takes, automation and routing; use the default input, unarmed with monitoring off.
- Validate the bounded library on reload and report storage errors without losing the current library. Advanced saving stays collapsed; explanations live behind (i).

## 0.13.26 — 2026-10-16

- Add audible bar-based recording count-in and backing pre-roll, with compact options and a visible lead-in phase. Preserve old seconds values as silent start delay.
- Schedule playback and clicks on the audio clock; exclude lead-in from published takes while retaining raw source handles. Cancel before the recording point without saving a take.
- Support a single intro before prepared-backing loop passes, shared multi-input preparation and persistent lead-in settings.

## 0.13.25 — 2026-10-16

- Remove ASR launch/setup controls and their app commands; keep existing aligned projects, word editing and independent CLI compatibility.
- Share guarded JSON/SRT/VTT import across timeline and source views, including browser/mobile file inputs. Reject late reads after project changes and capture layout guards for imported word timing.
- Accept genuine JSON word/startTime fields; document the current CrisperWeaver cue-only export and the remaining word-export gap.

## 0.13.24 — 2026-10-16

- Refresh segment-effect waveforms during continuous slider gestures instead of waiting for movement to stop.
- Keep the last processed shape under FX… while the latest settings render; discard it on trim, source or placement changes.
- Suspend hidden-window preview work; retain serialized rendering, bounded caching and one Undo per gesture.

## 0.13.23 — 2026-10-16

- Show processed waveforms for built-in segment effects, including clip gain, fades and saved effect automation, using display-only offline DSP.
- Refresh after short editing pauses; bound background renders/cache and mark updating or source-only fallbacks. Keep original-level normalization so FX level changes stay visible.
- Accept the full audio-workstation gap roadmap while preserving CometBeat/CrisperWeaver responsibilities. Native/long-clip waveforms and full mix visualization remain follow-up work.

## 0.13.22 — 2026-10-16

- Retire text-to-speech creation, server preferences and native iOS speech-generation commands; keep existing generated audio editable.
- Define CrispAudio's audio editing/recording/finishing role alongside CometBeat composition and CrisperWeaver speech generation/recognition.
- Record a sourced comparison with ocenaudio, Ardour, LMMS, openDAW, Waveform, MusE, REAPER and Cubase, with explicit partial/missing workflows and priorities.
- Verify old preference migration, voiceover project compatibility, audio/take/video sample roundtrips and real-reference audio range export/review.

## 0.13.21 — 2026-10-16

- Add monitor metronome support for rendered Preview and microphone recording, using the actual playback/capture anchors and source loops.
- Continue recording clicks after backing audio ends and release them on stop, cancellation and unmount.

## 0.13.20 — 2026-10-16

- Add a native-clocked monitor metronome to Mac Live playback; bar accents follow seeks and loops without entering exports or mix loudness measurements.

## 0.13.19 — 2026-10-16

- Consolidate track gain, pan and effect curve shaping into the compact review already used by effect inspectors.
- Keep explanations and full track/unit details behind Info, with one preset selector and custom handle fields only when needed.
- Preserve negative pan, raw effect units, direct one-step Apply/Undo and no-op Redo. Recheck project identity, locks and microphone capture before applying.
- Cancel numeric edits or handle drags before closing the review with Escape.

## 0.13.18 — 2026-10-16

- Shape built-in clip/master and native clip/track/master parameter curves through the inspector’s “…” menu: Linear, ease-in/out, S-curve and custom Bézier handles.
- Preview shapes locally, reopen intact curves from their interior points, and keep project changes to one Apply/Undo. Other segments, parameters and plug-in state stay intact.
- Restore interrupted handle drags; support touch, keyboard and directly editable handle percentages without extra toolbar clutter.
- Correct carrier-frequency units and help in the existing track shape review.

## 0.13.17 — 2026-10-16

- Simplify track-lane automation paste: two numeric fields and a live current/result curve comparison, with range and boundary details behind an info button.
- Preview time/length changes while typing or scrubbing on touch, retaining the original project until Paste creates one Undo.
- Correct carrier-frequency paste titles and add missing frequency Copy/Paste labels in English and German.
- Keep negative pan values, Step segments and dense curves visible without changing stored data.

## 0.13.16 — 2026-10-16

- Select curve ranges with a mouse, touch or numeric start/end fields from the inspector’s compact “…” menu.
- Copy and paste built-in clip/master curves using the same clipboards as track lanes. Native copies match the plug-in, parameter and reported range.
- Paste at the playhead or stretch into a selected interval, with one-sample exterior guards and one Undo on Apply. Clipboard and selection changes leave project history intact.
- Keep menu keyboard navigation from triggering timeline shortcuts; cancelled range gestures restore the selection.

## 0.13.15 — 2026-10-16

- Give built-in clip/master effects the same visual curve editor as native inserts, with touch/pen dragging, keyboard controls and editable percentages, milliseconds and Hz.
- Preview local edits on the graph, collapse pass recording, and put explanations behind an info button. Apply remains one Undo and retains untouched values exactly.
- Make built-in clip curves follow moves, nudges, slides and paste alongside native curves. Trims, splits and source slips retain their timeline clock.
- Preserve Linear/Step boundary values when moved or speed-scaled curves extend before project zero.

## 0.13.14 — 2026-10-16

- Edit native plug-in parameter curves visually: add/drag/delete points, enter time and values in plug-in units, and choose Linear or Step.
- Preview numeric edits on the graph, support touch/pen scrubbing and keyboard edits, and restore drafts after cancelled gestures.
- Keep recording controls collapsed and the inspector anchored while point controls appear; Apply saves one Undo step.
- Bound dense-curve rendering while retaining access to every stored point; format readable numbers without reducing saved precision.

## 0.13.13 — 2026-10-16

- Keep native plug-in parameter curves attached to moved, nudged, pasted and speed-adjusted audio clips.
- Retime clip, track, master and comp-backup curves during scoped ripple edits; preserve values around edit boundaries.
- Keep curves on their existing timeline clock for splits, trims and source slips.
- Protect automation-only locked tracks and reject edits that would exceed saved-curve limits.

## 0.13.12 — 2026-10-16

- Record native AU/VST3 parameter automation in Touch, Latch or Write at track, clip and master scope.
- Review each pass before Apply, with one Undo and no mutation of saved plug-in state.
- Play saved parameter curves in Mac Live, Preview and GUI exports, using project time and processing-block updates.
- Preserve static Read values, including queried defaults; validate curve bounds and packet limits before native updates.

## 0.13.11 — 2026-10-16

- Rebuild Mac Live playback after reordering built-in effects of the same type, including Undo, Redo and paused playback.
- Keep stable processor identities through knob edits and save/reopen; pasted effects receive fresh identities.
- Preserve compatibility with projects saved before processor identities were introduced.

## 0.13.10 — 2026-10-16

- Adjust supported clip and master effect knobs during Mac Live playback without restarting processors.
- Record clip/master Touch, Latch and Write effect passes through the existing inspector, with review and one Undo on Apply.
- Preserve delay history and oscillator phase across scopes; validate scope identity and complete packets before applying controls.
- Discard scoped captures on failed native audition, playback faults or mode changes; retain capture and lock guards.

## 0.13.9 — 2026-10-16

- Adjust supported built-in track effect knobs during Mac Live playback without restarting processors; Undo and Redo retain the running graph.
- Update static base values alongside automation, preserving effect history, oscillator phase and curve priority.
- Match existing effect limits and float precision, including legacy oscillator rates and parameter defaults.
- Correct Live playback help to describe native-rack microphone accompaniment and current control support.

## 0.13.8 — 2026-10-16

- Record delay time, chorus rate and ring frequency passes during Mac Live playback with native inserts.
- Reserve native track delay history before playback within the existing effect-state budget; time changes retain recorded history.
- Keep native oscillator phase continuous through automation changes, Read restoration and project loops.

## 0.13.7 — 2026-10-16

- Record delay feedback and chorus depth automation passes during Mac Live playback with native inserts.
- Retain delay history, chorus modulation and independently held wet/dry controls through audition and Read restoration.
- Validate parameter-specific bounds and duplicate controls before applying an automation packet.
- Rewind envelope cursors when project playback loops so Read resumes at the correct curve position.

## 0.13.6 — 2026-10-16

- Record wet/dry mix passes for built-in track delay, chorus, reverb, distortion, ring modulation and bitcrush during Mac Live playback with native inserts.
- Keep running effect history through audition and Read restoration; restore reverb's static mix correctly after clearing an envelope.
- Validate complete effect mix control packets before applying them, preserving playback on invalid input.

## 0.13.5 — 2026-10-16

- Record track level and pan automation in Mac Live playback with native inserts, using Touch, Latch or Write and review before applying.
- Restore Read on release or cancellation; discard passes on playback failure and keep Preview, microphone capture and effect-parameter guards.
- Fix a native control-queue race that could drop the final slider update.
- Make the moved-media regression fixture portable to Windows.

## 0.13.4 — 2026-10-16

- Recover missing linked media after a Mac relaunch when a saved bookmark follows the renamed file or selected folder.
- Restore paths before project decoding, autosave recovery and saved-delivery decoding, including video, stills and retained originals.
- Send only path lists through recovery IPC, keeping embedded audio in the frontend.
- Preserve bounded move history across launches; keep existing paths and ambiguous or unavailable sources for manual relinking.

## 0.13.3 — 2026-10-16

- Use private temporary storage for Mac native audio/video exports on the same volume, avoiding the extra output-folder picker.
- Keep destination-folder staging for other volumes and preserve atomic publication without overwriting existing files.
- Keep the explicit folder selection for project sidecar assets and delivery folders.

## 0.13.2 — 2026-10-15

- Remember selected Mac media files, saved projects and output folders across launches; pass matching resource access to native helpers.
- Add File → Media Folder Access… and request output-folder access when native renders or project audio assets need it.
- Resolve relative media paths when projects are dropped or opened from Finder, including `.crispaudio.json` files.
- Accept saved project version 4 in native media resolution and collection, preserving projects with native effects.
- Keep desktop paths for files opened by other apps and avoid transferring full MP4 files through byte IPC; retain the mobile byte-import route.
- Verify selected-file reads, read-only boundaries, project writes and native output in real sandboxed relaunch tests.

## 0.13.1 — 2026-10-15

- Remember selected Mac plug-in folders across app launches using macOS bookmarks.
- Transfer selected-folder access to native scan, render and streaming helpers, including folders outside Downloads.
- Report unavailable folders so they can be selected again; retain their saved bookmarks when a drive is offline.
- Add a real sandbox folder-selection/relaunch probe using generated audio and an external VST3 fixture.

## 0.13.0 — 2026-10-15

- Use compact modeless recording and single-track inspectors with collapsed advanced controls.
- Preview exact mixer/FX values live, group gestures into one Undo, and accelerate touch number scrubbing while retaining precise keyboard steps.
- Record dry microphone takes against prepared AU/VST3 accompaniment on a shared clock, including loop takes across UI stalls.
- Bundle native Mac helpers for separate signing and inherited sandbox execution; add packaging checks and a muted sandbox validation runner.

## 0.11.8 — 2026-10-13

- Add internal native whole-graph and range exports using coordinated offline rendering, preserving routing, fades, automation and float32 headroom.
- Wait for native block acceptance and worklet barriers before advancing offline time or accepting output; reject faults and release sessions on cancellation.
- Select and verify native realtime/offline processing modes, and crop bridge pre-roll at exact sample boundaries.
- Add an opt-in isolated Tauri validation executable using production commands and the production engine, including wet audio and hidden-window checks.
- Native rack UI/persistence remain pending. Repeated realtime UI-load checks still expose intermittent underruns; normal playback controls remain on the existing path.

## 0.11.7 — 2026-10-13

- Provide native timeline effects with project sample position, tempo, meter and musical origin for every block.
- Set VST3 realtime process context and AU host callbacks, including musical positions before bar one.
- Validate native transport acknowledgements and require fresh DSP sessions for seeks rather than accepting position jumps.
- Require paused playback for native state queries, including after queued audio drains.
- Keep native rack UI and equivalent export processing pending; ordinary playback continues through the existing path.

## 0.11.6 — 2026-10-13

- Add an internal TimelineEngine native playback path for clip, track, bus and master inserts with shared preparation and compensated routes.
- Align clip fades, track automation, sidechains, range gates and recording anchors to each signal's arrival time.
- Cancel superseded preparation, close partial graphs on failure and dispose native processing at range end.
- Replace streaming sample-array JSON IPC with bounded binary float32 packets, retaining headroom and strict deadline handling.
- Keep native timeline controls separate from saved project FX until transport context, wider timing validation and export parity are ready.

## 0.11.5 — 2026-10-13

- Add graph latency planning for clip merges, track/bus racks, pre/post sends, master paths and ducking detectors.
- Add exact integer-frame compensation worklets and an audible clock/recording-anchor model that holds through pre-roll.
- Separate native plugin initialization from activation so all graph nodes can share an origin chosen after preparation.
- Preserve reported plugin latency when bypassing, while continuing wet DSP state.
- Warm native DSP before activation and send parameter changes only when updated.
- Use a conservative, configurable bridge buffer for the current sample-array transport.
- Validate compensated native/dry bus routing in the browser. Production TimelineEngine integration, track controls and export remain pending.

## 0.11.4 — 2026-10-13

- Add an internal AudioWorklet bridge to persistent AU/VST3 processing, with pooled transferable buffers and fixed sample-clock scheduling.
- Mute and close on missed deadlines, invalid output, processor errors or changed plugin latency. Late blocks never shift the audio clock.
- Preserve parameter updates, bypass and state snapshots through the bridge; release native sessions on disposal or abort.
- Validate real native DSP through the browser worklet in Chromium and WebKit. Timeline graph compensation, track controls and export integration remain pending.

## 0.11.3 — 2026-10-13

- Add an internal persistent AU/VST3 block-processing transport with continuous DSP state, block parameter updates, saved state, bypass, reported latency and float32 headroom.
- Bound stream queues and response deadlines; isolate plugin faults and stop sessions on window closure or application exit.
- Reject late frontend output after close and clean up a session that finishes opening after cancellation.
- Accept optional null VST3 state without crashing the isolated helper.
- This is the native foundation for timeline inserts. AudioWorklet scheduling, graph latency compensation, track UI and export integration remain pending; existing playback continues through the current engine.

## 0.11.2 — 2026-10-13

- Store export audio snapshots once and persist only changed queue entries. Upgrade existing saved queues without dropping history.
- Restore export history without loading linked files or decoding audio; Retry loads the saved snapshot when needed and rejects missing audio.
- Review and relink media belonging to a failed export without changing the open session.
- Remove individual queue entries or clear finished entries, retaining active/failed jobs and exported files. Reclaim snapshots after their last queue reference is removed.

## 0.11.1 — 2026-10-13

- Scan each VST3 bundle in its own cancellable process with a ten-second deadline. Crashed, timed-out or invalid plugins no longer hide healthy effects.
- Keep AU and VST3 discovery independent and show skipped plugins in a collapsed details section.

## 0.11.0 — 2026-10-13

- Add a focused source editor in Edit, command search, the touch ribbon and audio clip menus: sample ranges, channels, zero-crossing snapping, zoom, loop audition and local undo/redo.
- Preview and apply normalization, silence, DC removal and edge fades to separate ranges/channels. Retain original source references through save/reopen/recovery, restore processing, trim linked clips safely and save named regions.
- Preserve exact float32 source samples and headroom through derived files, portable saves and recovery; integer export depths remain unchanged.
- Add optional source-selection spectrum, configurable FFT spectrogram, peak/RMS/DC/clipping statistics and loudness/true-peak measurement.
- Keep clip effect editing audible during timeline playback.
- Add named-region exports, filename templates, WAV title/artist/comment metadata, saved export-queue snapshots and pre-master summing stems that preserve upstream routing.
- Add isolated macOS Audio Unit and VST3 source-effect hosting with generic parameters, saved state, bypass, refreshed audition and reported-latency compensation. Preview windows are limited to two minutes; continuous timeline inserts and native plugin windows remain future extensions.
- Bundle the pinned MIT VST3 hosting SDK subset and notices; no SDK tools or test plugins are needed at runtime.

## 0.10.12 — 2026-10-13

- Align title/caption and single-video headers with their timeline lanes.
- Compact title/caption headers use eye and lock icons that fit every row height.
- Recording freezes title/caption timeline edits and their settings, matching other tracks.
- Title/caption drags retain one undo step; Escape, cancellation, lost capture and focus loss restore position and redo history. Simple clicks add no undo step.

## 0.10.11 — 2026-10-13

- Enable Deselect All for selected empty tracks, with accurate track/clip selection counts. Clip editing still requires selected clips.
- Keep selection visible on collapsed folders and the legacy video header. Select empty folder members by name or keyboard; focused buttons own Space/Enter.
- Follow the displayed folder order for header Shift-click ranges, excluding hidden members.
- Let direct recording use the selected empty audio track when no configured or armed target takes priority.

## 0.10.10 — 2026-10-13

- Keep floating inspectors compact after touch dragging, collapse and viewport rotation; release stale drags when capture or window focus is lost.
- Start picture-track Shift-click ranges from the selected video clip, retaining linked audio and visible selection markers.

## 0.10.9 — 2026-10-13

- Match video selection to audio: a plain click selects one clip with its linked audio, Shift-click extends selection, and dragging retains the group. Escape and touch context menus preserve the selection.
- Start a fresh track range when its previous header selection anchor has been removed.

## 0.10.8 — 2026-10-13

- Highlight selected tracks in their headers and rows, with clear clip outlines. Remove the selection wash across unrelated tracks; support Shift-click ranges in headers and clips. Plain clicks replace selection; group dragging retains it.
- Keep clip and fade controls in movable, collapsible panels. Fade sliders update the timeline and an envelope preview live, with one undo per drag and lock/capture protection.
- Add a persisted View/ribbon toggle for Zoom and Navigation; remove its inactive help button. Place optional Master loudness beside Master/Limiter.
- Consolidate video layer actions into desktop/touch menus and collapse output settings. Use icons for titles/captions, picture tracks and safe areas, with safe-area information.
- Keep Settings as an accessible gear button and shorten SFX preset labels to one word.

## 0.10.7 — 2026-10-13

- Give selected video clips distinct start/end trim handles, including very short clips, with linked audio/video trimming and one-step undo.
- Share twelve video clip actions through right-click and touch long-press, using the compact inspector and existing desktop/ribbon commands.
- Keep the video lane playhead visual so it does not cover short clips; seek with the ruler. Protect cancelled gestures when another project loads.

## 0.10.6 — 2026-10-13

- Keep track names readable by consolidating secondary actions into a shared desktop context and touch menu, including per-track recording setup.
- Arrange Arm/Mute/Solo below the name on taller touch rows. Protect header changes during capture.
- Show trim handles for the focused selected clip, retaining multi-selection and avoiding neighboring handle collisions.

## 0.10.5 — 2026-10-13

- Start and stop capture directly beside Play; the down-arrow opens per-track recording setup and take review. Default count-in is zero.
- Show actual input levels in the transport and active track headers, independently of the dialog and project history. Stop releases automatically opened inputs.
- Wait for every input to buffer pre-roll before starting the common playback clock, preserving group placement under startup load.
- Keep short-clip trim handles separate and reachable at viewport edges and under the playhead.

## 0.10.4 — 2026-10-13

- Hide the audio playhead over the empty-session welcome and import button.
- Move the longer getting-started explanation into an information button.

## 0.10.3 — DAW checkpoint

- Mix A/B snapshots with synchronized audition, optional loudness matching, LUFS/peak/RMS measurements, protected restore and save/reopen.
- Review the actual exported audio from File or completed delivery jobs; open video externally for picture/sync review.
- Four compact, modeless sample walkthroughs for recording, comping, mixing and video/audio. Native desktop menus and the shared touch ribbon expose each tool.
- Completes the seven-step DAW stack following the simplified recording/clip inspectors, functional move/trim handles and default Fit all view in 0.10.0–0.10.2.

## 0.10.2 — 2026-10-13

- Record Touch/Latch/Write passes for supported clip/master FX parameters inside
  a collapsed inspector section. Review intervals locally, then publish with one Apply.
- Add ring-carrier frequency automation, including live phase retention, track
  lane/pass/clipboard tools, clip/master inspectors and native export. Zero holds
  phase; empty frequency envelopes preserve the previous static DSP exactly.
- Share protected interval replacement between track and scoped pass review.

## 0.10.1 — 2026-10-13

- Make Move & trim control mouse, pen and touch editing. Selected audio clips
  show visible boundary handles, with source checks, one undo and Escape cancel.
- Expand clip context actions and replace the broad Clip Settings workspace
  with a focused dialog. Fades, FX and appearance open separately; descriptions
  use information buttons. Dialog transport remains usable and nested inspectors
  keep independent titles/focus/Escape behavior.
- Move waveform display into View. Add a shared File/Edit/View/Playback/Tools
  touch ribbon with short labels; every timeline menu command is available there.
- Expand explanation mode to menu commands, fields, handles and other timeline
  controls. Add persisted Fit all default and ribbon visibility settings.

## 0.10.0 — 2026-10-13

- Simplify Record / takes: basic track/arm/meter/record controls, with input setup,
  recording options and takes/comp editing collapsed by default.
- Add saved track folders, collapse, shared mute/solo and linked clip selection.
- Add keyboard clip navigation, precise selected-group placement, context trims
  and multi-clip drag as one undo.
- Built-in MacBook microphone capture and audible speech playback are confirmed.

## 0.9.9 — 2026-10-13

- Close stale recording previews after project replacement, undo, input changes
  and delayed permission results; release warm inputs on device changes.
- Audition raw takes or the effected comp without changing project history.
- Replace/remove comp regions, reset the original arrangement, and save/recall
  named comp versions. Versions persist and follow range edits.

## 0.9.8 — 2026-10-13

- Add Audio mix, Picture edit and Take workshop sample sessions through File
  and command search, with real generated audio, FX, automation and comp regions.
- Bundle an original H.264 motion graphic and editable title. Desktop samples
  persist their media for linked save/export; browser samples preview the asset.
- Keep the previous session and source buffers in Undo. Prepare the sample
  before replacing the project; cancel and failed media writes leave it intact.

## 0.9.7 — 2026-10-13

- Add All armed tracks recording for one to eight audio tracks, preserving each
  track's input, channel, monitoring and latency settings.
- Prepare streams before recording; use common capture/stop clocks and the
  longest count-in, with shared punch/loop placement and per-track takes.
- Persist originals and publish the entire group as one undo. Reject failed,
  stale or locked captures without a partial project update.
- Share the recording memory budget and retain the recording audio session
  until all input owners release it. Preserve selected-track recording.

## 0.9.6 — 2026-10-13

- Add compact clip/master supported FX automation inspectors inside expanded
  effect racks, with curve/point editing and Linear/Step segments.
- Keep draft edits local until Apply, publishing one undo step. Guard locks,
  recording and stale projects; preserve redo on equivalent Apply.
- Use absolute project time and retain other envelopes, clip source offsets
  and points outside the programme/clip window. Preserve the running graph
  for supported automation updates and the existing project format.

## 0.9.5 — 2026-10-13

- Consolidate the timeline toolbar around compact editing, mixing and recording
  icons. Move secondary tools into native macOS menus and shared command search;
  provide File/Edit/View/Tools menus on other platforms.
- Keep tool dialogs, recording and export queues mounted while their launchers
  are hidden. Preserve disabled states, keyboard access and existing settings.
- Preserve fast dialog typing and include Help summaries in keyboard focus.
- Fold longer explanations into Help sections and distinguish Track Settings
  from the strip mixer.
- Preserve all supported FX automation envelopes when copying/reordering racks,
  and mark automated time/depth/rate controls consistently.

## 0.9.4 — 2026-10-12

- Add a reviewed MIDI capture pass alongside timeline playback. Place the new
  pattern at the audio-clock playhead, retain channel/velocity/sustain, and end
  the pass on stop, seek, loop restart, programme end or pattern length.
- Add timeline play/stop controls to the piano roll. Apply the captured pattern
  as one durable editable clip and one undo step after stopping playback.
- Preserve separate free-running capture and draft cancellation. Live instrument
  tracks, loop takes, MIDI interchange and plugin hosting remain subsequent work.

## 0.9.3 — 2026-10-12

- Pin the iOS libc dependency to 0.2.189 to restore simulator compilation with
  num_threads; skip app artifact upload when the simulator build produced no app.

- Add a source-clock piano roll with note movement, length/velocity editing and
  start quantisation, sine/bell instruments and standard type-0 pattern MIDI export.
- Capture channel notes and sustain from explicit native Mac CoreMIDI input or
  supported Web MIDI browsers. Cancel audition/capture on blur, close or disconnect.
- Render editable note patterns to durable audio clips with one undo step and
  ordinary mixer/effects/export support. Preserve source windows through trims,
  splits and copies; note edits create an independent source revision.
- Fix Windows delivery publication by opening its owned stage with write access
  for the durability flush while preserving no-overwrite hard-link publication.
- Include MIDI dependency MIT notices. Live instrument tracks, MIDI file import,
  arrangement MIDI export and plugin hosting remain subsequent M10 work.

## 0.9.2 — 2026-10-12

- Add saved quarter-note tempo, time signature and bar-one origin without moving
  recorded audio/video. Add bars/beats rulers and bar/note/triplet snapping.
- Add a transport-clock monitor metronome with bar accents, cancellation on
  stop/seek/loop and no exported clicks. Tempo edits keep programme playback running.
- Create bar-aligned edit ranges with explicit empty-canvas extension and loop
  playback through the existing range transport. Preserve undo/save/recovery.
- This is the M10 musical timeline foundation; MIDI/instruments/plugins, tempo
  maps and sample-accurate musical loop restarts remain future work.

## 0.9.1 — 2026-10-12

- Add a Delivery panel with per-export settings and named presets, landscape /
  portrait / review exports, WAV channel/depth and AAC bitrate, ProRes MOV and
  range-shifted SRT/VTT captions or burn-in.
- Queue frozen project/source snapshots for project, range, selected-clip and
  solo track/bus stem exports. Preserve DSP pre-roll, show job phases/paths,
  cancel sequentially and retry to a fresh filename. Publish without overwrite
  and retain a settings record beside completed outputs.
- Review missing media and collect originals, takes, video and stills into a new
  portable folder; resolve relative paths when opening a moved package.
- Review/export a cut-only OTIO subset with explicit loss reports, URI escaping,
  gaps and overlap lanes; validate files with the official OTIO reader.

## 0.9.0 — 2026-10-12

- Complete the selected automation workflow: twelve gain/pan/FX lanes with
  points, curve handles, protected passes and independent copy/retime.
- Add buses, validated outputs, pre/post sends and routed sidechain ducking with
  matching live, offline and native mixing. Add master loudness/true-peak estimates
  and reviewed, measured target finishing.
- Add ordered picture layers, composition/crop/keyframes, source In/Out placement,
  titles, stills, reusable presets and separate editable/burn-in/sidecar captions.
  Apple MP4/MOV export renders the layers and graphics; the optional FFmpeg path
  rejects compositions it cannot reproduce.
- Record onto armed timeline tracks with explicit input/channel/monitor controls,
  count-in, latency calibration, punch and loop takes. Preserve raw originals,
  comp from recoverable takes, adjust crossfades and restore removed placements.
- Add reviewed linked clip speed/reverse/pitch processing from retained originals.
  Voice-oriented WSOLA preserves pitch; video uses nearest source frames at the
  project frame rate. Native CLI derivation and retiming recipes retain originals.
- Add reviewed multicam scene creation and shot switching without restarting the
  microphone mix. Map source transcript words through trims, repeats and retiming;
  review multiword lift/extract, correct words/speakers and organise sections.
- Preserve inactive takes and original sources when saving; keep recording,
  animation and multicam source clocks through range edits. Add the packaged Mac
  microphone usage description. Existing playback is regarded as fixed following
  the user's successful app test; no Apple release was submitted.

## 0.8.39 — 2026-10-12

- Add chorus rate automation from 0 to 8 Hz, with direct points, Linear/Step
  transitions, preset/custom shapes, timeline handles, protected recording and
  an independent copy/retime clipboard.
- Change both LFO frequencies without restarting phase or delay history; 0 Hz
  holds phase. Empty envelopes retain insert rate (default 1.5 Hz). Native point,
  shape, pass, paste and range-edit recipes support rate in every effect rack.
- Keep existing depth, mix and delay keyboard-edit increments unchanged, and
  prevent delayed dialog focus from stealing rapid paste-bound edits.

## 0.8.38 — 2026-10-12

- Add a playback-device selector and a short output test in Settings. On macOS,
  selection changes the system output; supported browsers route live and new
  playback contexts to the selected device, with rollback on failure.
- Resume interrupted playback contexts and use the hardware's default sample
  rate. Keep gesture recovery active after the first interaction.
- Accept Finder media drops anywhere in the desktop app, switch to the timeline,
  and import MP4/video as linked picture and unmuted camera audio. Audio drops
  create tracks; project drops open the project. Show progress and cancellation.
- Reject a video import if the project changes while it is being prepared.

## 0.8.37 — 2026-10-12

- Select any interior point of an intact saved automation shape to expose its
  whole-span timeline handles or reopen the original shape review. Individual
  point edits still target the selected point; shared endpoints select the
  outgoing span. Selection and unchanged reviews preserve history and redo.
- Keep damaged, truncated and unannotated curves on adjacent-point editing;
  saved points, native recipes and DSP remain unchanged.

## 0.8.36 — 2026-10-12

- Add chorus depth automation (0–100%, up to ±10 ms modulation) with direct
  Linear/Step points, preset/custom shaping, saved timeline handles, protected
  recording and its own tagged copy/retime clipboard.
- Schedule both LFO gains without resetting phase or delay history. Empty depth
  envelopes use insert depth, default 50%; rate remains static. Native point,
  shape, pass and paste recipes, rack rendering and range retiming support depth.

## 0.8.35 — 2026-10-12

- Expose direct timeline handles on ordinary Linear segments and intact saved
  Ease-in, Ease-out and S-curve spans. Presets start with equivalent Bézier
  controls; selecting, cancelling or returning to the original curve preserves
  points, metadata and history. Moving a handle converts the whole span to custom.
- Keep Step, flat, damaged-hint and sub-two-sample spans protected. Converted
  preset spans replace their old interior points rather than accumulating points.

## 0.8.34 — 2026-10-12

- Select the first point of an intact saved custom Bézier span to expose two
  handles directly on the timeline. Drag or use arrows to revise the whole span;
  release commits one undo step and Escape/cancellation discards the draft.
- Use the lane's shared clock and value scale, including logarithmic gain and
  descending spans. Locked, recording, flat or invalidated spans hide handles.
  Saved points and native shape recipes retain the existing audio representation.

## 0.8.33 — 2026-10-12

- Save applied automation shape controls with their baked points. Reopen the first
  shaped point to revise the original span after save/open, without adding more
  interior points; Linear flattens the span in one undo step.
- Retain intact shape reviews through full copy/stretch and range shifts. Reject
  malformed metadata; edited or truncated shapes fall back to adjacent-segment
  review. Native recipes match GUI revisions; audio still uses linear points.

## 0.8.32 — 2026-10-12

- Add reverb mix automation with direct points, Linear/Step, reviewed preset/custom
  shapes, protected recording and an independent tagged copy/retime clipboard.
- Add native point/shape/paste/pass recipes and clip/track/master rendering with
  scoped range edits. Live mix edits retain convolution history and the existing
  blend (30% dry at maximum mix). Empty envelopes use the insert value, default
  30%; size and decay remain static.

## 0.8.31 — 2026-10-12

- Add chorus mix automation (0–100%) with direct points, Linear/Step, reviewed
  preset/custom shapes, protected recording and a separate tagged copy/retime clipboard.
- Add matching native point/shape/paste/pass recipes and clip/track/master rendering
  with scoped range edits. Live mix changes preserve delay history and modulation
  phase; empty envelopes use the insert mix, default 30%. Rate and depth stay static.
- Document measured chorus precision and inherited abrupt wet-tail limits, with
  separate diagnostic audits and unchanged static DSP.

## 0.8.30 — 2026-10-11

- Add distortion mix automation (0–100%) with point/Linear/Step editing, reviewed
  preset/custom shapes, protected recording and a separate tagged copy/retime clipboard.
- Add matching native point/shape/paste/pass recipes, clip/track/master rendering
  and scoped range edits. Live mix edits preserve the waveshaper and oversampling
  filters, including at the dry endpoint; drive remains static.
- Keep source durations intact during offline range renders so Chrome oversampling
  matches a full-render crop at the final processing block.

## 0.8.29 — 2026-10-11

- Add bit-crusher mix automation (0–100%) with point/Linear/Step editing, reviewed
  preset/custom shapes, protected recording and its own tagged copy/retime clipboard.
- Add matching native point/shape/paste/pass recipes and clip/track/master mix
  rendering. Live mix changes retain the waveshaper graph; bit depth remains static.
- Match native waveshaper index precision to browser floats at quantization edges,
  improving static and automated bit-crusher render accuracy.

## 0.8.28 — 2026-10-11

- Add ring-modulator mix automation (0–100%) with direct points, Linear/Step,
  reviewed preset/custom curves and protected Read/Touch/Latch/Write capture.
- Add a separate ring mix clipboard with tagged copy/stretch paste and matching
  native point, shape, paste and recorded-pass recipes. Live edits retain carrier
  phase; GUI/native track/clip/master rendering and scoped range edits support mix.
- Match native carrier phase increment precision to Web Audio, reducing long
  ring-modulator render drift while retaining the existing audio error budget.

## 0.8.27 — 2026-10-11

- Add reviewed custom Bézier shaping on gain, pan and delay mix/feedback/time.
  Two draggable, keyboard and numeric handles control normalized time/value;
  time handles cannot cross and values remain within the endpoints.
- Custom shapes bake up to 15 ordinary editable points in one undo step, with
  matching native `shape-automation` controls, finite bounds and cancellation.
  Existing formats, outside automation and DSP are preserved.
- Prevent delayed modal focus from stealing fast handle edits; restore prior
  focus on close and display equal-endpoint curves as flat no-ops.

## 0.8.26 — 2026-10-11

- Add reviewed Ease-in, Ease-out and S-curve shaping between adjacent automation
  points on gain, pan and delay mix/feedback/time. Apply creates up to 15 editable
  linear points in one undo step; endpoints and outside segments stay fixed.
- Add matching native `shape-automation` recipes, short-interval limits, lock/stale
  review protection and no-op preservation of redo. Existing point formats retain
  the generated shapes through Save/Open, copy/retime, range edits and rendering.
- Protect shape review Escape before delayed modal focus and synchronize recorder
  protection before painting armed controls.


## 0.8.25 — 2026-10-11

- Add track delay-time automation with 0–2000 ms controls, Linear/Step curves and
  live edits that retain echo history. Empty lanes use the static insert time.
- Extend protected recording, independent envelope copy/retime, save/open, scoped
  range edits and native point/paste/pass recipes to delay time (stored in seconds).
- Render moving delay read heads in native clip/track/master racks with bounded
  two-second history. Linear time changes can alter pitch; jumps may be audible.

## 0.8.24 — 2026-10-11

- Add outgoing Linear/Step point curves to gain, pan and delay mix/feedback lanes.
  Step holds a value until the next point, then jumps at that point's clock.
- Preserve curve metadata through pointer/numeric edits, save/open, clipboard
  stretching, range insert/extract and reviewed recording passes. Outside guards
  restore the original curve; equivalent pastes preserve redo.
- Match GUI scheduling and native per-frame rendering, including seeks and existing
  recipes. Missing curves retain Linear behavior; unsupported curves reject.
  Further curve shapes and selected FX parameters remain M2.3 work.

## 0.8.23 — 2026-10-11

- Add separate session clipboards for track delay mix and feedback envelopes,
  with interpolated range edges and static-value snapshots for empty lanes.
- Review destination time/length before stretching a copied envelope into another
  delay insert. Preserve the other parameter, media clocks and outside automation;
  locks, stale reviews, capture protection and one-step undo/cancel apply.
- Add `paste-effect-automation` native recipes with source-insert/range and tagged
  portable envelope forms. Other FX parameters and additional curves remain planned.

## 0.8.22 — 2026-10-11

- Add protected Read/Touch/Latch/Write automation pass capture for gain, pan and
  delay mix/feedback, with explicit session arming and live draft audition.
- Stop to review bounded intervals; Apply creates one undo step with outside
  boundary guards. Cancel preserves envelopes and redo; seeks, loops, interruptions,
  lane/project/source changes and Escape discard drafts.
- Add native `automation-pass` recipes and precise JSON float round-tripping.
- Correct live FX envelope clock scheduling when the AudioContext has already run.
  Capture is frame-sampled; further FX parameters, curves and FX clipboard remain planned.

## 0.8.21 — 2026-10-11

- Add an independent track delay feedback lane (0–95%) with live ramps that
  preserve echo history, point editing, locks, undo/cancel and format-3 save/open.
- Preserve mix and feedback envelopes when editing, copying/reordering racks and
  retiming scoped ranges; support native `effect-automation parameter:"feedback"`.
- Reject feedback above 95%; empty lanes restore the static value. Further FX
  parameters, FX envelope clipboard and recording modes remain planned.

## 0.8.20 — 2026-10-11

- Add a track delay wet/dry mix automation lane with pointer/touch, keyboard and
  percent/time edits, locks, undo/cancel and format-3 save/open.
- Apply complementary wet/dry ramps live without resetting delay history; preserve
  envelopes with rack reordering and scoped range insert/extract.
- Match supported GUI/native DSP and add `effect-automation` delay mix recipes.
  Other FX parameters, FX clipboard and recording modes remain planned.

## 0.8.19 — 2026-10-11

- Copy and paste selected-range or whole-track pan envelopes with reviewed
  destination time/length, time stretching and one-sample outside guards.
- Keep separate gain/pan session clipboards; capture static pan from empty lanes.
  Preserve locks, stale-dialog checks, one-step undo and no-op/cancel redo.
- Support native `paste-automation` pan recipes, including tagged portable pan
  envelopes; reject parameter mismatches. Preserve gain, static pan and media clocks.

## 0.8.18 — 2026-10-11

- Add a focused pan automation lane alongside gain: signed numeric edits,
  mouse/touch/keyboard, snapping, locks, cancel/redo and one-step undo.
- Schedule absolute linear pan envelopes live without restarting playback;
  held endpoints, last duplicate wins, empty lane restores static pan.
- Preserve pan in format-3 Save/Open, scoped range retiming and native renders;
  native automation recipes accept `parameter: "pan"`. Mixer marks active pan Auto.
- Correct centered mono exports to use playback's equal-power pan law (−3.01 dB
  per channel). Stereo center remains unchanged. Envelope copy/paste remains gain-only.

## 0.8.17 — 2026-10-11

- Copy selected-range or whole-track gain envelopes on a relative clock; paste
  across tracks/projects with reviewed destination time and time stretching.
- Preserve surrounding gain with one-sample boundary guards, source/clip clocks,
  locks, one-step undo and no-op/cancel redo. Session clipboard is independent
  of project history. Stale paste dialogs reject changes.
- Add native `paste-automation` recipes with track-range or portable envelope
  sources; gain-only recipes preserve canvas metadata.

## 0.8.16 — 2026-10-11

- Add a focused directly editable track-gain lane on the shared timeline scale:
  mouse/touch points, keyboard and exact numeric edits, snapping and locks.
- Commit gestures as one undo step; cancellation preserves redo. Gain changes
  update the playing envelope without rescheduling clips.
- Define held endpoints, unity for empty envelopes and last-supplied duplicate
  timestamp semantics consistently in GUI/native rendering and CLI recipes.
- Preserve microphone automation, format-3 save/open and existing range retiming.
  Pan/FX automation and recording modes remain planned.

## [Unreleased — local version 0.8.15]

- Add an optional stereo-linked sample-peak output limiter after master gain,
  with adjustable ceiling/release, instant attack and no added latency.
- Apply the same limiter algorithm to realtime, offline GUI and native CLI
  exports; preserve DSP history before cropping selected export ranges.
- Show live compressor gain reduction per insert and maximum insert attenuation
  per mixer strip; show limiter reduction separately and clear readings on Stop.
- Persist limiter settings, keep old projects disabled, support deliberate
  numeric editing/undo and CLI `output-limiter` edit recipes.
- Reject enabled limiting in the narrower FFmpeg compatibility mixer. True-peak,
  LUFS and lookahead are not implemented by this sample-peak limiter.

## [Local version 0.8.14]

- Add bell, low-shelf and high-shelf EQ to clip, track and master racks with
  matching native mixer DSP. Preserve saved low/high-pass parameter conventions.
- Show a collapsible combined EQ response graph with draggable bands, keyboard
  fine/coarse edits and numeric frequency/gain/Q; exclude bypassed bands.
- Smooth live EQ parameter changes without rebuilding playback; coalesce graph
  and numeric gestures into one undo step.
- Wait for asynchronous waveform import in its regression test.

## [Local version 0.8.13]

- Add a bottom mixer dock with horizontally scrollable track/master strips,
  dB faders, pan, mute/solo and access to existing effects racks.
- Show post-fader/post-pan stereo peak/RMS, held peak and clipping, with reset.
  Keep mixer updates on the running audio graph and coalesce pointer undo.
- Persist project master gain independently of monitor volume; apply it after
  master effects in realtime, offline GUI and native CLI audio/video exports.

## [Local version 0.8.12]

- Show source spans and before/after reserves while dragging audio/video edges,
  including linked partners, with visible source/timeline limits.
- Compute trims from the press snapshot, bounding unlinked audio too. Keep
  timeline/source clocks together, clamp linked picture inward to project frames
  and retain at least one picture frame. Pause audio playback before trimming.
- Cancel pointer gestures with Escape/cancel/lost capture; restore the original
  arrangement and pre-drag undo/redo. Keep idle waveform rendering unchanged.
- Validate the desktop M1 workflow through actual range/trim dialogs, range
  playback, save/open/export, linked sound/picture, fixed music and native renders.

## [Local version 0.8.11]

- Review crossed picture blends in range edits and explicitly replace them with
  hard cuts at their original ends. Preview the resulting cut times; preserve
  linked source timing, unaffected transitions, scope/locks and one-step undo.
- Add CLI `transitionPolicy: "cut"`; the default preserves blends and rejects
  boundaries inside them. Validate original and edited picture topology.
- Keep the original canvas when lifting the tail or the entire arrangement.

## [Local version 0.8.10]

- Ripple-trim linked clips through incoming/outgoing picture transitions in both
  directions, preserving blend windows/types and clip/source-link identities.
- Reuse scoped range handling for locks, groups, markers, automation and transcript
  retiming; include clips ending exactly at an insertion point in extension checks.
- Keep newly revealed source speech alignment stale until re-ASR. Generic range
  boundaries through picture blends remain blocked pending their own edit policy.

## [Local version 0.8.9]

- Slide a fixed middle clip through incoming/outgoing picture transitions while
  retaining both overlap windows, transition types and linked audio offsets.
- Compare linked edit boundaries including incoming picture handles; preserve
  source content, outer endpoints and one-step undo. Keep source limits visible
  for rejected move amounts. Ripple/range operations through blends remain limited.

## [Local version 0.8.8]

- Roll existing two-clip picture transitions while preserving their type, overlap
  duration and outer endpoints; linked audio follows the same frame displacement.
- Validate source handles, frame edges and transition topology before applying;
  reject consumed overlaps, locks and conflicts with neighbouring transitions.
- Add actual Trim tools/undo/GUI–CLI checks and a synthetic native Apple render
  check for the moved dissolve window. Slide/ripple blend edits remain restricted.

## [Local version 0.8.7]

- Add reviewed slide editing in Trim tools and CLI recipes: keep selected source
  content/duration fixed while trimming neighbours across linked sound/picture.
- Show source-handle limits; enforce locks, named groups, unambiguous neighbours
  and picture frame edges. Preserve outer endpoints and support one-step undo.
- Keep timeline markers/automation fixed; changed audio invalidates existing word
  alignment. Incoming picture blends remain unsupported for advanced trims.

## [Local version 0.8.6]

- Add a pasted shortened-transcript editor with ordered word matching, timestamp
  review, explicit repeated-phrase resolution and draft/project invalidation.
- Keep only reviewed speech passages across all audio and picture lanes with one
  undo step; preserve natural pauses within contiguous passages and remove others.
- Add reviewed `keep-words` CLI recipes with GUI/native parity; remove non-frame
  trailing canvas ends exactly without residual clips.
- Accept punctuation/case/spacing differences; reject rewritten/reordered speech,
  partial acoustic words, stale alignment, locked lanes and conflicting frames.

## [Local version 0.8.5]

- Integrate local CrispASR with timeline audio rendering, microphone/mix selection,
  German forced alignment, cancellation and stale-result protection.
- Add genuine word-timed speech editing: Delete closes the matching gap across all
  audio and video lanes, retimes transcript/markers/automation, and supports undo.
- Cover words with whole video frames, display/edit timing, enforce lane locks and
  protect adjacent words, picture blends and changed audio arrangements.
- Add CLI `transcribe-project` and `delete-word` recipes; retain word timing in
  saved projects and full CrispASR JSON imports.
- Keep ASR external on desktop; no bundled models or mobile ASR claim.

## [Local version 0.8.4]

- Add persisted named edit groups independent of AV source links, group recall,
  grouping toggle and clip labels; enforce linked/grouped scope and lane locks.
- Preserve group membership through splits and range edits; give pasted and
  imported track copies independent group identities.
- Add searchable timeline commands with shortcut hints, Cmd/Ctrl+K and macOS
  Edit menu entries. Close command search before invoking dialogs/actions.
- Exclude moving group members from snap targets.

## [Local version 0.8.3]

- Add reviewed rolling cuts, ripple trims and trim-to-playhead for linked AV,
  with source-handle limits, track protection and resulting-duration preview.
- Add previous/next edit-point controls, Cmd/Ctrl+Alt+Left/Right navigation,
  macOS Edit menu actions and contextual EN/DE trim explanations.
- Add matching CLI roll, ripple-trim and trim-to-playhead recipes.

## [Local version 0.8.2]

- Add explicit selected audio-range export and a macOS File menu action.
- Preserve DSP history before the range, with sample-bounded native output and
  Web Audio cropping; normal mix exports remain full length.
- Add CLI render-project --start/--end for audio and picture, and a GUI action
  to reuse the selected time range as picture export In/Out.

## [Local version 0.8.1]

- Add reviewed range lift, extract and insert-gap with audio/picture scope,
  persistent ripple participation and a resulting-duration preview.
- Keep linked AV splits aligned, excluded tracks fixed and automation values
  at edit boundaries; explicitly choose canvas/marker/transcript retiming.
- Preserve unaffected picture transitions; explain blocked blend/cue boundaries.
- Add matching CLI `range-edit` recipes and align legacy ripple with that scope.

## [Local version 0.8.0]

- Add saved time ranges independent of selected clips, with ruler dragging,
  keyboard-adjustable handles, exact bounds and audio/picture highlights.
- Add range playback/loop boundaries and an audio-clock gate for the end,
  including effect tails. Add macOS Playback actions and contextual EN/DE help.
- Add audio/picture lane locks that protect direct, inspector, linked, clipboard
  and CLI recipe clip edits while leaving mixing controls available.
- Keep the empty-project welcome panel below the ruler.

## [Local version 0.7.12]

- Add native Mac M4A/AAC export in the timeline AAC save dialog and CLI.
- Validate final AAC-LC packet tables against the exact source frame count,
  retaining priming and remainder metadata for gapless decoding.
- Keep ADTS AAC available and preserve the existing bitrate controls.

## [Local version 0.7.11]

- Stream eligible Mac timeline AAC exports through the native mixer and system
  encoder, preserving AAC-LC in ADTS `.aac` and the existing bitrate choices.
- Add CLI `.aac` output and `--audio-bitrate-kbps` (96/128/192/256/320, default 192).
- Validate every ADTS packet, stereo 48 kHz layout and actual packet duration;
  bound priming/padding explicitly instead of relying on bitrate estimates.
- Share atomic publication and cancellable temporary-file ownership with FLAC.

## [Local version 0.7.10]

- Add bounded native 24-bit FLAC export in the Mac timeline GUI and CLI using
  Apple's system encoder, with the GUI's quantisation and final STREAMINFO MD5.
- Mix to an owned float WAV, encode in 4096-frame chunks and publish atomically
  only after validating duration, sample rate, channels, depth and checksum.
- Retain the codec worker for in-memory/non-48-kHz projects and other platforms.
- Compare update versions numerically so 0.7.10 orders correctly after 0.7.9.

## [Local version 0.7.9]

- Save eligible Mac timeline WAV mixes directly with the native streaming mixer,
  without a rendered AudioBuffer, encoded Blob or PCM IPC transfer.
- Preserve GUI integer PCM settings at 8/16/24/32 bits, including clipping and
  JavaScript rounding; retain float WAV for default CLI/video intermediates.
- Add native CLI `--wav-bit-depth`, direct-job progress/cancellation ownership,
  and visible export error details. Other formats retain the encoder worker.

## [Local version 0.7.8]

- Stream linked 48 kHz mono/stereo project audio from disk during macOS GUI video
  export, sharing the native CLI mixer and all current timeline rack effects.
- Keep the full project clock for video section exports; seek the mix once.
- Retain Web Audio for audible in-memory sources, other render rates/platforms.
- Share cancellable media jobs across both paths; always clean temporary mixes.
- Test source selection, failures, cancellation and actual native section audio.

## [Local version 0.7.7]

- Complete native CLI timeline racks with stereo-linked compression at clip,
  track and master level: soft knee, adaptive release, makeup and 6 ms lookahead.
- Match WebKit's 32-frame envelope clock, pre-start silence and stereo pan law.
- Retain the adapted kernel's BSD-3-Clause copyright and licence in source/About.
- Add compressor comparisons for mono, bursts, impulses and parameter extremes.

## [Local version 0.7.6]

- Add native CLI timeline distortion with the GUI's 256-entry tanh curve,
  four-times oversampling, wet/dry mix and bounded stereo filter state.
- Match the wet path's 192-frame filter delay and retain short-clip tails.
- Adapt WebKit's resampling kernels/phase conventions under BSD-3-Clause, pin
  their source revision and bundle the copyright/licence notice in About.
- Extend WebKit comparisons with drive/mix endpoints, mono, unfiltered impulses
  and 18/19.5 kHz tones. Compression is the remaining native rack effect to add.

## [Local version 0.7.5]

- Add native CLI convolution reverb at clip, track and master level with the
  GUI's seeded stereo response, WebKit level calibration and dry/wet blend.
- Use direct early samples and FFT tail partitions for zero added latency and
  bounded state. Propagate mono-to-stereo reverb through the track's pan law.
- Extend the reusable WebKit/native tests with reverb sizes, five-second tails,
  short decays, mono sources and impulses; add independent convolution/tail tests.
- Bundle MIT notices for the already-linked RustFFT and its arithmetic dependencies.
  Keep distortion and compressor unsupported in the CLI.

## [Local version 0.7.4]

- Add native CLI delay and chorus at clip, track and master level, with bounded
  stereo delay lines, fractional interpolation and tails inside the chosen canvas.
- Match measured macOS WebKit delay feedback timing and absolute-time chorus LFOs;
  preserve the GUI's two-line chorus mix. Keep reverb/distortion/compressor explicit.
- Bound all audible racks to 64 MiB of delay-buffer state and 1024 enabled effects.
- Add a reusable real-WebKit/native PCM comparison harness requiring no FFmpeg,
  plus impulse, tail, stereo, fractional-delay and allocation-limit regressions.

## [Local version 0.7.3]

- Add native CLI bit crushing and ring modulation at clip, track and master level.
  Keep oscillator phase on the project clock, including clips that start later.
- Fix GUI ring modulation: scale the carrier, keeping the gain's intrinsic value
  zero so the wet/dry control actually works. This also corrects Voice processing.
- Use symmetric bit-crusher quantisation, keeping silence at zero and removing
  the old negative DC bias. Saved effect settings retain their values; these two
  effects deliberately sound different from older builds because of the fixes.
- Compare actual WebKit and native renders with overlapping clips, fades and
  three racks; keep unsupported native DSP explicit. No new codec dependencies.

## [Local version 0.7.2]

- Add bounded-memory native CLI project mixing: 48 kHz float WAV, mono/stereo pan,
  mute/solo, overlapping clips, gains, sampled fade curves, gain automation and
  low/high-pass filters at clip, track and master level. Reject unsupported effects.
- Decode/resample other audio layouts through Apple into streamed float PCM;
  preserve source offsets, finite output, cancellation and atomic no-overwrite
  publication. Keep optional FFmpeg compatibility and reject multichannel sources.
- Enable full linked-project MP4/MOV export with native audio plus Apple picture
  rendering, including trimmed sections. Keep temporary mixes in owned folders.
- Bundle Apache-2.0 Hound notices. GUI disk-paged rendering, advanced CLI DSP and
  permissive-only WebM remain unfinished.

## [Local version 0.7.1]

- Add native Apple rendering for every listed picture transition: directional
  wipes/pushes, dips to black/white, blur, zoom, pixelation, whip, glitch and a
  shaded 2D page peel. Whip/glitch/page peel use cached Metal kernels and explicitly
  reject unsupported GPUs. Native complex effects are not pixel-identical to FFmpeg.
- Test all 17 transitions on real encoded frames with FFmpeg unavailable to the
  application, checking unchanged endpoints, overlap effects, dip midpoints and
  wipe/push direction. Picture changes retain the existing audio mix and timing.

## [Local version 0.7.0]

- Add worker-based 24-bit FLAC export in SFX, Voice and Timeline with lossless
  compression, final stream checksum, cancellation and MIT/BSD codec notices.
- Add a bundled MIT macOS media helper using Apple system frameworks for probing,
  thumbnails, proxies, audio extraction and MP4/MOV picture composition. Support
  cuts, cross dissolves, gaps/tails, fades, per-clip colour and orientation.
- Add explicit Apple/FFmpeg/automatic video backend choices. Strict Apple mode
  never falls back; advanced transitions remain optional FFmpeg operations.
- Add VP9/Opus and AV1/Opus WebM export through optional FFmpeg, matching GUI/CLI
  options and output validation. Offer WebM/AVI/OGV/MPEG imports where decodable.
- Document codec source licences separately from patents, including Glint's AAC-LC
  scope and the remaining permissive-only WebM/iOS/backend work.

## [Local version 0.6.12]

- Add per-picture 90° rotation and horizontal/vertical mirroring, reset and copy
  to selected picture clips, with undo and saved project settings.
- Fit rotated pictures inside the existing frame without stretching. Apply
  screen-axis mirroring after rotation in CSS/canvas preview and native export.
- Add CLI `orientation` recipes with bounds validation. Leave linked sound,
  trims, canvas duration and export range unchanged for appearance-only recipes.
- Apply colour correction to source pixels before fitting/padding so black bars
  remain black, including custom transition previews.

## [Local version 0.6.11]

- Add per-picture-clip exposure, contrast and saturation, with bypass, reset and
  apply-to-selected-picture controls. Slider dragging creates one Undo step.
- Save colour settings in projects and apply them before fades/transitions in
  both preview and native FFmpeg export. Preserve each source's appearance in
  custom canvas transitions, including WebKit without Canvas filter support.
- Add a validated CLI `color` recipe operation. Colour-only recipes preserve
  linked audio, clip timing, export ranges and explicit canvas duration.

## [Local version 0.6.10]

- Restore FFT frequency bars alongside the spectrogram in SFX and Voice. Make
  presets, waveforms and analysis collapsible; spectrum/spectrogram start closed.
  Correct spectrum labels for the actual sample rate; skip hidden chart analysis.
- Add an ordered effects rack for clips, tracks and master: parameters, bypass,
  remove, reorder and copy/replace chains across scopes. Track/master racks are
  in the mixer; clip racks remain in Clip settings.
- Route realtime playback through master effects just like GUI export. Dispose
  effect nodes, feedback paths and modulation oscillators on stop/restart.
- Add multi-selection AV fade controls with durations/curves and single-step undo.
  Add frame-quantized video fade handles and envelope overlays on the timeline.
- Allow overlapping video fade-in/out envelopes within each clip's duration and
  multiply preview opacity to match FFmpeg export.

## [Local version 0.6.9]

- Keep SFX presets in one always-visible, horizontally scrollable row. Apply the
  same neutral icon preset strip and compact action buttons to Voice.
- Restore side-by-side SFX A/B waveforms with independent rendered buffers;
  keep noise samples stable when switching slots. Refresh output after undo,
  morph and sample-rate changes.
- Add genuine Hann-window FFT spectrograms for SFX output and Voice source or
  processed audio, with time/frequency axes and a fixed −90 to 0 dBFS scale.
  Cap analysis at 256 windows; label long audio as a sampled overview.
- Replace Voice's misleading spectrum (previously a time-domain loudness chart)
  and preserve parallel source/processed waveforms.

## [Local version 0.6.8]

- Add macOS File, Edit, View, Playback, Window and Help menus with standard
  shortcuts, enabled states and English/German labels. Project commands can open
  the timeline from another view. Text fields retain native AppKit editing.
- Route timeline clip editing through the existing clipboard/history, and
  Undo/Redo through the active panel’s history. Prevent duplicate shortcut actions.
- Compact SFX playback/export tools into icon controls. Presets use sound-type
  icons, neutral cards and wrapping localized names instead of colored blocks.
- Show one accurately labeled output waveform instead of two copies of the
  current buffer. Add duration/peak/RMS feedback; collapse detailed analysis and
  secondary quality/preset-file controls.

## [Local version 0.6.7]

- Replace the help manual dialog with contextual help mode: highlight controls
  and show one explanation beside the hovered, focused or tapped element.
- Help gestures cannot activate editing actions. Escape, the help toggle or its
  close button returns to editing. Disabled controls can also be explained.
- Add English/German explanations for transport, snapping, waveform display,
  clip editing, linked selections, mixer and track controls.

## [Local version 0.6.6]

- Center toolbar and transport SVGs in explicit square targets on WebKit.
- Keep video actions and More in the top scrolling toolbar; position More above
  app panels and within the content area. Touch tooltips escape scrolling panels.
- Replace long waveform-display and navigation hints with icon hover help.
- Prevent accidental selection of interface labels on macOS/iOS WebKit while
  keeping input and diagnostic text selectable. Project overview uses hover help.

## [Local version 0.6.5]

- Change the style of existing linked picture overlaps without moving audio.
  Existing overlap lengths survive style changes; unlink before changing length.
- Numeric picture fields commit on Enter and cancel on Escape. Merely focusing
  a field preserves exact timing; out-of-bounds edits are rejected visibly.
- Keep linked audio/video selection and its bounds after inspector edits.
- Compact toolbar layout and keep overflow menus visible above scroll panels.

## [Local version 0.6.4]

- Expanded viewer traps focus, isolates editing shortcuts, steps frames with
  Left/Right and toggles playback with Space; closing restores the expand button.
- Track grips auto-scroll near vertical edges and accept drops over waveforms.
  Escape, cancelled pointers and lost capture stop the drag; timing stays intact.
- Compact touch rows fit names, grips and trash, hide mixer controls below 96 px
  and retain an audible/silent indicator. Desktop compact rows remain below 56 px.
- Confine the playhead hit area to the timeline so it cannot cover adjacent
  track header controls at the viewport edges.

## [Local version 0.6.3]

- Picture gaps and the extended canvas stay black without reloading the default
  camera or blocking audio startup. The viewer remains available in empty regions.
- Fullscreen frame stepping follows the whole canvas and project frame rate.
  Failure notices remain inside the expanded viewer. A late browser fullscreen
  request is exited if the viewer has already closed; existing fullscreen is kept.
- Typing POS scrolls an off-screen target into view without disturbing a visible
  target. Scrubber and typed position use the same viewport rules.

## [Local version 0.6.2]

- Remove the video lane while keeping audio; undo restores links and picture.
- Pointer/touch/keyboard track reordering replaces the ineffective native drag handle.
- Shared audio/video row height from 24–640 px; timeline help explains controls.
- Editable POS/DUR fields accept seconds or timecodes. Extended canvas adds silent
  audio and black picture to the exported tail, without trimming existing clips.
- Drag partial video overlaps to create dissolves; crossfade selected overlapping
  audio with S-curve envelopes. Two simultaneous picture clips are supported.
- Expanded viewer escapes panel transforms, requests fullscreen and keeps playback
  controls. Remove the redundant View & tools dialog and duplicate zoom controls.
- Audio import chooses existing/new tracks, shows cancellable preparation stages,
  yields during waveform scans and retains desktop paths for efficient saves.

## [Local version 0.6.1]

- Align editable video with audio and the ruler under shared zoom/scroll.
- Separate whole-project navigation from the video track; drag the overview
  window to browse and the red cursor to seek. Playback picture stays fitted.
- Touch selection mode browses video without moving clips; Move & trim permits
  deliberate picture editing.

## [Local version 0.6.0]

- Follow-up: retain thumbnails for every camera, cover trimmed clip starts,
  permit native thumbnail images in the app policy, and expose first-thumbnail
  preparation through the CLI (`prepare --thumbnail`).

- Media bin, multiple video source files, linked audio/picture groups, copy/paste,
  frame trims, slip, ripple intervals, named draggable markers and frame rate/grid.
- Optional resizable inspector and touch overlay; timed transcript import/search,
  cue selection, corrected SRT export and passage removal across all tracks.
- Reviewed microphone section suggestions, visible shared gain automation,
  speech processing, conservative noise reduction and EBU R128 level matching.
- Saved sync decisions and optional audio drift correction; linked references
  remain guarded and picture drift requires unlinking first.
- Lightweight proxies, cancellable desktop exports, IndexedDB audio recovery,
  missing-file relocation and durable saved assets for cache-derived audio.
- CLI project recipes and linked-project WAV/MP4 rendering with explicit DSP
  limitations; multi-source picture export quantizes absolute frame boundaries.
- Fix misleading first black thumbnail on the Canon interview (one tile covered
  31.7 s); wait for a displayable frame, and avoid retargeting pending video seeks.
- Project format v3 reads v1/v2 and protects new metadata from older editors.

See [Media workspace](docs/MEDIA_WORKSPACE.md) for workflows and platform limits.

## [Local version 0.5.0]

- Draggable red playhead; audio zoom leaves a fitted picture overview with an audio-window indicator.
- Magnetic clip-edge snapping, exact positions, sample/ms keyboard and touch nudges.
- Auto-sync explicitly rejects competing near-equal correlation peaks, fixing platform-dependent confidence on periodic material.
- Parameterized track envelopes, with corrected curved/mid-fade resume behavior for segments.
- Non-destructive single-source video clips: split, move, source trim, delete/gaps, black fades and incoming transitions.
- Desktop/CLI edit-video compositor: dissolves, black/white dips, directional wipes/pushes, blur, zoom, pixelize, whip, glitch and shaded 2D page peel. Expensive interactive previews are labelled approximations.
- Timeline-first navigation, compact labelled icons with non-activating touch long press, and Voice view round trips to the original clip.
- Full project persistence includes picture edits. Video and sound remain independently editable; no ripple, multicam or multiple source videos.

## [Local version 0.4.1]

### Added
- Generic audio/video workflow with optional viewer, standalone camera import,
  New project reset, reusable Save/Load tracks, and audio-track auto-sync review.
- Visible horizontal navigation, trackpad deltaX/Shift+wheel panning, pointer
  centered zoom, lane-height controls and Fit all including picture/audio extent.
### Fixed
- Video waits for metadata before seeking and retries a transient first failure;
  expansion has a visible fallback plus native fullscreen with window restoration.
- Solo temporarily overrides saved mute consistently in playback and export.
- Transport sits beside tracks; seeking no longer destroys an already fitted view.
- Removing audio no longer truncates a linked video's timeline duration.

### Earlier October additions
- Shared video filmstrip lane, larger/fullscreen viewer, approximate 33 ms seeking,
  and a persisted in/out export range with accurate picture/audio section cuts.
- Alignment inspection overlay with selectable microphones, 100 ms–10 s windows,
  and beginning/middle/end checks on the original project clock.
- Visual waveform normalization (no audio changes), complete peak aggregation,
  and decoded sample drawing at high zoom.
- Desktop interview synchronization and drift correction, standalone media CLI,
  linked projects, video preview, and edited-audio MP4 export.
- Guided file selection/review, microphone comparison, full track mixer, timeline
  fit/scrubbing, visible clip actions, and a dialog-based clip inspector.
- Canon M50/RØDE/H6 walkthrough and explicit iOS/macOS distribution status.

### Fixed
- Put the global CSS reset in the base layer so Tailwind padding/margins work
  throughout the interface instead of being overridden.
- Touch selection no longer starts a clip move unless Move & trim is enabled.
- Track labels and waveforms share vertical scrolling.
- Batch audio import creates separate microphone tracks at the same position.
- iOS project saves embed audio instead of preserving inaccessible desktop links.
- Project pickers accept both `.crispaudio` and `.json`; file access errors are
  displayed instead of being silently treated as cancellation.
- Audio import decodes without waiting for playback permission after a picker.

### Platform limits
- Automatic video sync/export requires desktop FFmpeg. No October Apple release
  has been submitted. Mobile device testing and Mac App Store packaging remain.

## [0.3.0] - 2026-06-07

### Added
- Lazy-loaded panels and modals (React.lazy/Suspense) for faster initial load
- Vendor chunk splitting (React, i18n, state management) for better caching
- Mobile-responsive layout with collapsible sidebar and hamburger menu
- Panel transition animations (fade-in + slide)
- WCAG accessibility: skip-to-content, aria labels, tablist roles, keyboard nav, color contrast
- Timeline autosave to localStorage (30s + on beforeunload)
- Reusable SpectrumDisplay, AmplitudeDisplay, EnvelopeDisplay shared components
- ADSR parametric envelope visualization (synth param driven)
- Shared WAV export utility with Rust backend integration and JS fallback
- Microphone recording for Voice panel (MediaRecorder + AudioContext)
- Voice panel undo/redo via zundo (50-step history)
- Keyboard shortcuts help overlay (press ? to view)
- SFX waveform zoom/scroll with minimap (Ctrl+wheel zoom, drag pan, up to 16x)
- Timeline track reordering via drag handles
- "Check for Updates" in About dialog (GitHub releases API)
- PWA service worker for offline support (vite-plugin-pwa)
- Open Graph and Twitter meta tags for web SEO
- Full PARAM_INFO tooltip translations (28 entries, EN + DE)
- Complete i18n migration: all panels, shared components, FileDropZone (EN + DE)
- 845 JS tests + 11 Rust unit tests across 26 files
- Coverage threshold (50% lines) enforced in vitest config
- CHANGELOG.md, LICENSE, PWA raster icons, CLAUDE.md
- cargo test in CI, VoiceEngine/TimelineEngine structural tests
- Architecture diagram and Contributing section in README
- robots.txt and sitemap.xml for web SEO
- User-visible error feedback for file decode and JSON import failures

### Changed
- SFX/Voice WAV export now uses Rust encoder (supports 8/16/24/32-bit natively)
- Color contrast improved: --text-secondary and --text-muted differentiated
- Error handling hardened: projectFile/projectIO try/catch on all async paths
- Branded loading spinner replaces plain text Suspense fallback
- Audio playback stops cleanly on panel unmount (prevents orphaned AudioContext)
- Voice processAudio guarded against race conditions (staleness counter)
- ParamSlider wrapped in React.memo for render optimization
- Canvas visualizations use ResizeObserver + DPR scaling for sharp HiDPI rendering

### Removed
- Dead Tauri file_io commands (open_audio_file, save_audio_file)
- Dead clipboard.ts and audioAnalysis.ts utilities
- Dead ContextMenu.tsx component
- Disabled CSP replaced with proper Content-Security-Policy

## [0.2.1] - 2025

### Added
- Voice slot routing tests
- About dialog with full provider info, contact, disclaimer, and licenses

### Fixed
- Accessibility audit fixes
- Slot B presets and switching now work correctly
- Light theme gaps, gradient header contrast
- Delete orphaned LicensesModal.tsx (fixes release build)

### Changed
- Error boundary added
- Complete light theme support across all components
- Canvas visualizations made theme-aware

## [0.2.0] - 2025

### Added
- Light/dark theme toggle, loading screen, PWA manifest
- Global shortcuts, about modal (web version)
- Parameter suggestions
- Voice playhead animation, parameter tooltips, favicon
- Voice play source/processed, timeline drag-drop, playhead animation, i18n
- Numeric input toggle, share link at startup
- Undo/redo, mutate, JSON import/export, share links, auto-processing
- Deep functional tests for SFX audio generation
- 327+ unit tests: voice presets, effects, DSP, UI store
- Project save/load persistence
- Timeline audio import/export
- Settings, About, and Licenses screens
- Real FFT magnitude spectrum for SFX
- Complete i18n migration of SFX, Voice, and Timeline panels
- Mobile build workflow for iOS and Android (unsigned)
- Branch protection, Dependabot, non-blocking Intel release
- Vercel SPA rewrite rule

### Fixed
- Unused Theme import in App.tsx
- Fix 4 runtime bugs found in audit
- NaN test timeout (use lower sample rate and fast loop)
- StatusBar clock, remove dead Rust struct
- Lint errors and dead code cleanup
- TypeScript build errors
- iOS build compatibility (multiple fixes)
- Unused variable lint errors in functional tests

### Changed
- Redesign Voice panel and polish Timeline consistency
- Redesign SFX panel UX to match CrispFXR-web quality
- Unified release workflow for all platforms
- Upgrade CI and release workflows
- Wire up SFX synth and voice processing
- Remove Vite boilerplate assets

## [0.1.0] - 2024

### Added
- Initial commit: CrispAudio integrated audio workstation
