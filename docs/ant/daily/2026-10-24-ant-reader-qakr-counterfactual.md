# QAKR reader-only counterfactual — 2026-10-24

## Question

With production writer and all 24 replay-backed Float32 rasters fixed, can one quantization-aware local reader improve analytic cue fidelity and the previously identified local/wide qualitative failures enough to justify a movement shadow?

## Work and evidence

- Started from freshly fetched `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`; production field, deposition and controller source remained unchanged.
- Reused the qualified raster fixture at `9afcc130f23c85f34cdf64073a2c95c945c0b320`, the frozen writer/reader attribution cohort at `ea3d382c6c849df7505e1d398cef085ca271c8b9`, and its exact controlled-route provenance. The 24 manifest rasters were SHA-checked before and after C/D reads.
- Preregistered and evaluated exactly one reader: QAKR, the fixed compact-Gaussian expected basis over a uniform subcell source position. It used deterministic analytic-y integration plus fixed 24-point Gauss-Legendre quadrature; no fitted parameter, RNG, field mutation, or production change.
- The basis passed finite/nonnegative, zero, constant-field, grid-node, reflection/rotation, deterministic-repeat and quadrature checks. Current bilinear C reproduced all 238,392 raw reads exactly and the frozen sensor aggregates/ranks exactly.
- D lowered pooled raw-value MAE slightly, but worsened local sign mismatch (552→612 of 4,012), local steering MAE (.06313→.07228 rad), and phase spread. It recovered only 19/335 local reader targets and introduced 99 opposite signs on C-correct rows. It recovered 39/993 wide raw-max and 50/841 weighted-max targets; total wide winner mismatches changed 2,378→2,326 with 94 recoveries and 42 new failures.
- Straight p00 false steering grew `.19709 → .21754 rad` while p01 stayed near zero on the byte-identical raster. Mirror symmetry remained near machine precision; S-route analytic-zero rows gained larger average false steering. Quadrature cost was about 28.5 million evaluation nodes for the fixed offline set.
- Independent review found no result blocker. Before final validation, the helper was fixed to its 96×96 node count, the gate now enforces constant-field residuals and nonnegative candidate outputs, and the cohort receipt explicitly accounts for the 3 mixed/compound rows in the prior raw-first group.

## Decision

**MIXED / RESEARCH-ONLY. Not qualified for movement shadow.** Small raw and wide-ranking gains coexist with meaningful local regressions, more phase sensitivity, persistent high-margin errors, and an expensive reference implementation. Directional contrast was not flattened; the problem is inconsistent relation between added contrast and analytic correctness. Keep production bilinear. Do not tune QAKR or test another reader in this pass.

The next justified action is no movement work. If reader research resumes later, first derive a model from the production writer’s discrete per-brush weight normalization rather than extending this candidate. Full measurements, controls, hashes and reproduction commands are in [`the evidence package`](../evidence/2026-10-24-ant-reader-qakr-counterfactual/README.md).

Focused validation passed: QAKR 4/4; pheromone field 8/8; controller 21/21; trail following 8/8; gaster deposition 6/6; gaster integration 3/3. No full build/browser/realtime check; production source was unchanged and the task ended at frozen geometry.
