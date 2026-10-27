# Source audit — conditioned-trail contour cue shadow

Audited fetched `origin/main` `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`, research parent `d057ae1acf9db3f1b44ce2a1dd51a7ed79dafdc2`, the current renderer/helper, prior capture runner, and conditioned-readout evidence before capture. Current ANT implementation guide: [`docs/ant/README.md`](../../README.md).

## Verified source facts

- Production `AntRenderer` defaults to `materialPresentation: 'production'` and `pheromoneReadout: 'production'`; production draws the material before the pheromone image and ants afterward.
- The prior research renderer's `material-screened` path draws the same 316×316 mapped black pheromone source with production smoothing, samples the native baseline, mixes a fixed Bayer alternate only under the cached 4 px interior material mask, writes the composite once, then draws ants. The source mapping remains capped at alpha 112.
- The shared mask derives 640×640 support from exposed `topLayerByCell`, marks an 8-neighbor inner boundary, and assigns zero blend weight to boundary and outside pixels. The support and mask are deterministic and renderer-only.
- H1 is the prior opt-in accepted-heading diagnostic. This pass changes neither H1 recruitment nor any simulation subsystem.

## Pre-result ruling

1. A full cue is exactly the existing binary mask's 8-neighbor boundary pixels, all inside canonical support. It uses RGB 140 / alpha 24, 1 native pixel, always on when support exists.
2. A local cue uses the same boundary pixels. Active conditioned pheromone means `baselineAlpha > 0 && effectiveWeight > 0` at the current native pixel. Each boundary pixel is enabled only when the nearest active pixel's Euclidean distance is at most 12 px.
3. Local temporal smoothing is 0 frames. This avoids introducing renderer history; a fragment may change immediately when current activity changes.
4. Contour color is composited against the existing white background before reapplying the same native black pheromone alpha. This keeps the cue beneath pheromone and before ant drawing. The effect is confined to contour-mask pixels, which are a subset of canonical support.
5. The 1 px cue follows the canonical raster staircase. The source audit found no existing smooth boundary cue that would preserve the registered support exactly; vector smoothing or out-of-support antialiasing would change geometry and is excluded. The raster-following form is intentionally retained as a diagnostic risk, with no aesthetic tuning.

## Pre-result acquisition amendment

An initial capture attempt stopped before media output. At tick 4273, Views 1 and 2 received the same empty-support detached snapshot and mapped source, but sequential p5 readback yielded baseline alpha 0 versus 1 at native pixel 4215. The hidden-material placeholder and all registered values were the same. The runner added a hard parity check and stopped on this one-byte raster variance. To preserve the View 1 ↔ View 2 single-cue contrast, subsequent views of the identical snapshot now restore the first view's cached smooth baseline pixels before applying the same Bayer readout. The cache is renderer-only, keyed to snapshot object identity, and refreshes when the snapshot changes. No candidate PNG/video was retained from the failed attempt, and no visual output was inspected before the amendment.

The previous View 4 pixel-level and media checkpoint comparisons will be repeated. The prior package reports a shared-renderer View 1 difference from its older four-renderer acquisition; world/state parity remains the comparison basis, and any raster mismatch is recorded separately.
