# Production material → locomotion causal tail

**Decision: SUFFICIENT CURRENTLY. Temporary organism after-effect / vitality: PARK.**

Baseline is live remote `main`, `37131e0c408a9692ecc364ef7298a71c5e7182ad`, fetched and verified with `git ls-remote` at the start of this pass. The starting working tree was clean; this research branch was created from that baseline. Production source and parameters are unchanged. No archive was used as an investigation source.

The current world already carries a local influence through existing movement and environmental state. The measurements do not expose an explanatory gap requiring an additional organism state. This is a bounded modeling decision for the current world question, not proof that every future artistic property can be supplied by these mechanisms.

## What changed in the experiment

Current production is default **On**. At each prospective simulation-age tick gate 200, 350 and 500 s, select the first natural tick with a live ant at L > 0, using the lowest numeric ant ID. Each trial forks independently from the untouched natural world; no outcome or future exit is used for selection. Accumulated simulation time has ordinary floating-point drift (the 20261007/200 timestamp is 199.999999999975 s); selection uses the integer tick gate.

For one focal acceleration call only, divide its already multiplied speed argument by tick-entry `m(L)`, and set `targetSpeed` consistently. The original production acceleration method runs once. This removes that tick's local resistance relative to a sham control. Heading and intent at the acceleration boundary, other ants, clock, material, fields, RNG and lifecycle state start identical. The wrapper is removed immediately. Both arms then use the same default-On production law for the remaining run.

The intervention lasts **1/60 s = 16.67 ms**. The focal ant can remain exposed for longer afterward. Treatment end, each arm's first exit, and the first jointly unexposed boundary are therefore distinct. The last boundary requires both ants live and both center-cell L values equal to zero. Feet may still contact material. L=0 means this locomotion input is inactive, not complete physical separation from material.

Runs use seeds **20261005, 20261006, 20261007**, fixed 60 Hz, 600 simulation seconds, the counted LCG, and no audio bridge. [Pre-run design](design.md), [source/carrier audit](source-audit.md), [execution manifest](data/manifest.json), [complete trial results](data/trials.json), and [CSV-derived measurements](measurements.json) record the exact scope.

## Focal movement after the direct condition ends

Only jointly L=0 ticks with finite post-tick movement values enter this table. Position cutoff is `1e-5` in normalized world coordinates. Speed/velocity cutoff is `1e-5`, heading `1e-4` radians and per-tick displacement `1e-7`. These are descriptive coordinate thresholds, not perceptual or biological acceptance limits.

| Seed / age gate | Actual impulse time s | L / prior continuous exposure s | First joint L=0 s | Last above-cutoff position sample after joint exit s | Longest uninterrupted above-cutoff position bout s | Joint L=0 samples |
|---|---:|---:|---:|---:|---:|---:|
| 20261005 / 200 | 200.2833 | 1 / 0 | 200.5667 | 10.9000 | 4.7833 | 367 |
| 20261005 / 350 | 350.0000 | 4 / 3.8667 | 350.0500 | 27.6167 | 0.4333 | 106 |
| 20261005 / 500 | 500.0000 | 1 / 19.9167 | 505.5000 | 15.4833 | 0.8500 | 83 |
| 20261006 / 200 | 220.0167 | 1 / 0 | 220.7000 | 25.4833 | 11.8000 | 1194 |
| 20261006 / 350 | 350.0000 | 6 / 3.9167 | none before censor | — | — | 0 |
| 20261006 / 500 | 500.0000 | 12 / 17.0000 | none before censor | — | — | 0 |
| 20261007 / 200 | 200.0000 | 3 / 1.4333 | none before censor | — | — | 0 |
| 20261007 / 350 | 350.0000 | 1 / 0.0667 | 354.9167 | 17.2833 | 6.5500 | 645 |
| 20261007 / 500 | 500.0000 | 6 / 13.9000 | none before censor | — | — | 0 |

CSV times label tick entry; movement is measured at its endpoint, 1/60 s later. Rounded durations above retain that convention. Retirement censors the comparison; the four absent joint exits are **unobserved post-exit outcomes**, not null effects. The largest delay to selection is the 20261006/200 gate, which waits until 220.0167 s for an eligible natural ant. All nine selections are retained.

There is no single natural recovery time or fixed ordering across these cases:

- In 20261005/200, scalar-speed and displacement differences stay below their descriptive cutoffs throughout the 367 off-material samples. Position remains above cutoff, while velocity-direction and heading differences also remain measurable. Maximum off-material position difference is `2.0778e-4`; scalar-speed maximum is `4.1787e-6`. RNG remains aligned through focal retirement.
- Other cases can lose small speed differences and later regain them as trajectory, encounters and subsequent inputs diverge. A late difference is not an uninterrupted after-effect. Position/heading/velocity can outlast a scalar-speed difference; their maxima after RNG divergence must not be interpreted as the size of a pure mechanical response.
- Before the first RNG divergence, all five cases already have jointly L=0 position differences above `1e-5`; off-material maxima are respectively `2.0778e-4`, `7.2712e-5`, `5.3178e-4`, `3.4031e-4`, `5.0500e-5`. This prevents the existence of the focal tail from resting solely on later random-stream amplification.
- All five subsequently have material reentry with a position difference still above cutoff. Four encounter a top Plate different from the selected one; 20261005/200 only reencounters the same top Plate while both focal ants live. These are downstream opportunities and renewed direct inputs, not continuation of the original treatment interval.

The [isolated mechanical reference](mechanical-reference.json) uses the real `AntAgent.accelerateToward()` with a common constant speed/heading after one resistance impulse, without sensing, gait, deposition or collisions. For L=1/4/10/35, velocity falls below `1e-5` after **0.1333–0.1833 s**, and below `1e-12` after **0.6333–0.6833 s**. Integrated position offsets remain `2.4630e-5`–`1.1133e-4` at 1 s. Its exponential recovery is assert-checked against the production 32/s acceleration rate. These times describe this isolated reference; natural runs have changing common and divergent inputs.

## Existing-state carriers

At each of the five first joint-L=0 boundaries, four **10 s synthetic restarts** use identical production dynamics:

- `fullRestore`: complete control state; negative control.
- `mobileOnly`: treated agents plus gait, pose, gaster, RNG and lifecycle clocks; control environment.
- `worldOnly`: treated pheromone, SurfaceField, Plate births, stratigraphy and colony activation; control mobile state/RNG/lifecycle.
- `pheromoneOnly`: treated pheromone instance; everything else control.

All hybrid entries begin with focal center L=0 in both arms. A later reentry is recorded. These are state-block sufficiency probes, not additive mediation fractions or an assertion that each hybrid is a naturally occurring world.

| Case with joint exit | Mobile-block maximum focal position difference | World / pheromone-only maximum focal position difference | First world / pheromone-only focal response after restart | RNG during world / pheromone probe |
|---|---:|---:|---|---|
| 20261005 / 200 | `1.2382e-4` | 0 | none | aligned |
| 20261005 / 350 | `8.4359e-2` | 0 | none | aligned |
| 20261005 / 500 | `1.4543e-1` | `4.0160e-8` | 0.9000 s; both L=1 at onset | aligned |
| 20261006 / 200 | `3.3703e-5` | `3.5552e-6` | 2.0333 s; both L=0 at onset | aligned |
| 20261007 / 350 | `7.1530e-2` | `1.2959e-12` | 0.4833 s; both L=0 at onset | aligned |

`fullRestore` produces exact full-state and contact-payload equality in **5/5** probes. `mobileOnly` produces focal differences in **5/5**; it preserves a block, so it cannot distinguish position from gait, decision clocks or RNG quantitatively. The table's probe maxima use all both-live probe samples, including exposed intervals; they are not L=0-conditioned maxima. The large mobile maxima in three cases occur with RNG drift and/or reentry. The smaller position difference in the 20261006/200 mobile probe persists with aligned RNG throughout. The primary CSV, rather than this probe maximum, supplies the clean jointly-L=0 and pre-RNG measurements.

`worldOnly` and `pheromoneOnly` reproduce the same small focal response in **3/5** cases; it is zero in the other two. They are below the `1e-5` position cutoff, and the 20261007/350 response is near the numerical cutoff. First response while jointly L=0 in 20261006/200 and 20261007/350 supports an existing pheromone-state route without a new direct material multiplier or initial mobile difference. In 20261005/500 the first response follows reentry, so that case is not an isolated unexposed chemical-tail demonstration. Full world state is exactly restored after 10 s in only 20261005/350; 20261005/200 retains environmental differences despite no focal response.

Source and measurements support the following distinct paths:

1. Resistance → velocity / integrated position / existing movement state → later trajectory. The isolated reference, natural pre-RNG tail, and mobile-block probes support this path.
2. Changed travel / secretion → pheromone state → later sensing / movement. The pheromone-only restart supports a small response in a subset, including two jointly unexposed onsets. It does not establish that pheromone is the dominant natural carrier.
3. Changed movement → gait phase / FOOT_CONTACT timing and location → SurfaceField / formation history. Gait-phase differences occur in all nine impulse ticks; focal contact payloads differ in all nine continuations. This carries world history even where a focal joint exit never occurs.
4. Changed positions → local occupancy signals / encounter opportunity. Signals differ before focal censoring in six of nine cases. No collision-only ablation was performed, so occupancy/collision is a possible additional downstream path, not uniquely isolated mediation.
5. Changed event/lifecycle branches → shared sequential RNG call schedule → further colony divergence. This is part of the current executable complete state, and an important amplification limitation. It is not evidence of organism experience memory.

## Colony and world consequences

Every treatment world differs from its control at the **600 s** endpoint, after all focal paired comparisons have already been censored by retirement. For the five cases with an observed joint exit, this is a sampled endpoint **94.50–399.43 s after that exit**, and **100–400 s after the one-tick impulse**. It is a horizon-limited descendant-world difference, not continuous residence of the original experience in one organism or a measured decay constant.

| Seed / gate | Control → treatment Plate count at 600 s | Pheromone L1 difference | SurfaceField L1 difference |
|---|---:|---:|---:|
| 20261005 / 200 | 29 → 30 | 259.6142 | 527.6945 |
| 20261005 / 350 | 29 → 29 | 299.6132 | 502.2496 |
| 20261005 / 500 | 29 → 28 | 248.5098 | 243.3079 |
| 20261006 / 200 | 33 → 29 | 241.2964 | 550.3896 |
| 20261006 / 350 | 33 → 30 | 257.7409 | 455.8613 |
| 20261006 / 500 | 33 → 33 | 259.6160 | 303.0922 |
| 20261007 / 200 | 38 → 38 | 260.0363 | 154.3726 |
| 20261007 / 350 | 38 → 37 | 262.8819 | 443.2651 |
| 20261007 / 500 | 38 → 37 | 276.1780 | 258.8156 |

L1 sums use the existing fields' stored units and are not effect-size or perceptual calibrations. Plate descriptors differ in **9/9**, including equal-count cases. Matched other live ants also differ at 600 s; birth/retirement histories and RNG streams differ. Nodule count stays 32 in every arm, which does not imply all nodule descriptors are identical. Plate-count direction is not consistent and no directional production claim is made.

The first RNG divergence occurs **2.85–359.12 s after the impulse**, depending on the case. Particularly, 20261007/200 only changes the RNG schedule around 559.12 s, long after the focal ant retires at 201.5333 s. Early contact/immutable material differences precede that RNG shift. This is an example of an existing environmental history surviving the originating ant, not portable organism memory. Long-horizon colony magnitudes include this shared-stream sensitivity; they cannot be attributed exclusively to pheromone or friction.

## Validity, verification and limitations

- Production text matches the exact baseline Git blobs after CRLF→LF comparison; exact Git-blob and executed-byte SHA-256 values are both stored. Source hashes are identical before and after the main execution.
- Forks retain prototypes, maps, arrays, frozen property descriptors and graph aliases; initialized state is copied without constructors/init or random draws. Independent RNG closures begin with the same state and call count.
- Every impulse asserts one focal acceleration call, heading/intent equality at its boundary, same RNG state/calls for that tick, corrected target speed and restoration of the original method. Division has ordinary floating-point rounding; it does not claim bit-for-bit recovery of pre-multiply arithmetic.
- Every sham control has exact complete-model-state parity with the untouched natural controller at 600 s. A separate [unobserved natural replay](unobserved-natural-replay.mjs) imports only production code and uses no clone, snapshot or runner instrumentation; all three seeds match RNG, population/spawn/retirement, contact points, Plate/Nodule counts, raw pheromone/SurfaceField hashes and agents JSON hashes exactly.
- Research tests cover material-state independence and internal aliases, sham/event/RNG parity, one-tick target/intent semantics, restoration, and a real mature seed checkpoint. Focused **3/3**, full suite **301/301**, and production build **PASS**. Build retains dependency annotation and bundle-size warnings; there is no new production code.
- The mechanical reference replay has identical SHA-256 and analytic residual checks. The stdlib summary has an assert-based check for discontinuous threshold bouts, finite values and the nine-case matrix, plus exact natural replay assertions.
- Preflight process-spawn and Git-text/CRLF comparison failures are retained in `validation/`; they were resolved before the successful experiment, not omitted as experimental outcomes. Child-process execution needed host permission; no production mutation was required.
- CSV contact onsets identify the interval containing the event. `trials.json` first contact/material divergence is detected at the following boundary from the preceding event buffer; allow a one-tick timestamp difference. Contact onset reporting uses the CSV-derived current-tick value. World samples are one second apart. Probe maxima are not L=0-conditioned, and their reentry counter follows the hybrid arm; the primary CSV records both arms for clean interval comparisons. Endpoint ant comparisons match IDs and do not assert matched birth times after lifecycle divergence.
- Five post-exit cases and four censored cases across three deterministic seeds are not a population estimate. Layer count, prior duration and age were not independently randomized, so no monotonic layer/duration relation is established.
- This estimates a **single tick's total consequence inside an On world**, not the full exposure episode, all possible seeds, biological friction/memory, perceptual salience, acoustic output, or a continuously unexposed 600 s focal response. Center L=0 still permits foot-material contact. Splices do not identify unique mediation fractions. No longer horizon was needed to demonstrate a world tail.

Fresh GPT-6 Luna Max [independent review](independent-review.md): **PASS WITH LIMITATIONS; no blocking issue for this bounded decision**. It independently supports SUFFICIENT CURRENTLY / PARK and emphasizes censored exits, small environmental responses, reentry-inclusive probe maxima and shared-RNG amplification. It is separate from the pre-run audit and implementation agent.

## Decision and future responsibility

**SUFFICIENT CURRENTLY** follows from an interpretable pre-RNG focal tail, existing mobile-state sufficiency, small but directly tested pheromone-mediated responses, and durable descendant environmental/material differences. The four censored cases limit post-exit generalization; they do not erase the supported paths or establish that a new organism state is necessary.

Temporary organism after-effect / vitality stays **PARK**. A future proposal would need an independently desired responsibility: two ants with the **same current complete production state and same environment/RNG** should respond differently solely because of prior material exposure, for a specified bounded duration and observable output. It would need to define what exposure information is stored, its creation boundary, decay/termination, and the exact behavior it changes. This pass establishes no such requirement and selects no new state, duration, gain or steering effect. Looking more alive or extending a trace's duration is insufficient justification.

## Reproduction and files

Use a fresh output directory. The main runner refuses existing files and verifies the production baseline is an ancestor and production text remains unchanged. Run from repository root with Node 22.23.2 (or record a different runtime separately):

```powershell
node scripts/ant-material-causal-tail.js --seeds=20261005,20261006,20261007 --ages=200,350,500 --seconds=600 --output=test-results/material-tail-reproduction
node docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs test-results/material-tail-natural.json
node scripts/ant-material-mechanical-reference.js test-results/material-tail-mechanical.json
python scripts/ant-material-causal-tail-summary.py test-results/material-tail-reproduction --output=test-results/material-tail-measurements.json
node --test tests/ant-material-causal-tail.test.js
npm test
npm run build
```

`python` must resolve to Python 3; this run used the installed Codex Python runtime. Main measurement inputs are the six `data/seed-*-focal-ticks.csv` / `data/seed-*-world-seconds.csv` files and `data/trials.json`. [Package SHA-256 manifest](package-hashes.json) covers all evidence and research tools, including validation logs. [Daily chronology](../../daily/2026-10-12-material-causal-tail.md) records the question, method corrections and decision. No PR, merge, force-push or production adoption belongs to this pass.
