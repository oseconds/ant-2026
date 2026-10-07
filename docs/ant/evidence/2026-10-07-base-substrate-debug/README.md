# Base substrate / Plate Debug continuation — 2026-10-07

Status: implementation review, matched-seed invariance, tests, build and real Chrome debug visualization checks passed. The later harness-only PCM repair captured reliable pre-birth and first-Plate A/B. Off silence, On nonzero PCM and identical born Plate PCM are now verified. Post-birth substrate RMS is **29.19 dB above** born Plate RMS; absence of masking remains unverified. Default substrate remains **Off**; this pass is retained on `ant-base-substrate-debug`, with no main merge or remote push.

The starting main commit was `96bcc263827a762000e1fb67b5c0795b919c497e`; the resumed branch commit was `c63634a9ac92019682f86e236794caf0681c5bc5`. Existing branch implementation was inspected and preserved rather than rebuilt. Captures have source hashes because they were made before the continuation commit.

## Final settings and preserved boundary

| Setting | Value / meaning |
| --- | --- |
| Base Substrate default | Off; separate from the explicit Audio On gesture |
| Mode | Optional existing generic Plate transport in born-surface mode |
| Relative output | `ANT_BASE_SUBSTRATE_OUTPUT_RATIO = 0.22` |
| Damping | `ANT_BASE_SUBSTRATE_DAMPING = 1`, mapped to generic Plate processor control 100 |
| Output gain | Base `0.7 × master volume × 0.22`; born surface `0.7 × master volume` |
| Material history | No substrate layer, birth, nodule or depth contribution |
| Born Plate sonic baseline | 3 ms contact pulse, 75 ms local recovery, ×50 damping |

No movement, steering, gait, collision, pheromone, SurfaceField, recruitment, Plate qualification or stratigraphy settings were tuned. The born-surface and generic Plate worklets, topology compiler and material implementation have no diff against the inspected main baseline. The continuation fixed one mode-switch bug: disabling the substrate no longer stops a selected primary legacy experiment. Its regression failed before the one-line guard and passed after it.

## Matched-seed invariance

Fresh controllers ran three seed pairs for 600 seconds each, at 60 Hz. Off and On both enabled the born-surface bridge; On additionally enabled the base transport. The mock transport was fully drained and positively checked for delivered base events before and after first birth. Every pair matched for RNG state/consumption, full agent trajectories/gait/body pose, pheromone, SurfaceField, ordered `FOOT_CONTACT`, frozen Plate birth times/descriptors, per-tick stratigraphy grids/state, and born-surface audio commands.

| Seed | First birth (s) | Plates at 600 s | Matched born commands | On base deliveries, pre / post birth |
| --- | ---: | ---: | ---: | ---: |
| 20261005 | 103.0167 | 32 | 61,510 | 4,291 / 31,460 |
| 20261006 | 220.0167 | 28 | 51,808 | 11,241 / 24,136 |
| 20261007 | 145.0167 | 31 | 61,248 | 6,470 / 28,978 |

Each Off run also matched an injected read-only copy of main's `TrailPlateBirth` class. This checks the diagnostic refactor against the previous qualification implementation; it is not a whole-repository main replay. These are command/state comparisons, not PCM measurements. The final run was completed unchanged when the later visualization request arrived.

Raw hashes, all birth descriptors, counters, provenance and limits: [matched-seeds.json](invariance/matched-seeds.json). Harness: [`scripts/ant-base-substrate-invariance.js`](../../../../scripts/ant-base-substrate-invariance.js).

## Audio A/B — initial failure and PCM-only follow-up

The dedicated capture used a fresh natural seed 20261005 run and intended to replay actual bridge routes through Chrome `OfflineAudioContext` AudioWorklets: the 10 seconds immediately before first birth, then the following 10 seconds with isolated born/substrate stems and a duplicate born control.

The initial attempt stopped with `prebirth On legacy Plate scheduler handshake timed out.` No successful WAV or PCM report was produced in that pass. This failure did not establish a production DSP defect or acoustic result. The historical failure record and harness hash remain in [audio/FAILURE.md](audio/FAILURE.md). The harness was preserved during the user's visualization-only instruction.

The user then explicitly authorized repairing only the PCM scheduler and rerunning the frozen A/B, using existing waveform/spectrogram conventions. Schedule/topology now arrive through constructor-cloned `processorOptions`; the first process block acknowledges frame 0 after rendering starts. Flat report indexing was corrected. A receipt audit also found non-monotonic sub-tick timestamps in the original emission sequence; stable sorting the replay schedules by requested frame preserves every payload/timestamp and equal-frame order while restoring the declared clock mapping. Production DSP, settings, routing and simulation did not change.

The final Chrome 48 kHz capture has ten processors across four conditions, each reporting frame-0 readiness and all 480,000 frames. Pre-birth On dispatches all 561 contact groups; post-birth dispatches all 624 base groups and 63 accepted P1 strike routes per born processor. Off and On born outputs plus the duplicate control are identical over 960,000 channel samples. Every WAV is finite and unclipped. The source stream and Plate hashes match the provisional capture exactly. Legacy dispatch remains at the next 128-frame boundary (measured maximum 127 samples); born routes dispatch at their requested sample.

| Final 10 s condition | Peak, max L/R | RMS, pooled L/R |
| --- | ---: | ---: |
| Pre-birth Off | 0 | 0 |
| Pre-birth On | 0.0429723 | 0.0216270 |
| First Plate, Off / isolated born | 0.00649256 | 0.000779757 |
| First Plate window, substrate stem | 0.0442604 | 0.0224675 |
| First Plate window, On sum | 0.0443426 | 0.0225040 |

Pre-birth simulation window: `[93.0167, 103.0167)` s. First-Plate window: `[103.0167, 113.0167)` s. Each maps to audio `[0, 10)` s at 48 frames per simulation millisecond. Both conditions start from rest; these are controlled window replays, not stitched continuous-live PCM. Unchanged generic Plate strike jitter uses `Math.random`, so the base noise realization can vary between reruns.

The waveform/spectrogram evidence reuses the immutable `ant-surface-stratigraphy-v1` and overview/zoom renderers: waveform ±1, separate L/R, FFT 1024 Hann, hop 256, 0–8 kHz, grayscale −100…0 dBFS, gamma 1, no normalization. Existing FOOT_CONTACT/P1 markers use explicit absolute simulation/audio anchors; the display-only time origin is shifted to each window start. See [audio/README.md](audio/README.md) for PCM, plots, markers, per-channel metrics, source hashes and reproduction.

Substrate RMS is 28.81 times born Plate RMS in this first-Plate window. The measured level imbalance does not prove psychoacoustic masking, but it supplies no acceptance evidence that born Plate audibility is preserved. “Quiet/short” describes the intended settings, not an established result relative to born Plates. No tuning was authorized. Default On is not adopted and main integration remains withheld.

## Plate geometry visualization

Three independent unchecked controls were added: **Plate outlines**, **Plate centerlines**, **Plate pickups**. Plate IDs remain separate. P1/P2/P3 use blue, brown and purple across their frozen boundaries, skeletons and source/end labels. Current candidate geometry retains its separate turquoise category. SurfaceField, source annulus, exposure depth, pheromone and material controls remain available.

- Outlines derive solely from occupied frozen mask cells: only cell sides facing empty neighbors are drawn, producing joined ribbon contours without cell fills.
- Skeletons draw every existing frozen `centerline`/`edges` connection, including branches.
- Filled pickup markers resolve the current compiled topology's two pickup nodes for each Plate. They show solver positions, which may differ slightly from the frozen target coordinates. Without a compiled topology, hollow markers explicitly identify the frozen targets.
- Exposed geometry uses opacity 225; covered geometry uses 65, from the existing top-layer grid and Plate insertion index. A legend explains the distinction. This changes drawing only.
- Audio topology is attached to an ephemeral render snapshot only when the pickup toggle is active. No descriptor, model or material state is written by the renderer.

Fresh natural seed 20261005 was captured in development and production Chrome. Each frozen graph was connected, each Plate had two valid compiled pickup positions, each new toggle changed actual canvas pixels, and toggling left agents, both fields, descriptors and material unchanged. Restoring all defaults restored the exact original canvas hash at every milestone.

| Milestone | Natural time | Spatial result |
| --- | ---: | --- |
| First birth | 103.0167 s | P1: 70 skeleton nodes, 72 edges, 240 mask cells; one connected route |
| First natural overlap | 150.0167 s | P1/P2 separate by color; P1 has 203 exposed and 37 buried cells |
| Three Plates | 180.0167 s | P1/P2/P3 traceable through their full frozen graphs, including covered portions |

The screenshots were visually inspected. Debug legends were moved below the occupied route region. New geometry toggles are false by default, with production pheromone/material rendering unchanged. Expanded 390 px mobile layout fits the viewport.

Production screenshots: [first birth](plate-geometry/production/first-birth-canvas.png), [natural overlap](plate-geometry/production/natural-overlap-canvas.png), [three Plates](plate-geometry/production/three-plates-canvas.png). Full-page captures include the controls. Measurement/provenance: [dev summary](plate-geometry/dev/summary.json), [production summary](plate-geometry/production/summary.json).

The earlier [dev](browser/dev/summary.json) and [production](browser/production/summary.json) evidence preserves the original seven overlays, all 15 diagnostic fields, candidate/refractory/repeat observations, natural nodule history, audio awake/sleeping and audio/wall displays. These historical captures and their [source manifest](validation/source-manifest.json) are retained unchanged. Their harness deliberately still expects seven controls and describes that earlier source state; use the new geometry script and ordinary browser suite for the final ten-control UI.

## Validation and reproduction

- Relevant model/audio/renderer tests: 35/35; final renderer tests: 11/11.
- Full `npm test`: 266/266.
- `npm run build`: passed. Existing Rollup annotation and large-chunk warnings remain.
- Real Chrome `npm run test:browser`: development passed; `CHECK_PRODUCTION=1` production passed.
- New natural geometry evidence: development and production passed; no console/page errors.
- Code review: [review findings and limits](validation/code-review.md). Logs are in [validation/](validation/).

Final source and frozen-harness hashes, plus the read-only remote main check: [final source manifest](validation/final-source-manifest.json). One failed dev population check is retained beside the final passing dev log; its stale startup lower bound was corrected without changing the model.

```powershell
npm test
npm run build
npm run test:browser
$env:CHECK_PRODUCTION = '1'
npm run test:browser
Remove-Item Env:CHECK_PRODUCTION
node scripts/ant-plate-debug-visual-evidence.js
node scripts/ant-plate-debug-visual-evidence.js --production
node scripts/ant-base-substrate-invariance.js
```

For the later PCM-only follow-up, run `node scripts/ant-base-substrate-audio-evidence.js`, then `node scripts/ant-base-substrate-audio-visuals.js`. The historical failure and constructor-only provisional report are retained and are not the final accepted timing evidence. The long invariance run and Plate debug evidence were not repeated or broadened for this repair. Natural browser milestones use the unchanged fixed-tick model with display scheduling frozen; no forced births or overlap were manufactured. These captures are not a mature 20–30 Plate realtime stress test, and the cumulative asynchronous audio/wall display is not a general performance guarantee.
