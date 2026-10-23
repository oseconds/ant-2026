# Fixed-anchor routelet reuse — exploratory follow-up v4

**Status:** bounded, read-only analysis of frozen trajectory archives. V4 was frozen as a separate exploratory protocol before target-data analysis. It does not replace the v1–v3 protocol history or overwrite the v3 results.

## Finding

In every saved case/window and at both normalized distances, v4 found fixed one-second anchors with matches from multiple distinct ants. These results answer a narrower question than v3 ant-pair recurrence: multiple ants matched the same observed one-second trace at separated times. The number of supported anchors and distinct partners per anchor is higher in the `dtFeedback` cases than in the production cases across these saved runs.

That result supports reuse of local one-second spatial traces under the frozen screen. It does **not** show a long continuous corridor or route between visits. Representative partner start times often span minutes while each plotted routelet lasts one second. V3’s fixed predicate also admits matched near-straight numerical jitter, so candidate counts alone do not establish meaningful curvature. The continuous turning and chord-deviation values below are part of the result and limit its interpretation.

The saved experiment controlled initial seed and changed feedback policy. The difference can be described as the total outcome of that feedback intervention over these trajectories, including downstream movement and population/identity changes. It does not isolate a direct instantaneous field effect or one mechanism. The three 600 s seed-labelled cases are kept separate, and the three windows from each 7,200 s file are repeated windows of one run, not independent replicates.

## Frozen method and data

V4 fixes each observed one-second routelet as a spatial anchor and uses the exact v3 routelet construction and bidirectional candidate predicate at `0.012` and `0.024` **normalized world units** (one and two body diameters; body diameter `0.012`). It retains 10 Hz samples, integer-second alignment, the six-simulation-tick to 0.1 s conversion, the one-second minimum interval gap, overlap/tangent/curvature-sign gates, and v3’s numerical curvature epsilon. No new matching gates, clustering, curvature minimum, partner-quality cutoff, or aesthetic threshold were added. The positive gentle-radius-`0.25` control remains eligible; the near-straight tiny-jitter control remains an explicit known false positive.

The analysis covers eight existing source JSON files: three 600 s production cases, three 600 s `dtFeedback` cases, and the production/`dtFeedback` 7,200 s pair. Each 600 s input has 6,000 rows and each long-run input has 72,000 rows. The long runs use only `[480,600]`, `[1680,1800]`, and `[7080,7200]` seconds, each analyzed separately with no cross-window routelets. The first observed source sample is at 0.1 s, so the first full aligned one-second routelet begins at 1.0 s; the missing initial position was not synthesized.

All 24 case-window/scale candidate-pair counts match v3 exactly, confirming that v4 changed the grouping/reporting unit only. The frozen comparison screen is therefore unchanged. The 1/2/3/5 distinct-partner thresholds in the tables are descriptive counts, not quality grades. Candidate events share anchors, ant IDs, routelets, and trajectories; they are not independent observations.

## 600 s cases

The support table reports candidate routelet-pair matches, anchors with at least 1/2/3/5 distinct partner ants, the all-anchor partner-count distribution (zeros included), and the maximum-support anchor per case/scale. The reported representative span is the time from its earliest to latest matching partner routelet start.

| Case | Distance | Candidate pairs | Anchors ≥1 / ≥2 / ≥3 / ≥5 partners | Distinct partners per anchor p50 / p90 / max | Representative partners / partner-start span | Figure |
|---|---:|---:|---:|---:|---:|---|
| P / 20261005 | 0.012 | 4,634 | 3,859 / 1,836 / 1,095 / 497 | 0.0 / 3.0 / 17 | 17 / 470.0 s | [SVG](anchor-representatives-v4/production-seed-20261005--0-600s--d0-012.svg) |
| P / 20261005 | 0.024 | 14,916 | 6,587 / 4,412 / 3,143 / 1,867 | 1.0 / 7.0 / 50 | 50 / 574.0 s | [SVG](anchor-representatives-v4/production-seed-20261005--0-600s--d0-024.svg) |
| P / 20261006 | 0.012 | 3,872 | 3,461 / 1,579 / 888 / 376 | 0.0 / 2.0 / 17 | 17 / 580.0 s | [SVG](anchor-representatives-v4/production-seed-20261006--0-600s--d0-012.svg) |
| P / 20261006 | 0.024 | 12,562 | 6,158 / 4,054 / 2,792 / 1,548 | 1.0 / 6.0 / 40 | 40 / 580.0 s | [SVG](anchor-representatives-v4/production-seed-20261006--0-600s--d0-024.svg) |
| P / 20261007 | 0.012 | 4,436 | 3,845 / 1,807 / 1,047 / 444 | 0.0 / 3.0 / 19 | 19 / 533.0 s | [SVG](anchor-representatives-v4/production-seed-20261007--0-600s--d0-012.svg) |
| P / 20261007 | 0.024 | 14,301 | 6,523 / 4,454 / 3,110 / 1,790 | 1.0 / 7.0 / 44 | 44 / 493.0 s | [SVG](anchor-representatives-v4/production-seed-20261007--0-600s--d0-024.svg) |
| dt / 20261005 | 0.012 | 11,231 | 6,214 / 4,119 / 2,944 / 1,610 | 1.0 / 6.0 / 24 | 24 / 415.0 s | [SVG](anchor-representatives-v4/dtfeedback-seed-20261005--0-600s--d0-012.svg) |
| dt / 20261005 | 0.024 | 23,411 | 8,005 / 6,228 / 5,071 / 3,473 | 2.0 / 10.0 / 34 | 34 / 521.0 s | [SVG](anchor-representatives-v4/dtfeedback-seed-20261005--0-600s--d0-024.svg) |
| dt / 20261006 | 0.012 | 12,711 | 6,650 / 4,747 / 3,500 / 1,936 | 1.0 / 6.0 / 22 | 22 / 354.0 s | [SVG](anchor-representatives-v4/dtfeedback-seed-20261006--0-600s--d0-012.svg) |
| dt / 20261006 | 0.024 | 27,210 | 8,196 / 6,669 / 5,631 / 4,105 | 3.0 / 12.0 / 39 | 39 / 445.0 s | [SVG](anchor-representatives-v4/dtfeedback-seed-20261006--0-600s--d0-024.svg) |
| dt / 20261007 | 0.012 | 13,310 | 6,708 / 4,594 / 3,331 / 1,880 | 1.0 / 6.0 / 26 | 26 / 386.0 s | [SVG](anchor-representatives-v4/dtfeedback-seed-20261007--0-600s--d0-012.svg) |
| dt / 20261007 | 0.024 | 27,889 | 8,439 / 6,735 / 5,541 / 3,891 | 2.0 / 12.0 / 32 | 32 / 360.0 s | [SVG](anchor-representatives-v4/dtfeedback-seed-20261007--0-600s--d0-024.svg) |

Representative anchor geometry and event gaps:

| Case | Distance | Anchor at start | Distinct partners / partner-start span | Signed / absolute / net turn (rad) | Maximum chord deviation (normalized units) | Anchor-to-partner gap p50 / same-partner recurrence gap p50 (gap count) |
|---|---:|---|---:|---:|---:|---:|
| P / 20261005 | 0.012 | ant-213 @ 211.0 s | 17 / 470.0 s | 0.014 / 0.017 / 0.014 | 7.08e-5 | 59.0 / — (0) |
| P / 20261005 | 0.024 | ant-231 @ 223.0 s | 50 / 574.0 s | 0.164 / 0.164 / 0.164 | 7.19e-4 | 134.0 / 1.0 (1) |
| P / 20261006 | 0.012 | ant-143 @ 188.0 s | 17 / 580.0 s | 0.507 / 0.510 / 0.507 | 7.24e-3 | 162.0 / — (0) |
| P / 20261006 | 0.024 | ant-143 @ 188.0 s | 40 / 580.0 s | 0.507 / 0.510 / 0.507 | 7.24e-3 | 161.0 / — (0) |
| P / 20261007 | 0.012 | ant-467 @ 399.0 s | 19 / 533.0 s | 0.339 / 0.339 / 0.339 | 4.41e-3 | 141.0 / — (0) |
| P / 20261007 | 0.024 | ant-163 @ 179.0 s | 44 / 493.0 s | -0.202 / 0.243 / -0.202 | 6.24e-4 | 181.0 / 1.0 (1) |
| dt / 20261005 | 0.012 | ant-58 @ 145.0 s | 24 / 415.0 s | -0.341 / 0.341 / -0.341 | 2.75e-3 | 247.5 / 22.0 (2) |
| dt / 20261005 | 0.024 | ant-183 @ 363.0 s | 34 / 521.0 s | -1.088 / 1.088 / -1.088 | 1.08e-2 | 87.0 / 1.0 (8) |
| dt / 20261006 | 0.012 | ant-71 @ 139.0 s | 22 / 354.0 s | -1.305 / 1.305 / -1.305 | 8.32e-3 | 47.0 / 21.5 (4) |
| dt / 20261006 | 0.024 | ant-114 @ 185.0 s | 39 / 445.0 s | -0.736 / 0.736 / -0.736 | 6.46e-3 | 112.5 / 19.0 (5) |
| dt / 20261007 | 0.012 | ant-112 @ 278.0 s | 26 / 386.0 s | -0.602 / 0.613 / -0.602 | 4.39e-3 | 102.0 / 26.0 (4) |
| dt / 20261007 | 0.024 | ant-149 @ 306.0 s | 32 / 360.0 s | -0.993 / 1.041 / -0.993 | 1.35e-2 | 100.5 / 35.0 (8) |

Across the three production 600 s cases, partner-support anchor p50 absolute turn is `0.076–0.083 rad` at `0.012`, with p50 chord deviation `3.42e-4–3.46e-4` normalized units; at `0.024` these are `0.059–0.069 rad` and `2.29e-4–2.95e-4`. These production medians are small: the chord deviations are about `0.019–0.029` body diameters. For the three `dtFeedback` cases, corresponding p50 absolute turn is `0.718–0.740 rad` and p50 chord deviation `0.00436–0.00454` at `0.012`; at `0.024` it is `0.730–0.756 rad` and `0.00417–0.00440`. These are per-case anchor-routelet distributions, not pair-level pseudoreplicates.

## 7,200 s cases: bounded windows

Each row is one of the three predeclared 120 s windows from a single long-run case. Windows remain separate and do not count as three independent runs.

| Case/window | Distance | Candidate pairs | Anchors ≥1 / ≥2 / ≥3 / ≥5 partners | Distinct partners per anchor p50 / p90 / max | Representative partners / partner-start span | Figure |
|---|---:|---:|---:|---:|---:|---|
| Long P / 20261005 / 480-600s | 0.012 | 258 | 365 / 101 / 35 / 3 | 0.0 / 1.0 / 6 | 6 / 57.0 s | [SVG](anchor-representatives-v4/long-production-seed-20261005--480-600s--d0-012.svg) |
| Long P / 20261005 / 480-600s | 0.024 | 793 | 801 / 346 / 170 / 64 | 0.0 / 2.0 / 11 | 11 / 94.0 s | [SVG](anchor-representatives-v4/long-production-seed-20261005--480-600s--d0-024.svg) |
| Long P / 20261005 / 1680-1800s | 0.012 | 244 | 365 / 83 / 27 / 4 | 0.0 / 1.0 / 6 | 6 / 59.0 s | [SVG](anchor-representatives-v4/long-production-seed-20261005--1680-1800s--d0-012.svg) |
| Long P / 20261005 / 1680-1800s | 0.024 | 851 | 874 / 373 / 187 / 62 | 0.0 / 2.0 / 10 | 10 / 103.0 s | [SVG](anchor-representatives-v4/long-production-seed-20261005--1680-1800s--d0-024.svg) |
| Long P / 20261005 / 7080-7200s | 0.012 | 327 | 471 / 126 / 48 / 2 | 0.0 / 1.0 / 5 | 5 / 94.0 s | [SVG](anchor-representatives-v4/long-production-seed-20261005--7080-7200s--d0-012.svg) |
| Long P / 20261005 / 7080-7200s | 0.024 | 958 | 966 / 431 / 210 / 67 | 0.0 / 2.0 / 11 | 11 / 114.0 s | [SVG](anchor-representatives-v4/long-production-seed-20261005--7080-7200s--d0-024.svg) |
| Long dt / 20261005 / 480-600s | 0.012 | 1,420 | 1,094 / 626 / 387 / 152 | 0.0 / 3.0 / 11 | 11 / 74.0 s | [SVG](anchor-representatives-v4/long-dtfeedback-seed-20261005--480-600s--d0-012.svg) |
| Long dt / 20261005 / 480-600s | 0.024 | 2,561 | 1,421 / 959 / 678 / 348 | 1.0 / 6.0 / 15 | 15 / 84.0 s | [SVG](anchor-representatives-v4/long-dtfeedback-seed-20261005--480-600s--d0-024.svg) |
| Long dt / 20261005 / 1680-1800s | 0.012 | 1,463 | 1,216 / 693 / 423 / 133 | 0.0 / 3.0 / 9 | 9 / 107.0 s | [SVG](anchor-representatives-v4/long-dtfeedback-seed-20261005--1680-1800s--d0-012.svg) |
| Long dt / 20261005 / 1680-1800s | 0.024 | 2,632 | 1,498 / 1,039 / 750 / 369 | 1.0 / 5.0 / 11 | 11 / 86.0 s | [SVG](anchor-representatives-v4/long-dtfeedback-seed-20261005--1680-1800s--d0-024.svg) |
| Long dt / 20261005 / 7080-7200s | 0.012 | 1,684 | 1,066 / 670 / 445 / 204 | 0.0 / 4.0 / 13 | 13 / 105.0 s | [SVG](anchor-representatives-v4/long-dtfeedback-seed-20261005--7080-7200s--d0-012.svg) |
| Long dt / 20261005 / 7080-7200s | 0.024 | 2,983 | 1,309 / 961 / 701 / 407 | 1.0 / 6.0 / 17 | 17 / 119.0 s | [SVG](anchor-representatives-v4/long-dtfeedback-seed-20261005--7080-7200s--d0-024.svg) |

Representative anchor geometry and event gaps:

| Case/window | Distance | Anchor at start | Distinct partners / partner-start span | Signed / absolute / net turn (rad) | Maximum chord deviation (normalized units) | Anchor-to-partner gap p50 / same-partner recurrence gap p50 (gap count) |
|---|---:|---|---:|---:|---:|---:|
| Long P / 20261005 / 480-600s | 0.012 | ant-590 @ 483.0 s | 6 / 57.0 s | -0.264 / 0.264 / -0.264 | 5.12e-4 | 42.0 / — (0) |
| Long P / 20261005 / 480-600s | 0.024 | ant-590 @ 483.0 s | 11 / 94.0 s | -0.264 / 0.264 / -0.264 | 5.12e-4 | 37.0 / — (0) |
| Long P / 20261005 / 1680-1800s | 0.012 | ant-2215 @ 1756.0 s | 6 / 59.0 s | -0.099 / 0.259 / -0.099 | 9.30e-4 | 40.5 / — (0) |
| Long P / 20261005 / 1680-1800s | 0.024 | ant-2157 @ 1711.0 s | 10 / 103.0 s | -0.003 / 0.007 / -0.003 | 2.73e-5 | 19.0 / 1.0 (1) |
| Long P / 20261005 / 7080-7200s | 0.012 | ant-9014 @ 7121.0 s | 5 / 94.0 s | -0.367 / 0.367 / -0.367 | 1.21e-3 | 27.0 / — (0) |
| Long P / 20261005 / 7080-7200s | 0.024 | ant-8986 @ 7099.0 s | 11 / 114.0 s | -0.577 / 0.577 / -0.577 | 2.45e-3 | 39.0 / — (0) |
| Long dt / 20261005 / 480-600s | 0.012 | ant-254 @ 542.0 s | 11 / 74.0 s | 1.413 / 1.413 / 1.413 | 1.69e-2 | 9.0 / — (0) |
| Long dt / 20261005 / 480-600s | 0.024 | ant-258 @ 550.0 s | 15 / 84.0 s | -1.604 / 1.604 / -1.604 | 1.44e-2 | 14.5 / 1.0 (3) |
| Long dt / 20261005 / 1680-1800s | 0.012 | ant-665 @ 1728.0 s | 9 / 107.0 s | -0.834 / 0.834 / -0.834 | 8.28e-3 | 23.0 / 31.5 (2) |
| Long dt / 20261005 / 1680-1800s | 0.024 | ant-660 @ 1694.0 s | 11 / 86.0 s | 0.760 / 0.760 / 0.760 | 5.58e-3 | 67.0 / 6.5 (6) |
| Long dt / 20261005 / 7080-7200s | 0.012 | ant-2647 @ 7138.0 s | 13 / 105.0 s | 0.504 / 0.504 / 0.504 | 3.61e-3 | 24.0 / — (0) |
| Long dt / 20261005 / 7080-7200s | 0.024 | ant-2649 @ 7142.0 s | 17 / 119.0 s | 0.484 / 0.484 / 0.484 | 3.99e-3 | 20.0 / 22.5 (2) |

Across the three bounded production windows, partner-support anchor p50 absolute turn ranges `0.067–0.141 rad` at `0.012` and `0.043–0.088 rad` at `0.024`, with corresponding p50 chord-deviation ranges `2.42e-4–5.20e-4` and `1.54e-4–4.02e-4` normalized units. For the `dtFeedback` windows, the corresponding ranges are `0.665–0.702 rad` and `0.678–0.717 rad`, with p50 chord deviations `0.00392–0.00419` and `0.00381–0.00407`. These three windows describe one run per condition.

## Representative figures and limits

Each linked SVG draws the actual observed anchor polyline and the earliest-time matching routelet for every distinct partner ant, with IDs and times. It uses a common normalized-coordinate `[0,1] × [0,1]` world frame and a local inset whose padding is for display only; curvature support locations are shown on the anchor. Representative selection is deterministic: maximum distinct partner-ant count, then earliest anchor time, then lexicographically smallest ant ID. Each partner’s JSON record keeps all matched partner start/end times, signed offsets, interval gaps, recurrence gaps, and its earliest matched routelet’s geometry. These plots do not join disconnected visits into a corridor.

The continuous measures must stay beside the support counts. For example, the highest-support production representative in the first 600 s case at distance `0.012` has 17 distinct partners across 470 s, but only `0.017 rad` absolute turn and `7.08e-5` normalized-unit maximum chord deviation. That is a weakly curved one-second trace under a predicate known to pass microscopic matched jitter. The corresponding `dtFeedback` representative has 24 partners across 415 s with `0.341 rad` absolute turn and `0.00275` chord deviation; this is a more turned local sample, still not proof of a long shared corridor. No aesthetic minimum or shape label is inferred.

## Reproduction and provenance

Run `node tests/ant-transfer-collective.test.js` and `node scripts/ant-transfer-collective.js --anchors-v4` from the repository root. The tests include distinct ants reusing one fixed arc, the same pair matching two spatially separated regions (pair recurrence without multi-partner anchor support), straight/parallel paths, independent crossings and zigzags, gentle radius-`0.25` reuse, and the tiny-jitter false positive. No simulation was run and no source trajectory was altered.

The compact machine-readable result is [anchor-summary-v4.json](anchor-summary-v4.json). The initial one-case verification is preserved in [anchor-summary-v4-pilot.json](anchor-summary-v4-pilot.json). [anchor-manifest-v4.json](anchor-manifest-v4.json) records the eight input hashes, script/protocol digests, v3 snapshot hashes, the v3 candidate-pair parity check, and all representative SVG hashes.

- V4 script SHA-256: `8cbb0eeda38c12cc1698dd70ff4198660773fe68b8208daa158e348cc6a802ba`
- V4 protocol SHA-256: `b673542f1e28c28ca94b8533411e32c8e04cc7d1e74811b86edec6292fd057b2`
- V4 result SHA-256: `db282b4cded4fc26f34eef7c81d29ec133544739d16976f3a02458afdba8970a`
- V3 script snapshot SHA-256: `d60a1769d6acc65bcc387c773550700383906b4dbdc0fe5479bf9966c345aa0f`
- V3 result snapshot SHA-256: `4e17adac690e76b61b2eacf59d264f5d6e43cc0bf5d574a215db843313f4eb91`

This is evidence for descriptive one-second anchor reuse in these saved trajectories. It does not establish pheromone recognition, a single causal mechanism, a continuous long route, ellipse/milling, or an artistic/aesthetic judgment.
