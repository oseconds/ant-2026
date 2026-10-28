# 2026-10-28 — Production G pheromone author provenance

## Question

At sensor reads, is current production G pheromone mostly a same-ant/living-ant short-lag signal, or does signal from retired authors remain present for later ants?

## Baseline and scope

- Fetched fresh `origin/main`: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; prior known main was `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Started `codex/ant-pheromone-cross-lifecycle-provenance-20261028` directly from fresh main.
- Read the canonical ANT guide, G adoption evidence, current pheromone/deposition/controller/lifecycle sources, SurfaceField, TrailPlateBirth, MaterialStratigraphy, and relevant tests.
- Added only a research observer, runner, focused test, and dated evidence. Production `src/` and the canonical ANT README remain unchanged.

## Method and result

Ran matched observer-off/on production-default worlds for seeds `20261005`, `20261006`, and `20261007`, each 600 seconds at 60 Hz with Audio Off. The observer attributed actual Float32 node increments to GasterDeposition author IDs and sampled only existing ant sensor reads. It retained signed numeric residuals and did not assign them to authors.

Observer-on/off agent state and RNG matched every tick. Pheromone, SurfaceField, Plate birth, material, and event hashes matched at 0/30/60/120/300/600 s. No cap touch or unattributed write occurred; maximum node residual ratio was `8.03e-7` against the preregistered `1e-4` gate. New runs match the adoption evidence's lifecycle, contact, first-Plate, and Plate totals.

Across 36,465,983 raw sensor samples, pooled signal was 65.04% retired-author, 34.94% alive-other, and 0.027% self. Retired signal appeared in 98.33% of positive production reads. Retired contribution mean age was 28.54 s. The pattern held across all three seeds and both local/wide sensors; retired share was also high away from recruitment origin.

## Decision boundary

**Supported:** current production G commonly carries retired-authored signal into later sensor reads. This establishes presence of a cross-lifecycle environmental bridge in these natural runs.

**Not established:** behavioral causal importance, social relationships, persistent roles, biological interpretation, or material/Plate author identity. No signal-removal counterfactual or new mechanism was run.

The first-seed output exposed only a last-bin quantile presentation overflow. The final three-seed run used a bound-clamped quantile reporter; no measured values or registered conditions changed. Full method, receipts, caveats, and reproduction command are in the [evidence package](../evidence/2026-10-28-pheromone-cross-lifecycle-provenance/README.md).
