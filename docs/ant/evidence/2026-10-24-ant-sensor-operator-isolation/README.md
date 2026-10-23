# ANT pheromone sensor operator isolation — 2026-10-24

## Decision

**MIXED; no sensor candidate was tested.** Local steering sign failures are already present in the frozen raw samples. The local profile and two-distance pooling stages create no additional sign reversals in those rows. Local balance converts the raw lateral contrast difference into most of the measured steering error, while strength scales its size. Wide analysis has two distinct stage measures: full candidate rank order first differs at raw maxima for 1,931 rows and after production weighting + max for 447; among final winner mismatches, production is already away from the analytic final winner at raw maxima for 1,380 rows and first departs after weighting + max for 998. Thus raw maxima account for the majority, while weights + max remain a substantial minority. Hill and the deterministic confidence/directional score add no first divergence in either comparison.

This does not justify changing the sensor. Return to the field representation question before proposing a sensor-only change. No claim is made about long-run movement or biological sensing.

## Implementation facts

The production baseline is fresh `origin/main` at `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. Production source is unchanged. SHA-256 receipts:

| File | SHA-256 |
| --- | --- |
| `src/lib/agents/ant/AntController.js` | `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04` |
| `src/lib/agents/ant/PheromoneField.js` | `412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd` |
| `src/lib/agents/ant/GasterDeposition.js` | `0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41` |

The local sensor's current expression, reproduced from `AntController.senseLocalTrail`, is:

```text
18 samples, ordered as 2 distances × 3 lateral positions × 3 transverse taps
→ each profile = taps × [0.25, 0.5, 0.25]
→ left / center / right = average across the two distances
→ strength = Hill(sqrt(max(profile0) × max(profile1)), halfSat 0.018, exponent 3)
→ coherence = minimum of the two profile contrast measures
→ balance = (right − left) / (left + center + right + 1e-9)
→ steering = 0.45 × balance × strength
```

Coherence does not enter this returned steering expression. It is used later by `updateTrailAdherence`, which is outside this fixed sensor-only movement boundary.

The production wide readout takes five transverse samples for each candidate heading, multiplies them by `[0.55, 0.775, 1, 0.775, 0.55]`, and selects the maximum. It then applies a Hill response with half-saturation `0.035` and exponent `3`. For deterministic rank attribution, the existing research score is reproduced as:

```text
response × 2.8 + (cos(offset) − 1) × responseRange × 0.55
```

This score is the prior analytic-reference harness's field-only rank diagnostic. It excludes current `updateIntention` crowding, adherence, random score jitter, exploration, and weighted stochastic choice; it is not a prediction of the actual selected heading.

## Frozen inputs and provenance

No route, station, query, RNG stream, or field was regenerated. This pass reused the exact 5,544 analytic-reference rows: six shapes (`straight`, `gentle`, `tight`, both mirrors, `sCurve`) × four phases (`p00`, `p10`, `p01`, `p11`) × 231 stations. Every row retains the 18 local raw samples, five candidates × five wide raw samples, and their saved physical query coordinates.

Source evidence:

- Analytic-reference branch: `codex/ant-field-analytic-reference-20261023`
- Commit: `2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa`
- Analytic attribution JSON SHA-256: `1b60936621c0a2c3fa352763c0d6950615d630ea46bb5f0015284c83d148a6b9`
- Analytic script SHA-256: `1a9ba25d6e128a67c3795f6cb1b97bf1ee3e62ee38c8d71d893141ccce9fea2e`
- Reused `station-raw.json.gz` SHA-256: `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`

The copied input is [`inputs/station-raw.json.gz`](inputs/station-raw.json.gz). Per-row local and wide intermediate values are in [`computed/sensor-stage-rows.json.gz`](computed/sensor-stage-rows.json.gz), keyed to the source row by `rowIndex`. Global and per-shape summaries plus all sign-failure and strict-unique winner-mismatch rows are in [`computed/sensor-operator-attribution.json`](computed/sensor-operator-attribution.json).

## Protocol and stage attribution

Local sign checks use a numerical floor of `64 × Number.EPSILON × max(1, raw magnitude)`, which evaluates to `1.4210854715202004e-14` for this cohort. Cue geometry labels use only the analytic branch: values inside that floor are ambiguous; remaining values at or below the per-shape median absolute analytic steering are weak; values above the median are clear. This weak/clear split is descriptive, not a steering or perception threshold.

For local first-divergence attribution, a diagnostic raw-side statistic averages the three saved transverse samples at each lateral position without production's `[0.25, 0.5, 0.25]` weights, then compares right minus left at each distance. It is an audit statistic, not a production operator. The next stages are production band weighting, two-distance pooling, balance, positive strength scaling, and returned steering.

For each wide strict-unique analytic winner mismatch, full five-candidate order is checked at four points: raw five-sample maxima (diagnostic, before production weights), weighted maxima, Hill response, and final deterministic confidence/directional score. Separately, at those same production stages, the current production winning candidate is compared with the analytic final-score winner; the first stage where they differ is retained. The first measure detects any full-rank permutation, while the second traces when the production winner leaves the analytic final choice. Exact analytic ties are excluded using the source `strictUniqueWinner` flag; all winner margins are also retained continuously without bins or post-hoc thresholds.

## Results

### Local sensor

| Measure | Result |
| --- | ---: |
| Frozen rows | 5,544 |
| Analytic cue: ambiguous / weak / clear | 1,532 / 2,018 / 1,994 |
| Production raw-side mean agrees with analytic cue | 3,460 / 4,012 (86.24%) |
| Exact nonzero sign disagreements | 549 / 4,012 |
| Sign disagreements on clear / weak analytic cues | 314 / 235 |
| Stable opposite steering signs after precision floor | 546 |
| Production near-zero signed residues among those 549 | 3 |
| Earliest divergence among all 549 | Raw-side mean: 549; band weighting: 0; two-distance pooling: 0 |
| Mean absolute steering error | 0.0650535396 rad |
| Raw → profile field-value MAE ratio | 0.8612 |
| Raw → L/C/R field-value MAE ratio | 0.8401 |

All 549 sign disagreements begin in the raw sample-side means before the production profile weights. They occur in 314 clear and 235 weak analytic cues under the descriptive per-shape median split; none comes from the explicitly ambiguous class. The three near-zero cases have production steering around `−1.16e-15` to `−1.17e-15` rad while analytic steering is positive; they are retained as sign differences but identified as numerical near-zero output, not stable opposite cues. Six non-ambiguous analytic rows in total collapse to production steering inside the same precision floor.

Among the 549 exact sign-disagreement rows, an exact symmetric product decomposition of steering error attributes mean absolute contribution `0.05575 rad` to balance and `0.00186 rad` to strength. Splitting balance's ratio into numerator and denominator terms attributes `0.05448 rad` to the lateral numerator difference and `0.00177 rad` to denominator change; reconstruction residual is `4.84e-17`. The smallest production denominator is `0.0410`, compared with the explicit `1e-9` stabilizer, so these rows do not show an epsilon-dominated division. Balance is the largest quantitative converter of existing raw contrast error, but it does not create the observed sign direction: the sign is set by `right − left` before normalization. Strength is nonnegative and cannot reverse it. Coherence does not enter returned steering.

The straight control has analytic steering exactly zero in all 924 rows. Production p00 and p10 mean steering is `0.19690` and `0.19620` rad; p01 and p11 remain within about `1.25e-15` rad of zero. This is a field/phase error around a symmetric reference, not a directional failure by the analytic sensor geometry. The S route has 392/924 ambiguous rows (98 stations × four phases) where analytic steering is zero. Mirrored steering remains opposite to numerical precision: maximum absolute mirror-sum error is `5.40e-15` rad for the reference and `6.48e-15` rad for production.

### Wide sensor

| Measure | Result |
| --- | ---: |
| Strict-unique analytic winners | 5,072 / 5,544 |
| Production winner mismatch | 2,378 / 5,072 (46.88%) |
| First full-rank-order divergence: raw transverse maxima | 1,931 / 2,378 (81.2%) |
| First full-rank-order divergence: production weights + max | 447 / 2,378 (18.8%) |
| First full-rank-order divergence: Hill / directional score | 0 |
| Production winner first differs from analytic final winner at raw maxima | 1,380 / 2,378 (58.0%) |
| Production winner first differs after production weights + max | 998 / 2,378 (42.0%) |
| Production winner first differs at Hill / final score | 0 |
| Reference/production weighted-sample argmax differs | 4,840 / 27,720 candidate readouts (17.46%) |
| Confidence penalty changed the analytic-arm winner | 12 rows |
| Confidence penalty changed the production-arm winner | 6 rows |

The two rank measures are not interchangeable. Full-rank divergence can occur while both branches retain the same top candidate; this is why its raw/weighted split is 1,931/447. The direct winner-departure comparison shows that 998 of 2,378 final winner mismatches first arise at production weights + max, a substantial subset, while a majority (1,380) is already present at raw maxima. The separately recorded full candidate order and production-stage winners in the stage rows allow both statements to be checked per case.

The Hill response is strictly increasing and preserves candidate order. Across all candidate pairs its response-error gain relative to input error divided by the `0.035` half-saturation is mean `0.2218`, maximum `0.8396`; top-versus-second margins are likewise contracted (median gain `0.7105`, maximum `0.8398`). It changes response scale but does not explain a first candidate rank reversal. The later confidence/directional penalty sometimes changes a branch's own winner, but it is not the first rank divergence in any of the 2,378 analytic-versus-production strict-unique mismatch rows.

No margin threshold was imposed. Among mismatches the analytic winner margin has median `0.09347`, 95th percentile `1.78307`, and maximum `1.81869` score units, so the disagreement set includes large-margin cases as well as near ties.

Two representative rows are selected by measured rule, not listening:

| Role | Frozen row | Result |
| --- | --- | --- |
| Strongest weighted-max responsibility case: largest analytic margin among weighted-max-first mismatches | tight, p10, station `0.066` | Analytic winner `0`, margin `1.78307`; both pre-weight raw maxima favor `0`, while production weighted max switches to `+0.47`. This is a concrete max/weight-stage contribution. |
| Strongest raw-stage counterexample: largest analytic margin among raw-first mismatches | tight, p00, station `0.294` | Analytic winner `0`, margin `1.81869`; production raw maxima already favor `+0.47` (`0.04109` vs `0.03529`), before production weights, Hill or score. |

These rows retain full candidate raw values and all later stages in the compressed stage data. The second is also the previously named tight-route example.

## Classification and interpretation boundary

| Responsibility | Classification | Result |
| --- | --- | --- |
| Raw local representation sufficiency | **PARTIALLY SUPPORTED** | The diagnostic raw-side mean agrees in 86.24% of non-ambiguous rows, but all 549 exact sign disagreements first appear at raw samples; six cues collapse to near zero. |
| Local profile aggregation | **NOT SUPPORTED as the first sign-failure cause** | It reduces mean field-value error; it adds no sign reversal among failed rows. |
| Local strength | **PARTIALLY SUPPORTED** | It changes magnitude; exact sign-error contribution is much smaller than balance and cannot reverse sign. |
| Local coherence | **NOT SUPPORTED as a direct steering cause** | It is absent from the returned steering formula; later adherence effects were not run. |
| Local balance | **SUPPORTED as the largest steering-error converter** | Most angular error contribution comes through the balance numerator, while sign direction was already wrong in raw-side evidence. |
| Wide transverse weights + max | **PARTIALLY SUPPORTED** | First full-order divergence for 447 rows; direct comparison with the analytic final winner first departs here for 998/2,378 (42.0%), a substantial minority. |
| Wide Hill response | **NOT SUPPORTED as a rank-reversal cause** | Monotonic and empirically contracts normalized error/margin in this cohort. |
| Confidence/directional score | **NOT SUPPORTED as the first cross-arm divergence** | Zero mismatch rows first diverge here; it changes branch winners in 12 reference and 6 production rows. |
| Geometry ambiguity | **SUPPORTED** | Straight reference is exactly symmetric; S has 392/924 zero-cue rows. |
| Sensor-only candidate | **NOT TESTED / not justified** | Raw maxima already account for the majority of final wide winner mismatches, and all local sign differences begin in raw-side evidence; the weighted-max subset does not establish one sensor-wide dominant cause. |

### Claim boundary

- **Implementation fact:** the equations, constants, production call order, and deterministic research score described above.
- **Fixed-input result:** all counts and errors are conditional on the six analytic route fixtures, four phases, and saved query coordinates.
- **Design interpretation:** return to field representation before altering the sensor. The analytic cue is a dose-mapped mathematical reference, not biological ground truth. No movement consequence is inferred.

## Validation and reproduction

The new three-test suite checks all 5,544 rows, exact saved local/wide geometry coverage, current `AntController` local output and wide max parity for every frozen raw stream, zero RNG use, deterministic output, rank/winner reconstruction, straight symmetry, and mirror error. Focused existing suites also passed: trail following 8/8, controller 21/21, and pheromone field 8/8. Total focused result: 40/40 tests. `node --check` passed for the analysis and test scripts. Full build was omitted because production source is unchanged and this pass adds only a research analyzer, tests, and evidence.

Reproduce from repository root:

```powershell
node --check scripts/ant-sensor-operator-isolation.js
node --check tests/ant-sensor-operator-isolation.test.js
node scripts/ant-sensor-operator-isolation.js `
  docs/ant/evidence/2026-10-24-ant-sensor-operator-isolation/inputs/station-raw.json.gz `
  docs/ant/evidence/2026-10-24-ant-sensor-operator-isolation/computed/sensor-operator-attribution.json `
  8c60e4bba3bd5b476300e90a2936bfebd1f831c2
node tests/ant-sensor-operator-isolation.test.js
node tests/ant-trail-following.test.js
node tests/ant-controller.test.js
node tests/pheromone-field.test.js
```

Receipts are in [`validation/`](validation/). Process chronology: [daily log](../../../daily/2026-10-24-sensor-operator-isolation.md).
