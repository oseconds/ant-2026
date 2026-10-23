# Collective routelet analysis — 2026-10-23

## Result

Every saved case has candidate pairs under the fixed one-second curved-routelet screen at both distances. The `dtFeedback` cases have more candidate pairings and many more unordered ant pairs that produce candidates at multiple later times than the production cases. Their candidate routelets also show larger median integrated turns and chord deviations. This is descriptive evidence of more repeated local routelet matching in these archives.

The screen does not establish a long shared corridor. The recurrence grouping is by unordered ant ID pair across a case/window, not by a spatially tracked corridor; repeat events may occur at different places. The screen also has an intentional known limit: matched near-straight numerical jitter passes the fixed curvature-sign gates. Production candidate medians show that this matters in the saved data: median chord deviation is only `0.00070–0.00078` normalized units for the earlier routelet in a pair, or about `0.058–0.065` body diameters. These remain screen candidates, not evidence of aesthetically or biologically meaningful curvature.

## Scope and reproduction

The frozen protocol is version 3 in [README.md](README.md). It uses source `sampleIndex = tick / 6`, 10 Hz positions, one-second routelets, normalized world units, fixed distances `0.012` and `0.024`, a one-second minimum temporal gap, and the original component gates. There is no body-scale curvature or chord-deviation minimum. The gentle radius-`0.25` control remains a candidate; the matching tiny-jitter control also passes and is treated as an explicit false-positive limit.

The analyzer checked each input's SHA-256, first/last simulation ticks, and full row count before analysis. All trajectory rows advanced by six ticks; each 600 s file had 6,000 rows and each 7,200 s file had 72,000. Each long-run window contains 1,201 observed positions spanning its inclusive endpoints; comparisons were run separately inside each declared window. Reproduce the report and compact machine-readable summaries with:

```text
node tests/ant-transfer-collective.test.js
node scripts/ant-transfer-collective.js
```

The second command writes [analysis-summary.json](analysis-summary.json). It includes per-case counts, continuous measure distributions, candidate support locations and run lengths for deterministic representatives, input hashes, and the exact script/protocol hashes. It does not save the full routelet-pair arrays. The analyzed output has SHA-256 `4e17adac690e76b61b2eacf59d264f5d6e43cc0bf5d574a215db843313f4eb91`; the analyzer source hash is `d60a1769d6acc65bcc387c773550700383906b4dbdc0fe5479bf9966c345aa0f`, and the frozen protocol hash is `2d9f2153380d7948cd9eefe90fe372893a21589e20ecd2975251423f1646ea13`.

## 600 s cases

Each row is a separate seed-labelled case. `Candidates / ant pairs` counts routelet-pair matches and the distinct unordered ant-ID pairs with at least one match. `Repeated pairs` counts ant pairs with at least two distinct later routelet start times among candidate events. The repeat grouping does not identify a single persistent spatial corridor.

| Case | Routelet ant IDs | Routelets | Eligible comparisons (0.024 broadphase) | 0.012 candidates / ant pairs (repeated pairs) | 0.024 candidates / ant pairs (repeated pairs) |
|---|---:|---:|---:|---:|---:|
| Production 20261005 | 753 | 10,561 | 1,638,620 | 4,634 / 4,420 (196) | 14,916 / 13,032 (1,477) |
| Production 20261006 | 687 | 10,473 | 1,499,003 | 3,872 / 3,686 (174) | 12,562 / 11,145 (1,175) |
| Production 20261007 | 734 | 10,442 | 1,591,696 | 4,436 / 4,203 (220) | 14,301 / 12,511 (1,432) |
| dtFeedback 20261005 | 310 | 11,481 | 1,526,442 | 11,231 / 5,654 (2,175) | 23,411 / 9,694 (4,332) |
| dtFeedback 20261006 | 318 | 11,206 | 1,531,691 | 12,711 / 6,523 (2,371) | 27,210 / 11,293 (4,983) |
| dtFeedback 20261007 | 263 | 11,692 | 1,484,146 | 13,310 / 5,481 (2,449) | 27,889 / 8,800 (4,583) |

At `0.012`, the repeated-pair fraction ranges from 4.7–5.2% in production and 36.3–44.7% in `dtFeedback`. At `0.024`, it ranges from 10.5–11.4% and 44.1–52.1%, respectively. Median candidate-pair lag at `0.012` is 152–158 s for production and 45–50 s for `dtFeedback`; the corresponding median lag at `0.024` is 153–157 s and 58–64 s. These are pair-level descriptive distributions, not independent observations. The seed labels share the controlled initial conditions recorded in the frozen `9fcd962` evidence; after trajectory divergence, they are not treated as paired trajectory-level observations or as three independent sub-seed measurements.

Across the three production seed medians, candidate overlap and tangent-aligned fractions are 1.0 in both directions at both distances. At `0.012`, the A→B/B→A median tangent-axis angles are `0.161–0.164` / `0.160–0.165 rad`; at `0.024` they are `0.182–0.184` / `0.183–0.185 rad`. Median curvature-sign agreement is `0.876–0.878` / `0.874–0.878` at `0.012` and `0.881–0.883` / `0.880–0.881` at `0.024`. The corresponding `dtFeedback` tangent-axis medians are `0.153–0.166` / `0.151–0.164 rad` and `0.183–0.192` / `0.177–0.186 rad`; curvature-sign medians are `0.901–0.905` / `0.903–0.907` and `0.905–0.912` / `0.907–0.915`. Median matched curved support spans all ten routelet segments in both conditions. These values describe candidate pair events, whose reuse is dependent on ant and routelet.

For candidate routelets, production seed medians of absolute integrated turn are `0.166–0.178 rad` for the earlier routelet and `0.176–0.196 rad` for the later one at `0.012`; median maximum chord deviation is `0.00070–0.00078` and `0.00085–0.00089` normalized units. The `dtFeedback` medians are `0.677–0.725 rad` and `0.662–0.701 rad`, with chord deviations `0.00472–0.00497` and `0.00462–0.00475`. The same contrast appears at `0.024`. Thus the screen flags much more pronounced local turning in `dtFeedback`, while production candidates often have very small deviations despite matching curvature signs. No aesthetic threshold is imposed.

## 7,200 s cases: bounded windows

These are separate descriptive windows from one long production run and one long `dtFeedback` run. Each contains 120 seconds of comparisons; no full-history pair cross-product was made.

| Case / window | Routelet ant IDs | Routelets | 0.012 candidates / ant pairs (repeated pairs) | 0.024 candidates / ant pairs (repeated pairs) |
|---|---:|---:|---:|---:|
| Production / 480–600 s | 184 | 2,285 | 258 / 244 (12) | 793 / 694 (81) |
| Production / 1680–1800 s | 165 | 2,328 | 244 / 235 (9) | 851 / 734 (90) |
| Production / 7080–7200 s | 175 | 2,370 | 327 / 306 (18) | 958 / 791 (123) |
| dtFeedback / 480–600 s | 80 | 2,473 | 1,420 / 672 (320) | 2,561 / 928 (513) |
| dtFeedback / 1680–1800 s | 61 | 2,569 | 1,463 / 538 (318) | 2,632 / 699 (467) |
| dtFeedback / 7080–7200 s | 87 | 2,227 | 1,684 / 676 (328) | 2,983 / 916 (551) |

The repeated-pair fraction is 3.8–5.9% for production and 47.2–59.1% for `dtFeedback` at `0.012`; at `0.024` it is 11.7–15.5% and 55.3–66.8%. At `0.012`, medians for the earlier routelet in candidate pairs again show more turning in the `dtFeedback` windows: absolute integrated turn is `0.636–0.689 rad` and maximum chord deviation is `0.00428–0.00454` normalized units, compared with production `0.064–0.208 rad` and `0.00023–0.00060`. These three selected windows are not three independent runs.

## Evidence boundary

This measurement supports a difference in local routelet matching and recurrence in these saved cases under the fixed screen. The frozen setup controls initial seeds and varies feedback, so the difference can be read as a total outcome of that feedback intervention over these trajectories, including downstream movement and population/identity changes. It does not isolate a direct instantaneous field effect or one mechanism, show that an ant recognized or followed a route, or establish that the same extended corridor persisted. The substantial difference in routelet-ant ID counts (roughly 687–753 versus 263–318 in the 600 s cases) is part of that total outcome and complicates a mechanism-specific reading. Three seed labels do not support broad cross-seed generalization; no statistical significance is claimed, and the pair counts are not pseudoreplicates for seeds.

The one-second routelet supports and deterministic representatives in [analysis-summary.json](analysis-summary.json) are the evidence for this report. The support coordinates are in normalized world units and remain local to each sampled routelet. This analysis makes no artistic or aesthetic claim.

## Frozen input manifest

The paths below are relative to `docs/ant/evidence/2026-10-22-spatial-dynamics/`.

| Source | Bytes | SHA-256 |
|---|---:|---|
| `baseline/seed-20261005/result.json` | 16,231,275 | `9c88acf923ccf798e81a3ec04f68bece7eebe3c8bb6aab8b32ec8a7173c29fc1` |
| `baseline/seed-20261006/result.json` | 16,856,171 | `48131a7b25b687e47891803a595716bb4d386b110ee99dd34052e143fe1cabf1` |
| `baseline/seed-20261007/result.json` | 18,058,742 | `a1f67c04d2f1c3822527365cff8a96565e6d6d69eba023bc933d88b8a5405371` |
| `movement/natural/dtFeedback-20261005/result.json` | 12,637,434 | `418142326ea2fea06aee7a8fb1ba49360c493b541cff0c581dfa0451bd9ad70a` |
| `movement/natural/dtFeedback-20261006/result.json` | 13,288,576 | `e248a10f4a168bcbb1f23aa957a281882a8a7033fa1d01c24fb0c500f3d9c904` |
| `movement/natural/dtFeedback-20261007/result.json` | 14,337,328 | `3c8a551b92ed956709bdcb6cd73c7acc14da85f36bc2e1c792603cec62e333c3` |
| `long-run/production-20261005/result.json` | 226,086,246 | `d7d1bbacc671638e79a0e68170d23edc50587f19ee37f6c7c2bdbb2b12e91179` |
| `long-run/dtFeedback-20261005/result.json` | 181,416,038 | `81581cc2a74be95f5dcf3aa52a3f37b2f590c2bd007eebe51311bb67d3412496` |
