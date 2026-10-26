# Source audit — heading × material visibility shadow

## Baseline

- `git fetch origin main` completed before the branch was created.
- `origin/main` was `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`, matching the declared current-G production baseline.
- The research branch starts at `8fc9041dd1fdb9979a23616db175df9a34be978d`, whose parent is that main baseline. This reuses only the validated material-shadow diagnostic infrastructure.

## Changed implementation surfaces

Only `AntController.js` and `AntRenderer.js` add opt-in diagnostic behavior:

- `AntController` defaults to `acceptedHeadingMode: 'production'`. After a spawn position passes the existing clearance checks, both modes consume one uniform draw at the existing heading-draw point. Production computes the same `−π/2 + (2U−1)×0.3`; isotropic diagnostic computes `wrap(−π+2πU)`. The initial ant uses the same accepted-heading path. Position, retries, ant construction/personality, lifecycle and spawn scheduling code are unchanged.
- `AntRenderer` adds `materialPresentation: 'presence-96'`. It selects alpha 96 only for occupied material cells and skips layer-count variation for that mode. RGB remains 100 per channel. The existing material image, cache and draw call remain beneath the pheromone image; pheromone alpha mapping and image interpolation code are unchanged.

The controller test checks equal first position, personality, spawn schedule and RNG-call count for both heading modes, and checks their different headings from the same `U`. The renderer test checks fixed RGB/alpha on the material mask and zero alpha outside it. Capture also checks H0/M0 against the prior stream.

## Preserved source paths

There is no diff to `AntAgent.js`, `BodyPoseController.js`, `ColonyActivation.js`, `GaitController.js`, `GasterDeposition.js`, `MaterialStratigraphy.js`, `PheromoneField.js`, `SurfaceField.js`, or `TrailPlateBirth.js`. No audio or physics implementation is changed. Their start/live SHA-256 values are included in `capture.json`.

Tests and runner are diagnostic validation/capture support. The production defaults remain H0/M0. No production heading or material value is adopted by this pass.
