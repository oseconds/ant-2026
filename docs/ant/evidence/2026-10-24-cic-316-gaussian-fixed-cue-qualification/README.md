# 316 × 316 production-Gaussian fixed-cue qualification

**Decision: MIXED / NOT QUALIFIED.** Candidate F improves the current 96-grid production result and keeps most of the local directional improvement seen with 316 CIC. It does not match 316 CIC's wide winner result, and it fails the unchanged Gate 2 family rule on tight and tightMirror local steering MAE. Do not advance F to movement testing or production adoption.

This is a fixed-geometry comparison against analytic engineering cues. It says nothing about biological correctness, free-running routes, or long-run collective behavior.

## Implementation fact

Production source is unchanged. F is the existing `PheromoneField` instantiated at `316 × 316`; `depositPoint()` calls the existing `depositBrush()` and ordinary bilinear `sample()`. The writer uses normalized `[0,1]²` coordinates, `h=1/315`, `R=0.0045`, `σ=R/2=0.00225`, physical distance, `exp(-d²/(2σ²))`, support `d ≤ R`, and normalization over included nodes. Storage remains nonnegative Float32 with node cap 8 and no saturation redistribution. Decay, downstream sensor operators, weights, max, Hill response and deterministic field-only score are unchanged.

The comparison retains the legacy node-sum dose convention. At finer resolution this changes the continuous integral represented by an unchanged node sum; it does not establish physical chemical-mass units. No density scaling was applied.

## Provenance and frozen inputs

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Research base: `codex/ant-cic-316-grid-fixed-cue-qualification-20261024` at `4a23ca73d13cd64e7e1afa6604d5b83d7f8dad57`.
- Representation contract tip: `c3babbf4811ebede0cc4ef5615bd08317c937664`.
- Preregistration commit: `10ba70e`; it was committed before any F cue output was evaluated.
- Frozen station/query input SHA-256: `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`.
- Existing C/D/E rows SHA-256: `29bd7367719f5cbc2efab376bcca9b84b349ed965f72ffa86afd81904bf63ad4`.
- Existing weighted-max profile 26 SHA-256: `3c07e1b9ff3dc88afc3e01291fa55bd7b99f31358c3a04a1a2f2f537c6f6d420`.
- Ordered frozen write stream SHA-256: `c2a15990f33d7b43e7e4761cd80b10a47eab0baec98b1dcced76f47b85cdc0ee`.
- Production source hashes:
  - `src/lib/agents/ant/PheromoneField.js`: `412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd`
  - `src/lib/agents/ant/GasterDeposition.js`: `0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41`
  - `src/lib/agents/ant/AntController.js`: `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04`
- Reused exactly six routes, four phases, 231 stations per route-phase, 5,544 rows, 24 ordered write streams and 77 point writes per stream.

The prior C/D/E package did not retain D/E Float32 node arrays. This pass reconstructed those arrays from the same frozen writes and pinned writer, then matched all saved D/E raster SHA-256 receipts and the saved query/sensor outputs. This is hash-and-output replay evidence; it is not a byte-to-byte comparison against prior D/E node files. Production C raster arrays were present and reproduced directly.

## Gate 1 — representation characterization

The fixed `1001 × 1001` subcell scan covered 1,002,001 source positions and compared 6,326,216 positive-node increments against the production formula. Every comparison was exact; every source had at least one supported node; fallback count was zero. The maximum positive-node distance was `0.004499999720052648`, within `R=0.0045`.

| Active nodes | Positions |
| ---: | ---: |
| 4 | 89,921 |
| 5 | 43,424 |
| 6 | 332,916 |
| 7 | 534,064 |
| 8 | 1,616 |
| 9 | 60 |

Single-dab stored-dose residual ranged from `−4.470348358e−8` to `+4.470348358e−8`. The stored-raster centroid did not exactly preserve the subcell source position: mean displacement `0.000122773`, p90 `0.000208166`, maximum `0.000310634` normalized units. Across all 24 frozen route/phase streams, 1,848 writes accepted `49.6796490758367`; stored node sum was `49.6796490893466`, a `1.3510e−8` residual, with zero capped nodes. Stream centroid error averaged `0.000017009` and maxed at `0.000034469`.

For one isolated dose, bilinear source readout varied from `0.236503` to `0.361930` across subcell phase. The sampled nonzero bilinear read footprint reached `0.00887023` from the source, beyond the writer radius; its value at the furthest sampled point was `2.65736e−5`. This is measured behavior and was not a Gate 1 failure.

The fixed short-segment fixture preserved distinct orientation rasters under F: all six orientation pairs differed. In this two-point assay, 316 CIC E also distinguished every pair, while 96 CIC D had one exact horizontal/vertical alias. F's principal orientation was within about `0.06026 rad` (3.45°) for horizontal/vertical and at numerical precision for the two diagonal orientations. The fixture is a local two-point orientation test, not a curve-retention claim.

Uncapped point writes preserved accepted node-sum dose within the derived Float32 rounding bound. A partially saturated node lost its own excess share without redistribution. Boundary cases were measured separately; out-of-domain writes remained rejected. Decay stayed the inherited 15-second exponential method. The diagnostic guarded RNG calls and observed none.

## Gate 2 — fixed cue results

The table uses the same 5,544 rows and query geometry for every arm. Local sign error denominator is 4,012 nonzero-reference rows; wide winner denominator is 5,072 strict-unique analytic winners. A remains a mathematical engineering reference.

| Arm | Local sign errors | All-row local steering MAE (rad) | Directional-only MAE (rad) | Wide winner errors | Straight false-nonzero / mean |steering| | S zero-cue false-nonzero / mean |steering| |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| C — 96 production Gaussian | 552 | 0.065054 | 0.063132 | 2,378 | 445 / 0.098275 | 364 / 0.035392 |
| D — 96 CIC | 0 | 0.022255 | 0.028790 | 2,378 | 0 / ~0 | 377 / 0.017899 |
| E — 316 CIC | 334 | 0.023059 | 0.031858 | 1,017 | 0 / 0 | 228 / 0.00005897 |
| F — 316 production Gaussian | 10 | 0.022978 | 0.031704 | 1,401 | 439 / 0.00013234 | 323 / 0.00018106 |

F reduces phase steering spread mean from C's `0.117022` to `0.0002655` rad. Its measured mirror steering residual mean is `0.00006631` rad (max `0.0007539`), compared with C's approximately `1.17e−15`; symmetry is close but no longer machine-exact.

### F versus each frozen arm

| Comparison | Local directional rows | Local recovered | Local new errors | Wide rows | Wide recovered | Wide new errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| C → F | 4,012 | 549 | 7 | 5,072 | 988 | 11 |
| D → F | 4,012 | 0 | 10 | 5,072 | 988 | 11 |
| E → F | 4,012 | 326 | 2 | 5,072 | 233 | 617 |

Against E, F recovers 233 E-wide errors but creates 617 new ones, for a net increase of 384 (1,017 → 1,401). E's wide benefit is therefore only partly retained. Against D, F introduces 10 local sign errors while retaining the larger wide improvement over C.

E-specific regression controls: F repairs 261 of 267 E-specific local errors (6 remain) and 167 of 177 E-specific wide errors (10 remain). The prior D 92 new wide errors are all correct under F; all 92 prior D recoveries remain correct under F.

### Route and phase nonregression

The unchanged evaluator requires all three primary measures (local sign count, all-row local steering MAE, wide winner errors) to be nonregressing in each route family and phase. F passes all phase groups. It fails only `tight` and `tightMirror` families: each goes from 39 local sign errors to 0 and from 301 wide errors to 0, but all-row local steering MAE increases from `0.0575761` to `0.0597700` and `0.0597729` rad respectively. The existing rule treats this MAE regression as a failed family check; no metric was reweighted.

| Family | C local errors → F | C MAE → F (rad) | C wide errors → F |
| --- | ---: | ---: | ---: |
| straight | 0 → 0 | 0.098275 → 0.000132 | 0 → 0 |
| gentle | 152 → 3 | 0.059256 → 0.003751 | 828 → 653 |
| tight | 39 → 0 | 0.057576 → 0.059770 | 301 → 0 |
| gentleMirror | 152 → 6 | 0.059256 → 0.003754 | 828 → 659 |
| tightMirror | 39 → 0 | 0.057576 → 0.059773 | 301 → 0 |
| sCurve | 170 → 1 | 0.058383 → 0.010688 | 120 → 89 |

F improves S analytic-zero false-cue count and magnitude against C (364 → 323; `0.035392` → `0.0001811` rad), but is worse than E's 228 and `0.00005897` rad. The unchanged Gate 2 control compares F against C, so it passes that control.

### Prior 26 weighted-max-first profiles

The exact same 26 `tight`/`tightMirror` rows were preserved, with every target/rival five-sample C/D/E/F raw and weighted profile, argmax identity, raw/weighted/final margin and final winner in [profile-26.json.gz](gate2/profile-26.json.gz). In F, the analytic target is raw top, weighted top and final winner on all 26 rows. F's target raw and weighted maxima stay at the inner `±0.5` samples on all 26; the prior D outer `±1` → inner `±0.5` target switch occurs 0/26 in F. This cohort result does not replace the full Gate 2 rule.

## Decision and claim boundary

F is a mixed fixed-cue result, not qualified for a later movement shadow. It substantially improves C's local sign and wide winner counts, nearly retains D's local sign result, and improves S-route wide errors over both C and E. But it remains 384 wide errors worse than E and violates the preregistered tight/tightMirror family MAE nonregression. F therefore does not establish a better overall fixed-cue behavior under the existing Gate 2 contract.

The conclusion is limited by the engineering analytic reference and the unchanged node-sum unit convention. No movement, natural run, sensor tuning, density normalization, or production adoption was performed. No second candidate is proposed or tested. If this line is reopened, first resolve the refined-grid node-sum versus physical-integral contract; do not tune radius, sigma, resolution or downstream gain from this result.

## Reproduction and artifacts

Run:

```powershell
node scripts/ant-316-gaussian-fixed-cue-qualification.js
node --test tests/ant-316-gaussian-fixed-cue-qualification.test.js
```

The complete runner regenerates Gate 1, all 24 little-endian F rasters, exact C/D/E replay receipts, all F fixed-cue rows, the profile cohort and generation hashes. Two consecutive complete generations produced identical `generation-hashes.json`. The 24 raster SHA-256 values and derived artifact hashes are in [generation-hashes.json](generation-hashes.json); validation and final repository checks are in [validation.json](validation.json), and the final file inventory/hashes are in [manifest.json](manifest.json).

A fresh read-only review found no decision-changing numerical issue. It caught that the initial runner checked saved C/D/E controls after Gate 1 had constructed F; the runner now verifies those controls first. Re-running the full fixed-cue generation after that ordering correction reproduced the same scientific hashes. The reviewer then verified all 41 manifest entries.
