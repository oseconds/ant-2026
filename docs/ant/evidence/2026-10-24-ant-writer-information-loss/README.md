# ANT pheromone writer information loss — 2026-10-24

## Decision

**SUPPORTED: the current production writer loses subcell position and can erase local orientation before any reader or sensor is involved.** It preserves requested/accepted dose in the tested uncapped fixtures. The results justify a later writer-only candidate whose contract preserves accepted dose and the physical first spatial moment of each write. This pass does not select or implement an algorithm, and does not establish movement improvement.

The loss is structural under the tested defaults: with radius `R=0.0045` and grid pitch `h=1/95≈0.0105263`, the compact brush is narrower than half a grid pitch. At most one grid node can be inside support. If there is no supported node, the fallback writes to the nearest node. In either branch, an interior point dab becomes one full-dose node value at that nearest node. The finite raster sets the location bins; the radius/support and fallback make the point footprint a single-node record. Fallback alone is not the whole cause.

## Provenance and boundary

- Fresh production baseline: `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Production source remained unchanged. The guarded SHA-256 values are in [`computed/summary.json`](computed/summary.json) and [`validation/determinism.json`](validation/determinism.json).
- Route geometry source: analytic-reference commit `2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa`, `scripts/ant-field-analytic-reference.js`, SHA-256 `1a9ba25d6e128a67c3795f6cb1b97bf1ee3e62ee38c8d71d893141ccce9fea2e`.
- Qualified fixture source: commit `9afcc130f23c85f34cdf64073a2c95c945c0b320`; manifest SHA-256 `e93b9be47e5bbe80e408798dd63d588e8d93f3ec12da8b3288106a3f430e9cbb`; ordered write-stream preflight SHA-256 `c2a15990f33d7b43e7e4761cd80b10a47eab0baec98b1dcced76f47b85cdc0ee`.
- The copied `.f32le` inputs are replay-backed arrays from the qualified fixture, not claimed recovered historical arrays. All 24 array hashes and all 24 exact production writer replays passed.
- The preceding QAKR reader result (`64923f45911f90dfe67b3ae693b978352bca0fe5`) is scope context only; no reader was used in this pass.

The source audit and preregistered protocol are in [`protocol.md`](protocol.md). The exact single-dab positions, displacement samples, ordered route writes, and local three-write windows are preserved in gzip-compressed files under [`computed/`](computed/). The complete 24-raster source manifest and ordered write streams are under [`inputs/qualified-raster-fixture/`](inputs/qualified-raster-fixture/).

## Implementation facts

`PheromoneField.depositPoint` normalizes the compact Gaussian weights over supported grid nodes. When none lie within the radius, it deposits the full requested amount at the nearest clamped node. With `2R=0.009<h`, an interior brush cannot touch two grid nodes. The one supported-node case and the no-support fallback both therefore store a single node impulse. `AntController` currently uses `GasterDeposition` dab mode at `0.006` spacing; the route and short-segment assays use that production event generator and the unchanged point writer.

No reader, sensor aggregation, movement update, RNG, field decay, boundary contact, or cap interaction contributes to the primary result. The 24 controlled route arms remain interior, uncapped and decay-free.

## Single-dab subcell assay

The preregistered assay used a 64×64 midpoint lattice over one grid-pitch square around node `(48,48)`, for each of `p00`, `p10`, `p01`, and `p11`. It wrote dose `1` into an empty field. There were 16,384 phase/position rows and 9,216 distinct physical sample coordinates across the four translated lattices.

Across those 9,216 distinct coordinates, only **four exact one-node Float32 raster footprints** occurred. Their physical-position class sizes were 4,096, 2,048, 2,048, and 1,024. Per-phase results:

| Phase | Exact footprints | Class sizes | Maximum same-footprint physical separation | Mean / median within-class pairwise separation |
| --- | ---: | --- | ---: | ---: |
| `p00` | 1 | 4,096 | 0.0146539 | 0.0054892 / 0.0053876 |
| `p10` | 2 | 2,048 each | 0.0115483 | 0.0042368 / 0.0039542 |
| `p01` | 2 | 2,048 each | 0.0115483 | 0.0042368 / 0.0039542 |
| `p11` | 4 | 1,024 each | 0.0072106 | 0.0027456 / 0.0026774 |

Distances are in the same normalized physical coordinates as the field. For `p00`, all 4,096 sampled positions map to one identical one-node output; the maximum sampled separation within that equivalence class is about `1.39h`. The nearest-node fallback occurred in `1,748/4,096` samples per phase (`42.6758%`); the other `57.3242%` had one supported node. Both subsets produced the same nearest-node footprint.

Paired half-pitch translations reused the same raster footprint for 2,048/4,096 (`p10` or `p01`) and 1,024/4,096 (`p11`) corresponding lattice indices. Thus a half-cell physical translation often changes no stored point-write state.

## First spatial moment and displacement resolution

An isolated point's stored-raster centroid is its nearest grid node. Across all 16,384 samples:

- Mean absolute x and y error: `0.00263158` each (`h/4`).
- Mean Euclidean displacement: `0.00402697`; median: `0.00420133`.
- Maximum sampled displacement: `0.00732693`.
- Analytic nearest-node bound: `h/√2 = 0.00744323`; the sample maximum is below that bound because the midpoint lattice does not sample the exact Voronoi corner.

The fixed displacement sweeps used 385 points per direction at `h/256` spacing. The same footprint persisted over the largest sampled central interval of `0.0104852` for x and y (256 positions), and `0.0148849` along the 45° path (363 positions). Each nearest-node transition was bracketed within `0.00004112` physical units. These are sampled intervals and brackets, not claims of sub-step exact transition locations.

The mean x/y error is near zero by symmetry; this does not mean individual writes preserve their first moment. The per-write position error is the measured displacement above.

## Short oriented-segment assay

The fixed assay used 3 and 5 production dab spacings (`0.018` and `0.030`), four phases and four orientations, for 32 arms. Each arm used the current dab generator and point writer, with equal path length and requested dose among orientations of a given phase/length.

- Across 48 within-phase/orientation raster pairs, **7 were byte-identical**. All seven were in the 3-dab (`0.018`) assay; none were in the 5-dab (`0.030`) assay.
- At length `0.018`, the `p00` `+45°` and `−45°` segments both collapsed to one occupied node, so raster orientation was undefined.
- At the same length in `p10`, horizontal, `+45°`, and `−45°` were byte-identical; in `p01`, vertical, `+45°`, and `−45°` were byte-identical.
- At length `0.030`, no different-orientation pair had identical bytes. The diagonal principal-axis error was about `0.1903 rad` (`10.9°`) in `p10` and `p01`; it was zero in `p00` and `p11` under the stated numerical definition. Among 30 arms with a numerically defined raster principal axis, 22 were within `1e-12 rad`, and the largest axial error was `π/4`. Two one-node short diagonal rasters had no defined axis.
- For the 24 short-segment orientation pairs, mean support Jaccard was `0.5257` and mean mass-normalized raster L1 distance was `0.8056`. For the 24 longer pairs those values were `0.2803` and `1.2167`. These continuous distances are reported without an invented “near-equality” cutoff.

The grid can retain orientation when the dab sequence reaches distinct nodes. It does not retain it uniformly: phase can make physically distinct short orientations share exactly the same node values.

The p00 5-dab horizontal/vertical raster rotation and `+45°`/`−45°` mirror were byte-exact. Half-grid phases also expose the writer's nearest-node tie rule: a central dab on a half-cell coordinate is assigned by `Math.round`, so the tie can break an otherwise expected reflected/rotated match. The exact phase-specific transform receipts are in the summary; they are not generalized into a broad symmetry guarantee.

## Existing route cohort

The six controlled paths (`straight`, `gentle`, `tight`, their two mirrors, and `sCurve`) were replayed at all four phases. Each of the 24 arms contains 77 ordered point writes; all ordered streams matched and each regenerated raster matched its qualified raster bytes exactly. Each write stream is SHA-256 identified in `computed/summary.json` and `computed/route-writes.json.gz`.

Across the 24 complete route rasters:

- There were 22 distinct raster hashes. The only duplicate groups were `straight|p00` with `straight|p01`, and `straight|p10` with `straight|p11`.
- Each duplicate straight pair differs physically by exactly `h/2=0.00526316` in y. All 77 write locations have that translation, while doses and ordering are identical. The raster bytes, 45-node support, total stored mass and raster centroid are identical. The physical route centroid differs by `h/2`; those translation bits exist in the write stream but are absent from the final raster.
- Each arm occupied 44–52 nodes. Across 1,824 adjacent write pairs, 715 (`39.20%`) repeated the same node identity. Per-shape repeated-edge fractions ranged from `38.16%` to `42.76%`.
- Mean travel per node transition ranged from about `0.00966` to `0.01044` (near one grid pitch). The longest unchanged node identity covered `0.0120` on a gentle route. Within individual same-node runs, maximum tangent range was `0.0600 rad` (`3.44°`) across this cohort.
- Across all 1,800 overlapping three-write windows, only 33 ordered local node patterns occurred. 23 patterns appeared across more than one route shape, accounting for 1,712 windows. A repeated local pattern was associated with physical tangent ranges as large as `1.5601 rad` (`89.39°`). This is local pattern aliasing across geometries; it does not mean all complete routes collapse to the same raster.
- Route-level stored-mass residuals were `4.97e-8` to `5.43e-8`, consistent with summing independently rounded Float32 node increments. No route cell reached the cap.

The exact p00/p01 control answers what was lost: a uniform half-pitch y translation of the whole straight physical trail. The p10/p11 pair shows the same translation collapse under the x-shifted phase. In both cases no post-write reader can infer which of the two source routes produced the raster.

## Dose versus geometry

All single dabs accepted exactly the requested dose. All 24 route arms were uncapped and requested/accepted dose matched exactly in the recorded JavaScript values. The segment requested/accepted maximum absolute difference was `1.39e-17` from floating-point accumulation; all segment arms were uncapped. Stored route mass differed from accepted dose by at most `5.44e-8` after Float32 writes.

Therefore dose accounting is preserved in these tests while point position and some short local orientations are not. Dose conservation is not evidence of spatial fidelity.

## Classification and interpretation boundary

| Property | Classification | Evidence |
| --- | --- | --- |
| Subcell position retention | **SUPPORTED loss** | 9,216 distinct positions map to four one-node footprints; each phase has 1–4 classes. |
| First-moment retention | **SUPPORTED loss** | Point centroid is the nearest node; measured error approaches the grid-cell bound. |
| Local displacement resolution | **SUPPORTED loss** | Exact output is constant over finite subcell intervals in all three sweeps. |
| Local orientation retention | **PARTIALLY SUPPORTED loss** | 7/48 different-orientation pairs are exactly equal at the shorter length; longer segments retain distinct patterns but phase affects their measured axis. |
| Translation/phase equivariance | **SUPPORTED loss in named controls** | Two translated straight route pairs have identical complete raster bytes; phase changes short segment patterns. |
| Mirror symmetry | **PARTIALLY SUPPORTED** | Tested p00 exact transforms pass; half-grid tie cases can break exact transforms. |
| Dose preservation | **SUPPORTED in tested uncapped arms** | Accepted amounts match requested amounts, with only Float32 stored-sum residual. |
| Curve tangent retention | **PARTIALLY SUPPORTED loss** | About 39% of adjacent dabs repeat a node; repeated local patterns span route tangents up to 89.39°, while complete controlled routes generally remain distinct. |
| Many-to-one collapse | **SUPPORTED** | Single point positions, short-segment orientations, and two translated full straight routes share exact raster representations. |

This is an implementation result, not a claim about biological pheromone sensing. It shows that the writer can explain a structural component of phase sensitivity before any reader or sensor stage. It does not quantify how much of a particular movement failure is caused by the writer versus later processing.

## Validation and reproduction

Run from the repository root:

```powershell
node scripts/ant-writer-information-loss.js
node --experimental-test-isolation=none --test tests/ant-writer-information-loss.test.js tests/pheromone-field.test.js tests/ant-gaster-deposition.test.js tests/ant-gaster-integration.test.js tests/ant-controller.test.js
```

The first runner execution and a second full execution produced identical SHA-256 values for all five computed outputs; see [`validation/determinism.json`](validation/determinism.json). The focused command passed **43/43 tests**. `node --check scripts/ant-writer-information-loss.js` passed. A full build was not run because production source did not change.

Production `src/` remains unchanged. No writer candidate, reader, sensor or movement experiment was run.

## Next step

One bounded writer-only candidate is justified for a later pass. Its preregistered contract should preserve both accepted total dose and each write's physical first spatial moment, then face the same subcell phases, short orientations, and frozen route fixtures. This pass does not select the deposit rule or authorize a free-running movement claim. The full fixed-geometry pass must qualify that one candidate before considering a movement shadow.
