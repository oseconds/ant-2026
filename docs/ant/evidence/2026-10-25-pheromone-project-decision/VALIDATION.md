# Validation scope — 2026-10-25

## Performed in this pass

- Fresh `git fetch origin`; verified main `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`, validated research base `b806f87b623426d25a6a09e328da3a3beb5c9e64`, main merge-base, current source/diff and existing worktrees.
- Read actual evidence reports/numerical results/receipts in the required representation and natural-control chain. Earlier writer/reader, QAKR and information-loss packages were read using `git show` at the pinned commits; their blob IDs are in `PROVENANCE.json`. No branch merge or archive access.
- `node scripts/ant-pheromone-project-audit.js`: PASS. Extracts five fixed-cue arms, six C/G cumulative rows and nine corrected G/H/I recent rows. Asserts expected existing decisions/counts, exact corrected cross-package agreement, and 19 input/source receipts. This is an existing-output audit, not a new cue or world experiment. Output repeated byte-identically.
- `node --test --experimental-test-isolation=none tests/ant-g-runtime-field.test.js`: **2/2 PASS**, both by implementer and parent. Point/segment/cap/boundary/decay storage and return parity against the prior G implementation; 120 ticks of complete controller state/RNG parity under the browser-compatible shim.
- Default Node test isolation was blocked by `spawn EPERM`. The failure and successful single-process test output are retained under `runtime/*.log.gz`; no application code was modified to bypass the environment limitation.
- `node --check` on new audit, runtime and field scripts: PASS.
- Headed installed Chrome156 C/G runtime screen: each arm >=60 s actual wall time after600 model-second warm-up, real controller update and real p5 renderer; raw per-frame records, function timings, JS heap, page errors, source hashes and browser version retained. See `runtime/RUNTIME-RESULTS.md` for exact clock/cost/claim limits.
- Production `src/`, `static/` and canonical `docs/ant/README.md` diff from main: empty. New code is research tooling/field subclass only.
- `git diff --check`, local evidence-link checks, source/artifact receipt verification and compressed-log checks: PASS before final commit.

The decision/runtime protocols were frozen in commit `4f9db91`. Hash receipts are collected in `MANIFEST.json`; the manifest excludes itself and ignored local logs. The final independent read-only architectural review is recorded in [INDEPENDENT-REVIEW.md](INDEPENDENT-REVIEW.md).

## Deliberately not performed

No new full fixed-cue gate, natural C/F/G three-seed replay, secretion/adherence ablation, reader/sensor tuning, material/audio change, or visual-quality judgment. Original invalid recent-window values remain preserved and are excluded from comparisons. Corrected C recent metrics are unavailable in this chain.

No full test suite or production build was run in this pass: shared production/runtime source was not changed, and the user explicitly permits focused parity/hash validation for pure research tooling. Chrome loaded the unchanged application modules through the existing Vite server; that is not a production bundle benchmark. Prior full-suite/build records remain inherited evidence only.

The browser screen is not a600-second wall-time run, hours-long soak, memory-leak proof, other-hardware guarantee, or mature live-audio test. Its independently evolving C/G histories are not a frozen same-state cost comparison. Zero actual frame-clamp loss was checked from the accepted intervals; the raw legacy `discardedByClampMs` label must not be read as clamp loss.
