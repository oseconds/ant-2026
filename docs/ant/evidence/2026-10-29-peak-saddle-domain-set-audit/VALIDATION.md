# Validation

## Baseline and provenance

- Connected GitHub comparison reported remote `main` identical to pinned SHA `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785` (`ahead_by=0`, `behind_by=0`); fetching current-main `TrailPlateBirth.js` returned the expected blob SHA `238cc365f2602dc6a22091d69237b88962825a13`.
- Local `git fetch` could not write `.git/FETCH_HEAD`, and unauthenticated `git ls-remote` had no Git credential. Remote baseline verification used the connected GitHub integration.
- Confirmed research parent `03e8a68f66392c320bbb67f53be05be7b7f27deb` and clean starting worktree.
- Read production `TrailPlateBirth.js` from current main; blob `238cc365f2602dc6a22091d69237b88962825a13`, LF SHA-256 `cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67`.
- Reused exact frozen B/E input SHA `6ff3ec3d6fb8bc0fa1f323532361ab9d19ecc0e75353b1b9ce3d6875c440842d`, parent census SHA `d372ee86a4b043a3cbd6ea39379b481697fde3eed0c45a21a55610c0d9da5bb7`, and structure packet SHA `541cbf927b0ebdea06a7ae00585c4144a62a1d4ce2f841c40a1bd91af440b075`.
- No simulation or replay. No RNG, new seed, later-state reconstruction or field update.

## Calculation checks

- `node scripts/ant-peak-saddle-domain-audit.js --check` — parent full census rerun and atlas exact.
- `node scripts/ant-peak-saddle-domain-set-audit.js --self-test` — set intersection, nested/equal/crossing/disjoint relations, quantiles and correspondence-component fixtures.
- `node scripts/ant-peak-saddle-domain-set-audit.js --check` — new complete data and atlas rerun exact.
- All ten B/E/structural timestamps matched exactly. Saved E/H/I cell sets matched their frozen structural frames; every principal path stayed inside its I set.
- Complete census: finite and essential counts match the parent per state; all finite lobes are included, with no size, contrast, appearance or rank filter. Every lobe cell is checked inside E; every domain has unique cells; hierarchy chains are cycle-checked.
- All same-state nonzero overlap pairs are retained. Containment, overlap and unique-cell coverage are computed from sets; summed memberships remain separate.
- Family extraction uses only the two existing parent reciprocal-best flags. One-to-one source/target matching is asserted for each transition; singleton families with any nonzero spatial counterpart are recorded separately.
- Atlas uses the exact frozen B/E/F/I/path frames and all finite-domain cell sets. SVG XML parsing passed.
- Artifact SHA-256 manifest covers every new measurement, report, atlas, tool, daily record and the updated daily index. Manifest scope and self-exclusion are explicit.

## Boundary checks

- `git diff --check` passed.
- No files changed in `src/`, `static/` or canonical `docs/ant/README.md`.
- Boundary deviation: one initial call to the parent runner's combined `--check` recomputed its stored 4/8 census and comparison. This was an unintended validation invocation; no 4-neighbor measurements were used in this pass's analysis or conclusion. After recognizing that the parent runner crosses the 8-only boundary, no further 4-neighbor recomputation was performed. The new analysis runner reads and analyzes only 8-neighbor data.
- No new global-winner ranking, proposer, capture rule, UPDATE, BODY, material law, production state, seed, simulation, 600 s test or audio work was added.
- Full repository build/test was not run; focused assertions and deterministic evidence reruns were sufficient for this read-only audit.
