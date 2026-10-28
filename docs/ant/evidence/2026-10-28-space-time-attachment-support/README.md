# Commit-relative space-time attachment support — 2026-10-28

## Decision

**BOUNDED NEGATIVE — temporal attachment adds no useful selectivity.** The registered 8-neighbor ancestry retains 96.45% of P1's C0 mask and 99.74% of P2's. It remains finite and compiles for both events, but it reproduces nearly all of the broad commit-time support that C0 already selected. The 4-neighbor sensitivity also changes compiler validity for P1 and leaves an isolated solver node for P2.

Stage 2 was **not run**: it was conditional on a viable Stage 1 result, and that gate failed.

## Scope

This is a read-only research measurement on the current production G / H0 evidence packet, seed `20261005`, 60 Hz, Audio Off, through 120 s. No new natural simulation was run. Current `EVENT / WHEN`, ownership, production descriptors, source, and behavior remain unchanged. Working ontology A remains a research ontology; this result does not accept or reject it.

The registered C1-8 rule uses the full 8-connected `E_qualified` components intersecting the same-anchor `H_boundary_length_eligible` domain at every saved analysis anchor. From one anchor to the next, a cell inherits ancestry only through the same or one of its 8 neighboring cells. No propagation occurs inside an anchor. The interval starts at the actual ownership anchor. The 4-neighbor temporal rule is a sensitivity diagnostic only.

## Package map

- [PLAN.md](PLAN.md) — frozen contract and conditional Stage-2 gate.
- [REPORT.md](REPORT.md) — measurements, counterargument, interpretation, and verdict.
- [VALIDATION.md](VALIDATION.md) — provenance and performed checks.
- [`data/stage1.json`](data/stage1.json) — exact summaries, per-anchor populations, topology, compiler receipts, ownership overlays, and first backward breaks.
- [`data/c1-masks.json.gz`](data/c1-masks.json.gz) — exact C0, C1-8, and C1-4 masks.
- [`data/inputs/`](data/inputs/) — source-compatible frozen inputs and provenance.
- [`data/package-sha256.json`](data/package-sha256.json) — package integrity manifest.
- [`scripts/ant-spacetime-attachment-support.js`](../../../../scripts/ant-spacetime-attachment-support.js) — deterministic reconstruction runner; `--check` verifies without rewriting evidence or running Stage 2.
