# Independent review — CIC writer qualification

Date: 2026-10-24. Review type: fresh scientific, code and evidence review. Reviewed the frozen protocol, current research-only writer, moment and qualification runners, the pinned attribution helper, production `PheromoneField` / `AntController` / `GasterDeposition`, validation receipts, corrected Gate 1 artifact, raw Gate 2 rows and static plot. No production edits, movement run, candidate retuning, test run or build were performed for this review. Only this review file was written by the reviewer.

## Disposition

**No evidence-integrity or arithmetic blocker was found for the bounded result reported here. Gate 1 supports uncapped dose and first-moment preservation in its stated assays. Gate 2 is MIXED / NOT QUALIFIED under its frozen advancement rules. Gate 3 is correctly NOT RUN.** Gate 2 is a blocker to advancing this candidate to a movement claim, production qualification or exhibition use; it does not invalidate publication of the mixed fixed-cue result.

## Independent checks

### Preregistration and implementation boundary

The preregistration is credible at the repository level. Commit `54f7bac296407cb1b2b1b1629346530b643756f5` is based on `8c60e4bba3bd5b476300e90a2936bfebd1f831c2` and contains only `PLAN.md`, `PROTOCOL.md` and `validation/preregistration.json`. Its commit time is 2026-10-24 13:44:52 KST; the receipt records a freeze time of 13:44:44 KST and `candidateTargetEvaluationStarted: false`. The committed protocol hash remains `6a4aadc894ec5175b0ba1111e5e2b82e9b81c6c9aeb8d6f5e9b16541f26eb7ca`. Git history and matching hashes support that the declared gates preceded the saved target outputs; the receipt is an author record, not an external timestamp or proof of blinding.

The code intervention is one research-only `depositBrush` override. The production sources and the reused attribution helper match the hashes in `reused-inputs.json`. The writer uses four nonnegative bilinear weights in fixed order, inherits point validation and field readers, and relies on the existing node cap. It changes the write footprint and therefore the peak, second moments and nonlinear sensor inputs; it is not equivalent to the compact production brush. Radius is still validated but no longer controls point-write support. The cap test correctly distinguishes accepted requested dose from stored dose: the capped stress case loses about 0.24 of a requested 1.0 without redistribution. Conservation is claimed only for the uncapped target assays.

### Gate 1: uncapped mass and first moments

I reconstructed the 49,152 isolated point cases directly from the saved coordinates and doses, using the four CIC weights and Float32 rounding. All passed the mass, physical x/y raw-moment and centroid bounds. Maximum point-case residuals were `1.2825e-9` mass, `6.6100e-10` for either raw moment and `2.2534e-10` for either centroid. The largest observed per-store rounding error was 0.982 of its stated `2^-24 * abs(before + contribution) + 2^-150` bound. The maximum Float64 grid-index identity residual was `1.43e-14`, inside the declared guard.

I also rebuilt all 24 ordered 77-write route rasters directly from the frozen write streams with Float32 stores. All 24 bytes match the saved Gate 2 rasters; all 1,848 writes remain uncapped and each route's mass, x/y moment and centroid residual passes its saved per-node bound. The full Gate 1 output reports maximum mass/raw-x/raw-y/centroid residuals of `9.7098e-9`, `5.0333e-9`, `4.9168e-9`, `1.2387e-9` and `8.6303e-10`, respectively; each is bounded. This independently resolves the earlier invalid lattice output: it is marked invalid, hash-pinned and excluded, while the corrected artifact applies `clear()` for each point write.

The store bound and centroid propagation are appropriate for these finite positive, uncapped writes: per-node Float32 errors are summed, coordinates weight the moment budget, and the centroid bound includes the mass residual and quotient rounding. The 64-ulp Float64 guard is an assay-level arithmetic allowance, not a qualification for arbitrary operation counts, resolutions or high-dose inputs. Boundary/API and clipped-segment checks are present in the saved Gate 1 results and are consistent with the inherited production API and reviewed code; I did not independently rerun those smoke checks. None of this establishes natural `depositSegment` behavior, saturation consequences, or all possible world histories.

### Gate 2: fixed-cue comparison

I independently joined all 5,544 comparison rows to the pinned station input and recomputed local outputs from the saved 18 raw samples and wide scores/winners from the five raw candidates plus pinned query geometry. All row keys and all A/C/D local outputs and wide winners matched exactly. The denominator census is 5,544 all-row local steering MAE rows, 4,012 analytic-directional rows for local sign errors, and 5,072 strict-unique analytic wide winners; the unique-winner denominator excludes 472 rows. The frozen precision-zero rule was applied directly and was not used as an MAE tolerance.

| Preregistered measure | Production C | CIC D | Independent result |
| --- | ---: | ---: | --- |
| Local directional sign errors / 4,012 | 552 | 0 | Improves |
| Local steering MAE / all 5,544 (rad) | 0.06505354 | 0.02225486 | Improves |
| Wide final-winner mismatches / 5,072 | 2,378 | 2,378 | Unchanged count; 92 recoveries and 92 new errors |
| Tight and tight-mirror wide mismatches / 844 each | 301 | 303 | Regresses in both families |
| p01 wide mismatches / 1,268 | 534 | 535 | Regresses |
| p11 wide mismatches / 1,268 | 540 | 551 | Regresses |
| S analytic-zero false steering / 392 | 364 | 377 | Count guard regresses; mean magnitude falls |

These are the five failed preregistered subgroup/zero-control checks. The straight zero-cue control improves from 445 precision-nonzero turns to 0, with mean absolute steering falling from `0.09827464` to `5.78e-16` rad. In the S analytic-zero cohort, mean absolute steering also falls from `0.03539171` to `0.01789884` rad, but the false-nonzero count rises, so its joint guard still fails. The count cannot be replaced with the smaller mean.

The equal global wide-error totals conceal changed rows. All 92 new CIC errors carry a stored analytic winner-score margin around `1.783073` (range `1.783073186692289`–`1.783073186692468`), while the 92 recoveries have a wider margin range. This is a descriptive diagnostic under the frozen engineering reference, not a new gate and not a biological severity measure. Raw-sample MAE also rises slightly against A for both local samples (`0.01733554` to `0.01822596`) and wide samples (`0.00344003` to `0.00355031`). This is consistent with a redistribution of cue behavior rather than a uniformly closer field.

Analytic A is an engineering reference, not natural-path ground truth. The fixed rows validate the chosen operator chain at frozen coordinates and doses; they contain no moving ants, feedback, recruitment, random exploration or material response. The defensible claim is that CIC improves local steering against A in these fixtures while failing the complete fixed-cue nonregression contract. It does not establish general navigation benefit or harm.

The repository's validation note records that directional-only MAE and tie/margin summaries were added after the first candidate output. The protocol already required raw-sample, ambiguity, margin, family/phase and recovery/regression reporting, but the directional-only summary was not a primary gate. Treat it as post-outcome descriptive analysis. It did not change the fixed primary denominators, gate thresholds, candidate or result classification.

### Gate 3 and visual artifact

No movement outcome was run, as required after the Gate 2 failure. Do not infer movement improvement or degradation from the cue rows or the plot. The PNG is a headless rendering of the static SVG; visual inspection confirms the 12 displayed shape/phase panels, frozen station labels and the failed-gate / movement-not-run footer. Its receipt correctly says `artistReviewed: false` and `antRuntimeValidation: false`.

## Hash and validation receipt audit

All 28 reused inputs in `validation/reused-inputs.json` match their stated SHA-256 values. The production hashes remain `AntController.js` `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04`, `PheromoneField.js` `412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd`, and `GasterDeposition.js` `0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41`. The current attribution-helper SHA-256 is `72c020cb2abb8dd42a6c56fa277ff9ef4bcbff26c949f45c994c001998779864`.

| Artifact | SHA-256 | Independent check |
| --- | --- | --- |
| CIC writer `scripts/ant-cic-writer.js` | `b681b1ccc8e099a7604e46099b0774e997c3be19f04334a9ca153a3f392ad15e` | Read and scoped to one override |
| Gate 1 runner `scripts/ant-cic-writer-moments.js` | `7a2503b195e888551ff0d734283a45131f75028bb52b601af6b51d23107e0103` | Read; point and route arithmetic reconstructed independently |
| Gate 2 runner `scripts/ant-cic-writer-qualification.js` | `5aa9a42d23bd2eb74fb59b4093ddb85286cd98e8a386d1b4ea85a1bd5701adeb` | Current figure-only update; output metric hashes unchanged |
| Protocol `PROTOCOL.md` | `6a4aadc894ec5175b0ba1111e5e2b82e9b81c6c9aeb8d6f5e9b16541f26eb7ca` | Matches committed preregistration |
| Frozen station input `station-raw.json.gz` | `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29` | All 5,544 rows joined |
| Frozen write streams | `c2a15990f33d7b43e7e4761cd80b10a47eab0baec98b1dcced76f47b85cdc0ee` | Rebuilt 24 candidate rasters |
| Corrected Gate 1 output `gate1.json.gz` | `6b1451b29e67c7a66840b2396325116934154ff333b8b25f987571aa3ad9fcfe` | Matches reproduction receipt |
| Excluded invalid first lattice output | `9a24f37a6aa31f08b07ad3fae179f9cf1b9d8ec5838fa630d7adbbd6112f97b7` | Matches erratum; not used |
| Gate 2 raw rows `rows.json.gz` | `550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f` | Matches receipt and independent metrics |
| Gate 2 summary `RESULTS.json` | `ed4cf90f1086322d49cc7b6ca92a28cb67f85a1b9cd74933292f201b4f10f894` | Matches receipt |
| Gate 2 SVG | `f156e5e7f3d60badd0d96e142841dc1f7f6a407eb8859dceab41b46adfef8b58` | Matches receipt |
| Static PNG | `f7237d00f377441a642f18114fb78ff2571eef98b0608e09c7603e36c0a536a5` | Matches rendering receipt |

All five scientific-output hashes in `validation/reproduction.json`, all 24 candidate raster hashes in `RESULTS.json`, all 28 reused-input hashes and the PNG hash match current files. The saved full-suite log reports 347 passing tests and the build log reports a successful build with existing dependency/chunk warnings; these were read, not rerun during this independent review.

## Final claim boundary

The conservation claim is supported for the measured in-domain, uncapped point and route assays. The local-cue benefit is supported only relative to the fixed analytic engineering reference. Because five preregistered Gate 2 checks fail, there is no movement result and no production or exhibition qualification. No evidence found here justifies weakening those guards or treating a moment pass as a behavioral pass.
