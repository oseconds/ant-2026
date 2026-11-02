# ANT material formation physics — first discriminating experiment

## Decision

**MIXED.** The isolated model genuinely transports liquid under a declared capillary/wetting-pressure law and produces source-free excess-film morphology different from frozen deposition and a heat-diffusion Null matched at one declared reference wavelength and thickness. The separated-pair endpoint is robust under the tested grid and timestep refinements. This is a positive first result for **Newtonian precursor-film ridge evolution**, not for dry disconnected strands fusing, irreversible solidification, a naturally established ANT material, or an acoustic body.

The answer to the explicit Frozen Plate question is **yes, with a narrow meaning**: current material geometry changes through conservative flux after inscription stops, rather than retaining an immutable birth footprint. The frozen arm represents that geometric immutability as an experimental Null; it is not a new run of production TrailPlateBirth or its Plate descriptor. No production formation or audio architecture was changed.

| Responsibility/question | Finding |
|---|---|
| Numerically solve a physically defined transport equation | **SUPPORTED** within the tested discretization, mass/energy/positivity and refinement checks |
| Source-free structures distinguishable from fixed deposition and smoothing | **SUPPORTED** for the controlled pair over the fixed horizon; not every supplied patch persists above the observer levels |
| Dry separated material bodies contact and irreversibly fuse | **INCONCLUSIVE / not represented:** a positive precursor already connects the active domain |
| Same mechanism observed in natural ANT matter | **MIXED / conditional shadow only:** recorded feet drive an assumed liquid-dose process; no moisture, force or actual deposited volume was measured |
| New acoustic sounding body | **INCONCLUSIVE / untested:** no elastic state, curing or sound model exists here |

## Authority, scope and preregistration

GitHub main was verified at `5bdd516b412d03d78c2511ceb372180941206968`. Branch: `codex/ant-wet-film-formation-first-probe-20261102`, based on that main. [PROTOCOL.md](PROTOCOL.md) was committed at `b2803cb` before interaction results; the tested solver/source ledger at `1f85754` preceded the campaign. [Preparation](PREPARATION.md) records the pre-result numerical-definition repairs. No parameter or geometry was changed after interaction output.

The [Local-X audio reassessment at918764c](https://github.com/oseconds/ant-2026/blob/918764c2d4924eb89fd6874122edc30b73d1499c/docs/ant/evidence/2026-11-01-local-x-audio-reassessment/REPORT.md) motivates separating history from mechanical state. It does not establish the present liquid law. The explicitly authorized [Argon archive](../../archive/2026-11-02-material-formation-physics-brainstorming/README.md) supplies unvalidated hypotheses. Neither source authorizes treating foot strength as pressure or pheromone as water.

Current SurfaceField is normalized, slowly relaxing compaction memory; TrailPlateBirth creates authored immutable corridor descriptors; MaterialStratigraphy retains their masks and chronological columns. None supplies an advecting liquid height field, water budget, viscosity, wetting potential or measured traction. This pass adds only isolated research scripts. `src/` and `static/` remain identical to main, including movement, formation, feedback, recruitment, renderer and audio.

## Model: capillary liquid, not viscoelastic coagulation

For positive film height h on a stationary flat substrate:

```
Phi(h) = W[-(b/h)^2/2 + (b/h)^5/5]
E = integral [|grad h|^2/2 + Phi(h)] dA
p = -Laplacian(h) + Phi'(h)
q = -h^3 grad p
partial_t h + div q = s
```

This is a lubrication model for a Newtonian, inertia-free, incompressible, isothermal liquid, with surface tension and a partial-wetting potential. It is a nonlinear fourth-order conservative flow, not Gaussian blur. No viscoelastic memory, evaporation, drying, curing, gravity, elasticity, particle friction, fusion switch or extra force is present. The [sessile-drop coalescence model of Sellier & Trelluyer](https://pmc.ncbi.nlm.nih.gov/articles/PMC2717581/) provides the hydrodynamic/precursor basis. [Thiele's gradient-dynamics account](https://arxiv.org/abs/1010.2928) distinguishes the energy and mobility roles.

Primary values are b=.1 and W=.5. Initial cap excess amplitude is .5, half-width .08. All active cells already contain the precursor b. The potential has a stable flat minimum there. It regularizes a moving wetting front, but is a mesoscopic modeling choice: it is not an observed microscopic ANT liquid. In the pair, initial precursor volume is .1 and added excess volume is .04197864. The background is therefore a substantial fluid reservoir, not negligible bookkeeping.

An illustrative scale is L0=1mm, H0=10micrometers, viscosity=.1Pa s and surface tension=.03N/m. The aspect ratio is .01 and T0=10000s. Controlled t*=.02 corresponds to200 illustrative seconds. These values are declared assumptions, not calibrated ANT units or measured fluid properties. Physical wetting-angle estimates are .005477rad at W=.5 and .010954rad at W=2. Recorded physical directional-slope bounds remain below.2 in the campaign; this supports the chosen small-slope approximation, not a quantified asymptotic error estimate.

## Experiment and numerical method

Five controlled cases each have frozen, heat and film arms: separated parallel caps; crossed caps; a cap meeting an impermeable rectangular domain hole; the same initial excess inscription with that hole opened; four equal prescribed doses followed by inactivity. All arms in a case share the same rasterized input/source. Crossed caps are a summed height field, already connected; they are not independent fibers passing over one another. The obstacle is an excluded2D region, not a deforming3D protrusion or pinned contact line.

Heat is `h_t=D Laplacian(h)+s`, with D=16.488801738871686 fixed before results by one linear-rate match at h_ref=.35 and k_ref=pi/(2*.08). It is a smoothing Null, not a physical substitute for wetting. Neither its rate nor the film parameters were fitted to the pair output.

Shared finite-volume faces impose zero mass flux and the natural slope boundary. The solver freezes positive mobility at the previous step and uses a convex split: surface energy and repulsive potential implicit, attractive potential explicit. Sparse Newton solves use positivity/residual backtracking; no height floor or mass renormalization occurs. The scheme records the estimate `E_new-E_old+dt p^T A p dx^2<=tolerance`. [Related convex-splitting analysis](https://arxiv.org/abs/2012.11802) motivated the construction; that paper's different potential/mostly constant mobility theorem is not represented as a proof of this code.

There are25 runs:15 primary controlled arms, six pair grid/timestep/wetting/precursor sensitivities, and four conditional ANT-input arms including a timestep comparison. All completed with zero numerical retries. All25 budget checks passed. Maximum recorded absolute mass error over all arms is3.44e-15 dimensionless volume. Actual liquid height remains positive. Source work is separately recorded; source-free energy descent is checked only for film, not imposed on heat under the film energy.

## What changed in the controlled pair

The initial two excess ridges are separated at each of the fixed observer levels h-b=.05,.125,.25. Under film dynamics they spread toward each other, develop a raised bridge, and leave one region at the low and middle levels through the endpoint. The high-level regions disappear eventually; their zero count is not recorded as fusion.

| Pair, N64, t*=.02 | Frozen | Heat Null | Capillary film |
|---|---:|---:|---:|
| Peak h | .59587446 | .14197903 | .26570879 |
| Components above h-b=.05 | 2 | 0 | 1 |
| Components above h-b=.125 | 2 | 0 | 1 |
| Components above h-b=.25 | 2 | 0 | 0 |
| Final minimum h | .1 | approximately.141978 | .09316910 |
| Cumulative absolute face transport | 0 | .78253682 | .29212196 |

The low/middle single-component tails last t*=.0199/.0198 (199/198 illustrative seconds). This is finite-horizon ridge persistence, not a rigid or permanent object. Pressure is still nonuniform at the endpoint, so it is not a certified equilibrium.

Transport is not inferred from changing colors alone: the face flux reconstructs each cell's mass change in a focused test. The pair has essentially zero flux across its exact symmetry plane while fluid approaches that plane from both sides. Cumulative absolute transport counts repeated face crossings; .29212 is not unique parcel displacement and cannot be compared with .04198 as a fraction of distinct liquid particles moved. No provenance tracer separates newly dosed liquid from precursor liquid.

The film also depresses some cells below the initial background b: final precursor deficit volume is .00085685, in cells occupying27.54% of the domain area. Total h remains positive. Positive-source heat diffusion cannot lower its initial minimum, apart from numerical roundoff. This maximum-principle contrast shows that the film result is not simply a different amount of this ordinary heat smoothing. It does not establish superiority or a new solid material.

## Refinement: final morphology is more stable than connection time

Fine grids are restricted to coarse cells by2x2 volume averaging. The L1 differences below are divided by initial excess volume. Initial quadrature differences are retained separately in the machine record.

| Pair comparison | Final normalized L1 difference |
|---|---:|
| N32 versus N64 | .00204311 (0.2043%) |
| N64 versus N128 | .00065526 (0.0655%) |
| dt1e-4 versus5e-5 at N64 | .00308934 (0.3089%) |
| dt5e-5 versus2.5e-5 at N64 | .00230970 (0.2310%) |

Final peaks for the timestep ladder are .26570879/.26537723/.26515759. These decreasing differences support stable endpoint morphology in the tested ladder. They do not establish a formal convergence order or exact continuum solution. N32 resolves the initial clear gap with only1.28 cells and remains a coarse diagnostic.

Early connection times are less resolved. At the middle contour the first one-component time is .0002/.00015/.0001 as dt is halved. At the low contour it is .0001/.0001/.000075. Do not report a calibrated physical merger time from this evidence. Heights/regions, neck profiles, initial gaps and complete count histories are preserved together rather than reducing coalescence to one threshold event.

## Boundary, property and supply-off results

The obstacle and open-domain cases start with identical excess volume .012864234. In the open case, .001318364 excess volume enters the would-be obstacle footprint by the endpoint. In the excluded case, that region contains no active liquid cells; all crossing faces are absent. Final film peaks differ (.18317487 open versus.20906020 blocked). Boundary conditions materially affect redistribution. This is not evidence of adhesion or mechanical anchoring, and this obstacle case has no full resolution ladder.

At N128, changing W from.5 to2 changes final excess-height morphology by9.12% normalized L1. Halving b to.05 changes it by25.39%. The latter changes the existing liquid reservoir and mobility as well as wetting-front regularization. It is not a numerical truncation-error estimate. These changes are much larger than the primary mesh differences, so precursor/wetting assumptions are consequential. Each sensitivity has only one fine-grid run; no zero-precursor limit or parameter-independent coalescence law is established.

The prescribed supply-off case deposits total volume .004 in four pulses and receives nothing from t*=.002 onward. Its final film peak is .13727239 versus frozen.73808629 and heat.10400009. All three positive observer-level regions have disappeared in the final film. Thus the model does **not** turn every wet inscription into a persistent high ridge. That negative result was preserved without dose, position, threshold or viscosity adjustment.

## Fixed ANT contact input: a conditional shadow

The exact seed20261005 CONTROL capture at918764c supplies1,909 groups and5,677 individual feet with authored payload time in[0,60)s. The pinned compressed input hash and every extracted row were independently checked. All arms use every valid foot. No ANT world was rerun or modified.

Assumptions: each foot adds1e-5 dimensionless volume (0.1pL under the illustrative units), within a compact radius.04 footprint. No strength-to-force conversion is used. Sources are placed at the right edge of their declared one-second bins, with up to one assumed second of delay; original sub-tick times remain in the ledger. The60s boundary includes the last dose. Supply then stops through120 assumed seconds. This is not exact sub-tick fluid forcing and is not evidence that real ANT material contains that water.

Total supplied volume is.05677 (567.7pL illustratively), identical in all arms. At120s:

| Conditional foot-dose shadow | Frozen | Heat | Film |
|---|---:|---:|---:|
| Peak h | .67487345 | .17358902 | .25197773 |
| Components at excess levels .05/.125/.25 | 5 / 2 / 1 | 1 / 0 / 0 | 1 / 1 / 0 |
| 60–120s normalized L1 change / supplied volume | 0 | .29398386 | .19325798 |

The timestep-halved film endpoint differs by .00091944 normalized L1 (0.0919%) and peak .00016998. No natural-input mesh ladder was run. The same recorded activity therefore produces different **assumed-liquid** histories, including continued source-free redistribution and a middle-level region surviving to the endpoint. This supports conditional input compatibility, not a discovered ANT material law or proof that a new opportunity formed naturally.

## Implication for ANT and smallest next question

The experiment offers an actual process missing from Frozen Plate: current geometry is a dynamical state with a mass budget and pressure-driven flux after inscription. Its distinctive behavior does not require a new source selector, immutable material episode, aesthetic merger rule or audio resonator. A future provenance ledger could remain immutable while current material position/height evolves separately. That architecture possibility is a research inference, not an implementation recommendation.

The present law cannot provide independent strand identity, over/under support, stress-bearing bonds, curing, elastic motion or sound. If those responsibilities are desired, their states and energy/transfer laws still need independent justification. A high ridge in this experiment is liquid, not a String, Plate or acoustic cavity.

The smallest justified next question is whether the intended substrate is genuinely prewetted, and whether the same one-pair phenomenon remains interpretable as the precursor assumption is reduced with adequately resolved wetting fronts. The existing25.39% half-precursor difference prevents treating that choice as harmless numerics. No further run, new material candidate or mechanism is automatically authorized or performed here.

## Reproduction and delivery

[Raw run receipts](data/summary.json), [all quantitative comparisons](analysis/comparisons.json), [fixed atlas](ATLAS.md), [validation](VALIDATION.md), [reproduction commands](README.md), [manifest](manifest.json), [SHA256SUMS](SHA256SUMS). Independent numerical and post-run reviews are linked there. The primary pair and conditional ANT film reruns are byte-identical in NPZ/CSV/JSON; all comparison and visual outputs regenerate deterministically.

This pass ends with25 cases of one liquid model. No extra candidate, dry-solid physics, audio render, production change, PR, merge, formation adoption or Residence work occurred.
