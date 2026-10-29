# Proposal UPDATE diagnostic: incumbent structure often remains E-qualified

## Decision

**`INCUMBENCY DESERVES FURTHER DESIGN`** — as a future design responsibility only. Across the frozen P1/P2 windows, current production repeatedly removed cells from a finite proposal while those cells remained in the next saved `E`. The exclusions include previous principal-path cells and qualification histories with median ages of 12 and 10 saved one-second intervals. That is enough to reject the idea that all observed turnover is direct environmental invalidation or only trivial fringe churn.

This does **not** establish that any dropped cell ought to remain selected. `E` contains memory. Continued membership in `E` argues against immediate invalidation as the reason for a drop; it does not prove continued structural relevance, eligibility under every selector condition, or a material claim. The diagnostic supports further design of UPDATE, not a hysteresis law or production change.

**EMERGENCE remains separate and unresolved.** These inputs start with already finite selected proposals and cannot explain where the first finite proposal comes from.

## Authority and scope

- Production authority: `main` at `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `codex/ant-event-evolved-scope-20261029` at `849f324dfc6ea4c7da89ac7153a7e2a7fa8c4bad`.
- Research branch: `codex/ant-proposal-update-diagnostic-20261029`.
- Frozen events: seed `20261005`, 60 Hz, Audio Off; P1 saved anchors `64.01666666666308–84.01666666666823 s`, P2 `86.01666666666881–106.01666666667463 s`, 21 anchors each at approximately one-second intervals.
- No simulation replay was needed or run. The analysis reuses the parent’s frozen `E/H/I` sets, principal paths, ribbons and candidate metadata. The original upstream 17.77 MB history packet is not present in this checkout; its source commit and SHA-256 receipt remain embedded in the frozen packet and are recorded in the manifest.

## Implementation fact

The current `TrailPlateBirth` path projects a fresh candidate from current support and chemical memory. It does not pass the previous `I` into `selectCandidate`. After selecting the current proposal, production compares the previous and current representations for continuity using the existing maximum of ribbon-mask Jaccard and neighbor-tolerant forward path similarity, with the existing `0.6` threshold. This comparison carries or restarts maturity; it does not preserve or update membership. The audited source has Git blob `238cc365f2602dc6a22091d69237b88962825a13` and LF-canonical SHA-256 `cb6c28081264d672d6393b64f0d0dc9fdea017fb1fda261ab8a87d879f031a67`.

## Measurements

For each saved transition, the previous proposal is partitioned exactly into cells retained in current `I`, cells still in current `E` but omitted from current `I`, and cells no longer in current `E`. New current-`I` cells are counted separately. The anchor-by-anchor result is in [transition-table.csv](transition-table.csv); exact membership receipts and per-cell qualification histories are in [analysis.json](analysis.json).

| Across 20 transitions per event | P1 | P2 |
| --- | ---: | ---: |
| Previous-`I` cell-transition occurrences | 1,804 | 3,898 |
| Current-`E` cell-transition occurrences | 17,720 | 25,404 |
| Removed from previous `I` | 74 | 490 |
| Still in current `E`, but omitted from current `I` | 71 / 74 (95.95%) | 480 / 490 (97.96%) |
| Genuinely no longer in current `E` | 3 | 10 |
| Still-valid drops / all previous-`I` occurrences | 3.94% | 12.31% |
| Still-valid drops / current-`E` occurrences | 0.40% | 1.89% |
| New cells in current `I` | 134 | 518 |
| Previous whole `I` remained inside next `E` | 17 / 20 transitions | 10 / 20 transitions |
| Previous whole principal path remained inside next `E` | 18 / 20 transitions | 15 / 20 transitions |

These are transition occurrences: a coordinate can be counted again if it is dropped at a later anchor. Unique still-valid dropped coordinates were 71 in P1 and 360 in P2. The two denominator views matter: most *drops* were not immediate losses from `E`, while still-valid drops were 3.94% of P1 and 12.31% of P2 previous-`I` occurrences across the full sampled windows.

### START proposal survival

The START proposal is only a measurement reference. Counts below show how many START cells remain in each anchor’s `E`, in order from elapsed `+0 s` through `+20 s`; each denominator is the START proposal size.

- P1, `62` START cells: `62, 61, 61, 61, 61, 61, 61, 61, 61, 60, 60, 60, 60, 60, 60, 60, 59, 59, 60, 60, 60`.
- P2, `153` START cells: `153, 153, 152, 150, 150, 150, 149, 149, 149, 149, 149, 149, 148, 148, 148, 147, 146, 145, 144, 144, 143`.

At the original COMMIT anchors, 60/62 P1 cells (96.77%) and 143/153 P2 cells (93.46%) remained E-qualified. P1’s first sampled unsupported START cell appears at `65.01666666666293 s` (`+1 s`); P2’s at `88.0166666666694 s` (`+2 s`). Qualification can return between sampled anchors; exact unsupported cell identities at each anchor are preserved in `analysis.json`. The [atlas](selection-update-atlas.png) plots the full curves and compares identical 96×96 world frames.

### Age and structural role of still-valid drops

Age is the number of consecutive saved one-second intervals for which a cell remained in `E`, ending at the anchor where production no longer selected it. It is sampled age, not tick-level qualification duration.

| Still-valid drop occurrences | P1 | P2 |
| --- | ---: | ---: |
| Count | 71 | 480 |
| Median continuous saved-interval age | 12 | 10 |
| Minimum / maximum | 1 / 20 | 1 / 20 |
| On previous principal path | 45 | 111 |
| Outside previous principal path | 26 | 369 |

The role comparison is descriptive: “outside principal path” means a selected non-principal part of previous `I`; it does not mean peripheral, unimportant, or a persistent branch identity. The age histogram at every interval and its split by previous-path membership are in `analysis.json`.

### Turnover anchors

- **P1 largest turnover, `77.01666666666619 → 78.01666666666648 s`:** 6 cells left `I`, all 6 were still in `E` and on the previous principal path; 27 cells entered, 22 on the current principal path and 5 off it. No previous `I` cell became E-invalid.
- **P2 `91.01666666667026 → 92.01666666667056 s`:** 30 left and 76 entered, with no direct invalidation. Of the 30 still-valid drops, 4 were on the previous principal path and 26 off it; 7 gains were on the new principal path and 69 off it.
- **P2 `93.01666666667084 → 94.01666666667114 s`:** the principal path was unchanged. All 16 still-valid drops and all 74 gains were outside that path.
- **P2 `103.01666666667376 → 104.01666666667405 s`:** 62 cells left `I`, of which 61 remained in `E`; 1 was E-invalid. All 61 still-valid drops were outside the previous principal path, which itself remained in current `E`; 15 cells entered, all off the current principal path.

The P1 and P2 pattern is therefore mixed across structural roles. P1 contains repeated losses from the saved principal path; P2’s cited large changes are chiefly in selected non-principal structure while the principal path persists. The measurements do not justify relabeling all non-principal structure as fringe.

## Strict-retention counterfactual — diagnostic only

The registered all-or-replace proxy holds the full saved incumbent `I`/path/ribbon while every incumbent `I` cell remains in current `E`; one E-invalid cell replaces the entire incumbent with the actual current proposal. It is not proposed as an architecture and tests only pointwise `E` membership.

| Counterfactual readout | P1 | P2 |
| --- | ---: | ---: |
| Held transitions / full replacements | 17 / 3 | 10 / 10 |
| Replacement trigger sizes | 1, 1, 1 cells | 1, 1, 2, 1, 1, 1, 1, 1, 1, 1 cells |
| Maturity clock resets | 0 | 0 |
| Counterfactual timer reaches existing 20 s minimum at fixed endpoint | Yes | Yes |
| Final counterfactual `I` vs actual | 123 vs 122; Jaccard 0.6781; 24 counterfactual-only / 23 actual-only | Identical 181-cell `I` |

The P1 proxy differs from production over 17/20 transitions; P2 ends exactly at the production proposal after repeated one-cell replacement triggers. On held steps, the proxy holds the saved path/ribbon along with `I`, making the similarity comparison trivially pass for those steps; this is coupled to the treatment, not independent evidence of coherent scope. Reaching the timer minimum is only a clock-compatibility readout: no other COMMIT gates were counterfactually replayed. The one-cell trigger and whole-proposal replacement expose the cliff and stale-history risks that prevent adopting this rule.

## Interpretation and design boundary

**Measurement result:** Much of the production-dropped `I` remains in `E` at the next saved anchor, and some of those cells have long saved qualification histories or belong to the prior principal path.

**Research interpretation:** Current production membership turnover cannot be explained solely by direct E invalidation. Fresh current projection omits some still-E-qualified prior structure. This makes UPDATE a separate architectural question worth designing carefully. Since `E` carries history, the evidence cannot distinguish meaningful incumbent structure from obsolete but slowly decaying history everywhere; P2’s mostly non-principal turnover especially resists a simple “stable core versus fringe” account.

**Artistic/modeling implication:** None is selected. No mapping from incumbency to geometry, material, persistence, or sound follows from these measurements.

**Smallest justified next question:** Before any retention law, specify what current structural evidence would make a prior selected member worth continuing when it remains in `E` but is omitted by fresh projection. Any follow-up should test that admissibility definition against the same frozen anchors first. It should not invent a hysteresis score, threshold, growth budget, emergence rule, or body response.

## Explicit omissions

No production source change; no new natural run or replay; no extra seed; no emergence selector; no retention adoption; no BODY, material mapping, or W/U change; no 600 s construction run; no audio work; no PR, merge, or force-push. The canonical production README and `src/`/`static/` remain unchanged.
