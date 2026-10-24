# QAKR fixed-raster reader counterfactual — 2026-10-24

## Decision

**MIXED / RESEARCH-ONLY. Not qualified for movement shadow.** QAKR reduced pooled raw-value MAE slightly and recovered some wide winners, but local directional outcomes worsened: production-directional steering sign mismatches rose from 552/4,012 to 612/4,012, local steering MAE rose from 0.06313 to 0.07228 rad, and 99 previously correct local signs became wrong. The straight p00 false-steering control also increased. Stop here; do not tune QAKR or try a second reader.

The candidate preserves mirror symmetry and does not flatten directional contrast. Those positives do not offset the local regressions, low targeted recovery, phase spread increase, and high quadrature cost. Production remains unchanged.

## Implementation fact and provenance

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Production files were not modified. Their SHA-256 values are recorded in [`computed/summary.json`](computed/summary.json) and match the qualified raster fixture manifest:
  - `PheromoneField.js`: `412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd`
  - `GasterDeposition.js`: `0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41`
  - `AntController.js`: `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04`
- Input raster package: [`2026-10-24-ant-raster-backed-fixture`](../2026-10-24-ant-raster-backed-fixture/), qualified at `9afcc130f23c85f34cdf64073a2c95c945c0b320`. It contains 24 replay-backed 96×96 Float32 rasters (884,736 bytes total), with each raster SHA in its [`manifest.json`](../2026-10-24-ant-raster-backed-fixture/manifest.json). These are deterministic replays, not recovered historical node arrays.
- Frozen A/B/C row input: commit `ea3d382c6c849df7505e1d398cef085ca271c8b9`; source compressed SHA-256 `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`. Included A/B/C stage-row SHA-256: `a456a10a49445dbd54cd760ad7b371ffbdead6579777d2b05f89b0ddadd5678b`.
- Six exact fixtures × four phases × 231 stations: 5,544 frozen station/phase rows. No geometry, raster, query or RNG was regenerated.
- Before and after evaluation, every raster file matched its manifest SHA. C and D read the same `Float32Array` object for each arm. Zero RNG calls.

The full preregistration is in [`protocol.md`](protocol.md). Row-level A/C/D outputs and cohort membership are retained as compressed JSON in `computed/`; raw parity, basis and source-cohort receipts are in `validation/` and `computed/source-cohort-gate.json`.

## QAKR definition and numerical check

Only the read operation changes. With `h=1/95`, `σ=0.00225`, and `R=0.0045`:

\[
K(d)=\frac{\exp(-d^2/(2σ^2))}{2πσ^2(1-\exp(-R^2/(2σ^2)))}\;\; (d\le R), \qquad K(d)=0\; (d>R)
\]

\[
W(r)=h^{-2}\int_{[-h/2,h/2]^2} K(\lVert r-u\rVert)\,du,
\qquad D(q)=h^2\sum_i v_i W(q-x_i).
\]

There is no fitted parameter or empirical normalization. Each stored node is treated as a coefficient whose source point is uniformly uncertain within its grid cell. This is a diagnostic model, not an exact inverse of production writes: the production writer normalizes Gaussian weights over the discrete in-domain nodes separately for each brush, while QAKR integrates a normalized continuous truncated Gaussian over a uniform subcell. With the default support smaller than grid pitch, a brush generally assigns its whole requested amount to one node; QAKR then spreads that coefficient through its assumed kernel. Its scale and support follow the production brush, but its source-position assumption is not the writer’s exact per-brush normalization rule.

The reference implementation is [`scripts/ant-reader-qakr.js`](../../../../scripts/ant-reader-qakr.js). It integrates the clipped y dimension analytically with a fixed 24-term `erf` series, then uses 24-point Gauss-Legendre quadrature in `x=R sin(θ)`, split at cell and circle intersections. The series/order are fixed; the fixture result did not tune them. Across six preregistered basis offsets, the largest 24-vs-48 point difference was `5.55e-16`; the 12-vs-24 maximum was `3.77e-9`. Constant-field residual was at most `5.69e-14` including edge/corner probes; x/y reflection and 90° rotation residuals were at most `7.78e-16` at the basis level. Zero raster returned exact zero, a grid-node value returned exactly `7`, and all checked outputs were finite and nonnegative. Full receipt: [`basis-sanity.json`](validation/basis-sanity.json).

Boundary convention was preregistered: each in-domain stored node keeps its full square basis; only in-domain nodes are summed; out-of-domain queries return zero, matching production `sample()`. No fixture read was boundary-exposed (0/99,792 local; 0/138,600 wide), so boundary behavior is covered by basis probes rather than route outcomes.

## Shared-raster and production-C gates

All 24 consumed file hashes matched the qualified manifest. The same loaded Float32 node array served C and D; its bytes were re-hashed after evaluation and remained unchanged.

| Gate | Exact result |
| --- | ---: |
| Frozen local C reads | 99,792 / 99,792; max error 0; first mismatch none |
| Frozen wide C reads | 138,600 / 138,600; max error 0; first mismatch none |
| Total production C reads | 238,392 / 238,392 exact |
| Stored local aggregate values | 38,808 exact |
| Wide weighted reads / maxima / Hill responses / scores / ranks | 138,600 / 27,720 / 27,720 / 27,720 / 27,720 exact |
| Deterministic wide winners | 5,544 exact |
| RNG calls; changed raster hashes | 0; 0 |

The pre-candidate C gate also revalidated the 5,544 row keys and A/C query arrays against the two frozen sources and reproduced the named prior cohorts. Receipts: [`current-bilinear-parity.json`](validation/current-bilinear-parity.json), [`sensor-parity.json`](validation/sensor-parity.json), [`prior-abcs-input-parity.json`](validation/prior-abcs-input-parity.json), [`shared-raster-c-gate.json`](validation/shared-raster-c-gate.json), and [`source-cohort-gate.json`](computed/source-cohort-gate.json).

## Fixed raw field results

All numbers compare the same query geometry against continuous analytic A. Exact metrics are in `computed/summary.json`; table values below are rounded for readability.

| Query set | Arm | Count | MAE | Signed mean error | Max absolute error |
| --- | --- | ---: | ---: | ---: | ---: |
| Local | C bilinear | 99,792 | 0.017336 | -0.000015 | 0.084094 |
| Local | D QAKR | 99,792 | 0.016410 | +0.000113 | 0.084094 |
| Wide | C bilinear | 138,600 | 0.003440 | +0.000680 | 0.084094 |
| Wide | D QAKR | 138,600 | 0.003325 | +0.000596 | 0.084094 |

Thus D improves pooled raw MAE about 5.3% local and 3.3% wide, but does not improve every route. Local MAE by route (C → D): straight `.016619 → .016992`; gentle `.017310 → .016061`; tight `.017996 → .016822`; gentle mirror `.017310 → .016061`; tight mirror `.017996 → .016822`; S `.016783 → .015700`. Wide MAE by route: straight `.005362 → .004875`; gentle `.002141 → .002144`; tight `.003188 → .003268`; gentle mirror `.002141 → .002144`; tight mirror `.003188 → .003268`; S `.004621 → .004251`.

| Phase | Local MAE C → D | Wide MAE C → D |
| --- | ---: | ---: |
| p00 | .018213 → .017636 | .003701 → .003659 |
| p10 | .017889 → .017188 | .003686 → .003677 |
| p01 | .016589 → .015353 | .003176 → .002994 |
| p11 | .016651 → .015462 | .003197 → .002970 |

Raw phase spread gets worse despite the lower pooled MAE. For local reads, mean spread rose `.014640 → .019270`, median `.013806 → .018713`, max `.045807 → .058213`. For wide reads, mean spread rose `.004045 → .005011`, median `0 → 0`, max `.033615 → .057414`. The full signed-error and route/phase/boundary breakdowns remain in [`summary.json`](computed/summary.json).

## Local sensor outcomes

The unchanged production local aggregation was applied to A, C and D raw reads.

| Measure | C | D |
| --- | ---: | ---: |
| Non-ambiguous analytic-direction rows | 4,012 | 4,012 |
| Steering sign mismatch | 552 | 612 |
| Steering MAE | 0.063132 rad | 0.072277 rad |
| Mean absolute steering | 0.087260 rad | 0.095550 rad |
| Reader-sufficient target recovered | — | 19 / 335 |
| Reader-sufficient target still wrong | — | 316 / 335 |
| New opposite-sign failures among C-correct rows | — | 99 |

The 335 target recoveries were weakly distributed across the frozen analytic-steering quartiles: 6, 7, 0, and 6. The 211 writer/storage-sufficient controls were not reclassified: D reduced steering error on 67 and increased it on 144; mean absolute-error change was `+0.00904 rad` (D−C). Of 125 local cases where the production raster had restored a B reader error, D destroyed 19.

On curved/mirrored fixtures alone, steering MAE rose `.061268 → .070983 rad`; sign mismatches rose `382 → 444` over 3,480 rows. Mirror residual remained near machine precision: maximum absolute A/C/D residuals were `5.40e-15 / 6.48e-15 / 1.06e-14`.

### Straight symmetry control

The analytic local steering is exactly zero on the straight fixture. At station `.122`, straight p00 and p01 have identical raster SHA `863f81053d0414fbf9599b35abaf7cbcbf0cc0643b30cafe1553a80404a65dca`:

| Phase / arm | Left | Center | Right | Steering |
| --- | ---: | ---: | ---: | ---: |
| A p00/p01 | 0 | .066955 | 0 | 0 |
| C p00 | 0 | .021195 | .027342 | +.197090 rad |
| D p00 | 0 | .022059 | .030697 | +.217542 rad |
| C p01 | .007630 | .036349 | .007630 | `-1.17e-15` rad |
| D p01 | .004343 | .041325 | .004343 | 0 rad |

The production read forms `gx=95x`, `gy=95y` and linearly weights the four surrounding nodes. When the raster contains a narrow one-node trace, the local left and right query coordinates can land at different fractional offsets from that node. At the cited station this yields `L=0` and `R=.027342` for p00, but symmetric `L=R=.007630` for p01. Changing only query phase therefore changes the bilinear weights on the same sparse bytes. QAKR preserves the p00/p01 symmetry split and increases p00 false steering. Across all stations, mean absolute steering for p00/p10 rose from `.19690/.19620` under C to `.21026/.20913` under D; p01/p11 stayed around numerical zero.

The 392 S-route analytic-zero rows (98 per phase) also gained no reliable direction. Mean absolute false steering increased in every phase: p00 `.03788 → .04413`, p10 `.03226 → .03660`, p01 `.03701 → .04320`, p11 `.03442 → .03993` rad. D reached `.19083` rad in an analytic-zero row. These remain geometry-ambiguous controls, not direction-recovery successes.

## Wide sensor outcomes

The five candidates, fixed transverse samples, production weights, max, Hill response and deterministic score are unchanged.

For completeness, the reused 1,380 raw-first C departures partition into 993 reader-sufficient targets, 328 writer/storage-sufficient controls, 56 B top-tie cases, and 3 mixed/compound rows. QAKR's 993-row target is the named reader-sufficient subset, not the whole raw-first cohort.

| Cohort | C failure count | D recovered | D still wrong | D target tie |
| --- | ---: | ---: | ---: | ---: |
| Reader-sufficient raw-max first-wrong | 993 | 39 | 954 | 0 |
| Reader-sufficient weighted-max first-wrong | 841 | 50 | 791 | 0 |
| All strict-unique analytic winners | 2,378 / 5,072 wrong | 94 recoveries | 42 new wrong | 0 target ties among D mismatches |

Final mismatch falls from `2,378/5,072` to `2,326/5,072` (net −52). The result is not a broad winner fix: 94 current errors resolve while 42 previously correct winners become wrong. QAKR also creates 240 new raw-max and 53 new weighted-max failures outside the corresponding C failure sets. Of 598 cases where the production raster restored an earlier reader error, D breaks 14.

Among the highest-margin quarter of all analytic unique-winner rows, mismatches move `58 → 57`; in the highest-margin half they move `517 → 502`. The top analytic-margin decile has `0 → 0` mismatches because C is already correct there. The absolute maximum-margin row (`sCurve/p01/station -0.014`, margin `2.733552`) is correct under A, C and D. Looking instead at the top decile of existing C failures (238 rows, analytic margin `1.78307–1.81869`), D leaves 218 wrong, recovering 20. The predeclared tight/p00/station `.294` counterexample is the highest-margin current-C failure and remains wrong: A winner `0`, C and D winner `+.47`, analytic margin `1.818687`.

The tight/p10/station `.066` writer-sufficient weighted-max case also remains `+.47` under C and D versus analytic `0` (margin `1.783073`). Its A/C/D candidate maxima and the full straight representative are retained in [`special-cases.json`](computed/special-cases.json).

QAKR does not achieve a lower winner count by flattening values: mean wide response spread rises `.43233 → .50243`; mean top-score margin rises `.77447 → .84231`; mean local absolute steering also rises. That added contrast does not track analytic correctness consistently.

## Runtime, limitations, and next step

On this offline reference implementation, processing all 238,392 reads took about 3.0 s. A query touched at most four nodes (mean 3.29 positive node contributions), but the integration performed 28,465,344 Gauss-Legendre evaluations and 779,348 partial-basis evaluations. Current bilinear performs four node reads and three linear blends per query. This fixed-quadrature implementation is not plausible for per-ant, multi-query runtime without a separately justified table/approximation; no LUT or optimization was tested. QAKR used one 36,864-byte raster plus small shared quadrature arrays.

This is a mathematical continuous reference comparison on six controlled paths, not biological truth or movement evidence. The fixed fixtures contain no boundary-exposed query samples. Raster provenance is replay-backed. No movement shadow, colony simulation, build, browser test, production adoption, or second reader was performed.

**Smallest next step:** keep production bilinear and stop this reader branch of work. If another pass is justified later, derive a representation model from the production writer’s actual per-brush discrete renormalization before proposing another reader; do not tune this candidate or proceed to movement.

## Reproduction and validation

```powershell
node scripts/ant-reader-qakr-counterfactual.js
node --experimental-test-isolation=none --test tests/ant-reader-qakr.test.js
node tests/pheromone-field.test.js
node tests/ant-controller.test.js
node tests/ant-trail-following.test.js
node tests/ant-gaster-deposition.test.js
node tests/ant-gaster-integration.test.js
```

Results: QAKR tests 4/4; production focused tests 46/46. The Node test-runner isolation override is required in this Windows sandbox because worker spawning returns `EPERM`; no tests were skipped.
