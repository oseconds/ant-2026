# Validation

## Frozen-input integrity

- Verified the preceding dual-shadow package manifest and every listed file against `SHA256SUMS.txt`.
- Verified all three saved event-stream file hashes against the prior manifest; counts are 662, 717, and 710, totaling exactly 2,089 (1,135 B and 954 C).
- For every source event, checked unique event ID, seed/channel/time, sorted unique in-grid X cells, and exact SHA-256 of the serialized X membership.
- Checked each event stream's exact order against the registered `orderedEventIds` in the preceding virtual ledger.
- Copied the registered objective-case receipt byte-for-byte and verified it against the prior manifest.
- Verified the frozen source packet manifest, 599 anchor records per seed, every anchor-chunk hash, and production birth totals 37 / 23 / 33.
- Rechecked the production source hashes recorded by the B/C review package and the current source's declared 256-Plate ceiling.

## Ledger correctness

- One output layer exists for every registered shadow event; exact event time, provenance, track, center, entry class, X mask, X hash, and source receipt are retained.
- Independent validation rebuilds per-cell exact-time groups from source event masks using a separate `Map<cell, Map<time, {B,C}>>` pass.
- Independent reconstruction covers 6,585, 6,238, and 6,476 cells by seed (19,299 seed-cell rows total), and checks all 91,610 layer-cell incidences, coeval groups, B/C coverage, untouched cells, full layer/group histograms, and strict transition arithmetic.
- Recomputed the first 256-event reference crossing by timestamp batch. The seed 20261006 batch crosses from 254 to 260, with all six same-time events retained.
- Recomputed all ten fixed 60 s shadow/actual-birth windows per seed.
- Independently checked all six snapshot selections per seed against the exact latest preceding event, its saved anchor timestamp, actual material map checksum, and actual production birth count through that timestamp.
- Checked every objective context against the registered selected event IDs, exact event times/X hashes, and exact actual material source-anchor map hash.
- Rendered each SVG to PNG twice in one run and verified identical PNG bytes.

## Isolation

- No new natural trajectory, production RNG, Plate, material mutation, `MaterialStratigraphy` call, material feedback, audio, renderer state, competition, threshold, or commit law was used.
- The research script reads production source only to verify recorded authority/hash and the ceiling constant; it does not import or execute production behavior.
- No `src/` or `static/` file is part of this change. The final validation checks the Git diff against production source paths.

## Determinism and manifests

`analysis/validation.json` records input receipts, exact snapshot boundaries, source anchor hashes, generated file hashes, image rendering receipts, and the independent review. `manifest.json` and `SHA256SUMS.txt` cover the completed evidence package, including reports, ledgers, SVG/PNG assets, and objective selection receipt. Gzip output uses a fixed timestamp and deterministic JSON ordering from the registered event sequence.

- Branch: `codex/ant-bc-provenance-stratigraphy-prototype-20261031`
- Analysis base: `248da39a4d7d342022a27a5b9ec183cad9b160e2`.
