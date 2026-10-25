# Candidate G production adoption — 2026-10-25

## Decision

**ADOPT G — remote integration pending.** The user explicitly authorized production adoption after the independent readiness review. This package records the selected candidate; its integration receipt will be completed only after `origin/main` is updated and verified. It does not introduce a new representation experiment.

## Adopted production contract

- `PheromoneField` uses a `316 × 316` Float32 nodal field over normalized `[0,1]²`.
- The writer uses the existing compact Gaussian profile, `R=0.0045`, `σ=0.00225`, 15 s half-life, and point-signal cap 8. Reads remain ordinary bilinear interpolation.
- Authored point and segment requests/returns stay in source-dose units. `depositPoint()` and `depositSegment()` return the accepted in-domain request, not cap-surviving storage. The field applies the internal reference-area coefficient factor `S=3969/361 = 10.994459833795014`; `GasterDeposition.amountPerUnitDistance` remains 4.5.
- `values[i]` and `sample(x,y)` share an authored point-signal unit. It is not calibrated physical chemical mass. For uncapped interior writes, the reconstructed bilinear integral follows the legacy 96-grid reference-area convention; boundary truncation and cap loss remain exceptions.
- `nodeSum` is the native coefficient sum. Compatibility `totalMass` and `analysis.pheromoneMass` retain that meaning. `reconstructedIntegral` is the edge-weighted bilinear reference integral, shown in the ANT diagnostic as “pheromone reference integral.”

No sensor, Hill response, confidence/adherence, movement, deposition reinforcement, recruitment/activation, TrailPlateBirth, material, renderer mapping, or audio law was tuned.

## Provenance and adopted scope

- Previous production baseline and merge base: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Reviewed production-shaped G: `2df9fbfcaf6563157af0b3266b1089a9d8424c7a`.
- Validated near-stop test-contract correction: `bf804200fa1bc8d036a194f5f2f759b9d6a58fcf`.
- Final independent readiness review: `624b8fd03f89148d16ba1c7e308a323bcd60d40d`.
- Project-level decision input: [`ADVANCE ONE REPRESENTATION TO PRODUCTION-CANDIDATE REVIEW`](https://github.com/oseconds/ant-2026/blob/c45e1845bd86a5a6f1082b5c67ef6f521cd860c1/docs/ant/evidence/2026-10-25-pheromone-project-decision/README.md). The research branch was not merged wholesale.
- Candidate review evidence: [production-candidate review](../2026-10-25-g-production-candidate-review/README.md).
- Test correction evidence: [near-stop fixture validity](../2026-10-25-near-stop-fixture-validity/README.md).
- Final pre-adoption review: [G readiness review](../2026-10-25-g-final-adoption-readiness/README.md).
- Final read-only adoption review: [independent review](INDEPENDENT-REVIEW.md).
- Exact production source comparison: [`SOURCE-CONFORMANCE.json`](SOURCE-CONFORMANCE.json).
- Adoption review corrected eight reusable evidence paths for the current G default: stale 96-grid provenance, node-sum/source-dose comparisons, 96-grid debug indexing, or defaults that could overwrite frozen evidence. The affected runners are `surface-long-run-evidence.js`, `ant-deposition-evidence.js`, `ant-long-run-evidence.js`, `ant-founder-controlled-probes.js`, `ant-founder-evidence.js`, `ant-founder-visual-evidence.js`, `surface-audio-evidence.js`, and `stratigraphy-long-run-evidence.js`. They now report actual dimensions and distinguish native `nodeSum` from `reconstructedIntegral`; scripts that write frozen-history paths now default to ignored `test-results/`. Existing historical packets were not rewritten. No natural, audio, or browser runner was executed.

The reviewed production-source Git blobs are unchanged from Candidate G. The only behavior-test correction replaces the invalid stochastic near-stop count with deterministic inspection/braking/resumption contract checks and active-agent lifecycle validation. Production movement code and constants are unchanged. The final adoption review found no production blocker; it corrected a duplicate-key and missing audio-state field in the visual evidence runner before approving fast-forward.

## Inherited qualification and interpretation

The production-shaped candidate reproduced 24/24 frozen raster hashes, 99,792/99,792 local reads, and 138,600/138,600 wide reads exactly. Its saved fixed-cue result is 10/4,012 local directional sign errors, `0.013540828 rad` all-row steering MAE, `0.017008594 rad` directional MAE, and 1,415/5,072 wide winner mismatches (16/16 existing Gate 2 checks passed). Three 600 s natural runs for seeds `20261005`, `20261006`, and `20261007` matched the validated research G trajectory/event/checkpoint evidence; no cap, saturation, or movement invariant failure occurred.

These results establish implementation conformance and bounded viability, not biological correctness or better natural routes. The changed occupancy concentration and higher sensor-response range are observed characteristics. The near-stop blocker was cleared as an invalid stochastic/lifecycle fixture; its direct scheduler and braking contracts remain tested.

The short production browser run was Audio Off and had no page/console/network errors or cap hit. Rare long RAF gaps were not causally attributed to G. Audio-On and exhibition-duration reliability remain unverified deployment questions. No new natural-route or visual qualification was performed.

## Pheromone research closure and next broader question

The G representation investigation is closed. No further pheromone representation research is currently required unless a new production failure reopens the question. Historical 96-grid evidence and discarded CIC/QAKR candidates remain research history; they are not current production alternatives.

The broader ANT question to resume is natural collective-route qualification under the adopted production behavior: **do the observed concentrated occupancy patterns form temporally persistent, spatially connected routes with measurable turnover, or do they represent accumulated path reuse without a stable route network?** This follows the project decision that route persistence/turnover and movement angular-feedback limitations remain unmeasured; it is not answered by cumulative occupancy coverage. Keep movement, field, and birth laws fixed for the first read-only route characterization. No experiment was started here.

## Integration receipt

The adoption branch commit and final `origin/main` SHA will be recorded in [`VALIDATION.md`](VALIDATION.md) after remote integration. The pheromone representation is intended to close as an active research line once that integration is verified, subject to the reopen condition above.
