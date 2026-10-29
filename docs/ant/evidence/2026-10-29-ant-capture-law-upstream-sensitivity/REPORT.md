# E→F capture-law upstream sensitivity

## Decision

**X remains strongest capture null.** In both registered E→F′ COMMIT stresses, thinning changed only cells in the edited cell's immediate 3×3 dependency neighborhood, and X's membership changes stayed inside that same neighborhood. B's fixed rooted-edge budget reallocated membership beyond it in both events. The P2 direct-F control is especially clear: X loses only the deleted node; B loses 40 nodes and gains 42, with 78 of those 82 changes outside the immediate neighborhood.

This conclusion is limited to the two preregistered cells in the two frozen events. It does not establish general natural robustness or material correctness. The test's max-D nucleus remains an isolation policy, not an adopted allocation law.

## What was tested

- Ten frozen current-G/H0 anchors, seed `20261005`, 60 Hz, Audio Off; no replay.
- **X:** nucleus-connected F component inside the authored Euclidean disk, `R=.15`.
- **G:** parent graph-distance capture within `.15`, used only as a representation reference.
- **B:** deterministic shortest-path tree expansion, charging one axial (`1/95`) or diagonal (`sqrt(2)/95`) parent edge per included non-root node, under one fixed `L_compare`.
- Two separate COMMIT stresses per event: direct deletion from F, and the same recorded deletion from E followed by unchanged production thinning to F′.
- The E→F′ comparison has a fixed-old-nucleus control and the normally reselected max-D nucleus view. No valid fixed-nucleus case required snapping.

## Implementation facts

Production `TrailPlateBirth.js` was rechecked against `origin/main@4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785` and not modified. The audited chain is qualified E → production thinning → F. For this pass, X/G/B are research comparisons; none is a production selector. B's fixed budget counts only chosen shortest-tree parent edges. It does not bound the induced 8-neighbor edges, branch cycles, node count, or Euclidean reach.

## Prior evidence reused

The parent defined the one stress cell per COMMIT, exact frozen inputs, X/G operators, max-D nucleus policy, and dense-F fixture. The previous direct-F result remains unchanged: P1 X 112→111 and G 94→93; P2 X 104→103 and G 73→47. For P2 G, 25 cells lost from the graph-distance result remained connected in F but exceeded the graph-distance radius after the detour. The current pass independently reproduced the parent's X/G cell sets, including both direct-F receipts.

## New diagnostic result: upstream E→F′

All changed F cells in each case are in the original edited cell's 3×3 neighborhood (Chebyshev distance ≤1), the registered immediate dependency stencil. Component counts are unchanged. X's changes are likewise confined to that stencil. Counts, Jaccard values and distant-membership changes are descriptive; no pass/fail cutoff is imposed.

| Event | E | F nodes / induced edges | F set Jaccard | F components | X nodes, J; lost/gained; beyond stencil | G nodes, J; lost/gained; beyond stencil | B nodes, J; lost/gained; beyond stencil |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| P1 | 1074→1073 | 775→778 / 1225→1237 | .99358 | 41→41 | 112→115, .95690; 1/4; 0 | 94→97, .94898; 1/4; 0 | 111→111, .93043; 4/4; 3 |
| P2 | 1397→1396 | 951→953 / 1584→1593 | .99581 | 36→36 | 104→106, .96262; 1/3; 0 | 73→78, .91139; 1/6; 3 | 112→111, .90598; 6/5; 7 |

The only F change outside the edited cell is nearby thinning response: P1 loses 1 and gains 4 F cells; P2 loses 1 and gains 3. No F change is beyond the immediate stencil. X therefore includes a small local topology response, not merely the removed E/F cell. For both events, the old nucleus 6192 remains edge-bearing and is also the reselected maximum-D nucleus; the selected nucleus moves zero distance. D is held fixed. The fixed and reselected views consequently agree in these two cases.

G is not the primary candidate. Its P2 E→F′ output gains six nodes and loses the deleted one; three gains are beyond the immediate stencil because the graph-distance boundary depends on the rethinned path geometry. These changes remain within the same authored radius context; this is not evidence of distant nucleus movement.

B changes at locations not touched by thinning. P1 loses four and gains four B cells, including three losses outside the immediate stencil. P2 loses six and gains five, with five losses and two gains outside it. For P2, the farthest changed membership is about `.174` world units from the edit on the lost side and `.091` on the gained side. These are deterministic consequences of recomputing the tree and spending the same global capacity, not evidence that the local E edit directly altered those cells.

The fixed limit is `1.390788333484506`. B uses `1.384622`→`1.388982` in P1 original→E→F′, and `1.390788`→`1.384622` in P2. Direct-F B uses `1.390788` for P1 and `1.385680` for P2. The budget can remain nearly full while the selected cells change; it is not always exactly exhausted, and the discrete rejected-branch structure determines the remainder. At P2 COMMIT, B has 112 nodes while X has 104, so equal rooted-edge length does not imply fewer cells or a simpler shape.

## Direct-F stress reference

| Event | F nodes / F Jaccard | X | G | B |
| --- | --- | --- | --- | --- |
| P1 | 775→774 / .99871 | 112→111, J=.99107; only cell 5619 lost | 94→93, J=.98936; only cell 5619 lost | 111→112, J=.97345; cell 5619 lost, 2 gained outside the immediate stencil |
| P2 | 951→950 / .99895 | 104→103, J=.99038; only cell 5620 lost | 73→47, J=.64384; 26 lost, 22 outside the immediate stencil | 112→114, J=.46753; 40 lost, 42 gained, 78 changed cells outside the immediate stencil |

P2 G reproduces the known graph-detour amplification. P2 B is much more sensitive: its changed cells have median distance `.0447` from the deleted cell on the lost side and `.1648` on the gained side; the farthest gain is `.2170` from the edit. The reselected nucleus remains 6192. This is a budget/tree redistribution effect under fixed nucleus, not allocation movement.

The direct-F reference and upstream E→F′ test answer different questions: direct-F isolates capture response to a changed F membership set, while E→F′ includes the production thinning response. Neither substitutes for the other.

## Stateless ten-anchor context

The original frozen anchors produce the following X/G/B node counts. Every X/G member set exactly matches the parent on all ten anchors; B is calculated afresh at every state without UPDATE or continuity bonuses.

| Event | Anchor sequence X / G / B |
| --- | --- |
| P1 | START 71/63/113; +10 s 101/82/112; COMMIT−2 s 109/89/112; COMMIT−1 s 112/94/111; COMMIT 112/94/111 |
| P2 | START 107/89/111; +10 s 97/69/114; COMMIT−2 s 93/67/113; COMMIT−1 s 97/67/114; COMMIT 104/73/112 |

Across the late adjacent one-second anchors, X/G/B Jaccards are P1 `.956/.947/.890` from COMMIT−2 to −1, then `1/1/1` to COMMIT; P2 `.827/.763/.816`, then `.844/.728/.780`. B is not uniformly more temporally stable than X. These descriptive state comparisons do not test UPDATE or long-run accumulation.

The P2 +10 s nucleus is 6191; other listed anchors select 6192. This temporal identity difference is separate from the two COMMIT perturbations, where both fixed and reselected views stay at 6192. It keeps the max-D policy's broader allocation semantics open without attributing instability to this capture stress.

## Dense-F fixture

On the parent's exact full 96×96 F fixture, the audit reproduces the stored X/G counts (641/577). B admits 112 nodes at the P1-matched capacity `1.390788333484506`, with maximum Euclidean reach `.06316` from the center, versus X's `.14961`. But B's selected set still has 388 induced 8-neighbor edges and cycle rank 277. The rooted-edge budget does not produce a simple path or cap the induced topology; it cuts a deterministic subset under an authored accounting rule. Fewer cells alone do not establish useful simplification or material meaning.

## Interpretation

- **Measurement:** the tested E→F′ perturbations remain local at the thinning representation and X capture membership. G responds more strongly where its graph-distance boundary is affected. B exhibits distant membership reallocation under the single fixed capacity; P2 direct-F gives the clearest counterexample.
- **Architecture inference:** X is the strongest capture null among these measured contracts because it preserves a spatially bounded, local response without adding a global budget-reallocation effect. B does not show a robustness advantage or a clearly meaningful structural responsibility here.
- **Authored semantics:** Euclidean local extent and conserved rooted structural amount encode different choices. The data do not decide which meaning is artistically correct. `R=.15` and `L_compare` remain authored comparison values.
- **Opportunity Allocation:** no nucleus displacement occurred in either COMMIT perturbation, so it did not explain these capture differences. The max-D rule remains only a comparison policy; allocation semantics are still unvalidated for adoption.
- **Unresolved risk:** two one-cell stresses and one dense adversarial fixture cannot establish behavior across all possible E topologies, future events, or longer histories. The P2 result is meaningful counterevidence to B's robustness under this contract, not a universal theorem about all structural-capacity laws.

## Recommendation and next boundary

Retain X as the current strongest capture null for any later isolated design discussion. Do not adopt X as production law from this pass alone. Do not further tune B, R, or capacity here. No additional capture-law pass is required to distinguish X and this B diagnostic on the frozen cases. If ANT advances toward an authored materialization law, the smallest separate unresolved question is whether and how an event gets its nucleus/opportunity; this pass does not answer it and does not authorize a selector.

No proposer, ranking, UPDATE, maturation, BODY, material mapping, production feedback, new simulation, long-run campaign or audio work was performed.
