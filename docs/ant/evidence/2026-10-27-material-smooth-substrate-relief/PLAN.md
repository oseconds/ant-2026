# Smooth substrate relief — preregistered plan

**Question:** Can a continuous renderer-derived scalar field, without a drawn material boundary, make retained material read as a different surface state from pheromone? This is a diagnostic; it does not select a final renderer or production value.

## Baseline and scope

- Fresh `origin/main`: `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Research parent: `75412739a6ea12e858ec2cf739f0a93279d4ada6`.
- Branch: `codex/ant-material-smooth-substrate-relief-20261027`.
- The previous H1 sandbox is [here](../2026-10-26-material-silhouette-relief-shadow/README.md); its technical boundary-band result does not generalize to relief as a whole.
- Seed `20261005`, current-G defaults, H1 isotropic diagnostic heading, 60 Hz, 640×640, DPR 1, no audio/DSP.
- One deterministic world stream supplies all four views. Capture the same pre-Plate, post-Plate, +15 s and +30 s states, plus only the bounded video window from first Plate −5 s through +30 s.
- The H1 heading control and all renderer options remain research-only. Production default and world laws stay fixed.

## Registered views

| View | Renderer mapping | Registered presentation |
| --- | --- | --- |
| View 1 | Existing `presence-96` | Existing interpolated RGB 100 / alpha 96 reference |
| View 2 | `substrate-flat` | Shared smooth field; grayscale RGB 100, nominal alpha 32, no directional term |
| View 3 | `substrate-relief-subtle` | Same field and coverage; alpha modulation `32 ± 10` |
| View 4 | `substrate-relief-strong` | Same field and coverage; alpha modulation `32 ± 24` |

Viewer labels disclose only `View 1`–`View 4`. The first question is free description only.

## Pre-result field algorithm and fixed parameters

1. Build the canonical native support by the existing pixel-center map from `topLayerByCell`: `floor((x + 0.5) × gridWidth / 640)` and the same for y. No material depth or Plate path enters.
2. Compute a pixel-center Euclidean signed-distance field to that binary support. Subtract 0.5 px at the inside/outside center boundary and clamp distances to `[-24, +24]` native px. This is renderer pseudo-surface data, never terrain height.
3. Apply a separable, normalized Gaussian low-pass with fixed `σ=3.0` native px and kernel radius 9 px (`3σ`). Its nominal spatial scale is 6.667 px per 96-grid cell. The discrete kernel transfer at that cell frequency will be recorded as the high-frequency attenuation check.
4. Convert the same filtered field to soft coverage with cubic smoothstep from signed distance `−4 px` to `+4 px`. View 2 alpha is `round(32 × coverage)`.
5. For Views 3/4, compute the filtered field's central-difference gradient in world-pixel coordinates. Fixed world-space light vector is `( +1/√2, +1/√2 )`, upper-left toward lower-right. Directional response is the clamped dot product with that gradient, with no frame/world maximum normalization. Alpha is `round(coverage × (32 + amplitude × response))`, amplitude 10 or 24. This preserves the nominal full-coverage targets 22–42 and 8–56; edge coverage can reduce the realized alpha range.
6. The directional derivative is naturally near-zero-mean over closed support, so there is no union-wide per-frame normalization. Any discrete/coverage residual in mean alpha and darkness is measured; it will not be tuned after viewing.

The bounded field can only carry changed occupancy influence within the 24 px distance cap plus the 9 px separable filter radius and 1 px gradient stencil. For changed 96-grid cells, the pre-registered distant-old-material audit excludes a conservative 43 px radius around their native pixel footprints. Farther unchanged pixels must remain byte-identical across milestones.

This is a low-pass signed-distance field, not a re-use of View 1's interpolated bitmap. Smoothing, truncation, coverage width, light and amplitudes are frozen before candidate capture. No outline, contour, edge band, hatch, grain, stipple, texture, color, phase, temporal transition or pheromone operation is allowed.

## Pre-capture manipulation gates

- Record canonical support area, `coverage > 0`, `coverage ≥ 0.5`, nonzero output alpha, expanded pixels, lost half-coverage pixels and the observed 10–90% transition width.
- Record the discrete Gaussian transfer at the 96-grid cell frequency plus boundary gradient roughness before/after low-pass. Candidate fields must not use the raw support for display alpha or gradient.
- Verify all three substrate views share the exact filtered field/coverage; View 2 has no directional term; Views 3/4 differ only in registered amplitude and fixed light response.
- Record each view's influenced alpha mean, standard deviation, range, affected-pixel count, white-background material-only mean darkness and actual full-composite mean darkness. Also record support spill and off-screen changes.
- Verify deterministic field/pixel bytes, no simulation RNG use, renderer/snapshot/event parity, and exact View 1 checkpoint parity with the preceding H1 evidence.
- When topology changes, compare old material pixels outside the 43 px locality radius. At unchanged topology, all field and alpha bytes must be identical.
- If low-pass output still exposes the 96-grid staircase at the manipulation level, stop before artistic interpretation and record the manipulation failure. Do not alter the registered scale.

## Capture media and timing

Store four native 640×640 stills per view at pre-first-Plate, immediately post-birth, +15 s and +30 s. The synchronized native video window begins at model tick 4201 / 70.016666667 s (exactly five model seconds before the first Plate) and ends at tick 6301 / 105.016666667 s. Video samples are 10 fps (six 60 Hz ticks per frame), giving 351 frames including the exact endpoint. Frame index 0 maps to tick 4201; media time `n/10` maps to model tick `4201 + 6n` and model time `70.016666667 + n/10` s. No full 0–105 s videos.

## Validation, review and stop

Use the prior validated H1 state/RNG trace and milestone states as the matched replay reference. Verify lossless video endpoint parity with the corresponding native PNG, neutral synchronized page behavior, focused tests, full `npm test`, `npm run build` and `git diff --check`. Technical validation is not an artistic result.

Before the artist's first response, show only View 1–4 and: “무엇이 달라 보였고, 어떤 것이 자연스럽거나 이상하게 느껴졌는지 자유롭게 적어 주세요.” Reveal other questions only after that free note. No winner, alpha/scale tuning, H0 transfer, mature run, production adoption, or follow-up shading model in this pass.

## Pre-result media amendment

Before candidate viewing, set the clip start to tick 4201 rather than tick 4200. At 60 Hz this makes the clip start exactly 5 model seconds before the registered first Plate at tick 4501 and aligns the first Plate, +15 s, and +30 s with the 10 fps frame cadence. The endpoint is included without an extra off-cadence frame. Renderer parameters and the simulation run are unchanged.

The first native acquisition attempt then stopped at the empty pre-first-Plate support. That image has no boundary, so strict filtered-roughness reduction is undefined when both raw and filtered boundary RMS equal zero. Correct the gate to require both values to remain zero when `boundaryPixels=0`; keep the strict reduction check when a boundary exists. This changes only the validity check, not any registered field parameter or candidate output. No candidate image was opened or artist-reviewed. The four zero-byte encoder outputs and the failure note are preserved under `attempt-01/`.

The second acquisition reached all milestones but wrote tick 6301 twice: once in the simulation loop and again as the +30 s still/video endpoint. The 352-frame clips were rejected against the registered 351-frame cadence. Skip the in-loop endpoint frame; let the +30 s endpoint render write it once. This corrects capture scheduling only. Registered field parameters, all four still states and H1 laws stay fixed. Candidate images remained unopened and unreviewed; failed media hashes and lengths are in `attempt-02/`.

The third acquisition wrote all views but stopped at the View 1 parity check because the prior package uses `view-1-*` filenames. The assertion ran before FFmpeg writers closed, leaving truncated WebM files. Fix the filename and close the writers immediately after the browser replay, before external parity checks. No renderer or world parameters change. The failed outputs were hashed and removed; no candidate image was artist-reviewed.
