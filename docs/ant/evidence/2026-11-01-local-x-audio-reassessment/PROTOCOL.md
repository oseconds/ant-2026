# Local-X audio architecture reassessment

Status: research only; protocol written before new world capture, rendering, profiling, or architecture prototypes.

## Authority and scope

Remote `main` was verified as `bc045dc3caa5954df633ecbee37fbabcb8224f30`; remote replacement branch as `d0481760fd44052acbeaaf88c3b171ab2a625601`. Local `main` is stale at `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292` and is not the production authority. The dedicated branch is `codex/ant-local-x-audio-reassessment-20261101`, based on the replacement commit. No production adoption, PR, merge, formation change, or parameter search belongs in this pass.

Keep the six validated material histories fixed: seeds 20261005/06/07, CONTROL and REPLACEMENT, 300 model seconds, 60 Hz, fresh controllers, Audio Off during world reproduction, observer RNG zero. Compare each reproduced run with its existing replacement-package receipt and the CONTROL frozen authority. Stop interpretation on a mismatch. Audio replay is downstream and cannot feed back into the world.

The starting tree contained a default-preserving capture-hook modification to `scripts/ant-local-x-material-replacement.js` and two untracked AV draft scripts. Copies and hashes are preserved under `.cache/local-x-audio-reassessment/preexisting/`. The reviewed hook exports may be reused for this pass. The original AV draft files remain separate and are not delivery artifacts. Their 240–300 s controlled-rest replay is insufficient for the present continuous-history question.

## Investigation order

1. Independently inspect current compiler, bridge, worklet, stratigraphy and actual callers. Record responsibilities, information loss, cost loops, and initially preferred hypotheses before reading historical alternative-audio proposals in detail. No candidate is preselected.
2. Capture six exact full world histories and compile through current production semantics. Measure acoustic granularity, per-layer connectivity, discretization collisions, exposure, links, pickups and material coefficients. Plate count alone is not a runtime proxy.
3. Establish a continuous model-time-locked current-worklet replay from 0 to 300 s. Preserve contact order, birth order, finite pulses, compliance, vibration state across topology installs, Z and Nodule coupling, sleep and output mapping. Validate scheduler instrumentation against unmodified production recurrence and a real browser route. Explicitly distinguish an ideal deterministic model clock from asynchronous live message delivery.
4. Compare five fixed windows in each world: [50,60), [110,120), [170,180), [230,240), [290,300) seconds. Measure continuous-history output, not independently reset windows. Use fixed gain; do not RMS-match measurement signals. Retain PCM hashes and deterministic regeneration rather than unnecessary full PCM in Git.
5. Profile significant compiler, install/state-copy, excitation, propagation, Z/Nodule, pickup and output responsibilities. Separate browser realtime evidence from offline execution cost and instrumentation overhead. Inspect indirect contribution before judging buried/unstruck material irrelevant.
6. Form the smallest serious candidate set from these results. Implement an isolated falsification only when needed to distinguish a substantive architectural claim. Reject weak candidates without tuning material formation or manufacturing preferred sound.
7. Only after an independent diagnosis and preferred candidates are recorded, inspect historical architecture suggestions as a challenge set. Preserve negative dormant-ROM evidence and distinguish a different proposed model from a repackaged failed route.
8. Obtain independent review of definitions, clock mapping, aggregate arithmetic, source conformance, prototypes and claim boundaries. Write report, chronology and reproducible manifest; commit and push only scoped valid results.

## Fixed signal frontend

48 kHz stereo; separate L/R waveform at fixed ±1. STFT: FFT 1024, symmetric Hann, hop 256, 0–8 kHz, fixed -100…0 dBFS, gamma 1, grayscale, no image normalization. Reuse the verified snapshot frontend. ERB: 30 equal ERB-rate bands over 0–8 kHz, existing half-open bin assignment with final endpoint included, DC and one-sided-power rules, mean L/R power. Primary is fixed-gain absolute linear power; secondary is unit-sum shape. State frame support at window edges. Silence has no unit-sum shape.

ERB difference is not an audibility result; ERB similarity is not perceptual identity. No listening, aesthetic approval, physical-force inference, or biological interpretation follows from these engineering measurements.

## Acceptance and boundaries

Deliver implemented facts, measured results, research inference, architecture/modeling proposals and artistic interpretation separately. Check source parity, zero observer RNG, full world reproduction, exact replay receipts, finite output, deterministic rerun checks, manifest and independent review. A valid mixed, negative or inconclusive answer is acceptable. The final recommendation must answer what would be chosen today, ignoring sunk implementation cost, and identify the smallest next question and whether a separate adoption pass is justified.
