# 2026-10-11 — Retained material -> locomotion causal A/B

**Type:** bounded causal research pass; production behavior remains default Off
**Production baseline:** 27d2deab8fe0495c740023793820efd3dd8994a4
**A/B branch base:** f09d67f1eab6f13e7466e1f8ea8c05c08145f995, direct child of the production baseline
**Branch:** ant-retained-material-locomotion-ab
**Evidence:** [final paired A/B package](../evidence/2026-10-11-retained-material-locomotion-ab-final/README.md)

## User-selected direction

Material history left by ants should become an environmental condition that later living ants can pass through and experience, rather than only a record that remains and sounds.

The retained-material experience shadow found repeated occupancy of exposed Plate cells in natural runs. This pass tested the first causal link from that history to later locomotion. Shadow evidence was reused; the shadow experiment was not rerun as a separate study.

## Fixed hypothesis and boundary

Tested only: accumulated exposed stratigraphy weakly increases local locomotion resistance.

- L is the current cell's public stratigraphy layer count; no Plate gives L = 0.
- Fixed law: m(L) = 1 - 0.10 * (1 - exp(-L / 4)); sign and gain were not tuned.
- Treatment reads the tick-entry snapshot before intention/movement and multiplies final desiredSpeed once immediately before targetSpeed assignment / accelerateToward.
- Material does not feed heading, steering, target, attraction/avoidance or direct deposition gain. Same-tick contacts, births and topology changes become visible next tick.
- No age/depth/quality inference, second mapping, second causal candidate, vitality, persistent after-effect, social/audio feedback, TrailPlateBirth or MaterialStratigraphy change.
- Default is Off.

## Run and process

- Verified origin/main at 27d2deab8fe0495c740023793820efd3dd8994a4 and shadow branch at f09d67f1eab6f13e7466e1f8ea8c05c08145f995; confirmed the shadow commit was a direct child with production source/package unchanged.
- Fast-forwarded remote main from 27d2deab8fe0495c740023793820efd3dd8994a4 to f09d67f1eab6f13e7466e1f8ea8c05c08145f995. Created this A/B branch from updated remote main in an isolated worktree; left the other checkout and its local main untouched.
- Reused seeds 20261005, 20261006 and 20261007, each 600 s at 60 Hz with the existing counted LCG and default controller settings; no audio bridge.
- Ran all Controls first. All three matched the saved shadow-baseline per-field SHA-256 chains exactly: 36,001 rows x 14 state fields per seed. Only then ran Treatment.
- A read-only observer sampled public snapshots at every pre-tick boundary; no observer mutation was detected. A spatial aggregation audit found round-vs-equal-width bin boundaries; they were unified and the full A/B was regenerated.

## Results

- Treatment applied only the fixed factor. Exposed ant-time mean multiplier was 0.93748 / 0.93490 / 0.93212. L = 0 was 44.42-52.64% of active ant-ticks and always applied exactly 1.0.
- Across all seeds, Treatment reduced total travel by 1.63-2.98% and mean realized speed by 3.4-4.4%, while active ant-time increased. FOOT_CONTACT totals fell with travel; contacts per travel unit stayed near 165, so they are not an independent confirmation. Exposure episodes were fewer, while their median/p90 durations increased in all three pairs. Episodes mean continuous ant-center occupancy of any exposed material, not one Plate or cell.
- The effect grew after Plate exposure became common. Per-seed mean exposure was 5.12% -> 3.70%, 61.79% -> 54.98%, and 86.31% -> 84.73% across the 0-200, 200-400 and 400-600 s windows.
- Plate birth, exposed coverage and maximum stack depth moved in different directions by seed. Environmental maps diverged after treatment activation; no single morphology direction is claimed.
- Population remained within 2-23 in every run, final population was 21/21/21 Control and 21/21/19 Treatment, and zero-displacement ant-ticks were zero. Nodule output reached its existing cap of 32 in all conditions.

**Decision: SUPPORTED** for this exact bounded candidate as a production-world-law candidate, not as production adoption. Consistent lower realized speed and travel, longer exposed-material episodes, and later field changes support an interpretable downstream activity/history effect without observed trapping or collapse. Plate birth/coverage direction remains mixed; no conclusion is made about the broader material-to-organism direction.

## Validation and stop

Focused test passed 3/3, full npm test passed 297/297, and npm run build succeeded. A fresh read-only independent review found no blocking correctness or interpretation issue and supported SUPPORTED for this exact candidate. It cautioned that contact totals follow travel and exposure episodes span any exposed material; both limits are recorded in the evidence package.

No production switch, merge, PR, gain tuning, sign flip, second mapping, steering, material-character feedback, vitality, social or audio link was added. The code switch stays default Off; this pass only supports consideration of the fixed candidate.
