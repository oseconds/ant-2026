# 2026-11-01 — B/C local conflict topology audit

## Question

Within each contested exact-X overlap component, how many options are mutually incompatible, and how many can coexist without overlap?

## Frozen authority

- Production represented: `main@bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Local conflict decomposition: `codex/ant-bc-local-conflict-decomposition-20261101@86f0b57bb67bc2b60794108ce5e04dc5e761d45a`.
- Capacity necessity audit: `codex/ant-bc-material-capacity-necessity-audit-20261101@ebd1f34c5d2322bd5d3c3d6c8b83bad5a8fd7b6e`.
- Exact registered packet reused: 163 slots, 1,846 unique-X appearances, 1,352 overlap components.
- No natural simulation or replay.

## Measurement

- 231 contested components: 143 cliques (`alpha = 1`) and 88 with `alpha > 1`.
- All 120 size-2 components are cliques. Larger groups become less complete: clique fraction is 40.9% for size 3, 11.6% for sizes 4–5, and 0% for sizes 6+.
- Exact pooled compatible-option sum is 1,475, compared with 1,352 one-per-component slots. By seed the difference is +37, +45, and +41.
- `alpha` reaches 5 in one size-12 component. Maximum-compatible is a geometric upper bound, not a commit schedule or production target.
- 57 contested components have a maximum independent set containing both B and C options. No contested component contains a coeval `{B,C}` node.
- Along the existing unambiguous region continuations, 75 of 108 adjacent graph pairs are non-isomorphic. Topology changes occur both ways between clique and partial graphs.

## Interpretation

**MIXED TOPOLOGY.** Size-2 conflicts are single-choice under overlap exclusion. Larger transitive components often contain multiple mutually compatible masks. Connected components therefore do not generally define one-winner arbitration units.

This does not select any maximum independent set or imply that every compatible X should be committed. World-level capacity stays open under the previous **CAPACITY LAW NOT YET JUSTIFIED** result.

## Next question

Which minimal local responsibility should resolve candidates that overlap while allowing disjoint candidates to remain potentially compatible? Do not yet add a winner, packing, or capacity law.

## Evidence

[Full report](../evidence/2026-11-01-bc-local-conflict-topology-audit/REPORT.md) · [validation](../evidence/2026-11-01-bc-local-conflict-topology-audit/VALIDATION.md) · [objective atlas](../evidence/2026-11-01-bc-local-conflict-topology-audit/visual/overlap-topology-atlas.svg)
