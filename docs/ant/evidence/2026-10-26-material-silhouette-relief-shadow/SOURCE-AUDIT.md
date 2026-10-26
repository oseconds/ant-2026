# Source audit

Audit performed on the fresh `origin/main` fetch and research parent before candidate capture. Canonical ANT guide consulted: [`docs/ant/README.md`](../../README.md).

## Repository/source facts

- `origin/main` resolves to `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`; the current research parent is `01bbef5f5e7a82aaa4774ca866d14312332e9323`.
- `AntController` defaults `acceptedHeadingMode` to `production`. Its opt-in `isotropic-diagnostic` branch samples `wrapAngle(-π + 2π × headingSample)` at the same accepted-spawn heading draw site; the conditional does not add a second draw. This pass reuses that diagnostic only.
- `AntRenderer` defaults `materialPresentation` to `production`. The production material source is grayscale 100 with alpha `min(21, 9 + 1.25 × layerCount)` per occupied cell. The existing `presence-96` and `presence-96-sharp` modes are opt-in; sharp scopes nearest filtering around the material image and restores the context before pheromone rendering.
- `drawSnapshot` composites material first, then pheromone, then ant marks, over a white background. The pheromone image is smoothed at high quality. The new modes are inserted only in the material block before pheromone; they add no field/controller input.
- Current top-layer ownership is in the 96×96 `topLayerByCell`. The validated sharp raster maps each 640 output pixel center by `floor((x + 0.5) × gridWidth / 640)` and the equivalent y mapping. The new masks use that same pixel-center rule.
- Prior H1 capture records seed `20261005`, first Plate tick/time and the sampled snapshot/RNG trace. The parent identity evidence also holds the validated A/B native checkpoint PNGs. Parent artist response is now preserved verbatim in that package's `ARTIST-REVIEW.md`.

## Pre-result controls

- The white-background arithmetic for fixed values is recorded in `PLAN.md`; it tests approximate technical contrast only.
- The 2-pixel band is derived inward from the actual nearest binary support. A 3×3 Sobel gradient supplies temporary normals only. No `totalDepthByCellMeters`, height, principal path, smoothing, or off-support mask is used.
- A native nearest support follows the same 6–7 px staircase implied by the 96-grid at 640×640. No smoothing or geometry repair is allowed; the staircase remains a stated interpretive limit.
- No pheromone source or display-mapping code is changed. No new recruitment, movement, deposition, birth, stratigraphy, audio or physics path is added.

The post-implementation source hashes and source-drift check are recorded in `capture.json`; the same-state result is recorded in `manipulation.json` and `frame-map-H1.csv`.
