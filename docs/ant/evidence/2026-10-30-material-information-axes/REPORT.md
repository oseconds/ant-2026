# Material information axes audit

## Decision

**MULTI-AXIS.** In the current-G production history, `layerCountByCell` is a close proxy for burial depth, but it does not identify the exposed Plate's age, geometry, chemical-derived birth family, or the current local compaction and accumulated foot-load context. These differences occur repeatedly at actual organism read points, including A turn calls and D finite same-flow opportunities.

This is a descriptive result from one frozen endogenous history. It does not show that the axes are statistically orthogonal, that any variable should drive a particular feedback responsibility, or that a new feedback law is desirable.

## Authority and provenance

- Pinned production source: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Fresh remote observation: `origin/main = 15667c73e9f507bf89dea645f966bc7f58301fdc`. It is two commits ahead of the pin; the observed delta is only `.github/workflows/deploy.yml` and `vite.config.js`. Relevant ANT source and canonical `docs/ant/README.md` are byte-equal to the pin.
- Research parent: `codex/ant-material-feedback-surface-vs-depth-20261030` at `18fed8fbca82e8b86dfc88779cd6e11b797a2439`.
- Research branch: `codex/ant-material-information-axes-20261030`.
- Frozen history: current-G/H0, seed `20261005`, 60 Hz, 600 s, Audio Off; production layer-count slowdown On, candidate A/D Off, residence Off.
- The existing packets did not contain full Plate birth descriptors or consumer-position material rows. One observer-only deterministic replay reconstructed them. It reproduced the frozen raw/checkpoint bytes, final RNG state, layer-count summaries, turn and D-context counts, late SurfaceField/support maps, pre-material layer maps, and Plate IDs/times/masks exactly. No new treatment or trajectory was introduced.

Exact input/source hashes, all 40 late grid-anchor ticks and model times, parity receipts, and instrumentation hash are in [`PROVENANCE.json`](PROVENANCE.json). The capture and complete machine-readable summaries are [`CAPTURE.json.gz`](data/CAPTURE.json.gz) and [`ANALYSIS.json`](data/ANALYSIS.json).

## Production dependency map

These are implementation facts from the pinned source, before interpreting the measurements.

| Readout | Source-defined meaning | Information-family treatment |
|---|---|---|
| `layerCountByCell` (`L`) | Number of Plate indices in the cell's immutable-order column. | Structural count. |
| `totalDepthByCellMeters` | Sum of Plate thicknesses above the bottom/foundation entry; the bottom entry is excluded. Thus `L=1` has depth `0`. | Nearly redundant with `L` in this history because Plate thicknesses occupy a narrow range; not a separate strong axis here. |
| `topLayerByCell` / top Plate ID | Index of the last Plate in the historical column. | Identity/order is provenance, not itself a physical coefficient. Different top IDs expose different stored birth descriptors at the same `L`. |
| Top age | Sample time minus immutable Plate birth time. | Temporal history; not derived from `L`. |
| Top thickness / `meanHalfWidth` | Thickness is an explicit descriptor value if present, otherwise `clamp(0.001 + 0.05 × meanHalfWidth, 0.001, 0.01)`. | One geometry family; do not count width and its thickness transform twice. |
| `metrics.meanChemical` → stiffness and damping | Stiffness is `clamp(0.65 + 0.5 × clamp(meanChemical,0,1), 0.65,1.15)`; damping is `clamp(0.25 + 0.2 × clamp(meanChemical,0,1), 0.25,0.45)`. | One chemical-derived birth family; stiffness and damping are deterministic transforms, not two axes. |
| `metrics.meanSupport` → density | Density is `clamp(1 + 0.2 × clamp(meanSupport/0.08,0,1),1,1.2)`. | One support-derived birth family. In this history every observed top `meanSupport` exceeds `0.08`, so the derived density is saturated at `1.2` and adds no observed variation. |
| Current `SurfaceField` value and `sampleSupport` | A slowly relaxing scalar field written by foot contacts; `sampleSupport` is a center-weighted neighborhood read of that field (default radius `0.025`). | One current-compaction family with cell and neighborhood read operators, not two histories. |
| `footLoadByCell` | Accepted individual foot contacts increment the nearest cell's unsigned counter; it saturates at `uint32` maximum and does not decay. | Cumulative-use history. Distinct from current compaction by source semantics, although strongly associated in this run. |

Relevant pinned source: [`MaterialStratigraphy.js`](../../../../src/lib/agents/ant/MaterialStratigraphy.js), [`TrailPlateBirth.js`](../../../../src/lib/agents/ant/TrailPlateBirth.js), [`SurfaceField.js`](../../../../src/lib/agents/ant/SurfaceField.js), and [`AntController.js`](../../../../src/lib/agents/ant/AntController.js).

The production `m(L)` slowdown remains unchanged. Candidate A and D shims and residence remained Off. The capture script records native turn calls and finite same-flow opportunities as prospective contexts only; it does not apply those candidate laws.

## Sampling views

| View | Rows | Definition |
|---|---:|---|
| Material grid | 207,779 | All materialized cells across 40 existing late anchors: 20 one-second anchors from about 280–299 s and 20 from about 580–599.25 s. |
| Organism exposure | 423,002 | Every material-exposed ant tick (`L>0`) over the frozen 600 s history, read at tick entry. |
| A context | 423,002 | One native turn call per material-exposed ant tick; tick-entry stratigraphy and foot load match the exposure rows exactly. Turn-call SurfaceField values are read at the actual call point, after that tick's field relaxation. |
| D context | 32,366 | Actual finite `followingSpeedLimit` same-flow opportunities from native `LocalOccupancy.sense`; all values are sampled at the exact sense call. |

These are repeated observations from one world, not independent trials. The 40 maps repeat the same evolving grid; ant-ticks repeat agents and locations. Exact ticks and model times are listed in `PROVENANCE.json` and `ANALYSIS.json`.

At actual A turn-call time, the 423,002 material descriptors remain paired one-for-one with exposure rows. The call-point SurfaceField readout after relaxation has median `.35929` and p10–p90 `.16778–.74937`; its support readout has median `.35868` and p10–p90 `.17583–.74345`. The machine summary stores these call-point field distributions separately. Conditional same-`L` strata use the exact paired tick-entry material values; the call-point field summary itself is not split by `L`.

## Descriptive distributions

The table reports median, p90, and observed range. Depth and thickness are metres; age is seconds; other fields use their native scalar/count units.

| Readout | Grid median / p90 [range] | Exposure median / p90 [range] | D median / p90 [range] |
|---|---|---|---|
| `L` | 7 / 17 [1, 35] | 7 / 16 [1, 35] | 7 / 16 [1, 34] |
| Burial depth | .01002 / .02668 [0, .05660] | .00992 / .02492 [0, .05660] | .00997 / .02502 [0, .05492] |
| Top age | 30.50 / 164.10 [1, 515.23] | 19.98 / 117.78 [0, 485.17] | 22.02 / 120.65 [0, 396.92] |
| Top thickness | .001668 / .001687 [.001626, .001706] | .001664 / .001682 [.001626, .001706] | .001662 / .001682 [.001626, .001706] |
| Top `meanChemical` | .57689 / .58058 [.54684, .58406] | .57364 / .58258 [.54684, .58406] | .57364 / .58258 [.54684, .58406] |
| Top `meanSupport` | .36300 / .47817 [.13660, .47817] | .34579 / .44437 [.13660, .47817] | .34579 / .43470 [.13660, .47817] |
| Current SurfaceField cell value | .31807 / .56065 [0, .97965] | .35967 / .75178 [0, .97933] | .47713 / .91052 [.02527, .97901] |
| Current SurfaceField support | .31384 / .54670 [.01139, .96768] | .35868 / .74345 [.01767, .96758] | .47309 / .89242 [.05771, .96758] |
| Cumulative foot load | 9 / 22 [0, 215] | 11 / 36 [0, 213] | 16 / 67 [0, 213] |

### `L` relationships and remaining within-layer variation

Pearson/Spearman pairs for `L` versus each readout:

| Readout | Grid | Exposure | D context |
|---|---:|---:|---:|
| Burial depth | .99999 / .99818 | .99999 / .99829 | .99999 / .99854 |
| Top age | −.176 / −.125 | −.230 / −.184 | −.290 / −.249 |
| Top thickness | −.304 / −.317 | −.118 / −.135 | −.083 / −.104 |
| Top chemical family | .278 / .240 | .250 / .296 | .232 / .250 |
| Top support family | .681 / .705 | .697 / .739 | .711 / .757 |
| Current SurfaceField cell value | .530 / .554 | .450 / .461 | .338 / .286 |
| Current SurfaceField support | .565 / .600 | .475 / .494 | .362 / .316 |
| Foot load | .420 / .511 | .284 / .435 | .169 / .287 |

Fraction of each readout's pooled numeric variance that remains *within exact `L` strata* (descriptive conditional variance, not an independence score):

| Readout | Grid | Exposure | D context |
|---|---:|---:|---:|
| Burial depth | .00003 | .00002 | .00002 |
| Top age | .953 | .939 | .866 |
| Top thickness / width family | .888 | .948 | .931 |
| Top chemical family | .890 | .839 | .879 |
| Top support family | .471 | .446 | .409 |
| Current SurfaceField cell value | .699 | .791 | .847 |
| Current SurfaceField support | .660 | .768 | .831 |
| Foot load | .796 | .885 | .880 |

The only readout nearly collapsed by `L` is burial depth. Top support has a stronger monotonic relation to `L` than most families, but still has substantial same-`L` spread. The derived density does not share that spread here because its formula is saturated. Foot load and current field are strongly associated (`L`-pooled foot-load vs cell-field Spearman: `.951` grid, `.965` exposure, `.979` D), so they should not be described as orthogonal; their cumulative versus relaxing definitions remain distinct.

Additional paired relationships (Pearson/Spearman):

| Pair | Grid | Exposure | D context |
|---|---:|---:|---:|
| Burial depth ↔ current SurfaceField support | .565 / .598 | .475 / .498 | .362 / .317 |
| Top chemical family ↔ current SurfaceField support | .237 / .188 | .192 / .216 | .214 / .219 |
| Top support family ↔ current SurfaceField support | .540 / .578 | .388 / .443 | .290 / .311 |
| Foot load ↔ current SurfaceField cell value | .857 / .951 | .840 / .965 | .835 / .979 |

## Same-`L` counterexamples

`L=1` is a substantial stratum: 14,488 grid rows (across repeated anchors), 47,166 organism-exposure rows (11.15% of exposed ticks), and 4,480 D opportunities (13.84% of that view). At `L=1`, the column depth is exactly zero, yet the consumer rows still span:

| Readout at `L=1` | Exposure p25 / median / p75 [range] | D p25 / median / p75 [range] |
|---|---|---|
| Top age (s) | 11.07 / 31.13 / 100.02 [0, 485.17] | 13.90 / 47.63 / 157.85 [0, 385.97] |
| Top thickness (m) | .001653 / .001655 / .001673 [.001626, .001706] | .001653 / .001655 / .001668 [.001626, .001706] |
| Top `meanChemical` | .56713 / .57099 / .57364 [.54684, .58406] | .57009 / .57198 / .57364 [.54684, .58406] |
| Top `meanSupport` | .17925 / .21031 / .24104 [.13660, .47817] | .17925 / .22376 / .22376 [.13660, .39295] |
| Current SurfaceField cell value | .14823 / .22975 / .36045 [0, .97933] | .21365 / .38395 / .92276 [.06556, .97901] |
| Current SurfaceField support | .16172 / .22929 / .34621 [.01767, .96756] | .22582 / .34625 / .88583 [.10054, .96739] |
| Foot load | 3 / 6 / 12 [0, 213] | 6 / 12 / 66 [0, 213] |

The grid result is not only cross-time pooling: at each of the 40 saved anchors, `L=1` had at least two cells, and the within-anchor interquartile range was positive for age, thickness, mean chemical, mean support, current field, current support, and foot load (40/40 anchors for each). Median per-anchor IQRs were respectively 85 s, 0.00001335 m, 0.00810, 0.07136, 0.13725, 0.11397, and 5 contacts.

Depth is the exception: at grid `L=4`, the pooled range is `0.004926–0.005089 m` (0.163 mm across repeated anchors), while the exposure `L`/depth correlation is above `.99998` and only about `.00002` of pooled depth variance remains within exact `L`. This small real spread follows the narrow width-derived Plate thickness range; it does not make depth a comparably distinct axis in these observations.

Deterministically selected actual consumer examples include:

- **Chemical-derived top family, same `L=1`, actual turn/D calls:** `ant-50` at 85.45 s on `trail-plate-1` has `meanChemical=.546845`; `ant-399` at 345.47 s on `trail-plate-17` has `.584063`. Both call native turn and occur in the finite D context. These properties would map to different stiffness/damping values, though both remain one chemical-derived family.
- **Current use/compaction, same `L=1`, actual D opportunities:** `ant-311` at 295.30 s on `trail-plate-14` has SurfaceField `.06556` and foot load `0`; `ant-685` at 540.42 s on `trail-plate-8` has `.97901` and foot load `188`.
- **Top support, same `L=1`, actual turn/D calls:** `ant-50` at 85.45 s has `meanSupport=.13660`; `ant-546` at 450.43 s on `trail-plate-26` has `.39295`. Both are above the density formula's `.08` saturation input, so the raw support descriptor differs while derived density remains `1.2`.
- **Top age, same `L=1`:** a just-born `trail-plate-1` sample at 84.02 s and a `trail-plate-2` sample at 591.18 s have ages 0 and 485.17 s. This is actual exposed material history, not a numerical transform of `L`.

At `L=1`, the exposure view contains 33 distinct top Plate IDs; D contains 19. The exposure view includes 561 complete bottom-to-top histories at `L=4`. Identity/order is evidence of provenance diversity, not by itself a claim of different physical behavior.

## Interpretation

**Implementation fact:** `L` almost fully encodes this run's burial depth because depth sums the thicknesses above the bottom entry and Plate thicknesses vary little. Source-derived duplicate properties were collapsed before counting families: width/thickness, chemical/stiffness/damping, support/density, and SurfaceField cell/support.

**Measurement:** Among actual exposed ant ticks and D same-flow opportunities, exact `L` does not collapse top age, top geometry, chemical birth descriptors, current compaction, or foot-load distributions. Same-`L` variation is present within individual late grid anchors and in actual organism contexts, not only as a difference between grid-wide averages.

**Research interpretation:** The present material state is not usefully represented by `L` alone for read-only description. At least two source-defined information families survive at fixed `L` in both material-grid and consumer-weighted views. Several families remain correlated; the result is multi-axis, not orthogonal-axis proof.

**Authored/modeling boundary:** No responsibility was assigned to any axis. In particular, this audit does not conclude that A should use stiffness, D should use foot load, or residence should use depth. It creates no latent `χ` state and does not validate any feedback law.

## Next closed question

If pursuing one follow-up, ask: **At actual native turn calls and fixed `L`, does the exposed top Plate's stored birth-property family add reproducible descriptive information about turn demand or outcome after current SurfaceField context is accounted for?** This is a mapping question only; it does not select stiffness or damping as a production input.

## Explicit omissions

No new natural simulation, seed, feedback treatment, parameter tuning, latent state, production source change, source/lifecycle redesign, formation change, morphology work, audio evaluation, allocation, UPDATE, BODY, production adoption, or canonical README status change.
