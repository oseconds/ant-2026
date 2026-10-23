# Angular-feedback movement probe results

## Scope and source receipt

This is a bounded controller experiment, not an implementation change. The only movement candidate multiplies the existing previous-angular-velocity contribution by `dt`:

```text
production:  -clamp(previousOmega, -2.2, +2.2) * 0.65 * adherence
dtFeedback: -clamp(previousOmega, -2.2, +2.2) * 0.65 * adherence * dt
dampingOff:  0
```

At the fixed `dt = 1/60`, `dtFeedback` is a large response reduction: the term’s maximum magnitude at full adherence changes from about `1.43 rad` to `0.0238 rad`. This probe does not establish a general units correction or make the rest of the controller frame-rate independent. `dampingOff` is a diagnostic ceiling, not a proposed production mode.

The controlled matrix is 108 fresh cases: six fixed geometries, two unchanged/frozen cues, three seeds, and three movement modes; each is 180 exact `AntController.tick(1/60)` steps. Population is set to one after normal initialization and the next spawn is cleared; a tick assertion prevents recruitment. Existing sensors, field sampling, collision, gait, and material logic remain in the production path. The analytic cue and deposited 96×96 cue are specified in [protocol.md](protocol.md).

The prior-control reuse gate was deliberately strict. The preserved controlled input SHA-256 is `9615a86610e651753e89b3abea0a2a15527f26af6a12b63d86dc21f348b19578`; four production-source hashes matched the prior run, but multiple complete per-tick fixture replays did not. Therefore no old controls were mixed into the results: all 108 cases were run fresh. The exact pre-natural-helper source is preserved at [controlled-v1/ant-spatial-movement.js](source-snapshots/controlled-v1/ant-spatial-movement.js), SHA-256 `5fa22b68dba60c8298d0851209e010230b1f17e8fc991dc36fac7364e9b8893f`. The raw samples and compatibility checks are in [controlled-results.json](controlled-results.json.gz).

The three matched production natural baselines are in [baseline evidence](../baseline/README.md). After the parent authorized the natural screen and the runner confirmed its source freeze, I ran only `dtFeedback` at seeds 20261005, 20261006, and 20261007, plus `dampingOff` at seed 20261005. Every natural run is 600 model seconds at 60 Hz with the production field and the north recruitment observer. The observer changes only heading selection; its RNG and public-state parity were checked separately. Natural paths diverge, so same-seed comparisons are paired starting conditions, not identical trajectories or independent causal estimates.

## Controlled route tracking

The following values are medians across the three seeds. `offset` is mean absolute cross-track distance; `progress` is projected route progress; `sign` is local route-turn sign agreement. A straight route has no meaningful curvature sign, so its sign agreement is null. The raw result retains signed and absolute turn, per-distance measures, speed, low-speed fraction, cap occupancy, body-rate reversal, and collision statistics for every case.

| Fixed route cue | Production: offset / progress / sign | dtFeedback: offset / progress / sign | dampingOff: offset / progress / sign |
|---|---:|---:|---:|
| R=0.25, analytic | 0.02563 / 0.19863 / 0.536 | 0.00149 / 0.26523 / 0.648 | 0.00159 / 0.26539 / 0.905 |
| R=0.25 mirror, analytic | 0.03560 / 0.20627 / 0.503 | 0.00140 / 0.26138 / 0.693 | 0.00137 / 0.26146 / 0.922 |
| R=0.10, analytic | 0.04918 / 0.13402 / 0.503 | 0.00279 / 0.27281 / 0.693 | 0.00293 / 0.27184 / 0.972 |
| R=0.10 mirror, analytic | 0.06001 / 0.12307 / 0.480 | 0.00146 / 0.25943 / 0.698 | 0.00135 / 0.25993 / 0.994 |
| R=0.25, deposited | 0.01661 / 0.22729 / 0.520 | 0.00340 / 0.26336 / 0.648 | 0.00337 / 0.26344 / 0.682 |
| R=0.10, deposited | 0.05516 / 0.15170 / 0.520 | 0.00456 / 0.26277 / 0.849 | 0.00448 / 0.26307 / 0.860 |
| R=0.25 mirror, deposited | 0.07240 / 0.15743 / 0.464 | 0.07401 / 0.15635 / 0.430 | 0.07401 / 0.15634 / 0.430 |
| R=0.10 mirror, deposited | 0.07620 / 0.08497 / 0.486 | 0.07932 / 0.09231 / 0.547 | 0.07932 / 0.09231 / 0.547 |
| S curve, analytic | 0.03748 / 0.27149 / 0.497 | 0.00159 / 0.26428 / 0.620 | 0.00157 / 0.26432 / 0.933 |
| S curve, deposited | 0.04687 / 0.17704 / 0.497 | 0.07427 / 0.10794 / 0.542 | 0.07427 / 0.10793 / 0.542 |

On analytic circles of both radii and both orientations, the candidate sharply lowered offset and advanced along the route. The deposited cue also improved positive-orientation arcs. The deposited mirrored arcs and deposited S curve are explicit failures: candidate offset remains about `0.074–0.079`, with little route progress, and is no better than the damping-off diagnostic. This prevents a general “curvature tracking solved” claim.

The candidate reduced but did not eliminate body-angular-velocity reversals in analytic arc cases. For example, on R=0.25 analytic the median reversal fraction was `0.966` in production, `0.726` with dtFeedback, and `0.050` with damping off; turn-cap occupancy was `0.811`, `0.017`, and `0.017`. On R=0.10 analytic those values were `0.966`, `0.849`, and `0.056` for reversal, and `0.894`, `0.139`, and `0.044` for cap occupancy. Thus the candidate materially changes the dynamics, while damping off often tracked signs better in this short synthetic assay.

## Natural screen

Each candidate/diagnostic result has 36,000 ticks, 600 one-second spatial/material frames, 6,000 ten-hertz trajectory frames, and detached full public snapshots at 30, 120, 300, and 600 seconds. All four ran to 600 seconds, completed all ticks, contained no non-finite numeric fields, and had zero frozen-source mismatches. Curvature windows overlap across ants and time; their counts are descriptive samples, not independent replicates.

| Seed | Mode | Spawned / retired | Plates at 600 s | Union fraction | Buried layer cells | Mean depth (m) | 1 s same-sign turn-pair fraction | Adjacent-tick path-turn correlation within 1 s windows | Turn-cap fraction | Valid-flow ticks |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | Production baseline | 755 / 734 | 29 | 0.7080 | 35,911 | 0.00924 | 0.0936 | −0.6321 | 0.8830 | 15.96% |
| 20261005 | dtFeedback | 311 / 290 | 10 | 0.4354 | 6,723 | 0.00280 | 0.8498 | +0.7843 | 0.1489 | 7.78% |
| 20261005 | dampingOff diagnostic | 259 / 238 | 18 | 0.4834 | 15,775 | 0.00602 | 0.9389 | +0.8787 | 0.1432 | 3.69% |
| 20261006 | Production baseline | 689 / 668 | 33 | 0.6544 | 44,673 | 0.01240 | 0.1067 | −0.5947 | 0.8726 | 12.99% |
| 20261006 | dtFeedback | 318 / 297 | 15 | 0.4551 | 12,659 | 0.00509 | 0.8568 | +0.7969 | 0.1437 | 5.32% |
| 20261007 | Production baseline | 736 / 717 | 38 | 0.6546 | 52,006 | 0.01440 | 0.0929 | −0.6422 | 0.8823 | 13.79% |
| 20261007 | dtFeedback | 263 / 242 | 18 | 0.4733 | 14,993 | 0.00582 | 0.8396 | +0.7684 | 0.1438 | 6.09% |

Across the three descriptive seed summaries, dtFeedback changed mean one-second path-turn persistence from `0.0977` to `0.8487`, adjacent-tick lag-1 correlation from `−0.6230` to `+0.7832`, and turn-cap occupancy from `0.8793` to `0.1455`. The one-second designation is the aggregation window; lag one is one 1/60-second sample. Mean absolute one-second travel turn fell from `1.3515` to `1.0517 rad`; mean chord/path ratio fell from `0.9900` to `0.9602`. Mean one-second net-displacement rate was `0.0527` versus `0.0516`, while mean ant count was `18.72` versus `19.60` and mean gyration radius was `0.3058` versus `0.3071`. Net-displacement rate is affected by curved travel and is not evidence of unchanged path speed. These observations support that the strongly alternating, cap-saturated movement pattern was reduced in these runs.

That movement change came with a substantial lifecycle/material difference. Across the three seeds, production averaged 726.7 births and 33.3 Plates versus 297.3 births and 14.3 Plates under dtFeedback. Mean union fraction was `0.6723` versus `0.4546`, buried layer cells `44,197` versus `11,458`, and mean depth `0.0120 m` versus `0.0046 m`. Pheromone mass was higher under dtFeedback in the one-second frames (`242.6` mean versus `187.1`), so reduced Plate extent does not simply mean less pheromone mass. All runs ended with 32 Nodules, which did not distinguish these conditions. These are coupled outcomes after movement divergence; they do not establish whether the movement law, subsequent spawn cadence, contact distribution, or their interactions caused any one material difference.

Flow-valid ticks also fell from mean `14.25%` to `6.40%` and accepted spawns with valid flow from `15.44%` to `8.23%`. This records availability under the existing geometric/speed gates while movement changes. The field remained production; no field kernel or CIC condition was tested, and these counts do not reject a field mechanism.

## Interpretation and limits

The strongest countermodel is that `dtFeedback` behaves close to damping-off at 60 Hz: its added factor scales the old term by `1/60`, and the diagnostic shows similarly low cap occupancy and high path-turn persistence. In the analytic arc assay the damping-off condition often had better route-sign agreement than the candidate. The experiment therefore does not isolate a uniquely useful temporal correction from simply removing most of the old feedback. No gain search or alternative coefficient was run.

The candidate met a narrow capability result: it sharply improved fixed-route tracking on analytic arcs of both signs and reduced the natural-turn alternation/cap pattern across three seeds. It failed on deposited mirrored arcs and the deposited S curve, had substantially different birth and material outcomes, and reduced flow-observation availability. Keep it as a research candidate only. Do not treat the screen as proof of biological curvature sensing, natural route choice, general stability, frame-rate invariance, or improved material formation.

## Reproduction and verification

Controlled output: [controlled-results.json](controlled-results.json.gz). Natural outputs: [dtFeedback seed 20261005](natural/dtFeedback-20261005/result.json.gz), [seed 20261006](natural/dtFeedback-20261006/result.json.gz), [seed 20261007](natural/dtFeedback-20261007/result.json.gz), and [dampingOff seed 20261005](natural/dampingOff-20261005/result.json.gz). Each natural folder includes an exact source snapshot.

Natural result SHA-256 values:

| Result | SHA-256 |
|---|---|
| dtFeedback, 20261005 | `418142326ea2fea06aee7a8fb1ba49360c493b541cff0c581dfa0451bd9ad70a` |
| dtFeedback, 20261006 | `e248a10f4a168bcbb1f23aa957a281882a8a7033fa1d01c24fb0c500f3d9c904` |
| dtFeedback, 20261007 | `3c8a551b92ed956709bdcb6cd73c7acc14da85f36bc2e1c792603cec62e333c3` |
| dampingOff, 20261005 | `3dd562cdd0b56a5b80e964f1a16a08d8c4e9ccd5b59cd4160d3591f63ce2aded` |

The natural `dtFeedback` transformed-controller SHA-256 is `1d9e8cd2508e274f0275c5e790b6924411ab2e4a2c29ffd45dfbf3376e27afdd`; the production controller SHA-256 is `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04`. The `dampingOff` transformed-controller SHA-256 is `8bfcd30140c717ac239e32ad489a4df0c7f779fbf8c701a059ecbaa7bd7df69a`. For natural runs, core SHA-256 is `6573ef627e050f0cdd23279d886f1a8c2adf224fdcf840370fe35db5c051de4b`, production-field helper `fb6d5caeafcbc009b1b373edb681d9e8505454d05924284822c4682fea261364`, runner `a84e8b9f10f997598426e985faef42f76144542499cb1c68ecef20d782f0d632`, and spatial descriptors `1c7b64b480909865f3b5549433036a0ed6498ed3c2eeacac5aca0fa595c12524`. The complete per-run source maps and controller receipts are embedded in each result; their frozen copies were independently rehashed with no mismatches.

`node tests/ant-spatial-movement.test.js` passed 4/4 directly. Initial sandboxed `node --test` returned `spawn EPERM`. The parent later ran the complete suite with permitted process execution: **364/364 passed**, including these tests. See `../validation/full-tests-final.txt`.
