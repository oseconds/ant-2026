# Validation notes

## Baseline and scope

- `origin/main`: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`
- Research parent: `d27034306019f2a348e49a6723332fc10b10cc9c`
- Branch: `codex/ant-closure-slice-crystallization-support-20261028`
- Production `src/`, `static/`, `docs/ant/README.md` and `docs/ant/world-model.md` match `origin/main`.
- Only the new research runner, this evidence package, and its daily record/index are in scope.

## Checks

- `node --check scripts/ant-closure-slice-crystallization.js`
- `node scripts/ant-closure-slice-crystallization.js --resume-capture` — resumed from the saved read-only replay capture; no world rerun.
- `node scripts/ant-closure-slice-crystallization.js --record-decision` — finalized the interpretation and mask-set receipt from the saved capture; no world rerun.
- `node scripts/ant-closure-slice-crystallization.js --check` — recomputes Stage 1 from immutable inputs, verifies all 36 saved masks, all 600 positions, contact buckets, output hashes and decision receipt; no world rerun.
- Stage 1 asserts exact P1/P2 association reconstruction, source hashes, input immutability, compiler acceptance, pickup-component identity, append behavior and descriptor immutability.
- Exact per-commit compiler arguments are saved in each Stage 1 event's `compiler.inputs` object.
- Stage 2 asserts observer nonmutation and selector parity, RNG final state/call parity, 600 position snapshots, exact contacts and commit receipts, and five exact pheromone/SurfaceField checkpoints.

## Replay capture history

Three 600 s replay attempts were needed. The first completed but exceeded a temporary 10 minute bound, and the second completed but exposed a runner assertion that expected 600 analysis rows; the observed cadence was 599 while all 600 positions and all 36 commit analyses were present. The final replay persisted its capture, then a post-capture raw-receipt schema mismatch was corrected from saved data. All parity checks passed without another replay. Two attempts did not persist captures; the third did.

## Not run

Full repository tests/build and browser/audio rendering were not run: this pass changes no production code and evaluates the existing compiler directly. No multi-seed or perceptual review was performed.
