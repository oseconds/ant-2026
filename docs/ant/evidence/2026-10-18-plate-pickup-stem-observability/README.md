# Plate pickup-stem observability — SUPPORTED

## Question and decision

Can the current Plate solver expose each layer's stereo point-pickup contribution before the shared limiter, plus the Sphere contribution, while reconstructing the production mix from one unchanged coupled solve?

**Decision: SUPPORTED.** Every captured pre-limiter physics-step mix and every final PCM sample reconstructed exactly in the isolated Plate, frozen 38-Plate/Z, and coupled-Sphere fixtures. The instrumented and raw worklet also matched telemetry, accepted strikes, final state, and per-step state hashes. Chrome `OfflineAudioContext` PCM matched exactly in all three cases. No production source changed.

## Starting state and boundary

- Actual `origin/main` at pass start: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Research branch before main integration: `895a21baf23a3d1de89154e75ccc11339121ae83`.
- Main integration commit: `26e6fc3` (`Merge origin/main before Plate pickup stem diagnostics`).
- Production worklet SHA-256: `14c7461f1412f0d6897a6683d46e582dbb80711f2ba74e8ea53e026895eeea5e`.
- Implementation is confined to `scripts/ant-sonic-shadow-render.js` and its offline validation harness. `src/`, `static/`, `SurfaceAudioBridge`, and topology compilation remain unchanged.
- Normal production runtime and memory overhead: zero; the worklet has no stem-capture branch or per-Plate WebAudio nodes.

## Meaning of each stem

For each current Plate layer ID, the diagnostic records the value at that layer's existing left/right pickup node after the full Plate/Z/Sphere-coupled physics update, multiplied by the existing `PLATE_PICKUP_MIX`. These are point-readout contributions from one full-network solve. The Sphere stem is the existing aggregate Sphere pickup output multiplied by the current `MIX` coefficient. Both are recorded as Float64 pre-limiter values at 6 kHz, alongside the original pre-limiter mix and topology generation.

Mute or solo is a selection on the recorded arrays after capture. It does not remove material, change coupling, alter strikes, or rerun physics. A stem is not a render of an isolated physical Plate.

## Reconstruction

The harness records each side's actual Plate accumulation order. It re-adds the Float64 Plate terms in that order, adds the Sphere aggregate, and compares the result with the captured production pre-limiter value at every physics step. It then applies the unchanged `x / (1 + abs(x))` limiter and the existing 6 kHz-to-output interpolation. At the production 48 kHz rate, reconstructed stereo Float32 PCM matched the raw worklet sample-for-sample and byte-for-byte. Maximum absolute PCM error: `0` in every case.

## Cases and results

| Case | Frozen geometry / coupling | Steps | Stem array bytes | Observed capture delta | Pre-limiter L/R | Final 48 kHz PCM |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Isolated P24 p50 | Existing frozen native Plate | 9,000 | 540,060 | +5.00 ms | Exact, max error 0 | Exact, 72,000 samples per side |
| Frozen world Z | Seed-07 38-Plate topology, Plate-38 strike, 14,772 compiled Z links | 9,000 | 7,200,800 | −43.79 ms | Exact, max error 0 | Exact, 72,000 samples per side; matches frozen PCM hash |
| Coupled Sphere fixture | Existing two-Plate/Z worklet-test geometry with one coupled Nodule | 1,200 | 96,080 | +4.61 ms | Exact, max error 0 | Exact, 9,600 samples per side; nonzero Sphere contribution |

All cases accepted the scheduled strike(s), retained exact telemetry and per-step solver-state hashes against the raw worklet, and matched the complete final state. Dropped events/routes, non-finite values, and clipped cases were all zero. The isolated P24 frozen PCM and the 38-Plate/Z frozen PCM also matched their existing artifact hashes.

The focused harness tests also install a second topology during a render, add a new Plate ID, and strike it. Stem slots follow the layer IDs; PCM, telemetry, per-step solver-state hashes, and final state match the raw worklet through the installation.

Chrome `OfflineAudioContext` reproduced the raw-worklet PCM exactly for all three cases. Full hashes, timing, topology/event hashes, counters, browser results, and per-channel error records are in [`validation.json`](./validation.json).

Stem byte counts are the exact preallocated typed-array payload; JavaScript object/header overhead is excluded. The capture deltas are single-run Node VM observations with the same validation-only state-hash audit in both paths. Their spread (including a faster measured 38-Plate capture run) shows timing noise; no stable incremental capture runtime is established. They are not realtime estimates or an acceptance threshold.

## Runtime and limits

Stem capture memory is bounded at 256 MiB and allocated before rendering. Observed typed-array allocation for the cases is listed above. Timed diagnostic-vs-raw results are in `validation.json`; the validation-only state-hash instrumentation is active in both timed paths. These timings describe this offline harness and do not imply browser realtime cost. Disabled production cost remains zero because the production worklet source is unchanged.

This pass establishes readout decomposition and reconstruction only. It does not establish perceptual masking, shared resonant components, or production mix priorities. The planned dense eight-Plate masking experiment was not run.

## Reproduction

```powershell
node scripts/ant-pickup-stem-observability.js
node --input-type=module -e "await import('./tests/ant-sonic-shadow-render.test.js'); await import('./tests/surface-plate-worklet.test.js'); await import('./tests/compile-surface-topology.test.js'); await import('./tests/surface-audio-bridge.test.js')"
```
