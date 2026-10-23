# Angular feedback movement probe

## Question and fixed candidate

Does multiplying only the previous-angular-velocity heading term by the current timestep reduce the measured turn alternation while improving tracking of both signs of a smooth fixed route?

The sole candidate is:

```text
production: -clamp(previousOmega, -2.2, 2.2) * 0.65 * adherence
dtFeedback: -clamp(previousOmega, -2.2, 2.2) * 0.65 * adherence * dt
dampingOff: 0
```

At the 60 Hz production step, maximum production feedback is about 1.43 rad when adherence is one; the candidate is about 0.0238 rad. This is a substantial change in the discrete controller response. The candidate is dimensionally an angle because angular rate is multiplied by seconds. It does not make the rest of `localTurn`, its clamp, or the controller frame-rate invariant.

The separate unforced recurrence is only a check of this term plus the 4.5 rad/s actuator cap. It omits sensing, intent, velocity response, collisions, deposition, lifecycle and material. It shows whether the isolated term predicts a persistent saturated two-cycle or a decaying alternating transient; it is not a stability proof for the full world.

## Controlled matrix

Each case runs 3 simulated seconds at exactly 60 ticks/s, from the same one-ant entry, initial velocity and per-case seeded random stream. After normal initialization, the public population count is set to one, the next spawn is cleared, and the fixture asserts at most one ant on every tick. This corrects the normalizer's minimum population of eight while preserving the production `tick(1/60)` movement path. The existing local and wide trail sensors remain unchanged.

Routes are straight, circles R=0.25 and R=0.10, their mirrored orientations, and the fixed synthetic S curve from the earlier curvature fixture. The curve names describe construction geometry only; they do not establish natural or biological route classes.

Two cues are frozen during movement:

- Analytic Gaussian cue: peak 0.5, sigma 0.0025 around the named route.
- Production 96×96 deposit: `depositSegment`, amount 4.5 per distance unit, radius 0.0045, route station range −0.12 to +0.34 and sample spacing 0.002. The deposited field is then sampled as a frozen copy.

Seeds are 19, 61 and 193. Conditions are production, the one fixed `dtFeedback` candidate, and `dampingOff` as a diagnostic ceiling. No gain, sensor, radius, width, kernel or threshold search is allowed. The matrix is 108 cases if all controls need fresh capture. Historical production and damping-off controls may be reused only when the committed raw input SHA-256 is exact, the production source hashes match, and 12 representative complete per-tick sample replays match exactly. That gate covers gentle, mirrored-gentle and S routes, both cues, and both control modes at seed 19. Any mismatch means run the complete 108-case matrix fresh.

The reproduced representative controls do not enter the candidate results. The historical source revision, raw SHA-256 and compatibility checks are recorded alongside the new cases. Existing route-curvature evidence remains untouched.

## Measurements and interpretation

Every tick records body angular velocity, previous angular velocity, adherence and the actual feedback term. Trajectory measures keep signed and absolute path turn separate, along with route-tangent turn, turn-sign agreement, same-sign persistence, body-rate reversal and lag correlation, turn-cap occupancy, signed and absolute cross-track offset, projected route progress, chord/path ratio, speed, low-speed fraction, survival and collision constraint. One-second, two-second and three-second windows are retained for comparison with the earlier assay.

The first screen is a controlled capability result. On both signs of R=0.25 and R=0.10 smooth arcs, the candidate should reduce angular-rate reversals and turn-cap occupancy and improve median absolute route offset across seeds before it is described as a useful movement candidate. Straight, S-curve and deposited-grid results remain explicit counterexamples and limits; failure on those cases is recorded rather than tuned away. `dampingOff` remains a diagnostic, never a production recommendation.

Three-second controlled cases can report accepted contacts, Plate and Nodule counts, but they cannot establish natural material change. A separately authorized 600-second screen runs the single candidate at seeds 20261005, 20261006 and 20261007, with `dampingOff` only at seed 20261005 as a diagnostic. The matched production natural runs already exist in the baseline package and are not rerun here. Each result is written to its own `natural/{mode}-{seed}/result.json` path. Natural differences after trajectories diverge are coupled counterfactual outcomes, not same-RNG paths. No production law is adopted by this protocol.
