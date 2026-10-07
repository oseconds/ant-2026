# Frozen P1 pickup-distance readout diagnosis

Seed `20261005`, P1 `trail-plate-1`, birth `103.01666666667376 s`. The input gzip, P1 descriptor and all 63 accepted P1 strike messages match the frozen records byte-for-byte / schedule-for-schedule. Natural-strike measurements use the already captured production-A P1-only PCM; its hash and the unchanged baseline worklet hash are in [pickup-distance-report.json](pickup-distance-report.json).

Compiled P1 has 48 solver nodes. Pickup L is node 34 at `(0.516129, 0.483871)`; pickup R is node 15 at `(0.806452, 0.193548)`. Distance uses the same normalized XY coordinates as the compiled solver; the report also gives distance in 31-step solver-grid units.

Natural per-strike windows start at each frozen strike frame. They include later strikes when those overlap the 100 / 250 / 500 ms window, so they describe the real run, not isolated responses. Correlations use Spearman rank correlation; incomplete tail windows are excluded.

| Window | Pickup L distance ↔ L RMS | Pickup R distance ↔ R RMS | Nearest pickup distance ↔ pooled RMS | Nearest distance ↔ peak max |
|---:|---:|---:|---:|---:|
| 100 ms (62) | −0.510 | −0.386 | −0.449 | −0.414 |
| 250 ms (62) | −0.436 | −0.329 | −0.399 | −0.348 |
| 500 ms (61) | −0.478 | −0.280 | −0.341 | −0.261 |

Controlled conditions use the exact strength (`0.019241860433975615`), footprint (`0.012560297689219844`) and hardness of the first accepted P1 strike. Each condition routed to P1 and produced one accepted strike. Pickup locations are the compiled nodes; midpoint is their exact coordinate midpoint; source and target are the frozen descriptor endpoints; the branch point is the degree-3 vertex farthest from the nearer pickup among P1 graph branch vertices.

| Equal-strength control | Distance L / R (solver cells) | RMS 100 ms | RMS 250 ms | RMS 500 ms | Peak max |
|---|---:|---:|---:|---:|---:|
| Pickup L | 0.000 / 12.728 | 0.000508 | 0.000431 | 0.000349 | 0.001713 |
| Pickup R | 12.728 / 0.000 | 0.000541 | 0.000459 | 0.000371 | 0.002219 |
| Midpoint | 6.364 / 6.364 | 0.000123 | 0.000103 | 0.000083 | 0.000313 |
| Source | 5.173 / 17.510 | 0.000226 | 0.000194 | 0.000158 | 0.000829 |
| Target | 17.215 / 4.908 | 0.000434 | 0.000386 | 0.000318 | 0.001370 |
| Farthest branch vertex | 18.536 / 6.007 | 0.000605 | 0.000535 | 0.000440 | 0.002001 |

The midpoint is −12.88 / −12.98 / −13.02 dB RMS versus the mean of the two direct-pickup strikes at 100 / 250 / 500 ms. Source is about 7 dB below pickup L; target is 1.3–1.9 dB below pickup R. But the far branch is louder than pickup R by about 1.0–1.5 dB while still 6 solver cells from R. Natural matching-channel distance/RMS correlations are consistently negative but moderate. Together this supports a pickup-locality effect, not a simple monotonic distance law: location and local modal response also matter. This evidence is recorded before testing any candidate pickup topology; no candidate is tested here.

All controlled PCM was finite and below full scale; each worklet reported one accepted strike and zero dropped routes. Contact pulse, recovery, Plate damping, material, frozen geometry, output gain and production mixer remain unchanged. Substrate was not rendered or modified.

Audio maps sample frame to simulation time at 48 samples/ms. The frozen natural mapping is `round((strikeSimulationTimeMs - 103016.66666667376) * 48)`. Controlled captures map birth to frame 0 and the synthetic control-strike marker to `+10 ms` / frame 480.

Waveforms and spectrograms use the existing ANT fixed-scale renderers: separate L/R, ±1 waveform axis, FFT 1024 Hann, hop 256, 0–8 kHz, fixed −100…0 dBFS, gamma 1, no normalization. At these low A-levels the fixed-scale waveform is faint and spectrogram energy is concentrated near the floor; no per-image gain was added.

- [Six controlled strikes, fixed-scale comparison](six-control-strikes-fixed-comparison.png)
- [Pickup midpoint overview with P1 birth and control marker](pickup-midpoint-fixed-overview.png)
- The remaining four control overviews and all six float WAVs are listed in [pickup-distance-report.json](pickup-distance-report.json).

These six diagnostic WAVs remain local and are not included in the calibration commits. Their hashes are retained in the JSON report; the plots and measurement tables are committed.

Reproduce with `node scripts/ant-born-plate-pickup-distance.js`. Renderer checks: `node --test tests/audio-snapshot-renderer.test.js tests/stratigraphy-audio-overview.test.js`.
