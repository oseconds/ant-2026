# Material-conditioned pheromone readout — preregistered plan

**Question:** Can exposed retained-material location condition only the display sampling grammar of the current pheromone signal, creating a persistent location-conditioned state without drawing material itself?

This is a renderer-only artistic mapping. No material-to-pheromone simulation law, absorption, transformation, or feedback is added. No winner or production renderer is selected.

## Baseline and provenance

- Fresh `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Research parent: `c18ee388aa8385ad76cefacab5ba0d215fd02b10`.
- New research branch: `codex/ant-material-conditioned-pheromone-readout-20261027`.
- Prior smooth-relief evidence: [package](../2026-10-27-material-smooth-substrate-relief/README.md); artist response is retained [verbatim](../2026-10-27-material-smooth-substrate-relief/ARTIST-REVIEW.md).
- Current production mapping remains source `316×316`, black RGB, `pheromoneValueToAlpha()` max 112, smooth native-to-canvas scaling. Material occupancy is the exposed `96×96 topLayerByCell` support.
- Capture: seed `20261005`, current-G defaults, H1 `isotropic-diagnostic`, 60 Hz, native `640×640`, DPR 1, no audio/DSP.

## Registered material blend mask

1. Convert exposed occupancy to canonical native 640×640 pixel-center support with the renderer's existing cell map: `floor((x + 0.5) × gridWidth / 640)` and same for y.
2. Mark a support pixel as a boundary pixel if any of its 8 neighbors is outside the support or canvas. Boundary pixels have `insideDistance = 0`.
3. Compute exact Euclidean distance in native pixels from each support pixel to the nearest boundary pixel. Outside support remains `weight = 0`; inside weight is cubic `smoothstep(0, 4, insideDistance)`.
4. Freeze transition width at 4 px. Mask depends only on support and canvas geometry, is deterministic/world-fixed, cached by support content, and consumes no simulation RNG.

The mask is a renderer blend weight. It is not itself drawn. It cannot spill outside canonical support. It does not use material depth, age, paths, or history beyond current exposed occupancy.

## Registered views

| View | Material display | Pheromone display |
| --- | --- | --- |
| 1 | Existing `presence-96` alpha-96 interpolated reference | Existing production smooth readout |
| 2 | Hidden | Unchanged production smooth readout |
| 3 | Hidden | Pixel-alpha mix of production smooth sampling and nearest/unsmoothed sampling of the same mapped black pheromone image, weighted by the mask |
| 4 | Hidden | Pixel-alpha mix of production smooth sampling and fixed ordered-screen sampling of that same mapped image, weighted by the mask |

Views 2–4 draw no material fill, contour, texture, shade, or background change. Ant rendering and draw order remain fixed. View 2 is the no-material control.

### View 3 — crisp sampling

Draw the mapped black/alpha source directly through the unchanged production smooth path on the final white 640×640 canvas. Read its native grayscale darkness as the baseline alpha. Rasterize the same source once at native size with smoothing disabled for the alternate. Within material support, replace each native composite pixel with the single weighted grayscale mix; outside support the original composite bytes remain untouched. Because the signal is black over white, this is the same linear mix as mixing the corresponding alpha/darkness values. Where the production-rendered baseline alpha is zero, effective blend weight is zero so the alternate cannot create visible activity in a zero-readout pixel. Do not draw overlapping semitransparent layers.

### View 4 — ordered screen

Use the 4×4 Bayer matrix `[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]`, fixed to canvas/world coordinates. Repeat each matrix threshold over a 2×2 native pixel tile, giving an 8×8 native period. For production-rendered baseline alpha `a`, output black at alpha 112 when `a > 0` and `a/112 > (threshold + 0.5)/16`; otherwise output alpha 0. The source-zero gate prevents a screen mark where production has zero readout. Mix this single alternate alpha image with the same baseline under the registered mask.

This ordered screen approximates, but does not guarantee, baseline local luminance. No random or temporal phase is used.

## Pre-capture implementation amendment

Before the valid final capture, a completed technical acquisition using an offscreen re-rasterized baseline reported 8,740 out-of-support composite pixel changes summed across the four milestone comparisons. Candidate parameters were unchanged. The baseline is now drawn through the exact production canvas path first; its displayed native grayscale is the baseline, and Views 3/4 replace only weighted pixels inside canonical support using `getImageData`/`putImageData`. A whole-frame locality check now runs on every sampled video frame. The compositor skips the pixel write entirely when no effective weights are nonzero. This removes the second baseline resampling/compositing step and makes an out-of-support difference a hard capture failure. View 4's screen thresholds use the native production-rendered baseline alpha. This amendment changes only the renderer implementation needed to meet the registered locality invariant.

A pre-result browser check found that separate p5 canvases render ant strokes and pheromone interpolation differently: empty pre-Plate View 1 and View 2 differed at 8,276 RGB pixels. A shared-canvas check found that omitting V1's transparent material draw call changed 4,568 pheromone pixels even though support was empty. Both acquisition layouts were rejected.

Final capture uses one `AntRenderer` and native canvas for all views. Views 2–4 keep material rendering disabled, but draw a renderer-generated transparent 96×96 image (RGB 100, alpha 0) in the material slot before pheromone. It contains no material topology or visible pixel; it matches the draw-call path and interpolation context used by View 1. This keeps the current comparison on one renderer instance. The runner checks every placeholder alpha byte, empty-support V1/V2 equality within the current matrix, support-locality on ant-free pheromone layers, and records View 1 prior-checkpoint raster deltas separately from exact H1 state/RNG parity. The prior pass used four p5 renderer instances; current one-renderer output may differ at raster level despite the same snapshot stream. No registered material or readout parameter changes.

The first placeholder capture then found 234 changed pixels at the first empty-support video frame. Changed examples were pheromone-gray pixels reset to white, with support and blend weights both zero. This was a technical acquisition-path failure, not a candidate result. Final capture routes View 2 through a diagnostic `material-control` readback that copies the production-sampled opaque pheromone pixels back unchanged; Views 3/4 use the same readback/write stage. This preserves View 2's source alpha, RGB, and displayed pixel values while matching the processing stages before ants draw.

The next check found that current shared-canvas View 1's pre-Plate raster differs from the prior package by 4,568 pixels outside the current ant-only mask. The previous package used four p5 instances, while this matrix uses one shared instance. This discrepancy is retained as a renderer acquisition result, separate from world parity. The runner now compares all 351 sampled ticks' state, full-state, and RNG checkpoints against the prior frame map; it does not represent the View 1 raster delta as a trajectory change. Views and mask parameters remain unchanged.

## Pre-result manipulation checks

- Preserve one H1 world stream and detached snapshots across all views; renderer has no simulation feedback or RNG calls.
- View 1's world/RNG checkpoints match the prior stream; its raster pixel deltas are reported. View 2–4 material contribution is exactly zero.
- At every native pixel with zero production smooth alpha, Views 2/3/4 have identical pheromone-layer alpha. Outside canonical material support, conditioned views match View 2 exactly.
- View 2–4 use identical source values and `pheromoneValueToAlpha()` mapping. View 3 changes only sampling. View 4 uses fixed Bayer thresholds and the same mask.
- Record native support/boundary/interior-mask counts, weight range, overlap with active pheromone, changed pixel counts, mean/SD/quantiles of local darkness, signed and absolute darkness mismatch, and effect outside support.
- For View 4, compare smooth versus screened darkness across (a) affected active pixels and (b) material × active-pheromone overlap. Report residual mismatch; do not normalize it after capture.
- Confirm byte-stable mask when support is unchanged; identical output at zero signal; no screen phase movement; and any same-location signal disappearance/reappearance within the bounded clip. A missing reappearance is reported as not observed, not inferred.
- Record abrupt birth behavior: the hidden material rule may become available at birth, but Views 2–4 must not show the Plate support without pheromone.

## Capture and review

Use the validated H1 bounded event window: first Plate −5 s through +30 s, 351 frames at 10 fps, six model ticks per frame. Preserve native 640×640 stills at pre-Plate, immediately post-Plate, +15 s, and +30 s. Frame `n` maps to tick `4201 + 6n` and model time `70.016666667 + n/10` s. No full 0–105 s videos.

The synchronized review page labels conditions only View 1–4. Before a free description it presents only: “무엇이 달라 보였고, 어떤 것이 자연스럽거나 이상하게 느껴졌는지 자유롭게 적어 주세요.” Follow-up questions remain hidden until the first response is recorded.

## Stop and interpretation limits

Do not tune mask width, Bayer size, source alpha, or add further display grammar after capture. These views test only smooth current pheromone, nearest-sampled current pheromone, and the registered ordered screen under an interior-only exposed-material mask. Results do not establish material recognition, retained-history understanding, physical absorption, or production suitability. H1 is a diagnostic control, not a production heading recommendation.
