# Local opportunity landscape and temporal evidence audit

**Authority:** `origin/main@bc045dc3caa5954df633ecbee37fbabcb8224f30`.
**Branch:** `codex/ant-local-opportunity-competition-audit-20261031`.

The author explicitly reopened formation selection after reviewing the current-production X shadow. Its previous `X OVERCONCENTRATED / REPETITIVE` result is now read narrowly as **global max-D allocation into X was overconcentrated/repetitive**. It does not reject local X capture. The old evidence remains unchanged. This branch investigates where and when opportunities appear, without implementing allocation, competition, nucleation, Residence, or production X.

## Locked scope and file responsibilities

- `scripts/ant-local-opportunity-capture.js`: fresh observed/plain controllers, actual production analysis boundaries, B/C/D, actual contact and realized-movement rolling windows, prior material, births, source and parity receipts.
- `scripts/ant-local-opportunity-core.js` and `scripts/ant-local-opportunity-analyze.js`: plateau maxima, component-preserving grouping, descriptive correspondence tracks, fixed X captures, topology/material/overlap receipts.
- `scripts/ant-local-opportunity-synthesis.js`: cross-channel correspondence, accumulated/recent joint histories, temporal associations, birth contexts, objective case selection, aggregate arithmetic.
- `scripts/ant-local-opportunity-render.js`: fixed-framing technical signal and X atlases and objective time series.
- Focused tests cover observers, window endpoints, topology, correspondence, lag selection and aggregate arithmetic. Evidence, reproduction, hashes and limitations stay in this package. Chronology and the reopened decision are recorded only on this branch in the hub/daily records.

No changes to `src/` or `static/`, dependencies, production state, production Plate births or controller configuration. No new worktree. Existing unrelated worktrees and the closure branch are preserved.

## Registered methods before fresh runs

Three seeds: `20261005`, `20261006`, `20261007`; each fresh current-production controller, 60 Hz, 600 model seconds, Audio Off. A second fresh plain controller uses the same seeded random stream. Compare trajectories and RNG every tick, environment/formation state and production analysis boundaries. Any observer parity mismatch stops the campaign; do not tune around it.

All sampling uses real `TrailPlateBirth` analyses, expected about 599 per seed. Capture after the native chemical update and native supported-mask construction, before current births enter material stratigraphy. E and sampled D come directly from production. F uses source-extracted exact production Zhang-Suen thinning. S contains exactly those F cells with at least one in-bounds, non-wrapping 8-neighbor F cell. All F components use that same 8-neighbor convention. The three accumulated channels are B (chemical memory), C (current compaction on the common 96 by 96 grid), and D (the current production support array, including its native chemical qualification behavior).

Rolling event/movement windows use `(t-w,t]`, w = 1, 5, 20 model seconds. Actual emitted individual foot positions supply counts, groups, ants and latest-contact age. **Individual foot count** is the maxima/tracking channel; group count, contributing ants and latest-ever contact age are context. Realized post-collision movement supplies travel, contributing ants, occupancy time and segment counts using a declared conservative cell rasterization. **Realized travel distance** is the maxima/tracking channel; ants, occupancy and segments are context. A segment is assigned its actual tick-end timestamp; its within-world length and occupancy are split at nearest-grid Voronoi cell boundaries. A window includes a whole segment if its end is in the window; no continuous fractional trim at the temporal left edge. Startup windows are partial from model start. Signed changes use the nearest exact older analysis to `t-w`, with the older timestamp winning equal-distance ties. Incomplete lag history is absent, not zero; actual elapsed times are retained. No interpolation. B/C/D, signed changes and recent activity retain their own units.

For each of 18 channels (B/C/D, feet and travel at three windows, and positive changes of B/C/D at three lags), enumerate every positive 8-neighbor local maximum plateau restricted to S. Exact-equal connected values form one plateau, canonical coordinate the lowest row-major index. No prominence threshold. Preserve zeros as context and all positive maxima.

Reuse the early audit's `.15` and `.30` strongest-first greedy grouping: descending within-channel value, ascending canonical index for ties, assign to the first existing representative within the radius only in the same current F component. This is nontransitive and order-dependent sensitivity analysis, not a material-object definition. Keep memberships and original maxima.

Track raw and both grouped representations by reciprocal nearest centers across adjacent actual analyses, maximum displacement `.025` primary and `.075` sensitivity. Ties choose lower canonical index. A temporal component relation requires shared F cells between the old and new components; changing ordinal component labels does not establish or destroy identity. Retain all unmatched/singleton tracks. These are observer correspondences, not physical event IDs. Report splits/merges and censoring limits where relevant.

Every candidate center has locked X: the 8-neighbor component containing its center in `F intersect EuclideanDisk(center,.15)`. No other radius, capture law, retention or UPDATE. Validate every computed capture, deduplicate exact sets, and retain continuous pairwise intersections/Jaccards/nesting and component relations. No threshold turns overlaps into a competition rule.

Material counts, top layer, prior union and latest local birth are diagnostics only. Euclidean distance `.15` from production entry `(0.5, 0.72)` is a diagnostic partition only (`<= .15` inside, `> .15` outside). Neither affects maxima, grouping, correspondence, rank or capture. Per-X summaries use union overlap and layer distributions; raw top-layer/recency maps remain available, with center recency included in objective cases.

## Registered comparisons and objective cases

Within-channel ranks/ratios, spatial correspondence, track persistence, X geometry, cross-channel rank correspondence and lead/lag remain separate measurements. No weighted sum, normalization-and-sum, learned score, threshold/quorum, stochastic selection, inhibition, refractory, novelty preference or winner persistence.

Cross-channel center correspondence uses current component-preserving reciprocal nearest centers at the same two distances. Report winner separation/X overlap and Spearman rank correlation of separate channel values at the union of their `.15` grouped centers in each analysis (average ranks for exact ties). Signed delta values are retained when sampling the union, even where the other channel supplied the center. Foot/travel redundancy also uses paired S-domain values, separately for matching 1/5/20 s windows. Record Pearson and Spearman, with pair counts. Constant series or fewer than three finite pairs yield no correlation. Summaries do not treat autocorrelated rows as independent trials; no significance or causal claim is made.

Time-series examples are selected before visual review, across all seeds from `.15` grouping and `.025` correspondence:

1. Longest contiguous outside-entry episode of a D track.
2. Longest contiguous inside-entry episode of a D track.
3. Non-entry positive-change D 5 s track episode with the largest time integral of its own positive change.
4. The equivalent positive-change B 5 s episode.

For the last two, require only multiple analyses, the minimum needed to observe persistence. Integrate by trapezoids at exact actual timestamps. Ties choose longer duration, then seed, then deterministic track ID. These criteria select examples, not opportunity eligibility or a law. Categories with no example report none. All other tracks, including singletons, remain in receipts.

Case correlations use declared analysis strides (-20, -10, -5, -1, 0, 1, 5, 10, 20), reporting actual elapsed times and pair counts. Positive stride means the second channel is later. Pair channels are feet5/ΔC5, feet5/ΔD5, ΔD5/D, travel5/ΔB5, ΔB5/B and feet5/travel5. Each example is analyzed separately at its moving center, without pooling tracks or seeds. Record Pearson and Spearman with average ranks for ties, and autocorrelation of feet5, travel5, ΔD5, ΔB5, D and B at strides 1/5/10/20. The 5 s window is a registered middle-scale illustration; all 1/5/20 s fields, maxima and tracks remain in the census. Moving-center sampling, overlapping windows and autocorrelation are explicit confounds. No predictive model is fitted.

Birth contexts use exact analysis offsets -20/-10/0/+10/+20 seconds only where such anchors exist; unavailable offsets remain absent. Actual born Plates are temporal references, not opportunity truth or success targets.

Fixed visual requests are 60/120/300/600 s for each seed, displaying the latest real production analysis at or before that time and labeling its actual timestamp. Full world frame and per-channel fixed scales are shared across panels/seeds; distinct physical/authored units are not visually equated. Displayed top-three within-channel grouped X examples are illustrative, with all candidates retained in machine receipts.

## Execution and acceptance

- [ ] Capture/core self-checks and independent definition review.
- [ ] Three fresh 600 s runs; parity gate before interpretation.
- [ ] Every-boundary analysis and signed histories; validity of every computed X.
- [ ] Cross-channel/temporal/material/birth summaries and registered cases.
- [ ] Technical atlases and reopened-image inspection.
- [ ] Full deterministic rerun hashes; verify package manifest.
- [ ] Fresh independent review of definitions, arithmetic and claims; resolve findings without changing production.
- [ ] Report one authorized descriptive regime and the smallest justified next question.
- [ ] Exact-path commits and push; verify remote branch SHA. No PR, main merge or production adoption.

The final classification remains undecided until evidence is collected: `MULTI-OPPORTUNITY / COMPETITION PLAUSIBLE`, `DOMINANT ATTRACTOR ACROSS CHANNELS`, `TRANSIENT / UNDERDETERMINED`, or `SIGNAL-DEPENDENT / MIXED`.
