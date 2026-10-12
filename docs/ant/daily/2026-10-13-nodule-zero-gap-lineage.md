# 2026-10-13 — MaterialStratigraphy Nodule zero-ant gap lineage

## Question

During the fixed 60 s zero-ant shadow, were gap-born Nodules only delayed completions of pre-gap persistence timers, or could retained material/mechanical conditions qualify cells again after the timers were cleared? Did any observed Nodule birth require a stack transition from a gap-born Plate?

The pass left the production Nodule law, TrailPlateBirth, the production lifecycle and all other ANT behavior unchanged. The intervention was confined to a matched research fork.

## Baseline and method

- At start, remote `main` was `d729072b16dd44c1c4d8b245394d02c278556da8`; `e21d68597808f8b0c64ff360d0382d6b96971921` was its direct child. Fast-forwarded and pushed that research-only TrailPlateBirth result, then created `research/ant-zero-ant-nodule-continuity-20261013` from `e21d685`.
- Read the current ANT README/world model, zero-ant continuity and Plate-lineage evidence/dailies, `MaterialStratigraphy.js`, `SurfaceField.js`, and controller tick ordering. Archive material was not consulted.
- Used seeds `20261005`, `20261006`, `20261007`, default-On material locomotion, counted production RNG, no audio bridge, normal production through 400 s, exactly 3,600 zero-ant ticks through 460 s.
- The natural arm kept all state. The paired timer-clear arm changed only `MaterialStratigraphy.candidateSinceMs` to `-1` at the post-removal boundary; all Plates, Nodules, columns, loads, fields, clocks, TrailPlateBirth state and RNG remained equal. No `MaterialStratigraphy.reset()` was called.
- Nodule gates were re-read from production thresholds and the same local-foot-load helper. `addPlate()` timer resets were observed around the original production call; public stratigraphy snapshots and bottom-to-top columns were read without feeding any behavior.
- A first observer comparison exposed only an unstable V8 object hash for equivalent TrailPlateBirth instances. The harness was corrected to use structural deep equality for cross-instance state. Raw evidence was then reduced to lineage cells, gate timelines and qualification transitions instead of repeating masks across all cell/tick rows.

## Results

**MIXED.** Natural gap births totaled 14: 11 `PRE-GAP TIMER LINEAGE` and 3 `RESET/STACK-CHANGED LINEAGE`. The timer-clear arm still produced 13: 10 `POST-GAP TIMER LINEAGE` and 3 `RESET/STACK-CHANGED LINEAGE`. No birth was ambiguous.

| Seed | Natural births | Timer-clear births | Gap Plates | Cells newly qualified by Plate addition (per arm) | Timers cleared |
|---|---|---|---:|---:|---:|
| `20261005` | 5 PRE-GAP | 5 POST-GAP | 3 | 12 | 383 |
| `20261006` | 3 PRE-GAP, 2 RESET/STACK | 2 POST-GAP, 2 RESET/STACK | 4 | 18 | 313 |
| `20261007` | 3 PRE-GAP, 1 RESET/STACK | 3 POST-GAP, 1 RESET/STACK | 1 | 2 | 353 |

Every timer-clear Nodule completed 30 s persistence. All actual birth cells in both arms were already production-qualified at gap entry; their entry compaction was `0.555–0.606`, and retained local foot load was `286–541`. At birth they still met the compaction and load gates, with no nearby-Nodule or maximum-count block. The same cells were not among the 32 cells whose qualification changed false-to-true after a Plate foundation crossed from fewer than 4 layers to at least 4.

For the six arm-specific RESET/STACK birth records, a gap-born Plate added a layer and reset the candidate timer while the cell's foundation and qualification remained true before and after. This changed persistence timing; it did not supply a missing foundation for those births. Separately, 32 cells per matched arm across the three seed conditions crossed into qualification after Plate addition because existing compaction and retained load passed once the four-layer foundation was present. Both values were unchanged across each synchronous Plate addition; the lowest observed values were `0.55197` compaction and `261` local load. Those cells did not birth a Nodule before 460 s.

No contact or load increase happened during the gap. SurfaceField relaxed; `footLoadByCell` stayed unchanged. Thus the timer-clear result is retained gate state restarting the authored 30 s persistence process, not new mechanical evidence appearing in the gap.

## Validity, decision and stop

- Canonical 600 s natural replay matched the committed replay exactly for all three seeds.
- The paired production runs deep-compared at tick 0 and each second to 400 s (401 checkpoints). After timer clear, full controller state comparison showed `candidateSinceMs` was the only change.
- Both arms had zero living ants for all 3,600 ticks, empty gait/body-pose/gaster maps, no spawn, movement, deposition, FOOT_CONTACT, ant-origin/unclassified event or RNG use. Each clock advanced `60000.00000006985 ms`; each arm recorded 60 Nodule evaluation boundaries.
- Gap Plate descriptors matched across arms. Every observed Nodule birth matched a controller `sphere-birth` event. Read-only observer calls did not change controller state beyond the production operation being observed.
- The raw Nodule birth ledger contains only Plate additions at or before each birth time; the harness asserts against future Plate entries.
- A Plate-suppression ablation was not needed to classify these lineages or determine whether observed Nodule births required a new foundation. It would be a separate follow-up only if we need to measure whether gap-born Plates changed which already-qualified timers completed or shifted Nodule birth timing/count by 460 s.
- Stop boundary respected: no production law, threshold, persistence, load decay, SurfaceField, Plate formation, lifecycle, material character, vitality, social or acoustic change.

## Validation and review

- Focused tests: 2/2 passed; full `npm test`: 312/312 passed.
- Deterministic three-seed replay and untouched canonical natural replay matched as recorded in the evidence package.
- `npm run build` passed with existing dependency-comment and large-bundle warnings.
- Fresh independent review found no blocking issues. It checked timer-clear isolation, thresholds before Plate additions, full Plate descriptor parity, birth-time gates and the final interpretation; it did not rerun tests or the shadow.

Detailed conditions, source hashes, per-seed lineages, gate/timer timelines, Plate transitions, raw data, and reproduction are in [the evidence package](../evidence/2026-10-13-nodule-zero-gap-lineage/README.md).
