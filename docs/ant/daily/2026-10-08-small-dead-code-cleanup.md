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

- Static source/reference audit completed against the stated main HEAD.
- Git tree/branch diff and changed-path scope must be checked after creating the commit.
- **`npm test`, `npm run build`, and dev/production browser smoke were not executed here**: this session cannot access a runnable repository checkout, and the external Git host is not reachable from the local execution sandbox. Those checks remain **pending** before considering a merge.
- Do not treat historical source hashes as expected to match the new current HEAD.

Commit this cleanup on a dedicated branch and push that branch only. **Do not merge into main or open a PR** before execution validation.
