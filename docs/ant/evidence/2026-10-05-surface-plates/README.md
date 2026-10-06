# ANT SurfaceField / frozen Plate experiment evidence

Recorded 2026-10-06 Asia/Seoul. The directory date is the experiment's start date. Starting main HEAD was `fbdc21c5321be6f21a98be5783005f3522e41519`; the working tree was clean. This pass adds environmental memory and acoustic layers. It does not retune locomotion, pheromone following, gaster dabs, gait or colony activation.

The mechanism is demonstrated by natural corridor births, frozen connected geometry, real Chrome output after birth, distinct overlapping layers and bounded numerical excitation. These observations do not establish learned behavior, an instrument built by the colony, procession emergence or a rich acoustic ecology.

## Baseline and final checks

| Check | Before edits | Final |
| --- | --- | --- |
| Native tests | 155/155 | 191/191 |
| Build | pass | pass |
| Installed Chrome development | pass | pass |
| Installed Chrome production build/preview | historical baseline inspected | pass |

Logs: [baseline tests](baseline-tests.txt), [baseline build](baseline-build.txt), [final tests](tests.txt), [final build](build.txt), [Chrome dev](browser-dev.txt), [Chrome production](browser-production.txt). Existing zod PURE-annotation and large p5 bundle warnings remain; there were no build errors.

Chrome checks exercise an ordinary Audio On gesture, silence before birth, Off/On, ANT → Plate → ANT, worklet/node cleanup, shared AudioContext reuse, the explicitly isolated legacy path and the generic Plate demo. The destroyed ANT processor now returns `false` from `process()` and zeros any output, releasing its processing lifetime.

No diff from starting HEAD exists in `AntAgent`, `LocalOccupancy`, `GaitController`, `BodyPoseController`, `GasterDeposition`, `PheromoneField`, `ColonyActivation`, legacy `AntAudioBridge`, `AudioEngine`, `WorkletModel`, `PlateModel` or generic `plate.worklet.js`. Turn 4.5 rad/s, acceleration 32, brake 37, preferredSpeed ×1.35 cap and ±2.2 trail damping are unchanged. Pheromone half-life is still 15 s. Historical baseline zero remains untouched at [integrated-refinement/natural-run-audio.webm](../2026-10-05-integrated-refinement/natural-run-audio.webm).

## Mechanical memory and local contact response

`SurfaceField` is framework independent: one Float32 compaction channel on 96×96 cells, bounded to [0,1]. Each valid individual `FOOT_CONTACT.contacts[]` foot deposits around its own normalized world position. The existing event schema, tripod phase/timing and centroid remain unchanged. A foot needs a valid legId and finite in-domain position; outside contacts are ignored rather than clamped. Group strength and body position do not deposit mechanical memory.

For cells within radius 0.012, Gaussian sigma is 0.006 and:

```text
c_after_contact = c + (1 - c) * 0.025 * GaussianWeight
c_after_dt = c * exp(-ln(2) * simulation_dt_seconds / 1800)
```

There is no wall-clock decay or behavior RNG consumption. No actual contact event means no new wear, including a standing ant or pure body rotation without foot contact. Surface half-life is 1800 simulated seconds, 120× the current chemical half-life.

Each foot samples material immediately before its own deposition. Hardness is compaction; footprint radius is `0.014 - 0.005*c`; strength transfer is `0.95 + 0.1*c`. These values describe the impulse/contact rather than pitch, pan or filter. The audio bridge caps the complete group's squared impulse budget. At the current 32-cell DSP resolution, these radii are subcell: the minimum Gaussian kernel scale limits or removes their distinct spreading. The small strength-transfer difference and birth-time material differences remain effective. A more resolved contact footprint is a future technical limitation, not a claim made by this evidence.

## Exact birth algorithm

Analysis runs at one-second simulation intervals. Pheromone is read from its stored field without adding L/C/R sensor calls. Instantaneous absolute concentration `v` is bounded as `v/(v+0.04)` and accumulated with a 20 s exponential time constant. A cell is supported when chemical memory ≥0.30 and Surface support ≥0.015. Surface support samples the center plus eight directions at radii 0.0125 and 0.025, with Gaussian weights. Thresholds are never normalized to the frame maximum.

The supported mask is thinned with deterministic Zhang–Suen two-pass morphology. Connected components use an eight-neighbor graph. In each component, source candidates lie in the annulus radius 0.055–0.115 around `(0.5,0.72)`. The canonical source is nearest the annulus midpoint radius 0.085, breaking ties by cell index. Targets are graph cells within 0.05 of any open observation boundary. Weighted Dijkstra uses cardinal length 1 and diagonal length √2, with deterministic index tie handling. The farthest reachable target supplies the principal shortest path. Source-to-target geodesic length must be at least 0.30 in normalized world coordinates.

The centerline graph keeps the union of canonical-source paths to actual boundary targets that meet that length. Short dead-end twigs are omitted; branches survive only when they connect qualifying targets. It does not convert the full supported blob into material. A candidate must persist for 20 s with similarity ≥0.6 between analyses. Similarity is the maximum of ribbon mask IoU and the number of old principal-path cells within one adjacent cell of the new path, divided by the larger path-cell count.

Width uses a deterministic distance transform from the edge of the original connected supported chemical/mechanical component. Each retained centerline cell gets half-width `clamp(distance_cells/95, 0.012, 0.030)`. Rasterized disks make a variable-width ribbon; total width is 0.024–0.060. This is a local thickness estimate from the transverse supported profile, not an oriented physical cross-section fit.

At birth, the mask, centerline/edges, principal path, width profile, source/target, simulation time, material, pickups and provenance are deeply frozen. Later chemical changes cannot reshape them. The mean chemical and mean Surface support used for material are measured over the connected supported component at birth:

```text
q = clamp(meanChemical, 0, 1)
s = clamp(meanSupport / 0.08, 0, 1)
stiffness = 0.65 + 0.5*q       [0.65, 1.15]
density = 1 + 0.2*s           [1, 1.2]
damping baseline = 0.25 + 0.2*q [0.25, 0.45]
```

Stereo pickups traverse the principal path's geodesic length. For each 25%/75% fraction, the start cell of the segment containing that fraction is selected. The snapping error is at most one path segment. Both valid material points are frozen; there is no ant-position panner.

Births have a 10 s global gap. A route matching an existing layer by the above similarity also needs 90 s since the **latest** matching birth and at least 30 additional actual feet in that layer's ribbon since birth. Matching always consults the latest layer, preventing a third birth from bypassing the second layer's cooldown. Shapes that change enough can qualify as different routes. At most 12 layers are stored; `surfacePlates.limitReached` reports the cap and no old layer is evicted. Continued history beyond that cap is not modeled in this pass.

## Audio, overlap and bounded energy

```text
AntController / unchanged GaitController
  -> actual FOOT_CONTACT individual feet
  -> SurfaceField + TrailPlateBirth
  -> AntEnvironmentAudioBridge
  -> SurfaceAudioBridge (bornSurface) OR unchanged AntAudioBridge (legacy)
  -> one shared stereo AudioWorklet + existing AudioEngine/GainNode
```

The default is `bornSurface`. Legacy remains an internal comparison mode. No Web Audio code is inside AntAgent or p5; no new framework/engine, ant voices, stereo panners, tempo or quantization were added. Coupling stays one way. Plates can be born with Audio Off. On reconstructs their geometry with zero vibration, without replaying past contacts. Off releases audio resources while preserving the run's frozen environment. Leaving ANT destroys that run's environment and transport; the Lab owns the shared engine.

A foot is routed only to layers whose original 96-grid masks contain its actual coordinate. No material under the foot means no Plate resonance. Let group strength `g=min(event.strength,0.05)`, valid foot count `F`, matching layers under foot i `M_i`, and transfer `t_i` in [0.95,1.05]. Route impulse is:

```text
norm = sqrt(sum_over_routes((t_i / sqrt(M_i))^2))
scale = min(1, sqrt(F)/norm)
routeStrength = (g/sqrt(F)) * (t_i/sqrt(M_i)) * scale
```

Thus sum of squared route strengths ≤g². Unsupported feet leave their share unused. Each DSP impulse kernel is L2 normalized and divided by √density. A tripod or overlapping foot cannot simply multiply its finite impulse budget. This bounds injected impulse energy; it does not promise equal audible RMS between geometries.

Each frozen layer is conservatively resampled to a sparse 32×32 DSP domain. Frozen centerline edges preserve diagonal corridor continuity in the coarser grid. The four-neighbor Dirichlet Laplacian is `L`, with missing neighbors fixed at zero. At 6000 physics updates/s:

```text
b = 0.012 * stiffness / density
t = 0.0002
d = 0.000009 + 0.000018 * dampingBaseline
k = 0.000025
u_next = 2*u - u_previous + (t/density)*L(u) - b*L(L(u))
         - d*(u-u_previous) + couplingForce/density
couplingForce_A = k * sum_over_overlapping_layers_B(u_B-u_A)
```

Equal and opposite overlap springs keep layers separate. There are no springs between nonoverlapping layers. Coincident-node groups compute the same pairwise forces efficiently. Coefficients are rate-scaled if the solver rate changes; the actual solver is fixed at 6 kHz. The conservative bound `64*b + 8*t + 2*couplingRow < 3.25` leaves margin below the second-order stability boundary 4. Decimation phase and interpolated output queues continue across audio quanta, including 44.1 kHz.

Output sums frozen physical pickups with fixed headroom `1/sqrt(12)` and `x/(1+abs(x))`; it does not divide by the current layer count. The existing output gain is 0.7×Volume. Mask/material/pickup inputs are validated. There is no historical strike queue. Destroy zeros output and ends processing. No material aging, damping evolution or coupling weakening is implemented. This is a simplified dimensionless linear bending model, not a calibrated ground/plate material.

## Natural long runs

[long-run-evidence.json](long-run-evidence.json) contains 3 seeds ×600 simulated seconds at 1/60 s, 10 s timelines, full frozen descriptors, actual contact counts, corridor-specific accumulated contacts, overlap comparisons and validity checks. No paths or births were injected.

| Node seed | First birth s | Plates at 60/120/180/300/600 s | Cap reached s | Tripod groups / individual feet | Active ants at 600 s |
| --- | ---: | --- | ---: | --- | ---: |
| 20261005 | 149.02 | 0 / 0 / 3 / 11 / 12 | 305.02 | 35067 / 103803 | 20 |
| 20261006 | 95.02 | 0 / 1 / 5 / 12 / 12 | 260.02 | 34531 / 102235 | 23 |
| 20261007 | 81.02 | 0 / 2 / 3 / 12 / 12 | 289.02 | 35138 / 104044 | 19 |

All 36 masks and centerline graphs are connected, all indices/pickups are valid, and all descriptors/Surface samples are finite. Surface maxima are 0.97775 / 0.97631 / 0.97778. Maximum ant speeds are 0.11933 / 0.11940 / 0.11947. Minimum physical surface gaps are −2.51e−9 / −1.20e−8 / −9.03e−9 world units, numerical tolerance rather than macroscopic overlap. Existing contact/pass-through and opposing/same-direction traffic tests remain valid.

The paired no-birth-analysis movement comparison was run for **seed 20261005**, with all 61 checkpoints including time zero identical. It was not run separately for all three seeds. The model/source regressions also confirm no behavior RNG or sensing changes.

All 66 historical layer pairs overlap in each final run. Symmetric near-path coverage is only a diagnostic: its maxima are 0.607 / 0.593 / 0.585; one pair in the first seed exceeds 0.6. That symmetric statistic differs from the directed max-length-normalized birth identity, so it cannot be called a refractory violation or a proven identical-corridor rebirth. Controlled tests demonstrate delayed same-corridor layering; natural runs mainly show multiple changing corridor shapes. All seeds reach the technical cap fairly early, which limits interpretation of longer evolution.

Natural simulation CPU wall time was 6.95 / 11.49 / 12.33 s for each 600-s run. This is accelerated model throughput, not audio CPU or an audio real-time guarantee.

[plate-birth-descriptors.json](plate-birth-descriptors.json) is the compact event index for all 36 Node and 12 Chrome births. It records source/target, length, mask/graph size, full width, evidence/material, frozen pickups, 96-grid overlap with prior layers and exact final-processor 32-grid coupling cells/coefficient. Full immutable masks remain in the raw reports. Coefficients are reconstructed without excitation from those masks; the geometry is frozen, so the overlap at a later analysis equals the overlap at birth. The older `plateOverlapAndCoupling.physicalCoupling` field is null in clip metadata; use this index or `processorDiagnostics.overlapCoupling`, not that unused field, for coupling values.

## Real Chrome recordings

The exact final output gain was tapped in parallel through `MediaStreamAudioDestinationNode`/`MediaRecorder`, with no microphone. All clips use 35% Volume, gain approximately 0.245, 48 kHz, running AudioContext and two worklet output channels. Seed is 20261005. Simulation preparation is accelerated while Audio Off; actual recording runs the app's live updater and real Web Audio for approximately ten wall seconds. Each clip starts with newly initialized vibration, so this compares accumulated geometry under current contacts, not a continuous ten-minute vibration history.

Chrome naturally found the first birth at **124.0167 s** and the second at **183.0167 s**. [natural-milestone-discovery.json](natural-milestone-discovery.json) and [run-summary.json](run-summary.json) preserve discovery and capture assertions. The Node first-birth time for the same seed differs; runtime precision/trajectory amplification is plausible but the cause is unverified. Do not interchange these runtime observations. Within Chrome, the legacy/bornSurface captures at 180 s began from an exactly matched ant/gait/body pose/pheromone/surface/activation fingerprint.

Each label links the WebM; adjacent same-stem `.json`, `.png` and `-waveform-spectrogram.png` preserve full metadata, screen and analysis. Plate counts refer to environmental layers; legacy audio still uses exactly one circular baseline Plate.

| Clip | Simulation window s | Ant range | Layers start→end | Tripod groups | Routed feet / layer strikes | RMS L/R | Peak L/R |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| [Legacy early](legacy-early-control.webm) | 20.00–30.07 | 9–11 | 0→0 | 309 | legacy centroid: 309 | .106828 / .107625 | .213894 / .207379 |
| [Legacy 180 s](legacy-comparison-180s.webm) | 180.00–190.15 | 15–21 | 1→2 | 630 | legacy centroid: 630 | .123782 / .123979 | .231711 / .235954 |
| [Before birth](bornsurface-prebirth-silence.webm) | 20.00–30.08 | 9–11 | 0→0 | 309 | 0 / 0 | 2.03e−34 / 2.03e−34 | 2.03e−34 / 2.03e−34 |
| [First birth](bornsurface-first-birth.webm) | 123.02–133.12 | 17–20 | 0→1 | 647 | 287 / 287 | .004554 / .005564 | .019460 / .023859 |
| [Early single](bornsurface-early-single.webm) | 124.27–134.35 | 17–20 | 1→1 | 648 | 310 / 310 | .004371 / .007181 | .018684 / .025281 |
| [Mature single](bornsurface-mature-single.webm) | 154.02–164.13 | 17–21 | 1→1 | 657 | 244 / 244 | .004763 / .010139 | .020234 / .026926 |
| [Natural overlap](bornsurface-natural-multilayer.webm) | 182.02–192.12 | 15–21 | 1→2 | 673 | 697 / 807 | .006325 / .003412 | .030286 / .019195 |
| [Born 180 s](bornsurface-late-180s.webm) | 180.00–190.13 | 15–21 | 1→2 | 628 | 539 / 611 | .005287 / .003329 | .026016 / .015704 |
| [Natural 600 s / 12 layers](bornsurface-600s-max-natural-layers.webm) | 600.00–609.97 | 16–20 | 12→12 | 576 | 1461 / 6926 | .008613 / .005803 | .038636 / .029566 |

All nine clips have zero clipping and non-finite decoded samples, and zero processor errors. Born clips report zero dropped routes. Legacy per-foot counters are not applicable; their zero values do not mean no legacy excitation. There is no deferred contact queue. Before birth, DSP output is exactly zero; the encoded/decode path has only a ~2e−34 numerical floor despite 924 actual feet.

The 600 s run naturally reached 12 layers at 302.02 s; no new births occur during its capture (`numberBornPlates: 0`, total layers 12). It has 1702 feet, 563 routed groups, 1461 supported feet and 6926 layer strikes, with processor pre-limiter maximum 0.190329. All 100-ms RMS windows remain positive and there are no exact-zero runs. This does not prove the absence of every possible hardware underrun.

Encoded durations are 9.96–10.14 s; wall capture times are 10.001–10.172 s. Codec/frame/stop timing is recorded explicitly. The max-layer clip uses a browser-owned ten-second stop timer to avoid automation polling delays. Plots use exactly ten seconds by trimming/padding decoded samples; RMS/peaks above use the full unnormalized decoded clip. This small duration difference must remain visible in metadata, not be described as byte-exact duration matching.

Born audio is substantially quieter than legacy at the same gain. Unsupported contacts, geometry/pickup response and fixed worst-case headroom contribute; output was not amplified or normalized to conceal this. The finite impulse budget is comparable, but current audible RMS is not equal to the universal baseline. Human listening quality was not verified by the agent; the actual recordings are provided for review.

## Waveforms, spectrograms and screens

[audio-comparison.png](audio-comparison.png) combines all nine clips. Every waveform uses ±1 full scale and ten seconds; it is explicitly the arithmetic mono average of decoded L/R. Every spectrogram uses FFT 1024, Hann, hop 256, shared 0–8 kHz and −100..0 dBFS amplitude scale. There is no per-clip peak normalization or per-image automatic contrast. Separate L/R RMS and peaks are preserved because the mono overview can conceal channel cancellation.

[First-birth diagnostic](bornsurface-first-natural-birth-debug.png) shows the actual birth-time pheromone, SurfaceField, selected skeleton/ribbon and pickups. Those field debug images use visual normalization only; qualification still uses absolute thresholds. [Mature single view](bornsurface-mature-single.png) and [600-s view](bornsurface-600s-max-natural-layers.png) were inspected. Normal rendering preserves white background, subtle solid historical gray ribbons, soft current pheromone and dark ants. [Production prebirth](production-ant-prebirth.png) is a separate real 30-s production view, not evidence of post-birth resonance.

## Numerical and real-time limits

[audio-numerical-evidence.json](audio-numerical-evidence.json) loads all three natural 12-layer mask sets at 44.1/48/96 kHz: nine cases. Bounded synthetic foot-like excitation at 144 groups/s for 0.5 s is followed by a 2-s unforced tail. This is a safety stress input, not a natural-contact recording. All outputs remain finite and under unity, and coupled energy at tail end is about 0.831× tail-start energy. Maximum pre-limiter output across cases is about 0.13134. Displacement, means/DC, pickups, overlap cells, CPU and phase are in the report. Tests separately cover no-overlap isolation, bounded transfer and exact 44.1 kHz chunk invariance.

The Node VM CPU proxy exceeded quantum budgets: p95 4.14–10.01 ms, 1.99–3.71× budget. This remains a performance risk signal. A native Chrome JavaScript proxy using the same final processor and natural masks measured p95 0.5–1.0 ms over 400 calls after 100 warmups, below 1.333–2.902 ms budgets; [audio-chrome-cpu-proxy.json](audio-chrome-cpu-proxy.json) records all nine cases. This second result is main-thread JS with fake ports, not a direct AudioWorklet scheduling measurement. AudioWorklet `performance.now` was unavailable: `timingAvailable=false`, `cpuMaxMs=null`. Therefore neither proxy establishes hard real-time guarantees on other machines. Actual 12-layer Chrome recording is healthy on this device, but scaling/resolution and load headroom need further review.

The max-layer controller update wrapper measured 567 calls / 494.8 ms total, mean 0.873 ms, worst 18.6 ms. This excludes rendering and does not measure audio-thread CPU. The 12-layer cap is a technical boundary, not an ecological result.

Invalid capture attempts are retained only under ignored `test-results`: the 2026-10-05 frozen-updater attempt, and 2026-10-06 00:19/00:20 max-layer attempts with excessive recording duration. None were copied here or used as successful evidence. The corrected curated max-layer clip has wall duration 10.0014 s.

## Files, commands and reversible commits

Environmental source: `src/lib/agents/ant/{SurfaceField,TrailPlateBirth,AntController}.js`. Audio integration: `src/lib/audio/{AntEnvironmentAudioBridge,SurfaceAudioBridge}.js`, `src/lib/lab/modelRegistry.js`, `src/lib/index.js`, `static/worklets/surface-plate.worklet.js`. Rendering: `src/lib/renderers/AntRenderer.js`. Regression/feature tests are the modified/new ANT surface, audio, renderer, birth and worklet tests; browser checks live in `scripts/browser-check.js`.

Evidence scripts: `surface-long-run-evidence.js`, `surface-audio-evidence.js`, `surface-audio-numerical-evidence.js`, `surface-audio-chrome-benchmark.js`, `surface-birth-descriptors.js`, `audio-snapshot-renderer.js`, `surface-audio-comparison.js`. The snapshot renderer has four focused tests. All masks/audio/screens in this directory are intended Git evidence.

```powershell
$env:BROWSER_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm test
npm run build
npm run test:browser
$env:CHECK_PRODUCTION = '1'
npm run test:browser
Remove-Item Env:CHECK_PRODUCTION
node scripts/surface-long-run-evidence.js
node scripts/surface-audio-evidence.js
node scripts/surface-audio-numerical-evidence.js
node scripts/surface-audio-chrome-benchmark.js
node scripts/surface-birth-descriptors.js
node scripts/surface-audio-comparison.js
```

Evidence scripts with capture/output options document them in their source; the curated run combined two validated natural capture runs. Re-running capture creates new ignored output and should not overwrite historical evidence.

| Commit | Scope |
| --- | --- |
| `0520e2f` | Individual-foot SurfaceField |
| `396884b` | Frozen corridor birth extraction |
| `c0ceb83` | Restrict geometry to qualifying distant paths |
| `ef86f47` | Shared layered audio and overlap springs |
| `3303c05` | Historical rendering and mechanism documentation |
| `3c8786e` | Latest-matching-layer refractory and continuous physics phase |
| `4b7f8b3` | Release destroyed processor lifetime |

The final evidence commit follows these commits; its SHA and verified pushed HEAD are reported in the final delivery. [Work record](../../2026-10-06-surface-plates-handoff.md) preserves the interrupted checkpoint and final continuation.
