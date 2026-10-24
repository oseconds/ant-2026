# ANT production pheromone writer information loss — 2026-10-24

## Question

How much subcell position and local orientation survives the current production `PheromoneField` point writer in its 96×96 Float32 raster? The pass stayed writer-only: no alternate writer/reader, sensor, movement, or free-running run.

## Baseline and method

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Kept production files unchanged; guarded `PheromoneField.js`, `GasterDeposition.js`, and `AntController.js` by SHA-256.
- Reused exact route/write provenance from qualified raster fixture `9afcc130f23c85f34cdf64073a2c95c945c0b320`, including all six routes × four phases. Verified all 24 input raster hashes and exact writer replays.
- Assayed 16,384 single-dab positions on the preregistered 64×64-per-phase lattice, three fixed displacement sweeps, 32 short production-dab segment arms, and all 1,800 overlapping local three-write windows in the 24 routes.
- The first segment harness attempt exposed a sampling mismatch around `GasterDeposition`'s exact travelled-distance cadence. The assay was aligned to the controller's current `dab` event stream and rerun; no production source defect was found.

## Result

**SUPPORTED: the production writer maps distinct physical geometry to the same raster before any reader or sensor stage.** Here `R=0.0045`, `h=1/95≈0.0105263`, so the compact support is narrower than half a pitch. Each interior dab stores its full amount at one nearest node whether that node was within support or reached through fallback. Across 9,216 distinct sampled physical positions, only four one-node footprints occurred. The fallback rate was 42.6758% per phase, but fallback and supported paths shared the same output rule.

For isolated dabs, mean Euclidean source-to-raster-centroid displacement was `0.00402697`, maximum sampled displacement `0.00732693`, against the analytic nearest-node bound `0.00744323`. The writer preserved accepted dose in the tested uncapped cases while losing per-write first moment.

Different orientations also sometimes collapsed exactly: 7 of 48 short-segment orientation pairs had byte-identical rasters, all at 3 dab spacings. The p00 ±45° short segments each became a single node. Longer segments kept distinct orientation rasters in all tested comparisons, though phase shifted some diagonal principal axes by about 10.9°.

The named straight `p00`/`p01` routes are exact full-raster collisions despite a half-pitch y translation and identical ordered dose events. `p10`/`p11` produce another exact translated straight pair. Across route arms, 715 of 1,824 adjacent dab pairs repeated the same node; the 1,800 local three-write windows reduced to 33 ordered node patterns, 23 shared across route shapes and covering 1,712 windows. Full routes mostly remained distinguishable: 22 unique hashes among 24 arms.

## Decision and next boundary

The result justifies one future writer-only candidate contract that preserves accepted total dose and per-write physical first spatial moment. It does not select an algorithm or imply that movement failures are solved. A candidate must first pass the same fixed phases, local orientation assay, and exact frozen-route suite. No candidate was implemented here.

Evidence, raw outputs, input hashes, and reproduction instructions: [writer information-loss evidence](../evidence/2026-10-24-ant-writer-information-loss/README.md). The deterministic two-run hash receipt is included there.

Validation: research runner passed exact 24/24 raster replay; focused writer/field/Gaster/controller tests passed 43/43; runner syntax check passed. Full build omitted because production `src/` remained unchanged.
