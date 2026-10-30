# 2026-10-30 — Material feedback surface vs accumulated depth

- **Question:** Are registered immediate turn-maneuverability A and same-flow headway D adequately conditioned by exposed material presence, or does accumulated `layerCountByCell` add direct response beyond the first layer?
- **Baseline:** current-G/H0, seed `20261005`, 60 Hz, 600 s; frozen N and AD-L reused. One AD-S natural run; production slowdown and chemical residence Off.
- **Implementation fact:** existing `MaterialStratigraphy` exposes top-layer presence and layer count. AD-S used existing `S` and paired same-state `L` shadows; no production behavior changed.
- **Measurement:** L=1 conformed exactly (A 44,253 and D 46,984 checks, zero mismatches). `L>1` covered 89.6% of A material calls and 90.9% of D finite same-flow opportunities. The depth shadow produced further turn-cap/heading changes and more changed D targets at L>1.
- **Research interpretation:** `DEPTH-SENSITIVE` for this registered A+D law pair. Surface presence preserves the first-layer effect but not the additional depth gradient. This does not establish physical or artistic correctness.
- **World context:** AD-S remained within run invariants, but late geography and material differences are single-seed endogenous descriptions, not paired treatment effects. Max-D/X stayed observer-only.
- **Correction:** preserved two tick-1 observer assertion failures and the initial postprocessing mismatch. Corrected analysis-only handling, preserved the prior generated analysis, and reran from frozen artifacts exactly; no treatment replay followed the successful run.
- **Decision boundary:** no adoption, new material state, residence, additional seed, audio, UPDATE, BODY, or production change. Before residence composition, decide whether A and D independently intend an immediate depth gradient or should read only the exposed interface.

Full measurements and receipts: [`REPORT.md`](../evidence/2026-10-30-material-feedback-surface-vs-depth/REPORT.md) and [`VALIDATION.md`](../evidence/2026-10-30-material-feedback-surface-vs-depth/VALIDATION.md).
