# Protocol — B/C component capacity necessity

This is an observer-only analysis of frozen histories. It uses the 163 saved temporal slots and 1,846 unique-X appearances from the registered conflict decomposition. It does not run or replay the natural world.

## Fixed input architecture

Existing B/C track maturation and exact X-overlap components are reused without change. One diagnostic episode is counted per exact-overlap component per saved slot. No local winner is selected as an authored law.

## Per-component bounds

For member masks `X_i`, the component stores min/median/max `|X_i|`, exact all-member intersection, and exact member union. Lower and upper episode footprints use min/max member mask sizes. The union/intersection maps are feasibility envelopes, not synthetic plates. Singleton masks are exact.

## References

- MIN-FOOTPRINT: smallest existing member mask, tie by lexical `optionId`.
- MAX-FOOTPRINT: largest existing member mask, tie by lexical `optionId`.
- CANONICAL: lowest lexical registered `optionId`.

These are reproducibility references, not winner laws.

## Ledger semantics

One selected component member X contributes one episode layer at that slot's actual time. A selected `{B,C}` option remains one layer tagged with both provenance channels. Exact cell timestamp ties are grouped. Layer count counts episode records once; per-channel provenance counts count a dual-tagged episode in each channel.

## Fixed comparisons

Cumulative cut times are 60, 120, 180, 300, 450, and 600 s; each includes saved slots with `timeMs <= requested time`. Windows are half-open `[0,60), ... [540,600)`. Current production material uses the latest saved source anchor at or before 600 s (599.25 s, index 598). Raw B/C and actual production are descriptive references only.

Quantiles use the registered observed-value convention: sorted value at `floor((n−1)×p)`, with no interpolation.

## Classification boundary

The 256 value is storage/implementation context only. No event cap, material deletion, turnover, spatial arbitration, RNG, or world feedback is introduced.

## Results summary

CAPACITY LAW NOT YET JUSTIFIED
