# Route curvature: responsibility and limits

## Decision

**The first demonstrated curvature limitation is already in realized movement.** The largest isolated movement effect in this finite survey is the one-tick-delayed angular-velocity feedback used as a local heading offset. It is not enough to explain the route language as an adherence-score preference or to blame Plate selection alone. A second, independent limitation is subcell/orientation sensitivity when a narrow deposited path becomes a 96×96 scalar field.

No production law is adopted. A diagnostic `dampingOff` shadow establishes responsibility; it is not a recommended production setting. A clean arc, an ellipse and an artistically useful route are different claims. No ellipse or biological route behavior is established here.

## IMPLEMENTATION FACT

Current code samples five candidate headings at approximately −0.92/−0.47/0/+0.47/+0.92 rad relative to body heading. Direction scores include separate confidence ×0.55 and adherence ×3 forward cosine penalties. Persistence also changes noise, jitter, exploration, temperature and decision clocks. The selected intent is then blended toward current heading with weight `0.82 * adherence`.

The tick-level local correction is:

```text
localTurn = clamp(localSteering * (0.35 + 0.65 A)
                  - clamp(previousOmega, -2.2, 2.2) * 0.65 A,
                  -0.45, +0.45)
targetHeading = blend(intentHeading, currentHeading, 0.82 A) + localTurn
```

`turnToward` limits heading change to `4.5 * dt`, then writes current angular velocity. At 60 Hz the maximum turn is 0.075 rad per tick. The previous-omega contribution reaches that magnitude at 0.115 rad/s when A=1, before considering intent/sensor cancellation. This is a delayed high-gain loop. Calling it a dimensional bug would exceed the evidence: the coefficient could encode a time scale. The measured issue is alternating saturation and suppressed sustained turning.

Local sensing uses two short forward cross-sections; it stores no route curvature. Wide sensing takes a weighted transverse maximum. Pheromone uses default dabs at 0.006 travel spacing, radius 0.0045, 96×96 grid and bilinear reads. Its brush can fall back to the nearest cell when no grid node lies inside the radius. Gaster yaw lag and rear offset also separate thorax travel from deposit geometry.

`TrailPlateBirth` applies chemical memory, support, source-annulus/boundary eligibility, skeletonization and shortest-path selection. Descriptor `principalPath` copies the candidate path; whole `centerline` may contain multiple retained boundary branches. The three personality fields `turnResponsiveness`, `acceleration` and `damping` are created but not consumed by current ANT movement. Their unused status does not itself cause straightness.

## MEASURED RESULT: natural geometry

Three unchanged production seeds ran for 600 simulated seconds at 60 Hz. Audio bridge and social feedback were absent. Short instrumentation parity covers 600 ticks and compares final RNG/fields/agents/lifecycle/contact totals; it is not an all-tick, full-state equality proof for all 600 s. Packed samples round-trip exactly. Tick-indexed, complete, nonoverlapping 1/2/5 s per-ant windows exclude low-displacement windows from continuous means.

After the lossless codec was added, full current-writer verification replays reproduced every captured serialized value and endpoint summary for all three seeds. The explicit JSON representation of an unbounded following-speed limit is null; finite measurements compare with `Object.is`. The 40,401,620 comparisons bridge the original writer hash to the current reproducible capture code without inventing an old source copy or claiming full internal-state parity.

| Seed | Plates at 600 s | Median chord/path, 1 s | Median chord/path, 5 s | 5 s tangent same-sign pair fraction | 5 s lag-1 tangent-turn correlation | 5 s body turn-cap fraction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 29 | 0.99976 | 0.98449 | 0.0930 | −0.5328 | 0.8821 |
| 20261006 | 33 | 0.99965 | 0.98173 | 0.1124 | −0.4721 | 0.8666 |
| 20261007 | 38 | 0.99982 | 0.98350 | 0.0921 | −0.5515 | 0.8798 |

These nearly straight windows still accumulate substantial absolute turn. Opposite turns cancel. Raw absolute curvature therefore overstates smooth curved travel. Longest same-sign tangent-turn runs average only 0.163–0.183 s in the 5 s windows. The aggregates do not imply every path is straight or that no longer bends exist.

At **trail adherence ≥0.75**, body turn-cap occupancy is **99.35–99.56%**, and adjacent nonzero body-omega sign reversal is **99.73–99.85%** across all three captures. In the front-clear stratum (`frontCrowding <= 0.12`), high-adherence mean absolute omega is about 4.498 rad/s. This stratum does not exclude lateral/rear separation. The corrected single-agent probe independently shows alternation without peers. Swept collision-constrained samples are uncommon overall; avoidance remains a separate unisolated influence.

For late 300–600 s travel, the descriptive 0.03-cell flow diagnostic finds 748–804 cells visited by at least three ants, of which 482–543 have directed tangent coherence ≥0.8. Their median signed curvature is near zero (−0.047 to +0.153 per world unit); median local signed/absolute agreement is 0.45–0.52. Some cells and traces remain curved. Coincident cells are a reuse proxy, not proof of one shared centerline or a coherent collective arc. No new ridge-extraction algorithm is used on natural fields.

## MEASURED RESULT: isolated natural shadows

Each shadow changes exactly one guarded source expression. All begin at the same initial seed. After movement diverges, contacts, fields, recruitment timing and random consumption can diverge naturally; no common post-divergence RNG stream is claimed. No combined shadow was run.

| Seed / treatment | Median 5 s chord/path | 5 s tangent same-sign pairs | Longest same-sign run, mean s | 5 s lag-1 correlation | 5 s body cap | Plates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 05 production | 0.9845 | 0.0930 | 0.163 | −0.533 | 0.882 | 29 |
| 05 adherence score only off | 0.9771 | 0.1101 | 0.177 | −0.482 | 0.852 | 27 |
| 05 final blend only off | 0.9303 | 0.1533 | 0.214 | −0.119 | 0.890 | 34 |
| 05 angular damping only off | 0.8291 | 0.9389 | 1.144 | +0.927 | 0.141 | 18 |
| 06 production | 0.9817 | 0.1124 | 0.183 | −0.472 | 0.867 | 33 |
| 06 angular damping only off | 0.8098 | 0.9395 | 1.138 | +0.933 | 0.149 | 19 |

The direction-score term has a small movement effect here. The final blend has a larger endpoint-geometry effect but retains the fast alternating component. Removing delayed angular feedback changes turn persistence much more strongly and replicates on seed 06. Absolute turn actually decreases while persistent turning increases; this is not an “increase all curvature” effect.

The matched-state flat-field assay isolates decision effects without movement. At A=1, lateral-intent fraction is 0.531 in production, 0.756 with adherence score removed, and 0.596 when only exploration probability loses its confidence dependence. Thus both mechanisms affect decisions. Their contribution to sustained natural curvature is a separate question. Noise, jitter, temperature and hold-duration coupling were not separately ablated.

## CONTROLLED-PROBE RESULT: capability, field and feedback

The final controlled package uses exact production sensing, decision, turn, acceleration and deposit code inside a disclosed single-agent fixture. Analytic frozen cues have fixed peak 0.5 and sigma 0.0025, as in existing straight-following tests. Deposited-grid cues are not calibrated to equal analytic cue strength, so their numeric errors are not an isolated grid-resolution A/B. Mirrored curves test orientation dependence. The tick guard checks at most one active ant; all saved final passes survived with exactly one ID. The initially incorrect count normalization was repaired and its outputs excluded.

Controlled results and final numeric tables are detailed in [controlled findings](controlled/controlled-findings.md). Means below pool three fixture seeds (19/61/193); each pass lasts 3 s. Lengths are normalized model coordinates.

| Frozen analytic cue | Production mean absolute offset | Damping-off offset | Production body cap | Damping-off cap |
| --- | ---: | ---: | ---: | ---: |
| Constant radius 0.25 | 0.0281 | 0.0016 | 0.843 | 0.019 |
| Constant radius 0.10 | 0.0486 | 0.0027 | 0.876 | 0.046 |

Interpret successful tracking over only 2–3 s and about 0.2 travel units as local capability. Baseline sensing can respond to a smooth bend, but stable tracking across the tested curves is limited. Original sensors plus the isolated damping-off change provide a capability counterexample to an absolute claim that those sensors cannot follow curves. Frozen real-grid fields retain additional orientation/phase problems even with damping removed. A deposited S-shaped cue is a counterexample: damping-off mean error worsens from 0.0356 to 0.0602, so removing damping is not a general solution.

Three forced revisits retain a field while resetting the entering ant's local state and RNG. This is a bounded deposit/sense/reinforcement assay, not spontaneous collective reuse. The field diagnostic chooses maxima across a broad reference-normal scan; it can switch to another branch. Ridge offset is not centerline curvature and cannot by itself prove straightening toward a chord. Short revisits can retain, shift, fill gaps or add branches; they do not establish a general, monotonic geometric-straightening operator. **Cumulative reinforcement straightening remains INCONCLUSIVE.**

## CONTROLLED-PROBE RESULT: selector

On four connected synthetic chemical rasters with real SurfaceField foot accumulation, unchanged qualification births all four shapes. Principal tortuosity is 1.000 / 1.061 / 1.080 / 1.200 for straight / gentle bend / tighter bend / S route. These are constructed polynomial/sinusoidal route fixtures; their “arc” names do not imply an ellipse or a mathematically constant radius.

The candidate path is copied unchanged into each descriptor. These single-route fixtures have no branches, so they demonstrate retained curved capability and cannot estimate natural branch-pruning loss. Fixed-scale smoothing exposes how much raw vertex turning comes from raster staircases. Prior 2026-10-08 pruning evidence remains context, not a new causal estimate.

Using real default-radius deposits, the same curved fixtures at base x=0.500 retain qualified cells but fail to select, while x=0.504 births all four. Straight births at both offsets. The downstream chain is sensitive to subcell placement of narrow curved input. This is not a measured natural frequency or an isolated brush-versus-skeleton attribution. It does reject the claim that unchanged selection always straightens every connected curve.

## Responsibility classification

Labels apply to the stated responsibility, not to whether a mechanism exists in source.

| Candidate responsibility | Status | Evidence boundary |
| --- | --- | --- |
| Adherence decision score | PARTIALLY SUPPORTED | Clear matched-state choice effect; small 600 s single-seed persistence effect. Not the strongest measured cause. |
| Final heading blend | SUPPORTED | Removing only the blend increases 5 s bending, but alternating turns persist. One natural seed. |
| Delayed angular damping | SUPPORTED | Strong natural turn-persistence/cap effect on two seeds; controlled follow comparison. No production adoption. |
| Persistence / exploration coupling | PARTIALLY SUPPORTED | Exploration-only decision effect measured; noise, jitter, clock and temperature contributions remain INCONCLUSIVE. |
| Local sensor geometry as an absolute barrier | NOT SUPPORTED | Original sensor can follow controlled curves after damping-only change. Its quantitative residual natural responsibility remains INCONCLUSIVE. |
| Wide max-based decision sensor as dominant straightener | INCONCLUSIVE | Source audited and exact code exercised, but no isolated max-versus-alternative comparison. |
| Turn-rate / velocity dynamics as the primary radius barrier | NOT SUPPORTED | Cap is very active because of controller alternation; damping-only removal reduces it. At v=0.08, nominal Rmin=v/4.5=0.0178, much smaller than R=0.1/0.25 probes. Velocity response was not independently removed. |
| Pheromone representation | SUPPORTED for fixture sensitivity | Real-deposit subcell/orientation failures; not a universal curvature-erasure claim or quantified natural share. |
| Repeated reinforcement as cumulative straightening | INCONCLUSIVE | Only three controlled forced revisits; diagnostic ridge can switch branches. |
| Occupancy/collision as the main cause | NOT SUPPORTED in these runs | Alternation persists in front-clear strata and in single-agent probes. Avoidance/following effects were not independently ablated. |
| Downstream selector as the sole curve eraser | NOT SUPPORTED | Connected controlled curves birth; movement already has a clear upstream limitation. General source/boundary/pruning restriction remains SUPPORTED by source/prior evidence. |
| Gaster rear offset/yaw lag | INCONCLUSIVE | Source-grounded independent representation change; no paired thorax/rear geometric attribution. |
| Unused personality parameters | NOT SUPPORTED as a cause | No reads, so cannot explain current variation. Reported wiring fact, not automatically a bug. |
| Raster/analysis artifact | SUPPORTED | High raw absolute turning includes alternating turns/staircases. It cannot explain away the measured movement A/B. |
| Fixed recruitment heading | SUPPORTED as prior macro context | Prior `046b21c` survey; not re-developed or re-isolated for curvature here. |

## Six answers and next pass

1. **Where first?** In individual realized movement, before deposition or Plate selection: nearly straight net travel coexists with rapidly alternating steering. This is the earliest demonstrated limitation, not proof that spawn geometry has no influence.
2. **Strongest mechanism?** Previous-omega feedback in the local heading correction, among the isolated terms tested. Final blend and decision scoring also contribute at smaller/different levels.
3. **Cumulative reinforcement?** Not established. Present data do not justify a universal straightening-operator claim. Field alignment and branch selection remain alternatives.
4. **Can production follow an arc?** It has partial short-range capability; stable baseline tracking across the tested smooth bends is not established. Original sensing plus damping-only removal tracks much more consistently. That shadow is a counterfactual, not production capability or adoption.
5. **How much reaches Plates?** Connected controlled bends retain non-unit tortuosity and candidate geometry is copied into principal paths. Other deposited curved inputs fail before birth depending on grid phase. No scalar natural retention percentage is defensible across these different representations.
6. **Smallest next pass?** One time-step-aware angular-feedback shadow, retaining all score/blend/sensors/field/recruitment/selector rules. Compare with production and use damping-off only as a diagnostic reference. Predefine persistence/oscillation, tracking, lifecycle and material consequences; do not tune several gains to create attractive routes. A field-grid causal pass follows separately if needed.

## ARTISTIC / VISUAL JUDGMENT

Diagnostic comparisons are provided in [visual/](visual/). The artist answered **“경로 곡률 차이가 읽힌다”** to the seed-19, 3 s analytic gentle-curve production/damping-off comparison. This is a visual distinction judgment for that controlled example, not preference, natural collective-route success, acceptance of a movement law or exhibition readiness. The final rendering also corrects the reference arc's 0.004 vertical plotting offset and uses equal-scale normalized axes; trajectories and measurements did not change. The artist did not separately re-confirm that last presentation cleanup. Prior recruitment-survey human judgments concern another question.

## DESIGN INTERPRETATION and OPEN HYPOTHESIS

A source intended to stabilize trail-following can suppress a persistent turn through its sampled feedback dynamics. This is an engineering interpretation grounded in the isolated contrasts, not a biological claim. Fixing the largest movement limitation may still leave narrow-grid sensing, gaster geometry, field reinforcement and source-connected material selection as separate restrictions. The effect of a time-step-aware feedback formulation on long-run natural route language remains open.

The survey stops without a production candidate. Accelerated 600 s runs, limited seeds/radii, low-speed curvature sensitivity, lifecycle window selection, unisolated persistence terms, unequal analytic/grid field amplitudes, forced entry conditions, and an unmeasured natural ridge-retention rate limit generalization. No actual Chrome simulation soak, audio validation or hours-long behavior claim is made.
