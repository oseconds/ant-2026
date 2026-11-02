# Independent architecture review

**Scope:** Read-only review of the audio architecture choice for the fixed CONTROL and REPLACEMENT material histories. No production adoption, material change, source edit, human listening claim, or live-browser deadline claim is made here. This review was formed from the world contract and current implementation before reading the candidate-selection note; it does not inspect historical audio proposals.

## Verdict

I would design ANT audio as a material-history ledger feeding a spatial mechanical network, with an explicit readout operator that is separate from deposition IDs. My conservative first model would preserve stratified degrees of freedom and finite local coupling until the work establishes that deposits bond. A Plate birth would contribute geometry, material inputs, chronology, and interface conditions; the Plate ID would not by itself require a dedicated oscillator or two output pickups.

This is a coherent design contract, but it is not a new architecture yet. The repository already separates `MaterialStratigraphy`, `compileSurfaceTopology`, the packed AudioWorklet, and `SurfaceAudioBridge`. The unsettled work is narrower: which mechanical degrees of freedom should survive compilation, what happens at material interfaces, how state survives topology changes, and where the world is observed. A full alternate mechanics prototype is not needed to state those separations. It is needed before selecting between a separate-layer network and a bonded-column model.

## What the implementation establishes

- `MaterialStratigraphy` retains immutable 96×96 Plate masks, bottom-to-top columns, exposure, and material history. `compileSurfaceTopology` compiles those descriptors into one packed topology; `SurfaceAudioBridge` runs one shared stereo worklet, not one worklet per Plate. See `src/lib/agents/ant/MaterialStratigraphy.js`, `src/lib/audio/compileSurfaceTopology.js:1-95`, and `src/lib/audio/SurfaceAudioBridge.js:10-11`.
- Each Plate still owns a separate solver layer and state range. A binary “any occupied source cell” reduction maps 96×96 masks to 32×32 nodes; subcell occupancy is discarded. The current worklet propagates with a four-neighbor stencil, sums two per-layer pickup nodes, and adds local vertical overlap forces. The vertical links are made from adjacent entries in a source-grid column, not from a general bond law between touching masks. See `compileSurfaceTopology.js:158-191,281-321` and `static/worklets/surface-plate.worklet.js:581-629,766-772`.
- Direct strikes route to the exposed 96-grid layer. Contact position, footprint, material density, local compliance, and the finite pulse affect excitation. The bridge also sends `hardness`, but `applyStrike` does not read it. Plate thickness/depth affects Nodule burial inputs; it does not enter the planar Plate recurrence. See `SurfaceAudioBridge.js:169-226`, `surface-plate.worklet.js:911-950`, `MaterialStratigraphy.js:427-432`, and `compileSurfaceTopology.js:183-191`.
- A Plate’s ID is more than bookkeeping in the present solver: topology installation uses ID plus equal node geometry to transfer vibration, contact memory, sleep state, and pending contact forces. A spatially keyed solver would need an equally explicit state-continuity map at births and topology revisions. See `static/worklets/surface-plate.worklet.js:130-200`.
- Local replacement research descriptors have the same fixture values (`stiffness .9`, `density 1.1`, `damping .35`), no extra edges, and pickups at the first and last row-major source-mask cells. Thus descriptor count is not a count of distinct material coefficients or meaningful stereo locations. This is a research fixture choice, not a general material law. See `scripts/ant-singleton-real-plate.js:1-42`.
- The current 3 ms contact pulse, 75 ms local recovery, 6 kHz recurrence, and ×50 Plate damping are explicit implementation facts. They do not validate the physical material parameters or establish that a listener hears history as intended. See `static/worklets/surface-plate.worklet.js:1-18,622-629,911-950`.

## What the completed measurements establish

- The frozen census includes 468 descriptors, of which 110 compile to one node; 184 have coincident compiled pickups. It finds 30 groups with identical absolute coarse geometry and 24 translation-normalized geometry groups. There are 500 four-neighbor components versus 468 eight-neighbor material components. Most of the small-patch concern comes from the three REPLACEMENT worlds: 43, 36, and 31 one-node layers respectively. See `analysis/granularity-probe.json` and `CANDIDATES-BEFORE-HISTORY.md:7-15`.
- The isolated equal-impulse probe confirms that the one-node fixture produces one shared elementary PCM response. This is strong evidence that a one-node layer does not express its source shape, two pickup locations, or within-cell contact position as an isolated filter. The translation probe also shows registration can change small-patch topology. Neither probe contains the natural schedule, distinct contact histories, vertical-link histories, or full world readout.
- The completed six 300-second offline renders use the current worklet and fixed gain. All scheduled events were received; the receipts report finite state/PCM, no invalid topologies, no dropped routes, and 1.8 million physics steps per world. The browser fixture parity check is `PASS`, with maximum PCM difference `7.450580596923828e-9` against a `1e-8` bound. These verify the renderer’s numerical route for its stated fixtures. They do not establish live AudioWorklet deadline performance or perceptual success.
- Active paired windows have fixed-gain ERB-shape cosine values from about 0.60 to 0.98. Those comparisons are between different natural material histories and contact schedules; they are not a controlled test of the solver architecture. They also do not measure audibility or quality. No human listening review is present.
- The new late-window profile uses the unmodified worklet in a Chrome main-realm processor stub, rest-initialized at 290 s, with three clean 10-second replays per arm/seed. Median `process()` wall time is 2.86–4.44 s for REPLACEMENT versus 11.40–25.71 s for CONTROL, despite 137–156 versus 7–14 layers. This is evidence that the current replacement topology is cheaper in that harness and that descriptor count alone is a poor cost proxy. The profile explicitly excludes pre-290 s vibration state and is not an AudioWorklet deadline or underrun measurement; it cannot establish live realtime viability. See `analysis/ant-local-x-audio-runtime-profile.json`.

## Adversarial findings

### Coarse aliases are a real resolution problem, but not proof of redundant material state

The one-node and duplicate-geometry measurements support a narrow claim: the 32-grid compiler can turn distinct 96-grid episodes into the same elementary isolated filter. They falsify any claim that every local descriptor currently has a unique isolated resonant geometry.

They do **not** show that those layers are dynamically interchangeable in a natural run. The worklet drives the exposed layer at its actual strike times, keeps state per layer, and connects overlapped layers through local Z forces. Two descriptors with the same coarse mask can have different projected contact histories, neighbors, pickups, onset times, or exposed/buried intervals. Exact merging would require equivalence of the full operator, initial state, force history, incident coupling graph, and readout multiplicity—not merely equal mask hashes. The current isolation probe does not test those conditions.

The evidence therefore supports reducing false geometric precision or decoupling IDs from acoustic interfaces as a design question. It does not support merging the measured layers, deleting their motion, or choosing a fused material body.

### “Ledger / mechanics / readout” is a useful separation, not yet an implementation choice

The candidate direction is coherent if it means:

1. Keep provenance, order, exposure, and formation-derived properties in the material ledger.
2. Let the mechanical compiler decide which spatial degrees of freedom and interfaces those data create.
3. Let a separate readout define how world motion becomes stereo output.

Those are three independent design axes. A bonded-column solver can still read the same ledger and use an independent readout. A stratified solver can also do so. Treating “stratified versus bonded” as the same choice as “ledger versus identity-keyed layers” or “per-Plate versus world-space pickups” bundles decisions that can be tested separately.

The current path already has the ledger/compiler/solver boundary. Its specific choices are identity-keyed layers, 32-grid binary rasterization, fixed local overlap springs, and two per-layer path/row-major pickups summed to stereo. Thus the useful recommendation is **not** to introduce another generic layer. It is to stop making deposition identity the solver/readout contract and state the unresolved interface and observation laws explicitly.

### Current physical cues expose mismatches beyond geometry

Two actual inputs that sound like physical properties are not presently fully represented in planar response: bridge `hardness` is posted but ignored, and Plate thickness is not part of the Plate mass/bending recurrence. Material stiffness, density, and damping do feed coefficients, while nodules use a different modal path. This is an authored stylized model, not a calibrated plate-material model. If the desired meaning is “history changes how the world mechanically sounds,” the property-to-mechanics mapping deserves a clearer contract before adding more labels or resonance families.

The worklet output also does not currently represent a single listener placed in world space. It sums each layer’s two descriptor-attached pickups, then mixes Nodule modes and soft-limits the result. Whether this polyphony, stereo organization, and spatial aggregation suit ANT is an artistic question; ERB measurements cannot choose it.

### Do not infer runtime or sound quality from offline parity

The full render receipts establish complete offline model-time replay and exact event receipt accounting. The browser parity fixture establishes numerical agreement between the browser worklet and its VM route for a short fixture. The late-window profile attributes code cost in a main-realm stub. None measures 300 seconds of live browser AudioWorklet deadline compliance or underruns, and none measures human response. `analysis/receipts.json` labels `audioRenderedDuringWorldCapture: false`, which agrees with Audio Off during world reproduction; the downstream full renders are recorded separately in `analysis/audio-render-receipts.json` and `audio-analysis/analysis.json`.

## Recommendation and boundaries

**Architecture choice today:** preserve a sparse spatial, stratified network as the conservative reference, with independent state for locations/layers whose forcing or interface history differs. Keep exact material history separate from solver identity and declare readout independently. Do not fuse connected deposits without an explicit junction/bond/effective-property law. Do not make a unique event tone or pickup mandatory for every Plate ID. This recommendation preserves the target “world as sounding body” and leaves the fixed material worlds untouched.

**Not established:** that this reference is physically calibrated; that the 32-grid is sufficient; that small strata are perceptually important; that bonded columns are artistically preferable; that the two world-level output shapes sound convincing; or that the mature browser workload meets realtime deadlines.

## Smallest discriminator

Before implementing another mechanics model, do one instrumentation-only current-model replay on the exact natural REPLACEMENT schedules. For the repeated one-node/identical-coarse-geometry groups, record per-layer projected contact impulses, incident Z-link forces, state/pickup trajectories, and direct-versus-indirect output contribution. This tests whether geometry collisions are only isolated-filter aliases or whether the current natural histories actually make their state paths distinct. It needs no change to movement or formation and no invented bond law.

That result can answer an engineering question about state reuse within the existing mechanics. It cannot decide whether deposits should bond or whether the listener should hear separate laminae. Those require an explicit artist choice about mechanical continuity and readout, followed—only if needed—by a narrowly scoped paired prototype using the same fixed material capture and contact schedule. A human listening comparison would then be needed for an audibility or aesthetic claim.
