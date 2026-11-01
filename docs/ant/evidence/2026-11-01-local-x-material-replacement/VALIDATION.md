# Validation — local-X material replacement

## Authority and isolation

- Branch: `codex/ant-local-x-replacement-20261101`.
- Experiment base: `7c96c128bd32bea33f69d8a1c1d08cf85d4421f8`.
- Production authority commit object `bc045dc3caa5954df633ecbee37fbabcb8224f30` exists locally.
- The working `src/` and `static/` diff from the authority exactly matches the prior receipt's default-off `researchLayerCountProvider` hook. Current source bytes match the validated real-stratigraphy checkout receipt. No provider is passed in either arm; this pass adds no production-source or static-file changes.
- Each arm creates a new controller, seeded RNG and material world. AudioBridge is absent. The replacement wrapper intercepts native `trail-plate-*` material insertion while retaining native TrailPlateBirth updates, selector records and chemical-memory evolution.

## CONTROL conformance

Each seed passed all 300 one-second control anchors against the frozen 600 s authority receipts: E/F/B/C/D, native layer-count and top maps, native selector IDs and masks, and saved RNG calls/state matched. Frozen/live B/C track identities were mapped one-to-one after checking every opportunity row and recapturing its exact X mask. Maturation identity, clock, interval, center and mask matched the frozen event stream.

| Seed | CONTROL native births through 300 s | B/C opportunity rows checked | Recaptured X cells | Frozen B/C maturations matched |
|---|---:|---:|---:|---:|
| 20261005 | 14 | 25,364 | 1,244,304 | 277 |
| 20261006 | 7 | 25,857 | 1,035,269 | 325 |
| 20261007 | 11 | 25,290 | 1,119,137 | 323 |

The per-seed details are in `analysis/campaign-runs.json`, `analysis/authority-receipts.json` and `analysis/invariants-and-conformance.json`.

## World and material invariants

| Seed | Arm | finite agent checks | finite field/material boundaries | post-init spawned-ant clearance checks | research RNG calls | selector shadows skipped | final actual Plates | Nodules |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | CONTROL | 281,227 | 300 | 398 | 0 | 0 | 14 | 5 |
| 20261005 | REPLACEMENT | 264,793 | 300 | 403 | 0 | 12 | 156 local X | 0 |
| 20261006 | CONTROL | 250,141 | 300 | 390 | 0 | 0 | 7 | 3 |
| 20261006 | REPLACEMENT | 258,265 | 300 | 385 | 0 | 12 | 143 local X | 0 |
| 20261007 | CONTROL | 274,460 | 300 | 396 | 0 | 0 | 11 | 5 |
| 20261007 | REPLACEMENT | 267,766 | 300 | 385 | 0 | 14 | 137 local X | 0 |

The runner checked finite ant position/velocity/heading and world bounds every tick; finite pheromone, SurfaceField, B memory, contact history, layer counts and depth at each native one-second boundary; and normal clearance for each spawned ant. All six arms report zero research RNG calls, no AudioBridge, no active research layer-count provider, nondecreasing insertion chronology, and successful native topology compilation.

The recorded clearance count is the number of post-initialization spawned ants checked against every current agent; it is not the number of possible ant pairs. The initial single ant is created through the unchanged native spawn routine into an empty world.

In each replacement arm, every native selector descriptor was shadow-recorded and skipped by stratigraphy insertion. The actual stratigraphy contains only `research-local-X-*` IDs, and its Plate count equals the accepted local-X ledger count. Each stored mask and B/C provenance matched its accepted decision; descriptors and stored Plates have no source, target, corridor, centerline or principal-path fields. Local Plates use the helper's shared neutral coefficients and native default thickness.

The existing 256 Plate capacity was not reached; final replacement counts were 156, 143 and 137. No replacement Nodule was born and the native 32-Nodule cap was not reached. CONTROL's 5, 3 and 5 Nodules and their foundation/source lineage are retained in `analysis/nodule-lineage.json`.

## Window completeness and outputs

Each of the five fixed windows in each arm contains exactly 3,600 indexed 60 Hz tick samples and 60 one-second anchors. Tick-index assignment avoids floating-point drift at 60-second boundaries. Birth and maturation windows remain half-open on their saved model timestamps. The checkpoints include pheromone, SurfaceField and B chemical-memory statistics, material coverage/layer/depth/burial/Nodule counts, movement, and population.

The complete event and material ledgers, spatial measures, pairwise selector comparison and run chunks are under `analysis/`. Five compact objective SVGs per seed are under `visual/`: final material maps, births per window, coverage/layering, nearest-entry distances, and Nodule births. All 15 generated SVGs parse as XML with an `svg` root, and all eight relative links in this package and its new daily record resolve.

The package manifest verifier checked 125 evidence files, 20 source/tool hashes, three linked documentation files, 214 frozen input files and all 363 `SHA256SUMS` entries.

Reproduce the saved runs with `node scripts/ant-local-x-material-replacement.js`; regenerate summaries and figures with `node scripts/ant-local-x-material-replacement-results.js`. `manifest.json` and `SHA256SUMS` cover the package, inputs, source/tools and linked chronology documents using LF-normalized UTF-8 for text and raw bytes for compressed data.

No general test suite, Audio-On run, long-horizon run, alternate parameter, tuning pass or adoption review was part of this experiment.
