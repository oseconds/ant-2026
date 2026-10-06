# ANT single-strike depth propagation

Controlled offline replay from the captured 30-Plate natural snapshot. The worklet source on disk and production recurrence were unchanged. The first decay-only attempt reached the time cap before the Sphere modes quieted and sent no strike; it is excluded. The successful replay reused the same compressed snapshot, allowed all Plate nodes and Sphere modes to remain quiet for 100 ms, then injected one captured valid surface-contact payload through `handleMessage({ type: "strike" })` / `applyStrike()`.

## Run integrity

- Snapshot: `../worklet-state-snapshot.json.gz`, 30 layers, physics step 1,534,928. The restored dynamic-state hash matched the captured hash (`830c556d9b4e6a1de18dc42f09080839bdd617db050b30585827f0e819f38286`).
- Frozen-topology decay before strike: 17.3768 simulated seconds; 0 active Plate nodes and 0 active Sphere modes at injection.
- One strike only: `trail-plate-30`, position `(0.6130956791, 0.1346496445)`, strength `0.01966897`, 3 ms pulse, 75 ms contact recovery, ×50 Plate damping. No additional event-stream strikes were replayed.
- Response: 7.9005 simulated seconds. One strike accepted, zero dropped routes, zero non-finite values, zero extra strikes. The topology SHA-256 was unchanged across the replay.
- The recorded strike source cell is `(58,13)`. Its vertical material stack contains 17 of 30 Plates and reaches only as deep as `trail-plate-5` (depth 25); `trail-plate-1` is absent from that column.

## Findings

Energy dB is `10*log10(layerPeakEnergy / surfacePeakEnergy)`, with a floor of `max(surfacePeakEnergy × 1e-12, 1e-30)`, so the reported floor is −120 dB. `peakEnergy` is the maximum per-step layer sum of `current² + velocity²`; “first arrival” is the first crossing of the existing `SLEEP_ENERGY = 1e-10` quiet-energy condition. Coupling work is signed solver-space force × midpoint velocity, not joules. The CSV contains the complete 30-layer profile, including direct-contact work, damping proxy, arrival, threshold duration, wake/affected fractions and sleep timing.

| Depth from struck surface | Plate | Peak energy vs surface | Signed Z work | Signed Sphere work | First arrival | Mean node awake | Affected nodes |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | trail-plate-30 | 0.0 dB | −8.91e−9 | 0 | 0.17 ms | 6,000 ms | 100% |
| 1 | trail-plate-29 | −36.5 dB | +6.03e−9 | 0 | 2.8 ms | 2,713 ms | 39.0% |
| 2 | trail-plate-28 | −50.1 dB | +1.73e−10 | 0 | 4.3 ms | 1,748 ms | 14.1% |
| 3 | trail-plate-27 | −77.6 dB | +6.67e−12 | 0 | — | 561 ms | 0% |
| 11 | trail-plate-19 | −75.3 dB | +7.77e−12 | 0 | 173.7 ms | 135 ms | 0.5% |
| 28 | trail-plate-2 | −93.1 dB | +5.32e−13 | 0 | — | 22 ms | 0% |
| 29 | trail-plate-1 (oldest) | −120 dB floor; zero measured energy | 0 | 0 | — | 0 ms | 0% |

Only **1/30** layers exceeded −20 dB and **2/30** exceeded −40 dB. **28/30** had at least one actual asleep-to-awake transition. This separates wake propagation from useful energy propagation: most deep layers woke while remaining below the sleep-energy arrival threshold. From depth 3 onward, peaks were ≤−75 dB; those layers were active briefly, and the oldest Plate was neither reached nor awakened. Sphere coupling work was zero in every layer during this response.

The profile is strongly depth-localized near the strike: it falls 36.5 dB in the first layer and 50.1 dB by depth 2. The deeper tail is irregular rather than monotonic, which is consistent with overlap/connectivity modulating the depth loss. At this hit location, the oldest Plate is not in the co-located material stack, so its zero response is geometry-specific; one position cannot establish a network-wide depth-versus-overlap ranking. A second position was omitted because the full offline replay was CPU-expensive.

## Artifacts

- [depth-profile.csv](depth-profile.csv): one row per Plate layer.
- [depth-propagation.json](depth-propagation.json): state/topology hashes, strike record, complete layer profile and 250 ms samples.
- [diagnostic harness](../../../../../../scripts/ant-depth-propagation-diagnostic.js): in-memory solver observers only; source equations remain untouched.
