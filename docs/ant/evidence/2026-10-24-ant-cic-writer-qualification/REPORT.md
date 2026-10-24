# CIC writer qualification — decisions and claim boundaries

## Baseline and intervention

Fresh main is `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`; the new branch is `codex/ant-cic-writer-qualification-20261024`. Production `src/`, `static/`, canonical ANT README and all world laws are unchanged. The existing primary worktree was reused; unrelated captures and the separate worktree were preserved.

**IMPLEMENTATION FACT.** `scripts/ant-cic-writer.js` is a research-only subclass. Its only override distributes one write over the containing cell's four barycentric nodes, with fixed order, no renormalization or residual correction, and the existing per-node cap. Validation, point acceptance, segment integration/clipping, bilinear reads and decay are inherited. Radius remains validated but no longer controls the new brush footprint. No RNG is consumed. No startup mode is installed.

**Manipulation validity.** Positions, requested amounts and ordered dab events are identical across the original and candidate replays. Default grid/cap, no-decay controlled conditions and all physical sensor query coordinates are fixed. The candidate changes footprint, peak, second moments and nonlinear contrast; it is not chemically equivalent to the compact production brush. No lifecycle, RNG stream, recruitment timing, contact, material or natural history divergence is measured because no world is advanced. A future free-running writer intervention would legitimately diverge those histories; shared seeds would not imply all-time parity.

## Preregistration and gate separation

The protocol was committed at `54f7bac` before target outcomes. Its SHA-256 is `6a4aadc894ec5175b0ba1111e5e2b82e9b81c6c9aeb8d6f5e9b16541f26eb7ca`. There was exactly one candidate and no search. Previous CIC gates remain unchanged; this tests a newly defined conservation contract against the pinned suite.

| Stage | Decision | What this establishes |
| --- | --- | --- |
| 1. Dose / physical first moments / centroid | PASS | Uncapped numerical conservation in the stated assays and derived arithmetic bounds |
| 2. Fixed cue improvement | MIXED / NOT QUALIFIED | Strong local-cue improvement, but the complete preregistered nonregression gate fails |
| 3. Movement improvement | NOT RUN | No movement improvement, world feedback, material or exhibition claim |

## Gate 1 — conservation only

**CONTROLLED WRITER RESULT.** The corrected assay covers 49,152 independent writes: 64x64 midpoint positions within one grid-pitch square, four half-cell phases and three fixed doses. Every write starts from zero and individually checks mass, x/y physical raw moments and centroid. All pass. The 24 ordered route arms contain 1,848 fixed writes; all original production raster bytes are reproduced and no candidate target arm reaches cap 8.

Maximum measured absolute residuals across the point and route suite:

| Quantity | Maximum absolute residual |
| --- | ---: |
| Stored mass | 9.7097543339e-9 |
| Raw x first moment | 5.0332681356e-9 |
| Raw y first moment | 4.9168058514e-9 |
| x centroid | 1.2386450199e-9 |
| y centroid | 8.6302265334e-10 |

Every residual is inside its per-case bound. These quantities have different units and are not interchangeable. The budget sums each Float32 store bound `2^-24 * abs(before + contribution) + 2^-150`, includes a separate Float64 arithmetic guard and derives the centroid bound from moment and mass bounds plus quotient rounding. It does not claim bit-exact stored dose. The binary-valued fixture is exact, while the general default-grid assay uses these derived bounds.

Exact edges/corners, outside rejection, zero dose, inherited API validation and a clipped-segment smoke test pass. The brush is shared with segment mode, but this point/dab qualification does not establish continuous-mode world behavior.

**Cap boundary.** In the explicit partially saturated four-node test, return/accepted-request amount is 1, actual stored increment is approximately 0.7600002289 and calculated cap loss is 0.2399997711. Neighbours receive their original shares; no lost amount is redistributed. Moment conservation under active saturation is not claimed. No natural saturation consequences were measured.

**Harness correction.** Parent inspection rejected the first lattice implementation, which accumulated writes at different grid nodes and captured route budget inputs after the store. Its output remains under an explicitly invalid filename and [erratum](gate1/ERRATUM.md); its PASS is not evidence. The corrected assay follows the original protocol. A negative-control test temporarily substitutes the production brush and verifies that the moment gate detects violations, then restores the candidate. Neither the candidate formula nor protocol thresholds changed.

## Gate 2 — fixed cue only

**CONTROLLED FIXED-CUE RESULT.** All 24 stored input rasters and all original raw queries replay exactly. The fixed suite is six route shapes, four phases and 231 stations per arm (5,544 rows). Local and wide sensor aggregations are cross-checked against the real production methods with frozen values and physical geometry. The wide comparison is the inherited deterministic cue-scoring context; it is not a complete natural decision with crowding, adherence, random exploration or agent integration.

Analytic A is the pre-existing continuous compact-Gaussian engineering reference. Current C and CIC D both use the unchanged production bilinear reader and operators. This is not a proof that A is the correct authored chemical model.

| Measure | Production C | CIC D | Denominator |
| --- | ---: | ---: | --- |
| Local directional sign errors | 552 | 0 | 4,012 analytic directional rows |
| Local steering MAE, all rows (rad) | 0.065053540 | 0.022254856 | 5,544 rows including analytic zero |
| Local steering MAE, directional only (rad) | 0.063132031 | 0.028790022 | 4,012 rows; descriptive, not an added gate |
| Wide final winner mismatches | 2,378 | 2,378 | 5,072 strict-unique analytic winners |
| Straight precision-nonzero false steering | 445 | 0 | 924 analytic-zero rows |
| S precision-nonzero false steering | 364 | 377 | 392 analytic-zero rows |
| S zero-cue mean absolute steering (rad) | 0.035391706 | 0.017898840 | Same 392 rows |

The local benefit is not only smaller magnitude: all 552 directional sign errors recover with no new directional sign errors under the frozen precision rule. Straight false steering falls to numerical zero (mean absolute 5.78e-16 rad). Mean local phase spread falls from 0.117022 to 0.018504 rad across the same 1,386 shape/station groups. These are fixed cue results, not movement or artistic results.

The full advancement gate fails in five named checks:

- Tight and mirrored-tight wide errors each increase 301 to 303 (other primary measures improve).
- Phase p01 wide errors increase 534 to 535; p11 increases 540 to 551.
- S analytic-zero false-steering **count** increases 364 to 377 even though its magnitude decreases.

Wide errors have 92 recoveries and 92 new errors. The unchanged global count therefore hides changed responsibility. All 92 new errors have a strict-unique analytic score margin of approximately 1.783073, so these are not floating-point near-ties in the reference. Margin is descriptive, not an added gate or proof of natural decision importance. Individual row outputs, all 24 arm measures, winner margins/ties, contrast and support statistics remain in the raw artifact and `RESULTS.json`.

**Interpretation boundary.** The candidate retains more first-moment information and helps local directional transfer, but spreads dose more broadly. Lower coherence/strength and changed false-cue support are observed; the current experiment does not independently attribute each wide failure to footprint, max sensing, Hill response or scoring. Raw-sample MAE actually rises slightly, illustrating that field-value similarity, local sign fidelity and wide decisions are separate outcomes. No scalar “better field” score is formed.

The all-row steering denominator differs from the earlier QAKR report's directional-only baseline. Both denominators are stated explicitly. After the first candidate run, descriptive directional-MAE/tie/margin reporting was added to clarify this distinction; the candidate, raw comparisons, frozen primary measures and gate rules were not changed. Final outputs were regenerated and repeated byte-for-byte.

## Gate 3 — movement not run

The predeclared fixed-cue guard failed, so no ant tick, controlled trajectory, natural 600-second candidate, long-run comparison or ANT headed Chrome run was performed. There is no claim that the candidate improves or worsens natural movement. Material/selector, recruitment, persistence and audio were not reopened. No feedback/writer combination was attempted.

## Disposition and next boundary

**RESEARCH-SUPPORTED INTERPRETATION:** local writer-phase artifacts are avoidable under this conservation formulation, but conservation alone does not qualify the full cue pipeline. **NOT QUALIFIED:** this CIC writer as a production or exhibition law under the frozen advancement contract. **OPEN HYPOTHESIS:** whether the local benefit would survive natural feedback, and whether the remaining wide/zero-cue tradeoff reflects a different desired chemical representation. Those were not tested.

No second writer, gain/radius tuning or automatic movement escalation follows. If work continues, first decide the representation/acceptance contract around compact support, moment fidelity and zero-cue shoulders using these saved failures. An optional read-only stage attribution on the saved CIC wide rows could locate residual operator errors without changing the writer; it would be a separately stated follow-up, not a relaxation of this gate. Production adoption remains a separate decision.

## Verification and reproduction

Five scientific artifacts match exactly across two full executions; wall timing is separately excluded. Input/helper Git blobs, SHA-256 values and source guards are recorded in `validation/reused-inputs.json`; protocol/output hashes are in the preregistration and reproduction receipts. Tests include exact barycentric values, cap/boundary/API behaviour, positive/negative moment controls, full current-raster/sensor preflight and gate logic that rejects aggregate gains hiding regressions. Full suite, build and fresh independent review are linked from the package README.

Static diagnostic plots are cue comparisons. Technical inspection is not human artistic acceptance and is not browser-world/runtime validation. No PR, merge or force-push is authorized in this pass.
