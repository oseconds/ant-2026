# CIC transverse-sample diagnosis — 2026-10-24

## Decision

**ARGMAX-SWITCH DOMINATED within the 26 saved weighted-max-first rows.** All 26 retain the analytic target at D's unweighted raw-maximum diagnostic, then lose it at the existing production weighted-maximum stage. In every row, the D target candidate's max-contributing transverse sample changes; the D weighted-rival candidate's max sample does not. No relevant exact sample-max ties occur.

This locates the first target departure in the saved calculation. It does **not** establish an independent causal contribution for CIC representation, query geometry, production weights, or max. Gate 2 remains **MIXED / NOT QUALIFIED** and Gate 3 remains **NOT RUN**.

## Frozen pipeline and interpretation

`AntController.senseTrail()` samples five transverse positions in order `[-1, -0.5, 0, 0.5, 1]`, multiplies each in-bounds field read by `1 - abs(offset) * 0.45`, and returns the maximum. The frozen attribution helper evaluates five candidate headings `[-0.92, -0.47, 0, 0.47, 0.92]`. Its unweighted raw maximum is diagnostic only; the weighted maximum is the production reduction. Existing Hill response and deterministic field-only score are retained for parity and final-winner tracing.

For all 26 primary rows, D's target raw maximum is at a low-weight outer sample (`-1` or `+1`, weight `0.55`), then its weighted maximum moves to `-0.5` or `+0.5` (weight `0.775`). The D rival's maximum is at `-0.5` or `+0.5` both before and after weighting. That relative change crosses the target/rival margin in all 26 rows. There are **0** same-sample target/rival reorders under the preregistered exact-argmax rule and **0** relevant exact ties.

| D max contributor | Raw slots `[-1,-.5,0,+.5,+1]` | Weighted slots `[-1,-.5,0,+.5,+1]` |
| --- | ---: | ---: |
| Analytic target candidate | `[13, 0, 0, 0, 13]` | `[0, 13, 0, 13, 0]` |
| D weighted-rival candidate | `[0, 13, 0, 13, 0]` | `[0, 13, 0, 13, 0]` |

Across the 26 rows, the D target-minus-rival lead is positive at raw max (min `+0.000570`, median `+0.001890`, max `+0.003070`) and negative after weighting (min `-0.003769`, median `-0.001745`, max `-0.000454`). These are engineering-reference margins, not measures of biological or perceptual severity.

### A/C/D sample-path context

For the deterministic first primary row, `tight | p00 | station 0.004`, the analytic target is offset `0`; D's weighted rival and final winner are offset `+0.47`.

| Arm | Target raw max → weighted max | Rival raw max → weighted max | Target minus rival: raw → weighted |
| --- | --- | --- | ---: |
| A | `0.061893 @ +0.5` → `0.047967 @ +0.5` | `0.030450 @ -1` → `0.016747 @ -1` | `+0.031443 → +0.031220` |
| C | `0.030403 @ +1` → `0.019655 @ +0.5` | `0.024440 @ -0.5` → `0.018941 @ -0.5` | `+0.005964 → +0.000714` |
| D | `0.028887 @ +1` → `0.019214 @ +0.5` | `0.025816 @ -0.5` → `0.020008 @ -0.5` | `+0.003070 → -0.000794` |

In this row, C also moves the target's own max from the outer sample inward, but C's weighted target remains narrowly above its rival. D's stored sample profile leaves the weighted target just below the same rival. This demonstrates a small margin crossing in the unchanged reduction, not that the weighting rule alone caused the C/D difference.

Over the primary cohort, mean raw `D − C` at the target candidate's five sample slots is `[+0.002272, -0.001841, -0.005967, -0.001841, +0.002272]`. At the D weighted-rival candidate it is `[-0.001504, +0.002994, +0.006013, +0.002994, -0.001504]`. This is an offset-dependent profile difference: it is not evidence of a uniform widening or an isolated CIC-support effect.

## Recovered comparison

The preregistered cohort rule keeps all 92 recovered rows, without post-hoc 1:1 matching:

- **14 weighted-restored:** D target is below the rival at raw max, then above it at weighted max, and remains final-correct. In 13 rows only the rival's argmax sample changes; in one both target and rival sample sets change. D target's raw/weighted max identity stays the same in 13/14 rows. Across these 14, the target-minus-rival lead moves from median `-0.000332` to `+0.001935`.
- **68 held:** D target is already top at raw max and remains top after weighted max. Target/rival argmax sets can still change (11 target, 22 rival, including 5 rows where both change), but none crosses the target lead.
- **10 score-restored:** final D is correct although the target is not top after weighted max; two have a new raw-to-weighted target loss, and the existing deterministic score restores the final target. They remain separate from the 26 final-wrong primary rows.

The weighted-restored contrast is the inverse sample path: the rival's raw max is often at an outer, lower-weight sample, then its weighted max moves inward. The unchanged weights can therefore lower that rival's winning value relative to a target whose max already lies at `±0.5`. Sample switching is not sufficient by itself for failure: the 68 held rows include many switches without target loss.

## Route and phase census

All 26 primary rows are in the paired tight fixtures: `tight` 13 and `tightMirror` 13. By phase: `p00` 8, `p10` 2, `p01` 10, `p11` 6. Each route has `p00=4`, `p10=1`, `p01=5`, `p11=3`. Thus the 26-row mechanism is concentrated in the tight/mirrored-tight route family; p11 is present but is not the largest phase subgroup. This is a descriptive count, not a phase-risk rate because the denominator of eligible rows differs by route/phase.

## Provenance and validation

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Prior attribution: branch `codex/ant-cic-wide-stage-attribution-20261024`, commit `05c855cac06dd3659abfc1502e91071980ecc00b`.
- The stage/cohort/comparator rules were committed before per-sample evaluation as `ca7ff2b8fe4d768bd72a016255e490dbb78915f0`.
- CIC qualification source: `1fbfec5943c41ad6c8b3828fb48c47828d9be817`.
- Gate 2 rows SHA-256: `550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f`.
- Frozen station rows SHA-256: `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`.
- Prior stage-census SHA-256: `384e4ec7982e336db432ea98ea8006934cf6b2276ac145b9a3e84b0ae8645d25`.
- Prior focal-row SHA-256: `d15db82408c08819956218c472192e3dffeebe084a081d8720e63b2af696291c`.
- `AntController.js` SHA-256: `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04`.
- Existing attribution helper SHA-256: `72c020cb2abb8dd42a6c56fa277ff9ef4bcbff26c949f45c994c001998779864`.
- Preregistration is in [PREREGISTRATION.md](./PREREGISTRATION.md); its SHA-256 is `45cd9b13ed1e4ce9fff01cfea09c61a32fbe5f562277909ca3a28f8767a9d99d`.
- 5,544 Gate 2 rows join exactly to 5,544 frozen station rows; the strict-unique census is 5,072. C and D each have 2,378 final mismatches, with 92 recovered and 92 new-error rows.
- All 26 primary and all 92 recovered keys were retained. A/C/D raw and weighted sample vectors matched the saved focal rows exactly: 8,850 raw values, 8,850 weighted values, and 2,950 frozen query-geometry records. Existing helper stages/orders were recomputed exactly for all 118 rows and three arms (1,416 arm-stage outputs).
- The 26 primary cohort keys hash to `960def8884a5fee1be4ad0872ae0e66be508388b031a28d2ac4f09bdd8f59085`; the 92 recovery keys hash to `3a0ff144cc714a0a25a75f64b213586301eb498d9406dc8df2b6dc886c7ff653`.
- The analysis generated twice with byte-identical outputs. Artifact hashes and the repeat receipt are in [manifest.json](./manifest.json) and [determinism.json](./determinism.json).
- Focused test: `node tests/ant-cic-transverse-sample-diagnostic.test.js` (3 tests passed). Production `src/` was not modified.

## Artifacts and reproduction

- [summary.json](./summary.json): counts, route/phase distribution, max-contributor slots, and D−C sample-profile summaries.
- [transition-census.json](./transition-census.json): primary transition census and max-contributor counts.
- [row-decomposition.json.gz](./row-decomposition.json.gz): all five physical reads, raw values, weights, weighted values, candidate max identities, margins, and A/C/D stage orders for 26 primary plus 92 recovered rows.
- [representative-traces.json](./representative-traces.json): deterministic first-row examples for each observed primary/comparator class, retaining complete A/C/D sample traces.
- [validation.json](./validation.json): input, cohort, and exact-parity receipts.
- [manifest.json](./manifest.json), [determinism.json](./determinism.json): hashes and byte-identical second-generation receipt.

From the repository root, run:

```sh
node scripts/ant-cic-transverse-sample-diagnostic.js
node tests/ant-cic-transverse-sample-diagnostic.test.js
```

## Claim boundary and smallest next hypothesis

**Supported:** the first saved target loss in these 26 rows occurs when the fixed per-sample geometry weights and max are applied; every row has a target max-sample switch from `±1` to `±0.5`, while its winning rival sample remains at `±0.5`.

**Not established:** whether the loss is independently attributable to CIC's sample profile, the five-point query geometry, or the unchanged weighting/max law; whether these fixed analytic-reference rows predict natural movement.

If a follow-up is authorized, the smallest diagnostic hypothesis is a preregistered sample-vector substitution on these same rows: hold saved geometry/weights/max fixed and substitute only the D target or rival five-sample vector with its A or C counterpart. That would test sample-profile sufficiency for the crossing, not estimate independent contribution percentages. No such substitution was run here.
