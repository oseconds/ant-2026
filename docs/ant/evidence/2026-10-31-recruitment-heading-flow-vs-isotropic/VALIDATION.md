# Validation

## Authority and source boundary

- The runner starts only when checked-out HEAD and `refs/remotes/origin/main` both equal `301f0740c9fe2e0697e31a716f7226cb2112ede7`.
- Research branch: `codex/ant-recruitment-heading-flow-vs-isotropic-20261031`.
- It hashes the locked production and renderer source set before the six runs and compares the hashes again at the end. The same 12 current source hashes are recorded in `analysis/summary.json` and verified after the runs in `analysis/validation.json`.
- The research heading transform is created in memory from the one unique production accepted-heading expression. No `src/` production file was modified.

## Run assertions

The runner's in-process assertions and the saved-output audit passed for all six runs:

- Each run is 600 model seconds, 36,000 ticks, and 600 one-Hz frames, split into ten exact 60-second windows.
- Each controller is fresh; initialization has no completed movement segment and is isotropic.
- Each accepted spawn has one event, one heading draw, and exactly one RNG call across that draw. Saved heading values reproduce the exact registered isotropic or flow transform.
- For every event, q availability agrees with `N >= 3 && R > 1e-9`; available R reproduces `hypot(qx,qy)` and diagnostic w reproduces the locked mapping.
- Each arm's accepted counts sum to its law-use counts. Treatment direct-use count equals its available-q accepted events; fallback count equals the remaining accepted events.
- Accepted positions stay inside the fixed radius. Position candidate checks equal accepted positions plus clearance-rejected positions; blocked calls and retry calls are separately recorded. No capacity-suppressed calls or endpoint-pending retry remain.
- Non-finite agent ticks, out-of-domain agent ticks, and sampled pair-overlap events are all zero in every run.
- Treatment short-horizon transport records equal direct-use recruits. All recruits were observed at 0.5 s and 1.0 s; none was censored before either horizon.

## Visual validation

- The unchanged production `AntRenderer` hash matches the run source hash.
- The browser renderer asserted zero page/console errors, 24 matched PNGs, and four comparison sheets. All image and sheet SHA-256 hashes and dimensions were reread and verified against `visual/manifest.json`.
- Presentation was identical: 720×720 renderer, 752×824 viewport, material On, pheromone Off, no scale normalization.

## Commands and scope

The runner completed the six worlds once. No 1,800-second extension, model rerun, repository test suite, build, PR, merge, or production adoption was performed. Result-level checks are machine-readable in [validation.json](analysis/validation.json); Node syntax, JSON parsing, image hashes, and staged whitespace checks are recorded in [package-validation.json](analysis/package-validation.json).
