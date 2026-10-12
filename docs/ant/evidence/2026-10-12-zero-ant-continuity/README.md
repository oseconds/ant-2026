# Zero-ant retained-world continuity shadow

- **Decision:** SHADOW ZERO-ANT CONTINUITY SUPPORTED
- **Research branch:** `research/ant-zero-ant-continuity-20261012`
- **Production baseline:** `214c59cbc31684aa5c1f3fd70dd1d21533c48ab2`
- **Natural replay contract:** `37131e0c408a9692ecc364ef7298a71c5e7182ad`

## Question and boundary

Can the current production world state advance through an externally imposed interval with no living ants, and can later entrants experience retained material from before that gap through the adopted production locomotion law?

This is a research-only shadow intervention. It does not establish that production lifecycle naturally reaches zero ants, and it does not change production lifecycle, material, movement, recruitment, or audio code.

## Method

The deterministic natural condition used seeds `20261005`, `20261006`, and `20261007`, 60 Hz, 600 simulated seconds, default-On material locomotion resistance, counted production LCG, and no audio bridge. At the 400 s boundary the harness retired and removed all living ants, first flushing pending gaster doses through the controller's existing retirement/deposit path. It then set the harness-only `nextSpawnTimeMs` to `Infinity` and called the unchanged production `AntController.tick(1/60)` for exactly 3,600 ticks. At 460 s it restored normal recruitment scheduling by setting that time to the current simulation clock.

Within the 3,600 gap ticks, all assertions passed for zero living ants and per-ant gait/body-pose/deposition maps, no spawn attempt or spawn, no movement, no deposition, no FOOT_CONTACT or other ant-origin/unclassified event, unchanged RNG state and call count, and advancing controller time. The boundary gaster flush occurred before the gap and is reported separately. Controller state hashes also stayed unchanged around each boundary capture, each of the 60 gap checkpoints, each of the 140 post-gap per-second observer samples, and the final capture.

The natural replay was rerun from the canonical runner into a fresh file and matched its committed result exactly for all seeds, including the 14-field own-state hash. The current production-source/package/lockfile diff from the research base is empty. The runner also checks staged, unstaged, or untracked production files. The evidence records this natural replay as the baseline; the post-gap shadow is a separate run.

At each post-gap tick entry, before production movement, the observer reads the public stratigraphy snapshot for the actual aggregate layer count `L` and the public bottom-to-top column for `G`, the number of layers whose descriptor birth time is strictly less than 400,000 ms. It records the production multiplier `m(L) = 1 - 0.10 * (1 - exp(-L / 4))` and arithmetic-only `m(L-G)` / `deltaGap = m(L-G) - m(L)`. It removes no material and runs no behavioral counterfactual. Plate identity is not a locomotion input and no creator attribution is inferred.

## Gap validity and world continuity

| Seed | Forced removals | Clock interval (ms) | Pheromone mass | Surface mass | Pre-gap plates retained | New gap Plates / nodules | Pre-gap columns retained |
|---|---:|---|---:|---:|---:|---:|---|
| 20261005 | 18 | 400000.0000000995 → 460000.0000001693 | 218.732 → 13.671 | 2117.200 → 2068.844 | 15 / 15 | 3 / 5 | Yes |
| 20261006 | 21 | 400000.0000000995 → 460000.0000001693 | 217.526 → 13.595 | 2054.823 → 2007.892 | 16 / 16 | 4 / 5 | Yes |
| 20261007 | 23 | 400000.0000000995 → 460000.0000001693 | 209.777 → 13.111 | 2022.103 → 1975.920 | 21 / 21 | 1 / 4 | Yes |

The nominal duration is exactly 3,600 fixed ticks / 60 simulated seconds; the reported controller-clock delta is 60,000.00000007 ms from floating-point accumulation. Pheromone decayed by about 93.8% with zero gap deposit calls. SurfaceField mass relaxed by about 2.3%, and its contact count did not increase. TrailPlateBirth analysis and internal timing advanced in every seed; it formed 1–4 new Plates during the gap. Material revision and nodule evaluation clocks advanced, old Plate descriptors and old per-cell column placement remained, and 4–5 new nodules appeared per seed. Existing pre-gap top layers became buried under gap-born material in some cells: seed 05 changed from 5,199 top-old cells / 0 buried-only cells to 3,779 / 1,420; seed 06 from 5,044 / 0 to 2,991 / 2,053; seed 07 from 5,286 / 0 to 4,296 / 990. Colony activation also evolved while no ants were present. Thus field memories decayed or relaxed while retained stratigraphy and its clocks persisted; the channels did not behave identically.

## Post-gap exposure and production-law contribution

| Seed | First reentry | New ants by 600 s | New ants with pre-gap material | Active ant-time on pre-gap columns | Top-pre-gap / buried-only share of that exposure | Episodes; median / p90 duration | Mean `m(L)` / mean `deltaGap` |
|---|---:|---:|---:|---:|---:|---|---:|
| 20261005 | 460.017 s | 126 | 126 | 84.60% | 60.31% / 39.69% | 567; 1.95 / 9.55 s | 0.9336 / 0.0529 |
| 20261006 | 460.017 s | 141 | 138 | 80.33% | 47.10% / 52.90% | 447; 2.83 / 10.98 s | 0.9258 / 0.0526 |
| 20261007 | 460.017 s | 142 | 140 | 80.35% | 66.60% / 33.40% | 423; 2.38 / 12.75 s | 0.9281 / 0.0640 |
| **Aggregate** | **460.017 s** | **409** | **404** | **81.76%** | **58.10% / 41.90%** | **1,437; 2.28 / 10.88 s** | **0.9293 / 0.0565** |

Across 443,027 post-gap active ant-ticks, 362,237 (81.76%) were spent over columns containing pre-gap material. The actual multiplier on those ticks ranged from 0.9005 to 0.9779 (mean 0.9293); the arithmetic diagnostic `m(L-G)` had mean 0.9857 and median 1.0. `deltaGap` was positive for every recorded pre-gap exposure tick, ranging from 0.0081 to 0.0993. These are descriptive contributions of the existing aggregate-`L` law, not a removal experiment or additive causal decomposition.

The full per-seed lifecycle/exposure summaries, per-ant records, episodes, population series, gap world-state series, natural replay outputs, and hashes are under [`data/`](data/). `world-gap-by-second.csv` and `post-gap-population-by-second.csv` provide the time series; the tables above are compact summaries of those files.

## Validation

- Focused cohort-provenance/reentry tests: 2 passed.
- Full `npm test`: 306 passed, 0 failed.
- `npm run build`: passed. Vite emitted existing dependency annotation and large-chunk warnings; the bundle completed successfully.
- Canonical three-seed natural replay: exact match to the committed output, including the full own-state hash for each seed.
- Research-run observer checks around state sampling passed; production source, package, and lockfile files are unchanged from the baseline. Per-ant map sizes are captured at the exact gap-exit boundary.
- Fresh independent review: no blocking findings. Reviewer independently checked gap timing and zero-state assertions, strict pre-gap classification and production tick-entry sampling, arithmetic-only multiplier diagnostic, raw-to-aggregate reconciliation, source/natural-replay hashes, and the limited claim. The reviewer did not rerun tests or build.

## Reproduction

```powershell
node docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.mjs test-results/zero-ant-natural-replay.json
node scripts/ant-zero-ant-continuity-shadow.js --natural-replay=test-results/zero-ant-natural-replay.json --output=test-results/zero-ant-continuity-replay
```

Both output paths must be unused/empty. The runner records source hashes, rejects a non-empty output directory, verifies the baseline result, and asserts unchanged production source/package/lockfile files relative to the research base.

## Limitations

- The zero-ant interval is externally imposed at 400 s by removing live ant objects and suppressing spawn in the research harness. Production lifecycle was not modified or shown to reach zero naturally.
- The boundary retirement flush happens before the measured interval; there is no ant movement, contact, deposition, spawn, or ant-origin event during the interval.
- Only one fixed 60 s gap and these three matched seeds were evaluated.
- `pre-gap` identifies material by birth time only. It does not identify which ant, if any, created a layer.
- The result says nothing about audio/vibration continuity or complete persistent-world circulation.
- Tests validate the harness and its assertions; the research conclusion comes from the distributions above.

## Review

Fresh independent review found no blocking issues. It verified the 3,600-tick interval and empty gap-exit maps; public tick-entry material sampling; strict `< 400,000 ms` provenance; arithmetic-only `m(L-G)` diagnostic; all three seeds' ant, episode, time-series, seed and aggregate totals; and manifest/source/natural-replay hashes. It confirmed the claim remains limited to the imposed research shadow. The reviewer did not rerun tests or build.
