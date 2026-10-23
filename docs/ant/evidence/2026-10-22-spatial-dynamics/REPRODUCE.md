# Reproduction and scope

## Baseline and exact inputs

Freshly fetched production `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. All current production files remain unchanged. Exact natural-run sources are copied within each case's `source-snapshot/`, with hashes embedded in its capture. The early baseline capture predates metadata-label corrections; see `baseline/README.md`. World state, RNG behavior and its 600 s long-run prefix were checked independently.

Research tooling copied by exact file from curvature commit `d0e07d089c82d29409c7dd067e17cdeb9a5ecf7f`: `ant-route-curvature-metrics.js`, `ant-route-curvature-shadows.js`, `ant-route-curvature-probes.js` and focused tests. Recruitment descriptor code/tests came from `046b21cb083ec167352afdeed206466af8eeba04`. No research branch was merged. The metrics test's old trajectory-codec dependency was not imported; only metrics used here are tested. The previous raw controlled capture is not needed: missing or incompatible prior controls cause a fresh complete matrix, as happened in this pass.

Stored raw-result bytes total 615,078,970; lossless gzip totals 157,510,358. The largest packed file is 53,215,527 bytes. The manifest records original and packed hashes; individual reports' original JSON hashes continue to refer to decompressed bytes. Restore first:

```powershell
node docs/ant/evidence/2026-10-22-spatial-dynamics/validation/restore-results.mjs --self-check
node docs/ant/evidence/2026-10-22-spatial-dynamics/validation/restore-results.mjs
```

No file is replaced unless its existing content already has the expected hash. The restore command is repeatable and performs no simulation. The packaging command is for maintaining this evidence only; it validates every gzip round trip and records the exact packager hash.

## Regeneration

Run from repository root with installed dependencies. Use new directories under ignored `test-results/`; existing evidence refuses overwrite. For an exact frozen tool revision, use the per-case source snapshot and its receipt, rather than assuming the current writer's descriptive metadata is identical. Dynamic controller construction asserts exact production expressions and uses production relative imports.

For one new north-observed baseline, the following JavaScript can be sent to `node --input-type=module`:

```js
import { makeSpatialController } from './scripts/ant-spatial-core.js';
import { runSpatialCase } from './scripts/ant-spatial-run.js';
const { Controller, receipt } = await makeSpatialController();
await runSpatialCase({ Controller, receipt, seed: 20261005, seconds: 600,
  output: 'test-results/spatial-baseline-05/result.json', label: 'production' });
```

Repeat with seeds 20261006 and 20261007 for the other baselines. It is important to use this observer controller for spawn-flow evidence; the plain runner CLI does not add the research recruitment hook.

Controlled and natural movement use the exported fixed protocols:

```js
import { runControlledMovement, runNaturalMovementScreen } from './scripts/ant-spatial-movement.js';
await runControlledMovement({ output: 'test-results/spatial-controlled.json' });
await runNaturalMovementScreen({ outputDir: 'test-results/spatial-movement' });
```

The controlled matrix uses exact production `tick`, one ant, fixed analytic/deposited cues, 3 seconds, six geometries, three seeds and the three named feedback conditions. The deposited cue is held frozen during the tracking assay. It is not a natural reinforcement experiment. The full field assay is `node scripts/ant-spatial-field.js`; its CLI writes canonical output, so rerun it only in a separate checkout or import/run a copied driver with a fresh output target. Do not overwrite the retained evidence. Field protocol and results remain baseline-only; there is no CIC mode.

```powershell
node scripts/ant-spatial-recruitment-runs.js --output-root=test-results/spatial-recruitment
node --max-old-space-size=12288 scripts/ant-spatial-long.js production test-results/spatial-long-production
node --max-old-space-size=12288 scripts/ant-spatial-long.js dtFeedback test-results/spatial-long-dt
node docs/ant/evidence/2026-10-22-spatial-dynamics/validation/verify-long-prefix.mjs test-results/spatial-prefix-recheck.json
```

The long driver fixes seed 20261005, 7,200 model seconds and the 256 cap. It preserves production north recruitment and field. The runner holds full-rate compact curvature samples until summarizing; long runs can use substantial memory. Recorded wall times include research instrumentation and should not be compared as production performance.

Analyze only explicit completed inputs and fresh output paths:

```powershell
node scripts/ant-spatial-analysis.js <result-a.json> <result-b.json> --output test-results/spatial-analysis
npm test
npm run build
```

PNG comparison reproduction and exact scale/coordinate definitions are in [visual/README.md](visual/README.md). Its default output directory also refuses replacement. The preexisting compact analysis SVGs use model +y upward; PNG contact sheets use the production renderer's screen +y downward. Comparisons within either set use a consistent viewport; do not overlay one convention on the other.

## Claims that regeneration does not establish

Shared initial seeds do not imply post-intervention RNG equality, spawn cadence equality or shared lifetime events. Full-tick source/observer parity is a baseline check, not such a claim. The preserved 600 s prefix check compares exactly four public checkpoints, 600 one-second frames, 6,000 ten-Hz trajectory frames and accepted-spawn records. It excludes wall time, labels, source metadata and whole-run summaries, and does not claim equality of every tick's internal state, contacts or RNG calls.

The two-hour runs are accelerated model histories. No new headed Chrome soak, browser memory calibration, audio continuity or installation-duration assurance is included. Three-seed 600 s observations do not make the one-seed long result universal. Human review is recorded separately from metrics in `HUMAN-REVIEW.md`.
