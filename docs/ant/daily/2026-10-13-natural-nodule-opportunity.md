# 2026-10-13 — Natural 600 s Nodule opportunity census

## Question and scope

After the fixed 400–460 s timer/blocker audit, the question was whether a default-On natural 600 s run loses Nodule opportunity to spatial exclusion before the cap, or whether the `maxNodules=32` cap stops production while spatially unblocked qualified cells remain.

The pass reused the existing default-On natural contract: seeds `20261005`, `20261006`, `20261007`, 60 Hz, 600 s, no audio bridge. It made no production-law, threshold, timer, proximity, cap, lifecycle, or audio/runtime change. It did not extend the forced gap or run a cap-off counterfactual.

## Prior fixed-window finding rechecked first

Source and saved-data comparison confirmed the endpoint-geometry finding: all 27 final active-and-qualified timer cells in the fixed window were nearby under the exact production predicate; 31/32 original target cells were nearby. The only non-near cell was seed `20261006`, cell 2921, which had lost qualification to compaction (`0.5465375`) and had no active timer. Actual nearby production rejections remain six total (0/5/1 by seed). Thus the previous 20 right-censored + 7 Plate-reset censored + 5 compaction-loss classification remains valid, while the interpretation “27 active timers imply eventual births under a simple extension” is unsupported. The old fixed-window evidence was not changed.

## Natural-run findings

Q and A first appeared together at 244.617 s, 254.783 s, and 179.550 s. Every seed reached 32 Nodules. At cap crossing, pre-birth Q/A counts were 765/21, 599/6, and 765/15; after the actual birth they were 765/19, 599/5, and 765/13. Cap times were 553.383 s, 515.900 s, and 546.267 s.

The first post-cap production evaluation occurred about one second later and cleared 761, 595, and 761 actual candidate timers. From there, production performed 45, 82, and 52 Q/A-only censuses before the 600 s endpoint. A was present at every such census and at the separate clock-end census: Q/A at 600 s were 889/57, 833/53, and 948/54. No post-cap timer was aged and no hypothetical maturity or birth was recorded.

Across repeated qualified-cell evaluation visits, 93.195%, 93.235%, and 93.355% were blocked by existing Nodule proximity. Actual M/rejection/birth sequences were 1513/1481/32, 903/871/32, and 1377/1345/32. Every actual non-near maturity produced a birth; qualification losses were all compaction losses. Plate timer resets and exact per-cell lineages are retained in the evidence ledgers.

Decision: **MIXED.** Spatial exclusion is common and accounts for most Q evaluation visits, but it does not close all A cells. The cap is materially censoring production evaluation in these three natural runs because A remains at the cap, throughout post-cap census, and at 600 s. This does not imply that any remaining A would eventually birth without the cap. Keep `maxNodules=32`; no turnover, erosion, cap removal, or next simulation was authorized by this result. The earlier **WINDOW CENSORING DOMINANT** judgment remains scoped to the fixed 400–460 s classification.

## Validity and stop boundary

- Focused observer tests passed **3/3**; full `npm test` passed **320/320**.
- Observer Off/On normalized production-state hashes match at all 596 actual Nodule evaluation boundaries per seed and at final state. Per-tick RNG traces match across all 36,000 ticks per seed; evaluation times and canonical replay non-V8 fields match.
- The canonical `ownStateV8Sha256` differs for observer runs. The exact serialized-byte cause remains unisolated; this field is not used as equality evidence. The normalized production-state hashes match the control and observer runs.
- Fresh independent review found no blocking validity issue and confirmed the bounded MIXED result.
- Build was skipped because production source and dependencies were unchanged. No cap-off run, forced-gap extension, turnover/erosion implementation, or second experiment was performed.

## Files

- [Evidence package](../evidence/2026-10-13-natural-nodule-opportunity/README.md)
- [Independent review](../evidence/2026-10-13-natural-nodule-opportunity/independent-review.md)
- [Raw per-seed ledgers](../evidence/2026-10-13-natural-nodule-opportunity/data/)
