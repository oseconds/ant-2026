# Validation and provenance

## Baseline and source

- `origin/main` was freshly fetched and resolved to `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785` before the pass.
- Research started from parent `849f324dfc6ea4c7da89ac7153a7e2a7fa8c4bad` and branch `codex/ant-event-evolved-scope-20261029`; work is on the dedicated branch `codex/ant-proposal-update-diagnostic-20261029`.
- `TrailPlateBirth.js` matched Git blob `238cc365f2602dc6a22091d69237b88962825a13`; its LF-canonical SHA-256 is `cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67`.
- Frozen input: `docs/ant/evidence/2026-10-29-event-evolved-scope/data/frozen-event-input.json.gz`, SHA-256 `bd0fd2ccd036e824cb9fc1ceec6ab60a0cf711ab44d95487a08aced375d63253`, 50,494 bytes. It records seed `20261005`, Audio Off, the `0–120 s` event packet parent, and upstream structure/history receipts. The source history packet receipt is `909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc` at commit `0d5096a920e1ebb2086fa1dae782c5d4e871b590`; that original gzip was not locally available for a second raw-byte hash in this pass.
- No simulation replay or reconstruction was necessary. All measured fields came from the frozen packet; the measurement script reads no mutable simulation state.

## Deterministic measurement checks

- `node scripts/ant-proposal-update-diagnostic.js --check` regenerated the exact analysis JSON, transition CSV, cell receipts and atlas-data JSON from frozen inputs and current source; all matched the saved files.
- `node scripts/ant-proposal-update-diagnostic.js --self-test` passed source-function, row-bounded adjacency, survival partition, sampled-age and availability-category assertions.
- Every transition asserts `previous I = retained + still-valid-dropped + genuinely-invalidated` and `current I = retained + gained`. Start-proposal curves and strict-retention rows are recomputed from the same 21 anchors per event.
- The script extracts the unchanged production continuity functions and verifies scalar parity against the parent analysis. `Math.random` is guarded and throws if invoked; the diagnostic uses no RNG.
- `python scripts/ant-proposal-update-atlas.py --check` reproduced the saved PNG and receipt byte-for-byte using the bundled Python runtime. `--self-test` passed category partition and fixed-grid color checks.
- Atlas: 2,120×1,225 pixels; 10 event panels plus the P1/P2 START survival plot; 92,160 cell-center consistency checks. Visual inspection confirmed the legends, caption placement, shared 96×96 frame and distinct selection/validity colors.
- `git diff --check` and the final scoped working-tree inspection are run after the artifacts are prepared; the commit and remote receipt are reported in the final handoff.

## No production effect

This pass reads frozen data and production source only. It does not run or mutate ANT, consume random numbers, change event anchors or commit timing, add production state, or edit `src/`, `static/`, root README or `docs/ant/README.md`. Production P1/P2 COMMIT endpoints remain the frozen `84.01666666666823 s` and `106.01666666667463 s` observations; the counterfactual timer check is a read-only comparison against those fixed endpoints and does not rerun the remaining COMMIT gates.

## Integrity manifest

[`hash-manifest.json`](hash-manifest.json) records SHA-256 hashes of the exact frozen/binary inputs and outputs plus LF-canonical UTF-8 text files, avoiding platform line-ending differences. It excludes itself because a file cannot contain its own final SHA-256; verify its listed entries against the repository checkout.
