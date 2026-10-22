# Long-run visual turnover: responsibility and decision

## Decision — MIXED

The ordinary renderer hides substantial changes in the exposed top partition, but exposing those changes did not make the overall composition sufficiently different in the artist's judgment. The stored history also repeatedly occupies a similar spatial envelope. Production's 256-Plate ceiling then stops new material altogether. These are three distinct responsibilities; no single renderer, spawn setting, or larger capacity is established as the solution.

This pass adopts **no production or exhibition renderer**. It adds analysis tools, fixed-snapshot diagnostic views and evidence only. The previous exhibition decision remains **E — not ready**. Audio Off/current rendering remains an operational fallback within its previously measured bounds, not a solution to the requested long-run artistic change.

## IMPLEMENTATION FACT — boundaries and source

The branch is `codex/ant-visual-turnover-survey-20261022`, based on research commit `c1332b8e686fd9f7099c8b33a8a017b6ce31cf63`. A fresh fetch confirmed `origin/main` at `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. Production ANT world code is unchanged from that main; the base already contains separately labeled exhibition audio/readout prototypes. This pass changes no `src/` or `static/` file, movement, material law, capacity, RNG or audio setting.

The [source audit](SOURCE-AUDIT.md) documents the distinct consumers of history. Immutable Plate masks are appended to ordered cell columns. Ordinary feet excite the current exposed top. Locomotion reads only tick-entry aggregate layer count, using `m(L) = 1 - 0.10 * (1 - exp(-L / 4))`. Formation reads chemical/mechanical support and prior corridor birth records; it has no prior-union novelty veto. Similar corridors may qualify again under their existing refractory/contact rules.

The default material image compresses the current top to gray with layer-count opacity `min(21, 9 + 1.25L)`, saturating at ten layers. The prior `recent` prototype gives all newest-eight exposed tops the same amber value. Neither normal projection encodes all top identities or boundaries. Conversely, immutable material accumulation has no removal path: its occupied union cannot vacate a previously occupied cell.

`docs/ant/world-model.md` remains a future contract. No `docs/ant/archive/**` material was used. Prior rejected selector experiments were checked through current evidence/daily records and local Git evidence, not revived.

## MEASURED RESULT — saved history, not another soak

All new measurements reuse the previous package's default-cap `visual/` and approved `visual-capacity-1024/` snapshots: seed `20261005`, fixed 1/60-second model steps, Audio Off. No new world simulation, formation counterfactual, live growth or audio run was performed. Two **simulated** hours of prior accelerated history are not two hours of real Chrome operation.

The 1,024 shadow allows additional real births after the original ceiling. Those layers change aggregate `L`, subsequent locomotion and potentially nodule qualification under unchanged laws. It is not neutral storage expansion. Shared public snapshots through 3,600 seconds and the immutable first 256 descriptor masks provide matched-prefix evidence; they do not establish private RNG/every-tick equality beyond the cap.

The authoritative geometry supplement is [JSON](metrics/geometry-supplement-v1/geometry-supplement.json), with a [compact summary](metrics/geometry-supplement-v1/summary.txt). [Metrics v2](metrics/v2/visual-turnover-metrics.json) supplies per-birth overlap, identity and milestone details. Input bytes and SHA-256 receipts are recorded and independently checked.

| Simulated time | Default Plates | Shadow Plates | Shadow occupied cells / 9,216 | Largest empty component, cells |
| --- | ---: | ---: | ---: | ---: |
| 15 min | 49 | 49 | 6,786 | 2,157 |
| 30 min | 110 | 110 | 6,999 | 2,039 |
| 60 min | 237 | 237 | 7,128 | 1,996 |
| 120 min | 256 | 474 | 7,163 | 1,973 |

From 15 to 120 minutes the shadow adds 425 Plates and only 377 first-covered cells. From 60 to 120 minutes it adds 237 Plates and 35 first-covered cells: the final union covers 77.72% of the grid. This is extensive layering inside an established envelope, not continuous spatial expansion. The final three Plates each overlap the prior union completely. It does not follow that every short cohort has the same shape.

### Actual partition geometry changes, not only labels

Boundary comparisons use horizontal/vertical internal grid edges, counted once. An edge is eligible only when its two endpoints are occupied in both snapshots; exterior silhouette edges are excluded. Boundary IoU is intersection divided by union of these edge sets. Adjusted Rand index (ARI) compares the two top-identity partitions on common occupied cells and is invariant to a pure renaming of Plate IDs. These metrics describe geometry at 96×96 resolution; neither is a visual-quality score.

| Within shadow | New union cells | Top boundary IoU | ARI | Empty-space IoU |
| --- | ---: | ---: | ---: | ---: |
| 15 → 30 min | 213 | 0.252 | 0.031 | 0.912 |
| 30 → 60 min | 129 | 0.261 | 0.057 | 0.942 |
| 60 → 120 min | 35 | 0.272 | 0.058 | 0.983 |

At 60→120 minutes 6,730 previously occupied cells change top identity, plus 35 become occupied: **6,765 top-map entries differ overall**, including those additions. The low boundary IoU and ARI reject the simple explanation that this is only an unchanged partition receiving new labels. Actual internal surface boundaries change substantially at the measured grid scale, while the outer material distribution and its complement change little.

At 120 minutes, default versus shadow union IoU is 0.9951, but common-support top identity agreement is only 401/7,128 cells (5.63%), boundary IoU is 0.2865 and ARI is 0.0631. A very similar occupied footprint can contain a different top partition. Before the cap the matched runs agree at the 15/30/60-minute checkpoints.

The default 60→120 interval is **not entirely static**: it still has births between 60 minutes and the cap at **63:34.783**. Its boundary IoU over that whole interval is 0.401. The prior run's exact cap checkpoint establishes static material after 63:34.783, through 120 minutes, while ants and pheromone continue.

### Cohort duration changes the answer

The supplement compares **different completed birth-time bins at the final 120-minute snapshot**, using each bin's full immutable mask union. These are not fixed Plate-count cohorts, and not exposed-only masks.

| Shadow bins | Nonempty bins | Adjacent comparisons | Union IoU median | Range |
| --- | ---: | ---: | ---: | ---: |
| 10 min | 12 | 11 | 0.887 | 0.821–0.919 |
| 20 min | 6 | 5 | 0.942 | 0.931–0.959 |

These large unions repeatedly cover similar territory. In contrast, the recent 120-second windows sampled at 15/30/60/120 minutes contain 9/7/6/7 Plates; successive window-mask IoUs are 0.415, 0.483 and 0.447. This is a counterexample to saying that all recent geometry is identical. Combining many births into a 10–20-minute union suppresses that local variation.

The earlier `cohortTransitions` field in metrics v2 follows the **same** birth bin across later checkpoints. Completed immutable bins naturally retain IoU 1. That field is a retention control, **not evidence of different-cohort similarity**; use the supplement table above for the latter claim.

“Empty space” here is the complement of the material union inside the finite 96×96 grid; components use four-neighbor connectivity. It excludes pheromone, ants, line weight, contrast and perceived display blankness. Its stable geometry is consistent with the artist's observation, but does not quantitatively measure that perception.

## Renderer observability — fixed diagnostic comparisons

Installed **Chrome 155, headless**, rendered the actual `AntRenderer` at **640×640, DPR 1**, after two animation-frame callbacks. No world stepping or AudioContext was involved. All views use the same saved 0/15/30/60/120-minute shadow snapshots and fixed viewport.

The authoritative [final-v2 visual set](visual/final-v2/README.md) contains:

- Actual [baseline](visual/final-v2/timeseries-baseline.png) and [built-in recent-eight](visual/final-v2/timeseries-recent.png) controls.
- [Actual top-identity palette](visual/final-v2/timeseries-identity.png): a fixed ID-to-color diagnostic, not material coloration.
- [Monochrome actual top boundaries](visual/final-v2/timeseries-boundaries.png): avoids assigning shape significance to arbitrary ID colors.
- [Current exposed-top tenure](visual/final-v2/timeseries-tenure.png): simulation clock minus the actual current top Plate's birth time, fixed 0–120-minute color scale.
- [Material only](visual/final-v2/timeseries-materialOnly.png): the actual baseline material renderer with ants removed and pheromone disabled.
- Same-time five-view contact sheets, for example [120 minutes](visual/final-v2/contact-120m.png).

Under append-only immutable overlap, current top birth is exactly when that Plate became exposed at that cell. This is neither contact age nor burial depth. Advancing the clock alone changes tenure color, so tenure color change is not material-change evidence. The fixed 120-minute scale also compresses differences among young surfaces; failure to read this particular map does not reject every possible tenure view.

The three diagnostic overlays use alpha 112; built-in recent retains its actual alpha 64. Contact and time-series layouts share the same rendered PNG sources. Manifest hashes and [independent integrity checks](VALIDATION.json) verify all 11 final output images and the 30 shared panel-source references. Earlier exploratory render revisions remain local and superseded; they are not the authoritative comparison.

## ARTISTIC / PERCEPTUAL JUDGMENT — limited improvement

The artist had already judged the baseline insufficient and the latest-eight preview still too similar. For the actual top-boundary and identity time series, the artist now answered:

> 살짝? 근데 분포자체가 화면 전체에 퍼져있어서 큰 인상은 비슷해 여백공간도 비슷하고

This supports a narrow finding: some local state difference is readable, but the overall distribution and blank-space impression remain similar. It does **not** establish an artistically successful exhibition renderer. The exact two images submitted for this judgment are byte-identical to their final-v2 counterparts. The artist did not select the tenure map or another final renderer; no additional human listening review occurred.

## DESIGN INTERPRETATION — what is missing

1. **Readout responsibility is real.** Gray opacity and one cohort color discard information that exists in the world. New diagnostic views reveal real internal partition turnover, but increased information density alone did not satisfy the desired impression.
2. **Macro distribution is a separate responsibility.** The material footprint and long-window cohort unions are very similar. The present source-connected repeated-inscription rules permit deepening an established world rather than guaranteeing a new composition. This is not a malfunction solely because it misses the current exhibition criterion.
3. **Capacity is an independent hard stop.** At 256 births, production stops this material process even if contacts still qualify. Increasing capacity postpones that stop and changes actual world conditions; it neither resolves the similar envelope nor proves sustainable storage/runtime.
4. **Append-only accumulation has a stronger limit than the spawn hypothesis.** On a finite grid, the persistent occupied union is monotone: it can fill blank cells, but cannot reopen them. Sustained renewal of empty-space composition cannot be guaranteed by repeatedly adding retained masks. Internal top partitions can still change indefinitely in principle; this is not proof that all future macro change is impossible.

Fixed spawn/source anchoring is a plausible contributor to the envelope. It was **not causally isolated** here. Removing path selection previously still produced one dominant dense component (99.43–99.72% in the preserved three-seed local-accretion shadow). The rejected interior-endpoint candidate increased births while prior-union overlap rose to 0.968–0.976 and new area per birth fell. Those are counterexamples to “more branches/births” and “remove boundary targets” as established fixes. Neither experiment rules out every other formation mechanism.

Persistent world history also need not mean that every historical identity remains in full live RAM, visible foreground and full-rate audio forever. However, aggregate `L` alone preserves only the current locomotion input, not ordered material provenance, repeated-corridor records, nodule source/foundation semantics or full physical coupling. Any future archival/fossil representation requires an explicit preservation contract for each consumer. No exact whole-world compaction or bounded-memory architecture was implemented or proven in this pass.

## One smallest next pass — foreground geometric change on frozen history

Before changing a world law, test **one renderer-only responsibility ablation**, not another palette sweep: reconstruct the actual top partition immediately before/after each saved immutable Plate birth; foreground only newly created internal partition edges (`B_after` minus `B_before`), while the full persistent material remains a weak fossil trace. Reuse the same history, camera and comparison times. No age animation, random selection, movement tuning or additional birth is needed.

This proposed view asks whether the existing geometric transformations can carry the foreground composition when the historical envelope no longer carries equal visual weight. It differs from displaying all current boundaries at once, which remains distributed over the same occupied area. A pure ID relabeling with identical partition geometry must produce no edge-change signal; test that null explicitly. A deterministic history-derived display window will need to be specified and held fixed before comparison, not adjusted until attractive.

The directional choice is intentional: **new-edge foreground**, not total boundary change. It omits disappearing edges. For example, on the common support at 60→120 minutes, the shadow has 2,990 added and 2,903 removed internal edges. A symmetric-difference view would answer a broader change-trace question; this proposed pass cannot falsify that alternative or physically renew blank space. Its purpose is a bounded presentation decision before spending a pass on world-law intervention.

This is an **unimplemented hypothesis**, not a selected exhibition mode. Its falsification is the same artistic question: if this single fixed-history change still leaves the large impression unchanged, do not keep tuning renderer recipes. Decide whether the work should read as deepening/turnover inside a persistent envelope, or needs an explicitly different persistence/formation objective. Reopening physical blank space would require a new world-law contract or a presentation distinction; it cannot honestly be attributed to unchanged accumulated occupancy. A source-position sweep is not the next recommended action.

## Validation, sustainability and limits

- Repository tests: **360 passed, 0 failed**; analysis fixtures include pure label renaming, changed partition geometry, disjoint occupied support, new union versus identity turnover, and four-neighbor empty components. Survey self-check passed. [Test summary](logs/tests-summary.txt) records the run; full TAP stdout was not saved.
- `npm run build`: success; existing dependency annotation/large-chunk warnings remain. [Build log](logs/build.log).
- Raw input hashes/bytes, authoritative output hashes, current renderer/stratigraphy/recipe/survey sources and panel reuse were independently verified. [Validation](VALIDATION.json), [integrity log](integrity-log.json).
- No new memory, live renderer FPS, long-soak, venue, audio stability or multi-seed runtime test was performed. New Chrome use was headless still rendering only.
- Prior two-resident audio remains **18:00.296 actual headed Chrome, 30→112 historical Plates**, not hours-long approval; Full/Lite mature realtime failures remain unchanged. This survey provides no new audio fidelity or performance claim.
- Current production capacity bounds individual storage but halts material births; removing it alone leaves growing per-Plate descriptors, ordered columns, birth records and other consumers. Two accelerated model hours do not bound their eventual cost.

Fresh independent review and its dispositions are recorded in [REVIEW.md](REVIEW.md). Reproduction and evidence selection are in [README.md](README.md).
