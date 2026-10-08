# W1 episode continuity / closure diagnostic

**Decision: H1's implemented retention mechanism is verified in all three frozen runs. H2's stale-history admission and filter carry-over are observed, but their counterfactual contribution to the giant lineage's lifetime is not identified. No rule is changed or tested.**

The dominant pending lineage stays open because some adjacent-sample active descendants always remain. Its cumulative union does not participate in linkage or closure. Local activity turns over; splits share closure liability, distinct-parent merges accumulate ancestry, and later activity keeps the same canonical episode alive after every original continuously active anchor cell has disappeared.

This is detached read-only analysis from branch HEAD `f1068204968cdbf0da4188ad9e10df51a5cce43c`. The [causal-character baseline](../2026-10-08-w1-causal-character-attribution/README.md) and [2026-10-09 chronology](../../daily/2026-10-09-w1-causal-attribution.md) were read first. The [measurement plan](DESIGN.md) precedes diagnostic replay. Original crystallization, character, closure, geometry, natural behavior, fields, material, renderer and audio remain unchanged. No second family, estimator, morphology veto, forced freeze, counterfactual replay or natural ANT run occurs.

## Verified implementation behavior

The unchanged `scripts/ant-w1-crystallization.js` builds 8-connected active components from the strict two-timescale contrast `F - S > alpha - beta`, with the original 20/90 s EMAs and three-bit supported predicate. Current components inherit parents only through identical active cell indices in the immediately preceding recorded field sample.

- A split gives all overlapping child components the same canonical episode. A disconnected child can therefore keep a shared episode open after another child disappears.
- Distinct canonical parents merge into the smallest-ID episode. Birth, ancestry, accumulated union and earliest per-cell admissions are retained. A merger does not restart the episode's clock.
- Source `mergeCount` counts components with multiple previous component labels, including rejoining siblings. It is not a distinct-parent absorption count.
- Closure occurs only when the canonical episode has no current active descendant. Persistence uses last-active minus birth; closure is observed at the following inactive sample.
- The cumulative union stores geometry. It is never consulted to create overlap edges. Reoccupation of an old union cell alone does not create continuity; another still-active overlapping component may nevertheless connect it.

The observer uses the original active mask, reconstructs its component-overlap graph and bookkeeping, and asserts exact public-API parity at every frame. It also independently computes the original EMA recurrence and checks every cell's active predicate. Completed-frame node IDs are canonicalized after all within-frame merges. Previous-frame canonical IDs are captured before those merges, so redirected objects cannot erase distinct-parent evidence.

The full unchanged `analyzeSeed` result is deep-equal to each committed causal-character seed: all frozen and discarded episodes, pending geometry, cell admissions, character coordinates/evidence, novelty, history and terminal metrics. All 1,797 frames pass. The added observer never feeds data back into W1.

## Frozen sources and hashes

Reuse the original W1 field-decision packets and local-accretion comparison copied from `13ffc9f42bc32083c87c6b1c97bc82092e03e472`, plus the committed social-graph actual-foot/trajectory archives. All three inputs have 599 field observations, ending at 599.2500000000696 s; trajectories retain 36,001 samples through 600 s. About 1 s between field samples is the observer resolution, not a claim of continuous subsecond activity.

| Seed | Field flags compressed SHA-256 | Dominant union cells |
|---|---|---:|
| 20261005 | `508f93c15eb808c71b0d7c0bccba50b9589041676cd769c40941f9d5427df518` | 6,061 |
| 20261006 | `7a051193a902ad0f7fc95d9c4aaaefeded832d20d5e19b569f69a05b1d820e67` | 5,958 |
| 20261007 | `30403c6f1a9795fd0fa1910b332e0be6be9fe24e04356087ba03da5464bedb6c` | 6,068 |

Exact source/packet/contact/trajectory hashes remain in each analysis seed's `inputProvenance`. [preservation.json](validation/preservation.json) verifies the 97 files of both historical W1 packages, 13 copied frozen inputs, nine original natural archive files, and 59 protected source/config/fixture files. The 46 production/config working-byte hashes remain exact. Additional W1 source identity is checked against the starting Git objects with explicit LF/CRLF checkout reporting; no content difference is accepted. The crystallizer's working SHA-256 remains `cee5241d663a509bf51b21533b262fde7447f249d81520375be68bd048cc94bf`.

The prior authorized saved-snapshot expansion is consumed as already packaged input. The [original provenance](../2026-10-08-w1-episodic-material-shadow/inputs/field-decisions/INPUT-PROVENANCE.md) still records all 25 four-cell summary omissions, saved snapshot files/arrays and hashes. Nothing is reconstructed, repacked, rewritten or silently replaced in this pass.

## Measurement definitions

- **Instantaneous area:** cells currently active on the selected canonical lineage, counted once across its spatial components.
- **Cumulative area:** exact union of that episode's admitted cells through the observation. It can greatly exceed current active area.
- **Ancestry:** allocated episode IDs absorbed into that canonical lineage. IDs/events are implementation records, not ants, social interactions or biological roles.
- **Overlap edge:** positive identical-cell intersection between a previous and current 8-connected component. Every edge retains actual shared indices and both time-local canonical IDs.
- **Turnover:** new, lost and surviving active cells between consecutive samples. Per-cell active spells end at the last active sample; open spells are right-censored separately.
- **Continuous anchor:** intersection of active cells across the retrospectively selected final ancestry cohort's nonempty frames from its first appearance. Zero means no original cell remained active at every recorded observation, not that the lineage lacked overlap chains.
- **Canonical first admission:** one row per final dominant-union cell, matched to the episode's earliest inherited admission time. Raw admissions before later merges can repeat the same cell; those counts are reported separately.
- **Contact age:** admission minus latest actual same-cell FOOT_CONTACT point timestamp at or before admission, inclusive within the existing 1e-9 s tolerance. Null means no prior point contact. Counts over 20/90 s reuse the existing history timescales for description; they are not a new qualification rule.
- **q-false active:** active contrast with the current all-three-bit supported predicate false. Exact binary-history EMA reconstruction verifies carry-over without introducing a second formation rule.

The final largest pending union is selected after replay, purely for retrospective reporting. The archive separately retains causal frame-local canonical IDs and the then-current largest lineage. The milestone table below follows canonical ID 0 in each run as it existed at that time. Other statistics explicitly labeled **final ancestry cohort** can include independent lineages before their later absorption. This labeling never affects state, admissions or character.

`priorSameCellPointContactCount` counts individual archived foot-position rows. It is not the number of distinct timestamps used by the cumulative qualification bit; multiple feet can share a timestamp and grid cell. Qualification comes from the frozen flag, not this diagnostic count.

## H1 — lineage continuity and local activity turnover

### Early formation and repeated chronology

No arbitrary giant-size acceptance threshold is introduced. The full 0–120 s trace shows emergence from a one-cell episode, repeated absorption, then spatial splitting:

| Canonical ID 0 | 20261005 | 20261006 | 20261007 |
|---|---:|---:|---:|
| Birth, s | 14.017 | 16.017 | 14.017 |
| First distinct-parent absorption, s | 28.017 | 27.017 | 30.017 |
| Union at 30 / 60 / 90 s, cells | 29 / 234 / 723 | 7 / 139 / 498 | 27 / 117 / 589 |
| First disconnected active descendants, s | 113.017 | 115.017 | 116.017 |
| Recorded active frames to horizon | 585 | 583 | 585 |
| Frames with disconnected descendants | 486 | 484 | 474 |
| Original anchor intersection becomes empty, s | 307.017 | 309.017 | 307.017 |
| Last original anchor cell index | 6482 | 6481 | 6576 |
| Final ancestry IDs | 937 | 884 | 941 |
| Component-label merge events | 742 | 700 | 696 |
| Same-parent sibling rejoins | 123 | 114 | 89 |
| Distinct-parent merge events | 619 | 586 | 607 |
| Distinct lineage absorptions | 936 | 883 | 940 |
| Inherited source split count | 620 | 576 | 587 |

The source merge totals equal the observed cohort component-label merge events here. Distinct-parent events may absorb several IDs at once, explaining why absorption counts exceed merge-event counts. The initial descriptive half-active-share marker fires on tiny early geometry; it is retained in raw output but is not evidence that a giant component already existed then.

### Matched times: current canonical lineage, not future union

| Seed | Sampled s | Active cells | Active components sharing ID 0 | Cumulative union cells | Ancestry IDs | Active cells with q=0 |
|---|---:|---:|---:|---:|---:|---:|
| 20261005 | 120.017 | 1,282 | 2 | 1,318 | 183 | 89 |
| 20261005 | 300.017 | 2,727 | 21 | 4,598 | 536 | 161 |
| 20261005 | 480.017 | 2,431 | 24 | 5,641 | 761 | 189 |
| 20261005 | 599.250 | 2,611 | 44 | 6,061 | 937 | 195 |
| 20261006 | 120.017 | 942 | 2 | 965 | 144 | 69 |
| 20261006 | 300.017 | 2,759 | 27 | 4,187 | 448 | 196 |
| 20261006 | 480.017 | 2,562 | 27 | 5,481 | 692 | 176 |
| 20261006 | 599.250 | 2,330 | 45 | 5,958 | 884 | 181 |
| 20261007 | 120.017 | 1,143 | 1 | 1,167 | 156 | 54 |
| 20261007 | 300.017 | 2,710 | 28 | 4,310 | 478 | 207 |
| 20261007 | 480.017 | 2,430 | 32 | 5,622 | 759 | 193 |
| 20261007 | 599.250 | 2,475 | 33 | 6,068 | 941 | 173 |

At the final observation only about 39–43% of each historical dominant union is active. Local activity does not simply occupy the cumulative union permanently. Yet a single canonical episode represents 33–45 disconnected current regions. Its closure waits for all surviving descendants to disappear on the same sampled frame.

Completed active spells on cells in the final dominant union have medians **81 / 83 / 84 s**, maxima **328 / 330 / 323 s**, and counts 10,781 / 10,573 / 10,462. Right-censored spell medians are 51.85 / 43.72 / 44.73 s, maxima 289.23 / 312.23 / 289.23 s. These cell-spell samples are dependent and include multiple returns; they are not independently sampled episode durations. The selected lineage's observed lifetime is about 583–585 s.

For prior components in the final ancestry cohort, the retained fraction is the summed outgoing same-cell edge overlap divided by that prior component's instantaneous area. Min is zero, all three quartiles are one, max is one in each seed. Numerous small components are unchanged between adjacent samples, while others vanish or turn over. This statistic alone is not a whole-lineage continuity certificate; the exact component graph and no-descendant closure checks provide that certificate.

**Supported:** changing local active regions remain joined by adjacent-sample overlap, split sharing and absorption. The canonical episode continues after all original continuously active anchors are gone. No recorded frame has zero active descendants for ID 0. This directly explains why its closure condition never fires.

**Not explained by H1 alone:** why the input produces those active masks, how much shared splitting rather than continuous large-component persistence contributes, or what a different continuity rule would do. Removing ancestor union cells would not remove existing overlap links, because union geometry is not consulted. No isolated split/merge counterfactual is run.

## H2 — inherited contact qualification and filter carry-over

### Contact age at canonical first admission

| Final dominant-union cells | 20261005 | 20261006 | 20261007 |
|---|---:|---:|---:|
| Canonical first admissions | 6,061 | 5,958 | 6,068 |
| Raw cohort admission events / repeated-cell events | 6,639 / 578 | 6,515 / 557 | 6,611 / 543 |
| Contact age min / Q1 / median, s | .00020 / 2.123 / 14.123 | .00504 / 3.463 / 16.163 | .00394 / 1.942 / 12.792 |
| Contact age Q3 / max, s | 33.456 / 513.362 | 35.192 / 507.736 | 31.736 / 436.676 |
| Latest contact older than 20 s | 2,400 / 39.60% | 2,544 / 42.70% | 2,286 / 37.67% |
| Latest contact older than 90 s | 402 / 6.63% | 434 / 7.28% | 387 / 6.38% |
| q=0 at canonical first admission | 0 | 0 | 0 |
| No prior same-cell point contact | 0 | 0 | 0 |

All measured canonical first admissions have current chemical/mechanical qualification and cumulative repeated-contact qualification. The latest same-cell point foot can nevertheless precede admission by hundreds of seconds. This establishes separation between local point-contact recency and current history-derived qualification. It does not establish that chemical or mechanical support is itself hundreds of seconds old.

Separately, q-false active cells account for **7.84% / 7.75% / 7.78%** of final ancestry cohort active cell-samples. Global fractions are 8.06% / 7.99% / 7.98%. Exact filter witnesses show positive `F - S - (alpha - beta)` while q is zero. This is real EMA carry-over, not current supported admission. The admission and carry-over statistics are distinct populations; they do not reconstruct a per-foot contribution chain.

At the final canonical lineage observation, current q-qualified cells whose latest same-cell point foot is older than 20 s number 1,532 / 1,465 / 1,535. Its active cells also present in trailing-20-s actual traffic number 934 / 708 / 805, out of 2,611 / 2,330 / 2,475. Point traffic, q qualification and active contrast are visibly different spatial observations.

**Supported:** the contact predicate retains past distinct timestamps with no recency cutoff; stale-contact admissions occur frequently, and current activity can outlast current q through the original filters. H2 describes an observed separation and a plausible route for amplification of H1's overlap chain.

**Not identified:** how much cumulative contact memory contributes to the final lineage's lifetime or area, which exact old foot caused chemical/mechanical support, or whether a recency rule would close it. The packet preserves threshold flags at all observations, but continuous field values only at the three original milestones. Surface support has spatial footprints unlike the rounded point-foot cell map. No field-contribution decomposition, bit-removal experiment, fresh-contact qualifier or behavior rerun is performed.

## Research interpretation, artistic interpretation and next candidate

The research finding is specific to this unchanged implementation and these three frozen runs: local contrast activity has shorter cell lifetimes than its globally shared canonical lineage. An ancestry/closure unit can persist across changing and disconnected local regions while its union becomes dense. Stale local contact qualification and contrast residue coexist with that retention; their individual causal effect remains unquantified.

Artistically, current active geometry remains spatially legible while its accumulated pending union becomes a dense palimpsest-like mass. These are observational descriptions, not biological ant construction or an acceptance vocabulary. The prior W1 finding remains negative: 328 tiny frozen episodes, 228 one-cell closures, no substantial frozen cycles, and unfinished giant material history. This diagnosis does not convert pending history into frozen material.

**One proposed next independent shadow candidate:** change only split inheritance. Let the parent episode continue on the child with the largest exact overlap with the previous component, breaking ties by deterministic component order; give the other children independent episode/closure identities. Keep ancestry as provenance, not shared closure liability. Activation, q, EMAs, persistence and subsequent merge rules stay fixed. Do not copy the parent's whole accumulated union into every new child or force it to freeze at the split. This isolates the current “any split descendant keeps one parent open” link without adding a morphology template or time parameter.

This candidate is proposed, not implemented or simulated. It may still fail because later merges or a continuously connected dominant child can keep an episode open. A future pass must test that risk alongside speckle, re-inscription, frozen geometry and character attribution. No second candidate or automatic intervention is selected here.

## Artifacts and exact reproduction

- [summary.json](results/summary.json): per-seed diagnostics, canonical first-admission tables, raw-vs-deduplicated counts and source/output hashes.
- [analysis.json.gz](results/analysis.json.gz): exact observed component cells/overlap edges at every frame, frame-local scalar lineage snapshots, admissions/events, final geometry and checkpoint masks.
- [frames.csv](results/frames.csv), [events.csv](results/events.csv), [admissions.csv](results/admissions.csv), [milestones.csv](results/milestones.csv): inspectable diagnostic measurements. The milestone CSV's generic active count is global; canonical-ID-0 values above are taken from the matching frame's nodes/open scalar snapshot.
- [Dominant lineage timeline](plots/area-and-dominant-lineage-timeline.png): all-lineage area in the first column, then selected canonical lineage's disconnected active components, cumulative area and ancestry, with shared scales.
- [20 s event bins](plots/lineage-events-20s.png) and [early timeline](plots/early-lineage-timeline.png): full-horizon chronology separates sibling rejoins, distinct-parent joins and absorption records. These plots aggregate all events, not just ID 0.
- [Seed 05 fixed-scale masks](plots/checkpoint-masks-seed20261005.png), [seed 06](plots/checkpoint-masks-seed20261006.png), [seed 07](plots/checkpoint-masks-seed20261007.png): active, cumulative pending union, recent point traffic, current q and stale-contact q at four times. All masks are global, not only the selected root.
- [Early selected-lineage overlap witnesses](plots/early-lineage-overlap-witnesses.png): first split and component-label merge of the final selected canonical ID before 120 s. Exact occupied cells are shown; connector drawing samples at most 64 deterministic shared indices per edge. The complete edge cell lists remain in the archive. These connectors represent cell identity, not paths across the arena.
- [Admission contact ages](plots/admission-contact-age.png): all raw admission events, including repeats before later merges. This is a different population from the canonical first-admission table above.
- [plot-manifest.json](plots/plot-manifest.json): exact selections, scales and hashes; [event-chronology.csv](plots/event-chronology.csv) includes all event classes.

Per-frame archived open lineages use scalar summaries to avoid repeating complete unions/admission arrays. Full internal state is used for original-API assertions; exact final geometry, actual component cells, overlap cell indices and admissions remain available. This is output serialization compaction, not a change to recurrence or geometry.

```powershell
node scripts/ant-w1-continuity.js
node scripts/ant-w1-continuity.js test-results/w1-continuity-reproduction/results
uv run --with matplotlib==3.11.2 --with numpy==2.3.5 python scripts/ant-w1-continuity-plots.py
uv run --with matplotlib==3.11.2 --with numpy==2.3.5 python scripts/ant-w1-continuity-plots.py --input test-results/w1-continuity-reproduction/results/analysis.json.gz --output test-results/w1-continuity-reproduction/plots
node scripts/ant-w1-continuity-verify.js
node --experimental-test-isolation=none --test tests/ant-material-morphology-metrics.test.js tests/ant-w1-inputs.test.js tests/ant-w1-crystallization.test.js tests/ant-w1-character.test.js tests/ant-w1-analysis.test.js tests/ant-w1-continuity.test.js
npm test
npm run build
git diff f1068204968cdbf0da4188ad9e10df51a5cce43c -- src static package.json package-lock.json AGENTS.md scripts/ant-w1-crystallization.js scripts/ant-w1-character.js scripts/ant-w1-analysis.js scripts/ant-w1-inputs.js docs/ant/evidence/2026-10-08-w1-episodic-material-shadow docs/ant/evidence/2026-10-08-w1-causal-character-attribution
```

Recorded environment: Node 22.23.2; pinned Matplotlib 3.11.2 / NumPy 2.3.5. Analysis and paired plots reproduce exactly in separate processes: **24 output files byte-identical**. [reproduction.json](validation/reproduction.json) records each comparison. No RNG is consumed; every foot query is restricted to its observation/admission timestamp, every grid index is validated, every numerical analysis value is finite, and retrospective labeling is applied only after causal replay.

The exact-byte rerun uses the same working checkout and pinned plotting environment. Source-provenance hashes record working bytes; a different LF/CRLF checkout can change provenance-only output bytes even when canonical code and numerical results are unchanged. Use a separate output directory to inspect such a reproduction, and retain the original committed ledgers. Cross-platform plot-byte identity is not claimed.

**52/52 focused tests, 344/344 full tests and build pass.** Nine new fixtures cover source-equivalent merge/split/closure, disconnected sharing, redirected IDs, stale/future/null foot attribution, input validation, q-false carry-over, deduplicated canonical admissions, event classes, output compaction and deterministic/no-RNG replay. The build first hit sandbox `spawn EPERM`; the preserved failure log and successful permitted rerun distinguish environment failure from source failure. The preservation checker initially assumed all working files used Git's canonical CRLF checkout; the preserved assumption-failure log records its correction to explicit line-ending reporting plus canonical object identity, retaining exact original production byte hashes.

[checksums.json](checksums.json) inventories package SHA-256 hashes. [staged-byte-verification.json](validation/staged-byte-verification.json) checks final packaged working bytes against actual Git index objects; these ledgers exclude their own circular entries. Tooling commit: `3523853af9eb52855bec86e5bda7e4d1b3ea8bff`. Generated evidence and chronology follow in a separate commit; push this existing branch and verify its remote HEAD. No merge or PR.

Limitations: three seed runs, a 600 s frozen horizon, roughly 1 Hz field observations, unseen subsecond breaks, thresholded field histories, dependency among cells/frames/ancestors, retrospective selection of the largest pending lineage, and no counterfactual causal attribution. No natural-run extension, production adoption, audio/feedback or second formation family is tested. Stop after this diagnosis.
