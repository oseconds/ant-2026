# Validation and provenance

## Source and scope

- Branch starts from exact origin/main commit 1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44.
- Current TrailPlateBirth.js Git blob: 238cc365f2602dc6a22091d69237b88962825a13.
- Current LF-canonical SHA-256: cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67.
- Current raw SHA-256: 283de374bc38cd8baae47d99d253d43b71b800edbf4747d19d06299986c12860, exactly matching the saved capture source bytes.
- No src/ or static/ files are edited. This analysis imports no controller, simulation, movement, material, renderer, or RNG state.

## Frozen packet chain

1. Source packet: 0d5096a920e1ebb2086fa1dae782c5d4e871b590:docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz.
   - Gzip SHA-256 909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc, 17,766,995 bytes.
   - Decoded JSON SHA-256 fba546769a1ddc552247a93f5c2d3719193b8d4785ed672442dcae1960e25339, 69,227,056 bytes.
   - Seed 20261005, 60 Hz, Audio Off, 96×96 grid.
2. The extraction script retained the exact 21 P1 and 21 P2 saved maps for E_qualified, F_skeleton, D_support, and I_retained_network; no simulation replay or map reconstruction was performed.
3. The earlier UPDATE packet at 66e1b9812fc160910f60b18f17e49e8d3b674ee9 matches all 42 model times, E sets, and production-I sets exactly.
4. The earlier capture input packet at 5b9cd6ba47368cd61c0391cc64f9dc62416c7ef8 matches E, F, and D_support exactly at all ten shared anchors.
5. The registered prior max-D nuclei and X node sets reproduce exactly at all ten shared anchors. Current-source thinning of E reproduces saved F exactly at all 42 anchors.

## Observer and deterministic checks

- The analyzer reads immutable grids and performs only local set, graph, and distance calculations. Math.random is replaced with a throwing guard during every run; no RNG call occurred.
- n0 admissibility is checked at every anchor. The sequence stops on first invalidity without repair; no invalidity occurred.
- node scripts/ant-materialization-fixed-nucleus-update.js --write regenerates analysis.json, transition-table.csv, transition-cells.json, and validation.json.
- node scripts/ant-materialization-fixed-nucleus-update.js --check recomputes those outputs and byte-compares them with the saved results.
- Input extraction, prior UPDATE parity, prior capture parity, and exact common-anchor X/nucleus parity are available as machine-readable receipts under data/.
- hash-manifest.json records exact SHA-256 hashes. It omits itself because a file cannot contain its own final hash.

## Explicit exclusions

No new natural trajectory, seed, parameter sweep, selector law, membership retention, hysteresis, nucleus repair, allocation redesign, legacy source→boundary gate transfer, maturation/COMMIT, body, descriptor, geology, audio, Residence, production source change, PR, or merge was performed.
