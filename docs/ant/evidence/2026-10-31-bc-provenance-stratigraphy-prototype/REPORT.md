# Results: B/C provenance stratigraphy prototype

## Question and decision

The prototype asks what spatial and temporal stratigraphy results when every already-measured B/C shadow maturation event deposits one immutable virtual layer on its registered X mask.

**Classification: COMPLEMENTARY BUT OVERPROLIFIC.** The ledger preserves mixed, exclusive, and ordered channel histories across a broad portion of each world. The raw event stream crosses the current 256-Plate ceiling reference in all seeds around the middle of the run. This supports dual provenance as a research direction but leaves real materialization blocked on a separate commit/arbitration responsibility.

## Implementation fact

The analysis starts from `248da39a4d7d342022a27a5b9ec183cad9b160e2`, verifies the upstream packages and current-production source hashes, and reads the exact saved B/C events and frozen source material/birth anchors. One event contributes one layer whose cells are exactly its stored X mask. Per-cell events at exact-equal numeric timestamps are grouped; a same-cell B and C tie is `{B,C}`. No tie receives physical vertical ordering.

The observer only creates research files and SVG/PNG views. It consumes no RNG, calls no production material object, creates no Plate, and feeds no value into the world. B/C have identical neutral semantics and differ only by provenance. There are no production-source changes.

## Event and storage pressure

| Seed | B events | C events | Shadow total | Actual production Plates | Shadow events / actual Plate | First crossing of 256 reference |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 354 | 308 | 662 | 37 | 17.89× | 272.016667 s; count 253→256 |
| 20261006 | 395 | 322 | 717 | 23 | 31.17× | 247.016667 s; exact-time batch 254→260 |
| 20261007 | 386 | 324 | 710 | 33 | 21.52× | 253.016667 s; count 255→256 |
| **All** | **1,135** | **954** | **2,089** | **93** | **22.46×** | all three cross before 273 s |

The 256 value is the current production `MaterialStratigraphy` Plate ceiling, used here only as a pressure reference. It is not an event cap and no virtual event was dropped. The shadow total is not a production birth count. The comparison shows that the one-event/one-layer prototype cannot be inserted unchanged into the current Plate path for a full 600 s history.

### Fixed 60 s event/birth rates

Values below are mean / median (minimum–maximum) counts per fixed 60 s window. The full ten-window B, C, combined, and actual-birth counts for each seed are in `analysis/event-windows.json`.

| Seed | B events | C events | Combined shadow events | Actual Plates born |
| --- | --- | --- | --- | --- |
| 20261005 | 35.4 / 41 (3–47) | 30.8 / 29 (3–45) | 66.2 / 72 (6–92) | 3.7 / 4 (0–5) |
| 20261006 | 39.5 / 41 (3–54) | 32.2 / 33 (4–44) | 71.7 / 72 (7–97) | 2.3 / 2 (0–6) |
| 20261007 | 38.6 / 40 (6–52) | 32.4 / 33 (6–43) | 71.0 / 72 (12–94) | 3.3 / 4 (0–6) |

All ten windows per seed, including the initial 0–60 s window, contain shadow events; combined windows range from 6–97 events. Actual production births remain much lower. These are different event responsibilities, not a target-rate comparison.

## Spatial coverage and layering at 600 s

| Seed | B cells | C cells | Both | B-only | C-only | Combined union | Untouched | Layer-cell incidences | Mean layers on covered cells | q90 / max layers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 6,090 | 5,416 | 4,921 | 1,169 | 495 | 6,585 (71.5%) | 2,631 | 34,191 | 5.19 | 11 / 26 |
| 20261006 | 5,846 | 4,758 | 4,366 | 1,480 | 392 | 6,238 (67.7%) | 2,978 | 26,474 | 4.24 | 8 / 23 |
| 20261007 | 6,014 | 5,352 | 4,890 | 1,124 | 462 | 6,476 (70.3%) | 2,740 | 30,945 | 4.78 | 10 / 25 |

The histories do not collapse to only co-located B/C layers. Every seed has substantial B-only and C-only coverage as well as cells touched by both. They also do not remain sparse: about 68–72% of the 96×96 grid is touched by at least one event by the final saved time. For covered cells, mean temporal-group counts are 3.94–4.76, q90 is 8–10, and the maximum is 22–23 groups. Full per-cell histograms are in each compressed ledger.

At 600 s, the median distance of covered cell centers from the entry is 0.360–0.373 normalized units; the incidence-weighted mean radius is 0.319–0.330. Event-class-associated masks touched 954–1,062 cells from entry-class events and 6,208–6,543 from non-entry-class events. These two touched-cell sets overlap and are not a partition. The result is spatially broad beyond entry-class episodes, not a claim about preferred material locations.

## Provenance sequences

| Seed | Cells with ≥2 strict-time groups | Mixed-channel cells among them | B-only / C-only among them | Strict B→C | Strict C→B | Coeval cell groups | Multiple strict switches |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 5,524 | 4,804 | 592 / 128 | 6,841 | 6,964 | 989 | 3,230 |
| 20261006 | 5,018 | 4,174 | 787 / 57 | 4,494 | 4,585 | 929 | 2,353 |
| 20261007 | 5,389 | 4,722 | 528 / 139 | 5,741 | 5,441 | 1,122 | 2,851 |

Strict transitions count only adjacent singleton time groups; an intervening `{B,C}` group is not ordered to manufacture a transition. Alternating, one-switch, repeated-channel, and maximum-run summaries are retained in `analysis/sequence-summaries.json`. There are 3,040 coeval cell groups across the three seed-worlds. This preserves both simultaneous provenance and strict temporal succession.

Representative columns are selected mechanically per seed: richest layer count, richest alternating cell, B-dominant mixed, C-dominant mixed, longest alternating sequence starting B, longest starting C, and B-only/C-only examples. For seed 20261005, cell 5915 has 26 event layers across 23 groups; cell 5718 has 24 layers and 15 singleton alternations; cells 7541 and 6203 are B- and C-dominant mixed examples respectively. The diagrams put latest time above earliest only as a chronology layout. They do not assert physical depth or burial.

## Snapshots and objective cases

The three snapshot atlases show 60, 120, 180, 300, 450, and 600 s requests. Each row uses the latest exact event time at or before its request and the actual production material grid from that identical saved anchor. For the 600 s request, the selected event time is 599.25 s for all seeds. At that time, prototype coverage is 6,238–6,585 cells and actual production material covers 6,737–7,500 cells; the maps remain separate and neither is treated as ground truth for the other.

The objective-case atlas reuses the exact registered cases: same-time/same-X at 42.016667 s (4 cells), same-time/disjoint X at 103.016667 s (5 B cells and 2 C cells), B then C on the same 12-cell X at 192.016667–193.016667 s, and C then B on the same 6-cell X at 507.016667–508.016667 s. The registered >20 s B-only and C-only event-interval cases are both `none`; neither was replaced. The fifth displayed example is the registered richest mixed-provenance cell, 5915, with its selected later B/C event context and actual-material map.

The objective panels show virtual layer counts before and after the selected interval, event X masks, and actual production material at the later event's exact source anchor. Actual production births are listed in the machine-readable context. No shadow event is labeled a Plate birth.

## Interpretation boundary

**Measured:** exact frozen events create broad spatial coverage, recurring mixed-channel provenance, channel-exclusive cells, coeval groups, and many strict transitions. The one-event/one-layer stream exceeds the 256 count reference in every seed before 273 s.

**Research interpretation:** provenance remains legible, but an unarbitrated event stream is too prolific for direct insertion into the current 256-Plate path. A later real dual-material integration would first need a separately authorized final commit/arbitration question. This pass does not design that responsibility.

**Authored material semantics:** B is accumulated qualified chemical history; C is contact-written compaction. Neither is asserted to be force, stress, density, or physical nucleation energy. Both virtual layer types share identical semantics here.

**Artistic interpretation:** the atlas makes broad, branching, repeatedly layered histories visible for author review. No artistic acceptance or material-property distinction is inferred.

## Smallest next question

If dual provenance remains desired, ask separately how matured episodes should be committed into real finite material under the existing storage/feedback constraints while preserving exact coeval provenance. Do not silently impose the 256 ceiling as a new shadow event gate; this pass did not compare commit mechanisms.
