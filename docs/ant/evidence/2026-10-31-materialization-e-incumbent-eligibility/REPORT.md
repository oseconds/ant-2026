# E-qualified incumbent eligibility preflight

## Outcome

**Stopped at the locked direct-signature gate. No outcome class assigned.**

The previous frozen packet, current production thinning, prior B sets, and registered stateless-X reference all pass parity. Under the exact Q recurrence, P2 anchor 17 contains a cell in Q-only relative to B that is also in current F. The direct signature requires every Q-only cell to be absent from F; any violation is an implementation failure. The pass therefore stops before reporting usefulness, staleness, re-entry, scope growth, or an E-ELIGIBILITY USEFUL / MOSTLY REDUNDANT / STALE-OVER-RETENTIVE / MIXED classification.

## Implementation fact

The analyzer uses the pinned main source’s production neighbors and Zhang-Suen thinning helpers. It makes no simulation calls and consumes no RNG. It replays the locked set equations over stored maps only.

Current authority is origin/main@1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44. TrailPlateBirth.js matches the pinned source blob 238cc365f2602dc6a22091d69237b88962825a13, raw SHA-256 283de374bc38cd8baae47d99d253d43b71b800edbf4747d19d06299986c12860, and LF SHA-256 cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67.

## Prior evidence

Inputs come from the prior fixed-nucleus branch and commit 3ddf7a2fb08e6a91ce71f9edf3ec4c7c8237e386. The exact frozen input gzip hash is ec56df45a4e346f7ea79d3e368654b788dc08e8a9c4d40009df8fd57a80cd864. The stored prior analysis hash is 0535b9aa419a6066a946e2a37e8e2bf56c903dd64532162c96544cc96a597f2c.

## New measurement: first locked-signature violation

At P2 anchor 17, model time 103.01666666667376 s, frozen nucleus n0=6192, and cell 4948:

| Check | Value |
| --- | --- |
| Cell 4948 is in previous Q | Yes |
| Cell 4948 is in current E | Yes |
| Cell 4948 is in current F | **Yes — locked signature failure** |
| Cell 4948 is connected in treatment admissibility | Yes |
| Cell 4948 is in current B | No |
| Cell 4948 radius from n0 | 0.143173 world units, inside .15 |
| Current B size / Q size | 93 / 152 |

The recorded 8-neighbor path from n0 to cell 4948 is:

6192 → 6097 → 6002 → 5906 → 5811 → 5715 → 5618 → 5521 → 5426 → 5329 → 5234 → 5138 → 5043 → 4948

Cells 5521, 5329, and 5043 are current-E incumbent members absent from current F. Those incumbent bridges connect the admissible graph to current-F cell 4948, which is outside B. The exact formula admits this path; the four-part direct signature rejects its endpoint because it is in F.

The full witness, including each path cell’s E/F/previous-Q status and radius, is in [stop-witness.json](data/stop-witness.json). Independent review reproduced the 42 B sets and this witness; it also found two current-F cells in Q-only relative to B at this anchor.

## Interpretation boundary

- **Architecture inference:** the locked recurrence and locked Q-only signature do not agree for this frozen state. The formula permits an F cell outside B to join Q through incumbent bridges. Under the specified stop rule, this is an implementation/protocol failure, not a valid treatment outcome.
- **No usefulness or staleness conclusion:** this pass does not determine whether E-qualified incumbency removes thinning churn, accumulates stale structure, or remains local.
- **Authored material semantics:** E qualification and F thinning remain the existing authored eligibility and structural representation. This test does not make E into material or establish crystallization, persistence time, or mass conservation.
- **Artistic interpretation:** none.

## Smallest next question

Before another measurement, clarify the intended contract for a current-F cell outside B that becomes connected to n0 through incumbent bridges. The present Q union law permits it; the locked direct signature forbids it. No rule was relaxed here.

## Unreported by design

No full B/Q transition table, START-member curve, re-entry result, E-only duration distribution, scope-growth summary, production-I comparison, or four-way outcome classification was emitted after the gate failed. No production behavior, selector, or Residence work was changed.
