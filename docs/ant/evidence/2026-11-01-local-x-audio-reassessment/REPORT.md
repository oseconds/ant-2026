# ANT local-X audio architecture reassessment

## Decision

**MULTIPLE COHERENT OPTIONS REMAIN — ARTIST DECISION REQUIRED.**

If designing ANT audio today, I would choose a **sparse spatial mechanical network driven by retained material history, with an independently declared world readout**. I would initially preserve stratified motion and finite local coupling. I would not require every deposition ID to create a separately bounded resonator and two new output pickups. I would also not merge layers merely because their isolated coarse filters match.

This is a concrete architectural direction, not a validated replacement solver. Much of the useful separation already exists in `MaterialStratigraphy`, the topology compiler, one packed worklet, and the bridge. The necessary reassessment concerns the compiler's mechanical degrees of freedom, interface/boundary conditions, discretization, state transfer and readout contract. Another generic wrapper or an unrelated per-event synthesizer is not the recommendation.

Two physical interpretations remain coherent: independently moving laminae with finite interfaces, or bonded deposits represented by effective surface/column mechanics. The measured world does not specify a bonding law. Engineering evidence cannot select consolidation as an artistic/material premise. This pass supports a separate architecture research gate; it does **not** justify production adoption of a new audio model or local-X formation.

## Authority, order and reproducibility

Remote production `main` was initially verified at the frozen experiment authority **bc045dc3caa5954df633ecbee37fbabcb8224f30**. The replacement branch was verified at **d0481760fd44052acbeaaf88c3b171ab2a625601**. The final remote check found `main` had advanced to **5bdd516b412d03d78c2511ceb372180941206968** through archive-documentation commits only; its complete `src` and `static` Git trees remain identical to the frozen authority. Those new archive contents were not read or used to revise this diagnosis. [Delivery authority receipt](validation/authority-delivery.json). Local `main` was stale at `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292` and was preserved. Research branch: `codex/ant-local-x-audio-reassessment-20261101`, based on the replacement commit, with no merge or rebase.

The source-only [independent diagnosis](INDEPENDENT-DIAGNOSIS.md) and [protocol](PROTOCOL.md) were committed at `d2b62f52a85ad7320c9056dc30454808c73972bc`. A [measured candidate record](CANDIDATES-BEFORE-HISTORY.md) then preceded the [historical challenge](HISTORICAL-CHALLENGE.md). Historical alternatives were a late challenge, not the starting design. A fresh [architecture review](validation/architecture-independent-review.md) independently challenged the inference from duplicate filters to redundant state.

Six fresh Audio-Off worlds, three seeds × CONTROL/REPLACEMENT × 300 s × 60 Hz, reproduced their existing saved run headers and chunks exactly. CONTROL additionally passed the frozen current-production authority checks. Observer RNG remained zero; no AudioBridge fed the simulation. [World receipts](analysis/receipts.json) identify all source inputs, compressed captures, schedules and exact baseline hashes. No `src/` or `static/` change was added relative to the replacement base. The inherited default-off research layer provider is not used by either world.

Audio is a downstream counterfactual continuous Audio-On interpretation of those fixed worlds. The actual production compiler and `SurfaceAudioBridge` construct topology and strike messages. The unchanged worklet recurrence then runs inside a real Chrome `AudioWorkletNode`/`OfflineAudioContext`, with deterministic in-processor schedule injection. Tick k dispatches at sample k×800; same-tick contacts precede material/Nodule installation. Events exactly at sample 14,400,000 are separately receipted, outside the rendered half-open interval.

Each render contains 14,400,000 stereo frames and 1,800,000 physics steps. Full prior vibration, pending contact pulses, compliance, sleep state, Z coupling and Nodule state survive topology installation under the native transfer rules. This is not a reset-at-checkpoint render. Every scheduled rendered event arrived at its exact frame; no route/topology rejection or nonfinite PCM/state was observed. [Audio render receipts](analysis/audio-render-receipts.json).

The browser parity fixture includes a pending-pulse topology reinstall, overlapping layers, a same-frame strike and a coupled native Nodule. Whole Float32 PCM after gain 0.7 differs from the uninstrumented VM route by at most **7.450580596923828e-9**, below the preregistered fixture bound of 1e-8. It is numerical parity, **not bit identity** between browser and VM. [Browser receipt](analysis/validation/browser-parity.json). Live MessagePort latency and realtime deadlines are separate, unmeasured questions.

## What the existing architecture preserves

The reference has one shared stereo worklet. It does not allocate an AudioWorkletNode per Plate. It nevertheless makes each material descriptor a separate masked 32-grid solver layer, with independent node vibration/contact state, two descriptor-attached pickups and local overlap springs.

| Responsibility | Current representation | Important limit |
|---|---|---|
| Material provenance/chronology | Immutable 96-grid descriptors and bottom-to-top stratigraphy | B/C label, age and episode identity are not independent constitutive coefficients; Plate ID still keys compatible state transfer |
| Exposure and direct contact | Exact 96-grid top-layer routing | Excitation ultimately projects onto coarse solver nodes |
| Geometry | Any-occupied 3×3 source blocks become binary 32-grid cells; production edges can add diagonal bridges | Partial occupancy and subcell shape are lost; local descriptors have no auxiliary edges |
| Planar vibration | Four-neighbor masked bending/tension recurrence at 6 kHz | Missing neighbors retain the -4 center term: a zero exterior boundary assumption, not a measured local support law |
| Frozen material character | Stiffness, density and damping feed coefficients | Local-X uses shared compatibility-fixture values; no B-material/C-material law was tested |
| History/burial | Exposure controls direct excitation; adjacent source-column entries create Z links | Plate thickness/depth does not directly set planar mass or bending; burial is not an acoustic mute |
| Nodules | Twelve modes per Nodule, foundation coupling and burial-dependent shape | CONTROL has 3–5; REPLACEMENT has zero, so this responsibility differs between worlds |
| Excitation | Finite 3 ms pulse, footprint projection, local 75 ms compliance | Authored strength is simulation metadata, not measured force; posted hardness is not read by `applyStrike` |
| Persistence | Compatible ID/node state copies across topology installations | Audio Off clears vibration; retained material is not permanent nonzero vibration |
| Output | Two pickups per layer, Nodule readout, soft limiter, interpolation and gain | Summed descriptor microphones are not a single spatial listener |

These are implemented responsibilities and authored model assumptions, not a calibrated physical account of deposited material. The current local descriptor's `.9 / 1.1 / .35` coefficients, default modeled thickness and first/last row-major pickups came from structural compatibility. They were not inferred from local formation history. Their artificiality limits any conclusion about the expressive potential of that history.

## What approximately 140 local Plates become acoustically

| Seed | Arm | Material layers | Solver nodes | Z links | Node median / max per layer | One-node layers | Coincident L/R pickups | Native Nodules |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | CONTROL | 14 | 3567 | 3489 | 210 / 385 | 0 | 0 | 5 |
| 20261005 | REPLACEMENT | 156 | 1070 | 411 | 2 / 69 | 43 | 74 | 0 |
| 20261006 | CONTROL | 7 | 1750 | 1344 | 254 / 298 | 0 | 0 | 3 |
| 20261006 | REPLACEMENT | 143 | 964 | 367 | 2 / 57 | 36 | 59 | 0 |
| 20261007 | CONTROL | 11 | 2877 | 2772 | 261 / 338 | 0 | 0 | 5 |
| 20261007 | REPLACEMENT | 137 | 964 | 288 | 2 / 64 | 31 | 51 | 0 |

All local layers total **436**, versus 32 CONTROL layers. **320/436** local layers have at most four nodes. **184/436** have identical compiled left/right pickup nodes. Across the six worlds, 30 groups share an identical absolute coarse mask; 24 groups share a translation-normalized coarse mask. Those group counts are not body counts or full transfer-equivalence classes.

The local descriptor masks are individually eight-connected. Their compiled four-neighbor layers contain **168 / 151 / 149** planar subgraphs, versus 156 / 143 / 137 descriptors. Thus 32 additional acoustic subdivisions occur inside otherwise connected local material episodes. With Z links included, the full local node graphs have **83 / 68 / 72** connected components. These differ from both material-union components (53 / 44 / 39) and the coarser layer-ID Z graphs. Three/four/four small node components have no Plate pickup; REPLACEMENT has no Nodule route to observe them. This is static reachability, not an estimate of their natural forcing or audible contribution. [Granularity probe](analysis/granularity-probe.json).

The 110 one-node local layers produce **identical isolated PCM bytes** under the equal-strength, shared-material native impulse probe. The one-node response is an elementary lumped filter; neither source subcell shape nor distinct endpoint pickups survive it. In the objectively selected earliest two-source-cell X per seed, translating the unchanged isolated patch by 0–2 source cells changes its coarse node graph and response. This demonstrates grid-registration sensitivity, not a world intervention or resolution-convergence result.

These probes falsify unique isolated resonant geometry for every local ID. They do **not** establish interchangeable coupled state. The same elementary filter at two places can have different contact/compliance histories, incoming Z forces, current phase, burial and output weighting. No geometry-hash deduplication or shared-state optimization is justified by this result alone.

## Continuous sound regime: all five fixed windows

The [technical atlas](ATLAS.md) contains every requested window in every seed/arm, without favorable-example selection. Waveforms retain separate L/R and fixed ±1; spectrograms retain 48 kHz, FFT 1024, symmetric Hann, hop 256, 0–8 kHz, -100…0 dBFS, gamma 1 and grayscale. All use fixed post-bridge gain 0.7; there is no RMS matching or image normalization.

The table gives pooled stereo RMS in dBFS. Silence is exact zero PCM, not a measured -600 dB floor.

| Seed | Window s | CONTROL | REPLACEMENT |
|---|---|---:|---:|
| 20261005 | 50–60 | silence | -44.17 |
| 20261005 | 110–120 | -33.79 | -36.20 |
| 20261005 | 170–180 | -35.23 | -34.01 |
| 20261005 | 230–240 | -33.39 | -32.98 |
| 20261005 | 290–300 | -32.54 | -32.93 |
| 20261006 | 50–60 | silence | silence |
| 20261006 | 110–120 | silence | -42.06 |
| 20261006 | 170–180 | -45.61 | -40.86 |
| 20261006 | 230–240 | -40.90 | -34.07 |
| 20261006 | 290–300 | -36.68 | -33.82 |
| 20261007 | 50–60 | silence | -58.88 |
| 20261007 | 110–120 | -35.98 | -37.22 |
| 20261007 | 170–180 | -33.79 | -34.11 |
| 20261007 | 230–240 | -36.62 | -34.90 |
| 20261007 | 290–300 | -33.71 | -35.74 |

Local-X changes when sound begins, local transfer geometry, forcing, coupling, stereo readout and Nodule participation. It does not produce a consistent louder/quieter treatment effect. Last-window L/R correlations are CONTROL **.014 / -.002 / .001**, REPLACEMENT **.259 / .391 / .252**. Coincident local pickups are a plausible contributor, but this comparison does not isolate that responsibility from geometry, contacts or coupling.

Primary ERB output is [absolute linear band power](audio-analysis/visual/erb-absolute-power.svg), with one shared vertical scale. The [unit-sum shape](audio-analysis/visual/erb-unit-shape.svg) is secondary. Shape cosine for non-silent pairs ranges **.5968–.9821**; at 290–300 s it is **.9016 / .9476 / .5968**. No shape is defined for silence. ERB bins preserve the existing half-open/DC/one-sided-power rules; 1,872 wholly contained STFT frames start at each window's first sample. The highest included FFT-bin center is 7,968.75 Hz. The Hann normalization is a descriptive power coordinate, not calibrated physical energy. [All metric arrays](audio-analysis/analysis.json), [CSV](audio-analysis/windows.csv).

The output regimes are numerically different. This pass contains no new listening judgment, audibility threshold, preference result or claim that either sounds convincing. ERB difference is not audible difference; similarity is not perceptual identity.

## Retained layers, direct strikes and indirect activity

The continuous reference records **zero** node sleep events in every CONTROL, versus **2408 / 2097 / 2205** in REPLACEMENT. Final active nodes are CONTROL **3567 / 1750 / 2877**, REPLACEMENT **797 / 650 / 665**. Local worlds therefore do not repeat the historical all-material-awake regime unchanged. Native activation counters include topology reinstalls and must not be called proved sleep-to-wake counts.

| REPLACEMENT seed | Layers never directly struck in rendered [0,300) | Those with nonzero raw pickup at 290–300 | Fully buried layers at 300 | Fully buried, never directly struck, Z-linked with nonzero late pickup |
|---|---:|---:|---:|---:|
| 20261005 | 40 | 18 | 6 | 2 |
| 20261006 | 33 | 6 | 14 | 4 |
| 20261007 | 36 | 13 | 9 | 4 |

For example, seed05 `research-local-X-0062` has no rendered direct strike, is fully buried at the final checkpoint, has six incident compiled node-links and reaches raw pickup magnitude .000409 in the final window. Corresponding objective largest-peak buried/unstruck examples in seeds06/07 reach .000327 and .000216. These are pre-sum/pre-limiter state observations, not post-gain loudness estimates.

Within the implemented zero-initial-state reference, retained state and indirect coupling are exercised in layers that a direct-strike-only census would discard. The data do not measure each layer's unique counterfactual share of final sound. Raw layer sum-squares are not additive output energies: phase cancellation, readout and the limiter prevent that interpretation. Exposure is a checkpoint diagnosis, not proof that a layer was buried for the entire window. [1183 layer/window receipts](analysis/layer-contribution-histories.json).

## What dominates runtime

These timings are **not** a live AudioWorklet benchmark. The exact unmodified processor runs in a Chrome 157 main-realm stub on the real 290–300 s event workload, initialized at rest using the latest prior topology. One warmup, three fresh clean timing replays and a separate V8 sampling replay keep profiler overhead out of the timing statistic. State diagnostics agree across repeats. Earlier continuous vibration is omitted from this cost fixture; the full sonic renders above preserve it.

| Seed | CONTROL process ms / 10 model s | REPLACEMENT process ms / 10 model s | CONTROL / local ratio | Compiler median ms, C / R |
|---|---:|---:|---:|---:|
| 20261005 | 18927.5 | 3037.9 | 6.23 | 8.21 / 7.12 |
| 20261006 | 11401.5 | 2860.6 | 3.99 | 2.07 / 7.06 |
| 20261007 | 25709.8 | 4442.5 | 5.79 | 4.68 / 6.76 |

Continuous recurrence and wake/stencil work dominate sampled CPU cost. `advancePhysics`, `wakeNeighborhood`, `wakeNode` and, depending on the case, `computeLap`/force checks lead the profiles. Z recurrence and Plate pickup mixing are inline in `advancePhysics`; no unsupported percentage is assigned to either. Nodule routines are present in CONTROL, but the small 300 s Nodule population is not the leading separately sampled function. Removing Nodules is not demonstrated to explain the measured speed ratio.

Clean late-window contact dispatch totals are roughly **33–54 ms CONTROL**, **1.5–4.6 ms REPLACEMENT**, against seconds of continuous processing. Topology install/state preservation is approximately .1–.9 ms per observed installation in this fixture; structured cloning is roughly .1–.2 ms, a transfer **proxy**, not measured MessagePort latency. Full compiler work is about 2–8 ms per sampled snapshot. Local worlds recompile much more often (110/105/104 installs including initial topology, versus 19/10/16 CONTROL), so revision spikes and main-thread validation remain relevant despite not dominating this late continuous-work comparison.

The real scaling variables are active node/stencil work, incident coupling, repeated wake checks, excitation footprint/target size, Nodule modes and revision work. Layer count alone predicts the wrong direction here. REPLACEMENT is much cheaper in this offline CPU fixture; **web realtime viability remains unverified**. The historical 30-Plate/9806-node failure cannot be mechanically extrapolated to 140 tiny local layers. [Clean samples and V8 attribution](analysis/ant-local-x-audio-runtime-profile.json).

## Architecture judgment without sunk cost

The present model is conceptually useful: local physical contact excites retained geometry, the network moves and decays, buried history participates indirectly, and material changes later contact conditions. Its weaknesses are specific: coarse binary geometry for tiny deposits; implicit zero-exterior boundary conditions; compatibility-fixture character; ID-attached planar boundaries/state ranges; two arbitrary local pickups per new episode; and runtime scaling with continuously active historical geometry. They are not evidence that ANT needs an unrelated synthesizer.

| Serious option | Preserves | Compresses/discards | Persistent state and contact | History/burial | Scaling and sonic consequence | Assessment |
|---|---|---|---|---|---|---|
| Explicit spatial stratified network with independent readout | Geometry, lamina/interface motion, local forcing, chronological material relations | Deposition labels need not determine boundary/readout count; exact discretization still needs a choice | Resolved node motion, pending contact/compliance and sleep state; local footprints excite exposed mechanics | Explicit exposure and finite interfaces; state transfer must be declared | Active spatial DOFs and links; supports local propagation and independent layer phase; needs resolution/support and readout validation | **Preferred starting physical model**, keeping current solver as reference rather than a mandatory Plate contract |
| Bonded effective surface/column network | Geometry/support, exposure and history-derived effective properties if modeled explicitly | Independent interlayer motion and many provenance-level state ranges | Motion on a consolidated field; local exposed contact drives it | Retained ledger changes effective properties; bonding/thickness/order rules must be authored and tested | Potentially scales with occupied mechanical cells rather than deposited incidences; can change modal/decay/continuity character substantially | Coherent if ANT intends consolidation; **not implemented or validated here** |

I would place the observation operator in world coordinates and make its aperture/weighting explicit, rather than creating two microphones with every deposition. Exact placement and whether the artist wants a spatial listener or accumulated layer polyphony remain artistic choices. This recommendation is not a claim that world-space readout has already been shown perceptually better.

The existing sparse field solver remains the strongest implemented reference. There is insufficient evidence to choose a new physical abstraction, merge laminae, substitute a generic resonator bank, or guarantee a lower-state model. Permanent material needs persistent constitutive/history information; it does not require permanent nonzero vibration. Distinct histories can still require independent motion even when their isolated filters match.

## Alternatives tested, rejected and left open

- **Tested:** the full existing architecture on all six fixed worlds; exact scheduler/state/pulse conformance; coarse geometry/filter collisions; objective small-patch registration; native awake/sleep and indirect readout observations; clean late workload costs.
- **Falsified:** every local Plate has a distinct isolated resonant geometry; Plate count predicts continuous solver cost; direct-strike absence or final burial alone implies no vibration/readout; the local replacement necessarily inherits the historical all-nodes-awake regime.
- **Not tested as a replacement architecture:** bonded-column mechanics, changed boundary conditions, a resolution-converged fine mesh, new excitation duration/force law, world-space readout, or state deduplication. A resolution change without constitutive scaling would be a different model, not a convergence test. A union mask without a bond law would manufacture the premise.
- **Historically rejected:** the tested dormant-Plate fixed-operator modal ROM. Its rank near arithmetic break-even had large state/output errors; adequate ranks cost more than the sparse full solver. This pass does not repackage it. Selected old Plate clips were distinguishable to one listener; the broad ERB material-contribution negative did not erase their fine response differences. [Late challenge and exact historical bounds](HISTORICAL-CHALLENGE.md).

The historical deposition/acoustic-separation hypothesis survives **as a responsibility distinction and research question**. It does not survive as an already proven effective-body law. Its counterweight—retained layers can carry actual coupled motion—was exercised by the new natural schedules.

## Next question and adoption boundary

The smallest engineering question is: **do repeated one-/two-node geometry classes have different projected contact, incident Z-force, state and readout trajectories in the fixed natural replacement histories, or is any exact state/operator reuse justified?** An instrumentation-only replay can answer that within the current law, without changing formation or inventing cohesion. Current nonzero buried/unstruck observations already rule out a blanket direct-strike-only discard, but do not quantify permissible reuse.

The independent artistic/modeling question is whether deposition preserves laminar interfaces or creates bonded continuity, and where the world is heard. If consolidation or a different readout is chosen, the next pass should implement the smallest actual candidate on these same frozen histories and compare the information it intentionally loses. A listening comparison and real browser deadline measurement are needed before aesthetic or web-adoption claims.

**No new audio architecture is ready for production adoption on this evidence.** No local-X formation adoption, material tuning, extra seed, longer horizon, Residence, PR or merge occurred. [Validation and known limitations](VALIDATION.md), [reproduction index](README.md), [manifest](manifest.json), [SHA256SUMS](SHA256SUMS).
