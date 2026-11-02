# 2026-11-03 — Material Sketchbook v0

Completed the three independent discovery worlds requested November 2, on `codex/ant-material-sketchbook-v0-20261102`, based on verified `main@6dc73380b1985102bc2fb50da8963a7de5a89c71`.

Added an isolated `material-sketchbook.html` page with A activity-fed mass/agitation/bond evolution, B matched AB/BA leaky directional memory, and C conserved edge-capacity redistribution on fixed geometry. Shared controls provide deterministic seed, fixed-step run/pause/reset, optional diagnostics, portable full-state-checked replay, and a small frozen-state scalar mechanical probe with optional gesture-started sound. The Vite build includes the original entry and the new page. No production ANT module, renderer, formation law or Plate/Z audio path changed.

Default seed `20261005` was fixed before accepted observations. Browser captures cover 0/30/120/300 s for all three worlds; B additionally records the objective end-of-input boundary at 40 s. A continues redistribution and bond recovery after supply ends. B's equal-input order distinction is numerical and fading, with unchanged shape. C changes connections while mass/geometry remain fixed and settles after its drive ends. Quiet or weak outcomes were not tuned away.

New tests pass 15/15. Build passes. Full `npm test` reports 355 pass and two unchanged pre-existing ANT test failures; isolated rerun reproduces those failures. Production-preview browser receipts check exact checkpoint/UI time, fresh state/PCM hashes, controls, record import/export, audio path and the existing entry. A dev capture affected by HMR was rejected and led to an exact-time acceptance gate. Independent review found no remaining blocking defect, while retaining the cross-engine exact-replay caveat.

Evidence, equations, accepted captures, reproduction and validation: [Material Sketchbook v0](../evidence/2026-11-02-material-sketchbook-v0/REPORT.md). This is a discovery instrument, with no winner, production adoption, PR or merge.
