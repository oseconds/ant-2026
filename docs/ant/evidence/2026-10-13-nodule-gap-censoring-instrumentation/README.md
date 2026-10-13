# Nodule zero-ant timer and blocker instrumentation

**Decision: WINDOW CENSORING DOMINANT.** Re-instrumenting the fixed 400–460 s shadow explains all 32 Plate-enabled qualification cells in each arm. In the natural arm, 27 were still qualified with an active, sub-30 s timer at the final evaluation: 20 right-censored and 7 whose current interval followed an actual Plate reset. Five lost qualification through compaction decay. Six actual nearby-Nodule rejections occurred earlier, but every rejected timer restarted and was again active below 30 s by the final evaluation. No target cell birthed a Nodule by 460 s. This decision describes the fixed 60 s window and these target cells only.

## Question and source

The pass resolves why gap-born Plates changed 32 cells per arm from nonqualified to qualified while no Nodule was born in those cells by 460 s. It adds event and per-evaluation observation to the same deterministic experiment; it adds no intervention beyond the existing natural and candidate-timer-clear arms.

- Baseline branch point and exact baseline commit: `b14de91b91db5e818a8128090e7c442259ddd257`.
- Previous evidence-only audit: [`2026-10-13-nodule-lineage-censoring`](../2026-10-13-nodule-lineage-censoring/README.md), which left 20 of 32 cells per arm unresolved.
- This package supersedes none of that evidence. The prior audit remains unchanged and is reconciled below.
- Archive material was not used.

## Fixed conditions and production semantics

- Seeds `20261005`, `20261006`, `20261007`; 60 Hz; default material locomotion On; no audio bridge.
- Normal production through 400 s, then exactly 3,600 ticks with zero living ants, through a 460 s simulation clock.
- Natural arm preserves all state. Timer-clear arm changes only `candidateSinceMs` by filling the existing array with `-1` at the 400 s boundary; no `reset()` or other intervention is used.
- Both arms preserve the existing Nodule gates: at least 4 overlapping Plates and 3 buried layers, compaction `>=0.55`, local retained FOOT_CONTACT load `>=200`, 30 s persistence, current proximity check, and maximum count 32. `addPlate()` clears a timer only for covered cells and runs before `MaterialStratigraphy.advance()` on the same controller tick.
- Final per-cell Nodule evaluation is at `459900 ms`; the world clock reaches `460000 ms`. Classification uses the last actual evaluation, and the separate clock-end state is recorded without inventing a 460000 ms evaluation.

## Instrumentation and validity

The research runner adds a cell to the target set at the exact Plate addition that changes its production qualification from false to true. It records every following Nodule evaluation through 459900 ms, including layer and buried-layer counts, top Plate, compaction, retained local load, qualification, timer before/after/age, proximity IDs, actual blocking Nodule, maximum-count state, and Nodule presence at or near the cell.

Timer starts, actual timer clears by failed qualification gates, each covered-cell Plate reset, the first production proximity-gate call after maturity, blocker identity/distance, and the final evaluation are explicit events. Each gap-born Plate stores the exact list of set indices from its complete mask, the mask hash and dimensions, and a per-target coverage relation. A Plate reset is reported only when the production timer was active and the Plate mask actually covered the cell.

Read-only wrappers hash production state around Plate addition, Nodule advance, and proximity checks; the proximity diagnostic is asserted equal to the production method result. Cross-arm production state is compared every second through 400 s and observer-on/off state is compared every gap tick. All three seeds recorded:

- 401 exact prefix checkpoints and observer-on/off equality across 3,600 gap ticks per arm;
- exactly 3,600 zero-ant ticks, with no spawn, per-ant movement/body/gait state, deposition, FOOT_CONTACT, ant-origin/unclassified event, or RNG consumption;
- retained local foot-load unchanged during the gap, timer-clear state differing only in `candidateSinceMs`, and identical gap-born Plate descriptors across arms;
- no repeated or missing targets: 12, 18, and 2 cells per seed per arm;
- exact equality between the untouched 600 s natural replay and the committed canonical replay.

The harness does not change production code or thresholds. Full per-seed observer output is in [`data/`](data/).

## Classification

Primary reason is the direct production reason that explains the final nonbirth. `RIGHT-CENSORED` means the cell remained qualified with an active timer below 30 s at the last evaluation. `PLATE-RESET CENSORED` means an actual later covered-cell Plate reset restarted the timer and the final uninterrupted interval remained below 30 s. Qualification loss is attributed to the failed production gate. Nearby blocking is recorded only from the actual production proximity call after maturity, not inferred from a Nodule merely being nearby.

The natural and timer-clear arms have the same primary classifications and the same target timer transitions, qualification values, and actual blocker events in every paired cell. The broader Nodule-neighborhood state differs between arms, so this does not imply whole-world parity after the timer-clear intervention.

| Seed | Targets per arm | Right-censored | Plate-reset censored | Lost: compaction | Nearby-Nodule blocked | Max-count blocked | Birth | Data insufficient |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `20261005` | 12 | 7 | 3 | 2 | 0 | 0 | 0 | 0 |
| `20261006` | 18 | 12 | 4 | 2 | 0 | 0 | 0 | 0 |
| `20261007` | 2 | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| **Total per arm** | **32** | **20** | **7** | **5** | **0** | **0** | **0** | **0** |

### Persistence and event counts

- The earlier audit's 17 cells with nominal no-reset opportunity of at least 30 s split into **6 cells with an actual uninterrupted 30 s timer interval** and 11 without one. All 6 matured intervals invoked the production nearby-Nodule gate and were rejected. In all six, production reset the timer, a new candidate timer started, and that new timer remained active but under 30 s at 459900 ms; all six therefore finish as `RIGHT-CENSORED`, with the earlier block retained as a secondary event.
- Nominal opportunity from first target evaluation to 459900 ms ranged from **15 s to 51 s** (median **31 s**). Exact effective timer start, clear, maturity, and final age are in each cell's event/evaluation ledger.
- **27/32** target timers were active at the 459900 ms final evaluation and still active in the separate 460000 ms clock-end snapshot. Their ages at the evaluation were below 30 s. Five target cells lost qualification, all because compaction fell below its threshold; no target failed foundation or retained foot-load gates. This yields 27 window-censored outcomes versus 5 formation barriers; the six earlier proximity blocks are secondary events and are not added to the exclusive primary tally.
- In the natural arm, **13 actual Plate timer-reset events affected 10 unique target cells**: five events across four cells in seed `20261005`, eight events across six cells in `20261006`, none in `20261007`. Each reset followed a recorded true mask coverage and discarded 9.12–19.12 s of prior timer age (median 9.12 s). A reset can be a secondary event: later qualification loss or maturity/proximity can become the primary final classification.
- There were **6 actual nearby-Nodule rejections**, all after the timer matured at 30 s: five in seed `20261006` and one in `20261007`. The blocking Nodule ID, position, distance, and timer reset confirmation are recorded. There were no max-count blocks.

### Reconciliation of the previous 20 unresolved cells

The previous audit's unresolved 20 cells per arm are now classified, with the same results in both arms:

| Seed | Previously unresolved | Right-censored | Plate-reset censored | Lost: compaction | Nearby-Nodule blocked | Max-count blocked | Still insufficient |
|---|---:|---:|---:|---:|---:|---:|---:|
| `20261005` | 10 | 6 | 3 | 1 | 0 | 0 | 0 |
| `20261006` | 10 | 5 | 4 | 1 | 0 | 0 | 0 |
| **Total per arm** | **20** | **11** | **7** | **2** | **0** | **0** | **0** |

Across those 20 cells, 10 actually received one or more later covered-cell Plate resets, 2 lost qualification from compaction, 5 reached and were rejected by the nearby-Nodule gate, and none was blocked by maximum count. These event counts overlap: all five nearby rejections were followed by a restarted, active sub-30 s timer at the final evaluation. The table classifies the final nonbirth state, while the ledger preserves the earlier blocker. The previous audit's inferred proximity case is confirmed by an actual production gate call.

### Natural vs timer-clear

The target classification, per-cell timer transitions/timestamps, qualification gate values, and actual blocker events were identical between arms for all 32 paired cells. The wider Nodule-neighborhood state was not identical: candidate clearing altered other Nodule birth timing, and the gap produced 5 vs 4 total Nodules in seed `20261006` (5 vs 5 in `20261005`, 4 vs 4 in `20261007`). Gap-born Plate counts remained identical at 3, 4, and 1. Therefore, equal target classifications do not mean all world state stayed equal after the timer intervention.

## Decision and limits

**WINDOW CENSORING DOMINANT.** The exclusive natural-arm tally is 27 window-censored outcomes (20 right-censored plus 7 Plate-reset censored) versus 5 formation barriers (all compaction loss). Six actual proximity blocks are retained as secondary history; each was followed by timer restart and a new active interval that remained below 30 s at the cutoff. The result explains why no target cell birthed within the fixed 60 s observation window; it does not predict that longer observation would produce Nodules. No 460 s extension, second gap, Plate suppression, threshold tuning, or production lifecycle change was run.

This remains a forced zero-ant shadow. It does not establish that production naturally reaches zero ants, that the world lifecycle is agent-independent, or that any particular ant contributed to a layer. The production Nodule law and all other production behavior remain unchanged.

## Reproduction

From the repository root, regenerate the canonical natural replay and then the fixed instrumentation run to a fresh output directory:

```powershell
node docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs test-results/ant-nodule-instrumentation-natural-replay-20261013.json
node scripts/ant-zero-ant-nodule-lineage.js --natural-replay=test-results/ant-nodule-instrumentation-natural-replay-20261013.json --output=test-results/ant-nodule-instrumentation-raw-20261013
node scripts/finalize-ant-nodule-instrumentation.js --input=test-results/ant-nodule-instrumentation-raw-20261013 --output=test-results/ant-nodule-instrumentation-final-20261013
```

The runner asserts that the first replay equals the committed canonical replay before starting. The finalizer only reclassifies complete saved event/evaluation histories; it does not run a simulation and asserts that captured events are unchanged. The committed `data/manifest.json` and three seed JSON files are the finalized complete run output. The finalizer also records SHA-256 hashes of its raw inputs.

- Focused instrumentation tests: 5/5 passed.
- Full `npm test`: 317/317 passed.
- `npm run build` was not run because all changed code is research tooling and no build source or dependency changed.
- The first fresh review blocked the initial tally because mature proximity rejections were counted as primary even though each timer restarted and remained active below 30 s at cutoff. The classifier was corrected from saved event histories, with no simulation rerun. A second fresh review passed: the reviewer independently checked timer precedence/order, all six block-and-restart histories, the per-seed and prior-20-cell reconciliation, Plate coverage records, source hashes, and claim limits.
- This pass added no build-source change; `npm run build` was not repeated.
