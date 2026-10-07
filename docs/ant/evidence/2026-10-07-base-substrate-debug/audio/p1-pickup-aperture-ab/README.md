# Frozen P1 pickup-aperture A/B — 2026-10-07

Tested one graph-local, finite-area readout candidate against the existing production point pickup. The candidate is rejected; it did not improve weak spatial response and it remains evidence-only.

## Fixed candidate and source

- P1: `trail-plate-1`, seed `20261005`, birth `103.01666666667376 s`.
- Production A uses one compiled solver node at each unchanged pickup. A uses the frozen 48-node map and the saved natural 63-strike PCM; its hashes and source worklet hash are verified by the runner.
- Candidate B uses each pickup node and only its direct same-layer `neighborIndices`. One fixed Gaussian kernel uses `sigma = 1` solver cell: center raw weight `1`, each cardinal 1-hop raw weight `exp(-0.5) = 0.6065306597`. Each L/R neighborhood is independently normalized to sum to `1`.
- L is centered at node 34/cell 496 and covers nodes 34, 35, 37 with normalized weights `0.451863, 0.274069, 0.274069`. R is centered at node 15/cell 217 and covers nodes 15, 14, 16, 9 with normalized weights `0.354661, 0.215113, 0.215113, 0.215113`.
- Output is a signed weighted sum of frozen solver `next` displacements. No rectification or RMS enters the audio path. Uniform displacement response is exactly unity on both sides. Pickup positions do not move; no graph edges cross a disconnected gap or another Plate.
- The runner transforms the production worklet in memory at its existing pickup accumulation lines. `MIX = 1/sqrt(12)`, soft limiter, 3 ms contact pulse, 75 ms recovery, ×50 Plate damping, 0.245 surface gain, substrate ratio `0.22`, substrate damping `1`, and master gain `0.35` stay unchanged. No production file changed.

## Matched capture

The source input SHA-256 is `25bf05aab8bbbb142be11b79f37a5988898d6069e24cae31bf721348b0bf7ff3`; P1 descriptor SHA-256 is `fd079682ed0663f9bffdae36b1102958ef219f7d0bb6b35fcf2b1d09bc647b16`. The natural schedule contains the same 63 accepted strikes, same payloads, requested frames and equal-frame order as the saved A run; schedule SHA-256 is `d3a0468479ec1dc79751b9cbcd5b4fda83712d36e41d293d518cefde429a4933`.

Chrome `155.0.8059.40` `OfflineAudioContext` ran at 48 kHz. Each sweep position used the existing identical frozen strike payload, a 10 ms pre-roll, and event-aligned 100 / 250 / 500 ms windows. The 10 s natural window maps simulation time to audio with `round((strikeSimulationTimeMs - firstPlateBirthMs) * 48)`. A and B use the same saved and replayed schedules. Sweep and natural candidate diagnostics match A for Plate solver/contact state fields. The existing ANT fixed-scale overview/snapshot renderer is reused: separate L/R, waveform ±1, FFT 1024 Hann, hop 256, 0–8 kHz, −100…0 dBFS, gamma 1, no normalization; FOOT_CONTACT and P1 birth markers are retained.

## 48-node results

Pooled RMS across the 48 matched positions:

| Window | A min / P10 / median / max | B min / P10 / median / max | A→B P10 | A→B max:min | Pooled Spearman / pairwise order |
| ---: | --- | --- | ---: | --- | --- |
| 100 ms | 0.00008093 / 0.00013392 / 0.00044940 / 0.00063845 | 0.00007358 / 0.00010290 / 0.00040708 / 0.00072318 | −23.2% | 7.89× → 9.83× | 0.948 / 91.7% |
| 250 ms | 0.00006810 / 0.00011773 / 0.00039121 / 0.00054602 | 0.00006142 / 0.00008812 / 0.00036337 / 0.00063230 | −25.2% | 8.02× → 10.29× | 0.943 / 91.8% |
| 500 ms | 0.00005488 / 0.00009592 / 0.00031749 / 0.00044064 | 0.00004927 / 0.00007154 / 0.00029786 / 0.00051466 | −25.4% | 8.03× → 10.45× | 0.942 / 91.6% |

Channel medians also fell in every window. L changed `−0.77 / −0.72 / −0.73 dB` and R `−3.69 / −3.64 / −3.63 dB` at 100 / 250 / 500 ms. Pooled 500 ms peaks across nodes fell from min/P10/median/max `0.0002385 / 0.0004667 / 0.0014901 / 0.0023388` (A) to `0.0001871 / 0.0003167 / 0.0013149 / 0.0021581` (B). Peak max:min widened from `9.81×` to `11.53×`.

Channel-specific order stayed high (`Spearman 0.994–0.996`; 97.4–97.9% pairwise order preserved). Pooled spatial rank also stayed recognizable, but the low end worsened and the response range widened. This does not meet the weak-tail improvement goal.

## Natural 63-strike result

| Full 10 s PCM | A point pickup | B 1-hop Gaussian |
| --- | ---: | ---: |
| L RMS | 0.000911435 | 0.001041798 |
| R RMS | 0.000620749 | 0.000517612 |
| Pooled RMS | 0.000779757 | 0.000822577 |
| L peak | 0.006492562 | 0.007624206 |
| R peak | 0.004412051 | 0.003700040 |
| Clipped / non-finite samples | 0 / 0 | 0 / 0 |

Natural pooled RMS increased only `+0.46 dB`; event-aligned pooled median changed `−0.40 / −0.94 / −0.71 dB` for 100 / 250 / 500 ms. L/R balance shifted from `+3.34 dB` to `+6.08 dB`; cross-channel correlation stayed near zero (`−0.0043` A, `−0.0030` B). Thus the pooled increase masks a channel tradeoff rather than a consistent audibility gain. Event windows overlap and are descriptive of the complete run, not isolated impulses.

## Decision and files

**Reject this one-hop aperture candidate and stop.** Its pooled P10 and minimum are below A in all windows; no alternate aperture radius or weight was tested. Production continues to use point pickups.

- [Full A/B metrics, rank order, diagnostics, PCM and hashes](p1-pickup-aperture-ab.json)
- [Per-node A/B CSV](p1-pickup-aperture-ab.csv)
- [Fixed-scale A/B 100 ms pooled RMS map](A-B-node-rms100-fixed-dbfs.png)
- [A point-pickup natural overview](A-point-pickup-fixed-overview.png)
- [B aperture natural overview](B-1hop-gaussian-fixed-overview.png)
- [A/B fixed-scale waveform comparison](A-B-fixed-waveform-comparison.png)
- B natural 10 s stereo float32 PCM: `B-1hop-gaussian-born-only-10s-48khz-f32.wav`; SHA-256 `8beee33b971543a43a54f1f5ca6bc3785116059586795d3ec10a627ed72cc336`.
- 48 B sweep WAVs: `node-00-510ms-f32.wav` through `node-47-510ms-f32.wav`; hashes are in the report JSON.
- Reproduce: `node scripts/ant-p1-pickup-aperture-ab.js` (the `ANT_APERTURE_RENDER_ONLY=1` mode rebuilds visuals from the saved WAVs without recapturing PCM).

These 49 exploratory PCM WAVs remain local and are not included in the calibration commits. Their hashes, per-node metrics and fixed-scale maps are retained in the committed JSON/CSV and plots.

## Why the weak tail fell

A readout-only follow-up recorded the center and each valid same-layer neighbor for all 48 sweep strikes. Lower center-neighbor coherence tracks weaker per-channel A→B response, but negative correlations are uncommon and the weak pooled tail retains positive net cross terms against the diagonal-only energy reference. The dominant structural effect is that normalized spatial averaging lowers the point-center weight to 0.451863 (L) / 0.354661 (R) while Plate modal displacement varies across the neighborhood; unity response for uniform displacement does not preserve point-pickup RMS. The traced B PCM windows match the saved B windows exactly. No new topology was tested. [Component traces, per-node correlations and full report](../p1-aperture-cancellation-diagnosis/README.md).
