# Conditioned-trail contour cue shadow — preregistered plan

## Question

Can a weak contour cue bind the already visible, material-conditioned pheromone trails into a place-like area, without turning material into a full-outline renderer?

This is a renderer-only comparison. It does not change pheromone values, their mapping, material formation, or production defaults. H1 remains a research-only isotropic heading control.

## Baseline and world

- Fresh fetched `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Research parent: `d057ae1acf9db3f1b44ce2a1dd51a7ed79dafdc2`.
- Research branch: `codex/ant-conditioned-trail-contour-cue-shadow-20261027`.
- Seed `20261005`; current-G defaults; H1 isotropic diagnostic; 60 Hz; 640×640; DPR 1; no audio/DSP.
- Reuse first Plate −5 s through +30 s: 351 frames at 10 fps, ticks 4201–6301. Frame `n` maps to tick `4201 + 6n` and model time `70.016666667 + n/10 s`.
- Keep the window unchanged. The preceding artist response reported multiple conditioned trail segments, so the registered comparison already contains the phenomenon whose spatial binding is in question. No scene search or renderer-guided extension is planned.

## Shared readout

Views 1–3 all use the prior View 4 rule: hidden material, the same exposed-support 4 px interior blend mask, and the same smooth-to-fixed-Bayer-screened pheromone readout. Source field, `pheromoneValueToAlpha()`, RGB, screen phase, ants, draw order, world state, and simulation RNG remain unchanged.

## Registered views

| View | Rule |
| --- | --- |
| 1 | Prior View 4, with no contour. This is the baseline. |
| 2 | View 1 plus a fixed, always-on 1-native-pixel inner boundary cue. |
| 3 | View 1 plus only boundary pixels within 12 native pixels of active conditioned pheromone. |

Both cues use grayscale RGB 140 and alpha 24. Against white, this contributes about 10.82 darkness units before pheromone compositing. Cues are composited beneath the existing black pheromone readout and before ants. The boundary is the prior canonical 640×640 binary support's 8-neighbor inner boundary; no pixel is added outside support. This exposes the registered raster boundary as a diagnostic cue, not as a candidate material rendering.

View 3 activity is registered as native pixels where production-sampled baseline pheromone alpha is greater than zero and the existing material blend weight is greater than zero. A boundary pixel appears only when its Euclidean nearest active pixel is within 12 px. Temporal smoothing is 0 frames: the gate reads the current snapshot only. No afterglow, animation, or simulation RNG is used.

The prior artist quote is retained verbatim in the preceding package's [ARTIST-REVIEW.md](../2026-10-27-material-conditioned-pheromone-readout/ARTIST-REVIEW.md).

## Pre-result acquisition amendment

Before any candidate media was saved or visually reviewed, a same-snapshot empty-support redraw produced a 1-level baseline-alpha difference between Views 1 and 2 at native pixel 4215 (0 versus 1) at tick 4273. The source field, mapping, and material support were unchanged. To keep the comparison limited to the registered contour cue, the renderer will reuse View 1's exact smooth baseline raster for subsequent views of the same detached snapshot, then apply the unchanged ordered-screen readout and contour rule. The cache is keyed by snapshot identity and refreshes on the next snapshot. This addresses a renderer acquisition variance only; candidate values and the registered world window remain unchanged.

## Capture and review

Render Views 1–3 sequentially from each identical detached H1 snapshot. Keep the synchronized bounded, native-size lossless clips and four native 640×640 milestone stills: pre-Plate, post-Plate, +15 s, +30 s. Record model/media mapping and state, RNG, event parity. The review page's initial screen shows only “View 1–3” and the free-description prompt; follow-up questions stay hidden until a response is recorded.

## Interpretation limits

View 2 versus View 1 tests the addition of the full faint cue. View 3 versus View 1 tests a local activity-gated cue; View 2 versus View 3 is not a strict single-variable causal comparison. A contour that reads as a map, road, selection boundary, or graphic layer is a valid failure mode. Technical visibility does not establish area gestalt, retained-history recognition, aesthetic fit, or production suitability. No production heading or renderer decision is made.
