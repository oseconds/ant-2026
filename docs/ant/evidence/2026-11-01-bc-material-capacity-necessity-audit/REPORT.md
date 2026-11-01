# B/C one-per-local-component capacity necessity audit

## Classification

**CAPACITY LAW NOT YET JUSTIFIED.** Every seed exceeds 256 component episodes regardless of member choice, so the current record ceiling is an implementation pressure. All three references cover fewer cells than the raw B/C ledger and saved production material, and their mean layering stays below production; mean layering is close to, and in two of nine seed/reference pairs slightly above, the raw ledger. High-count tails approach or exceed those references in some seeds. Winner choice changes total incidence and the tail, but the comparative pattern does not establish semantically excessive accumulation or an authored world-level capacity law.

## Scope and authority

- Production represented by the frozen histories: `bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Input conflict decomposition: `86f0b57bb67bc2b60794108ce5e04dc5e761d45a`; exact registered 163 slots, 1,846 option appearances, and 1,352 components.
- B/C maturation: `248da39a4d7d342022a27a5b9ec183cad9b160e2`; raw event counts are independently rechecked.
- Provenance reference: `a80a613be68ede94fce89008a076fbe582178f41`; per-cell groups are rebuilt and compared.
- Local conflict source: `e960d135afec30e7c9f35722359e15f0f2d39ce3`.
- No world simulation or replay occurred. No `src/` or `static/` behavior changed.

## Implementation fact

Each registered exact-X overlap component contributes one diagnostic episode at its actual saved slot time. Singleton components use their exact only mask. Contested components are not resolved in the bound: their minimum and maximum member sizes define incidence limits; their all-member intersection and union define guaranteed/possible spatial envelopes. Three deterministic references select only an existing member X: smallest mask, largest mask, or lexicographically lowest registered `optionId`. None is a candidate law.

A selected `{B,C}` option is one episode layer tagged with both provenances. It is not serialized as two physical layers. The current production material is read only as a separate reference. The 256 record count remains an implementation ceiling reference.

## Winner-independent event and footprint bounds

| Seed | Component episodes | Singleton | Contested | Exact singleton incidence | Contested incidence range | Total incidence bounds | First count >256 |
|---|---:|---:|---:|---:|---:|---:|
| 20261005 | 422 | 347 | 75 | 12816 | 7319–14228 | 20,135–27,044 | 418016.667 ms |
| 20261006 | 486 | 407 | 79 | 9822 | 6707–13809 | 16,529–23,631 | 349016.667 ms |
| 20261007 | 444 | 367 | 77 | 10548 | 7098–13100 | 17,646–23,648 | 359016.667 ms |

These bounds are exact sums over the registered components. Singleton incidence is fixed; contested low/high contributions are unresolved member-mask size bounds. Event count is independent of the selected X.

### Component mask-size census

| Seed | Median options / component | Contested median min-X | Contested median median-X | Contested median max-X | Median guaranteed cells | Median possible-union cells |
|---|---:|---:|---:|---:|---:|---:|
| 20261005 | 1 | 88 | 134 | 195 | 18 | 299 |
| 20261006 | 1 | 66 | 117 | 197 | 14 | 278 |
| 20261007 | 1 | 84 | 94 | 168 | 27 | 256 |
| POOLED | 1 | 81 | 115 | 191 | 19 | 277 |

## Per-slot and fixed 60 s pressure

| Seed | Window (s) | Episodes | Singletons / contested | Exact singleton incidence | Contested incidence range | Total bounds | MIN / canonical / MAX incidences |
|---|---|---:|---:|---:|---:|
| 20261005 | 0–60 | 4 | 3 / 1 | 13 | 71–98 | 84–111 | 84 / 84 / 111 |
| 20261005 | 60–120 | 22 | 19 / 3 | 351 | 292–606 | 643–957 | 643 / 822 / 957 |
| 20261005 | 120–180 | 53 | 50 / 3 | 1101 | 370–579 | 1471–1680 | 1471 / 1680 / 1680 |
| 20261005 | 180–240 | 50 | 41 / 9 | 980 | 696–1719 | 1676–2699 | 1676 / 2528 / 2699 |
| 20261005 | 240–300 | 35 | 26 / 9 | 2068 | 635–1667 | 2703–3735 | 2703 / 3397 / 3735 |
| 20261005 | 300–360 | 49 | 38 / 11 | 656 | 1208–2538 | 1864–3194 | 1864 / 2968 / 3194 |
| 20261005 | 360–420 | 46 | 35 / 11 | 1847 | 1224–2433 | 3071–4280 | 3071 / 4008 / 4280 |
| 20261005 | 420–480 | 52 | 44 / 8 | 2406 | 883–1371 | 3289–3777 | 3289 / 3382 / 3777 |
| 20261005 | 480–540 | 47 | 38 / 9 | 1581 | 1105–1475 | 2686–3056 | 2686 / 2802 / 3056 |
| 20261005 | 540–600 | 64 | 53 / 11 | 1813 | 835–1742 | 2648–3555 | 2648 / 3513 / 3555 |
| 20261006 | 0–60 | 2 | 2 / 0 | 15 | 0–0 | 15–15 | 15 / 15 / 15 |
| 20261006 | 60–120 | 40 | 34 / 6 | 485 | 405–1161 | 890–1646 | 890 / 1603 / 1646 |
| 20261006 | 120–180 | 47 | 38 / 9 | 859 | 526–1402 | 1385–2261 | 1385 / 2120 / 2261 |
| 20261006 | 180–240 | 70 | 57 / 13 | 1120 | 1160–2076 | 2280–3196 | 2280 / 3115 / 3196 |
| 20261006 | 240–300 | 61 | 53 / 8 | 1837 | 781–1414 | 2618–3251 | 2618 / 3129 / 3251 |
| 20261006 | 300–360 | 48 | 37 / 11 | 995 | 768–1790 | 1763–2785 | 1763 / 2625 / 2785 |
| 20261006 | 360–420 | 52 | 45 / 7 | 1235 | 808–1441 | 2043–2676 | 2043 / 2523 / 2676 |
| 20261006 | 420–480 | 57 | 48 / 9 | 1409 | 687–1686 | 2096–3095 | 2096 / 2926 / 3095 |
| 20261006 | 480–540 | 73 | 62 / 11 | 1231 | 967–1769 | 2198–3000 | 2198 / 2819 / 3000 |
| 20261006 | 540–600 | 36 | 31 / 5 | 636 | 605–1070 | 1241–1706 | 1241 / 1705 / 1706 |
| 20261007 | 0–60 | 6 | 6 / 0 | 228 | 0–0 | 228–228 | 228 / 228 / 228 |
| 20261007 | 60–120 | 35 | 31 / 4 | 673 | 523–787 | 1196–1460 | 1196 / 1460 / 1460 |
| 20261007 | 120–180 | 49 | 41 / 8 | 981 | 757–1372 | 1738–2353 | 1738 / 2306 / 2353 |
| 20261007 | 180–240 | 54 | 48 / 6 | 1993 | 676–1052 | 2669–3045 | 2669 / 2951 / 3045 |
| 20261007 | 240–300 | 56 | 47 / 9 | 724 | 817–1779 | 1541–2503 | 1541 / 2350 / 2503 |
| 20261007 | 300–360 | 69 | 60 / 9 | 2118 | 810–1322 | 2928–3440 | 2928 / 3402 / 3440 |
| 20261007 | 360–420 | 56 | 45 / 11 | 1138 | 935–1724 | 2073–2862 | 2073 / 2369 / 2862 |
| 20261007 | 420–480 | 47 | 34 / 13 | 922 | 1085–1945 | 2007–2867 | 2007 / 2566 / 2867 |
| 20261007 | 480–540 | 43 | 30 / 13 | 706 | 1038–2186 | 1744–2892 | 1744 / 2451 / 2892 |
| 20261007 | 540–600 | 29 | 25 / 4 | 1065 | 457–933 | 1522–1998 | 1522 / 1990 / 1998 |

## Cumulative snapshots

Each requested time uses all saved slots at or before that time. The timestamp is the exact latest included slot. Coverage columns show MIN / canonical / MAX; they are actual selected-mask ledger results, not bounds.

| Seed | Requested (s) | Latest saved time (ms) | Episodes | Singleton exact incidence | Contested incidence range | Total bounds | MIN / canonical / MAX coverage cells |
|---|---:|---:|---:|---:|---:|
| 20261005 | 60 | 53016.667 | 4 | 13 | 71–98 | 84–111 | 80 / 80 / 107 |
| 20261005 | 120 | 116016.667 | 26 | 364 | 363–704 | 727–1068 | 498 / 676 / 726 |
| 20261005 | 180 | 170016.667 | 79 | 1465 | 733–1283 | 2198–2748 | 1419 / 1503 / 1481 |
| 20261005 | 300 | 298016.667 | 164 | 4513 | 2064–4669 | 6577–9182 | 3228 / 3162 / 3405 |
| 20261005 | 450 | 448016.667 | 285 | 8717 | 4692–9912 | 13409–18629 | 4805 / 4580 / 4725 |
| 20261005 | 600 | 599250.000 | 422 | 12816 | 7319–14228 | 20135–27044 | 5768 / 5601 / 5812 |
| 20261006 | 60 | 56016.667 | 2 | 15 | 0–0 | 15–15 | 15 / 15 / 15 |
| 20261006 | 120 | 117016.667 | 42 | 500 | 405–1161 | 905–1661 | 696 / 697 / 740 |
| 20261006 | 180 | 171016.667 | 89 | 1359 | 931–2563 | 2290–3922 | 1470 / 1413 / 1682 |
| 20261006 | 300 | 299016.667 | 220 | 4316 | 2872–6053 | 7188–10369 | 3171 / 3071 / 3250 |
| 20261006 | 450 | 449016.667 | 345 | 6833 | 4877–10252 | 11710–17085 | 4369 / 4050 / 4355 |
| 20261006 | 600 | 590100.000 | 486 | 9822 | 6707–13809 | 16529–23631 | 5441 / 5060 / 5430 |
| 20261007 | 60 | 56016.667 | 6 | 228 | 0–0 | 228–228 | 209 / 209 / 209 |
| 20261007 | 120 | 117016.667 | 41 | 901 | 523–787 | 1424–1688 | 953 / 717 / 717 |
| 20261007 | 180 | 171016.667 | 90 | 1882 | 1280–2159 | 3162–4041 | 1651 / 1413 / 1446 |
| 20261007 | 300 | 299016.667 | 200 | 4599 | 2773–4990 | 7372–9589 | 3148 / 2594 / 2952 |
| 20261007 | 450 | 449016.667 | 351 | 8335 | 5019–9038 | 13354–17373 | 4670 / 4272 / 4525 |
| 20261007 | 600 | 590100.000 | 444 | 10548 | 7098–13100 | 17646–23648 | 5529 / 5030 / 5380 |

## 600 s reference realizations

| Seed | Reference | Episodes | Union cells | Layer-cell incidences | Mean layers / covered cell | Q90 | Max | Mixed-provenance cells |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | MIN-FOOTPRINT | 422 | 5768 | 20135 | 3.49 | 7 | 18 | 2831 |
| 20261005 | CANONICAL | 422 | 5601 | 25184 | 4.50 | 11 | 29 | 2240 |
| 20261005 | MAX-FOOTPRINT | 422 | 5812 | 27044 | 4.65 | 11 | 30 | 2946 |
| 20261006 | MIN-FOOTPRINT | 486 | 5441 | 16529 | 3.04 | 6 | 17 | 2445 |
| 20261006 | CANONICAL | 486 | 5060 | 22580 | 4.46 | 11 | 35 | 2246 |
| 20261006 | MAX-FOOTPRINT | 486 | 5430 | 23631 | 4.35 | 10 | 35 | 2375 |
| 20261007 | MIN-FOOTPRINT | 444 | 5529 | 17646 | 3.19 | 6 | 17 | 2490 |
| 20261007 | CANONICAL | 444 | 5030 | 22073 | 4.39 | 10 | 35 | 1861 |
| 20261007 | MAX-FOOTPRINT | 444 | 5380 | 23648 | 4.40 | 10 | 35 | 2572 |

## Raw maturation and actual production context

| Seed | Raw B/C events | Raw union cells | Raw incidences | Raw mean layers | Raw max | Actual Plate births | Actual union cells | Actual incidences | Actual max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | 662 | 6585 | 34191 | 5.19 | 26 | 37 | 7500 | 59328 | 35 |
| 20261006 | 717 | 6238 | 26474 | 4.24 | 23 | 23 | 6737 | 32804 | 23 |
| 20261007 | 710 | 6476 | 30945 | 4.78 | 25 | 33 | 7069 | 50103 | 31 |

Raw B/C maturation events and the current source→boundary production Plates have different semantics. Neither is ground truth for the one-per-component counterfactual. The current production values are read from the last saved material snapshot at 599.25 s.

## Visual diagnostics

- [Winner-agnostic component footprint envelopes](visual/component-footprint-envelopes.svg)
- [MIN / canonical / MAX, raw B/C, and production material maps](visual/reference-realizations-600s.svg)
- [Cumulative event and layer-cell incidence bounds](visual/accumulation-bounds.svg)

## Validation

- All 163 slot receipts and their source slot packet checksums match the registered packages.
- All 1,352 components were independently reconstructed from exact X-mask overlap and match the frozen partitions.
- Each selected reference uses a member mask already present in the frozen component; no synthetic plate mask is created.
- MIN and MAX incidence totals equal the independent per-component lower and upper sums exactly.
- Each reference ledger is independently reconstructed cell by cell; all three match their saved histogram, coverage, incidence, and cell counts.
- All 2,089 raw B/C event masks and timestamps match the frozen event streams; per-cell histories match the prior prototype ledger.
- Actual material maps are decoded from integrity-checked saved production anchors, not replayed.
- Observer RNG calls: 0.

Quantiles use the registered observed-value convention: sorted value at `floor((n−1)×p)`, no interpolation.

## Interpretation boundary

The class addresses semantic accumulation evidence only. Exceeding 256 events is not, by itself, evidence for an authored capacity law. This analysis does not choose local winners, impose a world-level limit, delete or turn over material, or feed shadow layers into the world.

Smallest next question: What minimal local arbitration responsibility should choose one existing X inside a contested overlap component, before any world-level capacity question is reopened?
