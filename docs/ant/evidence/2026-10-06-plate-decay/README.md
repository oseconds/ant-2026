# ANT Plate decay A/B — 2026-10-06

This evidence measures a single real frozen Plate using the normal ANT `surface-plate-processor` in Chrome `OfflineAudioContext` at 48 kHz. Each 60 s render contains exactly one accepted routed foot strike at frame 0; there are no Z links or Sphere/nodules. A uses the preserved `7f8ebf8` worklet; B uses the current worklet with only the Plate damping multiplier changed. Both use the same compiled first Plate, pulse, contact recovery, route, gain (`0.245`, UI volume `35%`) and renderer. The dense and sparse intervals replay identical recorded FOOT_CONTACT-derived strikes at their recorded frames.

The measured isolated envelope is a 50 ms moving RMS with 10 ms hop. The reference is the maximum smoothed RMS per channel. T20/T40/T60 are measured from that reference to the first below-threshold window after the **last** above-threshold window, requiring at least 500 ms below and remaining below through the end of the render. Values are not extrapolated. This prevents an early beating dip from being counted as decay. The exact PCM energy-decay curve integrates squared samples in 10 ms blocks from each block to the observed render end; it does not pad the render tail to zero. Relative-to-peak curves are labeled measurement-only and are not used for audio or spectrogram normalization.

| Isolated strike | L T20 / T40 / T60 | R T20 / T40 / T60 | Notes |
|---|---:|---:|---|
| A, current damping | 49.66 s / not reached / not reached | 49.67 s / not reached / not reached | T20 is only reached late in the 60 s window. |
| B, damping ×50 | 1.01 s / 1.99 s / 2.99 s | 0.97 s / 1.98 s / 3.00 s | T60 precedes the first partial sleep transition at 6.145 s. |

The candidate's first and last observed node-sleep transition frames were 294,952 (6.1448 s) and 324,888 (6.7685 s). PCM remains nonzero beyond the T60 crossing and becomes exactly silent only later (first 50 ms all-zero window at 6.575 s); no silent floor is used to derive T20/T40/T60. Baseline had no sleep transition during the 60 s render. Reported sleep transitions are from a test-only instrumentation hook and do not alter production DSP.

## Dense and sparse natural contact replay

Both conditions are a 154–164 s slice from seed `20261005`, with one frozen Plate and no Z/Sphere path. The dense stream contains 648 groups / 1,916 individual feet / 242 accepted routed strikes. The sparse subset contains 10 groups / 30 feet / 4 accepted routed strikes. Baseline and candidate hashes match exactly within each condition (`8f56ad…291eb` dense, `b6e9df…9a275` sparse); accepted event counts also match. No non-finite samples or clipping occurred.

For dense replay, 50 ms RMS coefficient of variation changed from 0.337→0.401 (L) and 0.217→0.930 (R); p10 RMS fell from 0.002998→0.000649 (L) and 0.009461→0.000383 (R). Overall RMS and peak both fell. These measurements show substantially deeper quiet windows and more relative envelope variation, especially in R; they do not alone establish subjective audibility. The fixed-scale 10 s comparison is nearly black because the existing waveform axis is ±1 and the spectrogram is a fixed −100…0 dBFS mapping. This is retained as required, without per-clip normalization. Listen to the WAVs before making a perceptual claim.

Sparse A/B likewise uses the same events. Candidate sparse 50 ms RMS CV is 2.093 (L) / 2.856 (R); a few contacts dominate while the long intervals remain quiet. This is consistent with less persistent ringing, but is not a separate audio perception test.

## Fixed evidence renderer

Waveform: existing `ant-surface-stratigraphy-v1`, fixed ±1 full scale, 1200×1000 individual snapshot / 1200×1200 comparison sheet, grayscale background 255, line 24, guide 180, 1 px, opacity 1. Spectrogram: grayscale, FFT 1024, Hann, hop 256, 0–8000 Hz, fixed −100…0 dBFS, gamma 1.0. No clip-derived gain, axis or contrast adjustment is used. The long isolated overview uses the same fixed spectrogram transform across all 60 seconds; its trace naturally occupies very little of the full-scale waveform range.

## Files

- `baseline-isolated-60s-48khz-f32.wav`, `candidate-isolated-60s-48khz-f32.wav` — isolated A/B PCM.
- `baseline-isolated-decay.json`, `candidate-isolated-decay.json` — PCM metrics, envelope, T measurements, exact energy curves, and top early FFT-bin traces using the same 1024/Hann/256 transform. Bin peaks are not asserted to be physical modes; beating and the fixed −100 dBFS floor constrain mode-specific estimates.
- `baseline-isolated-decay-envelope.csv`, `candidate-isolated-decay-envelope.csv` — full 50 ms RMS curves, absolute and measurement-only relative dB, remaining energy fractions.
- `decay-ab-absolute-envelope.svg`, `decay-ab-absolute-envelope.png` — A/B absolute dBFS 60 s envelope on a shared −160…0 dBFS axis.
- `baseline-isolated-60s-fixed-overview.png`, `candidate-isolated-60s-fixed-overview.png` — full 60 s fixed-scale spectrogram overview.
- `decay-ab-comparison-10s-fixed-scale.png` — six-row isolated, dense and sparse A/B detail sheet on the existing fixed 10 s axes.
- `baseline-dense-154-164s.wav`, `candidate-dense-154-164s.wav`, `baseline-sparse-154-164s.wav`, `candidate-sparse-154-164s.wav` and corresponding `*-metrics.json` files — exact contact replay output and counts.
- `dense-ab-summary.json` — fixed preset and stream parity summary.
- `scripts/ant-plate-decay.js` and `scripts/ant-plate-decay-finalize.js` — reproducible capture/finalization harnesses (located in repository `scripts/`).

The compact top-bin FFT traces are descriptive only. With a 1024-point transform, the frequency resolution is 46.875 Hz; no reliable distinct modal decay-rate claim is made from these traces.

The leading bins overlap closely between A and B (46.875, 93.75, 140.625, 187.5, 234.375, 281.25/328.125, 375 Hz). That is consistent with damping changing decay more than spectral placement. The bin-level traces fall to the fixed −100 dBFS floor and are affected by beating; the data do not resolve separate modal decay constants. `material-damping-range.json` is a separate synthetic Node shared-worklet check, not additional natural Plates or Chrome recordings; its frozen material damping endpoints 0.25 and 0.45 produced T60 ranges around 2.71–3.52 s, retaining a modest material-dependent spread after the common ×50 multiplier.

The full suite passed 237/237 (including 22 focused DSP tests); build and Chrome development/production lifecycle checks passed. Their logs and browser artifacts are preserved here. `independent-validation.json` separately records the production-source scope check and acceptance of all six PCM cases, counts, hashes, fixed gain and decay metrics. The damping implementation is the separate commit `9069a3e943c85e11e60f0038df2336ef4d1e360d`; the evidence commit preserves this directory and its reproduction scripts.

From the repository root, reproduce with:

```powershell
node scripts/ant-plate-decay.js baseline
node scripts/ant-plate-decay.js candidate
node scripts/ant-plate-decay-finalize.js
node scripts/ant-plate-decay-material-range.js
node scripts/verify-ant-plate-decay.js
```

The capture harness normalizes source line endings only for its scheduling instrumentation and waits for the worklet's ready acknowledgement before offline rendering. Source hashes retain the original file contents. Failed/missing scheduling or a silent isolated render is rejected. The protected fixed evidence renderer is unchanged.
