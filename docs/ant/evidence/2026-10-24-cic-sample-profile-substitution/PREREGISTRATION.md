# CIC sample-profile substitution — preregistration

## Frozen question

For the 26 saved Gate 2 rows where CIC arm D keeps the analytic final target at the unweighted raw-maximum stage but first loses it at the unchanged production weighted-maximum stage, test whether replacing only the target and/or rival candidate's five saved raw values is sufficient to restore the target under the same saved geometry and unchanged wide helper.

This is a saved-row substitution diagnostic. A and C values are engineering-reference and production counterfactual inputs; neither replacement is a physically replayed field. The result cannot assign independent causal percentages to the CIC representation, transverse geometry, weighting, or max operator.

## Baseline, frozen inputs, and provenance

- Production baseline: `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Current research branch at start: `codex/ant-cic-wide-stage-attribution-20261024`, tip `fb8f0ce009a96f1f2a8aecb80078de53a0454d56`.
- Reused transverse diagnostic: `docs/ant/evidence/2026-10-24-cic-transverse-sample-diagnostic/row-decomposition.json.gz`; its manifest is verified before use.
- Reused prior stage attribution: `docs/ant/evidence/2026-10-24-cic-wide-stage-attribution/`.
- CIC Gate 2 qualification: `1fbfec5943c41ad6c8b3828fb48c47828d9be817`.
- Production `senseTrail()` and `evaluateWide()` remain unchanged. No field is regenerated and no world is advanced.

## Cohort and frozen candidate identities

Reconstruct the primary cohort by its saved identity and stage rule, then require exact equality with the 26 keys in the previous transverse diagnostic and its previously reported row-key hash. The row order follows the saved artifact's source input indices.

- **Target:** the row's saved analytic strict-unique final winner, represented by `targetIndex`.
- **Rival:** the row's saved D weighted-maximum rival, represented by `weightedRivalIndex`. Verify it is also the saved D final wrong winner (`finalRivalIndex`); if any row does not satisfy this, preserve both identities and report that row without redefining the frozen rival.
- Candidate indices, headings, five transverse query positions, and their weights are read from the saved source geometry and are immutable in every arm.

## Interventions

For each row, deep-copy all five D raw sample vectors. Replace exactly the named candidate vector with the same candidate's complete five-value vector from the indicated saved source arm. Keep all other D vectors, saved query coordinates/identities, offsets, weights, candidate order, and score helper unchanged.

Evaluate these seven arms in this order:

1. `D` — unchanged saved D values, replayed through `evaluateWide()`.
2. `D[target←C]`.
3. `D[rival←C]`.
4. `D[target+rival←C]`.
5. `D[target←A]`.
6. `D[rival←A]`.
7. `D[target+rival←A]`.

The A/C substitutions must byte/numerically match the five-value source vectors stored for the same row and candidate. No reader, field resampling, or extra interpolation is permitted.

## Frozen stages and reported outcomes

Use the existing helper only:

`five raw values → raw maximum (diagnostic) → saved production per-sample weights → weighted maximum → existing Hill response → existing deterministic field-only score`.

For every row/arm retain:

- all five vectors and a changed-vector audit;
- raw, weighted, and final score winner/order;
- target and frozen-rival exact argmax sample-index sets before/after weighting;
- target-minus-original-D-rival margins at raw maximum, weighted maximum, and final field-only score;
- whether a top candidate other than both target and frozen D rival appears at weighted or final stage.

Count target weighted-winner and final-winner restorations separately. Report wrong outcomes, exact ties using the existing exact-order semantics, third-candidate winners, and route/phase distributions. Do not introduce a near-tie threshold or a success percentage threshold.

## Interpretation rules

Use the row-level and arm-level counts before naming a pattern. For C and A separately, describe target-only, rival-only, and joint sufficiency only when the corresponding unchanged-helper weighted/final target outcome occurs. If both single substitutions can restore a row, report the overlap. A joint-only row requires that neither matching single-vector substitution restores the target at that same stage but the paired substitution does. Preserve rows where weighted and final outcomes differ or a third candidate wins as mixed cases.

C is the primary production-reference counterfactual. A is reported separately as an analytic engineering-reference contrast. Do not combine their restoration counts. Do not infer that a successful vector substitution selects a production writer fix.

## Validation and stop boundary

Before substitutions, reproduce exactly: the 26 primary row keys and prior identity hash; target raw-top and weighted-loss membership; target sample switch `26/26`; rival sample switch `0/26`; same-sample reorder `0/26`; route/phase membership; and no relevant exact max ties. Also verify the previous strict-unique context (`5,072`, C/D final mismatches `2,378` each, `92` recovered and `92` new errors, with the primary `26` contained in the new-error cohort).

For every intervention, assert that only declared five-value vector(s) differ; source vectors equal the saved A/C values; untouched D vectors, all geometry and weights remain unchanged; D baseline replay equals saved D stages/winner exactly; and all arms are evaluated by unchanged `evaluateWide()`. Run generation twice and require byte-identical scientific outputs, excluding no fields except explicitly documented run-time metadata.

No writer, reader, sensor, weighting, reduction, movement, recruitment, material, or audio candidate will be tested. Gate 2 remains **MIXED / NOT QUALIFIED** and Gate 3 remains **NOT RUN**.
