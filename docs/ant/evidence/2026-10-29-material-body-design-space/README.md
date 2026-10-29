# Fixed-scope material BODY design space — 2026-10-29

**Research-only exploration. SCOPE / EVENT / COMMIT are fixed; no production adoption.**

Working recommendation: **simple connected structural sleeve, one existing whole-Plate material tuple, one declared whole-layer thickness convention, shared source footprint with derived solver/render views, then post-commit geology**. Local history does not have to become visible geometry.

Two distinctions matter more than adding styles:

- Structural union and a cohesive sheet spanning its gaps are different body meanings. A new lamina countermodel H makes that choice inspectable without pretending its fill was environmentally deposited.
- Current metric thickness is geological metadata, not the Plate solver's mass/bending input. A two-layer thickness-only fixture changes depth while leaving the full compiled topology identical.

Main `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; parent `2c5b0be686bec5eab854b33cd3a473bea2cf908e`; branch `codex/ant-material-body-design-space-20261029`.

- [BODY map / families / pruning / working architecture / next closed pass](REPORT.md)
- [Before-results plan and bounded amendment](PLAN.md) · [source/evidence register](SOURCES.md)
- [Structure atlas: P/K/X/H](structure-atlas.png) · [history atlas: U/W/S](history-atlas.png)
- [Exact analysis](analysis.json) · [frozen input](data/frozen-body-inputs.json.gz)
- [Validation](VALIDATION.md) · [independent review](independent-review.md) · [daily](../../daily/2026-10-29-material-body-design-space.md)

P/K/Q/W/U/S are reused unchanged from prior evidence. New X, a continuous-edge sleeve at the same `.012` radius, is source-grid identical to K in both cases; no radius was changed to force a difference. New H is a convex lamina countermodel, not a technical survivor or preferred body. No H compiler/audio qualification was performed. Atlases are fixed-fill diagnostic footprints, not production renderer or artistic judgments.
