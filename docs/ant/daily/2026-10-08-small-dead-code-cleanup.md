# 2026-10-08 — Small dead-code cleanup (branch-only)

## Question and boundary

After closing S2c and parking the no-relationship social observation layer, check whether any unused pre-gait utilities remain in the present production code. This pass is intentionally narrow: no behavior retuning, audio DSP change, social observer change, script reorganization, historical evidence rewrite or main merge.

Starting main HEAD: `f25fa6809df57a3ad218875527283c46c0980f38`.

## Reference audit

Default-branch GitHub code search and source inspection found:

- `StepEventGenerator`: the early distance-based `STEP` class; its remaining live-code references are its own module, a library barrel export and `tests/ant-step-events.test.js`. Current `AntController` instead emits actual gait `FOOT_CONTACT` events. Historical documents and provenance retain references to the older experiment.
- `TrajectoryBuffer`: an independent ring-buffer utility; remaining live-code references are its own module, a library barrel export and `tests/trajectory-buffer.test.js`. Current ANT runtime, demo and evidence analysis do not import this utility.

No current production import/call site or current evidence harness dependency on these two classes was found by the repository search. This is a static reference audit, **not** a runtime execution proof.

## Changes

Remove exactly these five files/exports:

- `src/lib/agents/ant/StepEventGenerator.js`
- `src/lib/utils/TrajectoryBuffer.js`
- `tests/ant-step-events.test.js`
- `tests/trajectory-buffer.test.js`
- their two named exports from `src/lib/index.js`

No replacements, compatibility shims, behavior changes or refactoring of historical harnesses.

The removed source is retained in Git history at the starting HEAD, so earlier audio-v0/trajectory experiments must be reproduced from their historical pinned revisions rather than assuming present main retains those old modules. Existing committed evidence files and checksum ledgers are unchanged.

## Validation and stop

- Verified branch `ant-small-dead-code-cleanup-20261008` at expected cleanup HEAD `c6c22c5a25db160b9c675d241ed749bb00576072`; working tree was clean before verification.
- Branch diff from starting `main` contains exactly the five cleanup code paths above plus this daily log and its `docs/ant/daily/README.md` index entry. `git diff --check` passes.
- Independent search across active `src/`, `tests/`, `scripts/` and evidence JavaScript found no remaining `StepEventGenerator` or `TrajectoryBuffer` references/imports.
- Focused run passed **53/53** across ANT controller, gait, surface integration, Plate birth, ANT audio integration, environment audio and model contract tests. It confirmed actual gait-derived `FOOT_CONTACT`, Plate/audio routing and model-switch cleanup.
- Full `npm test` passed **265/265**.
- `npm run build` passed. Rollup reported existing Zod annotation-comment warnings and the existing >500 kB application chunk warning.
- `npm run test:browser` passed in Vite development mode; `CHECK_PRODUCTION=1 npm run test:browser` passed against the production preview. Browser checks confirmed ANT initialization, contact generation, Plate/audio behavior and switching among ANT/String/Plate/Sphere models.
- Historical `docs/ant/evidence/` files and checksum ledgers have no branch diff. S0–S2c evidence has no diff. No production behavior, audio DSP, or non-removal test source changed.
- The default sandbox initially blocked Node test worker creation with `spawn EPERM`; the same focused command passed when rerun with process permission. No test assertion failed.
- Do not compare historical source hashes to current HEAD. Preserve the cleanup commit as branch-only; verification is recorded separately, then push the same branch. Do not merge or open a PR.
