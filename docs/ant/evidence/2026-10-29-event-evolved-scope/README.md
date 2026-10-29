# Event-evolved materialization scope — 2026-10-29

**Working result:** an evolving representative can retain one process-level event without stable branch identity. But current temporal continuity does not generate spatial membership: production still freshly projects source-to-boundary I before comparing the candidate. Keep selection/update, continuity and immutable COMMIT explicit. No new production selector is recommended for adoption.

Fresh main `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; parent `58ce59fcdb01187cbaf0b6453199556f2c4b5331`; branch `codex/ant-event-evolved-scope-20261029`.

- [Report](REPORT.md): responsibilities, all-anchor turnover, actual continuity law, older negatives, architecture candidates and smallest next closed pass.
- [Plan](PLAN.md): pre-result scope and fixture/atlas boundaries.
- [Temporal atlas](temporal-atlas.png): START,+5,+10,+15,COMMIT; same source frame, structural points only.
- [Turnover detail](turnover-detail.png): largest adjacent selection change per event, same frame; no BODY.
- [Analysis](analysis.json): all42event rows,120clock checks, component census, continuity-only fixture.
- [Frozen compact input](data/frozen-event-input.json.gz): exact saved mask/path and diagnostic-parent augmentation, not a new capture.
- [Atlas receipt](atlas-validation.json), [sources](SOURCES.md), [validation](VALIDATION.md), [independent review](independent-review.md), [manifest](hash-manifest.json).
- [Daily](../../daily/2026-10-29-event-evolved-scope.md).

Reproduce with Node22 and Python/Pillow12.3:

```powershell
node --check scripts/ant-event-evolved-scope.js
node scripts/ant-event-evolved-scope.js --self-test
node scripts/ant-event-evolved-scope.js --check
python scripts/ant-event-evolved-scope-atlas.py --check
```

`--extract` is only for initial extraction from the pinned Git packet; it refuses to overwrite the committed compact input. Normal analysis writes this package's own analysis. `--check` recomputes frozen calculations only. Text receipts/comparisons use LF-canonical bytes, binary gzip/PNG raw bytes. No ANT controller/world, new selector, BODY or audio runs.
