# B/C 10 s commit-slot ambiguity audit — 2026-11-01

## Starting question

The completed provenance-only B/C prototype preserved useful mixed and channel-exclusive histories, but produced 662–717 maturation events per seed in 600 s. Before designing any spatial competition responsibility, this pass asked whether the existing production-scale 10 s global birth gap would leave mostly unambiguous temporal commit opportunities.

## Implementation fact

The audit reused the exact 2,089 registered maturation events, opportunity tracks, saved timestamps, and X masks from the frozen three-seed packet. It treated a candidate as mature from its registered first-maturation boundary through only the remainder of that same uninterrupted 20 s / adjacent-X-Jaccard-`>= .60` chain. The 10 s value was a temporal comparison reference only. At each earliest eligible saved boundary, exact X masks alone were collapsed; a coeval same-X B/C pair remained one spatial option with both provenance records preserved. No spatial winner was selected.

Objective views were rendered by source-conformant replay against the same frozen histories because the registered frame receipt lacked these selected slots. Both replayed seeds matched all 599 saved boundaries, including E/F/B/C/D, actual material state, Plate births, and terminal RNG state; the anchor-42 PNG hash matched a previously saved frame. No new natural history was sampled.

## Measurement

| Seed | Maturation events | 10 s slots | Slots with >1 distinct X | Median options | Maximum options | Actual production births |
|---|---:|---:|---:|---:|---:|---:|
| 20261005 | 662 | 55 | 53 | 11 | 17 | 37 |
| 20261006 | 717 | 54 | 52 | 13 | 18 | 23 |
| 20261007 | 710 | 54 | 54 | 12 | 20 | 33 |
| **Total** | **2,089** | **163** | **159 (97.5%)** | **12 overall** | **20** | **93** |

Across the slots, 784 B-only, 397 C-only, and 665 exact same-X `{B,C}` option occurrences were recorded. A same-X `{B,C}` option coexisted with other distinct options in 155 slots. Of 10,956 pairwise relations between unique spatial options, 10,322 were disjoint and 634 partially overlapped.

The 10 s cadence filtered 635 mature candidates before any slot. It did not produce predominantly single-option moments: only 4 of 163 slots had one option. Candidate availability still turned over naturally, while new candidates joined during transitions in 152 of 160 adjacent-slot comparisons. A long-lived tail remained; the oldest unresolved B candidate was 293 s past maturation at its selected slot.

## Interpretation

**Classification: PERSISTENT MULTI-OPTION COMPETITION.** Temporal spacing reduces event pressure, but most slots still contain many distinct local X options. Exact coeval B/C provenance is often one shared spatial option, yet commonly appears alongside other choices. A separate spatial commit responsibility is required if matured episodes are to become real material; this audit does not define it.

The comparison does not establish an acceptable event rate, biological mechanism, material law, artistic preference, or production adoption. Actual production Plate counts are descriptive context only.

## Next question

If dual provenance remains desired, which authored spatial responsibility, if any, should resolve simultaneously mature local X options before real materialization?

## Evidence

- [Full report and per-seed tables](../evidence/2026-11-01-bc-commit-slot-ambiguity-audit/REPORT.md)
- [Validation and replay parity](../evidence/2026-11-01-bc-commit-slot-ambiguity-audit/VALIDATION.md)

No production source, `MaterialStratigraphy`, actual Plate births, Residence behavior, or parameters were changed.
