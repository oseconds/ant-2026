# Plate formation design gate — 2026-10-28

**Decision: Gate 4 — the next decision requires artist judgement about the spatial scope of a materialization event. No production implementation is recommended yet.** Four bounded passes are complete. The mandatory omitted-history audit was followed by extraction, topology-provenance and event-scope checks. No further experiment is running.

## Baseline and scope

- Fresh production authority: `origin/main@aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`, unchanged from the supplied baseline.
- Research parent: `fd2a42875cc93eedeb319eae14b0e8de21e429d7`, the completed current-G formation-information ledger.
- Research branch: `codex/ant-plate-formation-gate-20261028`. The report and machine evidence are committed on this branch; final commit and remote equality are reported with delivery.
- Current G, production H0, seed `20261005`, 60 Hz, 0–120 model seconds, Audio Off. Last actual qualification analysis is `119.016666667 s`; the world endpoint is 120 s. No H1, additional seed, longer horizon, renderer candidate or DSP was introduced.
- Production `src/`, `static/`, canonical `docs/ant/README.md`, previous evidence and unrelated attachments remain unchanged. The new tooling transforms a verified module in memory only.

## Sequence and findings

### 1. H-to-I omitted-history audit

**[Implementation]** The existing ledger had 120 aggregate rows but exact arrays at only five checkpoints. Those arrays could not answer duration or recurrence. One observed replay recovered the missing analysis maps and the original ordered FOOT_CONTACT stream. Its ten 7,201-tick hash chains match the sealed prior ledger; all 120 metadata rows, 75 checkpoint arrays, endpoint field/surface and first-birth receipts match. This is one new observed world compared against prior OFF/ON evidence, not a fresh OFF/ON pair. The original 600 s contact digest cannot prove the 120 s prefix; the matched tick chains and exact archived prefix totals provide the narrower checks.

**[New measurement]** First birth is `84.016666667 s`. H has 628 skeleton cells, I 122, O=H minus I 506. Of O, 59 already lie inside the actual 356-cell ribbon, so skeleton omission is not automatically absent material. The other 447 are outside it.

The 506 fixed coordinates have median **pre-birth** E tenure 23 s and H tenure 14 s. Full-window longest E/H runs have medians 55/36 s; these are different measures. Exact pre-birth foot samples have median 2; 77 cells have none. A 3×3 neighborhood has median 23 samples, but broad support and neighboring feet do not establish direct local use or independent visits.

By the last sampled analysis, 243 original O cells have appeared in I at least once. Only 122 previously uncovered cells acquire actual frozen coverage, all from Plate 2 at `106.016666667 s`. Including the 59 initially covered cells, 181/506 are covered; 325 remain uncovered at the right-censored endpoint. They are not proven permanently excluded.

O forms a 400-cell largest component under production 8-neighbor adjacency. Its cycle rank is 261, versus 44 under a diagnostic diagonal guard. Attachment pixels/groups also change. These are raster graph properties, not counts of macroscopic routes or material bodies. All adjacent-frame overlap links, including split/merge relations, are retained instead of assigning immutable branch identities.

**[New measurement / availability only]** Thirty-one O coordinates show E-present, E-absent, E-present patterns. Absent-sample spans have median 10 s, memory minimum median 0.253 and 15 exact foot samples within the bracketing gaps. This is eligibility recurrence, not established activity episodes or temporal tempering. The 180 H-return coordinates are even more sensitive to thinning and component eligibility.

**Outcome:** the purely transient-noise explanation is insufficient; declaring every omission valuable is also unsupported. Continue to the extraction operation.

### 2. Equal-shortest-route multiplicity shadow

**Question:** does committing to one equal-cost Dijkstra parent explain the dominant omission?

**[New measurement]** Three fixed treatments used exactly the same qualified input: production parent tie, reversed parent tie, and the union of all shortest predecessor routes to the same existing terminals. Source, target, supported area, mean chemical/support and principal path for all-shortest remain fixed. The production reference matches all 120 saved candidates. Inputs remain immutable; deterministic rerun and RNG tripwire pass.

| Locked actual birth | Production network / ribbon / solver nodes | All-shortest network / ribbon / solver nodes | Original O cells recovered into network |
| --- | ---: | ---: | ---: |
| First, 84.016667 s | 122 / 356 / 70 | 144 / 372 / 72 | 22 of 506 |
| Second, 106.016667 s | 181 / 544 / 104 | 225 / 581 / 110 | 44 of that timestamp's O |

The reversed tie changes 52 network cells by symmetric difference at first birth. Some geometry depends on a representational tie, but retaining every shortest route explains only 4.35% of the original 506 omissions. It is **not** the surviving formation recommendation.

**[Implementation / New measurement]** All six geometry-only single-Plate fixtures at locked actual birth times compile through the real 96-to-32 compiler. Each has one four-neighbor solver component and two valid pickup nodes in that component. Production's first Plate places 133 O coordinates in already occupied solver bins, versus 59 inside the source mask. Coarse-bin coexistence is not 96-cell material coverage or an excitation route. Additional original foot positions inside a shadow mask are geometric opportunities, not actual bridge posts or measured sound. No counterfactual birth schedule, coupled stack or audio was simulated. The reconstructed compile fixtures use fresh TrailPlateBirth instances, so their unused `provenance.footContacts=0` is an unpopulated fixture value, not a measured event count. Actual full birth receipts and contact evidence are in the frozen history packet; do not use fixture provenance as event evidence.

### 3. Terminal-path provenance

**Question:** are omissions pendant appendages, or longer connections excluded by shortest-path extraction?

**[New measurement]** Biconnected-block analysis classifies vertices lying on at least one simple root-to-existing-terminal path. It excludes terminal-free lobes joined through a single articulation, even cyclic lobes. This is an explanatory graph hull, not a proposed Plate mask.

| First-birth class | Cells | Median pre-birth E tenure | Median exact pre-birth feet | Initially in frozen mask | Newly frozen later |
| --- | ---: | ---: | ---: | ---: | ---: |
| Selected I | 122 | 23 s | 3 | 122 | 0 |
| Equal-shortest alternatives | 22 | 19 s | 3 | 21 | 1 |
| Longer terminal-path alternatives | 366 | 26 s | 3 | 38 | 100 |
| Pendant remainder | 118 | 11 s | 1 | 0 | 21 |

The production hull contains 510 cells; the guarded hull contains 488. Of the 366 longer-alternative cells, 344 remain in the guarded hull. The dominant result therefore survives this local diagonal-edge sensitivity check, although it still does not establish independent physical corridors.

The 366-cell fixed footprint has E coverage of 246 cells at 64.016667 s, 314 at 74.016667 s, 366 at birth, and 317 at the last analysis. H coverage changes from 190 to 274 to 366 to 187. This separates availability of qualified area at fixed coordinates from movement/thinning of its skeleton. It is not proof of stable branch identity. All cohort timelines and pendant components are preserved in the machine output.

**[Research-supported interpretation]** Current pruning does two different things: it often excludes younger/weaker appendages, and it also excludes sustained supported reconnections. The latter have E tenure, compaction/support and foot-count distributions overlapping I. There is no measured basis here for treating every omitted cell as weak, or every longer route as an independent materialization event.

### 4. Existing event-scope audit

**Question:** what does the existing 20 s candidate lineage guarantee about the final immutable footprint?

**[Implementation]** Candidate continuity uses the maximum of mask similarity and principal-path similarity between successive candidates. It certifies a changing corridor candidate. It is not a cell-by-cell maturation timer or a requirement that the birth mask equal the initial mask.

**[New measurement]** Plate 1 starts its lineage at `64.016666667 s`. The initial candidate has 196 cells; the final mask has 356; intersection is 168 and start-to-birth IoU is **0.4375**. At birth, 258 final-mask cells are in E, 98 are outside E through ribbon geometry. Of the 258 currently eligible cells, 161 have continuous sampled E tenure reaching the existing 20 s duration. This is 161/356 of the complete final mask. It is not a failed production requirement: production never promised that cell-level contract.

Plate 2 has 544 cells, 416 in E and 128 outside E. Of the 416, 323 reach 20 s. Its start-to-birth IoU is 0.547546. It overlaps the earlier frozen mask at 223 cells and adds 321 new cells. Both actual events reuse the unchanged aggregate continuity contract.

**Outcome:** replacing I with a larger spatial mask while claiming the same 20 s history matured together would silently change the interpretation of temporal qualification. Geometry extraction and event scope cannot be treated as independent implementation swaps under that claim.

## Ontology assessment and surviving direction

**[Implementation]** A Plate is already a finite frozen layer with immutable geometry/material, append-only insertion, exposed/buried consequences, later overlap and a finite compiled resonator. These contracts do not require geometry to be a shortest route.

**[Modeling hypothesis]** The working definition remains technically coherent: an explicit materialization event can preserve finite support and material character without identifying the Plate with a path. What is still undefined is the event's justified support and selectivity. The new measurements do not supply that missing law.

**Single primary direction:** define an **event's spatial support explicitly before choosing its geometry extractor**. Keep the finite immutable layer, stratigraphy and acoustic compiler. Treat paths as history/provenance or structural evidence rather than assuming their selected centerline must be copied into the physical mask. This is a research direction, not an implementation-ready replacement.

Two contrasting contracts are ready for artist judgement, not two adopted mechanisms:

1. **Evolving connection event.** One event certifies continuity of a flow-bearing connection while its spatial footprint changes. Current production is a narrow instance. A broader connection footprint still needs a reason to retain some supported alternatives and omit others; freezing the whole terminal hull has not been justified.
2. **Locally certified material event.** One event freezes a finite cohort of locally qualified history. This would need a temporal and spatial grouping rule, a reset/reuse meaning and selectivity independent of compulsory source/boundary contact. The existing candidate timer cannot stand in for that rule. No such law was invented or tested here.

The packet asks which kind of event belongs in ANT. More graph statistics cannot decide this artistic contract. No ranking by shape richness, component count, area or acoustic opportunity is substituted for that decision.

## Known counterexamples and reformulations

**[Existing ANT evidence, pre-G]** Local accretion already removed source, boundary, skeleton and selected routes. It froze locally qualified cells after persistence and repeated-contact evidence. Eligibility reset/rematuration existed; it was not simply continuously emitting every eligible cell. At the late sample, 64.18–65.13% of the grid was material and the largest component held 99.43–99.72% of that material. Early islands/holes did not preserve broad late separation.

Permanent union of changing eligible support is an implemented mechanism consistent with this filling. Common traffic footprint, broad support sampling and inadequate event selectivity are plausible contributors; the old pass did not isolate their causal shares. The present 120 s evidence cannot prove any alternative avoids late coalescence. Consequently neither the raw qualified mask nor the terminal hull is promoted as a solution.

**[Existing ANT evidence, pre-G]** The interior-endpoint production candidate increased branch retention, but raised repeated overlap and reduced median new area per birth. It was rejected. Adding all interior endpoints now would repeat an already challenged idea, without resolving event identity or open-world selectivity.

Spatial novelty is not a required Plate responsibility. A new layer may validly re-inscribe an occupied place and change depth/exposure without adding territory. The prior rejection constrains the claim that broader geometry alone improves material history; it does not establish that overlap or repeated deposition is intrinsically wrong.

These branch-only packages are read at immutable commits, not assumed present on current main:

- [Local accretion, `13ffc9f`](https://github.com/oseconds/ant-2026/blob/13ffc9f42bc32083c87c6b1c97bc82092e03e472/docs/ant/evidence/2026-10-08-local-accretion-shadow/README.md).
- [Interior endpoint candidate rejection, `bb97050`](https://github.com/oseconds/ant-2026/blob/bb970505eb63e9f69d2d00bc302ee72fbe19419e/docs/ant/evidence/2026-10-08-interior-endpoint-production/README.md).

**Reformulated/parked:** temporal revisit remains an availability hypothesis; eligibility flicker does not justify a gate. Mechanical margins remain weak/mixed from the prior ledger. Directional history may eventually inform material character, but it does not resolve WHEN/EVENT here. Small-shard proliferation, growing domains and merge/split resonator identities are not required by the findings and remain parked. Equal-shortest retention is rejected as the main answer, not declared universally useless.

## Open-world and audio boundaries

**[Modeling hypothesis]** Nest connection is not logically required for a material layer. Observation-window edge contact is not itself a physical phase transition. Both currently provide selectivity and corridor identity. Simply deleting them would leave the known accumulation failure unanswered. A new event contract must replace that selectivity rather than silently inheriting the observation window as a physical boundary.

**[Implementation]** Arbitrary finite masks can compile, but 96-to-32 binning and diagonal bridge insertion can merge or alter fine features. Multiple disconnected regions do not propagate merely by sharing a Plate ID. Two pickup locations must remain valid. Small-Plate proliferation consumes layer/runtime capacity. Append-only frozen IDs preserve the useful exposure, overlap and Nodule contracts; arbitrary growing/merging topology does not preserve vibration state seamlessly.

**[Existing ANT evidence]** The synthetic geometry listening result is capability evidence for non-ribbon resonators, not natural formation validity or current full-mix recognition. Mature current-G Audio On reliability remains unverified. The six successful single-layer compiles here do not test a mature coupled world, PCM, perceptual difference, Nodule evolution or realtime cost.

## Gate decision, next implementation and required judgement

**Stop at Gate 4.** No production change is justified by the current evidence; keeping production is fully compatible with this result. Gate 4 identifies the next required decision, not a demonstrated defect in the existing selector. A stronger Gate-2 conclusion that the omitted history lacks material significance is also not established: its artistic significance has not been judged. Gate 1 would overstate readiness because event selectivity and late accumulation remain unresolved. Gate 3 is unnecessary: the observations do not require mutable Plate identity or a new acoustic architecture.

These labels are not treated as mutually exclusive claims: the practical no-change outcome is compatible with Gate 2, while Gate 4 names why this investigation stops and what action is needed next.

**No production implementation pass is recommended now.** The next action is the smallest artist review of [`review.html`](review.html), the cohort table and the two actual event footprints. First describe the tracked changes freely. Then judge whether longer supported reconnections should represent another persistent environmental fact, and whether one event should certify an evolving connection or locally qualified spatial history. These are distinct from visibility, sonic salience and “more interesting shapes.”

After that judgement, one frozen-input event-definition shadow can be specified with explicit WHEN/WHERE/EVENT/GEOMETRY/CHARACTER and the old accumulation counterexample. It is not automatically authorized as production by this report. No new mechanism is selected in the canonical guide.

## Evidence status

- [Registered passes and pre-result clarifications](PLAN.md).
- [Capture, reproduction, validation and QA deviations](README.md).
- [Same-history technical map packet](review.html), with 120 selectable actual analysis timestamps.
- **[Artistic interpretation]** Pending. No human review of this new packet has been received. The parent inspected layout only; no artistic verdict, listening result or audience salience was inferred.
