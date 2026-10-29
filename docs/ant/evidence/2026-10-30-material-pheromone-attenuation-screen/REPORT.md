# Material-dependent pheromone source attenuation — Pass 3

## Decision

**MIXED.** The fixed source-only law has real downstream leverage: it changes pheromone geography, movement/contact history, B/E/F and later Plate masks/timing. It is not merely a rescaling of an otherwise identical world. However, the would-be max-D leader stays entry-adjacent, the late separated outside-entry tier is slightly weaker relative to that leader, and the reference X capture overlaps more prior material. No adoption or stronger attenuation is justified by this one screen.

The result does not classify repeated layering as failure. The screen establishes one possible material responsibility—conditioning new chemical inscription—and its consequences. It does not establish that this responsibility is needed or artistically preferable.

## Baseline and exact intervention

- Fresh production main: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `afea7ecc076734a6c9fe8b3ccad7efb11c08c36a`.
- Branch: `codex/ant-material-pheromone-attenuation-screen-20261030`.
- Current-G/H0, seed `20261005`, 60 Hz, 600 model seconds, Audio Off; one paired deterministic history.

```text
p(L) = 1 - 0.50 * (1 - exp(-L / 4))
effectiveRate = state.pheromone.amountPerUnitDistance
              * existing depositionMultiplier * p(L)
```

L is the public column count at the ant body's tick-entry cell. The factor is 1 at L=0, approximately .889400 at L=1, .683940 at L=4, .541042 at L=10, and approaches .5. These are authored screening values, not measurements of secretion, absorption or physical layer sensing.

The wrapper snapshots each active ant's scalar L before native movement. It changes only the rate passed to native `GasterDeposition.advance`. Native per-chunk accumulation, distance thresholds, rear coordinates and retirement flush remain intact. The same native accumulator at nominal rate runs as a **dose-only sham on the candidate's realized path**, not as a second control world. Every chunk's emitted geometry matches that sham. Both world arms retain production's 10% material locomotion resistance. No Screen 1 or 2 treatment is inherited.

Tick-entry ant-center conditioning is one factor for the entire travelled chunk. It is not integration across every crossed material cell or a measurement of the gaster surface. A later same-tick Plate cannot retroactively change the chunk. The 36 births in each arm occurred after that tick's source reads; the layer array was replaced afterward.

Production source, native selector, X/R, UPDATE, maturation, BODY, material tuple, recruitment law, field decay/readers, SurfaceField writer and audio were not changed. Production still creates its native authored corridor Plates; max-D/X remains a read-only reference in this screen.

## Manipulation and replay validity

The control raw gzip and all five checkpoint gzips are byte-identical to the frozen production G corpus. Raw SHA-256 is `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`. Initialized state, all 600 position snapshots/contact buckets, full contact and birth hashes, checkpoint fields/persistent masks and checkpoint/final RNG match. All 40 saved control B/C/D/E/F/S/pre-existing-material anchors match exactly before treatment interpretation.

Seven direct tests cover full L=0 identity, mixed-L chunks, same-tick layer mutation/destination distinction, native dab geometry, accumulated dose, retirement after L changes, and preservation of final pending dose through controller teardown. Existing relevant production tests passed 24/24. Runtime geometry checks cover 651,938 control chunks and 651,399 treatment chunks.

The first attenuated chunk and pending-dose divergence occur at tick 5,042, approximately 84.033333 s, just after the shared first Plate at 84.016667 s. The first changed emission is in that same tick, for a different ant. Complete state therefore diverges at pending accumulation, not only when a dab is released. First saved ID/x/y difference is at 85 s; first differing one-second contact bucket is at 90 s. These are sampled observations, not exact first motor/contact-divergence ticks.

Source accounting is in authored dose units:

| Quantity over 600 s | Control | Treatment |
| --- | ---: | ---: |
| Nominal chunk dose on that arm's realized path | 8,057.6020 | 7,397.9432 |
| Effective chunk dose | 8,057.6020 | 5,669.1141 |
| Emitted requests, including retirement | 8,057.1225 | 5,668.6652 |
| Final pending, not emitted at horizon | .479527 | .448908 |
| Accepted in-domain field source dose | 8,055.3208 | 5,667.4236 |

The **direct**, same-treatment-path dose factor is `.7663095`, a 23.37% reduction. The 29.64% accepted-source reduction relative to control also includes endogenous movement/adherence and boundary differences. It is not all direct attenuation. Emitted + final pending dose matches effective chunk dose within approximately `1.3e-10`; that roundoff is not used to construct any counterfactual input. Native node sum and reconstructed bilinear integral below are storage readouts, not authored source dose or calibrated chemical mass.

## World outcomes

| Measure | Production control | Treatment | Interpretation |
| --- | ---: | ---: | --- |
| Total realized travel | 603.098 | 588.748 | −2.38% |
| Active ant-seconds | 10,865.633 | 10,856.650 | −.08%; not population collapse |
| Individual feet | 99,469 | 97,208 | −2.27% |
| Contact groups | 33,643 | 32,845 | Fewer contacts, changed geography |
| Admissions after initialization | 774 | 731 | Direct recruitment law unchanged |
| Mean sampled trail adherence | .651469 | .632185 | −2.96% relative |
| Material-exposed ant-tick share | .648838 | .671002 | Higher exposure share |
| 600 s pheromone node sum | 3,626.437 | 1,864.488 | −48.59% |
| 600 s reconstructed integral | .0365456 | .0187904 | Same storage distinction preserved |
| Projected coverage at .04 | .220812 | .152018 | Lower thresholded chemical extent |
| 600 s SurfaceField sum | 2,604.666 | 2,570.732 | −1.30% |
| Plate count at 300 / 600 s | 14 / 36 | 13 / 36 | Equal final count does not mean same history |
| Buried layer-cells at 600 s | 60,378 | 46,797 | −22.49% |
| Exposed material cells at 600 s | 5,711 | 5,694 | Nearly equal final union, different stack |
| Maximum local layer count | 35 | 30 | Different accumulation |
| Nodules at 300 / 600 s | 6 / 32 | 11 / 32 | Both final counts cap-censored |

Normalized-to-total spatial L1 at 600 s is 1.315 for projected pheromone, .378 for cumulative occupancy, and .184 for the 24×24 contact-count map. A pure global multiplier would have zero normalized L1. Thus suppression is substantial but does not exhaust the effect. These measures do not establish a desired redistribution or artistic benefit.

Observed lifetime records are retained as first/last sightings in one-second position snapshots, with left/right censoring. They are not exact admission-to-retirement lifetimes and can miss brief between-snapshot visitors. Population, admission totals and full active-ant time are reported separately; no exact lifetime claim is inferred from the snapshots.

P1 is identical in time and mask. Later event timing and masks differ even where ordinal Plate counts coincide. Comparing the same ordinal ID across arms is a receipt comparison, not proof that it is the same evolving physical event. All finite-state, speed, turn, collision and population-ceiling checks passed. Neither field saturated. Final RNG calls differ, 349,136 versus 355,940, after trajectories/decision scheduling diverged. The observer adds no RNG, but later random draws are not held at a shared call index.

The screen has no equal-total-dose global-throttle world arm. It therefore does not identify how much of the outcome specifically requires the local placement of attenuation, rather than lower chemical supply plus its endogenous descendants. Per-chunk correctness is supported by executed runtime assertions and their aggregate/hash receipt; the individual chunk rows were not retained. The saved emitted requests independently reconcile actual field dose, but cannot reconstruct every chunk's L/distance/rate history.

## Qualified opportunity context

Same frozen observer times and definitions: two sets of 20 anchors near 300/600 s, production E, current thinning F, edge-bearing S, component-aware D plateaus grouped at `.15`, recent feet within `.037` over `(t−20 s,t]`, and unchanged X capture `R=.15`. All 40 treatment E/F maps differ from control; C/D and material stacks also differ. No allocation is performed.

| Window / measure | Control | Treatment |
| --- | ---: | ---: |
| Near 300 s median E / F cells | 2,874 / 1,831 | 2,750 / 1,813 |
| D1 | .907994 | .905922 |
| Separated D2/D1; D3/D1 | .5691; .4951 | .5549; .5039 |
| Winner cells | 6287 | 6384 / 6287 |
| Winner prior layers / nearby feet, medians | 2 / 198 | 1 / 174 |
| X prior-material overlap, median | .7794 | .8446 |
| Near 600 s median E / F cells | 2,883 / 1,779 | 2,116 / 1,419 |
| D1 | .963993 | .958566 |
| Separated D2/D1; D3/D1 | .7565; .7379 | .7395; .7051 |
| Winner cells | 6289 | 6192 / 6191 |
| Winner prior layers / nearby feet, medians | 6 / 162 | 19 / 168 |
| X prior-material overlap, median | .8385 | .9621 |

Every treatment D leader remains entry-near: entry distance is approximately .0258–.0362 in the first window and .0466 in the second. The outside-entry secondary tier persists but is not stronger relative to D1. Median uses the existing nearest-order convention `round((n−1)*.5)`, not an average of two middle values. Group centers and field thresholds are descriptive/native definitions, not an acceptance score.

## Interpretation and next boundary

**[Implementation fact]** New inscription is the only modified causal link. Changes in sensing, adherence, recruitment, C/D, Plates and Nodules follow through existing paths; Plate changes can also follow directly through pheromone-to-B qualification, not exclusively through changed traffic.

**[Measurement]** The chemical world changes strongly, E/F changes, movement/contact geography changes modestly, and the resulting stack is thinner in aggregate. The strong D region is still entry-near and the X reference remains heavily reused.

**[Research interpretation]** MIXED. New chemical inscription is a genuine material-feedback responsibility. This screen does not show that it solves an allocation problem or earns adoption. Repeated max-D layering remains valid, and a source-dose law must not be judged by how well it creates novelty.

**[Authored/artistic interpretation]** The law could mean a conditioned surface changes new chemical inscription. That is an authored interpretation, not biological evidence that ants secrete less over buried layers. Viewer legibility and material meaning were not tested.

The coordinated investigation next examines remaining responsibilities. A separately registered **frozen-source chemical-residence probe** uses only this screen's production control stream: it changes decay of existing chemical history, keeps agents/material/source schedule frozen, and must first reproduce the original field/B outputs. It is not a stacked source-attenuation candidate or an automatically authorized full-world adoption. See the later synthesis for its result and the overall stop decision.

## Reproduction and artifacts

- [Registered plan](PLAN.md), [validation](VALIDATION.md), [receipt manifest](manifest.json).
- [Results and manipulation receipt](data/RESULTS.json), [pure paired analysis](data/ANALYSIS.json).
- `data/control/` and `data/candidate/`: raw run, five checkpoint maps and complete run summary each.
- `data/paired-input.json.gz`: exact 40 frames per arm, all recorded feet, actual birth masks, timelines and dose audits.
- `data/source-emissions.json.gz`: ordered native point/segment requests including retirement; not cap-surviving storage.
- [Fixed-scale checkpoint atlas](atlas.png), [daily record](../../daily/2026-10-30-material-pheromone-attenuation-screen.md).
