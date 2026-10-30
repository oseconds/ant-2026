# Validation

## Frozen-source and replay checks

- Pinned source authority: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Fresh `origin/main`: `15667c73e9f507bf89dea645f966bc7f58301fdc`; observed two-commit delta is `.github/workflows/deploy.yml` and `vite.config.js`. Relevant ANT source and canonical guide match the pinned source.
- Primary frozen packet: current-G/H0 calibration, seed `20261005`, 60 Hz, 600 s, Audio Off. Raw input SHA-256: `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`; the five 30/60/120/300/600 s checkpoint hashes and auxiliary input hash are recorded in [`PROVENANCE.json`](PROVENANCE.json).
- Replay: **PASS**. Raw packet and all five saved checkpoints byte-identical; final RNG `{state:1884230109,calls:349136}` exact; layer-count, native turn, and finite D counts exact; late SurfaceField/support and pre-material layer maps exact; Plate IDs, birth times, and masks exact.
- Observer mutation: production behaviors unchanged; no RNG calls added. Candidate A, D, and residence remained disabled. Production `src/` and canonical `docs/ant/README.md` unchanged.

## Measurement checks

- Instrumentation source hashes match the pinned source receipt. Replay capture SHA-256: `1f9f7d9856dac917801cf5f14e4073618fa77cc942043b77c83db74964286f9b`.
- Exact coverage: 36,000 ticks, 423,002 material-exposed ant ticks, 423,002 native turn calls (one per exposed ant tick), 32,366 finite same-flow D opportunities, 36 immutable Plates, and 40 requested late grid anchors.
- Descriptor/formula assertions verify top Plate identity, thickness, immutable birth metrics, and the source material formulas. Extraction reads actual grid arrays and actual ant positions; all observed values are finite and nonnegative where expected.
- `ANALYSIS.json` deterministic rerun was previously byte-exact: SHA-256 `c715a8b7935ece75f5f19cc1f82d4d35e80f5c106ea1bd992ce4fa7c3112fdcc`. Replay capture was not changed during analysis-only reruns.
- Embedded self-test passed: average-rank tie handling, perfect-linear Pearson, quantile sample count, and column-history interning. `node --check` passed.
- No atlas was added, so no visual-to-data check was applicable.

## Checks not run

- No full repository build or test suite; the work changes only observer-only research tooling/evidence and runs its focused assertions.
- No second seed, treatment comparison, causal feedback test, or visual/artist review.

Artifact SHA-256 manifest: [`SHA256SUMS.txt`](SHA256SUMS.txt).
