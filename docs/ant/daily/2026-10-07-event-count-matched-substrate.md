# 2026-10-07 — Event-count matched substrate vs born P1

## Question

Separate the 10-second substrate-vs-born-Plate level gap into the selected contact-event contribution, raw worklet/resonator/readout level, and fixed bridge/output gain. Keep DSP, topology, routing, simulation and substrate settings unchanged.

## Frozen mapping

- Seed 20261005; P1 trail-plate-1 birth at 103.01666666667376 s. Frozen input SHA-256 25bf05aab8bbbb142be11b79f37a5988898d6069e24cae31bf721348b0bf7ff3; descriptor SHA-256 fd079682ed0663f9bffdae36b1102958ef219f7d0bb6b35fcf2b1d09bc647b16.
- The exact 63 accepted P1 schedule matched SHA-256 d3a0468479ec1dc79751b9cbcd5b4fda83712d36e41d293d518cefde429a4933.
- Those foot-level strikes came from 44 unique FOOT_CONTACT groups: 27 groups produced one P1 strike, 15 produced two, and 2 produced three. Production generic substrate mapping emits one centroid/strength excitation per group, so the matched substrate schedule contains 44 messages. No group payloads were duplicated.
- The 44 selected original legacy payloads were checked against each source group's production centroid, disk-coordinate transform and clamped strength. All 624 all-events substrate messages and the previous all-events PCM remain unchanged.

## Measurement

Chrome 155.0.8059.40 OfflineAudioContext, 48 kHz, 480,000 samples/channel. The same P1 schedule was used for born-event alignment. Born dispatch was sample-exact; generic substrate delivery retained its next-128-frame timing receipts. Raw output is taken directly before the external bridge GainNode, after each worklet's internal processing. The all-events raw level was recovered by dividing its original configured PCM by its fixed 0.0539 gain.

| Stem | Raw pooled RMS / max peak | Configured pooled RMS / max peak |
| --- | ---: | ---: |
| Born P1, 63 accepts | 0.00318268 / 0.0265003 | 0.000779757 / 0.00649256 |
| Substrate, 44 matched groups | 0.170800 / 0.585695 | 0.00920612 / 0.0315689 |
| Substrate, original 624 events | 0.416837 / 0.821158 | 0.0224675 / 0.0442604 |

No stem had clipped or non-finite samples. Born configured PCM matched the saved frozen born stem exactly. The saved all-events substrate WAV remained byte-identical.

Configured event-aligned pooled median RMS, using the same P1 timestamps (62 complete 100 ms windows, 62 complete 250 ms, 61 complete 500 ms):

| Window | Born P1 | Matched substrate | All-events substrate |
| --- | ---: | ---: | ---: |
| 100 ms | 0.00097452 | 0.0127352 | 0.0217229 |
| 250 ms | 0.000920604 | 0.0118073 | 0.0213616 |
| 500 ms | 0.000918521 | 0.0112144 | 0.0220237 |

## Result and limit

Reducing from all 624 generic events to the 44 P1-supporting parent groups lowered substrate pooled RMS by 7.75 dB. The matched substrate raw worklet output remained 34.59 dB above the born P1 raw worklet output. The fixed configured gain favors born P1 by 13.15 dB, leaving matched substrate 21.44 dB above born P1; the original all-events gap remains 29.19 dB.

The matched-vs-all difference combines lower event count with selection of P1-supporting groups and their positions/timing; it is not a pure equal-energy event-density law. The raw substrate-vs-born comparison also includes group-centroid/strength versus per-foot production excitation mapping and the distinct worklet paths, so it is not an isolated resonator transfer measurement. The output levels do not establish psychoacoustic masking. Generic Plate PCM can vary across replays because its production strike jitter remains random, while the event schedule stays fixed. No tuning or production changes follow from this diagnostic.

## Evidence and verification

Full per-channel and pooled RMS/peak, event-aligned raw/configured medians, schedules, hashes, bridge settings, scheduler receipts, clipping checks and fixed-scale images are in [the event-count-matched evidence package](../evidence/2026-10-07-base-substrate-debug/audio/event-count-matched-substrate/README.md). Reproduce with node scripts/ant-event-count-matched-substrate.js. Focused audio renderer tests passed 17/17.

## Follow-up: readout scaling vs mechanical response

The stored matched raw WAVs were inverted sample-by-sample using `x = y / (1 - abs(y))`; reconstructed pickup displacement is `x/8` for substrate and `x/(1/sqrt(12))` for born P1. Forward limiter replay followed by float32 conversion exactly reproduces all 960,000 channel samples in each WAV (zero differing samples). The corrected pooled displacement RMS gap is +8.801 dB, versus the original raw-worklet gap of +34.594 dB.

The exact readout/limiter term is +25.793 dB: +28.854 dB from the internal scale ratio and −3.060 dB from the substrate’s stronger soft-limiter compression. Generic 44-group `sum(deltaV²)` is 0.02385899 at J=1 and 0.02390989 in expectation for the unrecorded worklet jitter; the deterministic J range bounds the total to 0.02019425–0.02782913. Born P1’s 63 sequentially reconstructed per-foot requested/compliant sums are 0.01945916 / 0.01847145 and match the saved worklet telemetry. Expected excitation contribution is +1.121 dB (bounded +0.387…+1.780 dB); residual transfer is +7.680 dB expected (bounded +7.021…+8.413 dB).

The JSON retains per-parent and per-foot values. This is a solver-space decomposition, not calibrated energy or a pure resonator constant: the residual includes different event timing/spatial distributions, group-centroid vs per-foot excitation and 48 kHz vs 6 kHz solver discretization. The original generic random draws are absent from the saved PCM, so exact realized substrate per-group energies cannot be recovered. Production code and saved PCM remain unchanged. See [readout/excitation report](../evidence/2026-10-07-base-substrate-debug/audio/event-count-matched-substrate/readout-excitation-decomposition.json); reproduce with `node scripts/ant-readout-excitation-decomposition.js`.
