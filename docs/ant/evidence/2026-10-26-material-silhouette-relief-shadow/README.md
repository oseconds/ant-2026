# Material silhouette / edge-depth shadow — 2026-10-26

**Status: technical pass complete; artist review pending.** This renderer-only H1 pass compares five numbered views of one natural state stream. It does not select a final aesthetic or production material style.

## Provenance and boundaries

- Fresh `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Research parent: `01bbef5f5e7a82aaa4774ca866d14312332e9323`.
- Branch: `codex/ant-material-silhouette-relief-shadow-20261026`.
- Registered plan and pre-result ruling: [PLAN.md](PLAN.md); source audit: [SOURCE-AUDIT.md](SOURCE-AUDIT.md).
- Previous artist response is preserved verbatim at [ARTIST-REVIEW.md](../2026-10-26-material-identity-decomposition/ARTIST-REVIEW.md). It applies only to the earlier texture views; it does not generally reject texture families.
- Production defaults remain unchanged. H1 isotropic heading and Views 3–5 are opt-in research controls. No texture, hatching, stipple, grain, pheromone modification, physical height, production adoption, PR or merge.

## Registered views

| Neutral label | Internal renderer mapping | Registered presentation |
| --- | --- | --- |
| View 1 | Existing `presence-96` | Interpolated 96-grid material, RGB 100, alpha 96 |
| View 2 | Existing `presence-96-sharp` | Same source pixels/RGB/alpha as View 1; material-only nearest filtering |
| View 3 | `presence-20-sharp` | Canonical native nearest support, flat RGB 100 / alpha 20 |
| View 4 | `presence-20-edge` | View 3 plus 2-native-pixel interior band, RGB 80 / alpha 64 |
| View 5 | `presence-20-directional-edge` | View 4 support/fill/band/alpha; deterministic directional RGB cue only |

The viewer shows only `View 1`–`View 5`. Its first prompt asks for free description; structured questions stay hidden until the first response is recorded.

## World and capture provenance

The research world used seed `20261005`, current-G defaults, H1 `isotropic-diagnostic`, 60 Hz, native 640×640, DPR 1, and no audio/DSP. A single world stream supplied all five renderers. The run reached tick 6301, the first Plate +30 model seconds. See [capture.json](capture.json), [frame-map-H1.csv](frame-map-H1.csv) and [manipulation.json](manipulation.json).

The first natural Plate occurred at tick 4501 / 75.016666667 model seconds. Milestones are tick 4500 pre-Plate snapshot, tick 4501 immediately after birth, +15 s at tick 5401 and +30 s at tick 6301. The tick-4500 snapshot has zero Plates, although its capture-time live event counter already includes the birth event; use the saved model state and tick/RNG anchors for the pre-birth boundary.

At +15 s and +30 s the world had 2 Plates and 967 occupied material cells. At the endpoint, pheromone had 39,697 nonzero cells, maximum `1.32289994`, and sum `2371.91337`. These are descriptive consequences of this H1 run, not renderer effects or mature-world results.

The initial capture wrote all five complete videos and 20 checkpoint stills, then failed while decoding endpoint RGB into a Node child-process buffer. A later deterministic metadata replay regenerated the checkpoint PNGs, byte-matched all 20 against the saved media, matched all 1,052 prior H1 sampled state/RNG records and preserved the existing video hashes. It did not encode or overwrite media. The final metadata therefore records a recovery replay, not the lost in-memory acquisition trace. Attempt logs and partial files are retained under `attempt-01/` through `attempt-05/`.

## Manipulation validity and technical measurements

- H1 sampled states/RNG, first-Plate timing and endpoint RNG/events match the validated H1 parent. Renderer order does not change detached snapshot, RNG or events. Repeated same-snapshot renders preserve PNG bytes and cache identity at all four milestones.
- Views 1/2 retain the previous mappings and their four checkpoint PNGs match the parent byte-for-byte. Their material source mask/RGB/alpha are unchanged.
- Views 2/3 use identical canonical nearest support; View 3 changes fill alpha to 20. Views 3/4 share support and faint fill; View 4 adds only the fixed 2-pixel interior band. Views 4/5 have identical band support, thickness and alpha; View 5 changes only deterministic band grayscale.
- Views 3–5 have zero material pixels and zero composite changes outside canonical support. At +30 s their support is 43,055 native pixels and their edge band is 8,605 pixels. No simulation RNG or state input is used by temporary normals or edge rasterization.
- View 4/5 white-composited mean boundary-darkness mismatch is `0.001421` levels immediately after birth and `0.000642` at +15/+30 s. View 5 edge RGB spans 56–104 with alpha fixed at 64. This reports the registered technical match; it does not establish visibility, relief, or surface interpretation.
- The existing 96-grid support remains stair-stepped at native size. No geometry smoothing or reconstruction was added; its influence on artist reading remains an interpretation limit.

Full per-milestone values and parity assertions are in [manipulation.json](manipulation.json). Do not treat pixel/luminance statistics as an artistic verdict.

## Review assets

- [Neutral synchronized review page](review.html)
- [Five native 640×640 videos](video/): 1,052 frames each, 105.2 s, lossless VP9, no audio.
- [Twenty native 640×640 milestone PNGs](stills/): pre-first-Plate, immediately post-birth, +15 s and +30 s for every view.
- [Media validation](MEDIA-VALIDATION.json), [video/still checksums](MEDIA-SHA256.txt), and [file receipts](RECEIPTS.json).

FFmpeg-decoded final frame RGB matches each +30 s PNG. The review-page smoke checked native stills, neutral labels, first-response gating, lazy video loading and zero page errors. It did **not** verify video playback in Chrome; use the local page and report any playback issue with the first free description.

## Validation and status

- Focused renderer/helper tests: 17/17 passed.
- Full `npm test`: 356/356 passed.
- `npm run build`: passed. Existing warnings: two Zod annotation comments removed by Rollup and 1,161.66 kB application chunk warning.
- `git diff --check`: passed before commit.

**Artist review pending.** First collect only: “무엇이 달라 보였고, 어떤 것이 자연스럽거나 이상하게 느껴졌는지 자유롭게 적어 주세요.” After that response, the artist may distinguish visibility, another mark/state, surface/depth impression, outline/map/road reading and ant readability. No winner or artistic interpretation is recorded yet.

The pass cannot establish literal terrain height, physical pressing, production suitability, a general texture/boundary rule, H0 transfer, mature accumulation, or whether silhouette/edge cues create material identity. H1 is a temporary deconfounding control, not a production heading recommendation.
