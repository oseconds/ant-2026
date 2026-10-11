# Retained material -> locomotion causal A/B

**Decision: SUPPORTED for this fixed candidate as a production-world-law candidate; not adopted.** Three matched natural runs show the bounded slowdown, consistently lower total travel and foot-contact counts, longer exposure episodes, and changed later environmental/material maps. Plate birth and final coverage directions vary by seed. No movement stall, population collapse, forced Plate occupancy, or unbounded stack growth was observed. The switch remains default Off.

## Direction and candidate

The user-selected direction: material history left by ants should become an environmental condition that later living ants can pass through and experience, rather than only a record that remains and sounds.

This pass tested only whether accumulated exposed stratigraphy weakly increases local locomotion resistance. Treatment reads only the current cell's public layer count L. Empty cells have L = 0.

    m(L) = 1 - 0.10 * (1 - exp(-L / 4))

| L | Multiplier |
| ---: | ---: |
| 0 | 1.0000 |
| 1 | 0.9779 |
| 4 | 0.9368 |
| 10 | 0.9082 |
| unbounded L | approaches 0.9000 |

One public stratigraphy snapshot is captured at tick entry, before intention/movement. After existing steering, turning, crowding, following-speed and hesitation calculations, Treatment multiplies desiredSpeed once immediately before targetSpeed assignment and accelerateToward. Same-tick FOOT_CONTACT, Plate birth, nodule birth and topology changes first affect the next tick. Heading, steering, target position, attraction/avoidance and direct deposition gain are not inputs. No Plate identity, age, depth or material character is used.

## Baseline, runs and validity

- Production baseline: 27d2deab8fe0495c740023793820efd3dd8994a4.
- A/B branch base: f09d67f1eab6f13e7466e1f8ea8c05c08145f995, the retained-material shadow commit and direct child of that production baseline.
- Branch: ant-retained-material-locomotion-ab.
- Conditions: default AntController settings, seeds 20261005 / 20261006 / 20261007, 600 simulated seconds, fixed 60 Hz, counted LCG from the existing replay harness, no audio bridge or state overrides.
- All Control runs completed first. Their 36,001-row per-field SHA-256 chains matched the saved shadow-baseline chains exactly for all 14 fields and all three seeds. Fields cover trajectories/lifecycle, RNG, pheromone, SurfaceField, gait/body pose, deposition, recruitment, occupancy, contact/birth events, TrailPlateBirth and MaterialStratigraphy.
- The read-only observer was checked at every pre-tick boundary in all six runs and never changed the preceding production-state hash row. No Control/Treatment hash equality is claimed after trajectories diverge.
- Prior shadow exposure/parity evidence was reused; the shadow experiment was not rerun as a separate study.

## Manipulation validation

Treatment observed L = 0 for 44.42-52.64% of active ant-ticks and L > 0 for 47.36-55.58%. Weighted mean multipliers while exposed were 0.93748, 0.93490 and 0.93212; across all active ant-ticks, including L = 0, they were 0.96771, 0.96917 and 0.96227. Exposed layer-count weighted means were 5.34, 5.90 and 6.57; observed ranges were 1-23, 1-32 and 1-35.

The harness asserts m(0) = 1 for every empty-cell sample. The focused test checks the equation, default-Off configuration, and that heading/intent are resolved identically before a one-tick layer-1 slowdown. Treatment mean desiredSpeed before/after the multiplier was 0.05802837 -> 0.05615399, 0.05774176 -> 0.05588707, and 0.05760498 -> 0.05535463. These are manipulation checks, not emergent findings.

## Paired results

| Seed | Exposed ant-time, Control -> Treatment | Episodes, count and median / p90 duration | Mean applied multiplier while exposed | Travel distance, Control -> Treatment | FOOT_CONTACT points, Control -> Treatment | Plate births, Control -> Treatment |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 57.01% -> 51.65% | 2,497 (0.92 / 7.87 s) -> 2,147 (0.98 / 8.57 s) | 0.93748 | 641.26 -> 630.83 (-1.63%) | 105,759 -> 104,222 (-1.45%) | 32 -> 29 |
| 20261006 | 48.13% -> 47.36% | 1,891 (1.17 / 8.43 s) -> 1,665 (1.25 / 9.25 s) | 0.93490 | 634.37 -> 619.49 (-2.35%) | 104,829 -> 102,250 (-2.46%) | 28 -> 33 |
| 20261007 | 57.94% -> 55.58% | 2,195 (1.02 / 8.90 s) -> 1,840 (1.30 / 10.48 s) | 0.93212 | 636.01 -> 617.07 (-2.98%) | 105,001 -> 101,772 (-3.08%) | 31 -> 38 |

Every seed showed lower total travel and lower mean realized speed: 0.05803 -> 0.05584, 0.05750 -> 0.05555, and 0.05756 -> 0.05500. Active ant-time increased in all three Treatment runs. FOOT_CONTACT points per active ant-minute fell from 574.2 -> 553.5, 570.2 -> 550.1, and 570.1 -> 544.3; points per travelled-distance unit stayed near 165 in all six runs, so the contact-count reduction tracks reduced travel and is not independent confirmation. Exposure fraction and episode count fell in all three pairs, while median and p90 episode duration rose in all three. An episode is continuous ant-center occupancy of any exposed material; changing top Plate identity does not close it, so these durations are not dwell time on one Plate or cell. Right-censored episodes were 20/2,497, 21/1,891, 21/2,195 Control and 20/2,147, 18/1,665, 14/1,840 Treatment (about 0.8-1.1%).

Repeated top-Plate encounter bouts were 7,840 -> 6,549, 6,960 -> 6,821, and 8,373 -> 7,754; ants with at least one repeated identity encounter were 640 -> 556, 500 -> 485, and 580 -> 570. Distinct top Plate identities encountered were 32 -> 29, 28 -> 33, and 31 -> 38, a mixed direction. A repeated bout means an ant changed onto a top Plate identity it had already encountered earlier in that run.

Treatment pre-entry exposure was 4,623.03 s / 617 ants, 3,923.83 s / 474 ants, and 4,604.73 s / 584 ants. This uses the existing observer's public Plate-birth provenance; it is not a treatment input.

## Time effects

Exposure rises strongly over the run. The table shows unweighted three-seed means for exposure fraction and realized speed, per-seed mean travel distance, and summed FOOT_CONTACT points:

| Window | Plate exposure, Control -> Treatment | Mean realized speed, three-seed mean, Control -> Treatment | Mean distance per seed, Control -> Treatment | Contact points, summed Control -> Treatment |
| --- | ---: | ---: | ---: | ---: |
| 0-200 s | 5.12% -> 3.70% | 0.057462 -> 0.057416 | 180.84 -> 180.55 | 89,778 -> 89,566 |
| 200-400 s | 61.79% -> 54.98% | 0.057393 -> 0.055645 | 228.10 -> 219.95 | 112,501 -> 108,719 |
| 400-600 s | 86.31% -> 84.73% | 0.058192 -> 0.053799 | 228.26 -> 221.96 | 113,310 -> 109,959 |

Across seed-averaged windows, mean active population was 15.74 -> 15.72, 19.87 -> 19.76, and 19.61 -> 20.63. The share of ticks at the recruitment population limit was 39.9% -> 39.5%, 9.2% -> 10.2%, and 5.9% -> 11.9%; per-seed values are in paired-windows.csv. Seed 20261006 had no Plate exposure during 0-200 s, and its Control/Treatment distance, contact, population and material-birth counts matched in that window. Later windows varied by seed.

## Downstream history and openness

- Movement changed consistently: mean realized speed fell 3.4-4.4% in every matched seed while active ant-time increased. Total FOOT_CONTACT points also fell, but contacts per unit travelled distance remained about 165, so this count follows the reduced travel. Final pheromone mass was lower in each Treatment (237.4 -> 222.7, 221.1 -> 217.7, 235.7 -> 221.1). SurfaceField mass changed little in seed 05 and was lower in seeds 06/07.
- Material outcomes did not move in one scalar direction. Plate births were 32 -> 29, 28 -> 33 and 31 -> 38; repeat births were 2 -> 1, 2 -> 3 and 1 -> 3. Final exposed-cell coverage was 66.72% -> 70.80%, 66.34% -> 65.44%, and 70.07% -> 65.46%. Maximum final layer count was 29 -> 25, 27 -> 32 and 29 -> 35. Fixed 24x24 spatial maps and per-window L1 comparisons show later field/coverage differences; they are descriptive, not morphology targets.
- Nodule births totaled 32 in every run and condition, reaching the existing cap. That path is saturated and cannot show uncapped late nodule divergence.
- Spawned / retired ants were 765/744 -> 755/734, 705/684 -> 689/668, and 743/722 -> 736/717. Median lifetime was 12.72 -> 12.58 s, 12.93 -> 13.13 s, and 12.73 -> 13.47 s. Population ranged from 2 to 23 in all six runs; final population was 21 / 21 / 21 Control and 21 / 21 / 19 Treatment. No prolonged population or recruitment collapse was observed.
- Zero-displacement ant-ticks were zero in all six runs. All 16 coarse heading bins remained occupied in every 200 s window in both conditions. Late-window Plate occupancy ranged from 78% to 89%, rather than forcing every ant onto a Plate cell. Layer counts increased in some Treatment maps and decreased in others; no runaway accumulation appeared. The candidate's maximum slowdown remains bounded at 10%.

**Interpretation:** this exact weak link changes later locomotion and environmental history in a reproducible, bounded way. The consistent activity response is lower realized speed and travel with longer exposed-material episodes; Plate-birth/coverage effects vary across seeds. That supports carrying this fixed candidate forward for production-world-law consideration. It does not support a general claim that more retained material always reduces Plate formation, increases stacking, or improves the world.

## Validation and independent review

- Focused candidate test: 3/3 passed; full npm test suite: 297/297 passed. Logs: focused-test.log and npm-test.log.
- npm run build succeeded. Vite reported annotation-position warnings in the installed zod bundle and a minified-chunk advisory above 500 kB; no build error occurred. See npm-build.log.
- A fresh read-only independent review found no blocking issues in timing, future-state isolation, default-off parity, treatment isolation, or the bounded-candidate interpretation. It confirmed that contact counts are coupled to travel and that exposure episodes span any exposed material, as qualified above. See independent-review.md. The reviewer did not rerun the simulations, tests or build.

## Decision and stop boundary

**SUPPORTED** for the fixed equation, sign and gain as a production-world-law candidate. This is not production adoption. The experiment switch is default Off. No gain tuning, sign flip, second mapping, steering, attraction/avoidance, vitality, after-effect, material-character, social or acoustic feedback was tested or added. TrailPlateBirth and MaterialStratigraphy laws and Plate geometry remain unchanged.

## Limitations

Three deterministic seeds and one 600 s baseline do not estimate uncertainty across all runs. After first treatment divergence, each paired trajectory evolves freely; later field differences are the total effect of the single link, not an isolated residence-time estimate. Pre-multiplier desiredSpeed is reconstructed per tick as post-multiplier targetSpeed divided by the exact applied factor; the controller has no measurement callback or added state. Nodule saturation limits inference on that branch. Position/contact and environmental summaries use one fixed 24x24 aggregation grid; no morphology-selection plot was made. Exposure means ant-center occupancy, while FOOT_CONTACT is counted separately.

## Reproduction and package

Run from the experiment branch with the pinned commits and a fresh empty output directory:

    node scripts/ant-retained-material-locomotion-ab.js --baseline=f09d67f1eab6f13e7466e1f8ea8c05c08145f995 --seeds=20261005,20261006,20261007 --seconds=600 --output=docs/ant/evidence/replays/retained-material-locomotion-ab-REPLAY-ID

The script refuses a nonempty output folder and requires the saved shadow evidence to check Control hashes. It records run source hashes, conditions, timing and reproduction command.

The package includes per-seed Control/Treatment summaries and ant/episode records, paired 200 s comparisons, one-second population/recruitment series, 24x24 environmental maps, spatial differences, Control parity chains and source hashes. The authoritative prior shadow evidence is [retained-material-experience-shadow-final](../2026-10-11-retained-material-experience-shadow-final/README.md).
