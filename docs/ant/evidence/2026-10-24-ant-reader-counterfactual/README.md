# ANT reader counterfactual — preflight stop

## Question and boundary

This pass asked whether one reader-only formulation could improve analytic-cue fidelity on the exact frozen pheromone rasters while preserving local steering signs, wide winners, straight symmetry, mirror symmetry, and S-route ambiguity. It began from freshly fetched production `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2` on branch `codex/ant-reader-counterfactual-20261024`.

Production source remains unchanged. No field, reader, sensor, movement, RNG, or world simulation was changed or run. No candidate D was implemented or evaluated.

## Stage 0 — current bilinear mechanism

`PheromoneField.sample` maps normalized coordinates to grid coordinates with `gx = 95x`, `gy = 95y`, then forms a convex bilinear combination of the four adjacent stored nodes. The default support radius `.0045` is smaller than the grid pitch `1/95 ≈ .0105263`, so the frozen straight write can occupy one transverse row while its neighbor is empty. The query value then varies linearly with its fractional row coordinate. A half-cell shift can therefore change the opposing side reads even when the stored raster is byte-identical.

The frozen straight control makes the mechanism explicit. At station `0.122`, p00 and p01 production rasters are byte-identical. The occupied row is `y = 48/95 = 0.5052631579`; the centered physical route is at `y = 0.5` in p00 and at the occupied row in p01. For an x query at `0.488`, the p00 mirrored lateral queries `y = 0.497` and `y = 0.503` map to `gy = 47.215` and `47.785`. The saved C samples are `0.00952020025` and `0.03475980090`: they are respectively `0.215` and `0.785` times the same inferred row-48 value at x `0.488`, `0.04428`, with row 47 empty. This is an x-interpolated row value inferred from the saved queries, not a recovered individual node. At x `0.5`, the matching pair is `0.00870750023` and `0.03179250082` from an inferred row value `0.0405`. The analytic A pair is symmetric. The unchanged local operator consequently gives p00 C steering `+0.1970896621 rad`, while A and B are zero. In p01, the frozen query geometry is centered on row 48; C left and right both equal `0.00763020020` and steering is `−1.17e−15 rad`.

This is an interaction between the reader and the stored raster: bilinear interpolation supplies the fractional weights, while the production raster has only one occupied transverse row. The p00/p01 byte-identity result comes from the prior analytic-reference byte-level check at commit `2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa`, `docs/ant/evidence/2026-10-24-field-analytic-reference/README.md`. The present pass did not recompute that check because it has no raster buffers. This result does not establish that a replacement reader would recover the lost subcell trail shape.

The curved tight-route control also shows a direct analytic-node bilinear failure. At tight / p00 / station `0.294`, analytic A's strict winner is offset `0` with final-score margin `1.8186870738`. The raw candidate maxima are A `[0, 0, 0.0607864711, 0.0275097548, 0]`, B `[0, 0, 0.0320162778, 0.0323878745, 0]`, and C `[0, 0, 0.0352857840, 0.0410850568, 0]`. B already favors `+0.47`, so the existing analytic-node-plus-bilinear path is sufficient for this high-margin qualitative failure.

## Frozen-input audit and stop reason

The exact 5,544-row A/B/C cohort was reused byte-for-byte from writer/reader attribution commit `ea3d382c6c849df7505e1d398cef085ca271c8b9`:

- [`station-raw.json.gz`](inputs/station-raw.json.gz), SHA-256 `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29` (11,956,961 bytes).
- [`abcs-stage-rows.json.gz`](inputs/abcs-stage-rows.json.gz), SHA-256 `a456a10a49445dbd54cd760ad7b371ffbdead6579777d2b05f89b0ddadd5678b` (7,104,982 bytes).
- Uncompressed frozen input SHA-256 recorded by the source package: `bdab38fd13ccb8bae6689cdb7af134c52265969849d4cbfdd5c528677628e13d`.

The input has six route fixtures, four phases and 231 stations per fixture/phase. Each row stores query results and frozen query geometry: 18 local point reads, five wide candidates with five transverse reads each, A/C samples, per-query residuals, and derived sensor outputs. The stage rows similarly store A/B/C query values and aggregate results. Neither artifact contains the 96×96 Float32 node arrays for the production rasters. The source analytic-reference package also contains per-query outputs and residuals, not complete node arrays. Receipts and the exact inspected row schemas are in [`validation/preflight.json`](validation/preflight.json).

A non-bilinear D reader must read the exact production node values at its own support points. They are absent from every hash-validated frozen artifact inspected for this pass. Inferring nodes by solving from bilinear query outputs would produce a reconstructed raster, not the original Float32 raster; replaying deposits would regenerate the forbidden production rasters. Either path would break the C/D identical-raster requirement. The current evidence also does not identify one unique within-cell basis: nearest-node hold, cubic interpolation, or a writer-kernel reconstruction would encode different unvalidated assumptions and artifacts. Therefore no reader candidate was preregistered or tested.

## Result and decision

**MIXED / RESEARCH-ONLY — stopped before candidate evaluation.** Stage 0 confirms that bilinear reconstruction is sufficient for the named tight-route failure and participates in the straight p00 asymmetry. The requested D qualification remains unmeasured.

The following are not reported as candidate outcomes because no D arm exists: recovery among 335 reader-sufficient local failures; new local failures; recovery among 993 wide raw-max and 841 weighted-max failures; final and high-margin winner changes; straight/mirror/S regression; 125 local and 598 wide restoration-control changes; writer-sufficient-control behavior; directional contrast; runtime cost. No candidate-specific tests apply.

The smallest next step is to package the exact frozen 96×96 Float32 node arrays (including per-raster hashes and a receipt tying them to the saved A/B/C input) from the original capture. Then one candidate can be preregistered against the unchanged cohort without rerunning the writer or reconstructing the raster.

## Validation

- `PheromoneField.js` and `AntController.js` match the source hashes recorded in [`validation/preflight.json`](validation/preflight.json); no production source changed.
- Focused existing tests: `tests/pheromone-field.test.js` 8/8, `tests/ant-controller.test.js` 21/21, and `tests/ant-trail-following.test.js` 8/8 passed when run directly with Node.
- The combined `node --test` invocation could not spawn its worker processes in this environment (`spawn EPERM`); direct per-file runs passed all 37 tests.
- No candidate test or full build was run. No build-relevant source changed.

Daily chronology: [2026-10-24 reader counterfactual preflight](../../../daily/2026-10-24-ant-reader-counterfactual.md).
