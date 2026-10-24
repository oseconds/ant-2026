# Representation feasibility probe scope — 2026-10-24

This scope is written before running the new probe. It is a mathematical/engineering investigation, not a new CIC qualification or a candidate search.

## Fixed questions and inputs

- Production radius `R = 0.0045`; square nodal grid `h = 1 / (N - 1)`.
- Nonnegative *increments*, prescribed positive added amount, and physical node coordinates.
- Separate nodal write support from the support of the reconstructed bilinear readout.
- Check the convex-combination obstruction at the production grid: an exact node, an offset of one quarter pitch, and a cell center.
- Derive the uniform coverage, centroid feasibility, four-corner write support, and write-plus-read support bounds. Check the integer threshold and its immediate predecessor using fixed geometric witnesses, not a radius/resolution performance sweep.
- At the centroid threshold, check the nearest-node/axis-neighbor triangle certificate on a fixed 101 × 101 unit-cell mesh. The proof, not this finite mesh, establishes the all-position claim.
- Read one actual production single-node deposit outside its requested brush radius to distinguish write support from read support.
- Check one cap/headroom counterexample, interior/edge/corner bilinear basis integrals, and one equal-centroid perpendicular short-pair ambiguity.

Numerical assertions use `1e-12` absolute error for unit-scale geometry. Strict counterexamples use offsets `1e-4` grid pitch, away from equality. Actual Float32 storage is reported as observed; no bit-exact or floating-point conservation qualification is claimed.

## Boundaries

No new field writer or reader, no imported CIC writer, no saved cue-vector replay, no Gate 2, no sensing/scoring, no movement, no natural run, and no visual or artistic evaluation. The only production execution is isolated `PheromoneField` construction, point deposits, snapshots, and scalar samples. Derived larger grids are geometry only; the constructor limit is checked without allocating a larger field.

The probe records source hashes and deterministic outputs. It does not decide whether radius should bound node updates or the complete reconstructed signal, whether values should mean mass or density, or whether exact first moment is an authored world requirement. Those are explicit modeling choices in the report.
