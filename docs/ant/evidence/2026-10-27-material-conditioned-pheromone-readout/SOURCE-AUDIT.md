# Source audit — material-conditioned pheromone readout

Audited fresh `origin/main` `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292` and research parent `c18ee388aa8385ad76cefacab5ba0d215fd02b10` before rendering candidates. Current implementation guide: [`docs/ant/README.md`](../../README.md).

## Verified current renderer facts

- Production renderer default remains unchanged. Material image is drawn before pheromone; ants draw afterward.
- `updateFieldImage()` reads the unchanged `snapshot.pheromone.values`, creates black RGB with alpha from the exported `pheromoneValueToAlpha()`, and scales that native image to the canvas with smoothing enabled and quality `high`.
- `pheromoneValueToAlpha()` is fixed two-scale mapping capped at 112. No field normalization occurs in the mapping.
- Material exposed support is `topLayerByCell` in a 96×96 `MaterialStratigraphy` snapshot. Renderer can read support independently of material drawing; it does not need depth or Plate identity.
- H1 accepted heading is an existing opt-in research diagnostic from the parent branch. It remains untouched. Production heading remains the controller default.
- p5 Image exposes its source canvas; `p.createGraphics()` provides an offscreen browser Canvas2D surface for the nearest-sampled alternate without changing simulation state. The smooth baseline stays on the production final-canvas draw path.

## Pre-result ruling

- Use a hidden renderer-only mask derived from the native canonical exposed support. Boundary pixels are support pixels with an outside 8-neighbor; exact Euclidean distance from this boundary is mapped through fixed `smoothstep(0,4 px, distance)`. Outside support is exactly zero.
- Views 2–4 suppress all material drawing, including fallback Plate masks. The same snapshot still supplies support to the private mask builder.
- Draw the same mapped source to the final white canvas with production smoothing in Views 2–4. For Views 3/4, read back the displayed native grayscale as baseline darkness. This lets the alternate sampling blend use precisely the same baseline that View 2 displays.
- For zero-readout invariance, effective blend weight is zero wherever production-rendered baseline darkness is zero. This prevents nearest resampling from inventing visible activity in a zero-readout pixel; it is registered in `PLAN.md`.
- View 4 screens the production-rendered native baseline using the fixed standard Bayer 4×4 matrix, threshold `(bayer + 0.5)/16`, alpha 112, and 2×2 replication. The alpha-zero gate is explicit. No phase, random stream, or frame clock enters the screen.
- Mix black-signal darkness once per native pixel and replace only weighted pixels inside support on the current canvas. White background plus black pheromone makes this equivalent to mixing alpha. Unweighted/outside pixels retain their original canvas bytes; ants draw afterward.

## Pre-capture amendment

Before the valid final capture, the initial offscreen-baseline compositor produced 8,740 changed composite pixels outside canonical support, summed across four milestone comparisons. The corrected compositor draws the production baseline once and replaces only weighted pixels inside support. Separate p5 canvases differed at 8,276 RGB pixels between empty-support View 1 and View 2. Sharing one canvas without a material draw slot also changed 4,568 pheromone pixels outside empty support. The registered acquisition uses one renderer/canvas for all views; Views 2–4 keep material hidden and draw an RGB 100/alpha 0 native 96×96 placeholder in the material slot. It is generated independently of topology and has no visible material pixels. This reproduces the same p5 draw path without exposing material. The runner checks placeholder transparency, full-pixel V1/V2 equality with empty support, full-frame support locality and zero-signal invariance. Previous View 1 +15 s and +30 s PNGs differed at 22,800 and 23,020 RGB pixels (max channel deltas 86 and 91), on ant strokes only; pre/post were byte-identical and H1 state/RNG matched. The runner compares prior V1 pixels outside a same-snapshot ant-only mask and requires exact pre/post PNG bytes. View 4 uses production-rendered baseline alpha. No candidate parameter changes.

The first capture using this layout found 234 changed pixels at tick 4201, although support and blend weights were both zero. The next capture found 4,330 changed pixels in the full composite at tick 4315, also with empty material support. Those capture attempts stopped before a valid result. The diagnostic renderer now sends View 2 through a `material-control` path: it samples the same production readout, reads it back, and writes the identical opaque pixels once. Views 3/4 use the same read/write stage before ants draw. This acquisition-only parity adjustment changes no field values, source mapping, material visibility, or View 2 RGB/alpha output. The final runner separately validates support locality on ant-free pheromone layers and records any full-composite raster differences.

A later attempt stopped at View 1's pre-Plate comparison: 4,568 RGB pixels differed from the prior package outside the current ant-only mask. The prior evidence used four p5 instances; this matrix uses one shared instance. The capture now records checkpoint raster deltas separately, while requiring all 351 sampled world-state, full-state, and RNG entries to match the prior frame map. Pixel mismatch is reported as renderer acquisition variance, not world divergence or candidate support.
