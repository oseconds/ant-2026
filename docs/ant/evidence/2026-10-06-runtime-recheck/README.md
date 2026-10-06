# ANT natural audio runtime re-check

Starting production HEAD: `51f576061991745858429749a034c9ea586ac318`.

**The shorter Plate vibration decay did not relieve the natural active solver set or fix realtime failure in this run.** At 30 historical Plates / 32 nodules, all 9,806 solver nodes remained active, all 30 layers remained awake, and there were zero node sleep transitions. The 30-Plate clock window achieved audio/wall = 0.1304; the worst completed window achieved 0.1258. AudioContext continued reporting `running`.

This is a diagnosis-only pass. No production source, DSP equation, damping, contact pulse/recovery, sleep threshold, topology, ANT behavior or renderer was changed. No optimization was attempted.

## Run and measurement method

- Completed run: [2026-10-06T09-19-59-006Z](2026-10-06T09-19-59-006Z/summary.json).
- Installed Google Chrome `154.0.8037.98`, headless, 1280×900 viewport, production Vite preview of the normal build, 48 kHz AudioContext.
- Natural ANT seed `20261005`, using the original production model factory. Its RNG is replaced before the measured controller's `init()` and first spawn. The disposable bootstrap controller is destroyed before the run. No simulation catch-up, synthetic Plate, reduced topology, synthetic contact, pause, or audio reset is used.
- `bornSurface`, all normal Plate births / stratigraphy / Z / nodules enabled. Volume 35%, final GainNode value `0.24500000476837158`.
- Existing 3 ms / 18-step pulse, 75 ms local recovery, ×50 Plate damping, and existing sleep/wake rules are preserved.
- Audio is enabled by clicking the normal Audio control, then remains enabled throughout the run.
- Wall `performance.now()`, simulation time and AudioContext time are read in one main-thread callback. One-second polls support non-overlapping 5-second regular windows and approximately 8-second milestone windows.
- The app reference is exposed only in the browser-served entry response. An in-memory preview middleware extends only `getDiagnostics()` with per-layer active counts and total solver nodes. Original `process`, integration, contact, coupling, output and sleep methods are byte-for-byte retained. Original and served hashes plus the exact extension are in [capture-state.json](2026-10-06T09-19-59-006Z/capture-state.json). No disk production file is rewritten.
- The diagnostic observer scans the active list and allocates a small per-layer result when requested, outside `process()`. This is additional diagnostic work on the audio thread, not a timing-free observer. It is requested every approximately 5 seconds, with at most one outstanding request. No AudioWorklet CPU-duration or hard realtime guarantee is claimed.
- No motion encoding, MediaRecorder, PCM tap, concurrent benchmark or synthetic stress run was added to this runtime measurement.

The final run stopped after the 30-Plate window and repeated audio/wall failure, at **532.633 simulation seconds / 532.516 wall seconds**. Continuing to 600 seconds was unnecessary for the requested failure diagnosis. AudioContext advanced **324.027 seconds** over the measured interval; overall audio/wall = **0.6085**. The early healthy interval makes that overall average less informative than the late window ratios.

## Clock windows and asynchronous topology

Clock deltas below are synchronous main-thread measurements. DSP state is the latest asynchronously received processor snapshot, which can be older than the clock endpoint. For example, the 10-Plate window ends after main-thread history has reached 11 Plates, while its cached processor snapshot still describes 10 Plates. Active/total nodes use the same DSP generation, never a newer main-thread node total.

| Simulation interval (s) | Main Plates / nodules | Wall Δ (s) | Sim Δ (s) | Audio Δ (s) | Sim/wall | Audio/wall | DSP Plates / nodules | DSP active / total nodes | Awake / sleeping |
|---|---|---:|---:|---:|---:|---:|---|---|---|
| 286.767–294.983 | 10→11 / 5 | 8.2191 | 8.2167 | 3.7200 | 0.9997 | **0.4526** | 10 / 5 | 3,080 / 3,080 | 10 / 0 |
| 417.717–425.933 | 20→21 / 23 | 8.2211 | 8.2167 | 1.5467 | 0.9995 | **0.1881** | 20 / 23 | 6,664 / 6,664 | 20 / 0 |
| 512.217–517.283 | 29 / 32 | 5.0662 | 5.0667 | 0.6373 | 1.0001 | **0.1258** | 29 / 32 | 9,493 / 9,493 | 29 / 0 |
| 518.283–526.533 | 30 / 32 | 8.2435 | 8.2500 | 1.0747 | 1.0008 | **0.1304** | 30 / 32 | 9,806 / 9,806 | 30 / 0 |

| Window | DSP generation | Z links (packed directed entries) | Sphere active / integrated modes | Strikes (cumulative, async) | Diagnostic request-to-receipt (ms) | Diagnostic age at clock endpoint (ms) |
|---|---:|---:|---:|---:|---:|---:|
| Around 10 Plates | 15 | 3,133 | 36 / 60 | 12,848 | 38.0 | 5,015.1 |
| Around 20 Plates | 39 | 8,360 | 133 / 276 | 33,153 | 103.4 | 3,956.4 |
| 29 Plates | 56 | 12,685 | 201 / 384 | 48,392 | 151.9 | 3,899.0 |
| 30 Plates | 57 | 13,154 | 205 / 384 | 49,952 | 136.3 | 2,908.3 |

Use [windows.jsonl](2026-10-06T09-19-59-006Z/windows.jsonl) for exact values. Main-thread clocks and asynchronous counters must not be subtracted as if they describe exactly the same instant.

Across 106 received diagnostic snapshots, maximum measured request-to-receipt latency was **253.2 ms**; maximum cached diagnostic age at a one-second poll was **5,151.8 ms**. Poll cadence accounts for much of the latter. [processor-diagnostics.jsonl](2026-10-06T09-19-59-006Z/processor-diagnostics.jsonl) retains request and receipt clocks. Final diagnostics may arrive after the main-clock stop snapshot while ANT is still running for shutdown; differing final bridge and DSP strike totals are not evidence of dropped routes.

## Natural history, sleep and lag

- First Plate: `124.0166666667 s`, identical to the prior same-seed Chrome first birth.
- First nodule: `246.6499999999 s`.
- Final history: 30 Plates and 32 nodules. Maximum observed awake layers: 30. Maximum active nodes: 9,806.
- No observed sleeping layers and **zero node sleep transitions** across the entire run. Wakes are node activations, not a layer-level transition count.
- At the final DSP snapshot, every Plate, including the first historical Plate, has active-node count equal to its total solver-node count. The last main-thread poll reports the first Plate has 650 buried / 655 mask cells and only 5 exposed cells, while all 119 of its solver nodes remain active. Approximately 99.2% burial therefore did not quiet its historical solver set.
- No Plate was wholly buried over its entire 96×96 mask in the captured history; evidence concerns partially buried older layers. This does not weaken the measured absence of sleep, but it prevents claiming a controlled fully buried-layer test from this natural run.
- The active solver set therefore continues to scale with historical solver material at the milestone snapshots. The shorter isolated impulse response did not allow inactive history to leave the solver set during natural continuous traffic.

| Approx. simulation time (s) | AudioContext time (s) | Raw sim − audio lag (s) | Main Plates / nodules |
|---:|---:|---:|---|
| 59.833 | 59.552 | 0.281 | 0 / 0 |
| 119.550 | 119.261 | 0.289 | 0 / 0 |
| 180.317 | 179.811 | 0.506 | 1 / 0 |
| 240.100 | 239.144 | 0.956 | 6 / 0 |
| 300.067 | 274.515 | 25.552 | 11 / 5 |
| 359.933 | 293.061 | 66.872 | 16 / 16 |
| 419.850 | 306.384 | 113.466 | 20 / 23 |
| 479.683 | 316.728 | 162.955 | 26 / 25 |
| 531.617 | 323.893 | 207.723 | 30 / 32 |

Raw lag includes a small simulation-before-audio start offset. The final main snapshot's raw lag is approximately **208.607 s**; the last poll's offset-adjusted lag is **208.493 s**. Both forms are preserved in the logs.

## Previous versus current

The user-supplied problematic reference was 29 Plates / 20 nodules / 8,162 active nodes, 29 awake / 0 sleeping: 5.231 wall s, 5.233 simulation s, 1.307 audio s, audio/wall ≈0.250. That exact tuple was not found in the targeted repository capture files, so it remains supplied context.

The committed earlier same-seed [stratigraphy runtime evidence](../2026-10-06-stratigraphy-runtime/README.md) instead includes 29 Plates / 32 nodules / 9,493 active nodes and zero sleeping layers, matching the current 29-Plate topology size. Its audio clock likewise loses realtime while the simulation clock advances normally. The current run provides no evidence that damping fixed or meaningfully delayed this failure. Session differences and earlier excitation-version differences prevent treating this as a controlled damping-only A/B performance benchmark.

The historical archive's main-thread `clockAnchors` contain simulation and AudioContext clocks but no local wall timestamp. Around 29→30 Plates, its anchors at 514.983333→522.983333 simulation seconds advance the AudioContext from 322.013333→323.058667 seconds: **audio/simulation = 0.130667** (8.000 simulation seconds, 1.045333 audio seconds). Its whole-run sim/wall was approximately 1, but that cannot supply an independently measured local wall delta.

A nearby current 8.2347-wall-second interval, reconstructed from the one-second same-callback polls at 515.250000→523.483333 simulation seconds, advances simulation 8.233333 seconds and audio 1.058667 seconds: **audio/wall = 0.128562**. It likewise crosses 29→30 Plates / 32 nodules. Both are around 0.13; their small difference is insufficient for claiming improvement or worsening. The observed realtime collapse is essentially unchanged.

## Remaining bottleneck candidate

The strongest supported candidate is **the continually awake shared Plate/Z/Sphere network**, leaving the sparse solver effectively dense over accumulated material. At the final snapshot, 9,806 nodes and 13,154 packed Z-link entries participate alongside 384 integrated Sphere modal slots, although only 179 modes exceed the diagnostic activity threshold. All historical Plate node sets remain awake.

Current surface contacts keep exciting the exposed network; Z links and Sphere foundation forces can propagate/reintroduce energy to older material. The existing sleep test additionally requires each local Plate, Z and Sphere force below `1e-8` and quiet energy below `1e-10` for two continuous physics seconds. These code relationships make persistent reactivation plausible. The recorded aggregate coupling counters and per-layer activity do **not** attribute the dominant wake cause to Z, Sphere or repeated direct contacts. No wake-cause profiling or optimization was introduced.

## Safety and validation

- Full existing tests before capture: **237/237 passed**, zero failures, Node test duration 11,569.701 ms.
- Production build: **passed**; existing Rollup annotation and large-chunk warnings remain.
- Independent [verifier](../../../../scripts/verify-ant-runtime-recheck.js): passed, recomputing all 86 window clock deltas/ratios and per-layer node totals, checking source hashes, production freeze and pulse/recovery/damping/sleep constants.
- All observed AudioContext states: `running`. Page error: none. Processor errors: zero.
- All processor snapshots: `dropped = 0`, `droppedRoutes = 0`, `nonFinite = 0`, pre-limiter `clipped = 0`.
- Maximum observed pre-limiter output absolute value: **0.1831445521**, below full scale. Existing bounded output mapping and 35% output gain are unchanged. This run intentionally has no PCM recording; final PCM RMS/peak/clipping were not independently measured.
- Final async DSP counters: 57 topology installs/generation 57; 51,595 strikes; 302,233 node wakes; zero sleeps; 6,034,674,446 deep Plate coupling evaluations; 69,330,048 Sphere coupling evaluations. Coupling evaluation counts are not physical energy transfer in joules.
- The final main-thread bridge snapshot has 30,735 FOOT_CONTACT groups, 51,587 routed feet/routes, 39,488 unsupported feet, zero dropped events and zero processor errors. Unsupported feet are intentional absence of resonant material, not dropped routes. DSP totals were returned later and are not synchronous with this snapshot.
- No reliable AudioWorklet CPU timing was available. The measured audio-clock failure is actual Chrome runtime progression evidence, not a Node proxy timing result.

## Files and reproduction

```sh
npm test
npm run build
node scripts/ant-runtime-recheck.js
node scripts/verify-ant-runtime-recheck.js docs/ant/evidence/2026-10-06-runtime-recheck/<completed-run-id>
```

- [summary.json](2026-10-06T09-19-59-006Z/summary.json): complete run metadata, birth times, milestone windows and final diagnostics.
- [analysis.json](2026-10-06T09-19-59-006Z/analysis.json): independently recomputed ratios/source integrity and layer-state observations.
- [polls.jsonl](2026-10-06T09-19-59-006Z/polls.jsonl): one-second main clocks, natural topology, exposure/burial, cached diagnostic provenance.
- [processor-diagnostics.jsonl](2026-10-06T09-19-59-006Z/processor-diagnostics.jsonl): raw asynchronous processor counters and per-layer counts.
- [windows.jsonl](2026-10-06T09-19-59-006Z/windows.jsonl): all 86 measured clock windows.
- Normal production screenshots: [10 Plates](2026-10-06T09-19-59-006Z/10-plates.png), [20 Plates](2026-10-06T09-19-59-006Z/20-plates.png), [30 Plates](2026-10-06T09-19-59-006Z/30-plates.png), [final](2026-10-06T09-19-59-006Z/final.png).

Two earlier directories are preserved as **incomplete diagnostic-setup attempts**, never mixed into runtime results: `2026-10-06T09-16-22-881Z` stopped at 124.567 s immediately after the first Plate birth because Worklet module requests bypassed Playwright page interception; `2026-10-06T09-19-18-472Z` stopped at 34.550 s because middleware inserted after static serving could not extend the response. The completed run registers the diagnostic middleware before static serving and verifies that per-layer diagnostics arrive.

The pass stops at diagnosis. There are no active-depth, Sphere sleep, batching, sleep-threshold, damping or other production follow-up changes.
