# Fixed-nucleus X recapture UPDATE diagnostic

## Starting question

Before Chemical Residence, test whether freezing the max-D START nucleus and freshly re-capturing current X around it removes proposal turnover on the previously frozen P1/P2 structural histories. Do not adopt an UPDATE law or carry prior membership.

## Work and result

- Started from current production main 1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44.
- Verified current TrailPlateBirth.js blob/raw bytes match the historical selector used for the frozen E/F/D/I maps.
- Reused exact P1/P2 frozen anchors; generated no simulation trajectory.
- Verified source thinning reproduces F at all 42 anchors, prior UPDATE time/E/I parity at 42/42, prior capture E/F/D parity at the ten shared anchors, and registered X/nucleus parity at 10/10.
- n0 stayed edge-bearing F in both events. P1 had no max-D movement; P2 had four changing transitions.
- Fixed-X turnover was mostly E-qualified cells that no longer belonged to F: 147 of 162 fixed-X loss occurrences. Only two remained in F but left fixed X.
- Decision: **D — MIXED**, used descriptively from the requested categories without a quantitative cutoff. Allocation changes are absent in P1 and localized in P2; fixed-X loss is dominated by current F changes. These windows do not support adopting a separate membership/incumbency rule; no incumbency arm was tested, so its effect remains unknown.

## Boundary

No production selector, membership memory, hysteresis, nucleus repair, source→boundary gate transfer, maturation/COMMIT, body, geology, audio, or Chemical Residence work was performed. Frozen history predates the endogenous outgoing-flow recruitment-heading adoption and is not evidence about morphology under the latest production trajectory.

Detailed measurements, validation, and hashes: [UPDATE evidence package](../evidence/2026-10-31-materialization-fixed-nucleus-update/REPORT.md).
