# Validation — current-production stateless X shadow

## Authority and provenance

- Starting branch HEAD: `1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44`.
- `origin/main`: `1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44`.
- Observer branch: `codex/ant-materialization-research-closure-20261031`.
- `TrailPlateBirth.js` Git blob: `238cc365f2602dc6a22091d69237b88962825a13`.
- Analysis seed files record SHA-256, LF-normalized SHA-256, and Git blob IDs for every source used by the controllers and unchanged renderer.
- The natural histories were run twice. The SHA-256 fingerprint over the 599 saved anchors, actual birth records, and accepted-spawn events matched both runs per seed:

| Seed | Deterministic history SHA-256 |
| --- | --- |
| 20261005 | `d29e90e60b649f8c8187c3c4ff1a12d3acdec3f6aade6a9525613db3ecb0d242` |
| 20261006 | `9a1a9526f9632667cf379cbefd7a50978b277beecb715befbffb2e826a2859a8` |
| 20261007 | `dc327a0929852cbf1ed0f1f2736076ffc6f4c91cefd880ad8c589cd6a1b2db27` |

These fingerprints exclude only three later-added geometry summary fields (`sourceDistanceFromEntry`, `centroidDistanceFromSource`, and `geodesicLength`), which are derived from already-hashed selector coordinates and distances. The per-seed compressed records preserve those summaries as well as all underlying anchor data.

## Observer parity

| Per seed | Result |
| --- | --- |
| Ticks compared | 36,000 / 36,000 |
| Agent/spawn clock/RNG parity | Equal every tick |
| Full environment parity | Equal at all 599 actual production analysis boundaries |
| Observer RNG calls | 0 |
| Controller RNG calls | Identical observed and plain counts/states |
| Audio bridge | None; Audio Off |
| Production `TrailPlateBirth` changes | None; source hash unchanged |
| X-created Plate/material state | None |
| Simulation/controller errors | 0 |

The full analysis-boundary fingerprint includes pheromone, SurfaceField, TrailPlate chemical memory, contact counts, production candidate, Plate list, MaterialStratigraphy arrays, deposition state, activation state, agents, and RNG state. The observer copied E/D, preserved the current production candidate mask, and did not call `Math.random`.

## Capture invariants

- Every valid X contains its selected nucleus and forms one 8-neighbor connected component.
- Every X node is a member of current `F ∩ Disk(n,.15)`; observed maximum radius was at most .1496071 normalized units due to grid sampling.
- The selected nucleus is edge-bearing in F and equals the first eligible D-ranked entry, with row-major index as tie-break.
- Production source→boundary candidate skeletons remained subsets of F. Actual born Plate masks matched their production candidate masks at every actual birth.
- X observations did not create or alter production candidates, birth timing, Plates, stratigraphy, fields, movement, spawn heading, or renderer state.
- `src/` and `static/` were unchanged in the branch diff.

## Fixed-frame rendering

Twelve matched world/candidate/X frames were rendered with the unchanged `AntRenderer`, material On, pheromone Off, and equal 720×720 world scales. Browser page/console errors were empty. The all-seed/time sheet and technical atlas are valid PNGs; byte lengths, SHA-256, and dimensions are recorded in `visual/manifest.json`.

## Artifact hashes

`analysis/manifest.json` records SHA-256 and byte length for each gzip seed packet, the summary, parity file, and birth-context file, along with source hashes and deterministic history fingerprints. `visual/manifest.json` records image hashes and render settings.

The one-time summary refresh recomputed selector statistics from saved anchors without rerunning or altering the world history. The normalized deterministic fingerprints above remained identical to both full simulation runs.

## Limitations

- Three seeds are the replication units; anchors inside a history are serially dependent.
- The 1-second production scheduler yielded 599 rather than 600 analysis rows in 600 model seconds because some minimum intervals crossed a 60 Hz tick boundary. The saved schedule uses only actual source calls; there is no synthesized sample at 600 s.
- Birth ±10/±20 contexts are included only when a production analysis row matches the exact rounded model time. Missing offsets are not interpolated.
- Current production outcomes are context only because X is observer-only.
- No X COMMIT, body/descriptor, geology, sound, Residence interaction, long-term turnover, or artistic acceptance was tested.
