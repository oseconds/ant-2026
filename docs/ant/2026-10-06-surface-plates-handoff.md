# ANT Surface Plate pass — implementation and verification record

Recorded 2026-10-06 Asia/Seoul. Work started from `fbdc21c5321be6f21a98be5783005f3522e41519` with a clean main working tree. The user briefly requested a quota-conscious wrap, then explicitly requested resumption. This record preserves the interrupted state and is updated with final evidence when available.

## Scope and baseline

The new environmental mechanism is chemical route + actual individual feet → slow mechanical SurfaceField → qualified frozen Plate corridor → layered acoustic excitation. No environmental or audio output feeds back into ANT behavior.

Before edits: npm test 155/155, build pass, installed Chrome development browser check pass. Existing integrated-refinement evidence and the original audio recording remain intact. AntAgent, LocalOccupancy, GaitController, BodyPoseController, GasterDeposition, PheromoneField, ColonyActivation, legacy AntAudioBridge, AudioEngine, WorkletModel, PlateModel and generic plate.worklet.js have no diff from starting HEAD. Movement remains 4.5 rad/s turn, acceleration 32, brake 37, preferredSpeed ×1.35 cap, ±2.2 trail-turn damping clamp; pheromone half-life 15 s and gaster dose/spacing remain unchanged.

## Implemented systems and exact files

- `src/lib/agents/ant/SurfaceField.js`: 96×96 Float32 compaction, individual FOOT_CONTACT positions, saturating local Gaussian contact dose 0.025/radius 0.012, simulation-time half-life 1800 s. Pre-contact material response has footprint radius 0.014→0.009 and strength transfer 0.95→1.05. No-contact/invalid/outside events add nothing; no behavior RNG.
- `src/lib/agents/ant/TrailPlateBirth.js`: one-second observations; bounded chemical evidence v/(v+0.04), 20 s EMA; threshold 0.30 plus Surface support 0.015 within radius 0.025. Zhang–Suen skeleton and deterministic weighted Dijkstra connect source annulus radius 0.055–0.115 around (0.5,0.72) to boundary distance ≤0.05. Minimum geodesic 0.30 and 20 s persistence. Selected distant paths retain their real branches; short dead-end twigs are pruned. Transverse supported-region distance supplies half-width 0.012–0.030. Rasterized ribbon, graph, material, provenance and 25%/75% path pickups are frozen. Density 1–1.2, stiffness 0.65–1.15, damping baseline 0.25–0.45. No old geometry follows later pheromone.
- `src/lib/agents/ant/AntController.js`: only environmental observation, birth notifications, snapshot fields and audio-mode coordination. Actual FOOT_CONTACT schema and gait timing remain unchanged. It routes pre-contact material responses and synchronizes frozen descriptors at birth and Audio On.
- `src/lib/audio/AntEnvironmentAudioBridge.js`, `src/lib/lab/modelRegistry.js`, `src/lib/index.js`: isolated `legacy` / default `bornSurface` selection sharing the existing engine. The original legacy bridge stays unchanged. Changing mode releases the old transport and requires a fresh Audio On.
- `src/lib/audio/SurfaceAudioBridge.js`: one shared stereo worklet, one existing output gain. Finite group energy is divided across feet and containing layers using an L2 budget; unsupported feet keep their share unused. No backlog while Off/loading. Historical descriptors survive Off/On; switching away destroys the run. Maximum 12 layers, no eviction; capacity is visible in diagnostics.
- `static/worklets/surface-plate.worklet.js`: sparse 32×32 Dirichlet finite-difference bending layers at fixed 6 kHz physics, interpolated output, fixed headroom 1/sqrt(12), existing-style bounded output. Overlap uses reciprocal restoring springs; reference coefficient 0.000025, squared-rate scaling and inverse-rate damping. Material masks and pickups are validated before allocation. Layer histories are distinct, never unioned.
- `src/lib/renderers/AntRenderer.js`: immutable masks cached once, gray alpha 10 historical ribbons below live pheromone and ants; no UI dashboard.
- `scripts/surface-long-run-evidence.js`: deterministic natural default runs, body/field finiteness, contact accounting, connectivity/pickups, overlaps and paired behavior checkpoint hashes.
- `scripts/surface-audio-evidence.js`, `scripts/audio-snapshot-renderer.js`: real Chrome final-gain parallel MediaRecorder tap, seeded controller RNG independent of p5, live RAF only during capture, fixed 10 s waveform ±1; FFT 1024/Hann/hop 256, 0–8 kHz, −100..0 dBFS without per-clip normalization.

Focused tests live in surface-field, trail-plate-birth, surface-audio-bridge, surface-plate-worklet, ant-surface-integration, ant-environment-audio and audio-snapshot-renderer test files. Existing renderer/audio fixture/browser tests include historical layers and explicitly isolate legacy checks.

## Development findings and corrections

The first exploratory birth implementation used the entire connected skeleton component. Natural runs showed excessive material coverage and corridor growth bypassing mask-only repeat identity. It was replaced by ribbons around qualifying distant graph paths, with mask IoU plus tolerant principal-path identity. Rebirth requires 10 s global separation, 90 s since the latest similar layer and at least 30 new real contacts on that layer's corridor. The latest-match rule prevents a third layer from using an older layer's already-expired cooldown.

The audio processor was reduced from the preliminary 48-grid/12 kHz design to 32-grid/6 kHz after realtime cost review; this changes only new audio discretization. Existing generic Plate DSP remains intact. A test tension-sign error was corrected, and mass-weighted discrete energy checks were added. Decimation must carry its phase across render quanta, particularly 44.1 kHz; final phase-invariance validation is recorded with final test results.

An early recording harness run left ANT's RAF update disabled, so its audio/contact conclusions are invalid. That run remains ignored at `test-results/surface-pass-2026-10-05T15-03-45-501Z` and must never be curated as success evidence. The corrected harness restores the real app updater for recordings and injects the acoustic bridge into the seeded fresh controller.

## Verification checkpoint before resumption

Full repository tests: 189/189 pass. Build: pass. Installed Chrome development and production-preview checks: pass, including bornSurface pre-birth silence, normal user-gesture Audio On, Off/On and ANT→Plate→ANT teardown; legacy dev audio and generic Plate remain checked. These results are preserved in the evidence directory. They do not substitute for recorded born-Plate natural output.

Three natural seeds ×600 simulated seconds completed. The prior checkpoint first births were 149.02 / 95.02 / 81.02 s, and each reached the explicit 12-layer cap. Surface maxima were approximately 0.978 / 0.976 / 0.978; no finite/body/surface violations were recorded. Minimum physical gaps were negative only at numerical precision (worst approximately −1.2e−8 world units). A paired run without birth analysis had identical movement hashes at every checkpoint. The report is being rerun after the latest-matching-layer refractory correction; the final JSON is authoritative.

## Evidence and resumption

Curated directory: `docs/ant/evidence/2026-10-05-surface-plates/`. Its date follows the experiment start; the continuation and recording metadata use their actual timestamps. Historical baseline zero remains `docs/ant/evidence/2026-10-05-integrated-refinement/natural-run-audio.webm`.

Production screenshot `production-ant-prebirth.png` is a real 30 s browser state with Audio On; it proves the current UI/live pheromone view, not born geometry or post-birth sound. First-birth graph/material/pickup images and actual comparable audio must come from a validated fresh recording run.

Remaining acceptance work at the resumption checkpoint (historical list; completed by the final continuation below):

1. Final 44.1/48/96 kHz phase/coupling tests and natural-mask offline numerical/CPU evidence.
2. Fresh real Chrome 35% Volume / gain 0.245, identical 10 s legacy/pre-birth/first-birth/single-or-multi/180 s windows. Assert live simulation advancement, actual contact/routing deltas, matched seeded pre-capture state and expected silence/non-silence. Record all RMS/peak/clipping/nonfinite/context/rate/age/coupling metrics.
3. Inspect first-birth and mature screen images; preserve fixed-scale waveform/spectrogram comparison sheet. Report unavailable natural milestones rather than forcing births.
4. Refresh final tests/build/dev/production checks if relevant source changes; commit evidence separately, push main, verify remote HEAD and clean status.

Commands (PowerShell, installed Chrome):

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
```

Commits already saved before resumption: `0520e2f` SurfaceField; `396884b` frozen births; `c0ceb83` qualifying branches; `ef86f47` layered audio/coupling; `3303c05` historical rendering/documentation. They were local at that checkpoint. Final evidence/remote status is recorded below when verified. No claim of learned behavior, instrument construction, procession emergence or successful acoustic ecology is made from these checks.

## Final continuation — 2026-10-06

The outstanding implementation and evidence work is complete. Final repository tests are **191/191**, build passes, and installed Chrome development plus production-preview checks pass after the teardown correction. Destroyed processors now return false to end their processing lifetime. The added regression asserts that behavior. Current source has no changes in the constrained baseline files listed above.

The authoritative long-run JSON was regenerated after the latest-matching-layer fix: three natural seeds ×600 simulated seconds, first births **149.02 / 95.02 / 81.02 s**, 12 layers each, all 36 descriptors connected/valid/finite, no field/body nonfinite values, minimum gaps within numerical precision. One paired seed 20261005 no-birth-analysis baseline has identical movement at all 61 checkpoints including time zero. This paired check was not separately repeated for all three seeds.

Nine real Chrome final-output recordings at 35% Volume / gain 0.245 cover legacy early/180 s, prebirth silence, first birth, early/mature single layer, natural second-layer overlap, bornSurface 180 s and natural 600 s/12 layers. Chrome first/second births were **124.0167 / 183.0167 s**, separate from Node's runtime observation. The 180 s legacy/bornSurface start fingerprints are exactly matched within Chrome. Encoded durations are 9.96–10.14 s with explicit wall times; all plots use a fixed ten-second axis and unchanged amplitude/spectral scales. RMS/peak/clipping/silence/routing/context/rate/age/material/coupling metadata is retained in each JSON. All nine have zero clipping/nonfinite samples and processor errors; born routes report zero drops. Before birth is silent. The corrected max-layer clip stops with a browser-owned ten-second timer, wall duration **10.0014 s**, 576 tripod events /1702 feet /1461 routed feet /6926 layer strikes, nonzero output and 12 persistent layers.

First-birth debug, mature single, fixed-scale nine-row comparison and 600 s screenshots were inspected. These important screenshots and all valid audio are included in the Git evidence folder. A compact 48-birth index derives exact frozen overlaps and final processor coupling without inventing contacts or births. Earlier invalid frozen-update and over-duration attempts remain ignored, outside curated evidence.

Nine offline natural-mask DSP cases at 44.1/48/96 kHz stayed finite and damped with no output over unity. Node VM CPU p95 exceeded quantum budgets; native Chrome JS proxy p95 was 0.5–1.0 ms, within its budget. Both are proxies: direct audio-thread timing was unavailable. Actual Chrome output was healthy on this device; universal hard realtime performance is not established. The technical 12-layer cap was reached by about 260–305 s in all Node seeds. Current 32-grid contact footprints are subcell, so their distinct impulse widths are not well resolved; born audio is substantially quieter than legacy. No DSP gain tuning was done to conceal the result, and agent human-listening verification is not claimed.

Full final equations, algorithms, material/pickup/refractory rules, all clip statistics, exact evidence paths and limitations are in [the evidence report](evidence/2026-10-05-surface-plates/README.md). Subsequent source commits are `3c8786e` (refractory/phase) and `4b7f8b3` (processor release). The evidence commit is the final reversible delivery commit; its exact SHA and remote verification are reported with delivery.
