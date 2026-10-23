# Fixed-anchor routelet reuse follow-up — exploratory protocol v4

**Status:** frozen before v4 target-data analysis. This is a separate follow-up prompted by v3's finding that recurrence grouped only by ant pair does not identify a fixed spatial location. It does not replace or revise v1, v2, or v3; those records and their outputs remain unchanged in meaning. This pass reuses v3's exact routelet construction, scales, comparison shortlist, continuous geometry measures, temporal exclusion, and candidate gates. It adds no clustering, spatial bins as a decision rule, matching tolerance, or quality score.

## Question and claim boundary

For a fixed one-second routelet, how many distinct other ants have a v3 candidate match to that same routelet at a separate time, and how are those partner events distributed in time? This tests whether a common sampled local anchor recurs across ants, rather than only whether the same ant pair matches somewhere more than once.

The unit of reporting is an anchor routelet within one case, one declared window, and one spatial scale. Each qualifying pair contributes one partner event to each endpoint anchor. An anchor's distinct-partner count is the number of unique other ant IDs across its qualifying events. A partner event retains partner ant ID, partner routelet start/end time, elapsed interval gap, signed start-time offset from the anchor, and both directional v3 geometry measurements. Events are not independent observations: they can share an anchor, partner ant, routelet, trajectory, seed, and case. Counts are descriptive; no pooled significance or pseudoreplication is used.

This remains a one-second anchor test. It cannot establish a long shared corridor, continuous route between separated visits, intention, following, social relationship, role, memory, biological route choice, or artistic formation. A candidate may be caused or constrained by the world boundary, density, obstacles, initialization, or another common condition. Tiny matched numerical jitter is a known v3 screen false positive and remains so here.

## Frozen inputs, units, and matching predicate

Use exactly the eight source archives, source hashes, row extents, cadence assertions, 10 Hz tick conversion, normalized world coordinates, case separation, and windows frozen in [v3](v3/protocol.md). Inputs are existing saved trajectories from commit `9fcd962`; do not run a simulation or rewrite source data. For the three long-run files, compare only the separately reported windows `[480,600]`, `[1680,1800]`, and `[7080,7200]` seconds.

Build aligned one-second routelets exactly as v3: 11 consecutive observed positions / 10 segments, integer-second aligned; require all positions; skip path length below `1e-4` normalized world units; source sample index is `tick / 6` and must be integral. Keep the first observed sample at index 1; do not invent the missing first second. Compare only different ant IDs. Require the v3 minimum one-second interval separation. At each of the fixed normalized-world distances `0.012` and `0.024`, evaluate the exact v3 bidirectional predicate: overlap fraction at least `0.75` in both directions; tangent-aligned fraction at least `0.75` in both directions; at least three matched numerically non-straight curvature samples; and direction-canonicalized curvature-sign agreement at least `0.75` in both directions. Preserve v3's curvature epsilon of `1e-6` inverse normalized units, all point-to-polyline measurements, and all other routelet definitions. The `0.012` and `0.024` values are one and two body diameters in normalized space; they are not meters.

Do not add a body-curvature, chord-deviation, net-turn, route-length, persistence-duration, partner-count, or aesthetic minimum. Report each anchor's and representative partner routelets' path length, integrated signed and absolute turn, net endpoint tangent turn, maximum deviation from endpoint chord, and curvature support indices/run lengths/locations. This continuous geometry is required to interpret what the frozen screen selected, especially because the near-straight jitter control can pass. Report an anchor's support as observed one-second geometry only.

## Anchor and recurrence summaries

For every scale, report:

- total routelet anchors and anchors with at least one qualifying partner;
- numbers of anchors with `>=1`, `>=2`, `>=3`, and `>=5` distinct partner ants; these are descriptive bins only, not candidate-quality classes;
- the distribution of distinct partner-ant count per anchor, including zeros;
- qualifying anchor-partner event count, unique unordered ant-pair count, and unique anchor count;
- for anchors with partners, their routelet geometry distributions, including signed/absolute/net turn and chord deviation;
- partner event-count distribution per anchor and per partner ant within an anchor;
- each anchor's partner start-time span (maximum minus minimum partner start time), signed partner-start offsets from the anchor, anchor-to-partner interval gaps, and within-partner recurrence gaps between successive partner routelet start times;
- continuous v3 overlap, tangent and curvature-sign measures for the candidate events.

For the deterministic representative in each case/window/scale, choose the anchor with the maximum number of distinct partner ant IDs. Break ties by earliest anchor start time, then lexicographically smallest ant ID. Include its full anchor polyline and metrics. For every distinct partner ant, include the earliest-start-time qualifying partner routelet and its full polyline/metrics; if two events tie, choose the lexicographically smallest routelet key `(start time, ant ID)`. Also report all qualifying events for that anchor through compact per-partner event counts, start-time extrema, partner-time span, signed-offset distribution, interval-gap distribution, and same-partner recurrence-gap distribution. No partner is omitted from the counts because only one representative polyline is shown.

The representative figure uses the same fixed normalized-coordinate world view `[0,1] x [0,1]` for every case/window/scale, alongside a local inset. The inset bounds are computed from the exact representative anchor plus one earliest qualifying routelet per partner, with fixed 10% padding of the combined extent and a minimum displayed span of `0.01` normalized units on each axis. The inset is a display aid only; its bounds and padding are not used for matching or selection. Label ant IDs, anchor and partner start/end times, and scale. Draw actual observed polylines and anchor curvature-support segment midpoints. Do not smooth, resample, recolor source points, or select visually attractive examples.

If a case/window/scale has no qualifying anchor, report no representative and emit no fabricated figure.

## Deterministic controls and sequence

Before target data analysis, tests must cover: (1) at least three distinct ants matching the same fixed arc anchor at separated times, yielding at least three distinct partners for that anchor; (2) the same two-ant pair matching two spatially distant arcs in separate visits, yielding repeated pair matches overall but no fixed anchor with two distinct partner ants; (3) v3's straight-parallel, gentle radius-`0.25` arc, tiny-jitter, independent crossing, and independent zigzag controls; and (4) time/sample validation. The tiny-jitter fixture is expected to demonstrate the already-known v3 false-positive limit, not to invite a changed gate.

Freeze and hash the protocol and passing tests before analyzing target rows. Preserve the v3 executed script, protocol, summary, report, and their hashes under `collective/v3/`. Write v4 results to new files only; do not overwrite v3 outputs. Analyze each of the eight frozen cases and each of the six bounded long-run windows separately. Record source hashes, v3 predicate/source identity, v4 protocol and script hashes, row counts, interval conversions, per-case anchor summaries, and deterministic representative SVGs. Do not save full all-pair arrays when exact sources, code, protocol, checks, and aggregate summaries suffice for reproduction.

## Interpretation

An anchor with multiple distinct partner ants indicates that those ants have candidate matches to the same observed one-second spatial routelet under the fixed v3 screen and separate-time rule. It is stronger evidence for shared use of a local spatial trace than recurrence of one ant pair across a whole case, but not evidence for a long-lived corridor: each partner match is only one second, and matches can be separated by long gaps. Report the actual anchor/partner turn, chord deviation, support segments, and event-time spans rather than assigning an aesthetic label or declaring a minimum successful quality.

The source intervention controls initial seed and changes feedback policy. Therefore a contrast in these saved cases can describe the total outcome of that feedback intervention over the observed trajectories, including downstream movement and population/identity changes. It does not isolate the direct instantaneous field effect, establish a single mechanism, or justify broad cross-seed generalization. Candidate pairs and anchors are dependent; seed labels are reported separately and are not treated as independent sub-seed replicates.
