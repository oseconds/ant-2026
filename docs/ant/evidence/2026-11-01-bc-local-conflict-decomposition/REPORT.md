# B/C local X-conflict decomposition

## Decision

**LOCAL CONFLICT DECOMPOSES BUT REMAINS OVERPROLIFIC.** Exact X overlap divides the 1,846 unique-X option appearances into 1,352 local components across the 163 registered slots. Most components are singletons, and the typical contested component is small. At the same time, a contested component occurs in 138 / 163 slots. A diagnostic one-event-per-component count exceeds the current 256-Plate reference in all three seeds.

The result separates two responsibilities: which options overlap locally, and how many independent local events the world could materialize. It defines neither a local winner nor a world-level capacity law.

## Authority and scope

- Production represented by the frozen observations: `main@bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Dual-history maturation: `248da39a4d7d342022a27a5b9ec183cad9b160e2`.
- Provenance prototype: `a80a613be68ede94fce89008a076fbe582178f41`.
- Commit-slot ambiguity audit: `e960d135afec30e7c9f35722359e15f0f2d39ce3`.
- Seeds and saved slots: `20261005` / 55, `20261006` / 54, `20261007` / 54.
- No natural simulation or replay occurred. Production behavior, RNG, material, and `TrailPlateBirth` were untouched.

## Implementation facts

Each slot reuses the exact upstream mature unique-X masks. A node pair is adjacent exactly when its sorted cell sets share one or more cells. Connected components use graph connectivity, including transitive chains; no distance or similarity threshold is added. Exact same-mask B/C candidates remain one `{B,C}` node, as registered upstream.

The primary graph was reconstructed twice with separate algorithms: direct set-intersection edges plus BFS components, and sorted-mask two-pointer edges plus union-find components. All 163 exact edge sets and component partitions matched. The observer uses no RNG.

The secondary frozen-F sensitivity is a separate relation only. It never changes primary component membership.

## Measurements

| Measure | Result |
|---|---:|
| Registered temporal slots | 163 |
| Unique-X option appearances | 1,846 |
| Exact-X overlap components | 1,352 |
| Singleton components | 1,121 / 1,352 (82.9%) |
| Contested components | 231 |
| Options in singleton components | 1,121 / 1,846 (60.7%) |
| Options in contested components | 725 / 1,846 (39.3%) |
| Slots with at least one contested component | 138 / 163 (84.7%) |
| Slots containing only singleton components | 25 / 163 |
| Pairwise option relations | 10,956 |
| Pairwise relations with positive X overlap | 634 (5.8%) |
| Pairwise X-disjoint relations | 10,322 (94.2%) |
| All-component size median / q90 / max | 1 / 2 / 12 options |
| Contested-component size median / q90 / max | 2 / 6 / 12 options |
| Components per slot median / q90 / max | 8 / 12 / 16 |
| Largest component per slot median / q90 / max | 3 / 6 / 12 |

Across seeds, component provenance included 382 B-only components, 152 C-only components, 665 components containing a `{B,C}` node, and 153 with a cross-provenance conflict edge. These categories overlap. In 90 slots, at least one B-only component and one C-only component existed in separate neighborhoods.

| Seed | Slots | X options | Components | Singleton options | Contested options | Singleton option share | All-singleton slots | Contested-component size median / q90 / max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | 55 | 576 | 422 | 347 | 229 | 60.2% | 10 | 3 / 5 / 8 |
| 20261006 | 54 | 665 | 486 | 407 | 258 | 61.2% | 7 | 3 / 5 / 8 |
| 20261007 | 54 | 605 | 444 | 367 | 238 | 60.7% | 8 | 2 / 5 / 12 |

Per-slot component-size distributions and full option-level relations are in the compressed receipts, not reduced to one conflict score.

## Frozen-F sensitivity

Among the 10,956 pairwise option relations, 3,263 pairs shared at least one frozen F-component identity. Of those, 2,629 pairs had disjoint X cell sets. A graph using same-F relation would therefore join many options that the primary exact-X relation considers spatially separate. Summed over slots, the primary graph had 1,352 components versus 997 same-F relation components (a difference of 355). F connectivity is only a sensitivity and is not a candidate conflict law.

## Temporal evolution

Each row is one fixed 60 s window. “Contested median / max” is over the individual multi-option components observed within the window; an empty set is shown as `—`.

| Seed | Window (s) | Slots | Median options | Median components | Median singleton components | Contested size median / max | One per component (window) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | 0–60 | 2 | 1 | 1 | 1 | 2 / 2 | 4 |
| 20261005 | 60–120 | 6 | 2 | 2 | 2 | 4 / 5 | 22 |
| 20261005 | 120–180 | 5 | 12 | 11 | 10 | 2 / 3 | 53 |
| 20261005 | 180–240 | 6 | 11 | 8 | 7 | 3 / 6 | 50 |
| 20261005 | 240–300 | 6 | 9 | 6 | 4 | 3 / 8 | 35 |
| 20261005 | 300–360 | 6 | 13 | 7 | 5 | 4 / 7 | 49 |
| 20261005 | 360–420 | 6 | 11 | 8 | 5 | 3 / 6 | 46 |
| 20261005 | 420–480 | 6 | 10 | 8 | 7 | 2 / 6 | 52 |
| 20261005 | 480–540 | 6 | 8 | 7 | 5 | 2 / 2 | 47 |
| 20261005 | 540–600 | 6 | 15 | 10 | 8 | 3 / 6 | 64 |
| 20261006 | 0–60 | 2 | 1 | 1 | 1 | — / 0 | 2 |
| 20261006 | 60–120 | 6 | 8 | 5 | 4 | 4 / 6 | 40 |
| 20261006 | 120–180 | 5 | 13 | 10 | 8 | 2 / 5 | 47 |
| 20261006 | 180–240 | 6 | 16 | 11 | 9 | 2 / 8 | 70 |
| 20261006 | 240–300 | 6 | 12 | 10 | 8 | 4 / 5 | 61 |
| 20261006 | 300–360 | 6 | 12 | 7 | 5 | 3 / 5 | 48 |
| 20261006 | 360–420 | 6 | 11 | 9 | 8 | 3 / 7 | 52 |
| 20261006 | 420–480 | 6 | 14 | 9 | 7 | 4 / 8 | 57 |
| 20261006 | 480–540 | 6 | 15 | 12 | 10 | 2 / 6 | 73 |
| 20261006 | 540–600 | 5 | 11 | 8 | 7 | 4 / 6 | 36 |
| 20261007 | 0–60 | 2 | 2 | 2 | 2 | — / 0 | 6 |
| 20261007 | 60–120 | 6 | 6 | 5 | 4 | 2 / 3 | 35 |
| 20261007 | 120–180 | 5 | 11 | 9 | 8 | 2 / 5 | 49 |
| 20261007 | 180–240 | 6 | 11 | 7 | 6 | 2 / 5 | 54 |
| 20261007 | 240–300 | 6 | 15 | 9 | 7 | 4 / 7 | 56 |
| 20261007 | 300–360 | 6 | 13 | 11 | 9 | 2 / 3 | 69 |
| 20261007 | 360–420 | 6 | 12 | 9 | 7 | 2 / 6 | 56 |
| 20261007 | 420–480 | 6 | 14 | 7 | 5 | 2 / 8 | 47 |
| 20261007 | 480–540 | 6 | 10 | 6 | 4 | 3 / 6 | 43 |
| 20261007 | 540–600 | 5 | 8 | 6 | 4 | 2 / 12 | 29 |

The first 60 s are sparse. Thereafter local conflicts recur across all seeds; no late window loses them. Component counts still remain well below global option counts because most options stay in their own singleton neighborhood.

## Adjacent-slot persistence

| Seed | One-to-one contested-region continuations | Ambiguous split/merge correspondences | New contested regions | Prior contested regions resolving to non-contested options | No overlapping X next slot | Longest contested region | Longest exact-X singleton run |
|---|---:|---:|---:|---:|---:|---|---|
| 20261005 | 28 | 29 | 28 | 19 | 5 | 4 slots / 33 s | 6 slots / 50.067 s |
| 20261006 | 44 | 18 | 24 | 24 | 3 | 7 slots / 63 s | 4 slots / 30.5 s |
| 20261007 | 36 | 21 | 28 | 17 | 12 | 5 slots / 41 s | 3 slots / 22 s |

Contested-region correspondence uses positive cell overlap between adjacent component union masks and continues only for a mutual one-to-one component match. It creates no identity through splits or merges. Exact option-mask recurrence inside contested neighborhoods was 0 across all adjacent transitions. On continued regions, a prior candidate track remained while new candidate tracks joined in 18, 29, and 22 component transitions (33, 60, and 43 incoming track IDs respectively). This track-ID count is supplementary to the mask-based spatial correspondence. The absence of exact mask repeats does not mean the local region stopped overlapping in space.

## One-per-component pressure

| Seed | Raw B/C maturation events (upstream) | X-overlap components summed over slots | First slot strictly above 256 | Cumulative at crossing | Actual production Plate births |
|---|---:|---:|---:|---:|---:|
| 20261005 | 662 | 422 | 418.017 s | 259 | 37 |
| 20261006 | 717 | 486 | 349.017 s | 261 | 23 |
| 20261007 | 710 | 444 | 359.017 s | 269 | 33 |

The per-seed totals describe three separate histories; they are not pooled into one world count. The 256 reference is diagnostic only. No candidate is committed, and the actual production birth counts are not targets.

## Objective slot cases and atlas

Selections are deterministic from the requested objective and stable seed/time/anchor tie-breaks. Every selected X appears in the atlas with equal outline status; hue identifies only the exact-overlap component.

| Objective | Seed / anchor | Time | Global X | Components | Selected detail |
|---|---|---:|---:|---:|---|
| Maximum singleton components | 20261005 / 137 | 137.017 s | 15 | 15 | All 15 options are singleton components. |
| Largest contested component | 20261007 / 589 | 590.100 s | 16 | 5 | Largest component has 12 X options and 1,191 union cells. |
| Many options, small local conflicts | 20261007 / 138 | 138.017 s | 20 | 13 | 10 singleton components; largest component has 5 options. |
| `{B,C}` option overlapping another distinct X | none | — | — | — | No registered slot meets this category. |
| Same frozen F component, disjoint B/C X | 20261005 / 84 | 84.017 s | 5 | 2 | B `X002-1b1a6ea184ad` and C `X005-093dff6f8820` share F component 5 but share no X cells. |
| Longest unambiguous contested region | 20261006 / 160 | 160.017 s | 14 | 10 | Region began at 97.017 s; 7 slots over 63 s; 4 X at selected endpoint. |
| Longest exact-X singleton run | 20261005 / 528 | 528.083 s | 14 | 12 | Exact mask persisted as singleton for 6 slots from 478.017 s. |

[Objective conflict atlas (SVG)](visual/conflict-component-atlas.svg)

The atlas is a neutral 96×96 structural view of exact X cell geometry. It is not a native world frame and adds no material, ant motion, or winner emphasis. Six objective slots have X outlines; the unavailable `{B,C}`-overlap category is labeled `none`. A PNG raster preview could not be produced in this sandbox: Chrome launch returned `EPERM`, and the installed FFmpeg has no SVG decoder. The SVG itself is deterministic and hash-verified.

## Interpretation

**Measurement:** Most X options are in singleton components; the all-slot contested component median is two options, q90 six, and the largest observed neighborhood has 12. Positive X-overlap edges are only 634 of 10,956 same-slot option pairs. Yet 138 slots have some local conflict, and overlap-defined one-per-component output reaches 422–486 per seed.

**Research interpretation:** Most global ambiguity decomposes into local overlap neighborhoods, while a smaller but recurring local arbitration problem remains. The temporal slots do not make the total possible event stream fit the supplied material ceiling reference. Spatial conflict and total world commit capacity remain separate responsibilities.

**Authored semantics:** A connected component of X overlap is only a relation among current candidates. One-per-component is a pressure diagnostic, not a recommended commit law. The frozen F-component sensitivity is broader and does not replace exact X overlap.

**Artistic interpretation:** No material appearance or artistic winner was tested. The atlas only exposes the locked spatial masks and their graph relation.

## Smallest next question

After local X conflict is treated as local, what separate authored world-level capacity responsibility, if any, should bound independent local material events? This audit does not define it.
