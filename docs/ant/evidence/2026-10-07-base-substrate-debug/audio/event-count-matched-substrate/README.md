# Event-count matched substrate vs born P1

Frozen seed 20261005, P1 trail-plate-1 at 103.01666666667376 s. The exact 63 accepted P1 strike schedule is replayed. Those 63 foot-level accepts map to 44 unique source FOOT_CONTACT groups; the production generic substrate receives one centroid/strength event per group. No duplicate generic events were fabricated.

- Born P1 configured and direct pre-bridge worklet stems are newly rendered. Configured born PCM matches the existing frozen stem exactly.
- Matched generic substrate uses the original legacy payload for each unique parent contact group. The existing all-events substrate WAV remains unchanged; its pre-gain raw level is derived by division by the fixed static bridge gain.
- The 44-group subset also differs from all events in contact selection, timing and position. Raw substrate-vs-born includes group-centroid/strength versus per-foot input mapping and different worklet paths; it is not a pure intrinsic transfer measurement.
- Waveform/spectrogram output reuses the repository fixed-scale renderers: ±1 waveform, 1024 Hann FFT, 256 hop, 0–8 kHz, −100…0 dBFS, gamma 1, no normalization.
- Results decompose matched-parent-group subset versus all events (-7.750 dB), matched substrate raw versus born raw (34.594 dB), and configured output gain delta (-13.152 dB). This is a level decomposition, not a psychoacoustic masking test.

The generic Plate keeps production random strike jitter, so a fresh PCM replay may vary while the event schedule hashes remain exact.

See [event-count-matched-report.json](event-count-matched-report.json) for schedules, hashes, receipts, per-channel and pooled RMS/peak, event-aligned medians, finite/clipping checks, gains and plots.

The five raw PCM WAVs from this pass remain local and are not included in the calibration commits. Their paths and SHA-256 values are retained in the JSON report; the committed fixed-scale plots and measurements preserve the comparison.

## Readout and excitation decomposition

[The follow-up report](readout-excitation-decomposition.json) inverts the stored raw-worklet samples with `x = y / (1 - abs(y))`, then removes the generic `×8` or born `1/sqrt(12)` readout factor. The report contains per-channel/pooled RMS and peak, per-sample forward reconstruction checks, all 44 generic parent-group estimates, all 63 born per-foot requested/compliant impulse² values, and the corresponding 44 parent aggregates.

The reconstructed displacement pooled RMS is 0.0306688 for substrate and 0.0111342 for born P1, a +8.801 dB gap after readout scaling and soft limiting are removed. The exact raw gap is +34.594 dB. Readout scale contributes +28.854 dB and the stronger substrate limiter compression contributes −3.060 dB, for a net +25.793 dB readout/limiter term.

The generic worklet’s per-node `Math.random` jitter was not recorded with the original WAV, so its realized per-group `sum(deltaV²)` cannot be recovered. The JSON reports the exact J=1 nominal value, the `E[J²]` expectation, and deterministic jitter bounds; born per-foot values are reconstructed sequentially from the frozen topology and match the saved worklet aggregate totals. Expected injected-energy contribution is +1.121 dB, leaving +7.680 dB as a residual transfer term. That residual also includes different timing/spatial distributions, per-group vs per-foot semantics, and solver discretization; it is not a pure intrinsic resonator constant or calibrated physical energy.

Reproduce with `node scripts/ant-readout-excitation-decomposition.js`. The run verifies the frozen input, descriptor and event-schedule hashes and does not rerender or overwrite PCM. It changes no production code.
