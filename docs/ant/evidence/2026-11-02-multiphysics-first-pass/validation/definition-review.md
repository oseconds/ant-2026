# Independent physics and numerical definition review

Date: 2026-11-02
Scope: interim review of the frozen parent protocol and live candidate protocols, equations, source definitions, and outputs available at this cutoff. I changed only this review file. I did not edit model code, rerun wet-film, run candidate tests, or produce the ANT capture. This is a read-through with a degraded self-questioning pass; no second fresh reviewer was spawned from this subagent.

## Review status

The candidate protocols have defensible, bounded physical definitions when read at the narrow scopes below. This is not an acceptance of every preregistered criterion or a reproduction of the reported numerical outputs. The cavity package has received several documented corrections. The fragment matrix is being regenerated after an energy-ledger wording/code alignment; the current saved CSV is still from before that rerun. The orientation worker reports that its synthetic checks pass and the paired current-production capture is running; no natural result package is available here.

## Definitions that pass, with limits

### Reused wet-film evidence

The existing wet-film report and its post-run independent review support the registered **MIXED** result for the stated Newtonian precursor-film model. The continuum signs and source-free energy descent are checked in the earlier review; the all-positive precursor, finite-grid limits, and single-patch counterexample remain material qualifications. The 25-run campaign is reused without rerun as required by the parent protocol. This evidence does not test dry body fusion, curing, elastic stress, or sound. See [wet-film report](../../2026-11-02-wet-film-formation-first-probe/REPORT.md#L5) and [prior independent review](../../2026-11-02-wet-film-formation-first-probe/validation/post-run-independent-review.md#L33).

### Orientation observer

The locked measures are defined on actual completed movement segments, not requested velocity, heading, foot positions, or force. The production source writes the surviving agents’ post-collision `from`/`to` segments after displacement constraints ([`AntController.js`](../../../../../src/lib/agents/ant/AntController.js#L380)). Tick indexing, midpoint timestamps, half-open windows, exact-zero segment exclusion, polar `P`, nematic `Q`, supported-loop winding and charge, corner tie order, and support-intersection-weighted persistence are now specified in the [orientation protocol](../orientation/PROTOCOL.md#L16). The distinctions are mathematically coherent: a half-winding of complex `Q` represents a half-charge director winding; neither winding nor a `Q` gradient is physical stress or a material defect measurement.

The same protocol correctly treats its one horizontal reflection as a spatial reference, not a randomization test or causal null, and rules out claims that traffic caused deposition or that a Plate changed traffic ([protocol](../orientation/PROTOCOL.md#L40)). The worker reports 8/8 Python and 2/2 Node synthetic checks passing. The one-seed natural capture and its parity checks are still pending; no natural organization result is reviewed or inferred.

### Air cavity

The open-top groove and broad-face recess are correctly left without a lumped Helmholtz frequency, pressure, or radiation estimate. Geometric recess volume alone does not establish a roof, sealed volume, or narrow neck. The added-roof duct is a distinct distributed reference; it is not the open groove. Current ANT’s 2D material mask / plate path does not provide the missing air enclosure ([cavity report](../cavity/REPORT.md#L17), [current-source boundary](../cavity/PROTOCOL.md#L15)).

For the explicitly supplied rigid chamber and cylindrical neck, the units and signs in `M_a = rho L_eff/A`, `C_a = V/(rho c²)`, `Z = 1/C_a - omega² M_a + i omega R`, and the RMS power receipts are consistent with the declared lumped model. The corrected accepted grid is 1–340 Hz with `kDmax <= 0.25` and `ka <= 0.025`; this is a stated study screen, not a universal error bound. The former 1–5 kHz tail is preserved as an extrapolation diagnostic. The initial 12 mm short-neck output is preserved as invalid for the selected large-aspect-ratio correction; the accepted 40 mm neck has `L/(2a)=10, 6.67, 5` and the correction remains approximate without an error bound ([cavity protocol](../cavity/PROTOCOL.md#L3), [cavity report](../cavity/REPORT.md#L8)).

Two useful scope repairs are now present. First, the `*_at_f0` receipts are evaluated at the exact analytic `f0`; the grid maximum remains separately labeled. Second, the compliant-wall upper eigenfrequency, 458.850 Hz, has `kD ~= 0.336` and is marked outside the compactness screen. The coupled roots and energy/work checks support the mathematical lumped surrogate only; the lower root is inside the screen and indicates that the chosen compliant boundary changes the rigid-wall prediction. Neither root validates a real ANT plate or a 3D acoustic mode ([generator](../../../../../scripts/ant-multiphysics-cavity.py#L425), [updated report](../cavity/REPORT.md#L84)).

The time-domain pulse freezes `R_rad` at `f0`, while the frequency sweep uses `R_rad(f)`. The protocol and report now distinguish those approximations. RK4 agreement with the exact solution and energy closure validate the same frozen-resistance ODE, not a frequency-dependent radiation kernel or a physical cavity measurement ([cavity protocol](../cavity/PROTOCOL.md#L46), [cavity report](../cavity/REPORT.md#L66)).

### Mobile fragments

The declared 2D compliant-disk model has explicit translation, rotation, unilateral normal contact, and a Coulomb-capped history spring. The protocol properly calls `e_n=0.8` an unclamped reference and requires a measured restitution against the unilateral force-cutoff solution; it does not equate nominal input with observed restitution. This matches the linear dashpot caveat in [Schwager and Pöschel (2007)](https://arxiv.org/abs/cond-mat/0701278). The current saved head-on row reports measured `e=0.80796` against the repulsive-only reference `0.80810` at `dt=2.5e-5` ([fragment results](../fragments/results/run-summary.csv#L4)).

The revised contact memory transports a world-space tangential spring vector from the old normal frame and projects it into the new tangent; pair forces use the shared midpoint and opposite arms. These are appropriate definitions for the stated 2D disk fixtures ([fragment source](../../../../../scripts/ant-multiphysics-fragments.py#L72), [pair geometry](../../../../../scripts/ant-multiphysics-fragments.py#L356)). The protocol correctly excludes cohesion, adhesion, pinning, rolling resistance, and ANT `FOOT_CONTACT`-to-force conversion ([fragment protocol](../fragments/PROTOCOL.md#L17)).

## Saved fragment observations that narrow the claims

These are inspections of the current saved CSV and time series, not an independent rerun. The result matrix is being regenerated after the worker’s residual change, so the numeric energy residuals below are intentionally not used.

1. **The floor case brakes through zero but does not remain arrested.** At `dt=2.5e-5`, the saved trace approaches the ideal `t*=0.10194 s`, then reverses both center velocity and spin by `0.103 s`; the saved `0.14 s` summary has `|v|=0.03591 m/s` and `|omega|=0.14819 rad/s`. This supports transient frictional braking/crossing and rebound, not a settled stop. The current protocol still calls this “Coulomb arrest” and says the history is selected to bring both speeds to zero ([protocol](../fragments/PROTOCOL.md#L37), [run summary](../fragments/results/run-summary.csv#L11), [trace](../fragments/results/timeseries.csv)). Keep it separate from adhesion: the model has no glue or permanent contact, and its own report says that stored tangential history can be released. The final interpretation should describe the observed reversal or make any sustained-stop criterion explicit; it should not treat momentary zero velocity as a persistent lock.

2. **The preregistered angular-momentum trend criterion is not met.** For the oblique frictional pair, absolute saved drift is approximately `8.6e-16`, `1.18e-14`, and `2.43e-14` for `dt=1e-4`, `5e-5`, and `2.5e-5`, respectively. Those are near floating-point roundoff, but they do not decrease monotonically as the [protocol requires](../fragments/PROTOCOL.md#L35). Report the criterion as unmet and the near-zero drift as an observation; do not retrofit a convergence threshold after seeing the values. Both disks do acquire spin in the friction run, while the `mu=0` pair remains a spin null in the saved rows.

3. **The row is blocked by its stop geometry, not shown to be blocked by friction.** The saved `mu=0` row meets the same sampled loaded-blockage criterion: two disk contacts, one end-stop contact, positive total drive force `24`, and hold displacement about `0.00769 < 0.025R = 0.0125`. Its reverse phase moves the row left about `0.544` and unloads the end-stop. The `mu=0.5` case also passes, with hold displacement about `-0.00060`, reverse displacement about `0.335`, and no end-stop contact at the end. Thus a wall-supported multi-contact geometric blockage and reverse release are observed in the fixture, but friction is not demonstrated to cause the blockage. The 1 ms observation criterion also cannot exclude shorter contact dropouts, as the protocol states ([criterion](../fragments/PROTOCOL.md#L49), [matched results](../fragments/results/run-summary.csv#L17)). This remains neither a natural arch nor collective jamming.

4. **Energy-budget claims remain inconclusive.** The protocol explicitly labels the signed work/loss terms as bookkeeping and says energy-work closure is **INCONCLUSIVE**. That boundary is appropriate. The fragment worker has aligned the live residual formula with the protocol by excluding the separately itemized normal-force-cutoff energy; the final matrix regeneration is pending. Do not interpret per-channel signed terms as a validated dissipation law or claim physical damping from them ([fragment protocol](../fragments/PROTOCOL.md#L53), [current source ledger](../../../../../scripts/ant-multiphysics-fragments.py#L447)).

## Coupling and claim boundary

The parent protocol correctly requires three distinct levels: conceptual coexistence, a stated physical exchange law, and an actually executed coupled check. Individual candidates do not satisfy the third level ([parent protocol](../PROTOCOL.md#L31), [coupling analysis](../COUPLING.md#L15)). The cavity’s chamber–piston calculation is the only explicit coupled surrogate in this pass; it has supplied geometry and chosen modal coefficients, not a formed ANT wall. The wet-film, orientation, and fragment runs are separate component checks. Do not combine their individual results into an ANT multiphysics validation.

No source supports an ANT foot-force estimate, a stress/defect field from `Q`, glue from arrest, or a physical air cavity from a 2D material loop. All such mappings remain unsupported or untested in this pass.

## Not independently verified at this cutoff

I did not run the focused tests, rerun the cavity or fragment generator, recapture ANT, or rerun the wet-film campaign. Cavity test/hash completion is the worker’s reported result, not mine. Orientation natural capture/parity is pending. Fragment output regeneration is pending. The existing wet-film manifest check is recorded in [reused evidence](../REUSED-EVIDENCE.md#L33); it is not a new campaign.
