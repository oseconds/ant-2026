# ANT natural field-to-turn transfer research

Date: 2026-10-23 KST. Research branch: `codex/ant-natural-field-transfer-20261023`. Fresh production baseline: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. This package is a research branch, not production adoption or an exhibition readiness certificate. Production ANT source, startup configuration, renderer, audio, recruitment, material laws and capacity remain unchanged.

The artist's current priority is **live pheromone and route change**. Persistent material blank-space renewal is a separate question. Its absence is not an automatic veto of live change; neither does that priority authorize erosion, history deletion or a cap change.

## Reading order

Start with the [final research decisions and ten requested answers](REPORT.md). No production or integrated exhibition configuration is adopted.

1. [Frozen question, sampling and gates](PLAN.md), [source/control audit](AUDIT.md), and [Gate A decision](GATE-A.md).
2. [Complete-state matrix](capture/matrix-20261023/matrix-manifest.json) and [matched-state analysis](analysis/matrix-20261023/REPORT.md).
3. [Default-Gaussian phase analysis](phase/analysis/REPORT.md), [frozen protocol](phase/PROTOCOL.md) and [qualification command](phase/RUN.md). This is a new fixed-history representation question; the prior failed CIC gate remains failed.
4. [Local routelet reuse](collective/analysis-report.md), [fixed spatial anchor follow-up](collective/anchor-report-v4.md), and [representative contact sheet](collective/representatives-v4-0.012-600s-contact-sheet.png).
5. [Natural material transfer census](MATERIAL-TRANSFER.md) and [persistence consumer contract](PERSISTENCE-CONTRACT.md).
6. [Derived feedback qualification](GATE-C.md), [all 144 controlled cases](movement-qualification/REPORT.md) and [S-curve review plot](movement-qualification/plots/sCurve-seed19-field-controls.png).

The [independent review](validation/independent-review.md) preserves interim findings and final reconciliation. [Environment](validation/environment.json), [tests](validation/full-tests-final.txt), [build](validation/build.txt) and [byte-exact prior-tooling receipts](validation/reused-source-receipts.json) define validation scope. Phase results are conditional one-tick sensitivity; local routelet reuse is not an extended corridor, and prior two-hour model evidence is not browser stability.

[Human review scope](HUMAN-REVIEW.md) records the supplied judgments and the unanswered optional current-image question separately from technical figure inspection.

## Reproduction

Run from the repository root using Node 22 or the repository-supported Node version. No browser or audio object is created by these model/replay commands. They can take substantial CPU and memory; run the history/phase jobs serially. Accelerated model seconds and one-tick replay costs are not browser performance measurements.

```powershell
# Recreate the preregistered 66-state / six-history matrix into a NEW directory.
# The default directory already contains retained evidence; the writer refuses overwrite.
node --input-type=module -e "import { runTransferMatrix } from './scripts/ant-transfer-matrix.js'; await runTransferMatrix({ outputDir: '.cache/ant-transfer-reproduction/matrix' });"

# Verify every frozen source, state/history receipt and reconstructed field checkpoint.
# The analyzer also refuses overwrite; pass a fresh output directory when reproducing.
node scripts/ant-transfer-analysis.js docs/ant/evidence/2026-10-23-natural-field-transfer/capture/matrix-20261023/matrix-manifest.json .cache/ant-transfer-reproduction/analysis

# One state in the separately frozen phase challenge. See phase/RUN.md for cohort execution.
node scripts/ant-transfer-phase-runs.js --capture-id production-seed-20261005-30s --output .cache/ant-transfer-reproduction/phase-30s.json.gz

# Verify and re-analyze the entire saved phase cohort into a fresh directory.
node --expose-gc scripts/ant-transfer-phase-analysis.js --output-dir .cache/ant-transfer-reproduction/phase-analysis

# Optional: reproduce the fixed 144-case controlled qualification, without overwriting receipts.
node --input-type=module -e "import { runQualification } from './scripts/ant-transfer-feedback.js'; await runQualification({ outputPath: '.cache/ant-transfer-reproduction/feedback/results.json' });"

npm test
npm run build
```

The material audit contains an exact read-only census snippet. [Collective reproduction](collective/REPRODUCE.md) verifies or restores only the eight raw inputs from `9fcd96205ff8a5c671be26e2e024524c0e9345d1`, without overwriting existing captures. Do not substitute newly simulated trajectories, normalize bytes or merge the old branch. Generated source copies are audit receipts; use the current generator to resolve local import paths. Regenerated metadata/source-path hashes and corrected summary fields can differ from original execution receipts; compare the pinned raw movement and field/state values, not creation timestamps.

## Evidence boundaries

- IMPLEMENTATION FACT: source expressions, call order, immutable material and retained locomotion semantics.
- MATCHED-STATE REPLAY RESULT: same graph, field, RNG and pre-tick state, with only the feedback expression varied.
- COUNTERFACTUAL SHADOW RESULT: independent natural histories under different policies, including their endogenous lifecycle/RNG/contact/material divergence.
- CONTROLLED-PROBE RESULT: constructed analytic/deposited cues or half-cell replay, with the declared fixture and finite-boundary limits.
- LONG-RUN RESULT: prior one-seed 7,200 model-second data only, unless another explicitly named experiment is added. No two-hour browser soak is performed by replay.
- HUMAN / ARTISTIC JUDGMENT: only the artist's response to the specific supplied artifact. A diagnostic curve is not exhibition acceptance.
- DESIGN INTERPRETATION / OPEN HYPOTHESIS: consumer lifetime separation, total field responsibility, extended corridor persistence and future law choices.

The package preserves superseded pilot metadata with an explicit [erratum](capture/pilot-v1-erratum.md), and records packaging/execution corrections without overwriting earlier scientific evidence. Other worktrees, unrelated untracked captures and the previous research branch remain outside this publication scope.
