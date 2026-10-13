# Base/Born causal decomposition — 2026-10-14

**Decision: MIXED, with a demonstrated temporal-input × elastic-law interaction.** Base has no single demonstrated transferable “character” responsibility. Elastic coefficients and geometry set modal positions; temporal/spatial excitation set participation; uniform and spatial-frequency loss set different aspects of decay. A rate-aware 6→48 kHz control is close to Born under the tested contacts. Neither jitter nor scalar readout explains the measured transfer contrast here. These are controlled response claims, not human preference or physical-equivalence claims.

Research baseline: `2a65dc892f96fef2254afdb3c0621e3023e67c0b`. Branch: `codex/ant-base-born-causal-decomposition-20261014`. Fetched `origin/main`: `d45823d40c9a87c1b333fa9872f3c897ee9ab01b`. Relevant production `src/`, `static/`, fixtures and package files match main. **Production source changed: no.** No adoption, PR or merge belongs to this pass.

## Responsibility map and inputs

The [source map](responsibility-map.md) distinguishes real implementation differences before any shadows. Both solvers use a masked four-neighbor Laplacian, its square, and the same second-order recurrence family. Base adds `gamma * (L current − L previous)`; its coefficients act at 48 kHz, versus Born's 6 kHz. Their geometry, spatial coordinates, strength law, pickup projections, compliance, and readout differ. The mathematical modal input gain is `B(q)=1−d−gamma*q`, because strikes change previous state before recurrence. The [modal audit](modal-audit.json) records stability, free poles, and rate-approximation error; it does not predict eigenvector participation or audibility.

Reuse the prior [frozen current-law inputs](../2026-10-13-plate-sonic-individuality/frozen-inputs.json.gz), 384,481 bytes, SHA-256 `f600eb768df2721c98cc607ea8b4b4d4fc64ae74cda6b5bf3f9297e8b0865a2d`. No new ANT simulation or descriptor generation.

Sort the existing 12-Plate roster by solver-node count, then key. Select minimum, upper median, and the first maximum tie. Selection uses geometry, never sound:

| Frozen key | Nodes | Descriptor SHA-256 | p50 source cell |
| --- | ---: | --- | ---: |
| `20261005-trail-plate-1` | 48 | `fd079682ed0663f9bffdae36b1102958ef219f7d0bb6b35fcf2b1d09bc647b16` | 3041 |
| `20261005-trail-plate-24` | 277 | `97e394cb23b05409185d4ca72cef628dd2919927c6e1a84157e22206d56c3d2a` | 2919 |
| `20261007-trail-plate-26` | 350 | `1d7d3080b30d301262aff0ca77921496c61ee8329775fbbd07504bbfc0ad94b4` | 3624 |

The index contains exact authoritative descriptor hashes and schedules. Native material stays fixed within each Plate. Every Born case has one isolated Plate, unchanged mask/neighbors/pickups, no Z, Nodule or Base substrate. One contact occurs at frame 480 / 10 ms, strength .035, footprint .01, hardness .5, at the first principal-path cell reaching half arclength. Render 72,000 frames / 1.5 s at 48 kHz, gain 1. The trio spans geometry; it is not a representative sample of all natural Plates.

39 cases: 3 exact prior-baseline replays, 33 new Born shadow responses, 3 actual circular generic references. References use normal quality, stiffness .92, damping control 100, actual x8 readout, deterministic LCG seed `20261014` and recorded node draws. Apply the legacy square→disk map to the same single contact. This controls timing/payload, not geometry, physical energy, pickup projection, or natural tripod grouping.

## Controlled measurements

Complete coordinates and comparisons are in [summary CSV](summary.csv), [summary JSON](summary.json), [compressed metrics](response-metrics.json.gz) and [exact experiment index](experiment-index.json.gz). All amplitude claims use fixed-gain PCM. Field spectra sum node power and divide by node count; Parseval equals mean squared displacement, **not joules**. Spectral cosines are descriptive, with no auditory threshold or combined similarity score.

| Isolated responsibility | Output RMS change | Transfer / character observation |
| --- | ---: | --- |
| Born 3 ms → one 6 kHz step, equal summed node impulse | +0.86 to +5.55 dB | Centroid +16.5 to +58.1 Hz; 300–1000 Hz share increases. Field 25 ms envelope cosine ≥.99980; field t90 remains about 495–499 ms. Strong pulse filtering is real, but duration alone does not create Base's full response. |
| 1 ms / 6-step intermediate | +0.72 to +4.82 dB | Centroid +12.5 to +49.4 Hz, similar but smaller direction than instantaneous. This is a sensitivity control, not the selected next candidate. |
| Generic point Gaussian σ=.72 in Born-grid cells, exact ±3 window | +1.24 to +3.03 dB | Centroid −3.6 to −17.8 Hz; field envelope stays nearly unchanged. Width/kernel changes modal weights, not free poles. |
| Generic width mapped through legacy ANT-world coordinates, σ≈2.35 Born cells, integrated kernel retained | +1.28 to +9.69 dB | Centroid −13.4 to −50.3 Hz; field 50 Hz cosine .760–.998. Stronger low-mode weighting, especially on the large geometry. This is a width sensitivity, not physical equivalence. |
| Fixed generic-range node jitter on the Born kernel, L2 renormalized | −.120 to −.005 dB | Output centroid changes ≤.22 Hz; field coarse cosine ≥.9999977. Negligible for this one normalized realization; no distribution-wide or point-kernel jitter claim. |
| Base uniform-loss magnitude only, exact constant-pole rate mapping | −2.73 to −2.70 dB | Field t90 ≈270–271 ms versus 496–499 baseline, near the circular reference ≈254–255 ms. Centroid changes under .74 Hz; this changes decay, not merely scalar gain. |
| Base frequency-loss slope only, `gamma6=8*gamma48=.0004929124754` | −4.11 to −1.56 dB | Field t90 235 / 280 / 358 ms; remaining field energy after 500 ms .76 / 1.68 / 4.10% versus baseline ≈9.9%. High-q modes decay faster; low-q geometry participation makes the broad-envelope effect unequal across Plates. |
| Rate-aware Born 48 kHz control | +.007 to +.036 dB | Output 50 Hz cosine ≥.9999919, field cosine ≥.9999995; centroid within .20 Hz. Pure discretization is not a leading cause under these smooth contacts. |
| Base elastic coefficients at 48 kHz, Born geometry/input/loss/pickups retained | −56.08 / −52.59 / −29.67 dB versus rate control | Output centroid 1570 / 936 / 264 Hz versus 225 / 114 / 71. A much higher modal law plus 3 ms spectral gating strongly suppresses response. This is an authored elastic-law change, not a rate effect. |
| One bounded interaction: Base elastic law + one 48 kHz step | +42.90 / +34.98 / +11.39 dB versus Base-elastic 3 ms | Output centroid 2490 / 1158 / 912 Hz. At the same 48 kHz rate, native-elastic instantaneous input gives only +5.48 / +1.23 / +.84 dB. Difference of these log-RMS contrasts is +37.42 / +33.74 / +10.55 dB: a transfer interaction, not equal physical energy or a Base similarity score. |

Order in slash-separated values is small / middle / large. The 48 kHz interaction is a bounded 2×2 comparison of elastic law and temporal input on each geometry; no wider factorial sweep. Rate controls divide bending and tension by 64, map uniform loss by `d48=1−(1−d6)^(1/8)`, and divide discrete contact velocity **and its compliance reference** by eight. Pulse duration stays 3 ms / 144 steps, recovery 75 ms. The local rate map approximates the continuous-time stencil, not exact forced-response equivalence. Exact free-pole resampling is a separate modal reference; high-mode frequency error reaches about 2.4%, though actual smooth-contact response is very close.

The full Base elastic law cannot be rate-transplanted to 6 kHz: its q=4 pole is ≈3188 Hz at 48 kHz; the nominal ×64 coefficient map is unstable. It was rejected mathematically without a render. Every tested operator is stable across the complete frozen eigenvalue spectrum. Short renders end before the two-second sleep threshold; they do not validate the 48 kHz shadow's long-duration quiet counters.

## Level, observation and the circular reference

An exact offline control multiplies the **same measured Born raw pickups** by eight, applies the actual limiter, then reconstructs the delayed interpolation queue. Output rises +17.28 to +17.86 dB; centroid changes ≤.57 Hz, coarse-spectrum cosine ≥.9998918. Limiter compression of that gain-8 signal is .23–.90 dB. This mainly explains level here, without changing the field. The actual circular Base reference has stronger limiter compression, 2.30–2.42 dB, so pre-limiter gain cannot always be treated as timbrally neutral. Born cases' limiter compression is separately recorded; no clipped/non-finite PCM or state.

The actual Base reference has output centroid 146–171 Hz, field centroid 175–184 Hz, dominant output peak near 109 Hz, and field t90 ≈254–255 ms. Its low circular modes and fixed pickup participation remain major differences. Base elastic coefficients on Born masks produce much higher dominant response than this reference; instantaneous excitation does not numerically reproduce Base. The broad world-width control weights low modes, but its centroid moves toward the reference only for the small Plate and away for middle/large. No factor moves every response dimension uniformly toward Base.

This does **not** quantify a pure circular-geometry effect: circular mask, spatial strike kernel and pickup projection were not jointly transplanted. The core stencil family is already shared. Evidence supports modal-domain/elastic law, excitation projection and loss as separate mechanisms; the exact share of artistic “usefulness” remains unresolved.

Historical evidence stays separate: +34.594 dB raw gap = +25.793 dB readout/limiter term +8.801 dB reconstructed displacement gap; excitation proxy ≈+1.121 dB leaves ≈+7.680 dB mixed residual. That residual still combines geometry, discrete rate, timing, spatial/group input, loss and observation. Historic jitter was not recorded. New draws cannot recover it, and this pass does not reinterpret the residual as a solver constant.

## Listening and limits

[Listening sheet](listening.html): seven fixed-gain measurement WAVs and eighteen explicitly listening-only RMS-matched WAVs, 9,217,100 bytes combined. [Listening manifest](listening-manifest.json) records each source hash, export gain, RMS, peak and WAV hash. No human listening assessment was performed. No subjective preference, distinguishability, or acceptance threshold is asserted. The [fixed-scale field figure](fixed-scale-field.svg) is a measurement plot, not normalized listening evidence.

Group-centroid versus per-foot semantics were audited, not fabricated as equivalent. A centroid can lie outside a Born mask, and there is no frozen matched natural tripod stream in this package. Strength law, Base circular pickup weights, spectral-window leakage, discrete temporal phase, normalized versus unnormalized jitter, and long-duration sleep remain limits. No dense-world, Z, Nodule, or realtime claim was re-tested. Prior isolated individuality and four Z probes remain their scoped research baseline.

## Single next bounded pass: loss distribution at a matched q=4 pole

**Hypothesis:** If Base's spatial-frequency loss adds a useful transferable response beyond a shorter overall tail, then on the frozen trio, changing only the loss operator across q should change high-versus-low mode decay and observable pickup character while preserving contact payload/temporal footprint/spatial footprint, geometry, and the q=4 pole/input gain within storage tolerance.

Use `gamma*=8*gammaBase48` fixed by this audit, not fitted to preferred sound. Compare two shadows on the unchanged Born elastic law at 6 kHz:

- Flat loss control: `gamma=0`, `d=dBorn+4*gamma*`.
- Frequency-loss arm: `gamma=gamma*`, `d=dBorn`.

At q=4 both A, B, free pole and previous-state input gain are exactly equal in the real-valued formulation; Float32 coefficient storage leaves a tiny rounding residual to record. At other q, `B(q)` changes modal onset gain as well as the poles. This is one loss-operator responsibility, with a mathematically specified uniform-loss comparator. q=4 is the operator's median control point, not a perceptual optimum. It is not a gain adjustment, duration tuning, or production candidate adoption.

Reuse the same trio, native descriptors, p50 contact and the existing defensible common-three-contact recipe (p25/p50/p75, frames 480/12480/24480, identical strength/width). Measure field modal low/high-q post-pulse decay slopes separately from onset amplitude, remaining-energy curves, output/raw-pickup band decay, fixed-gain spectra, stereo response and limiter contribution. Do not call an onset-gain change decay selectivity. Add separately labeled level-matched A/B listening if a human is available. Preserve formation/behavior/RNG, material mapping, 3 ms input, 75 ms compliance, ×50 multiplier, rate, pickups and Z/Nodule production topology; no coupling or performance work.

Reject/park frequency-loss responsibility if its added selectivity appears only in weak internal modes while actual pickups converge with the matched flat-loss control, or if the proposed desirable character lacks listening support. Do not select a preferred amount from these diagnostics. The present pass already supports loss as a decay responsibility, but does not isolate the additional value of frequency selectivity from matched overall decay. That unresolved distinction makes this smaller than another Base-law replacement or architecture trial. **Not implemented in this pass.**

## Reproduction, validation and hygiene

See [render manifest](render-manifest.json), [analysis manifest](analysis-manifest.json), [browser parity](browser-parity.json), [validation](validation.json), [fresh independent review](independent-review.md), and [daily chronology](../../daily/2026-10-14-base-born-causal-decomposition.md).

```powershell
git check-ignore test-results/ant-base-born-causal-decomposition-20261014
node --expose-gc scripts/ant-base-born-decomposition.js initial
node --expose-gc scripts/ant-base-born-decomposition.js extended
python scripts/ant-base-born-metrics.py --self-check
python scripts/ant-base-born-metrics.py test-results/ant-base-born-causal-decomposition-20261014/render-index.json test-results/ant-base-born-causal-decomposition-20261014/metrics.json
python scripts/ant-base-born-modal.py
node scripts/ant-base-born-report.js
node scripts/ant-base-born-listening.js
node scripts/ant-base-born-validation.js
node --test tests/ant-base-born-shadow.test.js tests/ant-sonic-shadow-render.test.js tests/surface-plate-worklet.test.js tests/compile-surface-topology.test.js tests/surface-audio-bridge.test.js
node scripts/ant-base-born-audit.js
```

Use an actual Python runtime with NumPy; this host used bundled Python 3.12.14 / NumPy 2.3.5. Prior ignored baseline raw inputs must exist (rebuild the prior diagnostic if absent); the 815 MB package is reused, not duplicated. Full new PCM/fields stay under the verified ignored `test-results/...` location. Every omitted file has role, exact byte size, SHA-256, generation command and source/tool provenance. Compact metrics/indexes and bounded listening artifacts are tracked; no tracked file exceeds 50 MB.

Focused checks passed 51/51. Four middle-geometry shadows (instantaneous, frequency loss, rate-aware 48 kHz, Base-elastic instantaneous 48 kHz) match Chrome OfflineAudioWorklet PCM exactly and repeat exactly. All three Born baselines repeat prior PCM **and full fields** exactly. Generic renderer tests match uninstrumented seeded source and record exact draws. The forward limiter/interpolation reconstruction has relative residual ≈3.7e−8 or below, accounting for Float32 storage. Test success validates the harness, not a sonic preference. Final audit verified 158 unique artifact paths, including all 119 new ignored raw files / 1,135,860,644 bytes and 26,244,000 reused baseline bytes. [Every omitted file's exact size, hash and command](omitted-artifacts.json).

Production, selector-shadow stash and unrelated worktree material remain unchanged. Formation, morphology, selector, temporal-history, vitality, behavior, social work and realtime optimization stay parked. An early read-only subagent accidentally enumerated two archive **filenames**; no archive contents were opened/read/used. Further discovery was restricted to explicit allowed paths. This exception is disclosed rather than claiming perfect archive exclusion.
