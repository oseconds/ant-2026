# Validation

## Baseline and provenance

- Production `main`: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `66a1c16adbc308fdc424307202c61e985b1189c5`.
- Research branch: `codex/ant-stratigraphy-signal-audit-20261029`.
- Frozen source directory: `docs/ant/evidence/2026-10-25-g-production-candidate-review/`.
- Seed raw compressed input SHA-256: `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`.
- Exact input hashes for the raw stream, summary, provenance, receipt, conformance record, and all five checkpoint maps are in `analysis.json` under `baseline.inputSha256`.

The frozen 600 s packet has 36 actual births. Its raw descriptors include timestamps and mask digests, but not mask arrays or event-time fields. The replay reconstructed full descriptors/masks and commit-time field values. All recorded births, mask hashes and timestamps were asserted before the analysis proceeded.

The working checkout has CRLF line endings for the text `SUMMARY.json` and `PROVENANCE.json`, while the frozen `SHA256SUMS.json` records their LF-normalized byte hashes. The runner verifies these canonical LF-normalized hashes against the receipt. The compressed raw and checkpoint-map inputs are checked byte-for-byte against the same receipt.

## Source identity and replay parity

Current-main hashes for the behavior sources declared in frozen `PROVENANCE.json` match except `src/lib/agents/ant/PheromoneField.js`:

- `PheromoneField.js` current: `b68e98b5d916950487da67237a0d0277451d3b930971c1d8a35e92fd7d6f9837`; frozen receipt: `3e8b2e4059a77c8ca96bc2e591120eda560bb7a1b1456d56b0ce3ba68405662e`.
- The non-runtime files `scripts/ant-founder-evidence.js` and `docs/ant/README.md` also differ from their frozen provenance hashes. All source hashes and mismatch flags are retained in `analysis.json`.
- `AntController.js`, `TrailPlateBirth.js`, and `MaterialStratigraphy.js` match the frozen source hashes exactly. The latter is the production implementation used for the reconstruction.

Despite the disclosed pheromone-source hash mismatch, current-main deterministic replay exactly matched every recorded anchor:

- frozen run summary including final RNG state/call count;
- 600 one-second positions and contact buckets;
- all 36 Plate births, IDs, timestamps and mask hashes;
- nodule births and raw event digests;
- pheromone maps, SurfaceField maps, and cumulative occupancy at 30, 60, 120, 300 and 600 seconds.

The exact source/output comparison is recorded in `analysis.json`. This establishes parity for the saved anchors, not identical source blobs or every unrecorded internal value.

All per-commit field values measured by the observer are from the current-main reconstruction. No commit-time chemical, pheromone, SurfaceField, support, or retained-load arrays exist in the frozen input. `TrailPlateBirth.js` and `SurfaceField.js` source hashes match their receipts; `PheromoneField.js` does not. Therefore event-time pheromone samples have replay-anchor support but not frozen-source-byte identity.

## Deterministic stratigraphy checks

- At the live append call, all pre-existing descriptors were checked by object identity and mask SHA-256 before and after append.
- Every descriptor was replayed in historical order. Its ID, timestamp, mask digest, binary mask cell count, thickness, pre-commit cells, post-commit cells, stack IDs, and post-append Plate-history record were checked against the live observer output.
- Each replayed pre-commit snapshot was taken immediately before the actual `addPlate`; post-commit state was used only for append-semantics validation.
- The capture contains no RNG calls or production-state edits. The optional observer hook is in the research runner only; it is unset in the existing caller and leaves the default path unchanged.
- The captured masks and field samples were compared with frozen commit receipts and checkpoint maps. No descriptor was modified.

## Reproduction checks performed

- `node --check scripts/ant-g-production-candidate-natural.js`
- `node --check scripts/ant-stratigraphy-signal-audit.js`
- `node scripts/ant-stratigraphy-signal-audit.js --capture`
- `node scripts/ant-stratigraphy-signal-audit.js --check`
- `node scripts/ant-stratigraphy-signal-audit.js --replay-check`
- `git diff --check`
- Hash manifest verification after all reports and daily records were written.

`--check` rebuilds the stratigraphy arrays and measurements from the frozen capture, then requires byte-identical analysis and atlas output. It also checks the atlas's embedded measurement payload against the capture. `--replay-check` repeats the deterministic replay and requires the compressed capture content to match exactly.

## Scope and omitted checks

- No full repository build or test suite; the change adds research-only extraction/analysis and its focused assert-based checks cover its paths.
- No second seed, new natural run, long-horizon construction test, audio render/listening, body generator, material mapping, or production source change.
- No browser pixel-level inspection of atlas rendering. Its generated HTML and embedded values are checked byte-for-byte and against the captured data; visual pixel rendering remains unchecked.
- No conditional causal model, multivariable prediction test, or cross-seed generalization. Exact full scalar-state matches at the same cell were absent; distribution-level comparisons are descriptive.
