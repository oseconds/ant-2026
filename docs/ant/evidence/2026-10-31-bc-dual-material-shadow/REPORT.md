# Report — independent B/C shadow maturation

## Result

**DUAL HISTORY / COMPLEMENTARY.** Under the same fixed 20 s / `.60` X-stability grammar, B and C event times are strongly synchronized, but their simultaneous local captures are often spatially distinct. The virtual ledger records both shared and channel-exclusive coverage, with B→C and C→B sequences in both orders. The result supports considering a later dual-provenance prototype; it does not select a channel, set material properties, or authorize adoption.

## Method and implementation fact

The pass reused the three-seed frozen current-production opportunity histories and exact registered B/C tracks/X receipts. For each track, stability started at its first saved observation, continued only across adjacent saved anchors with exact X-cell-set Jaccard `>= .60`, and reset on a lower similarity or anchor gap. The first saved observation at least 20 actual model seconds after interval start emitted one event. The identical code path processed B and C; no channel amplitude threshold or production repeat gate was added.

The production world was not modified. Observer analysis used no RNG. Eight missing native world frames at selected event times were reconstructed solely to present the requested cases; the three frozen event histories and all 599 saved boundaries per seed remained the measurement source.

## Event stream

| Seed | B events | C events | B entry / non-entry | C entry / non-entry | Track age at event, median / q90 B · C | Median X nodes B / C | Median prior-material overlap B / C |
|---|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | 354 | 308 | 5 / 349 | 15 / 293 | 20.00 / 24.00 · 20.05 / 25.00 s | 5 / 4 | .857 / .877 |
| 20261006 | 395 | 322 | 8 / 387 | 11 / 311 | 20.00 / 25.00 · 20.00 / 22.37 s | 4 / 3 | .400 / .009 |
| 20261007 | 386 | 324 | 9 / 377 | 10 / 314 | 20.00 / 24.00 · 20.00 / 22.00 s | 5 / 4 | .429 / .425 |
| **Total** | **1,135** | **954** | **22 / 1,113** | **36 / 918** | — | — | — |

Median uninterrupted stability interval was 20.00 s in every seed/channel; q90 was about 21 s. Track age at event is measured from each opportunity track's first observation and can be longer than the current uninterrupted interval after resets. The event occurs at the first saved timestamp to cross 20 s, so it may pass the exact duration until the next saved boundary. The machine-readable event stream retains every actual timestamp, chain and X set. Event X sizes have broad upper tails: median sizes are 3–5 nodes, while q75 ranges from 20 to 88 nodes across seed/channel combinations. This describes variable captures, not a complexity target. Prior-material medians vary sharply by seed/channel, so lower overlap is not evidence of a preferred responsibility.

## Timing relation

| Seed | Exact same-boundary B/C pairs | Identical X | Partial X overlap | Disjoint X | Nearest opposite lag: median / q90 / max abs |
|---|---:|---:|---:|---:|---:|
| 20261005 | 397 | 176 | 8 | 213 | 0 / 1.02 / 6 s |
| 20261006 | 464 | 214 | 6 | 244 | 0 / 1.00 / 17 s |
| 20261007 | 438 | 191 | 11 | 236 | 0 / 1.00 / 5 s |
| **Total** | **1,299** | **581** | **25** | **693** | median 0 s; q90 about 1 s |

Among exact same-boundary pairs, 44.7% have identical X, 1.9% partially overlap and 53.3% are disjoint. Same-boundary pair counts are pairwise and can include multiple combinations at a boundary; the pair count does not represent one-to-one event matching.

Nearby pairs remain mostly spatially distinct. All event-pair combinations within 5 actual seconds were:

| Seed | Pairs | Identical X | Partial X | Disjoint X | Median center distance | Mean X Jaccard |
|---|---:|---:|---:|---:|---:|---:|
| 20261005 | 2,110 | 178 | 48 | 1,884 | .517 | .090 |
| 20261006 | 2,438 | 220 | 55 | 2,163 | .459 | .098 |
| 20261007 | 2,423 | 198 | 62 | 2,163 | .453 | .090 |

These are pairwise counts, not independent trials or one-to-one matches.

| Seed | B event with C within 1 / 5 / 10 / 20 s | C event with B within 1 / 5 / 10 / 20 s | Nearest ordering B→C / C→B / exact tie |
|---|---|---|---|
| 20261005 | 265/354 · 350/354 · 354/354 · 354/354 | 255/308 · 308/308 · 308/308 · 308/308 | 85 / 84 / 493 |
| 20261006 | 310/395 · 394/395 · 395/395 · 395/395 | 288/322 · 321/322 · 321/322 · 322/322 | 82 / 80 / 555 |
| 20261007 | 297/386 · 385/386 · 386/386 · 386/386 | 273/324 · 324/324 · 324/324 · 324/324 | 89 / 86 / 535 |

Every event has an opposite-channel event within the descriptive 20 s window; no B-only or C-only period longer than 20 s was observed. At the 1 s window, nearest events occur for 76.8% of B and 85.5% of C events. The nearest-event ordering is balanced rather than consistently led by one evidence channel. Thus the schedules are close in time, while time coincidence does not imply that they select the same local X.

## Spatial relation and objective cases

At exact shared boundaries, disjoint X pairs (693) outnumber identical pairs (581). Where F-component IDs are available, 673 pairs share a component and 626 differ; a shared F component therefore does not imply identical episode capture.

The deterministic [objective selection receipt](analysis/objective-cases.json) selects:

- **Exact same time + same X:** seed 20261005 at 42.0167 s; both 4-node X sets are identical.
- **Closest-time pair with disjoint X:** seed 20261005 at 103.0167 s; simultaneous B and C X sets are disjoint (5 and 2 nodes).
- **B then C on the same X:** seed 20261006 at 192.0167 / 193.0167 s; identical 12-node X.
- **C then B on the same X:** seed 20261005 at 507.0167 / 508.0167 s; identical 6-node X.
- **B-only temporal interval >20 s:** none.
- **C-only temporal interval >20 s:** none.
- **Richest mixed-provenance cell:** seed 20261005, cell 6672, with 26 virtual B/C layers; selected B/C event views show the local episode outlines at 527.067 s and 591.117 s.

The [objective event-case atlas](visual/objective-case-atlas.png) pairs each selected saved world frame with actual existing material and candidate X outlines. The [dual-stratigraphy atlas](visual/virtual-dual-stratigraphy-atlas.png) shows per-seed exclusive, mixed and virtual layer-count maps. No aesthetic rank or acceptance is assigned.

## Virtual layering

| Seed | B-only cells | C-only cells | Cells touched by both | Union | Layer-cell incidences | Strict B→C / C→B adjacent transitions | Alternating cells | Layer-count median / q90 / max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | 1,169 | 495 | 4,921 | 6,585 | 34,191 | 6,841 / 7,620 | 406 | 2 / 10 / 26 |
| 20261006 | 1,480 | 392 | 4,366 | 6,238 | 26,474 | 4,494 / 5,052 | 369 | 2 / 7 / 23 |
| 20261007 | 1,124 | 462 | 4,890 | 6,476 | 30,945 | 5,741 / 6,104 | 368 | 2 / 8 / 25 |
| **Total** | **3,773** | **1,349** | **14,177** | **19,299** | **91,610** | **17,076 / 18,776** | **1,143** | pooled 2 / 8 / 26 |

About 73.5% of the union cells were touched by both channels. The 1,143 alternating cells have a strict-time sequence in which every adjacent provenance changes channel; this is a descriptive subset, not a desired pattern. Exact timestamp ties are stored in deterministic reporting order only: there are 7,657 tied adjacent event pairs, and none is treated as a causal top/bottom relation. Exact duplicate consecutive X sets were rare at distinct times (5 across seeds); 334 further duplicates occur at exact timestamp ties.

Final virtual coverage compared with already-born production material has Jaccard `.779`, `.727`, and `.762` by seed. This is descriptive overlap, not agreement with ground truth or a novelty score. Event-level prior-material overlap medians differ by seed and channel (B `.400–.857`; C `.009–.877`), so the data do not support a channel preference based on material novelty.

## Interpretation and boundary

**Measurement:** maturation schedules are strongly synchronized, with no long exclusive event intervals. At the same saved boundary, however, over half of pairwise event combinations have disjoint X. The virtual cell ledger records extensive co-location, channel-exclusive coverage, and both B→C and C→B sequences.

**Research interpretation:** this is similar-in-time but spatially complementary episode evidence, not two independent clocks and not mostly duplicate recording. Same place can receive distinct channel provenance at different times; other locations receive only one channel in the observed interval.

**Authored semantics:** B means qualified chemical history; C means contact-written compaction. Shared 20 s / `.60` grammar tests timing only. No B/C fusion, competition, nucleation rule, actual Plate, material-property differentiation, or Residence was tested.

**Artistic interpretation:** left to the author. These measurements do not establish that mixed virtual stratigraphy is more convincing, biologically valid, or production-worthy.

**Classification: DUAL HISTORY / COMPLEMENTARY.** Smallest next question: whether to authorize a provenance-only dual-material prototype while keeping physical and audio parameters identical.

## Reproduction

Read [protocol](PROTOCOL.md), [validation](VALIDATION.md), [manifest](manifest.json), and [SHA-256 sums](SHA256SUMS.txt). Derived JSON and visualization outputs are deterministic from the frozen packet. No new natural observations or production changes were introduced.
