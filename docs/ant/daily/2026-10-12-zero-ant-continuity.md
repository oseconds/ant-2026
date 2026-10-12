# 2026-10-12 — Zero-ant retained-world continuity shadow

- **Question:** In current ANT production, can world state advance through a 60-second interval with no living ants, then expose post-gap entrants to retained material that existed before the gap?
- **Baseline:** `214c59cbc31684aa5c1f3d70dd1d21533c48ab2`
- **Branch:** `research/ant-zero-ant-continuity-20261012`

**Evidence:** [Zero-ant continuity shadow](../evidence/2026-10-12-zero-ant-continuity/README.md)

## Direction and boundary

The selected persistent-world direction is that retained material history should remain part of the environment later living ants encounter. This pass only observed the already adopted aggregate layer-count locomotion law. It added no production state or feedback and did not change lifecycle, movement, recruitment, material formation, material semantics, or audio.

## Baseline and method

- Confirmed `research/ant-pre-cohort-retained-history-20261012` commit `214c59cbc31684aa5c1f3fd70dd1d21533c48ab2` was the direct child of remote main `e5e4c52db22512f53d32014f54232f6ff7e3d4cf`; fast-forwarded it to main, pushed, then created this research branch.
- Reused the natural baseline: seeds `20261005`, `20261006`, `20261007`; 60 Hz; 600 s; default-On material law; counted LCG; no audio bridge. A fresh replay exactly matched the committed 2026-10-12 natural replay output, including full own-state hashes.
- At the 400 s boundary, the harness flushed pending gaster doses through the existing retirement path, removed every live ant and per-ant gait/body-pose/deposition state, and suppressed spawn by setting the research-only schedule to `Infinity`.
- Advanced the unchanged production `AntController.tick(1/60)` for 3,600 ticks. At 460 s the harness restored normal scheduling at the current controller clock. New ants used new IDs and objects.
- During every gap tick, asserted zero agents, no spawn or spawn call, no movement, no pheromone deposition, no FOOT_CONTACT or other ant-origin/unclassified event, no per-ant state, and unchanged RNG state/call count. Clock advance was 60,000.00000007 ms due floating-point accumulation over exactly 3,600 ticks.
- At each post-gap tick entry before movement, read public `layerCountByCell` for actual `L` and the public bottom-to-top column for `G`, layers born strictly before 400 s. Recorded actual `m(L)` and arithmetic-only `m(L-G)` / `deltaGap`.

## Result

**SHADOW ZERO-ANT CONTINUITY SUPPORTED.** All three seeds held the 60-second zero-ant interval. Pheromone decayed and SurfaceField relaxed; TrailPlateBirth and MaterialStratigraphy clocks advanced, gap-born Plates/nodules appeared, retained pre-gap Plate descriptors and per-cell old-layer placement persisted, and colony activation evolved. Post-gap entrants reappeared at 460.017 s in each seed.

Across 443,027 post-gap active ant-ticks, 362,237 (81.76%) were spent on columns containing pre-gap layers. 404 of 409 post-gap spawned ants encountered such a column. Both top-pre-gap and buried-only encounters appeared in every seed. The actual production multiplier during these encounters averaged 0.9293; the arithmetic `deltaGap` diagnostic averaged 0.0565 and was positive for all recorded pre-gap exposure ticks.

This describes a shadow interval only. It does not show that production lifecycle naturally reaches zero ants, that the production controller is agent-independent in every path, or that audio/vibration continuity was tested. No second duration or production fix was attempted.

Focused tests passed (2/2), full `npm test` passed (306/306), and `npm run build` passed with dependency annotation / large-chunk warnings. Fresh independent review found no blocking issue and reconciled raw per-ant, episode, time-series and aggregate records; it did not rerun tests or build. The result is not inferred from test passage; the judgment follows the three-seed process and exposure distributions in the evidence package.
