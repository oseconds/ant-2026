# Preregistration amendment — compute H before the commit loop

**Committed before any H outcome run.** This amendment supersedes only the buffering schedule in `PREREGISTRATION.md`; cohorts, formulas, measurements, validation, decision rules, and stop boundary are unchanged.

## Source-based implementation refinement

The initial protocol proposed queueing deposition-accumulator calls until the end of the movement loop. A closer inspection of `LocalOccupancy.constrainDisplacements()` and the following `AntController.tick()` lines shows that all post-collision travel distances are determinable immediately after collision scales return and before any agent is committed. The controller computes all local trails and intentions, then all displacement objects, then collision scales; only after that does it enter the per-agent commit/deposition/contact loop.

The research-only runner will therefore wrap the controller's per-instance `occupancy.constrainDisplacements()` call. It will:

1. Call the existing method once and retain its exact collision scales.
2. Reproduce the controller's actual in-domain endpoint calculation (including the existing observed-segment clipping for exits) for every agent without mutating agent state.
3. Derive each exact travelled distance `d_i`, and use the already-computed post-intention `A_i` and frozen local `E_i`, to calculate `B`, `D`, and `U` for H.
4. For H only, replace each displacement object's deposition multiplier with its unchanged local baseline multiplier plus the same tick-wide `U` before returning the collision scales.
5. Let the unmodified controller movement/commit loop call `GasterDeposition.advance()` and apply each emitted write at its original position and time.

The wrapper reads only `x/y`, displacement, collision scale, and the frozen E/A observations. `constrainDisplacements()` uses only displacement `x/y`; changing the separate deposition multiplier after it returns cannot affect collision results. The wrapper will not delay, reorder, or buffer any write. It will assert that the actual `travelledDistance` received by every subsequent `GasterDeposition.advance()` exactly matches the precomputed value, and that the resulting H per-chunk rate is baseline plus the preregistered `U`.

This removes the need to alter same-tick write visibility, including synchronous contact-event observation. If the predicted and controller-received distances differ, any relevant source state is missing, or the H tick budget does not close within the preregistered floating-point bound, stop as `INCONCLUSIVE — MANIPULATION INVALID`; do not fall back to delayed buffering.

## Frozen source references

- `AntController.tick()`: field decay and all sensing/intention precede displacement construction; collision scales precede the commit loop; actual travel is measured from the same clipped endpoint; `TrailPlateBirth.advance()` and `ColonyActivation.advance()` run after deposits.
- `LocalOccupancy.constrainDisplacements()`: collision resolution reads and scales only each displacement's `x/y` fields.
- `GasterDeposition.advance()`: retains the existing per-ant dab accumulator and emitted deposit positions/order; its call schedule is unchanged.

No natural outcome has been inspected for H; this refinement was selected solely from the implementation ordering and gives the requested budget without any write-delay change.
