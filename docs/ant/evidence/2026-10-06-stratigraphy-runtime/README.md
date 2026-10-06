# ANT Z material / shared runtime evidence

2026-10-06 Asia/Seoul. Starting main: `d281d341f5abe68ff98ca4cbf837838c7b7b45a2`. The working tree was audited and valid interrupted work preserved. The old traffic handoff was replaced before this environmental experiment. Historical integrated-refinement and Surface Plate evidence is unchanged.

This pass preserves immutable corridor births and adds a separate mutable material lifecycle: local exposure/burial, adjacent Z springs, sparse compiled shared DSP, physical sleep and continuous contact footprints. A small buried Sphere prototype receives energy through a foundation Plate. No ANT behavior or generic Lab model is retuned. [Exact rules and formulas](../../2026-10-06-stratigraphy-runtime-handoff.md) and [future interfaces, design only](../../2026-10-06-material-extensions.md) are separate from measurements.

## Verification

| Check | Result | Artifact |
|---|---|---|
| Starting test suite | 191/191 | `baseline-tests.txt` |
| Starting build | pass | `baseline-build.txt` |
| Final test suite | 227/227 | `final-tests.txt` |
| Final build | pass | `build.stdout.txt` |
| Chrome development | pass | `browser-dev.stdout.txt`, `browser-dev-metrics.json`, `browser-dev-ant.png` |
| Chrome production preview | pass | `browser-production.stdout.txt`, `browser-production-metrics.json`, `browser-production-ant.png` |
| Protected source comparison | 17/17 identical | `regression-freeze.json` |
| Historical evidence comparison | no changed files | `regression-freeze.json` |

[Verification record](verification.md) distinguishes the retained terminal output from originally redirected logs. Development lifecycle screenshot uses 35% Volume; production lifecycle screenshot uses 100%. Those screenshots do not substitute for synchronized 35% recording evidence. Existing build annotation and bundle-size warnings are non-fatal.

## Natural model histories

Fresh default AntControllers, deterministic LCG seeds, 1/60 s ticks, no forced births or contacts, Audio Off. `natural-runs.json` is the full losslessly minified record including immutable Plate/nodule descriptors and 10 s checkpoints; `natural-summary.json` is its readable summary. Model throughput is separate from browser/DSP timing.

| Seed | First Plate s | Plates 60/120/180/300/600 s | First nodule s | Nodules 600 s | Individual feet |
|---|---:|---|---:|---:|---:|
| 20261005 | 149.017 | 0/0/3/11/34 | 225.300 | 32 | 103803 |
| 20261006 | 95.017 | 0/1/5/15/36 | 207.000 | 32 | 102235 |
| 20261007 | 81.017 | 0/2/3/13/36 | 252.750 | 32 | 104044 |

Seed 20261005 extended to 1200 s retained 73 historical Plates, maximum local stack 70, maximum derived foundation burial 0.11611 m and 211978 real feet. All birth masks, paths, graphs, pickups and frozen descriptors validated. No agent/pheromone/SurfaceField non-finite values were found. Minimum contact margin was about −1.20e−8 normalized units, consistent with numerical collision tolerance; exact positive clearance is not asserted.

The lifecycle-disabled same-seed control matched all 60 checkpoints of full agent/body/gait state, pheromone, SurfaceField, activation/recruitment/population and RNG. The explicit limits are 256 Plates and 32 nodules, with no eviction. All three 600 s runs reached the nodule prototype cap; this constrains further nodule accumulation and is not an ecological rule.

`baseline-history-audit/` is an earlier diagnostic of the d281d34 history, used while choosing conservative nodule qualification. It is not final runtime evidence. `smoke-natural-runs.json` is a five-second harness smoke, not a natural milestone.

## Synthetic runtime / numerical checks

`surface-topology-scaling-evidence.json` and `surface-topology-scaling-run.txt` are synthetic engineering records. Two mask shapes (full and narrow Y corridor), 12/24/48 layers and 44.1/48/96 kHz produced 18 finite cases with zero clipping. They use one localized bounded grouped impulse; they do not claim that every historical node is simultaneously awake.

| Historical layers | Corridor topology bytes | Corridor DSP state bytes | Full topology bytes | Full DSP state bytes |
|---:|---:|---:|---:|---:|
| 12 | 128218 | 56728 | 733570 | 697288 |
| 24 | 175450 | 113800 | 1397458 | 1409992 |
| 48 | 269914 | 227944 | 2725234 | 2835400 |
| 256, compiled only | 1088602 | 1217192 | 14232626 | 15188936 |

Typed-array byteLength sums exclude ordinary JS objects/arrays, browser and AudioEngine memory. The 256-layer full mask has 262144 nodes; the corridor has 20992. Fully awake 256-layer realtime processing is not verified. The ceiling bounds storage/validation and does not imply that every allowed topology fits every device's audio budget. No older history is discarded.

The 32-nodule synthetic allocation integrates 384 low-order slots, with 129272 topology bytes and 70616 DSP state bytes in its controlled corridor topology. Separate Sphere sleep is not implemented. Five within-cell contact positions all yielded the same bounded kinetic impulse proxy 0.0006125 while changing spatial distribution. Focused tests compare radii 0.009 and 0.014 at identical node-center and subcell positions with preserved L2 budget.

Chrome main-thread proxy p95 was 0.6–1.5 ms across nine sample-rate/layer cases. At 48 kHz, Node VM corridor p95 for 12/24/48 historical layers was 1.895/2.053/1.808 ms, with 332 active nodes and 7/19/43 sleeping layers. These are proxies, not AudioWorklet scheduling measurements or hard realtime guarantees. The actual recording health is reported separately below.

Worklet source SHA256: `5531011e634ad6ca3c97e4a4e5669e0100cef5b009af0c2e9b37f26ab222e802`. The energy diagnostic includes Plate kinetic/bending/tension, Z spring, modal Sphere and foundation spring terms. It omits leapfrog cross-strain bookkeeping and is not a conservation proof. In the narrow 12-layer/48 kHz short tail it ranged 0.00056622–0.00063920 and ended below its post-excitation value 0.00062441. Raw displacement/velocity-only state sums can rise as strain converts to motion; they are not an instability criterion.

## Immutable audio visualization standard

Detail preset `ant-surface-stratigraphy-v1`: 10 s, 1200×1000; comparison sheet 1200×1200 with fixed row slots. Full overview preset `ant-stratigraphy-audio-overview-v1`: 1800×1200, separate L/R spectrograms. Every waveform uses amplitude −1..+1, background luminance 255, line 24, guide 180, width 1, opacity 1. There is no peak/RMS normalization, adaptive alpha or content-derived gain.

All spectrograms use FFT1024, symmetric Hann, hop256, 0–8000 Hz, −100..0 dBFS and gamma 1. Brightness is `round(255*clamp((db+100)/100,0,1))`: −100/−80/−60/−40/−20/0 dBFS maps to 0/51/102/153/204/255. Overview pixels use fixed-dBFS maximum pooling over their time/frequency bins, not per-image contrast. This can emphasize a transient within a wide bin and is documented in the preset.

Measured AudioContext sample anchors map real audio to simulation time. Plate births get thin P1/P2 markers and count arrows, labels above data. The model has no removal/death operation, so none is invented. Real individual feet fill a fixed 28 px contact strip in 10 s simulation buckets; 2400 feet fills the strip. 180 s selects early/middle/late detail starts; 600 s selects early/first-birth neighborhood/densest bucket/late, deterministically. Each detail contains exactly ten decoded-audio seconds, with its actual simulation span labeled and FOOT_CONTACT ticks mapped to audio time. Modal decay is not stretched to fit ten simulated seconds. Full-run audio must be genuinely continuous; disconnected ten-second clips are not stitched into an overview.

## Reproduction

```powershell
npm test
npm run build
$env:BROWSER_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:browser
$env:CHECK_PRODUCTION='1'
npm run test:browser
Remove-Item Env:CHECK_PRODUCTION
node scripts/stratigraphy-regression-freeze.js
node scripts/stratigraphy-long-run-evidence.js
$env:CHROME_EXECUTABLE_PATH=$env:BROWSER_EXECUTABLE_PATH
node scripts/surface-topology-scaling-evidence.js
node scripts/stratigraphy-motion-evidence.js --continuous
```

The recording script uses actual Chrome canvas motion and a parallel final GainNode stereo tap, 35% Volume (0.245 final gain), no microphone or synthesized replacement. Raw decoded Float32 WAV and temporary failed/debug runs remain under ignored `test-results`; curated WebM, images, metrics and reproduction scripts belong to this new evidence directory.

## Interpretation limits

The mechanism is an approximate linear finite-difference Plate and a small Sphere-inspired modal prototype. It is not a calibrated ground/elastic-sphere model. Nodule support/cap and geometry are local environmental rules; there is no behavior feedback. Audio Off clears vibration transport but retains material history within the run; changing Lab models ends that ANT run. Human listening quality and acoustic-ecology conclusions require separate evaluation. No learning, intentional construction, procession emergence or successful Sphere ecology is claimed.

Continuous recording artifacts and release verification are appended after their actual decode/measurement checks finish.
