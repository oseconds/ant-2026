# Validation — pheromone cross-lifecycle provenance

## Observer and paired-run validity

- Three production-default seeds completed 36,000 observer-off/on paired ticks each.
- Agent state and RNG state/call count matched after every tick.
- At 0/30/60/120/300/600 s, agent, pheromone, SurfaceField, TrailPlateBirth, MaterialStratigraphy, and event hashes matched exactly.
- All 36,465,983 observed field samples reconstructed within `max(1e-9, abs(sample) × 1e-6)`; maximum error `4.44e-16`.
- Cap touches: `0`. Unattributed writes/batches: `0`. Negative writes: `0`.
- Maximum checkpoint sum of absolute node residuals / production node sum: `8.03e-7`; registered gate: `1e-4`.
- Replayed production counts, contacts, first Plate times, and Plate counts match the saved G natural-conformance receipt.

## Code checks

- `node --check scripts/lib/antPheromoneProvenanceObserver.js`: pass.
- `node --check scripts/ant-pheromone-cross-lifecycle-provenance.js`: pass.
- `node --test tests/ant-pheromone-provenance.test.js`: 1/1 pass. The focused test runs matched controllers for 600 ticks and checks exact agents, RNG, and pheromone values.
- `npm test`: 340/340 pass, 0 failures.
- `npm run build -- --outDir test-results/ant-pheromone-cross-lifecycle-provenance/build`: pass. Build emitted existing Rollup `@__PURE__` annotation notices from Zod and the existing large-chunk warning. The task-specific output path preserves the pre-existing ignored `dist/` directory.
- `git diff --check`: pass.
- Production `src/` and canonical `docs/ant/README.md`: unchanged.

## Independent read-only review

A fresh reviewer found the actual-write attribution, sample-time lifecycle classification, cache invalidation, bilinear reconstruction, and stated descriptive claim technically sound for the registered default runs. The reviewer confirmed the 65.04% denominator is summed production sample signal across repeated raw sensor reads, not unique positions or behavioral causality.

The review caught a constant `productionSrcUntouched` receipt field. It was removed from the runner and saved result; source preservation is supported by Git diff and [`SOURCE-PROVENANCE.json`](SOURCE-PROVENANCE.json), not by a claimed observer measurement. The reviewer also noted segment-dose clipping is not validated for continuous deposition. The registered G default is `dab`, with zero segment requests, so this limitation does not affect this pass.
