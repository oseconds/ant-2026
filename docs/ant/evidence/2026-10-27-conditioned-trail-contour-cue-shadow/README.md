# Conditioned-trail contour cue shadow

**Status:** registered capture and technical checks complete; artist review pending. No visual or production choice was made.

## Provenance and scope

- Fresh fetched `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Research parent: `d057ae1acf9db3f1b44ce2a1dd51a7ed79dafdc2`.
- Research branch: `codex/ant-conditioned-trail-contour-cue-shadow-20261027`.
- Seed `20261005`, current-G defaults, H1 isotropic diagnostic, 60 Hz, 640×640, DPR 1, no audio/DSP. H1 remains a visual research control.
- First Plate occurred at tick 4501 / `75.016666667 s`. The bounded capture spans tick 4201 through 6301 (`70.016666667–105.016666667 s`), first Plate −5 s to +30 s: 351 frames at 10 fps. Frame `n` maps to tick `4201 + 6n` and model time `70.016666667 + n/10 s`.
- Production defaults and simulation laws remain unchanged. This pass adds opt-in renderer-only contour conditions around the previous conditioned-trail View 4 readout.

The preceding artist response is preserved verbatim at [the prior package's ARTIST-REVIEW.md](../2026-10-27-material-conditioned-pheromone-readout/ARTIST-REVIEW.md). The artist described View 4 as a promising approach while saying an area was not felt and only some trails looked different. This pass tests a secondary grouping cue; it does not treat that comment as a technical result.

## Registered views

All three views use the previous View 4 rule: material is hidden, the same interior-only 4 px blend mask conditions a smooth-to-fixed-Bayer-screened readout, and pheromone source values and `pheromoneValueToAlpha()` stay the same.

| View | Registered rule |
| --- | --- |
| 1 | Conditioned trail readout only; no contour. |
| 2 | View 1 plus an always-on, one-native-pixel 8-neighbor inner boundary cue. |
| 3 | View 1 plus only the same boundary pixels within 12 native pixels (Euclidean distance) of currently active conditioned pheromone. |

Views 2 and 3 use grayscale RGB 140 / alpha 24, composited beneath pheromone and before ants. View 3 activity is `baselineAlpha > 0 && effectiveWeight > 0`. Temporal smoothing is 0 frames. The boundary cue stays inside the canonical support. There is no fill, texture, relief, color, animation, simulation RNG, or pheromone modification.

Before capture, a one-byte sequential p5 readback variance appeared on an empty-support snapshot at tick 4273 (native pixel 4215: baseline alpha 0 versus 1). The pre-registered values and time window were kept. A snapshot-identity cache now reuses View 1's exact smooth baseline raster for the other views of that same detached snapshot. It refreshes for the next snapshot and does not change simulation state. Full details are in [PLAN.md](PLAN.md) and [SOURCE-AUDIT.md](SOURCE-AUDIT.md).

## Technical observations

- The captured H1 state, full state, RNG, and event stream matched across the three renderer conditions and the prior H1 frame map. Renderer calls consumed no simulation RNG or events. Production defaults stayed unchanged; H1 remains opt-in.
- View 1 exactly matched the prior conditioned-readout View 4 checkpoint pixels at all four milestones (0 changed RGB pixels at each). Repeated rendering of unchanged snapshots produced stable PNG bytes.
- Material support, conditioned readout, and contour stayed within canonical support. Audits reported 0 outside-support changed pixels, 0 contour pixels outside support, 0 readout parity failures, 0 mixed-equation failures, and 0 renderer ant-raster changes. The recorded aggregate `compositeOutsideAntMaskChangedPixels` counts all changed pixels outside the ant mask, including expected in-support changes; it is not an off-support measurement.
- Pre-Plate had no material support or contour. At first-Plate post, support was 30,757 native pixels with a 4,184-pixel boundary; at +15 s and +30 s support was 43,055 pixels with a 4,632-pixel boundary. The world had 2 Plates and 967 occupied material cells at +15 s and endpoint. At endpoint the 316×316 pheromone field had 39,697 nonzero cells.
- View 2's full cue changed 4,184 / 4,184 boundary pixels post-Plate and 4,632 / 4,632 at +15 s and +30 s. Mean added darkness was about 10.10–10.23 (8-bit grayscale units) at those milestones.
- The 12 px gate was deterministic and followed its registered rule, but it did not remain selective in this world: it covered at least 75% of the boundary in 301/301 post-birth frames. It covered 4,184/4,184 boundary pixels at post-Plate, 4,632/4,632 at +15 s, and 4,528/4,632 (97.75%) at +30 s. Treat View 3 as a near-full contour in the observed window, not as evidence of a localized cue. No tuning followed this measurement.
- At +30 s, 2,303 View 3 pixels changed where the pheromone alpha at that exact boundary pixel was zero, while active conditioned pheromone existed within the registered 12 px neighborhood. This is consistent with the registered local-neighborhood gate; the audit separately found 0 local contour pixels when no conditioned activity existed anywhere in the snapshot.
- No human perception result is inferred from these pixel measurements.

## Review assets

Open the neutral synchronized [review page](review.html). It initially shows only View 1–3 and asks for free description; follow-up questions remain hidden until a response is recorded.

Three native 640×640 lossless clips are in `video/view-1.webm` through `video/view-3.webm` (351 frames each, 35.1 s, no audio). Twelve native PNGs in `stills/` cover pre-Plate, post-Plate, +15 s, and +30 s for every view. `frame-map-H1.csv`, `capture.json`, `manipulation.json`, `MEDIA-VALIDATION.json`, and `MEDIA-SHA256.txt` contain timing, state, renderer, media, and integrity records.

The first metadata-validation attempt stopped after encoding because its assertion read the wrong prior frame-map CSV column. A corrected replay passed. All 12 replayed stills were byte-identical; each of the three videos decoded to 351 RGB24 frames with 0 differing frames against the first capture. WebM container hashes differ, while decoded frame sequences match. The duplicate first-attempt media files were removed; their hashes and all decoded-frame comparison rows remain in `attempts/pre-metadata-capture/`.

## Human review and interpretation boundary

Artist free-description review is pending. The first prompt is: «무엇이 달라 보였고, 어떤 것이 자연스럽거나 이상하게 느껴졌는지 자유롭게 적어 주세요.» Do not treat View 2 versus View 3 as a strict single-variable causal comparison: one cue is global and the other is activity-gated, and this capture shows the gate was near-global after birth.

The technical evidence establishes that these registered renderer conditions were applied to the same world state. It does not establish area gestalt, aesthetic fit, material recognition, retained-history recognition, or production suitability. The pass ends here without contour tuning or adoption.

## Validation

- Focused tests: `node --test tests/material-conditioned-pheromone.test.js tests/ant-renderer.test.js` — 26/26 passed.
- Full suite: `npm test` — 369/369 passed.
- Build: `npm run build` — passed. Rollup reported two existing `zod` comment-position warnings and the existing 1,161.66 kB app-chunk warning.
- `git diff --check` — passed (Git printed only line-ending conversion notices for existing working-tree files).
- Independent read-only review found no actionable implementation defect and agreed the local gate must be described as near-full rather than selective.
