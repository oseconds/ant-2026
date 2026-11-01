# Validation — B/C 10 s commit-slot ambiguity audit

## Source and packet provenance

- Production authority is `bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- The matched author-review package lineage is `dfc29559860ec9e6312d2ea556041d956117bc5e`, and the prototype analysis base is `a80a613be68ede94fce89008a076fbe582178f41`.
- The frozen opportunity manifest and its referenced chunks were SHA-256 checked before analysis. All 599 anchors per seed were resolved.
- The B/C track-observation packet and event gzip were checked against their registered manifests.
- Every B/C observation `captureId` was resolved to the exact saved opportunity X mask; capture timestamp, component, node count, and X-center membership were checked.
- The prior dual-maturation validation confirms exact use of the requested opportunity, responsibility, and review lineage and a stable frozen-input hash set.

## Event and lifetime parity

The analysis reconstructed 2,089 first-maturation intervals from saved track observations and exact captures. It matched all event IDs, intervals, maturity anchors/times, starts, and chain X sets to the registered event streams:

| Seed | Boundaries | B events | C events | Mature candidates reconstructed |
|---|---:|---:|---:|---:|
| 20261005 | 599 | 354 | 308 | 662 |
| 20261006 | 599 | 395 | 322 | 717 |
| 20261007 | 599 | 386 | 324 | 710 |
| **Total** | **1,797** | **1,135** | **954** | **2,089** |

The candidate end anchor is the last row in that same registered uninterrupted X-stability interval. The first reset boundary is excluded from the prior candidate and can only mature as part of a new interval.

## Independent schedule and option arithmetic

A second streaming pass used independently written set-based Jaccard and slot logic. For all three seeds it checked:

- each candidate's maturity and valid-through interval;
- every earliest possible slot under actual saved timestamps and the `>= previous slot + 10,000 ms` condition;
- mature B/C counts and candidate age arithmetic at each slot;
- exact-mask option grouping and `{B,C}` provenance preservation;
- pairwise X Jaccard and exact/partial/disjoint counts.

All per-slot option counts, candidate ages, same-X B/C collapses, and pair relations matched the primary receipts. The machine-readable record is `analysis/validation.json`.

## Frozen-frame replay for objective views

The registered frame receipt did not contain the selected objective slots, so the views were rendered from deterministic replay of the same frozen production histories. This added no new natural observation or candidate feedback. For seeds 20261005 and 20261007, replay matched all 599 boundaries, including E/F/B/C/D, material layer/top/birth maps, production birth IDs, and the recorded RNG call count/state. At seed 20261005 anchor 42, the replay PNG SHA-256 matched a previously saved frame exactly.

The native renderer used 720×720, material on, pheromone overlay off, and debug overlays off. Each selected state rendered twice to confirm equal PNG hashes. The objective atlas was rasterized deterministically at 1280×4085 from the recorded SVG; its dimensions and PNG signature were checked.

## Scope and determinism

- The observer analysis contains no RNG calls.
- No actual `MaterialStratigraphy` state received shadow events.
- No candidate was selected, committed, or turned into a Plate.
- No production `src/` or `static/` behavior changed.
- Two full analysis generations produced the same SHA-256 digest over all 22 generated `analysis/` and `visual/` files: `d1917512d9d5ac017bf297b5a9d3c4d3ca53f175b36636ca26bff00a4858e980`. A separate atlas rerender reproduced PNG SHA-256 `c870e0cf328aba0a50944bcbdcd9cf59f798cdc2ad8b901eb38c49c7b00fbad0` at 1280×4085.
- `manifest.json` and `SHA256SUMS.txt` cover the committed evidence files and analysis tools.

Reproduce from the registered inputs in this order:

```powershell
node scripts/render-ant-bc-commit-slot-objectives.js
node scripts/ant-bc-commit-slot-ambiguity-audit.js
node scripts/render-ant-bc-commit-slot-atlas.js
node scripts/ant-bc-commit-slot-ambiguity-audit.js --finalize
```
