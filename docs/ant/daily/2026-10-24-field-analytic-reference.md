# 2026-10-24 — Pheromone analytic-reference attribution

## Start state

- Fresh production baseline: `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Work branch: `codex/ant-field-analytic-reference-20261023`.
- Reused research context only: route fixtures from `d0e07d089c82d29409c7dd067e17cdeb9a5ecf7f`; phase and write/read tooling provenance from `9e197ca3e7495a01dbcfdd0927dcbd4c974acf31`. No research branch was merged.

## Process and result

Started from six established controlled routes and four preregistered phases. Added a compact Gaussian line-dose reference over the same physical polylines, then compared its node values, bilinear reconstruction, raw local/wide reads, and the existing deterministic sensor operations on identical translated geometry. No RNG was consumed. Production `src/` and the canonical ANT README stayed unchanged.

The first difference is stored Float32 writer output. Local raw bilinear reconstruction contributes higher pooled MAE than the nodal residual (.01704 vs .01026); both matter and often cancel. The local transform has .06505 rad steering MAE and 549 opposite signs among 4,012 nonzero-reference rows. Wide max/Hill changes 2,378 of 5,072 strict-unique analytic winners after exact ties are excluded. The straight control explains the prior phase result: p00/p10 at y=.5 fall back to row 48 from an exact half-cell tie, while p01/p11 place the same physical line on row 48; p00 and p01 write byte-identical raster values but read at different phases. Mirrored curved steering remains symmetric at about `1e-15`. The S fixture has 98/231 stations per phase with no analytic local directional contrast under the frozen sensor geometry.

**Decision: MIXED.** No field alternative, movement replay, natural query validation, or free-running simulation. If another pass is requested, target only local/wide sensor responsibility on the same fixed analytic/raw queries; leave the field and movement law unchanged.

## Validation

- New analytic harness tests: 7/7 pass.
- Focused pheromone-field, trail-following, controller and deposition tests: 46/46 pass.
- Combined focused set: 53/53 pass using direct per-file Node invocation. `node --test` worker creation returned `spawn EPERM` in this environment.
- Analysis JSON, compressed station rows and replay summary reproduced byte-for-byte on a second run.
- Full build omitted because production code was untouched.

See [the evidence package](../evidence/2026-10-24-field-analytic-reference/README.md) for the reference definition, detailed measurements, provenance, limitations and receipts.
