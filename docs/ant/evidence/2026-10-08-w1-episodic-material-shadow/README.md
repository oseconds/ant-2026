# W1 episodic crystallization and material character — stopped at a directional attribution gap

**Decision: W1 is incomplete. Stop at the first uncharacterizable closed episode. Do not adopt production changes or advance to feedback.**

The one declared family was implemented and tested. Natural archive analysis stopped at 82.01666666666765 s in seed 20261005. Episode 18 met the geometric persistence rule, but its sole admitted cell had no actual FOOT_CONTACT during the declared admission-through-closure character window. Assigning directionalOrder would require changing attribution semantics or inventing a substitute. Neither was done. Seeds 20261006 and 20261007 had their complete inputs verified, but their W1 mechanisms were not run after this global stop.

This is a failure of the declared local character estimator's coverage, not missing trajectory direction across the archive. The same cell has two direction-bearing contacts before admission. The pass therefore does **not** establish that frozen archives cannot support any defensible directional character formulation.

## Scope and implementation facts

- Branch starts at `225757b18f29c706d84a7e639c63d6a3543644b4`, verified as the requested latest `origin/main` at start.
- Tooling / ordering / frozen-input dependency commit: `ecc66263f81bce09e8792f7abf3460ddfad3b3ed`. Generated results and the stop chronology are committed separately.
- Production `TrailPlateBirth`, `MaterialStratigraphy`, movement, fields, renderer, audio, substrate, recruitment and social observers are unchanged. No dependencies or package configuration changed.
- No ANT natural run was rerun. Replay here means detached analysis of frozen packets and recorded trajectories/contacts. Repository tests exercise their existing synthetic fixtures separately.
- Exactly one formation family was evaluated. No selector variant, absolute-threshold retune, area veto, template, forced closure or second character estimator was added after the stop.
- Material geometry remains a cell union. The skeleton exists only for measurement; there is no acoustic graph compilation or character feedback.

The [ordering chronology](../../daily/2026-10-08-w1-material-before-vitality.md) records material ontology before vitality as a new decision. Historical daily entries retain their earlier ordering.

## Exact mechanism and character definitions

[DESIGN.md](DESIGN.md) contains the formulation fixed before natural mechanism analysis; its hash is embedded in `results/analysis.json.gz`.

| Quantity | Fixed value / definition | Reason and limit |
|---|---|---|
| Spatial grid | 96 × 96, original cell indices | Preserve frozen input geometry |
| q | Original flags: chemical memory ≥ .30, conditional support ≥ .015, ≥2 distinct accumulated actual contact timestamps | All three required; count is cumulative, not recent |
| Recent filter F | EMA, τ = 20 s | Existing chemical-memory / temporal-persistence concept |
| Established filter S | EMA, τ = 90 s | Existing corridor refractory interval reused as an explicit modeling proxy; not SurfaceField decay or biology |
| Active contrast | F − S > α − β; α = 1 − exp(−dt/20), β = 1 − exp(−dt/90) | Strictly exceed one qualified observation's contrast from rest |
| Episode lineage | 8-connected current components; identical-cell overlap between successive observations | No source, boundary, target, tree or spatial interpolation |
| Persistence | last-active minus first-active ≥20 s | Short closed episodes discarded; open episodes never forced closed |
| Frozen geometry | Exact union of admitted active cells across a space-time lineage | Splits retain history; merges retain all ancestry. Union need not be connected at one instant |
| consolidation | Mean per-cell chemical-and-mechanical qualified sample fraction, admission through closure inclusive | Bounded threshold-duty proxy; not grayscale amplitude, area, lifetime, stiffness or quality |
| directionalOrder | Travel-weighted nematic magnitude, deduplicated ant + completed segment end, actual feet in admitted cells during admission through closure | Reversal invariant. No body-heading substitution, lifecycle bridge, future interpolation or invented stationary direction |

The filters start at zero; first observation has dt = 0. No current-q gate or material-growth rule supplements the contrast. Constant support produces a finite contrast pulse in fixtures. This does not prove finite closure for spatially evolving natural lineages.

Both character axes are mathematically bounded in [0,1]. The first episode without positive valid travel raises `W1CharacterDataGapError`. The structured artifact records the failure, then terminates mechanism processing. It does not silently remove the episode, assign zero, or relabel unknown orientation as isotropy.

## Causal provenance and hashes

The input loader uses complete committed 60 Hz trajectory packets and timestamped actual feet from `docs/ant/evidence/2026-10-07-social-graph/data/`. Recorded body headings exist but are not used as travel direction. The latest completed consecutive position segment supplies orientation and travel distance; a binary search uses actual recorded times. No future segment enters a contact observation.

| Seed | Contact groups | Foot records | Direction-bearing feet | Missing direction feet | W1 analysis |
|---|---:|---:|---:|---:|---|
| 20261005 | 35,751 | 105,759 | 105,753 | 6 | Stopped at 82.017 s |
| 20261006 | 35,377 | 104,829 | 104,823 | 6 | Inputs verified only |
| 20261007 | 35,448 | 105,001 | 104,998 | 3 | Inputs verified only |

The recording has 36,001 trajectory frames through 600 s. The field package has 599 observations through 599.2500000000696 s. Contacts after the final field observation remain archived but do not enter a completed field interval; counts are recorded in each coverage object.

Field decisions and the previous local-accretion comparison are **byte-identical copies** from commit `13ffc9f42bc32083c87c6b1c97bc82092e03e472` on `ant-local-accretion-shadow`. [baseline-copies.json](validation/baseline-copies.json) maps every copied file to its source Git path and SHA-256. All 13 copied files are checked against both the descriptor and original Git object. The topology implementation is copied byte-for-byte from that branch; tests adapt only the import path.

The earlier user-authorized saved-snapshot expansion is preserved in [INPUT-PROVENANCE.md](inputs/field-decisions/INPUT-PROVENANCE.md), [input-gap.json](inputs/field-decisions/input-gap.json) and the three metadata files. They list all **25 timestamps with four omitted cells**, exact original snapshot paths, arrays, prior committed hashes, packaged-input hashes and reproduction/parity history. The full saved streams had already matched hashes in the committed interior-endpoint replay evidence. That expansion added frozen analysis inputs, not a change to the original runs or old summaries. W1 reuses the resulting packets; it does not read, rewrite or repack the saved full streams. The earliest omission in seed 20261005 was at 133.017 s, after this W1 stop, so those omissions do not explain the 82 s character gap.

Per-cell predicates are exact, but continuous field amplitudes exist in this package only at the three historical milestones. Consolidation therefore supports a threshold-duty interpretation only. Individual ants cannot be causally assigned to a chemical/mechanical region from these predicates alone.

[protected-source.json](validation/protected-source.json) records 46 production/configuration file hashes at start. [preservation.json](validation/preservation.json) verifies final hashes and Git blobs. [checksums.json](checksums.json) inventories the final package; [reproduction.json](validation/reproduction.json) records separate-output byte comparisons. The checksum inventory excludes itself and its staged-byte verification ledger to avoid circular hashes.

## Exact stop event

| Observation | Value |
|---|---|
| Seed / lineage | 20261005 / episode 18 |
| Cell | 5636; x=68, y=58, zero-based |
| Birth / first admission | 32.01666666666757 s |
| Last active | 81.01666666666736 s |
| Closure | 82.01666666666765 s |
| Persistence / observed duration | 49 s / 50 s, within floating-point timestamp precision |
| Geometry | One cell; one component; no hole |
| Character-window actual feet | Zero |
| Typed stop | `NO_VALID_DIRECTIONAL_TRAVEL` |

The cell's accumulated contact bit first appears at 22.01666666666684 s. Joint chemical/mechanical support becomes qualified at 31.016666666667494 s and ceases at 61.01666666666351 s. Contrast activity outlasts that support. The two actual cell contacts are at **20.698480728859334 s** and **21.057294646400457 s**, both from ant-11 and both direction-bearing. They precede the episode's admission and are excluded by the declared character window. The artifact retains their completed movement-segment times, nematic vectors and travel weights, alongside every causal predicate observation through closure.

The captured ancestry sets account for every allocated ID 0–141: 142 distinct IDs across open lineages and this unresolved closure, with no discarded episode and no missing ID. Given the implementation's monotonically allocated IDs and disjoint closed/open ancestry, this verifies that no additional persistent closure at the stop frame was omitted by stopping character iteration. This check uses the captured output, without another mechanism run.

This demonstrates a mismatch between delayed history-transition formation and an admission-only contact-attribution window. It does not show that the ant lacked direction or that the cell had never received repeated contacts. Whether earlier causal contributions should form the character is a design question left for review, not silently repaired here.

## Observed prefix geometry

At the stop, no episode had frozen successfully with both required character axes. The failed geometric closure is stored as **closed-character-unresolved**, separately from accepted frozen episodes.

| Measure at 82.017 s, seed 20261005 | Frozen W1 | Pending lineage union |
|---|---:|---:|
| Occupied cells | 0 | 678 |
| Arena fraction | 0% | 7.3568% |
| Components | 0 | 49 |
| Largest component share | Undefined | 86.4307% (586 cells) |
| Component areas | None | min 1, median 1, p90 4, max 586 |
| Skeleton endpoints / junction nodes | 0 / 0 | 52 / 116 |
| Primary topological holes / graph cycle rank | 0 / 0 | 54 / 54 |
| Hole areas | None | 34 one-cell pores; max 40 cells |
| Holes ≥18-cell review scale | 0 | 1 |
| Isolated components / isolated components ≥18 cells | 0 / 0 | 45 / 0 |

The primary hole metric uses bounded 4-connected background regions with 8-connected material. The 18-cell reference is one existing .025 contact-support-radius disk on this grid, rounded up. It is a descriptive spatial scale, not an episode or acceptance filter. Full component/hole distributions remain in the analysis. The one 40-cell hole exists in **unfrozen pending geometry**; no substantial frozen cycle or isolated material body was demonstrated.

There are 49 right-censored lineages at the stop. The largest has 89 ancestor IDs and began at 14.017 s. Forty-eight pending components are smaller than 18 cells. This supports an early speckle warning and substantial merging already in the prefix. It cannot establish eventual one-blob convergence, coherent distinct closures, sustained novelty, or a late-time formation rate.

Trailing-20-s raw foot traffic occupies 1,733 cells. Pending material overlaps 432 of them; Jaccard mismatch is .781708. This compares point-cell traffic against integrated material history, not a causal assignment. Frozen-history mismatch is 1 because the validated frozen set is empty, so it has no useful material-memory interpretation here. At the same observed time, historical production occupies 0 cells and previous local accretion 365 cells.

Per-observed-lineage birth times, last-active times, ancestry, status and morphology are in [observed-lineages.csv](results/observed-lineages.csv). [episodes.csv](results/episodes.csv) and [milestones.csv](results/milestones.csv) contain headers only because no complete frozen episode or requested W1 milestone was reached. The stop metrics are in [stop-snapshot-metrics.csv](results/stop-snapshot-metrics.csv).

## Historical comparison, not W1 milestones

These are immutable prior production/local-accretion observations reproduced from the comparison archive. W1 has no 120/300/599 s result. The baseline figures explicitly say W1 is unavailable.

| Seed | Production cells 120 / 300 / 599.25 s | Previous local-accretion cells 120 / 300 / 599.25 s | Prior local final largest share |
|---|---|---|---:|
| 20261005 | 231 / 4,377 / 6,149 | 1,014 / 4,326 / 6,002 | 99.7168% |
| 20261006 | 0 / 3,333 / 6,114 | 723 / 3,959 / 5,915 | 99.4252% |
| 20261007 | 0 / 4,072 / 6,458 | 847 / 4,033 / 5,993 | 99.4827% |

Fixed-scale masks and fields use actual archived times 120.0166666666787, 300.01666666664977 and 599.2500000000696 s. [baseline-milestones.csv](results/baseline-milestones.csv) retains areas, components, endpoints/junctions and holes for every prior milestone.

## Character distributions and finite influence audit

**Valid two-axis frozen episodes: N=0.** Min/max, mean/median/quartiles, ECDF, histogram, axis correlation, size/duration/novelty correlations and early/mid/late character evolution are unavailable. [character-distributions.json](results/character-distributions.json) uses explicit null statistics and input-only seed statuses. Empty scatter/distribution panels state the data gap; no artificial points or zero coordinates are drawn.

The bounded representations are numerically safe in focused fixtures: consolidation is an average of fractions in [0,1]; directionalOrder is the normalized magnitude of a positive weighted mean of unit nematic vectors, with roundoff bounded at 1. Reversal, perpendicular/isotropic travel, duplicate feet, intermittent support, future exclusion and missing travel are tested. No natural distribution exists here to assess saturation, rare extremes, near-constancy, correlation or proxy duplication.

Bounded coordinates alone would not guarantee bounded future influence. A naive singular mapping near an endpoint, or multiplying a bounded coordinate by unbounded area/lifetime/layer count, could still create dominant influence. The observed large merged pending lineage illustrates the entity-size hazard independently of either axis. No future mapping or coupling is implemented or solved in W1.

## Failure-mode review and empirical decision

| Failure mode / question | Evidence-supported assessment |
|---|---|
| Directional attribution | **Observed stop:** first persistent closed cell has no feet in the declared character window |
| Near-zero materialization | No validated frozen unit before the stop; this is caused by the character gate and is not a 600 s formation conclusion |
| Speckle | Early warning: 48 of 49 pending components below the 18-cell review scale; first closure is one cell despite 49 s persistence |
| One huge late component / arena saturation | Unavailable: stopped before 120 s; no late W1 measurement |
| Continuous background formation | Constant-q fixture closes; natural long-term behavior unavailable |
| Re-inscription / novelty | Undefined with zero validated freezes; do not interpret undefined as perfect novelty |
| Hidden tree bias | No path/tree generator; exact ring fixture preserves a hole; natural pending topology also contains holes |
| Coherent separate frozen episodes | Not demonstrated; 49 open lineages are not 49 finished material episodes |
| Distinct character information | Unavailable, N=0 |
| Avoided previous late-blob failure | **Not established** |

The allowed research conclusion is narrow: the fixed episodic contrast family produces deterministic early spatial lineages, but this exact material-plus-character contract fails on its first persistent closure. It does not establish a broader deterministic frozen-material vocabulary or compare complete W1 performance across seeds.

## Artistic / modeling interpretation

The pending prefix visually resembles a branching central fan with thin excursions and tiny detached patches. Those words describe an observed unfrozen image, not acceptance criteria, biological structures or a successful material ecology. The 40-cell pending hole is topological evidence; the many one-cell pores are not meaningful artistic loops. No complete episode can yet be assessed as historically legible two-dimensional material character.

The smallest next decision is to review the causal attribution interval for directional character. Existing pre-admission contacts remain available. A defensible treatment of their contribution must be specified before another analysis; it should not be replaced by an arbitrary constant, a morphology-size exclusion or a broader production intervention. No next estimator, mechanism family, vitality link or feedback run is selected automatically here.

## Reproduction and validation

From repository root, with Node 22.23.2 and pinned Python plotting dependencies:

```powershell
node scripts/ant-w1-analysis.js test-results/w1-episodic-reproduction/results
uv run --with matplotlib==3.11.2 --with numpy==2.3.5 python scripts/ant-w1-plots.py --input docs/ant/evidence/2026-10-08-w1-episodic-material-shadow/results/analysis.json.gz --output test-results/w1-episodic-reproduction/plots
node scripts/ant-w1-verify.js
node --experimental-test-isolation=none --test tests/ant-material-morphology-metrics.test.js tests/ant-w1-inputs.test.js tests/ant-w1-crystallization.test.js tests/ant-w1-character.test.js tests/ant-w1-analysis.test.js
npm test
npm run build
git diff 225757b18f29c706d84a7e639c63d6a3543644b4 -- src static package.json package-lock.json AGENTS.md
```

Default analysis output is this package's `results/`; use the explicit second directory when reproducing evidence. Its normal successful process exit means the structured stop artifact was produced and validated, **not** that W1 completed. Inspect top-level `status: stopped-data-gap`. Analysis repeats the same reached prefix internally under a throwing `Math.random` trap; separate CLI invocations and paired plot renders also reproduce byte-for-byte. Source hashes are checked on every loader call.

Byte reproduction is verified in the recorded Windows environment with the specified runtime/dependency versions. Protected working-file hashes describe that checkout's line endings; recorded Git blobs provide canonical source identity across checkouts. Numeric analysis and plot reproduction are checked separately.

Focused tests pass **38/38**. Full `npm test` passes **330/330**. Build passes with the existing large-chunk warning. Logs are in [validation/](validation/). Topology fixtures cover rings versus solid blobs, diagonal connectivity, small pores, isolation, boundary openings and index validation. Episode fixtures cover constant support, one observation, short discard, exact geometry, split/rejoin/cross-merge aliases, finite filters and future-prefix invariance. Character fixtures and the analysis stop fixture prove no silent fallback and no future effect on a closed result.

Fixed-scale PNG/SVG plots are in [plots/](plots/) with deterministic SVG IDs and hash inventory. Browser QA was omitted because nothing is integrated into the renderer or worklet. Numerical replay and plot evidence are separate from production visual/audio validation.

The chronology records an implemented, validated, **scientifically stopped** pass. The next W1 formulation remains unapproved; W2 and later causal links remain unimplemented.
