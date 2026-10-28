# Closure-slice crystallization support

Research-only test of whether the complete commit-time H-associated `E_qualified` domain can freeze as an immutable Plate support.

## Result

Stage 1: **C0 VIABLE** as a finite, event-associated compiler input. Stage 2: **BOUNDED NEGATIVE — accumulation/selectivity failure**. The 600 s shadow preserves the actual 36 production commit times and shows widening supports, high repeated overlap, and little new area in the final layers. This rejects C0 as a sufficient WHERE contract; it does not reject working ontology A.

## Files

- [Plan](PLAN.md)
- [Report](REPORT.md)
- [Validation notes](VALIDATION.md)
- `data/stage1.json`: frozen P1/P2 reconstruction, component sizes, ownership overlays, exact compiler inputs and append checks
- `data/stage2.json`: 36-layer accumulation and per-layer solver results
- `data/c0-masks.json.gz`: row-major occupied cells for every actual commit
- `data/read-only-replay-capture.json.gz`: saved 600 s read-only replay receipts, positions, checkpoints and C0 masks
- `data/validation.json`: source, input, parity and output hash receipts
- `data/package-sha256.json`: final package and chronology hashes

Recheck the saved package without replaying the world:

```powershell
node scripts/ant-closure-slice-crystallization.js --check
```

The process decision is recorded in [`docs/ant/daily/2026-10-28-closure-slice-crystallization-support.md`](../../../daily/2026-10-28-closure-slice-crystallization-support.md).
