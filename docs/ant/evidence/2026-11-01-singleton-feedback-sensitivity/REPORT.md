# Singleton-only local feedback sensitivity

## Question and authority

This one-seed, 300 s paired probe asks whether an uncontested mature local X capture, when added only to tick-entry retained-material movement feedback, reorganizes later B/C opportunity and conflict structure.

Production authority is `main@bc045dc3caa5954df633ecbee37fbabcb8224f30`. The paired experiment began from `2cfe9cbab78df2af9e77d9df450c67fb603aa22c` on `codex/ant-singleton-feedback-sensitivity-20261101`. Production `TrailPlateBirth` remains the source-to-boundary selector.

**Classification: LIMITED / MIXED FEEDBACK SENSITIVITY.** The overlay exercised all three adopted movement consumers and the treatment later diverged in formation and production birth history. The size and direction of those changes varied by time window, so this one seed does not show a uniform reorganization.

## Implementation fact

The only production-source delta from the stated authority is an optional `researchLayerCountProvider` hook in [AntController.js](../../../../src/lib/agents/ant/AntController.js). When no provider is supplied, the existing tick-entry material layer vector is unchanged. When supplied, a nonnegative integer is added once to that vector before the same entries feed desired speed, the native A turn-rate ceiling, and D same-flow headway. The research overlay is never added to `MaterialStratigraphy` and is not read by Plate, Nodule, audio, or renderer code.

The treatment uses a separate 96×96 `Uint16Array`. At each live one-second production analysis boundary, the observer updates B and C tracks, applies the unchanged 20 s / `.60` maturation grammar, collapses exact same-X options, and checks the new X against every other currently mature distinct X. A degree-zero new X adds one overlay layer to each of its cells once. A contested X records a no-commit decision and is not queued or retried. Observer updates happen after the completed tick; the first movement read can occur only on the next tick.

No 10 s commit cadence, production birth gap, corridor refractory, contact repeat gate, capacity limit, winner score, or candidate feedback was added. The production Plate law continued normally.

## Control conformance

CONTROL reproduced the frozen seed `20261005` history through all 300 shared analysis boundaries:

- E, F, B, C, D and production layer/top-cell maps matched exactly.
- All 14 production Plate IDs, times, and masks through 300 s matched.
- All 300 saved boundary RNG call counts and states matched.
- The live B/C observer matched 25,364 opportunity rows and 1,244,304 captured X-cell memberships; its 277 maturation events matched the frozen event identities and masks.
- The treatment matched CONTROL tick-state fingerprints through the completed tick at the first singleton overlay boundary: 2,521 ticks. The first overlay was added after the completed tick at 42.0167 s and first reached an ant at tick entry at 44.0167 s.

An initial validation attempt stopped on raw array-order comparison of simultaneous event records. It had no field, mask, time, or world-state discrepancy and no treatment had started. The final validator compared the frozen event identity `(channel, frozen track ID, interval number)` and then checked all event fields and X masks; all 277 identities matched. A separate preliminary control-only capture is retained in `analysis/control-capture/` as validation material; it is not used as a third arm or in the paired outcome calculation.

## Direct feedback exposure

The treatment created 151 singleton overlay episodes: 29 B-only, 22 C-only, and 100 exact same-X coeval `{B,C}` episodes. It rejected 85 newly matured distinct-X decision groups as contested. The overlay accumulated 2,498 layer-cell incidences on 1,812 cells (19.66% of the 9,216-cell grid), with a maximum overlay count of four at a cell.

| Treatment exposure | Result |
|---|---:|
| Living-ant ticks | 268,721 |
| Ant-ticks with `L_research > 0` | 52,564 (19.56%) |
| Unique exposed ant IDs | 361 |
| `L_research` median / q90 / max | 1 / 2 / 4 |
| `L_effective` median / q90 / max | 3 / 6 / 10 |
| Speed multiplier applicable | 52,564 exposed ant-ticks |
| A turn-rate ceiling changed | 52,564 exposed ant-ticks |
| D same-flow target changed | 4,255 exposed ant-ticks |
| Research-observer RNG calls | 0 |

For the same exposed tick-entry states, median arithmetic differences were `m(L_effective)-m(L_production) = -0.01342`, `qA(...) = -0.06708`, and `hD(...) = +0.06708`. The q90 differences were `-0.00634`, `-0.03169`, and `+0.11933`, respectively. These are counterfactual multiplier differences for exposed ant-ticks, not a third arm.

Exposure by fixed 60 s windows was 815, 7,301, 12,357, 16,164, and 15,927 exposed ant-ticks. All exposure and per-ant tick-entry L tuples are retained in `analysis/treatment-exposure.json.gz`.

## Formation landscape

Across 300 anchors, CONTROL recorded 277 maturations (147 B, 130 C); TREATMENT recorded 336 (179 B, 157 C). Mean active opportunity rows increased from 41.87 B / 42.68 C to 44.96 B / 45.65 C. Mean unique mature-X options increased from 7.70 to 9.76; mean contested options increased from 2.87 to 4.37. Contested options were 861/2,309 option appearances in CONTROL (37.3%) and 1,312/2,927 in TREATMENT (44.8%). Anchors with any contested option rose from 182/300 (60.7%) to 242/300 (80.7%).

The time pattern was mixed rather than a uniform upward shift:

| Native analysis-time window | Mean mature X: control → treatment | Mean singleton options: control → treatment | Mean contested options: control → treatment | New B/C maturations: control → treatment | Accepted singleton overlay episodes |
|---|---:|---:|---:|---:|---:|
| 0–60 s | 0.92 → 0.93 | 0.68 → 0.68 | 0.23 → 0.25 | 3 / 3 → 3 / 3 | 4 |
| 60–120 s | 5.12 → 9.98 | 3.40 → 6.88 | 1.72 → 3.10 | 27 / 25 → 39 / 35 | 37 |
| 120–180 s | 11.42 → 10.30 | 9.65 → 4.72 | 1.77 → 5.58 | 44 / 44 → 43 / 33 | 30 |
| 180–240 s | 11.22 → 10.62 | 6.02 → 4.60 | 5.20 → 6.02 | 42 / 38 → 30 / 30 | 24 |
| 240–300 s | 9.82 → 16.95 | 4.38 → 10.03 | 5.43 → 6.92 | 31 / 20 → 64 / 56 | 56 |

The largest late-window difference was a rise in both new B and C maturations and in the number of mature options. In the middle windows, total mature-option means stayed close while option composition shifted toward more contested X captures. The complete per-boundary census, including X centers, entry distance, F-component identity, and masks, is in the paired signal files.

## World and production-formation context

The research layer remained separate from production material. Ordinary production births nevertheless changed downstream because the treatment changed movement and later native history:

| Checkpoint | Living ants C/T | Cumulative spawned C/T | Realized travel C/T | Production Plates C/T | Production-material coverage C/T | Research overlay coverage / incidences / max cell count (T) |
|---:|---:|---:|---:|---:|---:|---:|
| 60 s | 13 / 15 | 51 / 54 | 34.35 / 34.99 | 0 / 0 | 0 / 0 | 177 / 177 / 1 |
| 120 s | 12 / 17 | 129 / 124 | 87.26 / 88.03 | 3 / 3 | 1,353 / 1,265 | 741 / 924 / 3 |
| 180 s | 17 / 15 | 216 / 212 | 145.21 / 146.95 | 8 / 4 | 2,762 / 1,801 | 931 / 1,143 / 4 |
| 240 s | 19 / 13 | 307 / 304 | 203.98 / 203.13 | 12 / 8 | 3,954 / 3,659 | 1,437 / 1,909 / 4 |
| 300 s | 18 / 16 | 399 / 394 | 263.42 / 257.32 | 14 / 9 | 4,826 / 4,274 | 1,812 / 2,498 / 4 |

The current production selector was available on the same 245/300 analysis boundaries in both arms, but its complete candidate record matched at none of those jointly available boundaries. Actual production Plate birth times were also different (CONTROL: 14; TREATMENT: 9; no shared birth timestamp). The first treatment birth was at 86.017 s versus 95.017 s in CONTROL. The production source-to-boundary code was unchanged; these are downstream outcomes on diverged worlds, not research overlay Plates.

Pheromone and SurfaceField hashes had diverged by the 60 s checkpoint. B chemical-memory sum also diverged. Production material layer/top maps still matched at 60 s, then differed at the 120 s and later checkpoints. Checkpoint pheromone, SurfaceField, B, material, occupancy, and population records are in `analysis/paired-comparison.json.gz`.

The recorded blocked counts are tick-end `wasBlocked` flags: summed ant-ticks and ticks with at least one flagged ant. They fell in treatment at each checkpoint; this is a descriptive movement-state count, not an independently authored congestion measure.

## Review assets and machine-readable output

The matched plots use one scale per chart and the same actual analysis boundaries:

- [Mature unique-X options](visual/mature-options.svg)
- [Singleton and contested options](visual/singleton-contested.svg)
- [Research overlay coverage](visual/research-overlay-coverage.svg)
- [Research overlay layer-cell incidences](visual/research-overlay-layer-cell-incidences.svg)
- [Maximum overlay layer count](visual/research-overlay-max-layer-count.svg)
- [Direct exposure by 60 s window](visual/direct-ant-exposure.svg)
- [Production Plate births](visual/production-plate-births.svg)

Full paired anchors and decisions: `analysis/control.signals.json.gz` and `analysis/treatment.signals.json.gz`. Checkpoints and window comparisons: `analysis/paired-comparison.json.gz` and `analysis/paired-windows.json`. Detailed tick-entry L exposure: `analysis/treatment-exposure.json.gz`. Independent graph, decision, overlay, and per-ant exposure reconstruction: `analysis/independent-checks.json`.

## Research conclusion

### IMPLEMENTATION FACT

One default-off tick-entry addend fed the existing shared L vector for speed, A, and D. B/C/X observation and singleton acceptance used the locked definitions; accepted X layers changed only the research overlay. Production `TrailPlateBirth`, `MaterialStratigraphy`, audio, and renderer code did not change.

### MEASURED CLOSED-LOOP RESULT

Treatment received substantial direct exposure (52,564 exposed ant-ticks, with speed and A changed on all of them and D changed on 4,255). Its opportunity and conflict landscape diverged from matched CONTROL, and native production Plate births changed from 14 to 9 by 300 s. Formation changes were temporally uneven: option counts rose sharply in 60–120 s and 240–300 s, while 120–240 s had similar total option counts but a higher contested share.

### RESEARCH INTERPRETATION

**LIMITED / MIXED FEEDBACK SENSITIVITY.** In this seed and horizon, the frozen opportunity statistics are not dynamically stable under singleton-only retained-material feedback. The evidence supports a closed-loop effect but shows a time-varying response, not a uniform directional conclusion.

### NOT ESTABLISHED

This does not validate singleton-only materialization as a formation law, establish reproducibility across seeds, justify real research Plates, or determine whether an actual-material integration would preserve these effects. No B/C arbitration, material-property difference, capacity rule, coalescence, Residence interaction, or production adoption was tested.

### Smallest justified next question

Does the same locked overlay produce a comparable time-varying opportunity shift in a second matched seed before considering actual-Plate integration?
