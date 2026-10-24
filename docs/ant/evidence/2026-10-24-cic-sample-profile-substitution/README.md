# CIC sample-profile substitution — 2026-10-24

## Result

**The saved target/rival profiles are sufficient, together under the unchanged wide operator, to restore the analytic target in all 26 weighted-max-first CIC D errors.** The C-based single-vector results are mixed: replacing only the target vector restores 12/26 at weighted maximum and 16/26 at final score; replacing only the frozen D rival restores 18/26 and 20/26. Both single-vector arms overlap, and paired C replacement restores all 26. This is sample-profile sufficiency for these saved rows, not an independent causal percentage for the CIC writer, geometry, weights, or max.

The A engineering-reference arm is stronger: replacing either target or rival alone restores all 26 at weighted maximum and final score. A values are not a physically replayed field and are reported separately from the closer C counterfactual.

Gate 2 remains **MIXED / NOT QUALIFIED**. Gate 3 remains **NOT RUN**.

## Frozen protocol and provenance

The seven arms, row definitions, exact stage semantics, classification rules, and stop boundary were frozen in [PREREGISTRATION.md](./PREREGISTRATION.md) and committed before calculating substitutions as `8211c456d69a00b5d5628c448dee73276ff9a8f9`.

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Research branch: `codex/ant-cic-wide-stage-attribution-20261024`.
- Research tip at start: `fb8f0ce009a96f1f2a8aecb80078de53a0454d56`.
- CIC qualification: `1fbfec5943c41ad6c8b3828fb48c47828d9be817`.
- Reused 118-row transverse artifact SHA-256: `4d0d6da4ebdd201526d52269179c28e38531fa9d72e14318b9c8704d77a141b3`.
- Prior 5,072-row stage census SHA-256: `384e4ec7982e336db432ea98ea8006934cf6b2276ac145b9a3e84b0ae8645d25`.
- Prior 184-row focal artifact SHA-256: `d15db82408c08819956218c472192e3dffeebe084a081d8720e63b2af696291c`.
- Gate 2 rows SHA-256: `550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f`.
- Frozen station/query input SHA-256: `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`.
- Production `AntController.js` SHA-256: `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04`.
- Unchanged `evaluateWide()` helper SHA-256: `72c020cb2abb8dd42a6c56fa277ff9ef4bcbff26c949f45c994c001998779864`.

The runner also guards the current `PheromoneField.js` and `GasterDeposition.js` hashes inherited from the frozen helper. Their exact values are in [validation.json](./validation.json). No production source was changed.

## Reproduction gate

The previous census reproduced exactly before substitutions:

- 5,072 strict-unique analytic winners;
- C and D each wrong on 2,378 rows;
- 92 recovered and 92 new-error rows;
- primary cohort: 26 weighted-max-first D errors, sorted-key SHA-256 `960def8884a5fee1be4ad0872ae0e66be508388b031a28d2ac4f09bdd8f59085`;
- primary route counts: `tight=13`, `tightMirror=13`; phase counts: `p00=8`, `p10=2`, `p01=10`, `p11=6`;
- D target max-sample switch `26/26`, rival switch `0/26`, same-sample reordering `0/26`, relevant exact ties `0/26`.

Each target/rival A/C vector matched its saved source row exactly. The five physical query positions, candidate headings/order, and weights were joined to the frozen station geometry and checked for every row. D baseline values, stage orders, and final winner replayed exactly through the unchanged `evaluateWide()` helper.

## Seven arms

“Restored” means the helper's top candidate index is the frozen analytic target at that stage. Wrong count is `26 − restored`; exact top ties are listed separately and no tolerance was introduced. No arm produced a third-candidate weighted or final winner, and there were no exact top ties at raw, weighted, or final stage.

| Arm | Target wins after weighted max | Target wins after final score | Third weighted / final winners |
| --- | ---: | ---: | ---: |
| D | 0 / 26 | 0 / 26 | 0 / 0 |
| D[target←C] | 12 / 26 | 16 / 26 | 0 / 0 |
| D[rival←C] | 18 / 26 | 20 / 26 | 0 / 0 |
| D[target+rival←C] | 26 / 26 | 26 / 26 | 0 / 0 |
| D[target←A] | 26 / 26 | 26 / 26 | 0 / 0 |
| D[rival←A] | 26 / 26 | 26 / 26 | 0 / 0 |
| D[target+rival←A] | 26 / 26 | 26 / 26 | 0 / 0 |

### C versus A sufficiency patterns

| Reference vectors | Stage | Target-only restores | Rival-only restores | Both singles restore | Paired vectors restore | Joint-only rows |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| C | weighted max | 12 | 18 | 10 | 26 | 6 |
| C | final score | 16 | 20 | 12 | 26 | 2 |
| A | weighted max | 26 | 26 | 26 | 26 | 0 |
| A | final score | 26 | 26 | 26 | 26 | 0 |

For C, target-only and rival-only restoration sets overlap but neither alone covers the full cohort. All rows are covered by the pair. The two final-stage joint-only rows become target winners after score even when neither single vector does; their weighted-max outcomes remain wrong. The six weighted-stage joint-only rows require both C vectors to cross at weighted max. The detailed row classifications preserve these distinctions.

## Route and phase pattern

Every C paired restoration occurs on both route mirrors and all four phases: 13 per route; `p00=8`, `p10=2`, `p01=10`, `p11=6`.

Single C replacements are less uniform:

- Target-only weighted restorations: `tight=6`, `tightMirror=6`; phases `p00=6`, `p01=6`, none in p10/p11. At final score this becomes 8 per route and phases `p00=6`, `p10=2`, `p01=6`, `p11=2`.
- Rival-only weighted restorations: `tight=9`, `tightMirror=9`; phases `p00=8`, `p01=6`, `p11=4`, none in p10. At final score this becomes 10 per route and phases `p00=8`, `p01=8`, `p11=4`, none in p10.
- Every A single-vector restoration covers both routes and all phases at both stages.

There is no route exception to paired C restoration, but the single-vector paths depend on phase and the two profiles often complement one another. Counts are descriptive for this fixed cohort, not general phase-risk rates.

## Representative stage traces

Margins below are target minus the frozen original D rival, using the unchanged helper. Positive means the target value exceeds that rival at that stage; it is not a perceptual or biological severity scale.

| Row | D raw → weighted → final margin | C target-only weighted / final | C rival-only weighted / final | C pair weighted / final |
| --- | --- | --- | --- | --- |
| `tight|p00|0.004` | `+0.003070 → −0.000794 → −0.033877` | `−0.000353 / −0.010070` | `+0.000273 / +0.022886` | `+0.000714 / +0.047200` |
| `tight|p01|0.14` | `+0.001674 → −0.003402 → −0.174056` | `+0.001347 / +0.094695` | `−0.001098 / −0.047548` | `+0.003652 / +0.223956` |
| `tight|p10|0.004` | `+0.002301 → −0.000850 → −0.037219` | `−0.000001294 / +0.009653` | `−0.000491 / −0.017577` | `+0.000357 / +0.029721` |

The first row is rival-only C restoration. The p01 row is target-only C restoration. The p10 row is a weighted joint-only case: each single replacement remains just below the rival, while the pair makes the target top. Its target-only arm is later restored at final score, which is why final-score joint-only count is two rather than six.

Per-row raw, weighted, and final margins—including min, p10, median, p90, max summaries for every arm—are in [arm-census.json](./arm-census.json) and [substitution-rows.json.gz](./substitution-rows.json.gz). The full per-sample arrays, weights, argmax sample identities, exact stage rankings, and changed-vector audit are retained for all 26 × 7 evaluations.

## Bounded interpretation

**Supported:** on these saved 26 rows, the D target/rival profile pair is sufficient to produce the weighted-max crossing under the frozen geometry and unchanged operator; restoring both profiles from production C restores the analytic target in every row. C target-only or rival-only replacement is sufficient on overlapping subsets, not a universal one-vector explanation. A single A vector restores every row, but A remains an engineering reference.

**Not established:** this does not isolate independent responsibility among the CIC field representation, the five transverse query positions, production weights, and max. It does not show which production change would be correct, whether a field candidate should be adopted, or whether these fixed rows predict movement. No field or sensor candidate was run; no world, movement, or RNG was advanced.

The narrow next hypothesis is that the six C weighted-max joint-only rows require complementary target and rival profile shifts under the existing weights/max. A later pass, if needed, should inspect those six saved margin deltas only before selecting any writer experiment. This package itself makes no writer recommendation.

## Reproduction and validation

From the repository root:

```sh
node scripts/ant-cic-sample-profile-substitution.js
node --test tests/ant-cic-sample-profile-substitution.test.js
```

The runner reconstructs and verifies the cohort and source vectors, evaluates all seven arms through the unchanged helper, generates the scientific outputs twice, and requires byte-identical output files. No RNG call exists in the tooling. Validation details are in [validation.json](./validation.json); output SHA-256 values and input receipts are in [manifest.json](./manifest.json) and [determinism.json](./determinism.json).
