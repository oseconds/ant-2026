# 2026-10-12 — Pre-cohort retained history

## Question and baseline

Does retained stratigraphy born before every currently living ant remain in later ants' current columns and contribute through the production locomotion law?

The selected world direction remains that material left by ants becomes an environmental condition later living ants experience. This pass only observes the current adopted law. It adds no feedback, state, lifecycle rule or production behavior.

Verified production `main` at `37131e0c408a9692ecc364ef7298a71c5e7182ad` and causal-tail branch at `e5e4c52db22512f53d32014f54232f6ff7e3d4cf`; the latter was a linear descendant with no production-source/parameter changes. Fast-forwarded remote `main` to `e5e4c52`, then created `research/ant-pre-cohort-retained-history-20261012` from that updated `main`. Started from a clean worktree. Read current ANT README/world-model and relevant 2026-10-11/12 evidence and daily records; excluded `docs/ant/archive/**`.

## Method

`pre-cohort` is a strict per-tick relation: a public column layer is pre-cohort when its `bornAtSimulationTimeMs` is less than the minimum exact spawn time among all currently live ants. The minimum is recalculated each tick and advances when the oldest live ant retires. No contributor identity is inferred.

At each 60 Hz tick entry, before `AntController.tick`, the read-only research observer reads one public `MaterialStratigraphy` snapshot, uses the production `materialLayerCountAtSnapshot()` for `L`, and reads each current cell's public bottom-to-top `getColumnAt()` descriptors for `P`. It checks count and current-top consistency. A harness-only wrapper around successful `spawnNextAnt()` calls records the controller's existing simulation clock as exact entry provenance; it adds no agent field or event and consumes no RNG. The production default remained On.

The diagnostic `m(L-P)` and `delta = m(L-P)-m(L)` only describe the arithmetic marginal of old layers inside the unchanged bounded production law. No material is removed and no counterfactual behavior run is performed. The observer does not send any callbacks to material, behavior, renderer or audio.

## Execution and validity

Ran seeds `20261005`, `20261006`, `20261007`, 600 simulated seconds each, fixed 60 Hz, default controller state, counted LCG, no audio bridge. Each seed compared observer OFF/ON across 36,001 per-tick rows and 14 fields. All field chains were exact. The observer-on path was re-hashed before and after every one of 108,000 observer reads with no state change; RNG calls and state, lifecycle, trajectory, pheromone, SurfaceField, gait/contact, TrailPlateBirth and MaterialStratigraphy matched.

Focused cohort/classification tests: 3/3 passed, covering strict `<` at equal entry time, bottom-to-top old/buried-only/top classification, oldest-live threshold changes after retirement, empty/out-of-domain cells and fixed-tick/provenance validation. Full `npm test` passed 304/304 and `npm run build` passed with existing Zod annotation-position and Vite large-chunk warnings. Fresh independent review returned **PASS WITH LIMITATIONS**: 39 saved-data/statistic reconciliations and independent multiplier/delta recomputations matched; no scientific or data correction was requested. The review was read-only and did not rerun the 600 s simulations. Logs and review are linked in the evidence README.

## Result

**SUPPORTED CROSS-COHORT HISTORY.** The 2,180 spawned ants accumulated 2,020,078 active ant-ticks. A nonempty column (`L > 0`) was under ants for 51.54% of active ant-time. `P > 0` occurred for 930,695 ant-ticks (46.07% of active ant-time; 89.39% of column-occupied ant-time) and affected 1,603 ants. The 5,455 old-history contribution episodes had median duration 1.10 s and p90 8.62 s.

Of old-history ant-time, 45.62% had a pre-cohort top and 54.38% had pre-cohort layers only below a newer top. Actual mean `m(L)` when `P > 0` was 0.93081; diagnostic mean `m(L-P)` was 0.97970; mean `delta` was 0.04889 (median 0.04712, p90 0.08262). This is bounded arithmetic attribution within the adopted scalar law, not direct sensing or a separate causal intervention.

The pattern was consistent and time-dependent: pre-cohort history occupied 45.61%, 42.38% and 50.21% of active ant-time in seeds 20261005/06/07. The three-seed 0–200 / 200–400 / 400–600 s shares were 1.54% / 45.21% / 80.84%. All current live ants simultaneously occupied pre-cohort columns for a cumulative 24.93 s across the runs; each seed had at least one such interval.

The result establishes only that old retained layers remain in positions later ants occupy and contribute to production `L` under the existing law. It does not identify a retired creator, prove buried-layer sensing, or claim that resistance changes formation. No production behavior was changed.

## Stop boundary and evidence

No production tuning, additional feedback, vitality, lifecycle changes, TrailPlateBirth change, material character, social or acoustic feedback, contributor attribution or zero-ant simulation work was performed.

Full evidence, distributions, parity hashes, raw episode/population summaries, reproduction command, limitations and review: [`2026-10-12-pre-cohort-retained-history`](../evidence/2026-10-12-pre-cohort-retained-history/README.md).
