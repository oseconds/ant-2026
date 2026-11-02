# Validation and limits

## Authority and fixed worlds

Remote `main=bc045dc3caa5954df633ecbee37fbabcb8224f30` and replacement `d0481760fd44052acbeaaf88c3b171ab2a625601` were initially verified. The final check found remote main at `5bdd516b412d03d78c2511ceb372180941206968`: nine archive-documentation-only commits, with identical complete `src` and `static` Git trees. The experiment retains its frozen `bc045dc` authority; [delivery verification](validation/authority-delivery.json) records the later ref separately. New archive contents were not read. Local stale main was preserved. Dedicated branch is `codex/ant-local-x-audio-reassessment-20261101`; protocol/source-only diagnosis commit is `d2b62f52a85ad7320c9056dc30454808c73972bc`.

All six fresh 18,000-tick CONTROL/REPLACEMENT runs reproduce the prior committed run bytes, including chunked boundaries, trajectories, formation, material/Nodule history and RNG receipts. CONTROL also passes the frozen production authority. World Audio remains Off and observer RNG is zero. Source production and static files have no change relative to the replacement base. The only changed existing research runner exposes optional read-only capture hooks/exports; its default world path is preserved.

## Render conformance

- Six real Chrome OfflineAudioContext / AudioWorkletNode continuous renders, 48 kHz, 300 s, 14,400,000 stereo frames, 1,800,000 physical steps each.
- Native compiler and bridge prepare the schedule. Deterministic in-processor injection locks model time; it does not emulate asynchronous live MessagePort latency.
- Exact same-tick ordering: contacts first, topology afterward. Compatible vibration, pending pulse rings, compliance and Nodule state use native reinstall behavior.
- Every rendered event is received at its exact sample. Endpoint events at 300 s are separately hashed/excluded: C/R counts are 0/0, 3/1, 2/3 for seeds05/06/07. All endpoint messages in these six schedules are strikes. Unsupported material contacts are native routing absences, not rejected scheduled strikes.
- All output and state are finite; no scheduled strike route or topology is rejected.
- The browser fixture covers overlap/Z, native Nodule, a topology reinstall during a pending pulse and frame ties. Numerical whole-PCM parity after gain 0.7 passes at max absolute error 7.450580596923828e-9 against the declared 1e-8 bound. Browser and VM bytes are not claimed identical.
- Seed05 REPLACEMENT, selected for the largest local solver node count, was fully rendered again to a separate cache file. All 115,200,044 WAV bytes match, SHA-256 `21d0cc8489cf40296d1858499f60ea7caf3848a3e4318068cbefe54311e8026f`.

Receipts: [worlds](analysis/receipts.json), [renders](analysis/audio-render-receipts.json), [browser fixture](analysis/validation/browser-parity.json), [determinism](analysis/validation/determinism.json).

## Signal definitions and checks

Thirty fixed 10 s windows use the verified existing waveform/spectrogram frontend. L/R stay separate, waveform ±1, FFT 1024 symmetric Hann, hop 256, 48 kHz, 0–8 kHz, grayscale -100…0 dBFS, gamma 1, no normalization. No padding is needed for these exact windows. Primary ERB is fixed-gain linear power in 30 equal ERB-rate bands; shape-only unit-sum profiles remain secondary. STFT frames are wholly contained and start at the window's first sample. DC is not doubled; included positive-frequency bins are doubled. No Nyquist bin lies inside 0–8 kHz. ERB powers are descriptive Hann-normalized coordinates, not calibrated physical energies.

The Python self-check tests a bin-centered tone, DC, amplitude-squared scaling, band assignment, silence/null shape and silent dB null. Its display-amplitude cross-check against the JavaScript frontend differs by only 3.126e-7 dB on the fixture. Five analyzer outputs, granularity, three aggregate JSONs, 30 PNGs and two SVGs regenerate byte-for-byte. The shape SVG omits the five undefined silent profiles and marks their legends with an asterisk; it does not draw them as zero unit-sum shapes. A dedicated plot self-check verifies this omission. Parent visually inspected representative active and silent fixed panels; all visual files are hashed and indexed in [ATLAS.md](ATLAS.md).

The related existing compiler/bridge/worklet/stratigraphy/frontend tests passed 59/59. The focused research tests passed 25/25 after the final script corrections; they cover source scheduling, same-frame order, topology/pending-force state parity, chunking, cache isolation, link-pair construction, exact half-open windows, receipts and manifest integrity. Test-runner subprocesses require the normal elevated environment on this machine; sandbox `spawn EPERM` did not indicate a failed assertion. Executed counts are recorded in the saved test output. No full unrelated repository suite or live audience/audio-quality test was run.

## Research-harness corrections

The [preparation attempts](analysis/partial-attempts.json) distinguish source-valid CONTROL from two harness stops: serialization header metadata and an obsolete exact-HEAD guard. They did not expose a physics mismatch. Six final full-world byte comparisons subsequently passed. Sixteen byte-identical duplicate partial files were hash-checked before/after preservation in cache; [inventory](validation/preserved-partial-files.json).

Before final acceptance, the research harness was also corrected for cross-world geometry caching, packed Z-link endpoint indexing, exact endpoint/frame semantics, nearest-rank timing quantiles, silence represented as null dB rather than a log floor, and explicit post-bridge gain labeling. Chrome rendered a final partial quantum in the initial 24,000-frame parity fixture; the final 24,576-frame fixture is quantum aligned. The 300 s renders are naturally aligned. Vite transparently decoded gzip HTTP bodies, so transport now detects the body magic before decoding. These are reproducibility repairs, not changes to world formation or worklet physics.

One saved raw observer counter used `frame-1` for event-window classification. That undercounted 27 strikes at exact starts across ten windows. Authoritative per-layer/window counts are independently recomputed from accepted native schedule events; raw receipts remain intact and discrepancies are listed in [architecture summary](analysis/architecture-summary.json). The generator is corrected and has a window-start regression check. This counter did not affect PCM, solver state or world trajectories.

Raw `wakeTransitions` also includes topology reinstall activations. Final histories label it `nativeActivationEventsIncludingReinstall`; it cannot identify physical sleep-to-wake transitions. Actual awake-to-sleep events and sampled active fractions are separately recorded. Per-layer raw pickup sum-squares are before layer summation/limiter/gain; they are not additive acoustic energies or unique causal contributions. A final exposure checkpoint does not imply burial throughout a window. Layer-ID Z components are not full node-level acoustic components; link degree counts compiled incident node-pair multiplicity, not unique neighboring layers.

## Runtime boundary and independent review

The CPU profile uses the unmodified worklet class in installed Chrome 157's main realm. It starts at rest at 290 s on actual late topology/events. One warmup, three clean repeats and a separate V8 profile are recorded. Compiler timing is Node-side exact compilation, excluding bridge validation. Structured clone is a transfer proxy. No live AudioWorklet deadline, device underrun, mobile performance, or 300 s realtime viability is claimed.

The source diagnosis, pre-run conformance review, late historical challenge and fresh architecture review are separate records. [Independent aggregate arithmetic review](validation/aggregate-independent-review.md) and [final acceptance with the chart/endpoint follow-up](validation/final-acceptance.md) pass within the stated research scope. The follow-up independently counted all six endpoint schedules and confirmed 25 defined shape curves plus five marked silent omissions. Its endpoint check corrected a transcribed count in this document; schedule, PCM and analysis data were already correct. Manifest verification is completed before delivery. The report preserves the artist/modeling choice about bonded continuity and world readout; it does not infer preference or meaningful individuality from ERB alone.

No production adoption, PR, merge, force-push, extra seed/horizon, new formation/material law, listening study, sonic-quality approval or Residence change occurred.
