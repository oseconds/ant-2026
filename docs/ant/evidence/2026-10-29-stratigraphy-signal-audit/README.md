# Stratigraphic context signal audit

**Decision: `INDEPENDENT STRATIGRAPHIC CONTEXT OBSERVED`**, bounded to the frozen 600 s, seed `20261005`, current-G sequence. Actual later Plate masks land over a range of pre-commit layer counts, depths, and ordered Plate histories. Similar prior-overlap fractions have different layer-count distributions; layer count is moderately related to current SurfaceField/support and retained foot load, and new-mask similarity strongly tracks layer-distribution similarity. The evidence supports separately retained historical context, but does not establish statistical or geometry-conditioned independence. It does not support changing Plate formation or material behavior.

## Package

- [Report](REPORT.md) — source semantics, complete-sequence measurements, comparisons, limits, and interpretation.
- [Technical atlas](atlas.html) — same 96×96 grid for each commit mask, pre-commit layer count, depth, top Plate, chemical memory, pheromone, SurfaceField/support, and retained foot load.
- [Validation](VALIDATION.md) — provenance, source hashes, deterministic replay and reconstruction checks, and omissions.
- [Analysis](analysis.json) — per-commit summaries, distributions, comparisons, and parity receipts.
- [Reconstructed input](data/reconstructed-commit-context.json.gz) — actual descriptors and per-mask-cell pre/post append observations.
- [Hash manifest](hash-manifest.json) — SHA-256 values for the package, tooling, and daily record; the manifest excludes itself.
- [Audit runner](../../../../scripts/ant-stratigraphy-signal-audit.js) — `--capture`, `--check`, and `--replay-check` modes.

The archived 600 s raw packet contained all 36 commit times and mask hashes, but not the full masks or per-commit scalar fields. The runner reconstructed those from the pinned current-G configuration using one read-only deterministic replay of the same seed, and verified the replay against the archived outputs before measuring. No new seed or natural run was started.

No body geometry, material mapping, threshold, or production state was created. No nodule rule was repurposed.
