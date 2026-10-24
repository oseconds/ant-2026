# 2026-10-24 — One CIC writer, three separate gates

The artist authorized one simplest four-node barycentric/CIC writer under a new preregistration, requiring three separate decisions: moment conservation, fixed cue improvement, then movement improvement. This follows the writer-information-loss study rather than reopening the earlier CIC gate.

Fresh `origin/main` was `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`; the primary worktree switched to `codex/ant-cic-writer-qualification-20261024`. Existing untracked captures and the separate worktree were preserved. No production source, canonical README, movement/material/audio law or exhibition startup configuration was changed.

The protocol was committed as `54f7bac` before candidate target evaluation. Its SHA-256 is `6a4aadc894ec5175b0ba1111e5e2b82e9b81c6c9aeb8d6f5e9b16541f26eb7ca`. Individual frozen inputs and one attribution helper were copied byte-exact from the qualified fixture and attribution commits; no research branch was merged wholesale.

Gate 1 initially exposed a harness error during parent review: the point lattice accumulated over many grid nodes rather than testing isolated subcell writes, and route roundoff inputs were read after storage. The invalid output is preserved and explicitly excluded. The corrected original protocol checks all 49,152 writes independently, physical raw moments, derived mass/moment/centroid bounds, exact boundaries, cap loss and 24 original raster replays. It passes; a production-brush negative control fails as intended. This is conservation only.

Gate 2 improves local cue fidelity: directional sign errors 552 to 0/4,012; all-row steering MAE 0.065054 to 0.022255 rad. However, wide errors stay at 2,378/5,072 with 92 recoveries and 92 new errors. Tight/mirrored-tight and phases p01/p11 regress in wide winners. S analytic-zero precision-nonzero false cues increase from 364 to 377/392, while their magnitude decreases. These are failed preregistered guards. Decision: **MIXED / NOT QUALIFIED**.

Gate 3 is **NOT RUN**. No movement outcome is inferred from centroid or local-cue improvement. No second writer, tuning, combined feedback law, recruitment, selector, persistence, audio or Chrome soak was attempted. The next boundary is a representation/acceptance-contract decision, not automatic gain tuning or movement escalation.

The final scientific outputs were repeated byte-identically; timing is separate. Detailed data, source/input receipts, tests/build, independent review and reproduction instructions are in [the evidence package](../evidence/2026-10-24-ant-cic-writer-qualification/README.md).
