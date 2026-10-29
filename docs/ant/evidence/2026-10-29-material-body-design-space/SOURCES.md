# BODY source / evidence register

Authority: fresh main `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`. Research parent: `2c5b0be686bec5eab854b33cd3a473bea2cf908e`. This pass consumes fixed COMMIT scopes; no branch was merged or scope selector rerun.

## Source-level responsibilities

- [Canonical ANT guide](../../README.md): current implementation; [world-model](../../world-model.md) remains future design context.
- [TrailPlateBirth](../../../../src/lib/agents/ant/TrailPlateBirth.js): descriptor/radii/material 263–328; selected-network width/material averaging 393–429; disc rasterization 559 onward. Widths derive from supported-corridor distance, while character means use that corridor, not final ribbon-only values.
- [MaterialStratigraphy](../../../../src/lib/agents/ant/MaterialStratigraphy.js): immutable append 39–60; columns/exposure/burial 179–195 and 347–405; Nodule material/radius/foundation context 263–317; whole-layer thickness fallback 427–431. `totalDepthByCellMeters` excludes the foundation thickness.
- [Compiler](../../../../src/lib/audio/compileSurfaceTopology.js): footprint validation/projection/coefficients 135–191; source columns and overlap-count Z links 234–321; foundation coupling 383 onward. Plate thickness is not a compiler input.
- [SurfaceAudioBridge](../../../../src/lib/audio/SurfaceAudioBridge.js): individual foot response and exposed routing 169–246.
- [Worklet](../../../../static/worklets/surface-plate.worklet.js): density/bending recurrence 622 onward, strike scaling 911–947, compatible topology state preservation 135–194. No new local material/height field.
- [AntRenderer](../../../../src/lib/renderers/AntRenderer.js): material image 217–239. Standard material view reads top presence/count, not thickness or material tuple. Atlas images are diagnostic replacements for comparison, not changes to this renderer.
- [AntController](../../../../src/lib/agents/ant/AntController.js): existing event/append/locomotion consumers unchanged; no new body tool feeds back to it.

## Exact reused artifacts

Pinned prior body exploration: `05012e1b02acb565b9e7f6c2c9076b48be337f39`.

- [atlas.json](../2026-10-28-plate-body-generation-exploration/data/atlas.json) and [results.json](../2026-10-28-plate-body-generation-exploration/data/results.json): reused P/K/Q/U/W/S masks checked against saved per-mask digests. Exact working byte hashes are in [new frozen input](data/frozen-body-inputs.json.gz).
- [Body report](../2026-10-28-plate-body-generation-exploration/REPORT.md), [technical scope](../2026-10-28-plate-body-generation-exploration/TECHNICAL-SCOPE.md), [technical results](../2026-10-28-plate-body-generation-exploration/data/technical.json): prior W/U representation comparisons and compiler/stack evidence. They are not relabeled new measurements.
- Reused geometry helper [runner](../../../../scripts/ant-body-generation-exploration.js): `components`, `distances`, `sleeve` only. The new runner imports these pure helpers; it does not call the previous generator or renderer.

## Earlier research context

- [Architecture synthesis](../2026-10-29-plate-material-architecture-synthesis/REPORT.md), [scope report](../2026-10-29-materialization-scope-exploration/REPORT.md) and their daily records: scope contract is now fixed by the user. This pass does not re-open the former questions.
- [C0](https://github.com/oseconds/ant-2026/blob/6e9ab09b6c3ddf286b23b61fc58081e50f76ece0/docs/ant/evidence/2026-10-28-closure-slice-crystallization-support/REPORT.md), [C1](../2026-10-28-space-time-attachment-support/REPORT.md): broad-field membership and attachment were insufficient WHERE selectivity. They do not prohibit a bounded body constructor around the fixed scope; no whole E component becomes the new body here.
- [Ownership](https://github.com/oseconds/ant-2026/blob/d27034306019f2a348e49a6723332fc10b10cc9c/docs/ant/evidence/2026-10-28-plate-local-history-ownership/REPORT.md), [event-state](https://github.com/oseconds/ant-2026/blob/12473f9ec8c7057ea033d9f72fa68c236c60bb50/docs/ant/evidence/2026-10-28-materialization-event-state/GATE-REPORT.md): provenance and retained temporal policy, not body material-mass truth.
- [Formation ledger](https://github.com/oseconds/ant-2026/blob/fd2a42875cc93eedeb319eae14b0e8de21e429d7/docs/ant/evidence/2026-10-27-g-formation-information-ledger/README.md), [formation gate](https://github.com/oseconds/ant-2026/blob/0d5096a920e1ebb2086fa1dae782c5d4e871b590/docs/ant/evidence/2026-10-28-plate-formation-gate/GATE-REPORT.md): actual selected scaffold/omission distinctions. No attempt to restore omitted alternatives.
- [Traffic](../2026-10-29-traffic-direction-signal-audit/REPORT.md), [gait/contact](../2026-10-29-gait-contact-signal-audit/REPORT.md), [stratigraphy](../2026-10-29-stratigraphy-signal-audit/REPORT.md): additional history/context is not a demonstrated BODY responsibility. Their original limitations, including the stratigraphy replay's pheromone source-version caveat, remain; no such field sample is newly used to generate X/H.
- [Current-G adoption](../2026-10-25-g-production-adoption/README.md), [saved 600 s context](../2026-10-25-g-production-candidate-review/README.md): no new sweep. P3 is suggested only as the first actual multi-layer-substrate contrast, not executed in this pass.

Relevant chronology: [scope daily](../../daily/2026-10-29-materialization-scope-exploration.md), [architecture daily](../../daily/2026-10-29-plate-material-architecture-synthesis.md), [body daily](../../daily/2026-10-28-plate-body-generation-exploration.md), and [this pass](../../daily/2026-10-29-material-body-design-space.md). No archive search/load; no external-model design idea is evidence.
