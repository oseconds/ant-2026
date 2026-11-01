# B/C local conflict topology audit

**Question:** Within each registered exact-X overlap component, how many member masks are mutually incompatible, and how many can coexist without X overlap?

**Frozen authority:** production `main@bc045dc3caa5954df633ecbee37fbabcb8224f30`; local-conflict decomposition `86f0b57bb67bc2b60794108ce5e04dc5e761d45a`; capacity necessity audit `ebd1f34c5d2322bd5d3c3d6c8b83bad5a8fd7b6e`. Exact 163 slots, 1,846 option appearances, and 1,352 registered components were reused. No natural simulation or replay.

## Result

The component is only a connected neighborhood; transitivity does not force every pair to overlap. Exact graph and independent-set counts are in `analysis/`. Among the 231 contested components, 143 are cliques (61.9%), and 88 have `α > 1`. The maximum component size is 12. The size-class table distinguishes small one-winner geometry from larger partially compatible graphs.

**Classification:** MIXED TOPOLOGY. This is local exclusion topology only. It defines neither a selected set nor a commit law. The prior result `CAPACITY LAW NOT YET JUSTIFIED` remains unchanged.

## Exact per-seed counts

| Seed | Slots | Options | Components | Contested | Sum α | Additional compatible options vs one/component |
|---|---:|---:|---:|---:|---:|---:|
| 20261005 | 55 | 576 | 422 | 75 | 459 | 37 |
| 20261006 | 54 | 665 | 486 | 79 | 531 | 45 |
| 20261007 | 54 | 605 | 444 | 77 | 485 | 41 |

The sum of component counts is diagnostic `COMPONENTS`; the sum of `α` is the exact maximum number of pairwise X-disjoint options. Neither is a production rate target. The difference quantifies how one-per-component would compress compatible geometry.

## Per-size contested-component topology

| Size | Count | Clique fraction | α median / q90 | Universal-vertex fraction | Median edge density | α distribution |
|---|---:|---:|---:|---:|---:|---|
| 2 | 120 | 100.0% | 1 / 1 | 100.0% | 1.000 | 1:120 |
| 3 | 44 | 40.9% | 2 / 2 | 100.0% | 0.667 | 1:18, 2:26 |
| 4–5 | 43 | 11.6% | 2 / 3 | 55.8% | 0.600 | 1:5, 2:30, 3:8 |
| 6+ | 24 | 0.0% | 3 / 4 | 4.2% | 0.467 | 2:3, 3:16, 4:4, 5:1 |

All contested components are connected by construction and revalidated from X cells. Their exact clique number, independence number, all maximum-set counts and provenance profiles, maximal-set size distributions, universal vertices, articulation points and bridges are preserved in the per-slot receipts.

## OPTIONS / COMPONENTS / COMPATIBLE

The fixed-window pooled series is in `analysis/windows-60s.json`; per-seed values are included there too. `COMPATIBLE` means `sum α`, not a selected subset. The exact 163 rows are in `analysis/slot-options-components-compatible.json.gz`.

## Registered persistent-region topology

The comparison uses only existing adjacent-slot one-to-one contested-region tracks. It does not carry IDs through splits or merges. Exact unlabeled graph isomorphism compares adjacency structure while disregarding option identity.

- Registered adjacent transitions: 108.
- Isomorphic graph pairs: 33.
- Non-isomorphic graph pairs: 75.
- Clique/partial transition counts: clique -> clique: 38; clique -> partial: 20; partial -> clique: 17; partial -> partial: 33.

This supports descriptive topology change only along the pre-registered unambiguous continuations. It does not identify a persistent physical object.

## Interpretation

Size-2 conflicts are pairwise-complete, while larger connected neighborhoods include mutually disjoint member X options. A single winner per connected component would therefore discard geometrically compatible choices in larger neighborhoods. The next responsibility is pairwise/local exclusion, not one winner for each transitive component.

**Smallest next question:** Which minimal local responsibility should choose among options that overlap, while preserving pairwise-disjoint options as potentially compatible? Keep world-level capacity open.

## Boundaries

No local winner, maximum independent set, greedy packing, B/C preference, actual Plate, material feedback, capacity law, or Residence behavior was added. The previous `256` count remains an implementation/storage reference only.

See [protocol](PROTOCOL.md), [validation](VALIDATION.md), [objective graph atlas](visual/overlap-topology-atlas.svg), [persistent topology transition](visual/persistent-topology-transition.svg), and [SHA-256 manifest](SHA256SUMS.txt).

## Exact graph and provenance census

- Contested component `ω` distribution: 2:158, 3:60, 4:11, 5:2.
- Maximum independent set count per component: 1:38, 2:138, 3:29, 4:12, 5:8, 7:3, 8:1, 9:1, 15:1. Each component's exact maximal independent set size distribution is in its receipt.
- 189 contested components have at least one universal vertex; 83 have articulation vertices (134 total); 200 have bridges (295 total).
- Contested nodes: 463 B-only, 262 C-only, 0 `{B,C}`. Components with dual nodes: 0.
- Across maximum independent sets, 178 components permit an all-B-only set, 116 permit an all-C-only set, 0 permit a set containing a dual node, and 57 have at least one maximum set containing both channels. These are availability counts, not provenance preferences.
- Objective case `dual-node-with-compatible-distinct-option`: none; no replacement case was selected.

## Pooled 60 s evolution

| Window (s) | Options | Components | Contested | Clique fraction | Median α | Max α | Maximum compatible options |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0–60 | 13 | 12 | 1 | 100.0% | 1 | 1 | 12 |
| 60–120 | 127 | 97 | 13 | 46.2% | 2 | 3 | 105 |
| 120–180 | 185 | 149 | 20 | 65.0% | 1 | 3 | 157 |
| 180–240 | 231 | 174 | 28 | 71.4% | 1 | 3 | 187 |
| 240–300 | 223 | 152 | 26 | 46.2% | 2 | 4 | 174 |
| 300–360 | 236 | 166 | 31 | 51.6% | 1 | 3 | 183 |
| 360–420 | 210 | 154 | 29 | 58.6% | 1 | 3 | 169 |
| 420–480 | 223 | 156 | 30 | 73.3% | 1 | 4 | 172 |
| 480–540 | 219 | 163 | 33 | 75.8% | 1 | 3 | 173 |
| 540–600 | 179 | 129 | 20 | 55.0% | 1 | 5 | 143 |

Per-seed windows and exact slot timestamps remain in `analysis/windows-60s.json` and `analysis/slot-options-components-compatible.json.gz`.

## Long-lived topology-change case

Registered region `R0002` spans 7 observations. Its adjacent transition is 97016.667 ms `n=4, m=6, ω=4, α=1, clique=true` to 107016.667 ms `n=6, m=8, ω=3, α=2, clique=false`. The graphs are non-isomorphic. See the [matched graph view](visual/persistent-topology-transition.svg).
