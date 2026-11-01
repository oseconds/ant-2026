# Protocol — B/C local conflict topology

- Inputs: exact frozen packets from `codex/ant-bc-local-conflict-decomposition-20261101@86f0b57bb67bc2b60794108ce5e04dc5e761d45a` and previous capacity audit `ebd1f34c5d2322bd5d3c3d6c8b83bad5a8fd7b6e`. Production authority represented is `bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Graph node: one registered unique mature X option. Edge: exact X masks share at least one cell. Existing same-mask B/C collapse remains one dual-provenance node.
- Graph components are unchanged from the exact overlap relation. Every edge and component partition is independently reconstructed from X cells, compared with registered receipts, then checked using both BFS and union-find.
- All contested components are size <=12. Exhaustive subset enumeration computes clique number, alpha, maximum-set counts and maximal-independent-set size distributions. Recursive include/exclude searches independently verify exact maximum cliques and independent sets.
- Articulation vertices and bridges use graph connectivity after vertex/edge removal. Universal means degree `n-1`. Edge density is `m / choose(n,2)`.
- `COMPATIBLE` is the sum of exact `α` across connected components within a slot. It is a maximum geometric packing cardinality, not a chosen set or commit recommendation.
- Maximum-set provenance counts B-only, C-only and dual nodes. A dual node contributes to both channel-presence flags. No evidence strengths are combined.
- Fixed windows use actual timestamps and `floor(timeMs/60,000)`, with reported intervals `[0,60), ... [540,600)`. Quantiles select the sorted value at `floor((n-1)p)`.
- Persistence reads only the prior package's one-to-one adjacent contested-region track IDs. Between consecutive observations, unlabeled graph isomorphism uses degree-pruned adjacency-preserving backtracking. This compares abstract graph shape only; it does not assign persistent candidate identities.
- Objective-case ties use seed, slot, component ID order after the stated criterion. One maximum independent set is shown as a diagnostic example only.
- Deterministic Node.js analysis; zero RNG, zero simulation/replay, zero production feedback.
