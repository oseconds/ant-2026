# Exhibition audio runtime feasibility — 2026-10-21

## Boundary

This pass investigates the current production solver for Processing Community Day Seoul 2026. Full Physics remains the default. Movement, gait, pheromone, SurfaceField, material qualification/birth, stratigraphy and retained history are unchanged. The startup-only `?antAudio=lite` prototype omits inter-Plate Z adjacency construction and spring transfers; it retains individual 2D Plates, their materials/pickups and the separate Sphere foundation/modes. It is a physical/acoustic counterfactual, not an equivalent full model.

Starting HEAD was `79833b4`; fetched `origin/main` was `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. Their production `src/` and `static/` trees were identical. Existing dense-readout/stem research is retained. All measurements below are local to an Intel i5-13600KF, installed Chrome 155.0.8059.85, Node 22.23.2, stereo 48 kHz and the unchanged 6 kHz physical solver.

## Frozen inputs and interpretation

`capture-inputs.v8.gz` SHA-256: `cb8929de9d166e6e41057549a927c14181ec9202468833e1fab08a835eba4ee2`.

The current seed `20261005` reached 8, 20 and 30 historical Plates at ticks 17,521, 27,601 and 36,992. Each case contains its milestone topology and twelve seconds of naturally routed strikes, stable-sorted by absolute audio frame then original emission order. The first two seconds condition a silent solver; the final ten seconds are the PCM analysis window. This is **cold audio with frozen milestone topology**, not an uninterrupted mature physical state.

The original input and full route decisions are in the compressed artifact; `capture-receipt.json` gives compact source/hash/parity receipts. The milestone topology is held fixed for every candidate. Later natural topology messages are retained as provenance, and only stale routes incompatible with that topology are excluded identically from all candidates: 102/1,503, 116/1,814 and 0/2,056 at 8/20/30. Remaining strike counts are 1,401 / 1,698 / 2,056. These exclusions are replay-boundary controls, not an exhibition excitation policy.

The message window starts after the entire milestone tick has completed, including all contacts and topology sync emitted by that tick. Milestone-tick contacts are pre-boundary history and are not replayed at frame zero. This matches a cold Audio On gesture after that completed world state; it does not preserve its earlier vibration. Timestamp rounding and stable sorting apply only after this message-index boundary.

The natural controller capture compared mocked-audio-on against Audio Off for 37,713 tick snapshots. Fourteen world/RNG/material field hashes matched, including movement/gait/pose, chemical/mechanical fields, lifecycle, contact events, births and stratigraphy. Both RNG streams ended at state 4,038,745,024 after 400,729 calls. See the receipt for individual hashes.

The previously supplied dense-mix values were located in the committed [2026-10-18 evidence](../2026-10-18-natural-dense-readout-overlap/README.md): 500 ms focal/rest median -5.38 dB, median 69 strikes, event contributor median 2.10, and whole-window energy-weighted median 2.113. They are verified for that earlier eight-Plate input; they do not establish perceptual masking or a mature runtime result.

## Candidates and measurements

- **Full:** original finite contact pulse/recovery, all Plate/Z/Sphere calculations and shared pickup mix.
- **Fast wake:** an already-awake shortcut that still resets the quiet timer; a shadow optimization only.
- **Dense Lap:** when the active set covers every node, compute each independent Laplacian once rather than repeating neighbor stamp lookups. Recurrence and pickup accumulation order remain unchanged. Shadow only.
- **Same-step sleep-force reuse:** separately audit recurrence versus sleep calculation times, raw/density-scaled arithmetic, sequential node state changes and post-Sphere advancement. Require bit-exact state/PCM before measuring a candidate.
- **Z off:** empty adjacency arrays, no spring transfers or Z-neighbor propagation. The opt-in prototype also skips `packAdjacentLinks` and zero-pair CSR construction. It does not disable Sphere foundation coupling.
- **Plate/local-cell gate:** deterministic 75 ms refractory in the audio message stream only, anchored to existing contact recovery; original contacts and all simulation/material processing remain intact. No RNG, amplitude compensation, strength threshold, or production gate is added.

`benchmark-short.json` contains the independent three-second screen and exact PCM/state/telemetry assertions for the two initial full-physics optimizations. `benchmark.json` contains the longer frozen A/B. Throughput is rendered audio seconds divided by Chrome OfflineAudioContext wall seconds. Worklet process-cost sums use `Date.now()` with one-millisecond quantization and include the same scheduling/observation scaffold for every treatment; they are not cycle-level profiles. Actual runtime uses the uninstrumented production worklet and separate clock/CDP records.

The discarded `benchmark-preflight.json` explicitly records its invalidity: the initial harness lacked stable sorting, so timestamp dispatch could stall. Its performance and audio results are not used. Valid replay runs assert exactly one delivery per scheduled strike, zero route drops and zero non-finite values.

## Reproduction

From the repository root, with Node dependencies installed and Chrome at its default Windows path:

```powershell
node scripts/ant-exhibition-capture.js
$env:ANT_VARIANTS='full,z-off,plate-gate,cell-gate'
node scripts/ant-exhibition-benchmark.js
node scripts/ant-exhibition-stems.js
& 'C:\Users\5dudt\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/ant-exhibition-analyze.py
npm test
npm run build
$env:ANT_TARGET_PLATES='30'
$env:ANT_RUNTIME_SECONDS='30'
$env:ANT_WORKLET_VARIANT='z-off'
node scripts/ant-exhibition-runtime.js
```

Use a fresh PowerShell process or clear task-specific environment variables between experiments. `BROWSER_EXECUTABLE_PATH` overrides Chrome location. Do not run CPU benchmarks simultaneously with another replay, test suite or browser measurement.

## Interpretation limits

Offline throughput is not proof of live audio stability. Quietness is not CPU improvement. PCM component energy and focal/rest interference are not perceptual masking, audibility, listening preference or individual-Plate recognition. Natural runtime snapshots, frozen topology replay and historical diagnostic states are different workloads. A cold audio start is particularly favorable to sleeping buried material and cannot certify a continuous mature exhibition run. Operating duration, Plate range and device dependence must accompany any recommendation.

**Decision: Audio Off is the supported visual-exhibition fallback in the measured scope. Neither Full Physics nor Audio Lite meets the mature realtime audio requirement on this machine. Audio Lite remains an explicitly labeled prototype, not an exhibition-ready configuration. If live physical sound is mandatory, this submission is not technically ready yet.**

## Frozen A/B results

The twelve-second Chrome offline comparison rendered identical frozen input per count. Throughput below is audio seconds per wall second; 1.0 is only the average realtime boundary, without a safety margin.

| Milestone | Nodes / Z pairs / nodules | Full | Z off | Plate gate | Local-cell gate |
| --- | --- | ---: | ---: | ---: | ---: |
| 8 | 2,014 / 1,722 / 1 | 0.954 | 1.496 | 0.950 | 0.958 |
| 20 | 5,488 / 6,291 / 20 | 0.285 | 0.486 | 0.283 | 0.281 |
| 30 | 8,345 / 10,756 / 32 | 0.173 | 0.289 | 0.176 | 0.177 |

Z off removes the expensive spring work and helps materially, but does not make the 20/30 Plate cases realtime. After twelve seconds its active sets are 2,014 / 4,832 / 8,123; Full has all 2,014 / 5,488 / 8,345 nodes active. Z off records 0 / 330 / 759 sleep events, versus zero in every Full or gated run. At 30, total wakes 8,882 exceed the total 8,345 nodes, proving at least 537 repeat awakenings in this fixed topology; this is a lower bound, not a node-by-node reactivation census. Merely removing Z does not keep the remaining Plate system dormant.

The Plate refractory delivers 34.8% / 41.5% / 48.9% of strikes, and the local-cell refractory delivers 95.1% / 94.9% / 94.5%. Neither changes the Full active-node count or creates a sleep event in these windows. The 30-Plate Plate-gate RMS falls from 0.03349 to 0.02110 (about -4.0 dB) while throughput stays about 0.17–0.18. Reduced loudness is not a runtime solution. Strength across the frozen routed feet spans approximately 0.0187–0.0352; it includes routing/contact-load differences and does not identify phase, masking or redundant excitation. No arbitrary strength threshold or excitation-state scalar gate is adopted.

### Candidate 1: exact computation optimizations

The independent three-second screen gives dense-Lap throughput 1.113 / 0.329 / 0.186 versus Full 0.944 / 0.286 / 0.179. PCM, recorded solver state and telemetry match. Gain shrinks at mature stages, where Z removal produces larger gains; even the 30-Plate dense-Lap result is far below realtime. Already-awake fast-wake results stay around baseline. These single screens are not confidence intervals or a general performance guarantee; neither transform changes the default worklet.

The user's follow-up explicitly requested same-step sleep-force reuse. Source inspection found actual recomputation, with important temporal differences:

- `localPlateForce()` reconstructs the same bilaplacian from the frozen same-step `lap[]`. The shadow caches the recurrence's `lapOfLap` in Float64, then retains the original material arithmetic and division order.
- Recurrence Z contributions are divided by density individually, while the sleep threshold uses a raw Z sum. More critically, sleep commits nodes sequentially, so later nodes read some earlier neighbors' **new** current values. A controlled counterexample has recurrence raw Z force zero but sleep-time force above `1e-8`, changing whether quiet counter 11,999 reaches sleep. The shadow refuses Z reuse.
- Sphere mode advancement occurs between recurrence and sleep. The shadow forms its cache after `advanceNodules()` using the new modal values, the still-uncommitted foundation value, and original nodule summation order. Reusing the pre-advance Sphere force would be wrong.

`benchmark-force-cache.json` separately tests Plate-only, Sphere-only and combined reuse. At each of 8/20/30, every candidate has bit-exact complete stereo Float32 PCM and final state comprising all 41 original typed-array byte sequences, all 14 numeric own properties and their layout, plus diagnostics equal to Full. Candidate `__*` scratch arrays and timing histograms are excluded from the physical-state hash. Six focused tests additionally exercise quiet tails, post-advance Sphere values, diagnostics paths, Z on/off and near-threshold sleep transitions. This establishes the tested parity; it does not establish a speed benefit.

| Milestone | Full | Plate cache | Sphere cache | Both caches |
| --- | ---: | ---: | ---: | ---: |
| 8 | 0.949 | 0.926 | 0.951 | 0.931 |
| 20 | 0.286 | 0.287 | 0.287 | 0.285 |
| 30 | 0.180 | 0.180 | 0.176 | 0.182 |

No consistent material improvement is demonstrated. The separate `benchmark-force-counts.json` run is an operation census only; its timings are not used. In the 30-Plate three-second Full replay, sleep performs 17,438,975 local-Z calls (45,227,903 link terms), 12,542,369 local-Plate calls (35,763,221 neighbor visits) and 994,507 local-Sphere calls (only 44,340 modal terms; most nodes have no Sphere link). Combined caching removes those Plate neighbor visits but adds 145,179,773 Plate cache writes and 6,766,596 post-advance Sphere modal terms. Lazy sleep eligibility already short-circuits much of the work; eagerly maintaining caches can move or add cost rather than remove it. The cache stays research-only.

An audit also found an existing instrumentation boundary: selected nodes with sleep diagnostics enabled consume recurrence-time raw Z force, whereas diagnostics-off production recomputes it during sequential node commits. The new transform preserves each path relative to itself. Production parity claims here use diagnostics **off**; diagnostics-on test parity is only parity with that instrumented path. This pass does not repair or retune the historical diagnostic implementation.

### Acoustic comparison

The four independent 30-Plate stem captures match the corresponding benchmark PCM and strike/drop diagnostics exactly. They describe 60,000 measured physics steps, not isolated physical objects. Across 792 common unique `(layerId,eventFrame)` windows delivered by all arms, median focal-to-signed-rest dB change relative to Full is Z off -0.109 dB, Plate gate +1.197 dB and cell gate +0.247 dB. The Plate-gate spread is wide (P10 -4.052, P90 +4.159 dB). All-delivered event sets differ and their raw medians are reported separately, not compared as matched treatment effects.

Median effective contributor count across twenty fixed 500 ms bins is Full 5.32, Z off 4.87, Plate gate 6.51 and cell gate 5.23. This definition differs from the earlier eight-Plate whole-window energy-weighted statistic; the values must not be treated as a longitudinal population comparison. Sphere pickup energy is separately about 51.6–55.0 dB below summed Plate component energy in these arms; low pickup energy does not license removing its mechanical coupling or computation.

In `stems-summary.json`, `eventFrame` uses the 48 kHz replay-window origin, while event `windowStartMs/windowEndMs` label integration intervals by array index relative to the two-second cut. Starts use `floor((eventFrame - 96000)/8)` on the 6 kHz grid (under 0.146 ms snapping). Slot zero stores the post-update value at shadow counter 96008 (output frame 96007); the final slot has shadow counter 576000. The audio-frame end is exclusive, while that internal post-step counter labels the update that consumed its last sample. All paired arms use this same convention, and the floor mapping selects the first update consuming a strike. Component energies precede shared limiting/interpolation; mixed WAV metrics include them. See [acoustic-analysis.json](acoustic-analysis.json), the fixed-scale [waveform](acoustic-waveform.png), [spectrogram](acoustic-spectrogram.png), and [local A/B listening page](listening.html). No human listening result was collected in this pass.

## Actual Chrome runtime and exhibition decision

`runtime-summary.json` indexes ten verified installed-Chrome runs. Each starts from a current-controller natural world grown with audio disabled, then uses the production renderer and rAF controller with real AudioContext/worklet processing. Within Chrome, all modes at each Plate target have identical pre-growth world SHA, ticks and RNG state/call counts; the integrity verifier asserts this. The Chrome milestones are ticks 15,601 / 23,941 / 30,961. They differ from the Node capture milestones, so these are explicitly separate workloads; cross-runtime trajectory equality is not established.

| Starting configuration | Natural Plate progression | Measured wall seconds | Audio / wall | Simulation / wall | Verdict |
| --- | --- | ---: | ---: | ---: | --- |
| Empty Full control | 0 → 0 | 15.25 | 0.987 | 1.000 | Host/audio-clock control |
| Full | 8 → 9 | 15.33 | 0.914 | 1.000 | Audio falls behind |
| Full | 20 → 21 | 15.41 | 0.209 | 1.000 | Audio fails |
| Full | 30 → 31 | 15.41 | 0.113 | 1.000 | Audio fails |
| Z-off Lite | 8 → 18 | 120.33 | 0.562 | 1.000 | Cannot sustain natural growth |
| Z-off Lite | 20 → 21 | 15.45 | 0.317 | 1.000 | Audio fails |
| Z-off Lite | 30 → 31 | 15.42 | 0.202 | 1.000 | Audio fails |
| Dense Lap shadow | 8 → 9 | 15.42 | 0.732 | 1.000 | Offline gain does not certify live stability |
| Z-off + dense Lap shadow | 8 → 9 | 15.40 | 0.937 | 1.000 | No stable realtime result |
| Audio Off | 30 → 38 | 120.30 | No context | 1.000 | Supported visual fallback for this duration |

Renderer callbacks averaged approximately 55.5–57.2 Hz, and start/end canvas pixel hashes changed in every verified run. Processor errors and page errors were absent. Those facts do not negate the audio-clock deficit. CDP realtime samples preserve raw render-capacity and callback-interval metrics; their numeric fields are retained without inferring a clipping/glitch rate or a perceptual listening result.

The long Lite run is a growth/operation test, not a 120-second constant eight-Plate benchmark. Even around its first eleven seconds with eight Plates the cumulative audio/wall ratio was about 0.899; it subsequently fell as the world reached eighteen Plates. No tested audio configuration certifies sustained realtime at 8, 20 or 30 Plates. A maximum below eight is not measured and must not be invented. Offline Lite's 1.496× eight-Plate throughput therefore does **not** establish a usable live eight-Plate configuration. The only limited combination tested was Z off plus the independently beneficial offline dense-Lap shortcut; no gate combination or parameter sweep was adopted.

Natural runtime retains wall/gesture timing and asynchronous message arrival. Identical pre-growth worlds are verified, but Audio On setup introduces up to a tick of difference at measurement start, and the 120-second growth run has a different duration from the 15-second probes. Use the frozen replay for controlled treatment attribution; use these live runs to judge operability and failure. All are cold audio starts and do not certify an uninterrupted mature physical state. The first earlier `01-30-46` smoke has no paired world hash and is explicitly excluded from the verified summary.

### Operation and remaining work

- For the supported visual fallback, launch the normal application and leave **Audio Off / Base Substrate Off**. No Plate cap, history deletion, movement change or automatic reset is introduced. The measured continuous interval is 120 seconds from a naturally grown thirty-Plate world; this is not an hours-long exhibition soak.
- The reversible research prototype starts at `/?antAudio=lite`; select ANT and explicitly enable Audio. The visible label says **Audio Lite prototype · Z Off · Sphere coupling retained**. The startup choice is read-only for that bridge lifetime. Reloading the page returns to the normal startup choice; changing physics mid-run is not exposed.
- Z off removes inter-layer transfer and buried-layer acoustic participation through those springs. Similar RMS or small matched focal/rest changes do not make it equivalent to Full Physics. Sphere remains mechanically present. Audio Off loses the entire live sounding-body output.
- No subjective clarity/preference, physical speaker/interface behavior, headed-Chrome performance, eight-Plate-or-smaller maximum, hours-long uptime or other computer is certified. Installed Chrome ran headless with its default muted output. If physical live sound is an exhibition requirement, further solver work and venue-hardware validation remain necessary; none of the measured partial improvements closes the mature deficit.

## Validation and reproduction receipts

- Full regression suite: **350/350 pass**, [test output](tests.txt).
- Production build: pass, [build output](build.txt). Existing large-chunk warning remains; no dependency or bundling redesign was added.
- `node scripts/verify-ant-exhibition-evidence.js`: verifies input hash, all 12 primary WAV/PCM receipts, all 12 cache state/PCM/telemetry comparisons, four exact stem receipts, acoustic sidecar linkage and all ten within-Chrome runtime records. It requires the full count/variant/duration matrix, zero error/drop counters, and Z-off at both start and end. Writes [runtime-summary.json](runtime-summary.json); final [verification output](verification.txt) passes.
- Raw measurements include source worklet hashes. Capture receipt hashes describe the clean capture-time source at `79833b4` (production trees then matched `origin/main`); they intentionally precede the opt-in prototype edits. Final code and evidence commits provide the later source boundary.
- `benchmark-force-cache-overlap.json` is an explicitly rejected partial timing run, replaced by the serial `benchmark-force-cache.json`. `benchmark-force-counts.json` is instrumentation-only. Neither rejected nor count-run timing is used as a speed claim.
- A fresh independent Luna Max review inspected physical boundaries, raw-state/PCM assertions, signed-rest energy, capture/time conventions and actual runtime evidence. No material production regression was found; its timing-label clarification is now explicit in metadata and this report.

The verified implementation and reproduction scripts are committed as `d43680eb142ee9b77c6770bc7ec7ef56c0c0c4fb`. The following evidence/documentation commit packages these measurements without changing that code. Capture-time source hashes and each render's transformed-worklet hash remain the authority for the measured source; a Git HEAD alone does not represent an uncommitted measurement-time prototype. Future capture runs now read their actual Git HEAD instead of retaining the original capture's commit label.

Repository attributes retain these raw JSON receipts and research scripts at LF across Windows checkouts; PCM, PNG and the compressed frozen input remain binary. This avoids changing byte-hashed sidecar files through checkout line-ending conversion.
