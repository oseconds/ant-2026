# Material-conditioned pheromone readout shadow

**Status:** registered capture and technical validation complete; artist free-description review pending. No artistic winner, production renderer, or simulation law was selected.

## Provenance and scope

- Fresh `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Research parent: `c18ee388aa8385ad76cefacab5ba0d215fd02b10` (`codex/ant-material-smooth-substrate-relief-20261027`).
- Research branch: `codex/ant-material-conditioned-pheromone-readout-20261027`.
- Seed `20261005`, current-G defaults, H1 `isotropic-diagnostic`, 60 Hz, native 640×640, DPR 1. No audio/DSP.
- This changes renderer readout only. Pheromone values, mapping, recruitment/movement, material laws, production defaults, and production heading are unchanged. H1 remains opt-in research control.
- Current production pheromone source is 316×316; black RGB uses the existing `pheromoneValueToAlpha()` mapping (maximum mapped alpha 112), scaled with smoothing. Exposed retained support is the 96×96 `topLayerByCell` mask.

## Registered views

| Review label | Renderer rule |
| --- | --- |
| View 1 | Existing RGB 100 / alpha 96 interpolated material reference, with normal production pheromone readout. |
| View 2 | No visible material; production pheromone readout. The diagnostic `material-control` path reads and writes back identical opaque pheromone pixels to match the later canvas processing path. |
| View 3 | No visible material; production-smoothed and nearest-sampled readouts of the same mapped source are mixed by the 4 px interior-only material mask. |
| View 4 | No visible material; production-smoothed and fixed Bayer-screened readouts of the same mapped source are mixed by the same mask. |

The 640×640 blend mask is derived from exposed binary material support. An 8-neighbor boundary seeds exact native-pixel Euclidean distance; inside weight is `smoothstep(0, 4 px, distance)`. Outside support weight is exactly zero. There are no direct material fill, outline, shading, texture, color, background, or pheromone-field changes in Views 2–4. View 4 uses the registered 4×4 Bayer matrix, fixed canvas origin, 2×2 replication (8×8 native period), and alpha 112; no temporal or simulation randomness is used.

## World and capture

- First natural Plate: tick 4501 at `75.016666667 s`; pre-Plate snapshot is tick 4500 at 75 s. Endpoint is tick 6301 at `105.016666667 s` (+30 s).
- The bounded clip spans model time `70.016666667–105.016666667 s`: 351 frames at 10 fps. Frame `n` maps to tick `4201 + 6n` and model time `70.016666667 + n/10 s`.
- Every sampled frame's snapshot hash, full snapshot hash, RNG state, and RNG call count match the prior H1 frame map. First-Plate and endpoint fingerprints, RNG, and events match as well. Each condition uses the same detached snapshot in one shared renderer; render calls consume no simulation RNG or events.
- At +15 s the world has 2 Plates and 967 exposed material cells; these remain the endpoint counts. Material support changed between the first-Plate post snapshot and +15 s, then remained stable through +30 s.
- The four native 640×640 lossless videos are `video/view-1.webm` through `view-4.webm` (351 frames each, 35.1 s, no audio). Sixteen native PNGs in `stills/` cover pre-Plate, post-Plate, +15 s, and +30 s. The bounded clip is an artifact-size choice; world time was not shortened.
- `frame-map-H1.csv`, `capture.json`, `manipulation.json`, `MEDIA-VALIDATION.json`, and `MEDIA-SHA256.txt` hold time/state/media provenance and receipts.

## Manipulation checks

- The same mapped pheromone image and source mapping were used for all views. The material alpha placeholder in Views 2–4 is transparent; the renderer suppresses all direct material drawing.
- The registered alpha mix equation passed at every sampled frame (`mixedEquationFailures = 0`). Views 3/4 share byte-identical weights and mask. The Bayer pattern is deterministic and canvas-fixed.
- Across 702 ant-free pheromone-layer comparisons (two candidate comparisons for each of 351 frames), support-outside changes were 0 and zero-pheromone changes were 0. The full-composite milestone checks also measured 0 changes outside support and 0 zero-signal changes. These are renderer checks, not perception findings.
- Material support / 8-neighbor boundary / positive-weight pixel counts were: pre-Plate `0 / 0 / 0`; post-Plate `30,757 / 4,184 / 26,573`; +15 s and +30 s `43,055 / 4,632 / 38,423`. Positive weight remains inside support; the transition width stayed 4 px.
- At +30 s, 28,881 pixels had both positive material weight and active smooth pheromone. Their mean composite darkness difference from View 2 was `−0.094` for View 3 and `−0.392` for View 4 on an 8-bit grayscale scale. At post-Plate the differences were `−0.232` and `−0.095`; at +15 s both were about `−0.072`. The screened readout locally approximates, but does not exactly preserve, baseline darkness. Per-pixel differences are broad; near-equal means do not imply perceptual equivalence.
- No same-location pheromone disappearance/reappearance event was observed in the bounded interval (`temporalReappearance: null`). The mask is deterministic for unchanged topology and does not depend on material age, frame count, or prior visibility. Zero-signal pixels remain visually equal, so a Plate silhouette does not appear by itself in Views 2–4.

## Prior View 1 raster comparison

The H1 world stream matches the previous pass, but the current shared-canvas View 1 raster is **not byte-identical** to the prior four-renderer capture. Changed RGB pixels in the four checkpoint stills were: pre-Plate 8,276; post-Plate 19,774; +15 s 22,800; +30 s 23,020. The pre-Plate diff includes 4,568 changed pixels outside the current ant-only mask; maximum channel deltas ranged from 86–95. `capture.json` records the per-milestone pixel counts. The prior package used four p5 renderer instances; this comparison uses one shared instance for Views 1–4. This is retained as renderer acquisition variance, not treated as H1 world divergence or as an artistic result. Current View 1 and Views 2–4 remain synchronized on this pass's same renderer and state stream.

## Acquisition amendments and technical notes

Failed pre-result captures found baseline readback and p5 raster-path differences before any valid candidate output. The registered view values were not changed. `PLAN.md` and `SOURCE-AUDIT.md` document each amendment, including the transparent hidden-material draw placeholder and View 2's pixel-identical parity readback/write. The runner separately audits ant-free pheromone layers so raster behavior around ant drawing is not mistaken for material-conditioned field changes.

One aggregate field named `compositeOutsideAntMaskChangedPixels` in the capture runner counts all changed full-composite pixels outside the ant mask, including expected changes inside the material support. It is not an off-support count. For support locality, use `outsideSupportChangedPixels`, `zeroSignalChangedPixels`, the invariant audits, and milestone measurements instead.

## Neutral review and human status

Open [review.html](review.html) locally. The initial screen uses only “View 1–4” and asks: “무엇이 달라 보였고, 어떤 것이 자연스럽거나 이상하게 느껴졌는지 자유롭게 적어 주세요.” Follow-up questions remain hidden until a free response is recorded. This experiment does not establish that a viewer perceives persistence or a separate material state.

The immediately preceding artist review is preserved verbatim in the prior evidence package: [ARTIST-REVIEW.md](../2026-10-27-material-smooth-substrate-relief/ARTIST-REVIEW.md).

> «“음 봤는데 1번보다 좀 연하다 말곤 뭐가 다른지 모르겠는데”»

Its bounded interpretation was: the registered smooth grayscale field and directional luminance modulation did not create a clear identity difference for the artist beyond appearing lighter than View 1. This does not establish that relief in general fails.

## Validation and interpretation limits

- Focused renderer/readout tests: `node --test tests/material-conditioned-pheromone.test.js tests/ant-renderer.test.js` — 24/24 passed.
- Full suite: `npm test` — 367/367 passed.
- Build: `npm run build` — passed. Rollup reported two existing `zod` comment warnings and the 1,161.66 kB app chunk warning.
- Syntax and whitespace checks: runner `node --check` and `git diff --check` passed.

Technical validity does not imply artistic success. View 3 and View 4 test only two registered readout grammars; View 3 versus View 4 is not a single-variable contrast. A changed display grammar may read as pixelation or a graphic filter. The experiment does not show material changing pheromone, retained-history recognition, physical absorption, production suitability, mature-world behavior, or support for isotropic production recruitment. No artist response to Views 1–4 has been recorded yet.
