# Cavity / air-volume minimum study protocol

**Status:** amended and frozen before the accepted numerical rerun. Parameters below are illustrative controls, not ANT measurements. The first frozen version and its explicitly rejected short-neck diagnostic output are preserved under [`preparation/initial-short-neck-diagnostic/`](preparation/initial-short-neck-diagnostic/); the later 1–5 kHz sweep, whose upper part exceeded the compact-model regime, is preserved under [`preparation/full-band-extrapolation-diagnostic/`](preparation/full-band-extrapolation-diagnostic/).

## Pre-run correction record

The first diagnostic used a 12 mm neck and radii 2/4/6 mm. After that run, source review identified that the selected `0.8217a` correction is the large-aspect-ratio cylindrical-neck limit, while the middle radius had `L/(2a) = 1.5`. Those outputs are retained as an **invalid-for-the-selected-correction diagnostic**, not accepted evidence. Before the accepted rerun, the only physical-geometry change is a 40 mm neck with radii 2/3/4 mm (`L/(2a) = 10/6.67/5`). The asymptotic end correction remains approximate and has no error bound here. No resonance tuning or production change follows.

The first corrected-neck sweep exported 1–5,000 Hz. Review found that its upper portion used the low-`ka`/lumped circuit beyond a compact regime (at 5 kHz, `kDmax = kL ≈ 3.66` for the 40 mm dimensions). That full-band export is preserved as an **extrapolation diagnostic** and is not interpreted above the accepted band. Before the accepted rerun, the frequency grid is limited to 1–340 Hz by the study screen `kDmax ≤ 0.25` at the upper edge. The screen is a conservative study boundary, not a universal model-error theorem; it contains all three frozen `f0` values and keeps the radiation aperture at `ka ≤ 0.025`.

## Question and boundary

Test whether an ANT-like closed 2D solid/material loop supplies enough geometry to define an acoustic air cavity. Compare (a) an open-top groove, (b) a broad-mouth partially confined recess, and (c) one actual closed chamber with a cylindrical neck. The physical model is a controlled analytical study only: no 3D solver, no production audio/ANT changes, and no inference that ANT currently contains a roof, neck, or measured air volume.

Current-source boundary: ANT's surface topology compiles 2D material masks to plate solver nodes; the surface worklet evolves plate displacement and material coupling. Those sources do not construct an air domain or a sealed volume. Therefore any ANT cavity mapping remains **UNSUPPORTED** unless physical enclosure geometry and dimensions are separately supplied.

## Frozen cases

All ambient-air constants are held fixed: density `rho = 1.20 kg/m^3`, sound speed `c = 343 m/s`. They are illustrative room-condition values, not measured site conditions.

| Case | Geometry entered before run | Predeclared treatment |
|---|---|---|
| Open-top groove | Recess length 100 mm, width 20 mm, side-wall depth 5 mm; top fully open. The under-rim geometric void is 10 cm^3 and the open top is 2,000 mm^2. | Record the geometric void and opening, but set sealed cavity volume and neck to undefined. Do not assign a Helmholtz frequency, cavity pressure, or neck-radiation/loss receipt. A solid 2D loop does not specify a roof or air height. |
| Broad-mouth partial recess | Recess 40 × 40 × 10 mm; 20% of the top is covered, leaving a 1,280 mm^2 broad opening. The geometric recess is 16 cm^3. | Record geometry only. The remaining opening is a broad face, not a defined neck; reject the lumped Helmholtz model and do not report a fabricated frequency or pressure. |
| Roofed duct reference | Add a rigid roof to the 100 × 20 × 5 mm groove and leave both ends pressure-release. | Controlled counterexample, not a model of the open-top groove. Report the ideal first longitudinal mode `f1 = c/(2L)`, with end correction and losses omitted. |
| Canonical chamber + neck | Rigid rectangular chamber 40 × 40 × 25 mm (`V = 40 cm^3`, excluding neck); circular neck radius 3 mm and physical length 40 mm, opening into a rigid baffle / exterior half-space. | Apply a lumped Helmholtz model only after reporting `kDmax`, `ka`, and `kL`. Use one 1 Pa RMS pressure-difference drive for frequency response and a 1 Pa, 1 ms pressure pulse for time response. |

Aperture sensitivity is frozen to neck radii 2, 3, and 4 mm at fixed chamber volume and physical neck length. This is a parameter comparison, not a tuning search. Internal-loss reference is fixed to `Q_internal = 20` for each neck variant; it is a declared scenario parameter, not a measured material or aperture loss.

Use a 1 Hz frequency grid from 1 through 340 Hz for accepted frequency-domain comparisons. The 1.715 kHz added-roof duct value remains a separate ideal-line reference and is not overlaid on the bounded lumped-response plot.

## Equations and numerical checks

For the canonical neck:

- `A = pi a^2`
- `L_eff = L + 1.6434 a`, using the large-aspect-ratio circular-neck end correction `2 × 0.8217 a` from Brandão & Schnitzer; this remains an approximate correction, not exact geometry resolution.
- `M_a = rho L_eff / A` (acoustic inertance)
- `C_a = V / (rho c^2)` (rigid-wall air compliance)
- `omega_0 = 1/sqrt(M_a C_a)` and `f_0 = omega_0/(2 pi)`
- For a small baffled circular aperture, use the compact-aperture low-`ka` radiation resistance `R_rad(omega) = rho c (ka)^2/(2 A)`, with `k = omega/c`; report it only within the small-aperture regime. This is the low-`ka` baffled-piston approximation, not a general open-groove radiation law.
- Set `R_internal = omega_0 M_a/Q_internal`. Total series impedance is `Z(omega) = 1/C_a - omega^2 M_a + i omega (R_internal + R_rad(omega))`.
- With RMS pressure drive `P`, neck volume displacement is `Q = P/Z`, volume velocity is `U = i omega Q`, and cavity pressure is `P_c = Q/C_a`.
- Steady receipts use RMS phasors: `P_in = Re(P conj(U))`, `P_internal = R_internal |U|^2`, and `P_radiated = R_rad(f) |U|^2`. The compact baffled-monopole far-field pressure at 1 m is `p_rms = rho omega |U|/(2 pi r)`; its half-space radiated power must agree with `P_radiated` within numerical rounding.

Time-domain check uses `M_a q'' + (R_internal + R_rad(omega_0)) q' + q/C_a = p_drive(t)`. Radiation resistance is frozen at `omega_0` for this constant-coefficient narrowband transient ODE, while the frequency sweep uses `R_rad(f)`; these are related but distinct damping approximations. Compare deterministic RK4 integration of the 1 ms rectangular pulse against the exact underdamped step-response difference for the frozen-resistance ODE. Integrate input work, internal loss, radiation loss, and stored energy; report the closure residual.

For wall-compliance rejection, use a one-mode uniform-piston surrogate with the base chamber's top area `A_w = 40 × 40 mm`, modal mass `m_w = 2 g`, and modal stiffness `K_w = 5,000 N/m` (all illustrative). Calculate `C_w = A_w^2/K_w`, `chi = C_w/C_a`, and the coupled undamped eigenfrequencies from

`M = diag(M_a, m_w)`

`K = [[1/C_a, A_w/C_a], [A_w/C_a, K_w + A_w^2/C_a]]`.

The wall coordinate `x` is positive inward, so cavity pressure is `p_c = (q + A_w x)/C_a` and pressure force on the wall is `-A_w p_c`. Compare coupled modes with the rigid-wall Helmholtz prediction. If `chi` is order one, reject the rigid-wall approximation for that example; this threshold is a dimensional diagnosis, not a universal cutoff. Then integrate the undamped two-coordinate system from a declared `q(0) = 1e-9 m^3`, with other initial states zero. Report quadratic air, neck, and wall energy, total-energy drift, and the pressure-force work `integral((-A_w p_c) xdot dt)` against the wall-energy change. Also check the two-mode eigenvalues against the closed-form roots of the 2×2 characteristic polynomial. The surrogate does not identify ANT Plate stiffness or solve a real bending mode.

## Outputs and stop rule

Write deterministic machine-readable geometry/model/results, one frequency sweep, one time response/energy receipt, one coupled-wall energy/work receipt, and fixed-axis figures. Keep units explicit. Do not tune parameters after observing plots. Stop after one base canonical case, the frozen 2/3/4 mm aperture comparison, one roofed-duct reference, and one wall-compliance rejection example. No 3D FEM/BEM, no fitted ANT geometry, no additional resonator families, and no production adoption claim.

Acceptance checks:

1. Analytic `f0` and numerical peak agree within 0.5% for the frozen frequency grid.
2. RK4 pressure/volume response agrees with the exact rectangular-pulse solution within 0.2% peak and trace error.
3. Integrated transient energy closure is below 0.5% of supplied pulse energy.
4. Half-space far-field pressure integrates to the reported radiation power within 0.1%.
5. Undamped coupled-wall total energy remains within 0.1% of its initial value and integrated pressure-force work closes against wall-energy change within 0.1% of initial energy.
6. Tests assert positive dimensions, monotonic `f0` with aperture radius for the frozen sweep, the open-top/lumped rejection, transient energy/work closure, and coupled-wall frequency difference for the compliance example.

## Primary sources

- N. S. Dickey & A. Selamet, “Helmholtz Resonators: One-Dimensional Limit for Small Cavity Length-to-Diameter Ratios,” *Journal of Sound and Vibration* (1996). It describes a resonator as a volume connected through a neck/orifice, notes planar-wave and multidimensional-junction limits, and explains effective neck end correction: [Ohio State author PDF](https://mae.osu.edu/sites/default/files/2021-12/J16.pdf).
- R. Brandão & O. Schnitzer, “Asymptotic modeling of Helmholtz resonators including thermoviscous effects,” *Wave Motion* 104 (2021), 102583. It treats a hollow cavity connected to the exterior through a small neck, identifies the fundamental as a long-wavelength breathing mode, gives a geometry-dependent circular-neck end correction, and treats radiation plus thermoviscous losses: [authors' paper](https://arxiv.org/abs/2001.09353), [published DOI](https://doi.org/10.1016/j.wavemoti.2020.102583).
- P. A. Monkewitz & N.-M. Nguyen-Vo, “The response of Helmholtz resonators to external excitation. I - Single resonators,” *Journal of Fluid Mechanics* 151 (1985). Its low-frequency asymptotic setup requires characteristic neck size small relative to wavelength and refines effective mass/volume: [NASA Technical Reports Server record](https://ntrs.nasa.gov/citations/19850044764).
- C. García A., N. Dauchez & G. Lefebvre, “Radiation efficiency of a distribution of baffled pistons with arbitrary phases,” *Journal of the Acoustical Society of America* 152(2) (2022). It derives baffled-piston radiation resistance and its small-`ka` expansion; dividing specific resistance by aperture area gives the volume-flow resistance used here: [JASA paper](https://doi.org/10.1121/10.0013569).
- MIT OpenCourseWare, 21M.380, “Physics of Sound,” provides the ideal open/open pipe frequency relation and the mass-spring Helmholtz description used for the roofed-duct counterexample: [lecture slides](https://ocw.mit.edu/courses/21m-380-music-and-technology-sound-design-spring-2016/73bb2f51aa991effbdb315e9d49f8d08_MIT21M_380S16_lec_slides.pdf).
- M. Pishvar & R. L. Harne, “Nonlinear Behavior of Helmholtz Resonator With a Compliant Wall for Low-Frequency, Broadband Noise Control,” *ASME Journal of Vibration and Acoustics* 144(3) (2022). The compliant wall creates a coupled two-degree-of-freedom system, so a rigid-wall cavity cannot be presumed: [ASME DOI](https://doi.org/10.1115/1.4052870).
