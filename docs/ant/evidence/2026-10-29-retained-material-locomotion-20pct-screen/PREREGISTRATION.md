# Retained-material locomotion 20% screen — pre-run scope

**Question.** Does changing only maximum retained-material slowdown from 10% to 20% create a more readable material→movement→world consequence, or does it mainly increase residence/entry lock-in or distort traffic?

## Frozen authority and comparison

- Production authority: `origin/main` = `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `afea7ecc076734a6c9fe8b3ccad7efb11c08c36a` on `codex/ant-late-qualified-opportunity-capture-20261029`.
- New branch: `codex/ant-retained-material-locomotion-20pct-screen-20261029`.
- Control: current production `m(L) = 1 - 0.10 * (1 - exp(-L / 4))`.
- Candidate: isolated research shadow `m20(L) = 1 - 0.20 * (1 - exp(-L / 4))`.
- Both arms: current-G, seed `20261005`, 60 Hz, Audio Off, 600 simulated seconds, same initial state and counted deterministic RNG implementation.
- Only one candidate amplitude is tested. No extra seed, scale change, or sweep.

The frozen 10% current-G run will be reused as the control authority. A read-only replay of that arm must exactly reproduce its saved agent-position stream, contact buckets, birth receipts, 600 one-second summaries, 30/60/120/300/600 second checkpoints, checkpoint maps, final RNG state and calls before the treatment can be interpreted. The control replay also checks that the added observers do not alter production behavior.

## Candidate isolation

The shadow controller is generated from the current `origin/main` controller in a temporary research file. A source assertion requires the only production-code difference to be the literal `0.10` → `0.20` in `materialLocomotionMultiplier`. It is removed after the run. No production source, default, steering, field, gait, contact, Plate, stratigraphy, pheromone, or audio code is changed.

The existing tick-entry public `layerCountByCell` remains the only material input. The same `/4` layer response, exact `L=0 → 1`, monotonic bounded form and once-only multiplication of final `desiredSpeed` remain. Heading and steering stay untouched by the changed expression.

## Measurements fixed before treatment

- All-tick movement and exposure: 60 Hz ant-ticks grouped by current layer count; pre/post velocity magnitude, final target speed, realized clipped travel, exposed travel, zero-displacement ant-ticks, exposure fraction and continuous center-on-material episodes.
- World history: current runner’s per-second population, travel, contact and Plate series; contact positions accumulated on the existing 24×24 comparison grid in 0–200, 200–400 and 400–600 second windows; saved pheromone, SurfaceField and occupancy maps at the existing 30/60/120/300/600 second checkpoints; Plate/layer summaries and births.
- Qualified opportunity context: the same 40 actual one-second anchors and existing 96×96 production analysis from the late opportunity evidence. Recompute `B`, `C`, `D`, production `E`, production-thinned `F`, edge-bearing `S`, pre-existing layer counts and strict-prior Plate IDs. Use current `D = sampleSupport(..., 0.025)`, 8-neighbor peak semantics and the existing descriptive `.15` D-center spacing. Record D winner location/entry distance, separated top strengths, material status and recent-contact context. This is observer-only; no allocation, X capture or feedback is enacted.
- Preserve each measurement separately; no composite score and no new pass/fail threshold.

The two 20-anchor late windows are analyzed independently; no trajectory continuity claim is made across the unobserved 300–600 second interval. No early subset will be chosen after seeing treatment results.

## Stop and decision rule

If control replay parity fails, stop as `INCONCLUSIVE / PROVENANCE FAILURE`; do not repair, resynchronize, or reinterpret the run. Otherwise conclude `PROMISING`, `MIXED`, `NEGATIVE`, or `INCONCLUSIVE` from the observed movement, contact, world, material and opportunity changes. These labels do not imply adoption. No production law, max-D/X implementation, UPDATE, maturation, BODY, audio, or long-horizon extension is authorized by this screen.
