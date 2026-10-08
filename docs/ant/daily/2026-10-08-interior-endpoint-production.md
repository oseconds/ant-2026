# 2026-10-08 — Interior endpoint production candidate

Started the single production-candidate pass on `ant-interior-endpoint-production-candidate` from the requested current-main merge commit `30fe4bd8980ffd6dd13aa30a7a9f2a2676faf018`. Read the ANT guide, current chronology and both movement/material and shadow-selector evidence packages; invoked the installed `caveman` skill.

The production selector now unions paths to its existing qualifying boundary endpoints with paths to eligible source-connected interior skeleton endpoints. It keeps the same source, weighted Dijkstra, deterministic parent/path semantics, farthest-boundary principal path and `0.30` floor. It adds no random choice. Movement, sensing, contacts, thresholds, timing gates, width/material mappings, descriptor history, stratigraphy, pickups and audio stayed frozen.

## Measured result

Replayed seeds 20261005/06/07 for 600 s. All 36,001 paired plain/diagnostic ticks match. Candidate behavior hashes for agents, RNG, chemical field, SurfaceField, chemical memory, contact counts, contacts and lifecycle match frozen main; population, spawn, retire and contact checkpoints match. Complete trajectories and ordered contact streams match the committed natural archive. Birth differences are the intended intervention.

Actual births rise from 32/28/31 to 40/44/41. Median retained centerline size rises from 519.5/527.5/528 to 763/790.5/805, and median endpoint proxies from 10/12.5/13 to 40/39.5/42. Median principal geodesic length and tortuosity remain close to baseline. Final Plate-union area increases in every seed, from 0.681/0.677/0.716 to 0.718/0.729/0.740.

The novelty signal moves the other way: median overlap with earlier Plates rises from 0.948/0.904/0.912 to 0.976/0.968/0.969, while median newly occupied area per birth falls from 0.0113/0.0154/0.0172 to 0.0064/0.0081/0.0092. The extra branches persist in real births, but contribute increasingly overlapping material. Candidate coverage of chemical-memory/support cells is higher at 300 s, then approaches saturation in both conditions by 600 s. Stratigraphy also becomes deeper and buries more Plates.

At equal 12-Plate counts, the candidate compiles 4,082–4,723 solver nodes and 4,656–5,600 links, against 3,145–3,452 nodes and 3,214–3,804 links for main. Arrays remain below 315 kB at this early count; finite-value, pickup-index and connected-layer checks pass. Both full Google Chrome dev and production-preview smoke tests pass. They do not validate a mature 20–30-Plate candidate audio workload.

The natural Chrome renderer capture at 120/300/600 s uses Plate outlines, centerlines and pickups. Its final overlay is visibly dense. The Chrome-only visual run produced 39 Plates, versus 40 in the matched Node replay; it is retained as visual evidence only, not used for numerical parity.

## Decision

**Reject this selector for production adoption in this pass; retain the branch and evidence.** The branch structures are clearly richer, and final footprint is higher across seeds, so the morphology effect does not disappear. But the user-defined target was sustained spatial novelty, and the real births become more dominated by earlier masks while the final union gain narrows by 600 s. The dense overlays and greater stratigraphy support an overgrowth/redundant-accumulation interpretation. This judgment uses no invented numeric threshold; it follows the requested distinction between branch counts, novel area and cumulative material history.

No follow-on width, material, movement, source-rule, length-floor or audio pass was started. Historical shadow evidence was left untouched; the associated test now expects production and shadow selection to agree on the new retained endpoint. Exact measures, fixed-scale plots, Chrome captures, source/artifact hashes and validation logs are in the [evidence package](../evidence/2026-10-08-interior-endpoint-production/README.md).
