# Local-X audio architecture reassessment

Start with the [report](REPORT.md). The [protocol](PROTOCOL.md), [source-only independent diagnosis](INDEPENDENT-DIAGNOSIS.md), [candidate record before history](CANDIDATES-BEFORE-HISTORY.md), [late historical challenge](HISTORICAL-CHALLENGE.md) and [validation](VALIDATION.md) keep the investigation order and claim boundaries explicit.

**Result:** multiple coherent options remain; an artist decision on mechanical continuity and readout is required. The preferred starting model is sparse spatial stratified mechanics with material provenance and observation responsibilities kept distinct. Neither a bonded effective surface nor a new production audio architecture was adopted.

The [fixed atlas](ATLAS.md) indexes all 30 waveform/spectrogram panels and primary absolute/secondary shape ERB figures. Machine records include [world reproduction](analysis/receipts.json), [full render receipts](analysis/audio-render-receipts.json), [granularity falsification](analysis/granularity-probe.json), [1183 layer-window histories](analysis/layer-contribution-histories.json), [architecture summary](analysis/architecture-summary.json), [runtime profile](analysis/ant-local-x-audio-runtime-profile.json), [signal arrays](audio-analysis/analysis.json), [browser parity](analysis/validation/browser-parity.json) and [deterministic regeneration](analysis/validation/determinism.json).

## Reproduction

Use this research branch, Node 22+, installed npm dependencies, Playwright Chromium and a Python environment with NumPy. The measured Python was `C:\AI\ComfyUI_windows_portable\python_embeded\python.exe` (3.13.14, NumPy 2.5.1). The continuous render used Playwright Chromium 153; the separate CPU fixture used installed Chrome 157. Versions and source hashes are receipted; timing is machine-dependent.

```powershell
node scripts/ant-local-x-audio-worlds.js
node scripts/ant-local-x-audio-render.js --parity-only
node scripts/ant-local-x-audio-render.js
& C:\AI\ComfyUI_windows_portable\python_embeded\python.exe -B scripts/ant-local-x-audio-analysis.py
node scripts/ant-local-x-audio-plots.js
node scripts/ant-local-x-audio-granularity.js
node scripts/ant-local-x-audio-profile.js
node scripts/ant-local-x-audio-results.js
node scripts/ant-local-x-audio-verify.js
node scripts/ant-local-x-audio-manifest.js
```

Run the runtime profile without concurrent renders/analysis. It is a late-window main-realm CPU fixture, not a realtime AudioWorklet test. `node scripts/ant-local-x-audio-verify.js --regenerate-pure` snapshots 41 current evidence outputs to `.cache/local-x-audio-reassessment/verification-baseline`, runs the granularity, summary, Python analysis and plot CLIs in order, then compares their bytes with the snapshot. Set `ANT_RESEARCH_PYTHON` when Python is not on PATH; otherwise the verifier uses the bundled ComfyUI Python path when present, then `python`. On a mismatch or CLI error it restores the 41 snapshotted files and the plot manifest.

`node scripts/ant-local-x-audio-verify.js --rerun-case` performs that pure regeneration and checks or creates the single seed 20261005 REPLACEMENT full browser render under `.cache/local-x-audio-reassessment/rerun/`. It does not overwrite the original PCM. The no-argument command checks existing receipts only.

Six full 300 s Float32 WAVs (115,200,044 bytes each), a separate deterministic rerun, exact duplicate world signals and temporary browser products remain under `.cache/local-x-audio-reassessment/`. They are not committed. The exact captures/schedules, source, hashes and regenerated signal/visual summaries are committed; no giant raw PCM is required for reproduction. Audio comparisons use post-bridge gain 0.7 with no RMS matching.

[Manifest](manifest.json) and [SHA256SUMS](SHA256SUMS) use LF-normalized UTF-8 for text and raw bytes for compressed/image data. `--write` regenerates the manifest only after reviewing intentional package changes. No PR, merge, production adoption, extra seed, formation tuning, longer horizon or Residence work belongs to this package.
