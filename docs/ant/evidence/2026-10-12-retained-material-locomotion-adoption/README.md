# Retained material → locomotion production adoption

**Decision: ADOPTED** for the exact fixed candidate tested in the 2026-10-11 causal A/B. This pass verifies adoption conformance; the A/B remains the authoritative causal evidence.

## Baseline and scope

- Remote `main` was verified at `f09d67f1eab6f13e7466e1f8ea8c05c08145f995`; the A/B branch was `fc027dfc3d681d5dbcc205b9dbd3be3903103a54`, a direct child. The A/B implementation and evidence were fast-forwarded to `main` before this branch was created.
- Adoption branch: `ant-retained-material-locomotion-adoption`, based on `fc027dfc3d681d5dbcc205b9dbd3be3903103a54`.
- The only production behavior change is that `new AntController()` now defaults `materialLocomotionResistance` to `true`. Explicit `false` remains available for controls and historical replay.
- Historical evidence runners pin explicit Off when replaying pre-adoption baselines; browser/current-production checks use the new default.
- No equation, sign, gain, timing, integration point, steering, formation, stratigraphy, population, material or audio law changed.

## Adopted law and timing

For the current cell's public `layerCountByCell` value L (the local column count, including its top layer and any underlying layers):

    m(L) = 1 - 0.10 * (1 - exp(-L / 4))

At tick entry, the controller reads one public `MaterialStratigraphy` snapshot and looks up only the current ant center cell's `layerCountByCell` value. This is one aggregate column count; no individual buried-Plate identity enters locomotion. After steering, turning, crowding, following-speed and hesitation are resolved, the multiplier is applied exactly once to `desiredSpeed`, immediately before `targetSpeed` assignment and `accelerateToward()`. Later same-tick contacts, births or topology changes become visible on the next tick.

L = 0 gives exactly 1; increasing L approaches a 10% maximum slowdown. The material does not directly alter heading, steering, target position, attraction/avoidance or deposition gain. This is an authored local-history condition, not a measured physical friction law or a claim that an ant physically senses buried Plates. The current `TrailPlateBirth` corridor-to-Plate law remains the authored formation baseline.

## Adoption conformance

The existing deterministic 14-field hash-chain harness was reused for seeds `20261005`, `20261006` and `20261007`, each at 600 simulated seconds and fixed 60 Hz. All comparisons matched every field exactly:

| Seed | Explicit Off vs saved shadow baseline | Explicit Off vs prior A/B Control | Default On vs explicit On | Explicit On vs prior A/B Treatment |
| --- | --- | --- | --- | --- |
| 20261005 | exact | exact | exact | exact |
| 20261006 | exact | exact | exact | exact |
| 20261007 | exact | exact | exact | exact |

Each seed includes 36,001 per-tick rows across these 14 fields: agent trajectory, lifecycle, RNG, pheromone, SurfaceField, gait, body pose, gaster deposition, colony activation, local occupancy, FOOT_CONTACT, material birth events, TrailPlateBirth and MaterialStratigraphy. This verifies default-On equals the A/B Treatment and explicit-Off preserves the prior baseline.

Raw comparison hashes and run summaries: [`conformance/adoption-conformance.json`](conformance/adoption-conformance.json).

## Validation

- Focused material-locomotion tests: 4/4 passed, including end-of-tick material changes applying from the next tick. [`focused-test.txt`](focused-test.txt)
- Full `npm test`: 298/298 passed. [`npm-test.txt`](npm-test.txt)
- `npm run build`: passed with the repository's existing Zod annotation-position warnings and Vite large-chunk advisory. [`npm-build.txt`](npm-build.txt)
- The managed worktree initially had no `node_modules`; the first build attempts could not resolve Vite. Dependencies were then installed in the isolated worktree with `npm ci --no-audit --no-fund` from the unchanged lockfile. The package lock remained unchanged. Initial diagnostics are preserved in [`npm-build-missing-worktree-dependency.txt`](npm-build-missing-worktree-dependency.txt) and [`npm-build-missing-worktree-module.txt`](npm-build-missing-worktree-module.txt).

## Reproduction

From the adoption branch, run into a new empty output directory:

    node scripts/ant-retained-material-locomotion-adoption-conformance.js --output=docs/ant/evidence/replays/retained-material-adoption-REPLAY-ID

The script pins the three seeds, 600-second duration, 60 Hz cadence, saved shadow and A/B comparisons, and the exact 14-field state hash set.

## Independent review

Fresh read-only review returned **PASS** with no blocking findings. It confirmed the production default and candidate timing, exact 14-field parity across three seeds, the new next-tick visibility test, and historical explicit-Off runner pins. One low, non-blocking wording note remains in the authoritative 2026-10-11 A/B README: it calls the aggregate local column count an “exposed layer-count.” The adoption docs clarify the implemented `layerCountByCell` semantics without changing historical evidence. [Full review](independent-review.md).

## Limits and adoption boundary

The A/B result supports this exact authored law only. It does not establish biological friction, direct sensing of buried Plates, increased Plate births or coverage, vitality, material character, C2, retained relations, acoustic feedback or completion of the full persistent-world circulation. The A/B used three deterministic seeds; its Plate-birth and coverage directions were mixed. No tuning or second feedback candidate was introduced.
