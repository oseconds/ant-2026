# Material persistence and turnover contract (proposal)

**Status:** source audit and future-contract proposal only. No production or research implementation is changed here. This is not an adopted material law, active/fossil split, or claim that physical erosion is already supported.

**Current artist priority, clarified 2026-10-23:** “Live pheromone·경로 변화 우선.” Consequently renewed material blank space is not a prerequisite for the present live-route candidate assessment. The contracts below identify separate future decisions, not an instruction to implement erosion or history reduction now. A saturated/capped history still limits what later routes can record, and must be reported independently of readable live change.

## Question and current evidence boundary

The current implementation retains immutable Plate descriptors and their per-cell insertion-order columns. `TrailPlateBirth` has a 256 birth ceiling explicitly described as a reporting/storage safety ceiling, not an eviction rule. `MaterialStratigraphy` rejects additions after its configured maximum and has no remove/decay path. This is append-only material history, not age-based persistence.

The 7,200 s single-seed comparison found monotone union coverage: production reached 77.34% and its 256-Plate ceiling; the `dtFeedback` research condition reached 99.20% without reaching that ceiling. At 7,200 s the prior interval added zero production union cells and 212 `dtFeedback` union cells, even as exposed top identities changed in 4,887 and 8,612 cells respectively. Top-identity changes are not removal, and neither case reopened blank cells. The longer run is one descriptive seed per condition, not a population estimate. See the [long-run analysis at 9fcd962](../2026-10-22-spatial-dynamics/analysis/long-run-final/README.md).

The possible requirement motivating this audit is renewed blank space or material turnover. No current evidence establishes a natural renewal process. In particular, a finite birth cap, changing exposed identity, age, or a display fade cannot be used as evidence that stored occupancy has been removed.

## Current consumer map and retirement consequences

| Consumer / state | Current dependency | If a Plate identity is retired |
| --- | --- | --- |
| `MaterialStratigraphy` stacks and maps | `plates` is insertion-indexed; `columns[cell]` stores plate indices; `topLayerByCell`, `layerOrder`, per-Plate history, depth and exposed/buried counts derive from those identities | Removing or compacting array entries invalidates column indices and layer order unless all references are rewritten. Removing a layer changes actual count and depth at every covered cell. |
| Nodule qualification and provenance | New nodules record `sourcePlateIDs`, a foundation ID, buried depth/count, and an acoustic coupling target | A retired foundation/source needs a declared stable resolution. Deleting it can leave a historical nodule pointing to a missing Plate. |
| `AntController` locomotion | Reads the tick-entry `stratigraphy.layerCountByCell` at the current ant cell; it does not query buried identities | The count may change only if the represented physical stack changes. Replacing individual layers with one aggregate without retaining equivalent count changes the input to the existing law. |
| `AntRenderer` | Material image and exposure diagnostics read the layer-count/top arrays; geometry/ID overlays read Plate descriptors and IDs | A readout-only fade can change appearance while the world and count remain occupied. Retired identities disappear from debug geometry unless archival rendering is separately specified. |
| Audio topology compiler / bridge | Compiles layer columns, top indices, per-Plate routes and stable IDs; nodule coupling resolves a foundation Plate ID | Removing a Plate changes audio topology and can orphan coupling/provenance. Keeping only a composite requires an explicit mapping for old IDs and changes the acoustic representation. |
| Evidence and replay | Birth IDs, immutable descriptors, source hashes, and archived snapshots define reproducible histories | Destructive deletion erases attribution and makes older material/audio snapshots harder to replay or compare. |

Relevant source: [`TrailPlateBirth.js`](../../../../src/lib/agents/ant/TrailPlateBirth.js), [`MaterialStratigraphy.js`](../../../../src/lib/agents/ant/MaterialStratigraphy.js), [`AntController.js`](../../../../src/lib/agents/ant/AntController.js), [`AntRenderer.js`](../../../../src/lib/renderers/AntRenderer.js), [`compileSurfaceTopology.js`](../../../../src/lib/audio/compileSurfaceTopology.js), and [`SurfaceAudioBridge.js`](../../../../src/lib/audio/SurfaceAudioBridge.js). This map concerns current code paths; it does not say every optional renderer diagnostic is a production-facing user promise.

## Invariants any future contract must state

1. **Separate lifetimes.** State separately when (a) an individual Plate identity/provenance record remains queryable, (b) its physical contribution remains active in a cell stack, (c) local layer count/depth includes it, (d) locomotion samples it, (e) visual readouts show it, and (f) audio topology compiles it. A single word such as “persistent” cannot define all six.
2. **Depth is structural.** Burial depth and buried-layer count continue to come from later overlapping material in the current stack. Age alone never creates burial, changes depth, or justifies retirement.
3. **Keep the adopted locomotion expression exact unless a separately authorized causal pass changes it:** `m(L) = 1 - 0.10 * (1 - exp(-L / 4))`. `L` is the tick-entry public local column count including top and underlying represented layers. It is applied once to final `desiredSpeed`; no direct heading/steering effect is introduced. `L = 0` remains exactly 1 and the asymptotic maximum slowdown remains 10%.
4. **A count change has semantic meaning.** If erosion or another physical process removes active layers, recompute `L` from the remaining active stack and let the existing law respond next tick. Do not preserve a stale historical count merely to retain old slowdown. Conversely, an archival record or visual opacity change alone must not decrement `L`.
5. **Identity and aggregate mappings are explicit.** Every retained or retired ID referenced by nodules, audio topology, renderer diagnostics, snapshots, and evidence must either resolve to a live active entity, a declared composite, or an archival tombstone. No silent ID reuse or dangling foreign keys.
6. **Caps bound memory, not history semantics.** The current 256 Plate / 32 Nodule ceilings are technical limits. A future mechanism must declare its growth bounds, retained metadata size, active geometry size, and behavior at capacity. Hitting a limit must not silently mean physical erosion.

The present law is an authored local-history condition, not a measured friction relation and not a sensor for individual buried-Plate identities. `L` must continue to represent the stack that the simulation says is currently present, not plate age or the number of historical birth events outside that stack.

## Strong alternatives to a new physical turnover mechanism

| Alternative | What it can answer | What it cannot establish / cost |
| --- | --- | --- |
| Top-surface or readout-only renewal | A composition may look less saturated through a top-surface mask, exposure window, or view that emphasizes recent material. It can test whether the presentation is the actual unmet need. | It does not reopen physical blank cells, alter stored occupancy, change `L`, or change audio topology. Label it as a readout. Lowest implementation and provenance cost. |
| Aggregate old material | Could bound active solver/render cost or preserve a coarse accumulated substrate while reducing per-Plate active objects. | A single aggregate per cell is not equivalent to the existing layer count, depth, top identity, source/foundation provenance, or per-Plate audio. Retaining multiplicity preserves `L` but does not reopen blank space and still needs storage for the count/aggregate. It changes material and sonic individuality. |
| Physical erosion / removal | Could make occupied cells available again if active coverage actually decreases. | This adds a new physical cause and changes exposed/buried topology, `L`, locomotion, nodule foundations and audio. It needs a defined dose/threshold/time law, finite bounds, and durable provenance. No current evidence selects a mechanism or its sign/scale. Highest semantic and validation cost. |

These are competing answers to different requirements. A visual renewal need does not by itself authorize physical erosion; a runtime-memory need does not demonstrate renewed spatial capacity. No active/fossil naming scheme resolves those distinctions by itself.

## Smallest falsifiable future contract to consider

If the requirement is specifically **physical re-opening of occupied material cells**, consider one narrow experimental contract before production changes:

- Active material is the only material counted in current column count, depth, direct contact support, and solver topology.
- An active layer may leave the active stack only after a declared, local, measurable physical exposure/wear dose crosses a bounded threshold. Plate age alone, birth-cap pressure, renderer state, or audio-object limits cannot trigger removal.
- Retirement preserves an immutable identity/provenance record and explicit successor/composite relation where active material is consolidated. Historical records do not contribute to `L`, depth, direct contact, or solver topology after retirement.
- The current `m(L)` equation remains byte-for-byte semantically the same; only a physically changed active column changes its input `L`. Tick-entry sampling and next-tick effect timing remain the same.
- The first probe is a synthetic, read-only stack test with fixed masks and known contact/exposure doses: no dose means no retirement at any age; threshold crossing retires exactly the specified active coverage; all remaining `L`, top identity, depth, nodule references and compiled audio IDs resolve consistently. Then compare the same initial natural state with turnover disabled/enabled only if the synthetic mapping is exact and an explicit pass authorizes the new causal link.

This is a candidate contract, not a claim that “wear dose” is the right cause. The natural variable, calibration, spatial propagation, material conservation, and acceptable amount of blank-space recovery remain open. If no defensible dose is available, the correct result is that this contract is not yet implementable; do not substitute age or a desired image threshold.

## Cost and evidence limits

Current configured upper bound is 256 Plate descriptors over a 96×96 grid. At the all-cells-overlap ceiling, descriptor masks can each store up to 2,359,296 Plate/cell membership values in total, and the per-cell column stacks can store the same number of layer indices; actual JavaScript heap cost is engine-dependent because descriptors, arrays, maps and derived topology have object overhead. The audio compiler also materializes flattened layer indices and per-Plate solver routes. Column lists grow with overlap count, while `layerCountByCell` itself is fixed at 9,216 16-bit values. The two-hour evidence shows why a hard birth cap does not bound useful composition: production reached the cap while `dtFeedback` nearly filled the grid without it. It does **not** quantify a general memory-growth curve or establish an audio memory bottleneck.

Any future implementation should report active versus archived descriptor counts, total active layer entries, maximum/mean column depth, compiled audio node/route counts, and renderer-cache footprint over a long run. This source audit did not measure heap bytes, GPU cache bytes, or a renewal process. No implementation, synthetic runner, benchmark, or tests were added in this workstream.
