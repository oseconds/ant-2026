# Validation and reproduction

## Authority and production separation

Pinned production authority: `bc045dc3caa5954df633ecbee37fbabcb8224f30`.
Research branch: `codex/ant-local-opportunity-competition-audit-20261031`.

The clean initial checkout was closure branch `aa08506`. Fetch confirmed the requested main authority; the research branch started exactly there. No new worktree was created. Existing other worktrees and the previous closure branch were preserved. Every capture execution verifies the branch, the authority's ancestry, and LF-normalized production source against `git show <authority>:<path>`. No `src/` or `static/` change is part of this pass.

Production capture includes the current G, retained speed resistance, A/D material movement conditions and endogenous outgoing-flow heading. There is no config override, observer RNG, research feedback, alternate capture law or X-driven Plate birth. Audio remains Off.

## Primary runtime and array gates

| Seed | Every-tick world/agent/environment/RNG comparisons | Native analysis-boundary E/D comparisons | Observed / reference RNG calls | Final RNG state, both worlds | Actual Plate births |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 36,000 | 599 | 330,654 / 330,654 | 3,039,568,899 | 37 |
| 20261006 | 36,000 | 599 | 307,490 / 307,490 | 2,116,485,264 | 23 |
| 20261007 | 36,000 | 599 | 321,214 / 321,214 | 2,581,842,517 | 33 |

All comparisons passed. Observer RNG calls are zero. Native boundary timestamps, input hashes and both RNG states/counters are retained in each signal header's validation receipt. Capturing uses the actual production `advance()` boundary, not a research clock. E comes from the actual production call; F is exact source-extracted production thinning. Signed lags, rolling windows and finite-step segment semantics are documented in [SIGNALS.md](SIGNALS.md).

The independent array verifier checks every saved X for unique cells, nucleus membership, in-domain F membership, 8-connectedness, maximality inside the fixed Euclidean disk for every associated nucleus, and exact overlap/layer arithmetic. It also verifies S and every full-grid signed lag difference against the selected exact analysis state. Results are in [independent-array-checks.json](validation/independent-array-checks.json): 1,701,512 distinct per-boundary X sets and 1,868,392 distinct-center computations over the three histories. These are computation counts, not independent opportunities or material objects.

Traffic conservation independently compares clipped segment distance/time against rasterized contributions. Expected and observed totals match in Float64 for each seed. Packed recent rasters are Float32 with the declared `1e-4` aggregation relative tolerance. The foot/traffic fixtures check open-left/closed-right time windows, malformed/out-of-domain positions, distinct ants/groups, stationary occupancy and exiting geometry. Birth-map tests exclude current-boundary newborns.

## Determinism and the seed-05 annotation correction

The complete fresh observed/reference campaign was repeated with the same three seeds and 600 s duration in an isolated cache. All 27 signal files (three headers plus 24 anchor chunks) were byte-identical. No parity failure occurred in either campaign.

The first full artifact comparison exposed a research serialization-version mismatch: the initial seed-20261005 analyzer process started before the final censor-context annotations were added. Its 550,308 track records lacked only `startObservation.previousAnchorIndex` and `endObservation.nextTimeMs`. This was not world/trajectory or scientific observation nondeterminism.

A fresh independent reviewer compared every chunk: all 180 opportunity anchor chunks, all seed06/07 track chunks and indexes, and every derived signal/summary/case output matched. All 367 seed05 track chunks were deeply identical after removing only those two annotation keys; the seed05 index differed only in its track-chunk hashes. Original measurements, track IDs, strengths, correspondence, geometry and all aggregates were equal. The earlier serialization remains preserved in commit `9455e1a`; it is not rewritten in Git history.

The frozen analyzer was run again for seed05 into a third isolated directory. All 437 files matched the independent frozen rerun before the canonical annotations were updated. Only 367 track chunks and their index changed; all 60 seed05 opportunity-anchor chunks stayed unchanged. The [annotation-only replacement receipt](validation/annotation-regeneration.json) preserves the before/after hashes. A regression test now pins start/end anchor/time metadata, adjacent-anchor context and both censor flags. The final [whole-artifact comparison](validation/determinism.json) passed: all 1,296 analysis files are byte-identical to the independent full rerun.

Package text/tool hashes normalize CRLF to LF, matching the Git source contract. Gzip/PNG data hashes use raw bytes. Signal/opportunity chunk indexes verify their own raw byte hashes on read. Data payloads contain no wall-clock runtime or changing research HEAD; the pinned production authority, branch, source hashes and final tool manifest supply provenance.

## Tests and independent review

The final full suite ran 365 tests: 363 passed and two existing authority tests failed. The initial suite had the same two failures (359/361). Both were reproduced alone in byte-unchanged production/test files:

- `tests/ant-controller.test.js`: old fixed north spawn-heading assertion, superseded by the adopted outgoing-flow/isotropic law.
- `tests/ant-renderer.test.js`: old default live-pheromone drawing assumption.

Those tests are preserved rather than repaired outside this research scope. All 23 final focused tests passed, including the updated annotation regression, rank/correlation/integral checks, chunk integrity, independent X maximality and geometry aggregation. Exact output is in [focused-tests.txt](validation/focused-tests.txt); the broad suite limitation is in [npm-test.txt](validation/npm-test.txt) and [authority-existing-failures.txt](validation/authority-existing-failures.txt). An early verifier started before the final seed07 index existed; the complete array check was rerun after that input was ready. Neither that dependency error nor the metadata mismatch was a production observer-parity failure.

Delegation used Luna High for capture/visualization and bounded geometry aggregation; Luna Max for topology/tracking and fresh independent definition/acceptance review. The deeper levels addressed exact time semantics, component identity, set accounting and scientific arithmetic. Parent retained authority, experiment scope, synthesis and final acceptance responsibility.

Independent review includes:

- Preregistered definitions, source order, topology, windows, pre-birth material and correspondence/censoring limits.
- All center-census metrics for all 54 channel/representation combinations per seed across 599 anchors.
- All duration/censor summaries for 108 series per seed, covering 1,600,688 tracks.
- Every seed's four case integrals/durations and the final cross-seed objective choice.
- Average-tie Spearman correspondence for all 153 channel pairs at all anchors per seed, within `1e-12`.
- An independently rebuilt ten-anchor sample: S over all 9,216 cells, 552,960 signed values, 37,416 maxima and both grouping conventions, 348,598 pair denominators and 48,804 positive intersections, nesting/components/quantiles.
- Strict rank-crossing logic checked against 500 randomized, tie-heavy brute-force fixtures.
- All 1,797 grouped-X pair-relation summaries and the chemically unqualified prior-endpoint counts for positive ΔD5.

The [fresh final scientific review](validation/final-independent-review.md) independently checked the current X-family aggregation, a raw-anchor geometry/material sample, claims and documentation links. It found no blocking scientific issue. Its scope excludes the separate visual/manifest delivery gates; those remain the parent's responsibility. It also records one unrelated pre-existing hub link.

The raw angular-span computation preserves a floating-point cancellation residue down to `-8.881784197001252e-16` in an otherwise zero span. Interpret geometric zero within floating-point tolerance; no displayed conclusion depends on that residue. The receipts were preserved rather than rounded or regenerated to hide it. This is numeric precision context, not an opportunity or material threshold.

Review records must be read with the frozen manifest and code, not treated as approval of future mechanisms. Classification remains descriptive **SIGNAL-DEPENDENT / MIXED**.

## Reproduce without overwriting the saved histories

Use Node 22 (this run used v22.23.2), the repository's installed dependencies and PowerShell. Start on the research branch after inspecting local status/diffs. The capture runner intentionally requires that branch and unchanged authority production sources. Keep the reproduction in a separate ignored cache:

```powershell
$auditOut = '.cache/ant-local-opportunity-reproduction'
foreach ($auditSeed in @('20261005','20261006','20261007')) {
  node --max-old-space-size=6144 scripts/ant-local-opportunity-capture.js "--seed=$auditSeed" --seconds=600 "--out=$auditOut"
  if ($LASTEXITCODE -ne 0) { throw 'Stop: capture/parity failure' }
  node --max-old-space-size=10240 scripts/ant-local-opportunity-analyze.js "--seed=$auditSeed" "--out=$auditOut"
  if ($LASTEXITCODE -ne 0) { throw 'Stop: analysis failure' }
}
node --max-old-space-size=16384 scripts/ant-local-opportunity-synthesis.js "--out=$auditOut"
node scripts/ant-local-opportunity-x-summary.js "--out=$auditOut"
node scripts/verify-ant-local-opportunity-audit.js "--compare=$auditOut"
node --max-old-space-size=16384 scripts/verify-ant-local-opportunity-audit.js --validate
node scripts/verify-ant-local-opportunity-audit.js
```

The signal payload is too large for one V8 string; chunking is integral to the artifact, not omitted data. `readRun()` verifies chunks before reconstructing the logical run. Full analysis retains all raw, `.15` and `.30` representations at both tracking cutoffs; allow several GB of heap and disk for the complete receipts and rerun. There is no radius/capture/parameter sweep.

Technical figures were generated only after synthesis and enriched cases were complete. The renderer's `--check` fixture and syntax check passed. Its output includes exact frame/analysis joins, fixed per-channel scales, SVG dimensions and reopened PNG dimensions. The [technical inspection](validation/visual-inspection.md) covers signal, separate-X and objective-case sheets. The independent visual rerun used an isolated `--out` directory with the same frozen source. All 38 files, totaling 130,797,411 bytes and including 35 figures, were byte-identical; see the [comparison receipt](validation/visual-determinism.json). No physical measurement was changed to improve a figure.

## Manifest, commits and delivery

Initial observer/analyzer/definition save point: `b1fb7fd`. Seed05 original evidence: `9455e1a`. Seed06 evidence: `5f27b12`. Seed07 evidence: `594a0cb`. Annotation-correction, synthesis/atlas/review and final manifest commits remain on the dedicated branch. Final branch SHA is verified against the remote after push; this document does not self-embed its own final commit hash.

The primary worktree is the only checkout used for this pass. The pre-existing compaction-shielding worktree is clean and up to date; the pre-existing material-experience worktree has two commits ahead of its configured upstream and ignored local material. Both were preserved untouched. No disposable worktree was created or removed. Reproduction caches remain ignored and preserve the independent runs and original partial validation diagnostics.

The [manifest](manifest.json) inventories all final package files and tool/test hashes. Runtime progress `.log` files are local diagnostics; stable `.txt`/JSON validation receipts and the manifest are delivered. No PR, main merge, production adoption, selector implementation, Residence work or new worktree is part of delivery. Production Audio-On, long-run realtime behavior and artistic acceptance were not tested by this Audio-Off observer audit.

The parent's final package gate verified 1,351 evidence files, 14 tool/test hashes and three branch-side documentation hashes. All 78 local links across the package's nine Markdown/HTML files resolved. The manifest excludes itself to avoid a recursive hash; the final manifest SHA-256 and pushed branch HEAD are reported in the delivery message. The separate scientific review remains limited to its recorded review-time scope, rather than retroactively claiming it inspected the final delivery gates.

The staged whitespace check excludes only the three verbatim Node test-output receipts (`npm-test-initial.txt`, `npm-test.txt`, `authority-existing-failures.txt`). Node's failure formatter emits indentation on blank lines; those bytes are preserved in the evidence. Source, tests, documentation and other artifacts pass the normal whitespace check. The independent review's two Markdown hard breaks were changed to blank-line paragraph separation without changing its findings.
