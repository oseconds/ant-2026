# Candidate G natural movement shadow — preregistration

Frozen before any C/F/G movement outcome was generated or inspected.

## Question

Does the area-scaled 316×316 Gaussian field G remain active and stable in current natural ANT movement, or does its dose scaling lead to excessive signal response, trapping, saturation or movement collapse? This is a research-only shadow. No production adoption follows from this pass.

## Baseline and provenance

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- G branch point: `336e8dc6e680ff5de3c256e50596581797ce0907` (`codex/ant-316-gaussian-dose-unit-qualification-20261024`).
- This branch: `codex/ant-316-gaussian-dose-unit-movement-shadow-20261024`, created directly at the G tip. `origin/main` is an ancestor; no unrelated research branch was merged.
- G fixed-cue package manifest SHA-256: `2b762cf0c97f2757bce3d1b092018f648f9caea3db4619ee27fc40cc9e02fa77`.
- G validation receipt SHA-256: `ed53485cb0915c3e8599c88097069242cbee50d73ea74c972de257ad9d4a939f`.
- Founder-refinement reference files: `docs/ant/evidence/2026-10-07-founder-effect-refinement/README.md` (`6c0d085db3b0b2de7092318ac24c823a63ac3a9462ed5623b4c9e69b184f5438`), `source-freeze.json` (`3090751db9366bb69c1a4e4055181d0199c4f713d8eb353eae3d56be48b1da39`), and `observer-parity.json` (`447aa979c0264d479e2378f1f50bb1e69295f678a438c3788d3475757d5d8c1d`). The 2026-10-08 movement/material diagnosis README SHA-256 is `f9c947dcd5f9101a7d0bb4459fcfdbb5e9e97f79071d8410125544e2d0cd490a`.

Current source hashes at preregistration:

| Source | SHA-256 |
| --- | --- |
| `src/lib/agents/ant/AntController.js` | `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04` |
| `src/lib/agents/ant/AntAgent.js` | `ed72c33fb26f269c77853b7aa98da9e2b8a07f196bbea114583dedcd52110411` |
| `src/lib/agents/ant/PheromoneField.js` | `412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd` |
| `src/lib/agents/ant/GasterDeposition.js` | `0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41` |
| `src/lib/agents/ant/GaitController.js` | `8fb744ee696d80ad2d9c81313a0632b8e0723a56face77ebef4d799f5b51433e` |
| `src/lib/agents/ant/BodyPoseController.js` | `2ec4cc12c12ae301ea07056889c3be9255b1b1e155b7724cd3366278d60ace8e` |
| `src/lib/agents/ant/LocalOccupancy.js` | `df22dd38e9af8078ebcb1d225ca2a5eaf579e994d2d4a00ce9ceeefa2403ff16` |
| `src/lib/agents/ant/ColonyActivation.js` | `3f04b44fe81f692ea295b33ce311f239083c5db01a8400e35c0bb6fb9d685abd` |
| `src/lib/agents/ant/SurfaceField.js` | `182b70f589bec7de427a97a4f14f3823b2bd474f6c49c90c59b17c306990c096` |
| `src/lib/agents/ant/TrailPlateBirth.js` | `283de374bc38cd8baae47d99d253d43b71b800edbf4747d19d06299986c12860` |
| `src/lib/agents/ant/MaterialStratigraphy.js` | `5cf272663ac2afb61ca94857f3636916f528d4cfb9d419e4d727c46f8c028be7` |
| `scripts/ant-founder-evidence.js` | `cae43004eff62ecea6f981bd966c7f73b5346a3d4b6468af3f34836e084dd34d` |

The founder evidence is reused only for its 60 Hz natural-run conventions and fixed-scale 64×64 occupancy, one-second trajectory, contact, and checkpoint definitions. Historical values are not treated as current-main outcomes.

## Frozen arms and run schedule

For each seed `20261005`, `20261006`, `20261007`, run 600 simulated seconds at 60 Hz (36,000 direct fixed ticks) for C, F and G, in that order. C is run first so its seed-specific 30 s route mask can be frozen and applied unchanged to all three arms. Each arm receives a newly initialized controller with the same seed; matching is at initial conditions only. Behavior-driven RNG and trajectories may diverge after field-dependent choices differ.

- **C:** current production 96×96 `PheromoneField`, current Gaussian writer, current bilinear reader and unscaled current dose.
- **F:** 316×316 `PheromoneField`, same production Gaussian `R=0.0045`, `σ=0.00225`, support, cap 8, decay and bilinear reader; dose scale 1.
- **G:** identical 316×316 configuration to F, with only every applied deposit amount multiplied by `3969/361 = 10.994459833795014`.

All behavior, sensing, material, recruitment, gait, collision and birth configuration comes from the same current `AntController` defaults. Audio bridge is absent (Audio Off); Base remains disabled. Each new field starts empty. There is no warm-up trail, injected route, forced birth, or manual placement beyond the controller's normal initial spawn.

Before the first tick, compare C/F/G common initial agent state, activation/recruitment state, lifecycle counts, empty field state, normalized behavior config, seed, RNG state and RNG call count. F/G must use the same factory configuration apart from their applied-dose multiplier. Observer instrumentation must call each wrapped production method once, return its original value, consume no RNG, and pass a short paired observed/unobserved state-hash check before the full run.

## Frozen observations

Record one-second rows after each 60-tick interval and exact checkpoint rows at tick counts 1,800 / 3,600 / 7,200 / 18,000 / 36,000 (30 / 60 / 120 / 300 / 600 s). Store actual controller simulation time, not a retimed clock.

Movement:

- Sum post-collision realized in-domain displacement at every fixed tick. Report total distance and distance per integrated active-ant-second.
- Record active population, total spawned, total retired/exited, recruitment increments, and active-ant-seconds at one-second samples and checkpoints.
- Record per-tick speed, heading and angular velocity distributions; one-second net displacement for ants present at both endpoints; blocked frames and false→true blocked transitions. Preserve distributions and seed-level values; do not combine them into a fitness score.
- Check finite agent state, speed cap `1.35 × preferredSpeed`, turn cap `4.5 rad/s`, and pairwise non-overlap using the existing `radiusA + radiusB − 1e-6` test tolerance at every tick.

Existing trail observations:

- Wrap `senseLocalTrail` and `senseTrail` as passive observers, call the original once, and record returned values without extra field sampling. Retain local L/C/R, strength, coherence, balance, steering, adherence and confidence. Retain raw far `senseTrail` values and their unchanged `0.035`, exponent-3 Hill response as separate distributions.
- Retain actual fresh decision/commitment reschedules and countdowns by observing the existing `updateIntention` result; held intent is not counted as a fresh decision.
- Report field node-sum mass, one-second maximum node value, exact checkpoint concentration quantiles, finite-value checks, 15 s decay call/factor receipts, and cap-hit/clamp-loss write counts. Instrumented field writes call the inherited production writer exactly once. Count boundary-rejected point dose where its normal API return is observable.

Spatial and downstream observations:

- Use the existing fixed 64×64 ant-center occupancy map. Report cumulative coverage and recent-30 s coverage/normalized entropy at checkpoints. Save the complete one-second positions for route inspection.
- Resample each field onto the same 96×96 world-coordinate grid once per second for fixed-scale comparison. Use the existing chemical threshold `0.04` and 30-second persistence definition. Freeze a per-seed C mask at 30 s (`value ≥0.04`, outside radius `0.12` of `(0.5,0.72)`) and use that exact mask for C/F/G early-route mass/contact share.
- Record actual FOOT_CONTACT group and individual-foot counts, exact event-stream hash and one-second counts. Record Plate birth time/ID, count/timing, SurfaceField and stratigraphy summaries at checkpoints. These are downstream descriptions, not causal outcomes.
- Save fixed-grid pheromone, SurfaceField and occupancy checkpoint maps with common world axes and no per-run normalization.

## Interpretation and decision boundary

Report paired F↔G seed differences first; C is a production-context reference. Do not require post-divergence RNG, trajectories, births or contacts to match. Preserve RNG state/call counts at checkpoints to document divergence. Report effect sizes and counterexamples by seed; no significance claim, scalar score or new post-hoc trapping/collapse threshold will be introduced. Use existing occupancy coverage/entropy, movement totals, time series and maps to judge whether exploration remains spatially distributed or concentrates into recurring corridors.

Any cap hit, saturation amount and its time/arm/seed will be reported exactly. No cap, dose, decay, sensor, movement or material tuning is allowed. A cap/saturation pattern materially larger in G than F prevents a clean unit-only interpretation; the run will be reported as pathology/confounded rather than compensated. Any finite, speed/turn, collision or population invariant violation is retained and classified against the user decision rules.

Final decision uses only:

- `MOVEMENT SHADOW SUPPORTED`
- `MIXED / HOLD`
- `NEGATIVE`
- `INCONCLUSIVE`

No production adoption occurs. Stop after this pass. Do not change G, run another candidate, alter thresholds/laws, or run audio.

## Validation plan

- Hash all production sources, evidence inputs, candidate arm settings and output artifacts.
- Add focused tests for arm isolation, dose multiplication, one-call passive observers, no added RNG/state change, initial-state parity, cap accounting and deterministic short replay.
- Execute the three-seed × three-arm natural run twice where runtime permits and compare deterministic summary/data hashes.
- Run full `npm test`, `npm run build`, `git diff --check`, and verify production `src/` / `docs/ant/README.md` unchanged.
- If evidence supports proceeding toward production-candidate review, request a fresh independent review before finalizing that direction.
