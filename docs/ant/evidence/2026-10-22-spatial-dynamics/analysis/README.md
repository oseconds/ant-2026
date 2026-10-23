# Continuous spatial and material diagnostics

`ant-spatial-analysis.js` consumes only explicitly named runner `result.json` paths. It validates the known result schema and frame shapes, reads the 1 Hz continuous summaries and 10 Hz movement samples, and writes new outputs only to a previously unused output directory. It does not run the world or infer missing checkpoints.

```powershell
node scripts/ant-spatial-analysis.js <result-a.json> <result-b.json> --output docs/ant/evidence/2026-10-22-spatial-dynamics/analysis/<new-output>
```

For every run it writes 1 Hz `temporal.csv`, non-overlapping 60 s `windows-60s.csv`, a compact `summary.json`, fixed-viewport trajectory/pheromone SVGs, production-mask SVGs, and candidate-path overlays at available snapshots. Runner frames are labeled by integer second, so the `[0,120]` interval uses frames 1–120 and `[300,600]` uses frames 301–600. `comparison.csv` combines these preregistered early/late summaries for every supplied run. Each summary records the input JSON SHA-256, analysis/helper SHA-256 hashes, runner source receipts and source hashes.

The ant and pheromone centroid positions, gyration/radius, covariance, 16 sector occupancy values, nest-near fraction, velocity polarization, angular momentum and pheromone mass are descriptive state series. Covariance-axis orientation uses `cos(2θ)` so the unoriented axis is treated modulo π; angle series are never compared by raw subtraction across a wrap. The spatial lag table reports centroid separation and x/y cross-correlation at fixed lags. The autocorrelation table uses 30/60/120 s lags. These are within-run descriptive summaries, not stationary-process estimates, significance tests or between-seed independent observations. Pheromone mass trends strongly over 600 s, so its autocorrelation chiefly reflects persistence and trend.

Review corrections: `pheromoneOrientation` reads the descriptor object's `angle`. The legacy-named `pheromoneOrientationCoherence` is **cos(2 × that direction angle)**, a coordinate statistic, not directional concentration or strength. Earlier local outputs had a null column from incorrectly testing the whole object as a number; only `validated/` outputs are published. A regression covers a known angle and missing direction. All other window/temporal values remained equal when rebuilding the short and long outputs. The raw frame `meanSpeed` means one-second net-displacement rate; polarization and momentum also use those interval net vectors, not instantaneous velocity.

Material metrics use frozen public production Plates. The public `surfacePlates.candidate` is a single mutable path observation with `pathPoints`, not an array of frozen Plates or a mask. It is analyzed separately at 0.03 and 0.10 normalized coordinate units with its qualification/source/target metadata. Candidate and born-Plate checkpoints can have different cadence and geometry; no path-copy or identity continuity is assumed. Its SVG overlays the candidate path in red on born-Plate principal paths in green. Mask union overlap, newly occupied cells, retention, and top-layer identity changes apply only to the frozen production Plate history; endpoint directions summarize that frozen geometry. The unchanged public `layerCountByCell` also yields the authored `m(L)` multiplier distribution per checkpoint; this reports spatial exposure/contrast under the current local-history condition, not a measured friction field. Missing candidate snapshots are written as `available: false`.

The runner currently records material snapshots at its checkpoint schedule, not every minute. Thus five/ten/twenty/thirty-minute material plots are emitted only when those exact snapshots exist. SVG paths and masks use the same `[0,1]²` world viewport; ant tracks are thinned to every third 10 Hz sample for file size. Pheromone circles encode relative mass through radius and carry no production renderer styling.

## Baseline readout

The current three 600 s baseline outputs are in [`baseline-final/`](validated/baseline-final/). Across the three seeds, equal-weight means for frames 1–120 → 301–600 were:

| Measure | Early | Late |
| --- | ---: | ---: |
| Mean live ant count | 13.264 | 20.388 |
| Ant centroid distance from nest | 0.2438 | 0.2622 |
| Gyration radius | 0.2792 | 0.3133 |
| RMS ant distance from nest | 0.3742 | 0.4099 |
| Covariance-axis coherence, cos(2θ) | −0.0699 | 0.3458 |
| Nest-near fraction | 0.1192 | 0.1124 |
| Velocity polarization | 0.4400 | 0.6131 |
| Absolute angular momentum | 0.4548 | 0.2952 |
| Pheromone mass | 73.90 | 220.67 |
| Ant/pheromone centroid distance | 0.0864 | 0.0577 |

The window means describe changing occupancy and activity across this run duration; they do not identify a social mode or a preferred spatial form. The autocorrelation is not used to claim periodicity or significance. At 600 s, production Plate counts were 29, 33 and 38; union-mask cell counts were 6525, 6031 and 6033. Plate curvature means at fixed 0.03/0.10 spacing were 10.41–10.87 / 2.54–2.72 radians per normalized unit across seeds. Candidate path observations are present at later checkpoints and are summarized separately as paths, not material masks.

## Available natural comparison

The explicit first-stage natural runs are in [`natural-final/`](validated/natural-final/). Values below are equal-seed means within each label. Damping-off has only seed `20261005` and is shown separately. The result labels `production-movement-flow-recruitment` and `production-movement-isotropic-recruitment` mean production movement is unchanged and one recruitment heading intervention is present (flow or isotropic). They are isolated recruitment comparisons against production, not a combined movement intervention. The baseline observer heading hook has exact RNG parity.

| Result label | Seeds | Window | Live ants | Gyration | Nest-near fraction | Polarization | Absolute angular momentum | Pheromone mass |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| production baseline | 3 | early | 13.264 | 0.279 | 0.119 | 0.440 | 0.455 | 73.90 |
| production baseline | 3 | late | 20.387 | 0.313 | 0.113 | 0.613 | 0.295 | 220.66 |
| dtFeedback | 3 | early | 13.125 | 0.270 | 0.106 | 0.296 | 0.565 | 102.93 |
| dtFeedback | 3 | late | 21.302 | 0.324 | 0.055 | 0.243 | 0.632 | 289.64 |
| production-movement-flow-recruitment | 3 | early | 12.692 | 0.289 | 0.131 | 0.282 | 0.489 | 54.73 |
| production-movement-flow-recruitment | 3 | late | 17.824 | 0.322 | 0.141 | 0.244 | 0.348 | 181.18 |
| production-movement-isotropic-recruitment | 3 | early | 12.583 | 0.289 | 0.119 | 0.288 | 0.482 | 60.07 |
| production-movement-isotropic-recruitment | 3 | late | 17.992 | 0.326 | 0.141 | 0.250 | 0.327 | 184.24 |
| dampingOff | 1 | early | 13.600 | 0.254 | 0.119 | 0.307 | 0.597 | 104.54 |
| dampingOff | 1 | late | 21.073 | 0.330 | 0.053 | 0.247 | 0.632 | 284.98 |

All measures are condition-level descriptions, not quality scores. Window means expose large within-run change, including a baseline increase in polarization and decrease in absolute angular momentum; between-seed and between-condition interpretation must preserve each run's trajectories and not treat the many 1 Hz frames as independent trials. The damping-off single seed does not support a between-seed claim. These summaries do not select a long-run condition.

Each run's `windows-60s.csv` includes mean signed angular momentum, the 16-sector occupancy vector, the dominant sector and peak fraction, and an unoriented covariance-axis angle computed by a doubled-angle circular mean. `summary.json` reports the within-run fraction of positive/negative signed-momentum windows, longest consecutive majority-sign run and fixed 30/60/120 s autocorrelations for centroid coordinates, covariance-axis coherence, signed angular momentum and sector occupancy. These diagnose temporal persistence or switching within each run; they do not establish a locked mode. Inspect seed-level values before pooling. Angular momentum sign is a colony aggregate and does not establish coordinated individual turning.

In the 3-seed natural comparison, dtFeedback's positive/negative signed-momentum 60 s windows were 0/1, 0.6/0.4 and 0.4/0.6 by seed. The longest consecutive majority-sign runs were 10, 6 and 4 windows. Sector-dominant bins changed in 5, 4 and 4 distinct sectors over each run's ten windows. Early→late covariance-axis coherence was 0.469→0.091, −0.180→−0.109 and −0.202→−0.424. This is mixed across seeds and measures; one run kept negative aggregate angular momentum for all ten windows, while the other two changed sign. It does not support a cross-seed locked angular-momentum orientation or stable spatial axis. Flow recruitment had sign-window positive fractions 0.3/0.8/0.6, isotropic had 0.3/0.6/0.2; both recruitment conditions' dominant sectors changed in 3–6 bins across seeds. These summaries preserve endogenous run divergence and are not evidence of a causal contrast by themselves.

The two 7,200 s single-seed trajectories are analyzed in [`long-run-final/`](validated/long-run-final/), including late fixed windows, interval material turnover, candidate/born geometry, the immutable birth time of the production Plate cap, and a fixed-view comparison SVG. This is a descriptive long-run contrast, not condition selection or adoption evidence.
