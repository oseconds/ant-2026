# Material feedback A+D composition

## Decision

**COMPLEMENTARY — at the direct-consumer level only.**

The combined AD treatment preserved two distinct same-state responses: A changes angular motion through the native turn-rate cap, while D changes the final desired-speed target through the native same-flow following cap. Both responses occurred together in actual ant-ticks, and the D target shadow matched the treatment consumer across all recorded movement observations. No new mode selector or shared material knob was needed.

This is not strict activation orthogonality. Of 21,501 changed D targets, 21,172 (98.47%) occurred on ticks where A also changed angular motion. The laws have separate consumers, but their active contexts often overlap. The single 600 s world showed no invariant failure or exact zero-displacement one-second interval; its late maps and material history remain one-seed endogenous outcomes, not evidence of synergy or preferred morphology.

No candidate law was adopted into production.

## Question and scope

Test whether the already-screened material-conditioned angular maneuverability A and same-flow following headway D can coexist through their native consumer paths, without explicit material modes or a shared master control. The primary evidence is the same-state direct consumer shadow and per-ant/tick context partition. Cross-arm world differences are secondary and descriptive.

The pass reused frozen neutral N, A-only, and D-only current-G/H0 evidence and ran one new AD treatment. Seed 20261005; 60 Hz; 600 model seconds; Audio Off; production 10% locomotion resistance Off; chemical residence Off; other candidate laws Off.

The registered laws were kept fixed and both read the tick-entry public layer count L:

- A: qA(L) = 1 − 0.50 × (1 − exp(−L/4)); scale the native 4.5 rad/s turn ceiling only.
- D: hD(L) = 0.4 × (1 + 0.50 × (1 − exp(−L/4))); scale the native 0.4 s comfortable headway only.

## Authority and provenance

- Production authority: origin/main 4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785.
- Research parent: codex/ant-organism-feedback-candidate-survey-20261030 at 9b5ef8d6247fc3c9d6237d9d0c9082d8c3546a49.
- Research branch: codex/ant-material-feedback-ad-composition-20261030.
- All four arms have the same initial-state SHA-256: f480c2fd61e34c4975539e50bdac3c3511aa4b73192473b317d6760e274f02fd.
- Exact input, frozen-arm, and production-source receipts are in data/ad/PROVENANCE.json. N/A/D came from their existing discovery and candidate-survey packages.
- The 40 parent late opportunity anchors were reused in all four arms, from tick 16801 at 280.0166667 s through tick 35955 at 599.25 s.

The complete run and postprocessing lineage is retained in PROVENANCE.json and CORRECTIONS.json. The one AD simulation was generated with instrumentation source SHA-256 5755b55b8d1f1e5979904629533fc353d61b8dac165e5a766dae2ef43b87f4a0. Post-run analysis uses source SHA-256 4933740dc4297be423f53df640e92f57198dae58c2f95ae0c676c6c562d7359d. The correction receipt records a postprocessing-only coordinate correction for the first joint event; no simulation replay or other raw run artifact changed.

## Implementation facts

The diagnostic wrapper observed the existing tick-entry material count, native turn request and cap, native same-flow classification, and the final desired-speed target. A changed only the turn-rate cap. D changed only the same-flow headway term and retained native personal-spacing, opposing-flow, hesitation, separation, and swept-collision handling. Production source behavior was not changed.

The research observer recorded zero RNG calls. The treatment can naturally follow a different RNG/lifecycle trajectory after the changed movement affects later world state; this is not observer-induced RNG perturbation. No explicit A/D mode state, attraction, destination, material gradient cue, or production feedback was introduced.

## Direct same-state measurements

Across 645,687 AD ant-movement observations:

| Context | Observations | Share |
| --- | ---: | ---: |
| A-only | 416,220 | 64.47% |
| D-only | 329 | 0.05% |
| A and D | 21,172 | 3.28% |
| Neither | 207,966 | 32.21% |

The four counts sum exactly to the observation total. At the one-second level, A-only appeared in 512 of 600 seconds, D-only in 77, and both in 388; these presence counts can overlap.

### A: angular response

There were 452,766 material turn calls. A changed the same-state applied heading in 437,392 calls (96.6%). Native cap binding occurred in 429,742 calls; the candidate cap bound in 437,392. Across changed calls:

- median heading difference from the same-state native shadow: 0.02913 rad;
- median actual angular rate: 2.6410 rad/s;
- median rate suppression: 1.7480 rad/s;
- requested heading remained the same input to the native and conditioned turn operation.

The first direct A event was tick 5042 at 84.0166667 s, ant-40, L=1. The candidate cap was 4.00230 rad/s versus the native 4.5 rad/s, with a 0.008295 rad same-tick heading difference.

The saved A-only world had 393,105 changed calls among 406,971 material turn calls (96.6%). The counts differ because the worlds diverge after material begins affecting movement; they are not paired trajectory samples.

### D: same-flow target response

There were 40,472 finite same-flow following opportunities; the changed headway expanded the native comfortable headway in 34,965 calls. The final target changed in 21,501 observations (3.33% of all movement observations). Across those changed targets, the median reduction was 0.008607 world units/s. The candidate final-target shadow matched the actual D consumer in all 645,687 observations.

The first direct D event was tick 5127 at 85.4333333 s, ant-50, L=1. Native headway 0.4 s became 0.44424 s; the final target changed from 0.062434 to 0.059408 world units/s.

The same ant and tick were the first joint A+D event. Its recorded position is the pre-movement consumer position, corrected after the run from a post-tick position using the same-tick D sample. The correction is documented in CORRECTIONS.json. In the surrounding saved seconds, both contexts appeared in seconds 85–88; A-only events continued in seconds 89–91. This gives a short diagnostic sequence of co-occurrence followed by A-only operation, without claiming matched cross-arm trajectories.

The saved D-only world had 15,248 changed final targets among 25,097 finite material-following calls. AD had more same-flow observations because its trajectory differs; the raw counts do not establish suppression or amplification between worlds. The within-AD simultaneous direct samples show that A did not remove D's final-target response.

## Downstream world comparison

These are single 600 s trajectories, not independent trials or additive effects.

| Arm | Travel | Active ant-s | Final population | Contact groups | Individual feet | Plate births | Pheromone node sum | SurfaceField C | Buried layer-cells |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N | 616.730 | 10,740.817 | 18 | 34,400 | 101,836 | 38 | 3,806.18 | 2,646.10 | 69,686 |
| A | 621.540 | 10,579.983 | 18 | 34,655 | 102,496 | 36 | 3,866.48 | 2,673.97 | 68,173 |
| D | 625.470 | 10,821.417 | 19 | 34,871 | 103,244 | 39 | 3,977.71 | 2,675.75 | 72,775 |
| AD | 620.493 | 10,761.450 | 16 | 34,590 | 102,341 | 39 | 4,014.33 | 2,629.07 | 70,742 |

All arms reached the existing nodule cap of 32. AD recruited 794 and retired 779 ants, reached population 23 at 300 s, and ended at 16. No finite, speed-cap, turn-cap, overlap, or population-ceiling violations were recorded.

Across the 600 saved one-second snapshots, consecutive same-ant position pairs had no exact zero-displacement intervals in any arm. AD's smallest nonzero one-second displacement was 1.5781e-10 world units; the minimums were 0.001526 for N, 0.000719 for A, and 2.2964e-8 for D. This is a sampled minimum, not a stall threshold or proof against sub-second pauses. AD recorded 9,469 blocked frames versus 9,786 in N.

AD's pooled 96×96 rounded FOOT_CONTACT distribution differed from N with normalized L1 0.3356. This is a descriptive spatial redistribution; it does not attribute a material advantage to the combined response.

## Late opportunity context

The same read-only max-D observer was evaluated at all 40 common late anchors. It was not connected to allocation.

| Arm | Median D peak count | Median spaced centers | Median D top2/top1 | Median winner entry distance | Winner on material | Material-free nonwinner present | Exact winner-cell changes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| N | 205 | 34 | 0.7152 | 0.03617 | 40/40 | 40/40 | 4 |
| A | 242 | 39 | 0.7165 | 0.03617 | 40/40 | 21/40 | 5 |
| D | 228 | 39 | 0.7330 | 0.03912 | 32/40 | 27/40 | 7 |
| AD | 203 | 37 | 0.7342 | 0.03617 | 40/40 | 40/40 | 3 |

AD retained an entry-near max-D winner and material-free alternatives throughout the sampled late anchors. These data do not show a new outward opportunity, an allocation choice, or a reason to adopt max-D/X.

## Interpretation

**Research measurement:** A and D both retained their distinct direct responses in the combined world. They often occurred in the same ant-tick, but they changed different native consumers: heading through turn-rate limitation and target speed through same-flow headway. The observed response distributions remain interpretable without a shared mode switch.

**Research decision:** COMPLEMENTARY, narrowly at the direct-consumer level. The composition is consumer-distinct and context-overlapping. The one-seed downstream effects were bounded in the recorded invariants, but they do not establish synergy, broader robustness, improved formation, or artistic desirability.

**Authored meaning:** No claim is made that ants biologically perceive stratigraphic layer count in these ways. A changes maneuverability and D changes following clearance as authored material responsibilities.

**Next smallest question:** With the two responsibilities composing directly under neutral conditions, test whether their same-state signatures remain distinct when the existing production 10% material locomotion resistance is restored. This is the next relevant production coupling; it is only a recommendation, not an executed pass.

## Limits and omissions

- One seed and one combined 600 s world; cross-arm late-world comparisons are endogenous and descriptive.
- The primary claim concerns instrumented same-state consumers, not long-run causal improvement.
- No separate atlas was generated; the report tables summarize machine-readable measurements and the full frozen spatial/time data remains in the package.
- No production adoption, parameter change, candidate sweep, additional seed, audio, UPDATE, allocation, BODY, or long-run construction claim.

## Package map

- PLAN.md — registered question, definitions, and stop boundary.
- VALIDATION.md — parity and verification receipts.
- data/ad/PROVENANCE.json — authority, source and frozen-input hashes.
- data/ad/ANALYSIS.json — direct, world, contact, and opportunity measurements.
- data/ad/run-summary.json — 600 s run metrics, checkpoints, and invariants.
- data/ad/CORRECTIONS.json — post-run coordinate correction receipt.
- data/ad/seed20261005-G-raw.json.gz — saved raw world observations.
- data/ad/auxiliary.json.gz — direct-consumer/context/contact observer records.
- data/ad/opportunity-frames.json.gz — late observer frames.
- data/ad/checkpoint-*.json.gz — frozen checkpoint receipts.
- SHA256SUMS.txt — package, tooling, and daily-record artifact hashes.
