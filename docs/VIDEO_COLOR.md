# Picture colour correction — local 0.6.11

## GUI

1. Select a picture clip and open **Clip settings**.
2. Under **Colour correction**, adjust Exposure (−2 to +2 EV), Contrast (0–2)
   and Saturation (0–2). Neutral settings are 0, 1, 1; saturation 0 is grayscale.
3. The power icon bypasses the settings without erasing them. Reset removes the
   correction. Select multiple picture clips and use **Apply to selected picture
   clips** to copy the current settings. Linked audio remains unchanged.
4. Playback stops while editing. Play again to review; one slider drag is one Undo
   step. Save project retains the correction. MP4 export applies it per source
   before clip fades and transitions.

Preview and export share RGB operation order: exposure, clamp, contrast, clamp,
saturation, then fade. Browser colour management and native encoding can introduce
small differences. Custom transition previews process small canvas frames; native
exports use full resolution. External media that denies canvas pixel access cannot
receive colour correction in custom canvas transitions. Local Tauri media supplies
CORS headers. Ordinary video preview uses CSS filters.

## CLI

A recipe for a saved project uses picture clip IDs:

```json
[
  {"op":"color","ids":["picture-id"],
   "settings":{"enabled":true,"exposure":0.5,"contrast":1.1,"saturation":0.9}}
]
```

```sh
crispaudio edit-project --input saved.crispaudio --recipe colour.json --output graded.crispaudio
crispaudio render-project --input graded.crispaudio --video --output graded.mp4
```

Use `"enabled":false` to retain but bypass the correction; use `"settings":null`
to remove it. All four settings are required when supplying an object; values
outside the GUI bounds are rejected. An audio-only selection is rejected.
Colour-only recipes preserve canvas duration, picture export ranges, timing,
links and audio. Other timing operations retain their existing duration rules.

Standalone `edit-video` clip JSON accepts the same object as `colorCorrection`.
Older projects without this field retain their existing appearance. Native
`render-project` still rejects unsupported audio effects rather than dropping them;
use GUI export for a mix containing Web Audio effects racks.
