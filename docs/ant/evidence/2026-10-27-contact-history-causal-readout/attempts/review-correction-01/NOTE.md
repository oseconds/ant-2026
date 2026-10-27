# Review correction 01 — relocation tie-break source pairing

A fresh read-only review found that `sameNativePixelCount` compared the filtered valid-target list with the unfiltered source list by index. A new regression test reproduced the mismatch; the helper now stores each placement's own source pixel before filtering.

The same deterministic H1 geometry-only preflight was rerun with no candidate rendering. All 1,052 prior state/RNG anchors, the event digest, final RNG, and all seven support, valid-count, unique-pixel, same-pixel, and separation summaries remained unchanged. The contact log now records each transform's target coordinate, physical/display owner, and distance for every eligible route. A separate recomputation from those per-contact records matched all seven summaries. `reflect-x` remains the best registered rule at 354/760 (46.58%), below the 90% stop threshold.

The correction fixes measurement bookkeeping only. It did not change the candidate family, any registered parameter, H1 simulation, or stop decision. The regression test passes; final full-test/build results are recorded in the evidence README after rerun.
