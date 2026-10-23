# Natural production baseline

Three fresh production-controller runs at 60 Hz, 600 model seconds, seeds `20261005`, `20261006`, and `20261007`. The runner used the north recruitment observer only; its heading formula and RNG use were checked against the plain controller over 600 matched ticks. No field or movement alternative ran in this baseline.

| Seed | Wall seconds | Spawned / retired | Plates / nodules | Valid flow ticks / 36,000 | Post-init accepted spawns with valid flow |
|---|---:|---:|---:|---:|---:|
| 20261005 | 8.07 | 755 / 734 | 29 / 32 | 5,744 (15.96%) | 130 / 754 (17.24%) |
| 20261006 | 7.80 | 689 / 668 | 33 / 32 | 4,676 (12.99%) | 99 / 688 (14.39%) |
| 20261007 | 8.46 | 736 / 717 | 38 / 32 | 4,965 (13.79%) | 108 / 735 (14.69%) |

All three exceed the preregistered feasibility floor of ten post-init accepted-spawn flow-valid observations. This is signal availability under the frozen geometric gates; it says nothing about whether flow-directed recruitment improves spatial or material outcomes. Tick flow is valid only when at least three distinct ants pass the existing radius, speed and positive-radial-motion gates and the unit-vector resultant is nonzero.

Each `seed-*/result.json` contains all 36,000 tick flow-validity/count summaries, accepted-spawn `U`/time/policy/current-tick flow records, 600 one-second morphology frames, 6,000 ten-Hz active-ant trajectory frames, four complete public snapshots at 30/120/300/600 s, and 1/2/5 s route-curvature summaries. Public snapshots are detached copies; each seed folder includes the exact source snapshot and matching hashes. No full 60 Hz trajectory table is retained.

The archived runner version in these files reported `spawnFlowStats.policyHalfSpread`. For this north-policy baseline that value is a **potential flow-policy spread computed from measured R**, not the applied heading spread. The applied north half-width was fixed at 0.3 radian. Its archived `empiricalHalfSpread` field should not be interpreted: that estimate used the flow axis even though north recruitment did not use it. The current runner separates `appliedHalfSpread` from `potentialFlowHalfSpread` and omits that invalid empirical estimate.

The archived `flowStats.resultantBins` includes invalid-flow fallback `R=0` rows in the first bin. Valid tick denominators and validity counts are correct; for valid-spawn R distribution use `spawnFlowStats.validRBins`. The current runner reports valid tick R bins separately.
