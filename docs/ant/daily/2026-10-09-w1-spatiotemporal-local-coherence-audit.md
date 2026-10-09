# 2026-10-09 — W1 spatiotemporal local-coherence audit

## Question and boundary

The preceding cell-local supported-formation shadow produced 30,828 local events; 95.8% were single-cell. This pass asked whether equal-frame grouping had fragmented activity that truly co-occurred in neighboring cells, while testing the opposing risk that repeated local overlaps chain into another giant component.

The analysis used only existing eligible terminated `q === 1 && active === 1` spells and their recorded 20 s qualification. Distinct 8-neighbor cells gained an edge only when both masks were supported on at least one identical archived observation. End times could differ; same-cell reactivation, gap tolerance, weighted edges, filters, and forced closures did not connect spells. Components describe retrospective activity history only.

The three frozen seeds and 599 observations through 599.25 s were reused. At each 120 / 300 / 480 / 599.25 s cutoff, only eligible spells already observed to terminate entered the graph. Open spells stayed right-censored. Future terminations were not projected backward; no natural ANT rerun occurred.

## Observation

Original W1, max-overlap, and per-cell history geometry/character remain deep-equal. The prior 30,828 events and 32,252 eligible spell records reconstruct exactly; all 1,797 matched q/EMA/active frames preserve parity. ID 0 remains alive at every cutoff in every seed.

At 120 s, 337 terminated eligible spells form 213 groups, and the largest component contains 4.9–8.9% of spells. By 300 s, 9,242 spells form 580 groups and the largest share rises to 50.0–83.5%. By 480 s, each largest component contains 94.7–95.4%. At 599.25 s, 692 groups remain: 463 are single-cell and 221 contain multiple termination observations. The largest component in each seed spans 516–525 termination observations and 93.99–96.79% of spells. The prior same-frame event grouping was substantially fragmented, but its rewiring creates three cross-time giants.

There are 106,573 exact concurrent-support edges at the final prefix. Only 0.45–0.52% per seed use a single shared frame; median observed overlap is 53–55 frames. The 98.34–98.57% of baseline events lying in groups with multiple old events shows recovered relationship, while the giant components show how a chain across time is not simultaneous co-activity.

The unique-cell union remains 17,195 cells, exactly the same as the previous same-frame union: spatial saturation is unchanged at 62.2% of the pooled world. It overlaps 98.8–99.2% of ID 0's historical union and covers 94.2–95.3% of that history.

## Decision and risk

**Mixed: A fragmentation and B giant chaining both occur.** Real same-sample neighboring support connects many previous events, yet the final graph is dominated by one giant component per seed, and its unique-cell union does not reduce dense accumulation. C is not the main description because many observed edges have repeated concurrent support and baseline events merge extensively.

This does not support a physical material contribution or a W1 material-ontology change. Among eligible endpoints, 89.1% are q-off, 6.2% active-off, and 4.7% both. Every eligible spell retains cumulative contact qualification; its latest same-cell FOOT_CONTACT is a median 39.25 s old and can be as old as 568.69 s. Old contact qualification and EMA carry-over make present physical support easy to overstate. At the final cutoff, another 6,915 supported spells remain right-censored (5,177 already have 20 s observed); they were excluded without forced termination.

No follow-up candidate is proposed from this pass. The evidence package keeps exact edges, prefix groups, censored spells, hashes, and fixed-scale cell-only plots. Eight focused tests, the full 388-test suite, build, and 16-file independent byte reproduction pass. Tooling and evidence are committed separately on the existing shadow branch; no merge or PR is part of this pass.
