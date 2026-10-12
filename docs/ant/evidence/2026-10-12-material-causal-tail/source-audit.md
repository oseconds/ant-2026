# Source and design audit

Baseline: `37131e0c408a9692ecc364ef7298a71c5e7182ad`.
The source audit used GPT-6 Luna High for controller/state coupling; the separate
design critique used GPT-6 Luna Max for intervention and attribution validity.
Both were read-only and excluded `docs/ant/archive/`.

## Implemented paths

`AntController.tick()` (lines 292–436) captures stratigraphy once at tick entry,
then resolves intention and heading. The material multiplier is applied at
lines 347–350 to final desired speed immediately before acceleration. The
lookup and law are at lines 701–713. There is no material after-effect field.

`AntAgent.accelerateToward()` (lines 50–75) updates velocity toward the desired
heading vector, with response rates 32/s for acceleration and 37/s for braking.
The resulting displacement passes through swept collision constraints. Actual
travel drives `GasterDeposition` and `GaitController`; contact locations and
timing update `SurfaceField`, `TrailPlateBirth` and `MaterialStratigraphy`.
The next tick can sense changed pheromone, occupancy and local column count.
Existing adherence, intent and decision/inspection/hesitation clocks can then
change. Retirement, recruitment and the sequential random stream are additional
downstream carriers.

`LocalOccupancy` has configuration but no persistent encounter memory. Its
signals derive from the current complete agent configuration. Body pose does
not steer, but gaster yaw affects secretion position, so exact continuation must
preserve it. Gait and deposition have per-ID maps and must also be preserved.

## Validity requirements carried into the runner

- Simulation age gates are elapsed world time, not ant lifetime.
- The untreated natural world supplies every selection. Each impulse forks
  independently from it; later impulses never operate on a previously treated
  trajectory.
- The temporary acceleration wrapper corrects target speed, calls the original
  method once and restores the exact prior property descriptor in `finally`.
- A full controller clone must preserve class prototypes, aliases, maps, frozen
  descriptors and typed-array buffers, while keeping mutable state and RNG
  independent between arms. A public snapshot cannot restore complete state.
- Full-state sham/replay checks are required at mature material checkpoints.
- `getSnapshot()` on gait/body-pose can create missing per-ID entries. Diagnostic
  observations must not introduce those entries for newly spawned ants.
- Joint L=0 means the center-cell multiplier is inactive in both live arms.
  Feet can still touch material. Reentry closes that unexposed bout.
- World-state splices can change L at restored control positions. Record this
  explicitly; do not treat a reactivated direct input as an unexposed tail.
- The inverse multiplier has ordinary floating-point rounding. Its neutralized
  speed is numerically equivalent, not asserted to reconstruct unmultiplied
  source arithmetic bit-for-bit.
- Nine deterministic cases are correlated observations, not independent samples
  from a biological or stochastic population.

The primary natural continuation estimates total downstream consequence of one
tick. Hybrid restarts test present-state-block sufficiency. Neither identifies
hidden organism memory, unique mediation fractions, perceptual salience or
all-exposure-episode response. The fresh final review is separate from these
pre-run audits.
