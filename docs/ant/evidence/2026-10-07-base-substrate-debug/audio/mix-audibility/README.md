# Born Plate pickup readout A/B

Frozen seed 20261005 and P1 trail-plate-1 at 103.01666666667376 s. The existing A source and first-birth input are verified against their frozen SHA-256 hashes; both worklets receive the exact same topology and 63 accepted P1 strike messages. A and B were rendered simultaneously in Chrome OfflineAudioContext.

Substrate settings stay unchanged: Off default, output ratio 0.22, damping 1.

A is the unchanged c89a85b source: (Plate pickup + Sphere modes) * 1/sqrt(12). B changes only readout scaling: Plate pickup * 1 + Sphere modes * 1/sqrt(12), then existing soft limiter. The evidence runner reconstructs B from A with checked replacement anchors and a pinned worklet hash. Production mixer remains A because B did not clear the audibility gate. The prior A PCM and substrate PCM remain untouched; A was recaptured here and its bit equality to the prior capture is recorded in the report.

The existing substrate stem is compared as captured. It is never rerendered or rewritten in this pass. See [mix-ab-report.json](mix-ab-report.json) for per-channel peaks/RMS, pooled RMS, clipping/non-finite checks, pre-limiter diagnostics, exact schedule hash and per-strike 100/250/500 ms RMS.

| Stem | Peak L | Peak R | Peak max | Pooled RMS |
| --- | ---: | ---: | ---: | ---: |
| A baseline | 0.00649256 | 0.00441205 | 0.00649256 | 0.000779757 |
| B candidate | 0.02111228 | 0.01463440 | 0.02111228 | 0.00263843 |
| Unchanged substrate | 0.04373244 | 0.04426044 | 0.04426044 | 0.02246752 |

B is +10.59 dB pooled RMS over A, but remains 18.60 dB below the substrate stem. Event-aligned median RMS rose +10.65 dB over complete post-strike windows: 100 ms (62/63 eligible), 250 ms (62/63), 500 ms (61/63); events whose full window would exceed the 10 s render are omitted, never truncated. A and B processor state diagnostics are identical. PCM clipping and non-finite counts are zero for both; B pre-limiter max absolute output is 0.09430 with zero pre-limiter over-threshold samples.

This pass does not establish restored audibility. Stop at this readout result; pickup-distance/readout topology remains the next hypothesis. No strike, damping, pickup, substrate or other gain tuning is included.

Waveforms and spectrograms use the existing fixed ANT preset: L/R separate, waveform ±1, FFT 1024 Hann, hop 256, 0–8 kHz, fixed −100..0 dBFS, gamma 1, no normalization. FOOT_CONTACT and P1 birth markers share the 0–10 s audio / 103.01666666667376–113.01666666667376 s simulation mapping.

Reproduce with node scripts/ant-born-plate-mix-audibility.js.
