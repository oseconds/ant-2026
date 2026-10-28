# Retired pheromone → choice → motor → inscription — registered plan

## Authority and provenance

- Fresh `origin/main`: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- New research branch starts directly from that commit: `codex/ant-retired-pheromone-recursive-inscription-20261028`.
- Prior changed-choice source: `58382d4075a170b4ca1c63cbd75f0b196067a13b`, `docs/ant/evidence/2026-10-28-causal-memory-responsibilities/`.
- Prior bounded motor source: `286948427acd4c524d525f9b266f74735a74badd`, `docs/ant/evidence/2026-10-28-retired-pheromone-motor-inscription/`.
- Production `src/`, canonical `docs/ant/README.md`, field parameters, behavior and lifecycle are out of scope and remain unchanged.

## Question

For one already registered residual-free wide-sensor changed-choice case, does the same `Fhat → Rhat` intervention reach realized production motor output and, only if it does, a later focal environmental inscription?

This is conditional transmission for one selected case, not an occurrence-rate estimate. No new memory, carrier, field feedback, lifecycle law, or material rule is introduced.

## Target selection — fixed before motor analysis

Population: the 284 cases in the prior 1,507 actual sampled wide choices for which the valid residual-free `Fhat` and `Rhat` selected options differ. The previous `residual-validity.json` reports that the residual-free changed-choice indices match the original removal indices exactly (zero changed indices), so the saved exact case order is preserved.

Rule: choose the earliest frozen model decision timestamp; if tied, choose the lowest numeric ant ID. Do not inspect motor effects to select or replace a case.

Selection receipt:

- target: `ant-1`, frozen packet case index `120`, wide-choice row index `62`;
- decision timestamp: `9.250000000000039 s` (the prior summary timestamp is the target tick's post-update time);
- target tick: `555`, tick-entry time `9.233333333333356 s`;
- `Fhat` selected option index `2`; `Rhat` selected option index `1`;
- prior frozen case records the same target state, actual local profile, wide sensor profiles, crowding values, random tape and production after-state.

The target is immutable for this pass. No other changed-choice case will be tried.

Pre-result source audit found that the frozen prior decision record stores only `info.frontCrowding`, the occupancy property consumed by `updateIntention`; it does not serialize separation vectors or neighbor count. The current natural prefix will reconstruct and retain the full occupancy object, compare the saved `frontCrowding` exactly, then verify full-world fork equality across conditions. No input or target change is made.

The fresh prefix reproduced the saved focal state, local profile, `frontCrowding`, all five candidate crowding values, all in-domain sensor coordinates and production read values, and the 14-value focal random tape exactly. Production wide signals were `[0, 0, 0, 0, 0.02081848503056003]`. The active third profile sample has `retired=0.020818490586324866` and `residual=-5.555764834925524e-9`; this signed reconstruction residual stays excluded, so `Fhat` differs from production by that small recorded amount at the sample. The target selection and registered conditions remain unchanged.

The first runner execution was rejected before Gate C: its validator compared 25 individual sensor reads with the five candidate headings, rather than comparing one heading per profile. It reported `INCONCLUSIVE`; no continuation ran. The raw attempt digest and failure reason are in `data/attempts/gate-audit-01.json`. The runner now deduplicates by frozen profile and stores a field hash instead of serializing the full 316×316 field. These are measurement-code corrections only; no target, threshold, input, or condition changed.

## Registered conditions

- `F`: actual production field and ordinary production sensing.
- `Fhat`: during the target decision only, wide reads use `self + alive-other + retired`; numerical residual is excluded.
- `Rhat`: during the target decision only, wide reads use `self + alive-other`; retired contribution and numerical residual are excluded.

Only the focal target's wide-sensor inputs change. Its actual full local profile, before-state, candidate headings, crowding and random tape stay fixed. Other agents and all motor, collision, gait and deposition code use the production path. No negative clamp or residual reassignment is allowed.

## Gate 0 — reconstruction and numerical sham

Before interpreting the causal pair:

1. Reconstruct the deterministic natural prefix through tick 554 at production H0/G defaults, seed `20261005`, 60 Hz, Audio Off/no bridge.
2. Compare target tick-entry state, local profile, candidate sensor positions/values, crowding and random tape against the frozen target record.
3. `F` must reproduce the production target tick, including complete focal after-state, events and RNG trace.
4. `Fhat` must reproduce the same selected option as `F`; its motor deltas must remain within the previously registered numerical-sham ceilings: position `1e-8` world units, velocity `1e-7` world units/s, heading `1e-6` rad, angular velocity `6e-5` rad/s.
5. Confirm `Fhat` versus `Rhat` reproduces selected option indices `2` versus `1` with the same input geometry and focal random tape.

Any target mismatch, F failure, Fhat choice/motor change beyond its sham, random-tape mismatch, non-finite/negative author sum, or input discrepancy stops the pass as `INCONCLUSIVE`. Do not adjust values or choose a replacement.

## Gate B — realized motor transmission

Run the target tick in the same production controller path for `F`, `Fhat`, and `Rhat`. Record per arm:

- selected option / intent heading;
- confidence and decision/commitment clocks;
- heading and angular velocity;
- velocity and target speed;
- proposed displacement before collision;
- collision scale, realized displacement, final focal position;
- random trace, focal/non-focal changes and relevant event records.

Primary comparison: `Fhat` versus `Rhat`, with `F` versus `Fhat` as numerical sham. A selected-option difference without realized heading, velocity, displacement or position difference is a bounded negative for this selected case; stop without trying another case. Confidence/clock-only changes do not open Gate C.

For a reproducible motor-positive decision, at least one realized measure must exceed both its fixed numerical floor and the same-measure observed `F`–`Fhat` sham: position/displacement `1e-8` world units, velocity `1e-7` world units/s, heading `1e-6` rad, or angular velocity `6e-5` rad/s. A choice or confidence/clock change alone does not qualify.

## Gate C — inscription continuation, conditional on positive Gate B

Before running any condition fork, inspect the selected target's natural tick-entry gait phase and current `GasterDeposition` accumulator against production source cadence. Then register one fixed bounded horizon before reading any fork output.

### Pre-result cadence check and registered bound

After replaying the natural prefix through target tick-entry, but before running any `F`/`Fhat`/`Rhat` condition fork, the target state was:

- `ant-1` at `(0.4500566801584844, 0.767018271856259)` with velocity `(0.056583905934762514, 0.06497736414002837)`.
- Gait phase `0.4705428568382892`, stride length `0.03548223646491765`; next half-cycle boundary is `0.0010452053192447537` travel away.
- Production dab mode, spacing `0.006`; accumulated gaster distance `0.0003538772548891207`, leaving `0.005646122745110879` to the next dab, with pending amount `0.0005992661931880892`.

The next gait boundary is within roughly one ordinary tick of current travel; the next dab is roughly four ordinary ticks away. Therefore amend the provisional 120-tick ceiling to a **fixed maximum of 30 ticks (0.5 s)**. Stop once each arm has produced its first focal `FOOT_CONTACT` and first actual stored pheromone dab, or at tick 30, whichever comes first; apply the registered censoring rules at every tick. This is the minimum short bound that leaves room for both outputs if the changed movement slightly delays either event. Do not extend it after seeing results.

Record the focal path and event/contact/deposit timestamps, coordinates, accepted dose and changed stored nodes. Do not extend the horizon to find a positive result.

At each continuation tick, compare RNG state/call alignment, agent scheduling, collision context, and world events. If a non-focal schedule/RNG divergence or independent collision context intervenes before the focal inscription, censor that link as `motor positive / inscription inconclusive`. Do not attribute descendant divergence to a particular mediator without direct evidence.

## Stop and interpretation boundary

- `SUPPORTED — bounded recursive re-inscription`: the registered choice difference reaches realized motor output and then a valid focal inscription before any censoring event.
- `PARTIAL — motor transmission only`: motor output differs, but no clean inscription is observed within the registered opportunity/horizon.
- `BOUNDED NEGATIVE`: the choice differs but realized motor output does not.
- `INCONCLUSIVE`: any reconstruction, sham, random, numeric, or causal-fork gate fails.

No additional seeds/cases/horizons, joint local+wide removal, tuning, carrier, material/chemistry law, lifecycle/admission law, Plate geometry or audio. After the result, recommend exactly one next research priority; do not execute it.

## Post-result verification-only addition

The first valid run established differing focal `FOOT_CONTACT` events, but its receipt did not directly measure whether those events changed the production `SurfaceField`. Before finalizing, add read-only wrappers around the existing `relax` and `applyFootContact` calls to hash the common post-relax field and each target contact's actual before/after field write. Check accepted contact-point counts against `totalFootContacts` and require changed field nodes for the target contact. Wrappers call the original methods once and do not alter their inputs, outputs, schedule, RNG, or state. This is an evidence verification added after the motor/contact result, not a new condition or selection step; the target, intervention, thresholds, and 30-tick ceiling remain fixed. The earlier valid receipt is preserved at `data/attempts/valid-run-before-surface-receipt.json`.

Independent review then found that the first result label was broader than the registered continuation receipt: actual `FOOT_CONTACT` / `SurfaceField` writes were observed before censor, but neither arm reached a stored pheromone dab. The final status now names only the measured motor-to-contact-to-`SurfaceField` path. It does not claim that the longer recursive return or stored-dab endpoint was completed. The earlier result and validation hashes are preserved in `data/attempts/valid-run-before-review-correction.json`.
