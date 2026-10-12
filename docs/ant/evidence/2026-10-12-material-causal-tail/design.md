# Material locomotion causal-tail design

This design was recorded before the new causal runs. The baseline is live remote
`main`, `37131e0c408a9692ecc364ef7298a71c5e7182ad`, verified by fetch and
`git ls-remote` on 2026-10-12. The starting checkout was clean on a different
research branch; this pass starts a new branch from remote main.

## Question and scope

Does one local material influence leave measurable consequences after direct
material exposure ends, and which existing state carries those consequences?
Production code and parameters remain unchanged. Archive paths are excluded.
Current natural baseline uses the production default, material feedback On.
The earlier explicit-Off experiment is historical causal evidence, not the
current natural world.

## Primary impulse and prospective selection

- Fresh natural runs: seeds 20261005, 20261006 and 20261007, default controller,
  counted LCG, 60 Hz, 600 simulation seconds, no audio bridge.
- Three age gates per seed: 200, 350 and 500 seconds. At or after each gate,
  select the first tick with an eligible live ant at L > 0, then choose the
  lowest numeric ant ID. Selection uses current untreated state only. It does
  not require a future exit or a favorable measured effect.
- Fork the complete current state without constructors, initialization or random
  draws. Preserve prototypes, maps, arrays and shared references within a fork;
  use independent RNG closures with identical state and call count.
- Remove only the focal ant's material resistance for one tick by supplying
  `desiredSpeed / m(L)` to the existing acceleration method and updating its
  `targetSpeed` consistently. Restore its original method immediately afterward.
  All other ants receive the unchanged production multiplier.
- At the next tick, both arms use identical production law and settings. The
  direct intervention lasts exactly 1/60 s. Different future cell inputs are
  downstream consequences, not additional experimental manipulations.

This is a removal impulse inside the current On world. It measures the causal
consequence of that one tick relative to retaining its normal resistance. It is
not a continuous explicit-Off world, nor a test of every tick in a full exposure
episode.

## Measurement boundaries

Treatment end, each arm's first L = 0 boundary, and the first boundary where both
focal ants are live at L = 0 are distinct timestamps. Material reentry ends a
jointly unexposed bout. Retirement censors the focal comparison. Differences
while either arm is still exposed are not counted as unexposed tail.

Record each tick's focal position, scalar speed, velocity vector, heading,
displacement, target speed, travel and existing movement state, material count
and top identity, occupancy signals, gait/contact differences and RNG alignment.
Record colony/world differences at one-second cadence to 600 s, including
pheromone and SurfaceField cell differences, other live agents, contact payloads,
formation/material descriptors and lifecycle. Event payload differences must be
distinguished from event-count differences.

Numerical cutoff: 1e-12. Descriptive coordinate-scale cutoffs: position 1e-5,
speed/velocity 1e-5, heading 1e-4 radians, per-tick displacement 1e-7.
These are not perceptual, biological or artistic acceptance thresholds. Report
first/last differences, sample counts and uninterrupted bouts separately; a late
sample alone is not evidence of continuous persistence. Age gates and all trials
are reported, including absent exits and weak/null results. Layer count and prior
exposure duration describe selected conditions; no post hoc best subgroup is
used for the decision.

## Existing-state carrier probes

At the first jointly unexposed boundary, when available, run bounded 10 s
restarts under the same production law:

1. Full control-state restore: negative control for complete-state explanation.
2. Mobile block only: treated agents, gait/body pose/gaster state, RNG and
   lifecycle clocks with the untreated environmental block.
3. World block only: treated pheromone, SurfaceField, TrailPlateBirth,
   MaterialStratigraphy and colony activation with untreated mobile state, RNG
   and lifecycle clocks.
4. Pheromone only: treated pheromone with all remaining untreated state.

These hybrid states test whether a present state block is sufficient to generate
later differences in that restart. They do not provide additive mediation
fractions, a unique physical path, or hidden organism memory. RNG drift under
the original shared sequential stream must be dated and reported; it can amplify
total divergence and limits claims about the natural chemical path alone.

A velocity-only reset at treatment end may be used as a mechanical comparison.
It changes existing velocity only; position, gait and world consequences already
created remain. Its result cannot establish a clean environmental-only effect.

## Validity and decision

Require exact pre-intervention fork/sham alignment, same initial RNG and clock,
one focal speed call only, heading/intent equality before acceleration, exact
method restoration, complete-state replay parity, and production-source equality
to the baseline. Hash source bytes before execution and check afterward.

The final decision is SUFFICIENT CURRENTLY, AFTER-EFFECT CANDIDATE JUSTIFIED,
MIXED or INCONCLUSIVE. A new organism after-effect requires a concrete temporal
responsibility that existing complete state cannot supply. Diverged trajectories
alone never establish that responsibility. A fresh independent final review
checks validity, attribution and decision scope before commit/push. No PR,
merge, force-push or production adoption occurs.
