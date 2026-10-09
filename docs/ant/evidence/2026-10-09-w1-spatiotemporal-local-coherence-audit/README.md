# W1 spatiotemporal local-coherence audit — Mixed

**Decision: Mixed.** Exact simultaneous supported observations connect most same-frame events into a few giant retrospective components, so the earlier same-frame grouping did fragment related activity. At the same time, single-cell groups remain common and the graph's unique-cell union is identical to the previous dense local union. Time connectivity clarifies the fragmentation but does not produce a spatially selective or physically supported material account.

This read-only pass starts at verified HEAD `5a2afd2ae8ea21929fe2b0430b3b0a1462f616da` on `ant-w1-episodic-material-shadow`. It reuses the three frozen seeds through `599.2500000000696 s`; no natural run or production behavior changed. The connected groups are retrospective histories, not material episodes, Plates, or formation events. See the [analysis contract](DESIGN.md), [daily chronology](../../daily/2026-10-09-w1-spatiotemporal-local-coherence-audit.md), [full summary](results/summary.json), and [checksums](checksums.json).

## Causal-prefix results

Only eligible spells whose termination was already observed at the cutoff enter that graph. Counts below pool three independent 96×96 worlds. “Open, duration ≥20 s” spells remain right-censored; that age does not force termination.

| Nearest observed cutoff | Eligible terminated spells | Groups (single-cell) | Groups with multiple termination samples | Unique cells | Concurrent edges (one shared sample) | Right-censored (observed age ≥20 s) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 120 s · 120.017 s | 337 | 213 (152) | 61 | 335 | 145 (0) | 3,501 (2,213) |
| 300 s · 300.017 s | 9,242 | 580 (380) | 198 | 7,951 | 21,330 (94; 0.44%) | 7,704 (6,235) |
| 480 s · 480.017 s | 23,104 | 621 (431) | 186 | 15,022 | 72,790 (327; 0.45%) | 6,960 (5,357) |
| 599.25 s · 599.250 s | 32,252 | 692 (463) | 221 | 17,195 | 106,573 (514; 0.48%) | 6,915 (5,177) |

At 120 s, the largest component contains only 4.9–8.9% of eligible spells across seeds. At 300 s its share is 50.0–83.5%; by 480 s each seed has a component containing 94.7–95.4%. At the final cutoff the largest component contains 93.99%, 96.79%, and 95.70% of eligible spells, and 97.09%, 97.80%, and 96.91% of their graph's unique cells. Those three components span 516–525 distinct termination observations, from 14–16 s through 599.25 s. Their spatial footprints grew by historical chaining: this does not mean their cells were all active together.

## Fragmentation, chaining, and space

The old audit has 30,828 same-frame events, 95.74% of them single-cell. The spatiotemporal graph joins 98.34–98.57% of those baseline events into groups containing multiple baseline events. Yet 463/692 (66.9%) of final components still contain one unique cell; the component-size median is one cell. Each seed's largest group has 5,549–5,600 cells, and the pooled maximum is 5,600.

There are 106,573 edges at the final cutoff. Each edge represents exact concurrent support in neighboring cells; its median spans 53–55 archived observations per seed, and 0.45–0.52% of per-seed edges are based on only one observation. Thus the giant groups are not mainly held together by single-sample edges, although long chains of many real local overlaps accumulate across time.

The graph has 17,195 unique cells at the final cutoff, exactly matching the previous same-frame event union. That is 62.2% of the three pooled world areas and shows **no reduction in spatial saturation**. The local union overlaps 98.8–99.2% of ID 0's historical union; it covers 94.2–95.3% of each ID 0 union. ID 0 survives all four cutoffs in all three seeds. The graph therefore recovers activity-history links during episode survival but does not establish an independent material contribution.

## Right-censoring and support interpretation

At the final sample, 6,915 supported spells are still open and excluded from the termination graph; 5,177 have already reached an observed duration of 20 s. These ongoing spells have 11,068 observed concurrent-neighbor pairs with completed eligible spells across the three seeds. They remain excluded because no termination was observed. This is a count of possible future edges, not a count of events or guaranteed future links.

Of 32,252 eligible terminated spells, 28,729 (89.1%) end q-off while active remains on, 2,004 (6.2%) end active-off while q remains on, and 1,519 (4.7%) end with both off. Every eligible spell still has the cumulative contact-qualification bit. The latest actual same-cell FOOT_CONTACT at its last supported sample is a median 39.25 s old; 22,485 (69.7%) are older than 20 s, 4,791 (14.9%) older than 90 s, and the maximum age is 568.69 s. Cumulative q and 20/90 s EMA carry-over can therefore make an observed predicate persist beyond recent physical contact. This is a serious material-interpretation risk, not proof of present physical support.

## Fixed-scale plots

All cell maps use one 96×96 extent and show archived cell positions only. The representative small group is selected as the smallest non-single-cell final group, breaking ties by spell count, first termination frame, then group ID. The largest group is selected by unique-cell area, spell count, first termination frame, then group ID. Both selection rules are recorded in `results/analysis.json.gz` and `plots/plot-manifest.json`.

- [All four cutoff maps, seed 20261005](plots/milestones-seed-20261005.svg) · [representatives](plots/representatives-seed-20261005.svg)
- [All four cutoff maps, seed 20261006](plots/milestones-seed-20261006.svg) · [representatives](plots/representatives-seed-20261006.svg)
- [All four cutoff maps, seed 20261007](plots/milestones-seed-20261007.svg) · [representatives](plots/representatives-seed-20261007.svg)
- [Component growth and ID 0 survival timeline](plots/timeline.svg)
- [Component unique-cell size distributions](plots/component-sizes.svg)
- [Concurrent observations per edge](plots/concurrent-observations.svg)

## Preservation and validation

- All 30,828 prior events and 32,252 eligible spell records are preserved and reconstructed exactly.
- Original W1, max-overlap, and per-cell geometry/character are deep-equal; all 1,797 matched q/EMA/active observations preserve parity.
- Fixtures cover exact shared supported frames, non-overlap, same-cell exclusion, grid boundaries, duration endpoints, termination-prefix availability, grouping determinism, representative selection, and plot grid scale.
- The eight focused tests pass. The complete suite passes `388/388`; `npm run build` succeeds with 408 modules. The build retains pre-existing dependency-annotation and large-chunk warnings.
- A separate process reproduces all 6 numerical and 10 plot/manifest files byte-for-byte. Source, previous evidence, frozen input, and current output hashes are recorded in `results/summary.json` and `checksums.json`.
- No threshold, geometry, event, episode, or material rule was added. `docs/ant/world-model.md` and existing frozen evidence remain unchanged.

### Reproduction

```powershell
node scripts/ant-w1-spatiotemporal-coherence-audit.js
node scripts/ant-w1-spatiotemporal-coherence-plots.js
node --experimental-test-isolation=none --test tests/ant-w1-spatiotemporal-coherence-audit.test.js tests/ant-w1-spatiotemporal-coherence-plots.test.js
npm test
npm run build
```

For a second output directory, pass it to the numerical script and pass that `results` directory plus a separate `plots` destination to the plot script. The reproducibility check used a separate process and compared SHA-256 for every result and plot file.
