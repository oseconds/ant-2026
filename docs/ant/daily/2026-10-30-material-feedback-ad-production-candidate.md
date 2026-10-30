# 2026-10-30 — Material slowdown + A/D candidate integration

**Work:** Started from fresh `origin/main@15667c73e9f507bf89dea645f966bc7f58301fdc`; confirmed its only difference from behavioral pin `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785` is deployment/build infrastructure. Reused the exact production-only 10% slowdown control from `2414d1a9b580296c9c38d4fb796904525a843b78`; rejected a nearby control with slowdown Off.

**Implementation:** On `codex/ant-material-feedback-ad-production-candidate-20261030`, added the registered `qA(L)` turn ceiling and `hD(L)` same-flow headway to one shared tick-entry layer-count sample. Existing slowdown placement and value remain unchanged. No residence or other feedback was added.

**Measurement:** One matched 20261005 / G / 60 Hz / 600 s candidate run. A changed 427,177 of 442,962 material turn calls. D changed 21,694 of 40,418 material-exposed same-flow final-target calls after slowdown. All three consumer accounting checks passed. Candidate run had no recorded finite/cap/collision/population/field/time assertions and no exact-zero movement ticks. Total blocked frames were +13.2%, retained as a congestion caution. At 600 s, travel was −0.09%, feet −0.04%, Plate births 37 vs 36, and buried layer-cells +4.91% relative to control.

**Interpretation:** **PRODUCTION-CANDIDATE SUPPORTED; direct A and D responsibilities DISTINCT.** This supports only a separate viewing/adoption decision; one seed is not a stability or artistic claim. `L` remains the tested candidate input, not the final material ontology.

**Evidence:** [`REPORT.md`](../evidence/2026-10-30-material-feedback-ad-production-candidate/REPORT.md). Candidate source/evidence only; no production adoption, README status change, PR, or merge.
