# MaterialStratigraphy Nodule lineage in the zero-ant shadow

**Decision: MIXED.** In the natural arms, 11 of 14 gap-born Nodules completed persistence timers that were already running before the gap; the other 3 lineages restarted after a gap-born Plate reset the cell timer. Clearing only all in-progress Nodule timers at 400 s still produced 13 Nodules: 10 on cells whose retained qualification was already present at gap entry, and 3 after a gap-born Plate changed the stack and reset the timer. This supports persistence of retained qualification through an imposed agent-free interval, with a second timer-reset path. It does **not** show that a gap-born Plate created a Nodule's required foundation in these runs.

## Baseline and conditions

- Production/evidence baseline: `e21d68597808f8b0c64ff360d0382d6b96971921`, the direct child of the previously synchronized `main` described in the preceding TrailPlateBirth gap-lineage record. Production source was unchanged.
- Branch: `research/ant-zero-ant-nodule-continuity-20261013`.
- Seeds `20261005`, `20261006`, and `20261007`; fixed 60 Hz; production material locomotion default On; no audio bridge.
- Each paired arm ran normal production through the completed 400 s tick, then the existing research-only removal/retirement flush and exactly 3,600 zero-ant ticks to 460 s.
- An isolated 600 s natural replay exactly matched the committed canonical result for all three seeds. Replay SHA-256: `7852733ca7bba6208dec9743ac9d752d1167bf6e5ea6f28f7ddf0fb9895f9fb4`.

## Production Nodule gates observed

The unchanged production law requires at least 4 overlapping Plates (therefore at least 3 buried layers), local `SurfaceField` compaction of at least `0.55`, local retained FOOT_CONTACT load of at least `200` within radius `0.028`, and 30 s of persistence. Qualification is evaluated no more often than once per second; a sampling gap greater than 2 s clears timers. Existing-Nodule proximity and the maximum count remain later gates. `MaterialStratigraphy.addPlate()` resets `candidateSinceMs[cell]` for every covered cell. In the controller tick, TrailPlateBirth advances first, a successful Plate is added, then MaterialStratigraphy evaluates Nodules in that same tick.

During the forced gap, SurfaceField only relaxed and no FOOT_CONTACT or load increment occurred. `footLoadByCell` was byte-identical from gap entry to exit. A gap-born Plate could change a column and reset its timer, but could not add mechanical contact load or increase compaction.

## Lineage and counterfactual results

`PRE-GAP TIMER LINEAGE` requires that a birth's timer timestamp exactly equal the timer stored at gap entry. `RESET/STACK-CHANGED LINEAGE` means a gap-born Plate overlapped the cell before the new timer start, changing its stack and/or resetting its timer. `POST-GAP TIMER LINEAGE` means a new timer began after gap entry without a preceding Plate change at that cell. Ambiguous cases are kept distinct; none occurred.

| Seed | Natural arm | Timer-clear arm | Gap Plates | Plate-enabled qualified cells (per arm) | Active timers cleared |
|---|---|---|---:|---:|---:|
| `20261005` | 5 PRE-GAP | 5 POST-GAP | 3 | 12 | 383 |
| `20261006` | 3 PRE-GAP, 2 RESET/STACK | 2 POST-GAP, 2 RESET/STACK | 4 | 18 | 313 |
| `20261007` | 3 PRE-GAP, 1 RESET/STACK | 3 POST-GAP, 1 RESET/STACK | 1 | 2 | 353 |
| **Total** | **14: 11 PRE-GAP, 3 RESET/STACK** | **13: 10 POST-GAP, 3 RESET/STACK** | **8** | **32** | **1,049** |

All 13 timer-clear births completed the full 30 s persistence interval. Each observed Nodule birth cell in both arms was already production-qualified at gap entry, with a 4–9 layer foundation, compaction `0.555–0.606`, and retained local foot load `286–541`. The birth cells also passed compaction, load, nearby-Nodule and max-count gates at birth. No timer-clear birth needed a false-to-true qualification transition during the gap: clearing the timer let the unchanged law start persistence again from retained local conditions.

Gap-born Plates did create 32 false-to-true qualified-cell transitions per matched arm across the three seed conditions (12, 18, and 2 by seed). Every one coincided with a foundation transition from below 4 layers to a valid foundation while existing compaction and retained load already met their thresholds. For all 32 cells, the sampled compaction and local retained load were unchanged across the synchronous Plate addition; their minima were `0.55197` and `261`, above the production thresholds `0.55` and `200`. None of those cells was a gap-born Nodule birth cell. In the six arm-specific RESET/STACK Nodule records, the Plate added a layer and `addPlate()` reset the cell timer, while the cell's foundation and qualification were already true before and after the addition. Thus the Plate changed persistence timing for those births; this pass did not show a Nodule birth that required a newly formed foundation.

The natural arm therefore contains both latent completion and post-gap timer restart. The timer-clear arm confirms that retained, already-qualified cells can start a fresh 30 s timer and form Nodules without ant activity. The overall label remains **MIXED** because both pre-gap timers and Plate-reset lineages contribute across the natural and paired arms.

## Manipulation and observer validity

- Natural and timer-clear controllers were structurally deep-compared at tick 0 and every completed prefix second through 400 s: 401 checkpoints per seed.
- At the 400 s intervention boundary, the two arms matched in all controller and retained world state. The counterfactual then called only `candidateSinceMs.fill(-1)`; no `reset()` was used. The pre-clear counts were 383, 313, and 353 active timers. A full controller deep-compare confirmed that the timer array was the only changed state.
- Both arms held `agents.length = 0` for all 3,600 ticks. No spawn, movement-capable per-ant state, pheromone deposition, FOOT_CONTACT, other ant-origin/unclassified event, or RNG call/state change occurred. Each world clock advanced `60000.00000006985 ms`; each arm recorded 60 Nodule evaluation boundaries.
- Gap Plate births were descriptor-identical between the arms. Each observed Nodule birth matched one controller `sphere-birth` event.
- Around each read-only `addPlate()` and Nodule-evaluation observer pass, a same-instance controller-state hash remained unchanged beyond the production call. The paired-run comparison uses structural deep equality; V8 object hashes are not used as cross-instance equality evidence.
- The committed 600 s untouched natural replay matched the canonical replay exactly. Production source diff from the baseline was empty.

## Limitations and claim boundary

- This is one externally imposed 60 s gap after the established boundary retirement flush. Production lifecycle was not shown to reach zero ants naturally.
- Candidate-clear changes only persistence memory. It does not remove retained compaction, foot load, Plates, Nodules, pheromone, SurfaceField, TrailPlateBirth state, or clocks.
- A Plate-suppression ablation is not needed to classify the observed lineages or to conclude that no Nodule birth cell required a new foundation. A later ablation would be needed only if the question becomes whether gap-born Plates changed which already-qualified timers completed, or the timing/count of Nodule births by 460 s.
- `RESET/STACK-CHANGED` is lineage bookkeeping for a timer reset and stack change; it does not attribute a Plate to a particular ant or imply that new contact evidence was generated.
- No production law, threshold, timer, or lifecycle changed. This is not evidence of natural autonomous mineral formation, agent-independent production lifecycle, or new mechanical evidence during the gap.

## Reproduction

Run from this research branch, with the baseline commit as an ancestor and fresh output paths:

```powershell
node docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs test-results/ant-nodule-lineage-natural-replay-repro.json
node scripts/ant-zero-ant-nodule-lineage.js --natural-replay=test-results/ant-nodule-lineage-natural-replay-repro.json --output=test-results/ant-zero-ant-nodule-lineage-repro
```

The runner checks the canonical replay, baseline ancestry, dedicated branch, clean production paths, timer-only manipulation, paired state, observer purity, gap validity, and Plate-birth parity. Raw per-seed lineages, all 60 evaluation summaries, birth-cell gate timelines, timer transitions, Plate-enabled qualification transitions, descriptors and hashes are in [`data/`](data/).

## Validation and review

- Focused Nodule observer tests: 2/2 passed.
- Deterministic three-seed shadow: passed; each paired arm has 3,600 zero-ant ticks, unchanged RNG and retained foot-load map, matching full Plate descriptors, and matching Nodule birth events.
- Untouched canonical 600 s replay: exact result match; replay SHA-256 `7852733ca7bba6208dec9743ac9d752d1167bf6e5ea6f28f7ddf0fb9895f9fb4`.
- Full repository test suite: 312/312 passed.
- `npm run build`: passed. Vite reported existing dependency-comment and large-bundle warnings.
- Fresh independent review: no blocking findings. The reviewer checked timer-only isolation, raw pre-Plate compaction/load values, full Plate descriptor parity, birth-time gate/persistence records, no future Plate entries in birth ledgers, and the bounded interpretation. The reviewer did not rerun tests or the shadow.
