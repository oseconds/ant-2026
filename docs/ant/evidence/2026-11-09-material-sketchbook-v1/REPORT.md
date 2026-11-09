# Material Sketchbook v1 — Open Material Laws

Two independent virtual material worlds are executable in a new page. Subtraction changes retained connectivity without adding mass; local time changes the organisation trajectory through a spatially varying kinetic rate. The result is an observation instrument with mixed, bounded outcomes, not a material selection or production proposal.

Main authority: `6dc73380b1985102bc2fb50da8963a7de5a89c71`. Starting v0 research authority: `150dc23f3252c201d18906f1b71570aeea552a7d`. Both remote refs were fetched before work. Branch: `codex/ant-material-sketchbook-v1-open-laws-20261109`. Design and observation choices were delegated by the author; they are not an adopted ANT ontology.

## Run

```sh
npm run dev
```

Open `http://127.0.0.1:5173/ant-2026/material-sketchbook-v1.html` (or Vite's reported port). The original ANT entry and v0 page remain available. The new page provides two paired worlds, seed, wandering/stationary/no input, run/pause/reset, display speed, global simulation time, optional internal views, and JSON save/replay. Changing a world or input pattern resets it. Speed changes the number of fixed updates, not the material laws. Observation/replay is bounded to one hour.

Records reconstruct from seed, input pattern and exact tick and compare the entire resulting state before replacing the current world. The record includes configuration, input/RNG history state and material state. V1 has no audio resources or probe. The existing v0 sound path is preserved separately.

For the measured seed-06 late organisation comparison, choose T, seed `20261006`, wander and observe to 300 s. An exact browser-console reconstruction is:

```js
materialSketchbookV1.select('T', 20261006, 'wander');
materialSketchbookV1.advance(18000);
```

## Laws and critical design choices

Exact laws, inputs, boundaries, alternatives and scope are in [PROTOCOL.md](PROTOCOL.md), [subtractive model](model-subtractive.md) and [local-time model](model-local-time.md). These are invented rules with explicit states and numerical checks. No physical calibration claim is made.

| World | State and interaction | Paired control |
|---|---|---|
| Subtractive Formation | 144 fixed unit-mass nodes, 264 initial bonds, scalar internal displacement and seeded incompatible preferred edge offsets. Overdamped relaxation redistributes internal mismatch. Activity and strain-dependent slow fatigue irreversibly reduce bond strength; exact zero removes coupling. | Same initial offsets, relaxation and fatigue, with no activity. Autonomous initial-state evolution is therefore measured rather than attributed to contact. |
| Heterogeneous Local Time | A bounded organisation field interacts with neighbours and a bistable local potential. Activity changes a recovering condition field. Positive nodewise rates multiply actual organisation updates and integrate local ages under one global tick. | Same initial organisation and incoming activity, but one spatially uniform rate equal to the local field's mean at every tick. Mean elapsed material time is matched. |

Both grids have fixed geometry and unit mass at every node. Subtraction changes relations, not node positions or mass. The local-time field is nonconserved organisation, not density; a white cell does not mean that mass disappeared. Its local clock is mathematically a positive spatial kinetic mobility, not an additional global simulation timer.

Subtraction was chosen over pure mask erasure so internal state can matter after input. Moving fragments were omitted because motion/contact would be an additional world law. Local-time organisation was chosen over a displayed clock or an asymmetric purported mass flux. The organisation dynamics descend an explicit energy; no mass-conservation claim is made for the organisation sum. This differs from v0's accumulated/diffusing mass, independent leaky memory and conserved capacity redistribution.

Before observation, independent design review improved two controls. A uniform rate of one would confound spatial heterogeneity with mean slowdown; the implemented control matches mean rate. Turning fatigue off from the beginning would not isolate its post-input effect; the implemented ablation shares exactly the first 40 s of physical state and only then disables fatigue.

## Bounded measured results

The predeclared core cases are seeds **20261005/20261006**, **wander/stationary** activity and checkpoints **0/20/40/120/300 s**. Both worlds receive the same synthetic two-source activity generator, interpreted by different laws. No real ANT trajectory or contact replay was used. Additional cases are two no-input local-time checks and the two predefined ablations. In total: **12 cases, 60 saved states**, with exact same-runtime deterministic reruns. No seed search or aesthetic retuning occurred.

Full tables and source/state hashes: [observations.md](observations.md), [data manifest](data/manifest.json). All conditions are retained, including near disappearance of the visible organisation contrast.

### Subtraction: internal history continues, but large new fragments were not found

At 300 s the four activity cases had **8–20 exactly removed bonds** and **2–8 connected components**, while their no-activity controls remained connected. The main component retained **137–143 of 144 nodes**. The remaining components were single nodes. Thus the observed split is chiefly local isolation and weakening around a large surviving body, not a discovery of several substantial detached structures.

For seed 20261005 / wander, the active sample reached 11 removed edges, 2 components and mean bond `0.79016` at 40 s. From that exact state:

| Continuation at 300 s | Removed edges | Components | Mean bond |
|---|---:|---:|---:|
| Normal fatigue continues | 20 | 2 | 0.67593 |
| Fatigue disabled from tick 2400 | 11 | 2 | 0.79016 |

The continuation isolates post-input weakening; it does not show additional fragmentation in this particular pair. The two stationary conditions had eight removed edges by 20 s and no later edge removals, although surviving bonds kept weakening. Initial internal mismatch also drives the no-activity control: seed 05 control mean bond declines to `0.84562` by 300 s, with no exact edge deletion. Activity accelerates and spatially redistributes loss within a world that was already internally strained.

Energy accounting closes within numerical roundoff (seed-05 wandering samples at 300 s: residual magnitudes below `5e-15`). Relaxation and bond removal both dissipate the model's potential. This is internal model accounting, not measured physical energy.

Actual browser frames: [initial](browser/default-S-0.png), [40 s](browser/default-S-2400.png), [120 s](browser/default-S-7200.png), [300 s](browser/default-S-18000.png), [internal scalar displacement](browser/diagnostic-S-120.png). Fixed locations and unequal bond weights remain explicit.

### Local time: history can alter organisation, and can also become visually irrelevant

With no input, local and uniform samples have exactly equal organisation and age arrays at all saved checkpoints for both seeds. With activity, average local ages match to floating-point precision, but local ages vary in space. Real organisation trajectories differ; this is not merely a clock/colour overlay.

| Input condition | Organisation L2 difference at 40 s | At 300 s | Local age spread at 300 s |
|---|---:|---:|---:|
| seed 05 / wander | 0.9673 | 7.95e−21 | 53.82 s |
| seed 05 / stationary | 0.3711 | 1.24e−22 | 62.77 s |
| seed 06 / wander | 1.188 | 2.082 | 53.40 s |
| seed 06 / stationary | 0.4977 | 0.7831 | 62.77 s |

Seed 05 approaches the low-organisation basin in both samples: its default 300 s frame is nearly blank. All 144 unit masses and the age differences remain. Local age difference alone therefore does not guarantee a retained organisation difference.

Seed 06 retains organisation differences through 300 s, when rates have almost recovered. In its wandering case, mean material age is approximately `289.215 s` in both samples; local ages range approximately `246.597–300 s`. Its lowest current local rate is approximately `0.999992`, yet organisation L2 remains `2.082`. This is evidence of a different finite-horizon trajectory after timing differences, not proof of permanently different attractors or irreversible material memory.

The coupling-off ablation also has transient paired differences. At 40 s, seed-05 L2 is `1.0838` without coupling versus `0.9673` with coupling. Thus a nonzero difference alone does not establish a collective spatial effect: independent nonlinear relaxations at different local ages already differ. Coupling changes the trajectory; this pass does not establish a universal direction or magnitude for that change. Without coupling, each node ultimately approaches its own initially selected reaction basin, potentially a spatial 0/1 mosaic.

Actual default-seed frames: [20 s](browser/default-T-1200.png), [40 s](browser/default-T-2400.png), [300 s](browser/default-T-18000.png), [rate at 120 s](browser/diagnostic-T-rate-120.png), [age lag at 120 s](browser/diagnostic-T-age-120.png). The second seed's full states and exact reproduction conditions are preserved numerically rather than selected for an attractive extra image.

## What is implemented, inferred and still open

**Implemented fact:** subtraction weakens/removes bonds, relaxes internal scalar state and accounts for dissipated potential. Local time changes coupled organisation through actual positive rates, with mean-matched and no-input controls. Both are renderer-independent deterministic simulations.

**Measured result:** the fixed cases exhibit post-input bond weakening, mostly singleton isolation, transient local-time differences in one seed and organisation differences still present at 300 s in the other. No invariance of artistic outcome across seeds is established.

**Virtual-law interpretation:** material can be a changing relationship or organisation history rather than an append-only object. The controlled examples support exploring this reading. They do not establish a natural material ontology, real fracture, a physical phase transition or correct ANT behavior.

**Artistic possibility:** absence, remaining weak connections, unequal ages and convergence can be observable material events. The default blank frame is a useful counterexample to assuming that every retained history must stay visible. Whether these understated states are worth sustained attention is an artist's judgment, not a metric verdict.

## Potential relationship to ANT

Individual `FOOT_CONTACT` positions/times could supply an activity field, as current SurfaceField and material contact counts already consume individual positions. Mapping contacts into damage or local mobility would still be a new authored constitutive assumption. Event strength is not measured force. The synthetic walkers here establish no natural ANT-input effect.

Subtraction offers a mutable coupling history that production's immutable Plate births do not express. Its initial random preferred offsets are a declared initial condition, not history created by ants. A future causal world would need to examine how such internal reference state arises from formation history before adopting it. It would also need to define what changing relations mean alongside current exposure/depth; forcing this into immutable Plate descriptors is not decided here.

Local time offers a way for recent activity to change how existing material evolves while global world time continues. It does not change ant speed, scheduling, pheromone, SurfaceField or recruitment in this pass. It might remain an independent medium rather than become a Plate replacement. The current organisation variable has no automatic layer-count or acoustic meaning.

Neither world is an oscillator, radiation model or sound generator. Dissipated energy and evolving organisation are not automatically audible excitation. Any future mechanical/audio responsibility requires its own explicit causal model and separate investigation; the v0 frequency/gain diagnosis provides no evidence that these new states should use its common probe.

Useful unresolved questions include whether subtraction's after-effect depends on inherited loop mismatch, and whether seed-06 organisation histories eventually reconverge under the fixed law. They are not automatically executed as follow-up experiments. No winner or production roadmap is selected.

## Verification, preservation and reproduction

[VALIDATION.md](VALIDATION.md) records numerical tests, actual browser controls, fixed captures and preserved boundaries. Existing v0 A/B/C, Monitor Gain, peak meter, probes and evidence remain byte-identical to the starting research state. Production sources and current behavior remain unchanged.

```sh
node --test tests/material-sketchbook-*.test.js
npm test
npm run build
node scripts/material-sketchbook-v1-observe.js
node scripts/material-sketchbook-v1-browser-check.js
node scripts/material-sketchbook-v1-evidence.js
```

The observation verifier checks saved state payloads against their hashes and deterministic regenerated states. `--record` explicitly regenerates only this pass's generated observations or browser captures. Read reproduction instructions before overwriting. Manifest/checksums cover the source, evidence and daily record; verification also guards production and old research paths against the frozen authorities. Exact replay is verified within tested engines; cross-engine bit equality remains unproven.

The full suite is **369 pass / 2 existing failures / 371 total**; the old north-heading and renderer-cache assertions are preserved and not counted as successes. Focused v0/v1 tests are **29/29 pass**. Build passes. Browser checks cover both new worlds, v0 controls/probes and production entry load, with zero browser errors. There is no PR, merge, production adoption or audio DSP change.
