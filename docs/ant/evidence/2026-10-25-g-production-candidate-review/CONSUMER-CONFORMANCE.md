# Candidate G consumer conformance

Audit scope: changed field representation and diagnostics only. Fixed-cue and natural conformance are recorded separately in `FIXED-CUE-PARITY.json` and `NATURAL-CONFORMANCE.json`.

| Consumer | Candidate contract check | Result |
| --- | --- | --- |
| `AntController` local/far sensing | Same `field.sample()` world-coordinate bilinear read; half saturations remain `0.018` local and `0.035` far; no consumer-side division by `S` | PASS; all 238,392 frozen raw reads exact |
| `ColonyActivation` | `ACTIVATION_HALF_SATURATION = 0.04`; existing point sample and temporal logic unchanged | PASS; no grid-size assumption or normalization added |
| `TrailPlateBirth` | Existing chemical half saturation/threshold remain `0.04` / `0.30`; its 96×96 analysis grid stays internal; raw-array sampler reads snapshot width/height | PASS; focused parity probes match `field.sample()` at fixed physical queries |
| `AntRenderer` | Field image is allocated from snapshot width/height; existing fixed absolute pheromone-to-alpha mapping remains | PASS; production renderer tests pass; no per-image normalization |
| Analysis / ANT diagnostics | `nodeSum` and legacy `totalMass` are native coefficient sums; `reconstructedIntegral` includes trapezoidal edge/corner weights; UI displays “pheromone reference integral” | PASS; explicit snapshot and controller tests |
| Audio, material, recruitment, movement | No consumer code or authored response constants changed | PASS by source diff; no audio-DSP or material tuning |

Repository search found no production ANT consumer that requires pheromone `width === 96`, `height === 96`, or interprets pheromone node sum as a resolution-independent chemical mass. Remaining 96×96 grids belong to `SurfaceField`, `TrailPlateBirth` material analysis, and frozen test fixtures; they are not the pheromone field.

`analysis.pheromoneMass` remains as a compatibility alias for the native node sum. The diagnostics UI no longer displays that alias as mass. The README's current-production baseline remains unchanged because this branch has not been adopted.
