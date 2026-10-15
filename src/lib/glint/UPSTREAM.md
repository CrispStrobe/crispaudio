# Vendored Glint provenance

- Upstream: https://github.com/CrispStrobe/glint
- Imported into CrispAudio in commit `2391d4b` (2026-07-17).
- `glint.wasm` SHA-256: `9eff0a5fef6bf2157dc5dabbcaff4911f3e0967850f6ee11a1df0932a4a3001d`.
- **Verified reproducing source revision:** `ce488b4c7e2edf25fdaf8631b71ea599ba87ee18`.
  An isolated build on 2026-10-15 reproduced **both** shipped `glint.wasm` and
  `glint.mjs` byte for byte. The developer also confirms the binary came from Glint.
- Toolchain: Homebrew Emscripten 6.0.2 (`emcc --version`: 6.0.2-git).
  Full arguments and output checksums are recorded in
  [the rebuild evidence](../../../docs/evidence/glint-rebuild-2026-10-15.json).
  Archive `src`, `include` and `CMakeLists.txt` from that revision into an isolated
  directory, create `bindings/wasm`, then run `emcc` with the recorded arguments.
  This verifies a source/build combination; it does not recover the original
  invocation log or distinguish commits with identical build inputs.
- Glint's own license is in `LICENSE`. Extracted libopus table notices are in
  `../licenses/opus.txt` and included in the app's About dialog.

## Audit on 2026-10-15

Upstream `src/opus_silk_tables.hpp` identifies libopus 1.5.2 as the table source.
The shipped WASM contains exact gain, pitch-contour and shell-code table byte
sequences (offsets 459543, 459343 and 459100 respectively). This establishes a
concrete reason to preserve libopus notices; it is not a complete reconstruction
of the binary's sources.

Upstream `tools/gen_aac_tables.py` extracts tables from FFmpeg and vo-aacenc and
identifies these as normative ISO data. That provenance and its license treatment
need review; this audit establishes neither LGPL applicability nor clearance.

AAC patent clearance is separate from source licenses. See
[the codec licensing assessment](../../../docs/MEDIA_FORMATS_AND_LICENSES.md#distribution-assessment-2026-10-15).

The [deeper AAC-LC review](../../../docs/AAC_LC_PATENT_REVIEW.md) records actual
binary capability probes, comparison with Fedora's stripped codec and scoped
patent-claim checks. `node scripts/audit-aac-wasm.mjs` reruns the offline probe
from the repository root. It establishes AAC-LC output and PNS decoding in this
exact binary. The separate rebuild establishes matching source/build inputs;
neither check establishes worldwide patent clearance.
