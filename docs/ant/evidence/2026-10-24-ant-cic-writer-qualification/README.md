# One CIC writer — three-stage qualification

**Gate 1 PASS — dose/centroid conservation only. Gate 2 MIXED / NOT QUALIFIED — fixed cue. Gate 3 NOT RUN — movement.** No production or exhibition candidate is adopted.

The preregistration was committed as `54f7bac` before target evaluation on branch `codex/ant-cic-writer-qualification-20261024`, based on freshly fetched main `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. It specifies one four-node barycentric/CIC writer. This is a new contract and frozen-fixture test; earlier CIC results are not retrospectively accepted.

- [Preregistration](PROTOCOL.md) · [initial implementation plan](PLAN.md) · [preregistration receipt](validation/preregistration.json)
- [Decisions, manipulation validity and limits](REPORT.md)
- [Gate 1 full scientific data](gate1/gate1.json.gz) · [invalid first harness output erratum](gate1/ERRATUM.md)
- [Gate 2 report](gate2/REPORT.md) · [all results/strata](RESULTS.json) · [per-row data](gate2/rows.json.gz)
- [Fixed-scale steering comparison PNG](gate2/steering-comparison.png) · [SVG](gate2/steering-comparison.svg) — analytic/current/CIC local cues, not trajectories
- [Exact reused inputs and source provenance](validation/reused-inputs.json) · [preflight](validation/preflight.json) · [byte-identical reproduction](validation/reproduction.json)
- [Full tests](validation/full-tests.txt) · [build](validation/build.txt) · [independent review](validation/independent-review.md)

## Main outcome

The writer preserves the declared uncapped dose and physical first moments within the derived Float32/Float64 bounds. Across the fixed cue suite, directional local sign errors fall from 552 to 0 out of 4,012, and all-row steering MAE falls from 0.065054 to 0.022255 rad. However, wide winner errors stay at 2,378/5,072 with 92 recoveries and 92 new errors. Tight/mirrored-tight and two phase cohorts regress. S analytic-zero precision-nonzero false cues increase from 364 to 377/392, despite their lower average magnitude. Those preregistered guards fail; movement is not evaluated.

This result supports a local-cue benefit and rejects advancement of this single writer under the full fixed-cue contract. It is neither a claim of no effect nor a movement improvement. No gain, support, grid, reader, feedback law or second writer was tuned after the outcome.

## Reproduction

Run from the repository root with the existing Node dependencies installed:

```powershell
node scripts/ant-cic-writer-qualification.js
node --experimental-test-isolation=none --test tests/ant-cic-writer.test.js tests/ant-cic-writer-moments.test.js tests/ant-cic-writer-qualification.test.js
npm test
npm run build
```

The runner verifies the protocol hash, individually pinned inputs, all three production-source hashes, original 24 raster bytes, 5,544 frozen rows and real production sensor methods before accepting candidate comparisons. It executes Gate 1 before Gate 2 and never executes movement. The five scientific outputs in `validation/reproduction.json` match across repeated complete runs; Gate 1 wall timing is stored separately and excluded from byte determinism. `gate2/rasters/` contains all 24 candidate rasters.

The existing analytic A cue is a fixed engineering reference. It is not biological truth, the natural world, or a requirement that CIC retain the original compact brush's full transfer function. The candidate intentionally changes support and second moments; only the stated conservation contract is claimed.
