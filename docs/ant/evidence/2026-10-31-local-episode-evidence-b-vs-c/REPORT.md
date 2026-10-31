# Results — local episode evidence B vs C

## Classification and answer

**RESPONSIBILITIES DISTINCT / BOTH PLAUSIBLE.** The saved current-world histories do not support collapsing B and C into one responsibility, but they also do not establish a data-driven winner.

B (qualified chemical history) sustains many non-entry tracks whose strongest opportunity is often close in strength to the overall strongest. Its tracked rank identity is more persistent over 5–20 seconds than C. C (contact-written compaction) also supports long non-entry histories, but those opportunities are weaker relative to the channel’s overall strongest and their level/change is more tightly associated with recent contact. When centers are locally paired, both channels usually map to the same or a highly overlapping X capture. Their strongest opportunities, however, often differ in center and X, and their winner-rank correspondence is low.

This is a responsibility result, not a competition result. It does not say which signal should select material, whether either should be used alone, or whether either is an artistically preferable trace.

## Implementation facts and provenance

The exact frozen packet branch/commit is `codex/ant-local-opportunity-competition-audit-20261031@da599d9f385f53d0bb24df3e737c5ed2e2eb6a23`. Its natural observations use production authority `main@bc045dc3caa5954df633ecbee37fbabcb8224f30`. Each of seeds `20261005`, `20261006`, and `20261007` contributes 599 saved analysis boundaries. The source manifest and arrays were validated before adding this downstream package. No world was rerun.

Production B remains `TrailPlateBirth.chemicalMemory`: the native bounded field updated from `p/(p+.04)` with a 20 s EMA. Production C remains `SurfaceField.sample()`: normalized compaction written by `FOOT_CONTACT` with native 1800 s half-life. Neither is a physical nucleation-energy, force, stress, or density measure. The locked opportunity grouping, F-component safeguards, `.025` primary correspondence, and X capture at radius `.15` were reused. There is no production change.

## Persistent competitors and winner hierarchy

All results below are per-seed descriptive summaries. Track samples within a run are serially dependent; the three seeds are the replication units. Median candidate counts include the existing empty early boundaries. Longest durations use actual saved times.

| Channel | Median `.15` groups, 05 / 06 / 07 | Tracks, 05 / 06 / 07 | Median non-entry track duration, s | Longest wholly non-entry, s | Longest wholly entry, s | Median strongest non-entry / overall | Winner-track changes | Strict matched-track rank crossings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B | 51 / 51 / 52 | 2,575 / 2,434 / 2,569 | 5.08 / 5.00 / 5.00 | 108 / 171 / 125 | 155.23 / 186 / 342 | .907 / .891 / .899 | 15 / 23 / 4 | 9,470 / 10,304 / 10,405 |
| C | 52 / 53 / 53 | 3,210 / 3,498 / 3,317 | 4 / 3 / 4 | 129 / 184 / 93.33 | 50 / 81 / 44 | .572 / .513 / .562 | 62 / 62 / 76 | 4,877 / 5,240 / 4,640 |

Each channel occupied all 64 cells of the same coarse 8×8 spatial partition across the three runs. Roughly 95–97% of candidate-center observations were outside entry-centered radius `.15`. Both therefore contain sustained non-entry histories rather than only entrance observations. Track centers were often stationary on the grid: median net drift was zero, and the seedwise 90th percentile was about `.0105–.0149` world units for both channels. Longer track-specific center paths remain in the receipts; there is no fixed-center assumption.

The channel winners stayed entrance-local almost all the time: C’s winner was entry-classified at every available boundary; B’s was also entry-classified at all but a small fraction in seed 20261006. B’s outside/overall median ratio near .9 indicates substantially stronger non-entry alternatives than C’s roughly .51–.57. B winner-track changes are fewer, while its larger strict crossing counts show that sub-winner rankings still reorder. C’s winner identity changes more often. These counts are not independent-event rates.

## Temporal inertia and recent input

The table gives medians of per-track Spearman autocorrelation over raw primary tracks. Rank persistence declines for both channels with elapsed lag; B retains relative ordering longer at 5 and 20 seconds. State-level correlations are separate from rank correlations and are not cross-channel effect sizes.

| Channel | Rank ACF, 1 analysis, 05 / 06 / 07 | Rank ACF, 5 s | Rank ACF, 20 s | Median absolute rank shift at 5 s | Median absolute rank shift at 20 s | State ACF, 5 s | State ACF, 20 s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B | .811 / .841 / .831 | .610 / .648 / .631 | .162 / .081 / .065 | 2 / 2 / 2 | 2.5 / 3 / 2.5 | .853 / .872 / .849 | .317 / .105 / .145 |
| C | .607 / .605 / .580 | .101 / .213 / .129 | .039 / −.037 / −.076 | 1 / 1 / 1 | 1.5 / 1 / 1.5 | .655 / .655 / .657 | .267 / .265 / .353 |

The recent-input relation differs in the expected channel-specific way:

| Per-track median Spearman | 20261005 | 20261006 | 20261007 |
| --- | ---: | ---: | ---: |
| B level vs center travel 5 s | −.289 | −.276 | −.289 |
| B signed Δ20 vs center travel 20 s | .578 | .572 | .578 |
| C level vs center feet 5 s | .671 | .655 | .655 |
| C signed Δ5 vs center feet 5 s | .831 | .845 | .840 |
| C signed Δ20 vs center feet 20 s | .815 | .819 | .822 |

On changing X regions, recent input was exactly zero for 63.0% / 66.5% / 64.6% of B track observations (travel5), and 61.3% / 63.8% / 62.1% of C observations (individual feet5). The median channel rank during these zero-input observations was 33–34 for both. Maximum consecutive zero-input spans ranged from 61–81 s for B and 67–81 s for C. Thus each accumulated field can remain present through periods with no recent local input; B’s longer rank persistence and C’s strong contact/change association remain different temporal responsibilities.

Absolute state changes must stay in native units: B median absolute state change at 5 s was about `.017–.018`; C was about `.00028–.00030`. Those values are not comparable magnitudes. C’s small per-step movement is consistent with its slow native field; its rank ordering nevertheless changes faster than B’s.

## Associated X and B↔C correspondence

Every associated X passed the registered connectedness/radius checks. Median capture sizes were small, with broad upper tails; the median adjacent Jaccard was 1 for both channels and all seeds, with 10th percentiles about `.86–.87`.

| Channel | Median X nodes, 05 / 06 / 07 | X node-count p90, 05 / 06 / 07 | Median adjacent X Jaccard | Median prior-material overlap | Median local mean layers | Median age of latest local birth when available |
| --- | --- | --- | --- | --- | --- | --- |
| B | 6 / 4 / 5 | 182 / 162 / 163 | 1 / 1 / 1 | .857 / .500 / .639 | 2.33 / .71 / 1.00 | 19 / 24.4 / 17 s |
| C | 6 / 5 / 5 | 180 / 166 / 168 | 1 / 1 / 1 | .857 / .545 / .667 | 2.33 / .84 / 1.02 | 18 / 24 / 17 s |

Material overlap is descriptive only and does not favor either channel. B’s X was exactly disjoint from simultaneous max-D winner X in 84.9% / 85.3% / 85.8% of observations; C’s corresponding values were 85.1% / 85.4% / 85.8%. Neither channel is being selected or penalized by prior material.

At locally corresponding centers, X packets were commonly identical: nearest opposite-channel center had median X Jaccard 1 in all seed/channel combinations, exact-same fractions `.584–.632`, and exact-disjoint nearest pairs only `.009–.017`. Reciprocal `.025` matches yielded median pairwise X Jaccard 1 and a median per-boundary exact-same fraction of `.889–.900`; at `.075`, median Jaccard remained 1 while exact-same fractions fell to `.689–.714`. The all-candidate-pair median Jaccard was 0 and median disjoint fraction `.955–.959`, but that denominator contains the many distant candidate pairs; it is not a meaningful local identity test by itself.

The strongest B and C opportunities are more distinct than their nearest local matches. Across 588 shared boundaries per seed, their winner centers were separated by a median `.030–.032`; winner X Jaccard was `.779–.785`, exact same-X occurrence `.031–.037`, and within-channel winner-rank Spearman only `.166–.173`. The local evidence therefore shares a structural substrate while producing different strongest choices and different strength hierarchies.

## Objective case set

The [matched panel](visual/objective-cases.svg) uses the six preregistered objective categories and displays each selected track’s native channel, within-channel rank, recent input inside its changing X, and X snapshots at start/middle/end alongside the simultaneous max-D X. These examples are descriptive, not a selected visual winner reel.

| Category | Seed / track | Span, s | Duration, s | Mean within-channel rank for sustained competitor |
| --- | --- | --- | ---: | ---: |
| Longest non-entry B | 20261006 / 30865 | 135.0167–306.0167 | 171 | — |
| Longest non-entry C | 20261006 / 49652 | 149.0167–333.0167 | 184 | — |
| Longest entry B | 20261007 / 31539 | 11.0167–353.0167 | 342 | — |
| Longest entry C | 20261006 / 49703 | 159.0167–240.0167 | 81 | — |
| Strongest sustained non-entry B | 20261006 / 31100 | 189.0167–246.0167 | 57 | 1.914 |
| Strongest sustained non-entry C | 20261005 / 53054 | 357.0167–387.0167 | 30 | 2.000 |

The “strongest sustained” examples use the lowest mean within-channel rank among non-entry tracks with at least two observations; duration and seed/track order break ties. No minimum-duration or rank cutoff was added.

## Responsibility and feedback interpretation

**B — chemical history.** Implementation ancestry is direct: B is derived from the pheromone field that already affects organism movement/recruitment. The measured proxy relations show B level is weakly or negatively associated with recent center travel while ΔB20 is positively associated with travel20. This indicates that B is not simply an instantaneous local travel maximum, while its change remains aligned with a longer recent travel window. A future loop through B-based selection, material, movement feedback, and later pheromone would be particularly close to the existing chemical-routing pathway. No such loop was simulated; instability is not established.

**C — contact-written compaction.** Implementation ancestry is direct from individual `FOOT_CONTACT`; C is not D and does not carry D’s chemical gate. Its level and signed changes track recent contact more strongly than B tracks recent travel, while C observations also persist during zero-feet windows. Existing material overlap is moderate to high, so C does not identify an unmaterialized-space preference. A future C-based selection → material → retained-layer movement effects → later contact loop is plausible, but no integrated mechanical lock-in was tested. C’s 1800 s field constant alone does not prove lock-in.

## Architecture inference and authorship boundary

The measurements support **RESPONSIBILITIES DISTINCT / BOTH PLAUSIBLE**:

- B better preserves near-winner non-entry strength and rank identity over the measured 5–20 s lags.
- C more clearly represents direct contact inscription and recent contact-linked strengthening.
- Both yield persistent non-entry histories and mostly similar X geometry when spatially paired.
- Their global winners and local strength order are not interchangeable.

The data do not decide whether a future material episode should stand for persistent qualified chemical history or mechanical inscription. The smallest justified next question is an authorial/causal responsibility choice between those meanings. A separate competition-law pass remains unauthorized until that responsibility is chosen. No production adoption, Plate birth, Residence, threshold, or combined signal follows.
