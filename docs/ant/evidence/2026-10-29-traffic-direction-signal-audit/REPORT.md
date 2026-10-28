# P1/P2 actual traffic directionality versus selected scaffold I

## Decision

**INDEPENDENT INFORMATION OBSERVED — descriptive/representational sense only.** The replay records signed realized movement and tick-level turning that a static, unoriented selected-I graph cannot encode. This does not establish local scaffold-specific, statistical, or causal independence.

This result does **not** validate a Plate body-generation law. No body mask, prototype, production field, or new causal state was created.

## Evidence in brief

- The primary comparison includes 3,468 unambiguous P1 movement samples and 4,080 P2 samples within `r1=0.030`. Mean absolute axial alignment was `0.782` for P1 and `0.750` for P2; median absolute axial angle was `30.18°` and `25.45°`. Their 90th percentiles were `64.80°` and `82.19°`.
- A supplemental in-sample countermodel uses one world-frame mean movement direction from the `r1` movement samples for each event (`−71.918°` P1; `−77.039°` P2) and projects it onto the unambiguous samples' I tangent axes. It predicts mean `|cos Δ|=0.78261` in P1 versus observed `0.78225`, and `0.75426` in P2 versus observed `0.74977`. Mean axial alignment therefore does not demonstrate scaffold-specific organization.
- The fixed `r0=0.012` sensitivity gives similar mean absolute alignment: `0.773` in P1 and `0.759` in P2. The result is not produced by selecting a favorable intermediate radius.
- Across the four exact I-edge orientation classes, the horizontal class has median absolute axial difference `63.08°` (P1) and `81.73°` (P2), while the vertical class is closer at `12.04°` and `20.02°`. All classes are reported below; the global-direction countermodel can explain this aggregate orientation dependence and it is not treated as evidence of a scaffold-specific relation.
- In 3,344 P1 and 3,885 P2 consecutive local movement pairs on the same edge or a degree-2 transition, only 55 and 74 pairs respectively changed discrete scaffold axis. Median actual heading turn was `4.297°` per tick and median realized travel-direction change was about `1.20°` per tick, while median scaffold-axis turn was `0°`. Heading-turn and realized-travel-turn correlations with scaffold-axis turn were `0.0067/−0.0070` (P1) and `0.0165/0.0055` (P2). These values describe motion while the local axis stays unchanged; they do not establish scaffold-linked turning.
- Of the selected-I graph junctions, 23/29 in P1 and 30/42 in P2 had movement samples assigned to at least two incident edges within `r1`. These are nearest-edge proximity counts, not confirmed paths traversing a junction. I contains no non-node geometric edge crossings in either event.

These are descriptive measurements of the replayed ANT controller, not independent biological observations. Adjacent ticks from one ant are serially dependent.

## Provenance and replay

Production authority was main `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; research parent was `05012e1b02acb565b9e7f6c2c9076b48be337f39`. Frozen cases are current-G/H0, seed `20261005`, 60 Hz, Audio Off. P1 runs from `64016.66666666308 ms` to `84016.66666666823 ms`; P2 runs from `86016.66666666881 ms` to `106016.66666667463 ms`. Each window contains exactly 1,200 controller ticks.

Frozen current-G evidence had no 60 Hz position, velocity, heading or angular-velocity history, so a deterministic reconstruction was necessary. The 11 current ANT production source hashes matched the pinned frozen history packet. The ordered foot-contact event stream through P2 matched its frozen prefix exactly: 3,655 groups / 10,849 feet. P1 and P2 event-window contact digests also matched exactly. At both commits, the exact birth time, source/target, centerline, edge network, path, mask bytes, chemical memory, SurfaceField, support and selected-I/path/first-Plate maps matched their frozen receipts.

The raw contact hashes and run receipts are in [analysis.json](analysis.json). Replay implementation and limits are recorded in [VALIDATION.md](VALIDATION.md).

## Movement samples and tangent comparison

The primary vector is the actual position delta between consecutive production ticks, not heading, principal-path orientation, chemical field, or SurfaceField. Each midpoint is associated with its nearest actual selected-I edge. For six P2 steps whose raw endpoint leaves the normalized world, the association midpoint and atlas line use the in-world observed segment clipped by the production boundary rule; the raw endpoint and full displacement vector remain in the motion packet, and the direction ray is unchanged. P1 has no such steps. `r1=0.030` is primary; `r0=0.012` is the fixed sensitivity check. P1 has 4,287 moving samples within r1 across 19 ants; P2 has 5,786 across 24 ants. Exact tangent ties at different integer-grid axes were excluded from tangent statistics (819 P1, 1,706 P2) and retained as ambiguous local samples.

| Event | Unambiguous samples | Mean `|cos Δ|` | Mean `|sin Δ|` | Median `|Δ axial|` | q90 `|Δ axial|` |
|---|---:|---:|---:|---:|---:|
| P1 | 3,468 | 0.782 | 0.485 | 30.18° | 64.80° |
| P2 | 4,080 | 0.750 | 0.506 | 25.45° | 82.19° |

Here `Δ axial` is the actual realized movement angle relative to the nearest selected-I edge axis, reduced modulo 180°. The canonical signed projection uses low node index to high node index; its overall mean (`−0.604` P1, `−0.630` P2) is a coordinate convention and is not an intrinsic traffic direction.

The next table groups edges by exact 8-neighbor orientation, so every edge in a row has the same discrete scaffold tangent class. `Rd/Ra` are directional/axial resultants pooled over unambiguous movement samples in that class. These are descriptive summaries of repeated tangent classes; the shared event-wide direction can explain much of their aggregate pattern, and they do not imply that one edge contains a bidirectional mixture.

| Event | I tangent class | Samples | Mean `|cos Δ|` | Median `|Δ axial|` | `Rd / Ra` |
|---|---|---:|---:|---:|---:|
| P1 | diagonal down-left | 1,317 | 0.860 | 31.64° | 0.813 / 0.597 |
| P1 | diagonal down-right | 208 | 0.393 | 61.07° | 0.924 / 0.732 |
| P1 | horizontal | 627 | 0.472 | 63.08° | 0.828 / 0.466 |
| P1 | vertical | 1,316 | 0.913 | 12.04° | 0.824 / 0.786 |
| P2 | diagonal down-left | 1,527 | 0.817 | 26.13° | 0.921 / 0.728 |
| P2 | diagonal down-right | 356 | 0.673 | 35.46° | 0.845 / 0.555 |
| P2 | horizontal | 729 | 0.348 | 81.73° | 0.788 / 0.488 |
| P2 | vertical | 1,468 | 0.898 | 20.02° | 0.918 / 0.710 |

The full continuous values are preserved by edge in `analysis.json`; the [atlas](atlas.html) shows actual movement samples and local dominant edge directions at the same coordinate scale for P1 and P2.

## Directional and axial coherence

Across all local movement samples in world coordinates, pooled P1 `Rd=0.804`, `Ra=0.605`; P2 `Rd=0.891`, `Ra=0.652`. This pooling mixes scaffold orientations, so it is a reference only. At individual selected-I edges with at least two observed movement samples, median P1 `Rd/Ra` is `0.998/0.992` (116 edges); median P2 is `0.995/0.979` (145 edges).

Those high per-edge resultants are a counterweight to overclaiming opposition: most sampled edges have a strong local preferred travel direction, and the measurements do not show strong same-edge counterflow as a general pattern. The supplemental single-world-direction countermodel nearly reproduces mean axial alignment in both events. It uses the world-frame mean from all moving samples within `r1`, including rows whose tangent is ambiguous, then projects that one angle onto the unambiguous samples' edge axes; it is in-sample and is not a null test. Together these results mean the axial deviations do not establish local scaffold-specific flow. `Rd`, `Ra`, per-edge sample counts, and signed projection are kept separate; none is collapsed into a single score.

## Junctions, branch use and crossings

Every degree-3-or-higher graph node is included. P1 has 29 junctions; 23 have movement associated with at least two unique incident I edges within r1. P2 has 42 junctions; 30 have at least two such branches. These are local nearest-edge proximity counts, not observed ant transitions through the junction. The branch outward projection is continuous and signed relative to each branch's outward vector: among observed branches it is positive/negative for 36/30 P1 branches and 41/43 P2 branches. This describes differently directed local movement on nearby branches, not confirmed inbound/outbound path traversal or opposing flow on any one branch.

There are zero non-node geometric intersections of selected-I edge segments in P1 and P2, so this pass does not claim a geometric crossing motif. Actual movement directions and ambiguous tangents at graph junctions remain visible in the complete junction rows and atlas.

## Turning

The replay captures actual heading and `angularVelocity` at every 60 Hz tick; no interpolation is used. Median absolute angular velocity is the existing cap, `4.5 rad/s`, in both windows. Median absolute heading change is `4.297°/tick`; median change in realized displacement direction is `1.197°` in P1 and `1.198°` in P2.

Paired scaffold comparison includes consecutive local movement samples on the same edge or across a shared degree-2 node; junction transitions, exact tangent ambiguities, gaps and non-adjacent edge jumps remain separately counted. Scaffold-axis turn has median and q95 of `0°` in both events. Actual heading-turn versus scaffold-axis-turn Pearson correlation is `0.0067` P1 and `0.0165` P2. Actual angular speed versus unsmoothed local scaffold curvature multiplied by realized speed is `0.0089` and `0.0159`.

This low correspondence is not an inferential significance test. Most eligible pairs remain on one straight I edge, and only 55 P1 / 74 P2 pairs change discrete scaffold axis; the 96-grid scaffold has no within-edge curvature representation. The direct descriptive result is that actual tick-to-tick turning varies while the local scaffold axis is unchanged. It does not show that the turns form a spatial pattern linked to I.

## Counterevidence and limits

- Scaffold orientation still explains a substantial part of movement. Mean absolute alignment is not zero, and the vertical groups are close to their tangent axes in both events.
- A single event-wide movement direction almost exactly reproduces the pooled mean axial alignment. The report therefore does not treat the mean alignment or orientation-class summaries as evidence of a local scaffold-specific association.
- Median per-edge `Rd` and `Ra` are high. This pass does not establish generalized opposing traffic on individual I edges.
- A selected-I tangent is a coarse, undirected 96-grid axis. Some cross-axis difference may reflect the finite grid and midpoint association. The fixed r0 sensitivity is similar to r1, but neither range is a continuous-motion reconstruction below the grid scale.
- Tangent ambiguity is marked for exact equal squared-distance ties as computed in JavaScript; mathematically equal distances that differ after floating-point rounding may remain unmarked. No tolerance was introduced.
- Branch observations are within-radius nearest-edge associations, not tracked junction traversals. Paired turning excludes junction transitions and is dominated by same-edge or unchanged-axis pairs.
- Replayed kinematics are deterministic current-production measurements, not saved original 60 Hz frames. Exact contacts, frozen event maps, immutable births and source hashes provide parity anchors; the frozen packet has no per-tick positions for a direct position-by-position parity check.
- The repeated ant/tick samples are autocorrelated. No confidence intervals, significance claims, animal-behavior claim or generalization beyond this seed and these two unmatched events are made.

## Interpretation and next question

**Implementation fact:** production already stores actual ant position, velocity, heading and angular velocity during controller ticks; the frozen packet did not preserve those kinematics at the needed resolution.

**Measurement result:** the parity-anchored deterministic P1/P2 reconstruction records signed movement vectors, nearby edge-use counts, and per-tick turns—variables not encoded in a static, unoriented I graph. The axial-alignment result is nearly reproduced by one event-wide movement direction, and this pass does not establish local scaffold-specific flow, verified junction traversal, or a turning-curvature relationship.

**Research interpretation:** actual traffic direction is an additional descriptive kinematic record for these events. Whether it deserves an independent model role is unresolved; no local statistical or causal independence from the broader event dynamics was tested. The evidence does not show that direction should control body area, anisotropy, material values, or production state.

**Artistic implication:** direction and turning could become a separate history cue in a later review of what a Plate expresses. That review should compare the cue against geometry-only I and retain the observed branch variation. This pass does not decide that the cue should be visible or sonified.

Justified next closed question, if requested: can a role-isolated, non-production interpretation of signed flow and turning express a meaning distinct from geometry-only I while controlling for the event-wide direction bias and avoiding claims of verified junction traversal or scaffold-linked curvature?
