# 2026-10-24 — Pheromone reader counterfactual preflight

## Question

Can one reader-only formulation improve analytic cue fidelity on the exact frozen production rasters while preserving local steering signs, wide winners, straight symmetry, mirror symmetry, and the S-route zero-cue regions?

## Baseline and method

- Freshly fetched production baseline: `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Created `codex/ant-reader-counterfactual-20261024` from that commit.
- Inspected current `PheromoneField.sample`, `AntController` local/wide sensor paths, focused tests, and the ANT hub. Production source hashes are recorded in the evidence package.
- Reused and hash-checked the exact 5,544-row A/B/C frozen input from `ea3d382c6c849df7505e1d398cef085ca271c8b9`; did not regenerate routes, phases, queries, or production rasters.

## Stage 0 result

- Bilinear sampling linearly weights the four adjacent nodes. On a one-row sparse footprint, matched queries on opposite sides of a half-cell center receive different weights for the same occupied node.
- For the byte-identical straight p00/p01 raster, p00 C produces `+0.1970896621 rad` where A and B are zero; p01 remains symmetric at approximately zero. At x `0.488`, y `.497/.503` sample values are `.0095202/.0347598`, exactly matching `.215/.785` interpolation weights on the same inferred `.04428` row value.
- At tight / p00 / station `.294`, A's winner is offset `0` with analytic margin `1.8186871`; B's analytic-node-plus-bilinear raw maxima already favor `+0.47`. Bilinear reconstruction is sufficient for this named high-margin failure.

## Stop and decision

The frozen input and A/B/C stage rows contain query results, residuals, sensor outputs, and query coordinates. They do not contain the exact 96×96 Float32 stored node arrays required by a reader-only D arm. The exact frozen rasters cannot be recovered from query samples without estimating a new raster, and deposit replay would violate the instruction not to regenerate them. Stage 0 also does not uniquely prescribe one intra-cell basis from the available output evidence.

No candidate was preregistered, implemented, or evaluated. No movement or free-running world was run. The decision is **MIXED / RESEARCH-ONLY — preflight stop; candidate qualification unmeasured**. The smallest next step is to package the exact raster node arrays with byte hashes and provenance tying them to the frozen A/B/C input, then evaluate one preregistered reader on that same data.

## Validation

- Focused existing tests passed when invoked directly: pheromone field 8/8, controller 21/21, trail following 8/8.
- The combined `node --test` command hit environment `spawn EPERM`; direct file runs passed all 37 tests.
- No candidate-specific tests or full build were run; production source was unchanged.

Evidence: [reader counterfactual preflight package](../evidence/2026-10-24-ant-reader-counterfactual/README.md).
