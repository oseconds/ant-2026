# Bounded E-qualified incumbent eligibility

## Question

On the exact frozen P1/P2 anchors, test whether prior episode members may remain eligible while current E-qualified, while fresh membership enters only through the fresh fixed-nucleus capture B.

## Locked laws

- START nucleus: edge-bearing F node with maximum D support; exact ties choose lower row-major index. Freeze n0.
- B(t): n0-connected component of F(t) inside the closed Euclidean disk of radius .15.
- Q0 = B0.
- Later incumbent = Q(t-1) intersect E(t); admissible = B(t) union incumbent; Qt is the n0-connected component of admissible inside the same disk.
- Stop an event at the first anchor where n0 is no longer edge-bearing in current F. Do not repair or reallocate.
- New Q cells must belong to current B. Q\B cells must be previous-Q members and current-E-qualified. A current-F Q\B cell is valid only when it was already in previous Q.
- A cell that left Q may re-enter only through current B.

## Frozen inputs

Reuse the exact 21 P1 and 21 P2 anchors, E/F/D/I maps, registered X, START nuclei and B memberships in the predecessor package. Do not generate or replay a trajectory.

## Exclusions

No production source, material law, selector, threshold, time rule, maturation, COMMIT, descriptor, Residence, geology or audio change. No Plate creation or artistic claim.
