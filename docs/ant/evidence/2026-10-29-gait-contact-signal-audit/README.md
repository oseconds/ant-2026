# P1/P2 FOOT_CONTACT organization versus SurfaceField and contact counts

**Decision: INDEPENDENT INFORMATION OBSERVED**, limited to the descriptive contact history. Actual leg identity, tripod assignment and touchdown sequence vary across locations and event windows while the production scalar histories retain per-cell accumulated counts and compaction. The fixed gait explains the A/B alternation and leg mapping; this result does not establish a separate gait law, useful material responsibility, or a Plate/material law.

This read-only audit reuses the frozen current-G/H0 seed `20261005`, 60 Hz, Audio Off P1/P2 contact stream. The exact raw event prefix and commit SurfaceField snapshots are in [`data/frozen-contact-input.json.gz`](data/frozen-contact-input.json.gz); derived maps and raw event windows are in [`data/measurements.json.gz`](data/measurements.json.gz).

## Package

- [Report](REPORT.md) — production semantics, measurements, gait countermodel, limits, and decision.
- [Technical atlas](atlas.html) — same-coordinate raw leg/tripod/timing views, window and cumulative counts, commit SurfaceField and optional selected-I context.
- [Validation](VALIDATION.md) — hashes, event anchors, deterministic reproduction and omissions.
- [`analysis.json`](analysis.json) — compact quantitative results and deterministic scalar-neighbor examples.
- [`hash-manifest.json`](hash-manifest.json) — SHA-256 receipts for this package and its daily record.
- [`scripts/extract-ant-gait-contact-signal-input.js`](../../../../scripts/extract-ant-gait-contact-signal-input.js) — pinned packet extraction and `--check` verification.
- [`scripts/ant-gait-contact-signal-audit.js`](../../../../scripts/ant-gait-contact-signal-audit.js) — deterministic measurement and `--check` runner.

No simulation was replayed. No production source, field, gait law, material state, body mask, prototype, or material law changed. No additional seed or audio render was used.
