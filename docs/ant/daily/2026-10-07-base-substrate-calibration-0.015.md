# Base substrate / born P1 Candidate D — 2026-10-07

## Question

Candidate C at `.010` was clearly perceptible but still too quiet in the owner's prior listening. Measure one intermediate candidate at `.015` against frozen B `.025` and C `.010`, then stop for subjective A/B/C review. No numeric acceptance threshold was added.

## Frozen baseline and change

- Seed `20261005`, first P1 birth `103.01666666667376 s`, unchanged descriptor, exact same 63 accepted P1 strikes and 44 unique matched parent contact groups.
- Only `ANT_BASE_SUBSTRATE_OUTPUT_RATIO` changes from C `.010` to D `.015`. Candidate output is derived from the same frozen `.22` substrate PCM; born-only Plate PCM and all input/schedule hashes remain identical.
- Plate pickup ×1, Sphere `1/sqrt(12)`, 3 ms pulse, 75 ms recovery, ×50 Plate damping, substrate internal ×8 readout and damping 1, limiter, master volume, routing, pickups and simulation/material behavior stay fixed. Base remains Off by default.

## Measurement

Over the first 10 s after birth, D all-event substrate pooled RMS is `.001531876` with peak `.00301776`; born-only P1 is `.002638429` with peak `.02111228`. D all-event substrate sits **4.72 dB below** born P1, `+3.52 dB` relative to C and `−4.44 dB` relative to B. The matched 44-group D stem is `.000627690` RMS / `.00215243` peak, **12.47 dB below** born P1. The summed stem is `.003089257` RMS / `.02331664` peak.

| Window | Born-only P1 median RMS | D matched 44-group | D all-event substrate | D sum |
| ---: | ---: | ---: | ---: | ---: |
| 100 ms | `.00332027` | `.000868309` | `.00148111` | `.00371984` |
| 250 ms | `.00313770` | `.000805043` | `.00145648` | `.00348825` |
| 500 ms | `.00313196` | `.000764617` | `.00150162` | `.00343376` |

Pre-birth D is nonzero (peak `.00292993`, pooled RMS `.00147457`); Base Off is exact silence. All D stems have zero clipping and non-finite samples. B/C/D full per-channel metrics, hashes, event-window medians and fixed-scale plots are in [Candidate D evidence](../evidence/2026-10-07-base-substrate-debug/audio/calibration-0.015/README.md).

## Playback and checks

The comparison page contains pre-birth Base Off and B/C/D, plus first-birth Base Off and B/C/D sums at native PCM level. Chrome loaded all 10 tracks and started all 8 Off/candidate pre/post playback checks. This verifies browser decode/playback; it does not record a new human listening judgment. The D comparison page remains open in the in-app browser.

Focused ANT environment/worklet tests passed 26/26, full `npm test` passed 267/267, build passed with existing Rollup annotation/chunk warnings, and Vite development plus production browser checks passed.

## Decision

Record D as an intermediate calibration result and stop. Keep the Base Substrate default Off, preserve all B/C evidence, and do not tune, commit, merge or push in this pass. The comparison page is ready for the requested subjective calibration review.
