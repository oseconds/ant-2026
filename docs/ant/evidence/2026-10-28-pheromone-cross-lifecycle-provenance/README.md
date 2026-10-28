# Pheromone cross-lifecycle provenance — 2026-10-28

## [Implementation]

This is a read-only observer on fresh `origin/main` `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`, branched directly at that commit. Current ANT production sources are unchanged from the previously known `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`; see [`SOURCE-PROVENANCE.json`](SOURCE-PROVENANCE.json). The current G production contract remains the one recorded in [G adoption](../2026-10-25-g-production-adoption/README.md): a 316×316 Float32 field, 15 s half-life, cap 8, Gaussian point writes, and bilinear reads.

The observer and runner live in [`scripts/lib/antPheromoneProvenanceObserver.js`](../../../../scripts/lib/antPheromoneProvenanceObserver.js) and [`scripts/ant-pheromone-cross-lifecycle-provenance.js`](../../../../scripts/ant-pheromone-cross-lifecycle-provenance.js). They wrap the existing controller and field only in the research runner. No production source, field parameter, sensor decision, movement, lifecycle, material, Plate-birth rule, or audio path changed.

At each production brush write, the observer records the actual positive Float32 node delta and assigns it to the author ID carried by that `GasterDeposition` batch. It does not use requested authored dose as stored signal. Per-cell author contributions decay at the field's simulation clock. At each raw field sample inside `senseLocalTrail()` or `senseTrail()`, those components are bilinearly sampled at the production nodes and classified as self, alive-other, or retired-author.

The observer keeps a separate signed numeric residual between the production Float32 cell and the summed author contributions. It does not reassign this residual to an ant. A read's signed residual then joins the author components when checking reconstruction of the exact production scalar sample. The observer also carries first/second signal-weighted deposition-age moments. Reported age quantiles describe the distribution of each read's signal-weighted mean age in fixed 0.1 s bins; they are not quantiles of individual deposition events.

Spatial summaries use a fixed 32×32 grid and four radial bands from recruitment origin `(0.5, 0.72)`. They help distinguish entry-area concentration from signal read elsewhere.

## [Existing ANT evidence]

- The G adoption record validates the production field and three natural 600 s runs for seeds `20261005`, `20261006`, and `20261007`.
- Its saved natural conformance reports zero saturation and the deterministic checkpoints reused here. This pass independently paired observer-off and observer-on current-main worlds.
- The adoption evidence does not attribute current sensor signal to individual ant authors. That is the new measurement below.

## [New measurement]

Each seed used production defaults, Audio Off, a counted LCG, 60 Hz, and 600 model seconds. The comparison includes 36,000 ticks per arm. The 36,465,983 raw samples are repeated sensor reads, not unique positions or independent experiments.

| Seed | Self signal | Alive-other signal | Retired-author signal | Positive reads with any retired signal | Retired contribution mean age | p50 read-level retired mean age | First Plate | Retired / spawned |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `20261005` | 0.026% | 35.245% | 64.730% | 98.055% | 28.43 s | 27.65 s | 84.017 s | 756 / 775 |
| `20261006` | 0.030% | 34.858% | 65.113% | 98.697% | 28.54 s | 27.85 s | 96.017 s | 793 / 815 |
| `20261007` | 0.024% | 34.698% | 65.278% | 98.226% | 28.67 s | 27.65 s | 92.017 s | 769 / 790 |
| **Pooled** | **0.027%** | **34.936%** | **65.038%** | **98.329%** | **28.54 s** | per-seed values above | — | — |

Fractions divide each category's summed raw sample value by the summed production sample values. Pooled age moments are weighted by sampled signal. Retired contributions had pooled mean age 28.54 s and signal-weighted SD 21.13 s. Alive-other contributions averaged 5.29 s (SD 4.75 s). Self signal was very small; its pooled mean age is not a stable primary result.

Retired signal was not confined to the recruitment origin. Across the pooled spatial bins, retired signal was 55.91% within 0.05 world units of the origin, 58.22% at 0.05–0.15, 64.68% at 0.15–0.30, and 79.94% beyond 0.30. Full per-seed grids and bins are in [`RESULTS.json`](RESULTS.json).

The result was similar by sensor path: local reads were 64.995% retired-author, 34.979% alive-other, and 0.026% self; wide reads were 66.050%, 33.912%, and 0.037%, respectively. Across positive production reads, the per-seed median retired share was approximately 99.95%; the p25 ranged from 84.05% to 92.15%. Retired contribution magnitude p50 ranged from `0.0315` to `0.0335` in production field sample units. Thus the high any-positive frequency is accompanied by substantial signal shares, not only tiny nonzero residue.

The persisted world outcomes also match the prior current-G conformance receipts: spawned/retired counts were 775/756, 815/793, and 790/769; individual foot-contact counts were 99,469, 101,243, and 100,717; Plate counts were 36, 38, and 37. First Plate times match the saved receipt at 84.017, 96.017, and 92.017 s.

## [Manipulation validity]

- Observer-on and observer-off agent state, lifecycle counters, spawn schedule, RNG state/calls, and trajectory matched after every tick for all three seeds.
- At 0, 30, 60, 120, 300, and 600 s, exact hashes matched for agents, pheromone, SurfaceField, TrailPlateBirth, MaterialStratigraphy, and event streams, including FOOT_CONTACT and births.
- All 36,465,983 instrumented scalar reads reconstructed within the registered `max(1e-9, abs(sample) × 1e-6)` tolerance. Largest observed sample reconstruction error was `4.44e-16`.
- No field cap touch, negative write, or unattributed deposit occurred. The largest absolute node residual sum / production node sum at checkpoints was `8.03e-7`, below the preregistered `1e-4` gate.
- Production default was `dab`, so segment writes/clipping did not occur. Out-of-domain point requests were detected and rejected by the existing field: 61 / 5 / 46 requests; rejected authored dose was 1.802 / 0.128 / 0.854 by seed. Only stored in-domain Float32 changes entered author attribution.
- Current G run summaries match the existing adoption receipt, including contact and birth totals. This confirms the observer did not shift the natural world.

The first-seed report exposed a histogram-tail presentation bug: a last-bin midpoint could exceed the registered share/magnitude domain. The final three-seed run clamps only reported quantile centers to their domain bounds. It changed no event, signal, age, bin assignment, or comparison parameter. Final results were regenerated with the corrected reporter.

## [Interpretation]

In these three natural G runs, most sampled pheromone signal was authored by ants already retired by read time. That is consistent across seeds and sensor types, and the associated signal is not confined to the entry region. This supports the presence of a real `past organism → shared substrate → later sensor read` temporal bridge in current production G.

It does not show that retired-authored signal changed an ant's movement decision. The observer measures signal present at sensor reads; it does not remove that component or run a causal counterfactual. It also does not establish social relationships, persistent roles, individual memory, biological pheromone semantics, or Plate author attribution.

## [Modeling hypothesis]

Current G is not merely a self-signal or living-neighbor, short-lag channel under these natural defaults. Retired authors contribute a majority of the sampled signal. Behavioral causal importance remains unmeasured.

## [Artistic interpretation]

No human or artistic judgment was collected in this technical provenance pass.

## Reproduction

```text
node scripts/ant-pheromone-cross-lifecycle-provenance.js
node --test tests/ant-pheromone-provenance.test.js
```

The runner defaults to the three registered seeds and 600 seconds. Results and full parity receipts are preserved in [`RESULTS.json`](RESULTS.json). See [`PLAN.md`](PLAN.md), [`VALIDATION.md`](VALIDATION.md), and the [daily record](../../daily/2026-10-28-pheromone-cross-lifecycle-provenance.md).
