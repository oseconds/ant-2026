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
node scripts/stratigraphy-long-run-evidence.js --output=test-results/ant-stratigraphy-natural-runs.json
$env:CHROME_EXECUTABLE_PATH=$env:BROWSER_EXECUTABLE_PATH
node scripts/surface-topology-scaling-evidence.js
node scripts/stratigraphy-motion-evidence.js --continuous
```

The recording script uses actual Chrome canvas motion and a parallel final GainNode stereo tap, 35% Volume (0.245 final gain), no microphone or synthesized replacement. Raw decoded Float32 WAV and temporary failed/debug runs remain under ignored `test-results`; curated WebM, images, metrics and reproduction scripts belong to this new evidence directory.

## Interpretation limits

The mechanism is an approximate linear finite-difference Plate and a small Sphere-inspired modal prototype. It is not a calibrated ground/elastic-sphere model. Nodule support/cap and geometry are local environmental rules; there is no behavior feedback. Audio Off clears vibration transport but retains material history within the run; changing Lab models ends that ANT run. Human listening quality and acoustic-ecology conclusions require separate evaluation. No learning, intentional construction, procession emergence or successful Sphere ecology is claimed.

## Actual mature Chrome clock health

The corrected real Chrome run reached 600.2167 simulated seconds in 600.252 wall seconds. Its AudioContext advanced only 332.5947 seconds; decoded stereo audio is approximately 332.58 s. The initial 240 s tracked wall time closely, then the audio clock increasingly lagged: simulation/audio seconds approximately 300/275.243, 360/293.600, 420/306.651, 480/317.013 and 600/332.568 at the sampled anchors. This mature run fails realtime clock health. It is not evidence that 35 actively resonating historical layers fit the device's audio budget.

The last observed processor diagnostic had 35 awake Plates, zero sleeping Plates, 11352 active nodes, 15609 compiled Z links, 32 nodules and 384 integrated modal slots. Natural continuous excitation kept this workload awake; the synthetic localized-strike proxy with about 332 active nodes does not represent it. No processor error or non-finite value was reported. Pre-limiter maximum was 1.025788 with three pre-limiter threshold exceedances. These are distinct from final PCM clipping, which is measured from the captured audio. End diagnostics are asynchronous observations and can lag final bridge route counts.

Both native recordings and the nonuniform clock map are retained without audio stretching, gain compensation or fabricated silence. A matched simulation interval may have different native video/audio durations. Overview uses the measured simulation/audio mapping; fixed ten-second audio details label their actual simulation span. The later spectral-density comparison therefore includes this clock/load confound and cannot isolate the effect of material accumulation. This is an important measured runtime limitation, not a successful synchronized realtime playback claim.

The first full recording attempt exposed an evidence-harness transport bug: nested encoding promises were not awaited before Playwright serialization, producing empty files. The harness was corrected to await encoding, drain each recorder buffer once and flush after stop. A five-second actual Chrome smoke was fully decoded before the new 600 s run. The failed temporary run remains ignored and is not presented as evidence.

## Real Chrome motion and native stereo evidence

The seed 20261005 recording produced 35 immutable Plates and 32 nodules without forced births. First Plate: 124.0167 simulation seconds; first nodule: 246.6500 s. This browser trajectory is separate from the fixed-tick accelerated model runs above. The opening 20 s stereo segment is exactly silent. Before material birth the bornSurface environment has no universal resonant Plate.

All six motion clips are real Chrome canvas motion, 640×640, 24 fps, fully decoded and 20.000 s long. They are clean normal ANT views. Each accompanying WAV is the original final-output stereo PCM for the same recorded simulation interval; later native durations differ because of the measured clock failure. They must not be presented as healthy realtime synchronized playback.

| Milestone | Simulation interval s | Motion | Native audio duration s | Original stereo PCM |
|---|---|---|---:|---|
| Opening | 0–20 | [video](motion/opening-motion-20s.webm) | 20.03342 | [audio](motion/opening-mapped-original-audio.wav) |
| First Plate | 119.0167–139.0167 | [video](motion/first-plate-motion-20s.webm) | 20.00000 | [audio](motion/first-plate-mapped-original-audio.wav) |
| Multi-layer Z | 194.0167–214.0167 | [video](motion/multi-z-motion-20s.webm) | 19.99627 | [audio](motion/multi-z-mapped-original-audio.wav) |
| First nodule | 246.6500–266.6500 | [video](motion/first-sphere-motion-20s.webm) | 13.53067 | [audio](motion/first-sphere-mapped-original-audio.wav) |
| 24th Plate birth neighborhood | 462.0166–482.0166 | [video](motion/plate-24-motion-20s.webm) | 3.12990 | [audio](motion/plate-24-mapped-original-audio.wav) |
| Late stack | 580.2167–600.2167 | [video](motion/late-stack-motion-20s.webm) | 2.30000 | [audio](motion/late-stack-mapped-original-audio.wav) |

[Continuous native final audio](motion/continuous-natural-0-600s-audio.webm), [recording manifest](motion/continuous-natural-0-600s-curated-manifest.json) and [compressed browser record](motion/continuous-natural-0-600s-browser-evidence.json.gz) preserve the original clock anchors, actual events, immutable birth descriptors and asynchronous processor measurements. Start/end normal-view screenshots are [opening](motion/continuous-natural-0-600s-start.png) and [600 s](motion/continuous-natural-0-600s-end.png).

The decoded recording has 15963840 stereo frames at 48 kHz (332.580 s). The AudioContext endpoint is 704 frames / 14.6667 ms beyond available decoded PCM. This small recorder/decoder endpoint difference is explicitly bounded at the terminal anchor; no intermediate anchors, samples, gain or physical decay are retimed. Requested and available endpoints are retained in metadata.

The final motion interval requests simulation end 600.2167 s; its available original PCM maps through the unmodified captured clock anchors to 600.0883 s. The manifest records this endpoint shortfall rather than extending the sound with silence. The overview has a separately documented terminal reconciliation for its whole-run presentation; these conventions are explicit, not evidence of additional recorded samples.

## Measured contact and output statistics

[Full and per-clip metrics](motion/audio-metrics.json) separate PCM output, contact support, bridge impulse budget and pre-limiter counters.

| Whole native recording | Left | Right |
|---|---:|---:|
| RMS, full scale | 0.01812015 | 0.01449241 |
| Absolute peak, full scale | 0.12614933 | 0.10539617 |
| Samples at or above unity | 0 | 0 |
| Non-finite PCM samples | 0 | 0 |
| Samples below absolute 1e−6 | 37.3182% | 37.3217% |

There were 34916 FOOT_CONTACT groups and 103441 individual feet. Exact replay of the captured immutable masks and foot coordinates matches all bridge support totals: 63236 supported feet (61.133%), 40205 unsupported feet; 24462 routed groups, 10454 groups without support. No routed foot directly enters buried Plate or Sphere material. The bridge reports zero dropped events, zero capacity-rejected Plates and zero processor errors.

The complete-run output proxy `sum(L²+R²)/sampleRate/supportedFeet` is 2.83147e−6; the separate bridge impulse-energy proxy is 25.510263 total / 63236 supported feet = 0.000403414 per supported foot. These are aggregate proxies, not a causal energy measurement of each individual foot, SPL or perceived loudness. Contact support is not normalized away.

Final observed processor counters include 355825 node wake transitions and zero sleep transitions. Deep Plate coupling and Sphere coupling counters count 7321261613 and 86763648 force evaluations respectively, not unique contact events or transferred conserved joules. The worklet's absolute-force/relative-velocity work proxy is 84.7155. Final worklet diagnostics can lag the bridge; its observed 62439 strikes are not proof of 797 lost routes. The bridge routed 63236. Pre-limiter peak 1.025788 and three threshold crossings coexist with zero final PCM clipping.

The measured main-thread update proxy covered 35797 calls, 38680.5 ms total, maximum 88.6 ms. AudioWorklet CPU timing is not directly exposed by this harness. The measured clock slowdown and decoded recording durations are the stronger evidence of mature scheduling failure.

## Fixed detail, overview and local Z images

- [Six-row historical plus five natural milestone comparison](overview/historical-plus-five-natural-milestones-fixed-10s.png) and [row measurements / renderer preset](overview/historical-plus-five-natural-milestones-fixed-10s.json): historical d281d34 mature single Plate, first Plate, multi-Z, burial, 24th Plate and first nodule. Every detail is exactly ten native audio seconds with identical axes; actual simulation spans are labeled.
- [Historical / first Plate focused comparison](overview/historical-mature-single-vs-natural-first-plate-fixed-10s.png).
- [Full 600 s overview](overview/continuous-natural-0-600s-600s-overview.png) and [first 180 s overview](overview/continuous-natural-0-600s-180s-prefix-overview.png): separate L/R, Plate birth and layer-count markers, thin time-bucket foot-density strip. The 180 s image is a prefix of the same run, not another independent run.
- [Four automatically selected ten-second details](overview/continuous-natural-0-600s-auto-selected-10s-details.png) and [overview clock / marker / selection metadata](overview/continuous-natural-0-600s-audio-overview-manifest.json).
- [Recorded-history local Z section](z-debug/recorded-600s-local-z.png) and [exact geometry / nodule descriptors](z-debug/recorded-600s-local-z.json). The 96-grid columns are reconstructed from the actual frozen recorded births, with no new qualification or forced simulation. This diagnostic has no fabricated SurfaceField or pheromone heatmap.

[Paused Audio Off/On lifecycle evidence](lifecycle/continuous-natural-0-600s-paused-audio-lifecycle.json) confirms retained Plate IDs/revision, the same AudioContext, released old worklet/port handler, no historical contact replay and new excitation only after simulation resumes (192 fresh strikes). Development and production checks additionally cover ANT → standalone Plate → ANT and ANT → standalone Sphere → ANT. Historical standalone DSP files are identical to the starting commit.

## Capture and render reproduction

The retained local raw run is `test-results/stratigraphy-motion-2026-10-06T05-30-53-880Z/`. Its full motion source is 141 MB and Float32 WAV 128 MB; these remain ignored, with sizes and SHA256 hashes in the curated manifest. Git preserves six motion windows, all matching native WAV segments, the complete compressed stereo recording, the compressed full event/anchor record and important screenshots. No raw file above GitHub's file limit is added.

```powershell
$recordedRun = 'test-results/stratigraphy-motion-2026-10-06T05-30-53-880Z'
node scripts/stratigraphy-motion-curate.js $recordedRun
node scripts/stratigraphy-audio-overview-ingest.js $recordedRun
node scripts/stratigraphy-audio-fixed10-comparison.js $recordedRun
node scripts/stratigraphy-audio-six-milestones.js $recordedRun
node scripts/stratigraphy-audio-metrics.js $recordedRun
node scripts/stratigraphy-z-evidence.js "$recordedRun/continuous-natural-0-600s.json"
```

These commands require the original raw capture for decoding. Installed Chrome and the existing FFmpeg binary are used; no additional audio framework or synthesis engine is introduced. Fixed renderer tests reject content-derived scaling and assert pixel-contract, exact ten-second audio duration and nonuniform clock/contact-tick alignment.

## Reversible commit sequence

Starting main: `d281d341f5abe68ff98ca4cbf837838c7b7b45a2`. The interrupted pass was preserved and completed through the following separate commits; the release index and refreshed final test/build logs follow as a documentation commit. The pushed final HEAD is the repository's main HEAD, also reported in the completion message.

| Commit | Scope |
|---|---|
| `d2e7efd` | Update guidance; separate immutable births from local material stratigraphy |
| `e9456ee` | Compile source-cell Z adjacency into sparse topology |
| `c0dbef8` | Route ordinary feet only through exposed local material |
| `ece47ec` | Sparse Z physics, physical sleep and shared buried Sphere core |
| `8e77260` | Physical layer validation and cached restrained rendering |
| `df534e9` | Fixed stereo detail / overview renderer and focused tests |
| `0594bf9` | Natural long-run histories and unchanged ANT behavior evidence |
| `a2d93f3` | Synthetic scaling measurements and Chrome lifecycle validation |
| `7494d29` | Exact rules, technical limits and design-only future interfaces |
| `8a7e36d` | Exact ten-second native audio / FOOT_CONTACT alignment |
| `2f2723d` | Recorded-history local Z section |
| `2b155cb` | Actual motion, original stereo, fixed milestone comparisons and full-run overviews |

Final repeated test suite: 227/227, no failure or skipped test. Final repeated build: pass. Development and production Chrome lifecycle checks passed; mature natural all-awake realtime clock health failed as documented above. Protected behavior and generic DSP files, plus historical evidence, were checked again before release.
