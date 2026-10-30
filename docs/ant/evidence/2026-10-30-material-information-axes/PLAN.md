# Material information axes audit

## Question and freeze

Determine whether current ANT local material condition contains distinct information at equal public column count `L`, both across the material grid and at actual organism read locations. This is read-only. No feedback law, coefficient, formation rule, or production state changes.

Production source pin: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`. Research parent: `18fed8fbca82e8b86dfc88779cd6e11b797a2439` on `codex/ant-material-feedback-surface-vs-depth-20261030`.

Fresh remote check found live `origin/main` at `15667c73e9f507bf89dea645f966bc7f58301fdc`, two commits ahead of the requested pin. The complete delta changes only `.github/workflows/deploy.yml` and `vite.config.js`; relevant `src/` and canonical ANT guide bytes remain equal to the requested source pin.

## Source-defined families

Read source before statistics. Treat exact transforms as one family:

- `L`: public per-cell column count.
- Burial depth: public `totalDepthByCellMeters`; source sums thickness of layers above the bottom/foundation layer, so a one-layer column has depth zero.
- Top age: sample time minus top Plate birth time.
- Top geometry: `meanHalfWidth` and actual `plateThicknessMeters`; thickness is derived from width unless an explicit thickness exists.
- Top chemical birth family: `metrics.meanChemical`; stiffness and damping are deterministic clamped transforms of this same value.
- Top support birth family: `metrics.meanSupport`; density is a deterministic clamped transform of this value.
- Current compaction family: current `SurfaceField` value and center-weighted `sampleSupport` derived from that same field.
- Cumulative contact history: exact `footLoadByCell` integer counter. It increments per accepted FOOT_CONTACT at the nearest material cell and does not decay.
- Plate identity/order: provenance categories, not separate physical coefficients.

## Frozen primary history

Use existing current-G/H0 `calibration` history at `docs/ant/evidence/2026-10-30-material-organism-feedback-discovery/data/calibration/`: seed `20261005`, 60 Hz, 600 s, Audio Off, production 10% layer-count locomotion resistance On, A/D candidate shims Off, residence Off. It already passed exact raw/checkpoint parity against the frozen production run.

Its packets preserve layer-count aggregates, contact coordinates, Plate masks, and 40 late maps, but omit full Plate birth properties and per-consumer spatial material samples. Therefore one observer-only deterministic replay is permitted. It must reproduce the frozen raw/checkpoint bytes, final RNG state, layer-count histogram, turn counts, finite same-flow counts, late `SurfaceField` maps, and late material masks before analysis.

## Sampling views

1. **Material grid:** every materialized cell in the same 40 existing late analysis anchors. Do not create new time windows. Report per-anchor coverage and pooled descriptive distributions; anchors repeat the same world and are not independent samples.
2. **Organism exposure:** every material-exposed ant tick at tick entry. Record exact `L`, depth, top Plate identity/birth properties/age/thickness, current cell and interpolated SurfaceField values/support, and cumulative foot load.
3. **A context:** actual native turn calls in that same production history. Verify one A-context row per exposed ant tick. Candidate A remains Off.
4. **D context:** actual finite `followingSpeedLimit` same-flow opportunities in that history, using the native `LocalOccupancy.sense` result. Candidate D remains Off.

For A and D, preserve current SurfaceField readouts at their actual call points. L and stratigraphic values remain the tick-entry values used by production.

## Registered analysis

- Report ranges, quantiles, Pearson and exact tie-averaged Spearman relationships for `L` with burial depth, top age, top thickness, top chemical family, top support family, current SurfaceField, support, and foot load.
- Also compare burial depth, top birth families, and foot load with current SurfaceField/support.
- Preserve exact-L conditional distributions. Report the fraction of numeric variance remaining within exact L strata; label this descriptive conditional variance, not mutual information or an effect size threshold.
- Count distinct top Plate identities and complete bottom-to-top Plate ID sequences within each exact L.
- Select same-L numeric counterexamples deterministically: for each field, choose the most populous exact-L stratum with nonzero range (tie: lower L); within it choose the minimum and maximum, with row-major cell order or sample order as tie-break. Identity examples use the most populous exact-L stratum with multiple top IDs.
- Do not set an independence threshold, fit a predictor, make a latent variable, or interpret correlation as causal effect.

## Validation and stop

Check source and frozen hashes; replay exactness; A/D context counts; descriptor/formula consistency; typed-array extraction; deterministic analysis rerun; atlas/data consistency if any visual is added; evidence artifact SHA-256 manifest; `git diff --check`. No production edit, new treatment, extra seed, parameter search, or production adoption.

Decision labels: `EFFECTIVELY ONE-DIMENSIONAL`, `MULTI-AXIS`, `MIXED`, or `INCONCLUSIVE`. Any follow-up remains a single question, not an executed mapping experiment.
