# Independent post-run sample-clock and aggregate review

Review date: 2026-11-01. Review basis: stable generated outputs at the provided post-regeneration hashes, current replay/analysis definitions, and read-only recomputation from the saved receipts and WAV windows. No world campaign or test suite was run by this reviewer.

## Conformance findings

- All six fixed histories have passing receipts and equal prior-run/replay fingerprints within each seed and arm. Each represents 300 seconds at 60 Hz: 18,000 controller ticks, 800 samples per tick, and 14,400,000 frames at 48 kHz. This establishes replay against each arm's own prior history; it does not imply that CONTROL and REPLACEMENT have identical world trajectories.
- Current controller, stratigraphy, bridge, compiler, and worklet paths have no tracked diff. The current worklet and compiler SHA-256 values match the runtime profile and all six render receipts.
- Every capture and schedule hash matches its world receipt. For each render, scheduled and received in-range events match; the 300-second output has 14,400,000 frames, 1,800,000 solver steps, finite state/PCM, no invalid topologies, and no dropped strike routes. Each 48 kHz stereo float WAV is 115,200,044 bytes, and its hash/length matches the analysis input receipt.
- Terminal frame events are separately preserved and excluded from the half-open PCM interval `[0, 14,400,000)`. Terminal strike counts by seed/arm are 20261005 CONTROL 0 / REPLACEMENT 0; 20261006 CONTROL 3 / REPLACEMENT 1; 20261007 CONTROL 2 / REPLACEMENT 3. For every arm, rendered strike diagnostics plus terminal strikes equal the full schedule strike count.
- Browser parity passes on the compiled two-Plate/Nodule fixture. All fixture events are received at their requested frames and strikes are accepted; the maximum whole-PCM absolute difference is `7.450580596923828e-9` against `1e-8`. `exactFloatEquality` is false, so this is numerical tolerance parity, not bitwise identity.

The six WAVs were rendered through Chrome's real `AudioWorkletNode` in `OfflineAudioContext`. The deterministic replay injects its precomputed schedule inside the processor's sample loop, preserving exact model-frame dispatch while bypassing live `MessagePort` delivery timing. The world schedule was built using the current `SurfaceAudioBridge` routing from the frozen captures. This supports an ideal model-time offline replay claim; it does not measure live message latency or underruns.

## Independent arithmetic checks

- The analysis contains exactly 30 windows for the five fixed intervals `[50,60)`, `[110,120)`, `[170,180)`, `[230,240)`, and `[290,300)`. Each contains 1,872 wholly contained 1,024-sample Hann frames at a 256-sample hop. All 30 stereo-mean ERB arrays have 30 finite bands.
- Five windows are fully silent. Their left/right RMS values are zero, dBFS values are `null`, and unit-sum shapes are `null`. The other numerical fields and the CSVs are consistent with those nulls. I independently reread the 30 WAV slices (14,400,000 stereo frames total) and recomputed RMS, dBFS, peaks, channel correlation, mid energy, and side energy; all values match, with maximum dBFS difference below `9e-13` and exact peak agreement.
- Paired shape cosine and total-variation values recompute from the stored unit-sum profiles; rows with a silent arm are blank. The common absolute ERB plot scale is correctly based on the maximum across the individual left/right channel arrays (`0` to `0.0005903468370128132`), while the shape plot uses stereo-mean profiles. All analysis output receipts, 30 PNG receipts, and two SVG receipts match file hashes and byte lengths; no RMS matching is declared.
- Across all 30 topology windows, schedule-derived direct strikes match both `correctedDirectStrikeCount` and the sum of per-layer window counts. Cumulative per-layer counts also match schedule events strictly before each window end. Reconstructed Z-bridge link totals, per-layer compiled-link incidence, graph components, isolated layers, and burial/exposure lists match the stored summaries. There are 1,183 layer-window rows.
- The summaries retain 19 raw observer strike-counter mismatch rows. These match 27 strikes exactly on fixed-window start frames, grouped by layer. The authoritative schedule-derived counts are correct. Treat the original observer values as legacy diagnostics, not as the direct-strike result. In these outputs `zDegree` is the per-layer incidence count of compiled solver-node links; it is not the number of unique neighboring layers.
- Runtime-profile compiler percentiles, clean-run medians/ranges, and reported wall time per simulated second recompute from their samples. Each late-window case has 60,000 physics steps and starts from rest with the latest topology before 290 seconds.

The analysis measures fixed-gain digital PCM: post-bridge gain `0.7` after the worklet soft limiter and interpolation, with no RMS matching. Its ERB statistic sums normalized one-sided FFT-bin power into 30 equal ERB-rate bands from 0–8 kHz; it is an FFT-bin grouping, not a gammatone model or perceptual threshold. Unit-sum shape and raw pickup summaries are descriptive. They do not establish audibility, sonic identity, material meaning, or causal contribution from a buried layer.

## Remaining limits

- The performance profile runs the unchanged processor source in a Chrome main-realm stub, starts at rest at 290 seconds, and profiles only that 10-second schedule. It explicitly is not an AudioWorklet deadline, real-time, or underrun measurement. No hard real-time or production-runtime viability claim is supported.
- The browser parity fixture and offline renders establish deterministic source execution and numerical parity, not sound quality or human perception. The six matched-seed pairs preserve distinct arm histories; schedule replay does not feed sound back into formation.
- `erb-unit-shape.svg` currently substitutes a zero vector when a profile is `null` and titles the chart “unit-sum.” The underlying JSON/CSV correctly mark silent shapes undefined, but the chart does not mark those silent rows. Do not interpret those baseline lines as valid unit-sum shapes; label or omit them if the SVG is used for comparison.

## Stable artifact hashes checked

- `audio-analysis/analysis.json`: `8ed53095ac4b8fbff242e34ed8744ba61491031464c2ab43b17da8b79e53142a`
- `analysis/architecture-summary.json`: `0eec6180c9439cd7ccae6958eedac19eb49acb4f9f675fd6f12fded51600d0e1`
- `analysis/layer-contribution-histories.json`: `4f8b21df2bfbb0ebf8fa10304504f9d97bbe0c6ea11ae14b8c3adc75b67cf4d0`
- `analysis/topology-cost-summary.json`: `91f2716dc2629d18bd21f8fc8a6ddb1790283e1178ef913c17e643251c429001`
- `analysis/validation/determinism.json`: `e9c3e2c2ec97d1c40f90aca52cc790d0907a55b7e0973f93fa976b59fe80b0ad`
- `audio-analysis/visual/plot-manifest.json`: `f582dc53c8f99ef67317ad3c016211fc3cf3a500be8106049e301aa8cdc4c108`

Review conclusion: the sample-clock replay, endpoint partition, browser conformance, WAV-to-analysis inputs, and summary arithmetic pass within the stated ideal offline scope. Keep the raw observer counter and silent-shape plot limits visible. Runtime evidence does not establish hard real-time performance, and spectral differences do not establish audibility.
