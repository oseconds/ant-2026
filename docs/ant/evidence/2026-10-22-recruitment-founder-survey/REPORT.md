# Recruitment / founder-condition responsibility survey

## Scope and decision boundary

This pass isolates the continuing accepted-spawn heading condition, then screens two world-conditioned heading shadows. It does not adopt a production algorithm, move the nest, change the selector, implement scripted phases or establish exhibition readiness. The fixed spawn center is not causally manipulated here.

Baseline is freshly fetched `origin/main` at `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. Branch `codex/ant-recruitment-founder-survey-20261022` starts directly there; it does not inherit prior research audio/renderer source. The earlier visual MIXED diagnosis (`deda54e6b3419af1abbfb6263adf81c4ac462a66`) and 18-minute audio result (`c1332b8e686fd9f7099c8b33a8a017b6ce31cf63`) are context, not production baselines or new measurements.

## IMPLEMENTATION FACT — what was actually held fixed

Production recruits in a disk centered at (0.5,0.72), radius 0.018. Heading is centered at −π/2 with half-spread 0.3 radians. The center is an entry region, not a return destination. `ColonyActivation` samples 16 angular sectors at three radii, but sorts their evidence and uses the top-four mean for scalar population response. Direction is discarded by that population law. `TrailPlateBirth` separately retains its fixed source-connected selection rule.

Only isolated, source-guarded dynamic controller modules transform the accepted heading expression. The original accepted-heading uniform variate is used once, before ordinary AntAgent personality draws. Ordinary position draws, clearance retries, spawn interval law, scalar activation, lifecycle, movement, deposition, gait/contacts, SurfaceField, immutable Plate formation, stratigraphy and retained-material locomotion resistance remain the original implementations. No audio resource is created. No `src/` or `static/` file is edited.

Unlike older founder/long-run scripts, these runs keep the adopted material locomotion resistance enabled. The [source audit](SOURCE-AUDIT.md) distinguishes the shared seed from subsequent shared-RNG path divergence. [PLAN.md](PLAN.md) records the control matrix and the later family selection before their respective executions.

## MEASURED RESULT — Stage A heading-only controls

Three seeds (`20261005`, `20261006`, `20261007`) each ran baseline, static +π/2 rotation, π reversal and isotropic initial headings for 600 simulated seconds at fixed 1/60-second steps. Every recruit, including the initial ant, receives the chosen law. These are static diagnostic conditions, not spontaneous phases.

The baseline shadow was paired against a directly imported production controller for all 36,000 tick RNG boundaries per seed, checkpoint/final public snapshots and contact hashes. A separate focused test compares protected private/controller state, fields, material and events every tick over its bounded test interval. No such all-time equality is expected after a heading intervention.

The following are equal-seed averages over **nominal integer-second frames 300–600, endpoints included** (301 samples per run). Capture labels are rounded to the nearest integer second only after checking their deviation is below 1e−6 seconds; raw timestamps are retained. See the final [matched-window correction](analysis/matched-window-correction.json). Samples within a run are serially dependent; the three seeds are the replication units.

| Initial heading condition | Population centroid x | Population centroid y | Fraction south of nest |
| --- | ---: | ---: | ---: |
| Production north | 0.4897 | 0.4628 | 0.0620 |
| Static +π/2 | 0.6829 | 0.6173 | 0.3810 |
| Static π reversal | 0.5085 | 0.8200 | 0.9072 |
| Isotropic | 0.4934 | 0.5911 | 0.3660 |

All three seeds show the same large directional pattern. Fixed-heading samples have accepted-spawn resultant lengths about 0.985; isotropic headings have resultants 0.013–0.020. The intervention produced its intended distribution. The original [Stage A receipt](analysis/stage-a-receipt.json) and [per-seed summary](analysis/stage-a-summary.md) retain the original analysis, including RNG/spawn comparisons. Their float-boundary means are superseded by the matched-window correction for the table above. Pheromone moments are retained in the raw 1 Hz frames; the corrected route-field images show a descriptive spatial difference, separately from this numeric ant table.

**Founder-bias responsibility: SUPPORTED for the continuing heading component, within these runs.** Removing/rotating that condition materially changes measured colony spatial distribution. The fixed position component remains untested, and no hours-long attractor theorem is established. This is stronger than an inference from two screenshots, but narrower than saying the nest location alone determines the artwork.

### Causal limits of the controls

The domain is a finite unit square, asymmetric about a nest at y=0.72. A reversed ant reaches the lower exit sooner; population and recruitment consequences therefore differ. Keeping the population law unchanged is not keeping the realized population/count/timing identical. The controller does not preserve a fixed population by culling or injecting matched agents.

The first RNG state/call mismatch occurs at a pre-tick boundary between 0.47 and 1.97 seconds, depending on seed/control; first accepted-spawn timing divergence follows at 1.13–3.93 seconds. Movement changes conditional intention draws, collision/placement retries, exits and activation. The result is the **total endogenous effect** of a heading-law intervention under the existing shared stream. It is not strict all-time common-random-number attribution, an isolated first-founder effect or a pure rotation of a symmetric world.

## ARTISTIC / PERCEPTUAL JUDGMENT — static distributions

The artist reviewed the corrected fixed-viewport [600-second comparison](visual/final/comparison-600s.png) and answered:

> 전체 공간 분포 차이가 읽힌다

The panel order is baseline, +π/2, reversal, isotropic. This establishes a human-observed difference among imposed conditions in that image. It does not show a single run changing regimes over time, prefer any control aesthetically, or validate a production recruitment mechanism.

The authoritative Stage A assets use actual AntRenderer at 640×640 per panel, DPR 1, installed headless Chrome. The original unselected images accidentally omitted typed-array environmental fields after JSON serialization removed `.length`; a validated renderer-only projection restores exact contiguous grid values. Raw captures were not changed. [Corrected manifest](visual/final/manifest.json) records hashes and dimensions. The artist's judgment references the corrected image.

## Conditioning possibility map and selection

The [family map](FAMILY-MAP.md) keeps local pheromone occupancy, actual outgoing flow, congestion, global distribution, shared memory and egress position distinct. Whole-scene centroid feedback risks a hidden composition objective. Moving ports mixes position/clearance with heading. Congestion would add another causal input; it is not combined here.

A baseline 1 Hz availability screen found at least three eligible outward segments in the predeclared 0.018–0.085 neighborhood in only 13.3–15.7% of frames. This uses last-tick post-collision velocity with an approximate midpoint, not all-tick segment capture. It does not establish that flow is unusable. It supports selecting the already sampled pheromone-sector evidence as the less gate-dependent representative input before conditioned runs. No gate was relaxed to obtain a positive flow result; that family remains unexecuted.

### Executed rules

`pheromoneDirect` uses the first circular moment q of the same 16×3 bounded sector samples used by activation, divided by their total weight. `pheromoneSlow` filters the same q through a shared vector g with a fixed 45-second exponential time constant. Both use completed-tick evidence for the next tick's possible spawn. At initialization there is no evidence and the heading is isotropic.

For applied vector v, use R=|v| and φ=arg(v), half-spread `w=π−(π−0.3)R`, then `heading=wrap(φ+(2U−1)w)`. Empty or normalized R≤1e−9 uses the exact matched isotropic transform of U. Scalar activation/count response stays unchanged. Zero q decays slow g instead of resetting it. 45 seconds is borrowed as a diagnostic contrast from the existing scalar activation timescale, not biology or an optimized parameter.

This rule is **coherence-only**: dividing by total sector weight discards absolute evidence strength. Even a very weak but one-sided field can have R near one. Uniform or balanced opposite fields can have R near zero despite strong scalar activation. The policy's influence is therefore not automatically weak merely because pheromone amplitude is weak. Applied total weight, resultant and spread must be interpreted together. Smoothing also changes vector magnitude and thus heading spread, not only directional persistence.

The frozen finite matrix adds two families × three seeds × 600 seconds, followed by baseline/isotropic/direct/slow for one preselected seed at 1,800 seconds. These are accelerated model runs. No history cap, audio, renderer or selector parameter is changed.

## Stage B results

All six 600-second conditioning runs and four 1,800-second extensions completed with no reported model errors. The 600-second shadows applied finite directional evidence at 799–885 accepted spawns per case, with only 2–4 exact-isotropic fallbacks. Thus the link was actually exercised; it was not an inactive candidate.

| Nominal 300–600 s, three-seed mean | Centroid x | Centroid y | South fraction | Velocity polarization |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 0.4897 | 0.4628 | 0.0620 | 0.5983 |
| Isotropic | 0.4934 | 0.5911 | 0.3660 | 0.2659 |
| Pheromone direct | 0.5057 | 0.6085 | 0.3762 | 0.2487 |
| Pheromone slow | 0.4852 | 0.5917 | 0.3533 | 0.2542 |

The conditioned families track the isotropic control much more closely than fixed north. These descriptors show no consistent additional spatial or alignment advantage for direct, or slow over direct. This is descriptive comparison, not a statistical equivalence test. Lower polarization is not automatically greater artistic diversity.

| Seed 20261005, nominal 600–1800 s | Centroid x | Centroid y | South fraction | Velocity polarization |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 0.5065 | 0.4479 | 0.0522 | 0.6074 |
| Isotropic | 0.5025 | 0.6009 | 0.3592 | 0.2330 |
| Pheromone direct | 0.5025 | 0.5992 | 0.3748 | 0.2249 |
| Pheromone slow | 0.5039 | 0.5967 | 0.3705 | 0.2198 |

Each extension mean has 1,201 nominal frames. This one seed sustains the same broad distinction for 30 simulated minutes; it does not establish multiple distinct regimes or a multi-seed long-run attractor. Exact RNG/contact/spawn prefixes and equal numeric snapshot/agent values confirm the baseline/isotropic first 600 seconds reproduce Stage A. Container shape and tiny endpoint labels are accounted for without changing numeric state values.

The [Stage B v2 receipt](analysis/stage-b-v2-receipt.json) and [summary](analysis/stage-b-v2-summary.md) record q/g persistence, multi-lag autocorrelation, applied heading evidence and raw input hashes. Use the matched-window correction for all final time means. No mode-count threshold was invented. Continuous traces and their autocorrelations do not demonstrate circulation or coherent procession by themselves.

### Strength versus coherence

The observed input was not generally a nearly empty field: 1 Hz q total-weight means are about 7.66–8.18 on the 0–16 bounded-sector scale; accepted-spawn means are about 7.96–8.51. Nevertheless direct qR means are only 0.134–0.211, and slow input qR means 0.086–0.108 with filtered magnitudes 0.056–0.077. Mean applied R is about 0.122–0.162 direct and 0.054–0.075 slow. Nontrivial total sector weight coexisted with low mean first-moment coherence; this produced a modest average heading concentration. Filtering further changes magnitude and spread. Low first-moment coherence alone does not identify the angular distribution's shape.

This does not prove the absence of useful chemical organization. A first circular moment can cancel multiple directions, and the policy does not preserve a multimodal sector distribution. Such a distribution was not independently characterized here, so a sector-CDF solution is an untested alternative, not a demonstrated fix. The absolute-strength caveat remains even though the recorded mean weights were substantial; weight/coherence correlations are descriptive and cannot establish strength causation.

### Human temporal judgment

The artist reviewed [direct](visual/extension/timeseries-pheromoneDirect.png) and [slow](visual/extension/timeseries-pheromoneSlow.png) at fixed 5/10/15/30-minute states and answered:

> 국소 변화는 있지만 큰 인상은 비슷하다

This does not support an artistically successful temporal-regime candidate. It coexists with the earlier positive judgment of **different static heading conditions**. [Extension manifest](visual/extension/manifest.json), same-time comparisons and CSV/SVG traces preserve the exact inspected assets and clocks.

## Unchanged material downstream

Movement differences were large enough to justify observing the existing selector. It did not erase all of them: at 600 seconds the material-union centroid y ranges are about 0.35–0.39 baseline, 0.52–0.55 under +π/2, 0.84–0.85 under reversal and 0.54–0.59 isotropic. The fixed source anchor does not force identical material footprints for these very different movement inputs.

Within the one-seed 1,800-second runs, early-versus-late birth-cohort union IoU is 0.891 baseline, 0.635 isotropic, 0.602 direct and 0.680 slow; late-cohort new area relative to the early union is 474/2,663/3,003/2,274 cells respectively. These are within-run early/late unions, not cross-variant IoU or perceptual diversity scores. They show more of the changed movement envelope entering retained geometry; they do not establish meaningful regime turnover beyond the isotropic control. Counts, exact cohort definitions, immutable masks and endpoints are in the v2 material section. No selector law changed.

An important countereffect is **faster material occupancy**, rather than renewable empty space. At 1,800 seconds in this single seed `20261005`, baseline/isotropic/direct/slow have 110/89/106/102 Plates and occupy 6,999/8,073/8,534/8,727 of 9,216 source-grid cells. Broadening recruitment can fill more of the fixed world sooner. It does not undo append-only occupancy or guarantee different later macro impressions. The material output also retains directional structure: the **600–1800-second birth-cohort** isotropic/direct/slow principal-path endpoint mean angles remain near north (about −1.60 radians, resultant 0.77–0.83), despite ants spread across the field in the same-seed snapshots. These are late-cohort statistics, not the combined final 0–1800 endpoint statistics. Some movement differences enter the retained masks, while the shared endpoint tendency is **consistent with partial compression by the unchanged source-connected selector**. That attribution is a design interpretation, not an isolated selector intervention. Neither “identical output” nor “all movement variety retained” is supported.

The historical v2 field `meanLengthGridCells` is mislabeled: its values are normalized-domain Euclidean distances. The [annotation](analysis/material-endpoint-length-label-annotation.json) preserves the old artifact and executed source; the current exporter uses `meanLengthNormalizedDomainUnits`. This length is not used to judge success.

## Decision and one next closed pass

- **Founder heading responsibility: SUPPORTED**, for continuing recruitment heading in these finite runs. Position/nest responsibility is **INCONCLUSIVE** because it was not manipulated.
- **State-conditioned recruitment: no supported production candidate.** The tested circular-moment direct/slow chemical policies did not establish a clear additional temporal/spatial benefit over matched isotropic recruitment. Slow shared memory is not justified by these results.
- The evidence rejects a renderer-only account of the static north-heavy colony distribution. It does not reject the earlier MIXED account of accumulated material, nor establish that a new recruitment rule solves hours-long visual composition.

The most informative **next single mechanism hypothesis** is instantaneous **actual local outgoing-flow-conditioned heading**, not another smoothing parameter or a combined congestion/global feedback rule. It uses a different signed transport signal rather than accumulated chemical occupancy. This is a conditional research recommendation, not a claim that the family is viable.

Its first locked gate must measure actual post-collision completed tick segments and support **at accepted-spawn opportunities**, over the same seeds and unchanged natural baseline. Keep the previously stated ring 0.018<r≤0.085, speed≥0.008, outward radial motion and N≥3 fixed; do not relax them after seeing low support. Specify the availability acceptance criterion before that closed pass. If support is too sparse to create the declared contrast, stop with no candidate. The existing 1 Hz screen is insufficient to waive this gate.

If the gate passes, test only direct flow q with the same concentration/spread law and isotropic null, no slow state, congestion modifier, moving port or selector change. The proposed q is the equal-weight mean of each eligible segment's unit direction, one segment per ant on the previous completed tick; N<3 or resultant≤1e−9 is zero/isotropic. Freeze that normalization and the availability criterion before a linked candidate run. Causal hypothesis: realized coherent outward traffic predicts a meaningful heading-conditioned transport continuation beyond removing north bias. Preserve scalar population/cadence law, position, RNG draw structure, movement/material/audio/renderer. Failure modes include sparse/zero input, chance-route lock-in, changing population/exit rates, an output near isotropic, or a fixed new attractor without transitions. Validate actual q usage, all-tick support/clock mapping, fixed-seed manipulation/nulls, multi-seed continuous spatial/flow persistence, unchanged material downstream, and human fixed-view temporal judgment. A positive result would still require a separate adoption decision.

Sector-distribution sampling, congestion and egress-port selection remain explicit alternatives, not extra work performed here. Nothing in this survey establishes biological social roles, leaders or milling behavior.

## Tooling/provenance corrections and operational limits

- Stage A's descriptor field `gyrationRadius` was initially RMS distance from the nest. Its immutable raw value is retained; actual centroid dispersion is derived as `sqrt(cov.xx+cov.yy)`. The current helper separately names `rmsRadiusFromNest` and corrects gyration radius. Exact executed Stage A sources are preserved.
- Typed grids encoded as numeric-key objects remain lossless but need validated projection for rendering. New Stage B serialization emits arrays; analysis compares normalized grid values, not accidental JSON container shape.
- The first 1,800-second baseline attempt completed its model steps but failed a strict `===600` prefix lookup because of floating-point clock rounding. That attempt is not a successful result. Its receipt/source are preserved; the audit-only lookup tolerance was corrected to 1e−6 seconds before the rerun. World/policy code was not tuned.
- Initial analysis predicates also dropped nominal endpoint frames. The final matched-window receipt uses capture tick labels, checks all label deviations and expected 301/1,201 counts, and preserves the original analyses unchanged. No world run was repeated for this correction.
- Angular momentum, polarization and circular concentration are diagnostic descriptors. None alone establishes biological milling, coherent procession, roles or a mode count.
- No new real-time browser soak, audio test, venue test or hours-long run is performed. Headless Chrome is used for frozen-state still rendering only. The previous exhibition readiness limits remain unchanged.
- Actual model scope is 22 successful cases: 18×600 seconds and 4×1,800 seconds, plus the separately failed audit attempt. Maximum successful duration is 30 simulated minutes; maximum retained Plate count is 110. Natural production capacity is unchanged and was not reached in this matrix.

Final tests/build, lossless raw packing and independent-review dispositions are indexed in [README.md](README.md) and [REVIEW.md](REVIEW.md).

Final repository tests: **346 passed, 0 failed**, with the complete [fixed TAP log](validation/full-npm-test-fixed.tap). The first full run's missing `node:test` import failure is retained separately; the import was fixed and the full suite rerun. Build passed with existing warnings; [build log](validation/full-npm-build.log). The 44 large raw manifest/birth JSON files are losslessly packed (638,281,738 bytes to 18,954,760 bytes), verified against original and packed hashes, and restored by the unpack helper for reproduction. Original JSON remains unchanged locally; packed bytes are the committed representation.
