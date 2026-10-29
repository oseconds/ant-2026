# Validation and reproduction

## Verified

- Fresh `origin/main` resolved to production authority `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; research parent was `3a3eb22def8c6b89983458f9e5ffb73b0ec5d1db`.
- Frozen input gzip SHA-256 matched `6ff3ec3d6fb8bc0fa1f323532361ab9d19ecc0e75353b1b9ce3d6875c440842d`; pinned upstream raw gzip/JSON and current production `TrailPlateBirth.js` source hashes matched the parent receipts.
- Existing parent extraction check passed: exact frozen-input extraction verified.
- The new merge-tree output exactly matched the parent B construction for all 10 states under 8-neighbor adjacency: peak count, essential/finite status, peak cells, birth/death/saddle levels, contrast, saddle cells, selected greatest-contrast winner and selected strict-superlevel domain.
- The 4-neighbor construction ran separately. It did not alter the primary convention or use a tuned radius, cutoff, lobe filter or essential-root workaround.
- Focused self-checks passed for atomic equal-value plateaus, elder/tie order, simultaneous merges, diagonal connectivity, 4-neighbor corner separation and row-boundary non-wrapping. Existing parent `ant-emergence-landscape.js --self-test` passed.
- `--check` recomputed all 20 state/adjacency censuses, all 16 consecutive-state transition comparisons, same-state adjacency correspondence and the SVG byte-for-byte. The complete JSON receipt is stored with deterministic gzip compression; `--check` compares its exact compressed bytes. The full result is deterministic on rerun.
- The SVG parsed as XML. It is rendered directly from the same audit data: domain boundaries, overlap matrix cells, 8/4 target occupancy counts and winner text all use stored census/receipt values.
- A fresh-context, read-only acceptance review independently checked the merge-tree semantics, key P1/P2 switch receipts, 4/8 sensitivity, essential-root boundary and label. It found no calculation or claim-scope error; it confirmed the old/new winners are disjoint from each other while each separately overlaps its own predecessor.
- No natural replay, RNG, production behavior or production source change occurred. P1/P2 event times remain the exact frozen input `timeMs` values. No prior evidence was edited.
- The new research script is the only code change. Production `src/`, `static/`, canonical README and production selector remain unchanged.

## Reproduce

From repository root:

```powershell
node scripts/ant-emergence-landscape.js --self-test
node scripts/ant-proposal-emergence.js --extract --check
node scripts/ant-peak-saddle-domain-audit.js --self-test
node scripts/ant-peak-saddle-domain-audit.js --check
```

`--check` compares the recomputed complete `data/domain-audit.json.gz` and `domain-atlas.svg` bytes with the committed artifacts. The initial output was generated once with `--write`; that mode refuses to overwrite an existing result.

## Scope of validation

No full repository build or test suite was run. This pass adds a read-only research calculation and atlas; it does not alter application code or dependencies. There is no replay parity question because no simulation was run. Frozen-input extraction, parent algorithm parity, deterministic calculation, atlas parsing/data agreement, source hashes and the final artifact manifest are the scoped checks.
