# Long-run visual turnover survey — evidence index

**Decision: MIXED; analysis only.** The renderer compresses genuine internal top-partition turnover, the accumulated footprint/long-window cohorts remain similar, and production's 256-Plate cap independently stops material births. The artist reads only slight improvement from the diagnostic identity/boundary views. No new exhibition renderer or world law is adopted; the previous submission decision remains E (not ready).

Read the [final report](REPORT.md) for measurements, claim boundaries, the human judgment and one proposed next pass. The [source audit](SOURCE-AUDIT.md) records consumer semantics and past rejected selector alternatives. The [daily record](../../daily/2026-10-22-visual-turnover-survey.md) records process and decisions; [fresh review](REVIEW.md) records independent critique and dispositions.

## Provenance and authoritative artifacts

- Branch: `codex/ant-visual-turnover-survey-20261022`; research base `c1332b8e686fd9f7099c8b33a8a017b6ce31cf63`.
- Verified tooling/test commit: `49696e667f2bdeac827ffb198b18e503a1c01d48`; evidence and final documentation follow separately on the same branch.
- Freshly fetched `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. This pass changes no production source. The base's audio/readout prototypes remain separately labeled and opt-in.
- Inputs: prior [default-cap visual capture](../2026-10-21-long-run-exhibition/visual/run-manifest.json) and [approved capacity shadow](../2026-10-21-long-run-exhibition/visual-capacity-1024/run-manifest.json), seed `20261005`, fixed 1/60 model step, Audio Off, saved 0/60/300/900/1800/3600/7200-second snapshots. All raw inputs are reused without mutation.
- [Metrics v2 JSON](metrics/v2/visual-turnover-metrics.json) / [summary](metrics/v2/summary.txt): per-birth union overlap, IDs, top partitions and matched-run detail. Its `cohortTransitions` tracks the same birth bin across milestones; it is a retention control, not different-cohort morphology.
- [Geometry supplement JSON](metrics/geometry-supplement-v1/geometry-supplement.json) / [summary](metrics/geometry-supplement-v1/summary.txt): authoritative different 10/20-minute birth-bin comparisons, within-run top boundaries/ARI and material-complement geometry. Source/test hashes and eight raw input receipts are embedded.
- [Final-v2 visual set](visual/final-v2/README.md) / [manifest](visual/final-v2/manifest.json): 11 PNGs using 0/15/30/60/120-minute shadow states, actual 640×640 canvas, DPR 1, installed headless Chrome 155. Three diagnostic overlays use alpha 112; built-in recent retains alpha 64.
- [Validation](VALIDATION.json), [integrity log](integrity-log.json), [test summary](logs/tests-summary.txt), [build log](logs/build.log). The test summary preserves the runner totals, not a full TAP transcript.

No new simulation, formation shadow, AudioContext or real-time soak ran in this pass. Existing accelerated two-hour snapshots cannot establish two-hour browser stability. Existing bounded audio's 18:00.296 headed run remains its actual runtime limit; audio was not retuned.

## Reproduction

From the repository root with the existing Node ≥20 dependencies installed:

```powershell
node --test tests/ant-visual-turnover-analysis.test.js
node scripts/ant-visual-readout-survey.js --self-check
npm test
npm run build
```

The one-shot research generators use fixed evidence output locations. **Run generators in a disposable copy/export of this commit, retaining the prior 2026-10-21 raw inputs and omitting this package's generated output directories.** Do not delete or replace the original evidence in the working repository. The two metrics commands regenerate derived JSON/summary at their fixed paths; they overwrite those derived files if already present. The renderer generator refuses a nonempty final-v2 output directory (other than its README).

```powershell
node scripts/ant-visual-turnover-analysis.js
node scripts/ant-visual-geometry-supplement.js
node scripts/ant-visual-readout-survey.js
```

Rendering starts a temporary local Vite server, launches installed Chrome headlessly, renders immutable saved snapshots and closes both. Windows default Chrome path is `C:\Program Files\Google\Chrome\Application\chrome.exe`; set `BROWSER_EXECUTABLE_PATH` when different. PNG hashes are receipts for this recorded environment, not a cross-browser pixel-identity guarantee. JSON inputs are validated against the original capture manifests; output artifacts carry input/source receipts.

Definitions and denominators are in the report and JSON method fields. Tests cover pure ID renaming versus actual partition changes, disjoint support, union growth versus identity change and four-neighbor complement components. Empty/no-common-support results are distinguished from observed similarity. No aggregate novelty score or automatic artistic acceptance is used.

## Selection and preservation

Only the final-v2 views, metrics v2, geometry supplement, source audit, validation/logs and final documents are selected for this commit. Earlier local `visual/` exploratory/corrected/final render revisions and root-level preliminary `metrics/` outputs remain superseded and uncommitted; their known provenance limits are noted in the integrity receipt. The corrected identity/boundary images submitted to the artist are byte-identical to final-v2, so that judgment applies to the committed images.

The prior unfinished `scripts/ant-exhibition-recent-stills.js` remains separate and uncommitted. The existing secondary research worktree and its two unique unpushed commits are preserved. No new worktree, PR, merge or force-push is used. `docs/ant/archive/**` was excluded. Production defaults and existing material history remain intact.
