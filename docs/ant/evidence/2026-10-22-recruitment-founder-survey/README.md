# Recruitment / founder-condition survey

Research baseline: fresh `origin/main` commit `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. Branch: `codex/ant-recruitment-founder-survey-20261022`, primary worktree. No previous research source, audio or renderer prototypes are inherited. Production code remains unchanged.

Verified tooling/test commit: `436a8207b79cdd4407c56fd2eb67170dbfa8a68c`. Final evidence/documentation follow separately on the same branch. Staged source bytes were checked against executed working bytes; the visual generator's captured CRLF bytes are explicitly preserved by Git attributes.

This package investigates the continuing fixed-heading recruitment condition and a finite state-conditioning contrast. It does not adopt a new recruitment algorithm, scripted phases, movement/selector tuning, history capacity, renderer or audio change. [PLAN.md](PLAN.md) records choices before their respective runs; [SOURCE-AUDIT.md](SOURCE-AUDIT.md) and [FAMILY-MAP.md](FAMILY-MAP.md) separate source facts, executed mechanisms and unexecuted alternatives.

**Final result:** continuing heading responsibility SUPPORTED; fixed-position responsibility untested. Direct/slow chemical policies do not establish a clear benefit over isotropic recruitment, and human temporal review still finds the large impression similar. No production candidate is adopted. [Final report](REPORT.md) · [Independent review](REVIEW.md).

## Evidence layout

- `controls/`: three seeds × four static heading laws, 600 simulated seconds each. Baseline paired production validation covers all 36,000 tick RNG boundaries, checkpoint snapshots and contact hashes per seed.
- `conditioning/`: selected direct/slow pheromone-sector initial-condition shadows, three seeds, 600 seconds each.
- `extension/`: baseline/isotropic/direct/slow, preselected seed 20261005, 1,800 seconds each. Accelerated model runs only; no hours-long operational claim.
- `execution-sources/stage-a/`: exact executed tooling before the descriptor-label and serialization corrections. Original raw captures and receipts are retained.
- `analysis/`: continuous metrics, manipulation/RNG checks and downstream material observations. No scalar novelty score or inferred biological modes.
- [Matched-window correction](analysis/matched-window-correction.json) supplies all final 301/1,201-sample means; [Stage B v2](analysis/stage-b-v2-receipt.json) supplies policy/material and normalized prefix checks. Earlier receipts remain as provenance and are superseded only where stated. [Historical length annotation](analysis/material-endpoint-length-label-annotation.json) identifies the old normalized-distance field label and executed analyzer copy.
- `visual/final/`: corrected authoritative Stage A fixed-viewport Chrome comparisons, descriptor CSV/SVG and receipts. Earlier root-level visual PNGs omitted environmental overlays because JSON typed arrays had become numeric-key objects; they remain local, superseded and unselected. The corrected renderer-only projection validates grid length/contiguous keys and preserves raw inputs.

Each case records actual command/status, source hashes, clocks, applied spawn headings, compressed 1 Hz frames, selected full snapshots, all-tick RNG trace and immutable birth data. Source hashes identify which tooling revision was executed; current script bytes need not equal the frozen Stage A runner. The original Stage A field named `gyrationRadius` is RMS distance from the nest. Analyses use covariance trace for actual centroid dispersion; the current helper exposes both measures under correct names.

The artist reviewed the corrected static 600-second control sheet and answered **“전체 공간 분포 차이가 읽힌다”**. For direct/slow 5/10/15/30-minute sequences the response was **“국소 변화는 있지만 큰 인상은 비슷하다”**. Static condition differences and spontaneous temporal-regime quality are separate judgments.

## Reproduction boundary

Use Node ≥20 and the repository's existing dependencies. No dependency was added. First restore the 44 packed manifest/birth files with the unpack command below: it validates packed/raw hashes, skips identical existing files and refuses different existing files. [RAW-PACKING.json](RAW-PACKING.json) maps all paths and exact bytes. Originals stay unchanged locally; only lossless gzip copies are selected for commit (638,281,738 raw bytes to 18,954,760 packed bytes).

Run generators only to fresh output directories; they refuse to overwrite existing cases. Stage A reproduction requires restoring its exact runner/helper source copies to the corresponding `scripts/` paths in a disposable **Git checkout** of this commit. Keep originals unchanged. Stage B uses the current runner/helper and recorded variant/seed/duration commands in each case's `run-receipts.json`. Stage A visual source is preserved at `visual/execution-sources/stage-a/ant-recruitment-visuals.js`; the Stage B v2 analyzer is preserved at `analysis/execution-sources/stage-b-v2-ant-recruitment-analyze.js`. Their recorded hashes intentionally differ from later current scripts.

```powershell
node scripts/ant-recruitment-unpack.js
node scripts/ant-recruitment-shadow.js --variant=baseline --seed=20261005 --seconds=600 --output=test-results/recruitment-fresh-baseline
node --test tests/ant-recruitment-descriptors.test.js tests/ant-recruitment-shadow.test.js
node scripts/ant-recruitment-analyze.js --self-check
node scripts/ant-recruitment-visuals.js --self-check
npm test
npm run build
```

In a disposable checkout with this package's generated analysis/visual outputs omitted (retain all raw captures), run analysis in order: `node scripts/ant-recruitment-analyze.js`, then `--stage-b`, then `--stage-b --revision2`, then `--corrected-windows`. These modes refuse existing result files. For exact historical receipts restore their identified executed source first; current exports correct historical unit names. Render Stage A with the default visual script and extension with `--stage=extension`; each refuses its nonempty output directory. Do not remove committed evidence from the working repository merely to rerun it.

Validation: full tests **346/346** after fixing the new test loader import; build exit 0. Both initial failed TAP and fixed full TAP are retained under `validation/`. No production status changed. Maximum successful model duration is 1,800 seconds and Plate count 110; this is not a wall-clock soak.

Rendering uses installed headless Chrome, fixed 640×640 panels, DPR 1 and actual AntRenderer snapshots; it does not step the world or start audio. Matplotlib and chart packages were unavailable, so the diagnostic continuous plots use a documented SVG fallback with CSV samples, shared scales, null gaps and angle-wrap breaks. PNG receipts describe this environment, not cross-browser pixel identity.

Canonical production status is unchanged, so `docs/ant/README.md` is not rewritten. Previous visual/audio research remains separately identified by commit. Old untracked helpers/visual explorations and the existing secondary worktree's unique commits are preserved. No PR, merge or force-push.
