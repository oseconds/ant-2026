# Gate 1 assay erratum

`invalid-lattice-implementation-v1.json.gz` is preserved as the first harness output, SHA-256 `9a24f37a6aa31f08b07ad3fae179f9cf1b9d8ec5838fa630d7adbbd6112f97b7`. It is invalid: the point suite accumulated 64×64 deposits at different grid nodes rather than testing each frozen midpoint as an isolated write, and the route roundoff budget captured node values after depositing. Do not use its PASS status as a Gate 1 result.

The corrected harness follows the frozen 64×64 midpoint square around node (48,48), applies the four preregistered half-cell phases, clears the field for every write, compares raw physical moments to requested amount times source x/y, and records per-write bounds and failures. No protocol threshold, candidate writer, or Gate 2/3 criterion changed.
