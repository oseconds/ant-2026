# W1 continuation — cumulative causal attribution, complete replay, negative episode morphology

**Decision: character coverage is complete; this exact W1 crystallization family still does not demonstrate a viable coherent material ontology. Preserve the negative morphology result and stop.**

This pass began on 2026-10-08 and resumed on 2026-10-09 with the user's explicit option to revise the single causal attribution window. All three frozen natural histories reach 599.2500000000696 s. No ANT behavior was rerun. Exact crystallization and consolidation remain unchanged. The sole directional estimator now accepts actual same-cell contacts from recorded run start (0 s) through episode closure, matching the cumulative contact predicate that contributes to qualification.

**All 328 mechanism-frozen episodes now have two finite bounded coordinates: 108 / 115 / 105 across seeds 20261005 / 20261006 / 20261007. Directional gaps: zero.** No second estimator, adaptive fallback, size veto, morphology filter, forced closure, new formation family, feedback or production adoption was added. `status: complete` means the frozen inputs and character measurements were processed, not that material-ontology viability passed.

The original [stopped W1 package](../2026-10-08-w1-episodic-material-shadow/README.md) remains byte-identical to `afa1653ed4798c4f1de0df1f46995dabe0af621e`. The initial uncommitted 20 s replay is also preserved in [comparisons/20s-lookback/](comparisons/20s-lookback/comparison-manifest.json), including its original design, character source, compressed analysis and unfinished draft report. That draft is a historical snapshot, not current evidence or a finalized validation report. It was not rerun after the window decision changed.

## Exact definitions and fixed parameters

[DESIGN.md](DESIGN.md) records the current window before its revised replay and the chronology of the earlier choices. The original [formation definition](../2026-10-08-w1-episodic-material-shadow/DESIGN.md) remains authoritative for crystallization. This is an exploratory attribution revision after an observed coverage failure, not an independent confirmatory experiment.

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
| Directional contact interval | [recorded run start (0 s), episode closure], inclusive within 1e−9 s | Single finite causal prefix; no added lookback parameter or recency decay |
| Direction source / weighting | Actual contact cell and time; latest completed consecutive 60 Hz displacement; distance weighting; deduplicate ant ID + segment end | No body-heading replacement, future interpolation, lifecycle bridge or stationary invented direction |
| Missing travel | Typed `NO_VALID_DIRECTIONAL_TRAVEL`; consolidation retained, directionalOrder null | Reporting only; no episode is rejected or removed |

The directional segment lasts at most 1/60 s and finishes by the foot timestamp. Only a completed segment at or before the foot timestamp supplies direction. `maxPreAdmissionContactSeconds` is the largest **contact-to-admission lookback**, not contact duration or the contact's exact EMA contribution. Evidence also reports pre-admission segment count and the legacy segment-boundary exposure separately.

Same-cell feet contributed to accumulated contact evidence. The archive does not assign every chemical/mechanical contribution to those ants. The contact predicate is cumulative from zero initial state. DirectionalOrder is now cumulative local contact-history nematic order as of closure, not a full decomposition of chemical/mechanical or EMA contributions. Old contacts keep their original travel weights; there is no recency decay. Contacts can be reused by later overlapping episodes, so episode rows are dependent. No individual-ant causal ownership or recent-flow interpretation follows.

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

All counts retain the exact mechanism-frozen geometry. Each current closure has both character coordinates. A shadow freeze is not a production Plate descriptor or an accepted viable material unit. [window-comparison.json](validation/window-comparison.json) compares every episode and all 599 history rows per seed against the saved 20 s analysis: geometry, novelty, consolidation, inputs and right-censored/discarded lineages are identical.

| Final measure at 599.25 s | 20261005 | 20261006 | 20261007 |
|---|---:|---:|---:|
| Closed persistent episodes | 108 | 115 | 105 |
| Direction available / unavailable | 108 / 0 | 115 / 0 | 105 / 0 |
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

## Character distributions and attribution comparison

The original seed-05 episode 18 retains cell 5636, its admissions/closure, consolidation .56862745 and directionalOrder .99422593. The earlier bounded window already included its two contacts about 11 s before admission. The later episode 96, cell 7239, now inherits its contacts at 2.0113 / 2.2498 s before admission at 65.0167 s. It closes at 118.0167 s with unchanged consolidation .59259259 and newly available directionalOrder .99283719. Its maximum contact-to-admission lookback is 63.0054 s.

| Directional attribution | Available / all episodes | Pooled mean | Pooled median | Exact ones |
|---|---:|---:|---:|---:|
| Initial 20 s pre-admission lookback | 187 / 328 | .85371 | .99556 | 54 |
| Revised run-start through closure | 328 / 328 | .66190 | .68053 | 0 |

These distributions have different coverage populations; the old complete-case subset is not assumed representative. The new window is selected from cumulative-input semantics, not to improve the table or spread the axes. The same 328 geometry/consolidation records are retained, and all 141 old coverage gaps are resolved without excluding their episodes. The exact prior result and per-seed comparison remain in the evidence.

| Axis / seed | N | Min | Q1 | Median | Q3 | Max | Mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| consolidation — 20261005 | 108 | 0.12853 | 0.41918 | 0.52858 | 0.61458 | 0.86957 | 0.52269 |
| consolidation — 20261006 | 115 | 0.13636 | 0.35897 | 0.48936 | 0.61026 | 0.91304 | 0.48875 |
| consolidation — 20261007 | 105 | 0.13636 | 0.40476 | 0.53061 | 0.62500 | 0.88889 | 0.51160 |
| consolidation — pooled | 328 | 0.12853 | 0.40476 | 0.52083 | 0.62377 | 0.91304 | 0.50724 |
| directionalOrder — 20261005 | 108 | 0.07112 | 0.43803 | 0.66397 | 0.88601 | ≈1 | 0.63464 |
| directionalOrder — 20261006 | 115 | 0.10390 | 0.44158 | 0.63790 | 0.87191 | ≈1 | 0.64510 |
| directionalOrder — 20261007 | 105 | 0.05257 | 0.55126 | 0.74542 | 0.93796 | ≈1 | 0.70833 |
| directionalOrder — pooled | 328 | 0.05257 | 0.46999 | 0.68053 | 0.90788 | ≈1 | 0.66190 |

Consolidation has no exact zero/one values. DirectionalOrder has no exact zero/one values either; its maximum is .9999999995958542 and 86 of 328 values occupy histogram bin [.9,1]. Every episode inherits positive pre-admission directional segments. Unique segment support has min 2, median 4, max 66; 75 episodes still have only two segments. High order from sparse local samples does not demonstrate stable material anisotropy or persistent continuous flow.

Maximum observed contact-to-admission lookback is **463.446 / 530.032 / 486.268 s** across the three seeds. The long memory is substantive: this axis describes inherited cumulative history, not recent directional activity. Multiple episodes can reuse the same old local contacts. Broadly different values are observed without any distribution tuning, but the values remain conditional on this attribution model.

| Pooled association | Pearson r | Spearman ρ | N |
|---|---:|---:|---:|
| consolidation ↔ directionalOrder | -0.01738 | -0.02102 | 328 |
| consolidation ↔ occupiedCells | 0.00449 | -0.03697 | 328 |
| consolidation ↔ durationSeconds | 0.33961 | 0.48753 | 328 |
| consolidation ↔ newAreaFraction | -0.01654 | -0.00303 | 328 |
| directionalOrder ↔ occupiedCells | -0.21487 | -0.33848 | 328 |
| directionalOrder ↔ durationSeconds | -0.12413 | -0.13297 | 328 |
| directionalOrder ↔ newAreaFraction | -0.04838 | 0.03544 | 328 |

The axes do not collapse into the same observed proxy: their pooled correlation is near zero. Consolidation is not an area proxy here, but correlates moderately with duration. DirectionalOrder has a moderate negative rank association with area and a weaker duration association. These descriptive episode correlations are not population inference: local samples, cells and episodes can share history, and only three independent seed runs were analyzed. No p-values, artificial decorrelation, uniformization or new acceptance threshold are introduced.

| Birth-period group | Episodes | consolidation mean / median | directionalOrder mean / median |
|---|---:|---|---|
| Early [0,200) s | 153 | 0.50221 / 0.52896 | 0.65184 / 0.67333 |
| Mid [200,400) s | 95 | 0.49184 / 0.47826 | 0.70732 / 0.74820 |
| Late [400,600) s | 80 | 0.53517 / 0.53021 | 0.62721 / 0.64310 |

[character-distributions.json](results/character-distributions.json) contains all seed-specific histograms, sorted ECDF values, quartiles, correlation counts and temporal groups. These are descriptive coordinates, not designed material classes or quality scores.

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
| Universal 2D character | Achieved numerically for all 328 closed episodes under cumulative local history; zero gaps, no replacement estimator or exclusion |
| Distinct axes | Low cross-axis correlation across all episodes; sparse samples, inherited old history and repeated attribution limit interpretation |
| Previous local-accretion blob avoided | **Not established as viable material formation.** Dense history is deferred into one unfinished episode |

Allowed research conclusion: revising the single directional interval to the cumulative causal contact prefix resolves all measured coverage gaps without changing formation or consolidation. Two distinct bounded coordinates are measurable on every closure. Complete geometry replay still exposes an episode-linkage/closure problem and speckled frozen residues. This family does not establish broader coherent frozen topology or a viable material ecology.

Plausible mechanism hypothesis, separate from the measurements: same-cell descendant continuity across splits/merges carries a large evolving lineage indefinitely; its accumulated union becomes dense even though individual contrast pulses are finite. Old cumulative contact evidence can admit cells long after their last actual local contacts; the revised axis retains that history explicitly. These associations follow the implemented rules but do not prove biological construction or assign individual ants causal ownership.

## Artistic / modeling interpretation and finite influence

Fixed-scale inspection shows an early fan-like pending history, followed by a broad dense pending mass, with sparse detached frozen remnants. Small fragments could be called fossil-like; that is an artistic description, not a demonstrated useful morphology vocabulary. No meaningful frozen loop/braid class is justified by the 1–3-cell pores. The 18/22-cell isolated frozen-union patches are real topology at the fixed review scale, with the distinction between one episode and several neighboring episodes preserved.

Both defined coordinates are finite and bounded [0,1]. Consolidation's rare extremes remain interior (.1285–.9130); directionalOrder approaches 1 and includes a low .0526 example, but has no exact boundary values in this replay. Typed missing-data handling remains available; any future null must not be consumed as numerical material state. There is no current mapping to stiffness, damping, behavior, vibration or sound.

Bounds alone do not guarantee finite future influence. A singular endpoint mapping or multiplication by unchecked area/lifetime/entity count could amplify even bounded character. The giant pending lineage creates an additional entity-size hazard. These risks are identified, not solved or coupled in this pass. Exceptional states remain allowed, but no entity may acquire unbounded influence.

The smallest next **design review**, after this negative result is reviewed, is the definition of episode continuity/closure relative to local history. Any future use of the cumulative directional axis must also address stale/reused history. This package selects no new rule and runs no second family. W2 material conditions, vitality, movement feedback, audio and acoustic climate remain separately gated.

## Fixed-scale visual and tabular artifacts

- [Matched world masks](plots/matched-world-masks.png): frozen W1, pending W1 (explicitly unfrozen), production and prior local accretion at all three milestones.
- [Matched chemical/mechanical fields](plots/matched-material-fields.png): actual archived field arrays on fixed [0,1] scales.
- [Formation timeline](plots/area-and-formation-timeline.png): full-horizon occupied area and new frozen cells.
- [Character scatter](plots/character-coordinates.png): fixed [0,1] axes, neutral seed colors, N/total labels.
- [Histograms / ECDF](plots/character-distributions.png): each axis uses its own measured population; no missing coordinates are plotted as zero.
- `episodes-seed*.png`: deterministic representative actual closures (area/character extrema; a missing-direction exemplar only if one exists), not a geometry filter. All episodes remain in the numerical archive.
- `pending-right-censored-seed*.png`: actual unfinished lineages, including the dominant dense union.
- [episodes.csv](results/episodes.csv): all 328 closures, times/duration, area, novelty, overlap, both coordinate slots and typed availability.
- [observed-lineages.csv](results/observed-lineages.csv): closed, discarded and right-censored lineage chronology.
- [stop-snapshot-metrics.csv](results/stop-snapshot-metrics.csv): legacy first-gap diagnostic schema; header only in the current zero-gap replay. The saved 20 s artifact retains its earlier gap snapshots.

SVG exports and [plot-manifest.json](plots/plot-manifest.json) retain exact scales, selected episode IDs and output hashes. Plots support detached morphology review; there is no browser/renderer/audio integration.

## Deterministic reproduction and validation

Tooling commit: `d0908048038cdb19ed378beca223b78df64c6726` on `ant-w1-episodic-material-shadow`. The continuation starts from `afa1653ed4798c4f1de0df1f46995dabe0af621e`, whose main base is `225757b18f29c706d84a7e639c63d6a3543644b4`. Generated evidence and the 2026-10-09 chronology are committed separately; the evidence commit and verified remote HEAD are reported after push.

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

The default analysis output is this new package. An exit code of zero means the structured analysis completed; inspect `status: complete`, population counts and the negative morphology findings before making a scientific success claim. The original package is never the output default.

Each seed is analyzed twice internally under a throwing Math.random trap. Separate CLI runs and plot renders are compared byte-for-byte. The verifier independently replays the original 83-observation seed-05 prefix, compares filter/state/lineage counts, and checks episode 18's exact ID, admissions, closure, ancestry and cells against the historical stop. No natural behavior rerun is involved.

**43/43 focused tests and 335/335 full tests pass; build passes.** Existing Rollup annotation/large-chunk warnings remain non-blocking. Logs are in [validation/](validation/). Fixtures cover pre-admission boundaries, same-cell selection, deduplication, reversal/isotropic nematics, weighting, finite/index validation, no future leakage, unchanged consolidation/geometry, explicit null-not-zero coverage, causal filter/lineage closure, rings/pores/diagonal topology and graph cycles.

[reproduction.json](validation/reproduction.json) records exact output comparisons. [checksums.json](checksums.json) records package hashes; its self-hash and staged-byte ledger are excluded to avoid a circular inventory. [staged-byte-verification.json](validation/staged-byte-verification.json) verifies packaged working bytes match the actual staged Git blobs. Working-source hashes describe this checkout's line endings; canonical Git blobs provide source identity across checkouts. Exact plot bytes are verified in the pinned recorded environment.

Remaining limits: three frozen seeds, one 600 s horizon, about 1 s predicate sampling, continuous field amplitudes only at historical milestones, sparse actual directional samples on many tiny closures, stale/reused cumulative attribution, no full causal decomposition of field history, and no test of production adoption, audibility, behavior feedback or biological ant construction. No second family was tried.
