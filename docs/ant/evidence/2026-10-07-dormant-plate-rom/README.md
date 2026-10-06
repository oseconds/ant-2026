# Dormant Plate reduced-order feasibility

Date: 2026-10-07
Starting HEAD: `48672cdc4d0aeea5873ad10bd83ddd5878ebf3f6`
Result: **unattractive for the tested modal reduced-order path**. No production behavior changed.

The frozen Plate is linear for fixed mask, material, and coupling graph. An exact symmetric modal model preserves signed input, damping, phase, and accumulation, but the measured ranks that preserve the captured responses are too large to give a credible solver-cost reduction. This rejects this modal candidate; it does not prove every possible POD/Krylov model unattractive.

## Reproduction and files

Run from the repository root with a new, empty output directory:

```powershell
node scripts/ant-dormant-plate-rom-feasibility.js docs/ant/evidence/2026-10-07-dormant-plate-rom/<new-run-directory>
```

The script refuses an existing final output directory and writes files with exclusive-create semantics. It uses the real worklet, captured topology, and following event stream. It contains assertions for source constants, the full solver recurrence, event routing, zero cancellation, finite output, and full-rank equivalence.

Final run: [feasibility-run-48672cd-spectral-final](feasibility-run-48672cd-spectral-final/)

- [Rank sweep JSON](feasibility-run-48672cd-spectral-final/rank-sweep.json) and [CSV](feasibility-run-48672cd-spectral-final/rank-sweep.csv)
- [Wake and reconstruction CSV](feasibility-run-48672cd-spectral-final/wake-handoff.csv)
- [Operation estimate CSV](feasibility-run-48672cd-spectral-final/operation-estimate.csv)
- [Fixed-gain waveform comparison](feasibility-run-48672cd-spectral-final/waveform-comparison.svg)
- [Cumulative state-error plot](feasibility-run-48672cd-spectral-final/state-error.svg)
- [Fixed-gain spectrum summary](feasibility-run-48672cd-spectral-final/spectrum-summary.csv)
- [Waveform samples](feasibility-run-48672cd-spectral-final/selected-waveforms.csv)
- [Frozen Plate geometry and eigensolver checks](feasibility-run-48672cd-spectral-final/selected-plate-geometry.json)
- Four compressed signed Z/Sphere force traces, with hashes recorded in the JSON.

Two final harness runs produced the same 13 output files with identical SHA-256 hashes. The deterministic verifier output is outside the repository under the permitted temporary directory.

## Solver recurrence and reduction

Production source: `static/worklets/surface-plate.worklet.js`, chiefly lines 561–629.

At 6 kHz, the full state stores current displacement `u[n]` and previous displacement `u[n-1]`. The masked Laplacian is `L`:

```text
L u[i] = -4*u[i] + sum(existing four-neighbor values)
next = 2*u - previous - bending*L(Lu)
       + (tension/density)*Lu - damping*(u-previous) + linkForce
```

Missing neighbors stay absent from the sum while the center coefficient remains -4 (zero Dirichlet boundary). `linkForce` is the sum of reciprocal adjacent-layer Z springs and Sphere foundation springs. For the frozen topology the harness separates each spring into a diagonal restoring term and signed input from its other endpoint:

```text
K = bending*L^2 - (tension/density)*L + diag(frozen Z/Sphere spring stiffness)
next = (2-d)*u + (d-1)*previous - K*u + fZ_external + fSphere_external
```

Here `d` is the material loss coefficient multiplied by the production ×50 Plate damping factor. The tested effective values were 0.00076923 for Plate 29 and 0.00077217 for Plate 1. Direct `FOOT_CONTACT` is outside the reduced model; each clean replay strikes Plate 30 and drives its target only through recorded signed coupling forces. The output uses the production pickup nodes and fixed (1/sqrt{12}) scale. No per-render normalization or limiter was used; no replay sample clipped.

For a fixed operator, `K` is symmetric. The harness uses its ascending eigenvectors as an orthonormal basis and evolves both modal displacement and its previous sample. Incoming force is projected every 6 kHz sample. No contribution is dropped at an event threshold. The cyclic Jacobi solver's maximum eigen residual was `2.02e-13` for Plate 1 and `1.98e-13` for Plate 29; maximum orthogonality error was below `9.3e-14`.

Sleep and wake metrics are kept distinct because production uses two expressions:

```text
quiet sleep blocker = next^2 + velocity^2 + bending*(L current)^2 >= 1e-10
intra-Plate wake    = next^2 + velocity^2 + (L^2 current)^2*0.0001 > 1e-10
```

The handoff replay uses the first expression as its diagnostic reconstruction trigger. That is a measurement rule for this study, not a proposed production wake policy.

## Captured inputs and geometry

The source snapshot is from physics step 1,534,928: a frozen 30-Plate, 32-nodule topology with 9,806 solver nodes. The following event capture contains 2 seconds; its next topology rebuild is 11,392 steps after the snapshot. This study captured the first 2,500 steps (416.7 ms), before that rebuild. It replayed 1,033 recorded strike events, skipped 119 direct strikes targeting the two reduced Plates, and applied 914 other strikes. There were no topology messages or dropped routes in the selected window.

| Plate | Solver nodes | Source cells covered | Z-link edges | Sphere links | Mean touched nodes/step, natural trace |
|---|---:|---:|---:|---:|---:|
| `trail-plate-1` (oldest) | 119 | 650 / 655 | 197 | 8 | 119 |
| `trail-plate-29` | 310 | 920 / 1,550 | 681 | 0 | 310 |

The oldest Plate also had eight Sphere foundation connections. Its Sphere force was small but retained in the captured trace (`L2 = 1.41e-7`); Plate 29's natural trace contained Z input only. All four recorded input traces reproduced the current production solver's selected Plate displacement and velocity exactly at every step (maximum error 0). The natural trace began with selected target vibration cleared so the captured coupling force could be isolated; it is open-loop replay data, not a full mature-run audio render.

The weak and strong clean events target `trail-plate-30`, using recorded payload strengths 0.01967 and 0.03577. On Plate 29 they generated signed Z-force trace L2 values 2.91e-5 and 4.34e-5. The weak replay is the prior event whose full-solver response was measured at about −36.49 dB relative to the struck Plate.

## Rank sweep and weak accumulation

The ladder was 2, 4, 8, 16, 32, 64, 128, and full rank. Output RMS error is relative to the fixed-gain full-solver RMS over the same trace; state error combines displacement and one-step velocity RMS. Input-work values are signed sums of force times displacement-step. Full rank reproduces both targets with output and state RMS error below `5e-6` fraction, and the harness enforces full-rank reproduction.

| Input, Plate 29 | Rank | Force L2² retained | Output RMS error | State RMS error | L/R correlation | Exact quiet-energy crossing, full → ROM |
|---|---:|---:|---:|---:|---:|---:|
| Single weak | 8 | 55.7% | 9.28% | 8.68% | .445 / .997 | 17 → 22 |
| Single weak | 64 | 82.9% | 2.77% | 2.40% | .936 / .9998 | 17 → 19 |
| Single weak | 128 | 93.1% | 1.03% | 0.51% | .997 / .99996 | 17 → 18 |
| Single strong | 8 | 2.7% | 94.1% | 99.1% | .346 / .164 | 13 → 303 |
| Single strong | 64 | 77.8% | 6.81% | 6.79% | .998 / .980 | 13 → 15 |
| Single strong | 128 | 91.5% | 0.87% | 2.00% | .99997 / .99969 | 13 → 13 |
| Four overlapping weak copies, same sign | 8 | 59.2% | 3.47% | 3.27% | .714 / .9995 | 17 → 22 |
| Four overlapping weak copies, same sign | 128 | 93.4% | 0.30% | 0.24% | .9976 / .999997 | 17 → 18 |
| Four overlapping weak copies, alternating sign | 8 | 40.6% | 14.78% | 12.83% | .271 / .991 | 17 → 22 |
| Four overlapping weak copies, alternating sign | 128 | 92.6% | 0.86% | 0.81% | .9975 / .99998 | 17 → 18 |
| Natural multi-edge trace | 16 | 53.1% | 17.94% | 28.11% | .986 / .980 | 3 → 4 |
| Natural multi-edge trace | 64 | 79.1% | 2.00% | 3.19% | .9998 / .9997 | 3 → 3 |
| Natural multi-edge trace | 128 | 89.4% | 0.43% | 0.66% | .99999 / .99999 | 3 → 3 |

The frequency check applies a 2,048-point Hann FFT to the first 341.3 ms, at fixed gain with a 2.93 Hz bin spacing. It sums left/right power for comparison. Raw total power and power-vector errors preserve gain; the separately reported normalized spectral-shape L1 and band shares normalize each trace to its own power and are analysis-only. They do not retain phase, so the time-domain correlations remain necessary.

At rank 8, the single-strong spectrum loses 92.7% of full-reference power and has 0.809 normalized shape L1; the natural Plate 29 spectrum loses 28.3% and has 0.541 shape L1. At rank 64, the natural trace has 0.026% power error and 0.00259 shape L1, consistent with its time-domain errors. The one weak trace is dominated by 0–250 Hz: rank 8 has close spectral power but still only 0.445 left-channel time correlation, exposing phase/trajectory error that a power spectrum alone hides.

The same-sign replay preserves real accumulation in the full solver: its fixed-gain output peak is 2.79× the single-weak peak and RMS is 3.68×. The alternating-signed replay peaks at 1.31× and RMS at 1.47× the single event, reflecting partial cancellation at its 30 ms offsets while the Plate's damped state persists. Identical equal-and-opposite same-step inputs cancel exactly: zero output, zero state, and zero work. This confirms that the tested modal recurrence carries weak signed force over time rather than applying Candidate A's stateless per-contribution discard.

The one weak input crosses the existing quiet-energy threshold in the full solver at sample 17 (2.83 ms). Thus the current production threshold does not classify this captured weak transfer as “do not wake.” No new single-event suppression gate was tested or proposed.

For the oldest buried Plate under the natural trace, rank 16 yielded 2.92% output RMS error and 3.90% state error; rank 32 yielded 0.88% and 1.89%; rank 64 yielded 0.17% and 0.20%. Its arithmetic break-even estimate was rank 8.3, below the rank that preserved the state.

## Wake and state reconstruction

The full Plate reference crosses the exact quiet-energy expression on the weak trace at sample 17 and on the stronger trace at sample 13. Low ranks delay the proposed reduced-state threshold substantially: weak rank 8 by 5 samples, strong rank 8 by 290 samples. Rank 128 crosses on time for the strong event and one sample late for weak input.

At the weak rank-128 handoff, displacement error was 6.56%, velocity error 5.96%, and the combined displacement/velocity energy proxy was 0.43% low. At the strong rank-128 handoff, those values were 11.3%, 4.73%, and 1.21% low. Rank 64 was much worse: weak displacement/velocity errors were 20.7%/13.7%; strong errors were 45.4%/36.1%. Full rank stayed below `2e-7` displacement/velocity relative error.

No fade hid the transition. The handoff metric records same-sample pickup reconstruction error, the first resumed full-step output error, and the change in one-sample output slope versus the continuously full reference. At rank 128, the absolute first-resumed slope error was `5.85e-10` for weak input and `6.10e-11` for strong input; the rank-128 post-handoff weak waveform RMS error was 1.34% relative to reference. Pickup continuity alone therefore looks clean, but omitted spatial state and missing energy remain material at these ranks.

## Performance and topology semantics

The operation estimate is deterministic arithmetic accounting, not a timing benchmark. Plate 29 full cost is estimated at 7,974 scalar work units/step. With natural input, rank 8 is 7,748 units (0.97× full), but its output RMS error is 50.2% and state error 48.4%; rank 16 costs 1.60× full; rank 64 costs 5.38×; rank 128 costs 10.42×. With weak input the estimated break-even rank rises to 11.4, but rank 8 still has poor pickup correlation and 9.28% output RMS error. Exact per-node energy checks add reconstruction work proportional to `N*r` and the two stencils; even rank 8 then costs 2.36× full for weak input and 2.52× for natural input. Plate 1 has a similar rank-8 break-even (0.98×) but 12.8% output and 32.4% state error.

These estimates count masked stencil work, per-node recurrence, coupling force work, dense modal input projection, and pickup projection using the formulas written to `operation-estimate.csv`. They omit memory traffic and control flow, so they do not claim a wall-clock speedup. A useful safe wake check is not proven cheaper. No Chrome AudioWorklet or natural runtime test was run.

Safe persistence design for a future study:

1. Key current and previous modal coordinates plus basis data by stable `plateId` plus solver-grid node identities, mask, internal material coefficients, sample rate, and basis/operator hash. Never key reduced state to packed-node offsets.
2. Keep every signed Z/Sphere contribution in the reduced recurrence each sample. Repeated weak input accumulates; opposite input cancels through the state equation; damping and phase remain active while dormant.
3. Prefer a basis of the unchanged internal Plate operator and treat reciprocal Z/Sphere coupling, including its target self-spring term, as explicit signed input. Then births can change sparse coupling maps without resetting modal history. This closed-loop reciprocal implementation was not validated here.
4. If mask/material changes, reconstruct the old current and previous displacement, map by solver-grid identity, project to the new basis, measure residual state/energy, and keep the Plate full if the residual is not safely bounded. If instead the coupled diagonal stays inside `K`, any Z/Sphere topology change invalidates that basis and requires an explicit state transfer.
5. Direct `FOOT_CONTACT` remains unconditional on the full state path. On wake, reconstruct current and previous displacement once and continue without reapplying a force already integrated. Do not clear pending physical input on topology reinstall.

This study models only open-loop input traces. Because reduced state was not returned to adjacent Plate or Sphere states, reciprocal feedback, topology changes during dormancy, direct-contact wake, long-run phase drift, and AudioWorklet deadline cost remain unvalidated. The previous sleep diagnosis found the dominant natural blockers were persistent local Plate energy/restoring force (oldest layer: 99.51% quiet-energy and 99.95% Plate-force blocked); broad `wakeNode` quiet-counter resets were not dominant. This pass did not rerun that blocker instrumentation.

## Verification

- `node --check scripts/ant-dormant-plate-rom-feasibility.js` — passed.
- Diagnostic harness — passed twice; all 13 final files had identical SHA-256 hashes.
- Full-force replay versus production source — max displacement and velocity differences both 0 across four traces.
- Routed strikes — zero drops; finite checks — zero non-finite values; clipping — zero samples.
- Same-step signed cancellation and full-rank modal recurrence/handoff assertions — passed.
- `npm test` / production build — not run; no shared or production source changed.
- Browser, natural runtime, and end-to-end realtime target — not tested.
