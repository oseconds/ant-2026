# 316 × 316 CIC fixed-cue qualification

## Decision

**MIXED / NOT QUALIFIED for movement shadow.** Gate 1 representation checks pass. The unchanged Gate 2 rules do not: E improves the global local-sign count and straight symmetry, but still has 334 local sign errors and creates 267 local errors on rows that were correct in production; family/phase checks and the S-route wide-winner count also regress. No production change or movement test follows.

The test asks whether one mathematically derived 316 × 316 four-node CIC representation, using the same frozen physical writes and queries as the qualified 96 × 96 fixture, retains the prior CIC local-cue benefit while reducing wide and zero-cue regressions. E changes only the research raster resolution. The ordinary bilinear reader and every frozen query and downstream operation remain fixed.

## Candidate and provenance

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Research branch base: `codex/ant-pheromone-representation-contract-20261024` at `c3babbf4811ebede0cc4ef5615bd08317c937664`.
- Preregistration commit: `4a504ef24f73f2f91f12293b6a5b3579efeb6195`; arithmetic correction is retained separately in [PREREGISTRATION-ERRATUM.md](./PREREGISTRATION-ERRATUM.md).
- Candidate: `N=316`, `h=1/315`, `R=0.0045`, containing-cell four-node CIC, Float32 storage, per-node cap 8 without redistribution, inherited exponential decay and ordinary bilinear reads.
- Frozen station input SHA-256: `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`.
- Prior C/D Gate 2 rows SHA-256: `550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f`.
- Frozen write streams: commit `9afcc130f23c85f34cdf64073a2c95c945c0b320`; 24 route/phase arms, 77 ordered point writes per arm.
- Production source hashes and all provenance are in `RESULTS.json`.

`C` is current production, `D` is the prior 96 × 96 CIC, and `E` is this 316 × 316 CIC. The same 5,544 station rows, 4,012 analytic-directional local rows, 5,072 strict-unique wide-winner rows, write events, analytic reference, sensor positions and operators are used for all arms. Analytic A is an engineering reference, not biological or natural-path truth.

## Gate 1 — representation validity

The support condition is `sqrt(2) / (N-1) <= R`, giving `ceil(1 + sqrt(2)/R) = 316`. For `h=1/315`, the exact bound is `0.004489566864676492`; the exhaustive deterministic `1001 × 1001` fractional-position check plus corner/edge cases found maximum positive-node distance `0.00448956686049532`, within `R` by at least `0.0000104331395` on the sampled set. Four-corner CIC preserves uncapped nodal sum and first moment within the derived Float32 storage bounds.

The 24 frozen streams contain 1,848 writes and remain uncapped. Support-node count is four for all route writes. The separate saturation case loses dose without redistribution, as specified. Inherited decay is byte-exact. The bilinear read footprint extends beyond the write radius: the fixed diagnostic lattice reached `0.0089265216` from a source, where the read value was about `1.19e-22`. This is measured, not repaired. Full Gate 1 receipts, including support, spread and cap/boundary detail, are in `gate1.json`.

## Gate 2 — fixed-cue results

| Measure | Production C | 96 CIC D | 316 CIC E |
|---|---:|---:|---:|
| Local directional sign errors / 4,012 | 552 | 0 | 334 |
| All-row local steering MAE | 0.06505354 | 0.02225486 | 0.02305853 |
| Directional-only steering MAE | 0.06313203 | 0.02879002 | 0.03185772 |
| Wide strict-unique winner errors / 5,072 | 2,378 | 2,378 | 1,017 |
| Raw local MAE | 0.01733554 | 0.01822596 | 0.01604449 |
| Raw wide MAE | 0.00344003 | 0.00355031 | 0.00362896 |

E has 1,538 wide recoveries and 177 new errors against C, reducing total wide errors by 1,361. The 92 previous D new-error rows are all correct under E; all 92 previous D recoveries stay correct. E adds 177 wide errors on rows where C and D were both correct. The candidate reduces local sign errors by 218 net, with 485 C errors corrected and 267 new local errors.

Zero-cue controls across C/D/E: on 924 straight rows, false-nonzero counts are `445 / 0 / 0`, with mean absolute steering `0.09827464 / 5.78e-16 / 0`. On 392 S-route analytic-zero rows, false-nonzero counts are `364 / 377 / 228`, with mean absolute steering `0.03539171 / 0.01789884 / 0.00005897`. E improves this S zero-cue measure versus both C and D, while its full S-route wide winner count is worse than C.

Wide errors by family, C → E: straight `0→0`, gentle `828→404`, tight `301→7`, gentle mirror `828→400`, tight mirror `301→5`, S route `120→201`. Local directional sign errors by family, C → E: straight `0→0`, gentle `152→162`, tight `39→1`, gentle mirror `152→144`, tight mirror `39→0`, S route `170→27`. By phase, E has wide errors `p00=256`, `p10=260`, `p01=250`, `p11=251`; local sign errors are `72, 88, 78, 96` respectively. Full phase, family, margin, contrast, mirror and Gate 2 check results are in `RESULTS.json` and `gate2/rows.json.gz`.

Mean within-station phase steering spread falls from `0.11702190` in C to `0.01850429` in D and `0.00033429` in E. Mean mirrored-steering residual is near machine precision for C/D (`1.17e-15 / 9.29e-16`) and rises to `0.00009662` for E (maximum `0.00189513`). The unchanged Gate 2 qualification fails its family nonregression checks for gentle, tight, tight mirror and S, and its p10 nonregression check. Global measures improve, but that does not override the preregistered per-family/phase checks.

## Prior CIC cohorts and profile switches

The source C/D census is reproduced exactly: 5,072 strict-unique rows, 2,378 errors in each arm, 92 recovered, and 92 new errors. The 26 weighted-max-first rows also match their saved identities and five-sample D profiles before E is generated: all are tight/tightMirror; D target raw argmax is outer `±1`, weighted argmax is inner `±0.5`, and target wins raw but loses weighted/final. Under E, the target raw argmax is already at `±0.5` for all 26; its weighted argmax remains there, so the former `±1 → ±0.5` switch occurs in `0/26`. E has the target raw-max candidate top in 24/26, and the target is weighted-max and final winner in 26/26; the rival's raw argmax differs from D in 24/26. E's full target/rival profiles, argmaxes and margins are in `gate2/target-profile-26.json.gz`; route/phase counts are in `RESULTS.json`.

## Interpretation and limits

E shows that the higher-resolution CIC representation can remove the 96-grid straight false-steering control, substantially reduce phase spread, recover all 92 prior CIC new-error rows, and reduce the global wide mismatch count. It does **not** retain the prior `552 → 0` local sign result: E has 334 errors and 267 new local failures relative to C. It also creates more S-route wide-winner errors and fails the required route/phase nonregression gate. This is therefore mixed evidence, not a qualified fixed-cue candidate.

The temporary node-sum dose and unchanged raw-value readers are isolation choices, not established shared physical units. The bilinear read footprint can extend beyond `R`; capped/boundary behavior does not inherit uncapped interior moment guarantees. Consumers outside these fixed cue measurements, production behavior, movement, and long-run effects are untested. No writer, reader, gain, density, movement, or production recommendation is inferred.

## Reproduction and validation

From repository root:

```powershell
node scripts/ant-cic-316-grid-qualification.js
node --test tests/ant-cic-316-grid-qualification.test.js
npm test
npm run build
```

The final qualification was regenerated twice with identical scientific artifacts. `generation-hashes.json`, `determinism.json` and `manifest.json` hold the receipts. The focused tests pass (3/3), repository tests pass (358/358), and Vite build passes. The build emits existing dependency annotation and large-chunk warnings. Production `src/` and canonical `docs/ant/README.md` are unchanged.

Next smallest step: stop here. If further work is later authorized, specify shared consumer/unit semantics before considering a separately preregistered movement shadow; do not tune another resolution or writer in this pass.
