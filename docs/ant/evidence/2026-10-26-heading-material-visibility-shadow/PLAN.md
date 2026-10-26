# Heading × material visibility shadow — preregistered plan

## Question

Does the current production fixed-north accepted-heading law create route bundling that makes retained material harder to distinguish, even when material presence is shown by a strong fixed-alpha diagnostic?

Isotropic heading is only a temporary deconfounded control. This pass does not select a production heading.

## Baselines and provenance

- Freshly fetched `origin/main` is `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`, equal to the known current-G production baseline.
- This research branch starts from prior material-shadow commit `8fc9041dd1fdb9979a23616db175df9a34be978d`, whose parent is the same `origin/main` baseline.
- The prior artist response that A/B/C were not readily distinguishable is preserved verbatim in [the prior evidence package](../2026-10-26-material-rediscovery-shadow/ARTIST-REVIEW.md).
- The 2026-10-22 survey's isotropic accepted-heading transform and source audit are referenced at [survey REPORT.md, commit `046b21c`](https://github.com/oseconds/ant-2026/blob/046b21cb083ec167352afdeed206466af8eeba04/docs/ant/evidence/2026-10-22-recruitment-founder-survey/REPORT.md) and its source audit. That work predates current G and is control-method provenance only; none of its natural-world outcomes are carried forward as current-G results.

## Fixed 2×2 conditions

| Heading | Material | Renderer/Controller rule |
| --- | --- | --- |
| H0 — Production | M0 — Production | Production accepted heading and production material mapping. |
| H0 — Production | M1 — Strong material | Production accepted heading; occupied material cells use RGB `(100,100,100)` with fixed alpha 96. |
| H1 — Isotropic diagnostic | M0 — Production | Isotropic accepted heading; production material mapping. |
| H1 — Isotropic diagnostic | M1 — Strong material | Isotropic accepted heading; occupied material cells use RGB `(100,100,100)` with fixed alpha 96. |

For H1, each accepted-spawn heading consumes the same one uniform variate U at the production heading-draw location and maps it with `wrap(−π + 2πU)`, including the initial ant. Position, clearance retries, cadence, activation, personality/lifecycle draws and all later behavior laws remain unchanged. H0 remains the default.

M1 ignores layer count and adds no texture, contour, hue or edge treatment. Material remains beneath the current production pheromone layer.

## Method

- Run two independent natural worlds, one per heading condition, each with seed `20261005`, current-G production defaults and 60 Hz model steps.
- Each world gets its own production-material and strong-material renderer. Both render the exact same detached snapshot at each sample; the two heading worlds are not claimed to be same-state.
- Detect the first natural Plate and stop exactly 30 model seconds after its birth. Preserve full native 640×640 video from initialization through endpoint, and capture exact pre-birth, post-birth, +15 s and +30 s stills.
- Compare H0's frame-state hashes, milestones, RNG/events and production-A milestone PNGs with the previous material-shadow capture. Record H1 as a matched-seed intervention and identify the first observed state/RNG divergence rather than implying cross-heading parity.
- Count accepted headings without additional random draws. Record their bins and circular resultant as a manipulation check, not a population-level statistical claim.
- Record each world's milestone time/tick, RNG, Plate count, occupied material-cell count and descriptive pheromone distribution (positive-cell count, maximum, mean, quantiles, native node sum and reconstructed integral).
- The review page aligns video seek to time relative to each world's first Plate, so different birth times do not obscure milestone comparison.

## Technical checks

1. H0 uses the unchanged production heading expression by default. A controller test checks identical initial position, other-spawn RNG calls, personality and schedule between modes, with only the accepted heading changed.
2. H1 applies the prior survey's exact isotropic transform to the same accepted-heading draw, with no observer or new RNG draw.
3. A/M0 is production renderer output. H0/M0 should match prior production-A milestone pixels and state hashes.
4. Within H0 and within H1, M0/M1 have identical source state/RNG/agents/pheromone/material topology before and after rendering.
5. M1 keeps RGB 100, fixed alpha 96 on occupied material cells, zero alpha outside the mask, and existing draw order. Pairwise pixel changes must remain in material-mask interpolation support.
6. Current G field, material law, renderer ant path, movement, spawning position/cadence/activation, physics and audio source are unchanged except the diagnostic accepted-heading selector and M1 renderer option.
7. Run focused controller/renderer/stratigraphy tests, full `npm test`, and `npm run build`.

Technical measurements describe these captures only. Human review, heading preference and production adoption remain outside this pass.
