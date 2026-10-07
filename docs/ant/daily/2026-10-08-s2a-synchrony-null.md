# 2026-10-08 — S2a trajectory synchrony null

## Question and starting point

How much of the observed temporal encounter topology depends on the original cross-ant temporal alignment of otherwise recorded individual movement trajectories?

The clean checkout initially belonged to `ant-base-substrate-debug`. Fetched `origin/main` and created `ant-s2a-synchrony-null` from `66c61e105b55a6360deb2db34795fe69b326f884`. The substrate-timbre follow-up was explicitly excluded. The founder-refined behavior, observer classes and committed S0/S1 sources remained unchanged.

## Method and process

1. Audited the three committed 600 s lossless trajectory archives and observer semantics. The binary data contains 36,001 frames at 60 Hz, t=0 included, and complete `(x,y,vx,vy,heading,radius)` tuples. Current graph/topology source hashes match the archived manifest.
2. Added one deterministic family: independently circularly rotate each stable ID's complete tuple sequence inside its original active interval. Leave timestamps, active masks, birth/death sample windows and cadence fixed. Use dedicated hash-derived nonzero offsets, 32 replicates per seed, without behavior RNG or a natural simulation rerun.
3. Added the synthetic rotation/inverse fixture before the generator. Reused the existing binary codec via a direct-entry guard/exports in the capture harness; reused `DynamicSocialGraph`/`TemporalSocialTopology` directly. Retained `k=2`, S0 60 Hz, S1 20 Hz, windows 0.25/1/5/20 s and existing finish/censor semantics.
4. Observed replay matched committed S0 events/encounters, S1 events/lifetimes and every saved 1 Hz topology snapshot. All 96 replicates passed byte-exact rotation/inverse, fixed counts/ID masks/lifetimes, finite values and valid radii checks. Repeated offset/binary generation for every replicate, plus repeated full analysis for replicate 0 of each seed. Independently regenerated all 96 virtual trajectory hashes afterward.
5. A source audit used Luna/Medium; scientific method and adversarial code reviews used Luna/High; plotting used Luna/Medium. Review identified circular seams, moved entry positions and unchanged seam influence in rolling topology as necessary interpretation limits. No topology filtering or second null was added.
6. Fixed the plotting script's histogram schema lookup before publication, rendered standard fixed-scale PNGs, checked finite arrays/cadence/histogram normalization and inspected the figures. Matplotlib ran in a temporary uv environment; no project dependency was added.
7. Full tests passed 270/270; production build passed. Tooling was committed separately as `4b01f2207245f54fc668e5f940bb378a6d7cd74f`. Generated evidence and this chronology form the following separate commit; the branch is to be pushed without merging or opening a PR.

## Result

At the primary 1 s window, mean edges were observed `1.1346 / 1.0703 / 1.2396` versus null means `2.8257 / 2.6887 / 3.0164` for seeds 05/06/07. All observed values were below all 32 null values within their seed. Mean largest-component ratio and weighted degree were also lower, while mean component count was higher. This is descriptive separation under this family, not a p-value or emergence threshold.

The 0.25 s connector counts were `3 / 3 / 5` versus null means `5.875 / 6.0625 / 7.9688`; their empirical midranks were `15.625 / 12.5 / 14.0625` percent and they overlap null variation. The original 11 connectors remained short (0.30–0.65 s), at confirmation within 0.019 of recruitment origin, at about 0.267–0.300 s of age. Original 1 s connector persistence remained zero; the null ensemble contained only three such 1 s events total.

Window sensitivity mattered. At 20 s, mean edge-count separation weakened and mean component-count direction reversed. At 5 s, original split counts were higher than all null values, opposite to 1 s. The 5/20 s cases represent accumulated history/turnover sensitivity, not biological timescales.

## Limitations and decision

The null preserves individual recorded sample occupancy and fixed active population but moves birth-phase trajectory segments away from the recruitment origin. Mean distance to origin at the first sample rose from about 0.013 to 0.338–0.344. Every rotated life adds one discontinuous end-to-start seam, with mean position jump about 0.685–0.690 arena units; simultaneous spatial density and collision exclusion are not preserved.

Mean seam-flagged raw episode shares were 57.23% / 54.42% / 56.10%. Excluding episodes overlapping a seam ±one sample reduced null raw-count means from 1227.03 / 1162.31 / 1274.09 to 524.88 / 529.91 / 559.44, compared with original 511 / 483 / 518. Exposure and completed duration still differed. This is a descriptive subset of the same null, not corrected topology or a second comparator: all rolling graph/topology metrics retain seam effects, potentially across their full memory window and later event histories.

**Decision:** S2a is complete as a first synchrony comparator. It demonstrates alignment sensitivity and exposes that raw encounter count alone is not robust enough for a social claim. It does not separate recruitment-origin, birth-phase, density, collision or seam effects. A stronger spatial/movement-constrained comparator needs a separately authorized design/pass before any spectral gate can be considered. No family was selected or executed automatically.

Research interpretation stays separate from artistic interpretation. No social-role narrative, graph→material mapping, adaptive memory, behavior feedback, spectral analysis, audio/runtime work or substrate-timbre work was introduced. Stop after S2a verification, separate commits and branch push.

## Evidence

[Method, complete seed-level comparisons, hashes, validation and fixed-scale plots](../evidence/2026-10-08-s2a-null/README.md).
