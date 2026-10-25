# G Natural Hardness Pulse Shadow — Preregistration

## Question and scope

Test whether the single fixed mapping `pulseMs = 3 - 2 × hardness` changes the actual stereo output of the current production-G natural strike stream relative to the existing fixed 3 ms contact pulse. This is an offline, research-only worklet shadow. Production code, the natural world, the worklet law, and the canonical ANT status remain unchanged.

## Frozen provenance and input

- Fresh production authority: `origin/main` at `4f0f8624c47ed310d7a6a4a37d43e3d0e7756b4b`.
- Reused natural hardness capture: `codex/ant-g-natural-hardness-distribution-20261026` at `6149a4b43764ef582df32e85765b98e588ec3505`.
- Its three frozen raw strike captures are verified by SHA-256 in the evidence report. The capture contains the actual `SurfaceAudioBridge` posts, not reconstructed strikes.
- Before use, verify that the reused branch's production source and worklet blobs match fresh `origin/main` and reproduce its G natural trace against the saved candidate-review evidence.

## Arms and exact pulse rule

- A uses the unmodified production worklet: 18 physics steps at 6 kHz (3 ms), with the production half-sine envelope normalized to sum to 1.
- B uses a separate transformed worklet source. For each captured strike with validated payload hardness `h ∈ [0,1]`, it uses `n = clamp(round(18 - 12h), 6, 18)` physics steps and envelope `sin(π(k + 0.5)/n) / Σ[j=0..n−1] sin(π(j + 0.5)/n)` for `k=0..n−1`.
- The 18-step ring capacity and every other production worklet operation stay the same. No alternative mapping or parameter sweep is allowed.
- Each A/B replay receives byte-equivalent serialized input messages, in the same sequence and at the same simulation/sample frame. Strike payloads are not edited; only B's transformed `applyStrike()` reads hardness to choose pulse duration.

## Natural messages and replay validity

For each seed (`20261005`, `20261006`, `20261007`), rerun the 600 s, 60 Hz production-G world with Born Surface routing enabled through the actual `SurfaceAudioBridge` and an inert post-message capture. Capture every posted topology and strike message with sequence and simulation time. Compare strike posts exactly with the prior frozen raw capture, and compare initial state, per-second agent states, contacts, Plate births, Nodule births, and event hashes with the validated G evidence.

Replay each arm continuously from the initial topology at 0 s to 550 s. Do not start the solver from rest at a selected window or restore hidden solver state. Schedule topology and strike messages at `round(simulationTimeMs × 48)` frames and preserve original ordering for equal frames. Retain analysis intervals exactly as `[120,130)`, `[300,310)`, and `[540,550)` simulated seconds for every seed.

The natural simulation is run once per seed to capture a shared input stream, not once per audio arm. The A/B replay cannot feed back into that world. Any route mismatch, world parity mismatch, schedule/frame mismatch, dropped message, new non-finite value, or solver clipping invalidates acoustic interpretation.

## Frozen measures

For every seed/window and pooled across the nine matched cells, report:

- routed strike count; hardness and derived pulse-step/pulse-millisecond p05, p50, and p95 (Type 7 quantiles);
- fixed-gain (0.7, matching `SurfaceAudioBridge`) stereo RMS and peak, spectral centroid, and 300–1000 Hz power share;
- A/B PCM relative L2, zero-lag correlation, maximum absolute difference, total power-spectrum cosine, fixed 50 Hz-bin power cosine, and 25 ms RMS-envelope cosine;
- the same spectral and level summaries for the pre-interpolation stereo pickup output sampled at the 6 kHz physics rate, to distinguish solver pickup changes from 48 kHz stereo readout changes;
- A/B pulse-envelope sum parity, pulse-step monotonicity and range, strike/topology count and order, plus worklet dropped, route, non-finite, and clipping diagnostics.

Use the existing project definitions in `scripts/ant-sonic-response-metrics.py`: whole-window rectangular FFT, stereo-summed one-sided Parseval-scaled power, linearly interpolated Type 7 quantiles, and descriptive 50 Hz bins. No per-window gain normalization, no effect-size acceptance threshold, and no composite score.

## Listening exports and decision boundary

If all replay checks pass, export all nine A/B windows at fixed gain 0.7 as stereo PCM16 WAV listening files. PCM16 is only the delivery format; metrics are computed from the original Float32 render. Preserve matching A/B duration and sample rate. No RMS-matched files are needed for this pass. No human listening result is claimed without the user's listening report.

Verdict is one of `SUPPORTED FOR LISTENING`, `MIXED`, `NEGATIVE`, or `INCONCLUSIVE` under the user's definitions. Technical differences establish only that the frozen duration responsibility changes output for these inputs; they do not establish audibility, preference, artistic value, or a suitable production mapping.

## Stop and validation

Do not edit production `src/`, `static/worklets/`, or `docs/ant/README.md`; do not change the baseline 3 ms pulse or test another mapping. Run harness self-checks, focused research tests, source/worklet diff audit, natural trace parity, continuous A/B replay, render repeat determinism, and `git diff --check`. Full suite/build are not required unless shared production/runtime files change.

## Preregistration amendment — exact-rate output reconstruction

The first 48 kHz orchestration attempt completed the frozen natural input capture and parity checks, but was stopped before producing or inspecting any A/B acoustic result because its per-audio-frame JavaScript replay was prohibitively slow. No candidate output was retained or evaluated.

The first exact-output test exposed the production process queue's seven-frame startup latency: the first 6 kHz physics result is emitted over output frames 7–14. The earlier interpolation formula was therefore incomplete and failed its parity assertion. No natural A/B output was generated or inspected. The corrected reference harness may run the unchanged worklet solver at its exact 6 kHz physics rate, with each captured message frame mapped from 48 kHz by exact division by eight and zero frame-rounding error. It captures post-physics `outputL`/`outputR`; output frames 0–6 remain zero, and physics result `n` is reconstructed over frames `8n+7..8n+14` using the production `last + (current-last) × s/8`, `s=1..8`, in Float32 output storage. For a window beginning at 48 kHz frame `8k`, the capture includes physics results `k−2` through the last result used by that window. The A arm's reconstructed 48 kHz PCM must match the existing 48 kHz renderer bit-for-bit on a deterministic short continuous fixture, including event receipts and solver telemetry, before any natural A/B window output is generated. If that gate fails, stop as inconclusive and do not use the reduced-rate path. This changes only the offline computation route; worklet source, physics rate, input stream, A/B pulse rule, windows, gain, and metrics remain fixed.
