# Natural dense readout overlap — DENSE-OVERLAP CANDIDATE SUPPORTED

## Result classes

**Implementation fact.** The production worklet advances the complete active Plate/Z/Sphere network, adds the existing Plate point-pickup readouts and aggregate Sphere readout, applies the current shared `x / (1 + abs(x))` limiter, and interpolates from 6 kHz physics to 48 kHz output. A diagnostic stem is one layer's existing stereo point pickup multiplied by the existing Plate mix coefficient, observed in that full solve. It is not an isolated Plate render.

**Experiment result.** In this one seed-20261005 window, the signed sum of rest-of-Plate stems had greater 500 ms energy than the focal stem in 742 of 1,231 complete focal events. Full time-frequency ERB shapes differed substantially between focal and rest readouts, while integrated ERB profiles were more similar. Eight Plate stems contributed nonzero samples throughout nearly the entire captured physics window, with an energy-weighted median of about 2.11 effective Plate contributors.

**Artistic interpretation.** No listening judgment was collected. These measurements support a later human listening check; they do not establish perceptual masking or that individual Plate character is heard as buried.

## Frozen capture and provenance

- Seed: `20261005`.
- Starting `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Validated pickup-stem observer base: `c519302a58adc875eab782877f2fdf1c43e3608b`.
- Research branch: `codex/ant-natural-dense-readout-overlap-20261018`.
- Runtime used for the frozen V8 input: Node `v22.23.2`, V8 `12.4.254.21-node.56`.
- First post-tick boundary with eight historical Plates: tick `17521`, simulation time `292016.66666664043 ms`; `trail-plate-8` has this same birth timestamp. The requested half-open audio window is 600 ticks / 10 seconds, output frames `[14016800, 14496800)`, ending at the nominal `302016.66666664043 ms` (tick `18121`): 480,000 frames at 48 kHz and 60,000 physics steps at 6 kHz. Repeated Float64 tick-time accumulation records the endpoint as `302016.6666666521 ms`, 11.68 ns later; the endpoint tick and output-frame count define the window, while event analysis uses the nominal half-open frame interval.
- The eight Plates at the start are `trail-plate-1` through `trail-plate-8`. One `buried-sphere-1` Nodule is present throughout the window. A ninth Plate is born at the 600th tick endpoint (the recorded controller timestamp is 11.68 ns past the nominal end); its generation and events are preserved in the capture ledger but are outside the rendered half-open audio interval. No Nodule birth occurs in the window. Strikes stamped exactly at the start boundary remain in the causal replay stream in captured sequence order but are excluded from event-window analysis.
- The capture ledger preserves the full pre-roll and endpoint message stream: topology installations, routed strike payloads, source positions/strengths, Plate and Nodule history, FOOT_CONTACTs, births, RNG and per-tick parity receipts. `capture-inputs.v8.gz` stores the compact replay inputs. Its SHA-256 is `fcfebf8c27adab472f564c99c02dda25d9c2221ea2a22d5bcdd380614279bcf9`; each saved topology source recompiles to the captured topology hash exactly.
- A matched Audio-Off controller and the audio-bridge controller matched at all `18122` compared tick snapshots from initialization through the interval endpoint. Trajectory, lifecycle, RNG, pheromone, SurfaceField, gait, body pose, gaster deposition, colony activation, occupancy, FOOT_CONTACT, birth events, TrailPlateBirth, and MaterialStratigraphy hashes all match. Final RNG state and call count match. The in-memory bridge reports zero dropped routes, zero ignored events, and zero processor errors.

The capture starts from simulation time zero because the coupled worklet state cannot be reconstructed from the controller milestone alone. The audio output is retained only for the requested 10 seconds; the full earlier stream warms the unchanged solver into the captured state.

## Offline replay and reconstruction

The uninstrumented production worklet and the pickup-stem observer replayed the same `14,496,800`-frame pre-roll, all captured topology messages, and all `8,280` scheduled strike messages. The route audit and raw telemetry agree: `8,279` strikes were accepted and one pre-window strike was rejected at frame `10,992,549` because `trail-plate-2` was not the exposed layer in topology generation 4. There were zero rejected routes in the 10-second analysis interval, zero invalid topologies, zero non-finite events, and zero clipped samples. Observer and raw worklet telemetry matched exactly.

The observer stored the eight current Plate stems, aggregate Sphere stem, and original full pre-limiter L/R mix for `60,002` physics steps (two pre-roll steps preserve interpolation state). The 10-second output window contains `480,000` stereo frames. Strict comparisons passed:

- All `120,004` saved Float64 pre-limiter values reconstructed by adding the eight Plate contributions in the production layer order and then the Sphere contribution; maximum absolute error `0`.
- All `960,000` raw-versus-observed Float32 output values matched exactly; maximum absolute error `0`. Applying the current shared limiter and interpolation to the stems also reconstructed the full output window exactly.
- The existing ERB frontend checked the complete full-mix PCM excerpt for all complete event windows: `101,400,000` stereo samples compared, all exact, maximum absolute error `0`.

Production `src/` and `static/` files are unchanged. The stem arrays used `12,000,400` preallocated bytes (`13,440,320` bytes uncompressed including saved PCM, compressed to `12,740,433` bytes). In this single offline run, raw replay took `514405.1936 ms` and observed replay took `520272.9891 ms` (ratio `1.0114`, or about 5.87 seconds additional). This is one harness timing, not a benchmark or a real-time cost estimate. The production worklet has no stem branch or stem allocation, so disabled production cost is zero.

## Event-level overlap summary

All `1,279` directly routed strikes with timestamps in `[start, end)` were analyzed. Windows begin at the first 6 kHz physics sample after the exact routed event frame; a strike can occur between physics steps. The exported physics-frame label is derived from the selected stem index and lands on that sample boundary (for example, event frame `14017134` maps to physics frame `14017136`). ERB metrics and listening excerpts begin at the exact 48 kHz event frame using the existing interpolator. Incomplete endpoint windows remain marked incomplete in `analysis.json`.

| Window | Complete events | Focal/rest level dB, p10 / median / p90 | Strikes in window, median (p10–p90) | Effective contributors, median per event | Post-limiter/interpolated vs pre-limiter RMS, median dB |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 ms | 1,270 | −17.72 / −5.13 / +5.34 | 15 (8–21) | 2.14 | −0.451 |
| 250 ms | 1,255 | −17.60 / −5.46 / +4.75 | 34 (26–41) | 2.13 | −0.444 |
| 500 ms | 1,231 | −17.89 / −5.38 / +4.51 | 69 (54–77) | 2.10 | −0.448 |

Across complete 500 ms windows, focal/rest level ranged from `−30.61` to `+6.68 dB`; the rest-of-Plate signed sum was at least as energetic as the focal stem in 60.3% of events. This direction is repeated but not universal: the focal stem was stronger in the remaining 39.7%.

For the 500 ms focal/rest comparison, the existing 30-band ERB full time-frequency cosine had p10/median/p90 `0.233 / 0.468 / 0.599`; integrated ERB profile cosine was `0.416 / 0.852 / 0.972`; late-half ERB profile cosine was `0.401 / 0.839 / 0.973`. These describe signal-shape similarity only. They are not loudness measures or a psychoacoustic masking criterion.

## Window-wide density and limiter

- The audible interval begins with eight historical Plates and has eight current pickup stems throughout `[start, end)`. The ninth Plate is installed at the endpoint after the measured window.
- Strike density is `1,279 / 10 s = 127.9 messages/s`; per-second counts are `117, 133, 142, 136, 112, 144, 136, 135, 133, 91`.
- Exact nonzero Plate support was seven or eight stems per physics step (median eight; no amplitude threshold). Energy-weighted effective contributor count had median `2.113`, p10 `1.237`, p90 `3.587`, mean `2.277`, and maximum `6.826`. The largest individual Plate held a strict arithmetic majority of Plate pickup power in `73.23%` of physics steps. This majority is a descriptive arithmetic fact, not a masking boundary.
- Sphere readout was retained separately. Its RMS was `5.64e-6`; aggregate Plate pickup energy was `75.51 dB` above Sphere energy in this window. The Sphere was nonzero and included in the listening assets.
- The common limiter gain had channel medians `0.9755` left and `0.9854` right; channel minima were `0.8650` and `0.8493`. In event windows the median RMS change after limiting and 48 kHz interpolation was about `−0.45 dB`. Mean gain in the highest effective-contributor quartile was `0.9832`, versus `0.9681` in the lowest quartile. No compression threshold is imposed.

## Listening assets and fixed selection

Before writing WAVs, the numeric analysis was frozen at SHA-256 `495a5d0f9f5529a4feac38675c498455ca16d2b5ffb6989639754e86655d4441`. The deterministic rule sorted complete 500 ms events by focal/rest level and selected rounded p10, p50, and p90 ranked cases, with frame, layer ID, then routed sequence as stable tie-breaks:

| Example | Sequence | Plate | Focal/rest dB |
| --- | ---: | --- | ---: |
| low | 7258 | `trail-plate-5` | −17.889 |
| median | 7860 | `trail-plate-6` | −5.379 |
| high | 8225 | `trail-plate-8` | +4.515 |

Each aligned 500 ms example has fixed-gain `1.0` full, focal, rest-of-Plate-world, and Sphere WAVs. The focal is a readout selection from the full coupled solve. No RMS-matched copy or listening judgment was made. Open the [aligned listening page](./listening.html); asset hashes and provenance are in `listening-assets.json`.

## Decision and limits

**DENSE-OVERLAP CANDIDATE SUPPORTED.** In this frozen window, rest-of-Plate readout repeatedly carries more 500 ms energy than the focal readout, while the focal/rest time-frequency shapes remain differentiated in the descriptive ERB comparison. The variation across events is substantial, and the integrated ERB profiles are often similar. This supports a later human listening check only; it does not prove perceptual masking, individual audibility, or a production-mix responsibility.

This is one seed and one 10-second natural window. A Plate stem includes state produced by the complete Plate/Z/Nodule network; muting a stem after capture does not remove its physical state or coupling influence. The offline run does not test real-time deadlines, and the known mature-world real-time collapse remains separate. No gains, limiter law, damping, pulse, pickups, coupling, formation, or production mixer changed.

## Reproduction

Set `ANT_PYTHON` to the repository's bundled Python runtime (with the existing NumPy/ERB helpers), then run:

```powershell
node scripts/ant-natural-dense-readout-overlap.js
```

This regenerates the natural capture and performs both full offline renders. To recompute analysis from the preserved inputs/stems without re-simulating or re-rendering, run `node scripts/ant-natural-dense-readout-overlap.js --analyze-existing`; it verifies the compressed stem hash, re-compiles topology payloads exactly, re-runs the route audit, and checks saved mix/PCM reconstruction.

Focused validation passed **55/55** tests with:

```powershell
node --test tests/ant-sonic-shadow-render.test.js tests/surface-plate-worklet.test.js tests/compile-surface-topology.test.js tests/surface-audio-bridge.test.js tests/ant-audio-integration.test.js tests/ant-environment-audio.test.js
```

Machine-readable details: [`capture-ledger.json`](./capture-ledger.json), [`capture-inputs.v8.gz`](./capture-inputs.v8.gz), [`pickup-stems-index.json`](./pickup-stems-index.json), [`analysis.json`](./analysis.json), [`erb-overlap.json`](./erb-overlap.json), [`validation.json`](./validation.json), and [`worklet-route-audit.json`](./worklet-route-audit.json).
