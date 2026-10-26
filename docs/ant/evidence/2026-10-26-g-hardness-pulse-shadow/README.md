# G Natural Hardness → Contact Pulse Shadow

## Decision

**INCONCLUSIVE — 240 CPU min/arm cutoff.** The natural input capture and all pre-render validity checks passed. None of the six seed-by-arm continuous renders completed before the authorized cutoff. Both repeatability renders were also stopped. No A/B acoustic result was produced.

The eight renderer processes each exceeded 240 CPU minutes. At the final sample, CPU use ranged from 14,418.34 to 14,421.95 seconds. All workers were then intentionally stopped. The resulting worker exit code is a cutoff consequence, not a completed render or an acoustic failure. No extra render was started.

## Frozen comparison

- **A:** current production worklet, fixed 3 ms contact pulse (18 physics steps at 6 kHz).
- **B:** isolated shadow worklet, `pulseSteps = clamp(round(18 − 12h), 6, 18)` and `pulseMs = pulseSteps / 6`; half-sine envelopes are normalized to sum to 1.
- Both were preregistered to replay identical, ordered topology and strike posts continuously from 0 through 550 s. Fixed windows were 120–130 s, 300–310 s, and 540–550 s for each seed.

No arm produced a complete 10 s PCM window. Therefore there are no fixed-gain RMS/peak, spectral, pickup, A/B difference, clipping, dropped-message, or listening results. `listening/` is empty. No human listening judgment was collected. The production worklet still ignores hardness and retains its fixed 3 ms pulse.

## Completed input validation

The 600 s, 60 Hz production-G natural capture completed for all three seeds. It used the actual `SurfaceAudioBridge` posts. Initial fingerprints, per-second world traces, contact streams, Plate/Nodule births, event hashes, final RNG state/call counts, and strike payloads matched the validated G evidence. The capture observer added no RNG calls. The captured message streams preserve the actual monotonic port-post clock used for replay scheduling.

| Seed | Actual routed strikes | Captured messages | Stream SHA-256 | Uncompressed message SHA-256 |
|---|---:|---:|---|---|
| 20261005 | 67,071 | 67,139 | `61b6a307e138f3158734c878b2e3f9497c2bebf74b0e2d419b5e2301838edecf` | `4e37e0196a1f8cd02abd9073402a33c12280a46e01efb489a6f6156598c68038` |
| 20261006 | 70,983 | 71,052 | `6b85f61fa6b7d2b39a158dc8db60ad302e257816fa724b76277dc191f8a5fc3e` | `b1d20ba5015682c2e691fe1626486e51deb8a07eeff2e830bbd434484b0637ac` |
| 20261007 | 66,727 | 66,790 | `1cce380168e5ad9b9222917c3f8270a85973271a1b936b12d74f474dbbc002b5` | `8d0d221da1220ceabd80d39fe067b65825a04fe719cec798dde1f37681ccd01f` |

Each captured strike projected exactly to the previously frozen routed-strike evidence, including its source event time and complete payload. The separate `postSimulationTimeMs` field is finite and nondecreasing in captured post order. All strike hardness values are finite and in `[0,1]`.

## Input-only window summary

These summaries use actual strike post times and the same preregistered nine windows. B pulse quantiles below are computed from input hardness only; no B envelope was applied to a completed natural replay. Quantiles use the preregistered Type 7 rule.

| Seed | Window | Strikes | Hardness p05 / p50 / p95 | B steps p05 / p50 / p95 | B ms p05 / p50 / p95 |
|---|---|---:|---|---|---|
| 20261005 | 120–130 s | 263 | 0.0941 / 0.2398 / 0.4944 | 12 / 15 / 17 | 2.000 / 2.500 / 2.833 |
| 20261005 | 300–310 s | 1,594 | 0.1341 / 0.3310 / 0.7950 | 8 / 14 / 16 | 1.333 / 2.333 / 2.667 |
| 20261005 | 540–550 s | 1,835 | 0.2138 / 0.4388 / 0.9156 | 7 / 13 / 15 | 1.167 / 2.167 / 2.500 |
| 20261006 | 120–130 s | 668 | 0.0593 / 0.1607 / 0.4418 | 13 / 16 / 17 | 2.167 / 2.667 / 2.833 |
| 20261006 | 300–310 s | 1,363 | 0.1537 / 0.3412 / 0.8362 | 8 / 14 / 16 | 1.333 / 2.333 / 2.667 |
| 20261006 | 540–550 s | 1,821 | 0.2215 / 0.4658 / 0.9300 | 7 / 12 / 15 | 1.167 / 2.000 / 2.500 |
| 20261007 | 120–130 s | 416 | 0.0884 / 0.2187 / 0.4476 | 13 / 15 / 17 | 2.167 / 2.500 / 2.833 |
| 20261007 | 300–310 s | 1,357 | 0.1329 / 0.3274 / 0.8005 | 8 / 14 / 16 | 1.333 / 2.333 / 2.667 |
| 20261007 | 540–550 s | 1,635 | 0.2301 / 0.4460 / 0.9019 | 7 / 13 / 15 | 1.167 / 2.167 / 2.500 |

This confirms the input contains a changing hardness distribution and the frozen map assigns shorter pulse durations to harder strikes. It says nothing about resulting field or pickup output.

## Validation and reproduction

- Natural G capture: all three seeds matched saved G world/event/RNG evidence; exact actual routed payload parity passed.
- Frozen production source and worklet matched pre-registered `origin/main` `4f0f8624c47ed310d7a6a4a37d43e3d0e7756b4b`; production `src/` and `static/worklets/` remain unchanged.
- Candidate self-check passed 101 hardness points, monotonic 18→6 steps, all 13 normalized half-sine envelopes, and exact-rate synthetic A/B worklet parity.
- Focused research tests passed 9/9 before replay and again after the cutoff with test isolation disabled. The default isolated runner failed to spawn child processes (`spawn EPERM`); this was an environment limitation, not a test assertion failure.
- `node --check` and `git diff --check` passed before the cutoff; they were repeated during evidence finalization.
- Full suite/build were not run: the pass changed only isolated research tooling and evidence, not shared production/runtime code.

Recheck the pulse rule and exact-rate synthetic fixture:

```powershell
node scripts/ant-g-hardness-pulse-shadow.js --self-check
node --test --experimental-test-isolation=none tests/ant-sonic-shadow-render.test.js tests/ant-g-hardness-pulse-shadow.test.js
```

The complete runner is `node scripts/ant-g-hardness-pulse-shadow.js`. It recaptures the world and starts the eight continuous render jobs; do not restart it under this pass's stop instruction. The saved V8 message streams and `cutoff-receipt.json` preserve the completed input and cutoff evidence.

## Interpretation boundary

**Implementation fact:** production remains fixed at 3 ms and does not consume hardness in `applyStrike()`.

**Measured observation:** captured natural inputs pass world and payload parity; their hardness and derived B duration distributions vary across the fixed windows.

**Acoustic verdict:** **INCONCLUSIVE.** No completed A/B replay means no pulse-width output effect was measured.

**Perceptual status:** no listening assets and no listener judgment. No claim of audibility, preference, or artistic value.

This cutoff is a research-render runtime limit. It is not evidence of a production browser regression.
