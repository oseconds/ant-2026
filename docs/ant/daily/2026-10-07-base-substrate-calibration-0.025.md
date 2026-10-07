# 2026-10-07 — Frozen base substrate / born P1 calibration A/B

## Question

Can a small substrate output ratio (`0.025`) keep the optional base perceptible while making the first born Plate read as a new layer? Candidate B separates the Plate pickup from Sphere modal normalization: Plate ×1, Sphere `1/sqrt(12)`, then the existing limiter. This was one predeclared production-level A/B only.

## Frozen comparison

- Same seed `20261005`, input SHA-256 `25bf05aab8bbbb142be11b79f37a5988898d6069e24cae31bf721348b0bf7ff3`, P1 birth `103.01666666667376 s`, and descriptor SHA-256 `fd079682ed0663f9bffdae36b1102958ef219f7d0bb6b35fcf2b1d09bc647b16`.
- Same 63 accepted P1 strike schedule, SHA-256 `d3a0468479ec1dc79751b9cbcd5b4fda83712d36e41d293d518cefde429a4933`.
- Matched substrate uses 44 unique parent FOOT_CONTACT groups, SHA-256 `337dd257f15a19acf6869ce7870ed6be85bf69cb3e670f43f642d2bc07f69d35`; group events were not duplicated into 63.
- Unchanged: legacy substrate internal ×8 readout, damping 1, master volume 0.35, soft limiter, 3 ms pulse / 75 ms recovery / ×50 Plate damping, routing, strength, topology, birth/material rules, and simulation.

## Results

At 48 kHz, 10 s per stem, B pre-birth base Off remained exact zero. B base On `.025` was nonzero: peak `0.00488321`, pooled RMS `0.00245762` (`−52.19 dBFS`). B's frozen born-only P1 was peak `0.0211123`, RMS `0.00263843`; matched 44-group substrate was RMS `0.00104615` (−8.04 dB against P1), while all-event substrate was `0.00255313` (only −0.29 dB against P1). The B sum was `0.00372456` pooled RMS. Every measured stem had zero clipping and non-finite samples.

P1-strike-aligned median pooled RMS for 100/250/500 ms:

| Window | A born | A sum `.22` | B born | B matched substrate | B all-event substrate | B sum `.025` |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 ms | 0.0009745 | 0.0217593 | 0.0033203 | 0.0014472 | 0.0024685 | 0.0043207 |
| 250 ms | 0.0009206 | 0.0213955 | 0.0031377 | 0.0013417 | 0.0024275 | 0.0041036 |
| 500 ms | 0.0009185 | 0.0221039 | 0.0031320 | 0.0012744 | 0.0025027 | 0.0039501 |

The browser listening page loaded all PCM files and started the 0.7 s Play check for pre-birth Off/On and first-birth Off/On. The pre-birth A file is exact silence; browser playback path for B is nonzero. This is a playback-path check, not a subjective listening verdict.

## Decision

The candidate reduces the old masking-level imbalance, but natural all-event substrate remains essentially level with born-only P1 over the first 10 s. Therefore the acceptance goal—quiet substrate with an obvious new born Plate layer—**fails**. Stop without tuning further. Keep the base default Off and do not merge to main.

Evidence and fixed-scale plots: [calibration-0.025](../evidence/2026-10-07-base-substrate-debug/audio/calibration-0.025/README.md). The runner, tests, build and development/production browser checks are documented there.
