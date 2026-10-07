# Candidate D shared absolute gain — 2026-10-08

This pass applies one fixed post-gain to the three frozen Candidate D stems to compare absolute listening level and fixed-scale readability. It does not change Candidate D's substrate/P1 balance or any production setting.

## Frozen source and processing

- Candidate D substrate ratio `.015`; seed `20261005`; `trail-plate-1` birth at `103.01666666667376 s`.
- Same frozen input, descriptor, 63 accepted P1 strikes and 44 matched parent groups as [Candidate D](../2026-10-07-base-substrate-debug/audio/calibration-0.015/README.md). The absolute-gain JSON records their SHA-256 hashes.
- Shared source range: first 10 s from P1 birth, `[103.01666666667376, 113.01666666667376) s`, 48 kHz stereo, 480,000 samples/channel.
- Candidate D stems were left unchanged. Each P1-only, substrate-only and summed stem then received either `+18 dB` (`×7.943282347242816`) or `+20 dB` (`×10`). No independent normalization, extra limiter or mastering was applied. The source sum matched `P1 + substrate` sample-for-sample; relative substrate/P1 level changed by less than `0.000000002 dB` from float32 rounding.
- For both versions, all six WAVs have zero clipping samples (`|sample| >= 1`) and zero non-finite samples.

## Lossless listening files

All files are stereo IEEE float32 WAV, 48 kHz, 10 s, and share the same simulation/audio clock mapping and window.

| Shared gain | P1 only | Substrate only | P1 + substrate |
| --- | --- | --- | --- |
| +18 dB | [candidate-d_gain-plus18_p1.wav](candidate-d_gain-plus18_p1.wav) | [candidate-d_gain-plus18_substrate.wav](candidate-d_gain-plus18_substrate.wav) | [candidate-d_gain-plus18_sum.wav](candidate-d_gain-plus18_sum.wav) |
| +20 dB | [candidate-d_gain-plus20_p1.wav](candidate-d_gain-plus20_p1.wav) | [candidate-d_gain-plus20_substrate.wav](candidate-d_gain-plus20_substrate.wav) | [candidate-d_gain-plus20_sum.wav](candidate-d_gain-plus20_sum.wav) |

## Ten-second level measurements

Peak is the maximum absolute L/R sample. RMS pools both channels. Values are linear PCM amplitude, with dBFS in parentheses.

| Gain | Stem | Peak | Pooled RMS | Clipping | Non-finite |
| --- | --- | ---: | ---: | ---: | ---: |
| +18 dB | P1 | 0.167700782 (−15.51 dBFS) | 0.020957783 (−33.57 dBFS) | 0 | 0 |
| +18 dB | Substrate | 0.023970898 (−32.41 dBFS) | 0.012168127 (−38.30 dBFS) | 0 | 0 |
| +18 dB | Sum | 0.185210630 (−14.65 dBFS) | 0.024538844 (−32.20 dBFS) | 0 | 0 |
| +20 dB | P1 | 0.211122781 (−13.51 dBFS) | 0.026384286 (−31.57 dBFS) | 0 | 0 |
| +20 dB | Substrate | 0.030177573 (−30.41 dBFS) | 0.015318764 (−36.30 dBFS) | 0 | 0 |
| +20 dB | Sum | 0.233166367 (−12.65 dBFS) | 0.030892574 (−30.20 dBFS) | 0 | 0 |

## P1 event-aligned pooled RMS

Windows begin at the same accepted P1 strike frames. Incomplete tail windows are excluded; complete event counts are 62 / 62 / 61 for 100 / 250 / 500 ms.

| Gain | Window | P1 median RMS | Substrate median RMS | Sum median RMS |
| --- | ---: | ---: | ---: | ---: |
| +18 dB | 100 ms | 0.026373836 | 0.011764856 | 0.029547739 |
| +18 dB | 250 ms | 0.024923614 | 0.011569199 | 0.027708178 |
| +18 dB | 500 ms | 0.024878047 | 0.011927769 | 0.027275346 |
| +20 dB | 100 ms | 0.033202693 | 0.014811076 | 0.037198399 |
| +20 dB | 250 ms | 0.031376971 | 0.014564759 | 0.034882530 |
| +20 dB | 500 ms | 0.031319605 | 0.015016171 | 0.034337626 |

## Fixed-scale plots and playback check

Plots reuse the ANT audio overview renderer and settings: separate L/R channels, waveform scale `−1…+1`, 1024-point Hann FFT, 256-sample hop, `0–8 kHz`, grayscale `−100…0 dBFS`, gamma 1, no normalization, FOOT_CONTACT and P1 birth markers.

| Gain | P1 | Substrate | Sum |
| --- | --- | --- | --- |
| +18 dB | [waveform/spectrogram](plus18-p1-fixed-scale-waveform-spectrogram.png) | [waveform/spectrogram](plus18-substrate-fixed-scale-waveform-spectrogram.png) | [waveform/spectrogram](plus18-sum-fixed-scale-waveform-spectrogram.png) |
| +20 dB | [waveform/spectrogram](plus20-p1-fixed-scale-waveform-spectrogram.png) | [waveform/spectrogram](plus20-substrate-fixed-scale-waveform-spectrogram.png) | [waveform/spectrogram](plus20-sum-fixed-scale-waveform-spectrogram.png) |

[Listening/evidence page](listening.html) contains all six native-level tracks. Automated browser validation loaded and started all six files without page errors; this validates playback, not a human listening judgment. Screenshot: [browser-listening-check.png](browser-listening-check.png).

## Reproduction and raw report

Run from the repository root:

```powershell
node scripts/ant-substrate-calibration-0015-absolute-gain-evidence.js
```

[absolute-gain-report.json](absolute-gain-report.json) records source/output hashes, full per-channel metrics, event-window details, relative-level invariance, renderer parameters and browser playback results.
