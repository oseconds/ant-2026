# ANT realized-traffic orientation: first pass

**Class: MIXED**, scoped to one registered current-production history (`seed 20261005`, 300 s). The history has strong local polar and nematic alignment and positive same-cell direction agreement across 5–60 s. Its global P/Q balance changes over time; supported winding counts, adjacent-cell contrasts, and persistence vary with grid and window; no simple monotone distance–tangent relationship was demonstrated; and Plate overlap is only compared with one fixed descriptive reflection. The evidence supports local organization in this history, but not one stable global director, persistent defect identities, a formation law, or a general ANT rule.

## Capture and provenance

- Captured 18,000 production ticks at 60 Hz, Audio Off, renderer absent, using the production authority `origin/main@5bdd516b412d03d78c2511ceb372180941206968`; `src/` and `static/` match frozen source authority `bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Recorded only actual surviving post-collision movement segments from `completedMovementSegments`. Tick IDs are 1-based; direction comes from `to - from`; segment time is the tick midpoint. Recruits are excluded until their ID was present in the prior completed-tick snapshot. The captured rows retain per-tick active IDs and the exact tick-entry Plate-union revision.
- Plain and observed production controllers matched at initialization and every tick: 18,001 state-digest rows, no mismatch, same injected-RNG calls (`158,996`) and final state, and zero global `Math.random` calls. Production source hashes did not change.
- The pinned `918764c` control capture matched exactly on all 14,686 projected FOOT_CONTACT events, all 19 full material-topology states, 14 Plate births, and five Nodule births. The pinned capture's default-off `AntController` research hook is not treated as current source authority; comparisons use only these shared projections.
- `EVENTS.json.gz` retains the observed cross-type contact/Plate/Nodule event order. The peer gate directly compares FOOT_CONTACT order; ordered Plate and Nodule birth records are compared with births derived from the pinned topology snapshots. Cross-type total order is preserved for inspection but is not a separate peer-parity criterion.
- The capture runner initially framed later trajectory/digest rows as a whitespace-separated JSON sequence because `Array.map` passed its index to the serializer's indentation argument. No interpretation was made from that file. The exact compressed originals and pre-repair run receipt are preserved. The repair parsed and re-emitted the same JSON values only, without interpolating or reconstructing trajectories. It verified 18,000 trajectory rows in tick order, 18,001 state digests in tick order, every observed/plain digest pair equal, the semantic digest-array hash equal to `RUN.pre-repair.json`, and semantic equality after normalization. `RUN.json` now hashes the canonical files; [`REPAIR.json`](./REPAIR.json) and [`RUN.pre-repair.json`](./RUN.pre-repair.json) retain the repair chain and original hashes.
- Synthetic checks passed: 10 Python tests and 3 Node tests, including aligned/opposing traffic, both nematic half-charge signs, unsupported and edge-touching loops, lifecycle exclusion, persistence weights, exact windows and boundary ties, neighbor P/Q mismatch, and row framing. The fixed analysis was independently repeated without a world rerun; summary, local fields, and atlas were byte-identical in [`REANALYSIS-RECEIPT.json`](./REANALYSIS-RECEIPT.json).
- The adjacent-cell mismatch criteria and supplementary displacement quantiles were added to the protocol before the first natural analysis command and before any result output was opened. A later protocol cleanup removed trailing spaces around the header only; [`PROTOCOL-AMENDMENT-RECEIPT.json`](./PROTOCOL-AMENDMENT-RECEIPT.json) records the amendment content hash and chronology basis. File modification time is not used as proof.

## Realized traffic and direction

The run contains **280,829 nonzero 60 Hz segments** and no exactly zero-length segments. `N` below counts these segments per cell/window, not unique ants or independent samples. The smallest nonzero displacement was `5.06e-13` normalized-domain units per tick; the 1st percentile was `2.23e-5`, median `9.91e-4`, and maximum `1.99e-3`. Every nonzero segment remained included, so very small displacements may contribute numerically unstable angles.

Global order used `P = mean(u)` and `Q = mean(u²)`. P distinguishes opposite travel; Q identifies an axis without distinguishing reversal. The time series did not hold a single balance:

| Window end | W=5 s global `|P|` | W=5 s global `|Q|` | W=20 s global `|P|` | W=20 s global `|Q|` |
| ---: | ---: | ---: | ---: | ---: |
| 60 s | 0.179 | 0.503 | 0.230 | 0.325 |
| 120 s | 0.206 | 0.167 | 0.119 | 0.143 |
| 180 s | 0.347 | 0.080 | 0.194 | 0.109 |
| 240 s | 0.205 | 0.218 | 0.377 | 0.203 |
| 300 s | 0.437 | 0.370 | 0.336 | 0.263 |

By contrast, local mean strengths among supported cells were high throughout. At support `N ≥ 3`, the median across integer-second endpoints was:

| Grid | Window | Median supported cells | Median local `|P|` | Median local `|Q|` | Endpoint `|P|` q10–q90 | Endpoint `|Q|` q10–q90 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 24×24 | 5 s | 120 | 0.976 | 0.956 | 0.957–0.987 | 0.919–0.974 |
| 24×24 | 20 s | 301 | 0.951 | 0.920 | 0.923–0.975 | 0.859–0.940 |
| 48×48 | 5 s | 245 | 0.988 | 0.979 | 0.980–0.993 | 0.963–0.987 |
| 48×48 | 20 s | 747 | 0.973 | 0.958 | 0.954–0.987 | 0.928–0.970 |

These strengths show locally aligned recent traffic at the registered spatial/time scales. They do not establish a colony-wide direction: global P and Q vary over time, and locally averaged values depend on cell support and scale.

## Adjacent-cell orientation contrast and winding

The pre-analysis amendment measures every supported horizontal/vertical interior-cell pair once. At support `N ≥ 3`, the median across endpoints of each endpoint's 50th and 90th mismatch percentiles was:

| Grid | Window | Median pair count | Polar mismatch q50 / q90 (rad) | Nematic director mismatch q50 / q90 (rad) | Median Pearson of polar mismatch vs `sqrt(N₁N₂)` |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 24×24 | 5 s | 120 | 0.098 / 0.820 | 0.092 / 0.659 | 0.344 |
| 24×24 | 20 s | 395 | 0.186 / 1.090 | 0.170 / 0.705 | 0.189 |
| 48×48 | 5 s | 237 | 0.017 / 0.482 | 0.018 / 0.435 | 0.371 |
| 48×48 | 20 s | 931 | 0.093 / 0.751 | 0.088 / 0.554 | 0.207 |

Most adjacent supported cells differ by small angles, with broader high-mismatch tails. The typical mismatch changes substantially with grid and window. The pairwise mismatch–`N` correlations are descriptive only; pairs share cells and times, and the repeated observations are not independent. No segmentation threshold was applied, so these are measured orientation transitions, not inferred domain objects.

Winding was evaluated only on supported closed interior loops with nonzero vectors at all four vertices. `P` winding is `ΣΔarg(P)/(2π)`; Q director charge is `ΣΔarg(Q)/(4π)`. At support `N ≥ 3`, across all evaluated endpoints:

| Grid | Window | Median valid interior loops/endpoint (range) | Endpoints with nonzero P winding | P `−1 / +1` loop-endpoint tallies | Endpoints with nonzero Q charge | Q `−½ / +½` loop-endpoint tallies |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 24×24 | 5 s | 18 (4–44) | 130 / 296 | 38 / 131 | 220 / 296 | 98 / 272 |
| 24×24 | 20 s | 125 (57–166) | 275 / 281 | 214 / 575 | 281 / 281 | 616 / 1,135 |
| 48×48 | 5 s | 23.5 (2–53) | 127 / 296 | 54 / 101 | 174 / 296 | 84 / 173 |
| 48×48 | 20 s | 227 (76–305) | 270 / 281 | 295 / 613 | 281 / 281 | 628 / 1,062 |

The presence of supported charges is fairly robust to `N ≥ 1, 3, 5` within each grid/window, but the number of valid loops and charge appearances changes strongly with grid and window. These tallies count repeated loop-endpoint observations; a charge appearing at several times is not a tracked persistent defect. Winding is a geometric field measure, not evidence of a biological defect or physical stress.

## Persistence

The registered persistence value is an **uncentered, support-intersection-weighted angular agreement** on cells valid at both endpoints, not a mean-subtracted autocorrelation, decay time, or significance test. For support `N ≥ 3`:

| Grid | Window | Lag (s) | Polar agreement `ρ` | Nematic agreement `ρ` | Matched cell-pairs |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 24×24 | 5 s | 5 / 10 / 60 | 0.658 / 0.624 / 0.569 | 0.518 / 0.451 / 0.431 | 12,360 / 10,389 / 7,821 |
| 24×24 | 20 s | 20 / 40 / 60 | 0.720 / 0.672 / 0.654 | 0.552 / 0.498 / 0.511 | 48,968 / 43,055 / 38,140 |
| 48×48 | 5 s | 5 / 10 / 60 | 0.619 / 0.585 / 0.532 | 0.502 / 0.427 / 0.395 | 14,660 / 12,254 / 9,283 |
| 48×48 | 20 s | 20 / 40 / 60 | 0.685 / 0.635 / 0.651 | 0.538 / 0.486 / 0.478 | 84,510 / 73,164 / 63,843 |

Agreement remains positive at the 60 s lag across all settings. Stable average traffic, the fixed entrance, boundary geometry, and overlapping observations across adjacent endpoint pairs can all contribute; the statistic does not establish persistent ant roles or a memory mechanism. All lags, support variants, weights, matched counts, and endpoint counts are in `SUMMARY.json`.

## World edges and prior Plate coverage

The separately registered world-edge statistic correlates segment-midpoint distance to the nearest edge with absolute tangent alignment. Pearson `r = 0.099` over all 280,829 segments. Mean tangent alignment was `0.536` within 0.05 of an edge, stayed near `0.526–0.540` from 0.05–0.20, peaked at `0.672` from 0.25–0.30, then declined; the furthest bin (0.45–0.50) was `0.549`. No simple monotone distance–tangent relationship was demonstrated. This is distinct from adjacent-cell orientation contrast and interior winding measures above.

Traffic distance-weighted overlap with the Plate union that existed before each tick was compared with its same-time horizontal reflection. Rates were:

| Time | Segments | Observed prior-Plate overlap | Reflected overlap | Difference |
| --- | ---: | ---: | ---: | ---: |
| 0–60 s | 35,528 | 0.0% | 0.0% | 0.0 pp |
| 60–120 s | 56,004 | 8.2% | 6.3% | +1.9 pp |
| 120–180 s | 59,701 | 33.9% | 29.9% | +3.9 pp |
| 180–240 s | 64,005 | 51.7% | 47.7% | +4.0 pp |
| 240–300 s | 65,591 | 63.4% | 51.7% | +11.7 pp |
| Overall | 280,829 | 34.9% | 30.2% | +4.8 pp |

This is a single deterministic spatial reference, not a randomized null or causal estimate. It compares travel over already-existing material; it does not measure whether direction adds predictive or formation information beyond traffic amount, local `N`, prior Plate coverage, recruitment, entrance, and retained-material locomotion effects. No deposition law or material feedback is established.

## Limits and interpretation

- One seed and one current-production history. Repeated segments, cell pairs, endpoints, and loop observations are dependent; no confidence intervals or p-values are claimed.
- Direction comes from exact realized post-collision segments, but near-zero nonzero displacements are included. The length distribution indicates possible angular instability at the lower tail; a new pass would be needed to test any different stability rule.
- Local P/Q strengths and adjacent mismatch are resolution-dependent summaries. Winding counts change with grid/window and are not tracked defect identities.
- The observed world includes fixed-entrance recruitment, current steering and boundaries, endogenous flow, A/D, and retained material. None was isolated causally here.
- No biological semantics, universal organization, physical-stress interpretation, deposition law, artistic preference, or production suitability is claimed.

## Reproduction and files

The locked measures and pre-analysis amendment are in [`PROTOCOL.md`](./PROTOCOL.md). Synthetic tests are [`tests/ant-multiphysics-orientation.test.js`](../../../../../tests/ant-multiphysics-orientation.test.js) and [`tests/test_ant_multiphysics_orientation.py`](../../../../../tests/test_ant_multiphysics_orientation.py). Run them with `node tests/ant-multiphysics-orientation.test.js` and the installed Python interpreter with `-B tests/test_ant_multiphysics_orientation.py`.

Run the offline analysis with the installed Python interpreter and `-B scripts/ant-multiphysics-orientation-analysis.py`. The source runner is [`scripts/ant-multiphysics-orientation.js`](../../../../../scripts/ant-multiphysics-orientation.js); the fixed analysis is [`scripts/ant-multiphysics-orientation-analysis.py`](../../../../../scripts/ant-multiphysics-orientation-analysis.py). Capture and per-tick receipts are in `RUN.json`, `REFERENCE.json`, `TRAJECTORY.ndjson.gz`, `STATE-DIGESTS.jsonl.gz`, `EVENTS.json.gz`, `TOPOLOGY.json.gz`, and `MATERIALS.json.gz`. Exact all-setting/all-endpoint fields are in `LOCAL-FIELDS.ndjson.gz`, and the fixed-scale five-endpoint atlas is [`ATLAS.svg`](./ATLAS.svg). Preserved pre-normalization compressed sources, `RUN.pre-repair.json`, `REPAIR.json`, and final `MANIFEST.sha256` retain the capture and normalization provenance.
