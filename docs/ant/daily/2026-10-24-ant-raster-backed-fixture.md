# 2026-10-24 — Raster-backed controlled pheromone fixtures

## Question

Could the prior controlled analytic-reference dataset support a trustworthy reader-only counterfactual when it contained frozen production C query values but no stored 96×96 node arrays?

## Baseline

Fetched `origin/main` at `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. Pinned and hashed `PheromoneField.js`, `GasterDeposition.js`, and `AntController.js`; their source blobs match the analytic-reference baseline. Reused the exact six routes, four phases, and frozen query rows with hashes recorded in the evidence package. The old node arrays were absent, so all new rasters are described as deterministic replay-backed captures.

## Work and result

Generated the ordered 77-write Gaster dab stream for every route/phase arm, wrote the preflight stream receipt before raster execution, and used the unchanged production `PheromoneField.depositPoint` writer. Saved all 24 little-endian Float32 arrays plus hashes and row mappings.

All 99,792 local and 138,600 wide frozen production C reads matched using exact JavaScript numeric equality; maximum error was zero. Actual production local and wide sensor methods reproduced all stored aggregates, scores, ranks and winners exactly, with zero RNG calls. Straight p00/p01 bytes match each other. A second full generation reproduced all arrays and receipts byte-for-byte.

**Decision: QUALIFIED RASTER-BACKED FIXTURE.** This qualifies the input for a later reader-only C/D comparison. No reader candidate, production edit, movement, or free-running simulation was performed.

## Validation and limit

Focused field, gaster, trail-following, and controller tests passed (46 total). No full build was run because production source stayed unchanged. The raster arrays are deterministic replays, not recovered historical arrays; only the prior straight p00/p01 equality control supports a historical byte-identity claim.

Evidence and reproduction: [raster-backed fixture package](../evidence/2026-10-24-ant-raster-backed-fixture/README.md), `node scripts/ant-raster-backed-fixture.js`.

## Next step

Run the fixed-geometry reader-only comparison with these exact raster bytes shared by both C and D. Do not proceed to movement until that pass reaches its own decision gate.
