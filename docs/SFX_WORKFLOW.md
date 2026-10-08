# SFX and Voice workflow

Sound presets stay visible in one horizontally scrollable row. Swipe sideways,
use the trackpad, or Tab between preset buttons. Names wrap inside each icon card
in German and English. There is no collapse control.

Playback, loop, randomize, mutate, undo/redo, export and Send to Timeline share a
compact icon bar. Hover for labels or hold on touch without activating a control.
Switch A/B, copy a slot or swap slots to compare sounds. Morph interpolates sound
parameters between the slots; it is not an audio crossfade.

Both SFX slot waveforms remain visible side by side, including on narrow screens.
Each uses its own rendered samples. Renders are cached by parameters and sample
rate, so switching away and back does not silently reroll a noisy sound. Editing
one slot refreshes its waveform without changing the other slot's samples. The
output uses the active slot at 0%, the opposite slot at 100%, and a separate
parameter-interpolated render between those endpoints.

The spectrogram describes that output, including a morphed output. Horizontal
position is time, vertical position is frequency from DC to the actual Nyquist
frequency, and colour represents Hann-window FFT peak amplitude from −90 to
0 dBFS. It is not normalized independently per time slice, so fades and quieter
sounds remain quieter. Duration, peak and RMS describe the complete output.

Analysis uses 1024-sample windows with a nominal 256-sample hop, capped at 256
uniformly spaced windows. Long audio is explicitly marked as a sampled time
overview: short events between windows may be missed. This is an offline buffer
visualization, not a live microphone analyzer. No pitch estimates are implied.

Open Level and envelope details for amplitude, volume envelope and ADSR graphs.
Audio quality and preset files contains sample rate/bit depth, preset import and
export, sharing and the alternate export control. These secondary panels start
collapsed. Change parameters in the Basis, Envelope, Effects and Advanced tabs.
On macOS, menu Undo/Redo uses the active panel's history too.

In Voice, load or record audio, choose an icon preset, select A/B settings or
morph, then Process. The original and processed waveforms remain side by side.
The compact controls play either source, process, undo/redo, export or send the
result to Timeline. The spectrogram shows processed audio when available,
otherwise the source. Voice analysis uses the first channel and says so. Level
details are optional. Process again after changing settings to update the result.
