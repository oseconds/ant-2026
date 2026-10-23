# ANT field writer / reader failure attribution

## Question and scope

This fixed-geometry pass asks whether the previously observed local steering sign failures and wide candidate winner failures are already produced by the analytic-node bilinear path, or require production-written raster values. It changes no production source, field, sensor operator, movement law, RNG, or world run.

Production baseline: `origin/main` / `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.

## Reused frozen data

- Sensor operator isolation: branch `codex/ant-sensor-operator-isolation-20261024`, commit `e0340d21196438ea56cadd178b81b2d8064755e6`.
- Analytic reference: branch `codex/ant-field-analytic-reference-20261023`, commit `2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa`.
- Exact compressed input copied from the sensor pass: [`inputs/station-raw.json.gz`](inputs/station-raw.json.gz), SHA-256 `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`.
- Uncompressed frozen row JSON SHA-256: `bdab38fd13ccb8bae6689cdb7af134c52265969849d4cbfdd5c528677628e13d`.
- The input contains the same six route fixtures, four phases, 231 stations per fixture/phase, frozen local and wide query geometry, continuous-reference samples, production samples, and saved C1/C2 residuals: 5,544 station/phase rows.
- Production source receipts are checked by the analyzer: `AntController.js` `e287939a…`, `PheromoneField.js` `412798ea…`, and `GasterDeposition.js` `0293e145…` (full values are in the computed JSON).

The prior analytic pass stores per-query C1/C2 residuals rather than complete analytic node arrays. This pass recovers B as `A + C2`. It does not regenerate routes, query geometry, analytic references, or production rasters.

## Representation arms and class rules

| Arm | Values used |
| --- | --- |
| A | Frozen continuous analytic field sample at each exact query. |
| B | `A + C2`: the frozen analytic-node sample reconstructed by the production bilinear rule. This is not the production field. |
| C | Frozen query sample from the production-written Float32 raster, read with the same production bilinear rule. |

All three arms use the same saved local aggregation or wide weights, max, Hill response and deterministic field-only score. No RNG or movement runs. Local sign comparisons use the prior precision rule (`64 × Number.EPSILON × max(1, raw magnitude)`). Wide correctness is relative to the strict-unique analytic final-score winner; the saved analytic winner criterion is retained exactly.

The reused decomposition defines `C1 = bilinear(production Float32 nodes − analytic samples at production grid nodes)` and `C2 = bilinear(analytic grid-node samples) − continuous analytic query`. Thus B includes analytic node sampling plus bilinear reconstruction; it is not a production raster read. C1 is the production writer/storage residual observed through the same bilinear rule. `C − A` equals C1 + C2 up to the saved Float64 residual.

- **READER-SUFFICIENT:** A is correct; B and C are qualitatively wrong at the stage being classified.
- **WRITER/STORAGE-SUFFICIENT:** A and B are correct; C is wrong.
- **READER-FAILURE PARTLY RESTORED BY WRITER:** B is wrong; C returns to A.
- **B TOP TIE / AMBIGUOUS:** A is correct and C is wrong, but B has an exact top-value tie that includes A's target; deterministic lower-index ordering picks another candidate, so B does not uniquely prefer the wrong result.
- **MIXED / COMPOUND:** A's upstream stage already differs from its final winner, or a local sign arm is zero/ambiguous.

Full A/B/C raw samples, sensor outputs, candidate values, ranks, margins and per-row classifications are in [`computed/abcs-stage-rows.json.gz`](computed/abcs-stage-rows.json.gz). Summary metrics and receipts are in [`computed/abcs-attribution.json`](computed/abcs-attribution.json).

## Reconstruction and numeric precision

There are 99,792 local raw samples and 138,600 wide raw samples. `B − A` exactly reproduces the saved C2 at all 238,392 queries. `C − A` exactly reproduces the saved total component at all 238,392 queries. The re-subtracted `C − B` differs from saved C1 at 67,807 queries, with maximum absolute residual `2.7755575615628914e-17`; the saved `total − (C1 + C2)` maximum has the same value. This is the observed Float64 operation-order residual and is retained without a tolerance adjustment.

Reconstructing B from the other side (`C − C1`) bounds the consequence of that operation-order uncertainty: maximum local steering difference is `9.71445146547012e-17`, no local steering sign changes occur, and none of the wide raw, weighted or final ranks/winners change across all 5,544 rows.

The unchanged A/C production sensor calculations reproduce the frozen values exactly: 77,616 local feature comparisons, 166,320 wide candidate-stage comparisons, 277,200 weighted sample values, 55,440 candidate ranks, and 11,088 final winners, all with zero non-exact results. Local feature and wide candidate-stage maximum errors are zero.

## Local steering results

The established exact-sign cohort remains 549 failures: 546 precision-stable opposite signs and three separate near-zero cases. The latter are not counted as stable sign failures.

| Stable production sign failures (n=546) | Count |
| --- | ---: |
| Reader-sufficient | 335 |
| Writer/storage-sufficient | 211 |
| Reader failure partly restored by writer | 0 |
| Mixed / compound | 0 |

Across all 4,012 non-ambiguous analytic-directional rows, B/C outcomes are: 335 reader-sufficient failures, 211 writer-sufficient failures, 125 reader failures restored by C, 152 zero/compound cases, and 3,189 with no qualitative sign failure. The full 5,544-row cohort remains available as controls in the row artifact.

| Phase | Stable failures | Reader-sufficient | Writer/storage-sufficient |
| --- | ---: | ---: | ---: |
| p00 | 107 | 40 | 67 |
| p10 | 77 | 30 | 47 |
| p01 | 191 | 138 | 53 |
| p11 | 171 | 127 | 44 |

| Route | Stable failures | Reader-sufficient | Writer/storage-sufficient |
| --- | ---: | ---: | ---: |
| gentle / mirrored gentle | 150 each | 71 each | 79 each |
| tight / mirrored tight | 38 each | 22 each | 16 each |
| S route | 170 | 149 | 21 |

Responsibility changes with phase: p00/p10 have more writer-sufficient cases, while p01/p11 have more reader-sufficient cases. S-curve stable failures are reader-sufficient in 149/170 rows. Mirrored curves retain paired A/B/C steering symmetry to a maximum absolute sum of `1.64e-14` rad.

## Wide winner results

Among 5,072 strict-unique analytic winners, production has 2,378 final winner mismatches. The 1,380 cases whose production final winner first departs at the raw candidate maxima classify as:

| Raw-max first-wrong cohort (n=1,380) | Count |
| --- | ---: |
| Reader-sufficient | 993 |
| Writer/storage-sufficient | 328 |
| Reader failure partly restored by writer | 0 |
| Mixed / compound | 3 |
| B top tie / ambiguous | 56 |

The three mixed cases are S-route stations `p01/0.236`, `p11/−0.094`, and `p11/−0.092`: A's own unweighted raw-max candidate differs from A's final-score winner, so the raw stage cannot be assigned to B or C alone.

The 998 cases whose production winner first departs only after production weights plus max classify as 841 reader-sufficient, 123 writer/storage-sufficient, and 34 B-top-tie ambiguous. No case is restored or mixed in this subset. The 56 raw-stage and 34 weighted-stage ambiguous cases all have an exact B top tie containing A's final target; lower-index tie-breaking selects another candidate.

The all-row stage census exposes restoration outside the production-failure cohorts:

| Stage across 5,072 unique analytic winners | Reader-sufficient | Writer/storage-sufficient | Reader failure restored by writer | Mixed / compound | B top tie / ambiguous | No qualitative failure |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Raw maxima | 1,217 | 476 | 546 | 436 | 370 | 2,027 |
| Weighted maxima | 2,044 | 250 | 609 | 12 | 90 | 2,067 |
| Final score winner | 2,039 | 249 | 598 | 0 | 90 | 2,096 |

Analytic final-score winner margins across the 2,378 production mismatches have median `0.0934739697`, p90 `1.7830731867`, p95 `1.7830731867`, and maximum `1.8186870738`. In the top equal-count decile (238 rows; margins `1.7830731867`–`1.8186870738`), 151 are unambiguous reader-sufficient, 78 writer/storage-sufficient, and 9 B-top-tie ambiguous; 159 first depart at raw maxima and 79 after weights plus max. Margins are deterministic score differences, not perceptual measures.

The attribution varies by phase and route; counts below preserve the production-failure cohort and classify B ties separately.

| Phase | Raw n | Raw reader | Raw writer | Raw B tie | Raw mixed | Weighted n | Weighted reader | Weighted writer | Weighted B tie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| p00 | 344 | 235 | 79 | 30 | 0 | 303 | 249 | 38 | 16 |
| p10 | 385 | 285 | 74 | 26 | 0 | 272 | 220 | 34 | 18 |
| p01 | 302 | 225 | 76 | 0 | 1 | 232 | 200 | 32 | 0 |
| p11 | 349 | 248 | 99 | 0 | 2 | 191 | 172 | 19 | 0 |

| Route | Raw n | Raw reader | Raw writer | Raw B tie | Raw mixed | Weighted n | Weighted reader | Weighted writer | Weighted B tie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gentle / mirrored gentle (each) | 464 | 337 | 99 | 28 | 0 | 364 | 344 | 19 | 1 |
| tight / mirrored tight (each) | 194 | 132 | 62 | 0 | 0 | 107 | 53 | 38 | 16 |
| S route | 64 | 55 | 6 | 0 | 3 | 56 | 47 | 9 | 0 |

### Preregistered representatives

The two examples below were named in the task before analysis.

**Reader-sufficient raw-max case — tight / p00 / station 0.294.** A final winner is offset 0 with margin `1.8186870738`. Candidate raw maxima A=`[0, 0, .0607864711, .0275097548, 0]`; B=`[0, 0, .0320162778, .0323878745, 0]`; C=`[0, 0, .0352857840, .0410850568, 0]`. B already changes the winner to `+.47`, before production stored values are introduced.

**Writer-sufficient weighted-max case — tight / p10 / station 0.066.** A final winner is offset 0 with margin `1.7830731867`. Raw maxima A/B/C all choose 0. Weighted maxima A=`[0, 0, .0479672086, .0167474030, 0]`; B=`[0, 0, .0273034857, .0231215346, 0]`; C=`[0, 0, .0285016758, .0367617454, 0]`. B still chooses 0; C changes to `+.47` after weights plus max.

## Components, phase and straight control

On local raw samples C2 has MAE `.0170355742` and C1 `.0102559872`; this matches the prior pooled component ordering. Across the 71,419 nonzero local sample pairs, C1 and C2 point in opposite directions 43,330 times and reinforce 28,089 times. C1 reduces the absolute C2 residual on 40,690/99,792 total samples and enlarges it on 59,102. On the 546 stable sign failures, aggregate steering components oppose in 212 cases and reinforce in 334; the writer delta reduces the reader steering error in 146 and enlarges it in 400.

At wide candidate maxima, C1/C2 oppose in 8,524 of 11,754 nonzero raw-max pairs and 8,494 of 11,754 weighted-max pairs. However, the writer delta reduces the reader raw-max error in 7,504/27,720 candidates and enlarges it in 20,216; for weighted maxima these counts are 7,360 and 20,360. Thus signed opposition is common, while the writer often enlarges the residual magnitude.

The straight analytic reference has exactly zero local steering at every station and phase. At station `.122`, A and B both steer exactly zero at p00, while C steers `+0.1970896621` rad. At p01, B and C are symmetric to numerical roundoff (`−1.31e-15` and `−1.17e-15` rad). The prior analytic-reference test at commit `2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa` verifies the production p00 and p01 Float32 raster buffers are byte-identical: p00 half-cell fallback and p01 on-node deposition alias to the same stored row. The frozen query geometry moves by half a cell between phases. Identical raster bytes therefore do not imply identical bilinear reads: p00 samples the one-row footprint from a half-cell offset and develops unequal left/right reads. A/B/C locates the false steering in C relative to B; this is writer/storage-sufficient at that geometry, expressed through the unchanged reader and phase-shifted queries.

## Decision and limits

**Attribution: reader/reconstruction is the largest unambiguous single responsibility in the targeted failure cohorts, while writer/storage independently creates a substantial minority.** Reader-sufficient cases outnumber writer-sufficient cases in local stable failures (335/211), raw-max wide failures (993/328, plus 56 exact-tie ambiguities), weighted-max-first failures (841/123, plus 34 ambiguities), and the top margin decile (151/78, plus 9 ambiguities). Writer/storage still explains the straight p00 false steering and every writer-sufficient category above. C also restores 125 local directional cases and 598 wide final winners where B is wrong.

This supports a later **reader-only fixed-geometry counterfactual** as the smallest next pass, with the production raster/writer held fixed and the full cohort retained as a regression control. It does not establish that any alternate reader will qualify. A writer-only alternative is separately justified for its measured subset, but is not the smallest first experiment; a coupled writer/reader change is premature because the two paths remain separately attributable.

No alternative was implemented or tested here. The analytic cue is a dose-mapped diagnostic reference, not biological ground truth. These results do not establish natural movement improvement. Production `src/` is unchanged; there was no free-running simulation, movement replay, new sensor, or field candidate.

## Validation and reproduction

- New A/B/C attribution tests: 7/7 pass.
- Focused production field/controller/trail/deposition tests: 46/46 pass (`pheromone-field`, `ant-controller`, `ant-trail-following`, `ant-gaster-deposition`, `ant-gaster-integration`).
- Combined focused total: 53/53 pass. Both research scripts pass `node --check`.
- Two full analysis runs produce byte-identical summary and row artifacts; receipts are in [`validation/determinism.json`](validation/determinism.json). Individual TAP logs and manifest are in [`validation/`](validation/).
- Full build omitted: production source remains unchanged and this pass adds only research analysis, fixtures/evidence and tests.

From the repository root:

```powershell
node scripts/ant-field-writer-reader-failure-attribution.js `
  docs/ant/evidence/2026-10-24-ant-field-writer-reader-failure-attribution/inputs/station-raw.json.gz `
  docs/ant/evidence/2026-10-24-ant-field-writer-reader-failure-attribution/computed/abcs-attribution.json `
  8c60e4bba3bd5b476300e90a2936bfebd1f831c2
node tests/ant-field-writer-reader-failure-attribution.test.js
node tests/pheromone-field.test.js
node tests/ant-controller.test.js
node tests/ant-trail-following.test.js
node tests/ant-gaster-deposition.test.js
node tests/ant-gaster-integration.test.js
```

Chronology: [2026-10-24 daily log](../../../daily/2026-10-24-ant-field-writer-reader-failure-attribution.md).
