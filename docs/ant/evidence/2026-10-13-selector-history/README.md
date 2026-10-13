# TrailPlateBirth discarded-history audit — 2026-10-13

## Question and decision

Across the 100 fixed natural birth inputs, how much of the current selector's discarded supported skeleton was already covered by an earlier frozen Plate, and how much covered new grid area?

**Decision: MOSTLY REDUNDANT.** The per-birth median discarded novelty is 15.4% on the skeleton and 15.7% after the production-width ribbon projection. The rest overlaps prior Plate territory. Novelty falls with birth order and accumulated union in all three seeds. The current boundary rule removes a large amount of repeat area, but it is not a novelty-aware filter: the retained route has a higher overlap fraction than the discarded geometry and also preserves less new area in absolute cell counts.

Do not relax the current selector as a simple branch-count change. The next question should widen to formation/history transition: how the world should represent repeated inscription and spatial novelty as Plates accumulate. This pass does not choose that law.

## Baseline and scope

- Branch: `codex/ant-selector-history-audit-20261013`
- Verified parent: `92d5917bc12baca48e936332ec05d22297cb1276`
- Production source baseline in the input package: `d45823d40c9a87c1b333fa9872f3c897ee9ab01b`
- Input births: seed `20261005` = 29, `20261006` = 33, `20261007` = 38
- Production code, selector behavior, fields, birth gates, stratigraphy, material, audio and renderer were not changed.
- No natural simulation was rerun. No alternative selector was generated or evaluated.

The exact inputs are the committed snapshots in [`2026-10-13-morphology-attribution`](../2026-10-13-morphology-attribution/README.md). The runner decodes every birth-time XOR snapshot, reconstructs the current C0 selector from the unchanged `TrailPlateBirth.js`, and checks source, target, path, full chosen component, retained network, supported corridor, ribbon mask and frozen descriptor against the verified measurements. All 100 C0 geometries and frozen descriptors match exactly. Each prior union is built from earlier frozen masks of the same seed, in exact birth order; the current Plate is added only after its measurements are complete.

## Method

For each actual birth:

```text
FULL      = current selector's chosen skeleton component
RETAINED  = current production source-to-boundary skeleton network
DISCARDED = FULL - RETAINED
PRIOR     = union of earlier frozen Plate masks in this seed
```

The potential footprint uses the existing production geometry semantics. Each discarded skeleton cell receives the current candidate's corridor-edge-derived half-width, clamped to `[0.012, 0.030]` world units, then the existing grid-circle ribbon raster rule is reproduced. Rasterizing `RETAINED` exactly matches the actual frozen Plate mask at all 100 births. `DISCARDED` is diagnostic only; it never creates or schedules material.

After removing `RETAINED`, discarded remnants are deterministic eight-neighbor connected components. The package records cell count, eight-neighbor edge length, full-graph and remnant endpoints, retained-network attachments, source geodesic range, boundary reach, prior overlap, new area and angular/radial descriptors. Per-segment projections can overlap each other; segment areas are not summed as if disjoint. The birth-level discarded footprint is the union, and its overlap/new-area counts conserve its total area. A separate eight-neighbor component view describes novel skeleton and footprint regions.

Nearest-prior distance is an eight-neighbor grid-path distance with cardinal cost `1` and diagonal cost `sqrt(2)`, divided by 95; it is not straight-line Euclidean distance. Pearson correlations describe birth-order, time and prior-union trends only. They are not significance tests.

## Results

Fractions below are computed per birth, then summarized across births. Ranges include each seed's first birth, whose prior union is empty and whose novelty is therefore 100%; conditional results for the 97 births with prior material are also in [`summary.json`](data/summary.json).

| Measure | Discarded | Production retained / frozen Plate |
| --- | ---: | ---: |
| Geometry fraction of chosen component | 69.5% median (62.0–92.0%) | — |
| Skeleton novelty outside prior union | 15.4% median (2.1–100%) | 6.3% median (0–100%) |
| Potential / actual footprint new-area fraction | 15.7% median (2.3–100%) | 7.8% median (0.1–100%) |
| Footprint prior-union overlap fraction | 84.3% median (0–97.7%) | 92.2% median (0–99.9%) |
| New footprint cells per birth | 461.5 median | 108.5 median |
| Footprint cells per birth | 2,861 median | 1,520 median |

For the 97 births with prior material, discarded footprint novelty has a 15.2% median and a 2.3–95.2% range; the median prior overlap is 84.8%. By seed, median discarded footprint novelty is 19.9%, 14.6% and 16.6%. The corresponding retained-footprint novelty medians are 9.3%, 6.0% and 8.3%.

Among the 97 births with prior material, 85 have more than half of the discarded potential footprint overlapping prior Plates. Discarded geometry is mostly represented by prior material by area fraction, yet its larger area means it also contains more new cells in absolute terms. These are separate per-birth medians, not counts from one representative birth: discarded footprint has 2,396 prior-overlap cells and 443 new cells; retained footprint has 1,411 overlapping cells and 107 new cells. This supports a coarse repeat-area brake, not a claim that the selector preferentially retains the most novel route.

The time pattern is consistent across seeds. Pearson `r` between simulation time and discarded skeleton novelty is `−0.913`, `−0.802`, `−0.908`; for discarded footprint new-area fraction it is `−0.909`, `−0.800`, `−0.906`. Correlation between discarded novelty and prior-union area fraction is `−0.981` to `−0.992` for footprints. Discarded skeleton cell count does not show a consistent decline with time (`r = 0.196`, `0.010`, `0.285`); the novelty share declines while the amount discarded stays broadly similar.

The segment view is mixed at smaller scale. Across 6,469 discarded remnants, median size is 3 skeleton cells (p90 32, max 722). On skeleton cells, 4,543 remnants are prior-only, 1,345 overlap prior and new space, and 581 are novel-only. In independent potential footprints, 3,781 are prior-only, 2,299 mixed and 389 novel-only. Novel regions are usually fragmented: median 30 connected regions per birth, with median region size 2 skeleton cells and 3 footprint cells. Larger connected regions exist, so the result does not say all discarded history is trivial.

This current-state pattern is consistent with the earlier interior-endpoint rejection: the discarded area contains both repeat and new space, while simply retaining more branches can add a large amount of already represented territory. It does not remeasure the exact old candidate's endpoint paths; the historical aggregate result cannot be reattributed to each segment here. See the [2026-10-08 production rejection](../../daily/2026-10-08-interior-endpoint-production-rejection.md) and [shadow record](../../daily/2026-10-08-interior-endpoint-shadow.md).

## Interpretation boundary

1. **Implementation fact:** the current source-annulus-to-boundary selector does not compare discarded geometry with the prior Plate union. Existing width and rasterization rules produce the actual frozen footprint from retained centerline cells.
2. **Fixed-input observation:** most discarded cells and potential footprint overlap earlier masks; the median novel share decreases as the world accumulates material. Some discarded regions remain outside all earlier masks.
3. **Inference:** pruning prevents substantial repeat footprint, especially late in these runs, while also dropping novel space. Its retained route is more overlap-heavy by fraction, so it is not a spatial-novelty discriminator.
4. **Artistic/modeling interpretation:** outside prior union does not make a form preferable, and overlap can still carry layering or return history. This analysis measures binary spatial representation, not material value, mass, consolidation or artistic quality.

Limits: three seeds, 100 actual births, one fixed `96×96` grid, and no continuous-history or material-quality measurement. The union erases layer order, depth and identity. Eight-neighbor remnants are raster components, not biological branches. Old-candidate overlap figures came from a different historical baseline and are context, not a matched causal comparison.

## Visual evidence

- [Representative births](visuals/representative-births.svg): five cases selected by measured maximum, minimum and nearest-median novelty among births with prior material, plus earliest and latest birth. Duplicate roles are recorded together.
- [All-birth distributions](visuals/all-birth-distributions.svg): all 100 births on shared fixed `[0,1]` fraction axes.
- [Novelty over time](visuals/novelty-over-time.svg): all births on a shared 0–600 s axis. World maps use the same normalized coordinates and fixed 96×96 grid; no per-image normalization.

## Integrity and reproduction

[`manifest.json`](manifest.json) records SHA-256 and byte size for the morphology input files, plus SHA-256 hashes for all 11 production source files and diagnostic tools. [`checksums.json`](checksums.json) records SHA-256 and byte size for every package file, including this README and the validation logs. The runner checked 100 exact birth inputs, 100 current-selector geometries, 100 frozen descriptors, exclusion of the current birth from each prior union, finite measurements, footprint conservation and zero `Math.random` calls. Natural simulation replay was not run.

```powershell
node scripts/ant-selector-history.js
node --test tests/ant-selector-history.test.js
npm test
npm run build
```

Validation logs: [`focused tests`](validation/focused-tests.txt), [`full npm test`](validation/npm-test.txt), [`tracked tests plus this diagnostic`](validation/tracked-and-history-tests.txt), [`build`](validation/npm-build.txt), and [`production scope`](validation/source-scope.txt). The full workspace `npm test` run reported 341/342: its sole failure is in the preserved untracked `tests/ant-selector-shadow.test.js` at `retainedEndpointCount >= endpointCount`. All 336 tracked tests plus this diagnostic's 6 tests passed (337/337); the interrupted selector-shadow files were left untouched and are not part of this branch's commit. Detailed rows are stored as [compressed birth measurements](data/birth-measurements.json.gz) and [compressed discarded segments](data/discarded-segments.json.gz).
