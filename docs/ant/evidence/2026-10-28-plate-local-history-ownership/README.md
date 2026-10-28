# Plate local-history ownership

**Decision: SUPPORTED — commit-relative ownership interface.** The frozen natural sequence and the existing matched-repeat logical fixture support a reproducible provenance ledger. **The physical WHERE rule remains an artist / ontology gate.** This work does not choose a support mask or formation law.

## Baseline and scope

- Fresh `origin/main`: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Compatible research parent: `12473f9ec8c7057ea033d9f72fa68c236c60bb50`.
- Research branch: `codex/ant-plate-local-history-ownership-20261028`.
- Frozen input: current G / H0, seed `20261005`, 60 Hz, Audio Off, existing 0–120 s capture.
- Frozen packet SHA-256: `909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc`; decoded payload SHA-256: `fba546769a1ddc552247a93f5c2d3719193b8d4785ed672442dcae1960e25339`.
- Two actual immutable Plate receipts: Plate 1 at 84.016667 s and Plate 2 at 106.016667 s. Both are unmatched at commit. Their masks overlap at 223 cells.
- No new natural run, world replay, RNG draw, production edit, candidate reset, new mask, threshold, or geometry extractor.

## Ledger

For a proposed commit, use the newest matched prior commit time as the anchor when a prior match exists; otherwise use the current candidate-lineage start. Classify inputs as carried-in `<= anchor`, commit-owned `(anchor, commit]`, or future `> commit`. The ledger records provenance only; it does not decide physical membership.

Chemical values distinguish anchor memory, the decayed carried-in counterfactual at commit, the observed endpoint, and their conditional endpoint difference. Surface values distinguish the anchor, a no-new-contact relaxation from that anchor, the observed endpoint, and their conditional difference. FOOT_CONTACT rows retain source event/contact order, timestamp, positions, production nearest-grid cell, phase and frozen-mask membership.

## Main result

- P1: 64.016667→84.016667 s, lineage-start anchor, 356 cells. Within its frozen footprint, mean chemical value is 0.1116 carried-in plus 0.3201 post-anchor conditional endpoint difference, with 0.4318 observed at commit. SurfaceField mean is 0.0964 under no-new-contact relaxation, 0.0387 conditional difference, and 0.1351 observed. Its owned window contains 2,470 feet, 351 mapped inside the frozen footprint.
- P2: 86.016667→106.016667 s, lineage-start anchor, 544 cells. Within its frozen footprint, mean chemical value is 0.1495 carried-in plus 0.3387 post-anchor conditional endpoint difference, with 0.4882 observed at commit. SurfaceField mean is 0.1351 under no-new-contact relaxation, 0.0320 conditional difference, and 0.1671 observed. Its owned window contains 2,507 feet, 486 mapped inside the frozen footprint.
- The 223-cell P1/P2 overlap has distinct carried and post-anchor values for each commit. Spatial overlap does not copy a timestamped contact into both owned windows. P2 remains unmatched despite that overlap.
- The existing continuous-load fixture yields `(0,20]`, `(20,110]`, `(110,200]` windows with 20, 90 and 90 contacts: 200 unique owned timestamps and no duplicate ownership. This is a logical policy check, not natural morphology evidence.

Chemical replay from the saved 96×96 projection samples is numerically close but not bit-exact: each interval has 20 samples, maximum absolute endpoint error `5.960464477539063e-8` and maximum 2 ULP distance. The reported post-anchor chemical value is therefore an exact observed-endpoint minus zero-input counterfactual difference, while the replay from rounded projection samples is only a numerical cross-check. The SurfaceField reconstruction matched all 21 saved anchors in each natural window exactly. Neither channel is an exclusive ant-ownership measure or a conserved material amount.

## Files

| File | Purpose |
| --- | --- |
| [PLAN.md](PLAN.md) | Pre-registered question, rules and stop boundary |
| [REPORT.md](REPORT.md) | Evidence, interpretation, limits and next priority |
| [data/ownership.json](data/ownership.json) | Human-readable per-Plate and overlap summaries, sample-frame digests, examples and provenance |
| [data/ownership-arrays.json.gz](data/ownership-arrays.json.gz) | Full 96×96 channel arrays, including carried, conditional and actual endpoints |
| [data/foot-ledger.json.gz](data/foot-ledger.json.gz) | Every original FOOT_CONTACT and individual foot in source order with phase attribution |
| [data/matched-repeat-ledger.json](data/matched-repeat-ledger.json) | First three existing continuous-load fixture ownership windows |
| [data/validation.json](data/validation.json) | Frozen inputs, source, replay, mutation and output hash checks |
| [data/attempts/initial-schema/](data/attempts/initial-schema/) | Byte-preserved first output set; superseded by sample digests and clearer source-order naming |
| [data/attempts/pre-helper-receipt/](data/attempts/pre-helper-receipt/) | Byte-preserved intermediate output set before helper code hashes were recorded |
| [data/attempts/pre-final-format/](data/attempts/pre-final-format/) | Byte-preserved output set from before the runner's final whitespace-only cleanup |
| [VALIDATION.md](VALIDATION.md) | Reproduction commands and results |

See the package hash receipt under `validation/` for exact file digests.
