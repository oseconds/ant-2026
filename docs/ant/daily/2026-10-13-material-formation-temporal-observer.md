# 2026-10-13 — Material formation temporal observer

Ran the bounded read-only comparison on branch `codex/ant-material-formation-responsibility-20261013` from investigation base `ca0aaac4e1994078758d88bf72511f0203a6c70c`, with live `origin/main` verified at `d45823d40c9a87c1b333fa9872f3c897ee9ab01b`. No production source changed.

- Seed `20261006`, 600 simulated seconds, fixed 60 Hz; 599 observations. First at 16.667 ms; between observations, 524 intervals were 1000 ms and 74 were 1016.667 ms. Final observation at 599250 ms; the remaining 750 ms is right-censored.
- Plain and observer runs matched exactly for all 36,001 tick boundaries across agents, lifecycle/spawning, RNG, pheromone, SurfaceField, gait/body pose, deposition, activation, occupancy, contacts/events, TrailPlateBirth, and MaterialStratigraphy. Final world snapshot hashes matched. Observer nonmutation checks: 599/599.
- Matched prior-Plate observations: 238; candidate lineage CONTINUED: 237; RESTARTED: 1.
- Relevant sampled local eligibility loss-to-return appeared inside prior masks in 207 matched observations (564 cell returns). Loss and return must each occur in the previous/current candidate-or-prior territory union for their interval. At least one currently eligible cell without a sampled loss since the first observation appeared in all 238 matched observations.
- Candidate restart without local eligibility loss: 0 among matched prior observations. Local loss/return without candidate restart: 237 matched observations. Prior match changed in 67 matched observations.
- Across continued matched observations, prior masks had 12077 fresh contacts, 1153 chemical qualification onsets, 0 mechanical support onsets, 1153 combined onsets, 2124 sampled eligibility losses, and 559 relevant returns. The one restarted matched observation had 45 fresh contacts, 6 chemical onsets, 0 mechanical onsets, 6 combined onsets, 10 sampled losses, and 5 relevant returns.
- The sole matched restart was analysis 308 with prior `trail-plate-7`; no continued observation shared its exact candidate geometry and prior Plate. The full exact-summary hash also had no repeated groups, but includes strictly changing prior age and accumulated values, so that result is only diagnostic.
Decision: **INSUFFICIENT NATURAL CASES**. No additional seed was run. Recommend at most one separately bounded fixed-seed pass to seek a continued/restarted comparator with the same exact candidate geometry and prior Plate, without pooling its results into this seed.

The temporal record includes complete chemical memory, full-cell mechanical support, qualification masks and transitions, per-cell contact counters/deltas, interval-start ordered columns, matched immutable prior masks/paths, and run-boundary censoring. A Plate born at an analysis boundary remains a separate ending event. One-second sampling does not establish subsecond absence.

Evidence and reproduction: [material formation temporal observer](../evidence/2026-10-13-material-formation-temporal-observer/README.md).
