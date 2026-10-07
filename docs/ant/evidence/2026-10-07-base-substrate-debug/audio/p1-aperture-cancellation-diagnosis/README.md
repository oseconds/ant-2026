# Frozen P1 aperture cancellation diagnosis — 2026-10-07

This is a readout-only diagnosis of the already rejected unit-sigma 1-hop Gaussian aperture. It does not test a new pickup topology or change production code.

## Frozen capture

- Seed `20261005`, P1 `trail-plate-1`, birth `103.01666666667376 s`.
- Same 48 frozen P1 strike positions and payload template as the observability sweep; input SHA-256 `25bf05aab8bbbb142be11b79f37a5988898d6069e24cae31bf721348b0bf7ff3` and descriptor SHA-256 `fd079682ed0663f9bffdae36b1102958ef219f7d0bb6b35fcf2b1d09bc647b16`.
- Chrome `155.0.8059.40`, 48 kHz output and 6 kHz solver readout. Each trace contains 600 signed `next` values for `[strike frame 480, frame 5280)`, one 100 ms window.
- The same in-memory B readout generated each PCM window. All 4,800 L and 4,800 R samples for every node matched the previously saved B PCM exactly: 48/48 nodes, 460,800 float samples total.
- The raw tap is before weighted pickup summation, MIX, limiter and solver state rotation. Taps contain signed values; they are not rectified or normalized.

## Finding

The weak B/A response is tied to reduced local coherence, but the evidence does **not** show that most neighboring nodes are simply in opposite phase. Across all center-neighbor pairs, the negative-correlation fraction is 8.3% on both sides. In the weakest channel-specific 25%, mean center-neighbor correlation falls to `0.303` (L) and `0.308` (R), versus `0.667` and `0.719` in the remaining strikes. Thus lower local coherence tracks the weak tail, while the correlations remain mostly positive.

The diagonal-only cancellation ratio is:

```text
RMS(weighted signed sum) / sqrt(sum((normalizedWeight × component RMS)^2))
```

It is below one only slightly for the L weak tail (`0.956` median); the R weak tail is `1.127`, above the uncorrelated-energy reference and therefore still has net constructive cross terms. Coherence efficiency against a fully aligned sum is lower (`0.554` L and `0.592` R in each weak tail), confirming less than perfect alignment without implying pervasive anti-phase cancellation.

The spatially normalized sum itself explains the output change. For each of the 48 strikes, its predicted solver-rate RMS change from the point-center RMS matches the measured 48 kHz PCM A→B change to within `0.014 dB` maximum per side. Median measured change is `−1.044 dB` on L and `−3.268 dB` on R. The center coefficient falls from `1` to `0.451863` (L) / `0.354661` (R). Unity response for a uniform displacement field does not preserve RMS for the actual spatially varying Plate modes; the aperture averages the local modal field and reduces the point-pickup response. Reduced coherence contributes, especially at weak positions, but “neighbors are predominantly out of phase” is not the primary description supported by the data.

No alternate topology or weights were tested. Stop here; retain the production point pickups.

## Evidence and reproduction

- [Per-node A/B and component metrics](p1-aperture-cancellation-per-node.csv) records raw and normalized aperture RMS, center/neighbor RMS, signed center-neighbor Pearson correlation, same-sign fraction, diagonal cancellation ratio, coherence efficiency and measured PCM A→B dB for each strike.
- [Signed component traces](p1-aperture-signed-component-traces.json.gz) contains each center and valid same-layer 1-hop neighbor’s complete 600-sample signed readout series for all 48 strikes.
- [Machine-readable report](p1-aperture-cancellation-report.json) records the exact capture inputs, schedule, weights, summary distributions, PCM equality and validation.
- The shared [aperture A/B evidence](../p1-pickup-aperture-ab/README.md) retains the candidate result and fixed-scale waveform/spectrogram conventions. No new normalization or audio visualization was introduced here.
- Reproduce the diagnostic with `$env:ANT_APERTURE_CANCELLATION_ONLY='1'; node scripts/ant-p1-pickup-aperture-ab.js; Remove-Item Env:ANT_APERTURE_CANCELLATION_ONLY`.

The runner modified only in-memory worklet source and diagnostic files. `static/worklets/surface-plate.worklet.js`, simulation/material code, strike routing, substrate settings and the saved A/B PCM files remain untouched.
