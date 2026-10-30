# Recruitment heading: outgoing flow vs isotropic

## Decision

**FLOW DISTINCT / WORTH ARTIST REVIEW.** The treatment generated its own recurring entrance flow after an isotropic initialization, directly used that flow at 18.9–22.9% of accepted spawns in all three seeds, and its conditioned recruits had positive 0.5 s and 1.0 s displacement projections along birth q in 78.0–86.2% of observed cases. Each paired seed also showed a different angular and spatial occupancy distribution from isotropic. The q direction changed across windows and seeds; the checks found no common fixed directional attractor or movement collapse.

Recommendation: review the matched images in `visual/` as an author. This classification does not record artistic acceptance or production adoption.

## Implementation fact

- Production authority for every run: `origin/main@301f0740c9fe2e0697e31a716f7226cb2112ede7`.
- The two arms retain the production material resistance, A turn ceiling, D same-flow headway, G pheromone, movement, gait, collision, activation and recruitment, TrailPlateBirth, and material stratigraphy. Spawn center `(0.5, 0.72)`, radius `0.018`, cadence, placement attempts, clearance, and retry timing remain pinned to production values.
- The research runner dynamically replaces the single accepted-heading expression in memory. It does not edit production source. The placement function is called unchanged; the flow measurement is taken at the existing heading expression, after placement has succeeded and before the heading draw.
- Each fresh controller stores actual post-collision positions after the original tick returns. At the next accepted-spawn boundary, one segment per then-live ant is eligible only when its midpoint radius is `0.018 < r <= 0.085`, realized segment speed is at least `0.008` world units/s, and its midpoint radial dot segment displacement is positive. Require `N >= 3`; `q` is the equal-weight mean of eligible unit segment directions. `R = |q|`, `phi = arg(q)`, and the signal is unavailable when `R <= 1e-9`.
- CONTROL applies `theta = -pi + 2*pi*U` at every accepted spawn. TREATMENT uses that same transform when q is unavailable; otherwise it applies `w = pi - (pi - 0.3)*R` and `theta = wrap(phi + (2*U - 1)*w)`. Its first spawn at time zero is isotropic. The earlier north-production q was not transferred; each treatment q came only from that treatment world's own previous completed tick.
- Pheromone remains causal in both worlds; its renderer overlay is Off. Renderer material is On. Audio is Off.

## Runs and accepted-spawn manipulation

Six fresh worlds ran for 600 model seconds at 60 Hz (36,000 ticks each): the three requested seeds, each with isotropic CONTROL and outgoing-flow TREATMENT. The denominator below is successful accepted spawns, including initialization. CONTROL's q count is read-only availability; it is never applied. TREATMENT's q-available count is its direct-use count.

| Seed | Arm | Accepted | q available at accepted spawn | Direct q use | Isotropic heading/fallback |
|---|---|---:|---:|---:|---:|
| 20261005 | CONTROL | 866 | 148 (17.1%) | 0 | 866 |
| 20261005 | TREATMENT | 868 | 181 (20.9%) | 181 | 687 |
| 20261006 | CONTROL | 857 | 170 (19.8%) | 0 | 857 |
| 20261006 | TREATMENT | 875 | 200 (22.9%) | 200 | 675 |
| 20261007 | CONTROL | 843 | 136 (16.1%) | 0 | 843 |
| 20261007 | TREATMENT | 834 | 158 (18.9%) | 158 | 676 |

### Accepted-event q distributions

The following distributions use only accepted spawns where q was available. `R` and `w` show p10 / median / p90; full per-event values remain in each run JSON. N is shown as counts for 3 / 4 / 5 eligible ants. Direction is the circular mean of phi in the run's world coordinates (positive y points down); `C` is circular concentration. CONTROL's w is diagnostic only; its applied half-spread is always pi. TREATMENT applies the listed w on direct-use events and pi on fallback events.

| Seed | Arm | N: 3 / 4 / 5 | R p10 / med / p90 | w p10 / med / p90 (rad) | Mean phi / C |
|---|---|---:|---:|---:|---:|
| 20261005 | CONTROL | 121 / 27 / 0 | .198 / .370 / .739 | 1.036 / 2.081 / 2.543 | -42.2° / .145 |
| 20261005 | TREATMENT | 140 / 37 / 4 | .230 / .415 / .785 | .911 / 1.962 / 2.488 | +93.8° / .031 |
| 20261006 | CONTROL | 147 / 22 / 1 | .191 / .436 / .817 | .801 / 1.903 / 2.591 | +37.7° / .031 |
| 20261006 | TREATMENT | 165 / 34 / 1 | .189 / .462 / .830 | .762 / 1.775 / 2.582 | -158.4° / .152 |
| 20261007 | CONTROL | 114 / 21 / 1 | .167 / .428 / .777 | .866 / 1.918 / 2.646 | -59.1° / .132 |
| 20261007 | TREATMENT | 141 / 15 / 2 | .193 / .443 / .795 | .864 / 1.878 / 2.590 | +112.6° / .106 |

Direct-use heading offset `abs(wrap(theta - phi))` had median / mean / p90 of `0.649 / 0.784 / 1.591` rad (20261005), `0.758 / 0.903 / 1.872` (20261006), and `0.744 / 0.836 / 1.680` (20261007). Thus q was not merely numerically available: the registered mapping narrowed the heading spread from isotropic pi, while retaining a broad angular range.

### Placement and RNG

Scheduling opportunities, placement calls, candidate-position checks, and successful accepted spawns are separate counts. “Scheduled” excludes initialization; placement calls equal initialization + scheduled + retry calls. Retry calls repeat a pending placement. `position checks = accepted + clearance rejects` held in every run. The retry queue was empty at 600 s; capacity-suppressed spawn calls were zero.

| Seed | Arm | Scheduled | Placement calls | Retry calls / blocked calls | Position checks / clearance rejects | Retry recoveries | Accepted / retired | Pending at 600 s |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 20261005 | CONTROL | 865 | 876 | 10 / 10 | 1,851 / 985 | 10 | 866 / 848 | no |
| 20261005 | TREATMENT | 867 | 895 | 27 / 27 | 2,082 / 1,214 | 20 | 868 / 849 | no |
| 20261006 | CONTROL | 856 | 874 | 17 / 17 | 1,833 / 976 | 11 | 857 / 839 | no |
| 20261006 | TREATMENT | 874 | 899 | 24 / 24 | 2,070 / 1,195 | 18 | 875 / 855 | no |
| 20261007 | CONTROL | 842 | 852 | 9 / 9 | 1,642 / 799 | 9 | 843 / 825 | no |
| 20261007 | TREATMENT | 833 | 845 | 11 / 11 | 1,668 / 834 | 10 | 834 / 822 | no |

Every accepted spawn recorded exactly one heading draw, and the RNG call count increased by exactly one across that draw. The existing random value was used for both laws; q calculation consumed no RNG. Total run RNG call counts were 310,384 / 316,402 (20261005 C/T), 322,856 / 326,874 (20261006), and 306,308 / 320,562 (20261007). These totals can differ as heading changes later placements and world history; they are not a matched RNG-state parity claim. Every accepted position remained inside the fixed spawn disk.

TREATMENT had more clearance rejects and blocked placement calls than its paired CONTROL in each seed, while accepted and retired counts remained close. This is a real placement-pressure difference to keep visible; it did not leave a pending retry, suppress a spawn for capacity, or coincide with sampled ant overlap.

## Fixed 60-second recurrence and flow direction

Each cell is `q-available accepted spawns / all accepted spawns (percent)` in that window. For CONTROL, this is diagnostic only. For TREATMENT, it equals direct flow-conditioned recruits. The ten fixed windows cover 0–600 s without gaps.

| Window | CONTROL 05 | CONTROL 06 | CONTROL 07 | TREATMENT 05 | TREATMENT 06 | TREATMENT 07 |
|---|---:|---:|---:|---:|---:|---:|
| 0–60 | 6/61 (9.8%) | 4/52 (7.7%) | 5/42 (11.9%) | 2/54 (3.7%) | 4/54 (7.4%) | 2/40 (5.0%) |
| 60–120 | 9/78 (11.5%) | 13/83 (15.7%) | 5/75 (6.7%) | 12/86 (14.0%) | 10/88 (11.4%) | 9/73 (12.3%) |
| 120–180 | 9/88 (10.2%) | 19/92 (20.7%) | 13/88 (14.8%) | 15/90 (16.7%) | 22/91 (24.2%) | 14/88 (15.9%) |
| 180–240 | 13/90 (14.4%) | 12/89 (13.5%) | 15/91 (16.5%) | 17/88 (19.3%) | 22/91 (24.2%) | 16/91 (17.6%) |
| 240–300 | 14/89 (15.7%) | 26/89 (29.2%) | 13/95 (13.7%) | 18/89 (20.2%) | 16/93 (17.2%) | 27/94 (28.7%) |
| 300–360 | 24/94 (25.5%) | 22/93 (23.7%) | 17/88 (19.3%) | 25/91 (27.5%) | 25/89 (28.1%) | 16/88 (18.2%) |
| 360–420 | 22/91 (24.2%) | 16/89 (18.0%) | 14/89 (15.7%) | 29/93 (31.2%) | 24/92 (26.1%) | 17/91 (18.7%) |
| 420–480 | 19/91 (20.9%) | 23/92 (25.0%) | 17/90 (18.9%) | 22/91 (24.2%) | 23/91 (25.3%) | 24/89 (27.0%) |
| 480–540 | 13/89 (14.6%) | 17/89 (19.1%) | 21/91 (23.1%) | 21/93 (22.6%) | 25/93 (26.9%) | 14/89 (15.7%) |
| 540–600 | 19/95 (20.0%) | 18/89 (20.2%) | 16/94 (17.0%) | 20/93 (21.5%) | 29/93 (31.2%) | 19/91 (20.9%) |

Every treatment seed had direct q use in all ten windows. Its per-window one-Hz diagnostic q support was also recurrent. The next table gives each window's available one-Hz samples out of 60 and circular mean direction / concentration `phi° / C`. Values use the immediately preceding completed tick at each one-second observation. These time-varying means do not show one common fixed heading.

| Seed / arm | 0–60 | 60–120 | 120–180 | 180–240 | 240–300 | 300–360 | 360–420 | 420–480 | 480–540 | 540–600 |
|---|---|---|---|---|---|---|---|---|---|---|
| 20261005 CONTROL | 6: +7/.15 | 11: -83/.05 | 11: +126/.35 | 9: -80/.62 | 12: -40/.46 | 12: -22/.36 | 14: -100/.38 | 11: -91/.21 | 9: +134/.54 | 10: +37/.26 |
| 20261005 TREATMENT | 3: +134/.55 | 8: -148/.17 | 13: +153/.18 | 9: +9/.13 | 14: +31/.39 | 15: +3/.24 | 22: -137/.19 | 12: +138/.22 | 15: +58/.20 | 12: 0/.18 |
| 20261006 CONTROL | 3: +97/.41 | 9: +128/.36 | 13: +81/.56 | 14: -38/.33 | 13: +47/.12 | 12: +105/.21 | 11: +3/.30 | 12: -74/.06 | 14: -31/.54 | 12: -50/.09 |
| 20261006 TREATMENT | 3: +106/.60 | 9: +96/.18 | 11: -85/.32 | 11: -102/.18 | 14: +23/.10 | 15: +39/.11 | 17: -151/.40 | 16: +12/.17 | 16: +134/.15 | 16: +144/.13 |
| 20261007 CONTROL | 4: -61/.40 | 8: -72/.45 | 10: -83/.28 | 15: -11/.06 | 8: -84/.50 | 9: +73/.50 | 12: -167/.26 | 10: -64/.32 | 9: +148/.48 | 15: +158/.14 |
| 20261007 TREATMENT | 4: -9/.51 | 5: -11/.32 | 11: -37/.33 | 13: +164/.51 | 10: +165/.63 | 13: -68/.24 | 14: +71/.35 | 11: +84/.24 | 11: -15/.26 | 18: +163/.27 |

For every seed/arm/window, [temporal-windows.json](analysis/temporal-windows.json) retains the eligible-N histogram, full R and diagnostic/applied-w summaries, q circular direction and concentration, accepted-spawn q availability, direct/fallback counts, blocked placement calls, population, activity, same-flow ticks, contacts, births, pheromone, SurfaceField, and material endpoint/history fields. Per-event N/R/phi/w/heading/position/timing remain in the six `seed-*.json` files.

## Short-horizon realized transport

For each directly conditioned treatment recruit, displacement is projected onto the q direction that conditioned its birth. All eligible recruits remained observable through both horizons; none was censored by retirement/removal before the measurement. Positive fractions below describe these recruits only, not a biological following effect.

| Seed | Recruits | 0.5 s median / mean projection; positive | 1.0 s median / mean projection; positive | Censored |
|---|---:|---:|---:|---:|
| 20261005 | 181 | .00155 / .00454; 86.2% | .01345 / .01548; 84.0% | 0 / 0 |
| 20261006 | 200 | .00118 / .00306; 79.5% | .01102 / .01083; 78.0% | 0 / 0 |
| 20261007 | 158 | .00155 / .00416; 83.5% | .01359 / .01529; 81.6% | 0 / 0 |

Projection units are world units. The 0.5 s median is small; the 1.0 s median is positive in each seed. This is the intended heading-to-short-transport chain under this model.

## Matched world comparison

The late descriptor window is 300–600 s inclusive: 301 nominal one-second samples per run. Within-run samples are serially dependent; the three seeds are the replication units. Values are descriptive paired differences, not a significance test.

| Seed | Mean population C → T | Centroid C → T | South of entrance C → T | Dispersion C → T | Angular occupancy L1 | 8×8 occupancy L1 | Velocity polarization C → T | Travel / ant-s C → T |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| 20261005 | 16.22 → 17.37 | (.499,.610) → (.503,.595) | 38.3% → 35.2% | .326 → .318 | .301 | .269 | .263 → .300 | .0561 → .0549 |
| 20261006 | 17.08 → 17.23 | (.499,.612) → (.479,.600) | 39.8% → 38.0% | .324 → .321 | .216 | .262 | .230 → .286 | .0549 → .0542 |
| 20261007 | 16.12 → 16.99 | (.506,.602) → (.513,.615) | 36.4% → 40.4% | .323 → .329 | .205 | .247 | .277 → .256 | .0552 → .0563 |

Angular and 8×8 spatial occupancy differ in all three paired seeds. The occupancy L1 values capture a distribution change but do not name its artistic value. Centroid and south-of-entrance shifts do not share a common direction across seeds. Velocity polarization is mixed; realized travel shifts are small and mixed. FLOW therefore adds a spatial/transport organization difference beyond its isotropic fallback, without a consistent claim that it increases global travel or polarization.

| Seed | Arm | Accepted / retired / final population | Active-ant s (300–600) | Capacity-limited ticks (600 s) | Same-flow ant-ticks | FOOT_CONTACT events / legs | Plate / Nodule births | Material coverage / centroid at 600 s | Buried layer cells | SurfaceField mean | Pheromone sector total / directional concentration |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| 20261005 | CONTROL | 866 / 848 / 18 | 4,859.7 | 1,937 | 23,203 | 29,593 / 87,310 | 35 / 26 | 78.5% / (.496,.532) | 47,749 | .277 | 4.810 / .197 |
| 20261005 | TREATMENT | 868 / 849 / 19 | 5,198.9 | 1,751 | 29,418 | 29,092 / 85,740 | 35 / 22 | 80.7% / (.490,.539) | 43,097 | .273 | 4.786 / .161 |
| 20261006 | CONTROL | 857 / 839 / 18 | 5,117.5 | 1,930 | 26,338 | 29,778 / 87,871 | 33 / 23 | 76.5% / (.451,.557) | 44,791 | .279 | 5.021 / .164 |
| 20261006 | TREATMENT | 875 / 855 / 20 | 5,155.2 | 1,758 | 27,595 | 29,980 / 88,450 | 34 / 21 | 76.7% / (.474,.536) | 41,820 | .280 | 5.035 / .170 |
| 20261007 | CONTROL | 843 / 825 / 18 | 4,843.9 | 2,639 | 25,689 | 28,604 / 84,352 | 28 / 20 | 75.3% / (.519,.552) | 33,513 | .271 | 5.631 / .181 |
| 20261007 | TREATMENT | 834 / 822 / 12 | 5,096.9 | 2,968 | 25,104 | 29,687 / 87,538 | 29 / 24 | 76.8% / (.538,.550) | 34,993 | .280 | 4.738 / .163 |

No shared material or surface advantage follows from these values. Plate/Nodule counts, coverage, buried history, contacts, and pheromone geography move differently by seed. Seed 20261007 TREATMENT ends at 12 active ants versus CONTROL's 18, while its 300–600 s mean population is 16.99; this endpoint difference is part of the chronology, not evidence of persistent recruitment failure.

## Fixed visual handoff

All images use the unchanged `AntRenderer`, 720×720 render scale, identical 752×824 capture viewport, material On, pheromone Off, and no per-panel normalization. The HTML and browser checks reported zero page/console errors. See:

- [All seeds and times](visual/all-seeds-time-comparison.png)
- [Seed 20261005 comparison](visual/seed-20261005-comparison.png)
- [Seed 20261006 comparison](visual/seed-20261006-comparison.png)
- [Seed 20261007 comparison](visual/seed-20261007-comparison.png)
- [Image hashes and dimensions](visual/manifest.json)

Each seed comparison contains matched 60, 120, 300, and 600 s captures. These images are for direct author review; no artistic acceptance is inferred.

## Research interpretation and boundary

The intervention operated in its own isotropic-starting histories; direct q use persisted in every 60 s window, and the measured R/w distributions show nontrivial directional conditioning. The q headings were followed by positive short-horizon realized displacement along q in every seed. Angular and spatial occupancy differed consistently in magnitude across the three paired seed units. Windowed q directions changed rather than converging on one common fixed direction. Placement clearance rejection increased, but successful recruitment continued, no retry remained at the endpoint, capacity suppression was zero, and sampled domain/nonfinite/overlap checks were clear.

That evidence supports **FLOW DISTINCT / WORTH ARTIST REVIEW** for this 600 s, three-seed comparison. It does not show artistic superiority, biological recruitment, long-term regime stability, lower material saturation, or production suitability. It does not test the fixed spawn-position responsibility. No north-heading arm, pheromone-heading rerun, longer extension, threshold relaxation, production change, PR, merge, adoption, or Chemical Residence work occurred. Chemical Residence remains paused until the heading question is closed.

## Evidence index

- [Locked protocol](PROTOCOL.md)
- [Run and paired summary](analysis/summary.json)
- [All 60 time-window records](analysis/temporal-windows.json)
- [Per-run RNG, spawn events, frames, material and lifecycle records](analysis/)
- [Post-run validation checks](VALIDATION.md) and [machine-readable validation](analysis/validation.json)
- [Final classification](analysis/final-decision.json)
- [SHA-256 manifest](MANIFEST.sha256)
