# W1 Archived Replay Runner Provenance Recovery

- **Investigation date:** 2026-10-10 (Asia/Seoul)
- **Branch / starting HEAD:** `ant-w1-episodic-material-shadow` / `87a8872aed3e9707600a0724bf693f1fd9e8775b`
- **Latest fetched `origin/main`:** `a78249fc02fb7990568d62709e9a087489fe632b`
- **Archived tooling commit:** `b9e08961a5e47e4ce7531bce87902fc81b9a8dd8`
- **Decision:** **Partially Resolved.** Capture order is verified for the committed runner source, but its bytes cannot be tied to the archived invocation because the exact recorded runner hash was not recovered.

## Question and stop point

The 2026-10-08 replay manifest records `scripts/ant-morphology-replay.js` as SHA-256 `27bd6ebb8eea0c0a779147e847c2b40637ccd87d781067c60aa9f984376c0e08`. The investigation searched the relevant Git history and object store, worktree/stash/reflog state, scoped replay/evidence files, VS Code Local History index, and the preserved Codex run record. No exact byte match was found.

The committed `b9e0896` source's capture sequence is internally consistent: the saved `chemical` array is the same `PheromoneField.values` grid sampled during `TrailPlateBirth.advance`, and `chemicalMemory` is captured after that update. However, the runner's recorded hash does not match this source or any recovered candidate. Therefore this source-level finding cannot be attributed to the frozen archive with sufficient provenance. The preceding chemical-input sufficiency audit remains **Inconclusive / blocked**; the 16,561,152-value recurrence was not run.

## Runner candidates

Hashes below are SHA-256 of actual file or Git blob bytes, not Git's SHA-1 object IDs.

| Candidate | Source | Bytes | SHA-256 | Match? |
|---|---|---:|---|---|
| Recorded runner | `full-replay-manifest.json` | — | `27bd6ebb8eea0c0a779147e847c2b40637ccd87d781067c60aa9f984376c0e08` | Target |
| Available working-tree file (CRLF) | Current `scripts/ant-morphology-replay.js` | 36,252 | `1c54bcacd0873e6a905568a857fae719d9544e9c7ab226231d2c66477a62ffe9` | No |
| `b9e0896` committed LF blob | Archived tooling commit | 35,766 | `09640796726cde24e9ca0e72bbcc1b3647e8cf21580c8a7b8bccf470439bea44` | No |
| `be1b314` committed runner | Earlier reachable path version | 28,159 | `2857b336c8334d69e94d77bac841127481fa68135e85eaeff1d4a5844ece134f` | No |
| `b52bb1f` committed runner | Later reachable path version | 40,164 | `c6141ae6b2c48d93fa5a31690a4ef375a4b3b8bf2d8bdfea8d15c9e9cc8f285b` | No |
| `ab0fba1` unreachable runner | Unreachable sibling commit | 40,164 | `c6141ae6b2c48d93fa5a31690a4ef375a4b3b8bf2d8bdfea8d15c9e9cc8f285b` | No |

Normalizing the current CRLF file to LF yields the `b9e0896` hash, not the target. UTF-8 LF/CRLF, UTF-8 BOM variants, and UTF-16LE variants checked in the recovery pass also did not reproduce the target. Line ending or those common encoding differences do not explain the discrepancy.

## Search scope and source of the gap

- Reachable path history contains the runner versions at `be1b314`, `b9e0896`, and `b52bb1f`. The unreachable `ab0fba1` commit contains the same runner bytes as `b52bb1f`.
- `git stash list` is empty. The reflog contains no alternate runner revision. `git worktree list` reports only the current checkout.
- `git fsck --full --no-reflogs --unreachable --no-progress` reported 603 unreachable objects, including 451 blobs. SHA-256 was checked for all 451 blob payloads (141,042,814 bytes total); none matched the recorded runner hash.
- The scoped `%APPDATA%\Code\User\History` `entries.json` search found no `ant-morphology-replay.js` history entry. Scoped replay-output and evidence searches found no runner backup or copied source.
- The preserved Codex run record (thread `01a11a67-386b-7313-86f8-f9c19400df30`) shows a dirty runner at 2026-10-08 07:42:57 UTC (`+96/-21` relative to its parent), the `b9e0896` tooling commit at 07:43:48 UTC, replay completion at 07:45:58 UTC, and a clean post-run status. This establishes a changed working file before the commit and a committed runner before the recorded completion; it does not recover the exact runtime bytes or prove the file stayed unchanged during the run.
- The manifest's `commit` field records Git `HEAD` (`b9e0896`); that does not fingerprint uncommitted working-tree bytes. Its `runnerHash` is separately computed from the runner path on disk.

The following explanations remain possible, not proven:

1. A non-committed or transient runner version was used, or the runner file changed and was later restored.
2. The file changed between module loading and the on-disk hash read.
3. The runner source and recorded Git `HEAD` described different working-tree states.

The inspected source computes `runnerHash` inside `main()` after the runner's static ESM imports and module body have loaded (`scripts/ant-morphology-replay.js`, `runnerHash` assignment). The hash therefore identifies bytes read from disk at that point; it does not independently prove those bytes were the code already loaded by Node. No evidence in the saved run record establishes that such a race occurred. The exact reason for the hash mismatch remains unresolved.

## Capture-semantics inspection

This is a source-level result for the `b9e0896` committed runner and the production files whose hashes the manifest records; it is not proof that those exact runner bytes executed in the archived run.

1. `AntController.tick(DT)` first decays the pheromone field, then processes movement, gaster deposits, and actual `FOOT_CONTACT` events.
2. Near tick end, `AntController` advances its simulation clock and calls `TrailPlateBirth.advance({ pheromone: this.field, ... })`.
3. `TrailPlateBirth.advance` calls `updateChemicalMemory(pheromone, elapsedSeconds)` before `buildSupportedMask(surface)`. The updater samples the supplied `PheromoneField`; it does not substitute or mutate the field array.
4. The replay runner wraps `buildSupportedMask` to retain the returned build result. Once `controller.tick(DT)` returns, it captures that tick's snapshot when the wrapper ran. The controller's remaining tick work does not write to the pheromone field.
5. `captureSnapshot` copies the raw bytes of `controller.field.values` and the already-updated `trailPlateBirth.chemicalMemory` typed array. The diagnostic selector is a separate transformed module and does not replace the live production updater.

Thus the committed runner observes the input field and post-update memory after the same production update. The raw `chemical` grid is sufficient to run the production sampler if its exact production interpolation and Float32 update order are reused. The archived-runner hash gap still prevents this code-level order from proving archive capture provenance.

## Decision and next gate

**Partially Resolved:** a common EOL/encoding explanation is excluded, the targeted Git and local history sources contain no exact runner, and the committed source's capture order is verified. The specific origin of SHA-256 `27bd…c0e08` is still unknown, and the saved archive cannot be bound to `b9e0896` by the current evidence.

Do not resume recurrence from this finding alone. The earlier audit's stop condition remains in force until exact runner provenance or an equally strong archive-to-source binding is available. No input was rewritten; no natural replay or recurrence comparison was run; no production source, manifest, W1 mechanism, or ontology decision changed. W1 remains **Undecided / Research Gap**.

## Reproduction and validation

The read-only checks were performed against the existing checkout and saved run record:

```powershell
git status --short --branch
git log --all --format="%H %cI %s" -- scripts/ant-morphology-replay.js
git stash list
git reflog --all --format="%H %gD %gs"
git worktree list --porcelain
git fsck --full --no-reflogs --unreachable --no-progress
rg -l -F ant-morphology-replay.js "$env:APPDATA\Code\User\History" -g entries.json
```

Raw-byte hashes were calculated for each reachable candidate blob, the unreachable runner blob, the current working-tree file, and the tested line-ending/encoding variants. The source-order inspection covered `scripts/ant-morphology-replay.js`, `src/lib/agents/ant/AntController.js`, `src/lib/agents/ant/TrailPlateBirth.js`, and `src/lib/agents/ant/PheromoneField.js`.

This evidence change is documentation-only. `git diff --check` is the applicable validation; no test, build, simulation, or recurrence run is part of this pass.
