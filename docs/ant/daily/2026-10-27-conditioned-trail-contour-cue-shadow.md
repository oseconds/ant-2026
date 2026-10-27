# 2026-10-27 — Conditioned-trail contour cue shadow

## Question

Can a faint, secondary contour cue gather the already material-conditioned trails into a place-like area, without returning to a full-outline material renderer?

## Implemented facts

- Fetched fresh `origin/main` at `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`; branched from `d057ae1acf9db3f1b44ce2a1dd51a7ed79dafdc2` as `codex/ant-conditioned-trail-contour-cue-shadow-20261027`.
- Preserved the previous artist response verbatim in the prior package's [ARTIST-REVIEW.md](../evidence/2026-10-27-material-conditioned-pheromone-readout/ARTIST-REVIEW.md).
- Added opt-in renderer-only View 2 full contour and View 3 12 px activity-gated contour around the previous View 4 conditioned-trail readout. Both use the preregistered 1 px inner support boundary, grayscale 140 / alpha 24; View 3 has 0-frame smoothing.
- Kept the H1 seed `20261005`, current-G defaults, 60 Hz, 640×640/DPR 1, no audio/DSP, and first Plate −5 s through +30 s. The clip contains 351 frames; all views render the same detached snapshots. Production defaults, simulation laws, pheromone values/mapping, and H1 recruitment remain unchanged.

## Technical observations

- First Plate: tick 4501 / 75.016666667 s; endpoint: tick 6301 / 105.016666667 s. At +15 s and endpoint the world has 2 Plates and 967 occupied material cells.
- State/RNG/event parity passed across renderer conditions. View 1 matched the previous conditioned-readout View 4 at all four milestone checkpoints (0 changed RGB pixels). Support spill, readout parity failures, mixed-equation failures, and renderer ant-raster changes were all zero.
- The local activity gate was implemented deterministically but was nearly global after birth: at least 75% boundary coverage in 301/301 post-birth frames; endpoint coverage was 4,528/4,632 (97.75%). This fails the intended selectivity of View 3. No parameter tuning followed.
- Replayed stills matched byte-for-byte (12/12). Three videos decoded to the same 351 RGB24 frames each; WebM container hashes differed. Duplicate first-attempt media was removed while preserving hash and frame-comparison receipts.
- A pre-result snapshot-scoped cache was added after a one-byte p5 readback variance at tick 4273. It reuses View 1's smooth raster for sibling views of the same detached snapshot. It does not change simulation state or candidate parameters.

## Review and decision boundary

Artist free-description review is pending. The near-full activity gate weakens the intended local-versus-global contour comparison. This is a technical finding, not an artistic answer about area gestalt, map-like reading, or naturalness. No contour tuning, production transfer, or adoption was made.

Full measurements and neutral review assets: [evidence package](../evidence/2026-10-27-conditioned-trail-contour-cue-shadow/README.md).

## Verification

- Focused renderer/readout tests: 26/26 passed.
- `npm test`: 369/369 passed.
- `npm run build`: passed with two existing `zod` comment-position warnings and the existing 1,161.66 kB app-chunk warning.
- `git diff --check`: passed; only line-ending conversion notices were printed.
