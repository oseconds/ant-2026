# 2026-10-31 — Bounded E-qualified incumbent eligibility

## Question

After the previous recurrence/signature conflict, test the corrected rule: fresh Q membership enters only through fixed-nucleus B; previous Q members remain eligible while current E-qualified.

## Work and result

- Reused the exact frozen P1/P2 packet, saved times, E/F/D/I maps, START nuclei, registered stateless X, and prior fixed-nucleus B memberships.
- Reproduced current production F and prior B at 42/42 anchors; START nuclei 2/2; registered stateless X 10/10; observer RNG calls 0.
- Corrected recurrence passed fresh-ingress, Q-only incumbent, and re-entry invariants. All 322 new entries came through B; no entry outside B and no re-entry violation.
- Q transition losses fell from B's 62/100 to 8/8. All Q losses followed E exit; no still-E connectivity losses.
- Q nevertheless grew to 148/158 nodes, 32%/52% above final B. It reached 68%/65% of local E; 36/54 unique Q-only cells were still incumbent-only at the final anchor.
- Decision: **STALE / OVER-RETENTIVE**. Park E-qualified incumbency; do not tune or adopt it.

## Boundary

This is UPDATE mechanism evidence on frozen historical states. No new trajectory, production source, selector, material semantics, Plate, COMMIT, Residence, geology, or audio change.

Detailed results: [evidence package](../evidence/2026-10-31-materialization-e-bounded-incumbency/README.md). The earlier stop remains preserved at [predecessor evidence](../evidence/2026-10-31-materialization-e-incumbent-eligibility/README.md).
