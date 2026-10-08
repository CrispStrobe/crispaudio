# Picture orientation — local 0.6.12

## GUI

1. Select a picture clip and open **Clip settings → Picture orientation**.
2. Use the curved arrows to rotate left/right by 90°. The displayed angle wraps
   through 0°, 90°, 180° and 270°.
3. Mirror horizontally or vertically with the two mirror icons. Mirroring uses
   the displayed axes after rotation, regardless of which control you used first.
4. Reset clears the orientation. With multiple picture clips selected, copy
   applies the current orientation to those pictures only. Linked sound, timing,
   fades and trims remain unchanged. Each action supports Undo.
5. Save project retains the settings; native MP4 export applies them too.

Rotation fits the source inside the existing composition frame, adding black
bars where necessary. It does not change the project's output dimensions or
provide an arbitrary-angle/crop editor. Colour correction runs on source pixels
before orientation and fitting; padding remains black. Fades and transitions
operate on the resulting frame. Native export is authoritative for advanced
transition effects. Thumbnails remain source images, not effect previews.

## CLI

```json
[
  {"op":"orientation","ids":["picture-id"],
   "settings":{"rotation":90,"flipHorizontal":true,"flipVertical":false}}
]
```

```sh
crispaudio edit-project --input saved.crispaudio --recipe orientation.json --output rotated.crispaudio
crispaudio render-project --input rotated.crispaudio --video --output rotated.mp4
```

All three fields are required. Rotation must be 0, 90, 180 or 270; mirrors must
be booleans. Use `"settings":null` to reset. Audio-only selections fail explicitly.
Recipes containing only `color` and/or `orientation` operations preserve duration
and export ranges. Standalone `edit-video` accepts the same settings under each
clip's `transform` property. Old projects without this property remain unchanged.
Native project audio rendering retains its existing limitations for effect racks;
use GUI export when the mix contains Web Audio effects.
