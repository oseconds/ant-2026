# Frozen P1 solver observability map — 2026-10-07

One identical isolated Plate strike was measured at every valid node in frozen P1 `trail-plate-1`. This pass diagnoses pickup distance and local/topological response only. It does not change production DSP, contact routing, Plate material, Plate birth, substrate settings or simulation.

## Frozen source and method

- Seed `20261005`; P1 birth `103.01666666667376 s`.
- Frozen input SHA-256 `25bf05aab8bbbb142be11b79f37a5988898d6069e24cae31bf721348b0bf7ff3`; P1 descriptor SHA-256 `fd079682ed0663f9bffdae36b1102958ef219f7d0bb6b35fcf2b1d09bc647b16`.
- The source stream contains 63 accepted natural P1 strikes. Each map condition reuses the first accepted P1 strike's strength `0.019241860433975615`, footprint radius `0.012560297689219844`, and hardness `0.2879404621560313`.
- Frozen production-A worklet SHA-256 `0d5289950a000ee9aa3264b9b6bdffedd13bca2d28a0bab281be03ca6a45efd5`; output gain `0.245`; Chrome `155.0.8059.40`; 48 kHz stereo float32.
- Compiled geometry has 48 nodes on a 32×32 grid. Pickup L is node 34; pickup R is node 15. Each node's controlled strike is scheduled at frame 480 after 10 ms pre-roll. PCM is exactly 24,480 frames (510 ms); event-aligned RMS windows are 100 / 250 / 500 ms. Each worklet accepted one strike with zero dropped routes.
- Some edge-only compiled cells have no source-mask pixel in their own bucket. Each synthetic strike therefore uses the nearest occupied P1 source-mask pixel to the target node center. All 48 source pixels are distinct; mean offset is `0.237` solver cells, maximum `0.894`. Per-node offsets are retained in the CSV/JSON. This is a routeable spatial approximation, not direct solver-force injection.
- Euclidean distance uses normalized solver-node centers, reported in 31-step grid units. Geodesic distance is an unweighted shortest-path count over compiled cardinal neighbors. Degree counts those neighbors; degree below four marks a boundary node.
- Peak is maximum absolute PCM over the 500 ms post-strike window. RMS uses raw PCM, pooled across both channels. Heatmaps call the existing ANT `stratigraphyLuminanceForDbfs` transfer on a fixed −100…0 dBFS scale; no per-map normalization is applied.

## Results

| Post-strike window | Pooled RMS minimum | Pooled RMS maximum | L distance ↔ L RMS, Spearman | R distance ↔ R RMS, Spearman | Nearest distance ↔ pooled RMS, Spearman | Nearest graph distance ↔ pooled RMS, Spearman |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 ms | 0.00008093 | 0.00063845 | −0.906 | −0.743 | −0.462 | −0.501 |
| 250 ms | 0.00006810 | 0.00054602 | −0.906 | −0.737 | −0.411 | −0.451 |
| 500 ms | 0.00005488 | 0.00044064 | −0.906 | −0.734 | −0.404 | −0.446 |

Across the 500 ms peak window, ranges were L `0.00009018–0.00206585`, R `0.00018922–0.00233882`, and pooled `0.00023850–0.00233882`. Every PCM sample was finite, every worklet reported zero clipping, and every peak stayed below full scale. Degree distribution was 3 nodes at degree 1, 28 at degree 2, 13 at degree 3 and 4 at degree 4; 44/48 are boundary nodes.

Distance predicts part of the response: matching-channel RMS falls as distance increases. Pooled response is less distance-bound. Node 30 (distance `2.828`, degree 2) produced `0.00017566` pooled RMS at 100 ms, while node 4 at the same nearest-pickup distance and degree produced `0.00063845`—an `11.21 dB` difference. Farther out, node 8 (distance `6.325`, degree 2) produced `0.00059370`; node 27 (distance `6.403`, degree 2) produced `0.00008093`, a `17.31 dB` difference. These are relative low-output regions, not exact zero-response modal nulls. The result is consistent with pickup locality plus strong position-dependent modal/topological response; this map alone does not identify individual modes.

Because the map contains nearby low-output and similarly distant high-output regions, the next diagnostic candidate is a **small finite-area aperture around each existing pickup**. It was not implemented or tested here. No global gain increase or distributed Plate readout was tested.

## Evidence and reproduction

- [Per-node metrics, hashes, diagnostics and definitions](p1-node-observability.json)
- [Per-node CSV](p1-node-observability.csv)
- [Fixed-scale output heatmaps](p1-output-heatmaps-fixed-dbfs.png)
- [Fixed-scale Euclidean/geodesic distance maps](p1-distance-heatmaps-fixed-grid-scale.png)
- [Solver node IDs, degree and boundary map](p1-node-id-degree-boundary.png)
- 48 individual 510 ms stereo float32 WAVs: `node-00-...wav` through `node-47-...wav`; each SHA-256 is in the JSON report.

The 48 short node WAVs remain local and are not included in the calibration commits. Their hashes, node measurements and fixed-scale maps are retained in the JSON/CSV and committed plots.

Reproduce with `node scripts/ant-p1-node-observability.js`. The harness asserts the frozen input/descriptor/pickup/worklet hashes, one accepted strike per node, no dropped routes, finite/unclipped PCM, and byte-identical PCM/image outputs when prior evidence files exist. The focused fixed-scale renderer test passed 8/8. `node --check` and `git diff --check` passed. Full npm tests/build were not rerun because this evidence-only pass changes no production code.
