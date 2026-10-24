# Validation — 2026-10-24

## New investigation

- Node `v22.23.2`, Windows, primary repository worktree.
- `node scripts/ant-pheromone-representation-feasibility.js`: PASS. Three production point cases, four derived thresholds and predecessor witnesses, 10,201 fixed triangle certificates, write/read support witnesses, cap accounting, and perpendicular-pair ambiguity all satisfy the script assertions.
- Repeated execution: both result and receipt files were byte-identical. Result SHA-256: `08ed0345ad8a67d17758024b7b921ae9c3488c1a21bfd0dc258216d395bf9ae2`.
- `node --check scripts/ant-pheromone-representation-feasibility.js`: PASS.
- `git diff --check`: PASS.
- `git diff origin/main -- src static docs/ant/README.md`: empty. No production/canonical status change.

The new probe's scope was written before execution in [PROBE-SCOPE.md](./PROBE-SCOPE.md). Its input and production source receipts are in [probe-receipt.json](./probe-receipt.json). Source hashes describe the actual working-tree bytes used; the repository commit supplies the cross-platform Git provenance. The script does not promise identical source-receipt hashes if a later checkout changes production source line endings.

## Ordinary regression/build checks

- `npm test`: **355 passed, 0 failed**, process exit 0. This is the existing repository suite; it includes existing frozen baseline/preflight, moment and profile-helper unit/regression tests. It is not a new candidate cue qualification, diagnostic stage, or natural run, and does not change the previous scientific decisions.
- `npm run build`: PASS, process exit 0. Existing Rollup warnings remain: a misplaced dependency `@__PURE__` annotation is removed, and a bundle exceeds the default 500 kB warning threshold.
- The first sandboxed test attempt failed before tests could execute because Node's child-process runner was blocked with `spawn EPERM` (59 test-file process failures). The same command was rerun outside that process restriction and completed successfully. No application code was changed to bypass it.

Full raw command logs are losslessly retained as [tests.log.gz](./tests.log.gz), [build.log.gz](./build.log.gz), and [tests-sandbox.log.gz](./tests-sandbox.log.gz). Compressed and decompressed byte hashes and lengths are in [validation-logs.json](./validation-logs.json). They contain wall timings, which are not scientific deterministic outputs. Uncompressed local `.log` copies are ignored and preserved.

## Independent review

A fresh Luna reviewer with Max reasoning independently checks the geometric proof, probe/source agreement, representation/consumer coupling and claim boundaries. Its final review is saved separately as [INDEPENDENT-REVIEW.md](./INDEPENDENT-REVIEW.md). Review does not establish natural cue quality, movement benefit or exhibition readiness.

## Deliberately untested

No replacement representation prototype, candidate fixed-cue Gate 2, movement Gate 3, sensor/Hill/scoring tuning, recruitment/field-feedback run, natural 600-second run, long run, ANT Chrome/runtime test, material/audio change or artistic review occurred. Resolution counts are mathematical geometry, storage and loop-length counts, not measured runtime performance. Existing Gate 2 is MIXED / NOT QUALIFIED and Gate 3 is NOT RUN.
