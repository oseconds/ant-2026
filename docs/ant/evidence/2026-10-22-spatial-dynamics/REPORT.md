# ANT spatial dynamics: responsibility chain and research decision

## Decision

The research found a reproducible movement limitation and a useful counterfactual, but **no integrated long-run exhibition candidate**. Reducing the delayed angular feedback changes natural trajectory geometry across three seeds. It does not establish coherent shared curved routes, spontaneous colony-scale regime renewal, or better persistent composition. A single-seed two-hour model comparison gives an important counterexample: the candidate initially produces fewer Plates and less occupied area, then covers **99.20%** of the material grid by two hours, versus **77.34%** for production. Smoother local movement can accelerate late spatial filling even with fewer Plates.

Direct signed-flow recruitment had enough measurable input to run, but its effect beyond isotropic recruitment was mixed. It was not combined with movement. The fixed field replay confirms phase-sensitive cues but fails its preregistered advance gate; no CIC field or selector intervention was run. Production source, renderer, audio, storage cap and canonical status remain unchanged.

This package began on 2026-10-22 and was finalized on 2026-10-23 KST. It uses freshly fetched `origin/main` **`8c60e4bba3bd5b476300e90a2936bfebd1f831c2`**, on research branch `codex/ant-spatial-dynamics-research-20261022`. Prior branches supplied evidence and individually named tooling, not a merged implementation. `world-model.md` is a future design contract. Archive paths were excluded.

## Implementation facts and manipulation validity

The research controller is constructed only by [ant-spatial-core.js](../../../../scripts/ant-spatial-core.js). It reads current production source and asserts that each replaced expression occurs exactly once. It exposes three movement conditions and three recruitment conditions; no application startup mode uses it.

| Mechanism | Deliberate change | Preserved immediate laws | Endogenous consequences and interpretation |
| --- | --- | --- | --- |
| `dtFeedback` | Multiply only `steeringAngularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence` by `dt` | Decision scoring, final blend, sensors, turn cap, velocity response, occupancy, gait, deposit, lifecycle, activation, recruitment heading, formation and stratigraphy | Different travel changes exits, accepted-spawn timing, later RNG consumption, contacts, field and history. Outcomes are total natural consequences of this intervention, not all-time RNG-paired effects. |
| `dampingOff` | Replace only that term with zero | Same laws as above | Diagnostic removal, not a production fix or intended exhibition law. |
| `isotropic` | Accepted heading becomes `-pi + 2*pi*U` | Accepted position, retries, clearance, timing rules, all movement and material laws | Initialization is also isotropic. The pair with flow isolates additional conditioning beyond removing north bias. |
| `flow` | Heading uses current completed-tick eligible outward segments; invalid input is exactly isotropic | Same single heading RNG draw, fixed position/timing rules, production movement/field/selector/history | Directional conditioning can alter its own later input availability. No additional memory, congestion, target or phase state exists. |
| Field replay | Prescribed paired source paths and sampling poses, not a natural-world intervention | Exact production field, body pose, gaster, sensors and decision score | Measures controlled phase transfer. It does not measure natural incidence or realized turning. |

The north observer preserves the original heading expression numerically and consumes no extra RNG. Public snapshots and RNG state matched plain production over 600 ticks. Spawn flow was checked against the completed movement of that same tick before the accepted heading; initialization has no completed segments. All natural runs use fixed `1/60 s` steps and seeds `20261005/06/07`, with seed `20261005` preselected for the two-hour extension. Production material capacity stays **256**. No higher-cap arm, old-history deletion, recruitment cadence tuning or formation change was used.

The new factor is a **large reduction**, not a proven unit fix: the maximum raw feedback contribution at adherence one changes from `1.43 rad` to `0.0238 rad` at 60 Hz, before the existing local clamp. The old coefficient can instead be interpreted as a time constant. No whole-controller timestep-invariance or unique optimal damping claim is made.

## Executed evidence

| Workstream | Actual scope | Evidence |
| --- | --- | --- |
| Audit | Current production chain; exact prior founder, curvature, visual and exhibition references | [Source audit](AUDIT.md), [frozen plan and staged decisions](PLAN.md) |
| Controlled movement | 108 fresh cases: six geometries, analytic and deposited cues, three seeds, three conditions, three seconds each | [Protocol](movement/protocol.md), [results](movement/results.md), lossless controlled capture |
| Natural movement | Three production baselines; three `dtFeedback`; one damping-off diagnostic; 600 model seconds each | [Baseline](baseline/README.md), [movement results](movement/results.md) |
| Field | Eight route profiles, two raster phases, three readout stations; thorax continuous, gaster continuous and gaster dabs | [Field report](field/REPORT.md), [protocol](field/PROTOCOL.md) |
| Recruitment | Production movement with isotropic versus direct flow, three seeds each, 600 model seconds | [Recruitment comparison](recruitment/natural/analysis/ANALYSIS.md) |
| Continuous/material readout | Explicit run inputs, 1 Hz state, 10 Hz trajectories, actual candidate and immutable born paths | [Analysis guide](analysis/README.md), corrected baseline/natural outputs |
| Long-run consequence | Production versus `dtFeedback`, one seed each, **7,200 model seconds** | [Long-run analysis](analysis/validated/long-run-final/README.md), [prefix equality](validation/long-prefix-parity.json) |

The prior controlled raw capture failed strict replay compatibility, despite matching selected production file hashes. Consequently all 108 controls were run fresh; old and new controls were not mixed. The old raw file remains outside this commit. Exact per-run source copies and SHA-256 receipts preserve executed bytes. Some early baseline metadata used misleading spread labels; [baseline notes](baseline/README.md) identify them. Applied north spread was always 0.3 radian.

## Measured natural and controlled results

### Movement: a strong local effect, with counterexamples

Across the three 600 s seeds, mean one-second realized path-turn persistence rose from **0.0977 to 0.8487**; adjacent-tick path-turn correlation within those windows changed from **-0.6230 to +0.7832**; turn-cap occupancy fell from **0.8793 to 0.1455**. Lag one means one 1/60-second sample, not one second. Absolute one-second turn fell from **1.3515 to 1.0517 rad**. This distinguishes reduced alternation from merely adding more turning. Chord/path fell from 0.9900 to 0.9602, but neither that ratio nor aggregate momentum is an aesthetic or collective-route score.

The analytic arc probes improved for both signs: mean offsets of about 0.026–0.060 became 0.0014–0.0028 normalized units, with greater route progress. The real 96-grid deposited cue has crucial failures. Mirrored arcs still had offsets about 0.074–0.079. Deposited S tracking worsened from about **0.0469 to 0.0743**, and progress fell from **0.1770 to 0.1079**. Damping-off often matches the candidate closely and has better fine turn-sign agreement in analytic cases. The experiment does not establish that inserting `dt` is uniquely preferable to removing most feedback.

Lifecycle/material consequences are large. Mean total ants spawned by 600 s fell from **726.7 to 297.3**; mean live count remained similar. The recorded `meanSpeed` is a mean one-second net-displacement rate (about 0.0527 versus 0.0516), not summed path length per second; it cannot establish unchanged locomotor speed. Plates fell from mean **33.3 to 14.3**, and union fraction from **0.6723 to 0.4546**. Pheromone mass increased rather than simply disappearing. Natural path geometry therefore changed, but the fewer births cannot be assigned to one downstream field or selector mechanism.

### Field: controlled sensitivity, not a replacement verdict

Only **2/24** direct-path phase pairs changed the wide-sensor score winner, both in the tight-circle family. The advance rule required at least two geometry families. It failed. **No CIC alternative was run.** Here “score winner/selector” means `AntController.updateIntention` heading-option selection, not `TrailPlateBirth`.

The negative gate does not reject field responsibility. Mean absolute paired local-steering difference was **0.124 rad**; straight cases reached about **0.214 rad** without changing the wide winner. About **46.2% of requested direct-path dose** used nearest-node fallback in these fixed narrow fixtures. Radius 0.0045 is below pitch 1/95. Gaster controls retained local-profile differences, with no wide winner changes. Dose, stored mass, no saturation and 15 s half-life were recorded independently. This supports a prescribed-path phase-to-raster-to-sensor link; it does not quantify how much candidate movement benefit survives a naturally generated collective trail.

### Recruitment: available signal, weak and mixed intervention

Baseline valid input occurred at **130/754, 99/688 and 108/735** post-init accepted spawns, meeting the predeclared floor. These are actual completed postcollision segments at all ticks and spawn opportunities, not the earlier 1 Hz approximate screen.

In flow arms, valid input conditioned **15.99%, 17.56% and 16.71%** of accepted post-init spawns. Mean valid resultant was about **0.44–0.50**, giving a broad valid heading half-width of **1.72–1.88 rad**. Other spawns use exact isotropic fallback. Heading reconstruction was within 1e-12 rad, with the original uniform consumed once. Invalid cases were insufficient count, not demonstrated vector cancellation in these samples.

Compared with isotropic, last-300 s centroid-radius deltas were **+0.0041, -0.0298, -0.0029**. Angular occupancy entropy rose slightly, while polarization, dispersion, field-axis and signed-momentum effects were mixed. Continuous 60 s windows and fixed-lag traces show change within runs but do not establish an added coherent regime-renewal benefit. This fixed direct-mean formulation is **not supported as a turnover solution**. It does not reject every signed-flow representation, multimodal input or slow state. No gate was relaxed and no additional recruitment family was introduced.

### Unchanged selector and persistent history

Actual candidate paths are singular mutable observations with `pathPoints`, separate from frozen Plates and masks. Analysis preserves candidate qualification, source/target and curvature separately; it does not treat a candidate as a birth. Material masks, top identities and local aggregate layer-count resistance are measured independently.

Upstream movement diversity is not entirely discarded. At two hours, mean immutable principal curvature at 0.03/0.10 spatial spacing was **11.17/2.91** for production and **13.36/5.33** for dtFeedback. The observed candidate paths also differ. These are differently selected cohorts and histories; they are not a paired curvature-transfer efficiency. Source-annulus, boundary, shortest-path and qualification responsibilities were not isolated here. Prior controlled selector capability does not establish natural preservation. No selector shadow was justified by these results.

| Model time | Production Plates / union | dtFeedback Plates / union |
| --- | --- | --- |
| 5 min | 8 / 40.43% | 3 / 15.60% |
| 10 min | 29 / 70.80% | 10 / 43.54% |
| 20 min | 69 / 74.49% | 35 / 73.88% |
| 30 min | 110 / 75.94% | 61 / 84.47% |
| 60 min | 237 / 77.34% | 122 / 96.90% |
| 120 min | 256 / 77.34% | 247 / 99.20% |

Production fills the 256 cap at **3,814.783 s**, from immutable birth metadata. The candidate still births at 7,197 s and has 74 unoccupied grid cells at two hours. From 60 to 120 minutes, candidate adds 212 union cells and 8,612 cells have different top identity. Production adds zero union cells; 4,887 top identities differ because its final 19 births occur shortly after 60 minutes. Those interval counts do not mean production continued forming material after its cap.

Append-only union cannot reopen blank space. Candidate lowers early layer/depth accumulation but extends its envelope further later. Fixed local `m(L)` also progressively saturates toward its 0.9 bound as columns deepen; that law is preserved, not interpreted as an individual buried-Plate sensor. The two-hour comparison is one seed, not a cross-seed law or actual browser-duration assurance.

## Responsibility map

| Responsibility | Classification | Supported extent and unresolved alternative |
| --- | --- | --- |
| Continuing founder/recruit heading | **SUPPORTED**, prior isolated evidence | Strong macro orientation responsibility; fixed spawn location remains independently untested. No recruitment algorithm adoption. |
| Delayed previous-omega correction | **SUPPORTED** | Strong tested cause of alternating/cap-saturated individual movement; dt reduction changes natural path persistence in three seeds. |
| `dtFeedback` as complete curvature/turnover fix | **NOT SUPPORTED** | Deposited S/mirror failures and long saturation; resembles damping-off, not uniquely established damping formulation. |
| Decision score/final blend | **PARTIALLY SUPPORTED**, prior isolated evidence | Contributions exist; unchanged here. They are not shown to dominate the remaining natural limitation. |
| Local/wide sensor as absolute curvature barrier | **NOT SUPPORTED** | Controlled analytic curved cues can be followed; sensor limitations in real deposited fields remain. |
| Raster/support/fallback phase sensitivity | **SUPPORTED** in controlled representation | Storage and sensor changes measured; natural behavioral share and improved replacement remain **INCONCLUSIVE**. |
| Reinforcement as universal straightening operator | **INCONCLUSIVE** | This pass did not repeatedly replay matched natural traversals with all other state fixed. |
| Direct mean outgoing-flow recruitment | **NOT SUPPORTED** as macro-turnover solution | Availability and manipulation valid; outcomes versus isotropic mixed. Broader flow-conditioned recruitment remains open. |
| Coherent collective curved-route reuse | **INCONCLUSIVE** | Individual persistence and aggregate field descriptors are insufficient to prove repeated shared curved corridors. |
| Occupancy/turn cap/lifecycle | **PARTIALLY SUPPORTED** as coupled consequences | Body cap and exits change greatly; occupancy was not ablated. No separate crowd-causality claim. |
| Selector as dominant remaining compressor | **INCONCLUSIVE** | Some upstream differences survive; source/boundary filtering is implemented, but no matched natural transfer isolation establishes dominance. |
| Append-only history and capacity | **SUPPORTED** | Union is monotone; ceiling halts births. Candidate almost fills viewport before cap. Larger capacity is not a renewal solution. |

## Answers and smallest next development

1. **Remaining route-language limiter:** the strongest isolated movement cause is still the delayed angular feedback. After reducing it, no single remaining mechanism can be ranked causally. Deposited-cue asymmetry, fixed entry direction, source/boundary selection and append-only history limit different outputs.
2. **Does movement feedback change natural routes?** Yes for individual realized turning and aggregate occupancy/field histories. Coherent shared curved-route reuse is not established.
3. **Does field preserve the improvement?** Analytic/deposited disagreement and phase replay show a real transfer risk. Its natural contribution is not quantified.
4. **Does conditioned recruitment generate spontaneous regimes?** This direct-mean policy does not show a reproducible benefit beyond isotropic over three 600 s runs. No general impossibility claim follows.
5. **What happens when combined?** Not tested: recruitment did not independently earn that continuation. A combined-success narrative would be unsupported.
6. **Does material retain diversity?** Some candidate and born-path differences survive, including higher coarse-scale principal curvature in the long case. No retention ratio or dominant selector cause is established.
7. **Does saturation offset the benefit?** Strongly in the observed long case: fewer Plates still cover nearly all cells, without reopening space. This is a concrete adverse long-run consequence, not a visual quality score.
8. **Exhibition candidate?** None validated by this pass. No new exhibition startup mode or audio integration was added. Prior Audio Off remains a technical fallback in its earlier measured range, not a demonstrated spatial-renewal solution.
9. **Adoption boundaries:** the dt expression is a research-only movement candidate; damping-off is diagnostic; flow is a validated negative/mixed research prototype. No production or exhibition-only adoption is selected.
10. **What next, and what can stop?** Do not repeat fixed-north rotations, a damping gain sweep, the same direct-mean flow comparison, latest-eight tint experiments, cap expansion as a solution, or audio optimization for this spatial question. The smallest next causal question is **matched natural-state field-to-realized-turn transfer**: first freeze actual deposition histories and complete pre-tick agent/occupancy/RNG state, then measure the existing raster's sensor-to-command-to-realized-turn transfer. Any alternative representation comparison would require a separately authorized and preregistered question; it is not a continuation or reversal of this failed CIC gate. No free-running candidate or threshold compensation follows automatically. See the independent [midpass critique](review/midpass-critique.md). If the artistic requirement is renewed empty-space composition, a separate persistence/presentation contract is an architecture decision; movement tuning cannot make append-only union shrink.

## Evidence and review limits

**IMPLEMENTATION FACT:** only research tooling, tests and evidence changed. Production defaults, audio and rendering stay unchanged. **MEASURED NATURAL RESULT:** 600 s three-seed independent screens and one-seed 7,200 s pair. **CONTROLLED-PROBE RESULT:** prescribed curves/poses, not emergent route laws. **COUNTERFACTUAL SHADOW RESULT:** deliberate expressions and their downstream endogenous consequences are documented above. **ARTISTIC / HUMAN JUDGMENT:** the user reviewed the new fixed-view pheromone/trajectory comparison and answered “경로와 시간 변화 모두 읽힘” (both route difference and temporal change are readable). This is a direct assessment of those images, not material renewal, installation acceptance or a measured shared-route result; see [human record](HUMAN-REVIEW.md). **DESIGN INTERPRETATION:** local steering improvement and renewable material composition are distinct responsibilities. **OPEN HYPOTHESIS:** coherent shared-route preservation, field replacement benefit and a persistence architecture remain unresolved.

Both long runs completed 432,000 ticks and 7,200 model seconds; model-only execution took about 223.3 s and 173.0 s, respectively. Those instrumented wall times are not application throughput or headed Chrome performance. The exact 600 s prefix matched four public checkpoints, 600 frames, 6,000 trajectory frames and every accepted-spawn record for both conditions. The [fresh independent review](review/final-independent-review.md) found no blocker to non-adoption, but identified the net-speed label, a null optional direction column, and two scope/lag wording issues. Those were corrected; stored inputs were reanalyzed, not resimulated. All material and other temporal/window values remained equal. The added direction-object regression and full suite passed **365/365**. Production build passed with the existing large-chunk warning. No two-hour Chrome soak, audio test or long multi-seed replication was performed, because no integrated spatial candidate earned that stage.
