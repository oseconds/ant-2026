# Preregistration — G adherence-reinforcement ablation

## Frozen question and boundary

This research-only natural replay tests whether the existing adherence-based deposition reinforcement contributes causally to Candidate G's repeated cumulative occupancy concentration. The intervention removes that source term only. It does not propose a production deposition law or infer that the current law is wrong.

The primary comparison is intact **G** against **G-R0**. The G dose scale, 316×316 Gaussian field, reader, all sensing and movement, recruitment, gait, collision, SurfaceField, Plate and material behavior remain fixed. `src/` and `docs/ant/README.md` remain unchanged.

## Arms and exact intervention

G uses the qualified Candidate G configuration: 316×316 production-Gaussian representation, `R=0.0045`, `σ=0.00225`, ordinary bilinear reader, dose scale `S=3969/361`, current decay, cap, and current production behavior including reinforcement gain 5.

G-R0 is identical except that immediately after normal controller initialization, before the first simulation tick, `state.pheromone.reinforcementGain` is set from 5 to exactly 0. The baseline multiplier remains `0.5 × (0.75 + 0.25 × E)`. No amount, scale, field, sensor, response, movement, recruitment, or material parameter changes. The zero gain is a source-term ablation, not a replacement candidate.

## Natural replay protocol

- Seeds: `20261005`, `20261006`, `20261007`.
- Duration: 600 simulated seconds, 60 fixed ticks per second.
- Checkpoints: 30, 60, 120, 300, and 600 seconds.
- Natural initialization and recruitment; empty initial field; no warm-up, route injection, forced birth, or manual placement; Audio Off.
- Same-seed pairing establishes identical initial conditions only. Divergent field-dependent trajectories and RNG streams after the intervention are expected.
- Reuse the existing fixed 64×64 occupancy measures and existing 40-bin E/A/A²/far-response histograms. The descriptive high-adherence range remains `A ≥ 0.75`.
- No C rerun is required for the causal pair. Existing C measurements may be cited as context only.

## Outcomes and interpretation

Primary occupancy measures, reported at every checkpoint and per seed without a combined score:

- cumulative coverage;
- cumulative top-10% occupancy share;
- recent 30-second coverage;
- recent 30-second normalized occupancy entropy.

Report movement/population, source-dose components, E/A/A²/far Hill response, field concentration/cap/saturation, FOOT_CONTACT, SurfaceField, and Plate/material state as secondary descriptive outcomes. Check that occupancy changes do not coincide with population or locomotion collapse.

Source accounting is by actual movement chunk before deferred dab emission. For each chunk, use observed travel, local strength E, and post-intention adherence A. Compute baseline and reinforcement components from the pinned source law and reconcile their sum to the amount-per-distance passed to the existing deposition accumulator. G-R0 reinforcement requested dose must be exactly zero. Report actual scaled G-R0 input and the same-trajectory normalized view (`/S`) separately; do not compensate missing dose.

## Validity checks frozen before outcomes

1. Verify source/config hashes and parent evidence manifests.
2. Reproduce each prior G run against the movement-shadow summary, raw gzip, and five checkpoint maps before accepting G-R0 comparisons.
3. For each seed, compare initialized controller/world state after normalizing only the declared gain field; agents, field, surface, RNG state/calls, lifecycle counters, and all other settings must match. Record the sole config difference explicitly.
4. Verify G-R0 gain is zero, baseline expression is unchanged, representation and writer remain G-identical, observer-on/off state and RNG parity holds, and observer RNG calls are zero.
5. Verify chunk-source accounting closes against the effective rate supplied to `GasterDeposition.advance`; report any deferred dab carry separately. Verify finite state, movement invariants, field limits, cap touches, saturation loss, decay, and deterministic regeneration.

Failure of parent G reproduction, intervention isolation, observer parity, source closure, or deterministic regeneration makes the causal result **INCONCLUSIVE**; do not reinterpret partial data.

## Decision boundary

- **REINFORCEMENT CAUSAL CONTRIBUTION SUPPORTED** if manipulation checks pass and G-R0 consistently shifts the primary cumulative concentration pattern away from intact G across the three seed-level trajectories, without that shift being explained by population or locomotion collapse.
- **REINFORCEMENT NOT SUFFICIENT TO EXPLAIN CONCENTRATION** if the pattern remains substantially present after the ablation.
- **MIXED** if seed effects conflict or any apparent broadening accompanies major behavioral/population collapse that prevents clean interpretation.
- **INCONCLUSIVE** if a validity check fails.

No numerical acceptance threshold or scalar concentration score will be added after observing results.

## Claim limit and stop

G-R0 necessarily removes a large dose component. A change can show that the intact reinforcement path contributes to G's closed-loop concentration outcome, but cannot distinguish adherence dependence from the sheer additional pheromone quantity. No dose-matched or intermediate-gain arm is included. Stop after this pair; do not tune or adopt a production change.

## Provenance at preregistration

- Fresh main expected and rechecked before this pass: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Branch point: `a4bed839b2775e774e075324c176213ccbae6dae` (`codex/ant-g-deposition-source-decomposition-20261025`).
- Prior movement-shadow evidence: `docs/ant/evidence/2026-10-24-ant-316-gaussian-dose-unit-movement-shadow/`.
- Prior source-decomposition evidence: `docs/ant/evidence/2026-10-25-ant-g-deposition-source-decomposition/`.
- Production law in the checked source: baseline `0.5 × (0.75 + 0.25 × E)`, reinforcement `5 × A²`, amount per distance `4.5`, G scale `3969/361`.
