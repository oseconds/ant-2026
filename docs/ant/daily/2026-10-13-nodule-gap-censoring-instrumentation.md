# 2026-10-13 — Nodule gap-censoring instrumentation reproduction

## Question and scope

This follow-up answers why the 32 cells per arm that became Nodule-qualified after gap-born Plate additions did not birth Nodules by 460 s. The prior saved-evidence audit classified 8 as right-censored, 3 as qualification-lost, 1 as inferred nearby-Nodule blocked, and 20 as data-insufficient. Missing candidate timer history, clear reasons, per-cell qualification/proximity timelines, and Plate masks caused the gap.

The user authorized an instrumentation-only reproduction of the same 400–460 s shadow. This pass did not extend the gap, add an ablation, or change production code, thresholds, timing, TrailPlateBirth, or lifecycle. Natural and timer-clear arms were both retained; timer-clear changed only `candidateSinceMs` at 400 s.

## Baseline and execution

- Baseline: `b14de91b91db5e818a8128090e7c442259ddd257`, branch `research/ant-zero-ant-nodule-instrumentation-20261013`.
- Reused seeds `20261005`, `20261006`, `20261007`, 60 Hz, default-On material locomotion, no audio bridge, natural production through 400 s, then exactly 3,600 zero-ant ticks through 460 s.
- Read current ANT README/world model, prior Nodule lineage and censoring evidence/dailies, `MaterialStratigraphy.js`, and controller ordering. Archive was not consulted.
- Added research-runner instrumentation around the unchanged production `addPlate()`, `advance()`, and actual `_nearExistingNodule()` calls. Each dynamically discovered false-to-true target now has its complete post-enable per-evaluation ledger, explicit timer transitions and reasons, actual blocker identity/distance, clock-end state, and exact full gap-Plate mask coverage list.
- A partial local attempt stopped after saving only seeds `20261005` and `20261006`; it was discarded. The evidence package was generated from a fresh complete three-seed run using the final classifier, which reads the saved `timerAgeMs` at the last evaluation. No partial output is included.
- Existing 600 s natural replay was rerun and matched the committed canonical replay exactly. No new simulation ran past 460 s.

## Findings and decision

Natural and timer-clear each produced the same final exclusive classification for all 32 target cells: 20 right-censored, 7 Plate-reset censored, 5 compaction loss, zero primary nearby-blocked, zero max-count-blocked, zero births, and zero unresolved. Per-seed counts and the previous 20-cell reconciliation are in the [evidence package](../evidence/2026-10-13-nodule-gap-censoring-instrumentation/README.md).

Of the prior 17 cells with nominal opportunity of at least 30 s, 6 actually accumulated an uninterrupted 30 s. All 6 reached and were rejected by the production nearby-Nodule gate; each rejection reset its timer, after which a new timer started and remained active below 30 s at the 459900 ms final Nodule evaluation. At that final evaluation 27 cells had active timers, also active in the 460000 ms clock-end snapshot. Five cells lost qualification through compaction relaxation. Later Plates made 13 actual timer-reset events over 10 unique cells per arm; those resets erased 9.12–19.12 s of timer age. Across the previous 20 unresolved cells, 10 received an actual later Plate reset, 2 lost compaction qualification, 5 encountered the nearby gate, and none hit max count. These event counts overlap; primary classifications describe the final cutoff state.

The first independent review blocked the initial primary tally: it had counted mature proximity rejections as the final reason even though each timer restarted and was active below 30 s at cutoff. I corrected the classification using only the saved full event/evaluation histories, preserved the raw events, added a regression case for block-then-restart, and finalized new JSON with input SHA-256 provenance. No simulation was rerun for this correction. The previous audit's 20 unresolved cells now classify as 11 right-censored, 7 Plate-reset censored, and 2 compaction loss; the five actual nearby blocks among them remain secondary events. The earlier separately inferred nearby case is confirmed as an actual block followed by timer restart and cutoff censoring.

Decision: **WINDOW CENSORING DOMINANT** for this fixed 60 s gap and these 32 cells: 27 window-censored outcomes versus 5 qualification-loss barriers. This does not mean a longer interval would necessarily produce Nodules. A targeted extension is justified as a separate possible follow-up, but was not run here.

Timer-clear and natural arms had identical target primary classifications, timer transitions/timestamps, qualification values, and actual blocker events. Broader Nodule neighborhood state differed, and seed `20261006` had 5 vs 4 total gap-born Nodules; Plate birth counts were identical. This comparison does not claim all world state was matched after the timer intervention.

## Validation and stop boundary

- Focused instrumentation tests: 5/5 passed after the classification correction, including synthetic reset/loss/proximity/max/birth and block-then-restart cases, plus exact Plate-mask reconstruction.
- Three-seed fixed reproduction: completed; 32 unique targets per arm; all target rows end at the exact 459900 ms evaluation; observer-on/off and zero-ant validity checks passed.
- Untouched 600 s natural replay: exact canonical result match.
- Full `npm test` is recorded in the evidence package after completion. Build was not run because the changed files are research scripts and documentation only.
- Fresh independent review: first review identified and blocked the initial primary classification. A new reviewer independently checked current production timer ordering, all six block-then-restart lineages, exclusive classifications, the former 20-cell reconciliation, full-mask Plate coverage, source hashes, and claim limits. Result: **PASS**, with no blocking issue. The reviewer did not edit files, run tests, or run simulations; its one interpretive limit is that cutoff right-censoring does not predict the outcome of a later maturity check.
- No production source, Nodule law, threshold, lifecycle, or world-model claim was changed. No 460 s extension, Plate suppression, or second intervention was run.
- Fresh independent review is recorded in the evidence package before commit.
