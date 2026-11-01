# B/C 10 s commit-slot ambiguity audit

## Decision

**PERSISTENT MULTI-OPTION COMPETITION.** The fixed 10 s temporal reference reduces 2,089 maturation events to 163 earliest-possible world slots, but leaves multiple distinct spatial X options in 159 / 163 (97.5%). Median is 12 unique X options per slot; maximum is 20. Temporal cadence alone does not resolve spatial commit ambiguity.

No option was selected or committed. This result supports a separate spatial commit-responsibility question; it does not specify a score or authorize a real Plate.

## Authority and scope

- Frozen production authority: `bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Frozen opportunity packet: `da599d9f385f53d0bb24df3e737c5ed2e2eb6a23`; B/C responsibility analysis: `a75b83ce5dbeece36d60d966b9d86fc85ddb5f54`; dual-history maturation: `248da39a4d7d342022a27a5b9ec183cad9b160e2`; matched author-review package: `dfc29559860ec9e6312d2ea556041d956117bc5e`; starting prototype branch head: `a80a613be68ede94fce89008a076fbe582178f41`.
- Seeds: `20261005`, `20261006`, and `20261007`; 599 exact saved analysis boundaries per seed. The same 2,089 registered events, tracks, timestamps, and X capture histories were reused.
- The upstream law remains 20 s uninterrupted adjacent-X Jaccard `>= .60`. A mature candidate stays active through only that same registered uninterrupted chain. Track end, a saved-anchor discontinuity, or a below-.60 reset ends it. The reset anchor belongs only to the new interval.
- The first slot is the earliest saved boundary with a mature spatial option. Each later slot is the earliest saved boundary at or after the previous slot plus 10,000 actual milliseconds that still has an active option.
- At each slot, only exact sorted X cell-set equality collapses candidates for spatial-option counts. B and C records are both retained as `{B,C}`; partial overlap and nearby centers stay distinct.
- No amplitude, age, size, contact, novelty, material-overlap, pheromone, refractory, ceiling, or winner rule was used. The existing 90 s / repeat-contact / Plate-ceiling gates were omitted.

## Per-seed results

| Seed | Mature events (B/C) | 10 s slots | Unique options mean / median / max | One option | More than one | More than five | Mature events absent at every slot | Candidates seen at multiple slots | Actual production Plates |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | 662 (354/308) | 55 | 10.5 / 11 / 17 | 2 | 53 (96.4%) | 48 | 205 | 167 | 37 |
| 20261006 | 717 (395/322) | 54 | 12.3 / 13 / 18 | 2 | 52 (96.3%) | 50 | 205 | 214 | 23 |
| 20261007 | 710 (386/324) | 54 | 11.2 / 12 / 20 | 0 | 54 (100.0%) | 50 | 225 | 195 | 33 |

Across all seeds, exactly one option occurred at only 4 / 163 (2.5%). More than five options occurred at 148 / 163 (90.8%). The slots averaged 12.82 upstream events each. Actual production recorded 93 Plates across the three runs; that count is context, not a target or validation of the shadow stream.

## B/C option composition and pair relations

Across slots there were 784 B-only, 397 C-only, and 665 exact same-X `{B,C}` option occurrences. Both channels occupied distinct X options in 159 of 163 slots. A same-X `{B,C}` option coexisted with other distinct options in 155 slots, so coeval dual provenance did not account for the broader ambiguity by itself.

Among 10,956 pairwise relations between unique options, 10,322 were disjoint, 634 partially overlapped, and none were exact duplicates after the required exact-mask collapse. Pairwise X-Jaccard median was 0; q90 was 0. The nearest candidate-center distance across option pairs had median 0.514 and q90 0.860 world units. Frozen F-component relation counts were 3,263 same-component and 7,693 different-component pairs. Full per-slot pair receipts retain exact distances and relations.

## Backlog and candidate age

- **20261005:** 205 of 662 candidates were never present at a slot; 167 appeared at multiple slots. For candidates appearing at a slot, slot-count median/q90/max was 1/3/13. 438 candidates naturally ended between adjacent slots while the previous slot was unresolved; 437 new candidates joined while prior unresolved candidates remained.
- **20261006:** 205 of 717 candidates were never present at a slot; 214 appeared at multiple slots. For candidates appearing at a slot, slot-count median/q90/max was 1/3/15. 495 candidates naturally ended between adjacent slots while the previous slot was unresolved; 505 new candidates joined while prior unresolved candidates remained.
- **20261007:** 225 of 710 candidates were never present at a slot; 195 appeared at multiple slots. For candidates appearing at a slot, slot-count median/q90/max was 1/3/29. 465 candidates naturally ended between adjacent slots while the previous slot was unresolved; 476 new candidates joined while prior unresolved candidates remained.

Across adjacent slot transitions, an exact X remained unresolved at 143 option continuities. Candidates also turned over naturally: the median candidate appeared at one slot. B mature age at a slot had median 8.0 s, q90 33.2 s, and maximum 293.0 s; C had median 6.1 s, q90 24.0 s, and maximum 77.0 s. The long-lived tail coexists with frequent natural expiration and new arrivals.

## Fixed 60 s evolution

Each window shows option median / maximum; then single / multiple / >5-option slot counts; then B/C median mature age in seconds; then B-only / C-only / mixed option occurrences.

| Seed | Window (s) | Slots | Options median / max | Single / multiple / >5 | Median age B / C (s) | B-only / C-only / {B,C} |
|---|---:|---:|---:|---:|---:|---:|
| 20261005 | 0–60 | 2 | 1 / 4 | 1 / 1 / 0 | 0.0 / 2.0 | 2 / 1 / 2 |
| 20261005 | 60–120 | 6 | 2 / 16 | 1 / 5 / 1 | 5.0 / 5.0 | 8 / 9 / 13 |
| 20261005 | 120–180 | 5 | 12 / 15 | 0 / 5 / 5 | 6.0 / 5.0 | 14 / 7 / 36 |
| 20261005 | 180–240 | 6 | 11 / 16 | 0 / 6 / 6 | 6.0 / 5.0 | 27 / 16 / 28 |
| 20261005 | 240–300 | 6 | 9 / 13 | 0 / 6 / 6 | 9.0 / 7.0 | 33 / 19 / 6 |
| 20261005 | 300–360 | 6 | 13 / 16 | 0 / 6 / 6 | 7.0 / 7.0 | 33 / 19 / 30 |
| 20261005 | 360–420 | 6 | 11 / 15 | 0 / 6 / 6 | 7.0 / 7.0 | 26 / 28 / 14 |
| 20261005 | 420–480 | 6 | 10 / 13 | 0 / 6 / 6 | 8.0 / 6.0 | 35 / 12 / 17 |
| 20261005 | 480–540 | 6 | 8 / 14 | 0 / 6 / 6 | 11.0 / 5.1 | 28 / 7 / 21 |
| 20261005 | 540–600 | 6 | 15 / 17 | 0 / 6 / 6 | 9.1 / 6.1 | 40 / 20 / 25 |
| 20261006 | 0–60 | 2 | 1 / 1 | 2 / 0 / 0 | 0.0 / 0.0 | 0 / 1 / 1 |
| 20261006 | 60–120 | 6 | 8 / 17 | 0 / 6 / 5 | 5.0 / 5.0 | 20 / 11 / 25 |
| 20261006 | 120–180 | 5 | 13 / 17 | 0 / 5 / 5 | 9.0 / 8.0 | 27 / 15 / 22 |
| 20261006 | 180–240 | 6 | 16 / 18 | 0 / 6 / 6 | 10.0 / 8.0 | 41 / 21 / 32 |
| 20261006 | 240–300 | 6 | 12 / 18 | 0 / 6 / 6 | 11.0 / 9.0 | 39 / 13 / 29 |
| 20261006 | 300–360 | 6 | 12 / 17 | 0 / 6 / 6 | 9.0 / 5.0 | 31 / 23 / 20 |
| 20261006 | 360–420 | 6 | 11 / 17 | 0 / 6 / 6 | 6.0 / 4.0 | 33 / 8 / 28 |
| 20261006 | 420–480 | 6 | 14 / 15 | 0 / 6 / 6 | 11.0 / 7.0 | 41 / 12 / 30 |
| 20261006 | 480–540 | 6 | 15 / 18 | 0 / 6 / 6 | 8.0 / 7.0 | 33 / 17 / 42 |
| 20261006 | 540–600 | 5 | 11 / 14 | 0 / 5 / 4 | 7.1 / 10.2 | 16 / 10 / 24 |
| 20261007 | 0–60 | 2 | 2 / 4 | 0 / 2 / 0 | 2.0 / 0.0 | 2 / 1 / 3 |
| 20261007 | 60–120 | 6 | 6 / 11 | 0 / 6 / 5 | 7.0 / 5.0 | 22 / 0 / 19 |
| 20261007 | 120–180 | 5 | 11 / 20 | 0 / 5 / 5 | 9.0 / 6.0 | 25 / 10 / 29 |
| 20261007 | 180–240 | 6 | 11 / 19 | 0 / 6 / 5 | 10.0 / 5.0 | 26 / 14 / 26 |
| 20261007 | 240–300 | 6 | 15 / 16 | 0 / 6 / 6 | 9.0 / 8.0 | 36 / 18 / 30 |
| 20261007 | 300–360 | 6 | 13 / 16 | 0 / 6 / 6 | 7.0 / 6.0 | 28 / 20 / 32 |
| 20261007 | 360–420 | 6 | 12 / 13 | 0 / 6 / 6 | 9.0 / 8.0 | 32 / 14 / 27 |
| 20261007 | 420–480 | 6 | 14 / 15 | 0 / 6 / 6 | 8.0 / 8.0 | 37 / 19 / 20 |
| 20261007 | 480–540 | 6 | 10 / 16 | 0 / 6 / 6 | 8.1 / 8.1 | 32 / 19 / 20 |
| 20261007 | 540–600 | 5 | 8 / 16 | 0 / 5 / 5 | 4.1 / 1.0 | 17 / 13 / 14 |

The first 60 s are sparse and contain the few single-option slots. After 60 s, all 27 seed-windows contain five or six temporal slots and at least five of those slots retain multiple options. The late 540–600 s windows remain multi-option in every slot.

## Objective cases and visuals

| Objective case | Seed | Time (s) | Options | Mature B/C candidates | B-only / C-only / {B,C} | Disjoint / partial pairs |
|---|---|---:|---:|---:|---:|---:|
| first-single-option | 20261005 | 42.017 | 1 | 1/1 | 0/0/1 | 0/0 |
| maximum-spatial-options | 20261007 | 138.017 | 20 | 15/13 | 7/5/8 | 181/9 |
| maximum-disjoint-options | 20261007 | 138.017 | 20 | 15/13 | 7/5/8 | 181/9 |
| B-only-dominated | 20261005 | 268.017 | 6 | 5/1 | 5/1/0 | 15/0 |
| C-only-dominated | 20261005 | 96.017 | 1 | 0/1 | 0/1/0 | 0/0 |
| mixed-plus-distinct-competitors | 20261005 | 53.017 | 4 | 3/2 | 2/1/1 | 5/1 |
| oldest-surviving-unresolved-candidate | 20261007 | 349.017 | 11 | 8/9 | 2/3/6 | 54/1 |

[Native-frame objective atlas (PNG)](visual/objective-slot-atlas.png) · [SVG](visual/objective-slot-atlas.svg). Every selected case has an exact native world/material frame. Colors only label provenance: B teal, C orange, and coeval `{B,C}` violet. All candidates have equal display status; no winner is highlighted.

The selected oldest unresolved candidate is B at 293.0 s of mature age. Its full event/track/X receipt is in `analysis/objective-slots.json`.

Selected native frames were rendered by deterministic replay of the same frozen production histories because the registered frame receipt did not contain these objective slots. Both replayed seeds matched all 599 saved boundaries, including E/F/B/C/D, material layer/top/birth maps, birth IDs, and final RNG state. Seed 20261005 anchor 42 reproduced its prior PNG hash exactly. No new history was sampled.

## Interpretation and limit

**Measurement:** 10 s slots filter 635 of 2,089 mature events before any slot, and reduce the stream to 163 time slots. Yet 159 slots contain multiple distinct X options, the median slot contains 12, and many exact candidates/X options survive across adjacent slots. New candidates also join while incumbents remain.

**Classification:** **PERSISTENT MULTI-OPTION COMPETITION.** The ambiguity is persistent at the slot level, with real track turnover rather than one wholly frozen backlog. Cadence reduces pressure but does not provide a spatial commit choice.

**Authored semantics:** 10 s is a comparison reference only. No spatial winner, Plate, material, or production state was created or changed. No B/C signal was ranked against the other.

**Smallest next question:** Which authored spatial responsibility, if any, should resolve the simultaneously mature local X options before dual provenance is mapped to real material? This audit does not design that responsibility.
