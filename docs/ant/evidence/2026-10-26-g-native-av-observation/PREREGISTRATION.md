# Current G native AV observation — preregistration

Date: 2026-10-26 (Asia/Seoul). Canonical source: `4f0f8624c47ed310d7a6a4a37d43e3d0e7756b4b`.

## Question and boundary

Discover the scale of change a human can follow in the default canvas and native full mix before inspecting state annotations. Individual-contact recognition is not an acceptance criterion. This pass does not adopt a mechanism or test material-specific causality.

One foreground Chrome capture, seed `20261005`, unchanged production Full Physics, retained-history locomotion resistance On, Base Substrate Off, default renderer and 100% UI volume (final surface bridge gain 0.7). RNG is injected before controller initialization. The controller's RAF updates are held at model time zero during setup, including the actual Audio On button gesture. The simulation begins only after audio/capture readiness. The production solver and renderer are unmodified.

Stop at the first completed 30 seconds following the first Plate, or 180 model seconds, or 240 wall seconds, whichever occurs first. The tick wrapper stops at the model endpoint; the browser timer independently enforces the wall endpoint. A fixed-tick endpoint has at most one 1/60 s tick of model quantization. No new seed, longer duration, physical approximation, or scene search follows a negative/inconclusive result.

## Capture and validity

Preserve one combined VP8/Opus WebM from the actual canvas and a parallel tap after the unchanged final GainNode. Preserve separate stereo IEEE Float32 PCM through a silent-output recorder worklet connected in parallel, not PCM decoded from Opus. No gain, normalization, resampling, time stretching, frame invention, or audio replacement. Native originals and hashes remain available.

Before world time starts, use two short empty-topology calibration phases, recorder/taps off and on, to measure AudioContext/wall clock quantization and recorder infrastructure overhead. This is not a loaded-world overhead benchmark. Live observer-only main-thread cost is accumulated separately. Deterministic world/RNG/contact/post parity is checked outside the browser without rendering PCM. If instrumentation materially compromises validity, classify the instrumented capture as inconclusive rather than attributing the failure to production.

Clock anchors sample monotonic performance time, model time, AudioContext time, output timestamp when available, context state and foreground visibility/focus together at 1 Hz. Existing worklet diagnostics are requested every five seconds with request/receipt anchors; no per-layer extension or sleep diagnostic is added. A running AudioContext alone does not establish hardware audibility. Three consecutive non-overlapping five-second windows with audio elapsed below wall elapsed by more than measured empty-topology residual scatter plus two 128-frame quanta trigger a runtime stop. Hidden/unfocused page or audio/capture errors also stop. The stop gate is an engineering boundary, not an aesthetic threshold. Post-capture clock audit may reject a shorter interval even if the runtime stop gate did not trigger.

Minimal sidecar: valid per-foot contact position and source time, pre-contact compaction returned by the original SurfaceField call, raw pheromone sampled after that ant's gaster deposition, current contact-cell layer count and exposed route, and actual bridge strike post order/time/payload. The raw pheromone-derived alpha is not an observed composited canvas pixel. No full-grid serialization or diagnostic overlay is performed per contact.

## Observation order and decisions

Prepare neutral clips A (opening approximately 20 s) and B (first Plate plus approximately 30 s), provided each is clock/capture-valid. A human first records what changed and what could be followed, without state labels or leading questions about Plates/history. Preserve that first response before state comparison. If no human response is available, perceptual scale remains unmeasured; signal metrics do not substitute for listening.

Only afterward compare the reported moments with chemical field, compaction, births, exposed routing, contact density, mixed output and world age. Co-variation is descriptive, not causal separation. No contrast in this short early window means insufficient opportunity, not a general absence of perceptible retained history. Clock/capture failure means runtime-blocked or inconclusive, never artistic lag or intended silence. Recommend exactly one next investigation, without implementing it.

## Reproduction

Build with `npm run build`. Run `node scripts/ant-g-native-av-observation.js` once from this research branch on Windows with installed Chrome and repository dependencies. Existing capture evidence must not be overwritten. Focused observer/PCM tests precede the run. Assets, validation receipts, human-observation status and bounded interpretation will be recorded in this directory; chronology goes in `docs/ant/daily/`.

## Technical export repair — recorded before attempt 02

Attempt 01 completed at model 114.016666667 s with no reported page/audio error and exact same-Chrome world/RNG/contact/strike control parity. Its Float32 PCM and sidecar were exported correctly, but the WebM transport used `dataURL.split(',')[1]`. The codec MIME itself contains a comma (`video/webm;codecs=vp8,opus`), so the saved WebM is only seven invalid bytes. The browser had already closed; its video cannot be recovered. This is an export failure, not a perceptual result or production runtime regression.

Preserve all attempt-01 artifacts and exact runner source without overwrite. Permit exactly one technical repeat in `attempt-02/`, with the same seed, laws, gain, windows and stop limits. Fix the data-URL parser and assert the WebM EBML header before disposing the browser. Add a regression fixture with a comma-containing codec MIME. Do not select a different scene or extend world age. If this repeat fails, stop and report inconclusive; no third capture. Final reproduction scripts target `attempt-02/` and refuse existing output assets.
