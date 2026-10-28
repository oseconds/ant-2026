# Validation — Plate local-history ownership

## Reproduction

From the repository root, with Node 22:

```powershell
node --test tests/ant-plate-local-history-ownership.test.js tests/ant-event-mechanical-shadow.test.js tests/ant-material-event-state.test.js tests/trail-plate-birth.test.js tests/material-stratigraphy.test.js
node scripts/ant-plate-local-history-ownership.js --check
node scripts/ant-material-event-reconstruct.js --check
node scripts/ant-material-event-reuse.js --check
node scripts/ant-event-support-atlas.js --check
node scripts/ant-plate-event-scope.js --check
git diff --check
```

All commands completed successfully. The focused test run passed **23/23** tests. The new ownership runner reproduced every committed output byte-for-byte. Each existing frozen runner passed its `--check`. No repository-wide test/build was run because production source, app integration and dependencies were not changed.

## Invariants checked

- Frozen gzip packet and decoded payload hashes matched `capture.json`; the capture's source hashes, exact candidate/full birth descriptors and prior fixture receipts matched.
- The historical formation runner hash matched after CRLF→LF normalization; both raw working-file and normalized hashes are recorded in `data/ownership.json` provenance.
- Every actual chemical interval contained 20 hash-indexed `A_projection96` maps. The source-map replay reported its exact mismatch counts and ULP maximum; it was not rounded into a pass claim.
- SurfaceField reconstruction matched 21/21 expected snapshots for each natural window.
- All 12,954 feet preserved nested archive order and partitioned once per natural case. The 543 timestamp inversions were retained.
- Matched-repeat contribution windows contained 200 unique contacts across their first three commits.
- A `Math.random` tripwire passed; the runner created no controller or world and made no natural replay.
- The local ledger and SurfaceField replay helpers are included in the machine-readable source receipts. The SurfaceField acceptance flag follows production's non-empty `legId` rule; all frozen contacts remain accepted.
- All earlier complete output sets were preserved byte-for-byte under `data/attempts/` before final generation. The final schema includes per-sample projection digests and exact helper hashes; measured arrays and counts are unchanged.

The machine-readable output and integrity checks are in [`data/validation.json`](data/validation.json). [`validation/package-sha256.json`](validation/package-sha256.json) hashes the final package files, excluding itself.
