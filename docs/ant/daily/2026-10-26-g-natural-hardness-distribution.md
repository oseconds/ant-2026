# G natural hardness distribution — 2026-10-26

Measured the current production-G `hardness` values returned by `SurfaceField` and the subset actually posted by `SurfaceAudioBridge` to `surface-plate-processor` across three matched 600 s natural runs. The capture intercepted the bridge's real post call; it did not render worklet DSP or PCM.

Across 204,781 routed strikes, hardness had mean 0.4053 and median 0.3580 (p05–p95: 0.1331–0.8591). Across 301,429 valid foot responses, the mean was 0.3358 and median 0.2882. Both medians rose over the run; routed strikes were absent in 0–60 s, then the routed median rose from 0.172 at 60–120 s to 0.456 at 540–600 s. All three runs matched the saved G traces and event checks; no invalid hardness or production source/worklet change was found.

The measurement supplies a natural hardness range for a future shadow only. It does not select a pulse mapping. Production remains at a fixed 3 ms pulse, and the current worklet does not consume hardness.

Evidence: [G natural hardness distribution](../evidence/2026-10-26-g-natural-hardness-distribution/README.md).
