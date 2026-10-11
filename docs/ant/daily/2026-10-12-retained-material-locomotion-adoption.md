# 2026-10-12 — Retained material → locomotion production adoption

**Type:** explicitly authorized production-world-law adoption and conformance pass
**Baseline:** `fc027dfc3d681d5dbcc205b9dbd3be3903103a54`, the supported causal A/B commit
**Branch:** `ant-retained-material-locomotion-adoption`
**Evidence:** [adoption conformance package](../evidence/2026-10-12-retained-material-locomotion-adoption/README.md) · [authoritative causal A/B](../evidence/2026-10-11-retained-material-locomotion-ab-final/README.md)

## User-selected direction

Material history left by ants should become an environmental condition that later living ants can pass through and experience, rather than only a record that remains and sounds.

The shadow pass showed frequent natural exposure, and the fixed-candidate A/B was **SUPPORTED** across three matched 600-second seeds. The A/B showed lower travel and realized speed, longer exposed-material episodes and later history changes without observed stall, collapse or runaway stacking. Plate-birth and coverage directions were mixed, so neither is claimed.

## Baseline preparation

- Rechecked the live remote: `main` was `f09d67f1eab6f13e7466e1f8ea8c05c08145f995`; `ant-retained-material-locomotion-ab` was `fc027dfc3d681d5dbcc205b9dbd3be3903103a54`, its direct child.
- Fast-forwarded remote `main` to the A/B implementation and evidence, then created this adoption-only branch from the updated `main`.
- The existing shadow and causal A/B evidence were reused; neither experiment was rerun as new research.

## Adopted law and boundary

- For the current cell's public `layerCountByCell` value L (the local column count, including top and any underlying layers), use `m(L) = 1 - 0.10 * (1 - exp(-L / 4))` with L = 0 giving exactly 1 and a bounded maximum 10% slowdown. Only the aggregate count is used; individual buried-Plate identities are not locomotion inputs.
- The `MaterialStratigraphy` public snapshot is read once at tick entry. Existing movement decisions remain intact; the multiplier is applied once to final `desiredSpeed` before `targetSpeed` assignment and `accelerateToward()`.
- Same-tick contacts and births become visible from the next tick. The material does not directly change heading, steering, target, attraction/avoidance or direct pheromone gain.
- Default `new AntController()` is On. Explicit Off remains available for control and replay. No user-facing toggle or second mapping was added.
- Historical evidence runners now pass explicit Off where they reproduce pre-adoption baselines; browser/current-production checks follow the default-On production law.
- The law is an authored local-history condition, not a physical friction measurement. `TrailPlateBirth`, MaterialStratigraphy semantics and the separate audio branch were not changed.

## Conformance and validation

- Reused the 14-field deterministic per-tick hash-chain from the A/B harness at seeds `20261005`, `20261006`, `20261007`, 600 seconds, fixed 60 Hz.
- All 14 fields matched in all seeds for default-On vs explicit-On, explicit-Off vs saved shadow baseline, explicit-Off vs prior A/B Control, and explicit-On vs prior A/B Treatment.
- Focused material-locomotion tests passed 4/4, including next-tick visibility for end-of-tick stratigraphy changes; full `npm test` passed 298/298; `npm run build` passed. Build warnings were the existing Zod annotation and large-chunk warnings. A clean-worktree missing-dependency issue was resolved with lockfile-pinned `npm ci`; no package manifest or lockfile change was made.
- Fresh independent review returned **PASS** with no blockers; it noted only imprecise “exposed layer-count” wording in the older authoritative A/B README. The adoption docs define `layerCountByCell` precisely and no historical evidence was rewritten.

## Decision and stop boundary

**ADOPTED** for this exact candidate. Production now has one weak bounded retained-history → locomotion condition. No Plate attraction/avoidance, steering feedback, vitality, material character, C2, retained relation, social feedback or audio feedback was added. No gain, formation or morphology tuning was performed. Full persistent-world circulation remains incomplete.
