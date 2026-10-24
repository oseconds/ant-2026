# Preregistration — 316 × 316 production-Gaussian fixed-cue qualification

Date: 2026-10-24 KST. This protocol is committed before computing any F-arm fixed-cue outcome.

## Question and decision boundary

Test one research-only representation: the existing production compact Gaussian deposit and unchanged bilinear reader on a `316 × 316` grid. Ask whether this keeps more of the 96-grid production cue behavior while avoiding the fixed-cue tradeoffs observed for 316 CIC. This does not adopt a production field or authorize movement testing.

The existing Gate 2 qualification helper is the authority without edits. It requires all three global comparisons to improve or nonregress as specified, every family and phase to nonregress on local sign errors, all-row local steering MAE and wide winner errors, and both straight and S-route analytic-zero controls to nonregress. No measure is weighted against another and no threshold is added. Gate 3 remains out of scope regardless of result.

## Baseline and frozen inputs

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Research branch point: `codex/ant-cic-316-grid-fixed-cue-qualification-20261024` at `4a23ca73d13cd64e7e1afa6604d5b83d7f8dad57`.
- Representation-contract evidence: `c3babbf4811ebede0cc4ef5615bd08317c937664`.
- Production writer source hash, `src/lib/agents/ant/PheromoneField.js`: `412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd`.
- Controller and deposition source hashes are pinned in the reused qualification receipt and rechecked before evaluation.
- Reuse exactly the six established routes, four phases, 231 stations per route-phase, 5,544 row identities, 24 write streams, 77 ordered point writes per stream, and every saved physical query coordinate and amount.
- Frozen station input SHA-256: `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`.
- Existing C/D/E rows SHA-256: `29bd7367719f5cbc2efab376bcca9b84b349ed965f72ffa86afd81904bf63ad4`.
- Existing production C/D comparison rows SHA-256: `550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f`.
- Existing ordered write streams SHA-256: `c2a15990f33d7b43e7e4761cd80b10a47eab0baec98b1dcced76f47b85cdc0ee`.

The existing saved C, D and E values are controls. Reconstruct them from the frozen inputs before reading F outcomes. C is current 96-grid production, D is 96-grid CIC, E is 316-grid CIC. A remains the frozen analytic engineering reference, not natural or biological truth.

## Candidate F — exact temporary contract

Instantiate the existing production `PheromoneField` at width and height 316. Do not subclass or reimplement its brush. The unchanged `depositPoint` / `depositBrush` formula sets `h=1/315`, `R=0.0045`, `σ=R/2=0.00225`, physical node distance, support `distance <= R`, weights `exp(-distance²/(2σ²))`, normalization over included nodes, nonnegative Float32 storage and node cap 8 without loss redistribution. Existing exponential decay and ordinary bilinear `sample()` stay inherited.

Use the same legacy temporary convention as the fixed-cue studies: accepted/requested dose is the sum of uncapped nodal increments; cap numeric value and raw downstream values stay unchanged. No density conversion, reader aperture, smoothing, gain, threshold or sensor adjustment is applied. This is not a final chemical-mass definition; a refined grid changes the continuous integral represented by the unchanged node-sum convention.

Only the grid resolution changes between C and F. No segment subdivision is involved: all frozen events are ordered point writes. Do not regenerate routes or writes.

## Gate 1 — representation characterization before cue outcomes

1. Verify production source hashes and frozen-input hashes, row keys, C raw queries, saved D/E raw queries, C/D/E sensor outputs, 5,072 strict-unique winners, prior 92/92 cohort membership and 26 target-profile identities before constructing F.
2. Independently calculate the production Gaussian node weights for deterministic point fixtures; compare every expected included node and Float32 result against the inherited production implementation. The equations above define the test; no fitted parameter is allowed.
3. Scan a deterministic `1001 × 1001` subcell-position lattice in one interior cell, plus exact/near corners and edges. Record active-node count, whether any supported-node set is empty (the production nearest-node fallback condition), maximum source-to-active-node distance, dose and stored-mass residual, centroid error, second-moment tensor, source sample, peak and peak offset.
4. Record reconstructed bilinear nonzero support on a fixed query lattice. R constrains write nodes only; do not impose a threshold or repair read tails.
5. Reuse the representation-contract orthogonal-pair counterexample at cell `(48,48)` on the 96 grid: two equal half-dose point writes at opposite endpoints of a segment of length `0.5/95`, centered at `(48.5/95,48.5/95)`. Add the same-center/same-length `+45°` and `−45°` orientations. Compare exact raster identity, support identity, mass, centroid, second-moment orientation and pairwise raster L1 distance for C, D, E and F. Geometry is fixed in physical coordinates across all arms.
6. Measure one-point dose/cap behavior separately with unsaturated and partially saturated nodes; do not claim uncapped mass/moment bounds at saturation or clipped domain boundaries. Verify inherited reader/decay methods and zero RNG use.

Gate 1 reports characterization rather than optimizing for a cue outcome. Stop before Gate 2 if source/input integrity, deterministic replay, finite nonnegative storage, or exact production Gaussian formula parity fails.

## Gate 2 — frozen fixed-cue comparison

Use unchanged `PheromoneField.sample()`, frozen local and wide physical queries, `localStages`, `evaluateWide`, and the existing `evaluateCueGate` implementation. The primary comparison is C versus F. Report C/D/E/F globally and by six route families and four phases:

- local sign errors on 4,012 nonzero-reference-direction rows;
- all-row and directional-only local steering MAE;
- mean within-station phase steering spread;
- straight analytic-zero false-nonzero count and mean absolute steering;
- S-route analytic-zero false-nonzero count and mean absolute steering;
- strict-unique wide winner errors on 5,072 rows;
- raw local/wide errors, per-arm primary metrics and all existing Gate 2 checks.

Track frozen identity cohorts: prior C→D 92 recovered and 92 new wide errors; prior 26 weighted-max-first profile crossings; E-specific 267 local sign errors and 177 wide errors against C. For the 26 rows retain C/D/E/F target and rival five-sample profiles, raw/weighted argmax samples, target/rival margins and final winner. For the 267/177 E-specific rows, report which remain errors under F and which F restores. These are diagnostics and do not override the Gate 2 rule.

No new attribution chain, candidate, score, threshold or intervention is introduced. A failed Gate 2 is `MIXED / NOT QUALIFIED` when some preregistered measures improve and others regress; otherwise report `NEGATIVE`. If integrity cannot be established, report `INCONCLUSIVE`.

## Determinism, validation and stop

Regenerate Gate 1 and C/D/E/F rows twice from the same frozen inputs and compare scientific artifact hashes. Add focused tests for Gaussian formula parity, support/fallback, dose and cap semantics, raster/segment statistics, unchanged query geometry, fixed sensor reconstruction and deterministic RNG-neutral replay. Run focused tests, full repository tests and build. Verify production `src/` and canonical `docs/ant/README.md` remain unchanged.

Stop after fixed-cue qualification. Do not change radius, sigma, resolution, units, reader, sensors, response, movement, materials, selector, renderer or audio. Gate 3 is not run. If the result changes the architecture decision materially, obtain a fresh independent review before finalizing the claim.
