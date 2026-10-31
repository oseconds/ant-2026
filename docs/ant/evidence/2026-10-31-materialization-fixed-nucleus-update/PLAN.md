# Registered UPDATE diagnostic plan

## Question

On the frozen P1/P2 event windows, compare source→boundary production I(t), stateless local X(t), and fixed-START-nucleus re-capture X(n0,F(t)). Measure how much proposal turnover remains when max-D opportunity allocation is held fixed, and whether the observed losses support another membership/incumbency responsibility.

This is not an adoption pass. No post-result Jaccard cutoff is used.

## Authority and frozen input

- Current production: origin/main@1bf3d1d491bb5dd3ccb7ed43f3de62e9eecaca44.
- Reuse exact saved model times and E/F/D/I maps from the original seed 20261005, 60 Hz, Audio Off history packet. Do not run ANT or reconstruct a trajectory.
- P1: 21 saved anchors from 64.01666666666308 through 84.01666666666823 s.
- P2: 21 saved anchors from 86.01666666666881 through 106.01666666667463 s.
- Prior UPDATE and capture evidence supplies the E/I history, the common-anchor X cell sets, and the max-D reference nuclei. Its role is provenance and parity only.

## Locked definitions

- E: saved production-qualified mask.
- F: exact saved Zhang–Suen thinning of E from current TrailPlateBirth.js.
- Eligible nucleus: an F node with at least one 8-neighbor F node.
- START nucleus: eligible F node with greatest saved D_support; exact ties resolve to the lower row-major index.
- X(n,F): the 8-neighbor component containing n in F intersected with EuclideanDisk(n, R=.15) in normalized world coordinates. The previously registered 1e-12 numerical epsilon closes the disk boundary. The radius does not use graph distance.
- Stateless X reselects the max-D eligible nucleus at each anchor.
- Fixed-nucleus X chooses max-D n0 once at START and re-captures current X from each later F around the same n0. It does not inherit, union, repair, or retain prior cells.
- At the first anchor where n0 is not an edge-bearing F node, fixed-nucleus re-capture stops for that event. No replacement is made.

## Measurements and boundaries

For every adjacent anchor transition, report previous/current size, intersection, lost, gained, union, Jaccard, and loss state against destination E/F/current capture. Compare stateless and fixed X on each same F to isolate the spatial difference associated with nucleus choice. Also report changes between anchors with the same stateless nucleus.

Track every START-X member through current E, current F, and current fixed X. Report structural scope diagnostics for fixed X: induced edges, connectedness, Euclidean radius, weighted graph distance, degree-1 endpoints, degree-3+ junction nodes, and containing component identity/size in F.

Production I remains a descriptive source→boundary reference. No legacy geodesic, maturity, COMMIT, body, geology, audio, or Residence rules are applied to X. No production source is changed.
