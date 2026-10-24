# Preregistration — 316 × 316 CIC fixed-cue qualification

Frozen before evaluating any 316 × 316 cue output. Date: 2026-10-24 KST.

## Baselines and reused inputs

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- New research branch base: `codex/ant-pheromone-representation-contract-20261024` at `c3babbf4811ebede0cc4ef5615bd08317c937664`.
- Prior CIC qualification: `1fbfec5943c41ad6c8b3828fb48c47828d9be817`.
- Prior wide attribution: `05c855cac06dd3659abfc1502e91071980ecc00b`.
- Prior transverse-sample diagnostic: `fb8f0ce009a96f1f2a8aecb80078de53a0454d56`.
- Prior profile substitution: `d375ea64844933a0f59940c5a465229e76f6e649`.
- Representation contract: `c3babbf4811ebede0cc4ef5615bd08317c937664`.
- Frozen 5,544 station rows SHA-256: `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`.
- Prior Gate 2 rows SHA-256: `550f79a84837fac7dcb27f5a8a1d4ad5b9bf08b70c6f1638f5f1cf2206bb6c3f`.
- Qualified 24-arm raster write-stream source commit: `9afcc130f23c85f34cdf64073a2c95c945c0b320`; each arm has 77 ordered physical writes.
- Analytic A remains the previously frozen continuous compact-Gaussian engineering reference.

The 96 × 96 CIC result remains `MIXED / NOT QUALIFIED`; movement Gate 3 remains `NOT RUN`. This pass does not change either earlier disposition.

## Single candidate and temporary contract

Evaluate only E: a research-only `316 × 316` Float32 scalar raster written with the existing four-node containing-cell CIC formula and read by the inherited ordinary bilinear `PheromoneField.sample()` implementation.

The temporary contract fixes normalized `[0,1]²` coordinates, `h = 1/315`, write-support radius `R = 0.0045`, node-sum dose, maximum node value 8, non-redistributed per-node saturation loss, and unchanged exponential decay. For each in-domain point write, CIC uses the four containing-cell barycentric weights in existing row-major update order; exact zero weights are skipped. There is no renormalization, residual repair, smoothing, extra kernel, gain or amplitude conversion. Requested in-domain amount remains the method's accepted amount; actual stored amount is measured separately.

This is a legacy nodal-signal counterfactual so the existing fixed-cue consumers can be reused. It does not define final physical concentration units. `R` constrains only positive-weight write-node locations. The bilinear read footprint may extend beyond `R`; it will be measured, not corrected.

### Resolution derivation and constructive support check

For all four containing-cell corners to be no farther than `R`, it is sufficient and, for a square lattice over all cell phases, necessary that `sqrt(2) / (N - 1) <= R`. Thus:

```text
N = ceil(1 + sqrt(2) / 0.0045) = 316
h = 1 / 315
sqrt(2) h = 0.004489117907990024 <= R
```

Before any cue calculation, run one deterministic `1001 × 1001` fractional-position lattice over `[0,1]²` in a representative interior cell, plus all four cell corners, edge midpoints, and points `2^-30` inside each corner. For every positive CIC weight, compute the physical source-to-node distance and assert it is `<= R`. Also test all domain edges/corners separately. The continuous bound above, not a sweep of grid resolutions, is the proof; the finite set is a constructive implementation check.

## Gate 1 — representation validity

Gate 1 runs before E-arm cue evaluation. It includes:

1. Isolated point writes at `64 × 64` cell-interior midpoint positions, four phases `{p00,p10,p01,p11}` defined using the candidate `h/2`, and doses `{0.000001, 0.027, 1}`: 49,152 writes. Each write is uncapped and checked for accepted amount, node-sum dose, nodal first moments, centroid, nonnegativity, finiteness and deterministic repeat. Float32 error is judged using a derived per-store bound `2^-24 * abs(before + increment) + 2^-150`, summed over the four active nodes, with a separately reported Float64 accumulation guard; no empirical tolerance is introduced.
2. The exact 24 frozen 77-write route/phase streams, same order and physical coordinates, with no decay. Record requested/accepted/stored dose, nodal moments/centroid, active support, maximum node and cap count. These target streams must remain uncapped for the uncapped conservation claim.
3. Separate exact edge/corner and outside-domain cases. Separate one-node saturation stress confirms cap loss is not redistributed; no moment-conservation claim is made under active cap.
4. A decay parity check against `PheromoneField.prototype.decay()` with identical values and elapsed time.
5. Descriptive support-node counts, source-to-active-node distance, nodal second moment, bilinear nonzero read footprint, and source-position read/peak values across the fixed fractional lattice. These are not acceptance scores.

Gate 1 fails if any declared uncapped dose/moment bound, nonnegative/finite requirement, support bound, deterministic replay, cap behavior or inherited decay parity fails. If Gate 1 fails, stop before E cue outcomes.

## Gate 2 — frozen fixed-cue protocol

Use exactly the six existing route fixtures (`straight`, `gentle`, `tight`, `gentleMirror`, `tightMirror`, `sCurve`), four phases, 231 stations per arm (5,544 row keys), and the existing ordered 77 physical point writes per route/phase. Do not derive new dabs from grid pitch. Query positions, analytic A values, local and wide sensor geometry, weights, max, Hill response, deterministic field-only scoring and winner semantics are unchanged.

Run the existing C preflight and reproduce prior D at 96 × 96 from those same writes before calculating E. Assert C and D outputs match the saved Gate 2 row artifact exactly, including row keys, local values, raw wide samples, candidate outputs and winner. Then calculate E at 316 × 316 from the same events. Compare C, D and E on identical rows. The helper's existing `evaluateCueGate()` is the qualification authority without changed rules.

Required denominators and primary checks remain:

- 4,012 analytic directional local rows: production sign errors and candidate sign errors.
- All 5,544 rows: local steering MAE.
- 5,072 strict-unique analytic wide-winner rows: final winner mismatch count.
- Every route family and every phase: no increase over C in any of the three primary measures.
- 924 straight analytic-zero rows and 392 S-curve analytic-zero rows: no increase over C in false-nonzero count or mean absolute steering.

Also report directional-only steering MAE, phase spread, all six route groups, all four phases, raster support/peak/mass/cap, ties/margins, C/D/E recovery and new-error counts, and every previously failed CIC Gate 2 check. No replacement threshold or scalar quality score is added.

Before interpreting E, reproduce exactly the prior 5,072 strict-unique cohort, C/D mismatch count 2,378 for each arm, 92 recovered and 92 new-error membership, and the 26 weighted-max-first target sample-switch row identities. For the 92/92 groups, report E outcomes. For the exact 26 rows, report E target/rival five-sample profiles, raw/weighted argmax identities, and whether the target `±1 → ±0.5` switch persists. This is secondary diagnosis, not a new gate.

## Decision and stop boundary

Apply the unchanged Gate 2 result to E. Summarize E as `promising for next gate`, `mixed`, `negative`, or `inconclusive` using the complete preregistered pattern. Passing Gate 1 alone is not hypothesis support. Even a Gate 2 pass does not authorize movement Gate 3, a natural run, production change/adoption, consumer-unit conversion, or another resolution/writer/reader candidate.

The report must keep implementation facts, Gate 1 representation checks, Gate 2 fixed-cue results, limitations, and interpretation separate. Analytic A is an engineering reference, not biological or natural-path ground truth. Cap/boundary results do not inherit uncapped-interior conservation claims. Node-sum dose and reader value remain a temporary unit choice; material formation and renderer consumers of raw grid arrays were not changed or qualified.
