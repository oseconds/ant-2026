# CIC wide failure stage attribution

**Result: MIXED stage localization, with new errors appearing before or at the unchanged weighted-max stage.** This read-only pass decomposes the saved CIC Gate 2 rows. It changes no field, sensor, movement, or qualification rule.

## Question and boundary

The CIC fixed-cue result kept the same global strict-unique wide mismatch count as production, `2,378 / 5,072`, but replaced 92 production failures with 92 new failures. This pass locates the first visible divergence in the saved wide pipeline. It does not establish natural-route or biological correctness; analytic A remains an engineering reference.

The arms use the same frozen geometry and the already saved raw reads:

- **A:** frozen analytic-reference raw reads.
- **C:** production raw reads and saved output.
- **D:** CIC raw reads and saved output.

The production raw reader, CIC writer, frozen query positions, and wide operators are unchanged. Analysis reuses `evaluateWide()` from `scripts/ant-field-writer-reader-failure-attribution.js` and verifies every saved raw value and stage output exactly.

## Provenance

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- CIC qualification tip and this branch's base: `1fbfec5943c41ad6c8b3828fb48c47828d9be817`.
- Qualification merge base with main: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`; qualification is two commits ahead of main (`54f7bac`, `1fbfec5`).
- Gate 2 rows: 5,544, SHA-256 `550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f`.
- Frozen station rows: 5,544, SHA-256 `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`.
- The frozen production query/attribution input traces to writer/reader attribution commit `ea3d382c6c849df7505e1d398cef085ca271c8b9`; the analytic route definition traces to commit `2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa`, script blob `d401a3ffacbb79f25e85cf53043c4c95e0e04791`, SHA-256 `1a9ba25d6e128a67c3795f6cb1b97bf1ee3e62ee38c8d71d893141ccce9fea2e`. These provenance receipts are also present in the CIC qualification raster-fixture manifest.
- Protocol: [PREREGISTRATION.md](./PREREGISTRATION.md) preserves route, phase, and station identity. The generated row keys use the exact saved numeric station value, not a renumbered index.

Current production-source hashes matched the prior frozen helper guards:

| Source | SHA-256 |
| --- | --- |
| `src/lib/agents/ant/AntController.js` | `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04` |
| `src/lib/agents/ant/PheromoneField.js` | `412798ea9276888bf5bbb28130ae319d970d36f411d6f066e48cff1b478c4afd` |
| `src/lib/agents/ant/GasterDeposition.js` | `0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41` |

The exact helper, qualification, and CIC research-writer hashes are recorded in [summary.json](./summary.json). Production `src/` is unchanged.

## Pipeline and attribution rule

`AntController.senseTrail()` reads five transverse positions for a candidate heading, multiplies each value by its geometry weight (`1 - abs(offset) * 0.45`), and returns their maximum. The frozen Gate 2 helper evaluates five candidate headings and retains these stages:

1. **Raw maximum:** unweighted maximum over each candidate's five reads. This is a diagnostic stage; production does not make a decision from it.
2. **Weighted maximum:** apply the saved production weights to the five reads, then take the per-candidate maximum. This is the production wide-sensor reduction.
3. **Hill response:** monotone response with half-saturation `0.035` and exponent `3`.
4. **Field-only score:** `2.8 × response` plus `(cos(candidateOffset) - 1) × confidence × 0.55`; stable candidate-index ordering resolves exact ties.

The helper's field-only score is not the complete stochastic controller choice: crowding, adherence, exploration, RNG, and agent integration are outside this fixed-cue dataset.

For each stage, the census preserves values, candidate order, top margin, and whether the final A winner remains top. “First rank divergence” means the first stage where the complete C or D ordering differs from A at that same stage. “First target departure” means the first stage where the final A winner is no longer top. These are locations in saved calculations, not causal interventions.

## Full strict-unique census

| Outcome across C and D | Rows |
| --- | ---: |
| Both correct | 2,602 |
| Both wrong | 2,286 |
| C wrong, D correct (recovered) | 92 |
| C correct, D wrong (new error) | 92 |

Thus both arms have `2,378 / 5,072` final mismatches, with zero exact or precision-near final score ties. The 472 excluded analytic rows are exact ties and also precision-near ties under the qualification's existing sign rule; the saved strict-unique flags agree on every row.

There are zero exact top-value ties between the leading two candidates in A, C, or D at any of the four recorded stages across these 5,072 rows. This is exact equality only; no new near-tie threshold was introduced. Per-row stage margins remain in the census.

Across all 5,072 rows, the first full-rank divergence from A was:

| Arm | Raw maximum | Weighted maximum | Hill response | Field-only score | No divergence |
| --- | ---: | ---: | ---: | ---: | ---: |
| C | 3,900 | 453 | 0 | 0 | 719 |
| D | 4,805 | 3 | 0 | 0 | 264 |

The final A winner first ceased to be top at:

| Arm | Raw maximum | Weighted maximum | Hill response | Field-only score | Never left top |
| --- | ---: | ---: | ---: | ---: | ---: |
| C | 2,207 | 1,000 | 0 | 0 | 1,865 |
| D | 1,971 | 927 | 0 | 0 | 2,174 |

Hill response does not change candidate order relative to weighted maxima in this helper. The deterministic score does change within-arm ordering in many rows, but it is not the first cross-arm divergence from A in this census. The focal transitions below show that scoring can still restore some rows.

## Focal 92-row transitions

The full raw and weighted five-sample arrays, stage values, candidate orders, margins, and row keys for all 184 focal rows are in [focal-rows.json.gz](./focal-rows.json.gz). Compact stage records for all 5,072 rows are in [stage-census.json.gz](./stage-census.json.gz). Sorted row-key membership SHA-256 values are `3a0ff144cc714a0a25a75f64b213586301eb498d9406dc8df2b6dc886c7ff653` (recovered) and `9eddf58b1d56309d893ddeb89340eec4899be71614b3e98f41eee98b39dc1e82` (new errors); ordered and full-cohort key hashes are in [summary.json](./summary.json).

| Cohort and arm | First full-rank divergence from A | Final A target first lost | Stage path |
| --- | ---: | ---: | --- |
| Recovered rows, C | raw 66; weighted 26 | raw 57; weighted 35 | C ends wrong on all 92 |
| Recovered rows, D | raw 84; none 8 | raw 22; weighted 2; never 68 | D ends correct on all 92 |
| New-error rows, C | raw 72; none 20 | raw 22; never 70 | C ends correct on all 92 |
| New-error rows, D | raw 92 | raw 66; weighted 26 | D stays wrong through Hill and score on all 92 |

C and D first have different complete orders at raw maximum in 81 recovered rows and 66 new-error rows; the remaining 11 recovered and 26 new-error rows first differ at weighted maximum. The target-departure columns are separate because a full rank change need not move A's final target out of first place.

For the 92 new errors, D's complete ranking first differs from A at the pre-weight raw-maximum diagnostic for all 92. The final analytic target is already off the top in 66 at that stage; the other 26 keep it top until the production weighted-maximum stage. No new error first appears at Hill response or field-only scoring.

Recoveries also include downstream restoration. In the recovered cohort, D keeps the target top at every stage for 68 rows, restores it at weighted maximum for 14, and restores it at final scoring for 10 (2 were top at raw maximum; 8 were not top through Hill response). Therefore scoring does not originate any of the 92 new errors, but it does restore some recovered outcomes.

The 92 new errors are not analytic score near-ties under the saved rule: their analytic final-winner margin ranges from `1.7830731866922893` to `1.7830731866924678` (median `1.7830731866923715`). This is a diagnostic margin in this helper, not a biological severity measure. Recovered rows include a lower minimum margin of `0.009615739712330412`; no new margin threshold was added.

## Route and phase differences

Each route and phase table reports the strict-unique denominator and final errors. “Net” is new errors minus recoveries.

| Route | n | C errors | D errors | Recovered | New | Net |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| straight | 848 | 0 | 0 | 0 | 0 | 0 |
| gentle | 844 | 828 | 828 | 0 | 0 | 0 |
| tight | 844 | 301 | 303 | 44 | 46 | +2 |
| gentleMirror | 844 | 828 | 828 | 0 | 0 | 0 |
| tightMirror | 844 | 301 | 303 | 44 | 46 | +2 |
| sCurve | 848 | 120 | 116 | 4 | 0 | -4 |

| Phase | n | C errors | D errors | Recovered | New | Net |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| p00 | 1,268 | 647 | 645 | 24 | 22 | -2 |
| p10 | 1,268 | 657 | 647 | 24 | 14 | -10 |
| p01 | 1,268 | 534 | 535 | 27 | 28 | +1 |
| p11 | 1,268 | 540 | 551 | 17 | 28 | +11 |

The preregistered intersections show where the phase regressions sit:

| Route / phase | n | C errors | D errors | Recovered | New | Net |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tight ∩ p01 | 211 | 45 | 46 | 13 | 14 | +1 |
| tight ∩ p11 | 211 | 47 | 54 | 7 | 14 | +7 |
| tightMirror ∩ p01 | 211 | 45 | 46 | 13 | 14 | +1 |
| tightMirror ∩ p11 | 211 | 47 | 54 | 7 | 14 | +7 |

Counts are route/phase specific. They do not establish one universal causal stage for every route.

## S analytic-zero control

This is a separate **local steering** control, not part of the 5,072-row wide-winner denominator. Among the 392 sCurve rows whose analytic local steering is zero:

| Arm | False-nonzero steering | Mean absolute steering |
| --- | ---: | ---: |
| C | 364 / 392 | `0.03539170573895819` rad |
| D | 377 / 392 | `0.017898839668476437` rad |

CIC has 13 more precision-nonzero false cues, while the mean absolute magnitude is about half. This separate control does not change the wide attribution.

## Representative traces

The frozen example rule selected the first input-order focal row for each first full-rank divergence stage; no example was selected by listening or by magnitude.

| Row | A final | C final | D final | Stage trace |
| --- | ---: | ---: | ---: | --- |
| `tight|p00|-0.014` recovered | `0` | `+0.47` | `0` | C and D first rank apart from A at raw maximum. D's target is restored only at final score. Analytic margin `1.783073186692413`. |
| `tight|p00|-0.12` recovered | `0` | `+0.47` | `0` | C's target is lost at weighted maximum; D stays on target through score. Analytic margin `1.7830731866923895`. |
| `tight|p00|-0.096` new error | `0` | `0` | `+0.47` | D is already off target at raw maximum and remains off through score. Analytic margin `1.7830731866923553`. |

Exact per-candidate stage values for these rows are in [representative-traces.json](./representative-traces.json); the corresponding five raw samples per candidate are in the focal artifact.

## Interpretation and limits

**Observed:** the 92 new D errors are localized to raw-maximum or weighted-maximum departure. All 92 show full-rank divergence before Hill and scoring; target departure splits 66 at the pre-weight diagnostic and 26 at the unchanged production weighted max. The recovery cohort has mixed paths, including weighting and score-stage restoration. Route and phase distributions also differ.

**Interpretation:** this is mixed early-stage localization, leaning toward the saved raw candidate representation as the earliest visible source of the new errors, with an additional subset first losing the analytic target under production weighting plus max. The later monotone Hill response does not reorder candidates; the field-only score can reorder or restore them, but did not first create a new D target failure. Because no arm's raw values were held fixed while an operator was changed, these are not independent causal shares.

**Not established:** whether the early divergence is attributable specifically to CIC spatial support, the analytic reference's profile, the five-point transverse geometry, or their interaction; whether any route or controller movement changes; and whether these margins matter perceptually or biologically. Gate 2 remains `MIXED / NOT QUALIFIED`; Gate 3 remains `NOT RUN`.

The smallest defensible follow-up, if needed, is a separate read-only per-sample decomposition of the 26 weighting-first new errors against matched recovered rows, reporting which transverse sample supplies each raw/weighted maximum. No writer, reader, or sensor candidate follows from this pass.

## Validation and reproduction

- Run analysis: `node scripts/ant-cic-wide-stage-attribution.js`
- Run focused tests: `node tests/ant-cic-wide-stage-attribution.test.js`
- Syntax check: `node --check scripts/ant-cic-wide-stage-attribution.js`
- [validation.json](./validation.json) records exact C/D/A parity, source hashes, 5,544 key join, strict-unique/tie counts, subgroup checks, and the separate S control.
- [determinism.json](./determinism.json) records byte-identical output hashes across two full analysis generations.
- Four focused tests pass, including two-run artifact equality and the full frozen census. `node --test tests/ant-cic-wide-stage-attribution.test.js` could not start its child process in this environment (`spawn EPERM`); direct invocation of the same Node test file passed.
- A fresh read-only independent review found no blocking attribution or provenance issue. It confirmed the distinction between full-rank divergence and loss of A's target, and did not rerun tests or regenerate outputs.
- Full suite/build, browser/world replay, and movement were not run because production/runtime sources are unchanged and those runs are outside this attribution pass.

No production decision is made in this package.
