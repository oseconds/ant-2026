# 2026-10-13 — Nodule lineage censoring audit

## Question

Why did the 32 cells per arm that became Nodule-qualified after gap-born Plate additions not birth Nodules by 460 s: insufficient persistence window, later timer resets, qualification loss, proximity, max-count, or missing evidence?

This was an audit of the committed zero-ant Nodule evidence only. No new simulation, replay, longer gap, or causal intervention was run, and production code was not changed.

## Baseline and method

- Started from research branch `research/ant-nodule-lineage-censoring-20261013` at `d6420667c23fb60c1779344c6ea7077c67147272`, the saved Nodule lineage result. Local `origin/main` also pointed to that commit. A live `git ls-remote` query could not authenticate in this environment (`SEC_E_NO_CREDENTIALS`), so remote state was not independently refreshed during this audit.
- Read the ANT README/world model, Nodule lineage README/manifest/seed JSONs, the related daily record, and current `MaterialStratigraphy` and `SurfaceField` semantics. Archive material was not consulted.
- Added a deterministic summarizer that reads only the three committed seed JSONs, builds one row for each matched cell/arm, and records what is inferred versus absent. Added a focused test and a reproducible JSON ledger.
- The raw experiment retained aggregate evaluation boundaries and per-cell timer/gate histories only for Nodule birth cells. The 32 target cells did not birth; their exact timer, qualification, proximity, and later-Plate-overlap histories are not present.

## Result

**DATA INSUFFICIENT.** Per arm, the partial primary classification is:

| RIGHT-CENSORED | PLATE-RESET confirmed | QUALIFICATION LOST | NEARBY-NODULE inferred | MAX-COUNT | DATA INSUFFICIENT |
|---:|---:|---:|---:|---:|---:|
| 8 | 0 (actual unknown) | 3 | 1 | 0 | 20 |

The 8 right-censored cells are one in seed `20261005` and seven in `20261006`; they were still qualified at the last saved evaluation at 459900 ms, with about 15 s and 21 s respectively to the 30 s requirement. Three cells are compaction-limited by derived no-contact decay before the earliest possible 30 s completion. One cell, seed `20261007`/6388, reached the 30 s gate without a birth and is blocked by proximity by elimination of the other saved production gates; the nearby Nodule itself is not identified in the evidence.

No max-count block occurred at any saved evaluation boundary. Nominal no-reset opportunity ranged 15–51 s (median 31 s): 15 cells had less than 30 s and 17 had at least 30 s. Among the 20 unresolved cells, 6 had under 30 s and 14 had at least 30 s. Those intervals do not reveal timer resets. Twenty-two cells per arm had a later Plate birth after their enabling Plate, but omitted masks prevent determining how many cells were actually covered and reset.

Natural and timer-clear arms have identical target cell sets and the same partial classification. This does not prove equal proximity or timer histories because the timer-clear arm changed other Nodule outcomes and the target-cell timelines were not saved.

The existing evidence does not support either censoring-dominant or formation-barrier-dominant interpretation. A longer gap alone is not justified yet. First useful follow-up: preserve per-cell timer start/reset/clear reasons, qualification and proximity states, and later Plate coverage; then decide whether to extend observation to at least 475 s. No extension was run here.

## Evidence and stop boundary

- Detailed per-cell ledger, classifier definitions, per-seed counts, limitations, and reproduction: [censoring evidence package](../evidence/2026-10-13-nodule-lineage-censoring/README.md).
- Focused audit tests passed 2/2; full `npm test` passed 314/314. The saved JSON ledger exactly matched a fresh summarizer result over the committed inputs. Build was not repeated because production/build source was untouched.
- A fresh independent reviewer checked the code, ledger, raw evidence and production gates; no blocking issue or correction was found. The reviewer did not run tests or simulation.
- No source experiment JSON was changed. No canonical README/world-model edit was needed because the verified world claim did not change.
- No production code, Nodule threshold/timer, SurfaceField law, TrailPlateBirth behavior, or lifecycle was changed.
