# W1 cell-local supported-formation shadow — Negative

**Decision: Negative.** Local completion events occur while the max-overlap ID 0 episode stays open, but 95.4–96.0% of events are single-cell. Their cumulative unique cells cover 62.1–62.3% of the world grid and 94.9–96.5% of final ID 0's historical union. Re-inscription is 45.9–47.5% of all event-cell samples. The candidate therefore reproduces dense accumulation at almost the historical footprint scale while fragmenting most events to one cell. It does not support adopting local spell completion as material birth.

This branch-only comparison starts at `9c838039b614685a8f639958188486a447a04724`. The exact [candidate contract](DESIGN.md), source/evidence hashes, [validation logs](validation/), [preservation record](validation/preservation.json), and [checksums](checksums.json) are packaged here. The [daily chronology](../../daily/2026-10-09-w1-cell-local-supported-formation-shadow.md) records the question and stop decision. `docs/ant/world-model.md` is unchanged.

## Method and comparison

The candidate reads only the existing qualification flags, existing EMA-derived active mask, frozen cell histories, and actual contact archive. A cell's local spell is `q === 1 && active === 1` on consecutive archived observations. Spell duration is the exact observed endpoint span; no activity is interpolated between the roughly 1 Hz samples. At the first q/active-off sample, spells at least 20 s long become eligible. Cells ending on that same sample form deterministic 8-connected event geometry; prior historical union cells are never copied into the event. Episode identity changes are provenance only. Re-inscription is reported as event-cell overlap with earlier local events.

The original W1 and max-overlap split candidate were independently reanalyzed and deep-compared with their frozen geometry/character archives. Their split, merge, and closure behavior stays unchanged. Across the three seeds, `1,797/1,797` frame comparisons preserve q, EMA, and active mask; local analysis consumes no RNG and reruns no natural simulation. See the [analysis summary](results/summary.json), [per-observation timeline](results/timeline.csv), [spells](results/spells.csv.gz), [events](results/events.csv), and [event cells](results/event-cells.csv.gz).

## Result by seed

| Seed | Eligible spells | Local events | One-cell events | Largest event | Re-inscription | Unique local area | Final ID 0 union / local-to-ID 0 | ID 0 open + active / total observations | Frozen union: original / max-overlap |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 10,938 | 10,483 | 96.0% | 5 cells | 47.5% | 5,743 / 9,216 (62.3%) | 5,960 / 96.4% | 585 / 599 | 187 / 755 |
| 20261006 | 10,732 | 10,218 | 95.4% | 4 cells | 46.6% | 5,726 / 9,216 (62.1%) | 5,936 / 96.5% | 583 / 599 | 186 / 690 |
| 20261007 | 10,582 | 10,127 | 95.9% | 5 cells | 45.9% | 5,726 / 9,216 (62.1%) | 6,031 / 94.9% | 585 / 599 | 154 / 797 |

Every eligible event is smaller than 18 cells; that bin is descriptive only and was not used as a filter. Pooled, `29,515/30,828` events are one-cell and only `1,313` have multiple cells. The maximum connected event is five cells. In contrast, existing original W1 frozen episodes are 64–72% one-cell by seed; max-overlap frozen episodes are 48–50% one-cell, with maximum sizes 60–155. Original closures number 108 / 115 / 105 and have median persistence 47–49 s; max-overlap closures number 201 / 205 / 211 with median persistence 37–41 s. Eligible local spell duration has median 70–73 s. These episode and local-spell populations have different closure definitions and should not be treated as equivalent units.

ID 0 remains open through the final observation in each seed. It is active at every observation after its first appearance (583–585 of 599 total observations); local event creation begins at `47.017 / 54.017 / 60.017 s` and continues through `599.250 s`. All `30,828` events occur while ID 0 is open and has at least one current active cell. `30,195` events (97.9%) are related by supported-spell identity provenance or overlap with ID 0's historical union. This establishes local event creation during episode survival, not an independent physical material birth.

## Change over time and fixed-scale plots

The exact full timeline is in [`timeline.svg`](plots/timeline.svg) and `results/timeline.csv`; the plot marks recorded observations as dots without joining them into inferred activity. Event counts by common interval are 311 / 8,525 / 13,207 / 8,785 for `0–120`, `120–300`, `300–480`, and `480–599.25 s`. New area dominates initially; repeated event area grows with time. At the final observation, local unique area is roughly the size of the ID 0 historical union.

Each seed's milestone map uses the same full `96×96` extent and individual cell rectangles at nearest observed times to `120 / 300 / 480 / 599.25 s`. The six rows show ID 0 historical union, current active geometry, endpoint event cells (new/repeated), cumulative local union, original W1 frozen union, and max-overlap frozen union. No geometry is connected or interpolated.

- [Seed 20261005 milestone maps](plots/milestones-seed-20261005.svg)
- [Seed 20261006 milestone maps](plots/milestones-seed-20261006.svg)
- [Seed 20261007 milestone maps](plots/milestones-seed-20261007.svg)
- [Local event size ECDF vs frozen episode sizes](plots/event-size-ecdf.svg)
- [Supported-spell duration ECDF vs frozen persistence](plots/spell-duration-ecdf.svg)
- [Latest actual same-cell FOOT_CONTACT age](plots/contact-age-ecdf.svg)
- [Eligible termination causes](plots/termination-reasons.svg)

## Termination and stale-support risk

Among `32,252` eligible cell spells, `28,729` end with q-off while active remains on (89.1%), `2,004` with active-off while q remains on (6.2%), and `1,519` with both off (4.7%). No eligible spell is missing the cumulative contact qualification bit at termination. `30,248` end without the chemical flag and the same `30,248` without the mechanical flag; these fields may overlap. Thus most eligible completions happen after q fails even though the EMA-derived active mask remains on.

The latest actual same-cell point-contact age at the last supported sample has a seed median of `38.0–40.2 s`; `68.9–70.4%` of eligible spells exceed 20 s and `14.5–15.2%` exceed 90 s. Maxima are `443–569 s`. These are descriptive ages, not newly searched thresholds. The cumulative contact bit can remain qualified long after actual local contact, and EMA activity can continue after q-off. Both create a substantial risk of reading an event endpoint as present physical support or material contribution.

The single candidate failed the stated Promising criterion because connected geometry is almost always a singleton and cumulative local coverage remains dense. No second candidate or threshold adjustment follows this result; production, input archives, audio, and `world-model.md` remain untouched.

## Reproduction

```powershell
node scripts/ant-w1-supported-spell-shadow-analysis.js <results-dir>
node scripts/ant-w1-supported-spell-shadow-plots.js <results-dir> <plots-dir>
node --experimental-test-isolation=none --test tests/ant-w1-supported-spell-shadow.test.js tests/ant-w1-supported-spell-shadow-analysis.test.js tests/ant-w1-supported-spell-shadow-plots.test.js
npm test
npm run build
```

The independent second-process numerical and SVG reproduction matches all seven result files and all eight plots byte-for-byte. The focused shadow tests pass `10/10`; the full `npm test` passes `380/380` when run with child-process execution allowed, and `npm run build` succeeds with 408 modules transformed. In the default sandbox, test workers and esbuild are blocked by `spawn EPERM`; the serial test fallback also cannot spawn the nested SSR-check process (`model-contract.test.js`), so that run alone is not used as the full-suite result. Vite emitted existing dependency-annotation and >500 kB chunk warnings. See `validation/` for command outputs and reproduction hashes.
