# Frozen P1 output calibration — Candidate D — 2026-10-07

Candidate D changes only the auxiliary substrate output ratio from `.010` to `.015` relative to Candidate C. The frozen born-only P1 PCM is sample-identical across B/C/D. D places the all-event substrate at **−4.72 dB** relative to born-only P1 over the first 10 s: +3.52 dB above C and −4.44 dB below B. No additional numeric acceptance threshold was introduced; this pass records the requested B/C/D comparison for listening review. Base Substrate default remains Off. No further tuning, commit, merge or push was done.

## Frozen setup

- Seed `20261005`; P1 `trail-plate-1` born at `103.01666666667376 s`.
- Input gzip SHA-256 `25bf05aab8bbbb142be11b79f37a5988898d6069e24cae31bf721348b0bf7ff3`; descriptor SHA-256 `fd079682ed0663f9bffdae36b1102958ef219f7d0bb6b35fcf2b1d09bc647b16`.
- Reused the exact 63 accepted P1 strikes (schedule SHA-256 `d3a0468479ec1dc79751b9cbcd5b4fda83712d36e41d293d518cefde429a4933`) and 44 unique matched parent contact groups (schedule SHA-256 `337dd257f15a19acf6869ce7870ed6be85bf69cb3e670f43f642d2bc07f69d35`).
- Compared B `.025`, C `.010`, D `.015`; only substrate output ratio varies. Plate pickup ×1, Sphere modes `1/sqrt(12)`, contact 3 ms / recovery 75 ms / ×50 Plate damping, substrate internal ×8 readout / damping 1, limiter, master volume `.35`, routing, pickup positions, simulation/material state, event schedule and windows are unchanged.
- Candidate D substrate stems derive from the same frozen `.22` source PCM scaled by `.015/.22`, matching B/C's calibration procedure. Born-only P1 is reused unchanged from the frozen Plate-unscaled capture.

For a shared absolute playback-level comparison of these frozen D stems at +18 dB and +20 dB, see the [2026-10-08 evidence package](../../../2026-10-08-candidate-d-absolute-level/README.md). Both gains preserve the D P1/substrate balance.

## Ten-second stereo PCM

Peak is maximum absolute L/R sample; RMS pools both channels. Values are raw float32 amplitudes. Candidate-specific source PCM, SHA-256, full L/R levels and checks are in [calibration-report.json](calibration-report.json).

| Condition | Ratio | Pre-birth peak / RMS | Born-only P1 peak / RMS | Matched 44 groups peak / RMS | All-event substrate peak / RMS | Matched / all-event vs P1 | On sum peak / RMS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B | `.025` | `.00488321 / .00245762` | `.0211123 / .00263843` | `.00358738 / .00104615` | `.00502960 / .00255313` | `−8.035 / −0.285 dB` | `.0248425 / .00372456` |
| C | `.010` | `.00195328 / .000983047` | `.0211123 / .00263843` | `.00143495 / .000418460` | `.00201184 / .00102125` | `−15.994 / −8.244 dB` | `.0225637 / .00285680` |
| D | `.015` | `.00292993 / .00147457` | `.0211123 / .00263843` | `.00215243 / .000627690` | `.00301776 / .00153188` | `−12.472 / −4.722 dB` | `.0233166 / .00308926` |

Pre-birth Base Off is exact silence for all three references. D's pre-birth On is nonzero. The P1 born-only peak/RMS and PCM hash are identical across B/C/D, so the change is limited to the substrate stem and the resulting sum. Every measured D stem reports zero clipping and zero non-finite samples; the full B/C/D stem checks are in the linked JSON reports.

## P1 strike-aligned median pooled RMS

Each window starts at the same P1 accepted-strike frames; incomplete tails are excluded (62 / 62 / 61 complete windows at 100 / 250 / 500 ms).

| Window | Born-only P1 (all candidates) | B matched / all-event / sum | C matched / all-event / sum | D matched / all-event / sum |
| ---: | ---: | ---: | ---: | ---: |
| 100 ms | `.00332027` | `.00144718 / .00246851 / .00432070` | `.000578873 / .000987405 / .00358197` | `.000868309 / .00148111 / .00371984` |
| 250 ms | `.00313770` | `.00134174 / .00242746 / .00410357` | `.000536695 / .000970984 / .00329433` | `.000805043 / .00145648 / .00348825` |
| 500 ms | `.00313196` | `.00127436 / .00250270 / .00395008` | `.000509744 / .00100108 / .00326066` | `.000764617 / .00150162 / .00343376` |

The three values in each candidate cell are the matched 44-group substrate, all-event substrate, and their candidate sum, each measured at the P1 event frames. The report also retains matched-group-native and all-contact-native event medians.

## Listening and fixed-scale plots

The [comparison listening page](listening.html) puts Base Off and B/C/D pre-birth stems beside the first-birth A-Off and B/C/D summed stems, at native file level with no normalization. The Chrome check loaded all 10 tracks and successfully started all 8 Off/candidate pre/post playback checks for this B/C/D comparison. This confirms the playback path; perceptual judgment remains with the listener. The page is open in the in-app browser for review.

- [Browser listening screenshot](browser-listening-check.png)
- D plots: [pre-birth](pre-on-d-fixed-scale-waveform-spectrogram.png), [first-birth sum](post-on-d-fixed-scale-waveform-spectrogram.png), [born-only P1](post-born-d-fixed-scale-waveform-spectrogram.png), [substrate-only](post-base-d-fixed-scale-waveform-spectrogram.png)
- Shared references: [pre-birth Off](pre-off-fixed-scale-waveform-spectrogram.png), [first-birth Off](post-off-a-fixed-scale-waveform-spectrogram.png); B/C plots remain in [Candidate B](../calibration-0.025/README.md) and [Candidate C](../calibration-0.010/README.md).

Plots reuse `stratigraphy-audio-overview.js`: separate L/R, waveform ±1, FFT 1024 Hann, hop 256, 0–8 kHz, grayscale −100…0 dBFS, gamma 1, no normalization, with the same FOOT_CONTACT and P1 birth clock anchors.

## Checks and reproduction

- Focused environment/worklet tests: 26/26 passed.
- Full `npm test`: 267/267 passed.
- `npm run build`: passed; existing Rollup annotation and large-chunk warnings remain.
- `npm run test:browser`: development passed; `npm run test:browser -- --production`: production preview passed.
- Frozen harness verifies input, descriptor, strike schedule, matched-group schedule, worklet hash, WAV hashes, event markers, fixed plot parameters and B/C/D sample equality.

```powershell
node scripts/ant-substrate-calibration-0015-evidence.js
node --test tests/ant-environment-audio.test.js tests/surface-plate-worklet.test.js
npm test
npm run build
npm run test:browser
npm run test:browser -- --production
```
