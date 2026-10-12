# TrailPlateBirth zero-ant gap candidate lineage

**Decision: MIXED.** During the imposed 400–460 s zero-ant shadow, natural TrailPlateBirth behavior included both continuation of an already active pre-gap candidate and new post-gap candidate lineages. In a paired fork with only the in-progress candidate cleared at 400 s, retained inputs regenerated candidates and produced Plates in all three seeds.

## Baseline and conditions

- Updated `main` was fast-forwarded to `d729072b16dd44c1c4d8b245394d02c278556da8`; this research branch starts there: `research/ant-plate-gap-birth-lineage-20261013`.
- The production source, parameters, `TrailPlateBirth`, `MaterialStratigraphy`, and controller tick were not changed.
- Fresh isolated 600 s natural replay exactly matched the committed canonical replay for seeds `20261005`, `20261006`, `20261007`; output SHA-256: `7852733ca7bba6208dec9743ac9d752d1167bf6e5ea6f28f7ddf0fb9895f9fb4`.
- Both paired controllers ran default production material locomotion On, 60 Hz, counted LCG, no audio bridge, natural behavior through the completed 400 s tick, then exactly 3,600 zero-ant ticks through 460 s.
- `beginZeroAntIntervention()` performed the established 400 s removal/retirement flush before the measured gap. Each arm then retained the same environment and material state. The counterfactual set only `TrailPlateBirth.candidate = null`; it did not call `reset()`.

At tick 0 and each second through 400 s, the paired controllers were deep-compared across controller-owned values, excluding listener/factory/audio callback references and including RNG state and call count: 401 checkpoints per seed. The isolated natural replay also exactly matched the canonical 600 s result. V8 whole-object hashes are used only for same-instance observer-purity checks: paired live instances produced different V8 hashes despite deep-equal values, so V8 hashes were not used as cross-arm equality evidence.

## Lineage rule and timing

The gap starts after the production tick that first reaches 400 s and completes removal/flush. The first subsequent `TrailPlateBirth.advance()` analysis is at approximately `400.016667 s`; observations then occur at each one-second production analysis boundary through approximately `459.016667 s`.

`PRE-GAP` means the candidate at birth retained the same `startedAtMs` as the candidate present at gap entry, and the born Plate descriptor exactly matched the candidate mask and principal path. In `TrailPlateBirth`, `startedAtMs` is carried only when adjacent selected corridors meet the current implementation’s similarity threshold (maximum mask/path similarity at least 0.6). `POST-GAP` means a new candidate started after the gap-entry clock and its descriptor exactly matched the birth candidate. Unmatched cases would remain ambiguous; none occurred.

## Results

| Seed | Natural gap births | Candidate-reset gap births |
| --- | --- | --- |
| `20261005` | 3 POST-GAP: 420.017, 430.017, 444.017 s | 3 POST-GAP: 420.017, 430.017, 444.017 s |
| `20261006` | 4 PRE-GAP: 408.017, 418.017, 428.017, 438.017 s | 3 POST-GAP: 420.017, 430.017, 443.017 s |
| `20261007` | 1 POST-GAP: 425.017 s | 1 POST-GAP: 425.017 s |
| **Total** | **8: 4 PRE-GAP, 4 POST-GAP** | **7: all POST-GAP** |

The four natural PRE-GAP births in seed `20261006` all retained the entry candidate started at `307016.667 ms`; it was already stable for about 92 s at gap entry. The first birth at 408.017 s followed the 10 s global birth-gap interval after a 398.017 s birth; later births followed the same global interval. In seeds `20261005` and `20261007`, the candidate present at gap entry was not the candidate selected at the first post-gap analysis. Natural and candidate-reset arms then selected the same post-gap candidate lineage in those seeds.

The candidate-reset arm began a new candidate at `400016.667 ms` in all seeds. Its first-boundary candidate mean chemical/support values were respectively `0.52597 / 0.37158`, `0.52962 / 0.38252`, and `0.51953 / 0.37229`. These are candidate diagnostics from the existing law; they do not isolate the independent necessity of each retained input.

Across the eight natural-arm and seven reset-arm birth records, all candidate mask/path pairs exactly matched their born Plate descriptors. No birth had a same-corridor prior birth at the actual birth boundary (`repeatDiagnostics` was null). Therefore no gap birth passed a newly generated contact gate or waited for a same-corridor refractory gate. Every birth had met the persistence and global birth-gap gates. The reset arm’s first births followed 20 s of post-gap persistence in seeds 05 and 06, and 25 s in seed 07. Existing `footContactCounts` were unchanged during every gap; no `FOOT_CONTACT` occurred. Where a repeat diagnostic appeared on an early candidate observation, its accumulated new-contact count came from before the gap, and it was not an active gate at the corresponding birth.

The result supports a limited statement: **retained environmental inputs can re-form the current authored TrailPlateBirth candidate and lead to Plate birth during this forced ant-free shadow, even after the pending candidate is cleared.** Natural shadow behavior remains mixed because seed 06 also completed a pre-gap lineage. This does not establish production zero-ant lifecycle, natural autonomous material formation, or any particular ant’s authorship. Nodule formation was not audited.

## Gap and manipulation validity

All three seeds and both arms passed the following checks:

- 3,600 fixed ticks, exactly 60 simulated seconds within floating-point clock accumulation (`60000.00000006985 ms`).
- `agents.length = 0` on every gap tick; no spawn call, no movement-capable agents, and all gait/body-pose/gaster per-ant maps empty.
- No pheromone deposit call, `FOOT_CONTACT`, or other ant-origin/unclassified event. Only existing `plate-birth` and `sphere-birth` world events were allowed; nodules were not analyzed.
- RNG state/call count, total spawned/retired counts, and `footContactCounts` stayed unchanged during the gap. SurfaceField foot-contact count also did not increase.
- Before candidate clearing, both arms matched exactly. After clearing, all controller and `TrailPlateBirth` values other than `candidate` deep-compared equal; pheromone, SurfaceField, chemical memory, contact counts, Plates, birth records, material snapshot, clocks and RNG hashes matched.
- Candidate-only clearing changed no production source or law.

## Evidence files

- [`data/manifest.json`](data/manifest.json): exact baseline, source hashes, replay hash, conditions and seed validity.
- [`data/seed-20261005.json`](data/seed-20261005.json), [`data/seed-20261006.json`](data/seed-20261006.json), [`data/seed-20261007.json`](data/seed-20261007.json): per-second candidate lineage/input diagnostics and every birth’s lineage, gate state, descriptor match and repeat-contact accounting.

## Reproduction

```powershell
node docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs test-results/ant-plate-gap-lineage-natural-replay-repro-20261013.json
node scripts/ant-zero-ant-plate-gap-lineage.js --natural-replay=test-results/ant-plate-gap-lineage-natural-replay-repro-20261013.json --output=test-results/ant-plate-gap-lineage-repro-20261013
```

Both output paths must be fresh. The runner checks the natural replay against the committed canonical output and writes its raw per-seed diagnostics plus manifest.

## Limitations

- This is a research-only, externally imposed 60 s gap after a boundary retirement flush. Production lifecycle was not changed and was not shown to reach zero ants.
- Only three existing seeds and one fixed gap duration were evaluated.
- Candidate clearing removes only in-progress decision state. The retained environmental set—pheromone, `chemicalMemory`, SurfaceField, contact counts, prior births and clocks—was not split into single-carrier ablations, so no one input is claimed necessary by itself.
- Candidate lineage uses current implementation `startedAtMs` and exact geometry matching for diagnostics; it is not a new public API or material state.
- The analysis is limited to TrailPlateBirth. Sphere/nodule births were permitted as unchanged controller events but not causally audited.
- No claim is made about physical autonomous material formation or complete persistent-world circulation.

## Validation and review

Focused lineage tests passed **4/4**. Full `npm test` passed **310/310**. `npm run build` passed; Vite emitted dependency annotation and large-chunk warnings. Fresh independent review is in progress and will be recorded here and in the accompanying daily log.

The documented fresh reproduction completed: its natural replay hash matches the canonical replay, and its manifest plus all three seed JSONs byte-match the committed evidence. Independent review found no blocking issue. It confirmed the candidate-only isolation, lineage/birth descriptor matches, gap gate records, current source hashes, and replay provenance. The runner's `MIXED` label combines natural PRE-GAP births with POST-GAP births from either arm; these data independently include both PRE- and POST-GAP lineages in the natural arm as well.
