# Pheromone representation contract investigation — 2026-10-24

## Decision

**CONTRACT MUST CHANGE FIRST.** Writer and reconstructed readout must be specified together. No single replacement representation is selected for implementation in this pass, and no replacement writer/reader prototype was built. The new code is an assert-based geometry/counterexample probe only.

The current conjunction is impossible: a nonnegative 96 × 96 nodal field cannot preserve the exact physical first moment of every positive point write while updating only nodes within radius 0.0045. Resolution can remove that geometric impossibility, but it does not by itself preserve the chemical units, reconstructed footprint, Gaussian profile, saturation behavior, or cue quality. Choosing a particular higher-resolution writer now would silently settle those modeling choices.

The CIC diagnostic chain is closed at its existing result. Gate 2 remains **MIXED / NOT QUALIFIED**; Gate 3 remains **NOT RUN**. The local-cue benefit is an important constraint for a future candidate, not evidence that any representation proposed here retains it.

## Baseline, scope and provenance

- Repository: `https://github.com/oseconds/ant-2026.git`.
- Freshly fetched `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Latest research evidence tip / branch point: `d375ea64844933a0f59940c5a465229e76f6e649`, on `codex/ant-cic-wide-stage-attribution-20261024`.
- This branch: `codex/ant-pheromone-representation-contract-20261024`.
- Merge-base with main: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- At entry, tracked working-tree diff was empty. Production `src/`, `static/` and canonical `docs/ant/README.md` match main. No old research source was merged into production.
- Preserved unrelated untracked directories: the 2026-10-22 recruitment-founder, route-curvature, spatial-dynamics and visual-turnover evidence packages. Preserved `scripts/ant-exhibition-recent-stills.js`.
- Preserved the separate `ant-material-experience-shadow/ant-2026` worktree at `a9c138e8fff3ebfec45c09f2f391d8e6f5aedfdd`, branch `codex/ant-base-born-causal-decomposition-20261014`. No new worktree was created.

The canonical ANT hub and latest related evidence/dailies were read. `world-model.md` supplies future design constraints, not implementation facts. Archive material was not accessed. [Source/probe receipts](./probe-receipt.json) pin the actual bytes used; [validation](./VALIDATION.md) records checks and review.

## Current implementation constraints

**IMPLEMENTATION FACT.** [PheromoneField](../../../../src/lib/agents/ant/PheromoneField.js) has these defaults:

| Property | Actual behavior |
| --- | --- |
| Grid | 96 × 96 endpoint nodes, physical coordinates `(i/(N−1), j/(N−1))`; constructor permits 2–512 per axis |
| Storage | Nonnegative Float32 scalar values, per-node cap 8 |
| Writer | Gaussian node weights with sigma `R/2`, normalized to requested dose, disk cutoff `R = 0.0045` |
| Empty support | Entire dose goes to nearest rounded node, which can be outside the requested radius |
| Saturation | Each node clamps separately; lost dose is not redistributed |
| Return value | In-domain `depositPoint` returns requested amount, even when less is stored |
| Reader | Bilinear interpolation; queries outside `[0,1]²` return zero |
| Decay | Uniform exponential factor, half-life 15 seconds, Float32 stores |
| Segment API | Clips travel to the domain, deposits midpoint slices at spacing at most half the grid pitch; shares the brush |
| Snapshot | Detached values; `totalMass` is the unweighted sum of node values |

The default controller uses gaster dabs; the segment API remains an additional caller of the brush. A grid change would also change segment subdivision if that API were used.

[AntController](../../../../src/lib/agents/ant/AntController.js) samples the same scalar field for local and wide sensing. Wide sensing takes a weighted maximum over transverse offsets `[-1, −0.5, 0, +0.5, +1]`, with weights `[0.55, 0.775, 1, 0.775, 0.55]`. Local sensing uses weighted cross-section samples. This pass changes neither.

The representation reaches more than the movement reader:

| Consumer | Coupling that a future representation must specify |
| --- | --- |
| Controller local/wide sensing | `.sample()` values feed fixed nonlinear response scales |
| [ColonyActivation](../../../../src/lib/agents/ant/ColonyActivation.js) | `.sample()` enters a response with half-saturation 0.04 |
| [TrailPlateBirth](../../../../src/lib/agents/ant/TrailPlateBirth.js) | `createPheromoneSampler()` prefers raw `.values/.width/.height`, builds its own bilinear sampler, and only then falls back to `.sample()`; chemical memory stays on its own 96 × 96 grid, half-saturation 0.04 |
| [AntRenderer](../../../../src/lib/renderers/AntRenderer.js) | Snapshot raw values use a fixed alpha mapping, including thresholds 0.004–0.180; no current-field normalization |
| Storage diagnostics | `totalMass = Σ values`, not the physical integral of the bilinear surface |

**ENGINEERING INFERENCE.** Changing only `.sample()` to compensate for a new grid or new subcell data would leave material formation reading different units or a different representation. This is a caller contract problem, not a reason to alter material law in this pass.

## Established evidence retained without rerunning the chain

The following numbers were read from the committed reports. They are inherited experimental evidence, not new measurements here.

| Evidence | Result and provenance |
| --- | --- |
| [CIC qualification](../2026-10-24-ant-cic-writer-qualification/REPORT.md), `1fbfec5943c41ad6c8b3828fb48c47828d9be817` | Uncapped dose/physical moment gate passed within derived storage-error bounds. Local directional errors 552 → 0 / 4,012. All-row steering MAE 0.065053540 → 0.022254856 rad / 5,544. Wide mismatches 2,378 → 2,378 / 5,072, hiding 92 recoveries and 92 new errors. S analytic-zero false-nonzero count 364 → 377 / 392, while magnitude decreased. Gate 2 failed its guard conditions. |
| [Wide attribution](../2026-10-24-cic-wide-stage-attribution/README.md), `05c855cac06dd3659abfc1502e91071980ecc00b` | All 92 new-error full rankings first differ at raw-max. Target first loses top position at raw-max in 66 and weighted max in 26. No first target loss occurs at Hill/scoring. These are distinct stage definitions. |
| [Transverse profiles](../2026-10-24-cic-transverse-sample-diagnostic/README.md), `fb8f0ce009a96f1f2a8aecb80078de53a0454d56` | All 26 weighted-max-first cases have target outer ±1 raw argmax replaced by inner ±0.5 after weighting; rival stays at ±0.5. Target switches 26/26; rival switches 0/26. A switch alone is insufficient: production profiles can switch without crossing. |
| [Profile substitution](../2026-10-24-cic-sample-profile-substitution/README.md), `d375ea64844933a0f59940c5a465229e76f6e649` | C target-only restores 12 weighted / 16 final; C rival-only 18 / 20; paired C profiles restore 26 / 26. Under the unchanged operator the profile pair is sufficient for that frozen cohort. |

**INTERPRETATION BOUNDARY.** CIC changes the footprint and the transverse profiles, but those studies do not isolate “broader support” as the sole cause of each error. Nor do they show that replacing the sensor would solve a natural movement problem. Analytic A is a continuous engineering reference, not biological or natural ground truth. Moment preservation, cue fidelity, and movement success remain three different questions.

## Feasibility: nonnegative centroid and compact support

Let a positive actual added amount be `A`, the source position be `p`, and the available physical node positions be `S = {q : |q−p| ≤ R}`. Ignore cap and floating-point roundoff initially. Seek increments `wq ≥ 0` with

```text
Σ wq = A
Σ wq q = A p.
```

Dividing by `A` gives a convex combination. Such increments exist **if and only if `p` lies in the convex hull of S**. Necessity follows directly from the definition. Sufficiency follows by multiplying the convex weights by `A`; in two dimensions at most three nodes suffice. This is an existence statement, not a deposition algorithm or a profile-quality guarantee.

### The current 96 × 96 grid

```text
h = 1/95 = 0.010526315789473684
R/h = 0.4275
2R = 0.009 < h.
```

Distinct grid nodes are at least `h` apart. A disk of diameter `2R < h` can contain at most one node. With one node, the only possible centroid is that node. With no node, the compact-support problem cannot accept any positive dose. Therefore **every off-node point fails the joint exact-centroid/strict-nodal-radius requirement at this resolution**. The current fallback supplies dose by abandoning the radius, not by solving the moment constraint.

**NEW CONSTRUCTIVE PROBE RESULT.** The unchanged production field yields:

| Fixed point | Nodes inside R | Stored amount | Centroid/support result |
| --- | ---: | ---: | --- |
| Exact node `(48h,48h)` | 1 | 1 | Exact nodal centroid |
| Quarter-pitch offset `(48.25h,48h)` | 1 | 1 | Centroid shift `h/4 = 0.00263157894737` |
| Cell center `(48.5h,48.5h)` | 0 | 1 | Fallback distance `h/√2 = 0.00744322927565 > R` |

This is a structural incompatibility, not a gain, threshold, or sensor-weight choice.

### Resolution bounds: distinguish four contracts

For a square nodal lattice, the following uniform all-position bounds differ:

| Requirement | Necessary and sufficient geometric radius bound | Minimum N at R = 0.0045 |
| --- | --- | ---: |
| At least one node in every source disk | `R ≥ h/√2` | 159 |
| Some nonnegative exact-centroid nodal weights exist for every source | `R ≥ √5 h/2` | 250 |
| Every active corner of a four-node CIC write is within R | `R ≥ √2 h` | 316 |
| Entire CIC-write + bilinear-read nonzero footprint is within source radius R | `R ≥ 2√2 h` | 630 |

These are mathematical bounds for the stated ideal arithmetic/support contracts. They do not qualify a grid size, chemical kernel, or future candidate. Gaussian normalization by itself does not enforce the moment constraint even when more nodes are available.

For the centroid bound, take a point just right of a grid line, halfway between rows: `p=(ε,h/2)`. Some positive weight must lie to the right of the line. The nearest such node approaches distance `√(h²+(h/2)²)` as `ε→0+`. A smaller radius fails for some points. Conversely, choose the nearest node and the two axis neighbors toward `p`. With absolute offsets `a,b≤h/2`, use weights `1−a/h−b/h, a/h, b/h`. They are nonnegative, reproduce `p`, and each active vertex is at most `√5 h/2` away. On domain edges, zero-weight outward vertices are unnecessary; all active vertices can remain in-domain.

The new probe checks that 159 and 249 grids still fail the grid-line witness, and that 250 supplies nodes across it. It checks 10,201 fixed triangle certificates. The proof establishes all-position feasibility; a finite mesh does not.

Four-corner CIC has a different maximum active-node distance: approaching a cell corner makes the opposite corner approach `√2 h`, with arbitrarily small but positive weight. With bilinear reading, a query in the diagonally adjacent cell can share that corner. Source and query can approach distance `2√2 h`. The fixed witness uses source `(εh,εh)` and query `((2−ε)h,(2−ε)h)`, with `ε=1e-4`. Its shared-corner contribution is `ε⁴ ≈ 1e-16`. This proves a **strict nonzero support** limit, not perceptual importance, a wide-sensor failure, or a useful magnitude threshold.

The constructor currently rejects N=630. The geometric threshold N=316 is within its limit but bounds writer nodes only: its full reconstructed support can approach 0.008979, almost twice R. Picking 316 without defining the radius meaning would leave the contract ambiguous.

## Why resolution or first moment alone is insufficient

### Writing radius is already different from reading radius

**NEW ISOLATED PRODUCTION RESULT.** A unit point deposit exactly on an interior production node gives sample `0.4000000000000057` at distance `0.6h = 0.00631578947 > R`. A node's bilinear hat extends beyond the writer disk. “Preserve compact support” therefore needs an explicit object: deposited node locations, reconstructed field, or sensor-effective signal above a specified level. This pass does not invent a signal cutoff to make one family qualify.

### Dose and sampled concentration currently share an implicit grid scale

For an isolated unit interior node, integrating the bilinear surface gives `h²`, not 1. A nonnegative nodal mass distribution with sum `A` has reconstructed integral `A h²` when all basis supports are interior. At an edge a basis has half that integral, and at a corner one quarter. Thus keeping `Σvalues` unchanged while refining the grid changes the physical integral seen through the reader. Interior first moments of symmetric hats agree with nodal moments up to the common area factor; clipped boundary hats do not.

The probe records the formula at the derived resolutions. At 96, `h² = 0.0001108033241`; at 316, `h² = 0.00001007810532`. These are unit/integral facts, not forecasts of every point sample or route peak. A density interpretation could divide mass by basis area, or retain legacy signal units through an explicit reference-area conversion. Either option needs a shared consumer contract. Blindly changing dose, cap, or half-saturation constants is not a representation-only repair.

### Cap and boundary qualifications are essential

With cap, feasible centroid weights must also satisfy `wq ≤ remaining headroom(q)`. Total free capacity is insufficient. Two nodes at 0 and 1, source 0.5, dose 1 require weights 0.5/0.5. Headrooms 0.125/1 sum to 1.125 but cannot store that dose at that centroid. The actual production probe returns requested amount 1 while adding only 0.125 to a nearly capped single node. A future contract must name requested amount, actually added amount, and rejected loss separately. Exact moments must be conditional on feasible uncapped writes, or require an explicitly different saturation law.

For nodal moments at `x=0`, nonnegative exact-centroid weights must all have `x=0`; CIC can do this with boundary-column nodes. For the **continuous reconstructed field**, a nonnegative regular kernel on `x≥0` cannot have positive interior mass and centroid exactly at `x=0`. A clipped bilinear boundary hat shifts its x centroid inward by `h/3`. Keeping dose, regular two-dimensional kernel shape, exact continuous centroid, and domain truncation simultaneously is impossible there. Nodal and continuous moments must not be silently equated.

### First moment does not preserve short-route direction

**NEW ALGEBRAIC COUNTEREXAMPLE.** Within one cell, equal half-dose writes at `(0.25,0.5)` and `(0.75,0.5)` give four CIC weights `[0.25,0.25,0.25,0.25]`. The perpendicular pair `(0.5,0.25)` and `(0.5,0.75)` gives the identical array. Both dose and centroid are exact, while pair orientation is lost. This is a shape-function calculation, not another CIC field replay. Higher resolution reduces the physical scale of this ambiguity; it does not eliminate all subcell direction loss. An explicit direction requirement needs its own spatial scale and observable, not a first-moment proxy.

## Candidate-family comparison

No scalar ranking is used. The rows describe families, not implemented alternatives.

| Family | Preserves or can preserve | Gives up / still needs |
| --- | --- | --- |
| Finer grid, same normalized compact Gaussian | Nonnegative values, uncapped node-sum dose, intended nodal radius where support exists, Gaussian sampling intent | Exact centroid generally absent; reader halo, raw-value units, cap scale, direct-array consumers and segment subdivision change; local benefit untested |
| Finer grid, moment-constrained compact nodal weights | Nonnegative dose/centroid/radius become mathematically feasible at N≥250 | A constraint-satisfying profile is a new algorithm; Gaussian fidelity, phase continuity and readout footprint do not follow from existence |
| Finer four-node CIC | Algebraically simple uncapped dose/centroid; all writer nodes inside R at N≥316 | Gaussian profile replaced; full readout radius R needs N≥630; units/cap/boundary and direction-scale choices remain; no retained-local-benefit evidence at new resolution |
| Coarse cells with mass + subcell moments | Aggregate mass/centroid can survive without a globally fine scalar grid | Existing bilinear scalar reader cannot use the extra state; reconstruction/merging required; first moments alone lose orientation and multimodality |
| Compact positioned deposit/kernel list | Source positions and an interior symmetric compact kernel can be retained directly | Exact exponential decay never removes a deposit in finite time; bounded storage requires a cutoff/merge contract; cap and scalar snapshots need new semantics; not the smallest safe next implementation |

Signed interpolation weights would evade the convex-hull restriction by sacrificing nonnegative chemical storage. Increasing radius on the current grid would sacrifice the requested compact physical footprint. Neither is selected. A higher resolution also changes work and storage: N=316 has 99,856 scalar slots / 399,424 Float32 bytes, versus 9,216 / 36,864 at 96. Those are counts only; no runtime or browser measurement was performed.

## Contract required before selecting one implementation

The next action is a small **contract decision**, not another diagnostic on the 26 rows and not a new algorithm tournament. It must settle:

1. **Physical signal and units.** Does dose mean nodal sum, integrated concentration, or legacy reader units with an explicit reference area? All consumers, including raw snapshot readers, must obtain the same declared signal. Keep decay semantics explicit.
2. **Support object.** Does R constrain node updates or the entire reconstructed response? If only an effective footprint matters, define its magnitude/second-moment criterion before seeing candidate results. Exact support and small tails are different requirements.
3. **Moment scope and resolution.** Retain nonnegativity. State whether exactness concerns nodal increments or the continuous signal, and distinguish uncapped interior, domain boundary, and cap loss. Specify which short spatial scales/directions must remain distinguishable; exact first moment alone is insufficient.
4. **Legacy boundaries.** Preserve outside rejection and requested-vs-stored accounting explicitly. Do not silently redistribute saturated dose, redefine cap 8, or alter chemical-memory thresholds to compensate.

**Recommended conservative scope for a future implementation:** qualify representation properties first on feasible uncapped writes; report cap loss and boundary exceptions rather than promising unconditional conservation. Treat writer plus scalar reconstruction/snapshot interpretation as one engineering interface, while keeping sensor geometry and weights fixed. This is a proposed research contract boundary, not production adoption.

No unique single candidate follows until items 1–3 are fixed. In particular, “high-resolution CIC at 316” and “compact reconstructed physical kernel” answer different questions. The former is a simple conditional family if the chosen radius bounds *writes only*, but is **not the selected next candidate** here. Selecting it now would conceal the unresolved readout/support and unit choices. No second or third implementation was attempted.

Why not change the sensor first? The convex-hull impossibility occurs before sensing. Sensor tuning cannot restore source position lost by the writer, and could compensate for one profile pair without defining the stored chemical object. Conversely, a writer-only qualification cannot promise unchanged wide behavior when its reconstruction changes. The contract must cover the representation/reader pair; no claim says the current sensor is universally correct.

## Claim taxonomy and stop

- **IMPLEMENTATION FACT:** defaults, fallback, clamp, bilinear read, constructor bound, raw-array material consumer and fixed display mapping.
- **INHERITED EXPERIMENTAL EVIDENCE:** original CIC local gains, mixed wide/zero-cue outcome and frozen profile sufficiency. No old gate was recomputed or reclassified.
- **NEW CONSTRUCTIVE / ALGEBRAIC RESULT:** three production writes, read-tail and cap examples, fixed geometry witnesses, 10,201 triangle certificates and perpendicular-pair ambiguity in [probe-results.json](./probe-results.json).
- **MATHEMATICAL / ENGINEERING INFERENCE:** convex-hull theorem, all-position resolution bounds, mass/readout scaling and boundary impossibilities. The finite probe is corroboration, not the proof.
- **OPEN MODELING CHOICE:** desired physical kernel, exact-moment scope, units, support definition, direction scale, and acceptable cap/boundary exceptions.
- **ARTISTIC / DESIGN INTERPRETATION:** none tested. No visual asset or human judgment is used to select a field representation.

No production candidate or exhibition candidate is qualified. This pass ends at **contract must change first**, with reader/representation co-design required at the interface level. This does not authorize sensor redesign. Full fixed-cue Gate 2, movement Gate 3, natural runs, recruitment/material/audio changes and production adoption were not performed.

## Reproduction

From repository root, Node ≥20, no new dependency:

```powershell
node scripts/ant-pheromone-representation-feasibility.js
git diff --check
```

The script contains assert-based self-checks, writes only this package's `probe-results.json` and `probe-receipt.json`, and prints the deterministic result hash. It imports only the unchanged production field and Node standard libraries. [PROBE-SCOPE.md](./PROBE-SCOPE.md) was written before execution. Repeated output hashes and ordinary regression/build checks are recorded in [VALIDATION.md](./VALIDATION.md).
