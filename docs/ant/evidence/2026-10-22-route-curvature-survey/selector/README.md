# TrailPlateBirth route-curvature selector probe

## Question and scope

Can the unchanged `TrailPlateBirth` selector produce connected candidate and Plate paths for controlled straight, gentle-arc, tighter-arc, and S-shaped routes, and how much do 96×96 path discretization and the selected descriptor geometry affect measured curvature?

This is a downstream selector probe at baseline commit `8c60e4b`. It changes no production source and does not tune qualification thresholds. The controlled route runs use `TrailPlateBirth.advance()` and real `SurfaceField` `FOOT_CONTACT` accumulation. Their chemical input is an explicitly synthetic, one-cell raster of an analytic route, following the existing field-fixture pattern; it is not pheromone deposited by simulated ants. A second probe uses real `PheromoneField.depositSegment()` and real `SurfaceField.applyFootContact()` to expose field-grid alignment sensitivity.

This evidence establishes selector capability on connected controlled masks and reports a fixture sensitivity. It does not establish natural curvature distributions, how often real movement generates such fields, or a general curvature response in births.

## Result

All four connected synthetic routes qualified through the production selector and produced a birth. The source points fell at radius `0.09` from `{x: 0.5, y: 0.72}`; targets were `0.04` from the observation boundary. Each descriptor had one 57-node, 56-edge centerline route, no junctions, and a 173-cell ribbon mask. The principal path lengths increased from `0.5895` (straight) to `0.6374` (gentle arc), `0.6723` (tighter arc), and `0.7072` (S route); chord/path tortuosity was `1.000`, `1.061`, `1.080`, and `1.200`.

The principal path contains only 8-neighbor grid steps. The raw path's diagonal/orthogonal steps and turns therefore include raster geometry. Turning per unit distance was computed after equal-arc resampling and moving-average smoothing over fixed physical windows of `0.02`, `0.04`, and `0.08` world units. The raw-to-`0.08` smoothed turn-per-distance values were `0 → 0` (straight), `17.68 → 4.19` (gentle), `26.44 → 5.94` (tighter), and `27.50 → 6.70` (S). These measurements depend on the stated raster fixture and smoothing method.

The selected candidate path equals descriptor `principalPath` exactly in every case because descriptor creation copies `candidate.path`. This is a construction invariant, not independent validation. The descriptor `centerline`/`edges` also held only that same path in these single-route fixtures. The candidate/descriptor comparison found no downstream path loss here; it does not test pruning of branches or weak disconnected portions.

In the real-deposit probe, six repeated passes used the default PheromoneField brush radius `0.0045`, below half of a 96-grid cell (`0.005263`). With the route's base x at `0.5` (the straight case is vertical), all four inputs had chemical-qualified and supported cells, but only the straight case selected/birthed; the three curved cases did not. Shifting the otherwise same route to base x `0.504` made all four select and birth. This paired result shows strong grid-alignment sensitivity for this fixture. Because the default brush can miss grid centers and use the nearest-cell fallback, route orientation and subcell placement can change the sampled raster. This does not identify a production threshold defect or show that natural runs systematically lose curved paths.

## Cross-check with the separate natural movement readout

The parent readout of the three unchanged 600-second production baselines reports body turn-cap saturation of `99.35–99.56%` and turn-sign reversal fractions of `99.73–99.85%` in the immediate observations whose `trailAdherence > 0.75` (the bin variable is trail adherence, not angular velocity). In the separate single-seed `dampingOff` shadow for `20261005`, the 5-second same-sign turn-pair fraction and lag-1 turn correlation are `0.939` and `0.927`, versus `0.093` and `−0.533` in its natural baseline; 5-second cap saturation is `0.1408` versus `0.8821`. These are movement/readout results from [readout/summary.json](../readout/summary.json), [natural/seed-20261005-summary.json](../natural/seed-20261005-summary.json), and [shadows/dampingOff-20261005/summary.json](../shadows/dampingOff-20261005/summary.json), not selector measurements. Together, the source-connected fixture pass and the natural movement comparison show that curvature can be limited upstream by realized movement and can also be sensitive to selector input rasterization; this probe alone cannot apportion natural Plate geometry between them.

## Reproduction

```powershell
node scripts/ant-route-curvature-selector.js > docs/ant/evidence/2026-10-22-route-curvature-survey/selector/route-selector-results.json
node tests/ant-route-curvature-selector.test.js
```

Direct execution of the test file passed both tests (`2/2`). The survey JSON includes per-route endpoints, candidate/principal path measures, centerline graph counts, smoothing measurements, and both real-deposit alignment probes.

## Source and artifact hashes

SHA-256:

| Artifact | SHA-256 |
|---|---|
| `src/lib/agents/ant/TrailPlateBirth.js` | `283DE374BC38CD8BAAE47D99D253D43B71B800EDBF4747D19D06299986C12860` |
| `src/lib/agents/ant/SurfaceField.js` | `182B70F589BEC7DE427A97A4F14F3823B2BD474F6C49C90C59B17C306990C096` |
| `src/lib/agents/ant/PheromoneField.js` | `412798EA9276888BF5BBB28130AE319D970C36F411D6F066E48CFF1B478C4AFD` |
| `scripts/ant-route-curvature-selector.js` | `D58CD72CADF05CC8050A5B5A6F5B6FA93BDDF5AF986D764E278A2B782FBA7489` |
| `tests/ant-route-curvature-selector.test.js` | `27E0BCB2D315E7AD6F60A99B92FCE9403EBF67EC5AC471D94F3CAD19B6F23F44` |
| `route-selector-results.json` | `3AF738307A4112099E2C3D4B3E5F597FEFC412F3E843EDCEAC6D79321731DB47` |

The JSON hash above is for the checked-in generated result from this exact reproduction run. Recompute it after any script or source change.
