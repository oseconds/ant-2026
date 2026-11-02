# Mobile fragment contact and release: controlled results

Date: 2026-11-02
Branch baseline: `796d5c7` (`codex/ant-multiphysics-first-pass-20261102`)
Status: isolated controlled model-capability evidence; no production or adoption claim

## Finding

The small 2D disk model produces compliant contacts, friction-limited tangential forces, contact torque and spin, and release when an applied drive reverses. The analytic head-on restitution receipt matches the unilateral force-cutoff solution within `1.41e-4` at the finest tested step.

Two intended outcomes were not established. The floor case approaches the ideal Coulomb stop, then reverses under the stored tangential-spring history and is still moving at `0.14 s`; stable arrest is unproven. The three-disk row blocks and releases under reverse drive, but the `μ = 0` control also blocks under forward load, so friction is not shown to create the blockage. This end-stop fixture is geometric and wall-supported, not an arch or a collective-jamming result.

All force and drive inputs in this package are synthetic fixtures. No ANT `FOOT_CONTACT` is treated as a force, impulse, or torque. The model contains no cohesion, permanent bond, pinning, or mechanism that can turn stopped contact into attachment.

## Model and validation boundary

The solver uses homogeneous 2D disks with illustrative, uncalibrated SI values `R = 0.5 m`, `m = 1 kg`, and `I = 0.125 kg·m²`; linear normal spring-dashpot contact with unilateral `F_n >= 0`; and a history-dependent tangential spring with Coulomb return `|F_t| <= μF_n`. The base values are `k_n = k_t = 4000 N/m`, `μ = 0.5`, and a nominal **unclamped** dashpot reference `e = 0.8`. The normal damping coefficients are derived using each contact's effective mass. The law applies torque at the contact arms; disk-pair arms meet at the shared overlap midpoint. Stored tangential displacement is rotated with the contact normal and projected onto the new tangent. All lengths, time, force, moment, energy, and angle values use `m`, `s`, `N`, `N·m`, `J`, and `rad`; gravity is `9.81 m/s²` and each driven disk receives `±8 N`.

Runs cover `Δt = 1e-4, 5e-5, 2.5e-5 s`, stiffness values `k_n = k_t = 2000, 4000, 8000`, frictional and zero-friction arms, and one single-body wall-stop control. The integrator is semi-implicit Euler. The disks can overlap slightly; maximum overlap is included in every run receipt.

The nominal `e = 0.8` does not equal the actual restitution because the unilateral clamp cuts tensile dashpot force before overlap reaches zero. For the head-on zero-friction fixture, measured restitution was `0.808563`, `0.808331`, and `0.807959` over the time-step ladder. The repulsive-only force-cutoff reference was `0.808099`; absolute error fell from `4.64e-4` to `1.41e-4` as the step decreased.

## Controlled outcomes

### Oblique pair impact

At `μ = 0.5`, each disk acquired `ω = -0.236079 rad/s` at `Δt = 2.5e-5 s`; the zero-friction arm generated zero spin. Coulomb-cap excess was zero in the receipts. Pair angular-momentum drift stayed near roundoff (`8.60e-16`, `1.18e-14`, `2.43e-14` as `Δt` decreased), but the preregistered criterion that drift decrease monotonically with the time step was **not met**. The evidence supports frictional torque and bounded near-zero pair drift, not the registered convergence claim.

### Floor-supported friction response

Gravity supplies the explicit floor normal load. The ideal memoryless Coulomb reference predicts stop at `0.10194 s` after `0.02548 m`. At the finest step, the model is close to zero at `0.102 s` (`v_x = 0.00164 m/s`, `ω = 0.01144 rad/s`), then both reverse sign by `0.103 s` (`v_x = -0.00327 m/s`, `ω = -0.00812 rad/s`). At the registered `0.14 s` endpoint, the baseline has `Δx = 0.02500 m`, `v_x = 0.03591 m/s`, and `ω = 0.14819 rad/s`. The zero-friction null moves `0.07000 m` and retains `v_x = 0.5 m/s`, `ω = 2 rad/s`.

The close approach is stable across the tested time steps, but the endpoint response changes with stiffness: at `k = 2000`, `v_x = -0.01987 m/s`, `ω = -0.06928 rad/s`; at `k = 8000`, `v_x = 0.01291 m/s`, `ω = 0.05405 rad/s`. Thus the history spring/cap model brakes and transfers translation into rotation, but it does not demonstrate stable rest at this horizon. The endpoint sign also depends on stiffness, so the result does not establish a physical rebound law.

### Driven row and reverse release

With three disks against a fixed end stop, the frictional arm meets the sampled geometric-blockage criterion: during the final `0.10 s` of forward hold, at 1 ms samples, it retains two disk-disk contacts and one end-stop contact with `F_n > 0`; COM displacement is `-0.000599 m` against a threshold of `0.0125 m`, while the synthetic drive remains `+24 N`. Reverse drive moves the COM left by `0.33534 m` and removes end-stop contact.

The zero-friction arm also meets the same criterion: two disk-disk contacts plus one end-stop contact, `+24 N` drive, and `0.007686 m` COM displacement. It then moves left by `0.54399 m` under reverse drive. The fixed end stop alone is sufficient for this blockage; the fixture does not support a friction-caused jam. Because contact counts are checked at 1 ms samples, sub-millisecond loss is not ruled out.

The row meets the same loaded-blockage and reverse-release criteria across all three time steps and both stiffness checks. For `μ = 0.5`, hold displacement ranges from `-0.000684` to `-0.000523 m` over the time-step ladder; stiffness runs give `0.001965 m` (`k=2000`) and `0.000011 m` (`k=8000`). The single-disk control is separately labeled geometric stop.

The row fixture's complete pre-run wall geometry is floor `(-10,0)–(10,0) m`, end stop `(1.5,0)–(1.5,1.05) m`, and ceiling `(-10,1.05)–(10,1.05) m`; their inward normals are `(0,1)`, `(-1,0)`, and `(0,-1)`, respectively. Floor and ceiling confine the row vertically; the left side is open. The ceiling was present in the initial fixture code before the controlled runs but omitted from the first protocol/report prose. This is a documentation correction only: no geometry or run result changed. The ceiling is now included in every run's parameter receipt. No ceiling contact appears in the saved 1 ms sampled contact ledger. The maximum logged center height across the row and single-stop fixtures was `0.499686651 m`, leaving at least `0.050313349 m` between the highest logged disk surface and the `y = 1.05 m` ceiling. This reports sampled records only and does not rule out a sub-millisecond event. The ceiling confined the fixture but did not carry recorded load in the sampled ledger.

## Energy and interpretation limits

Each run includes drive work; translational and rotational kinetic energy; gravity potential; normal and tangential spring energy; signed normal/tangential contact-balance terms; contact-history deletion; force-cutoff energy; and a finite-step residual. Force-cutoff energy is counted once at the transition from a load-bearing contact, not once per force-free overlap frame.

The residual remains a signed diagnostic, **not a validated energy-closure or dissipation budget**. It excludes the separately reported force-cutoff energy; semi-implicit contact work, contact creation/deletion, and Coulomb return are not fully interval-aligned for a physical work claim. Energy-work closure is **INCONCLUSIVE**. In particular, the floor endpoint motion cannot be called a confirmed physical rebound from this ledger.

The 2D equal-disk law does not represent real fragment shape, heterogeneous material, 3D contact, or calibrated material parameters. The wall-supported row is not a flow-through hopper arch. No long-settlement, natural-ANT behavior, acoustic coupling, or permanent anchoring is tested.

## Reproduction and evidence files

Run the controlled campaign with:

```powershell
C:\AI\ComfyUI_windows_portable\python_embeded\python.exe -B scripts\ant-multiphysics-fragments.py
```

Eight assert-based checks pass with:

```powershell
C:\AI\ComfyUI_windows_portable\python_embeded\python.exe -B -m unittest discover -s tests -p 'test_ant_multiphysics_fragments.py'
```

The `results/` folder contains the 20-run summary, 1 ms state/energy time series, sampled contact-force ledger, full `results.json` parameter/state receipts, and fixed-scale geometry and energy plots. `REPRODUCIBILITY.json` records exact serialized equality against two deterministic reruns of representative existing cases (head-on impact and the frictional driven row), with no parameter changes and no full campaign rerun. `PROTOCOL.md` preserves the preregistered criteria and marks the post-run preparation clarification. `MANIFEST.json` contains SHA-256 and byte-size receipts for this package's source, test, protocol, report, and generated results.

## Source basis

- P. A. Cundall and O. D. L. Strack, “A discrete numerical model for granular assemblies,” *Géotechnique* 29 (1979), 47–65, [DOI](https://doi.org/10.1680/geot.1979.29.1.47).
- T. Schwager and T. Pöschel, “Coefficient of restitution and linear dashpot model revisited” (2007), [arXiv:cond-mat/0701278](https://arxiv.org/abs/cond-mat/0701278).
- V. Becker, T. Schwager, and T. Pöschel, “Coefficient of tangential restitution for the linear dashpot model,” *Physical Review E* 77, 011304 (2008), [DOI](https://doi.org/10.1103/PhysRevE.77.011304).
- S. Zhang et al., “Experimental Study of Granular Clogging in Two-Dimensional Hopper” (2023), [arXiv:2308.06584](https://arxiv.org/abs/2308.06584). This supports precise arch/clogging terminology, not this end-stop fixture.

The archive-only Argon material remains historical hypothesis context. It is not evidence for this model. Frictional contact does not create the separate unimplemented permanent-bond mechanism.
