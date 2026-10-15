# Native effects playback on Mac

Add AU or VST3 inserts through the mixer or clip effects. New inserts are enabled.
The selector beside Play offers **Live** and **Preview**. This feature requires the
installed Mac app; browser and iOS sessions can retain the project data.

| Action | Live | Preview |
|---|---|---|
| Play | Prepares sources and plugin history, then processes continuously | Renders and caches the complete wet mix |
| Pause / resume | Retains DSP state and queued audio | Reuses the cached mix |
| Seek | Rebuilds history to the new position | Seeks within the cached mix |
| Loop | Musical time wraps; effect tails continue | Repeats the rendered range |
| Fader, pan, mute/solo, sends, native parameters/bypass | Update the running graph | Stop playback and invalidate the mix |
| Clip edits, routing, insert order or built-in FX changes | Restart from the current position | Require another render |
| Meters | Track/master peak and RMS, master LUFS/true peak | Master meter |

In Settings, select the playback device. Changing it during Live playback closes
the old output and prepares the current position on the selected device. A missing
device, stalled audio clock, plugin failure or underrun stops playback and reports
an error. Reconnect/select an output and press Play to retry. It never silently
continues through a failed native graph.

Audio runs at 48 kHz. Other source rates are converted from frozen copies before
playback; project and original source buffers retain their rates. Native snapshots
are bounded to 256 MB. Live loops need at least 2,048 frames (about 43 ms); use
Preview for shorter loops. Large projects may require Preview. Starting late in a long
project takes time because plugins must process the earlier history.

Live native playback currently excludes microphone and automation-pass recording,
and monitor clicks.
Disable native inserts to record. The generic controls support plugin parameters;
custom plugin windows and MIDI instruments are outside this checkpoint.

## Try the included session

1. Open **File → Sample sessions**, then **Native plug-ins (Mac)**.
2. Choose **Live** and press Play.
3. Open the mixer, expand AUBandpass in the master rack and change Frequency.
4. Compare Bypass; pause and resume; select the edit range and enable Loop.
5. Choose **Preview** to compare the rendered alternative.
6. Export directly or add WAV, FLAC and AAC jobs to Delivery. Both routes include
   the native effects. Native export stops live playback to release its instances.

The sample uses an Apple effect supplied with macOS and generated original audio.
No third-party plugin installation or external recording is required.

## Developer validation

The silent native runner uses a real selected Core Audio device with queue volume
zero. Its captured PCM verifies DSP behavior; this does not establish physical
speaker audibility or qualify every third-party plugin/interface.

```sh
CRISPAUDIO_NATIVE_VALIDATION_NATIVE_LIVE=1 node scripts/test-native-timeline-tauri.mjs
```

For the sustained pause check, run `python3 scripts/test-native-long-pause.py`
after building the helpers. It opens no audio device and verifies both the held
clock and VST3 delay history after 65 seconds idle.

The fixture requires the existing VST3 ADelay test bundle and helper scan binaries
(documented by the runner's `CRISPAUDIO_TEST_*` overrides). It checks loop tails,
seek history, pause retention, live controls, UI stalls, 44.1 kHz conversion,
multi-instance routing, background playback, injected faults, recovery and the
German transport. The callback keeps four fixed PCM slots and two output buffers;
all graph construction, plugin calls, metering and control messages run elsewhere.


Dedicated render, pipe-I/O and plugin threads use Mach real-time deadlines after
preparation. The pipe threads are part of the audio deadline too; ordinary QoS
there can delay the entire graph. See Apple's [Mach scheduling documentation](https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/KernelProgramming/scheduler/scheduler.html).
Pauses have no helper idle timeout; command watchdogs and owner-EOF cleanup remain
active. Audio Unit temporary Objective-C objects are released per packet.
