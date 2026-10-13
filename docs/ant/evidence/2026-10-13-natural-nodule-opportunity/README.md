# Natural 600 s Nodule qualification, admissibility, maturity, and cap census

**Decision: MIXED.** Spatial exclusion is common among qualified cells, but it does not close every spatially unblocked opportunity. In all three default-On natural runs, the production count reaches `maxNodules=32` while `A` remains nonzero; the production early return then clears candidate timers and stops evaluating Nodule birth. `A` also remains nonzero at every post-cap census and at the 600 s clock-end census. This shows material cap censoring in these bounded runs, alongside strong spatial exclusion. It does **not** show that any post-cap cell would have birthed a Nodule without the cap.

## Question and boundaries

The pass separates qualified cells, spatially unblocked qualified cells, actual production timer maturities, and the production Nodule cap under the unchanged natural contract. It does not change any production source, threshold, timer, proximity law, cap, lifecycle, audio/runtime behavior, or material coefficient. It does not extend the forced gap, remove the cap, infer a cap-free counterfactual, test turnover or erosion, or claim openness after 600 s.

The runs use the existing default-On natural replay contract: seeds `20261005`, `20261006`, and `20261007`; 60 Hz; 36,000 ticks / 600 s; counted deterministic production LCG; no audio bridge. The baseline is `5b77f5707418a45001214321258fa2580c5fdc0c` on `main`; the research branch is `research/ant-natural-nodule-opportunity-20261013`. `docs/ant/archive/**` was not accessed.

## State definitions and production correspondence

- **Q — QUALIFIED:** a cell with at least four overlapping Plates and three buried layers, SurfaceField compaction `>=0.55`, and production local FOOT_CONTACT load `>=200` within radius `0.028`.
- **A — SPATIALLY UNBLOCKED Q:** a Q cell for which the exact production `_nearExistingNodule(x, y, 0.028)` predicate is false. The predicate rejects only when `distance < existingNodule.radius + 0.028`; equality at the boundary is unblocked.
- **M — MATURED:** an actual production candidate timer reaching 30 s before the cap. Each such production check is recorded with its real outcome: nearby rejection (which resets that timer) or actual birth. Timer starts, qualification losses, Plate resets, and long-gap resets are separately recorded.
- **K — CAP:** the actual `nodules.length` and `maxNodules` state. When the production early return runs at the cap, production clears `candidateSinceMs`. The observer records that actual clear. It creates no timer age, maturity, rejection, or birth after cap.

Q and A are read-only censuses at actual `MaterialStratigraphy.advance()` evaluation boundaries. Cell IDs use the production 96×96 grid index. The observer wraps the existing instance methods for `addPlate`, `advance`, and `_nearExistingNodule`, calls the original methods, and restores their original property descriptors. It compares the production proximity method against the strict-distance expansion for every Q cell and asserts equality. The separate 600,000 ms clock-end census is marked as not a production evaluation and carries no hypothetical timer state.

## Results

First Q and first A appeared together in each run. Birth-time lists and cell identities are preserved in the compressed per-seed ledgers.

| Seed | First Q / A (s) | Cumulative births at 300 / 360 / 420 / 480 / 540 / 600 s | Cap at 32 (s) | Q / A before cap birth → after birth |
|---|---:|---|---:|---:|
| `20261005` | 244.617 | 1 / 11 / 18 / 22 / 29 / 32 | 553.383 | 765 / 21 → 765 / 19 |
| `20261006` | 254.783 | 1 / 9 / 15 / 26 / 32 / 32 | 515.900 | 599 / 6 → 599 / 5 |
| `20261007` | 179.550 | 4 / 8 / 16 / 23 / 31 / 32 | 546.267 | 765 / 15 → 765 / 13 |

The cap-crossing birth itself blocks two, one, and two previously A cells, respectively. The cap-crossing Q/A sets and identities before and after that birth are retained in the ledgers.

| Seed | First post-cap production evaluation | Q / A there | Post-cap census evaluations; all with A | Last production census Q / A | 600 s clock-end Q / A |
|---|---|---:|---:|---:|---:|
| `20261005` | 554.400 s; 761 timers cleared | 769 / 20 | 45; 45 | 886 / 56 | 889 / 57 |
| `20261006` | 516.900 s; 595 timers cleared | 600 / 5 | 82; 82 | 828 / 52 | 833 / 53 |
| `20261007` | 547.283 s; 761 timers cleared | 769 / 14 | 52; 52 | 949 / 55 | 948 / 54 |

The last production evaluation occurs before 600,000 ms; clock-end counts are kept separate. Post-cap rows contain only the current Q/A census and cap state. They contain no `activeTimers` or `timerEvents` fields.

| Seed | Q cell-evaluation visits | Q visits blocked by proximity (`Q∩not-A`) | Blocked share of Q visits | Actual M / nearby rejection / birth | Compaction qualification losses | Actual Plate timer resets |
|---|---:|---:|---:|---:|---:|---:|
| `20261005` | 154,309 | 143,808 | 93.195% | 1,513 / 1,481 / 32 | 101 | 3,956 |
| `20261006` | 134,044 | 124,976 | 93.235% | 903 / 871 / 32 | 88 | 3,128 |
| `20261007` | 154,785 | 144,500 | 93.355% | 1,377 / 1,345 / 32 | 131 | 4,611 |

The exclusion percentage is over repeated qualified-cell evaluation visits, not unique cells or physical area. Across all seeds, 3,793 actual maturity calls produced 3,697 actual nearby rejections and 96 births. Every non-near matured cell maps to an actual production birth. Qualification losses were all compaction failures in these runs; Plate resets and other timer transitions remain individually recorded in the ledgers.

## Recheck of the fixed 400–460 s evidence

Before this natural run, the reported endpoint-geometry finding was rechecked against the exact production predicate in [MaterialStratigraphy](../../../../src/lib/agents/ant/MaterialStratigraphy.js#L336) and the saved [fixed-window evidence ledgers](../2026-10-13-nodule-gap-censoring-instrumentation/README.md). It is confirmed: the final active-and-qualified timer cells were nearby in **10/10**, **16/16**, and **1/1** cells by seed (27/27 total); **31/32** original targets were nearby overall. The sole non-near cell was seed `20261006`, cell 2921, with compaction `0.5465375`, lost qualification, and no active timer. Actual nearby rejections in that fixed window remain 0, 5, and 1 by seed. The 31/32 and 27/27 figures are endpoint geometry, not actual rejection counts.

The prior **20 right-censored + 7 Plate-reset censored + 5 compaction-loss** classification remains valid for that fixed 400–460 s cutoff. The 27 active timers do not support the interpretation that a simple gap extension would eventually produce births. The earlier evidence package was not changed or overwritten.

## Validity, review, and limitations

- The current runner compares observer Off/On normalized production-state hashes at all **596** actual Nodule evaluation boundaries per seed and at final state. Per-tick RNG state/call traces match for **36,000** ticks per seed, and evaluation times match.
- The unobserved production control and Off/On runs match every saved canonical replay summary field except `ownStateV8Sha256`; normalized final production-state digests match across all three. The V8 serialization hashes differ for observer runs, and the byte-level cause was not isolated. That serializer hash is excluded from equality claims.
- The independent reviewer re-read the production gates, runner, focused tests, fixed-window data, and all three new seed ledgers. It verified Q/A identities and partitions, cap rows, post-cap timer-field absence, actual timer clearing, terminal census identities, maturity outcome accounting, canonical non-V8 fields, normalized state equality, and observer parity. Verdict: **MIXED; no blocking validity issue**, with the V8 serialization caveat above.
- This result concerns three fixed natural seeds and 600 s only. It does not establish indefinite spatial closure or openness, cap-free births, post-cap timer persistence, a natural zero-ant lifecycle, turnover need, or any world-level architecture requirement.

## Reproduction and files

From the repository root, use Node 22.23.2 and a fresh output directory:

```powershell
node scripts/ant-natural-nodule-opportunity.js --output=test-results/ant-natural-nodule-opportunity-reproduction
node --test tests/ant-natural-nodule-opportunity.test.js
npm test
```

The runner asserts the branch/base ancestry, no production-source or dependency diff, all canonical replay fields apart from the disclosed serializer hash, exact proximity equality, post-cap timer policy, observer state parity, RNG parity, and evaluation-time parity. [Run manifest](run-manifest.json) records source hashes, contract, parity checks, and per-seed summaries. [Compressed raw seed ledgers](data/) preserve per-evaluation Q/A cell IDs, timer events, maturity outcomes, cap rows, observer parity hashes, and clock-end censuses; raw and gzip hashes are recorded in [SHA256SUMS.json](SHA256SUMS.json). The [independent review](independent-review.md) was read-only.

Focused observer tests passed **3/3** and the full relevant `npm test` suite passed **320/320**. Build was skipped because no production source or dependency changed.
