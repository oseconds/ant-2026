# W1 continuation — complete geometry replay, incomplete directional coverage

**Decision: the bounded pre-admission attribution fixes the original stop, but this exact W1 family does not demonstrate a viable coherent material ontology. Preserve the negative result and stop.**

All three frozen natural histories were processed through their final field observation, 599.2500000000696 s. No ANT behavior was rerun. The exact crystallization source and fixtures remain unchanged. The only estimator change extends actual same-cell directional contacts back 20 s before each cell's admission; consolidation remains unchanged. No second estimator, size veto, morphology filter, forced closure, formation family, feedback or production adoption was added.

Geometry is complete, but the two-axis contract is not: **187 of 328 closed material episodes have both coordinates; 141 retain a null directionalOrder and a typed coverage gap.** Missing direction is never assigned zero or called isotropy. Those episodes remain in every geometry/novelty table. Continuing geometry after missing character implements the user's explicit request to complete the three-seed replay; it does not waive the original two-coordinate research gate.

The old [stopped W1 package](../2026-10-08-w1-episodic-material-shadow/README.md) remains byte-identical to commit `afa1653ed4798c4f1de0df1f46995dabe0af621e`, including its design, inputs, figures and stop claims. This package records the later authorized attribution revision separately.

## Exact definitions and fixed parameters

[DESIGN.md](DESIGN.md) records the sole attribution extension and subsequent missing-data reporting decision. The original [formation definition](../2026-10-08-w1-episodic-material-shadow/DESIGN.md) remains authoritative for crystallization.

| Quantity | Exact rule | Interpretation / limit |
|---|---|---|
| Grid | Original 96 × 96 cells | No dilation, interpolation or geometry resampling |
| Supported predicate q | All original bits present: chemical memory ≥ .30, conditional mechanical support ≥ .015, ≥2 distinct accumulated actual contact timestamps | Contact repetition is cumulative, not restricted to the recent window |
| Recent / established histories | Zero-initialized EMAs with τ = 20 / 90 s; α = 1 − exp(−dt/20), β = 1 − exp(−dt/90) | Same declared W1 family; first dt = 0 |
| Active cells | Strict F − S > α − β | No extra current-q gate, target path, source annulus or boundary requirement |
| Episode linkage | 8-connected active components; identical-cell overlap in consecutive recorded frames; splits retain lineage, merges retain ancestry and earliest cell admissions | Arbitrary geometry; no tree construction |
| Closure / freeze | Close when no active descendant; freeze if last-active − birth ≥20 s; discard shorter closures | Open lineages stay right-censored and unfrozen at the archive horizon |
| Geometry | Exact union of all cells admitted to that space-time lineage | It may be disconnected at one instant |
| consolidation | Mean across cells of the fraction of recorded joint chemical/mechanical-qualified observations from that cell's admission through closure, inclusive | Unchanged threshold-duty proxy; not field amplitude, occupied area, age, stiffness or quality |
| directionalOrder | Magnitude of the travel-weighted mean of unit nematic vectors (cos 2θ, sin 2θ) | Same estimator, reversal invariant, bounded [0,1] |
| Directional contact interval | For a cell admitted at a: [max(0, a − 20 s), episode closure], inclusive within 1e−9 s | 20 s bounds the **pre-admission lookback**, not the whole interval |
| Direction source / weighting | Actual contact cell and time; latest completed consecutive 60 Hz displacement; distance weighting; deduplicate ant ID + segment end | No body-heading replacement, future interpolation, lifecycle bridge or stationary invented direction |
| Missing travel | Typed `NO_VALID_DIRECTIONAL_TRAVEL`; consolidation retained, directionalOrder null | Reporting only; no episode is rejected or removed |

The directional segment lasts at most 1/60 s and finishes by the foot timestamp. A contact on the lookback boundary may use its immediately preceding completed segment. `maxPreAdmissionContactSeconds` is the largest **contact-to-admission lookback**, not contact duration or the contact's exact EMA contribution. Evidence also reports pre-admission segment count and the legacy segment-boundary exposure separately.

Same-cell feet contributed to accumulated contact evidence. The archive does not assign every chemical/mechanical contribution to those ants. F/S have infinite EMA tails, while the new directional lookback is bounded. The axis is therefore a bounded local directional-contact-history proxy, not a full decomposition of formation causality.

## Input provenance and preservation

Use the existing W1 `inputs/field-decisions/` and `inputs/baselines/local-accretion-analysis.json.gz`, originally copied byte-for-byte from local-accretion commit `13ffc9f42bc32083c87c6b1c97bc82092e03e472`. The loader also reads the committed complete 60 Hz trajectory and actual-foot archives in `docs/ant/evidence/2026-10-07-social-graph/data/`. Their 36,001 trajectory frames extend to 600 s; field predicates have 599 observations ending at 599.25 s. No contacts beyond a closure are attributed to it.

| Seed | Actual feet | Direction-bearing feet | Field-flag packet SHA-256 |
|---|---:|---:|---|
| 20261005 | 105,759 | 105,753 | `508f93c15eb808c71b0d7c0bccba50b9589041676cd769c40941f9d5427df518` |
| 20261006 | 104,829 | 104,823 | `7a051193a902ad0f7fc95d9c4aaaefeded832d20d5e19b569f69a05b1d820e67` |
| 20261007 | 105,001 | 104,998 | `30403c6f1a9795fd0fa1910b332e0be6be9fe24e04356087ba03da5464bedb6c` |

Every packet, metadata, trajectory, raw-contact and comparison hash is recorded per seed in `results/analysis.json.gz`. The existing [baseline copy ledger](../2026-10-08-w1-episodic-material-shadow/validation/baseline-copies.json) identifies all 13 frozen input files and source Git objects. [preservation.json](validation/preservation.json) verifies those inputs, all original W1 package files, 46 protected production/configuration files, the original topology implementation, and crystallization source/fixtures.

The formation source working-byte SHA-256 is `cee5241d663a509bf51b21533b262fde7447f249d81520375be68bd048cc94bf`; canonical Git blob is `8fca6ddd9a7fef2c91bdfaf5db9e83b77fbf6f8a`. Production `TrailPlateBirth`, `MaterialStratigraphy`, behavior, fields, renderer, audio, substrate and observers are untouched.

The earlier authorized saved-snapshot expansion remains fully documented in the original [INPUT-PROVENANCE.md](../2026-10-08-w1-episodic-material-shadow/inputs/field-decisions/INPUT-PROVENANCE.md) and [input-gap.json](../2026-10-08-w1-episodic-material-shadow/inputs/field-decisions/input-gap.json): all 25 timestamps with four omitted summary cells, exact saved snapshot files/arrays, prior committed matching hashes and packaged input hashes. This continuation consumes the already packaged arrays. It does not read the saved streams again, repack inputs, modify the original run, or rewrite historical summaries/evidence. The earliest seed-05 omission was at 133.017 s, after both character coverage failures at 82.017 and 118.017 s.

## Episode formation and morphology

All counts below include mechanism-frozen episodes with unavailable direction. A geometric freeze is detached shadow output, not a production Plate descriptor or an accepted fully characterized material unit.

| Final measure at 599.25 s | 20261005 | 20261006 | 20261007 |
|---|---:|---:|---:|
| Closed persistent episodes | 108 | 115 | 105 |
| Direction available / unavailable | 68 / 40 | 67 / 48 | 52 / 53 |
| Short discarded closures / open lineages | 15 / 13 | 12 / 22 | 22 / 12 |
| First / last closure, s | 82.017 / 593.150 | 70.017 / 598.233 | 71.017 / 574.850 |
| Duration min / median / max, s | 21 / 50 / 154 | 21 / 48 / 117 | 21 / 48 / 135 |
| Episode area min / median / max, cells | 1 / 1 / 14 | 1 / 1 / 22 | 1 / 1 / 6 |
| One-cell episodes | 69 | 83 | 76 |
| Episodes ≥18-cell review scale | 0 | 1 | 0 |
| Frozen union cells / arena area | 187 / 2.0291% | 186 / 2.0182% | 154 / 1.6710% |
| Frozen union components | 96 | 96 | 98 |
| Frozen largest component share | 9.6257% | 11.8280% | 5.1948% |
| Frozen endpoints / junction-node proxies | 76 / 4 | 62 / 4 | 56 / 0 |
| Frozen holes / skeleton graph cycle rank | 2 / 2 | 2 / 2 | 0 / 0 |
| Frozen hole areas, cells | 1, 1 | 3, 1 | None |
| Frozen substantial holes | 0 | 0 | 0 |
| Frozen isolated components / isolated ≥18 cells | 90 / 1 | 88 / 1 | 86 / 0 |
| Total frozen-cell events / prior-union overlaps | 191 / 4 | 191 / 5 | 155 / 1 |
| Cell-event re-inscription | 2.0942% | 2.6178% | 0.6452% |
| Episode new-area fraction median [Q1, Q3] | 1 [1, 1] | 1 [1, 1] | 1 [1, 1] |
| New frozen cells from 480 s / rate, cells/s | 32 / .26834 | 31 / .25996 | 33 / .27673 |
| Pending union cells / arena area | 6,068 / 65.8420% | 5,963 / 64.7027% | 6,071 / 65.8746% |
| Pending components / largest share | 3 / 99.9670% | 3 / 99.9497% | 1 / 100% |

The near-perfect novelty of tiny closures does not establish useful historical morphology. **228 of 328 closures are one cell.** One seed-06 episode spans 22 cells; it is the only episode reaching the unchanged 18-cell descriptive review scale. The 18-cell frozen component in seed 05 is a world-union component assembled from multiple smaller episodes, not an 18-cell coherent episode. Neither is a substantial closed cycle.

The dominant pending lineage began at 14.017 / 16.017 / 14.017 s, remains open at 599.25 s, and contains 6,061 / 5,958 / 6,068 historical cells. Its ancestry has 937 / 884 / 941 allocated IDs, with 742 / 700 / 696 merge events and 620 / 576 / 587 split events. These are lineage implementation counts, not biological interactions. Persistent merging prevents this history from closing. Sparse frozen output therefore cannot be claimed as successful late-blob avoidance: dense material-like history has accumulated inside one unfinished lineage.

## Matched milestones and historical comparison

| Seed / representation | 120.0167 s cells | 300.0167 s cells | 599.25 s cells |
|---|---:|---:|---:|
| 20261005 — frozen W1 | 14 | 117 | 187 |
| 20261005 — pending W1, unfrozen | 1,503 | 4,616 | 6,068 |
| 20261005 — production history | 231 | 4,377 | 6,149 |
| 20261005 — prior local accretion | 1,014 | 4,326 | 6,002 |
| 20261006 — frozen W1 | 13 | 126 | 186 |
| 20261006 — pending W1, unfrozen | 1,104 | 4,200 | 5,963 |
| 20261006 — production history | 0 | 3,333 | 6,114 |
| 20261006 — prior local accretion | 723 | 3,959 | 5,915 |
| 20261007 — frozen W1 | 10 | 66 | 154 |
| 20261007 — pending W1, unfrozen | 1,263 | 4,352 | 6,071 |
| 20261007 — production history | 0 | 4,072 | 6,458 |
| 20261007 — prior local accretion | 847 | 4,033 | 5,993 |

[milestones.csv](results/milestones.csv) retains component, endpoint/junction, hole, substantial-hole, isolated-component and recent-traffic mismatch metrics for all four representations at each matched time. Exact masks and distributions remain in the compressed analysis. Pending components already account for 99.31–99.81% in one component at 300 s. At the final field observation their shares exceed the previous local-accretion final 99.43–99.72%.

The primary topology measure counts bounded 4-connected background components with 8-connected material. Hole areas are retained individually. A deterministic topology-preserving thinning and documented adjacency supply endpoint/junction proxies and secondary μ = E − V + C. No skeleton is used for formation or audio. The 18-cell disk-sized reference separates material-scale holes from pores for review only; it discards no episode or geometry. All final frozen holes are 1–3-cell pores. Pending mid-run holes reach 52 / 100 / 64 cells, but those are **unfrozen**, and most close/fill before the final observation. Final pending substantial-hole counts are 0 / 2 / 1, with areas 27 and 19 in seed 06 and 21 in seed 07.

Recent activity is trailing-20-s actual foot point-cell occupancy. Frozen versus traffic mismatch is 1 − Jaccard, with empty/empty undefined. At 599.25 s it is .97203 / .99242 / .98424. Frozen cells outside recent traffic are 64.71% / 91.94% / 77.92%. High mismatch is compatible with sparse inactive remnants; it is not evidence of useful memory by itself and does not identify which ant formed which material.

## Character distributions and coverage

The old seed-05 episode 18 now retains the same cell 5636, admission and closure, with consolidation .56862745 and directionalOrder .99422593. Its two actual direction-bearing contacts at 20.69848 and 21.05729 s precede admission by 11.3182 and 10.9594 s and enter the new 20 s interval. Geometry is identical to the earlier stopped episode.

The next seed-05 gap, episode 96 at cell 7239, admits at 65.0167 s and closes at 118.0167 s. Its two local feet occur at 2.0113 and 2.2498 s, about 63 s before admission. Their cumulative contact bit survives, but neither enters the declared recent directional lookback. Across the 141 gaps, eligible missing-direction foot counts are zero: this is interval coverage failure, not failure to reconstruct an eligible foot's direction. Causal cell predicates and earlier feet are retained for every gap in `analysis.json.gz`.

| Axis / seed | Available / total | Min | Q1 | Median | Q3 | Max | Mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| consolidation — 20261005 | 108 / 108 | .12853 | .41918 | .52858 | .61458 | .86957 | .52269 |
| consolidation — 20261006 | 115 / 115 | .13636 | .35897 | .48936 | .61026 | .91304 | .48875 |
| consolidation — 20261007 | 105 / 105 | .13636 | .40476 | .53061 | .62500 | .88889 | .51160 |
| consolidation — pooled | 328 / 328 | .12853 | .40476 | .52083 | .62377 | .91304 | .50724 |
| directionalOrder — 20261005 | 68 / 108 | .03334 | .64503 | .99542 | 1 | 1 | .81396 |
| directionalOrder — 20261006 | 67 / 115 | .18132 | .81434 | .98937 | 1 | 1 | .86034 |
| directionalOrder — 20261007 | 52 / 105 | .14941 | .88512 | .99752 | ≈1 | 1 | .89714 |
| directionalOrder — pooled | 187 / 328 | .03334 | .79801 | .99556 | 1 | 1 | .85371 |

Consolidation has no exact zero/one values. DirectionalOrder has 54 exact ones; 124 of 187 available values occupy histogram bin [.9,1]. The median episode supplies only two unique directional segments, and 60 available episodes supply one. A single positive travel segment has nematic order 1 by definition. Upper-bound clustering therefore partly reflects sparse directional sampling; it cannot establish strongly ordered long formation histories. Pre-admission contacts are inherited by 142 of the 187 available episodes.

| Pooled association | Pearson r | Spearman ρ | Available N |
|---|---:|---:|---:|
| consolidation ↔ directionalOrder | −.06658 | −.05138 | 187 |
| consolidation ↔ episode area | .00449 | −.03697 | 328 |
| consolidation ↔ duration | .33961 | .48753 | 328 |
| consolidation ↔ new-area fraction | −.01654 | −.00303 | 328 |
| directionalOrder ↔ episode area | −.26923 | −.41182 | 187 |
| directionalOrder ↔ duration | −.32035 | −.32312 | 187 |
| directionalOrder ↔ new-area fraction | −.06083 | −.03874 | 187 |

The axes do not collapse into the same observed proxy. Consolidation is not an area proxy here, but correlates moderately with duration; it should not be presented as entirely duration-independent. DirectionalOrder is associated with smaller/shorter episodes and sparse sample counts. Pairwise statistics use only available pairs. Missing coverage is 43.0% and is not assumed random, so these describe the covered subset rather than all episodes. No p-values, uniformization, decorrelation or new acceptance threshold are introduced.

| Birth-period group | Total episodes | Direction available | consolidation mean / median | directionalOrder mean / median |
|---|---:|---:|---|---|
| Early [0,200) s | 153 | 109 | .50221 / .52896 | .80115 / .94561 |
| Mid [200,400) s | 95 | 42 | .49184 / .47826 | .91186 / .999998 |
| Late [400,600) s | 80 | 36 | .53517 / .53021 | .94501 / .999804 |

[character-distributions.json](results/character-distributions.json) contains all seed-specific histograms, sorted ECDF values, quartiles, correlation population counts and temporal groups. These are descriptive distributions, not designed material classes.

## Failure-mode review — empirical / research observations

| Question | Result of this exact family |
|---|---|
| Coherent separate episodes | Mostly tiny closures; one 22-cell episode, 228 one-cell episodes. No broad vocabulary of completed substantial forms demonstrated |
| One huge late component | Dominates pending history in all seeds; the giant lineage does not close within 600 s |
| Arena saturation / dense mass | Frozen union stays below 2.1%, but pending union reaches 64.7–65.9% of the arena and looks dense. A small frozen count is not successful avoidance |
| Continuous background accretion | Late small closures continue at .26–.28 new cells/s while the dominant lineage remains open; no natural large-episode closure is demonstrated |
| Speckle / near-zero useful materialization | Dominant frozen failure: median episode area one cell; isolated tiny residues comprise most frozen geometry |
| Redundant re-inscription | Low frozen-cell re-inscription (.65–2.62%); achieved on very sparse tiny material, so not a sustained novelty victory |
| Hidden tree bias | No source/path/tree rule; real pores occur and ring fixtures preserve topology. Substantial frozen cycles nevertheless absent |
| Universal 2D character | Not achieved: 141 closures lack bounded-window direction. No second estimator or exclusion repairs them |
| Distinct axes | Low cross-axis correlation in the covered subset, but strong upper clustering and small-sample dependence limit directional interpretation |
| Previous local-accretion blob avoided | **Not established as viable material formation.** Dense history is deferred into one unfinished episode |

Allowed research conclusion: extending the single directional estimator to bounded causal pre-admission contacts improves attribution coverage while leaving formation identical. Complete geometry replay exposes an episode-linkage/closure problem and speckled frozen residues. It does not establish broader coherent frozen topology than the current representation, or a complete two-coordinate material ontology.

Plausible mechanism hypothesis, separate from the measurements: same-cell descendant continuity across splits/merges carries a large evolving lineage indefinitely; its accumulated union becomes dense even though individual contrast pulses are finite. Old cumulative contact evidence can also admit cells whose last local contacts precede the bounded directional interval. These associations follow the implemented rules but do not prove biological construction or assign individual ants causal ownership.

## Artistic / modeling interpretation and finite influence

Fixed-scale inspection shows an early fan-like pending history, followed by a broad dense pending mass, with sparse detached frozen remnants. Small fragments could be called fossil-like; that is an artistic description, not a demonstrated useful morphology vocabulary. No meaningful frozen loop/braid class is justified by the 1–3-cell pores. The 18/22-cell isolated frozen-union patches are real topology at the fixed review scale, with the distinction between one episode and several neighboring episodes preserved.

Both defined coordinates are finite and bounded [0,1]. Consolidation's rare extremes remain interior (.1285–.9130); directionalOrder reaches 1 frequently and also includes a low .0333 example. Null values are explicitly unavailable evidence and must not be consumed as numerical material state. There is no current mapping to stiffness, damping, behavior, vibration or sound.

Bounds alone do not guarantee finite future influence. A singular endpoint mapping or multiplication by unchecked area/lifetime/entity count could amplify even bounded character. The giant pending lineage creates an additional entity-size hazard. These risks are identified, not solved or coupled in this pass. Exceptional states remain allowed, but no entity may acquire unbounded influence.

The smallest next **design review**, after this negative result is reviewed, is the definition of episode continuity/closure relative to local history and the mismatch between cumulative support memory and a bounded directional attribution window. This package selects no new rule and runs no second family. W2 material conditions, vitality, movement feedback, audio and acoustic climate remain separately gated.

## Fixed-scale visual and tabular artifacts

- [Matched world masks](plots/matched-world-masks.png): frozen W1, pending W1 (explicitly unfrozen), production and prior local accretion at all three milestones.
- [Matched chemical/mechanical fields](plots/matched-material-fields.png): actual archived field arrays on fixed [0,1] scales.
- [Formation timeline](plots/area-and-formation-timeline.png): full-horizon occupied area and new frozen cells.
- [Character scatter](plots/character-coordinates.png): fixed [0,1] axes, neutral seed colors, paired N/total labels.
- [Histograms / ECDF](plots/character-distributions.png): each axis uses its own measured population; no missing coordinates are plotted as zero.
- `episodes-seed*.png`: deterministic representative actual closures (area/character extrema and first missing-direction exemplar), not a geometry filter. All episodes remain in the numerical archive.
- `pending-right-censored-seed*.png`: actual unfinished lineages, including the dominant dense union.
- [episodes.csv](results/episodes.csv): all 328 closures, times/duration, area, novelty, overlap, both coordinate slots and typed availability.
- [observed-lineages.csv](results/observed-lineages.csv): closed, discarded and right-censored lineage chronology.
- [stop-snapshot-metrics.csv](results/stop-snapshot-metrics.csv): legacy-named **first character-gap diagnostic snapshots**, not replay termination; timestamps are the actual gap times.

SVG exports and [plot-manifest.json](plots/plot-manifest.json) retain exact scales, selected episode IDs and output hashes. Plots support detached morphology review; there is no browser/renderer/audio integration.

## Deterministic reproduction and validation

From repository root, in the recorded Windows environment (Node 22.23.2; pinned Matplotlib 3.11.2 / NumPy 2.3.5):

```powershell
node scripts/ant-w1-analysis.js test-results/w1-character-reproduction/results
uv run --with matplotlib==3.11.2 --with numpy==2.3.5 python scripts/ant-w1-plots.py --input test-results/w1-character-reproduction/results/analysis.json.gz --output test-results/w1-character-reproduction/plots
node scripts/ant-w1-verify.js
node --experimental-test-isolation=none --test tests/ant-material-morphology-metrics.test.js tests/ant-w1-inputs.test.js tests/ant-w1-crystallization.test.js tests/ant-w1-character.test.js tests/ant-w1-analysis.test.js
npm test
npm run build
git diff afa1653ed4798c4f1de0df1f46995dabe0af621e -- scripts/ant-w1-crystallization.js tests/ant-w1-crystallization.test.js docs/ant/evidence/2026-10-08-w1-episodic-material-shadow
git diff 225757b18f29c706d84a7e639c63d6a3543644b4 -- src static package.json package-lock.json AGENTS.md
```

The default analysis output is this new package. An exit code of zero means the structured analysis completed; inspect `status: complete-with-character-gaps` and population counts before making a scientific success claim. The original package is never the output default.

Each seed is analyzed twice internally under a throwing Math.random trap. Separate CLI runs and plot renders are compared byte-for-byte. The verifier independently replays the original 83-observation seed-05 prefix, compares filter/state/lineage counts, and checks episode 18's exact ID, admissions, closure, ancestry and cells against the historical stop. No natural behavior rerun is involved.

**42/42 focused tests and 334/334 full tests pass; build passes.** Existing Rollup annotation/large-chunk warnings remain non-blocking. Logs are in [validation/](validation/). Fixtures cover pre-admission boundaries, same-cell selection, deduplication, reversal/isotropic nematics, weighting, finite/index validation, no future leakage, unchanged consolidation/geometry, explicit null-not-zero coverage, causal filter/lineage closure, rings/pores/diagonal topology and graph cycles.

[reproduction.json](validation/reproduction.json) records exact output comparisons. [checksums.json](checksums.json) records package hashes; its self-hash and staged-byte ledger are excluded to avoid a circular inventory. [staged-byte-verification.json](validation/staged-byte-verification.json) verifies packaged working bytes match the actual staged Git blobs. Working-source hashes describe this checkout's line endings; canonical Git blobs provide source identity across checkouts. Exact plot bytes are verified in the pinned recorded environment.

Remaining limits: three frozen seeds, one 600 s horizon, about 1 s predicate sampling, continuous field amplitudes only at historical milestones, sparse actual directional samples on many tiny closures, nonrandom missing direction, no full causal decomposition of field history, and no test of production adoption, audibility, behavior feedback or biological ant construction. No second family was tried.
