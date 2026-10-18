# 2026-10-18 — Plate pickup-stem observability

## Question

Can each current Plate layer expose its pre-soft-limiter stereo point-pickup contribution, with Sphere separate, as read-only observation from one complete coupled solve that exactly reconstructs current production output?

## Baseline and boundary

- Fetched `origin/main` at `8c60e4bba3bd5b476300e90a2936bfebd1f831c2` and merged it into branch `codex/ant-plate-temporal-modulation-20261018` at `26e6fc3`. The branch head before integration was `895a21baf23a3d1de89154e75ccc11339121ae83`.
- Inspected the current audio bridge, topology compiler, production worklet, ANT hub, and the same-day live-density plan.
- Kept the production sonic law and solver source unchanged. Capture is opt-in and confined to the offline shadow-render harness; there are no per-Plate WebAudio nodes.
- A stem is the existing pickup-node value after the full coupled physics update, multiplied by its production mix coefficient. Sphere remains a separate aggregate. Post-capture mute/solo selects observations only; it does not remove a Plate or change its Z/Nodule influence.

## Validation

Three fixtures passed: frozen isolated P24 p50, frozen seed-07 38-Plate/Z with one Plate-38 strike, and the existing two-Plate/Z fixture with a coupled Nodule and nonzero Sphere readout. Every physics step reconstructed the saved pre-limiter left/right mix exactly using the recorded pickup accumulation order. The unchanged limiter and 48 kHz interpolation reproduced every raw-worklet Float32 sample and stereo byte exactly; maximum absolute error was zero.

Instrumented and raw paths matched accepted strikes, telemetry, final solver state, and per-step state hashes. A focused topology-install test also added a new Plate ID mid-render and matched raw-worklet state and output across the change. Dropped strikes/routes, non-finite values, and clipping were zero. The P24 and 38-Plate outputs also matched their prior frozen PCM hashes. Chrome `OfflineAudioContext` matched all three PCM outputs exactly. Focused audio/worklet tests passed.

## Decision and limit

**SUPPORTED.** Keep this as reusable research observability and stop here. The diagnostic records point-readout terms from the full coupled solve, not isolated physical Plate renders. No dense eight-Plate masking experiment, perceptual analysis, shared-component analysis, gain tuning, or production mix change was made. Production source remains unchanged, so disabled production overhead is zero.

Detailed topology, hashes, allocation, runtime, counters, exact per-channel comparisons, and browser results: [`evidence/2026-10-18-plate-pickup-stem-observability/README.md`](../evidence/2026-10-18-plate-pickup-stem-observability/README.md).
