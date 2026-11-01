# Protocol — B/C 10 s commit-slot ambiguity audit

## Question and authority

This observer-only pass asks whether the existing production-scale global 10 s cadence leaves one mature local X option at most candidate moments, or leaves concurrent distinct X alternatives.

- Production authority represented by the frozen world observations: `bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Opportunity packet: `da599d9f385f53d0bb24df3e737c5ed2e2eb6a23`.
- B/C responsibility packet: `a75b83ce5dbeece36d60d966b9d86fc85ddb5f54`.
- Dual-history maturation events: `248da39a4d7d342022a27a5b9ec183cad9b160e2`.
- Matched author-review package: `dfc29559860ec9e6312d2ea556041d956117bc5e`.
- Provenance prototype / analysis base: `a80a613be68ede94fce89008a076fbe582178f41`.
- Seeds: `20261005`, `20261006`, `20261007`; each has 599 saved analysis boundaries.

## Locked upstream evidence

The pass reuses the exact 2,089 registered B/C events, their opportunity tracks, exact analysis timestamps, and captured X masks. It does not rerun or alter the natural histories.

Maturation remains:

```text
20 model seconds of uninterrupted registered track stability
AND adjacent X cell-set Jaccard >= 0.60
```

The audit independently reconstructs each first-crossing event and matches event ID, interval start, saved maturity anchor, timestamp, and every X mask in the registered chain.

## Mature-candidate lifetime

At the maturity boundary, the candidate becomes active. It stays active through later saved observations in that same uninterrupted registered stability interval. Its current X is the exact capture at the current boundary.

The candidate expires before the first boundary that starts a new interval because of:

- track end;
- an anchor discontinuity; or
- adjacent X Jaccard below `.60`.

No additional lifetime or expiry rule is applied. The reset observation belongs to the new interval, not the expired candidate.

## Slot schedule

The existing production `TRAIL_PLATE_GLOBAL_BIRTH_GAP_MS = 10000` is only a fixed temporal reference.

1. The first slot is the earliest actual saved analysis boundary with at least one mature spatial option.
2. After slot time `t`, the next slot is the earliest later saved boundary with an active mature option and `timeMs >= t + 10000`.
3. Slot timing depends only on candidate availability and the temporal gap. No spatial winner is chosen.

The schedule uses the actual floating-point saved model timestamps, not nominal 10 s ticks or rounded labels.

## Exact spatial-option identity

At each slot, candidate masks are grouped only by exact equality of their sorted X cell sets. A mask carrying both B and C becomes one spatial option with provenance `{B,C}`; all originating candidate records remain in the receipt.

Partial overlap, shared F component, center proximity, and matching channel do not collapse options. The pair receipt records X Jaccard, min/max center distance across candidate centers, and same/different F-component relation for every pair of unique options.

## Measurements

The per-slot receipt records:

- mature B and C candidate counts;
- exact B/C same-X options and raw exact B×C candidate pairs;
- unique X options and provenance composition;
- pairwise exact/partial/disjoint relations, center distances and F-component relation;
- mature age for every active candidate.

Per-seed backlog receipts follow event candidates and exact X masks across adjacent slots. They record natural disappearance, candidates that join while prior candidates persist, and repeated exact X options. The fixed 60 s windows report slot counts, option counts, mature ages, and B/C provenance composition.

## Objective cases and frames

Cases use deterministic rules recorded in `analysis/objective-slots.json`: first single-option slot; maximum option count; maximum disjoint option-pair count; B-only and C-only provenance-class dominance; a coeval `{B,C}` option plus a distinct option; and the oldest candidate at an unresolved slot. Ties use seed, actual time, anchor, then event ID.

Native screenshots were not saved at most selected slots. The existing source-conformant replay harness rendered only selected frames from the same frozen production trajectories. It compared all 599 boundaries per replayed seed, including E/F/B/C/D, material layer/top/birth maps, production birth IDs, and final RNG state. No new seed or natural history was sampled. The exact prior anchor-42 PNG hash was reproduced.

## Excluded

There is no actual Plate creation, production feedback, B/C ranking, spatial competition rule, amplitude comparison, event suppression, random arbitration, same-corridor refractory, repeat-contact gate, Plate ceiling, or Residence work. The 10 s cadence is not adopted for a future B/C system.
