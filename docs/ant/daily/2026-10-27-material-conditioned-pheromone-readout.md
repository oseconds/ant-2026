# 2026-10-27 — Material-conditioned pheromone readout shadow

## Question

Can exposed retained material condition the display grammar of current pheromone, without drawing material as a separate mark?

## Implemented facts

- Branched from `c18ee388aa8385ad76cefacab5ba0d215fd02b10`; fresh `origin/main` was `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Added four opt-in renderer conditions: existing alpha-96 material reference; no-material production readout; interior-masked nearest readout; and interior-masked fixed ordered-screen readout. No simulation, RNG, pheromone field/mapping, production default, or H1 law changed.
- Used the existing H1 seed `20261005`, current-G defaults, 60 Hz, native 640×640/DPR 1. First Plate occurred at 75.016666667 s. The 351-frame clip covers first Plate −5 s to +30 s. State, full-state and RNG entries match the previous H1 frame map.
- Preserved 16 milestone stills, four native lossless bounded videos, neutral synchronized review page, frame map, hashes, and manipulation measurements.

## Technical observations

- The deterministic 4 px mask stayed within canonical material support. Across 702 ant-free pheromone-layer comparisons, support-outside and zero-signal pixel changes were both zero. Views 2–4 emitted no direct material pixels.
- At +30 s, the material-active pheromone overlap included 28,881 pixels. Mean composite darkness differed from View 2 by −0.094 (View 3) and −0.392 (View 4); these pixel measurements are not perceptual judgments.
- No same-location pheromone disappearance/reappearance was observed in this window. A zero-signal location remained invisible in Views 2–4; no whole Plate silhouette appeared by itself.
- Current View 1 checkpoints are not pixel-identical to the prior package: the four-renderer prior and shared-renderer current capture differ at 8,276 / 19,774 / 22,800 / 23,020 pixels across the four milestones. H1 sampled world-state/RNG parity is exact. This is retained as raster acquisition variance, not world divergence.
- Prior artist response to smooth relief is preserved verbatim in its original evidence: “«“음 봤는데 1번보다 좀 연하다 말곤 뭐가 다른지 모르겠는데”»”. The narrow interpretation remains that the registered smooth field and directional luminance modulation did not produce a clear identity difference beyond appearing lighter than View 1; this does not reject relief generally.

## Review and decision boundary

Artist free-description review of Views 1–4 is pending. Technical measurements do not say whether any candidate feels like a persistent location state, a different signal, pixelation, or a filter. No production decision or further display grammar was selected. The neutral viewer's first prompt is free description only.

Full evidence and review files: [2026-10-27 evidence package](../evidence/2026-10-27-material-conditioned-pheromone-readout/README.md).

## Verification

- Focused renderer/readout tests: 24/24 passed.
- `npm test`: 367/367 passed.
- `npm run build`: passed with existing dependency-comment and large-chunk warnings.
- Runner syntax check and `git diff --check`: passed.
