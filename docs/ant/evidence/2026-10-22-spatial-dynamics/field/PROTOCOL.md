# ANT spatial field representation probe

## Status and question

This protocol is frozen before running the spatial-field assay. It asks whether the existing `PheromoneField` raster makes an identical narrow deposition path produce phase- or orientation-dependent cues in the exact controller sensors and deterministic selector score. It does not ask whether any raster is biologically realistic, or which path an ant should prefer.

The code under test remains the baseline at `8c60e4b`: `PheromoneField`, `GasterDeposition`, `BodyPoseController`, and `AntController` are read-only. The pass changes no production file, world behavior, selector qualification rule, or threshold.

## Fixed fixture

- Field: 96 × 96 nodes over normalized `[0,1]²`; pitch `1/95`; default max `8`; half-life `15 s`.
- Deposition: amount rate `4.5` per thorax-distance unit; radius `0.0045`; production dab spacing `0.006`. No grid, radius, dose, or threshold sweep.
- Source stations: `-0.12..0.34`, interval `0.002`; route anchor `(32/95, 48/95)`. Paired phase translations are `(0,0)` and `(0.5/95, 0.5/95)`.
- Eight route profiles: horizontal and 90°-rotated straight; circles `R=0.25` and `R=0.10` in both orientations; S curve `y=0.018 sin(2πx/0.32)` and its mirror. Each profile is tested at both fixed phases.
- Three deposition paths separate representation from source geometry: direct thorax-path `depositSegment`; the same forced thorax route transformed by production `BodyPoseController`/`gasterRearPoint` and deposited through continuous `GasterDeposition`; and that same gaster path through the default `dab` `GasterDeposition`. These are dry, prescribed paths with the same `4.5` dose rate, not natural movement or a continuous-vs-dab tuning search.
- Each route is sensed at stations `-0.04`, `0.08`, and `0.20`, with the ant heading set to the exact route tangent. Readouts call the unchanged `AntController.senseTrail`, `senseLocalTrail`, and `updateIntention` methods. The intention fixture sets crowding, adherence, jitter and score noise to zero; its final softmax draw is placed inside the highest-scoring option's interval. This reveals the production score winner, not a natural stochastic choice.

## Measurements

For each field, preserve the generated source polyline and record its length, requested integrated dose, actual stored mass, cap-limited mass loss, cells at cap, occupied cells, peak, and mass after one `15 s` decay. Count every actual brush call that has no grid node inside the default support and sum its requested dose. Measure cell-mass-weighted distance from stored cells to the corresponding thorax or gaster source path; this is a raster displacement measure, not a morphology claim.

At each fixed sensing state, record the five exact wide-sensor signals, their production-response values and score winner, plus the exact local `left/center/right`, strength, coherence and steering. Compare paired phase winners and rotated/mirrored expected offsets. Keep raw signals and equal-dose mass metrics beside any peak-normalized cue-shape comparison; a lower CIC peak alone does not count as a straighter or more invariant cue.

## Decision rule and one alternative

Default representation sensitivity is confirmed for this controlled assay only if the same direct source path and same requested dose produce a different highest-scoring sensor option between the two fixed phases at one or more of the three readout stations for at least two of the four geometry families (straight, gentle circle, tight circle, S curve), and the default brush records fallback dose on at least one such pair. A changed option means at least one adjacent `AntController` heading bin (`0.47 rad`). Report the exact pairs and raw signals; do not generalize to natural runs.

Only if that rule is met, run one diagnostic candidate on the exact same fixtures: normalized four-neighbor cloud-in-cell weights at each existing deposit-brush slice. It keeps the source integration, pre-cap dose, field cap, and half-life. It deliberately replaces the Gaussian/support brush with a one-cell bilinear splat; that is a different spatial kernel and is not full pheromone-semantic parity. Candidate comparison includes equal total dose and an analysis-only global scale that matches the baseline far-sensor maximum at station `0.08`; report unscaled production-rule outputs too. Count phase-winner disagreements before/after. Stop and report a negative candidate if it does not reduce the paired disagreement count; do not tune its kernel or any controller threshold.

The separate committed d0 selector fixture is prior corroboration only: commit `d0e07d0`, `docs/ant/evidence/2026-10-22-route-curvature-survey/selector/README.md` and `selector/route-selector-results.json` report six repeated real-field/SurfaceField passes where curved inputs changed birth outcome under a fixed `+0.004` translation. Those historical fixture results are not rerun here and say nothing about natural frequency.

## Interpretation boundary

The result can establish a storage/sampling-to-sensor or selector-score link for these fixed routes. It cannot establish natural route incidence, biological pheromone semantics, artistic quality, or a production replacement. The downstream `TrailPlateBirth` result remains a separate prior controlled fixture; no qualification threshold is changed here.
