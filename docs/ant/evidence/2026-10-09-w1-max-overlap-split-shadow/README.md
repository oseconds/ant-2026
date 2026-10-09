# W1 max-overlap split inheritance shadow — Mixed

**Decision: Mixed.** Changing only split identity routing permits independent closures and larger isolated material fragments. It does not resolve the dominant pending episode. In all three seeds, canonical ID 0 owns an active component at every recorded frame from birth to 599.25 s, retains 98.2–99.8% of pending union area, and remains unfinished for 583–585 s. Absolute one-cell closure counts, discarded fragments and area-weighted re-inscription increase. W1 is still not accepted as coherent material ontology.

This detached counterfactual starts from `73dac81d29231c40bc5dfecb1cd3f8ff34fc81e8` on `ant-w1-episodic-material-shadow`. It compares the unchanged [causal-character W1 baseline](../2026-10-08-w1-causal-character-attribution/README.md) and one max-overlap split candidate on the same frozen histories. The [continuity diagnosis](../2026-10-09-w1-continuity-diagnostic/README.md), original formation/character evidence, production, natural archives and input packets are preserved. No natural ANT run, second family, threshold tune, forced closure, minimum-size veto, feedback, audio mapping, main merge or PR occurs.

## Exact intervention and ordering

The prior W1 routes every overlapping split descendant to the parent's canonical identity. The candidate routes each **previous spatial component** to exactly one current child: maximum number of identical occupied cells; equal overlap selects the smaller deterministic row-major component label. Other overlap edges supply provenance, not identity or closure liability.

All overlap counts, winning routes and parent identity/provenance snapshots are computed before any current-frame merge. Current components are then processed in the original order. A component with winning incoming parents inherits those IDs; multiple incoming IDs merge using the original minimum-ID winner and original union, earliest-admission, clock and absorption-ancestry semantics. A component with no winning incoming parent receives a fresh identity and current admission times. It receives no parent's accumulated geometry or clock. A child losing one parent's route but winning another's route continues the latter; it is not also allocated a fresh identity.

Actual merge `ancestryIds` and `parentIds` retain their prior meanings. Separate `splitProvenanceIds` records losing-edge/transitive provenance and never participates in routing, persistence, closure or geometry. Merge counters describe routed joins; raw multi-parent spatial intersections are retained separately. This is the direct consequence of the single routing change, not a new qualification rule.

**Identity invariant:** one live canonical ID owns one current spatial component. Each previous owner routes to one child, so the incoming identity sets of distinct current children are disjoint. A merge within one child cannot redirect another child's winning parent. Assert this every frame. This constraint concerns current ownership, not a skeleton or tree representation of historical material.

The [pre-replay design](DESIGN.md) records the contract. The isolated [candidate model](../../../../scripts/ant-w1-max-overlap-crystallization.js) is never imported by production. No existing W1 source is edited. Static fixtures verify the qualification/EMA block, 8-connected extraction, frame validation, admission, closure loop, persistence test, geometry and state-bound calculations remain exact; pure-merge and no-split fixtures verify unchanged behavior outside routing/provenance.

## Fixed formation, character and measurement semantics

| Quantity | Exact retained definition |
| --- | --- |
| Input grid / observation | 96×96; 599 archived observations per seed through 599.25 s, approximately 1 s apart |
| Qualification q | All three archived bits true: persistent chemical, mechanical support, cumulative point-contact qualification; `(flags & 7) === 7` |
| Recent / established history | Zero-initialized EMAs with 20 s / 90 s constants; update from actual observation dt |
| Active mask | Strict `fast - slow > alpha - beta`, with `alpha = 1-exp(-dt/20)` and `beta = 1-exp(-dt/90)` |
| Spatial continuity | Positive exact same-cell overlap of adjacent archived 8-connected components |
| Persistence / closure | Original 20 s active-time requirement; finish at the first observation with no owned active component; shorter histories discarded |
| Frozen geometry | Exact union of admitted cells and earliest admission per cell; no interpolation, path selection, source/boundary requirement or skeleton construction |
| Consolidation | Mean over episode cells of the fraction of observed admission-through-close samples with both chemical and mechanical bits true; cumulative contact bit is excluded from this coordinate |
| Directional order | Travel-weighted nematic magnitude of unique ant movement segments at actual same-cell FOOT_CONTACTs in `[0, close]`, 1e-9 s endpoint tolerance; includes pre-admission contacts and ignores forward/backward sign |
| Direction attribution | Completed 60 Hz trajectory segment available at foot time; deduplicate by ant ID and segment end; no future foot or direction segment |
| New area / overlap | Compare each frozen admitted union with earlier frozen unions in original closure/order semantics; weighted re-inscription = total repeated episode cells / total episode cells |
| Topology | Occupied 8-connectivity / empty 4-connectivity; primary beta1 counts enclosed empty components, with their exact hole areas |
| Skeleton proxies | Existing topology-preserving thinning for measurement only; orthogonal edges plus diagonals only without intervening occupied orthogonal cells; endpoints degree 1, junctions degree ≥3, secondary μ = E − V + C |
| Isolation / review reference | Neither source annulus nor raster boundary adjacent; retain the prior 18-cell component/hole review reference descriptively only, never as an admission or freeze veto |
| Distribution | Episode quartiles interpolate sorted values at `(n−1)p`; inherited raster component distributions retain their original floor-index quantiles |

The unchanged original `analyzeSeed` function is reused by a source-derived module whose only model change is binding its import to the candidate factory. Relative imports become absolute URLs and the old CLI entry guard is disabled. Its complete measurement function text is asserted identical. Geometry, novelty, milestones, character definitions, coverage and summary measurements therefore have no second implementation. The derived-module hash and changes are recorded in `results/analysis.json.gz`.

All 1,797 matched frames have exactly equal active masks, q input, EMA bounds and spatial component counts. No different movement, field support, contact history or formation drive is responsible for the measured differences. Final fork fates are retrospective analysis of already completed causal replay; they are never consulted by formation.

## Input provenance and hashes

The same [frozen W1 input package](../2026-10-08-w1-episodic-material-shadow/inputs/field-decisions/INPUT-PROVENANCE.md) is consumed without reconstruction or repacking. Its previous authorized saved-snapshot expansion documents all 25 timestamps with four omitted cells, the saved full-snapshot filenames/arrays and their prior committed hash matches. That expansion remains an analysis input package; neither the original natural run nor its original summaries are replaced.

| Seed | Exact frozen flags SHA-256 |
| --- | --- |
| 20261005 | `508f93c15eb808c71b0d7c0bccba50b9589041676cd769c40941f9d5427df518` |
| 20261006 | `7a051193a902ad0f7fc95d9c4aaaefeded832d20d5e19b569f69a05b1d820e67` |
| 20261007 | `30403c6f1a9795fd0fa1910b332e0be6be9fe24e04356087ba03da5464bedb6c` |

Each seed's `inputProvenance` also records exact trajectory, actual FOOT_CONTACT, summary and milestone hashes. [preservation.json](validation/preservation.json) checks 138 files across all three historical W1 packages against raw starting Git objects, 63 protected source/config/fixture files, 13 previously copied frozen inputs against their local-accretion source commit, and nine natural archive files. All 46 original production/config working-byte hashes remain exact. Additional protected script/fixture Git identities accept only explicitly reported checkout LF/CRLF equivalence; historical evidence and frozen input bytes are compared raw. Original crystallizer working SHA-256 remains `cee5241d663a509bf51b21533b262fde7447f249d81520375be68bd048cc94bf`.

New analysis SHA-256 is `f3fc220484bc9eee25d14b57250cd8405b4d003639ff8327991483d4049a14fa`. [checksums.json](checksums.json) inventories this package; the checksum file itself and staged-byte ledger are excluded to avoid circular hashes.

## Matched empirical observations

Numbers are **baseline → candidate**, at the same 599.25 s observation. Area is raster cells; one cell is 1/9,216 of the full arena.

| Outcome | 20261005 | 20261006 | 20261007 |
| --- | ---: | ---: | ---: |
| Frozen episodes | 108 → 201 | 115 → 205 | 105 → 211 |
| Discarded episodes | 15 → 544 | 12 → 493 | 22 → 503 |
| Pending identities | 13 → 56 | 22 → 66 | 12 → 44 |
| Frozen union cells | 187 → 755 | 186 → 690 | 154 → 797 |
| Pending union cells | 6,068 → 6,068 | 5,963 → 5,949 | 6,071 → 6,063 |
| Frozen episode area median / maximum | 1 / 14 → 2 / 155 | 1 / 22 → 2 / 60 | 1 / 6 → 2 / 68 |
| Frozen active-persistence median, s | 49 → 41 | 47 → 37 | 47 → 39.65 |
| One-cell episodes, count | 69 → 96 | 83 → 102 | 76 → 102 |
| One-cell episodes, fraction | 63.9% → 47.8% | 72.2% → 49.8% | 72.4% → 48.3% |
| Episodes ≥18 cells, descriptive | 0 → 7 | 1 → 7 | 0 → 10 |
| Episodes with an isolated ≥18-cell component | 0 → 7 | 1 → 7 | 0 → 9 |
| Area-weighted re-inscription | 2.09% → 15.07% | 2.62% → 7.38% | 0.65% → 7.33% |
| Median new-area fraction / new cells per freeze | 1 / 1 → 1 / 1 | 1 / 1 → 1 / 1 | 1 / 1 → 1 / 1 |

The candidate frozen union occupies 8.19%, 7.49% and 8.65% of the arena. It has not saturated the frozen world. However the enormous pending histories remain dense, and the union of pending cells differs little. The candidate pending count equals the instantaneous active-component count by construction; a larger count is not evidence of better episodes.

The median candidate ≥18-cell episode's new-area fraction is .857, 1 and .971, respectively; minima .55, .842 and .818. Larger independent fragments add some genuinely new territory, but weighted overlap becomes worse in every seed. Median novelty alone hides that degradation because tiny episodes dominate the population. Late 480–599.25 s candidate frozen union growth remains 2.15, 2.20 and 1.79 cells/s, so background small-fragment formation has not stopped.

### Matched milestones

| Seed | Actual observation, s | Frozen cells, B → C | Pending union cells, B → C |
| --- | ---: | ---: | ---: |
| 20261005 | 120.0167 | 14 → 14 | 1,503 → 1,503 |
| 20261005 | 300.0167 | 117 → 215 | 4,616 → 4,613 |
| 20261005 | 599.25 | 187 → 755 | 6,068 → 6,068 |
| 20261006 | 120.0167 | 13 → 13 | 1,104 → 1,104 |
| 20261006 | 300.0167 | 126 → 152 | 4,200 → 4,200 |
| 20261006 | 599.25 | 186 → 690 | 5,963 → 5,949 |
| 20261007 | 120.0167 | 10 → 10 | 1,263 → 1,263 |
| 20261007 | 300.0167 | 66 → 155 | 4,352 → 4,349 |
| 20261007 | 599.25 | 154 → 797 | 6,071 → 6,063 |

### Independent split closure and reabsorption

Fresh split children are components with losing overlap edges and no routed winning parent. Components that instead inherit a different winning parent are recorded separately and excluded from this fresh-child denominator.

| Candidate fresh-child fate | 20261005 | 20261006 | 20261007 |
| --- | ---: | ---: | ---: |
| Fresh split children | 921 | 885 | 847 |
| Freeze independently before absorption | 92 | 88 | 104 |
| Discard independently | 529 | 481 | 481 |
| Remain independently pending | 41 | 43 | 31 |
| Absorbed before own closure | 259 | 273 | 231 |
| Absorbed, terminal ancestor frozen | 1 | 4 | 2 |
| Absorbed, terminal ancestor pending | 258 | 269 | 229 |
| Median time until first absorption, s | 10 | 9.15 | 11 |
| All candidate merge frames / absorbed IDs | 747 / 1,202 | 701 / 1,161 | 688 / 1,170 |

Independent closure is real, not just a change in label count. But 98.5–99.6% of reabsorbed children terminate in pending ancestors. Absorption chains are followed to their final owner, including multiple hops; they are not counted as independent frozen episodes. Closures/discards/pending above partition terminal records, whereas allocated/absorbed IDs live in the event ledger. These populations must not be added as independent samples.

### Dominant pending lineage and remaining merge failure

| ID 0 at final observation | 20261005 | 20261006 | 20261007 |
| --- | ---: | ---: | ---: |
| Birth time B = C, s | 14.0167 | 16.0167 | 14.0167 |
| Observed lifetime B = C, s | 585.2333 | 583.2333 | 585.2333 |
| Active cells, B → C | 2,611 → 2,291 | 2,330 → 1,654 | 2,475 → 2,000 |
| Current components, B → C | 44 → 1 | 45 → 1 | 33 → 1 |
| Cumulative union cells, B → C | 6,061 → 5,960 | 5,958 → 5,936 | 6,068 → 6,031 |
| Fraction of pending union, B → C | 99.88% → 98.22% | 99.92% → 99.78% | 99.95% → 99.47% |
| Actual merged ancestry IDs, B → C | 937 → 1,166 | 884 → 1,134 | 941 → 1,161 |
| Separate split-provenance IDs, C | 1,165 | 1,114 | 1,146 |
| Candidate ID-0 direct merge frames | 398 | 416 | 396 |
| Candidate directly absorbed source IDs | 794 | 840 | 817 |
| ID-0 overlap smaller than another incoming parent | 1 frame | 1 frame | 2 frames |

[merge-core-audit.json](validation/merge-core-audit.json) selects **fixed final canonical ID 0** and audits archived component ownership, not whichever pending union happens to be largest at each early frame. ID 0 owns every observation from birth onward (585 / 583 / 585 frames); there are zero missing-owner frames. The timeline's general dominant statistic can select another ID early and must not be used to infer ID-0 absence.

The one-child rule removes the old 33–45-sibling closure liability, but a single large current component still preserves the root at every observation. Original merge semantics continue to absorb local identities and their accumulated geometry. The retained historical union shrinks by only 101 / 22 / 37 cells. Actual merge ancestry increases because many new independent children subsequently reconnect. Provenance counts are metadata and do not cause that continuation.

Only four of 1,210 ID-0 direct-merge frames have another routed parent with larger exact overlap. Witnesses are 535.20 s in seed 05 (875 versus 980 cells), 39.0167 s in seed 06 (11 versus 13), and 30.0167 / 488.0167 s in seed 07 (3 versus 15 / 814 versus 1,306). Merely choosing a max-overlap merge winner instead of minimum ID is therefore a weak next hypothesis for this core. This audit does not simulate that alternative, prove that mergers alone cause the root's lifetime, or prove the root would disappear without mergers. Continuous active ownership itself prevents existing closure.

### Frozen topology and substantial geometry

| Final frozen union, B → C | 20261005 | 20261006 | 20261007 |
| --- | ---: | ---: | ---: |
| Candidate component count | 126 | 141 | 132 |
| Candidate largest-component share | 32.05% | 9.42% | 19.57% |
| Primary enclosed-hole count beta1 | 2 → 23 | 2 → 11 | 0 → 22 |
| Candidate largest hole, cells | 5 | 4 | 5 |
| Substantial holes ≥18 cells | 0 → 0 | 0 → 0 | 0 → 0 |
| Candidate skeleton endpoints / junctions | 161 / 78 | 175 / 38 | 172 / 74 |
| Candidate secondary skeleton cycle rank | 23 | 11 | 22 |

These are real deterministic raster holes, not visually inferred loops. None reaches the existing substantial-hole reference. A one-cell pore is not a meaningful material loop. Pending roots contain some larger holes in seeds 06/07, but pending geometry has not frozen and cannot be claimed as completed cyclic material.

Isolated connected multi-cell episodes do occur, without source/boundary or tree requirements. The largest actual freezes are seed 05 episode 1643 (155 cells, 507.0167–560.6167 s, new-area fraction .6903), seed 06 episode 1423 (60 cells, 504.0167–539.2667 s, fraction 1), and seed 07 episode 980 (68 cells, 367.0167–411.0167 s, fraction .9265). All are preserved exactly; they are representative maxima, not a morphology filter or evidence that most freezes are coherent. Candidate median area remains two cells.

## Character coverage and distributions

All **617/617** candidate freezes have both bounded coordinates, compared with 328/328 baseline. There is no estimator change or fallback. Fresh admission histories differ as the authorized identity rule requires; the character formulas and cumulative directional interval are fixed.

| Candidate coordinate | Seed | Minimum | Q1 | Median | Q3 | Maximum | Mean |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| consolidation | 20261005 | .0862 | .3333 | .4784 | .6250 | 1 | .4968 |
| consolidation | 20261006 | 0 | .3065 | .4667 | .6111 | 1 | .4800 |
| consolidation | 20261007 | 0 | .2574 | .4520 | .6242 | 1 | .4619 |
| directionalOrder | 20261005 | .0711 | .4579 | .6563 | .8040 | ≈1 | .6262 |
| directionalOrder | 20261006 | .0312 | .4500 | .6360 | .8229 | ≈1 | .6146 |
| directionalOrder | 20261007 | .0526 | .4725 | .6593 | .8619 | ≈1 | .6480 |

| Pooled coordinate, B → C | consolidation | directionalOrder |
| --- | ---: | ---: |
| Mean | .5072 → .4793 | .6619 → .6298 |
| Median | .5208 → .4667 | .6805 → .6474 |
| Candidate Q1 / Q3 | .3056 / .6222 | .4645 / .8284 |
| Candidate minimum / maximum | 0 / 1 | .0312 / .9999999996 |

Pooled cross-axis Pearson correlation changes from −.0174 to +.1813; candidate rank correlation is +.1760. Candidate consolidation correlates with duration (+.382 Pearson / +.451 rank) more than directional order does (+.0135 / +.0110). Area correlations are −.203 / −.332 for consolidation and −.134 / −.364 for directional order. Both retain variation; the replay does not establish independent physical meanings, but they have not collapsed into one size/duration proxy. Full per-seed, area/duration/novelty correlations and temporal summaries remain in `summary.json` and `analysis.json.gz`.

Consolidation has 26 exact ones and **two exact zeros**. Direction has no exact 0/1, though some tiny directional samples approach 1. Zero consolidation is not converted to missing or vetoed: seed 06 episode 1261 (460.0167–483.0167 s) and seed 07 episode 528 (227.0167–250.0167 s) are one-cell fresh fork closures with 22 s active persistence, zero chemical-and-mechanical-positive observations in their new admission-through-close interval, and three inherited actual directional segments each. Their pre-admission contacts extend about 144–145 s back. Original EMA carry-over can therefore support a newly independent identity whose consolidation window contains no current qualified samples. This exposes an attribution-boundary limit of unchanged formulas; it does not introduce chemical-only formation or another estimator.

Both coordinates are numerically finite and bounded. Rare extreme episodes are allowed. No current mapping connects them to stiffness, movement, vibration or sound. Bounds alone would not make a singular endpoint mapping, unchecked area/lifetime multiplier or aggregation over many fragments safe. The large unfinished entity and near-unit directional values remain future finite-influence hazards. This pass audits those risks and implements no coupling.

## Failure-mode review and research conclusion

| Failure / question | Observation and implication |
| --- | --- |
| Independent local closure | Improved: 92 / 88 / 104 fresh split children freeze without reabsorption; larger isolated geometry exists |
| Giant pending continuity | Unresolved: ID 0 remains continuously active and retains almost all pending union, despite one-child inheritance |
| Merely many pending identities | Present: pending count rises to 56 / 66 / 44, mechanically equal to current component count; large core persists |
| Speckle | Mixed/worse in absolute count: lower one-cell fraction, but 300 candidate one-cell episodes versus 228 baseline; median two cells and many short discards |
| Re-inscription | Worse in every seed: area-weighted overlap rises to 7.3–15.1% |
| Arena saturation / blob | Frozen union under 9%; dense pending history still approximately 65% of arena. Deferred dense material is not successful blob avoidance |
| Substantial cyclic material | Not observed. Actual microholes increase; all final frozen holes ≤5 cells |
| Hidden tree bias | Absent from this formation family; exact raster unions and measured holes, no source-rooted path reconstruction |
| Character validity | Complete finite coverage; two zero-consolidation carry-over forks and stale/reused directional history limit formation interpretation |

Allowed empirical claim: under exactly fixed frozen natural input and active masks, maximum-overlap split inheritance changes local closure outcomes and increases the upper tail of independently frozen geometry. It removes shared sibling closure identity, but **that change alone does not solve coherent episodic material formation**. Subsequent actual mergers reabsorb many children, while a single continuous active core remains sufficient to keep the giant root pending. The replay isolates the split-rule effect; it does not isolate a merger-disabled or contact-memory counterfactual, biological ant construction, or future material feedback.

One **next design-review candidate only**, not implemented or automatically authorized: preserve the existing minimum-ID merge winner, but treat other routed incoming histories as provenance instead of transferring their closure state, old union, earliest admissions or clock. This isolates merge-transferred liability/history while keeping the input, active mask and current split rule fixed. It would test the observed reabsorption and historical enlargement. The losing identity's end-of-life semantics require a separate explicit contract; merely changing the winner would affect only four observed root merge decisions, and preventing history transfer could still leave the active core open indefinitely. No closure cure is established here. Do not add a forced closure, size veto or second family to make this result pass.

## Artistic / modeling interpretation

Fixed-scale inspection shows more detached curved and irregular route fragments, including some multi-cell isolated historical patches. Those may read as fossil-like remnants or partial reoccupation in an artistic material-memory vocabulary. The frozen collection still includes numerous tiny residues; the pending world remains a broad dense accumulation. No materially substantial loop/braid claim follows from its pores, and a larger count of fragments is not a richer coherent ecology by itself. Material ontology, material conditions, vitality and sounding-world links remain separately gated.

## Review artifacts

- Fixed-scale matched frozen/pending masks: [seed 05](plots/paired-milestone-morphology-seed20261005.png), [seed 06](plots/paired-milestone-morphology-seed20261006.png), [seed 07](plots/paired-milestone-morphology-seed20261007.png).
- [Union / activity timeline](plots/paired-union-dominant-timeline.png): arena-fraction scale [0,1], active-cell axis separate from episode/component counts, shared ranges across seeds.
- [Episode timeline](plots/episode-lifetimes.png): all terminal frozen, discarded and right-censored records; absorbed owners are represented in event/fate tables rather than added as terminal episodes.
- [Frozen sizes and character scatter](plots/frozen-size-and-character.png): measured population ECDF and bounded coordinate pairs; neutral condition colors, no quality colormap.
- [Largest actual frozen episodes](plots/largest-frozen-geometries.png): deterministic maximum recorded area per seed/condition, lower ID tie; full world scale, no cropped enlargement.
- [episodes.csv](results/episodes.csv), [identity-events.csv](results/identity-events.csv), [split-child-fates.csv](results/split-child-fates.csv), [summary.json](results/summary.json): per-episode quantities, split/merge chronology, terminal provenance, distributions and seed comparisons.
- [analysis.json.gz](results/analysis.json.gz): complete original/candidate measured histories, geometry, character, input provenance and all candidate identity frames.
- SVG counterparts and [plot-manifest.json](plots/plot-manifest.json): exact scales, selections and hashes.

## Reproduction, validation and limits

Tooling commit: `d1783c28a1be22272da44ede0ec8dc85c7c1ac28`. Evidence/chronology are a separate commit, with the final branch and verified remote HEAD reported after push.

From the recorded checkout, Node 22.23.2 and pinned Matplotlib 3.11.2 / NumPy 2.3.5:

```powershell
node scripts/ant-w1-max-overlap-analysis.js test-results/w1-max-overlap-reproduction/results
uv run --with matplotlib==3.11.2 --with numpy==2.3.5 python scripts/ant-w1-max-overlap-plots.py --input test-results/w1-max-overlap-reproduction/results/analysis.json.gz --output test-results/w1-max-overlap-reproduction/plots
node scripts/ant-w1-max-overlap-verify.js
node --experimental-test-isolation=none --test tests/ant-material-morphology-metrics.test.js tests/ant-w1-inputs.test.js tests/ant-w1-crystallization.test.js tests/ant-w1-character.test.js tests/ant-w1-analysis.test.js tests/ant-w1-continuity.test.js tests/ant-w1-max-overlap.test.js tests/ant-w1-max-overlap-analysis.test.js
npm test
npm run build
git diff 73dac81d29231c40bc5dfecb1cd3f8ff34fc81e8 -- src static package.json package-lock.json AGENTS.md scripts/ant-w1-crystallization.js scripts/ant-w1-character.js scripts/ant-w1-analysis.js docs/ant/evidence/2026-10-08-w1-episodic-material-shadow docs/ant/evidence/2026-10-08-w1-causal-character-attribution docs/ant/evidence/2026-10-09-w1-continuity-diagnostic
```

The default analyzer output is this new package only. Keep primary artifacts intact when reproducing. [reproduction.json](validation/reproduction.json) records **20/20 exact byte matches** across five numerical outputs and 15 plot/manifest files from independent processes; baseline analyses deep-equal all three committed causal-character results. The supplemental root audit checks identical stored identity frames. No Math.random call is permitted during numerical analysis. Invalid frames/indices, finite/bounded character, deterministic ties, mixed split/merge order, pure merges, no parent union/admission copying, independent closure, provenance-only edges, multi-hop absorption, causal prefix equality and no future directional leakage have focused fixtures.

**67/67 focused tests and 359/359 full tests pass; build passes.** Existing Rollup annotation/large-chunk warnings remain non-blocking. Logs and preservation/reproduction records are in [validation/](validation/). [staged-byte-verification.json](validation/staged-byte-verification.json) records package working bytes against actual staged Git blobs; the ledger itself is excluded from its circular inventory and separately checked at packaging.

Limits: three seeds, one approximately 600 s frozen horizon, about 1 s formation sampling, exact predicates rather than full intermediate amplitude/deposition decomposition, and existing cumulative stale/reused contact attribution. A fresh fork's admission interval is deliberately not its parent's earlier interval. Skeletons are analysis proxies, not acoustic topology. No causal claim assigns a field region to an individual ant. Absolute source URLs in the derived-module provenance and working-source hashes record this checkout, so exact provenance bytes across a differently located/LF-filtered checkout are not promised; raw input identity, canonical Git identities and numerical rules remain inspectable. Plot byte identity is verified in the recorded pinned environment. Browser QA, natural behavior reruns, merge/contact-memory interventions, production adoption, audibility and feedback are outside this pass. Stop at this Mixed result and preserve it.
