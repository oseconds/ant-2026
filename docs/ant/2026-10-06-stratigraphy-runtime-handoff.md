# ANT stratigraphy / runtime integrated experiment

Started 2026-10-06 Asia/Seoul from local and remote main `d281d341f5abe68ff98ca4cbf837838c7b7b45a2`. Initial working tree clean; no reset or checkout. Baseline npm test 191/191 and build passed. Logs are in `evidence/2026-10-06-stratigraphy-runtime/`.

The user authorized one environmental/audio experiment: immutable trail Plate births → local exposure/burial → adjacent-Z coupling → physical sleep/wake → minimal history-derived buried Sphere nodule. No ANT behavior retuning. String/filament and fracture/granular remain design only.

Repository guidance was updated before implementation to replace the obsolete direction-aware traffic handoff. Current frozen sources and constants are listed in AGENTS.md. SurfaceField remains 96×96, individual real-foot deposition, simulation half-life 1800 s, bounded [0,1], no RNG. Existing chemical/path birth qualification remains unchanged.

Implementation is divided into framework-independent lifecycle, precompiled audio topology, exposed-surface transport, packed sparse DSP, fixed evidence renderer and Chrome A/V evidence. Original birth descriptors and historical evidence remain immutable. The complete evidence index and measured runtime results are in [the new evidence README](evidence/2026-10-06-stratigraphy-runtime/README.md).

## Environmental rules

`TrailPlateBirth` still decides immutable births from absolute chemical/mechanical support, the colony annulus and an observation-boundary path, minimum geodesic 0.30 and 20 s persistence. Zhang–Suen skeleton, deterministic graph search, variable-width ribbon, materials and geodesic pickups remain unchanged. Only its technical storage ceiling changed, from 12 to 256. The 10 s global gap, 90 s same-corridor refractory and 30 new actual feet are unchanged.

`MaterialStratigraphy` owns bottom-to-top lists in the original 96×96 cells. Later overlapping material is appended above older material locally. Non-overlap and time alone do not bury anything. Local exposed material is the last Plate in that cell's list; older layers can remain partly exposed elsewhere. A Plate's effective thickness is frozen as `clamp(0.001 + 0.05*meanHalfWidth, 0.001, 0.010)` meters. Burial depth is the sum of later thicknesses above that Plate at the location. Age remains a separate simulation-time diagnostic.

Individual valid FOOT_CONTACT positions accumulate integer mechanical load, saturating at Uint32 capacity. Centroid, body position, elapsed age and heading do not add load. SurfaceField and its response are unchanged: contact compaction follows `c += (1-c)*0.025*GaussianWeight` within radius 0.012, relaxation is `exp(-ln(2)*dt/1800)`, footprint radius `0.014-0.005*c`, strength transfer `0.95+0.1*c`. No behavior RNG is consumed.

## Audio topology and contacts

`compileSurfaceTopology` runs on infrequent birth/topology changes. It creates flat node offsets, node grid indices, four-neighbor indices, physical pickup indices, material coefficients, exposure lookup, Z pairs and nodule foundation data. Frozen 96-grid masks are conservatively reduced to sparse 32-grid material; diagonal graph edges receive a deterministic bridge. The source geometry is never edited.

Vertical pairs are extracted from adjacent entries of each actual 96-cell column, then aggregated to solver nodes. Each pair has coefficient `0.000025 * representedSourceCells/9`. Thus D–C–B–A couples only D↔C, C↔B, B↔A. A↔C is valid where B is locally absent. Merely sharing a coarse cell cannot create a physical connection. Each endpoint receives reciprocal spring force divided by its effective density. No material union occurs.

The bridge routes a foot to only the top exposed 96-cell Plate. Buried layers receive no ordinary direct strike. Valid feet divide a group budget capped at 0.05 by their square-root count. Transfer is bounded to 0.95–1.05 and the group is L2 limited; unsupported feet retain their unused share. No additional gain compensates for supported-contact fraction.

The contact kernel integrates a Gaussian over each solver cell with fixed 3×3 Gauss–Legendre quadrature. Continuous normalized x/y determines the subcell position, sigma is the requested 0.009–0.014 footprint, without a coarse minimum. The kernel is L2 normalized and impulse is divided by sqrt(density). Negligible tails are bounded to 4 sigma and squared-weight threshold 1e−12. Exact-node and off-node tests show different footprint variance with comparable injected energy.

One shared ANT worklet contains every Plate and nodule, on the existing AudioEngine and one final GainNode. Generic String/Plate/Sphere and generic worklets are unchanged. Plate recurrence uses sparse Dirichlet Laplacian and its square at 6000 physics steps/s. Coefficients are bending `0.012*stiffness/density`, tension 0.0002, damping `0.000009 + 0.000018*materialDamping`. Fractional phase and interpolation FIFO persist across quanta. Output keeps the historical fixed `1/sqrt(12)` mixing headroom and `x/(1+abs(x))` limiter; it is not divided by current layer count.

## Physical sleep

Zero, never-excited nodes start at rest and need no integration. Active nodes are eligible to sleep after 12000 consecutive physics steps (2 s) below energy proxy 1e−10, including displacement, discrete velocity and bending strain. Local Plate, Z and Sphere force guards must each remain below 1e−8. Direct strike resets the quiet counter immediately even on an already-awake node. Meaningful neighboring or coupled energy wakes local nodes. A Plate is counted awake if any node remains awake; all descriptors, graph, material, exposure, depth, pickups and history remain when nodes sleep.

Negligible truncated strain/velocity/displacement is recorded in `truncatedTailEnergy`; the controlled quiet-state test bounds the truncation below 1e−14. This is a conservative numerical cutoff, not exact continuum energy conservation. Recompilation preserves dynamic state for identical IDs and packed geometry. Audio Off destroys vibration transport while retaining model history; re-enabling sends topology without replaying contacts. Leaving ANT destroys its model and transport; the Lab's shared engine survives until Lab destruction.

## Buried Sphere prototype

Qualification requires all of: 4 overlapping Plates, 3 buried layers, local compaction ≥0.55, ≥200 accumulated individual feet in radius 0.028, and 30 simulated seconds of continuous support. Evaluation is once per simulated second. Lost support resets persistence; a gap over 2 s resets candidate timers. Nodule centers must be at least `existingRadius + 0.028` apart. These are bounded local history rules, not timers alone or colony/population/musical rules.

Consolidation is `0.65*c + 0.20*min(layers/8,1) + 0.15*min(load/600,1)`. Radius is 0.018–0.028 world units; world-to-physical scale is explicitly 1 m/unit. Bounded material values are density 1800–2200 kg/m³, E 0.3–1.2 MPa, Poisson ratio 0.25–0.35 and damping 0.6→0.2. Radius mix is `0.5*consolidation + 0.25*min(layers/8,1) + 0.25*min(load/600,1)`. The descriptor freezes source IDs, initial depth, foundation, material, support and birth time.

The lowest local source Plate is the foundation. The nodule has no surface-contact input. Spring coefficient is `0.000025*weight`; foundation stiffness bounds weight to 0.12–0.30. A generalized spring uses foundation displacement minus the sum of real spherical-harmonic modal contacts. The same gradient drives the modal masses and returns force to the foundation. Pickups observe real physical directions toward the foundation Plate's frozen stereo pickups.

The shared core has 12 low-order slots: S l=0/1/2 (1+3+5) and P l=1 (3). Wave speeds follow E/density/Poisson elastic formulas; frequencies are alpha*waveSpeed/(2*pi*radius), using existing approximate roots 4.4934/2.0816/3.3421. Modes beyond 0.4*solverRate are excluded rather than retuned. Effective modal mass is density*radius³; damping follows the existing Sphere-inspired bounded decay formulation. This is an approximate small modal core, not a calibrated elastic-sphere boundary solution. The 12-mode core remains continuously integrated; separate nodule sleep is not implemented.

The explicit ceilings are 256 historical Plates and 32 nodules (384 mode slots). No old material is evicted. Limits are reported; they are technical storage/processing safeguards, not ecological transitions. Fully awake 256-layer realtime performance is not claimed.

## Verified model results

| Seed | First Plate s | Plates at 60/120/180/300/600 s | First nodule s | Nodules at 600 s |
|---|---:|---|---:|---:|
| 20261005 | 149.017 | 0/0/3/11/34 | 225.300 | 32 |
| 20261006 | 95.017 | 0/1/5/15/36 | 207.000 | 32 |
| 20261007 | 81.017 | 0/2/3/13/36 | 252.750 | 32 |

Seed 20261005 at 1200 s retained 73 Plates, maximum local stack 70 and derived foundation burial depth 0.11611 m. All births passed mask/path/graph/pickup/frozen checks. No finite field/agent violations were found. The most negative separation margin was approximately −1.20e−8 normalized units: numerical contact tolerance, not an exact-positive-clearance claim. A same-seed no-op lifecycle comparison matched all 60 checkpoints of full agent/body/gait state, pheromone, SurfaceField, activation/recruitment/population and RNG. These accelerated Audio-Off simulations do not measure worklet awake/sleep state or realtime throughput.

## Fixed audio evidence

Historical evidence and 10 s comparison sheets remain untouched. New details use an immutable 10 s, 1200×1000 stereo preset; comparison sheets are 1200×1200 with fixed row slots. Waveforms use full-scale −1..+1, background 255, line 24, guide 180, line width 1, opacity 1. No gain, appearance or alpha comes from source statistics.

Spectrograms use FFT1024, symmetric Hann, hop256, 0–8000 Hz, −100..0 dBFS and grayscale gamma1: `round(255*clamp((db+100)/100,0,1))`. Full-run overviews are 1800×1200 and map PCM through measured simulation/audio clock anchors. Fixed-dBFS peak pooling within each overview pixel is documented and does not normalize brightness. Birth markers P1/P2 and count arrows are thin grayscale with labels above data. No removal markers are manufactured. Actual individual feet are counted in 10 s buckets: 2400 contacts fills a fixed 28 px strip.

180 s selects starts near 0, 85 and 170 simulation seconds. 600 s selects early, first-birth neighborhood, densest contact bucket and late, with deterministic duplicate-window handling. Every detail contains exactly ten decoded-audio seconds, with separate L/R and identical fixed analysis parameters. Its actual simulation span is labeled and contact ticks are mapped through clock anchors to audio offsets; modal decay is not time-warped to a ten-second simulation span. Neither waveform nor spectrogram has a per-clip normalization path. Actual recordings, measurement limits, final verification and commit sequence are recorded in the evidence index.

The actual mature Chrome run reached 600.217 simulation seconds in 600.252 wall seconds, while AudioContext advanced only 332.595 s. The last observed processor diagnostic had all 35 Plates awake, 11352 active nodes and no natural sleep events. The mostly quiet synthetic proxies do not establish this workload's viability. Native recordings and clock maps are preserved without stretching; mature realtime audio performance is a measured limitation. See the evidence index for exact native durations, final PCM metrics and lifecycle results.

## Actual capture and release verification

Real Chrome seed 20261005 created its first Plate at 124.0167 s and first nodule at 246.6500 s, preserving 35 Plates and 32 nodules at 600.217 s. There were 34916 groups / 103441 individual feet, including 63236 supported feet (exactly matching the recorded-mask replay) and 40205 unsupported feet. The opening twenty-second segment is silent. At 35% Volume / 0.245 final gain, the complete native stereo PCM has RMS L/R 0.01812015/0.01449241 and peaks 0.12614933/0.10539617; actual PCM clipping and non-finite samples are both zero. Three pre-limiter threshold crossings are reported separately. Neither master gain nor recorded samples are normalized to compensate for quieter supported contact.

The new [evidence index](evidence/2026-10-06-stratigraphy-runtime/README.md) links six actual twenty-second normal-view motion windows, each original matched stereo segment, the continuous stereo recording, birth/event/clock archive, six-row fixed ten-second comparison, four automatically selected ten-second details, full 600 s and 180 s prefix overviews, and recorded-history Z section. Late video/audio native durations differ because of measured scheduling slowdown; healthy mature realtime synchronization is not claimed. The full raw video/WAV remain local under ignored test-results, with hashes and important curated motion/images/audio retained in Git.

Final npm tests: 227/227; build: pass; installed Chrome development and production preview: pass. All 17 frozen behavior/generic sources are byte-identical to d281d34 and historical evidence directories have no changes. Real same-run paused Off/On retains material, releases transport, preserves shared context and does not replay old contacts. Fresh strikes occur only after resume. The shared architecture and deterministic lifecycle are demonstrated; mature all-awake DSP viability remains a measured limitation, and the 32-nodule prototype cap is reached by all natural long runs.

The reversible commit sequence through the actual recording commit `2b155cb` is listed in the evidence index. The final documentation commit refreshes the test/build logs and preserves this measured runtime limitation for the next pass. Further performance work should target the natural all-awake workload without modifying ANT behavior, silently dropping history, retiming decay or normalizing evidence.

## Future extensions

[Material extensions](2026-10-06-material-extensions.md) documents shared persistent filament and bounded fragment/micro-resonator interfaces. No String transition, granular audio, fracture, erosion or exhumation implementation is included. No learning, intentional construction, procession emergence or successful nodule ecology is claimed.
