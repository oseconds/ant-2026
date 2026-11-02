# Pre-run independent conformance review

Review snapshot: working copy at `d2b62f52a85ad7320c9056dc30454808c73972bc`, branch `codex/ant-local-x-audio-reassessment-20261101`, 2026-11-01. This is a read-only review of the capture/replay definitions before the six new world captures. No world campaign or tests were run by this reviewer.

## Capture gate

**Proceed with the six world captures.** The capture hook wraps the actual `SurfaceField.applyFootContact` call, returns its result unchanged, and associates those response rows with the same `FOOT_CONTACT` object emitted by `AntController`. The fresh controller in `runArm` has no injected audio bridge; the capture path does not feed audio state back into the simulation. `runArm` enforces zero research-observer RNG use, and the script compares each reproduced run with its prior full run receipt and checks CONTROL against the frozen authority before accepting its capture.

The replay schedule uses the existing `SurfaceAudioBridge` contact-routing implementation against captured material state. `AntController.tick` emits contacts before advancing the simulation clock, then births Plates/Nodules and synchronizes material after contact processing. The capture preserves that ordering: tick `k` is mapped to frame `k * 800` at 48 kHz, contacts retain their exact emission payload time, and any same-tick topology revision is installed after those contacts. Nodule revision is included in topology change detection. The source ordering and unchanged worklet topology installer preserve force-ring, compliance, vibration, sleep, and compatible Nodule state across installs.

`MaterialStratigraphy` stores Plates in insertion order, and its `layerOrder` uses the same order. The compiler follows that layer order, so exposed-cell indices used by `topologyMetrics` align with the captured `plates` array. Geometry hashes are computed per descriptor in the current implementation; the same-ID/different-mask regression fixture covers the prior cross-world cache hazard.

## Renderer follow-up

After the initial capture review, the current renderer implementation was updated. It now preserves endpoint-event count and hash in render receipts while excluding `frame === 14,400,000` messages from the half-open `[0,300s)` PCM stream. Its `--parity-only` path calls `renderLocalAudioOffline` with a real browser `AudioWorkletNode` inside `OfflineAudioContext` and compares the output against the unmodified processor in the VM after the fixed 0.7 gain. These are code-path facts only; the browser run was not executed by this reviewer at the time of this note.

The renderer follow-up does not make any live scheduling claim. Exact `k * 800` frame dispatch remains an ideal deterministic model-time mapping. Live `MessagePort` delivery is asynchronous and AudioWorklet processing is block-based; results must be described as the ideal replay unless live delivery timing is measured separately.

## Gates still open for audio acceptance

- The browser parity CLI and 300-second render still need an executed run and receipts. `renderLocalAudio` itself continues to reject events at or after `frames`; the full browser path correctly filters terminal events first.
- The full browser render writes PCM after a fixed `0.7` GainNode, matching the current bridge default. The analysis manifest still labels the input `native PCM`; update that label to `fixed bridge gain 0.7` (or change the render signal) before accepting absolute-power claims. Do not RMS-match.
- The per-window `directStrikes` observer classifies an event with `floor((eventFrame - 1) / sampleRate)`. Events exactly at 50/110/170/230/290 s are assigned to the preceding second or outside a window, though their PCM belongs to the half-open window that starts there. Correct the event-time binning or exclude that diagnostic from window-level claims.
- The runtime profile uses a Chrome main-realm processor stub with rest initialization at 290 seconds. It can attribute offline CPU work for that replay, but it is not a live AudioWorklet deadline measurement and omits pre-290-second vibration history.

The fixed-window analysis slices exact 10-second half-open windows and uses only wholly contained 1024-sample frames at 256-sample hops. Its ERB power scaling preserves left/right channels and leaves silent unit-sum shape undefined. ERB comparisons remain signal measurements, not audibility or perceptual-identity claims.

## Bounded conclusion

The capture definitions are suitable for reproducing and validating the six fixed world histories and constructing the ideal model-time replay schedule. The audio/render acceptance gate remains open until endpoint handling and browser route parity are verified. No claim about realtime viability, perceptual similarity, or material meaning follows from this pre-run review.
