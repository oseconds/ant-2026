# 2026-10-07 — Frozen base substrate / born P1 Candidate C

## Question

Does ratio `.010` give the same frozen Candidate B setup a quieter base relative to first-born P1? Only the substrate output ratio changed from `.025`; Plate readout, Sphere mix, simulation, event schedule, analysis windows and output chain stayed fixed.

## Frozen comparison

- Seed `20261005`, P1 `trail-plate-1` born at `103.01666666667376 s`.
- Same frozen input SHA-256 `25bf05aab8bbbb142be11b79f37a5988898d6069e24cae31bf721348b0bf7ff3`, descriptor SHA-256 `fd079682ed0663f9bffdae36b1102958ef219f7d0bb6b35fcf2b1d09bc647b16`.
- Same 63 accepted P1 strike frames/hash `d3a0468479ec1dc79751b9cbcd5b4fda83712d36e41d293d518cefde429a4933` and 44 matched parent contact groups/hash `337dd257f15a19acf6869ce7870ed6be85bf69cb3e670f43f642d2bc07f69d35`.
- Candidate C: Plate pickup ×1; Sphere `1/sqrt(12)`; substrate ratio `.010`. Retained 3 ms / 75 ms / ×50 Plate baseline, substrate internal ×8, damping 1, limiter, master `0.35`, routing, pickups and material/simulation behavior.

## Result

Pre-birth C substrate was nonzero: peak `0.00195328`, pooled RMS `0.000983047` (`−60.15 dBFS`). First-birth 10 s born-only P1 RMS was `0.00263843`; matched 44-group substrate was `0.000418460`; all-event substrate was `0.00102125`, **8.24 dB below** P1. Summed stem RMS was `0.00285680` and peak `0.0225637`. No clipping or non-finite samples.

At the P1 strike frames, median pooled RMS for 100/250/500 ms was:

| Window | Born P1 | Matched substrate | All-event substrate | C sum |
| ---: | ---: | ---: | ---: | ---: |
| 100 ms | 0.00332027 | 0.000578873 | 0.000987405 | 0.00358197 |
| 250 ms | 0.00313770 | 0.000536695 | 0.000970984 | 0.00329433 |
| 500 ms | 0.00313196 | 0.000509744 | 0.00100108 | 0.00326066 |

All-event substrate is 9.90–10.53 dB below P1 in these event-aligned windows. Browser Play checks started the same four A/Off and C/On pre/post-birth files; fixed-scale plots, clock mapping and markers are unchanged. Browser playback start is confirmed, but no calibrated subjective loudness judgment is claimed.

## Decision

The measured relative level gate clears: all-event substrate is 8.24 dB below born P1 over the 10 s window and about 10 dB below at P1 events. The summed stem is only `+0.69 dB` over born-only P1. This is the reported margin for the user's decision on an intermediate ratio; no intermediate was tested. Keep default Off. Do not commit, merge or push while awaiting that decision.

Evidence: [Candidate C PCM, fixed-scale plots and browser check](../evidence/2026-10-07-base-substrate-debug/audio/calibration-0.010/README.md).
