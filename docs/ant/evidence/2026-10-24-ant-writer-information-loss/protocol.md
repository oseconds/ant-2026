# ANT production writer information-loss protocol — 2026-10-24

## Preregistered question and boundary

Measure which physical position and short-route distinctions remain in the current 96×96 Float32 writer output. This is a writer-only observation pass. It adds no writer, reader, movement, or sensor candidate. The production `src/` files remain unchanged.

Fresh baseline: `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.

Production source SHA-256 guards:

- `src/lib/agents/ant/PheromoneField.js`: `412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd`
- `src/lib/agents/ant/GasterDeposition.js`: `0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41`
- `src/lib/agents/ant/AntController.js`: `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04`

The route cohort and existing ordered write streams come from qualified raster fixture commit `9afcc130f23c85f34cdf64073a2c95c945c0b320`, based on the same production baseline. The exact manifest, write-stream preflight and 24 Float32 raster files are copied byte-for-byte into `inputs/qualified-raster-fixture/`; the manifest SHA-256 is `e93b9be47e5bbe80e408798dd63d588e8d93f3ec12da8b3288106a3f430e9cbb`, and the preflight SHA-256 is `c2a15990f33d7b43e7e4761cd80b10a47eab0baec98b1dcced76f47b85cdc0ee`. Each raster is checked against its pinned per-arm SHA before any statistics are computed. The replay-backed rasters are not described as recovered historical node arrays.

## Implementation facts under test

`PheromoneField.depositPoint` enumerates grid nodes within `radius`, normalizes the compact Gaussian weights over the nodes it found, and deposits the requested amount. With radius `R=0.0045` and pitch `h=1/95≈0.0105263158`, `2R<h`. In an interior Voronoi cell, at most one node can be inside support. If none is inside, the production fallback assigns the full amount to `Math.round(gx), Math.round(gy)`. This makes the single-dab assay able to test the writer itself without a read/interpolation step.

`depositSegment` uses midpoint slices with step no larger than `h/2`, then calls the same brush. The current `AntController` selects `GasterDeposition` dab mode, spacing `0.006`; the frozen qualification streams have 77 ordered point writes per route/phase arm. The oriented segment assay therefore uses the production dab event generator plus the same `depositPoint` writer, rather than the separate continuous-segment mode.

## Frozen single-dab protocol

- Grid: 96×96, empty Float32 state, production cap 8, no decay, no boundaries.
- Center node: `(48,48)`; position is kept away from all field edges.
- Dose: exactly `1`; radius: production default `0.0045`.
- For each phase `p00`, `p10`, `p01`, `p11`, sample a 64×64 midpoint lattice over the same physical square of side `h`, centered at the node and then translated by the existing phase offsets `(0,0)`, `(h/2,0)`, `(0,h/2)`, `(h/2,h/2)`. Midpoint sampling avoids tie-only coordinates. Total: 16,384 source positions.
- For every position retain physical/grid coordinates, nearest node, supported nodes, fallback, affected nodes, exact nonzero Float32 footprint signature, requested/accepted/stored dose, raster centroid, and source-to-centroid displacement.
- Group exact footprints separately by phase. Report class-size distribution and exact pairwise physical separation mean, median, and maximum within each class. Also report source-to-class-centroid uncertainty.
- The paired phase result compares the same 64×64 lattice index under the four preregistered translations.

## Local displacement sweep

From the center node, sweep x, y, and the 45° diagonal from `−0.75h` to `+0.75h` in `h/256` physical increments (385 positions per direction), with the same dose/radius/empty-field conditions. Record exact footprint runs, support/fallback state, and transition brackets. The spatial boundary resolution is therefore `h/256`; no parameter is fit to output.

## Short-segment protocol

- Center each segment at the center node plus each of the same four phase translations.
- Orientations: horizontal, vertical, +45°, −45°.
- Lengths: 3 and 5 production dab spacings (`0.018` and `0.030`), fixed before observing output. A half-spacing of prior travel and dose is fed through the actual `GasterDeposition.advance` to establish a centered dab phase without depositing a prior field write. Then the segment is advanced at the configured base rate `4.5`, used only as a fixed controlled-writer stimulus. `AntController` applies a runtime `depositionMultiplier`; these fixtures make no claim about natural runtime deposit amount. Emitted point dabs lie symmetrically at `−s,0,+s` or `−2s,−s,0,+s,+2s` around the shared center, with `s=0.006` and dose `s×4.5` per dab.
- Each emitted event is deposited with unchanged `PheromoneField.depositPoint` at production radius `0.0045`. Record the exact dab positions, amounts, state carry-in/out, raster bytes, and dose balance. All arms use the same path length and requested dose for each orientation/phase/length group; the assays are interior, uncapped, and decay-free.
- Compare exact raster SHA, affected-node set, mass, centroid, central second-moment tensor, and principal orientation. Principal orientation is marked numerically undefined when the eigenvalue gap is no greater than `64×Number.EPSILON×trace`; this is a floating-point degeneracy rule, not a behavioral threshold. Since an axis is π-periodic, its orientation residual is the shortest angular difference modulo π.
- For phase translation, 90° rotation, and mirror, retain exact transformed-raster identity and continuous centroid/moment residuals. No acceptance threshold is applied to these continuous residuals.

## Existing route cohort

Replay all 24 qualified route/phase arms from the exact ordered write streams through the unchanged production `depositPoint` writer and compare each regenerated little-endian Float32 raster SHA to the qualified manifest before computing route statistics. This provides direct use of the prior stored arrays as well as exact write provenance.

For each arm report physical dab count, unique occupied node count, consecutive repeated-node edges and run lengths, physical distance per node transition, longest distance over which node identity stays unchanged, local tangent variation during such runs, requested/accepted/stored dose, cap hits, raster centroid, and raster moment. Analyze all 75 three-write windows per arm, not selected visual examples. A window's node pattern is its ordered affected-node sequence translated to its first node; retain tangent range and the local raster centroid/moment without imposing an orientation cutoff.

The straight `p00`/`p01` pair is a named translation control. Report route displacement, exact raster bytes/hash, event positions/doses, support and centroid equality, and the physical position distinction absent from the raster.

## Error and separation rules

- Dose and geometry are separate outcomes. Requested/accepted return amounts do not stand in for stored Float32 mass or spatial fidelity.
- Stored mass is the sum of Float32 node values in JavaScript double precision. Raster centroid/moments use those stored values as weights.
- Interior point-deposit first-moment theoretical bound: if each brush affects its nearest grid node, centroid displacement is at most `h/√2`; report this analytic bound separately from sampled errors. Segment accumulation inherits the same bound only in the uncapped positive-weight case because it is a dose-weighted average of per-brush errors.
- Exact raster equivalence is byte equality of row-major little-endian Float32 values. Same support is reported separately and is not called byte equality.
- No analytic reader, alternate reconstruction, sensor output, or movement output participates in the primary attribution.
- Deterministic work only; zero RNG calls by construction.

## Reproduction and validation

The runner guards the three production source hashes and pins the local fixture inputs to the qualified commit and file hashes:

```powershell
node scripts/ant-writer-information-loss.js
node --experimental-test-isolation=none --test tests/ant-writer-information-loss.test.js
```

The runner verifies each packaged raster SHA against the source manifest and exact production-writer replay before it writes the summary. Focused production writer tests are run separately. No full build is required while production source remains unchanged.
