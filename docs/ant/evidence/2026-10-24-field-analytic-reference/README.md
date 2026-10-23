# Pheromone field analytic-reference attribution — 2026-10-24

## Decision

**MIXED. No field alternative was tested or selected.** The first difference from the continuous reference is already present in the production Float32 raster. Bilinear reconstruction adds a larger mean absolute raw-read component in both sampled sensor sets, while the local and wide sensor transforms turn those representation errors into steering and candidate-winner changes. These effects vary by route and phase, so this pass does not justify one field representation change.

Production `src/` is unchanged. No free-running simulation, natural query cohort, movement replay, field replacement, damping change, or selector change was run.

## Implementation facts and frozen protocol

- Production base: fresh `origin/main` at `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Reused route definitions: `d0e07d089c82d29409c7dd067e17cdeb9a5ecf7f`.
- Reused four-phase protocol and diagnostic context: `9e197ca3e7495a01dbcfdd0927dcbd4c974acf31`.
- Six controlled shapes: straight, gentle arc (R=.25), tight arc (R=.10), both mirrored arcs, and the established S route. Each uses 231 route stations from −.12 through .34 at .002 spacing. Each shape was evaluated at p00, p10, p01 and p11, for 24 route/phase arms.
- Phase translations: p00=(0,0), p10=(.5/95,0), p01=(0,.5/95), p11=(.5/95,.5/95). Route, body pose, local queries and every wide candidate query translate together. Each representation therefore receives the same geometry in its own translated coordinates.
- Local queries: the production 18 reads, in the same 2-distance × 3-side × 3-band order. Wide queries: the production five candidate offsets and five transverse reads per candidate. Tests record the actual `AntController` calls and compare their coordinates to the frozen harness geometry.
- The production arm uses `PheromoneField` (96×96 Float32, 15 s half-life, cap 8, radius .0045), `GasterDeposition` default dab mode (spacing .006), rate 4.5 and `PheromoneField.sample` bilinear reads. Every route emitted 77 point dabs; requested dose ranged from 2.0699655002 to 2.0700000000 and the largest Float32 mass residual was `5.4314736708e-8`. No cap cell was reached; the largest cell was .0810000002.
- This is one static spatial imprint. No elapsed-time decay step was applied, no RNG was called, and no stochastic candidate option was chosen. The field, dose and write operations are production code; only the frozen route driver and analytic/reference analysis are research code.

## Continuous analytic reference

The reference uses the same controlled route as a piecewise-linear physical trail. Its continuous scalar cue is

```text
F(q) = cellArea × rate × ∫route K(||q − r(s)||) ds
K(d) = exp(−d² / (2σ²)) / Z, for d ≤ R; otherwise 0
Z = 2πσ² × (1 − exp(−R² / (2σ²)))
```

Here `cellArea = 1/95²`, `rate = 4.5`, `σ = .00225`, and `R = .0045`. The compact Gaussian integrates to one over its support disk. The line integral follows polyline arclength; the production dab stream requests the same total distance dose. The factor `cellArea` expresses the continuous density in per-grid-cell dose-equivalent units so it can be compared with stored cell values. A 16-point Gauss–Legendre rule integrates each exact segment interval clipped by the support disk. An independent Simpson integration verifies the straight-line center value; straight symmetry and both curved mirror transforms are tested.

This is an explicit, dose-mapped diagnostic reference. It is not biological ground truth, and it is not a claim that a continuous line convolution is exactly equivalent to production's discrete, normalized point dabs. The production cap is not exercised by these fixtures.

## Reconstruction and attribution method

For each phase, the analytic reference is sampled at the same grid nodes. At each fixed query:

```text
C1 writer/storage = bilinear(production Float32 nodes − analytic reference nodes)
C2 reader         = bilinear(analytic reference nodes) − analytic continuous query
total read error  = production bilinear query − analytic continuous query
                  = C1 + C2
```

`C1` necessarily includes bilinear interpolation of the nodal residual; a stored raster has no off-node value without a read operation. `C2` measures the error of bilinearly reconstructing ideal analytic node samples at the same query. The decomposition is retained per raw local and wide sample. Maximum `abs(total − (C1+C2))` was `2.7755575615628914e-17` for both query sets, the observed Float64 arithmetic residual.

## Results

### Writer and stored raster

Across 221,184 node comparisons, the all-node MAE is `0.0001539068`; zeros outside the narrow footprint dominate that average. Within the union of nonzero production/reference support (1,144 arm-cell entries), MAE is `0.0299767706`, with maximum `0.0705935066`. There are 294 production-only and 11 reference-only support entries across the 24 arms. This is the earliest measured difference: production Float32 values at fixed nodes already differ from the continuous reference sampled at those nodes.

### Reader decomposition at the frozen raw queries

| Query set | C1 writer/storage MAE | C2 bilinear reconstruction MAE | Total production read MAE | Total maximum absolute error | C2 enlarges / reduces / equals `abs(C1)` |
| --- | ---: | ---: | ---: | ---: | ---: |
| Local raw reads (99,792) | .0102560 | .0170356 | .0173355 | .0840935 | 58,931 / 12,581 / 28,280 |
| Wide raw reads (138,600) | .0026824 | .0035050 | .0034400 | .0840935 | 18,323 / 7,800 / 112,477 |

The C1 and C2 signs oppose in 43,330 local and 17,298 wide samples, so their absolute magnitudes cannot be added as an error budget. C2 is larger than C1 by pooled MAE in both query sets, but C1 remains material and is the first divergence. The total signed means are near zero because positive and negative errors cancel; MAE and extrema retain the failures.

### Local aggregation

| Output | MAE | Maximum absolute error |
| --- | ---: | ---: |
| Left | .008489 | .038343 |
| Center | .024103 | .047650 |
| Right | .011098 | .038343 |
| Strength | .111901 | .778860 |
| Coherence | .188972 | .9999999 |
| Balance | .188484 | .9999909 |
| Steering | .065054 rad | .257122 rad |

Among 4,012 rows with nonzero analytic steering, production steering had the opposite sign in 549 (13.7%). A further 1,532 rows have exactly zero reference steering; exact-zero sign bookkeeping is sensitive to floating roundoff and is not treated as a directional error rate. Across station groups, the production four-phase local-steering range averaged .117022 rad (p90 .222749, max .250496). The matched raw local-read phase range averaged .014640 (max .045807).

**Straight control:** analytic steering is exactly zero at all 231 stations and all four phases, as expected for a perfectly centered symmetric line. Production steering averaged .196903 rad at p00 and .196196 rad at p10, versus numerical residuals of `1.14e-15` and `1.14e-15` rad at p01/p11. At station .122, p00 produced `.197090` rad and p01 produced approximately `−1.17e-15` rad while both references were zero.

The p00 straight line is at y=.5, exactly halfway between grid rows 47 and 48: nearest-row distance `.00526316` exceeds support radius `.0045`. All 77 dabs therefore have no supported row node and use the source's nearest-node fallback, which rounds row coordinate 47.5 to row 48. The p01 line is at y=`.50526316`, exactly on row 48. The test confirms both production writes create byte-identical stored rasters occupying only row 48. The physical query moves with each route, so the same one-row raster is read at different subcell phases; p00 gains a one-sided L/R contrast while p01 remains symmetric. This directly explains the earlier strong-versus-near-zero straight result.

### Curved, mirrored and S fixtures

For nonzero analytic steering, opposite signs occur in 152/868 gentle, 39/872 tight, 150/868 mirrored-gentle, 38/872 mirrored-tight, and 170/532 S rows. Exact sign classification includes values arbitrarily close to zero; no tolerance threshold was introduced. The curved routes therefore show representation-caused sign failures, while the S fixture also contains a substantial geometry-limited region: the analytic local sensor returns exactly zero steering over stations [−.044,.024], [.122,.190] and [.286,.340] (98/231 stations per phase). At station .122, the analytic center profile is `.062795` with left and right both zero, so the fixed local geometry has no directional balance even though the center sensor sees trail. The production raster turns that same reference case into steering `−.077504`.

Mirror consistency is the strongest counterexample to arbitrary orientation failure: the maximum absolute sum of paired mirrored production steering is `6.48e-15` for gentle and `5.50e-15` for tight routes. The analytic mirror residuals are similarly at Float64 roundoff. Thus the discretization can preserve this mirror transform while still producing large phase-dependent errors relative to the analytic cue.

### Wide max and deterministic candidate ranking

Across 27,720 candidate responses, the candidate weighted-maximum MAE is `.0070183` (max `.0801211`); the Hill-response MAE is `.0944270` (max `.8501262`). The field-only deterministic score MAE is `.293148`. This score keeps the production field response and confidence-dependent directional term, with zero crowding/adherence and no jitter or RNG; it is a ranking diagnostic, not an actual selected option or movement result.

Raw winner disagreement is 2,481/5,544 station-phase rows. The analytic score has no directional contrast and an exact top tie in 472 rows; those tie-break changes are not meaningful winners. Of the remaining 5,072 rows with a strictly unique analytic top score, 2,378 (46.9%) choose a different production top candidate. The uniqueness test is strict `top > second` with no invented tolerance. Candidate ranks change in 3,076/5,544 rows. A large-margin example is the tight route at station .294, p00: analytic winner offset 0 with reference top margin 1.818687, production winner offset +.47. The straight control has zero wide winner disagreements among its 848 strict-unique-reference rows; its 16 raw disagreements all come from tied, no-contrast references.

Across the 1,386 station groups, the production wide winner depends on phase in 344. Candidate response phase range averages .092258 (maximum .618374). The wide max plus Hill response can therefore convert raster/read differences into substantial deterministic candidate-ranking changes, even after exact analytic ties are removed.

## Stage classifications and interpretation boundary

| Stage | Classification | Evidence |
| --- | --- | --- |
| First measurable error | **SUPPORTED — writer/storage** | Node values differ from analytic node values before sensor aggregation; straight p00/p01 fallback/on-node alias is exact. |
| Bilinear reader contribution | **SUPPORTED — additional** | C2 exceeds C1 raw-read MAE in local and wide pools, but it often cancels C1 and cannot be called the sole source. |
| Local sensor amplification | **SUPPORTED** | Large aggregate steering error and opposite signs occur; a symmetric straight reference produces about .20 rad at two phases. |
| Wide max / winner amplification | **SUPPORTED** | 46.9% strict-unique analytic winners change, with no stochastic choice in the harness. |
| Mirror consistency | **SUPPORTED** | Mirrored steering remains opposite to roughly `1e-15`. |
| S-route geometry responsibility | **SUPPORTED** | 98/231 stations per phase have zero analytic local steering from this query geometry; they are not evidence of a field error. |
| Movement transfer | **INCONCLUSIVE / not run** | Fixed geometry cannot establish long-run movement consequences. |

There is no universal largest stage across incompatible units. On pooled raw values C2 has the larger mean absolute component, while the most consequential qualitative changes appear after local steering and wide max/Hill aggregation. C1 and C2 frequently oppose each other; the result is therefore **MIXED**, not a clean reader-only diagnosis. No candidate was tested or qualified. The next justified research step, if requested, is a sensor-only fixed-geometry counterfactual using these exact raw queries; keep writer, raster and movement unchanged. No production change is recommended.

## Validation, provenance and artifacts

- New tests: 7/7 pass. Focused existing field/trail/controller/deposition suites: 46/46 pass. Total focused tests: 53/53 pass.
- Tests were invoked one file at a time with `node <file>`; `node --test` worker spawning returned sandbox `spawn EPERM`. The same test files passed directly without workers.
- `node --check scripts/ant-field-analytic-reference.js` passed. The analysis was rerun twice from the same code; JSON, compressed raw rows and replay summary matched byte-for-byte.
- No full build was run: only research script/tests/docs changed, and production `src/` stayed unchanged.
- Production source SHA-256 receipts are embedded in `computed/analytic-attribution.json`; the research script hash is included there too. `validation/determinism.json` records byte hashes from the repeated run; `validation/focused-tests.tap` records test output.

Reproduce with Node.js 20+:

```powershell
node --check scripts/ant-field-analytic-reference.js
node scripts/ant-field-analytic-reference.js docs/ant/evidence/2026-10-24-field-analytic-reference
node tests/ant-field-analytic-reference.test.js
node tests/pheromone-field.test.js
node tests/ant-trail-following.test.js
node tests/ant-controller.test.js
node tests/ant-gaster-deposition.test.js
node tests/ant-gaster-integration.test.js
```

Files:

- [`scripts/ant-field-analytic-reference.js`](../../../../scripts/ant-field-analytic-reference.js): reproducible reference, frozen harness and attribution.
- [`tests/ant-field-analytic-reference.test.js`](../../../../tests/ant-field-analytic-reference.test.js): reference, symmetry, phase/query geometry, sensor parity, RNG neutrality, fallback alias and replay checks.
- [`computed/analytic-attribution.json`](computed/analytic-attribution.json): protocol, source hashes, aggregate measures, exact counts and classifications.
- [`computed/station-raw.json.gz`](computed/station-raw.json.gz): all station-level raw/reference/production samples, queries and local/wide summaries.
- [`validation/focused-tests.tap`](validation/focused-tests.tap), [`validation/determinism.json`](validation/determinism.json), [`validation/replay-summary.json`](validation/replay-summary.json), and [`validation/manifest.json`](validation/manifest.json): test, rerun and SHA-256 receipts.
