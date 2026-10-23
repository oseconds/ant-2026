# Natural route-to-material transfer audit

Date: 2026-10-23 KST. Read-only source and frozen-state audit at `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. No simulation, selector edit, cap change, or new mechanism was run or made. Existing package work and untracked files were preserved.

## Current causal path

```text
field sensing / intent → movement and completed travel → gaster deposition → pheromone decay/reinforcement
                                                                  ↓
                            1 Hz chemical-memory EMA → chemical mask ∩ SurfaceField support
                                                                  ↓
                      skeleton/components → source-to-edge path gates → best candidate
                                                                  ↓
                         20 s similarity-qualified stability + repeat/gap/cap gates
                                                                  ↓
                                  immutable Plate birth → material columns
                                                                  ↓
                    later overlap + compaction + foot load + 30 s persistence → Nodule
```

`AntController.tick` reads the decaying pheromone field for trail sensing before movement. The completed, collision-constrained travel and rear gaster points then drive deposition; the dose per distance includes local trail strength and adherence reinforcement. The 96×96 pheromone raster decays each tick with the configured half-life and deposits are spread by a Gaussian brush. These links close a behavior/field loop; deposits alone do not establish that a route was selected because of pheromone.

`TrailPlateBirth.advance` runs after movement/contact/deposition on simulation time, but analyzes at most once per second. At each 96×96 cell it samples the pheromone field, clamps negative values to zero, maps raw concentration to `raw / (raw + 0.04)`, and updates its independent `Float32` chemical memory with a 20 s exponential approach. Chemical memory is not the raw live raster and retains no separate event identity. Cells below `0.30` are excluded before support is sampled. For the remaining cells, `SurfaceField.sampleSupport` reads compaction at the center and eight directions at half/full `0.025` radius; support must reach `0.015` to enter the binary mask. `SurfaceField` itself is driven by individual valid foot contacts and relaxes with a 1,800 s half-life.

The current selector thins that mask (Zhang–Suen), partitions connected skeleton components, and keeps only components intersecting both the fixed source annulus around `(0.5, 0.72)` (radii `0.055–0.115`) and the observation boundary within `0.05`. It uses deterministic shortest paths from the selected source, requires geodesic length at least `0.30`, builds a supported corridor/ribbon, and chooses the longest qualifying candidate. Thus a supported raster is not automatically a Plate candidate; it must also have qualifying source-to-edge geometry.

Selected candidates must remain at least 60% similar to the preceding selected corridor to inherit its `startedAtMs`. Birth requires 20 s of that continuity, at least 10 s since the previous global birth, and available capacity below the 256-Plate ceiling. If the candidate matches an earlier birth, it additionally requires that birth to be at least 90 s old and at least 30 new foot contacts on its corridor. Similarity is a selector identity rule; it does not prove an agent-level persistent route or memory.

Birth descriptors preserve a mask, centerline, edges, principal path, widths, source/target, support/chemical summaries, and derived material parameters. `AntController` immediately passes each descriptor to `MaterialStratigraphy.addPlate`. Stratigraphy appends the immutable Plate in birth order; each covered cell appends that Plate index to its column and resets the nodule persistence timer for that cell. This history has no natural removal/erosion path. Current `L` and depth are derived from later overlapping Plate coverage, not from age.

Nodule qualification is a later and distinct consumer. A cell needs at least four overlapping Plates (three buried), surface compaction at least `0.55`, and at least `200` individual foot contacts in radius `0.028`; it must remain qualified for `30,000 ms`, then pass the existing-Nodule proximity gate and the 32-Nodule ceiling. Foot-load is cumulative in the current implementation; it is not erased by Plate births. A Nodule is not required for Plate birth, route visibility, or the user's current live-route priority.

## What the saved cohort identifies

The analysis restored each complete graph from the 66 files in [`capture/matrix-20261023/states`](capture/matrix-20261023/states), using the source/prototype registry described by [`matrix-manifest.json`](capture/matrix-20261023/matrix-manifest.json). It read the current `TrailPlateBirth` and `MaterialStratigraphy` state at each captured pre-tick boundary; it did not step the world. The manifest verifies the frozen source copies and the state cohort. Denominators below are **33 captures per independently grown origin policy** (three seeds × eleven times), not independent trials. The fixed samples are 30, 60, then 120–600 s in 60 s increments.

| Readout across the 33 captured states | Production origin | `dtFeedback` origin |
| --- | ---: | ---: |
| Current selected candidate present | 27/33 | 27/33 |
| Candidate stable for ≥20 s | 17/33 | 25/33 |
| States with supported cells but no selected candidate | 6/33 | 6/33 |
| Captures where supported-cell count equaled chemical-qualified-cell count | 32/33 | 33/33 |
| Candidate path point count, median among present candidates | 73 | 98 |
| Selected candidate geodesic length, median among present candidates | 0.919 | 1.150 |
| Stored Plate count at captures, range | 0–38 | 0–18 |
| Maximum column layer count at captures, range | 0–35 | 0–16 |
| Nodule count at captures, range | 0–32 | 0–32 |

There were no captures with zero chemical-qualified or supported cells. Because the implementation samples support only after a cell passes the chemical threshold, the supported count is a subset of the chemical-qualified count. Those counts were equal in 32/33 production-origin captures and all 33 `dtFeedback`-origin captures; the remaining production capture (seed `20261005`, 420 s) had one fewer supported cell. At the sampled boundaries, support therefore removed at most one cell from this mask cohort. This does not establish that support is irrelevant: it can still shape connected geometry, and the sampled point may miss within-second changes.

### Reproduce the descriptive census

From the repository root, this PowerShell snippet verifies the pinned manifest and every compressed state against its manifest SHA-256, restores only the captured state graphs, and prints the table counts. It reads only these inputs and writes no files. State-record fields read: `originPolicy`, `seed`, `secondsCompleted`, and `frozenInput.graph`; restored fields read: `agents.length`, `trailPlateBirth.getSnapshot()` (`candidate`, `plates`, `inputDiagnostics`), and `materialStratigraphy.getSnapshot()` (`layers`, `nodules`).

Pinned `matrix-manifest.json` SHA-256: `8ea739584be0425ba9e2d166a4af04b4a84d4d3ccb6228ef6745026ad9a4ade3`. The capture manifest lists 66 state paths and compressed-file hashes. The median definition is nearest lower rank `sorted[floor((n - 1) * 0.5)]`; both candidate-path medians use the 27 present candidates for their origin. No ant/window is treated as an independent replicate.

The manifest’s source entries used here are `src/lib/agents/ant/AntController.js`, `src/lib/agents/ant/TrailPlateBirth.js`, `src/lib/agents/ant/MaterialStratigraphy.js`, and `scripts/ant-transfer-state.js`; their SHA-256 values are pinned in `sources.sourceHashes` and `sources.sourceCopies` in that manifest.

```powershell
@'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { restoreStateGraph } from './scripts/ant-transfer-state.js';
import { AntController } from './src/lib/agents/ant/AntController.js';

const root = 'docs/ant/evidence/2026-10-23-natural-field-transfer/capture/matrix-20261023';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = readFileSync(resolve(root, 'matrix-manifest.json'));
assert.equal(sha(manifestBytes), '8ea739584be0425ba9e2d166a4af04b4a84d4d3ccb6228ef6745026ad9a4ade3');
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.captures.length, 66);
for (const [sourcePath, expected] of Object.entries(manifest.sources.sourceHashes)) {
  assert.equal(sha(readFileSync(resolve(sourcePath))), expected, sourcePath + ' differs from captured source');
}
const rows = [];
for (const capture of manifest.captures) {
  const file = resolve(root, capture.path);
  const bytes = readFileSync(file);
  assert.equal(sha(bytes), capture.sha256, capture.path);
  const record = JSON.parse(gunzipSync(bytes));
  assert.equal(record.originPolicy, capture.originPolicy);
  assert.equal(record.seed, capture.seed);
  assert.equal(record.secondsCompleted, capture.secondsCompleted);
  const controller = restoreStateGraph(record.frozenInput.graph, {
    extraTypes: [{ id: 'InstrumentedAntController', Type: AntController }]
  });
  const birth = controller.trailPlateBirth.getSnapshot();
  const material = controller.materialStratigraphy.getSnapshot();
  rows.push({ origin: record.originPolicy, seconds: record.secondsCompleted,
    ants: controller.agents.length, plates: birth.plates.length,
    candidate: birth.candidate, input: birth.inputDiagnostics,
    maxLayers: material.layers.maxColumnLayerCount, nodules: material.nodules.length });
  assert.equal(sha(readFileSync(file)), capture.sha256, capture.path + ' changed during read');
}
assert.equal(rows.length, 66);
const median = values => values.sort((a, b) => a - b)[Math.floor((values.length - 1) * 0.5)];
for (const origin of ['production', 'dtFeedback']) {
  const group = rows.filter(row => row.origin === origin);
  const candidates = group.map(row => row.candidate).filter(Boolean);
  console.log(JSON.stringify({ origin, captures: group.length,
    candidate: candidates.length,
    stable20: candidates.filter(c => c.stableSeconds + 1e-9 >= 20).length,
    supportedNoCandidate: group.filter(r => !r.candidate && r.input.supportedCells > 0).length,
    zeroChemicalOrSupport: group.filter(r => !r.input.chemicalQualifiedCells || !r.input.supportedCells).length,
    chemicalEqualsSupport: group.filter(r => r.input.chemicalQualifiedCells === r.input.supportedCells).length,
    pathMedian: median(candidates.map(c => c.pathPoints.length)),
    geodesicMedian: median(candidates.map(c => c.geodesicLength)),
    plateRange: [Math.min(...group.map(r => r.plates)), Math.max(...group.map(r => r.plates))],
    maxLayerRange: [Math.min(...group.map(r => r.maxLayers)), Math.max(...group.map(r => r.maxLayers))],
    noduleRange: [Math.min(...group.map(r => r.nodules)), Math.max(...group.map(r => r.nodules))],
    birthReady: candidates.filter(c => c.birthReady).length }));
}
'@ | node --input-type=module
```

At 600 s, all three states per origin retained an active candidate. Production had 29/33/38 Plates and candidate paths of 69/69/77 points; `dtFeedback` had 10/15/18 Plates and paths of 98/113/92 points. These are six endpoint snapshots from different natural histories, not a matched treatment estimate. In particular, the longer paths alongside fewer Plates do not establish selector “compression,” a preferred route, or a cause of the difference. The independent longer-run union result in [`PERSISTENCE-CONTRACT.md`](PERSISTENCE-CONTRACT.md) remains separate evidence.

None of the 66 sampled current candidates was `birthReady`. The stored gate fields show long-stable candidates, while repeat-corridor refractory time and the global gap still constrain sampled states. For example, one production-origin state and 15 `dtFeedback`-origin states were both ≥20 s stable and had the global gap cleared; each had a prior-corridor match whose 90 s refractory time remained. These are point-in-time selector diagnostics, not counts of births prevented over intervals. All sampled Plate counts were below the 256 ceiling. No-Plate-at-capture or not-ready states therefore must not be attributed to cap saturation.

The cohort exposes the exact current selected path and candidate fields (`geodesicLength`, `stableSeconds`, `similarity`, `footContacts`, `meanChemical`, `meanSupport`, `pathPoints`, `globalGapRemainingSeconds`, and repeat diagnostics), plus full chemical memory, support field, and material columns in the restored graph. However, it stores only the **selected** candidate for each snapshot. It does not retain per-stage counts for skeleton components, source-annulus intersections, edge targets, geodesic rejection, or non-winning candidates. So `supported cells but no candidate` localizes the remaining failure to candidate selection after the binary supported mask, but cannot say which exact geometric gate rejected every component. A missing candidate is not evidence of a missing/flat pheromone field.

Captured material state also permits direct inspection of current Plate masks, column depth, accumulated foot-load, and `candidateSinceMs`; public snapshots retain aggregate topology and the current number of qualified Nodule cells. They do not provide the prior per-second qualification/exclusion history for all cells. The one-second cohort is too sparse to identify when a nodule timer began or reset, or whether a qualifying episode persisted through the intervening evaluations. Captured Nodule count and current qualified-cell count cannot establish a material-blank renewal process.

## Claim boundary and next probe

Supported now: live pheromone deposition and sensing are connected to the existing Plate selector, and the 66 complete states contain route/path and material data sufficient for a bounded read-side description. In these sampled boundaries, chemistry and support both had positive qualifying cell sets; selector output was present in 54/66 states, with six supported-mask/no-candidate states per origin. Existing path and birth gates also independently limit material transfer. This is an identifiable set of candidate bottlenecks, not a ranking of their causal importance.

Not established: that live pheromone causes route reuse; that route shape is compressed by Plate selection; that a saved candidate would have persisted or birthed between captures; that Plate births are the correct visual target; or that renewed blank space is needed for current evaluation. The user priority is live pheromone and route change first; monotone material union or absence of blank renewal is not an automatic veto. No erosion, retirement, cap adjustment, display fade, or selector replacement follows from this audit.

If resolving the six-per-origin geometry losses is needed for the live-route question, the smallest useful next step is a read-only selector-stage census on these same 66 frozen arrays: count components, source-annulus hits, boundary hits, source-to-boundary paths, geodesic-length passes, and winning versus non-winning candidates without altering masks, fields, or birth state. That would distinguish absent qualified geometry from a later persistence/repeat gate. It requires only current snapshots and selector diagnostics; no free-running simulation or material-turnover experiment is warranted by these data.
