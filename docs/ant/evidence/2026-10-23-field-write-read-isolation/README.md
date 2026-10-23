# ANT field write/read responsibility isolation

## Decision

**MIXED / INCONCLUSIVE.** The first measured phase-dependent footprint difference is already present when a production deposit is written into the Float32 raster. A fixed-raster bilinear read also varies with query phase, and local/wide sensing can enlarge or suppress those differences. The one-tick movement transfer is small and sparse. No field alternative was tested because write, read, and sensor responsibility remains mixed at the movement boundary.

Production field, controller, deposition, movement, and canonical ANT status are unchanged.

## Provenance

- Fresh `origin/main` / experiment base: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Current field source SHA-256: `412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd`.
- Current gaster deposition source SHA-256: `0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faaf060233ce41`.
- Current controller source SHA-256: `e287939accac60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04`.
- Frozen natural transfer inputs: branch `codex/ant-natural-field-transfer-20261023`, commit `1dab083b640dbe73bc00f97a59c27568c8ba7866`; matrix-manifest SHA-256 `8ea739584be0425ba9e2d166a4af04b4a84d4d3ccb6228ef6745026ad9a4ade3`.
- Controlled-route inputs: branch `codex/ant-route-curvature-survey-20261022`, commit `d0e07d089c82d29409c7dd067e17cdeb9a5ecf7f`; `controlled-results.json.gz` SHA-256 `56378c7dc975bc6e5ea0c42a57acfc27369f6eb52458c3096a3be46022bb9bd6`, raw JSON SHA-256 `9615a86610e651753e89b3abea0a2a15527f26af6a12b63d86dc21f348b19578`.

Those branches supplied research data and protocol only. They were not merged into this pass. `read-sensor-summary.json` records hashes for all 66 state files and their phase receipts; `writer-summary.json` records all six ordered history hashes and the controlled-route input hash.

The 66 frozen states cover production and `dtFeedback` origins, three seeds (`20261005`–`20261007`), and 11 captured times through 600 seconds. Treat `dtFeedback` as a separate research arm, not as production. The writer-only history analysis covers the six complete 600-second histories. The controlled set has six route forms—straight, gentle, tight, both mirrored curves, and S-curve—with four preregistered phases and 231 sensor stations per form.

## Implementation facts

Current production uses a 96×96 Float32 field, 15-second half-life, cell cap 8, deposit rate 4.5, radius 0.0045, default dab mode with spacing 0.006, and bilinear reads. Grid pitch is `1/95 = 0.010526315789`; the compact support diameter (`0.009`) is narrower than one cell pitch. Thus a brush can cover zero or one grid node. When it covers zero, production writes the rounded nearest node. When it covers one, that node must also be the nearest node and receives the normalized full brush amount. Both paths therefore produce a one-node footprint at these defaults.

The 18 local reads feed left/center/right profiles, strength, coherence, balance, and steering. A fresh wide decision evaluates five candidate headings; each heading reads up to five transverse points with fixed weights and takes their maximum, then trail response and option scoring select an intent. Held intent is not counted as a fresh wide decision.

No observer was added to production source. All new measurement code is offline research tooling; production runtime cost is zero by construction because no production caller or field code changed.

## Method

### Writer-only

For each physical write in the six frozen histories, replay the actual production `depositPoint` / `depositSegment` / `depositBrush` implementation onto an otherwise-empty raster, once per preregistered phase. This isolates the writer’s spatial footprint from prior deposits, decay, sensor calls, and movement. The per-write receipt retains source sequence/tick, physical point, requested dose, phase, support count, fallback flag, nearest-node distance, node index/proposal/stored delta, and boundary exposure. The compact schema relies on the observed one-node invariant; it asserts one affected node per brush. Centroid displacement equals nearest-node distance; second moment and anisotropy are zero for a single node. Cap is not exercised in an empty-raster write. Full-history cap ledgers are reported separately.

For the one-positive-node case, the diagnostic centroid uses that node’s coordinates directly, so central moments remain exactly zero instead of reflecting weighted-centroid floating-point roundoff.

### Reader and field storage

Each p00 field was reread after the same pre-sensor decay recorded by its phase receipt. The p00 raw local/wide values, local aggregate, and each wide candidate trail response are reconstructed with exact JavaScript-number equality. For phase offset `δ`, the raw local decomposition is:

```text
reader = F00(q + δ) - F00(q)
raster = Fδ(q + δ) - F00(q + δ)
total  = Fδ(q + δ) - F00(q)
```

`F00(q + δ)` holds the stored p00 Float32 raster fixed while moving only the field query to the preregistered phase coordinate. It measures bilinear query-phase sensitivity for that raster. It is not a continuous-field ground truth or an interpolation-error estimate. `Fδ` is the raster from the corresponding full translated-history replay. The split is algebraically additive; residual reports floating-point subtraction precision.

For local sensing, all 18 fixed p00 physical queries were also evaluated against the fixed raster at `q + δ`, then passed through the unchanged production local aggregate. The difference from the actual translated-raster aggregate is retained as a residual component. These aggregate components are diagnostic contrasts, not independent causal interventions: the strength and steering equations are nonlinear, so component magnitudes can cancel and do not sum as absolute magnitudes.

For wide sensing, every fresh p00 candidate’s transverse reads, trail response, option scores, and chosen offset were compared with the production phase receipts. A second fixed-raster read evaluates the same p00 candidate geometry at `q + δ`; it measures the read/max operator with candidate geometry held fixed. Phase-arm candidate headings can shift slightly after local state changes, so those cases are marked as geometry changes and are not forced into raw one-to-one pairs.

### First divergence and movement

The phase receipt replay begins from each exact frozen complete state and uses the unchanged production controller for one tick. Per-ant comparisons retain raw local reads, local aggregate, fresh-wide status and choices, local turn, target/body heading, velocity, travel, and endpoint. First-divergence counts use all paired per-ant replays; local aggregate and movement effect sizes use complete sensor/query pairs only. This is a one-tick transfer test, not a long-running translated-world counterfactual.

## Results

### Writer / nearest-node fallback

| Phase | Brushes | Nearest fallback | Changed physical write events vs p00 | Boundary-exposed brushes |
| --- | ---: | ---: | ---: | ---: |
| p00 | 632,073 | 268,400 (42.46%) | — | 1,173 |
| p10 | 631,985 | 269,319 (42.61%) | 316,329 / 632,739 (49.99%) | 1,208 |
| p01 | 631,762 | 268,723 (42.54%) | 316,577 / 632,739 (50.03%) | 1,778 |
| p11 | 631,674 | 269,706 (42.70%) | 474,492 / 632,739 (75.00%) | 1,813 |

Across all natural p00 brushes, support contained zero nodes 268,400 times and one node 363,673 times; no brush had more than one support node. Every brush affected one node after the fallback. Fallback is common, but it is not a distinct spatial footprint from the supported one-node case. It prevents an unsupported write from disappearing; nearest-node quantization is the shared footprint law.

The controlled straight line is the strongest direct end-to-end cue counterexample. With the source/query line at `y=0.5` (p00), every write falls back and mean absolute local steering is `0.1976213 rad`. Translating both the same line and its queries by half a cell in y (p01) reduces fallback to `14.35%` and mean absolute steering to `1.14e-15 rad`. The steering contrast includes both a changed writer footprint and a translated bilinear query; do not attribute that steering magnitude to the writer alone. The writer-only brush receipts independently show the footprint change before sensing. The average steering phase range across 231 stations is `0.20126 rad` for the straight fixture, `0.08359` for gentle, `0.08856` for tight, and `0.11461` for S-curve. Tight and S-curve fixtures also show station-level wide-winner changes across phases at 193/231 and 9/231 stations respectively.

The gentle and tight mirrored controls agree to floating-point precision: maximum reflected steering error was `5.96e-15 rad`. This supports mirror consistency for those fixtures; it does not establish arbitrary rotation equivariance.

### Fixed-raster reader and raw natural queries

All 66 p00 receipts passed exact reconstruction: 22,160 local reads, 988 wide raw reads, 3,615 complete local agent/phase pairs, and 820 wide option trail-response checks. There were zero read or aggregate mismatches. The raw additive decomposition residual was at most `1.11e-16` field units.

Values below are the equal-weight mean of the 66 per-capture mean absolute deltas. `Interior` excludes query points failing the frozen all-phase margin rule.

| Phase | Raw local reader-only | Raster/storage residual | Observed total | Paired local calls / interior |
| --- | ---: | ---: | ---: | ---: |
| p10 | 0.02617 | 0.02649 | 0.01733 | 22,160 / 21,406 |
| p01 | 0.02461 | 0.02492 | 0.01602 | 22,160 / 21,406 |
| p11 | 0.03571 | 0.03510 | 0.02387 | 22,160 / 21,406 |

The reader-only and translated-raster components are similar in size, while the total is smaller, consistent with cancellation across the signed per-query changes. This establishes measurable fixed-raster query-phase dependence, not that bilinear interpolation is wrong relative to a continuous target.

### Local aggregation

For each phase, 1,205 complete local agent pairs were available; 1,158 were interior across all phases. Raw mean absolute sample changes were `0.01802`, `0.01673`, and `0.02480` for p10/p01/p11. At least one local aggregate output changed in 1,178/1,205 pairs per phase; steering itself changed in 1,166/1,205, 1,167/1,205, and 1,168/1,205. Mean absolute steering changes were `0.02600`, `0.02264`, and `0.03525 rad`; p90 values were `0.06444`, `0.05596`, and `0.08589 rad`.

Under the fixed-raster reader-only contrast, mean absolute steering differences were `0.05653`, `0.05408`, and `0.07697 rad`; the actual translated-raster residual was `0.05814`, `0.05509`, and `0.07908 rad`. Both diagnostic components exceed the net phase difference because they often oppose one another. This supports local nonlinear aggregation as a material transformer of cue differences, but does not rank reader versus writer as the dominant independent cause.

The signed reader-only and raster-residual steering components had opposite signs in `1,004/1,205` (`83.32%`), `1,016/1,205` (`84.32%`), and `985/1,205` (`81.74%`) complete pairs for p10/p01/p11. This is cancellation in the additive diagnostic contrast, not an independent causal intervention.

### Wide sensor / choice

There were 41 fresh wide decisions in the p00 natural cohort; all 41 were fresh in each paired phase. Reconstructing all raw p00 and phase-arm reads reproduced all 820 option trail values exactly. Under fixed p00 candidate geometry with only the fixed-raster query shifted, the max-based trail winner changed for 11/41, 13/41, and 16/41 events in p10/p01/p11. In the full translated phase arms, trail-winner changes were 11/41, 12/41, and 13/41; score-winner changes were 5/41, 8/41, and 9/41; chosen option offsets changed 5/41, 5/41, and 6/41.

For every event, the summary retains all five candidate offsets, each in-domain transverse sample and coordinate for p00, translated-raster and fixed-raster-shifted-query reads, candidate trail response, score, crowding, and chosen flags. Each phase has 988 raw samples in each of those three streams. The 582 raw wide reads per phase with exact candidate/sample geometry pairs are also counted separately for direct p00-to-translated comparisons. Seventeen of the 41 events per phase have at least one changed candidate heading or transverse sample set after the changed local state affects candidate jitter. Those downstream geometry changes are retained as such rather than attributed to the max operator alone.

### First divergence and movement transfer

Across 1,248 paired ants per phase, the earliest sampled divergence was a raw local field value for 1,215 pairs, no downstream difference for 32, and a raw wide read for one pair. Writer-only and controlled fixtures locate the earlier field-stage change at deposit-to-raster footprint formation. The local aggregation stage changed in 1,178/1,205 complete pairs, but it was downstream of differing raw local values in nearly all of those cases.

One-tick movement transfer remained small and sparse. Median endpoint displacement was zero in every phase; mean endpoint displacement was `6.32e-7`, `5.82e-7`, and `7.87e-7` normalized units for p10/p01/p11. The largest paired endpoint difference was `4.39e-5`. Exact travel values changed for 237–240 of 1,248 pairs, generally without a large endpoint shift. This test does not establish whether small one-tick changes accumulate or diverge over free-running motion.

## Responsibility classification

| Stage | Classification | Finding |
| --- | --- | --- |
| Nearest-node fallback | **PARTIALLY SUPPORTED** | Triggered on about 42.5% of natural p00 brushes, but does not create a different footprint from the supported one-node case. It is part of the nearest-node write law. |
| Compact writer footprint / Float32 rasterization | **SUPPORTED** | It is the first measured phase-sensitive stage: per-write receipts show translated histories changing affected node footprints. The controlled steering contrast changes both writes and queries, so it does not quantify writer-only cue impact. Writer and Float32 storage cannot be apportioned further at this support radius. |
| Bilinear reader | **PARTIALLY SUPPORTED** | A fixed p00 raster changes values under the phase-shifted physical query; no analytic continuous truth was used, so this is sensitivity, not interpolation error. |
| Local sensor amplification | **SUPPORTED as a downstream transform; magnitude attribution remains mixed** | Local steering/coherence change on most pairs, but fixed-raster read and translated-raster components have comparable absolute size and frequently cancel. |
| Wide max / winner amplification | **PARTIALLY SUPPORTED** | Fixed-geometry max winners change on 11–16/41 events; actual score/chosen changes are fewer, and 17 events per phase also change query geometry through local state. |
| Movement transfer | **PARTIALLY SUPPORTED** | One-tick changes are measurable but mostly have zero or sub-microunit endpoint displacement; long-run impact is not tested. |

## Decision and next step

The phase sensitivity first appears at the **deposit writer → Float32 stored raster** boundary. Nearest fallback is frequent but not a separate cause from one-node quantization. Bilinear reads add measured query-phase dependence on a fixed raster. Local balance/strength operators can turn small raw changes into steering changes and can also cancel field-stage components. Wide max occasionally changes candidate winners; selected-choice changes are less frequent. No single stage clearly dominates actual movement transfer.

No alternative representation was tested. A subcell splat would target the writer but would also change raw cues entering a reader and sensor system that already shows comparable sensitivity; the current evidence does not yet show that it would fix movement-level behavior while preserving directional contrast. The smallest justified next pass is a fixed-query sensor replay with candidate geometry held constant and an analytic continuous reference for the controlled trails. Re-evaluate writer/read/sensor responsibility there before selecting a field candidate. No free-running natural shadow follows automatically.

## Artifacts and verification

- [`computed/writer-summary.json`](./computed/writer-summary.json): per-history/per-phase writer, dose/boundary, cap, controlled-shape, phase-spread, and mirror summaries with source hashes. SHA-256: `c46cf1e57582440f2fe5c1d878b9e0ce515a172216cd8bda48d49d101be86b20`.
- [`computed/writer-per-brush.csv.gz`](./computed/writer-per-brush.csv.gz): 2,527,494 compact per-brush/phase rows. The `nodeIndex:proposedDose:storedDelta` cell payload preserves each affected node proposal and stored amount. Gzip size: 83,593,494 bytes; SHA-256: `950aaa303e4c25216ac9b8c2e12ed332f8d013924b081d30cc95383e674dc347`.
- [`computed/read-sensor-summary.json`](./computed/read-sensor-summary.json): 66 state/receipt hash records, read reconstruction receipts, per-agent local pairs, per-decision wide candidate/raw details, first-divergence rows, one-tick movement pairs, and phase history ledgers. SHA-256: `21b8fcbc99ac3bc77fcb72b7de073e02858fb5d1f3fdfcca01911c4ee13adea0`.
- [`scripts/ant-field-write-read-isolation.js`](../../../../scripts/ant-field-write-read-isolation.js) and [`scripts/ant-field-read-sensor-analysis.js`](../../../../scripts/ant-field-read-sensor-analysis.js): offline measurement and reconstruction.
- [`tests/ant-field-write-read-isolation.test.js`](../../../../tests/ant-field-write-read-isolation.test.js): checks phase values, local/wide aggregation, single-node fallback and moment precision, and the read/raster decomposition.

Focused validation passed: new diagnostic tests 7/7; `pheromone-field` 8/8; `ant-trail-following` 8/8; `ant-controller` 21/21; `ant-gaster-deposition` 6/6; `ant-gaster-integration` 3/3. Both research scripts passed `node --check`. No full build was run.

The natural transfer source contains the frozen ordered histories/phase receipts needed to regenerate these values. Reproduction requires materializing that tree at commit `1dab083b640dbe73bc00f97a59c27568c8ba7866` and the controlled route results at commit `d0e07d089c82d29409c7dd067e17cdeb9a5ecf7f`; scripts accept those materialized roots. No production test mode, live instrumentation, field replacement, or free-running phase simulation was added.
