# Validation record

## Authority and source pins

- Live `origin/main` read at completion start: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785` (`git ls-remote`); local `origin/main` matched.
- Research parent: `10b1cbd877f4130924be83daa37fe8c40e9b230c`.
- `productionSourceHashes` in `data/ad-s/PROVENANCE.json`: all 11 pinned production files match their current bytes. The source list includes the actual ant controller/agent, `LocalOccupancy`, `MaterialStratigraphy`, `SurfaceField`, `TrailPlateBirth`, and the canonical ANT guide.
- Frozen N and AD-L inputs match the pinned hashes in the treatment provenance; AD-L source receipts also match its parent `SHA256SUMS.txt`.
- The AD-S instrumentation source pinned at run time is SHA-256 `57ae985c125d9f944758ca84924b6235f52e02601d37af3c75f1c3995055d3bf`. After the full run, the analysis-only code was corrected to rebuild reference foot grids from saved frozen foot coordinates and to retain both runner and analyzer receipts. Final analysis source hash: `eeb467030e5273bb7fdfca43528adf8411e644af4feda895bb85e1f18b23e36b`. The run instrumentation hash remains pinned in provenance; the post-run edit did not rerun or alter the treatment.

## Run and paired-analysis checks

- One AD-S run completed 36,000 ticks / 600 model seconds from the frozen initial-state hash; no N or AD-L run was repeated.
- Initial state hash matches N and AD-L; first Plate birth time matches exactly at `84.01666666666823 s`; positions and contact buckets match frozen N through 84 s.
- Forty late opportunity anchor ticks match the registered anchor list.
- Observer RNG calls: `0`. Production behavior mutation: `false`.
- L=1 conformance: A `44,253` checks / `0` mismatches; D `46,984` checks / `0` mismatches.
- `ANALYSIS.json` was regenerated from saved frozen artifacts; analyzer returned `ANALYSIS-RERUN-PASS` and its second deterministic reconstruction matched exactly.
- Scoped `.gitattributes` rules resolve this package's Markdown/JSON/script/daily text as LF and compressed packets as binary; no runtime behavior is affected.
- Treatment invariants: zero finite, speed-cap, turn-cap, overlap, population-ceiling, nonfinite field/surface, monotonic-time, contact-count, or Plate-birth-count failures.
- 10,041 consecutive one-second position pairs had no exact-zero displacement; this is a descriptive stall check only.

## Corrections and preserved attempts

Two initial attempts stopped at tick 1 before advancing model time because observer assertions did not reproduce the native floating-point calculation exactly. Both failures are preserved under `data/attempts/attempt-01/` and `attempt-02/`; neither changed production or frozen inputs, and neither produced a treatment result. The successful run followed instrumentation-only parity fixes.

Post-run analysis attempt 1 stopped before writing the analysis because frozen N/AD-L auxiliary packets retained individual foot coordinates, not a precomputed `footGrid`. It was fixed by applying the same registered 96×96 nearest-cell rasterization to the saved foot coordinates. No simulation rerun was performed. A generated analysis from before the source-receipt correction is preserved as `data/attempts/analysis-01/ANALYSIS-before-source-receipt-fix.json`.

The analysis output previously used the same JSON key twice for source receipts, which hid the instrumentation/postprocessing hashes behind frozen-reference hashes. The research analyzer now stores all three under one `sourceReceipts` object; the corrected analysis was reconstructed and passed exact rerun validation. Details are in [`ANALYSIS-CORRECTION.md`](ANALYSIS-CORRECTION.md).

Independent acceptance review found no blocking issue. Its denominator clarification was added to the D table: target-reduction distributions use all material final-target calls per L bin, while the adjacent opportunity count is finite same-flow only.

## Checks performed

- `node --check scripts/ant-material-feedback-surface-vs-depth.js`
- `node scripts/ant-material-feedback-surface-vs-depth.js --self-test`
- `node scripts/ant-material-feedback-surface-vs-depth.js --analyze`
- Artifact SHA-256 manifest in [`SHA256SUMS.txt`](SHA256SUMS.txt).
- `git diff --check` and a scoped check that `src/`, `static/`, canonical `docs/ant/README.md`, and existing evidence were not changed.

No full repository build/test suite was run; no production implementation was changed.
