# G Natural Hardness Distribution — Preregistration

## Question and boundary

Measure the `hardness` values that current production G naturally routes through `SurfaceAudioBridge` to `surface-plate-processor` as `strike` messages during 600 simulated seconds. Compare that selected population with every valid `SurfaceField.applyFootContact()` response from the same run.

This is a read-only measurement. It does not map hardness to pulse duration or any other DSP parameter. The production 3 ms contact pulse and all production laws remain unchanged. Archived Argon review text is the question's historical prompt only; it is not treated as current implementation evidence or an adopted recommendation.

## Fixed run

- Fresh production baseline: `origin/main` at `4f0f8624c47ed310d7a6a4a37d43e3d0e7756b4b`.
- G adoption source baseline: `fc5e81c7e22094fe3e6a6bb403df1194b3d541ae`; current G implementation is inspected again at the fresh baseline.
- Seeds: `20261005`, `20261006`, `20261007`.
- Duration: 600 simulated seconds at `DT=1/60`.
- Existing production defaults and material locomotion resistance stay enabled.
- Born Surface routing is enabled through the actual `AntEnvironmentAudioBridge` / `SurfaceAudioBridge` code. A stub transport captures the exact `port.postMessage({type:'strike', payload})` call; no PCM or worklet DSP is run.

## Populations and capture

Primary rows are only strike messages actually posted by `SurfaceAudioBridge` to a worklet named `surface-plate-processor`. Preserve seed, simulation time, and the exact posted message, including plate ID, position, hardness, footprint radius, and strength.

Context rows are all valid responses returned by the production `SurfaceField.applyFootContact()` call in those same runs. Preserve response time, leg ID, position, compaction, and hardness. The wrapper records after the original call and returns its exact response array.

The capture port only copies already-posted messages. The run must reproduce saved G initial-state hashes, every per-second active-agent position/state row, contact buckets, Plate births, Nodule births, and event-stream hashes. These are the observer/world-parity checks.

## Statistics fixed before result inspection

- Hardness domain: `[0,1]`; non-finite or out-of-range values fail validation.
- Fixed histogram: ten equal-width bins of `0.1`; bins are left-closed/right-open, with `1.0` included in the final bin.
- Time bins: ten fixed 60 s intervals `[0,60) ... [540,600]`; a value exactly at 600 s belongs to the last bin.
- Quantiles: linearly interpolated Type 7 (`p × (n−1)`). Standard deviation is population standard deviation (`N` denominator).
- For each population report count, min/max, mean, standard deviation, p01/p05/p25/p50/p75/p95/p99, and the fixed histogram.
- For each time bin report count and the same quantiles. Plate summaries report count, median, p25, p75, and IQR.
- Routed-versus-all-response comparisons are descriptive differences in count, mean, median, and p95; no causal or perceptual inference is made.

## Validation and stop

Verify captured strikes originate from the bridge's actual post call, match a same-time/position SurfaceField response after the bridge clamp, match bridge direct-strike diagnostics, and have finite valid payload values. Verify the three natural traces against the frozen G candidate evidence. Production source and worklet must remain unchanged.

Stop after distribution capture and reporting. Do not change audio, hardness routing, pulse duration, material behavior, movement, or G representation.
