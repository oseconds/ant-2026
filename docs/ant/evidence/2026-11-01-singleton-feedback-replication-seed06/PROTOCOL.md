# Protocol — singleton-feedback replication, seed 20261006

## Registered question and authority

Replicate exactly one paired 300 s closed-loop feedback probe on seed `20261006`, using the seed-20261005 implementation and observer semantics without tuning.

- Production authority: `main@bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Implementation parent: `codex/ant-singleton-feedback-sensitivity-20261101@f462d7b0f684afea1bb6868b6045524360e05f2e`.
- Frozen observer closure: `2cfe9cbab78df2af9e77d9df450c67fb603aa22c`.
- Branch: `codex/ant-singleton-feedback-replication-seed06-20261101`.
- Frozen seed packets: `seed-20261006.signals.json.gz`, `seed-20261006.opportunities.json.gz` and its registered chunks, and `events-20261006.json.gz` from the established local-opportunity and B/C dual-history packages.

The live observer and singleton/feedback behavior code are unchanged from the parent probe. Only the runner's seed, frozen input, branch, and package identifiers are set to this replication; the verifier and manifest point to the seed-20261006 package. The only behavior source delta against production authority remains the same default-off `researchLayerCountProvider` hook.

## Runs and frozen CONTROL gate

Run CONTROL and TREATMENT with separate fresh controllers, RNGs, observers, and overlay arrays, seed `20261006`, `dt=1/60`, 18,000 ticks, Audio Off. CONTROL must pass the paired runner's frozen checks before it starts TREATMENT.

CONTROL comparison checks every one of the 300 requested boundaries for E/F/B/C/D arrays, production material layer/top maps, production Plate IDs, birth times and masks, and boundary RNG calls/state. The live B/C observer is compared against the saved opportunities and X captures; emitted event identities, times, track intervals, and X masks are compared against the frozen maturation events through 300 s. A mismatch stops the paired run before interpretation.

## Locked observer and feedback law

B is native `TrailPlateBirth.chemicalMemory`. C is native `SurfaceField` compaction. Opportunities, `.15` grouping, reciprocal-nearest `.025` tracking, same-component safeguard, X radius `.15`, 8-neighbor connectivity, and `20 s` uninterrupted / adjacent Jaccard `>=.60` maturation are inherited unchanged from the parent implementation.

At a new maturation boundary, exact same-X B/C events are one spatial `{B,C}` option while both event receipts remain. A new option deposits only if it has zero positive-X-overlap degree against every other currently mature unique X. Otherwise the event is recorded as contested and receives no later retry. Each accepted episode increments every saved X cell once.

At movement tick entry the optional provider adds the research overlay cell count to the production `layerCountByCell` read. That single effective L continues into existing speed, A, and D consumers. The observer runs after the completed movement and ordinary production analysis at a boundary; an overlay layer can affect movement only at a later tick. The overlay is not read by production material, Plate, Nodule, audio, or renderer systems.

## Timing and summaries

The native one-second analysis anchors and exact model times are preserved. Exposure windows and paired formation summaries use `[windowStart, windowEnd)` for `0–60`, `60–120`, `120–180`, `180–240`, and `240–300 s`. Checkpoints are completed ticks at nominal 60 s multiples.

The cross-seed summary is derived independently per seed from the saved paired runs: mean mature/singleton/contested X option count across the 300 analysis boundaries; contested-option share as total contested option appearances divided by total unique mature-X appearances; event totals from matched run receipts; exposure fraction from exposed/living ant-ticks; and production Plate count from each arm's own run. Window differences remain separate by seed. No trajectories are concatenated or pooled.

Production candidate identity is compared at jointly available boundaries using source index, target index, mask SHA, and supported-mask SHA. Full candidate-record equality is counted separately. Actual birth receipts retain masks in each arm's signal file; the cross-seed summary records birth time and mask-cell count.

## Reproduction

From the repository root on the requested branch:

```powershell
node scripts/ant-singleton-feedback-sensitivity.js
node scripts/ant-singleton-feedback-verify.js
node scripts/ant-singleton-feedback-manifest.js
node --test tests/ant-material-locomotion-resistance.test.js tests/ant-singleton-feedback-observer.test.js
node --test tests/ant-*.test.js
node --test --test-reporter=dot tests/*.test.js
```

The runner's constants select only seed `20261006`, its frozen packets, branch, and evidence directory. It still requires the exact authority branch and source-diff preflight. The manifest generator also writes `analysis/cross-seed-summary.json` from the saved seed-20261005 and seed-20261006 paired receipts.
