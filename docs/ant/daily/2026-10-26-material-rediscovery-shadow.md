# Material rediscovery shadow — 2026-10-26

## Question

With recognizable ants and production pheromone rendering held fixed, can restrained material contrast make a retained place easier to find after its birth event has passed? A second candidate adds sparse, world-fixed texture to test whether that contributes beyond surface contrast.

## Method

Started from fresh `origin/main` `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292` on `codex/ant-material-rediscovery-shadow-20261026`. Registered A/B/C mappings in the evidence plan before viewing candidate output. One seed-`20261005` production-default controller run supplied the same detached snapshots to all candidates. Captured 640×640 output at 10 fps through the first natural Plate and exactly 30 model seconds after it. No audio bridge or DSP was instantiated.

## Observations and validation

The first Plate occurred at `84.0166667 s`; capture ended at `114.0166667 s`. The 1,142-frame A/B/C streams share frame count and source-state hashes. Renderer fingerprints remained equal after each candidate draw. Endpoint material count was 677 cells; C's fixed pattern selected 46. A/B/C technical pixel differences stayed within the expected material and two-cell image-resampling support. Full tests passed (340/340), the 43-test renderer/controller/stratigraphy focus passed, and production build passed with dependency-annotation and bundle-size warnings.

## Decision

Candidate manipulation is valid, production preservation passes, and the synchronized native-size videos/stills are usable for review. Artistic success is **inconclusive / awaiting artist review**. The early two-Plate window does not establish mature-terrain behavior. Production remains unchanged.

See the [evidence report](../evidence/2026-10-26-material-rediscovery-shadow/README.md) and [synchronized review page](../evidence/2026-10-26-material-rediscovery-shadow/review.html).
