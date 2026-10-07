# Base substrate / Plate Debug continuation — 2026-10-07

Status: implementation review, matched-seed invariance, tests, build and real Chrome debug visualization checks passed. The dedicated PCM capture failed during the pre-birth On scheduler handshake. Pre-birth silence/nonzero PCM and post-birth masking therefore remain unverified. Default substrate remains **Off**; this pass is retained on `ant-base-substrate-debug`, with no main merge or remote push.

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

## Audio A/B status — failed gate

The dedicated capture used a fresh natural seed 20261005 run and intended to replay actual bridge routes through Chrome `OfflineAudioContext` AudioWorklets: the 10 seconds immediately before first birth, then the following 10 seconds with isolated born/substrate stems and a duplicate born control.

It stopped with `prebirth On legacy Plate scheduler handshake timed out.` No successful WAV or PCM report was produced. This failure does not establish a production DSP defect, Off silence, On nonzero PCM, or absence of masking after birth. The failure record and frozen harness hash are in [audio/FAILURE.md](audio/FAILURE.md). The existing PCM harness was preserved without further repair or rerun after the user's visualization-only instruction. The subtitle “quiet/short” describes the chosen settings; decay and perceptual masking are not newly demonstrated by this failed capture.

Browser diagnostics did show installed sleeping → awake layers and delivered base contacts, and ordinary audio smoke tests passed. Those observations do not replace the requested matched first-birth PCM evidence. Default On is not adopted and main integration is withheld.

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

Do not treat the preserved PCM script as a passing check: its final failure is recorded above. The long invariance run was not repeated or broadened for the visualization change. Natural browser milestones use the unchanged fixed-tick model with display scheduling frozen; no forced births or overlap were manufactured. The browser evidence is not a mature 20–30 Plate realtime stress test, and the cumulative asynchronous audio/wall display is not a general performance guarantee.
