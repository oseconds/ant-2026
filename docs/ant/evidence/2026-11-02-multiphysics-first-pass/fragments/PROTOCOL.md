# Mobile fragment contact and release fixture

Status: preregistered, before controlled interaction runs
Date: 2026-11-02
Source checkout: `796d5c7` (`codex/ant-multiphysics-first-pass-20261102`)

## Question

Can a small 2D rigid-body contact model produce finite, friction-limited disk contacts, frictional torque and arrest, a sustained drive-loaded geometric blockage, and release under reversed drive?

This is a controlled model-capability check. It does not test natural ANT formation, ANT foot forces, persistent material, acoustic coupling, collective jamming in a natural run, or long-term settling.

## Model

- Mobile fragments are homogeneous disks with free planar translation and rotation. Values use SI units: radius `R = 0.5 m`, mass `m = 1 kg`, and moment `I = m R² / 2 = 0.125 kg·m²`. These are illustrative, uncalibrated fixture values, not measured fragment properties.
- Disk-disk and disk-wall contacts use a linear normal spring and dashpot with a unilateral normal-force clamp, plus a history-dependent tangential spring clamped by Coulomb friction, `|F_t| <= μ F_n`. For an A/B disk pair, `n` points from A to B and `t = perp(n)`; relative contact-point velocity is B minus A. For walls, `n` points from the closest wall point toward the disk. The stored shear vector is rotated with the old-to-new normal and projected onto the current tangent before integrating slip. Disk-pair forces act at the common midpoint of the overlapping surfaces, using arms `(R_i - δ/2)n` and `-(R_j - δ/2)n`, so the equal/opposite tangential forces and torques preserve pair angular momentum.
- The normal damping coefficient uses the standard linear-dashpot formula with an **unclamped reference** `e_n = 0.8`: `γ_n = -2 ln(e_n) sqrt(k_n m_eff) / sqrt(π² + ln²(e_n))`. The implemented unilateral clamp stops a tensile dashpot force before geometric overlap reaches zero, so actual restitution is not assumed to equal `0.8`; a head-on receipt compares it with the repulsive-only force-cutoff solution. Base stiffnesses are `k_n = k_t = 4000`; the sensitivity values are `2000` and `8000`.
- Base `μ = 0.5`. The zero-friction null sets `μ = 0` with all other inputs fixed.
- Gravity is `(0, -9.81)` where stated. It supplies a declared floor normal load. There is no rolling-resistance moment, cohesion, adhesion, bond, pinning, or contact-independent force between fragments. Tangential history is removed when a contact loses normal support or separates; any stored tangential energy removed this way is recorded as contact-history release.
- Contacts are compliant and may overlap by a small finite amount. The model is not a perfectly rigid solver. Initial geometry and drive are fixed before runs. The integrator is semi-implicit Euler; time-step and stiffness checks bound numerical sensitivity.
- No `FOOT_CONTACT` event is converted to force, impulse, or torque. Drive forces below are synthetic controlled inputs with explicit work accounting.

All dimensional quantities use SI units (`m`, `kg`, `s`, `N`, `N·m`, `J`, `rad`). Gravity is `9.81 m/s²`; the row drive is `8 N` per disk in each commanded direction (`24 N` total for the three-disk row). Spring stiffness is in `N/m` and dashpot coefficients are in `N·s/m`. These fixture inputs are illustrative and have no material calibration.

## Frozen fixtures and outcomes

### 1. Head-on pair impact: measured restitution

Two equal disks begin with centers A left of B and a `0.01` gap, giving the declared impact normal `n = (+1, 0)` from A to B. Disk A has velocity `(1.0, 0)` and zero spin; disk B is stationary. No gravity or walls act; `μ = 0`. Run at `k_n = k_t = 4000` and the time-step ladder `1e-4`, `5e-5`, `2.5e-5` seconds.

Measure the post-separation relative normal speed divided by the incident relative normal speed. Compare it with the repulsive-only solution: integrate the linear spring-dashpot compression ODE until `F_n = k_n δ + γ_n δdot` first reaches zero during unloading, then retain that separation speed while the remaining overlap opens without force. Report this measured coefficient; do not call it `0.8` or fit the damping to an intended result.

### 2. Oblique pair impact: frictional torque

Two equal disks begin with centers A left of B and a `0.01` gap, giving initial normal `n = (+1, 0)` from A to B. Disk A has velocity `(1.0, 0.35)` and zero spin; disk B is stationary. No gravity or walls act. Run once at `μ = 0.5` and once at `μ = 0`, with `k_n = k_t = 4000` and the time-step ladder `1e-4`, `5e-5`, `2.5e-5` seconds.

Record contact duration, peak overlap/force, each disk's angular velocity, total angular momentum, kinetic/contact-spring energy, and post-separation contact state. The friction case passes the torque check if both disks acquire nonzero spin and total angular momentum drift decreases with the time step. The zero-friction case is a null for spin generation. Separation must leave no active contact force or retained contact history.

### 3. Floor-supported Coulomb arrest: analytic spin and translation

One disk rests on a horizontal floor under gravity, initially supported by a spring overlap `δ₀ = mg/k_n`. Initial horizontal speed is `v₀ = 0.5`; initial spin is `ω₀ = 2v₀/R = 2`, selected so Coulomb friction can bring both center velocity and spin to zero at the same analytic time. With `μ = 0.5`, the ideal sliding solution predicts `t* = v₀/(μg) = 0.10194 s` and `Δx = v₀²/(2μg) = 0.02548`.

Run to `0.14 s` at the same time-step ladder. Run the zero-friction null and stiffness values `k_n = k_t = 2000, 8000` at `2.5e-5 s`. Report center and angular speeds, support normal force, contact slip, peak overlap, and energy ledger. The floor is the explicit traction surface and gravity the explicit normal-load source; no wall supports this arrest. Report the analytic comparison and its finite-stiffness/contact-ramp error. Do not infer that an unspun disk sliding on a floor stops: under ideal Coulomb friction it can transition to rolling without rolling resistance.

### 4. Driven row against a fixed end stop: constrained blockage and reverse release

Three equal disks start in a horizontal single-file row at `x = (-1, 0, 1)`, with centers at the floor-supported height. The finite wall segments are floor `(-10, 0)–(10, 0)` with inward normal `(0, 1)`, end stop `(1.5, 0)–(1.5, 1.05)` with inward normal `(-1, 0)`, and ceiling `(-10, 1.05)–(10, 1.05)` with inward normal `(0, -1)` (coordinates in metres). The floor and ceiling confine the row vertically; there is no left wall. At base `k_n = 4000 N/m`, all three initial centers are at `y = 0.4975475 m`. A fixed vertical wall at `x = 1.5 m` blocks the rightmost disk. The drive applies `(+8, 0) N` to all three disks for `0.35 s`, maintains the same forward load for `0.40 s`, then applies `(-8, 0) N` for `0.35 s`. Floor gravity and `μ = 0.5` are active. This is a predeclared wall-supported geometric blockage fixture, not an arch or collective-jamming claim.

Run the `μ = 0.5` baseline over the time-step ladder, a `μ = 0` null at `2.5e-5 s`, and `k_n = k_t = 2000, 8000` at `2.5e-5 s`. Record drive work, center-of-mass displacement, active disk-disk and wall contacts, contact forces, angular velocities, maximum overlap, and energy ledger.

The loaded-blockage criterion is: at all sampled `1 ms` frames in the final `0.10 s` of forward-load hold, at least two disk-disk contacts and one specifically named end-wall contact have `F_n > 0`; center-of-mass rightward motion across that interval is `< 0.025 R`; and the drive continues to apply positive force. This does not rule out sub-millisecond contact loss. Reverse release passes if the disk-row center of mass moves left by at least `0.25 R` during the reverse phase and the end-wall contact unloads or separates. Failure to meet a criterion is retained as a negative fixture result. A one-body or one-wall stop is recorded only as geometric obstruction, never collective jamming.

### Preparation clarification added after the controlled runs

The initial pre-run `_row_scene` fixture definition already included the ceiling segment listed above. The first protocol prose named only the floor and end stop; this clarification corrects that omission. The geometry, initial states, drive schedule, criteria, and run outcomes were not changed after the runs. The complete wall set is now included in each machine-readable run receipt. The floor-only arrest fixture uses a separate finite floor segment from `(-100, 0)` to `(100, 0)` m with inward normal `(0, 1)`; pair-impact fixtures have no walls.

## Required measurements and checks

- Machine-readable per-run and per-frame values: parameters, initial state, drive phase, contact identities/normals/overlaps/normal and tangential forces, contact count, translation and rotation, drive work, translational and rotational kinetic energy, normal and tangential spring energy, gravity potential, contact-history release energy, normal-force-cutoff energy, and finite-step energy-balance residual.
- The time series records the signed terms `-(F_n v_n Δt + ΔU_n)` and `-(F_t v_t Δt + ΔU_t)` with semi-implicit left-endpoint contact forces and 1 ms reporting. They are bookkeeping terms, not a validated dissipation budget. Initial spring preload, frame rotation, Coulomb return, normal-force cutoff energy, and contact deletion are itemized; the signed residual excludes the separately reported normal-force-cutoff energy. Energy-work closure remains **INCONCLUSIVE**. Do not infer that a rebound is physically dissipative or numerically negligible from the residual alone.
- Fixed-scale geometry timeline and fixed-scale energy/force plot for the same runs. Keep geometry scale, color limits, and energy axes identical across matched μ/time-step/stiffness cases.
- Check Coulomb cap at every evaluated contact, normal-only contact at `μ = 0`, finite contact duration, zero force/history after separation, finite values, and maximum overlap. Report the full `dt` and stiffness ladders, not only the visually clean run.
- Keep controlled capability separate from natural ANT behavior, collective-jam interpretation, and long-settlement or adoption claims.

## Source basis

- Cundall and Strack introduced the discrete numerical model of granular assemblies used as the DEM contact-model basis here: [Géotechnique 29 (1979), 47–65, DOI 10.1680/geot.1979.29.1.47](https://doi.org/10.1680/geot.1979.29.1.47).
- Schwager and Pöschel show that collision duration and restitution require care for the linear dashpot; this fixture's zero-force cutoff is handled explicitly rather than equating the nominal formula input with measured restitution: [Coefficient of restitution and linear dashpot model revisited (2007)](https://arxiv.org/abs/cond-mat/0701278).
- Becker, Schwager, and Pöschel analyze normal restitution in the linear dashpot model and tangential response: [Physical Review E 77, 011304 (2008)](https://doi.org/10.1103/PhysRevE.77.011304).
- A 2D hopper experiment reports mechanically stable arches as a granular clogging mechanism; it motivates using precise blockage language but does not validate this small synthetic end-stop fixture: [Zhang et al., Experimental Study of Granular Clogging in Two-Dimensional Hopper (2023)](https://arxiv.org/abs/2308.06584).

The archive-only Argon notes are historical hypotheses, not equations or evidence for this model. In particular, frictional jamming does not create permanent bonds. Permanent anchoring/cementation remains a separate unimplemented mechanism.
