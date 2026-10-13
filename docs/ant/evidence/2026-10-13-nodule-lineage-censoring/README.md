# Nodule lineage censoring audit

**Decision: DATA INSUFFICIENT.** The committed evidence supports several partial classifications, but it does not preserve enough per-cell timer, later-Plate coverage, or proximity history to explain all 32 Plate-enabled cells. This is an evidence-only audit: no simulation, replay, or new intervention was run.

## Question and source

The audit asks why 32 cells per arm became Nodule-qualified after a gap-born Plate raised their column from fewer than four layers to at least four, but none birthed a Nodule by the 460 s boundary.

- Source experiment: commit `d6420667c23fb60c1779344c6ea7077c67147272`, based on `e21d68597808f8b0c64ff360d0382d6b96971921`.
- Source data: [`2026-10-13-nodule-zero-gap-lineage`](../2026-10-13-nodule-zero-gap-lineage/), especially its `data/manifest.json` and three seed JSON files.
- Audit baseline and branch point: `d6420667c23fb60c1779344c6ea7077c67147272`.
- Conditions inherited from the saved experiment: seeds `20261005`, `20261006`, `20261007`; 60 Hz; zero ants from 400–460 s; natural and candidate-timer-clear arms. The same 32 cell IDs occur in both arms, represented by 64 rows in [`censoring-ledger.json`](data/censoring-ledger.json).

The raw export preserves every `qualificationEnabledTransition`, all 60 aggregate evaluation boundaries per arm, Plate birth descriptors, and full per-cell Nodule timelines only for cells that actually birthed. None of these 32 target cells birthed. The export omits their per-cell `candidateSinceMs` history, per-cell qualification/proximity states, and Plate masks needed to determine whether later Plates covered them.

## Production timing and gates

The audit uses current `MaterialStratigraphy` semantics: qualification requires at least four overlapping Plates (three buried layers), compaction of at least `0.55`, and retained local FOOT_CONTACT load of at least `200`; qualification is evaluated at one-second intervals and the candidate timer begins on an eligible evaluation. Qualification loss clears the timer; a Plate addition clears it for each cell covered; and proximity is checked after the 30 s persistence requirement, with a rejected candidate timer cleared. The maximum is 32 Nodules. During the gap, SurfaceField has no contact input and only decays with its 1800 s half-life. See [`MaterialStratigraphy.js`](../../../../src/lib/agents/ant/MaterialStratigraphy.js) and [`SurfaceField.js`](../../../../src/lib/agents/ant/SurfaceField.js).

The last saved gap evaluation was at 459900 ms, although the forced gap ended at 460000 ms. Therefore nominal opportunity below is the no-reset interval from the first saved eligible evaluation through 459900 ms; it does not treat the final 100 ms as an evaluation opportunity.

## Classification

Counts below apply **per arm**. Natural and timer-clear classifications match in the fields that were retained. `PLATE-RESET CENSORED = 0` means zero were confirmed from the saved data; it does **not** mean no resets occurred.

| Primary classification | Natural | Timer-clear | Basis |
|---|---:|---:|---|
| RIGHT-CENSORED | 8 | 8 | Eight cells remained qualified with no later Plate born after their enabling Plate, and their final saved evaluation arrived before 30 s. |
| PLATE-RESET CENSORED | 0 confirmed | 0 confirmed | Actual count unknown: later Plate cell coverage was not retained. |
| QUALIFICATION LOST | 3 | 3 | Derived Float32 compaction decay places the earliest possible 30 s boundary below 0.55. |
| NEARBY-NODULE BLOCKED | 1 inferred | 1 inferred | Seed `20261007`, cell `6388`; it reaches the persistence boundary without birth, while other saved gates remain open. Nearby Nodule identity/state was not retained. |
| MAX-COUNT BLOCKED | 0 | 0 | `maxNodulesReached` is false at every saved boundary; natural/timer-clear maxima are `20261005` 21/21, `20261006` 19/18, and `20261007` 18/18. |
| OTHER EXPLAINED | 0 | 0 | No additional direct reason is reconstructable. |
| DATA INSUFFICIENT | 20 | 20 | Timer/reset and/or cellwise gate history is missing. |

Per seed, per arm:

| Seed | RIGHT-CENSORED | QUALIFICATION LOST | NEARBY-NODULE BLOCKED (inferred) | DATA INSUFFICIENT |
|---|---:|---:|---:|---:|
| `20261005` | 1 | 1 | 0 | 10 |
| `20261006` | 7 | 1 | 0 | 10 |
| `20261007` | 0 | 1 | 1 | 0 |

### Persistence opportunity and unresolved resets

From first eligible evaluation to the last saved evaluation, nominal no-reset opportunities range from **15 to 51 s** (median **31 s**) in each arm. Fifteen cells have less than 30 s under that assumption and 17 have at least 30 s. Of the 20 unresolved cells, 6 fall in the under-30 s group and 14 in the at-least-30 s group. These are upper bounds before unknown timer resets, not measured uninterrupted timer intervals.

The eight RIGHT-CENSORED cells are reconstructed as qualified with active, sub-30 s timers at the final saved evaluation: one cell in seed `20261005` had about 15 s, and seven cells in seed `20261006` had about 21 s. The exact total number of active candidates at 460 s is unknown because the per-cell timers were not exported.

Three cells are compaction-limited before any earliest possible 30 s interval can complete: seed `20261005`/cell `5145` (`0.551970` at enable), seed `20261006`/cell `4077` (`0.553122`), and seed `20261007`/cell `4949` (`0.554782`). Their local retained loads already exceeded 200. A no-contact 60 Hz Float32 projection of the production 1800 s half-life puts compaction below 0.55 before 30 s. This is a derived gate bound, not a recorded per-cell timer or exact threshold-crossing event. Two additional cells—seed `20261005`/cell `6202` and seed `20261006`/cell `2921`—are projected below threshold by 460 s, but the saved evidence cannot establish whether they had a full qualifying 30 s first.

The inferred proximity case is seed `20261007`/cell `6388`: enabled at about 425016 ms with compaction `0.8585` and retained load `1086`; no later Plate was born in that seed. Its first eligible evaluation was about 425900 ms and its 30 s boundary about 455900 ms. No birth and no max-count block leave the production proximity gate as the remaining direct explanation. This is an inference; no nearby Nodule ID or per-cell proximity result was saved.

There are **22 cells per arm** with at least one later gap-born Plate after their qualifying Plate. The total is a potential-reset count only: the masks were omitted, so the number actually covered and reset is unknown. In particular, all six seed `20261005` unresolved cells with less than 30 s had a later Plate birth, but the export cannot say whether that Plate overlapped each cell.

### Natural vs timer-clear sensitivity

The same 32 cell IDs, nominal opportunities, and partial classifications appear in both arms; no difference is recoverable from the saved target-cell fields. The timer-clear intervention changed other Nodule persistence history and births, so missing per-cell proximity data means this does not establish equal proximity conditions or equal eventual opportunity between arms.

## Limitations and decision

The audit can reject a simple “all 32 just needed more time” account: three are compaction-limited before 30 s, one reached the maturity gate and was proximity-blocked by inference, and eight are clearly right-censored. It cannot decide whether right-censoring dominates across all 32, because 20 primary classifications remain unresolved. Likewise it cannot count actual later Plate timer resets, actual proximity blocks among unresolved cells, or the exact number of timers still active at 460 s.

Therefore neither **WINDOW CENSORING DOMINANT** nor **FORMATION BARRIERS DOMINANT** is supported: the decision is **DATA INSUFFICIENT**. A longer-gap run is not justified by this audit alone. The next useful step would be to retain per-cell timer start/reset/clear reason, per-cell gate state, and full later-Plate coverage in the exporter; only then decide whether a follow-up through at least 475 s is warranted. This audit does not show that any unresolved cell would eventually form a Nodule.

## Reproduction and validation

The summarizer reads only the three committed source JSON files and writes the ledger:

```powershell
node scripts/audit-ant-nodule-censoring.js --output docs/ant/evidence/2026-10-13-nodule-lineage-censoring/data/censoring-ledger.json
node --test tests/ant-nodule-lineage-censoring.test.js
```

The test verifies all 64 rows, paired cell sets, per-arm counts, opportunity bounds, projected compaction counts, max-count status, and deterministic output. No canonical README/world-model change was made because this audit did not change the verified world claim.

- Focused audit tests: 2/2 passed.
- Full `npm test`: 314/314 passed.
- Saved ledger exactly matched a fresh summarizer result over the committed raw JSON.
- `npm run build` was not repeated: the pass changed no production or build source.
- Fresh independent review approved the classifications and claim boundaries with no blocking correction; the reviewer did not run simulation, replay, or tests.
