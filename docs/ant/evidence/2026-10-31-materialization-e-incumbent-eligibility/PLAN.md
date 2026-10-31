# E-qualified incumbent eligibility preflight

## Question

On the exact frozen P1/P2 structural histories, test one proposed membership rule: a cell in the current episode may remain admissible while it remains in E, even when current F omits it.

This is observer-only research. It does not change production or generate a natural trajectory.

## Authority and inputs

- Current authority: origin/main@1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44.
- Prior fixed-nucleus result: 3ddf7a2fb08e6a91ce71f9edf3ec4c7c8237e386.
- Reuse the prior exact 42 E/F/D/I anchors, prior B memberships, START nuclei, and registered stateless-X reference.
- P1 and P2 each retain their original 21 stored model times.

## Locked laws

- START: choose one edge-bearing F node with maximum D support; ties use lower row-major index. Freeze that n0.
- B: the n0-connected component in current F inside closed Euclidean radius .15.
- Q at START: Q0=B0.
- Later Q: admissible = F(t) union (Q(t-1) intersection E(t)); Q is the n0-connected component in admissible intersected with Disk(n0,.15).
- Stop at the first anchor where n0 is no longer edge-bearing in current F. Do not repair or override with treatment admissibility.

## Locked direct-signature gate

Every Q-only cell relative to B must be in previous Q, in current E, absent from current F, and connected through the current treatment-admissible graph.

Any violation stops this pass before usefulness, staleness, re-entry, scope, or outcome-class interpretation. No threshold, radius, or eligibility rule may be changed after seeing results.

## Exclusions

No new seed or trajectory, production behavior, E/F threshold, material/layer input, allocation change, time threshold, hysteresis score, repair, maturation, COMMIT, BODY, geology, audio, or Chemical Residence work.
