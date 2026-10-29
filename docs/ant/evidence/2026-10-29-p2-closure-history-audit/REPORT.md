# P2 closure-history audit

## Decision

**REPRESENTATION-LEVEL CLOSURE ONLY.**

The exact P2 face boundary is already present as qualified support at 105.016666667 s. All 80 frozen boundary cells belong to E and form one connected set under both four- and eight-neighbor foreground adjacency. The same 47 of 80 face cells are qualified at both anchors, with identical cell membership. Every remaining unqualified face cell is already in a bounded background component under both tested background relations.

At 106.016666667 s, H adds one cell on that same boundary: grid index 3498, coordinate (42,36). That cell was already qualified in E at both anchors. H therefore changes the visible eight-background enclosure without a new qualified-support closure transition.

This P2 example does not support a closure-history router. It does not rule out an authored COMMIT-snapshot operation that reads current topology.

## Authority and frozen inputs

- Fresh production main: 4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785.
- Research parent: a518a76bddd416a074cc3ee1d1d12c90d08bff15.
- Research branch: codex/ant-p2-closure-history-audit-20261029.
- Event: current-G/H0, seed 20261005, 60 Hz, Audio Off, P2, committed at 106.01666666667464 s.
- Exact saved anchors: 105016.66666667434 ms and 106016.66666667463 ms.
- No replay, new seed, field reconstruction, RNG use, or production behavior change.

The exact binary E/H snapshots are read from the frozen structural packet. Its gzip SHA-256 is 541cbf927b0ebdea06a7ae00585c4144a62a1d4ce2f841c40a1bd91af440b075. The packet records its upstream formation history at commit 0d5096a920e1ebb2086fa1dae782c5d4e871b590, path docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz, gzip SHA-256 909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc. The upstream packet itself was not present in this checkout; the earlier extraction receipt and its hash are retained.

The parent joint-scope analysis has LF-canonical SHA-256 9d738207b426c0548f1d1e567aef25ae02b6b4a64d9c3a00d7ce71e172a9f5a4. The frozen P2 descriptor packet has gzip SHA-256 907fa598a5906a9c968481278832464b13362e675fc2f82dfad8f8d5144df4a3. Full file hashes and byte counts are in the manifest and machine analysis.

## Implementation facts

Current main TrailPlateBirth qualifies a 96-grid cell when chemical memory is at least 0.30 and sampled SurfaceField support at radius 0.025 is at least 0.015. Production neighbor enumeration is eight-connected. The selector skeletonizes E, checks skeleton components, then selects source-to-boundary eligible routes. The immutable descriptor later stores all eight-neighbor edges induced by selected I coordinates.

The saved maps used here are E_qualified, H_boundary_length_eligible, and I_retained_network. H is already a skeleton/eligibility representation; production does not track a face-closure event or face identity.

## Frozen face and transition

The face was not selected again. It is the exact parent face: the largest non-edge eight-neighbor background component of P2 COMMIT H, with cell-order tie-break. It contains 80 grid cells. The frozen boundary contains the 80 adjacent COMMIT H cells defined by the parent analysis. The parent selection and boundary arrays are independently recalculated and asserted equal.

| Saved anchor | E cells | H cells | I cells | E face cells | E boundary cells | H boundary cells | I boundary cells |
|---|---:|---:|---:|---:|---:|---:|---:|
| 105.016666667 s | 1,383 | 738 | 168 | 47/80 | 80/80 | 79/80 | 18/80 |
| 106.016666667 s | 1,397 | 758 | 181 | 47/80 | 80/80 | 80/80 | 14/80 |

Exact E membership inside the 80-cell face and on the 80-cell boundary is identical at both anchors. E adds 22 cells and removes 8 globally. Within the one-cell face/boundary neighborhood, only index 3401 at (41,35) is added; none is removed. No E cell changes inside the frozen face or boundary.

H adds 37 cells and removes 17 globally. Its boundary membership changes only by adding index 3498 at (42,36); no boundary cell is removed. Index 3498 is E-qualified at both anchors. H also adds index 3401 nearby at the later anchor. Exact changed-cell arrays are in transition-cells.json.

Under production eight-neighbor foreground connectivity, the full E field has 31 components at 105 s and 36 at 106 s, with largest components 1,166 and 1,172 cells. There is no component merge. One other prior component splits; the component containing the frozen boundary remains one component with one predecessor, growing from 1,166 to 1,172 cells. Under four-neighbor foreground adjacency, component counts are 114 and 120. These global changes do not create the selected face closure.

For E, the 33 face cells not in support are already enclosed at both anchors: four-background component intersections with the face are 24+5+2+2; eight-background intersections are 28+5. None touches the world-grid edge.

For H, the parent-selected eight-background face is edge-connected at 105 s and becomes bounded at 106 s after H gains the single boundary cell. Under four-background connectivity, the same face coordinates already form four bounded fragments at both anchors: 46+16+16+2. Thus the skeleton-level description itself depends on background adjacency, while the qualified-support conclusion does not.

## Representation hierarchy

| Layer | 105.016667 s | 106.016667 s | Closure reading |
|---|---|---|---|
| E qualified support | Same 47 face cells; all 80 boundary cells present and connected | Same face and boundary membership | Relevant support enclosure already exists |
| H boundary/length-eligible skeleton | 79/80 boundary cells; selected 8-background face reaches grid edge | 80/80 boundary cells; selected 8-background face is bounded | Enclosure appearance first changes in H |
| Selected I retained network | 168 cells; 18/80 frozen boundary cells | 181 cells; 14/80 frozen boundary cells | Does not represent the full face boundary |
| P2 descriptor adjacency | Not a separate 105 s descriptor | 181 nodes, 211 induced edges, one graph component; 14/80 boundary cells | Later representation only; its cycle rank is not closure evidence |
| BODY expansion | Not generated | Not generated | Explicitly outside this pass |

The P2 descriptor has cycle rank 31, but that is an induced-graph property and is not used to infer a support connection or enclosure.

## Interpretation and limits

**Measured transition:** the relevant E membership is unchanged across the adjacent saved anchors. H gains one boundary cell that was already qualified. The sampled evidence therefore rejects the interpretation that this P2 face first acquired its qualified-support closure at COMMIT.

**Representation effect:** the frozen face becomes a single bounded eight-background component in H at COMMIT. H is already downstream of thinning and boundary/length eligibility, so the saved masks locate the change at that representation layer but do not isolate which internal substep retained index 3498.

**Authored material meaning:** cohesive interior remains a possible authored COMMIT-snapshot operation on selected bounded support. This audit does not validate that operation, a new BODY mode, cohesion, face-specific maturation, or a closure timer.

The source packet stores approximately one-second analysis anchors, not every 60 Hz tick. A transient change between the two saved anchors is unobserved. E/H are exact binary membership maps; continuous field amplitudes are not reinterpreted as support. Background four/eight conventions are both reported. No alternate face was searched.

## Stop

No new BODY, face fill, body law, closure-history discriminator, mode router, event/scope rule, production change, additional event, new natural run, 600 s run, audio test, or adoption.
