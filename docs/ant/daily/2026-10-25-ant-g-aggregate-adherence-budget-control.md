# 2026-10-25 — Aggregate adherence-budget control

Tested whether Candidate G's remaining cumulative occupancy concentration requires the current colony's adherence state to set total reinforcement. I kept H's uniform-by-travel allocation and replayed each seed's frozen intact-G per-tick reinforcement schedule, independent of I's current adherence.

The three-seed G budget series was frozen and committed before I outcomes. G reproduced the validated parent summaries, timelines and checkpoint maps exactly. Across 108,000 I ticks, each requested reinforcement budget closed against the frozen value within binary64 roundoff; no positive budget was unallocatable, the observer added no RNG calls, and deterministic repeats matched byte-for-byte.

I remained similarly cumulatively concentrated to H. At 600 s, top-10% occupancy share fell for I in one seed and rose in two; cumulative coverage rose in one and fell in two. Recent coverage was higher in two seeds and lower in one, while recent entropy increased slightly in all three. Population and travel remained active without invariant violations or cap/saturation. The result is **A-FEEDBACK NOT REQUIRED** for the tested phenotype under this frozen G schedule; it does not show that adherence feedback has no effect or that total signal alone causes concentration.

Evidence: [aggregate adherence-budget control](../evidence/2026-10-25-ant-g-aggregate-adherence-budget-control/README.md). Focused research tests passed (11/11). Production source and canonical ANT README were unchanged. Full suite/build were not run because shared production/runtime code was not modified.

Independent read-only review found no validity blocker and confirmed the bounded decision. It cautioned that the occupancy metrics are concentration proxies rather than spatial-contiguity measures, that three seeds do not establish equivalence, and that I's uniform multiplier peaks above G's per-ant multiplier range because it divides the frozen budget by I's travel.
