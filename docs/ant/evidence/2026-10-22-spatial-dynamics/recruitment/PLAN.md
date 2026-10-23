# Actual outgoing-flow recruitment: preregistered gate and policy

## Question and boundary

Does completed, post-collision local outward travel provide enough support at real recruitment events to justify one bounded flow-conditioned heading comparison against isotropic recruitment? This is a research gate, not a production adoption or a claim about biological roles, destination seeking, procession, or milling.

If tested, this adds only one world-evidence-to-recruitment link under the future-world contract: no destination, global reward, or authored route is introduced (`docs/ant/world-model.md`).

The prior recruitment survey (commit `046b21c`, `2026-10-22-recruitment-founder-survey`) selected pheromone conditioning for its finite comparison and left actual outgoing flow deferred. Its 13.3–15.7% screen sampled 1 Hz velocity snapshots with approximate midpoints. That screen is not an all-tick measurement and does not waive this gate. Keep its flow cutoffs fixed; measure actual movement segments here.

## Input and fixed rule

For each completed controller tick, use at most one segment per ant, `{id, from, to}`, from actual observed post-collision displacement. `to` is the controller's observed segment end, including its clipped in-domain end for an exiting ant. Recompute movement from these endpoints; do not substitute velocity or intended displacement.

With spawn origin `o=(0.5, 0.72)`, segment midpoint `m=(from+to)/2`, and displacement `d=to-from`, a segment is eligible only if:

- `0.018 < |m-o| <= 0.085`
- `|d| / dt >= 0.008` world units per second
- `(m-o) dot d > 0`

Each eligible ant contributes one equal-weight unit direction, regardless of distance:

`q = (1/N) sum(d_i/|d_i|)`, `R = |q|`, `phi = atan2(q_y, q_x)`.

The declared gate is unchanged: `N < 3` or `R <= 1e-9` means invalid flow with `q=(0,0)` and isotropic heading. The ring, speed, count, and resultant cutoffs are engineering rules, not biological thresholds. The pure helper is `scripts/ant-spatial-recruitment.js`; it reads only supplied segments and consumes no randomness.

At an accepted heading draw `U`, use the existing draw exactly once:

- Invalid flow: `theta = -pi + 2*pi*U` (exact matched isotropic null).
- Valid flow: `w = pi - (pi - 0.3)*R`; `theta = wrap(phi + (2*U - 1)*w)`.

Do not add RNG calls or remap the accepted spawn position. Flow changes only the heading assigned to a successful recruit. Invalid ticks do not retain prior flow or add temporal smoothing.

## Timing contract

Capture every 1/60-second tick's completed movement after collision scaling, before the controller's end-of-tick recruitment call. The spawn scheduled at that boundary reads that same tick's completed segments, so the flow policy has no tick lag. This is an explicit new choice: the prior survey's chemical rules read the previous completed tick, and the earlier deferred flow proposal described previous-tick segments. Do not conflate these clocks.

The initialization founder is created before any completed movement exists. Production baseline keeps its existing north-centered first heading; isotropic and flow arms use the exact isotropic null for this one spawn. Later flow-policy spawns use the current completed-tick flow, with invalid flow again falling back isotropically. Record the initialization founder separately from post-init accepted-spawn opportunities.

## Locked availability gate

First run only unchanged production baseline for seeds `20261005`, `20261006`, and `20261007`, each for 600 simulated seconds at fixed `dt=1/60`. Record flow on all 36,000 completed ticks per seed and separately at every successful post-init accepted spawn, using the current-tick result. Do not infer all-tick support from 1 Hz samples, velocity, or accepted-spawn timestamps alone.

Proceed to a candidate run only if at least two of the three seeds each have:

- At least 10 post-init accepted spawns with valid flow.

This is a predeclared engineering exposure floor, not statistical power or a biological threshold. If fewer than two seeds meet it, stop this candidate without lowering `N`, changing ring/speed/resultant gates, changing timing, or selecting another input after seeing the result. Report all-tick and accepted-spawn support separately, with counts, denominators, fractions, invalid-flow reasons, and the initial-spawn exception. At accepted spawns also report `R` and the exact applied half-spread `w`; a sparse or weakly concentrated exposure limits interpretation but does not create a post-hoc pass/fail threshold.

## If the gate passes

Run only the direct-flow heading arm and its matched isotropic null for the same three seeds and 600 seconds. Use fresh natural controllers. Preserve the accepted position disk, placement retries/clearance, scalar activation and population limits, spawn cadence, lifecycle, movement/occupancy/gait, pheromone deposition, contacts, material selector/history, and renderer. The unchanged production baseline is a reference from the availability run; do not add another conditioned mechanism or tune a parameter.

The causal intervention is the heading law at successful recruitment. Use the existing one-draw heading slot and same seed, but do not claim that later random streams or spawn event times remain paired after movement histories diverge. The observer must consume no RNG and must not change controller behavior.

Report continuous per-second spatial and movement traces plus applied-flow/spawn timing: centroid, covariance/dispersion, heading occupancy, polarization, angular momentum, speed, exits, population, accepted spawn count/time/position/heading, `N`, `q`, `R`, `phi`, exact heading half-spread, and invalid reason. Preserve all-tick flow availability in candidate arms. Compare time series and predeclared fixed windows; do not create mode counts, choose favorable intervals, or label a continuous shift a biological regime. Inspect material only after a clear live movement difference; any retention/compression belongs to the unchanged selector/history downstream.

Direct flow tests a distinct signed transport signal beyond removing the fixed-north reference. It does not establish that the policy is useful, socially organized, or artistically sufficient. A positive finite comparison still needs independent review and a separate adoption decision.
