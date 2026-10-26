# Heading × material visibility shadow — 2026-10-26

## Question and boundary

Does production fixed-north accepted heading create route bundling that makes retained material harder to read? This is a 2×2 diagnostic, not a production heading or material selection. H1 is a temporary isotropic control; M1 is a strong material-presence positive control. A subsequent [artist response](ARTIST-REVIEW.md) reports clear visibility and motivates identity research; it does not select a production heading or establish retained-history recognition.

## Registered conditions

| | M0 — Production material | M1 — Strong material |
| --- | --- | --- |
| H0 — Production heading | Production heading + production mapping | Production heading + fixed-alpha presence |
| H1 — Isotropic diagnostic | Isotropic accepted heading + production mapping | Isotropic accepted heading + fixed-alpha presence |

- H0 keeps production accepted heading. H1 maps the same single accepted-heading draw `U` at the original draw location to `wrap(−π + 2πU)`, including the initial ant. Position/retry draws, cadence, activation, personality and lifecycle draws remain in the same order.
- M0 uses current production mapping. M1 uses occupied material mask only, RGB `(100,100,100)`, fixed alpha `96`, beneath pheromone. No texture, contour, color, relief or layer-count variation.
- Both worlds use seed `20261005`, current-G production defaults, 60 Hz steps and native 640×640 rendering. No audio bridge or DSP was created.

The exact branch/source check is in [SOURCE-AUDIT.md](./SOURCE-AUDIT.md). The preregistered plan remains in [PLAN.md](./PLAN.md).

## Implemented facts and manipulation checks

- Freshly fetched `origin/main` was `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`; the research branch starts from validated shadow commit `8fc9041dd1fdb9979a23616db175df9a34be978d`.
- H0 matched the earlier current-G A/B/C capture: all 1,142 sampled source-state hashes, four milestone state hashes, final RNG state/calls, event counts, first Plate time and four M0 milestone PNG bytes matched exactly.
- Within each heading world, M0 and M1 rendered the same detached snapshot stream. Before/after fingerprints, RNG and event counts remained equal for every video frame. Cross-heading worlds are not same-state comparisons.
- H0 accepted-heading sample: 80, circular resultant `0.9829`; all samples remained within the production ±0.3 rad spread around `−π/2`. H1 sample: 123 across all 12 angular bins, circular resultant `0.1169`. This is a manipulation check for these captures, not a population-level estimate.
- Initial H0/H1 RNG state and call count matched. The initial snapshot state diverged at tick 0 because the accepted heading changed; RNG first diverged at tick 71. Exact per-tick RNG trace is in `capture.json` and the summary is in [cross-heading-divergence.json](./cross-heading-divergence.json).
- M1's material image contained alpha 96 and RGB `(100,100,100)` on every occupied cell, with alpha 0 outside the mask. Endpoint pixel changes remained within one source-grid cell of the material mask.

## Heading intervention results — descriptive

These are world consequences of changing accepted heading, not renderer effects:

| Heading | First Plate | +30 s endpoint | Plate births | Foot contacts | Endpoint ants | Occupied material cells | Positive pheromone cells | Pheromone max | Node sum / reconstructed integral |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| H0 | tick 5,041 · 84.0167 s | tick 6,841 · 114.0167 s | 2 | 4,061 | 16 | 677 | 33,044 | 1.5797 | 2,225.763 / 0.022421 |
| H1 | tick 4,501 · 75.0167 s | tick 6,301 · 105.0167 s | 2 | 4,353 | 15 | 967 | 39,697 | 1.3229 | 2,371.913 / 0.023904 |

Both worlds had zero nodules and zero controller errors. The complete per-milestone ant, Plate, material and pheromone summaries are in `capture.json`. Cross-heading differences are matched-seed intervention outcomes; they do not isolate a pure renderer effect or establish a production heading preference.

## Renderer measurements — technical only

At +30 s, H0 had 677 occupied material cells and H1 had 967. M0 mean stored material alpha was `10.66` (H0) and `11.02` (H1); M1 was exactly `96` in both. M0/M1 changed 38,918 pixels in H0 and 58,848 in H1; all changes were inside the one-cell material support band. These are technical pixel measurements and do not answer whether material reads as a distinct place.

## Review assets

- [Synchronized 2×2 review page](./review.html), with shared first-Plate-relative playback/seek and exact native-size milestone stills.
- Four separate native 640×640 videos: [H0/M0](./video/H0-M0.webm), [H0/M1](./video/H0-M1.webm), [H1/M0](./video/H1-M0.webm), [H1/M1](./video/H1-M1.webm). H0 streams have 1,142 frames; H1 streams have 1,052 frames. Each within-heading pair has identical frame count and snapshot source hashes.
- Native 640×640 stills: [pre-Plate](./stills/), [post-Plate](./stills/), [+15 s](./stills/), [+30 s](./stills/). The folder contains all 16 condition/milestone PNGs.
- [Frame maps](./frame-map-H0.csv) · [H1 frame map](./frame-map-H1.csv) · [heading samples](./heading-distributions.json) · [pixel measurements](./pixel-measurements.json) · [media checksums](./MEDIA-SHA256.txt).
- Browser smoke verified all four videos and all 16 native stills load; shared seek at Plate +15 s reached the correct per-world offsets with no page errors. See [review-page-check.json](./review-page-check.json).

## Review questions and subsequent artist response

The subsequently supplied response is preserved verbatim in [ARTIST-REVIEW.md](ARTIST-REVIEW.md). The original questions below remain the review brief; the response does not answer each question independently.

Please judge from the synchronized assets:

1. Does M1 in H0 remain absorbed into thick routes, while the same M1 in H1 reads more readily as retained surface?
2. If H1/M1 differs, does that seem to come from reduced route bundling rather than stronger material visibility?
3. Is M0/M1 still difficult to distinguish in either heading condition?
4. Does M1 read as “a darker route” or as “a surface left in that place”?
5. Does H1 reduce the upper-goal, fan-shaped or road-network impression? How does ant tracking feel in each world?

Prior material-only artist feedback is preserved verbatim in the [original evidence package](../2026-10-26-material-rediscovery-shadow/ARTIST-REVIEW.md): “음 B뿐만 아니라 다 그렇긴 한거같은데 보기에 일단 차이 모르겠어 잘”. That earlier response concerns A/B/C from the prior pass and is not a judgment of these four conditions.

## Validation

- Focused controller, renderer and stratigraphy tests: **45/45 pass**.
- Full `npm test`: **342/342 pass**.
- `npm run build`: **pass**. Existing Zod annotation notices and the 1,161.66 kB app-chunk warning remain.
- Synchronized review-page browser smoke: **pass**.
- Capture runner: `node scripts/ant-heading-material-visibility-shadow.js`.

No artistic conclusion, production adoption, alpha tuning, heading replacement, audio experiment or mature-world run is part of this pass.
