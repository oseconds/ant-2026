# Repository branch and worktree hygiene map — 2026-10-13

## Scope and snapshot

Read-only inventory on the synthesis checkout at `75e53df2ec0d025b4337e360e48829f5c58809ab`. Local `main`, `origin/main`, and current `codex/ant-persistent-world-reassessment-20261013` all resolve to that SHA at audit start. The primary worktree was clean then; subsequent modified/untracked files are the authorized synthesis documentation. Root guidance and `docs/ant/README.md` were read. No Git or filesystem cleanup action was performed.

Counts: 23 local branch refs; 27 `origin/*` refs including symbolic `origin/HEAD` (26 actual remote-tracking branch refs); 5 registered worktrees. Parent refreshed origin refs this pass and verified all 26 actual origin heads with live `ls-remote`; every actual head matched the refreshed tracking ref set. The current synthesis branch is local-only at this snapshot; its later push would add one remote head. Remote deletion still needs a fresh direct recheck at execution time.

Branch classification meaning: **KEEP ACTIVE** = current checkout/main; **KEEP REFERENCE** = useful provenance/frozen baseline; **SAFE DELETE CANDIDATE** = tip already reachable from main, no unique commit, no attached worktree and canonical material preserved; **REVIEW BEFORE DELETE** = attached worktree or unique behavior/code requiring preservation review; **DO NOT TOUCH** = branch attached to a dirty/untracked worktree. Worktrees use the separate requested classes: **ACTIVE**, **REUSABLE**, **REMOVAL CANDIDATE**, **STALE / PRUNE CANDIDATE**, and **BLOCKED**. Thus a dirty worktree is BLOCKED and its branch is DO NOT TOUCH.

## Local branches

“Ahead / behind” counts are relative to local `main`, not upstream. All branch tips listed as ancestor are fully contained by main.

| Local branch | Tip | Relation to main (ahead / behind) | Class | Reason |
|---|---:|---:|---|---|
| `ant-base-substrate-debug` | `5a407ed4f578` | 0 / 76, ancestor | SAFE DELETE CANDIDATE | Evidence is in canonical main tree; origin ref also exists. |
| `ant-interior-endpoint-production-candidate` | `bb970505eb63` | 2 / 43, diverged | KEEP REFERENCE | Unique candidate implementation and `2026-10-08-interior-endpoint-production` evidence tree absent from main. |
| `ant-interior-endpoint-shadow-selector` | `1795493a4ff4` | 0 / 44, ancestor | SAFE DELETE CANDIDATE | No unique commits; canonical shadow evidence is in main. |
| `ant-local-accretion-shadow` | `13ffc9f42bc3` | 3 / 42, diverged | KEEP REFERENCE | Unique implementation and `2026-10-08-local-accretion-shadow` evidence absent from main. |
| `ant-movement-material-morphology-audit` | `892fdc3f3365` | 0 / 47, ancestor | SAFE DELETE CANDIDATE | No unique commits; source evidence is in main. |
| `ant-retained-material-experience-shadow` | `fbe395993415` | 0 / 15, ancestor | DO NOT TOUCH | Attached worktree contains three untracked paths, including an evidence directory; contents were not opened. |
| `ant-retained-material-experience-shadow-current-main` | `f09d67f1eab6` | 0 / 10, ancestor | REVIEW BEFORE DELETE | Clean but still checked out in a non-primary worktree. |
| `ant-retained-material-locomotion-ab` | `fc027dfc3d68` | 0 / 9, ancestor | REVIEW BEFORE DELETE | Clean but still checked out in a non-primary worktree. |
| `ant-retained-material-locomotion-adoption` | `37131e0c408a` | 0 / 8, ancestor | REVIEW BEFORE DELETE | Clean but still checked out in a non-primary worktree. |
| `ant-s2a-synchrony-null` | `62568794c9a9` | 0 / 66, ancestor | KEEP REFERENCE | Frozen social comparison baseline. |
| `ant-s2b-identity-null` | `5bfd29a49049` | 0 / 61, ancestor | KEEP REFERENCE | Frozen social comparison baseline. |
| `ant-s2c-incremental-value` | `fbcf187e8068` | 0 / 58, ancestor | KEEP REFERENCE | Frozen social comparison baseline and spectral-skip decision. |
| `ant-small-dead-code-cleanup-20261008` | `f6b8b0849758` | 0 / 52, ancestor | SAFE DELETE CANDIDATE | No unique commits; verification record is in main. |
| `ant-w1-episodic-material-shadow` | `a181898fb2cd` | 33 / 39, diverged | REVIEW BEFORE DELETE | 33 unique research/evidence/design commits. Preserve; an older pause note does not establish current activity status. |
| `codex/ant-persistent-world-reassessment-20261013` | `75e53df2ec0d` | 0 / 0, ancestor | KEEP ACTIVE | Current synthesis checkout; parent may add docs here. |
| `main` | `75e53df2ec0d` | 0 / 0, ancestor | KEEP ACTIVE | Production/main branch. |
| `research/ant-material-causal-tail-20261012` | `e5e4c52db225` | 0 / 6, ancestor | SAFE DELETE CANDIDATE | Its result and chronology are present on main. |
| `research/ant-nodule-lineage-censoring-20261013` | `b14de91b91db` | 0 / 1, ancestor | SAFE DELETE CANDIDATE | Fully incorporated by main. |
| `research/ant-plate-gap-birth-lineage-20261013` | `e21d68597808` | 0 / 3, ancestor | SAFE DELETE CANDIDATE | Fully incorporated by main. |
| `research/ant-pre-cohort-retained-history-20261012` | `214c59cbc316` | 0 / 5, ancestor | SAFE DELETE CANDIDATE | Fully incorporated by main. |
| `research/ant-zero-ant-continuity-20261012` | `d729072b16dd` | 0 / 4, ancestor | SAFE DELETE CANDIDATE | Fully incorporated by main. |
| `research/ant-zero-ant-nodule-continuity-20261013` | `d6420667c23f` | 0 / 2, ancestor | SAFE DELETE CANDIDATE | Fully incorporated by main. |
| `research/ant-zero-ant-nodule-instrumentation-20261013` | `75e53df2ec0d` | 0 / 0, ancestor | SAFE DELETE CANDIDATE | Completed and integrated; no worktree or unique commit remains. |

## Origin tracking refs

These are separate remote-tracking refs; no remote ref was deleted. Ahead / behind is again relative to local `main`. The `origin/HEAD` symbolic ref is listed for completeness, not a deletable branch.

| Origin ref | Tip | Ahead / behind | Class | Reason |
|---|---:|---:|---|---|
| `origin/HEAD` | `75e53df2ec0d` | 0 / 0 | KEEP ACTIVE | Symbolic default-branch pointer. |
| `origin/agent/jules-eval` | `a78249fc02fb` | 0 / 17 | SAFE DELETE CANDIDATE | Duplicate tip of `origin/agent/jules-eval-31pro`; no unique commit. |
| `origin/agent/jules-eval-31pro` | `a78249fc02fb` | 0 / 17 | SAFE DELETE CANDIDATE | Same fully merged tip as the prior ref. |
| `origin/agent/jules-eval-31pro-13765390673869617607` | `c9b0794f695a` | 1 / 17 | REVIEW BEFORE DELETE | One unique social-invariance test commit. |
| `origin/agent/jules-eval-7931340460051171177` | `db16796dff22` | 1 / 17 | REVIEW BEFORE DELETE | Separate one-commit social-invariance test variant. |
| `origin/ant-base-substrate-debug` | `5a407ed4f578` | 0 / 76 | SAFE DELETE CANDIDATE | Fully merged; canonical evidence preserved. |
| `origin/ant-interior-endpoint-production-candidate` | `bb970505eb63` | 2 / 43 | KEEP REFERENCE | Unique implementation and evidence are not in main. |
| `origin/ant-interior-endpoint-shadow-selector` | `1795493a4ff4` | 0 / 44 | SAFE DELETE CANDIDATE | Fully merged; canonical evidence preserved. |
| `origin/ant-local-accretion-shadow` | `13ffc9f42bc3` | 3 / 42 | KEEP REFERENCE | Unique implementation and evidence are not in main. |
| `origin/ant-movement-material-morphology-audit` | `892fdc3f3365` | 0 / 47 | SAFE DELETE CANDIDATE | Fully merged; canonical evidence preserved. |
| `origin/ant-retained-material-experience-shadow-current-main` | `f09d67f1eab6` | 0 / 10 | REVIEW BEFORE DELETE | Checked out in a clean non-primary worktree. |
| `origin/ant-retained-material-locomotion-ab` | `fc027dfc3d68` | 0 / 9 | REVIEW BEFORE DELETE | Checked out in a clean non-primary worktree. |
| `origin/ant-retained-material-locomotion-adoption` | `37131e0c408a` | 0 / 8 | REVIEW BEFORE DELETE | Checked out in a clean non-primary worktree. |
| `origin/ant-s2a-synchrony-null` | `62568794c9a9` | 0 / 66 | KEEP REFERENCE | Frozen social comparison baseline. |
| `origin/ant-s2b-identity-null` | `5bfd29a49049` | 0 / 61 | KEEP REFERENCE | Frozen social comparison baseline. |
| `origin/ant-s2b-identity-null-design` | `0f49ba03c0e7` | 0 / 63 | KEEP REFERENCE | Historical design input to frozen social baseline. |
| `origin/ant-s2c-incremental-value` | `fbcf187e8068` | 0 / 58 | KEEP REFERENCE | Frozen social comparison baseline. |
| `origin/ant-small-dead-code-cleanup-20261008` | `f6b8b0849758` | 0 / 52 | SAFE DELETE CANDIDATE | Fully merged; verification record preserved. |
| `origin/ant-w1-episodic-material-shadow` | `a181898fb2cd` | 33 / 39 | REVIEW BEFORE DELETE | 33 unique commits; preserve until branch-only material is independently assessed. |
| `origin/main` | `75e53df2ec0d` | 0 / 0 | KEEP ACTIVE | Main remote branch. |
| `origin/research/ant-material-causal-tail-20261012` | `e5e4c52db225` | 0 / 6 | SAFE DELETE CANDIDATE | Fully merged into main. |
| `origin/research/ant-nodule-lineage-censoring-20261013` | `b14de91b91db` | 0 / 1 | SAFE DELETE CANDIDATE | Fully merged into main. |
| `origin/research/ant-plate-gap-birth-lineage-20261013` | `e21d68597808` | 0 / 3 | SAFE DELETE CANDIDATE | Fully merged into main. |
| `origin/research/ant-pre-cohort-retained-history-20261012` | `214c59cbc316` | 0 / 5 | SAFE DELETE CANDIDATE | Fully merged into main. |
| `origin/research/ant-zero-ant-continuity-20261012` | `d729072b16dd` | 0 / 4 | SAFE DELETE CANDIDATE | Fully merged into main. |
| `origin/research/ant-zero-ant-nodule-continuity-20261013` | `d6420667c23f` | 0 / 2 | SAFE DELETE CANDIDATE | Fully merged into main. |
| `origin/research/ant-zero-ant-nodule-instrumentation-20261013` | `75e53df2ec0d` | 0 / 0 | SAFE DELETE CANDIDATE | Completed and integrated; no worktree or unique commit remains. |

## Unique content and canonical preservation

Three local branches diverge from main. Their unique commit counts are 2 (`ant-interior-endpoint-production-candidate`), 3 (`ant-local-accretion-shadow`), and 33 (`ant-w1-episodic-material-shadow`). The first two each contain complete evidence roots not present in main's `docs/ant/evidence/` directory inventory: `2026-10-08-interior-endpoint-production` and `2026-10-08-local-accretion-shadow`. The W1 branch contains substantial branch-only research, scripts/tests, design documents, and evidence. Keep all three refs intact. These conclusions use commit metadata/path names only; no archived or paused evidence payload was opened.

Two remote-only agent refs each contain one separate commit touching `tests/ant-social-invariance.test.js`: `c9b0794f695a0478a422d3c42628df97e4d7ebe6` (36 added lines) and `db16796dff22bfa1bc94a86a77b0ab66b469ae2f` (77 added lines). Neither commit is an ancestor of main. Preserve for review before deleting either remote ref.

## Worktrees

| Worktree path | Exists | Branch / HEAD | Status | Class | Reason |
|---|---|---|---|---|---|
| `C:/Users/5dudt/Documents/Github/ant-2026` | yes | `codex/ant-persistent-world-reassessment-20261013` / `75e53df2ec0d` at audit start | Documentation-only diff in progress | ACTIVE | Current synthesis worktree; commit/push verification will establish final cleanliness. |
| `C:/Users/5dudt/.codex/worktrees/ant-material-experience-current-main/ant-2026` | yes | `ant-retained-material-experience-shadow-current-main` / `f09d67f1eab6` | Clean | REMOVAL CANDIDATE | Complete and merged; branch is behind main and clean. |
| `C:/Users/5dudt/.codex/worktrees/ant-material-experience-shadow/ant-2026` | yes | `ant-retained-material-experience-shadow` / `fbe395993415` | 3 untracked paths | BLOCKED | Preserve worktree and files; no file content inspected. |
| `C:/Users/5dudt/.codex/worktrees/retained-material-locomotion-ab/ant-2026` | yes | `ant-retained-material-locomotion-ab` / `fc027dfc3d68` | Clean | REMOVAL CANDIDATE | Complete and merged; branch is behind main and clean. |
| `C:/Users/5dudt/.codex/worktrees/retained-material-locomotion-adoption/ant-2026` | yes | `ant-retained-material-locomotion-adoption` / `37131e0c408a` | Clean | REMOVAL CANDIDATE | Complete and merged; branch is behind main and clean. |

No detached or missing worktree was reported. Ignored files were not inventoried, so recheck before any removal. No worktree was removed or pruned.

The blocked shadow worktree has three top-level untracked entries: `docs/ant/evidence/2026-10-11-retained-material-experience-shadow/` (11 files), `scripts/ant-material-experience-shadow.js`, and `tests/ant-material-experience-shadow.test.js`. An all-untracked filename inventory confirms 13 files total. These files were not opened, adopted, moved or deleted.

## Suggested cleanup order

1. Keep the dirty shadow worktree and branch untouched until its untracked evidence is separately inventoried and preserved.
2. Recheck the three clean worktree candidates for ignored/local-only files, then remove worktrees before considering deletion of their checked-out local refs.
3. Consider merged local branch candidates only after confirming the expected canonical evidence files remain reachable from main.
4. Consider remote branch deletion last, after a fresh `ls-remote` confirms each exact remote tip and after retaining all unique/W1/social-baseline references.

All candidate labels are recommendations only. This inventory performed no pruning, branch deletion, worktree removal, merge, reset, rebase, or cherry-pick. Parent performed the fetch/live remote verification noted above.

## Post-fast-forward consolidation recheck — 2026-10-13

The current recheck supersedes the earlier snapshot statements above for main and the synthesis branch. GitHub compare reported remote `main` at `75e53df2ec0d025b4337e360e48829f5c58809ab` and synthesis at `8a06d916ba937c57a236ce021c61b399b59cc1ae`, exactly one commit ahead and zero behind. That commit changes six Markdown files only; production/source paths are unchanged. A guarded expected-old ref update advanced remote `main` to `8a06d91`; local `main` then fast-forwarded with `--ff-only`. The final consolidation commit is added on top of `8a06d91`; the synthesis refs remain at their already-canonicalized commit, with no unique content, and are held through Astra review. No PR, merge commit, rebase, delete, prune or worktree removal occurred.

The earlier pre-fast-forward **SAFE DELETE CANDIDATE** refs remain reachable from the newer main. The local and remote `codex/ant-persistent-world-reassessment-20261013` refs are now redundant at `8a06d91`; hold both through Astra review, then treat them as cleanup candidates. Recheck live remote tips immediately before any later deletion.

### Dirty shadow worktree: 13-file content/hash inventory

Read-only comparison of `C:/Users/5dudt/.codex/worktrees/ant-material-experience-shadow/ant-2026` against current main's `2026-10-11-retained-material-experience-shadow-final` package and corresponding runner/test. SHA-256 is listed as `shadow / main`. Byte hashes differ for every pair, so JSON values and CSV rows were compared structurally as well.

| Untracked path | Class | SHA-256: shadow / main | Content comparison |
|---|---|---|---|
| `docs/ant/evidence/2026-10-11-retained-material-experience-shadow/aggregate-summary.json` | A | `141A80CD52C4AA7A6AFC557F760F58C2F5D99C70F886650279E51504942EF011` / `270C040364186D59B38EF0EE95805128777FA8BB5EF23A6E74088F5F9996DE02` | Parsed JSON values equal. |
| `docs/ant/evidence/2026-10-11-retained-material-experience-shadow/episode-durations.csv` | A | `B9B66B911BC72E8657B962FBB84EADA19449FBAFEB7B78D5E8D87E52AA9BAA2B` / `01CDF21D20CC075F662B110B7A25AFB32E1BB52090C939F0C42EF0967A572522` | All 6,584 parsed rows equal. |
| `docs/ant/evidence/2026-10-11-retained-material-experience-shadow/manifest.json` | B | `C421E17D8023AED64A9F27DFF89486FD471D07CA6F009ACCDBD8EF28CB08DB4C` / `7CAC8A84795A96655B7CA7A0963B223DF06B8A33585DAFBD35FE415EF1BD691B` | Unique first-run baseline/branch/runner provenance; current final manifest records a later explicit-baseline replay. |
| `docs/ant/evidence/2026-10-11-retained-material-experience-shadow/population-exposure-by-second.csv` | A | `220D1E2F76233AD1C7591F1541156634662522FC0D084642D51789D5F04E1F35` / `599B79EE3B6B34D6AED9859FAE90ABB01EC066F8DD26CFE863D9B76967544FA0` | All 1,801 parsed rows equal. |
| `docs/ant/evidence/2026-10-11-retained-material-experience-shadow/seed-20261005-ants.json` | A | `6427A3969C796FF6F283FA72B15D229A5142DFDD2CB2F6C0C3F81430A983E906` / `1E9FDD23BC9E5402C2C25A2D4F7CDE617BE70CEBB4C2E3566DCB4C8DCB727CFA` | Parsed JSON values equal. |
| `docs/ant/evidence/2026-10-11-retained-material-experience-shadow/seed-20261005-summary.json` | A | `14574E8A506D48F89C420830E4ED3A4F055CDC971907D3441FF13A28947F44AA` / `0A941E997F7EA2011FACD40C16980122FAADE002DB28F2B795E74F734E66E479` | Simulation summary equal; only volatile `wallSeconds` differs. |
| `docs/ant/evidence/2026-10-11-retained-material-experience-shadow/seed-20261006-ants.json` | A | `0FB271F9F052B45825FC69D78C2B5DFFD1AB5B3056291A0660C7F75DBB5D35C4` / `865A736E4F1FFCE19154687D3C28FA93DB8D93B6ACA0614FEC61411D6BB21DC1` | Parsed JSON values equal. |
| `docs/ant/evidence/2026-10-11-retained-material-experience-shadow/seed-20261006-summary.json` | A | `8794492C90121BD131FB4E62B1022ADB485F6E7944442A5DB723637A4A644B54` / `3DE5184CCB9761CB7BD273EE98B42D1A7CFD0163B9BE34B7FD5D21B765517FDF` | Simulation summary equal; only volatile `wallSeconds` differs. |
| `docs/ant/evidence/2026-10-11-retained-material-experience-shadow/seed-20261007-ants.json` | A | `31F2C3DA95C7E8F92D76ABEA736E00AA90861ED0D07E84FF915724B6EBCB157E` / `AEE0CA4A1B139B5AA8C5A9691B56D69EB2CE1212EB9ECB27B6386A352ADB4DF9` | Parsed JSON values equal. |
| `docs/ant/evidence/2026-10-11-retained-material-experience-shadow/seed-20261007-summary.json` | A | `33D3D3E6DCB4685B271AB2050521A454BADBC1487A775BFE8716EA61F518141C` / `CBEFC4CE63C46B7BCB538792AA49D3DA1E65267ACC0D668821D003C1F77548C2` | Simulation summary equal; only volatile `wallSeconds` differs. |
| `docs/ant/evidence/2026-10-11-retained-material-experience-shadow/source-hashes.json` | B | `680A8E00D770B730D3B9E18D9A8BE87C58FB0A0A71B2456041D935150544F4E2` / `33719D7E6D7614CA29105A7EF0C69A088A6BB1B10D88A3C5ABB18FFAFDF08B13` | Unique first-run source baseline hashes; later canonical replay has a different source set. |
| `scripts/ant-material-experience-shadow.js` | B | `7018B2139E382458A2AC38D07210D8EEC2C23EA6235951103DDF57E82AEA0158` / `0EB9A0010676AF4A7FC5209F595F177F4F9277232B5AF5CB80653055A2C7FA5E` | Historical runner differs; current main adds explicit baseline/source guards, disables adopted resistance for the replay, and fixes out-of-domain validation. Keep with its matching provenance if retained. |
| `tests/ant-material-experience-shadow.test.js` | A | `514A29A8232A8A324D5D6EEB9B487634CDF25AA6BE9BCE6B20C8709A42F0F999` / `3F990752D19F081D00E2696AD3805AB4EDB550D5268A1375F18BE9383E0C5356` | Current test contains the existing assertions plus an out-of-domain regression case. |

Classification totals: **A 10, B 3, C 0, D 0**. The worktree remains **BLOCKED / preserve** because the original runner and its baseline/source-hash provenance are unique historical records. Do not merge its runner into current main or place its manifest beside the later replay as if they shared provenance. No file was changed, moved, committed or deleted during this inventory.

### Updated cleanup set after canonicalization

**Local SAFE DELETE CANDIDATE after Astra (12):** `ant-base-substrate-debug`, `ant-interior-endpoint-shadow-selector`, `ant-movement-material-morphology-audit`, `ant-small-dead-code-cleanup-20261008`, `research/ant-material-causal-tail-20261012`, `research/ant-nodule-lineage-censoring-20261013`, `research/ant-plate-gap-birth-lineage-20261013`, `research/ant-pre-cohort-retained-history-20261012`, `research/ant-zero-ant-continuity-20261012`, `research/ant-zero-ant-nodule-continuity-20261013`, `research/ant-zero-ant-nodule-instrumentation-20261013`, and `codex/ant-persistent-world-reassessment-20261013` (hold through review).

**Remote SAFE DELETE CANDIDATE after Astra (14):** the same 12 names under `origin/`, plus `origin/agent/jules-eval` and `origin/agent/jules-eval-31pro`. The duplicate-tip pair still needs the existing remote-tip check before either deletion.

**Preserve/review:** `ant-retained-material-experience-shadow` and its worktree remain DO NOT TOUCH / BLOCKED; `ant-w1-episodic-material-shadow`, `ant-interior-endpoint-production-candidate`, `ant-local-accretion-shadow`, `origin/ant-s2b-identity-null-design`, `origin/agent/jules-eval-31pro-13765390673869617607`, and `origin/agent/jules-eval-7931340460051171177` remain outside the deletion set. The three clean completed worktrees—`ant-material-experience-current-main`, `retained-material-locomotion-ab`, and `retained-material-locomotion-adoption`—remain REMOVAL CANDIDATES, not ready-to-remove: ignored content is present. The current-main worktree has `dist/` and `test-results/`; locomotion-ab has `dist/` and three ignored evidence logs (`focused-test.log`, `npm-build.log`, `npm-test.log`); adoption has `dist/` and `node_modules/`. Preserve or explicitly re-dispose those ignored artifacts before any later removal. Remove eligible worktrees before their checked-out local branches, then consider merged branch refs, and remote refs last. Reconfirm exact remote heads at execution time.


## Ref identity, dates, and local/remote crosswalk

This exact-ref snapshot is from **2026-10-13 before this report is committed or pushed**. Commit dates are raw ISO 8601 values with their original UTC offset. Local and origin rows below cover 23 local branches and 26 live-verified origin branch heads; origin/HEAD is symbolic and excluded. Full tip SHAs are shown for each actual branch ref.

| Local branch | Origin branch | Local tip SHA | Origin tip SHA | Local tip commit date | Origin tip commit date | Local ahead / behind upstream |
|---|---|---|---|---|---|---|
| `—` | `origin/agent/jules-eval` | `—` | `a78249fc02fb7990568d62709e9a087489fe632b` | — | 2026-10-10T12:05:50+09:00 | — |
| `—` | `origin/agent/jules-eval-31pro` | `—` | `a78249fc02fb7990568d62709e9a087489fe632b` | — | 2026-10-10T12:05:50+09:00 | — |
| `—` | `origin/agent/jules-eval-31pro-13765390673869617607` | `—` | `c9b0794f695a0478a422d3c42628df97e4d7ebe6` | — | 2026-10-10T07:49:33Z | — |
| `—` | `origin/agent/jules-eval-7931340460051171177` | `—` | `db16796dff22bfa1bc94a86a77b0ab66b469ae2f` | — | 2026-10-10T07:21:20Z | — |
| `ant-base-substrate-debug` | `origin/ant-base-substrate-debug` | `5a407ed4f5789ff9409cc34a98703395608e66a3` | `5a407ed4f5789ff9409cc34a98703395608e66a3` | 2026-10-08T00:43:54+09:00 | 2026-10-08T00:43:54+09:00 | 0 / 0 |
| `ant-interior-endpoint-production-candidate` | `origin/ant-interior-endpoint-production-candidate` | `bb970505eb63e9f69d2d00bc302ee72fbe19419e` | `bb970505eb63e9f69d2d00bc302ee72fbe19419e` | 2026-10-08T17:49:29+09:00 | 2026-10-08T17:49:29+09:00 | 0 / 0 |
| `ant-interior-endpoint-shadow-selector` | `origin/ant-interior-endpoint-shadow-selector` | `1795493a4ff44f6dcd9d8d744c709fe0967fb528` | `1795493a4ff44f6dcd9d8d744c709fe0967fb528` | 2026-10-08T16:57:19+09:00 | 2026-10-08T16:57:19+09:00 | 0 / 0 |
| `ant-local-accretion-shadow` | `origin/ant-local-accretion-shadow` | `13ffc9f42bc32083c87c6b1c97bc82092e03e472` | `13ffc9f42bc32083c87c6b1c97bc82092e03e472` | 2026-10-08T19:35:21+09:00 | 2026-10-08T19:35:21+09:00 | 0 / 0 |
| `ant-movement-material-morphology-audit` | `origin/ant-movement-material-morphology-audit` | `892fdc3f33657e216258b11799c251b407a17777` | `892fdc3f33657e216258b11799c251b407a17777` | 2026-10-08T16:09:36+09:00 | 2026-10-08T16:09:36+09:00 | 0 / 0 |
| `ant-retained-material-experience-shadow` | `—` | `fbe3959934158f5a05e51926e89287d503804d05` | `—` | 2026-10-11T11:21:45+09:00 | — | — |
| `ant-retained-material-experience-shadow-current-main` | `origin/ant-retained-material-experience-shadow-current-main` | `f09d67f1eab6f13e7466e1f8ea8c05c08145f995` | `f09d67f1eab6f13e7466e1f8ea8c05c08145f995` | 2026-10-11T21:40:24+09:00 | 2026-10-11T21:40:24+09:00 | 0 / 0 |
| `ant-retained-material-locomotion-ab` | `origin/ant-retained-material-locomotion-ab` | `fc027dfc3d681d5dbcc205b9dbd3be3903103a54` | `fc027dfc3d681d5dbcc205b9dbd3be3903103a54` | 2026-10-11T22:37:38+09:00 | 2026-10-11T22:37:38+09:00 | 0 / 0 |
| `ant-retained-material-locomotion-adoption` | `origin/ant-retained-material-locomotion-adoption` | `37131e0c408a9692ecc364ef7298a71c5e7182ad` | `37131e0c408a9692ecc364ef7298a71c5e7182ad` | 2026-10-12T00:42:03+09:00 | 2026-10-12T00:42:03+09:00 | 0 / 0 |
| `ant-s2a-synchrony-null` | `origin/ant-s2a-synchrony-null` | `62568794c9a94ac476f76bbda7b6311641d192ec` | `62568794c9a94ac476f76bbda7b6311641d192ec` | 2026-10-08T01:43:21+09:00 | 2026-10-08T01:43:21+09:00 | 0 / 0 |
| `ant-s2b-identity-null` | `origin/ant-s2b-identity-null` | `5bfd29a49049b1c75c8e3d16dc580b331cdec6ac` | `5bfd29a49049b1c75c8e3d16dc580b331cdec6ac` | 2026-10-08T02:25:04+09:00 | 2026-10-08T02:25:04+09:00 | 0 / 0 |
| `—` | `origin/ant-s2b-identity-null-design` | `—` | `0f49ba03c0e791cd8ad21368ab6b3273f731d927` | — | 2026-10-08T01:51:10+09:00 | — |
| `ant-s2c-incremental-value` | `origin/ant-s2c-incremental-value` | `fbcf187e80687fa78e4c7b90eb10c3b7f678f97e` | `fbcf187e80687fa78e4c7b90eb10c3b7f678f97e` | 2026-10-08T09:14:54+09:00 | 2026-10-08T09:14:54+09:00 | 0 / 0 |
| `ant-small-dead-code-cleanup-20261008` | `origin/ant-small-dead-code-cleanup-20261008` | `f6b8b08497581f6b7750abc9a788057e9377fa6f` | `f6b8b08497581f6b7750abc9a788057e9377fa6f` | 2026-10-08T11:57:44+09:00 | 2026-10-08T11:57:44+09:00 | 0 / 0 |
| `ant-w1-episodic-material-shadow` | `origin/ant-w1-episodic-material-shadow` | `a181898fb2cd46b394da0bcd80852b378e19b03f` | `a181898fb2cd46b394da0bcd80852b378e19b03f` | 2026-10-11T16:47:51+09:00 | 2026-10-11T16:47:51+09:00 | 0 / 0 |
| `codex/ant-persistent-world-reassessment-20261013` | `—` | `75e53df2ec0d025b4337e360e48829f5c58809ab` | `—` | 2026-10-13T11:29:42+09:00 | — | — |
| `main` | `origin/main` | `75e53df2ec0d025b4337e360e48829f5c58809ab` | `75e53df2ec0d025b4337e360e48829f5c58809ab` | 2026-10-13T11:29:42+09:00 | 2026-10-13T11:29:42+09:00 | 0 / 0 |
| `research/ant-material-causal-tail-20261012` | `origin/research/ant-material-causal-tail-20261012` | `e5e4c52db22512f53d32014f54232f6ff7e3d4cf` | `e5e4c52db22512f53d32014f54232f6ff7e3d4cf` | 2026-10-12T09:41:53+09:00 | 2026-10-12T09:41:53+09:00 | 0 / 0 |
| `research/ant-nodule-lineage-censoring-20261013` | `origin/research/ant-nodule-lineage-censoring-20261013` | `b14de91b91db5e818a8128090e7c442259ddd257` | `b14de91b91db5e818a8128090e7c442259ddd257` | 2026-10-13T09:31:15+09:00 | 2026-10-13T09:31:15+09:00 | 0 / 0 |
| `research/ant-plate-gap-birth-lineage-20261013` | `origin/research/ant-plate-gap-birth-lineage-20261013` | `e21d68597808f8b0c64ff360d0382d6b96971921` | `e21d68597808f8b0c64ff360d0382d6b96971921` | 2026-10-13T00:44:58+09:00 | 2026-10-13T00:44:58+09:00 | 0 / 0 |
| `research/ant-pre-cohort-retained-history-20261012` | `origin/research/ant-pre-cohort-retained-history-20261012` | `214c59cbc31684aa5c1f3fd70dd1d21533c48ab2` | `214c59cbc31684aa5c1f3fd70dd1d21533c48ab2` | 2026-10-12T10:33:33+09:00 | 2026-10-12T10:33:33+09:00 | 0 / 0 |
| `research/ant-zero-ant-continuity-20261012` | `origin/research/ant-zero-ant-continuity-20261012` | `d729072b16dd44c1c4d8b245394d02c278556da8` | `d729072b16dd44c1c4d8b245394d02c278556da8` | 2026-10-12T23:46:05+09:00 | 2026-10-12T23:46:05+09:00 | 0 / 0 |
| `research/ant-zero-ant-nodule-continuity-20261013` | `origin/research/ant-zero-ant-nodule-continuity-20261013` | `d6420667c23fb60c1779344c6ea7077c67147272` | `d6420667c23fb60c1779344c6ea7077c67147272` | 2026-10-13T02:09:59+09:00 | 2026-10-13T02:09:59+09:00 | 0 / 0 |
| `research/ant-zero-ant-nodule-instrumentation-20261013` | `origin/research/ant-zero-ant-nodule-instrumentation-20261013` | `75e53df2ec0d025b4337e360e48829f5c58809ab` | `75e53df2ec0d025b4337e360e48829f5c58809ab` | 2026-10-13T11:29:42+09:00 | 2026-10-13T11:29:42+09:00 | 0 / 0 |

Local-only branches: ant-retained-material-experience-shadow, codex/ant-persistent-world-reassessment-20261013

Remote-only branches: origin/agent/jules-eval, origin/agent/jules-eval-31pro, origin/agent/jules-eval-31pro-13765390673869617607, origin/agent/jules-eval-7931340460051171177, origin/ant-s2b-identity-null-design

Mismatched local/upstream tips: none. Among the 21 local branches with configured upstreams, all are at 0 ahead / 0 behind; **0 unpushed commits**. The two local-only branches have no configured upstream: the current active Codex synthesis branch and the dirty shadow branch.

Classification totals at this snapshot: local = **11 SAFE DELETE CANDIDATE, 5 KEEP REFERENCE, 4 REVIEW BEFORE DELETE, 1 DO NOT TOUCH, 2 KEEP ACTIVE**; origin actual heads = **13 SAFE DELETE CANDIDATE, 6 KEEP REFERENCE, 6 REVIEW BEFORE DELETE, 0 DO NOT TOUCH, 1 KEEP ACTIVE**. The symbolic origin/HEAD is an additional structural ref and is not counted as a branch.

The primary worktree was clean before this report was created. Subsequent changes there belong to the authorized synthesis documentation. The other four worktree paths all exist. The shadow worktree still has its three untracked paths; their contents were not inspected. After the synthesis commit, the active Codex branch will be ahead of main. Pushing publishes that separate branch and clears its unpushed status; it does not advance main. That push takes live origin branch count from 26 to 27; local branch count remains 23.

## Current cleanup result — 2026-10-13

Append-only update. The inventory above remains a historical snapshot. The completed natural Nodule opportunity pass was fast-forwarded and pushed to `main` at `759609e9384e885de1a5e4f74f2eefe8963abd26` before this hygiene commit.

- Worktrees: **5 → 2**. Removed `.codex/worktrees/ant-material-experience-current-main/ant-2026`, `.codex/worktrees/retained-material-locomotion-ab/ant-2026`, and `.codex/worktrees/retained-material-locomotion-adoption/ant-2026`. Remaining: primary `main` worktree and blocked `.codex/worktrees/ant-material-experience-shadow/ant-2026`.
- Local branch refs: **24 → 8**. Deleted `ant-base-substrate-debug`, `ant-interior-endpoint-shadow-selector`, `ant-movement-material-morphology-audit`, `ant-small-dead-code-cleanup-20261008`, `ant-retained-material-experience-shadow-current-main`, `ant-retained-material-locomotion-ab`, `ant-retained-material-locomotion-adoption`, `codex/ant-persistent-world-reassessment-20261013`, `research/ant-material-causal-tail-20261012`, `research/ant-natural-nodule-opportunity-20261013`, `research/ant-nodule-lineage-censoring-20261013`, `research/ant-plate-gap-birth-lineage-20261013`, `research/ant-pre-cohort-retained-history-20261012`, `research/ant-zero-ant-continuity-20261012`, `research/ant-zero-ant-nodule-continuity-20261013`, and `research/ant-zero-ant-nodule-instrumentation-20261013`.
- Live remote heads: **28 → 10**. Deleted the same 16 refs plus `agent/jules-eval` and `agent/jules-eval-31pro`; those two had identical `a78249fc02fb7990568d62709e9a087489fe632b` tips reachable from `main`. All remote tips were directly rechecked before deletion; local remote-tracking refs were refreshed afterward.
- Preserved local refs: `main`, `ant-retained-material-experience-shadow` (blocked), `ant-w1-episodic-material-shadow`, `ant-interior-endpoint-production-candidate`, `ant-local-accretion-shadow`, `ant-s2a-synchrony-null`, `ant-s2b-identity-null`, and `ant-s2c-incremental-value`. Also preserved remote-only `ant-s2b-identity-null-design`, `agent/jules-eval-31pro-13765390673869617607`, and `agent/jules-eval-7931340460051171177`.
- Blocked shadow remains at `fbe3959934158f5a05e51926e89287d503804d05`, with 13 untracked paths. Preserve its unique `manifest.json`, `source-hashes.json`, and `scripts/ant-material-experience-shadow.js`; do not remove its branch or worktree.
- Unexpected conditions: none. After removals, `git worktree list` showed only primary and blocked worktrees, so `git worktree prune` was not needed.
