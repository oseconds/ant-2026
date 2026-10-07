# Frozen P1 output calibration — Candidate C — 2026-10-07

## Result

Candidate C changes only the auxiliary substrate output ratio from `.025` to `.010`, keeping Candidate B's Plate pickup ×1 and Sphere modes `1/sqrt(12)`. It clears the comparative quiet-substrate level check: over the first 10 s after birth, all-event substrate is **8.24 dB below** born-only P1. On the same P1 event windows, the substrate medians are 9.90–10.53 dB below the born-Plate medians. This is the measured margin for the user's decision about an intermediate ratio. The browser check confirms native-rate playback starts; it cannot judge subjective perceptibility, so no psychoacoustic claim is made.

Base Substrate remains **Off by default**. No intermediate ratio, merge, commit, or push was made.

## Frozen setup

- Seed `20261005`; first P1 `trail-plate-1` birth at `103.01666666667376 s`.
- Input gzip SHA-256: `25bf05aab8bbbb142be11b79f37a5988898d6069e24cae31bf721348b0bf7ff3`.
- P1 descriptor SHA-256: `fd079682ed0663f9bffdae36b1102958ef219f7d0bb6b35fcf2b1d09bc647b16`.
- Reused the same 63 accepted P1 strikes, schedule SHA-256 `d3a0468479ec1dc79751b9cbcd5b4fda83712d36e41d293d518cefde429a4933`.
- Matched substrate remains 44 unique parent contact groups, schedule SHA-256 `337dd257f15a19acf6869ce7870ed6be85bf69cb3e670f43f642d2bc07f69d35`; no event duplication.
- Only ratio differs from Candidate B: `.025 → .010` (−7.9588 dB from B, −26.8485 dB from the original `.22` gain). Plate mix, Sphere mix, 3 ms / 75 ms / ×50 baseline, substrate internal ×8 readout, damping 1, limiter, master volume `0.35`, pickup/routing, simulation/material behavior, and analysis windows are unchanged.
- Candidate C reuses the exact frozen born-only P1 PCM from Candidate B; the source PCM SHA-256 remains `d9d4c8909ef4c840df1fc496db66949ae9265dc7d98ce95391e92f80c2327097`.

## Ten-second PCM

48 kHz stereo float32, 480,000 samples per channel. RMS pools both channels; peak is max absolute L/R.

| Stem | Peak | Pooled RMS | Relative level |
| --- | ---: | ---: | ---: |
| Pre-birth A, base Off | 0 | 0 | Exact silence |
| Pre-birth C, base On `.010` | 0.00195328 | 0.000983047 | `−60.15 dBFS` RMS |
| First-birth C, born-only P1 | 0.0211123 | 0.00263843 | Reference |
| First-birth C, matched 44-group substrate | 0.00143495 | 0.000418460 | `−15.99 dB` vs P1 |
| First-birth C, all-event substrate | 0.00201184 | 0.00102125 | **`−8.24 dB` vs P1** |
| First-birth C, sum | 0.0225637 | 0.00285680 | `+0.69 dB` vs born-only P1 |

All listed stems have zero clipped and zero non-finite samples. The `.010` pre-birth stem is nonzero. The natural 10 s all-event substrate is substantially below P1; the smaller 44-group matched stem is lower still.

## P1 event-aligned median pooled RMS

Windows start at the same 63 accepted P1 strike frames. Incomplete tail windows are excluded (62 valid at 100/250 ms, 61 at 500 ms).

| Window | Born-only P1 | Matched 44-group substrate | All-event substrate | C sum |
| ---: | ---: | ---: | ---: | ---: |
| 100 ms | 0.00332027 | 0.000578873 | 0.000987405 | 0.00358197 |
| 250 ms | 0.00313770 | 0.000536695 | 0.000970984 | 0.00329433 |
| 500 ms | 0.00313196 | 0.000509744 | 0.00100108 | 0.00326066 |

The matched substrate's own 44-group event windows have median RMS `0.000567168`, `0.000527526`, and `0.000507048` at 100/250/500 ms (43, 43, and 42 complete windows). The all-event substrate medians at the P1 windows are respectively `−10.53`, `−10.19`, and `−9.90 dB` relative to born-only P1.

## Browser and fixed-scale evidence

The listening page loaded all tracks; browser Play checks started A/Off and C/On before birth and after birth for 0.7 s each. All files use their native level; no normalization. This verifies the playback path, not a calibrated listening level or subjective perceptibility.

- [Listening page](listening.html) · [browser screenshot](browser-listening-check.png)
- [Pre-birth A, fixed-scale waveform/spectrogram](pre-off-fixed-scale-waveform-spectrogram.png) · [Pre-birth C](pre-on-c-fixed-scale-waveform-spectrogram.png)
- [First-birth A](post-off-a-fixed-scale-waveform-spectrogram.png) · [First-birth C sum](post-on-c-fixed-scale-waveform-spectrogram.png)
- [C born-only](post-born-c-fixed-scale-waveform-spectrogram.png) · [C substrate-only](post-base-c-fixed-scale-waveform-spectrogram.png)

Plots use the same repository renderer and parameters as Candidate B: separate L/R, waveform ±1, FFT 1024 Hann, hop 256, 0–8 kHz, grayscale −100…0 dBFS, gamma 1, no normalization. FOOT_CONTACT and P1 birth markers use the same simulation-to-audio clock map.

## Checks and reproduction

Focused ANT environment/worklet tests passed 26/26; full `npm test` passed 267/267; `npm run build` passed with the repository's existing Rollup annotation and chunk-size warnings; `npm run test:browser` and `npm run test:browser -- --production` passed.

```powershell
node scripts/ant-substrate-calibration-0010-evidence.js
npm test
npm run build
npm run test:browser
npm run test:browser -- --production
```

Per-channel levels, hashes, sample schedules, markers, event-window counts and PCM checks are in [calibration-report.json](calibration-report.json). Candidate B's `.025` report and runner remain separately preserved in [calibration-0.025](../calibration-0.025/README.md).
