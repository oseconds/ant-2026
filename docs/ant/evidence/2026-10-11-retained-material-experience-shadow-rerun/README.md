# Retained material exposure shadow — intervening replay

This package is preserved as the second replay record. The [authoritative final replay](../2026-10-11-retained-material-experience-shadow-final/README.md) applies the public stratigraphy lookup's out-of-domain behavior; the recorded natural-run metrics match, since sampled ants were in-domain.

**Decision: SUPPORTED FOR NEXT CAUSAL A/B.** This read-only pass found that live ants repeatedly occupy cells with an exposed retained Plate in all three current-main natural runs. This is evidence of a local environmental opportunity for a separately scoped causal test; it is not evidence that ants sense or respond to the material.

## Baseline and method

- Baseline: `origin/main` commit `27d2deab8fe0495c740023793820efd3dd8994a4`; pass branch: `ant-retained-material-experience-shadow-current-main`.
- Conditions: fresh default `AntController`, the same counted LCG (`1664525`, `1013904223`) and seeds used by `scripts/ant-morphology-replay.js`, no audio bridge, 60 Hz fixed ticks, 600 simulated seconds per seed. The run did not use archived trajectories.
- At each tick boundary, immediately before `AntController.tick`, the observer reads live ant positions and one public `MaterialStratigraphy.getSnapshot()`. In-domain positions map to the nearest grid cell used by the stratigraphy API; out-of-domain positions resolve to no material. The observer records whether a top Plate exists, its ID, and the cell's layer count.
- A sample describes the upcoming tick interval. Foot contacts, Plate births, nodule births, and topology changes during that tick become visible at the next sample. An ant's entry time is its first pre-tick observation; a sampled top Plate counts as pre-entry material when its public birth time is at or before that entry time.
- No buried Plate is treated as directly sensed. Plate age, depth, and material quality are not inferred. “Exposure” means ant center-position cell occupancy; it does not establish leg contact, perception, or behavioral effect.

## Natural-run results

| Seed | Active / exposed ants | Active ant-time on Plate | Exposure episodes (median / p90) | Ants with repeated episodes | Repeated top-Plate ants / bouts | Distinct top Plates | Pre-entry ants / exposure time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 765 / 676 | 57.01% | 2,497 (0.92 / 7.87 s) | 525 | 640 / 7,840 | 32 | 663 / 5,034.40 s |
| 20261006 | 705 / 523 | 48.13% | 1,891 (1.17 / 8.43 s) | 384 | 500 / 6,960 | 28 | 505 / 4,091.13 s |
| 20261007 | 743 / 609 | 57.94% | 2,195 (1.02 / 8.90 s) | 449 | 580 / 8,373 | 31 | 597 / 5,121.72 s |

Across 2,213 ant lifetimes, 1,808 ants (81.7%) had at least one exposed-Plate sample. Their active time totaled 33,132.72 ant-seconds, of which 18,011.38 seconds (54.36%) were spent over a cell with any exposed Plate. The observer recorded 6,583 exposure episodes: median 1.02 s, p90 8.50 s, p95 11.18 s, maximum 34.85 s; 62 episodes were still open at the 600 s horizon. There were 1,358 ants with multiple exposure episodes and 1,720 with a repeated top-Plate identity encounter (23,173 repeat bouts).

The exposed layer-count distribution spans 1–29 layers (weighted median 4):

| Layer count | Exposed ant-time | Share |
| --- | ---: | ---: |
| 1 | 3,074.05 s | 17.07% |
| 2 | 2,382.67 s | 13.23% |
| 3–5 | 5,496.07 s | 30.51% |
| 6–10 | 4,862.12 s | 26.99% |
| 11+ | 2,196.48 s | 12.19% |

For 1,765 ants, at least one exposed top Plate had already been born by the ant's entry time. Those pre-entry samples totaled 14,247.25 ant-seconds, or 79.10% of all exposed ant-time. This provenance flag describes the top Plate's birth relative to entry; it is not a new material state.

Mean fraction of the current nonempty population over a Plate cell, averaged from one-second observations within each 100-second block:

| Run time | 20261005 | 20261006 | 20261007 |
| --- | ---: | ---: | ---: |
| 0–99 s | 0.0% | 0.0% | 0.0% |
| 100–199 s | 15.1% | 0.0% | 9.3% |
| 200–299 s | 51.7% | 39.5% | 60.9% |
| 300–399 s | 78.6% | 64.3% | 75.3% |
| 400–499 s | 87.5% | 76.9% | 85.1% |
| 500–599 s | 88.7% | 88.9% | 91.6% |

## Observer validity

For each seed the OFF and ON runs matched on all 14 per-tick SHA-256 state chains for 36,001 rows (initial boundary plus 36,000 ticks): agent trajectories/lifecycle, RNG state and call count, pheromone, `SurfaceField`, gait/body pose, gaster deposition, colony activation, local occupancy, foot-contact events, material birth/error events, `TrailPlateBirth`, and full `MaterialStratigraphy` state. No field mismatch occurred. The ON run also checked the pre-tick production-state hash after each observer call; all 36,000 checks matched. OFF/ON spawn, retirement, RNG, contact, and birth totals are recorded in each seed summary.

The observer itself reads only `getSnapshot()` public fields. Full internal state appears only in the OFF/ON parity harness as a comparison target; it is not read as a material feature or exposed to behavior, formation, stratigraphy, renderer, or audio callbacks.

## Decision and boundary

The three seed ranges, hundreds of exposed ants per run, repeat encounters, broad layer-count distribution, and substantial pre-entry-material duration support **SUPPORTED FOR NEXT CAUSAL A/B**. Exposure grows through the run in all seeds, so it is not confined to a single initial Plate event.

A suitable next-pass candidate is one weak, bounded local **exposed layer count → desiredSpeed** condition, compared with an unmodified control. This report does not choose its sign or gain and does not implement it. It does not authorize steering, attraction/avoidance, organism after-effects, social coupling, audio feedback, or changes to `TrailPlateBirth`, movement, Plate geometry, stratigraphy, or sonic semantics.

Limitations: three deterministic seeds; one current baseline and 600 s horizon; cell-center occupancy is a spatial opportunity proxy, not foot-contact coverage or sensory evidence; no counterfactual response was tested. Results support test opportunity, not benefit or biological interpretation.

## Reproduction and files

From the pass branch, with the baseline commit available locally:

```powershell
node scripts/ant-material-experience-shadow.js --baseline=27d2deab8fe0495c740023793820efd3dd8994a4 --seeds=20261005,20261006,20261007 --seconds=600 --output=test-results/ant-material-experience-shadow-reproduction
```

The runner verifies that the pinned baseline is an ancestor and that `src/` and `package.json` match it. It refuses to overwrite a nonempty output folder, so use a fresh folder for each replay. `manifest.json` records the executed command, timing, conditions, output names, observer hash, and exact baseline; its recorded output path was empty when the run began. The command above uses a new folder so it can be replayed after this package is committed. `source-hashes.json` contains hashes read from the baseline commit. `seed-*-summary.json` holds per-seed OFF/ON provenance, parity chains, exposure and layer summaries; `seed-*-ants.json` records entry/retirement times, per-ant exposure, repeated IDs and episodes; `episode-durations.csv` and `population-exposure-by-second.csv` retain the episode and population series. `aggregate-summary.json` contains pooled statistics.

The earlier exact-baseline run package at [`2026-10-11-retained-material-experience-shadow/`](../2026-10-11-retained-material-experience-shadow/) is preserved. This intervening replay used a pinned-baseline guard; the final package above is authoritative and includes the corrected out-of-domain lookup rule.
