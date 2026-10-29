# Given one fixed COMMIT scope, what becomes matter?

## 1. Working outcome and boundary

**[Synthesis/inference]** Prefer a **simple connected structural sleeve + existing whole-Plate character** as the next working BODY architecture. Ordinary geometric union is the strongest junction baseline. Do not require local chemical, mechanical, motion, gait or prior-stack variation to become morphology. Use one source footprint and derive its display and coarse solver representation; do not introduce independently authored render and physical geometries.

This selects responsibilities, not a production mask/width law or an artistic winner. K/X are the minimal construction controls; `.012` is an existing lower width bound used to avoid fitted parameters, not an optimized or calibrated material scale. Production P remains the current implementation. W/U and all timing/gates remain unadopted research context.

**[Artistic/modeling interpretation]** The minimal object is: *the selected structure becomes a finite body; formation context affects what that body is; later geology changes its relationships.* A second genuine object interpretation is a cohesive lamina spanning between structural sections. It is inspectable but requires an additional cohesion assumption; it is not obtained by calling more field cells real material.

**[Implementation]** Fresh main remained `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`. Research parent was clean `2c5b0be686bec5eab854b33cd3a473bea2cf908e`; branch `codex/ant-material-body-design-space-20261029`. `src/`, `static/`, canonical ANT guide and previous evidence are unchanged. No new natural simulation, scope selection, COMMIT change, lifecycle/source redesign, history recovery, stratigraphy formation feedback or audio render ran.

All claims use these labels: **[Implementation fact]**, **[Prior experimental evidence]**, **[Measured prototype result]**, **[Synthesis/inference]**, **[Artistic/modeling interpretation]**, **[Unresolved choice]**. A richer image or larger area is not evidence of a more justified material.

## 2. Production body and downstream responsibilities

| Responsibility | Actual representation / use | Boundary |
| --- | --- | --- |
| Fixed structural scope | Selected I nodes/edges at actual commit, with principal route and provenance | Input fixed by this mission; no alternative restoration |
| Planar body geometry | 96×96 binary mask, centerline/edges/path and half-width summaries | Current ribbon radius reads distance to supported corridor edge, clamped `.012–.030`; not just a constant-width route |
| Whole-Plate character | One stiffness/density/damping tuple per immutable descriptor | No local constitutive map. Mean chemical/support sample the supported corridor, not just the final body |
| Whole-layer thickness | Explicit `thicknessMeters` if supplied; otherwise `clamp(.001+.05*meanHalfWidth,.001,.01)` m | Production birth leaves it implicit. This is not local thickness, geometric extrusion or calibrated Plate mass |
| Solver view | 32-grid occupancy from 96 mask plus legacy declared-edge diagonal fill; four-neighbor propagation and uniform coefficients | A coarse derived view, not a second authored body. No local thickness/stiffness/density field |
| Render view | Material-grid top presence/layer count image scaled to display; pheromone above, ants above both | Standard display does not show metric thickness or the material tuple; diagnostic atlas is different |
| Post-commit geology | Immutable descriptors, ordered columns, exposure/burial, load, overlap/Z coupling and Nodule foundations | Later append changes relationships, not old Plate geometry/material |

### 2.1 Geometry and character already interact, but are not the same responsibility

**[Implementation fact]** `TrailPlateBirth.createDescriptor` uses the selected network's locations and a width derived from distance to the qualified supported corridor edge. Rasterization unions local discs; junctions already acquire a larger shared region through overlap. A separate junction radius bonus is absent.

Union is binary: overlapping sections within this one Plate do not add layers, multiply density, or increase metric thickness at the junction. They change planar footprint/connectivity. The existing solver may respond to that geometry, but no literal local mass-deposition law is encoded by section overlap.

Existing material mapping is:

`stiffness=clamp(.65+.5*meanChemical,.65,1.15)`;
`density=1+.2*clamp(meanSupport/.08,0,1)`;
`damping=clamp(.25+.2*meanChemical,.25,.45)`.

The character means come from the full source-connected supported corridor, not just its selected skeleton or frozen ribbon. Wider context can characterize a selected body without becoming its support. Replacing that average with body-only sampling is a separate manipulation. Q did exactly that over K; this pass reuses Q rather than silently adopting it.

**[Synthesis/inference]** Stiffness and damping read one chemical scalar, so they are not two independent history channels. Mechanical conditioning already has qualification, density aggregation, contact-response and later Nodule roles. New mechanical contour or thickness variation is not required simply to mirror chemical modulation. The current strength of each role is separate from its existence.

### 2.2 Width, depth, mass and Z are not interchangeable

**[Implementation fact]** Width is in normalized planar world coordinates. The thickness fallback has meter-named output, but no calibrated conversion from history to physical sheet thickness was demonstrated. `MaterialStratigraphy` uses that scalar for burial/depth metadata. `totalDepthByCellMeters` sums thickness above the foundation: one-layer cells have zero there. It is not terrain height or total stack thickness.

`compileSurfaceTopology` does not read Plate thickness or width as a constitutive input. It compiles uniform coefficients `[bendingBaseline*stiffness/density, tensionBaseline, density, dampingBaseline+dampingGain*damping]`. The worklet uses those coefficients and a four-neighbor stencil. It has no Plate total-mass array derived from footprint area × thickness. The strike footprint radius comes from the foot response, not Plate width. Nodule radius/density/mass belong to a separate existing object model.

Adjacent Z coupling counts overlapping **96-grid source cells**, maps them to solver nodes and scales the link coefficient by represented source-cell count. It is not geometric vertical spacing or a thickness-dependent coupling law. Metric thickness can be retained geological information without having that mechanical responsibility. No new thickness physics is proposed here.

### 2.3 Source, display and solver are already different resolutions of one body

**[Implementation fact]** The standard renderer reads 96-grid top-layer presence/count, writes RGB100 with `alpha=min(21,9+1.25*L)`, and scales the image beneath pheromone. It neither draws an extrusion nor makes stiffness visually explicit. The compiler reduces the source footprint to a 32-grid layer, with a legacy edge-assisted diagonal fill. Contact exposure/routing remains resolved on the source grid.

Consequently, equal solver node **count** is weaker than equal occupied positions; equal occupied positions are weaker than equal whole compiled topology. Fine footprint differences may alter source exposure, overlap-based Z weights or later column/foundation qualification even if solver occupancy matches. That is an implementation possibility, not an observed audible or aesthetic effect of W/U.

**[Synthesis/inference]** The existing architecture is already a lossy multiresolution representation. There is no requirement that every visible source cell produce an independent solver node. Conversely, the difference is not license to draw a physically unrelated silhouette. Keep the frozen 96 footprint authoritative with consistent derived readouts; add no second independent render geometry. A 640 display also cannot recover genuine subcell material details absent from that descriptor.

## 3. Inputs, controls and prototypes actually used

**[Prior experimental evidence]** Current-G/H0 seed20261005, 60 Hz, Audio Off; fixed actual P1/P2 commits at 84.016667/106.016667 s. Their scopes have 122/181 nodes. Reused exact P/K/Q/U/W/S masks/materials from the pinned `05012e1…` body atlas, checked against its per-mask receipts. No W/U/S generation or parameter adjustment was performed anew. Full input hashes are in the compact [frozen packet](data/frozen-body-inputs.json.gz).

| Reference | Geometry responsibility | Material control | Provenance |
| --- | --- | --- | --- |
| P | Actual production qualified-corridor-distance ribbon | Original tuple | Reused reference |
| K | Union of fixed-radius `.012` sections at fixed scope nodes | Original tuple | Reused structural baseline |
| Q | Exact K mask | Existing formula averaged over K instead of supported corridor | Reused character-footprint comparator; not another shape |
| U | Uniform radius equal to W's event mean | Original tuple | Reused mean-widening control, not history-free |
| W | Scope-attached `r(i)=.012+.018*B(i)` sections | Original tuple | Reused local-history construction |
| S | Bounded ambient contour `d(x,I)<=.012+.018*B(x)` | Original tuple | Reused ambient-field construction |
| X | Union of radius-.012 continuous capsules along exactly the fixed edges plus endpoint discs | Original tuple | New continuity/discretization control versus K |
| H | Minimal convex envelope of occupied K source-grid samples | Original tuple, no new property law | New cohesive-lamina countermodel versus K |

Here H is this package's lamina case ID, not the earlier formation-funnel H mask. No upstream H-domain membership is used by this construction.

X was registered before its output. After X yielded a null difference, the plan was amended **before H results** to compare a genuinely different material object: separate unioned sections versus a sheet spanning between them. No width was tuned to force an X difference. H is a declared new cohesion/spanning assumption, not cleanup, history membership or omitted-connection recovery. Its bound is the finite K extent and its input is exactly K. It introduces no radius, field threshold, density target or area budget.

### 3.1 Exact geometry consequences

| Footprint | P1 cells | P2 cells | Role of result |
| --- | ---: | ---: | --- |
| P | 356 | 544 | Current reference |
| K / Q / X | 342 | 509 | K=X exactly on source grid; Q shares geometry |
| U | 526 | 788 | Uniform-mean control |
| W | 527 | 811 | Prior spatial B placement effect |
| S | 430 | 675 | P2 contains components 674+1 under four-neighbor counting |
| H | 811 | 1,218 | Spans concavities/holes; adds 469/709 samples over K |

**[Measured prototype result]** K/X source XOR is zero for both cases. Their solver occupancy is also identical: 68 nodes in P1, 100 in P2, one component each; original pickups are valid in the same component. The source-grid pitch is `1/95`; fixed `.012` sections already overlap densely across the scope's 8-neighbor edges. This finite-grid equivalence does not say a continuous-plane capsule equals a union of endpoint discs below grid resolution. No subcell geometry is stored in these masks. No audio/perceptual conclusion follows.

**[Measured prototype result]** H retains all K and becomes one four-connected footprint in each case. It removes concavities/holes by its explicit *new sheet primitive*, not because those gaps were invalid. Additional filled samples are not measured material deposits or valid-support discoveries. H is not advanced through compiler/audio/stack qualification: the missing justification is cohesion/spanning meaning, not a cell-count target.

**[Prior experimental evidence]** W/U source XOR remains 49 cells in P1 and 79 in P2; occupied solver-set differences were 5 and 8 cells. No acoustic/perceptual significance was measured. The earlier technical controls held old width/thickness metadata and do not settle new section-to-thickness semantics. The small solver difference neither invalidates W's source-footprint role nor proves it is necessary.

### 3.2 Proportionate K/X and thickness checks

**[Measured prototype result]** Only K/X were newly compiled. Fixtures preserve original pickups and whole-body tuple, clear obsolete centerline/path/edge metadata, and set uniform `meanHalfWidth=.012`. They explicitly supply thickness values computed from the original P width using the current fallback: P1 `1.626402 mm`, P2 `1.653325 mm`. This is an **explicit held-value path**, not a new fallback inference from K or X. It isolates planar body differences without also changing depth.

K and X P1→P2 stacks are identical at this representation: two immutable layers, 168 solver nodes, union644/overlap207 source cells, 48 adjacent Z links. Neither original inputs nor committed evidence changed. This validates a two-event interface, not long-run accumulation, Nodule outcomes or real-time cost.

A logical fixture doubles only P2's explicit thickness in the same K stack. Maximum retained buried depth changes from approximately `1.653325 mm` to `3.306650 mm`; **the entire compiled topology is deep-equal**, not only its occupancy. No Nodule advance occurs in either arm. This supports the source audit's exact boundary: metric depth is not a Plate solver or Z-distance input in this path. It is not a claim that all future geology or physics ought to ignore thickness.

## 4. Distinct body concepts and evidence-based pruning

### A+C. Structure becomes matter; history changes its whole-body character

- **Ontology:** a finite planar body formed around the fixed connection organization.
- **Inputs:** fixed scope/edges and a declared section scale; existing chemical/support aggregates for one tuple. K/X provide pure structural geometry controls; P is current adaptive-width reference.
- **Ignored signals:** local history placement for geometry, motion, gait organization and prior stack. No fields are declared information-equivalent or useless.
- **Junctions:** ordinary union of sections/capsules; shared area forms through geometry without a degree multiplier or new junction material.
- **Thickness:** one immutable whole-layer scalar with declared semantics. Existing fallback remains production truth; trials hold its old values explicitly. No local thickness map.
- **Solver/geology:** one source footprint, coarse uniform layer, ordinary append/exposure/Z. New geometry may affect downstream placement without reading prior stacks during formation.
- **New assumption:** material can be organized by structure without spatially encoding every local history value. The exact numerical section scale remains authored, not physically discovered.

**[Synthesis/inference]** This is the smallest working architecture. Families A and C are complementary responsibilities, not genuinely different shape families. Q shows how character sampling can vary independently, but Q is not adopted. Keeping the current supported-corridor averaging rule avoids adding that second change while assessing simple geometry.

### B. Environment shapes attached material sections

- **Ontology:** formation conditions deform the body at its scoped structural samples.
- **Law/control:** existing W versus U, matched mean mapped radius but not area. Same scope, tuple and pickup controls. W does geometrical work beyond mean widening.
- **Junctions:** ordinary union of locally sized sections; no extra junction rule. Finiteness comes from fixed scope and existing maximum radius.
- **Thickness/solver:** binary footprint changes, not local material/thickness physics. Old held metadata is a control, not an adopted thickness model.
- **New assumption:** local B is a section-size signal. The existence of B alone does not require that meaning. There is no demonstrated need for a second mechanical section law.

**Disposition:** compatible and technically viable, but optional. Artistically richer is not more justified. Park until a specific local-shaping meaning is required; do not discard merely because coarse solver projection compresses it.

### E. A bounded environmental contour surrounds the structure

- **Ontology:** ambient conditions across the proposed body modify its boundary, rather than riding on sections attached to I.
- **Law/control:** reused S, compared conceptually with W. Both are B-shaped sleeves, so they are related constructions rather than two independent ontologies. Input location differs: proposed body coordinate versus structural attachment.
- **Bound:** never beyond the existing `.030` neighborhood of I; no whole E-component freeze. Thus S is not C0 under another name.
- **Risk:** P2's detached source sample and the causal question of why ambient B at a candidate coordinate places matter there. Repairing it would add another rule. No cleanup is performed.

**Disposition:** useful negative/interpretive comparator, not advanced. The conclusion is bounded to this authored contour, not a general rejection of environmental envelopes.

### D1. Topology concentrates material at junctions

**[Synthesis/inference]** Ordinary union already creates junction widening. The discrete graph's degree/curvature may reflect thinning and adjacency, not force, traffic convergence or physical stress. The traffic audit did not establish the required local flow relation. Separate node inflation, junction blobs or directional taper would add an unsupported material-concentration law. No prototype is needed merely to demonstrate an available degree value.

**Disposition:** special junction morphology is parked; geometric union is retained as the strong null. This is not proof all junction physics is irrelevant.

### D2. Sections cohere into a spanning lamina

- **Ontology:** the fixed structure supports one cohesive sheet, not only matter near its connections.
- **Law/control:** H is the exact convex envelope of K samples; K is the same-section non-spanning control. No field or alternative connection is sampled.
- **Junction/continuity:** interior branches do not get a mass bonus; one lamina spans the outer supports, also suppressing internal holes and concavity.
- **New assumption:** cohesion places material in gaps without direct environmental evidence at each point. Convexity is authored and stronger than mere connectedness. Different inner topology can produce the same envelope.
- **Thickness/material:** one uniform class is conceivable in current architecture, but no such law or technical qualification is inferred from the picture.

**Disposition:** a genuinely distinct body meaning, retained for artist comparison and parked as an implementation candidate. Do not reject it solely for being larger; do not accept it solely for looking like a plate. Its extra support-spanning assumption has no current measured cause.

### F. Core / skin or internal material hierarchy

Current Plate masks are binary with one tuple; stratigraphy describes separate committed layers, not internal classes within one Plate. A core/skin mask with identical material would mostly be another silhouette/texture interpretation; different local materials/thickness would need a new constitutive interface or multiple-layer interpretation. No evidence requires that hierarchy. It would duplicate responsibilities already expressed by post-commit exposure/stack/audio.

**Disposition:** overly complex without an explicit meaning requirement. No new material ontology, local map, multi-body decomposition or renderer illusion is implemented.

## 5. Chemical and mechanical duties, without forced symmetry

**[Implementation fact]** Chemical already participates in qualification, corridor-dependent current P widths, and whole-body stiffness/damping. Slow mechanical history participates in qualification/support, whole-body density and contact response; later Nodule generation also reads compaction/load. None is a calibrated material mass supply.

**[Prior experimental evidence]** Q's density is 1.2 in both events; changing its sampling footprint changes stiffness/damping but not this saturated density. Motion/gait carry richer records without established BODY duties. Stratigraphy is persistent context, but its independent existence does not imply a formation input. Earlier broad-scaffold M/R similarity is not a fixed-I proof that mechanical and chemical local shape signals are equivalent.

**[Synthesis/inference]** Recommended mapping is chemical/mechanical qualification and existing whole-tuple character, with no mandatory local geometry role. Geometry and character should be separately declared even when they share an upstream history channel. The current material means' broader sampling footprint must remain explicit. Changing its footprint, gain, saturation or property formula is outside this BODY pass.

## 6. Recommended working architecture and next closed pass

**[Synthesis/inference]** Working BODY architecture for the next validation:

1. Consume the fixed COMMIT scope exactly. No scope re-selection or completeness obligation.
2. Construct one finite connected sleeve using ordinary union and an existing declared width scale. K/X are the minimal controls; no special junction law. Do not adopt `.012` as an optimized final width.
3. Freeze the binary source footprint, structural metadata, pickups and one whole-Plate tuple. Retain the current contextual mean-character law while isolating geometry.
4. Keep one explicitly understood whole-layer thickness scalar. Production fallback is unchanged; a later implementation must reconcile actual geometry metadata with that fallback instead of silently borrowing old widths. No local thickness or new mass law.
5. Derive existing renderer/solver views from the same footprint, including declared compiler metadata. No independent visual body. After append, let existing geology, exposure, coupling, load and vibration act.

**[Unresolved artist choice, primary]** Is this matter organized *along the selected structure*, or should it *span between its supports as a cohesive sheet*? K/H makes that object distinction visible. This is not another scope membership choice: all inputs to both constructions are the same fixed scope and same K sections.

**[Unresolved choice, optional and secondary]** Is local environmental deformation itself part of material meaning? Only a positive need for that meaning makes W a necessary additional responsibility. No independent material property or artistic judgment was inferred from W/U cell differences. These are meaning choices, not requests for the artist to choose numerical widths or solver parameters.

**One smallest next closed technical pass, not executed here:** inspect the same simple-union construction at **P3, the first actual commit encountering multi-layer substrate** in the existing frozen sequence. Selection rationale is stratigraphic contrast, not shape preference. Keep actual scope, timing, P3 material tuple and original pickups fixed. Use the existing `.012` K construction unchanged; original P3 is the control. Do not compute a new B/SurfaceField response, refit width or read stack into formation.

The single question is: *Does ordinary union still provide one valid compiler-facing Plate interface at this first stratified actual case without junction-specific additions or repair?* Check source/solver connectivity, valid pickups, immutable append and actual source-column/Z placement over the original frozen prior stack. Hold/declare thickness explicitly as in this pass so it is not a second manipulation. The existing stratigraphy capture contains the full P3 descriptor and its pre-commit column context, so no new natural replay is needed. These checks do not qualify acoustic response.

Stop on invalid pickups/disconnected operative domain or a need for cleanup, threshold changes, scope expansion or special junction mass. A pass would extend bounded technical viability, not establish artistic material identity, long-term accumulation, audio perception or a preferred width. If the artist requires a spanning lamina instead, do not run that validation under the false premise that sleeve meaning is accepted; define H's added cohesion responsibility separately. No automatic 600 s run follows.

## 7. Limits and explicit omissions

P1/P2 are two fixed actual commits from one current-G/H0 seed. Reused P/K/Q/W/U/S are prior measurements; only X/H, their compact comparisons, K/X compatibility and the thickness counterexample are new. H is not compiler-qualified. No new material rendering, human verdict, audio/PCM, sound difference, mature runtime, body accumulation shadow, extra seed, source/lifecycle redesign, field/gait/motion/stratigraphy formation input, new event law or production adoption.

The minimal architecture is evidence-efficient, not experimentally proven as the final artwork. Simple geometry can carry actual material/geological responsibility without serving as a visualization of all history. The converse remains open: if local shaping or a cohesive sheet is an explicit artistic necessity, it must earn a separate authored responsibility and bounded test.
