# Signal, domain and time definitions

All channels describe the unchanged production world at `bc045dc3caa5954df633ecbee37fbabcb8224f30`. They are observer measurements, not candidate allocation inputs. The common grid has 96 by 96 nodes, coordinate `(column/95,row/95)` with y increasing downwards. All neighborhoods are in-bounds, non-wrapping 8-neighbor neighborhoods.

## Accumulated channels and qualified carrier

| Name | Exact source / definition | Units and qualification |
| --- | --- | --- |
| B | `TrailPlateBirth.chemicalMemory` immediately after its native update at a real analysis | Bounded chemical memory, not raw pheromone mass. Native update samples current pheromone p, uses `p/(p+.04)`, then EMA with tau 20 s and actual production elapsed time (the first update uses 1 s). Float32 assignment is preserved. |
| C | `SurfaceField.sample(x,y)` at the common grid nodes, stored Float32; current production SurfaceField is asserted 96 by 96 | Normalized compaction readout. Foot contacts write saturating local compaction and native half-life is 1800 s. No force or pressure interpretation. |
| D | Exact `supports` Float32 array returned by production `TrailPlateBirth.buildSupportedMask` | Production `.025` center-weighted support readout. **Production computes support only where B is chemically qualified; other D cells are zero.** |
| E | Exact `mask` returned by the same production call | Native B >= .30 and sampled support >= .015, including native operation order. |
| F | Exact current production Zhang-Suen thinning applied to copied E | Source-extracted unchanged production implementation; F remains a subset of E. |
| S | F nodes with at least one in-bounds 8-neighbor in F | Admissible observer carrier. An S node is not automatically an independent opportunity. |

Positive ΔD can therefore include entry into chemical qualification as well as a change of sampled mechanical support. It is not a pure derivative of compaction. `gatedDChanges` records how often positive S-domain ΔD has a chemically unqualified prior endpoint. C/ΔC remain the separate ungated compaction channel. D and C share production ancestry; their agreement is not independent corroboration.

The exact definitions live in unchanged [TrailPlateBirth](../../../../src/lib/agents/ant/TrailPlateBirth.js) and [SurfaceField](../../../../src/lib/agents/ant/SurfaceField.js). Source hashes in each signal index are LF-normalized SHA-256 and are checked against the authority by the runner.

## Recent physical contact

Each real emitted `FOOT_CONTACT` supplies `simulationTimeMs`, `antId`, `contactGroup` and individually positioned `contacts[]`. Count valid in-domain individual foot positions in their nearest formation-grid node (`round(x*95)`, `round(y*95)`). No centroid substitution, requested movement or event-strength weighting.

For `(t-w,t]`, w = 1, 5, 20 s, store per cell:

- `count`: individual foot count, the channel used for maxima/tracks.
- `groups`: distinct emitted group episodes, keyed by event time + ant ID + contact group.
- `ants`: distinct ant IDs contributing actual feet.
- `ageSeconds`: time since the latest-ever valid contact in that cell, `-1` if none. This contextual age is the same across the three windows.

Event strength is authored metadata, not measured force, and is not used. Counts have no spatial smoothing. These definitions differ from older near-contact context summaries by being explicit exact-cell rolling counts.

## Recent realized traffic

At tick entry preserve agent references and start positions. Immediately before boundary measurement, read their actual final positions after production collision resolution, including retired/exiting agents. Clip observed segments to the unit square. Split segments at nearest-node Voronoi boundaries, assigning linear distance and elapsed-time fractions to crossed cells. A stationary segment contributes occupancy and one segment, with zero travel.

Each segment receives its actual tick-end timestamp. Windows `(t-w,t]` include a whole tick segment when its timestamp lies inside; they do not fractionally trim at the temporal left edge. This is an exact declared summary of discrete production ticks, not continuously sampled occupancy. Exiting segments contribute only their in-domain length and corresponding linear time fraction.

Store `travel` (world distance), `ants` (distinct contributing IDs), `occupancySeconds` and `segments`. Only `travel` defines a maxima channel. Summation is Float32 in the saved raster; prepacking geometric conservation is checked in Float64. Packed aggregation relative tolerance is declared as `1e-4`. No requested/pre-collision velocity or global direction enters opportunities.

## Signed change and boundary timing

For Q = B, C, D and w = 1, 5, 20 s, choose the recorded older production analysis whose timestamp is nearest `t-w`, breaking exact ties toward the older timestamp. Require the target lag to have recorded history; an immature lag is null. Record prior index, prior/target time and actual elapsed time. Compute Float64 signed `Q(t)-Q(prior)`, without interpolation, over all 9,216 cells. Signed values and descriptive positive/negative parts remain available. Only the positive part supplies delta-channel local maxima.

All 599 analyses per seed are native production analyses. There is no independent one-Hz research clock. The exact 60/120/300/600 s visual requests reference the latest actual analysis at or before each request, with both times labeled. Some native intervals are 61 ticks because of accumulated floating-point scheduling; actual lag times and analysis correspondence must therefore remain explicit.

Startup event windows contain the available interval from model start, while state-change lags with insufficient history are absent. A one-analysis correspondence track has duration zero and remains in all receipts. Duration means last minus first observed timestamp, not an inferred continuous lifetime.

## Material diagnostics and non-identity

Save prior `layerCountByCell`, `topLayerByCell` and latest prior local Plate birth times. Current-boundary newborns are excluded. Prior union is exactly `layers > 0`. Per-X overlap is the fraction of its F cells in that union; layer mean/max/histogram are over those same cells. These are not production Plate body masks or surface area estimates. Raw top-layer/recency maps are preserved; aggregated claims use X overlap/layers and selected-case center recency only.

Entry is `(0.5,0.72)`; entry distance is Euclidean. `<= .15` and `> .15` are diagnostic partitions. Maxima, grouping, tracking and X do not read material overlap or entry membership. Track IDs denote sampled reciprocal correspondences; shared-cell F component overlap allows descriptive split/merge eligibility but never establishes a persistent physical event or entity.
