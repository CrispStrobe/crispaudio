# Vendored Glint provenance

- Upstream: https://github.com/CrispStrobe/glint
- Imported into CrispAudio in commit `2391d4b` (2026-07-17).
- `glint.wasm` SHA-256: `9eff0a5fef6bf2157dc5dabbcaff4911f3e0967850f6ee11a1df0932a4a3001d`.
- Original upstream revision, compiler version and build flags: **unresolved**.
  The current upstream checkout does not reproduce this binary; do not label it
  as the original source revision. Rebuild from a reviewed, pinned revision before
  claiming reproducible provenance.
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
exact binary; it does not establish its original source revision or worldwide
patent clearance.
