# Born Plate pickup-distance diagnosis — 2026-10-07

Diagnosed readout topology only. Reconstructed the frozen `20261005` P1 descriptor (`trail-plate-1`, birth `103.01666666667376 s`) and confirmed the 63 accepted strikes, frozen event-stream hash, descriptor hash and strike-schedule hash. Natural windows were measured from the already captured, unchanged production-A P1-only PCM.

The three event-aligned nearest-pickup-distance ↔ pooled-RMS Spearman correlations were −0.449 / −0.399 / −0.341 for 100 / 250 / 500 ms. Matching-channel correlations were also negative (pickup L to L RMS: −0.510 / −0.436 / −0.478; pickup R to R RMS: −0.386 / −0.329 / −0.280). Natural windows overlap later accepted strikes, so these are runtime associations rather than isolated impulse responses.

Six single-strike Chrome OfflineAudioContext controls used one identical accepted P1 strike strength and footprint at compiled pickup L, pickup R, their midpoint, source, target and a far graph branch vertex. Every location routed to P1; every worklet accepted exactly one strike with no dropped route, non-finite sample or full-scale clipping. Midpoint RMS was about 12.9–13.0 dB below the mean of direct-pickup RMS across 100 / 250 / 500 ms. Source was about 6.9–7.0 dB below pickup L; target was about 1.3–1.9 dB below pickup R. The far branch vertex, six solver cells from pickup R, was about 1.0–1.5 dB louder than pickup R, so distance alone does not explain readout strength.

Decision: record a clear pickup-locality effect plus a branch-position counterexample. Do not tune or test a candidate topology in this pass. Production worklet, material/birth rules, strike routing and force, damping, substrate settings and simulation remain unchanged. No merge or push.

Evidence: [pickup-distance-readout](../evidence/2026-10-07-base-substrate-debug/audio/pickup-distance-readout/README.md); runner: `scripts/ant-born-plate-pickup-distance.js`. Existing ANT fixed-scale renderer tests passed 17/17 after running outside the process-spawn sandbox restriction. The report includes exact simulation↔audio mapping, per-strike distance/RMS/peak records, controlled PCM, and renderer image hashes.

## Follow-up — full frozen P1 solver observability map

Measured one identical frozen strike at all 48 compiled P1 solver nodes. Each node accepted one strike; all PCM was finite and unclipped. Same-channel distance correlations were strong (Spearman `−0.906` for L and `−0.734…−0.743` for R across 100–500 ms), while nearest-pickup distance against pooled RMS was moderate (`−0.404…−0.462`).

Distance alone did not explain the map: nodes 30 and 4 share nearest distance `2.828` and degree 2 but differ by `11.21 dB` pooled RMS at 100 ms. Nodes 8 and 27 are both degree 2 and about 6.3 cells from a pickup, yet differ by `17.31 dB`. These are relative low-output regions, not proven exact modal nulls. The pattern meets the next-test condition for a small finite-area aperture around each existing pickup; no candidate was tested.

Evidence: [full P1 node map](../evidence/2026-10-07-base-substrate-debug/audio/p1-node-observability/README.md); runner: `scripts/ant-p1-node-observability.js`. All 48 stored PCM WAVs and three PNG maps matched byte-for-byte on repeat. Production files remained unchanged.
