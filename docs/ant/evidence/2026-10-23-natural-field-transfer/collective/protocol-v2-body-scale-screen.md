# Collective routelet reuse protocol — version 2

**Status:** archived preregistered screen; superseded as the primary candidate gate before routelet analysis. This version added a body-scale curvature/chord threshold that excludes the specified gentle-arc control. Retain it only as a separately labeled limited curvature classification if it is reported.

## Question and claim boundary

Do distinct ants traverse a similar *one-second curved local routelet* at separate times? This is a local geometric reuse screen; a one-second match does not prove a long shared corridor, whole-loop circulation, ellipse, or milling. It cannot establish intention, following, a social relationship, a pioneer role, memory, or a causal field effect. A route may be shared because of boundaries, population density, obstacles, initialization, or other movement constraints.

The unit used for comparison is a pair of one-second routelets from different ants. Raw routelet pairs are dependent because one ant contributes many routelets and one routelet can be compared with several others. The report will preserve seed, ant, ant-pair, and temporal-block counts; pooled routelet pairs will not be treated as independent replicates or used to claim population-level significance.

## Frozen inputs and order of work

The target inputs are the existing natural trajectory archives at 10 Hz from the frozen `9fcd962` evidence package. First record each source file's repository path, byte size, and SHA-256, and verify the exact row schema from the committed validation receipt. Read the prior raw JSON files only after this protocol and its fixture checks are recorded. Parse copies in memory; do not rewrite, normalize, sort in place, or otherwise alter source archives. Analyze each seed/condition separately. The long-run cases remain separate descriptive cases and are not pooled with the three 600 s natural seeds.

## Routelets and temporal separation

- Use fixed one-second windows: ten consecutive 100 ms intervals and eleven recorded positions, aligned to integer seconds. Require every tick; do not interpolate over gaps. Skip routelets with path length below `1e-4 m`, matching the existing route-curvature diagnostic floor.
- Coordinates and distances use normalized world units. The current ant body diameter is `0.012` normalized units; the two spatial scales are one and two body diameters, `0.012` and `0.024`. These are fixed before viewing the target trajectories.
- Represent a routelet as the ten straight line segments between its recorded positions. Use Euclidean point-to-segment distances and length-weighted summaries, never raster-cell equality as the reuse test.
- Compare only different ant IDs. Routelet intervals must not overlap and must have at least one full one-second gap between them. This prevents simultaneous co-travel from being counted as temporal reuse. Report the actual gap for every comparison.
- Compare geometry independent of traversal direction. Report directed tangent cosine as well as tangent-axis alignment. For curvature sign, reverse the second routelet's signed curvature when corresponding tangents point in opposite directions, so the same arc traversed backward retains the same geometric sign.

The temporal rule is a conservative operational definition, not a biological timescale. The result applies only to reuse separated by at least one second; shorter-lag co-travel is outside this test.

## Measures and fixed gates

For each routelet pair, report both directions (A→B and B→A) and both preregistered spatial scales, `0.012` and `0.024` normalized world units.

At each scale, report separately:

- path-length fraction whose recorded segment midpoints lie within the scale of the other routelet's continuous polyline;
- length-weighted mean nearest-polyline distance;
- length-weighted fraction of matched tangents within 30 degrees, using tangent axes so opposite travel directions can match;
- directed tangent cosine, retaining whether motion was aligned or opposed;
- signed-curvature sign agreement among matched curved samples, after direction canonicalization, plus the number of valid curved segment samples, their segment indices and consecutive-run lengths, and mean absolute curvature on each side;
- each routelet's integrated signed travel turn, integrated absolute turn, net start-to-end tangent turn, and maximum deviation from its endpoint chord.

Curvature is the signed change in travel tangent per mean adjacent-segment length, in inverse normalized world units. To separate microscopic wiggle from body-scale curvature, a curved sample must turn at least `0.1 rad` per body diameter (`abs(curvature) * 0.012 >= 0.1`), and each routelet must deviate from its endpoint chord by at least `0.1` body diameter (`0.0012` normalized units). These are geometric resolution gates for this diagnostic, not biological or aesthetic minima; report the underlying turns and deviation so gentle curves below the gate remain visible as limits.

No composite score or learned mode is computed. A pair is only flagged as a *candidate local curved reuse* at a scale when, in both directions, path overlap is at least 0.75, at least 0.75 of matched path length has tangent-axis error at most 30 degrees, at least three segment samples have valid body-scale curvature on both routes, at least 0.75 of those curved samples have matching canonicalized curvature sign, and both routelets meet the chord-deviation gate. These screening gates remain fixed; all component measures are reported separately, and crossing or negative-control fixtures must not pass them.

The recorded positions are 10 Hz observations, so segment-midpoint measures estimate route support at that temporal resolution. They are continuous Euclidean measurements over polylines, not proof of sub-sample motion. Report routelet step-length distributions so this resolution limit is visible.

## Controls required before natural-data analysis

Deterministic synthetic fixtures must show:

1. **Straight parallel offset paths:** overlap and tangent measures may be high, but there is no valid curved support and no curved-reuse candidate.
2. **Near-straight numerical jitter:** even matching low-amplitude perturbations stay below the body-scale chord-deviation gate and cannot count as curved reuse.
3. **Reused circular arc:** two different ants traverse the same arc in separate windows, including a reverse-direction case; it passes the geometric overlap, tangent, and curvature-sign gates.
4. **Independent crossing paths:** a single crossing cannot pass the path-length overlap gate.
5. **Independent deterministic zigzags:** paths may share a broad envelope, but local tangent/curvature disagreement prevents a curved-reuse candidate.
6. **Same-ant replay and simultaneous routelets:** neither is eligible, even if geometry is identical.

After these fixtures pass, freeze the code and inputs before analysis. Do not tune thresholds against natural results. Analyze all three 600 s production and `dtFeedback` seeds by case. For the 7,200 s production and `dtFeedback` cases, restrict pair comparisons to the existing 120 s windows `[480, 600]`, `[1680, 1800]`, and `[7080, 7200]`; do not pool or compare every routelet across the full two-hour history. Report counts at seed/window and ant-pair level, candidate routelet-pair evidence with component measures, and sensitivity at the two fixed distance scales. Deterministically selected representative pairs may be reported with the support locations/run lengths; large pair arrays need not be committed when source hashes, counts, and reproduction steps are recorded. Any later scale, gap, curvature, or gate change is a separately labeled sensitivity analysis, not a replacement primary result.

## Interpretation limits

A positive result supports only repeated geometric use of a curved local routelet by distinct ants in the saved trajectories under this definition. It does not show that ants recognize the route, that field transfer caused reuse, that a long corridor persists as an internal object, or that an ellipse/milling formation exists. No aesthetic minimum is defined. A negative result is limited by one-second segmentation, 10 Hz sampling, chosen body-scale distances, curvature resolution, and the one-second temporal exclusion.
