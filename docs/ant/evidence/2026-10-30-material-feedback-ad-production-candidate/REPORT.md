# Material slowdown + A/D production candidate integration

## Decision

**PRODUCTION-CANDIDATE SUPPORTED** — direct-consumer classification: **DISTINCT**.

In the registered 20261005 / 600 s matched pair, the 10% slowdown remained active, A changed the angular-rate limit under the same requested headings, and D changed the final desired-speed target on a substantial subset of eligible material-exposed same-flow calls. The integrated candidate had no recorded finite, cap, collision-overlap, population-ceiling, contact-count, Plate-count, monotonic-time, or field-finiteness violations. It produced no zero-displacement saved one-second intervals, and the treatment observer recorded no exact-zero movement ticks.

This supports a separate production-adoption or author-viewing decision. It does not approve a merge, production adoption, a final physical interpretation of `L`, or artistic acceptance. Total blocked frames were 13.2% higher in this single run; this remains a cost to inspect, not a pathology verdict by itself.

## Authority and provenance

- Fresh research base: `origin/main = 15667c73e9f507bf89dea645f966bc7f58301fdc`.
- Behavioral source pin: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- The complete diff from that behavioral pin to current `origin/main` is limited to `.github/workflows/deploy.yml` and `vite.config.js`. `src/`, `static/`, root `README.md`, and `docs/ant/README.md` are byte-identical by Git diff.
- Research branch: `codex/ant-material-feedback-ad-production-candidate-20261030`, based directly on the fresh main SHA above.
- Prior evidence reused: A/D composition `10b1cbd877f4130924be83daa37fe8c40e9b230c` (direct responsibilities complementary; activation contexts overlap), surface-vs-depth `18fed8fbca82e8b86dfc88779cd6e11b797a2439` (registered laws remain depth-sensitive), material-information audit `e888624879c90933c2b16d6e9b42d12a8339e814` (multi-axis; this pass deliberately retains the registered `L` input).
- Control reused without rerun: `codex/ant-material-pheromone-attenuation-screen-20261030@2414d1a9b580296c9c38d4fb796904525a843b78`, exact frozen current-G/H0 control, 10% slowdown on and A/D off. It is seed `20261005`, G, 60 Hz, 600 s, Audio Off; initial-state SHA-256 `f480c2fd61e34c4975539e50bdac3c3511aa4b73192473b317d6760e274f02fd`.
- A nearby frozen control from the material-information audit was rejected because its report states that material locomotion resistance was Off. It was not used for interpretation. See `CONTROL-REFERENCE.json`.
- Treatment: one 36,000-tick candidate run, same initial-state SHA, G / 20261005 / Audio Off. Treatment output and inputs are preserved under `data/treatment/`; reused control artifacts are under `data/control/`. Their summary, raw stream, checkpoints, and source receipt hashes are recorded in `paired-analysis.json`, `CONTROL-REFERENCE.json`, and `SOURCE-HASHES.json`.

## Implementation fact

The candidate code is production-shaped and changes only the three intended consumers.

- `AntAgent.turnToward(targetHeading, dt, maxTurnRate = ANT_MAX_TURN_RATE)` keeps the old two-argument behavior and limits the same turn toward the same native target heading.
- `AntController` samples one tick-entry `layerCountByCell` value per active ant from one stratigraphy snapshot and reuses it for slowdown, A, and D.
- A applies `4.5 rad/s × qA(L)` only as the turn-rate ceiling. It adds no material heading, attraction, avoidance, or angular-memory state.
- D multiplies only the existing `0.4 s` speed-based same-flow headway term inside the current `max(personal-space floor, headway distance)` calculation. Existing classification, response, opposing/emergency logic, route intent, and swept collision guard remain in place.
- The adopted `m(L)` is still applied once to final `desiredSpeed`, after following cap and hesitation. It is not applied again to the following calculation.
- No residence, C/G, allocation, UPDATE, maturation, BODY, or audio changes are present.

The source diff is recorded in Git. The exact changed and unchanged behavior-source hashes are in `SOURCE-HASHES.json`.

## Direct consumer measurements

The direct observer compared native and conditioned consumers on each candidate tick's same pre-consumer state. It did not compare separate A-only or D-only worlds. The fixed run produced 656,081 active ant-ticks; integer `L` ranged from 0 to 34 (p50 3, p90 13, p99 23). Material exposure accounted for 442,962 ticks / 7,382.7 ant-seconds (67.52%). The 0–120, 120–300, and 300–600 s windows are descriptive portions of one run, not replicates.

| Window | Material-exposed ant-ticks | Mean production multiplier on exposed ticks | A changed turn calls / exposed calls | D exposed same-flow calls | D final targets changed |
|---|---:|---:|---:|---:|---:|
| 0–120 s | 4,382 / 87,304 active ticks (5.02%) | 0.97359 | 4,260 / 4,382 (97.22%) | 447 | 252 (56.38%) |
| 120–300 s | 116,414 / 206,161 (56.47%) | 0.95081 | 112,208 / 116,414 (96.39%) | 8,603 | 5,347 (62.15%) |
| 300–600 s | 322,166 / 362,616 (88.84%) | 0.92183 | 310,709 / 322,166 (96.44%) | 31,368 | 16,095 (51.31%) |
| **All** | **442,962 / 656,081 (67.52%)** | **0.92996 mean** | **427,177 / 442,962 (96.44%)** | **40,418** | **21,694 (53.67%)** |

### Production slowdown

The registered `m(L) = 1 - 0.10 × (1 - exp(-L/4))` was checked against every integrated acceleration target. There were zero target-accounting failures, zero unmatched occupancy reads, and exactly one tick-entry material sample per acceleration call. At `L=1`, multiplier is `0.977880`; at `L=4`, `0.936788`; it approaches `0.9`. Across exposed calls the mean pre-slowdown desired target was `0.05949 m/s`, mean integrated final target was `0.05531 m/s`, and mean reduction was `0.00418 m/s`. The slowdown is present once, not duplicated by A or D.

### A — angular maneuverability

For each material-exposed turn call, the observer used the native requested heading to calculate both the native `4.5 rad/s` turn and the candidate `4.5 × qA(L)` turn. The candidate still passes the requested heading through unchanged. The conditioned cap bound on 427,177 calls (96.44% of material turn calls); 419,055 would have bound at the native cap. Mean suppression was `1.505 rad/s` over all material turn calls, including calls with no angular change. At `L=1`, the cap is about `4.002 rad/s`; at `L=4`, about `3.078 rad/s`; it approaches `2.25 rad/s` at high `L`. All observed angular rates stayed within the native global cap, and the observer recorded no accounting failure.

**Finding:** A retains a clear direct contribution with the production speed slowdown active.

### D — same-flow following headway

There were 63,774 native same-flow opportunities on the candidate trajectory; 40,418 occurred at `L>0`. Native and conditioned same-flow classifications had exactly equal counts. D changed the post-slowdown integrated target on 21,694 of the 40,418 material-exposed opportunities (53.67%). Mean candidate-minus-native final target difference over those opportunities, including unchanged calls, was `-0.00361 m/s`. The direction is consistent with more comfortable following headway lowering a follower's target where the existing cap is active. At `L=1`, `hD` gives about `0.444 s`; at `L=4`, about `0.526 s`; its asymptote is `0.6 s`. The personal-space floor remains controlling where larger, and opposing/emergency cases remain outside same-flow D handling.

**Ordering check:** D changes the following limit before the production slowdown. The paired shadow applies the same `m(L)` to both native and D-conditioned pre-slowdown targets; the measured changed targets therefore persist through the final integrated target, rather than only changing an intermediate value.

**Finding:** D retains a direct final-target contribution after the adopted slowdown.

### Interaction classification

**DISTINCT direct responsibilities, overlapping activation contexts.** A changes turn-rate ceilings; D changes same-flow headway and a portion of final speed targets; production slowdown changes speed magnitude. They can act on the same tick and the same `L`, but neither A nor D is made irrelevant by the slowdown in this run. This does not establish separate phase-space activation, independent material axes, or independent whole-world effects.

## Matched world response

The two runs had the exact same initial-state SHA. All compared 30 s and 60 s checkpoints, RNG call counts, pheromone and SurfaceField maps, and saved occupancy maps were identical. Both had the first Plate at `84.016667 s`. Differences appear after material becomes available. Later random-call totals diverge with the evolving world (`349,136` control versus `346,460` treatment); the treatment observer consumed no RNG and its same-seed unobserved comparison remained state- and RNG-identical for 120 ticks.

| Model time | Population C/T | Travel C/T | Blocked frames C/T | FOOT_CONTACTs C/T | Plates C/T | Buried layer-cells C/T | Pheromone node-sum C/T |
|---|---:|---:|---:|---:|---:|---:|---:|
| 30 s | 10 / 10 | 13.671 / 13.671 | 215 / 215 | 2,257 / 2,257 | 0 / 0 | 0 / 0 | 542.932 / 542.932 |
| 60 s | 13 / 13 | 30.769 / 30.769 | 580 / 580 | 5,099 / 5,099 | 0 / 0 | 0 / 0 | 1,226.503 / 1,226.503 |
| 120 s | 17 / 18 | 78.602 / 79.897 | 1,414 / 1,820 | 12,954 / 13,214 | 2 / 3 | 223 / 709 | 2,495.819 / 2,617.166 |
| 300 s | 21 / 20 | 272.735 / 279.359 | 4,410 / 4,752 | 44,861 / 46,043 | 14 / 13 | 16,960 / 14,255 | 3,788.821 / 3,682.443 |
| 600 s | 19 / 20 | 603.098 / 602.563 | 9,468 / 10,715 | 99,469 / 99,428 | 36 / 37 | 60,378 / 63,339 | 3,626.437 / 3,816.340 |

At 600 s the treatment had `−0.09%` total realized travel, `+0.64%` active-ant seconds, and mean realized speed `0.05515 m/s` versus `0.05551 m/s` in control. Contact groups differed by `−0.17%` and individual FOOT_CONTACT count by `−0.04%`. The recorded pheromone source requested/accepted dose was `8,226.71 / 8,225.90` in treatment and `8,057.12 / 8,055.32` in control; point writes were `100,800 / 100,882`. Pheromone node-sum was `+5.24%`. SurfaceField sum was `−1.75%`. Plate births were 37 versus 36, first-birth timing was unchanged, and buried layer-cells were `+4.91%`. Nodules were 8 versus 6 at 300 s and both reached the existing count of 32 at 600 s. These are downstream descriptions from one seed, not success scores or causal attribution to A versus D.

The saved SurfaceField maps show spatial redistribution after treatment divergence. At 600 s, raw compaction **C** had p50 `0.29365 / 0.28908` and p90 `0.56623 / 0.58021` (control / treatment); 8,262 of 9,216 values differed and the L1 difference was `0.23770` relative to control. Production `sampleSupport` mechanical support **D** was then recomputed read-only at its existing default radius `0.025`, with no new kernel: at the same 96×96 grid centers its p50 was `0.29630 / 0.29799`, p90 `0.55248 / 0.56792`, and 8,845 cells differed (relative L1 `0.18229`). At saved ant positions at 600 s, sampled support had mean `0.57657 / 0.55252` and median `0.60131 / 0.55230` (19 / 20 agents). These are point-in-time field readouts; support is deterministically derived from C and is not an independent causal treatment.

The saved occupancy maps also diverged spatially (cellwise receipts are in `spatial-checkpoint-differences.json`). At 600 s the cumulative occupancy-map L1 difference was `0.38425` relative to control and recent-30 s occupancy L1 was `1.28051`. Final activation was `0.83472 / 0.80956` (control / treatment); recruitment limit was 24 in both. The raw receipt preserves FOOT_CONTACT count by second and a stream hash, not per-contact coordinates; this pass therefore does **not** claim a direct raw-footprint comparison. Plate mask hashes, births, and layer summaries remain in the frozen raw and checkpoint artifacts.

## Safety and pathology checks

- Candidate finite violations: 0; speed-cap violations: 0; turn-cap violations: 0; swept-overlap violations: 0; population-ceiling violations: 0.
- Candidate field and SurfaceField non-finite checkpoint seconds: 0; monotonic-time, Plate-count, and contact-count assertion failures: 0.
- Candidate exact-zero movement ticks: 0 / 655,332 measured surviving-agent tick transitions; longest zero-tick streak: 0. Saved one-second exact-zero displacement intervals: 0 in control and 0 in treatment.
- Nearest ant-center distance at saved one-second poses: control p10/p50/mean `0.03538 / 0.07981 / 0.09794`; treatment `0.03553 / 0.07867 / 0.09612` world units. This is a descriptive proximity summary, not a collision threshold.
- Blocked frames rose from 9,468 to 10,715 (+13.17%), while newly blocked frames were 1,590 versus 1,448. The run did not show zero-motion streaks, overlap violations, a population ceiling hit, or loss of admissions. Blocked-frame growth remains a congestion cost to inspect. Location-indexed long-lived jam duration was not recorded, so this evidence does not rule out every localized congestion pattern.
- Admissions were 774 control / 768 treatment; retirements 756 / 749; final populations 19 / 20; recruitment limit 24 in both. No recruitment collapse or ceiling violation was recorded.

## Interpretation and limit

**Measurement:** the three registered consumers all operated on the same tick-entry `L`; A and D retained direct signatures in the integrated candidate. World-level travel and FOOT_CONTACT totals stayed close in this one run, while Plate/layer and pheromone histories diverged modestly after first materialization.

**Research interpretation:** the candidate did not show obvious stall, collision, field, population, or timing pathology. The increased blocked-frame count is a real caution. On the requested single-seed screen, the evidence supports keeping the exact candidate available for a separate adoption or author-viewing decision.

**Authored meaning:** `L`-conditioned A/D is a production candidate under the already-tested input variable. The multi-axis material audit remains true: `L` is not established as the final physical or artistic descriptor. No A→stiffness, D→foot-load, SurfaceField mapping, or latent consolidation coordinate is implied.

This is one matched seed and one treatment. It cannot establish cross-seed stability, long-term world quality, an artistic preference, or which responsibility caused each downstream world difference.

## Viewing handoff

See `VIEWING.md`. The candidate remains on this research branch. The local ANT view is for the author's visual inspection; Audio stays Off. The quantitative run is the fixed 20261005 / 600 s record in `data/treatment/`, not a seeded browser replay.

## Validation record

- Reused control run-summary, raw stream, five checkpoint, and source-manifest checksums: verified against `CONTROL-REFERENCE.json` by `--analyze`.
- Initial-state hash and all 30 s / 60 s checkpoint/map parity: exact.
- A/D law equations, bounds, and `L=0` identity: checked; observer-versus-unobserved candidate state and RNG parity: exact for 120 ticks.
- Candidate run: 36,000 ticks; one material sample / one occupancy read per acceleration call; zero law-accounting failures, unmatched reads, and observer RNG draws.
- Analysis rerun: deterministic paired reports generated from the frozen raw and summary files; data/report agreement is represented in `paired-analysis.json`, `paired-checkpoints.csv`, and `paired-timeline.csv`.
- Compaction C was read from the frozen SurfaceField map; mechanical support D was sampled from that same map using production `SurfaceField.sampleSupport` at the existing default radius. No field was written or fed back.
- Focused checks passed: `tests/ant-material-feedback-ad-production-candidate.test.js` (2), `tests/ant-controller.test.js` (23), `tests/ant-material-locomotion-resistance.test.js` (4), `tests/ant-trail-following.test.js` (8), `tests/ant-traffic.test.js` (4); `node --check` on both new/modified research scripts; `git diff --check`.
- Full repository build/test and browser visual acceptance were not run. Production source, static assets, and canonical README remain unchanged.
- `SHA256-MANIFEST.json` records package artifact hashes, excluding the manifest file itself.

## Explicit omissions

No new seed; no separate A-only or D-only world; no raw contact-position stream; no localized jam-duration instrumentation; no max-D/X calculation; no residence, C/G, allocation, UPDATE, maturation, BODY, audio, parameter tuning, production adoption, PR, merge, or force-push.
