# W1 archived replay runner provenance recovery — 2026-10-10

**Branch / starting HEAD:** `ant-w1-episodic-material-shadow` / `87a8872aed3e9707600a0724bf693f1fd9e8775b`

**Fetched `origin/main`:** `a78249fc02fb7990568d62709e9a087489fe632b`

**Archived tooling commit:** `b9e08961a5e47e4ce7531bce87902fc81b9a8dd8`

**Decision:** **Partially Resolved; chemical-input recurrence remains blocked.**

## Question

Could the exact `scripts/ant-morphology-replay.js` bytes recorded by the 2026-10-08 frozen replay be recovered, or could the provenance mismatch be explained well enough to resume the previous chemical-input sufficiency audit?

## Investigation

- Confirmed the research branch started clean at the requested HEAD. Local `origin/main` was `a78249f`; `src/` matched it.
- Read the blocked chemical-input audit, full replay manifest, runner history, and the production controller, field, and material updater source.
- Checked reachable runner history (`be1b314`, `b9e0896`, `b52bb1f`), stash, reflog, worktrees, and all 451 unreachable Git blob payloads. The unreachable `ab0fba1` runner is byte-identical to `b52bb1f`; no blob matched the recorded target.
- Checked the current CRLF runner, its committed LF form, common BOM/encoding variants, the scoped VS Code Local History index, replay/evidence backup paths, and the preserved Codex run record. No exact runner copy was found.
- The runner hash candidates are recorded with exact byte sizes and SHA-256 values in the [evidence package](../evidence/2026-10-10-w1-archived-replay-runner-provenance-recovery/README.md).

## Findings

The manifest records SHA-256 `27bd6ebb8eea0c0a779147e847c2b40637ccd87d781067c60aa9f984376c0e08`. The working-tree CRLF runner hashes to `1c54bcacd0873e6a905568a857fae719d9544e9c7ab226231d2c66477a62ffe9`; the `b9e0896` LF blob hashes to `09640796726cde24e9ca0e72bbcc1b3647e8cf21580c8a7b8bccf470439bea44`. EOL/encoding variants do not bridge the difference.

The saved Codex chronology shows a modified runner before `b9e0896` was committed, then replay completion about two minutes later and a clean post-run status. This chronology narrows the interval but does not identify the archived file bytes. The runner reads its on-disk hash inside `main()` after ESM loading, so a file change between load and hash is possible; no evidence proves that it happened. The exact mismatch cause remains unresolved.

Source order in the committed `b9e0896` code is consistent with same-update capture: after field decay/deposits, `AntController.tick` calls `TrailPlateBirth.advance`; that update samples the pheromone field into chemical memory before building the supported mask; the runner captures the field bytes and updated memory after the tick returns. No pheromone write occurs between that update and snapshot capture. Because the runner hash does not match, this proves the sequence for the committed source only, not for the archived execution.

## Decision and boundary

**Partially Resolved.** The code-level capture relationship is understood, but the recorded runner bytes and their archive binding were not recovered. Keep the earlier sufficiency result **Inconclusive / blocked**. Do not run the 16,561,152-value recurrence, regenerate archives, or infer a new material process from this audit.

The W1 design decision remains **Undecided / Research Gap**. Existing evidence, frozen snapshots, and manifests were not changed. This pass made no production, material, recurrence, or ontology changes.

## Validation

Documentation-only changes; `git diff --check` is the applicable check. Tests, build, natural replay, and recurrence were not run.
