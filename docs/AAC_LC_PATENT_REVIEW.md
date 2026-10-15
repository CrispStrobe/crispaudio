# AAC-LC implementation and patent review

Reviewed **15 October 2026**. This supplements the
[codec licensing assessment](MEDIA_FORMATS_AND_LICENSES.md#distribution-assessment-2026-10-15).

## Finding and distribution recommendation

**No live patent claim that baseline AAC-LC necessarily uses was identified in
this scoped review.** There is concrete evidence supporting expired core patents
and distribution of a restricted AAC implementation approved by Fedora Legal.
The continued existence of the broader AAC pool does not demonstrate that Glint
needs a pool license. This review does not establish worldwide patent clearance
for every algorithm in the shipped binary.

Keep AAC-LC and current territories unchanged on this evidence. There is no
identified claim or country mapping here that justifies codec removal, country
exclusions, or assuming a royalty payment is due. Replacing Glint with Apple
codecs solely because the AAC pool remains active would be premature. A specific
claim that covers a shipped algorithm would warrant a different decision.

## What was checked

Two independent workstreams examined the codec implementation and patent records:

- The exact vendored WASM was executed without rebuilding it. Its bytes and
  output headers were recorded, and a constructed PNS stream was decoded.
- Glint source at `77738f3ed9b15f627196cc5bbd7f6406814ba2fb` was inspected for
  AAC tools and quantization behavior. Follow-up reproduced the shipped WASM
  and glue exactly from historical revision `ce488b4c7e2edf25fdaf8631b71ea599ba87ee18`.
  The AAC encoder implementation and its AAC headers are unchanged between that
  historical revision and the inspected source; the newer decoder has fixes.
- Fedora's original 2017 stripped source and current 2.0.3 source were inspected,
  together with its public legal decision and packaging manifest.
- The 2026 Q3 pool list was parsed: 645 US entries, including reissues. A screen
  of 84 older ordinary US grants examined titles/records; representative patent
  claims and descriptions were then read. This was not a claim-by-claim review
  of all pool patents or a search of all non-pool patents.
- The historical SEC-filed license cited for the often repeated 2028 date was
  read and its profile scope checked.

The [patent screen index](evidence/aac-patent-screen-2026-10-15.json) records the
84 documents and the pool PDF checksum. Patent documents were read through
Google Patents mirrors. Their displayed legal status and calculated expiration
dates are screening metadata, not independent national-register verification.
Direct DPMA/EPO register retrieval was blocked during this review.

## Original AAC-LC and the age argument

ISO records the original MPEG-2 AAC standard as published on **18 December 1997**,
nearly 29 years before this review. European patents ordinarily last 20 years
from filing. Those facts support the user's expiry argument, rather than a
presumption that original AAC-LC remains covered merely because licensing pages
still mention AAC. They do not date every optional implementation technique.
[ISO standard record](https://www.iso.org/standard/25040.html),
[EPC Article 63](https://www.epo.org/en/legal/epc/2020/a63.html).

A later patent cannot simply restart protection for an unchanged publicly
disclosed invention: novelty is required. Later improvements may nevertheless
be separately claimed, including encoder techniques that emit an ordinary LC
bitstream. Therefore the stream's profile alone cannot establish the status of
every algorithm used to create it.
[EPC Article 54](https://www.epo.org/en/legal/epc/2020/a54.html).

## Exact shipped binary evidence

Run offline from the repository root:

```sh
node scripts/audit-aac-wasm.mjs
```

The [probe](../scripts/audit-aac-wasm.mjs) uses the existing JavaScript glue and
WASM, no network or audio device. [Recorded output](evidence/aac-wasm-2026-10-15.json):

| Check | Result |
| --- | --- |
| WASM SHA-256 | `9eff0a5fef6bf2157dc5dabbcaff4911f3e0967850f6ee11a1df0932a4a3001d` |
| One-second mono sine, 48 kHz, requested 128 kbps | 16,382 bytes; 49 ADTS frames; all identify MPEG-4 AAC-LC, audio object type 2 |
| Constructed mono LC stream using only PNS codebook 13 for its spectral section | 4,096 finite, nonzero decoded samples at 48 kHz |
| Same PNS payload with either MPEG-4 or MPEG-2 ADTS ID | Both accepted |
| Same payload with other ADTS profile bit values 0, 2, 3 | All rejected |

The PNS fixture was also accepted independently by FFmpeg. Its amplitude is
deliberately tiny; the check establishes decoder functionality, not audibility.
Accepting a PNS stream bearing the MPEG-2 ID does not establish strict MPEG-2
conformance. Rejecting these three altered headers does not exhaustively prove
the absence of every extension or test all valid streams in those profiles.

Source inspection found standard MDCT/window switching, Huffman coding,
quantization/scalefactors, M/S stereo and TNS. The decoder also handles PNS and
intensity stereo; the inspected encoder does not select PNS/intensity codebooks.
No SBR/parametric-stereo synthesis or ER/LD/ELD/USAC implementation was identified
in that source. Fill extensions are skipped, which must not be described as
full HE-AAC decoding or proof that every HE-AAC input is rejected.
[Pinned source tree](https://github.com/CrispStrobe/glint/tree/77738f3ed9b15f627196cc5bbd7f6406814ba2fb/src).

## What Fedora's acceptance establishes

Fedora Legal's explicit public statement is dated **11 June 2019**, in comment
112. It says Fedora believed the implementation it intended to include was no
longer encumbered by AAC patents, expressly limiting that conclusion to that
implementation. This is substantive evidence against a blanket claim that all
AAC-LC implementations need licenses; it is not transferable clearance for Glint.
[Fedora Legal statement](https://bugzilla.redhat.com/show_bug.cgi?id=1501522#c112).

The comparison also corrects a possible oversimplification: **PNS is retained in
Fedora's stripped code**, including its original 2017 decoder. PNS alone does
not make Glint broader than the accepted implementation. The current fork also
retains encoder PNS. Original build lists retain TNS, intensity and M/S modules.
The current fork's README says HE/HEv2 parts were stripped; describing its entire
source as exclusively LC without further checks would overstate that evidence.

Sources downloaded and inspected:

- [Original review tarball](https://people.freedesktop.org/~wtay/fdk-aac-0.1.5-stripped.tar.gz),
  SHA-256 `52c1c919fa8c7b8ed8e9429d3f04b7253acc1d374e5c2a927e28c26c5d38cb9e`.
  README dated 10 October 2017; no signed checksum manifest was located for it.
- [Current 2.0.3 tarball](https://wtaymans.fedorapeople.org/fdk-aac-free-2.0.3.tar.gz),
  README dated 21 August 2025. Its SHA-512 matches Fedora packaging's `sources`
  manifest at revision `827a29f5cca86bb4549951b29dc7bf70c76b0810`:
  `d5dcb11d95acd3671fe0d92f5a4954b3f25faf0937d7f94a02bec9d7e556b321f4e3205b91fe40b3475f04ee9f879609c6419a6c699f5d854658c9a6f8b524f1`.
  [Packaging manifest](https://src.fedoraproject.org/rpms/fdk-aac-free/blob/827a29f5cca86bb4549951b29dc7bf70c76b0810/f/sources).

## Patent-specific findings

Dates/status below are reported by the document mirrors unless stated otherwise.
An expiry for one family is not a search for every possible patent on that tool.

| Patent / family | Finding and relevance |
| --- | --- |
| [US6766293B1](https://patents.google.com/patent/US6766293B1/en), [EP0931386B1](https://patents.google.com/patent/EP0931386B1/en), [DE19730129C2](https://patents.google.com/patent/DE19730129C2/en) | Core PNS signalling using a Huffman codebook number for noisy spectral groups. Priority 14 July 1997; US/EP filed 13 March 1998 and reported expired by lifetime in March 2018; German original expired in 2017. Concrete support for expiry of a relevant baseline-era family. |
| [US7788106B2](https://patents.google.com/patent/US7788106B2/en) | Reported adjusted expiry 26 June 2028. Claim 1 involves differential parameter coding and tuple ordering/signalling; description discusses BCC/spatial audio. Older AAC unsigned Huffman tables are background. This is a 2028 pool patent, but its presence does not demonstrate unavoidable LC liability. |
| [US8775193B2](https://patents.google.com/patent/US8775193B2/en) | Reported active, anticipated expiry 23 October 2027. Asymmetric low-delay complex subband filtering; description discusses ELD, SBR and QMF. Its generic filterbank title is not evidence that ordinary LC's symmetric MDCT requires it. |
| [US8494865B2](https://patents.google.com/patent/US8494865B2/en), [US8412533B2](https://patents.google.com/patent/US8412533B2/en) | Later context-based entropy/arithmetic coding. AAC Huffman coding appears as background; neither establishes that ordinary LC needs that context coder. |
| [US9305561B2](https://patents.google.com/patent/US9305561B2/en) | An optional TNS improvement, priority 29 March 2000, already reported expired with adjusted expiry 6 January 2021. A recent grant date alone does not establish a recent invention or a new term. |

### Optional encoder technique compared against Glint

[US8706507B2](https://patents.google.com/patent/US8706507B2/en) is a useful specific
countercheck: a later encoder technique can be compatible with an older format.
Priority 15 August 2006, filed 10 August 2007; reported active with adjusted US
expiry 25 July 2029. Its European family includes
[EP2054882B1](https://patents.google.com/patent/EP2054882B1/en), anticipated term end
10 August 2027, and German member DE602007012116D1. It was not located in the
current pool text.

Claim 1's sequence includes measuring quantization error, filtering it, and
feeding that filtered error into the frequency-domain signal before quantization.
The patent distinguishes this from prior-art TNS. Merely measuring noise or
using ordinary TNS is not evidence of the complete sequence.

At the inspected Glint revision:

- `aac_coder.cpp`, `aac_band_noise` (line 173 onward), sums squared reconstruction
  errors into a per-band measure.
- `aac_encoder.cpp`, `shape_channel` (lines 697–807), changes scalefactor offsets
  and refits the same constant input spectrum. The allocator in `aac_coder.cpp`
  (lines 550–694) likewise changes quantization scales.
- Ordinary TNS filters the original spectrum before quantization and sends
  coefficients in AAC syntax. No filtered quantization-error feedback into the
  input spectrum was found in these paths.

Thus this candidate did **not** establish that Glint implements its full claimed
sequence. This is an engineering comparison, not a legal non-infringement opinion
or blanket patent clearance. A subsequent isolated rebuild reproduced the exact
shipped binary from historical source; the relevant AAC encoder files match the
source inspected for this comparison.

## Why the repeated 2028 date is not established here

The cited [SEC-filed 2018 Siyata/Via agreement, Appendix A](https://www.sec.gov/Archives/edgar/data/1649009/000121390020023370/ea125930ex10-9_siyatamobile.htm)
contains one combined list spanning AAC, HE-AAC/v2, LD, ELD, scalable AAC and xHE.
It gives neither profile-by-profile patent mapping nor a 2028 expiry statement.
It therefore does not, by itself, substantiate the claim that the last unavoidable
baseline-LC patent expires in 2028. This review did not reconstruct or verify the
secondary calculation behind that claim. Do not repeat it as an established date.

## Remaining limits and useful follow-up

**Source traceability was resolved in follow-up.** On 2026-10-15 an isolated
Emscripten 6.0.2 build of Glint revision
`ce488b4c7e2edf25fdaf8631b71ea599ba87ee18` reproduced both the shipped WASM and
JavaScript glue byte for byte. The AAC encoder files and AAC encoder headers are
unchanged from that revision to the inspected current source. The decoder has
later KBD-window/short-window TNS fixes. See the
[rebuild record](evidence/glint-rebuild-2026-10-15.json) and
[provenance record](../src/lib/glint/UPSTREAM.md). No codec replacement is needed
to resolve this documentation question.

**Free versus paid:** an expired patent cannot be infringed by either free or
paid distribution. Conversely, free public distribution is not a general patent
exemption: Germany's exception requires private, noncommercial acts, and §9 also
covers making, offering and placing products on the market. A future applicable
license could distinguish distribution models; we have not established that one
is needed for this AAC-LC implementation. Donations do not change an expired
patent's status. [WIPO patent FAQ](https://www.wipo.int/en/web/patents/faq_patents),
[PatG §9](https://www.gesetze-im-internet.de/patg/__9.html),
[PatG §11](https://www.gesetze-im-internet.de/patg/__11.html).

For any specific live candidate, compare all relevant claim elements with the
actual shipped implementation and verify national status. That focused work is
more useful than a generic inquiry about all AAC profiles. This review did not
check every country, every patent family, equivalents, or all non-pool patents.

The separate extracted-table copyright/provenance questions and Opus notice fix
remain as documented in the general licensing assessment. Neither those matters
nor donation/business status determines whether an expired AAC patent revives.
No codecs, Store territories, installed apps or external licensing agreements
were changed, and no licensors were contacted.
