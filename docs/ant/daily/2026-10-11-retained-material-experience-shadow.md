# 2026-10-11 — Retained material experience shadow

**Type:** read-only natural-run research pass; no production change
**Baseline:** current `origin/main`, `27d2deab8fe0495c740023793820efd3dd8994a4`
**Evidence:** [authoritative final replay package](../evidence/2026-10-11-retained-material-experience-shadow-final/README.md) · [initial exact-baseline run, preserved](../evidence/2026-10-11-retained-material-experience-shadow/README.md) · [intervening replay, preserved](../evidence/2026-10-11-retained-material-experience-shadow-rerun/README.md)

## Starting direction and question

The user selected this higher-level direction: material history left by ants should become environmental conditions that later living ants can pass through and experience, rather than only a record that remains and sounds.

This pass asked how often, how long and across how many local material states live ants occupy retained exposed Plate cells during natural production runs. No ant behavior, vitality, C2, relationship memory, steering feedback, material law, or audio behavior was added.

## Observer and runs

- Reused the deterministic natural conditions associated with `scripts/ant-morphology-replay.js`: default `AntController`, same LCG and matched seeds `20261005`, `20261006`, `20261007`, each 600 s at 60 Hz; no audio bridge and no archived trajectory input.
- At every fixed-tick boundary before `AntController.tick`, sampled live ant positions against one public `MaterialStratigraphy.getSnapshot()`. The pre-tick sample describes only the next interval. Contact, Plate birth, nodule birth and topology changes are first visible at the next boundary.
- Entry is first observation. A top Plate is “pre-entry” when its public birth time is at or before that first observation. The observer reads top identity and layer count only; it does not infer buried sensing, age-based depth or material quality.
- In-domain positions map to the ant center's nearest stratigraphy cell; out-of-domain positions resolve to no material, matching the public stratigraphy lookup. Exposure is an occupancy opportunity, not a FOOT_CONTACT or a claim of perception.
- The observer is isolated to a research script. It has no RNG access and does not callback into agents, controller, formation, stratigraphy, renderer or audio.

## Findings and decision

All three seeds showed repeated local exposure: 48.13–57.94% of active ant-time; 523–676 distinct ants per seed; 1,891–2,497 exposure episodes; 28–32 top Plate identities. Across runs, 54.36% of 33,132.72 active ant-seconds were over an exposed Plate cell. Episode duration median was 1.02 s, p90 8.50 s and p95 11.18 s. Layer counts ranged from 1 to 29 with weighted median 4; 82.93% of exposed samples had at least two layers.

1,765 ants encountered a top Plate that had already been born at entry; this accounted for 14,247.25 ant-seconds, 79.10% of all exposed time. The per-seed 100-second population table shows exposure expanding after the initial Plate-free period and reaching 76.9–91.6% average current-population occupancy in the final 200 seconds. Thus the signal is not limited to one startup observation.

**Decision: SUPPORTED FOR NEXT CAUSAL A/B.** A separate pass may test one weak bounded local exposed-layer-count → desiredSpeed condition against control. This report does not select sign or gain and does not execute that test. Cell occupancy does not prove foot contact, sensing or benefit.

## Observer validity and stop boundary

OFF/ON runs matched across all per-tick hash fields for 36,001 rows per seed, with no mismatches. The ON run also passed all 36,000 same-boundary no-mutation checks per seed. The checked state includes trajectories/lifecycle, RNG state/calls, pheromone, `SurfaceField`, gait/body pose, deposition, activation, occupancy, contacts and birth/error events, `TrailPlateBirth`, and full `MaterialStratigraphy` state.

The pass does not change `TrailPlateBirth`, movement, population, Plate geometry, stratigraphy, social mechanisms or audio semantics. It does not tune exposure or add a second feedback candidate. The W1→W3 sequence remains unchanged: W1 is still the architecture-design next step, while this pass makes a narrow local W3 opportunity candidate eligible for future consideration without authorizing it.

## Validation

The focused observer test passed (2/2). The complete repository suite passed (294/294), including material/controller and existing social observer-invariance coverage. The corrected three-seed 600 s OFF/ON replay passed exact parity at every tick. `npm run build` completed successfully; Vite reported dependency comment-annotation notices and a large-bundle warning (1,161.66 kB app chunk).
