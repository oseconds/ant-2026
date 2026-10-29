# 8-neighbor finite-domain ensemble audit plan

## Question

Does the complete 8-neighbor B peak–saddle ensemble provide a meaningful finite spatial candidate set before any domain is selected, or does it remain too numerous and underdetermined for materialization?

## Frozen authority and inputs

- Production authority: `origin/main@4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `codex/ant-peak-saddle-domain-reproducibility@03e8a68f66392c320bbb67f53be05be7b7f27deb`.
- Run: current-G/H0, seed `20261005`, 60 Hz, Audio Off.
- Reuse exactly the ten existing P1/P2 snapshots and the parent's complete 8-neighbor finite/essential census and correspondence receipts.
- Authored representation convention for this pass: 8-neighbor connectivity. The prior 4-neighbor result remains a documented warning; this pass does not recalculate or compare 4-neighbor domains.
- No simulation, replay, later-state reconstruction or new field is allowed.

Exact saved times in milliseconds:

- P1: `64016.66666666308`, `74016.66666666532`, `82016.66666666765`, `83016.66666666794`, `84016.66666666823`.
- P2: `86016.66666666881`, `96016.66666667172`, `104016.66666667405`, `105016.66666667434`, `106016.66666667463`.

## Registered measurements

1. Retain every finite lobe in every state. Report exact size-frequency histograms and floor-index quantiles `min/Q1/median/Q3/p90/p95/p99/max`.
2. Keep summed domain-cell memberships separate from unique E cells covered at least once. Report coverage multiplicity, including E cells with no finite-domain coverage.
3. Compare every same-state pair of finite-domain cell sets. Report all nonzero intersections, exact containment/equal-set relations, overlap degree and continuous Jaccard/intersection distributions. Do not apply a redundancy or “strong overlap” threshold.
4. Read the existing elder-parent and merge-participant fields. Compute finite-domain containment against the elder parent and chain depth to an essential peak. Do not convert an essential peak into a finite domain.
5. Compare every domain cell set against the saved `E`, `F`, `G`, `H`, selected `I`, principal path, `F\\I` and `H\\I` sets. Report domain-level fractions and unique-covered-cell intersections. `F\\I` means omitted skeleton cells only; it is not all omitted E history.
6. Use the parent's reciprocal-best-by-intersection and reciprocal-best-by-Jaccard flags as separate descriptive correspondence relations. Connected components across adjacent saved anchors are named correspondence families, not material events or identity laws. A family with one anchor may still have a non-reciprocal nonzero spatial overlap.
7. Relate family anchor count to the full domain-size and contrast distributions. No lifetime, size or contrast cutoffs, classifier, score or ranking are added.
8. Retain the former maximum-finite-contrast winner only as a reference annotation in the report. It has no priority in the ensemble measurements.

## Stop conditions and decision

This is an interpretation audit. Do not create a proposer, capture rule, UPDATE, hysteresis, BODY, material mapping, production state or simulation. Use only one of:

- `USEFUL DOMAIN AVAILABILITY OBSERVED`
- `DOMAIN AVAILABILITY EXISTS BUT IS TOO UNDERDETERMINED`
- `MOSTLY CHEMICAL MICROSTRUCTURE`
- `INSUFFICIENT`

Finite mathematical domains remain chemical/history readouts. Their existence does not establish material meaning or a rule for choosing one.
