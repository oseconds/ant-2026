# 2026-10-24 — Pheromone writer / reader failure attribution

## Question

For the existing local steering sign failures and wide winner failures, determine whether analytic-node bilinear reconstruction alone is sufficient or whether production Float32 raster values are required.

## Baseline and method

- Fresh production baseline: `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Reused analytic-reference commit `2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa` and sensor-isolation commit `e0340d21196438ea56cadd178b81b2d8064755e6`; copied the exact frozen input by SHA, without merging either branch.
- Compared A continuous analytic samples, B analytic nodes through the production bilinear path, and C production raster samples at identical frozen queries. Replayed the unchanged local and wide production aggregation; no RNG, movement or world run.

## Result

- Local: 335/546 stable sign failures are reader-sufficient; 211 are writer/storage-sufficient. Three near-zero cases remain separate.
- Wide raw maxima: 993/1,380 unambiguous reader-sufficient, 328 writer/storage-sufficient, 56 exact B-top-tie ambiguous, and 3 S-route compound rows where A's raw-max winner already differs from its final analytic winner.
- Wide weights plus max: 841/998 unambiguous reader-sufficient, 123 writer/storage-sufficient, and 34 exact B-top-tie ambiguous.
- Reader/storage errors cancel in some controls: B is wrong but C returns to A for 125 local direction rows and 598 wide final winners. The top analytic-margin decile contains 151 unambiguous reader-sufficient, 78 writer/storage-sufficient, and 9 B-top-tie ambiguous mismatches.
- Straight p00/p01 uses byte-identical production raster buffers per the prior byte-level test. Frozen half-cell query translation changes bilinear sample alignment: p00 produces `+0.1970896621` rad from C while A and B remain at zero; p01 remains symmetric.

## Decision

Both reader-only and writer-only changes have causal evidence, but reader/reconstruction accounts for the larger unambiguous share. Exact B top ties are reported as ambiguous when they include A's target but the deterministic lower-index tie-break picks a different candidate. Recommend one later reader-only fixed-geometry counterfactual first, with the unchanged production raster and all restoration/tie controls retained. Do not couple writer and reader in the first alternative test. No alternative or production change was made in this pass.

Evidence and reproduction: [writer / reader attribution package](../evidence/2026-10-24-ant-field-writer-reader-failure-attribution/README.md).
