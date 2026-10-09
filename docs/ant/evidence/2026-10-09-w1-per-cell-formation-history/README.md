# W1 per-cell formation-history audit

**Read-only result: cells within one historical episode have measurably different formation histories.** The dominant pending ID 0 grows mainly through direct first admission, with substantial merge transfer and repeated overlap. Its historical union retains many positions after their owned activity ends. These measurements justify questioning the equivalence of historical footprint and material geometry; they do **not** justify a particular material contribution function.

Starting HEAD: `92ba2117b10bd3f559eca9866602ab8d430a649b`, branch `ant-w1-episodic-material-shadow`. Primary condition is the unchanged maximum-overlap split candidate; original W1 is the comparison. All three frozen histories reach the recorded 599.2500000000696 s observation. This pass changes no formation, identity, closure, geometry, novelty or character rule, and consumes no behavior RNG. Natural ANT is not rerun.

## Sources and causal scope

Read [world-model](../../world-model.md), [maximum-overlap evidence](../2026-10-09-w1-max-overlap-split-shadow/README.md), [continuity diagnosis](../2026-10-09-w1-continuity-diagnostic/README.md) and [causal character evidence](../2026-10-08-w1-causal-character-attribution/README.md) before implementation. The [read-only contract](DESIGN.md) records this pass's accounting and interpretation boundaries.

The existing W1 loader supplies 599 observations on the 96×96 grid per seed, exact stored qualification predicates, actual point FOOT_CONTACT events, and the existing causal directional reconstruction. Component/identity operations come from committed continuity and max-overlap archives. No new input packet or reconstructed DAB history is created.

| Seed | Frozen flags compressed SHA-256 | Actual contact archive compressed SHA-256 |
| --- | --- | --- |
| 20261005 | `508f93c15eb808c71b0d7c0bccba50b9589041676cd769c40941f9d5427df518` | `4c0b8728a9dd62067c20734f3a4f7628e480fc7565d41dc27270d994be92e503` |
| 20261006 | `7a051193a902ad0f7fc95d9c4aaaefeded832d20d5e19b569f69a05b1d820e67` | `662fb75f6c5b7a2fc5e84a08628dbc56e0ca26921572ae564a8499e282704ad4` |
| 20261007 | `30403c6f1a9795fd0fa1910b332e0be6be9fe24e04356087ba03da5464bedb6c` | `e012b877c53dfb0634db40d97d97af853d4835602e56a4ee0cd1eab8f33689f4` |

Flags are in `../2026-10-08-w1-episodic-material-shadow/inputs/field-decisions/seed<seed>-flags.bin.gz`; contacts are in `../2026-10-07-social-graph/data/seed<seed>-on-raw-events.json.gz`. Bit 0 is chemicalMemory ≥ .30, bit 1 is support ≥ .015, and bit 2 is at least two distinct actual same-cell contact timestamps through the observation. q=1 requires all three bits. W1's existing 20/90 s EMA and active predicate remain unchanged.

The previously authorized snapshot expansion, all 25 four-cell omissions, exact saved files/arrays and prior committed snapshot hashes remain documented in the preserved [input provenance](../2026-10-08-w1-episodic-material-shadow/inputs/field-decisions/INPUT-PROVENANCE.md). This audit reuses those already packaged predicates. It neither rewrites the original summaries nor treats the packet expansion as a new natural run. [preservation.json](validation/preservation.json) records every frozen copy, natural archive and protected source hash. [summary.json](results/summary.json) records analysis-source and source-evidence hashes; [plot-manifest.json](plots/plot-manifest.json) records plot inputs/source/outputs, and [checksums.json](checksums.json) inventories this package.

ID 0 snapshots are **frame-local and causal**: only identities, transfers, flags and contacts available by that recorded cutoff enter the snapshot. Nearest observations to nominal 120 / 300 / 480 / 599.25 s are 120.0166666666787 / 300.01666666664977 / 480.0166666668593 / 599.2500000000696 s. Small positive offsets are reported rather than fabricated exact milestones. All 945 naturally frozen episode snapshots are taken at their actual closure, not at the final horizon. Selecting largest multi-cell, earliest one-cell and an existing zero-consolidation one-cell case is **retrospective illustration**, not a causal selection or formation rule. No final ID 0 cohort is projected backward into earlier snapshots.

## Measurement definitions

| Quantity | Population, interval and meaning |
| --- | --- |
| Historical union | Exact unique cells in the then-canonical episode's existing geometry |
| Direct first union entry | A cell absent from that identity's union is inserted by its component activity |
| Merge first union entry | A cell absent from the target union arrives in an actual source-union transfer |
| Direct-only / inherited-only / overlapping | Whether a focal direct new insertion and/or actual import ever occurred by cutoff; disjoint partition of union, separate from first-entry route |
| Focal local exposure | Component admission attempts on an existing union cell, including revisiting imported cells; does not rewrite insertion route. Import-relative sample counts include frames on/after the first import frame |
| Owned active observations | Recorded active samples owned by this identity, plus actual source-owned histories transferred by real merges; same cell/frame deduplicated |
| Global same-position activity | Any episode's active mask at that position since canonical first admission; a different identity may be active there |
| Observation denominator | From earliest canonical admission through causal cutoff, both included; actual merged earlier admissions can extend the interval |
| Active duty | Owned (or separately global) active sample count / that cell's observation denominator |
| First/last activity and spans | Actual sampled timestamps. Admission-to-last and first-to-last spans are not uninterrupted activity durations |
| Active spells / reactivation | Runs of adjacent recorded active frame indices; reactivations = spells minus one. Spell duration = last recorded time minus first recorded time; a singleton has 0 s span |
| Last active age | Cutoff minus last observed active time; separate owned and global fields |
| Chemical / mechanical / joint duty | Relevant stored flag counts / observation denominator, including inactive samples; not amplitude, deposition mass or event contribution |
| q=1 / q=0 active | Partition of owned or global active cell-samples. q=0 active is an existing filter carry-over proxy; its denominator is active samples, not union area |
| Last actual same-cell foot age | Admission/first focal direct insertion/first focal import minus most recent actual contact no later than that instant; absent prior contact is null |

Ordered component processing matters: original W1 can admit a source cell in one component and merge it later in the same frame. The observer transfers the source's operation-time union and earliest admissions. Candidate split ancestry is provenance only and never substitutes for a geometry transfer. Unique cells, first-entry routes and direct/inherited overlap are checked without double counting; actual source-ID references point to the per-condition merge ledger. Equal or ambiguous earliest provenance is explicit rather than arbitrarily assigned. Final ID 0 has zero ambiguous-admission cells in all six seed/condition records.

`directExposureSampleCount`, `componentCellObservations` and `repeatedExistingUnionCellObservations` are **focal-owner-local counters**: source counters are not copied on merge. They are not totals over all ancestral admission attempts. In contrast, primary owned-active sets do inherit source-owned activity. An inherited-only cell may later be active locally; inherited-only does not mean untouched by the receiving identity. Distinct origin IDs do not identify individual ants or physical contributions.

Summary quartiles use the existing deterministic linear-interpolation definition. Counts at ages >20 / >90 / >300 s are descriptive references to existing timescales, with a 1e-9 s equality tolerance; they are not material eligibility thresholds. Exact DAB depositions, decayed amplitudes and individual FOOT_CONTACT contributions to persistent field state cannot be decomposed from these predicates. No continuous activity is filled between approximately 1 Hz observations.

## ID 0: first entry and overlapping history

Final unique-cell accounting:

| Condition / seed | Union | Direct first entry | Merge first entry | Merge-first fraction | Direct-only | Inherited-only | Both |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Original / 05 | 6,061 | 4,568 | 1,493 | 24.63% | 4,160 | 1,493 | 408 |
| Original / 06 | 5,958 | 4,577 | 1,381 | 23.18% | 4,148 | 1,381 | 429 |
| Original / 07 | 6,068 | 4,636 | 1,432 | 23.60% | 4,252 | 1,432 | 384 |
| Candidate / 05 | 5,960 | 4,256 | 1,704 | 28.59% | 1,567 | 1,704 | 2,689 |
| Candidate / 06 | 5,936 | 4,410 | 1,526 | 25.71% | 2,083 | 1,526 | 2,327 |
| Candidate / 07 | 6,031 | 4,329 | 1,702 | 28.22% | 1,465 | 1,702 | 2,864 |

**Direct first entry contributes 71.4–74.3% of candidate ID 0 union**, versus 75.4–76.8% original. Actual merge transfer is substantial but is not the majority source of new union positions. Many directly inserted cells are later overlapped by an imported history: candidate both-class shares are 45.12 / 39.20 / 47.49%, versus 6.73 / 7.20 / 6.33% original. Do not add those overlapping sets to the unique first-entry counts. Split/remerge increases mixed history bookkeeping, while direct accumulation alone still supplies most of the dense union.

Candidate imported cells with same-identity local exposure on/after the first import frame number 3,547 / 3,640 / 4,080. This sampled-frame count includes the import frame and does not assert strict post-transfer operation order. Machine-readable keys `importedCellsWithLaterLocalExposure` and `importedAndLocallyRevisitedSampleCount` use `frameIndex >= firstImportHereFrame`; despite their abbreviated labels, they must be read as on-or-after-import-frame exposure, never as a strict-later counter. Summed merge source areas would overcount both repeated transfers and overlap; [merges.csv](results/merges.csv) retains every actual operation's new S\T and overlapping S∩T sets instead. Provenance ancestry may be very large even in a frozen episode with no new transferred cell; it is not geometry.

Candidate progression, all quantities in grid cells:

| Nominal time | 05 union / owned active / merge-first | 06 union / owned active / merge-first | 07 union / owned active / merge-first |
| --- | ---: | ---: | ---: |
| 120 s | 1,318 / 1,280 / 477 | 965 / 939 / 361 | 1,167 / 1,143 / 392 |
| 300 s | 4,592 / 2,667 / 1,287 | 4,185 / 2,649 / 1,089 | 4,305 / 2,654 / 1,076 |
| 480 s | 5,531 / 953 / 1,447 | 5,480 / 2,509 / 1,413 | 5,436 / 898 / 1,357 |
| 599.25 s | 5,960 / 2,291 / 1,704 | 5,936 / 1,654 / 1,526 | 6,031 / 2,000 / 1,702 |

The union grows across these milestones while current owned activity changes location and size. At 480 s, seeds 05 and 07 have less than 1,000 owned active cells in unions above 5,400; seed 06 is different at that instant. The final shared pattern is repeated across seeds, with distinct turnover chronology. [milestones.csv](results/milestones.csv) includes all original and candidate counts and distributions; `frameSummaries` records all 599 observations per condition.

## ID 0: temporal and support heterogeneity

Candidate final distributions are over the unique cells in each final ID 0 union, with a separate admission-to-cutoff denominator for each cell:

| Seed | Owned duty min / Q1 / median / Q3 / max | Joint support duty min / Q1 / median / Q3 / max | Owned last-age median / max, s |
| --- | --- | --- | ---: |
| 05 | .020 / .397 / .543 / .667 / 1 | .002 / .378 / .562 / .762 / 1 | 49.82 / 490.23 |
| 06 | .062 / .441 / .583 / .701 / 1 | .009 / .411 / .599 / .788 / 1 | 34.57 / 450.23 |
| 07 | .014 / .406 / .559 / .697 / 1 | .003 / .371 / .571 / .788 / 1 | 38.63 / 444.23 |

Owned active sample counts have medians 198 / 199 / 191 and ranges 1–475 / 2–474 / 1–462. First sampled active spell spans have medians 89.40 / 91.00 / 91.23 s. Reactivated cells number 4,214 / 4,122 / 4,148, or 68.8–70.7% of union; one median reactivation occurs per cell in every seed. These are broad, repeated temporal differences within a single identity, not separate material types. Baseline median owned duty .574 / .605 / .581 is higher, but also varies broadly; cell-level heterogeneity predates the split rule.

| Candidate seed | Not currently ID 0 active | Not globally active at that position | Owned last age >90 s | Global last age >90 s | Owned q=0 active fraction |
| --- | ---: | ---: | ---: | ---: | ---: |
| 05 | 3,669 / 5,960 (61.56%) | 3,407 / 5,960 (57.16%) | 2,391 | 1,876 | 7.22% |
| 06 | 4,282 / 5,936 (72.14%) | 3,591 / 5,936 (60.50%) | 1,662 | 1,551 | 7.08% |
| 07 | 4,031 / 6,031 (66.84%) | 3,573 / 6,031 (59.24%) | 1,905 | 1,811 | 7.17% |

At final, 262 / 691 / 458 historical positions are currently active under another identity but not ID 0. The owned historical complement cannot all be called inactive arena. Nevertheless, 28.0–40.1% of ID 0 union has no owned active observation for more than 90 s; 26.1–31.5% has no **global** active observation for more than 90 s. Global last-age maxima reach 444–490 s. Old positions persist in geometry after local activity has ended within this finite observation horizon. This says nothing about permanent inactivity after 599.25 s.

**Chemical, mechanical and joint qualified counts/duties coincide cell by cell in every archived snapshot of this audit.** The plots show this coincidence without renormalizing it. It does not establish that chemical and mechanical processes are physically the same: the full-grid packets include 9 / 2 / 0 chemical-only samples, outside the post-admission populations analyzed here. These threshold flags separate broad temporal support histories inside an episode but do not identify independent chemical versus mechanical contribution axes. q=0 owned-active fractions are 7.08–7.22% candidate and 7.75–7.84% original. Filter-carried activity and present support are observably different quantities.

Last actual same-cell FOOT_CONTACT age at canonical first admission has medians 13.80 / 16.18 / 12.70 s and maxima 513.36 / 507.74 / 436.68 s. Counts above 20 s are 2,325 / 2,537 / 2,263; above 90 s, 375 / 433 / 385. All final ID 0 cells have a recorded prior point contact. First focal import ages have medians 28.64 / 27.05 / 27.12 s; a cell may have entered the source much earlier than its import into ID 0. Null first-direct/import ages elsewhere also include cells without that route, not necessarily missing contact evidence. These contact gaps support an old-history association, not a reconstruction of how much any old contact still contributes to support or EMA.

## Actual frozen episodes

The audit archives every freeze: original 108 / 115 / 105 and candidate 201 / 205 / 211, with exactly unchanged geometry and character. No size veto selects this population. Among multi-cell freezes, joint support varies between cells in 39/39, 32/32, 29/29 original episodes and **102/105, 100/103, 104/109 candidate episodes**. Owned duty varies in 38/39, 32/32, 29/29 original and **103/105, 103/103, 109/109 candidate**. Nonuniform means exact stored maximum > minimum, not an acceptance threshold. Thus 306/317 candidate multi-cell episodes have nonuniform joint duty and 315/317 have nonuniform owned duty. Uniform exceptions remain recorded.

Largest actual multi-cell frozen cases, selected retrospectively by occupied cells with lower-ID ties:

| Condition / seed / ID | Cells | Birth → close, s | Direct-first / merge-first | Median owned duty | Joint duty range / median | Median first spell, s | Reactivated cells |
| --- | ---: | --- | ---: | ---: | --- | ---: | ---: |
| Original / 05 / 122 | 14 | 77.017 → 219.017 | 10 / 4 | .613 | .008–.757 / .453 | 67.5 | 1 |
| Original / 06 / 371 | 22 | 178.017 → 295.017 | 17 / 5 | .795 | .100–.847 / .646 | 70.0 | 0 |
| Original / 07 / 427 | 6 | 205.017 → 340.017 | 5 / 1 | .635 | .165–.655 / .398 | 56.5 | 0 |
| Candidate / 05 / 1643 | 155 | 507.017 → 560.617 | 155 / 0 | .204 | 0–1 / .296 | 10.0 | 0 |
| Candidate / 06 / 1423 | 60 | 504.017 → 539.267 | 60 / 0 | .444 | 0–1 / .167 | 15.0 | 0 |
| Candidate / 07 / 980 | 68 | 367.017 → 411.017 | 68 / 0 | .222 | 0–1 / .178 | 8.0 | 4 |

All three candidate maximum cases admit every unique union position directly. Seed 07 later imports an overlapping four-cell history without adding a new position; it has four both-class cells. Large split-provenance lists are not copied parent geometry. These directly grown frozen cases still have heterogeneous cell support/activity, so heterogeneity is not solely an artifact of importing foreign unions. Their shorter observed spells and few reactivations contrast with long pending ID 0 histories, but these are different times, locations and selected size extremes. A closed cohort and a right-censored pending cohort do not provide a controlled predictor of closure or material viability.

Earliest actual one-cell freezes are shared by both conditions: 05 ID 18 (32.017–82.017 s), 06 ID 15 (33.017–70.017 s), 07 ID 21 (45.017–71.017 s). They have owned duty .980 / .974 / .963, joint duty .569 / .342 / .185, first observed spells 49 / 36 / 25 s, no reactivation and last active age about 1 s at closure. High active duty is therefore not sufficient evidence of broad or strongly supported material. Existing candidate one-cell IDs 1261 (06) and 528 (07) have 22 s spells, .958 owned duty, q=0 on every owned active sample, joint duty 0 and unchanged consolidation 0. Their old pre-admission contacts and finite directional coordinates are preserved. No new estimator, geometry filter or exception discards them.

## Empirical conclusions and next hypothesis

1. **Dominant union growth:** direct first admission is the majority source of unique positions; actual merge transfer adds roughly one quarter to three tenths. Repeated overlapping history is much larger in the split candidate. Preventing imports alone is not demonstrated to remove the dense directly accumulated footprint.
2. **Within-union differences:** admission times, owned duty, spells, revisitation, ages and threshold-support duty vary substantially. Chemical versus mechanical predicates do not distinguish independent support histories in the analyzed populations.
3. **Old geometry retention:** 61.6–72.1% of candidate root geometry is not currently owned active; 57.2–60.5% is not globally active. Old last-active observations remain represented for hundreds of seconds. History union and instantaneous activity are different objects.
4. **Frozen versus pending:** actual multi-cell closures also contain heterogeneous cells, including direct-only growth. The selected largest closures generally have shorter spells and fewer returns than the long pending root, while one-cell examples can have sustained activity with low or zero present support. No causal material/coherence ranking follows from these examples alone.
5. **Footprint versus material:** the equal treatment of every historical union cell loses measured distinctions in formation history. That is a basis for a next hypothesis, not evidence for a particular weight, threshold, decay, contribution function or geometry transformation.

**One proposed next independent hypothesis only:** test whether a cell's own observed supported formation history can distinguish the historical record from material contribution, while keeping frozen inputs and episode identity/closure fixed. Its function and decision criteria require a separately authorized design; none is defined or implemented here. This pass does not execute the earlier merge-history proposal or any second candidate. The data do not identify a unique conversion from predicates to physical material amount.

## Artistic / modeling interpretation

Fixed-scale maps show a dense historical footprint containing spatially arranged histories of current activity, past residence and reoccupation. These differences could make material memory more legible than one uniform footprint. Calling such history a fossil or palimpsest is an artistic reading, not a biological or physical-material claim. No colormap value is a quality score, and no appealing image is used as acceptance evidence. W1 coherent material ontology remains unresolved; W2, vitality, material feedback and sounding-world links remain unimplemented.

## Review artifacts and reproduction

- ID 0 footprint/provenance/current geometry, four matched times: candidate [05](plots/dominant-20261005-candidate-geometry.png), [06](plots/dominant-20261006-candidate-geometry.png), [07](plots/dominant-20261007-candidate-geometry.png); original counterparts are in [plots/](plots/).
- ID 0 owned persistence, last-owned-active age and separate chemical/mechanical/joint duties: candidate [05](plots/dominant-20261005-candidate-activity-support.png), [06](plots/dominant-20261006-candidate-activity-support.png), [07](plots/dominant-20261007-candidate-activity-support.png).
- Same fields for actual frozen representatives: candidate [05](plots/representatives-20261005-candidate.png), [06](plots/representatives-20261006-candidate.png), [07](plots/representatives-20261007-candidate.png), with original counterparts and SVGs alongside.
- [analysis.json.gz](results/analysis.json.gz) contains every causal snapshot, cell row, actual merge ledger, complete frame summaries and unchanged character metadata. [cells.csv.gz](results/cells.csv.gz) is the same cell-level data as compressed CSV; [episodes.csv](results/episodes.csv), [milestones.csv](results/milestones.csv), [merges.csv](results/merges.csv) and [summary.json](results/summary.json) provide indexed tables.

Every plot retains the full 96×96 arena at world [0,1]² with equal aspect. Duty range is always [0,1], age always [0,600] s, provenance colors are fixed categories, and missing/no-history cells are white. Nearest-cell raster display adds no spatial interpolation; there are no per-panel limits or contrast normalization. Small one-cell examples stay visibly small. Final accumulation and 599.25 s are the same recorded cutoff, not two independent samples.

Tooling commit: `b98098ae91a7f93f480f9929df13df8f6a63fcab`. Generated evidence/chronology are a separate commit; exact remote HEAD is reported after push.

From the recorded checkout with Node 22.23.2, Matplotlib 3.11.2 and NumPy 2.3.5:

```powershell
node scripts/ant-w1-cell-history-analysis.js test-results/w1-cell-history-reproduction/results
uv run --with matplotlib==3.11.2 --with numpy==2.3.5 python scripts/ant-w1-cell-history-plots.py --input test-results/w1-cell-history-reproduction/results/analysis.json.gz --output test-results/w1-cell-history-reproduction/plots
node scripts/ant-w1-cell-history-verify.js
node --experimental-test-isolation=none --test tests/ant-material-morphology-metrics.test.js tests/ant-w1-inputs.test.js tests/ant-w1-crystallization.test.js tests/ant-w1-character.test.js tests/ant-w1-analysis.test.js tests/ant-w1-continuity.test.js tests/ant-w1-max-overlap.test.js tests/ant-w1-max-overlap-analysis.test.js tests/ant-w1-cell-history.test.js tests/ant-w1-cell-history-analysis.test.js
npm test
npm run build
git diff 92ba2117b10bd3f559eca9866602ab8d430a649b -- src static package.json package-lock.json AGENTS.md scripts/ant-w1-crystallization.js scripts/ant-w1-max-overlap-crystallization.js scripts/ant-w1-character.js scripts/ant-w1-analysis.js scripts/ant-w1-max-overlap-analysis.js docs/ant/evidence/2026-10-08-w1-episodic-material-shadow docs/ant/evidence/2026-10-08-w1-causal-character-attribution docs/ant/evidence/2026-10-09-w1-continuity-diagnostic docs/ant/evidence/2026-10-09-w1-max-overlap-split-shadow
```

The default analyzer writes only this new package; use the explicit independent destination to preserve it. Decompress `cells.csv.gz` with a standard gzip reader. Multi-cell nonuniform population counts above are obtained from each `frozenEpisodes` record by `cells.length > 1` and the stated distribution's `max > min`; this selection describes population variation and never affects formation.

## Validation and limits

**78/78 focused tests, 370/370 full tests and build pass.** Existing Rollup annotation and chunk-size warnings remain non-blocking. New fixtures test operation ordering, repeated and overlapping admissions, source history transfer, same-frame redirects, split provenance without geometry, multi-hop transfer, deduplicated owned/global spells, irregular sample times, null/causal contacts, prefix equality, invalid indices and frame order, RNG trap, selection ties and measurement denominators. Reanalysis deep-equals complete committed baseline and candidate results before instrumentation; all 3,594 matched condition-frames retain active masks, identities, geometry, admissions, closure and character. Every frozen episode's mean cell joint duty exactly reproduces its existing consolidation.

[reproduction.json](validation/reproduction.json) verifies **43/43 byte-identical files** from separate numerical and plotting processes: six result files, 36 PNG/SVG files and one plot manifest. [preservation.json](validation/preservation.json) verifies 174 historical evidence files against raw Git blobs, 69 protected paths, 46 original production working hashes, 13 exact frozen copies and nine natural archives. [packaging-invariance.json](validation/packaging-invariance.json) proves all 969 snapshots / 105,313 reported cell rows and scientific seed data remain equal after removing duplicated snapshot merge bodies in favor of ledger references and compressing the CSV. This is storage compaction only. [staged-byte-verification.json](validation/staged-byte-verification.json) records exact package bytes versus Git index blobs; its own circular entry is excluded and checked separately. Test/build/analysis logs and the independent review are in [validation/](validation/).

Limits: three seeds, one finite horizon, sampled threshold flags rather than full intermediate amplitude histories, approximately 1 Hz activity observations, actual point contacts rather than exact field contribution, varying admission denominators, retrospective representative choice, and unequal closed versus right-censored cohorts. No precise intersample cessation time, DAB decomposition, per-ant field causation or future permanent inactivity is inferred. Exact byte reproduction is verified in this recorded Windows checkout and pinned plotting environment; source working hashes and existing dynamic-module absolute URLs can differ under another checkout path/line-ending convention. Browser QA is unnecessary for detached raster analysis and was not performed. No natural behavior, production, geometry transformation, weighted mask, material contribution, new threshold, character/merge/closure rule, audio, feedback, PR or main merge is introduced. Stop after audit and push.
