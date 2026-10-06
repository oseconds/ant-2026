# ANT direct-contact sonic baseline

This folder records one controlled A/B of the direct exposed-Plate strike response. It isolates one immutable Plate descriptor from the natural `seed 20261005` browser run. That Plate was born at simulation `124.0167 s`; the selected dense stream is `154–164 s`, before the next Plate birth. The controlled audio topology has exactly one Plate, zero adjacent-Z links, and zero Sphere/nodule modes. The normal renderer and worklet physics are used; only the harness schedules the captured routed strikes at frame indices so both renders receive the same input timing.

For the implementation equations, unchanged-system audit and regression results, see [the pass report](../../2026-10-06-contact-sonic-baseline.md).

## A/B setup

- **A:** committed `static/worklets/surface-plate.worklet.js` at `2d9430b` (`5531011e…222e802` SHA-256).
- **B:** the candidate worklet captured in the metrics (`a9b25600…bc1236aa` SHA-256).
- Both use the same natural `FOOT_CONTACT` payloads, the same first frozen Plate mask, the same `SurfaceField` contact-response replay, the production `SurfaceAudioBridge` grouping/L2 route budget, a 48 kHz Chrome `OfflineAudioContext`, and the same final gain `0.245` (Volume 35%). No microphone, clip-specific gain, or PCM normalization is used.
- Dense stream: `648` contact groups / `1,916` individual feet enter the bridge; `242` exposed feet are routed and accepted by each worklet.
- Sparse stream: select actual groups from that same 10-second stream at least one simulation second apart: `10` groups / `30` feet enter the bridge; `4` exposed feet are routed and accepted by each worklet.
- The processor reports the same accepted strike counts (242 dense, 4 sparse) and zero rejected strikes for both variants. SHA-256 of the canonical frame-indexed routed payload is identical within each A/B pair. The full captured source event file and each worklet source also have hashes in `summary.json` and the case metric JSON files.

The sparse subset preserves the selected real event positions and relative natural timestamps. It is a quiet comparison extracted from the natural stream, not a separately generated gait or randomly thinned event stream.

## Files

- `aligned-ab-10s-fixed-scale.png` — dense and sparse A/B waveform and spectrogram rows, with shared time, ±1 waveform, and grayscale −100 to 0 dBFS axes.
- `baseline-dense-10s-48khz-f32.wav`, `candidate-dense-10s-48khz-f32.wav` — 10-second stereo float PCM for the natural dense window.
- `baseline-sparse-10s-48khz-f32.wav`, `candidate-sparse-10s-48khz-f32.wav` — 10-second stereo float PCM for the sparse subset on its original 10-second time base.
- `*-metrics.json` — case-level source, worklet, routed schedule hashes, contact counts, Bridge statistics, processor diagnostics, and audio measurements.
- `summary.json` — A/B input-parity assertion, hashes, rendering preset, and accepted processor strike counts.

The comparison image uses the existing immutable `ant-surface-stratigraphy-v1` renderer: waveform range `−1…+1`; separate L/R; 1024-point Hann window, hop 256, 0–8000 Hz, fixed −100…0 dBFS grayscale brightness, gamma 1. No per-clip normalization is applied. The source amplitudes are small on the absolute full-scale axis, so the waveforms remain close to zero and much of the spectrogram is near its fixed floor. This is part of the recorded output, not a rendering normalization problem.

## Measured result

| Condition / measure | A: instantaneous | B: 3 ms pulse + 75 ms local recovery |
|---|---:|---:|
| Dense RMS L/R | 0.007258 / 0.012151 | 0.006509 / 0.011335 |
| Dense peak L/R | 0.024158 / 0.032590 | 0.021176 / 0.029360 |
| Dense 50 ms RMS coefficient of variation L/R | 0.323 / 0.215 | 0.337 / 0.217 |
| Sparse RMS L/R | 0.000844 / 0.001811 | 0.000750 / 0.001717 |
| Sparse peak L/R | 0.003497 / 0.006073 | 0.002761 / 0.005358 |
| PCM non-finite samples / clipped channel samples | 0 / 0 | 0 / 0 |

The Bridge's L2-bounded injected impulse budget is identical per input stream: `0.0949301847` dense and `0.0015519544` sparse. For B, the worklet's internal squared-velocity proxy changed from requested to compliance-delivered by about 6.2% in the dense stream and 0.9% in the sparse subset. The finite pulse distributes the same event over 18 physics steps (3 ms at 6 kHz); local loading has a 75 ms exponential recovery and caps the compliance reduction at 25% for a fully loaded node.

The measurements show lower peaks and modestly more envelope variation, particularly in the sparse four-route sample. Dense variation changes only slightly, mostly on the left channel. The fixed-scale mean spectral values are near the −100 dBFS floor; the mean above 4 kHz reaches that floor in both conditions. The first-difference RMS is a frequency-weighted slope proxy, not a band-energy measurement. These results support only a **small measured change**, not a strong claim that dense footsteps are now clearly separated from the resonant bed. Human listening was not assessed as part of this capture.

Raw routed-event 0–10 ms and 10–50 ms RMS windows are retained in each case JSON. They are measured relative to foot contact, before accounting for wave travel to the frozen pickups, and overlapping route windows can contain prior resonance. They are not used as a standalone perceptual attack/decay score.

Starting tests/build: 227/227 and pass. Final tests/build: 234/234 and pass. Installed Chrome development and production preview lifecycle checks passed, with stdout, screenshots and paired metrics retained here. The production snapshot was a pre-birth smoke at 100% Volume with zero strikes; it is lifecycle evidence rather than A/B sound evidence. The controlled A/B output uses 35% in every case. [Scope-freeze record](scope-freeze.json) confirms no src, generic DSP, fixed renderer or historical-evidence changes.

Implementation commit: `bdbe60f397391864b078c37d659a4b33eeaa3f4a`; the separate evidence commit preserves this directory and the two reproduction scripts. The audible change is not presented as a runtime improvement.

## Reproduction

From the repository root, after the candidate worklet has been prepared:

```powershell
node scripts/ant-contact-sonic-ab.js baseline
node scripts/ant-contact-sonic-ab.js candidate
node scripts/ant-contact-sonic-finalize.js
```

The harness reads the committed baseline worklet, the recorded natural Chrome FOOT_CONTACT and Plate descriptors, and the current candidate worklet. It renders through Chrome's real Web Audio OfflineAudioContext/AudioWorklet path, then the finalizer recomputes metadata from the saved PCM and asserts event-count, support-count, and canonical routed-payload/frame parity. It does not synthesize ANT behavior or edit the captured contacts.
