# 2026-10-31 — Outgoing-flow recruitment heading production adoption

- Author reviewed the matched isotropic/outgoing-flow comparison and approved the outgoing-flow candidate for production.
- The old fixed north `-π/2 ± 0.3` accepted-spawn heading is removed.
- Initialization and flow-unavailable spawns use exact isotropic `θ=-π+2πU`.
- When the previous completed tick supplies at least three qualifying outward realized segments, the same heading draw is narrowed around endogenous q with the registered `w=π-(π-0.3)R` mapping.
- Spawn position, cadence, clearance, population law, pheromone, living-ant steering, material feedback, TrailPlateBirth, renderer and audio remain unchanged.
- The three-seed comparison directly used q on 18.9–22.9% of accepted spawns in all ten 60 s windows and found no common fixed-direction attractor over 600 s.
- Increased clearance rejects / blocked placement calls remain an explicit production cost to monitor; retries cleared and no capacity suppression or measured overlap/domain/nonfinite violation occurred.
- Fixed spawn-position responsibility remains untested. Chemical Residence remains the next bounded material-feedback thread after this adoption.

[Adoption record](../evidence/2026-10-31-recruitment-heading-flow-production-adoption/README.md) · [Research report](../evidence/2026-10-31-recruitment-heading-flow-vs-isotropic/REPORT.md)
