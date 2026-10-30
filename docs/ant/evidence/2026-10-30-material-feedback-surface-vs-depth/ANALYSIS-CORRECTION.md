# Analysis correction record

The first post-run analyzer version tried to compare an AD-S 96×96 FOOT_CONTACT grid against precomputed grids in the frozen N/AD-L packets. Those packets preserve individual FOOT_CONTACT coordinates instead. The analyzer was corrected to rasterize those saved coordinates with the registered 96×96 nearest-cell rule; the treatment was not rerun.

The next generated `ANALYSIS.json` also had a duplicate `sourceReceipts` object key. JSON retained only the later frozen-reference receipt object, hiding the runner and analyzer source hashes. The prior generated file was preserved at `data/attempts/analysis-01/ANALYSIS-before-source-receipt-fix.json` (SHA-256 `f7e2b396387c013ecd87eabb37ab71a1baafd8e3d605736ee36f4928d71ff676b`). The analyzer now combines both source hashes with the frozen reference receipts under the single key.

The final `ANALYSIS.json` was regenerated from the unchanged treatment and frozen reference artifacts. It records runner instrumentation SHA-256 `57ae985c125d9f944758ca84924b6235f52e02601d37af3c75f1c3995055d3bf` and final postprocessing source SHA-256 `eeb467030e5273bb7fdfca43528adf8411e644af4feda895bb85e1f18b23e36b`. The script changes were research-only analysis/parity instrumentation; no production source or causal law changed. `--analyze` reconstructed the output exactly on its deterministic rerun.
