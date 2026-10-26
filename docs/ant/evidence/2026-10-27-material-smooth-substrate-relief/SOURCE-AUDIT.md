# Source audit

Performed on fresh `origin/main` and research parent `75412739a6ea12e858ec2cf739f0a93279d4ada6` before candidate capture. Canonical source guide: [`docs/ant/README.md`](../../README.md).

## Current source facts

- Fresh `origin/main` resolves to `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`; the worktree's tracked files were clean at the previous pushed research commit. Existing unrelated untracked files were preserved.
- `AntController` defaults to production accepted heading. Its existing opt-in `isotropic-diagnostic` samples the accepted heading at the existing RNG draw site; it is reused without changing spawn, cadence or recruitment source.
- `AntRenderer` defaults to `materialPresentation: 'production'`. The renderer composites material, then smoothed pheromone, then ants over white. `presence-96` is the prior opt-in strong soft reference. Existing material shader controls are inserted only before pheromone drawing.
- Exposed binary support is represented by `stratigraphy.topLayerByCell` on a 96×96 grid. `totalDepthByCellMeters` is physical stratigraphy state and is excluded from this visual field.
- The immediately prior boundary experiment derived a nearest native support and explicit interior band; the artist's boundary/outline interpretation is specific to that tested geometry and is not evidence that relief generally fails.
- No standard distance-transform/low-pass material renderer exists. Reusing the `presence-96` bitmap interpolation alone would repeat its broad interpolation path and would not test the requested continuous substrate field.

## Registered implementation ruling

- Derive a capped native Euclidean signed-distance field from the canonical binary support; low-pass that field at fixed `σ=3 px`, `R=9 px`; derive soft coverage from `−4…+4 px`.
- Derive directional modulation only from the same field's central-difference gradient with fixed down-right light. No perimeter/band extraction, physical depth, path, random source, global normalization, pheromone operation or renderer-to-simulation feedback.
- The 24 px distance cap plus 9 px filter and 1 px central-difference stencil bounds how a topology edit can affect old pixels. A conservative 43 px mask-change locality audit is preregistered.
- A local cache is keyed by material revision, canonical support content, renderer dimensions and field parameters. Renderer state must not leak into simulation RNG or snapshots.

Pre-result parameters and validation thresholds are in [`PLAN.md`](PLAN.md). Candidate output has not been artist-reviewed at this audit stage.
