# Collective routelet reuse protocol — version 1

**Status:** original preregistered draft, recorded before opening trajectory rows; superseded before natural route analysis. The unit labels below were initially written as meters and were corrected after checking the saved trajectory schema. This version is retained as sent, not as the current protocol.

## Question and claim boundary

Test whether distinct ants traverse the same curved spatial corridor, using route geometry rather than cell hits. A match cannot establish intention, following, social relationship, pioneer role, memory, or a causal field effect. Boundaries, density, obstacles, initialization, and movement constraints remain alternative explanations. A one-second match is local geometry and does not establish a long persistent corridor, ellipse, or milling.

## Routelets and time

- Use one-second routelets made from eleven consecutive 10 Hz positions, aligned to integer seconds; drop windows with missing samples and skip routelets shorter than `1e-4 m`.
- Compare only different ant IDs. Routelet intervals must not overlap and must have at least a one-second gap.
- Compare geometric tangent axes so reverse traversal can match. Canonicalize curvature sign by reversing the second curvature sign when the local tangents oppose.
- Use Euclidean point-to-polyline distances sampled at recorded segment midpoints and weighted by segment length; do not use raster-cell equality as the match.

## Measures and gates

Evaluate at `0.012 m` and `0.024 m`, intended as one and two body diameters for body radius `0.006 m`. Report both routelet directions separately:

- path-length overlap fraction within each distance scale;
- length-weighted nearest-polyline distance;
- fraction of matched path with tangent-axis error no more than 30 degrees and directed tangent cosine;
- signed-curvature sign agreement, curved sample count, and mean absolute curvature.

Curvature is signed heading change per mean adjacent-segment length; magnitudes at or below `1e-6 m^-1` are treated as numerically straight. A candidate curved reuse requires, in both directions, overlap at least 0.75, tangent alignment at least 0.75, at least three matched curved samples, and curvature sign agreement at least 0.75. No combined quality score is produced.

## Controls and dependence

Required deterministic controls: offset straight parallels, a repeated circular arc including reverse traversal, independent crossing routes, independent zigzags, same-ant replay, simultaneous windows, malformed rows, and missing samples. Report routelet, ant, and ant-pair counts; routelets sharing ants are dependent and are not independent replicates.

This version did not yet include the near-straight numerical-jitter false-positive fixture, the raw turn/chord-deviation outputs, exact source-frame mapping, or bounded 7,200 s windows. See the current protocol in `README.md` and retained reviewed screen in `protocol-v2-body-scale-screen.md`.
