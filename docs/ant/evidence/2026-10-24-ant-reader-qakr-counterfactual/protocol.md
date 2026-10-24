# QAKR reader-only counterfactual protocol

## Freeze point and inputs

This protocol is fixed before calculating candidate-reader fixture outputs. Production baseline is freshly fetched `origin/main` at `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. Production source remains unchanged. The 24 replay-backed Float32 rasters and frozen station/query rows are consumed directly from `docs/ant/evidence/2026-10-24-ant-raster-backed-fixture/`; every raster SHA is checked against that package's manifest before either C or D reads it.

The row source is the exact frozen compressed dataset from writer/reader attribution commit `ea3d382c6c849df7505e1d398cef085ca271c8b9`, with compressed SHA-256 `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`. Its route, phase, station, raw A/C values, saved C1/C2 residuals, and physical query coordinates are not regenerated. The exact compressed A/B/C stage rows from the same commit are also included as `inputs/source-abcs-stage-rows.json.gz` (SHA-256 `a456a10a49445dbd54cd760ad7b371ffbdead6579777d2b05f89b0ddadd5678b`). Its frozen row keys and A/C raw arrays are required to match the station dataset exactly; B and the named cohort labels are reused from this source artifact. QAKR C and D read the same in-memory Float32 node array object for each arm.

## Candidate fixed before evaluation

Exactly one candidate is evaluated: Quantization-Aware Kernel Reconstruction (QAKR). It does not modify node values, writer, decay, cap, grid, query geometry, sensor aggregation, candidate weighting, or ranking.

With `h = 1/95`, `sigma = 0.00225`, and `R = 0.0045`, the normalized radial writer kernel is

\[
K(d)=\begin{cases}\exp(-d^2/(2\sigma^2))/Z,&d\le R\\0,&d>R\end{cases},\quad
Z=2\pi\sigma^2(1-\exp(-R^2/(2\sigma^2))).
\]

For a node centered at `x_i`,

\[
W(r)=h^{-2}\int_{[-h/2,h/2]^2}K(\lVert r-u\rVert)\,du,\qquad
D(q)=h^2\sum_i v_iW(q-x_i).
\]

This models each stored value as a coefficient associated with an unknown uniform subcell source position. It is a diagnostic assumption, not recovered history or biological ground truth. No empirical gain or output normalization is applied.

### Fixed numerical evaluation

The compact-disk integral is evaluated as a one-dimensional integral: integrate the Gaussian over the clipped y-interval analytically with a fixed 24-term Taylor series for `erf`, then substitute `x = R sin(theta)` and apply 24-point Gauss-Legendre quadrature on intervals split at every x-cell edge and circle/horizontal-cell intersection. The candidate uses only this fixed 24-point result. The series is evaluated over `|z| <= R/(sqrt(2)*sigma)`; 24 terms are fixed. The normalization `Z` is the stated closed form.

Before fixture evaluation, the harness compares 12-, 24-, and 48-point Gauss-Legendre results at six fixed dimensionless offsets: `(0,0)`, `(0.5,0)`, `(0.5,0.5)`, `(0.9275,0)`, `(0.7071067811865476,0.7071067811865476)`, and `(0.1,0.3)` in units of `h`. It records the raw differences; no order is changed after fixture results are visible. Analytic full-disk and disjoint-support cases are returned exactly as 1 and 0 before quadrature.

The formula integrates a full square for every stored node, including boundary nodes. Only the finite in-domain raster nodes are summed. Candidate queries outside `[0,1]^2` return zero, matching production `PheromoneField.sample`. Boundary-exposed means a frozen query lies within `h/2 + R` of a domain edge, the support width derived from the declared cell and kernel. Interior and boundary-exposed results are reported separately; no boundary-specific parameter or normalization is introduced.

## Pre-result sanity gate

No fixture outcome is evaluated unless all checks pass: finite/nonnegative basis and read values; zero-raster output zero; constant-field partition of unity measured at interior, edge, and corner queries with the uncorrected formula; x/y reflection and 90-degree rotation symmetry; mirror symmetry; fixed-repeat determinism; zero RNG calls; and the preregistered quadrature convergence receipt. Errors are reported numerically. Failure stops this pass without calculating candidate qualification outcomes.

## Qualification measures

The primary comparisons are continuous analytic A, current bilinear C, and QAKR D. Existing B values and the prior named A/B/C cohort labels are reused byte-for-byte from the stage-row source; they do not enter candidate evaluation. The stage rows' A/C raw arrays must match the station dataset at every local and wide query. All local and wide production operators are replayed with the frozen physical query coordinates. Local precision-stable sign classifications retain the prior floor `64 * Number.EPSILON * max(1, raw magnitude)`. Wide analytic correctness retains the saved strict-unique final-score target and deterministic lower-index tie rule.

The fixed target/control cohorts are: 335 reader-sufficient stable local failures, 211 writer/storage-sufficient local failures, 125 local restoration controls, 993 reader-sufficient raw-max wide failures, 841 reader-sufficient weighted-max-first failures, 2,378 production final-winner mismatches among 5,072 strict-unique analytic winners, and 598 wide final-winner restoration controls. The harness must reproduce those source counts before D outcomes are accepted. All non-ambiguous local-direction rows, all strict-unique wide rows, and all straight/mirror/S controls are retained.

No candidate is adopted in production. Qualification is judged from the complete recovery, regression, margin, contrast, symmetry, ambiguity, and operation-count pattern specified by the task, without an after-the-fact scalar score or threshold. No movement/world run is allowed in this pass.
