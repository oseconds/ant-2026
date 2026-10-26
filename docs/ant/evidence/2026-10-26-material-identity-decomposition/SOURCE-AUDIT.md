# Source audit and pre-result control decisions

Fresh main is `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`. The working research parent is `bee3a6908b36e23c826e1fde00d461b426c75992`; its H1 and M1 options remain opt-in research infrastructure. No controller, field, formation, stratigraphy, physics, worklet or audio law is changed in this pass.

## Confirmed implementation

- Material uses a 96×96 binary occupied support, RGB 100 and production alpha `min(21, 9 + L*1.25)`. Research M1 is fixed alpha 96, not per-Plate additive opacity.
- Pheromone is a 316×316 scalar field with fixed nonlinear alpha mapping up to 112. Material is drawn first, pheromone second, ants last.
- The material image is scaled to canvas size. The pheromone block later sets image smoothing enabled/high and leaves that context state in place. A preserves this validated behavior; B scopes smoothing Off to only its material draw and restores the prior attributes. Global p5 `noSmooth()` is not used.
- `topLayerByCell[cell]` identifies an insertion-order `material.plates[]` index. Current exposure is distinct from presence of older descriptors in the Plate list.
- Centerline nodes are raster-index ordered, not a path sequence. The new D readout uses the descriptor's explicit graph edges and a node-index lookup. Its nearest-segment axial direction is derived geometry, not a foot-scratch or ant travel-direction record. The 8-neighbor graph can yield only four undirected local edge axes; no smoother intrinsic direction field is assumed.
- Native texture does not add physical subcell geometry. B/C/D/E share the original mask under center-sampled nearest resampling; B is deliberately allowed to look blocky.
- `totalDepthByCellMeters` omits the foundation Plate, so a single-layer cell has value zero. No terrain height interpretation is used.

## Technical changes fixed before capture

1. Preserve the matrix. Add no aesthetic condition, sixth viewing condition or temporal effect.
2. New caches include dimensions, mode, topology content and immutable descriptors because reset can reuse revision numbers and detached snapshots need value-based reuse.
3. Return p5's already-existing redraw promise from `AntRenderer.render()`; capture awaits completion. Default draw code and simulation scheduling remain unchanged.
4. Use local per-Plate deterministic shuffles anchored to the immutable full footprint. Later burial may change exposed-angle distributions, but unrelated births must not rerandomize existing visible pixels.
5. Use the fixed palette and scale stated in PLAN.md. Report realized clipping/overlap/tone effects without per-output contrast normalization or aesthetic tuning.
6. Export VP9 lossless RGB (`gbrp`, identity RGB matrix) rather than limited-range YUV conversion. PNG remains the exact milestone reference. Verify browser decoding and sampled decoded RGB bytes; do not infer media fidelity solely from the encoder's `lossless` flag.
7. Existing frame fingerprints are retained verbatim for prior-H1 comparison. Supplement them with a full detached-snapshot hash including all typed arrays and ordinary Plate mask arrays; the legacy comparison alone omits ordinary-array mask bytes.

## Inspection limits at registration

An independent Max preflight audit examined source/control semantics without seeing candidate output. Its two principal blockers (filter scoping and reset-cache collision) are addressed in implementation/tests. Acquisition metrics and Chrome media verification remain pending. No artistic result has been viewed or selected to choose these controls.
