# First discriminating wet-film formation experiment

Status: preregistration, before interaction results. Research only; no production integration.

## Question and authority

Can the same prescribed local inscription evolve through conservative capillary transport into persistent, distinguishable excess-film structures, compared with frozen deposition and ordinary smoothing?

Start from verified GitHub main `5bdd516b412d03d78c2511ceb372180941206968`. Read current ANT hub, SurfaceField, TrailPlateBirth, MaterialStratigraphy and GaitController. Prior audio research is `918764c2d4924eb89fd6874122edc30b73d1499c`. The explicitly authorized 2026-11-02 Argon archive is unvalidated motivation, not a constitutive law. Branch: `codex/ant-wet-film-formation-first-probe-20261102`.

Production formation, movement, audio and rendering stay unchanged. Use the primary checkout, preserve the two pre-existing AV drafts, and create no worktree. No drying, curing, elastic waves, String, cavity, new mesh, selector, Residence or adoption.

## Physical model and its limits

Use an isothermal, incompressible Newtonian liquid in a small-slope, inertia-free lubrication approximation on a stationary flat substrate. It is NOT a viscoelastic model. No evaporation, gravity, external traction, elastic memory, chemistry or phase change is modeled.

Nondimensional film height `h>0`, precursor `b`, wetting strength `W`:

```
Phi(h) = W [-1/2 (b/h)^2 + 1/5 (b/h)^5]
E[h] = integral [1/2 |grad h|^2 + Phi(h)] dA
p = -Laplacian(h) + W (b^2/h^3 - b^5/h^6)
q = -h^3 grad(p)
partial_t h + div(q) = s
```

Closed-boundary mass changes only by the declared source. Without source, `dE/dt = -integral h^3 |grad p|^2 dA <= 0`.

References: [Sellier & Trelluyer 2009, equations 5–10](https://pmc.ncbi.nlm.nih.gov/articles/PMC2717581/), [Thiele 2010](https://arxiv.org/abs/1010.2928), [Zhang et al. convex-splitting analysis](https://arxiv.org/abs/2012.11802). The latter analyzes a different singular potential and mainly constant mobility: it motivates structure-preserving discretization; its theorem is not claimed as a proof of this implementation.

The precursor regularizes a moving wetting front. Every active cell already contains liquid. Two separated excess-height ridges are NOT two dry, disconnected bodies. Neck growth and threshold connectivity measure ridge/bridge interaction, not a microscopic dry-contact rupture event or chemical fusion. The precursor is a phenomenological mesoscopic regularization, not a measured ANT film.

## Fixed scales and parameters

- Square domain `[0,1]^2`; cell-centered finite volumes. Primary `N=64`, coarse `32`, fine `128`.
- Primary `b=.1`, excess ridge amplitude `.5`, capsule half-width `.08`, `W=.5`.
- Illustrative dimensionalization only: `L0=1 mm`, `H0=10 micrometers`, viscosity `.1 Pa s`, surface tension `.03 N/m`, aspect ratio `.01`. Thus `T0=3 mu L0^4/(gamma H0^3)=10000 s` and primary endpoint `.02` corresponds to 200 illustrative seconds. None is calibrated to ANT.
- The physical small-angle estimate is `theta ≈ (H0/L0) sqrt(.6 W)`: `.005477` rad primary, `.010954` rad at `W=2`. Dimensionless slopes are not physical angles.
- Stable background is exactly `h=b`, where `Phi''=3W/b^2>0`. Report the actual initial/evolving maximum physical slope and positivity.
- Contact-zone scale estimate `ell=b/sqrt(3W)`: `.08165` primary (5.2 cells at N64, 10.4 at N128). Fine-only sensitivities `W=2` and `b=.05` each give `.04082` (5.2 cells at N128). These sensitivities are not a sweep and cannot be retuned after viewing results.
- Endpoint `.02`; fixed snapshots `0,.00025,.001,.0025,.005,.01,.02`. Supply-off is the entire controlled interaction interval.
- Nominal step `1e-4`; pair step sensitivities `5e-5,2.5e-5`. Split only to hit exact snapshot/source times or retry a failed numerical step by halving. Log every retry; abort below `1e-8`. No negative-height clipping, mass renormalization or visual repair.

## Controlled initial geometry

For distance `r` to a finite line segment, use the compact cap `.5 cos^2(pi r/(2*.08))` for `r<.08`, zero otherwise. Rasterize analytic caps with fixed 4x4 cell quadrature. No mass rescaling between resolutions: report quadrature error separately.

1. **Separated pair:** vertical segments at x=.4 and .6, y=.275 to .725. Initial cap supports have a .04 clear gap. The wet precursor connects them underneath.
2. **Crossed pair:** horizontal and vertical segments centered at (.5,.5), endpoints .275 and .725. Sum their heights; this is already one connected liquid height field, not an over/under crossing of independent fibers.
3. **Obstacle contact:** horizontal segment x=.25 to .5 at y=.5. Exclude rectangle x=[.55,.65], y=[.3,.7]. The cap meets the excluded boundary. This is an impermeable 2D domain hole, not a simulated 3D solid or pinned contact line.
4. **Obstacle absent sensitivity:** identical excess inscription, including its initial omission in the obstacle footprint, but allow liquid into that region. The domain's precursor volume differs; initial excess volume is identical.
5. **Supply then inactivity:** start at h=b; add four equal compact circular deposits, each volume .001 at (.5,.5), radius .08, times 0,.0005,.001,.0015. No supply from .002 onward. Same exact source field and time for all arms. Record work/energy added by supply separately.

## Baselines and boundary semantics

Every primary case has frozen deposition, linear heat diffusion, and capillary thin-film arms. All share the exact same rasterized initial state, mask and source doses within that case.

Heat is explicitly a smoothing Null, `h_t=D Laplacian(h)+s`, not coagulation. Fix D analytically before results by matching one linear rate at `h_ref=b+.5/2`, `k_ref=pi/(2*.08)`:
`D=h_ref^3 [k_ref^2+Phi''(h_ref)]` (positive). This matches one declared reference wavelength, not nonlinear transport or the entire spectrum. Do not refit D to any pair or natural output.

All exterior and excluded-region faces have zero mass flux. The discrete surface-energy operator has the natural zero-normal-slope boundary. Optional periodic grids exist for Fourier solver verification only. No contact-line pinning, attraction through an obstacle, imposed target shape, merger radius or fusion switch.

## Numerical and measurement gates

Use shared oriented grid edges. `K=B^T B/dx^2`, `A=B^T diag(mean(h_old^3)) B/dx^2`. Solve:

```
h_new - h_old + dt A p_new = 0
p_new = K h_new - W b^5/h_new^6 + W b^2/h_old^3
```

The repulsive potential and surface term are implicit; the concave attractive term is explicit. Newton uses sparse solves with positivity/residual backtracking. The finite-grid energy estimate is `E_new-E_old + dt dx^2 p_new^T A p_new <= numerical tolerance`. This is a scheme check, not proof of continuum accuracy. Heat uses implicit Euler on the same grid graph.

Require flat-precursor invariance, small-amplitude discrete Fourier amplification agreement, mass balance, positive finite h, source accounting, zero obstacle-crossing flux, and energy descent for source-free thin-film steps. Preserve failures; never tune around them. Require temporal and spatial comparisons for the separated pair. If fine comparisons disagree on the phenomenon, report MIXED/INCONCLUSIVE rather than declare convergence.

Record mass/expected mass/residual, minimum/maximum h, energy and source work, dissipation, integrated absolute face transport (counts repeated crossings), signed transfer across x=.5, pressure spread, height-field L1/L2 change, mass outside initial inscription, centroids and source-off change. Preserve raw snapshot arrays and per-step quantitative histories.

Use the fixed excess-height levels `.05,.125,.25` above b (10/25/50% of the prescribed single-ridge amplitude), four-neighbor connectivity, neck profiles and central gap height. These are descriptive observer levels, not formation thresholds. Preserve all levels, appearances, disappearances and split/merge ambiguity. Threshold count alone cannot establish coalescence. Temporal persistence means only observed persistence through the fixed source-free horizon; it does not mean rigid/frozen stability.

## Optional bounded ANT input

Only if exact extraction is feasible, reuse seed20261005 CONTROL individual contacts from the validated audio capture at commit918764c. Capture gzip SHA-256 `4871d4d24b4f235b9626f1e95baa3b79f81ec1c4ad800fc57187202fbfcb1003`, Git blob `e261774bb7595e99420c821a8fd19f62cfb91514`. No fresh ANT simulation or feedback.

Use all valid feet with authored payload time in `[0,60)` s, source-off60–120 s. Record original sub-tick times and positions; place each dose at the right edge of its explicit one-second bin (delay [0,1] s), identically in all arms. This is a temporally binned conditional shadow, not exact sub-tick fluid forcing or live coupling.

Assume volume `1e-5 L0^2 H0` per foot (0.1 pL under the illustrative scales), compact cap radius .04. Normalize the discrete source kernel only to deliver this declared volume, including at the closed boundary. Quantity, water content, radius and dimensional clock are assumptions, not measurements of feet/pressure/pheromone. Ignore event strength for deposition. Preserve source ledger and original capture hash. N64 primary and dt-halving comparison only; no extra seeds. If source extraction or valid numerics fails, stop the optional shadow and report independent physics only.

## Deliverables and decision

Store protocol, report, validation, fixed-scale technical atlas, quantitative CSV/JSON, deterministic snapshot files, input/source receipts, manifest and SHA256SUMS. Use fixed h scale0–1.2 and signed difference scale±.5; record out-of-range values without clipping stored data. No polished artwork. Reproduce deterministic numerical output; separate metadata/wall time.

Independent post-run review must challenge numerical definitions, arithmetic and interpretation. Classify SUPPORTED/MIXED/NEGATIVE/INCONCLUSIVE separately for equation execution, different persistent morphology, conditional ANT-input morphology and future acoustic potential. No first-stage success implies later-stage success. End after this model; no automatic alternative candidate, tuning, PR, merge or adoption.
