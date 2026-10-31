# Protocol — B/C dual-material shadow maturation

## Question and authority

This observer-only pass asks whether two independent episode-evidence tracks, B and C, under the same fixed temporal/X-stability grammar produce redundant events or similar-but-distinct schedules and virtual layer histories.

- Production authority represented by the frozen observations: `bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Opportunity packet: `da599d9f385f53d0bb24df3e737c5ed2e2eb6a23`.
- B/C responsibility packet: `a75b83ce5dbeece36d60d966b9d86fc85ddb5f54`.
- Review package: `dfc29559860ec9e6312d2ea556041d956117bc5e`.
- Seeds: `20261005`, `20261006`, `20261007`; 599 saved boundaries per seed.

## Locked meanings

- **B:** `TrailPlateBirth.chemicalMemory`, the existing qualified chemical history. Native input transform and 20 s EMA are unchanged.
- **C:** `SurfaceField.sample()`, normalized compaction written by `FOOT_CONTACT`, with the native 1800 s half-life. This is not a force, pressure, or material-density estimate.
- **F:** the already-frozen production-thinned qualified carrier from the source opportunity packet.
- **X:** registered `X(n,F)`, the 8-neighbor component containing the opportunity center inside `F ∩ EuclideanDisk(n,.15)`.
- **Tracks:** existing positive local-maximum plateau opportunities, `.15` grouping, and primary reciprocal-nearest `.025` correspondence. No redefinition or new winner threshold.

## Shared shadow maturation grammar

The same function runs independently over every saved B and C track. Track observations are processed by actual `timeMs`, then saved anchor index. Each observation refers to its exact registered X capture and sorted unique row-major cell IDs.

1. Start a stability interval at the track's first observation.
2. Continue it only if the current and immediately preceding X cell sets have exact Jaccard similarity `>= .60` and saved anchor indices are adjacent.
3. Reset at the current observation when Jaccard is `< .60` or an observation gap is present. That current X begins the new interval.
4. Emit one shadow maturation event at the first saved observation whose actual timestamp minus the current interval's start timestamp is `>= 20,000 ms`.
5. Do not emit again from that uninterrupted interval. A later event is possible only after a genuine reset and a new 20 s interval.

Similarity is set Jaccard: count the intersection and divide by `|A| + |B| − intersection`, equivalent to intersection over union. Empty X is not expected for a registered capture; it is not substituted with path or centroid similarity. The event records the complete adjacent-X chain, interval start, track start, exact event timestamp, center, X set and prior-material overlap.

No amplitude threshold is applied. Every existing track can mature. The 10 s global gap, 90 s same-corridor refractory, `+30` new contact rule, and 256 Plate ceiling are omitted. Events are shadow maturation records, not production births.

## Cross-channel schedule and space

For each event, the nearest event from the opposite channel is recorded with signed lag `C time − B time`, event IDs and absolute lag. Descriptive windows are `<=1`, `<=5`, `<=10`, and `<=20 s`; these are summaries, not ontology thresholds. Exact same-boundary B/C pairs are counted pairwise, so multiplicity at one time can create multiple pairs. Their X relation is classified as identical, partial overlap, or disjoint; saved F-component equality is retained where available.

No one-to-one assignment between event streams is imposed. Nearest-event timing and same-boundary pair counts answer different questions and are not summed as unique matches.

## Virtual dual-provenance ledger

Each B event inserts one virtual B layer over its locked X cells; each C event inserts one virtual C layer over its X cells. Events are inserted by actual timestamp. Exact ties are reported B before C and then by event ID solely to make receipts deterministic; that order has no causal or physical top/bottom meaning.

The ledger records per-cell ordered provenance, coverage by B and C, cells touched by both, layer-count histogram over the full 96×96 analysis grid, strict-time adjacent B→C and C→B transitions, alternating strict-time cell sequences, exact duplicate consecutive X sets, and overlap against final already-born production material. It is not a physical material simulation and is not attached to `MaterialStratigraphy`.

## Visuals and no-feedback boundary

The event atlases reuse the frozen opportunity/X receipts and render only selected exact event timestamps against the corresponding native world frame and existing material. Missing selected frames were reconstructed by deterministic replay through the already-authorized presentation path; they did not supply new event or world-history measurements. No synthetic motion, interpolation, shadow Plate, or feedback was added.

Observer analysis performs no controller call and consumes no RNG. No production state is read-modified-written by the shadow; no `src/` or `static/` file is changed.
