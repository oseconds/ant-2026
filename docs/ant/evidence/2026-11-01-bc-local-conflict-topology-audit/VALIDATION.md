# Validation

- Current research branch starts at capacity audit `ebd1f34c5d2322bd5d3c3d6c8b83bad5a8fd7b6e`; production source authority recorded as `bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Reverified every manifest file and checksum entry in the registered local-conflict and capacity packages. Conflict manifest SHA-256: `bff8cead2f860caf1c589023d05eae374224de6bb0aaa6739736d7b680681892`.
- Loaded exactly 163 slots, 1846 option appearances, and 1352 components. Source per-seed counts: 55/54/54 slots, 576/665/605 options, 422/486/444 components.
- Direct pairwise set intersection matched cell-to-option inversion and all registered edges. BFS component sets matched registered partitions and union-find reconstructions.
- Brute-force exhaustive subsets and recursive include/exclude search matched exact `ω`, `α`, and full maximum-set mask sets for all components. Maximum component size: 12.
- Reconstructed registered unambiguous adjacent topology transitions: 108; equals registered count. No split/merge continuation IDs were invented.
- Analysis rerun is deterministic; gzip timestamps are fixed. Both deterministic SVGs are generated from exact X masks.
- Observer RNG calls: 0. Simulation/replay: none. `src/` and `static/` production behavior: unchanged.
