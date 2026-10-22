# Recruitment / founder-condition survey — preregistered boundary

## Question and baseline

How strongly does the persistent north-biased recruitment initial condition constrain colony spatial composition, and is a state-conditioned recruitment family worth a later closed pass? This is a research survey, not production recruitment adoption. Scripted phases, composition objectives, parameter searches and selector changes are excluded.

Freshly fetched production baseline: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. New primary-worktree branch: `codex/ant-recruitment-founder-survey-20261022`. No previous research `src/` changes are inherited. Prior visual evidence is read by exact Git reference (`deda54e6b3419af1abbfb6263adf81c4ac462a66`, `c1332b8e686fd9f7099c8b33a8a017b6ce31cf63`), not merged. `docs/ant/world-model.md` is a future contract; archive paths are excluded.

The user has authorized source audit, clean controls, a finite representative family survey and downstream observation where warranted. The following settings are selected before their outputs are examined.

## Stage A — heading-only controls

- Seeds: `20261005`, `20261006`, `20261007`.
- Duration: 600 simulated seconds each, fixed 1/60-second steps, fresh natural controllers.
- Variants: current baseline; static +π/2 rotation with original ±0.3 spread; static π reversal with original spread; isotropic heading from the same accepted-spawn uniform variate.
- All accepted recruits, including the first spawn, receive the respective initial heading. Position remains in the same original disk. This tests a continuing initial-condition bias, not only the first individual founder.
- Preserve actual default material locomotion resistance, scalar activation feedback, spawn scheduling/clearance/retries, lifecycle, movement, deposition, contact, SurfaceField, selector, history capacity and material semantics. Audio resources are absent, as in existing offline model tooling.
- No observer/policy RNG draws. Baseline instrumentation must match an uninstrumented production controller under exact tick/RNG/event checks before scenario runs.
- Record accepted spawn timing, positions, applied heading, RNG state/count and first divergence; divergence after altered movement is a total-effect consequence under shared-stream coupling, not all-time common-random-number parity.

The finite domain is not rotationally symmetric about the nest at (0.5,0.72). A reversed ant reaches the lower exit sooner. Changes in exits, activation and population after intervention are endogenous consequences. Do not describe the result as a pure geometric rotation or force equal populations to manufacture a comparison.

## Stage B — conditioning selection gate

After source audit and Stage A, choose at most two representative state-conditioned mechanisms with exact rules recorded before execution. Compare them against baseline and isotropic controls; removing north bias and reading state are different interventions. Prefer one evidence family with/without slow shared memory if that isolates the important uncertainty. Congestion, whole-scene feedback and moving ports remain alternatives unless evidence justifies replacing that shortlist.

Any longer extension uses a fixed predeclared duration/seed, for persistence diagnosis rather than selecting attractive intervals. No escalating candidate additions or post-hoc parameter tuning. A short successful run cannot establish hours-long recurrent regimes.

### Stage B selection recorded after A, before conditioned runs

Stage A supports a large continuing heading-condition effect in all three seeds. Its 1 Hz availability screen finds the proposed actual-flow N≥3 support in only 13.3–15.7% of baseline samples. This is not an all-tick test, but it makes the existing pheromone-sector evidence the less gate-dependent representative input. The direct-flow/slow-flow shortlist remains an unexecuted alternative; do not loosen its gate after seeing results.

Selected shadows: **pheromoneDirect** and **pheromoneSlow**. These add one world-evidence-to-recruitment link, with the second variant adding only temporal filtering. Use the same 16 angular sectors, radii [0.06,0.09,0.12] and bounded samples `c/(c+0.04)` already used by ColonyActivation. Before sorting/discarding direction, each sector weight `s_j` is the mean of its three bounded samples. Define `q = Σ s_j (cos φ_j, sin φ_j) / Σ s_j`; empty or resultant ≤1e−9 gives q=0. Uniform or opposing balanced sectors can have zero resultant despite strong scalar activation; that is a directional ambiguity, not absence of colony activity.

At recruitment use R=|q|, φ=arg(q), heading half-spread `w=π−(π−0.3)R`, and `θ=wrap(φ+(2U−1)w)`. With R≤1e−9 use exactly `θ=−π+2πU`, the matched isotropic null. Use the original accepted-heading uniform draw U exactly once. No north blend or target point. The slow variant filters that same q at every 1/60 tick: `g=(1−α)g+αq`, `α=1−exp(−dt/45)`, initially g=0; apply the same heading rule to g. Zero q decays g rather than resetting it. Use completed-tick evidence for the next tick's possible spawn; record the one-tick observation lag. Init has no evidence and is isotropic.

45 seconds borrows the existing scalar activation timescale solely as a diagnostic comparison. No biological or optimized value is claimed. Smoothing a vector changes magnitude as well as direction persistence; a weaker resulting spread bias cannot be attributed to memory alone without that qualification. Direct and slow are compared against both fixed north and matched isotropic controls.

Finite execution matrix: both selected variants for all three seeds at 600 seconds; then baseline, isotropic, pheromoneDirect and pheromoneSlow for **one preselected seed 20261005 at 1,800 seconds**. The long run is a persistence counterexample screen, not multi-seed hours-long validation. Settings remain fixed even if no compelling temporal regimes appear. Compare the long baseline/isotropic first 600-second prefix against Stage A to validate the tooling revision.

Stage A runtime helper bytes are preserved under `execution-sources/stage-a/` before correcting a field label: its `gyrationRadius` recorded RMS distance from the nest. Correct colony dispersion is derived from stored covariance trace. The current helper reports both correctly named quantities. Raw Stage A artifacts and receipts are not rewritten.

## Measurement and decision

Keep continuous descriptors separate: ant/pheromone centroids, covariance/axis, dispersion, angular occupancy, near-nest share, actual-displacement alignment and normalized angular momentum, directional evidence, spawn manipulation validity, timing/RNG and material envelope where warranted. No scalar novelty score, threshold-defined mode count or biological milling claim.

Capture fixed-time viewport comparisons and trajectories from recorded natural states. Numerical difference is not artistic success. No viewer judgment is inferred if no human reviews the assets.

Material analysis is downstream only after meaningful movement differences; the unchanged selector may retain or compress those differences. The 256 cap, renderer, history compaction and audio architecture are context, not intervention targets.

Final decisions: founder-bias responsibility (SUPPORTED/MIXED/NOT SUPPORTED/INCONCLUSIVE), promising recruitment family or none, and one next closed mechanism with its causal hypothesis, preservation requirements, failure modes and validation. Fresh independent review follows the completed evidence. Only verified new tooling/evidence is committed/pushed; no PR/merge/force-push.
