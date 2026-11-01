# Validation

## Source integrity

- The source audit manifest and all 27 source-package checksum rows were reverified before analysis.
- Each of the three source slot gzip files matched the registered hash; the packet schema, per-seed slot count, actual saved timestamps, unique sorted X masks, X hashes, same-mask B/C collapse, candidate channels, and frozen component IDs were checked.
- Exactly 163 slots were loaded: 55 / 54 / 54 by seed. No world was simulated or replayed.

## Graph and arithmetic

- Every slot uses one node per registered unique X mask and an edge iff exact cell intersection is non-empty.
- Primary direct set-intersection edges and BFS components were independently reconstructed with sorted-array two-pointer intersection and union-find. Edge sets and component partitions matched exactly in all 163 slots.
- One-per-component cumulative totals were independently recomputed from the slot component counts; first strict crossing of 256 was checked against saved actual slot timestamps.
- The six available objective slots were reselected deterministically from the registered rules. The requested `{B,C}`-node-with-overlapping-distinct-X case did not exist and is reported as `none`.
- Per-slot option/component counts, pairwise relations, component masks, F sensitivity, and persistence receipts are machine-readable under `analysis/`.

## Determinism and boundary

- Analysis was run twice; all 13 analysis-file hashes matched across reruns.
- The SVG atlas was generated twice with identical SHA-256: `436ab325d5d427d0aae8588a92a39e71cb8aa75cca7ec0ab14f871442d84eafc`.
- The atlas outlines each selected slot's every unique X option directly from the saved masks. It does not run a replay or use a new world frame.
- The analysis and visualizer use no RNG.
- `git diff bc045dc3caa5954df633ecbee37fbabcb8224f30 -- src/ static/` returned empty.

## Visualization limitation

An SVG vector atlas is included. PNG rasterization was attempted but not available in the execution environment: Playwright's Chrome launch failed with `EPERM`; installed FFmpeg reported no SVG decoder. This does not affect the source receipts or SVG geometry, but means no PNG preview is supplied.
