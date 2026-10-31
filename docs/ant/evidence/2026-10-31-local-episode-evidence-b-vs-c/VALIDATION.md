# Validation and provenance

## Authority

- Input branch/commit: `codex/ant-local-opportunity-competition-audit-20261031@da599d9f385f53d0bb24df3e737c5ed2e2eb6a23`.
- Frozen production authority: `main@bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- The input packet manifest SHA-256 recorded by this pass: `6dfe9b7f13965126794b753547d81714a95a12da41f829c669f11996aadf8a3a`.
- Frozen index hashes, chunk hashes, and source hashes are recorded in [`analysis/inputs.json`](analysis/inputs.json).

The source packet’s original manifest and full three-seed X/lag/source validation passed before adding this downstream documentation. This pass does not rewrite the source packet. The later daily/hub index update changes current documentation hashes; source provenance remains anchored to the frozen commit and manifest hash above.

## Validation performed

1. Reused the exact three-seed packet; no controller/world creation, simulation tick, or RNG call.
2. Verified the original packet manifest/chunks before analysis. Existing packet validation reported all 1351 manifest entries, 14 tools, and 3 documentation receipts; `--validate` passed all 36,000 ticks and 599 analysis records per seed, including source/X/lag hashes.
3. The analysis reads current native B/C arrays and asserts that each observed center value matches its source array. Existing F-component-constrained reciprocal `.025`/`.075` match lists are reproduced against saved cross-channel receipts.
4. Every saved associated X is checked for connectivity and radius; unique X counts and node/overlap/layer medians match the frozen X-family summary.
5. Brute-force matched-track rank crossings and winner changes in the new analysis match the prior saved synthesis values.
6. [`analysis/independent-review.json`](analysis/independent-review.json) is written by a separate arithmetic pass over the per-track and per-boundary receipts. It independently recomputes track counts, singletons, entry/non-entry durations, winner changes, rank crossings, strongest-non-entry ratios, paired B/C Jaccard aggregates, and all six objective case selections.
7. The analysis and verifier self-checks pass. No `src/` or `static/` file is changed.

## Determinism and output hashes

`analysis/manifest.json` records SHA-256 and byte counts for all derived JSON/gzip/SVG files, the source packet manifest, and both analysis tool files. The final validation pass reruns the frozen-data derivation and verifier, then checks that the derived-file hashes are unchanged.

## Limits

Spearman summaries aggregate serial observations across tracks and describe relationships; they do not establish causation or independent sample sizes. Recent travel is only a measured behavioral proxy for pheromone routing in this packet; a direct closed-loop pheromone integration was not run. Contact relations are similarly descriptive and do not establish a mechanical feedback failure. The result makes no physical claim about nucleation, force, pressure, stress, compaction mass, or material density.
