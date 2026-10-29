# Validation and provenance

## Baseline and preservation

- Production main: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785` (confirmed from the authenticated GitHub branch API at start).
- Research parent: `d933e0ed0e7cdf15361b3e8f024f5a6d485e44c8`.
- Research branch: `codex/ant-body-diverse-scope-atlas-20261029`.
- Starting worktree was clean at the parent. The pre-existing ignored `test-results/` and `.cache/` content was left untouched.
- Changes are limited to new research scripts/evidence and the requested daily chronology. No `src/`, `static/`, canonical README, or older evidence package was modified. The P1/P2 atlas remains unchanged.
- No natural run, replay, RNG use, or production behavior change occurred in this pass.

## Inputs and exactness limits

- Frozen 600 s raw packet: `docs/ant/evidence/2026-10-25-g-production-candidate-review/data/seed20261005-G-raw.json.gz`, SHA-256 `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`.
- Existing reconstructed descriptors: `docs/ant/evidence/2026-10-29-stratigraphy-signal-audit/data/reconstructed-commit-context.json.gz`; exact byte hash is in `hash-manifest.json`.
- Frozen P1/P2 BODY reference input: `docs/ant/evidence/2026-10-29-material-body-design-space/data/frozen-body-inputs.json.gz`; exact byte hash is in the manifest.
- All 36 actual IDs, order, timestamps, and binary production-mask digests match the frozen raw packet. P1/P2 full I nodes, edges, principal paths, masks, and times match the prior frozen BODY descriptors.
- P3–P36 I graphs are present in a previously validated deterministic reconstruction, not as frozen raw edge lists. The prior reconstruction matched all saved anchors, but its PheromoneField source SHA differs from the frozen source receipt. The mismatch and both hashes are retained in `structural-inventory.json`; edge-list identity for those events is therefore a reconstruction-supported result, not a raw frozen-byte comparison.
- Exact commit-time chemical B raster arrays for selected later events were not available. U/W/S were omitted. No current-map or nearby-time substitution was made.

## Checks performed

- `node --check scripts/ant-body-diverse-scope-inventory.js`.
- `node scripts/ant-body-diverse-scope-inventory.js --self-test` — graph fixture checked 8-neighbor edge validity, components, degree groups, cycle rank, principal path, and off-path branches.
- `node scripts/ant-body-diverse-scope-inventory.js` and `--check` — all 36 ID/time/mask receipts, graph invariants, P1/P2 full descriptor equality, and exact selection rerun.
- `node --check scripts/ant-body-diverse-scope-render.js`.
- `node scripts/ant-body-diverse-scope-render.js --self-test` — `.012` radius boundary, convex lattice fill, and exact mask comparison.
- Renderer generation and `--check` — P/K/H regenerated for selected scopes; all P1/P2 P/K/H masks matched prior analysis exactly.
- Bundled Python 3.12.14 / Pillow 12.3.0 atlas generation and `--check` — image bytes reproduced exactly; all `184,320` displayed source-cell centers matched their underlying mask values before graph overlays.
- Atlas A and B were visually inspected for row alignment, common scale/orientation, candidate labels, and missing-data visibility.
- Final artifact and source SHA-256 receipts are in `hash-manifest.json`.

## Omitted checks

- No full repository build/test suite; no production module behavior changed.
- No P3–P36 U/W/S rendering because the exact required field maps are absent.
- No body compiler/solver qualification, browser renderer integration, audio/PCM, listening, artist verdict, synthetic graphs, additional seed, new simulation, or 600 s BODY shadow.
- No independent frozen-source rerun of P3–P36 graph edges; the earlier documented PheromoneField source mismatch remains a limitation.
