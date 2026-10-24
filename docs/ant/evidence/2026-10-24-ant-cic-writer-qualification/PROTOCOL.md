# Preregistration: one CIC writer, three separate qualification gates

Date: 2026-10-24 KST. Fresh production baseline: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.

This protocol is frozen before running the candidate on the target assays. It is a new test of a specified conservation contract, not retrospective acceptance or reopening of any earlier CIC gate. The previous writer-information-loss result (`5f1b182`) motivates this question; the failed QAKR reader (`64923f4`) remains failed. The author has inspected the previous outcomes but has not evaluated the new candidate's target outcomes.

## Intervention and invariants

Exactly one four-node tensor-product barycentric/CIC writer replaces the research subclass's `depositBrush`. For in-domain `(x,y)`, let `gx=x*(width-1)`, `gy=y*(height-1)`, `i=floor(gx)`, `j=floor(gy)`, `tx=gx-i`, `ty=gy-j`. Deposit requested amount A with weights `(1-tx)*(1-ty)`, `tx*(1-ty)`, `(1-tx)*ty`, `tx*ty` at the containing cell's four nodes. Nodes at x/y=1 collapse through zero weights, not redistribution. Fixed row-major update order; no renormalization, residual repair, adaptive radius or gain. Zero weights are skipped.

The candidate inherits production validation, in-domain point acceptance, segment clipping/integration, Float32 storage, node cap 8, bilinear reads and exponential decay. The radius argument remains validated but no longer determines this writer's footprint. Support changes from the narrow compact brush/nearest-node impulse to the containing cell's 1–4 nodes; maximum Euclidean write-to-node distance is sqrt(2)*grid pitch in the square default grid. This changes second moments, peak concentration and downstream nonlinear contrast. It is not full chemical equivalence.

No production file is edited. Gaster dab generation, amount per traveled distance, event order, RNG, movement, recruitment, field resolution, decay, maximum storage, material/history, audio and renderer remain unchanged. `depositSegment` shares the overridden brush; inherited segment support is tested as an API boundary, but point/dab fixtures do not qualify continuous-mode world behavior.

## Gate 1 — dose and first moment only

**Question:** Does the declared CIC write preserve requested/accepted mass and physical first spatial moment when clipping/saturation do not remove it, within derived arithmetic error?

- Reuse the prior 64x64 midpoint lattice around node (48,48), four half-cell phases p00/p10/p01/p11, on a 96x96 field. Independently test A in `{0.000001,0.027,1}`: 49,152 isolated point writes.
- Add exact corners, exact edges at subcell fractions, integer nodes and the existing binary-valued 5x5 fixture. Outside points are no-ops. Zero dose is a no-op; invalid input validation is retained.
- Replay all 24 existing 77-write route/phase streams in order, cap 8, no decay. Reproduce all original production rasters byte-for-byte before accepting candidate comparisons. Check each candidate arm actually remains uncapped.
- First test nonnegative weights, sum and physical x/y moment in Float64 with a `64*Number.EPSILON` relative arithmetic allowance. This is a numerical identity check, not a behavioral tolerance.
- Separately measure actual Float32 mass, raw x/y moments and centroid. With `u32=2^-24` and `alpha=2^-150`, each unsaturated store has bound `u32*abs(before+contribution)+alpha`. Sum per-node bounds over updates, plus a separately stated Float64 contribution/accumulation allowance. Mass bound is the sum of node error budgets. Raw x/y moment bounds weight each node budget by its coordinate. Derive centroid bounds by division by the positive measured mass, including mass residual; do not compare a distance directly with a mass budget.
- Record cap-stress writes separately. Accepted return amount retains production meaning (requested amount, not actual stored increment). Per-node cap loss is not redistributed. Capped mass/moment conservation is explicitly not promised. In-domain edge writes need no outside nodes and should preserve moment; rejected outside points preserve no requested dose.
- Record unchanged-reader/sample/decay method identity and a clipped segment smoke test. No RNG calls are added.

**Pass:** all stated uncapped identities/bounds and boundary/API checks pass; all 24 current-writer replay hashes match; no cap enters the target route suite. This establishes conservation only. Failure stops the pass before fixed-cue qualification.

## Gate 2 — fixed cue improvement only

**Question:** Under unchanged production readers/operators, does CIC improve the complete controlled cue suite without hiding a route-family or phase regression?

Inputs are the individually pinned replay-backed fixture `9afcc13` and the frozen 5,544 station rows `ea3d382` (`station-raw.json.gz` SHA-256 `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`). Six paths: straight/gentle/tight/gentleMirror/tightMirror/sCurve; four phases; 231 fixed stations per arm. Reuse exactly the same 77 point writes, positions, dose and order. No decay, cap activity, gaster/body shift, query retiming or route rescaling is introduced.

Reference A is the already-frozen continuous compact-Gaussian analytic cue; it is an engineering comparison model, not biological truth or the exact chemical law the broader CIC footprint promises to reproduce. C is the original production raster with its production bilinear reader. D is the CIC raster with that same reader. Reuse `localStages` and `evaluateWide` from the exact attribution helper; additionally cross-check the local/wide sensor reads against real production `AntController` methods where the frozen geometry permits it. Verify row keys, all original raw C queries, local output and wide scores/winner parity before evaluating D.

Primary denominators are frozen: 4,012 analytic directional local rows, all 5,544 local steering rows, and 5,072 strict-unique analytic wide winners. Production preflight must reproduce local sign errors 552 and wide winner mismatches 2,378. Precision sign/near-zero classification keeps the previous `64*Number.EPSILON*max(1,abs(value))` rule. Strict-unique/tie and deterministic lower-index winner rules retain the saved definition. Do not use this epsilon as a permissive MAE/noninferiority threshold.

**Advancement gate (all required):**

1. Global local sign-error count strictly decreases **and** mean absolute steering error against A strictly decreases.
2. Global wide final-winner mismatch count does not increase.
3. Each of the six route families pooled across phases, and each of the four phases pooled across families, has no increase in any of those three primary measures. Arithmetic comparisons are deterministic and direct. All 24 individual arms are still reported, including regressions.
4. Straight's 924 zero-cue rows and the S path's 392 analytic-zero rows separately show no increase in mean absolute false steering or precision-nonzero false-steering count.

Report raw-sample MAE, peak/support/mass, local strength/coherence/balance, winner margins, new errors vs recoveries, ties/ambiguities, all phases/families, and original/candidate symmetry contrasts separately. A smoother image, lower raw field MAE, better centroid, or an aggregate gain cannot substitute for the gate. A failed conservative gate is MIXED/NOT QUALIFIED if some measures improve, not proof of no effect.

This is a cue gate, not a movement experiment. There is no ant integration, population, reinforcement loop, gait or material response in this stage.

## Gate 3 — movement improvement, conditional and separately preregistered

Only if Gates 1 and 2 pass, freeze a movement protocol before any movement outcome is evaluated. It must preserve the production movement law and change only the writer; first use the existing deposited straight/mirrored/S controls, then multi-seed natural runs of at least 600 model seconds if the controls qualify. Track realized postcollision trajectories, alternating vs sustained turn, path-following error/progress, lifecycle/RNG divergence, field changes, collective reuse and unchanged material consequences. No feedback-law combination or recruitment change is allowed.

Gate 1 PASS and Gate 2 PASS do not imply Gate 3 PASS. If Gate 2 fails, Gate 3 is **NOT RUN**, with no movement-improvement, production-candidate or exhibition-readiness claim. No headed Chrome soak is earned by a conservation or fixed-cue result alone.

## Publication and stop

One candidate, no post-result weight/gain/grid/radius search or second kernel. Save raw deterministic comparisons and receipts, repeat outputs, inspect diagnostic artifacts, run relevant/full tests and build, obtain fresh independent final review, and record all three statuses separately. Commit/push only validated research files on `codex/ant-cic-writer-qualification-20261024`; no PR, merge, force-push or main adoption. Preserve unrelated captures/worktrees. Canonical production README stays unchanged.
