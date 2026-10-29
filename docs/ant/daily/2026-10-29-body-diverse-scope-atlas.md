# 2026-10-29 — BODY comparison across diverse COMMIT scopes

Started from clean BODY design-space parent `d933e0ed0e7cdf15361b3e8f024f5a6d485e44c8`; production main remained `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`. Reused the existing 36-commit current-G/H0 sequence and prior deterministic descriptor reconstruction. No simulation or replay ran.

Before candidate output, inventoried all 36 scopes and selected P4, P22, P25, P23, and P3 by fixed size, junction, tortuosity, and compactness rankings among P3–P36. Frozen raw IDs, timestamps, and production-mask hashes matched all 36. P1/P2 full descriptors matched their frozen BODY packet. The prior reconstruction's PheromoneField source mismatch remains explicit; later graph edges are reconstruction-supported rather than independently frozen edge lists.

Rendered exact existing P/K/H definitions at one shared 96-grid scale. Across the five cases P/K remained close (`Jaccard .919–.954`); H spanned gaps and covered `1.93–2.46×` production footprint area. These relationships resemble P1/P2 and do not establish a winner. Exact later commit-time B maps are absent, so U/W/S were marked omitted in Atlas B rather than approximated.

Current natural scopes vary substantially in size and branching but still use the authored source-annulus-to-observation-boundary selector. **BODY comparison under current natural commits is still conditioned by the authored production selector.** The pass stops at visual comparison; no body law or next technical pass is selected.

Evidence: [`2026-10-29-body-diverse-scope-atlas`](../evidence/2026-10-29-body-diverse-scope-atlas/README.md). Validation and explicit omissions are in its `VALIDATION.md`.
