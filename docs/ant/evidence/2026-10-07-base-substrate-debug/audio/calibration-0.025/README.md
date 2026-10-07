# Frozen P1 output calibration A/B — 2026-10-07

## Decision

This single candidate pass tested Plate pickup ×1 with Sphere modes still at `1/sqrt(12)`, and the auxiliary substrate output ratio `0.22 → 0.025`. The base remains **Off by default**. The substrate is nonzero before birth, and the 44-group matched stem is below P1, but the natural all-event substrate is only **0.29 dB below** born P1 pooled RMS in the first-birth window. The requested “quiet bed, clearly new Plate layer” gate is therefore **not met**. Stop at this candidate; no further calibration or default-On change.

## Frozen inputs and settings

- Seed `20261005`; P1 `trail-plate-1` birth `103.01666666667376 s`.
- Input gzip SHA-256: `25bf05aab8bbbb142be11b79f37a5988898d6069e24cae31bf721348b0bf7ff3`.
- Frozen P1 descriptor SHA-256: `fd079682ed0663f9bffdae36b1102958ef219f7d0bb6b35fcf2b1d09bc647b16`.
- 63 accepted P1 strikes, exact schedule SHA-256 `d3a0468479ec1dc79751b9cbcd5b4fda83712d36e41d293d518cefde429a4933`.
- Those accepted strikes map to 44 unique FOOT_CONTACT parent groups; matched schedule SHA-256 `337dd257f15a19acf6869ce7870ed6be85bf69cb3e670f43f642d2bc07f69d35`. The substrate retains one generic excitation per source group; the 44 groups are not expanded into 63 events.
- A: Plate and Sphere contribution each `1/sqrt(12)`; substrate ratio `0.22`.
- B: Plate pickup ×1; Sphere modes `1/sqrt(12)`; substrate ratio `0.025`. Legacy substrate internal readout ×8, substrate damping `1`, master `0.35`, limiter, pickup positions/topology, strike routing/strength, simulation, material and birth rules remain unchanged. The Plate baseline remains 3 ms / 75 ms / ×50.
- The `.22 → .025` substrate gain change is −18.88965 dB. Candidate B born-only P1 PCM reuses the previously frozen 63-strike capture exactly; current worklet SHA-256 matches that capture's source.

## PCM measurements

Native 48 kHz stereo float32, 480,000 samples/channel per 10 s window. RMS pools both channels; peak is maximum absolute L/R sample.

| Window / stem | Peak | Pooled RMS | Note |
| --- | ---: | ---: | --- |
| Pre-birth A, base Off | 0 | 0 | Exact silence |
| Pre-birth B, base On `.025` | 0.00488321 | 0.00245762 | Nonzero PCM, −52.19 dBFS RMS |
| First birth B, born P1 only | 0.0211123 | 0.00263843 | Plate pickup ×1 |
| First birth B, matched 44-group substrate | 0.00358738 | 0.00104615 | −8.04 dB vs B born-only |
| First birth B, all-event substrate | 0.00502960 | 0.00255313 | −0.29 dB vs B born-only |
| First birth B, summed | 0.0248425 | 0.00372456 | Substrate + born stems |

The frozen A born-only P1 RMS was `0.000779757` (peak `0.00649256`); B is +10.59 dB. The original A `.22` first-birth sum was `0.0225040` pooled RMS. No sample in any reported stem clipped or was non-finite.

### Event-aligned median RMS

Windows start at the frozen 63-strike P1 schedule; incomplete tail windows are omitted. The A columns use the original captured A stems. B columns use the candidate stems.

| Window | A born only | A sum, base `.22` | B born only | B matched substrate | B all-event substrate | B sum, base `.025` |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 ms | 0.000974521 | 0.0217593 | 0.00332027 | 0.00144718 | 0.00246851 | 0.00432070 |
| 250 ms | 0.000920604 | 0.0213955 | 0.00313770 | 0.00134174 | 0.00242746 | 0.00410357 |
| 500 ms | 0.000918521 | 0.0221039 | 0.00313196 | 0.00127436 | 0.00250270 | 0.00395008 |

For the matched substrate's own 44-group event windows, pooled median RMS was `0.00141792`, `0.00131882`, and `0.00126762` at 100, 250, and 500 ms (43, 43, and 42 complete windows). For the 63-strike-aligned table above, 62, 62, and 61 windows were complete.

## Browser playback and plots

The local listening page exposes the same frozen native-rate PCM without normalization. Browser Play checks started all four requested comparisons for 0.7 s: pre-birth A Off, pre-birth B On `.025`, first-birth A Off, and first-birth B On `.025`. The A pre-birth file is exact digital silence; B pre-birth is nonzero. Browser decode/play state is verified, but this record makes no subjective audibility claim. The browser volume control and playback device were not calibrated.

- [Listening page](listening.html) · [browser screenshot](browser-listening-check.png)
- [Pre-birth A, fixed-scale waveform/spectrogram](pre-off-fixed-scale-waveform-spectrogram.png) · [Pre-birth B](pre-on-b-fixed-scale-waveform-spectrogram.png)
- [First-birth A, fixed-scale waveform/spectrogram](post-off-a-fixed-scale-waveform-spectrogram.png) · [First-birth B sum](post-on-b-fixed-scale-waveform-spectrogram.png)
- [B born-only](post-born-b-fixed-scale-waveform-spectrogram.png) · [B substrate-only](post-base-b-fixed-scale-waveform-spectrogram.png)

All plots reuse the repository ANT waveform/spectrogram renderer: separate L/R, waveform ±1, 1024-point Hann FFT, hop 256, 0–8 kHz, fixed grayscale −100…0 dBFS, gamma 1, no normalization. FOOT_CONTACT markers and the P1 birth marker use the frozen simulation-to-audio anchors in `calibration-report.json`.

## Reproduction and validation

```powershell
node scripts/ant-substrate-calibration-0025-evidence.js
npm test
npm run build
npm run test:browser
npm run test:browser -- --production
```

The frozen measurement runner reads the saved A PCM and frozen schedules, derives B substrate stems using the exact gain ratio, and reuses the previously captured B born-only PCM; it does not rerun the natural simulation or change the legacy substrate worklet. Full tests passed 267/267, build passed with existing Rollup annotation/chunk-size warnings, and development plus production browser smoke checks passed. Detailed per-channel levels, hashes, sample schedules, renderer parameters and browser readiness are in [calibration-report.json](calibration-report.json).
