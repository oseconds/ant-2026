# 2026-10-07 — Born-Plate pickup readout A/B

## Question

Test whether the global `1 / sqrt(12)` mix in `surface-plate.worklet.js` was unnecessarily attenuating the frozen Plate pickup contribution. Keep the existing A implementation reproducible. Do not change the 3 ms pulse, 75 ms recovery, ×50 Plate damping, strike strength/routing, Plate birth/material rules, pickups, substrate settings, simulation, soft limiter or master gain.

## Frozen comparison

- Seed/input: 20261005; regenerated compressed input SHA-256 matched the saved capture byte-for-byte.
- P1 `trail-plate-1` birth: 103.01666666667376 s; frozen descriptor hash matched.
- Both processors received the same one-Plate topology and all 63 accepted P1 strikes; exact schedule SHA-256 `d3a0468479ec1dc79751b9cbcd5b4fda83712d36e41d293d518cefde429a4933`.
- A used baseline commit `c89a85bf70842da597fef97396810de263b2262c`; simultaneous recapture PCM matched the previous A PCM exactly. The substrate stem was read-only and retained its original SHA-256.
- Chrome 154 OfflineAudioContext, 48 kHz, 480,000 samples/channel; P1 birth maps to audio sample 0.
- Substrate remains Off by default, output ratio `0.22`, damping `1`.

## Result

A was `(Plate pickup + Sphere modes) * 1/sqrt(12)`. B was `Plate pickup * 1 + Sphere modes * 1/sqrt(12)`, followed by the unchanged limiter. Pooled RMS rose from `0.000779757` to `0.00263843` (+10.59 dB). B peak was `0.0211123` L / `0.0146344` R; substrate peak was `0.0437324` L / `0.0442604` R. B remains 18.60 dB below the unchanged substrate stem by pooled RMS.

Median event-aligned RMS rose +10.65 dB for each requested duration. Complete windows covered 62/63 strikes at 100 ms, 62/63 at 250 ms and 61/63 at 500 ms; incomplete end-of-render windows were omitted rather than truncated. A/B solver-state diagnostics matched. Both PCM stems had zero clipped or non-finite samples, and B pre-limiter max absolute output was `0.09430` with zero over-threshold samples.

## Decision

B adds the expected readout level, but this measurement does not establish restored audibility: B remains substantially below the substrate stem. Stop without further gain or physics tuning. Keep production mixer at A; the evidence runner reconstructs B from the baseline worklet and pins its source hash. Pickup-distance/readout topology is the next hypothesis. Do not merge or push this evidence pass.

Evidence, WAVs, fixed-scale waveform/spectrograms, and the replay script are in [mix-audibility](../evidence/2026-10-07-base-substrate-debug/audio/mix-audibility/README.md). Relevant worklet/audio tests passed 94/94; production build passed with existing Rollup annotation and chunk-size warnings.
