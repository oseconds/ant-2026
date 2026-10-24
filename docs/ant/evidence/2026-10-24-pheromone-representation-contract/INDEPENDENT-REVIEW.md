# Independent review — 2026-10-24

**Result: bounded accept; no blocker found in the geometric or cross-consumer claims.** This accepts only the stated representation constraints and isolated probe results. It does not qualify a replacement field, natural cue quality, movement outcome, or either closed CIC gate.

## Final package verification

The two non-blocking gaps from the first review are resolved in this snapshot. The README's `VALIDATION.md` links now point to an existing file, and `probe-receipt.json` now includes `GasterDeposition.js` for the default dab-path claim.

- Recomputed byte counts and SHA-256 values match every probe receipt input, including `GasterDeposition.js`, and `probe-results.json` matches the recorded result hash `08ed0345ad8a67d17758024b7b921ae9c3488c1a21bfd0dc258216d395bf9ae2`.
- The compressed and decompressed byte lengths and SHA-256 values for `tests-sandbox.log.gz`, `tests.log.gz`, and `build.log.gz` all match `validation-logs.json`. The preserved sandbox log records `spawn EPERM`; the ordinary test log ends with 355 passed and 0 failed; the build log ends with a successful build and the warnings summarized in `VALIDATION.md`.
- `VALIDATION.md` records `npm test` and `npm run build` as exit 0. I read the saved logs and hash records; I did not rerun tests or the build.

**Final disposition: bounded accept, with no remaining packaging blocker.** The mathematical verdict below is carried forward from the independent review; this final pass checked packaging and hash integrity only.

## Independent checks

- The convex-hull criterion is correct for nonnegative nodal increments with a fixed positive total: after normalizing by dose, the source must be a convex combination of supported node coordinates. Conversely, any such convex combination gives the requested nodal first moment. At the production pitch, `2R = 0.009 < h = 1/95`, so a strict-radius disk contains at most one node. Any off-node source therefore fails exact nodal centroid preservation under that support rule; the existing nearest-node fallback preserves dose by violating the rule.
- The four all-position bounds and integer thresholds check out for a square endpoint lattice on `[0,1]²`: coverage `h/√2` → N=159; nodal centroid feasibility `√5 h/2` → N=250; four-corner CIC write support `√2 h` → N=316; CIC write plus bilinear-read support `2√2 h` → N=630. The centroid converse uses a source just to the right of a grid line and halfway between rows; the constructive nearest-node/two-axis-neighbor weights establish sufficiency. These are uncapped, nodal, geometric bounds. N=316 and N=630 answer different meanings of radius, and N=630 exceeds the current constructor maximum of 512.
- The write/read distinction is valid. A bilinear nodal basis reaches one pitch from its node in each axis, so a write node can affect queries outside the write disk. The `ε⁴` witness is strictly positive but tiny; the report correctly limits this to exact support and draws no perceptual or sensor-failure conclusion from it.
- The unit and boundary cautions match the interpolation code: an interior unit nodal value integrates to `h²`, edge/corner basis integrals are `h²/2` and `h²/4`, and a clipped boundary hat shifts its continuous centroid inward by `h/3`. Nodal and reconstructed moments are distinct. Per-node caps can make a target centroid infeasible despite sufficient aggregate headroom; production clamps each node independently, returns requested point dose, and does not report the rejected amount.
- The perpendicular-pair example is algebraically correct for CIC: the two equal horizontal writes and two equal vertical writes yield the same four nodal values `[0.25, 0.25, 0.25, 0.25]`. It establishes a specific subcell orientation ambiguity, not general cue loss for every writer or route scale.
- Consumer paths support the shared-contract warning: controller sensing and `ColonyActivation` call `.sample()`; `TrailPlateBirth` prefers raw `.values/.width/.height` and performs its own bilinear sample; the renderer reads raw values through fixed alpha thresholds; and `getSnapshot().totalMass` is the unweighted nodal sum. The package correctly treats units, raw-array interpretation, support and cap semantics as coupled choices.
- The probe assertions corroborate the claims they can test: three production writes, the tail and cap examples, immediate-predecessor threshold witnesses, 10,201 finite triangle certificates, and the algebraic pair ambiguity. The finite mesh does not establish all-position sufficiency; the written proof does. I reran only this permitted geometry probe; it passed with the recorded result hash `08ed0345ad8a67d17758024b7b921ae9c3488c1a21bfd0dc258216d395bf9ae2`. Independently recomputed byte counts and SHA-256 values match every listed input and the result file.

The package preserves its stated limits: prior CIC outcomes remain inherited evidence, Gate 2 remains **MIXED / NOT QUALIFIED**, Gate 3 remains **NOT RUN**, no replacement candidate is selected, and the probe does not claim natural-ground-truth moment or local-cue preservation.

## Review boundary

Read the current repository instructions, ANT hub and world-model design contract; inspected `PheromoneField`, controller, Gaster deposition, material, activation and renderer consumers. No historical archive or old cue chain was opened. No full test suite, build, movement run, natural run, or replacement candidate was tested.
