# Protocol — local-X material replacement

## Question

Can three fresh 300 s ANT worlds retain coherent, spatially distributed material when the current authored source-to-boundary Plate outputs stop entering stratigraphy and uncontested local X episodes become the only new Plate source?

This is a replacement experiment. It does not select an ontology or authorize adoption.

## Authority and frozen starting point

- Requested production authority: main at bc045dc3caa5954df633ecbee37fbabcb8224f30.
- Requested experiment base: 7c96c128bd32bea33f69d8a1c1d08cf85d4421f8.
- Local frozen formation closure: 2cfe9cbab78df2af9e77d9df450c67fb603aa22c.
- Feedback probes: f462d7b0f684afea1bb6868b6045524360e05f2e and 9b03a392588429643cf43b386706d58bbfb66418.
- Real-stratigraphy descriptor probe: 7c96c128bd32bea33f69d8a1c1d08cf85d4421f8.
- Seeds: 20261005, 20261006, 20261007.
- Duration: 300 model seconds; dt = 1/60; 60 Hz; Audio Off.
- Each arm constructs a fresh AntController and fresh world.

The harness verifies that the exact authority commit object exists and that the current `src/` and `static/` diff from it matches the prior recorded default-off `researchLayerCountProvider` hook. It hashes the source blobs from the authority commit and matches them to the frozen signal-package source hashes; it separately verifies current working source bytes against the prior validated checkout receipt. The hook remains unset in both arms, and this pass changes no `src/` or `static/` file.

## CONTROL

CONTROL runs the unchanged production selector, inserts native source-to-boundary descriptors into real MaterialStratigraphy, and runs the local B/C/X observer read-only.

Before a seed's REPLACEMENT begins, the first 300 native one-second boundaries must reproduce its saved authority signal receipt:

- E, F, B, C, D;
- native layer-count and top-layer maps;
- native selector Plate IDs, birth times, and exact masks;
- saved controller RNG calls and state;
- every B/C opportunity row and recaptured X mask, plus maturation identity, timing and exact X mask after the frozen-to-live track IDs are matched one-to-one.

A failed CONTROL gate marks that seed INVALID / BASELINE MISMATCH and skips its REPLACEMENT arm.

## REPLACEMENT

Production movement, pheromone, SurfaceField, native TrailPlateBirth chemical memory, selector, recruitment, material feedback, stratigraphy and Nodule behavior remain active.

At the controller's material insertion boundary, a native trail-plate descriptor is recorded with its time, exact mask, source, target, size, geodesic span and spatial summary. The research wrapper does not call the original addPlate for that descriptor. TrailPlateBirth still updates its own candidate and birth diagnostics; the wrapper does not feed shadow data into X selection. Shadow rows are explicitly labeled selector attempts and are never labeled as stratigraphy Plates.

The read-only local observer receives:

- B: native TrailPlateBirth.chemicalMemory;
- C: native SurfaceField compaction;
- F: the native E mask after the locked Zhang–Suen thinning;
- X(n,F): the nucleus-connected 8-neighbor component of F inside the Euclidean disk centered on nucleus n, radius 0.15.

Reuse the validated observer's exact track semantics, uninterrupted 20 s maturation, adjacent-X Jaccard threshold >= 0.60, exact same-X coeval grouping, and current mature-X overlap graph. No cadence, production birth-gap, corridor refractory, contact-repeat, or overlap-resolution rule is added.

A newly mature exact X is accepted only when its current unique-X overlap-graph degree is zero. Same-X coeval B/C events create one {B,C} Plate. A contested event is observation only. It receives no retry, queue, winner, packing, fusion, lamination, or B/C intersection requirement.

Every accepted X is converted using the validated real-stratigraphy descriptor and inserted after the completed native tick at its maturation time. The exact X mask, local event provenance (B, C, or {B,C}), and shared neutral material contract are retained. No source, target, source-to-boundary corridor, centerline, or principal path is added. The native layer count, top/buried order, depth, renderer topology, and Nodule systems then consume the inserted Plate normally.

The shared descriptor uses stiffness 0.9, density 1.1, damping 0.35, the helper's unchanged pickup contract, and the native default thickness contract (0.002 m for the helper's default width). These are structural test inputs, not measured B/C/X physical properties.

## Fixed measurements

Report 0–60, 60–120, 120–180, 180–240 and 240–300 s windows. Per-tick movement and feedback windows use exactly 3,600 one-indexed 60 Hz tick entries per window, avoiding accumulated floating-point clock drift. Birth and maturation windows use actual model timestamps and half-open intervals. Record field and material checkpoints at completed 60 s ticks.

- Formation: first actual Plate time, actual birth counts and rates, B/C maturations, singleton and contested decisions, local X mask sizes, candidate entry distance and provenance.
- Material: exact Plate masks and chronology; unique covered cells; layer-cell incidences; q50/q90/max L over all 9,216 cells including zeros; top, partly buried and completely buried Plates; burial depth; Nodule births, source stacks and foundation provenance.
- Movement and environment: population, spawn and retirement counts, realized travel, blocked ant-ticks, pheromone, SurfaceField, B memory, tick-entry material exposure, and changed native speed/A-turn-rate/D-headway consumers.
- Spatial structure: 8-neighbor connected covered-body sizes; occupancy and normalized Shannon entropy across a fixed 8×8 grid; per-cell coverage and layer incidences; per-Plate minimum entry distance, entry-centroid distance, authored boundary-band contact, and literal raster-edge contact.
- Selector shadow: actual local births versus every same-world shadow selector birth, including counts, timing, mask intersections/Jaccard, centers, entry distances, and union-coverage overlap. Pairwise measurements are descriptive and select no winner.

Near-entry means any mask cell is within 0.15 of authored entry (0.5, 0.72), matching the locked capture radius. Boundary-band contact means any mask cell is within 0.05 of a world edge, matching the current selector's terminal-distance contract. Literal grid-edge contact is reported separately. These definitions are fixed before runs.

## Invariants and stop rules

- finite ant position, velocity and heading every tick; positions remain in [0,1]²;
- normal spawn clearance for every newly spawned ant;
- finite field and material state at every native analysis boundary;
- zero research controller-RNG calls and blocked Math.random during observer and descriptor work;
- exact chronological actual material insertion;
- CONTROL receives only native Plates;
- REPLACEMENT stratigraphy receives no source-selector Plate and each accepted local X exactly once;
- local Plate mask and provenance match the accepted observer decision, with no fabricated path geometry;
- researchLayerCountProvider stays null, AudioBridge stays absent, and production source stays untouched;
- topology compiler accepts the actual material and Nodule snapshot;
- retain MATERIAL_STRATIGRAPHY_MAX_PLATES = 256 and native Nodule cap.

If REPLACEMENT reaches 256 actual Plates before 300 s, record exact time and state, stop that arm, and classify CAPACITY BLOCKED. Record a Nodule cap without changing native behavior. Stop after these three seeds and two arms; no 600 s extension, Audio On, tuning, or adoption.

## Decision classes

- REPLACEMENT FUNCTIONALLY VIABLE: all three seeds retain sustained local material, ants encounter it, native material feedback is exercised, local/non-entry histories remain represented, all invariants hold, and no capacity ceiling blocks the horizon.
- REPLACEMENT VIABLE BUT REGIME DISTINCT: valid causal material dynamics remain, but material amount or structure, Nodule lineage, or organism dynamics enter a substantially different regime.
- CAPACITY BLOCKED: the fixed local-X replacement reaches the existing 256-Plate ceiling before 300 s.
- REPLACEMENT FUNCTIONALLY WEAK: material exists but retained presence or feedback exposure is too sparse to serve its current role over this horizon.
- INVALID: CONTROL conformance, invariants, or separation fail.

No class chooses among contested events, a natural ontology, physical coefficients, audio quality, long-term capacity/turnover, or production adoption.
