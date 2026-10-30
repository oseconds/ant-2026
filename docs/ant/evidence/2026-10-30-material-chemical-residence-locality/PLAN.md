# Material-conditioned residence locality falsification

## Question and boundary

Test whether the previously frozen local material-conditioned residence field produces recipient-level pheromone readouts that differ from a scalar mass-matched native spatial field, with source requests, actual material history, recipient poses/headings and production sensor implementation fixed. This is a read-only field/readout diagnostic. No agents tick, consume RNG, move, write, form Plates or respond to a counterfactual field. No production behavior or law is proposed for adoption.

## Authorities and frozen source

- Production: `origin/main@4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research base: `codex/ant-material-feedback-space-20261030@3b61f995c8e514e848b1d4133812fa855db92c04`.
- Reuse the exact Pass 3 production-control frozen request stream, actual birth masks and saved position snapshots already used by the residence probe. No natural replay or new world run.
- Use every saved post-tick one-second time from 1 through 600 s, at its original recorded positions and headings. These serial observations are not independent trials.
- First reproduce the existing native/residence field and `senseLocalTrail` receipts exactly; a failure blocks interpretation.

## Registered fields

- A: native `PheromoneField.decay(1/60)` then the exact frozen source requests in recorded tick/order.
- B: exact prior residence replay: nearest 96-grid actual material layer count at tick entry, `lambda=ln(2)/15 * (1 - 0.5*(1-exp(-L/4)))`, decay before writes, with the same frozen requests.
- C: at each saved read time independently scale that time's A snapshot by one deterministic nonnegative scalar `k`, then store `min(8, k*A_i)` in a Float32 field. Solve `k` by bracketing then bisection against B's node sum; choose the tested scalar with the smallest Float32 node-sum residual, breaking ties toward the lower scalar. This snapshot null has no time evolution, source, or world feedback.

Record A/B/C node sums, `k`, absolute and relative residual, positive A support, feasible maximum sum (`8 * positive-node-count`), capped node count/fraction, and the uncapped requested sum removed by the cap. An infeasible target is not repaired. Report cap effects as measured; do not change field max or substitute another control.

## Readouts and comparisons

- At the same frozen recipient pose/heading, call production `senseLocalTrail` on A/B/C and retain the full left/center/right/strength/coherence/steering profile.
- Also call production `senseTrail` at each of the five source-defined canonical heading offsets `[-.92,-.47,0,.47,.92]` from saved heading. Store the native wide raw signal and the exact production Hill response (`halfSaturation=.035`, exponent `3`). These are fixed prospective readout probes, not the jittered candidate headings actually selected during world ticks; no motor or route result is inferred.
- Preserve per-recipient paired A/B/C values and B−A, C−A and B−C differences, plus distribution summaries. Group local B−C differences by quartiles of native A `strength`; quartile cuts are computed from A alone before examining B−C. Report `1 - A.strength` continuously as native local sensor headroom; do not define a binary saturated/unsaturated cutoff.
- For each time also record B/C spatial Pearson correlation and normalized L1 (`sum(abs(B-C))/sum(B)`), and mean B−C on tick-entry material and bare field nodes separately. These are context, not substitutes for recipient readouts.
- No significance tests or independent-trial inference over repeated snapshots.
- No B-memory/qualification reconstruction in this pass.

## Decision rule

- `LOCALITY NOT SUPPORTED` if the mass-matched C accounts for the recipient/profile change seen in B, including at contexts with greater A headroom, so the frozen evidence does not establish a locality-specific contribution beyond bulk node-sum retention.
- `LOCALITY SUPPORTED` only if B and C show reproducible recipient-level differences at native poses with continuous evidence of sensor headroom, not explained by cap distortion.
- `INCONCLUSIVE` if a scalar null is infeasible or cap distortion prevents a clean equal-node-sum spatial control at the recipient times needed to interpret the comparison.

No numerical effect-size cutoff will be invented. Report full paired distributions, timeseries and cap receipts, and distinguish a failure to establish locality from proof that no conceivable material-local residence meaning exists.

## Explicit exclusions

No rerun of Screens 1–3 or the coupled residence world; no ant simulation, new seed, source or decay tuning, alternative spatial null, threshold tuning, max-D/X, allocation, UPDATE, BODY, production change or audio work.

## Post-run method reconciliation

The registered solver sentence above said to bracket and bisect for every read time. The implementation instead uses the closed-form `k = sum(B)/sum(A)` when that scalar leaves every node below the cap, and brackets/bisects the Float32 node sum only if the first scale would clip a node. Independent review caught this documentation/implementation mismatch. All 600 actual cases used the uncapped closed-form path; its recorded Float32 node-sum residuals are at most `6.21e-10` relative, and no node was clipped. This note records the executed method; it does not alter the comparison, inputs or results.
