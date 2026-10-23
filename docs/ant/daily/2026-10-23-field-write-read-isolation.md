# 2026-10-23 — Pheromone field write/read responsibility

## Question

Locate the first production-field stage that converts equivalent physical trails and queries into phase/orientation-dependent cues, and compare its contribution with bilinear reading, local/wide aggregation, and one-tick movement transfer.

## Setup

- Fresh base: `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Production source remained untouched. Default law checked: 96×96 Float32 field, 15 s half-life, cap 8, rate 4.5, radius 0.0045, dab spacing 0.006, bilinear reads; 18 local reads and five-heading/five-transverse wide sensing.
- Reused natural transfer branch `1dab083b640dbe73bc00f97a59c27568c8ba7866` for 66 frozen states, six ordered histories, four preregistered phases, and one-tick receipts. Reused controlled route branch `d0e07d089c82d29409c7dd067e17cdeb9a5ecf7f` for six shapes and mirrored/S fixtures. Both inputs were hash checked; neither branch was merged.
- Added offline writer footprint and reader/sensor decomposition harnesses, compact receipts, and focused tests.
- Kept single-node central moments exactly zero in the writer diagnostic; regenerated the summary and confirmed the detailed per-brush export is byte-identical.

## Findings

- The first measured phase-dependent difference is at deposit-to-raster write formation. At default radius, each write affects exactly one node after fallback. About 42.46% of natural p00 brushes use fallback; fallback and ordinary one-node support select the same nearest node. The shared nearest-node quantization is the relevant writer/raster mechanism.
- Strongest full-pipeline example: the translated horizontal line and queries shift from mean absolute steering `0.1976213 rad` at p00 (100% fallback) to numerical zero at p01 (14.35% fallback). This includes writer and read-query changes; the per-brush receipts separately establish the earlier writer footprint divergence.
- Fixed-raster bilinear query shifts and translated-raster residuals are comparable in raw local value magnitude. Raw additive reconstruction residual is at most `1.11e-16`; the total is smaller than the two absolute components because signed changes cancel.
- At least one local aggregate output changes in 1,178/1,205 pairs per phase; steering itself changes in 1,166–1,168 pairs. The signed read-only and raster-residual steering contrasts oppose in 81.74–84.32% of pairs. Fixed-geometry wide trail winners change in 11–16/41 fresh decisions; actual selected offsets change in 5–6/41. The evidence retains all per-candidate in-domain raw samples (988 each for p00, translated field, and fixed-raster shifted queries per phase). Seventeen events per phase also have a small candidate geometry shift after local-state changes.
- Across 1,248 one-tick agent pairs per phase, median endpoint displacement is zero; maximum is `4.39e-5` normalized units. No free-running translated-world effect is claimed.

## Decision

**MIXED / INCONCLUSIVE.** Writer/raster quantization is the earliest and clearest source. Bilinear query sensitivity and nonlinear local/wide aggregation also matter, and their movement contributions cannot be cleanly ranked in this replay. No single alternative was tested. A fixed-query sensor replay with an analytic continuous control is the next justified diagnostic before considering a field representation change.

Production remains unchanged; `docs/ant/README.md` remains authoritative for current architecture. Detailed protocol, numeric tables, classifications, test results, and limits are in the [evidence package](../evidence/2026-10-23-field-write-read-isolation/README.md).
