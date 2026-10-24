# Preregistration — 316-grid Gaussian dose-unit qualification

Date: 2026-10-24 KST. This protocol is committed before calculating any Candidate G cue outcome.

## Question and decision boundary

Test whether the residual fixed-cue failures of F are materially attributable to retaining an unscaled legacy node-sum dose at 316 resolution. Candidate G changes only the requested amount of each frozen point write by the geometry-derived grid-area ratio. The existing Gate 2 evaluator and qualification checks remain authoritative. This is fixed-cue evidence only; it does not authorize movement testing or production adoption.

## Baseline and provenance

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- F evidence commit / branch point: `fcd450885d91b6b1aaec50cf0e9086a1e225e9d1` on `codex/ant-316-gaussian-fixed-cue-qualification-20261024`.
- Prior 316 CIC E evidence: `4a23ca73d13cd64e7e1afa6604d5b83d7f8dad57`.
- Representation-contract evidence tip: `c3babbf4811ebede0cc4ef5615bd08317c937664`.
- Reuse exactly the six routes, four phases, 231 stations per route-phase, 5,544 rows, 24 ordered write streams and 77 point writes per stream.
- Frozen station/query SHA-256: `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`.
- Existing C/D/E rows SHA-256: `29bd7367719f5cbc2efab376bcca9b84b349ed965f72ffa86afd81904bf63ad4`.
- Existing F Gate 2 rows SHA-256: recorded in F `generation-hashes.json` and rechecked before G.
- Existing F protocol and production source hashes are pinned by F `validation.json` and are rechecked before G.

`A` is the frozen continuous analytic engineering reference. `C` is current 96×96 production; `D` is 96×96 CIC; `E` is 316×316 CIC; `F` is 316×316 production Gaussian under the unscaled legacy node-sum convention. None is biological or natural-path ground truth.

## Candidate G — fixed unit conversion

Keep F's grid, production Gaussian writer and ordinary bilinear reader unchanged. For every frozen requested write amount `A`, request:

```text
scale = (h96 / h316)^2
      = ((1/95) / (1/315))^2
      = (315/95)^2
      = 3969/361
G amount = A × scale
```

The numeric factor is fixed by grid geometry before inspecting any G cue output. Do not tune or approximate it. The write positions, order, `R=0.0045`, `σ=R/2`, physical-distance weights, `distance <= R` support, normalization, Float32 storage, cap 8, no redistribution, decay, queries and all sensor/scoring operators remain unchanged.

The intended interior identity is `h316² × Σ(G nodes) = h96² × Σ(legacy requested node-sum dose)`, up to derived Float32 accumulation error. This is an interior bilinear-integral relation; edge and corner hat areas are smaller. It does not establish a final chemical-mass unit or global boundary conservation.

## Stage order and cap stop

1. Verify input/source hashes and reproduce saved C/D/E/F rasters, raw queries, sensor stages, metrics and cohort identities before creating or inspecting G cue outputs.
2. Generate F and G rasters from the same ordered writes. Before any cue query is evaluated, audit every G write and all 24 route-phase arms.
3. Treat any post-write G node value `>= 8` as a cap hit. Record scaled requested/accepted dose, actual stored node sum, cap-hit count, saturation loss, first capped write and affected arms. If any cap hit occurs, write the audit receipt and stop with `INCONCLUSIVE — SATURATION`; do not calculate Gate 2 outcomes.
4. Only if all arms remain uncapped, verify unchanged support and normalized per-write proportions, F-to-G raster scaling within derived Float32 accumulation bounds, interior integral relation, inherited decay, determinism and RNG neutrality. Then evaluate the unchanged fixed-cue rows.

## Gate 2 — unchanged qualification authority

Use the exact saved 5,544 physical rows and query geometry. Reconstruct C/D/E/F from pinned inputs and compare them exactly to saved artifacts. Evaluate G through the same production local/wide methods and the unchanged `evaluateCueGate` rules used by F.

Report C/D/E/F/G for:

- local steering sign errors / 4,012 directional rows;
- all-row and directional-only steering MAE;
- mean within-station phase steering spread;
- wide winner errors / 5,072 strict-unique analytic winners;
- straight and S analytic-zero false-nonzero counts and mean absolute steering;
- every existing route-family and phase nonregression check.

Also retain the fixed D 26-row weighted-max-first cohort and F's residual local/wide failure identities. Report changes in raw order, signs and transverse argmax identities rather than assuming positive scaling preserves them under Float32 accumulation and nonlinear downstream response.

No metric tradeoff may override a failed existing Gate 2 check. A passed suite is `QUALIFIED FOR LATER MOVEMENT SHADOW`; mixed improvement with a failed check is `MIXED / NOT QUALIFIED`; no relevant improvement is `NEGATIVE`. Any cap hit or unverified input is `INCONCLUSIVE` under the stop rules above.

## Stop boundary

Do not alter the factor, geometry, support, sigma, cap, reader, sensor, Hill response, gain, movement, birth law, material, renderer or audio. Do not run movement or a natural simulation. Do not implement another candidate. If Gate 2 does not qualify G, record why geometric interior-integral scaling was insufficient and stop.
