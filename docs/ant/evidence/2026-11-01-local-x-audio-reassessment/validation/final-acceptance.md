# Independent final acceptance

**Verdict: ACCEPTED for the stated research scope and evidence claims.** I found no blocking arithmetic or interpretation error. This accepts the report as a bounded current-worklet assessment; it does not accept a new audio architecture for production or answer whether the work sounds convincing to listeners in a live browser.

Reviewed the report, protocol, README, validation, atlas, current compiler/bridge/worklet/stratigraphy source, six render receipts, analysis artifacts, and the research scripts. I formed the source and data checks before reading the existing independent review notes, then checked those notes against the same evidence. Historical comparison was limited to the explicitly named challenge document; no archive files were opened.

## Coverage of the eleven questions

| # | Question | Acceptance finding |
|---:|---|---|
| 1 | How does local-X change the existing audio regime? | Answered with all 15 fixed-gain CONTROL/REPLACEMENT windows. Starts, silence, stereo balance, and ERB shape vary by seed; there is no consistent louder/quieter effect. These are numerical changes, not a listening result. |
| 2 | What do roughly 140 local MaterialPlates become acoustically? | Answered: 137–156 descriptors compile to 964–1070 solver nodes, with median 2 nodes per layer. The report distinguishes descriptor, node, planar-subgraph, layer-ID Z-graph, and full node-graph counts. |
| 3 | What dominates runtime? | Answered within the actual scope: continuous recurrence and wake/stencil work dominate sampled CPU time. The report clearly limits this to a rest-initialized 290–300 s Chrome main-realm stub, not live AudioWorklet deadlines. |
| 4 | Which material distinctions meaningfully affect sound? | Answered as an implementation boundary, not a perceptual attribution: stiffness, density, and damping enter the current Plate coefficients; exposure routes direct strikes and adjacent column entries create Z links. B/C labels, age, and episode identity are not constitutive inputs. Plate IDs still key compatible state transfer across topology installs. No parameter-isolated or listening comparison establishes which distinction is perceptually meaningful. |
| 5 | Is MaterialPlate ≈ acoustic layer still justified? | The report correctly leaves this open. The current implementation assigns a solver layer and two pickups per descriptor, but duplicate/coarse filters do not prove coupled state equivalence or justify merging. |
| 6 | If not, what representation is better? | A spatial mechanical network driven by retained material history, with readout declared separately, is identified as a proposal and reference direction. It is not presented as an implemented or validated replacement. |
| 7 | What serious alternatives were tested or falsified? | The report identifies tested current-worklet granularity, registration sensitivity, continuous output, and workload probes; it narrowly rejects unique isolated geometry for every local ID and layer count as a cost proxy. It does not claim a bonded solver, state reduction, or higher-resolution model was tested. The historical fixed-operator ROM remains scoped to its prior negative result. |
| 8 | Did the historical material/acoustic-separation hypothesis survive independent review? | It survives as a distinction between provenance identity and the acoustic interface contract. It does not establish an effective bonded body or passive-record-only material model. The historical counterweight—that plates and Z links can carry active motion—is retained. |
| 9 | What architecture would you recommend now, ignoring sunk cost? | Answered directly: sparse spatial mechanics, initially retaining stratified motion and finite local coupling, with an independently declared world readout. This is explicitly a modeling recommendation, not a tested solver. |
| 10 | What remains an artistic decision? | Whether deposits retain distinct laminar interfaces or bond into continuous mechanics, and how/where the world is heard. ERB shape and engineering measurements do not choose either. |
| 11 | Is the recommendation strong enough for a separate production-adoption pass? | No. The report explicitly says no new architecture is ready for production adoption. A future bounded architecture study is justified; production adoption would still require a concrete candidate, fixed-history comparison, appropriate listening review, and live browser deadline evidence. |

The user's central criterion—whether the world becomes a convincing sonic object under live web use—remains open. The report's decision is appropriately limited to architecture research and does not use implementation convenience as the answer to that criterion.

## Independent checks

### Current source contract

- `MaterialStratigraphy` keeps immutable 96×96 masks, bottom-to-top order, exposure, and depth. `compileSurfaceTopology` reduces occupancy to a 32×32 mask per descriptor, packs a separate solver state range per layer, compiles only stiffness/density/damping into Plate coefficients, and makes local Z links from vertically adjacent source-column entries. [Compiler](../../../../../src/lib/audio/compileSurfaceTopology.js) · [Stratigraphy](../../../../../src/lib/agents/ant/MaterialStratigraphy.js)
- `SurfaceAudioBridge` manages one shared stereo worklet with 0.7 default output gain. Each descriptor receives two compiled pickup nodes. Its contact path posts `hardness`, but `applyStrike` does not consume it. The worklet has a 6 kHz recurrence, 3 ms finite contact pulse, 75 ms local recovery, masked four-neighbor stencil, per-layer pickup sum, Nodule readout, and soft limiter. Compatible ID/node topology reinstalls transfer prior state; ID is therefore a continuity key even though it is not a material coefficient. [Bridge](../../../../../src/lib/audio/SurfaceAudioBridge.js) · [Worklet](../../../../../static/worklets/surface-plate.worklet.js)
- The report's qualifications about zero-exterior boundary behavior, fixture material values, arbitrary row-major pickups, omitted planar thickness, and absent bonding law match the inspected implementation. These are authored-model limitations, not calibrated physical claims.

### Arithmetic and artifact receipts

- The six renders each contain 14,400,000 stereo frames at 48 kHz, 1,800,000 physics steps, and gain 0.7. Scheduled and received event counts match for all six; route drops and nonfinite counters are zero. The recorded seed-20261005 REPLACEMENT full rerun matches its original 115,200,044-byte WAV hash exactly.
- The six source-world replays (three seeds × CONTROL/REPLACEMENT) reproduce their saved run headers and chunks byte-for-byte. CONTROL also matches its frozen authority; observer RNG remains zero and audio does not feed back into world capture.
- Browser/VM parity is **numerical**, not bit-identical: the recorded maximum whole-PCM difference is `7.450580596923828e-9`, below the declared `1e-8` fixture bound. It does not measure asynchronous MessagePort timing or live deadlines.
- I independently recomputed each pooled stereo RMS row from the left/right RMS values in `audio-analysis/windows.csv`; all 15 displayed values round to the report table. The atlas contains all 30 fixed-scale window panels. The ERB figure ordering and analysis describe absolute linear band power as primary and unit-sum shape as secondary.
- The compiled census reconciles: 436 local layers; 110 one-node; 320 with at most four nodes; 184 with coincident compiled pickups; 30 identical absolute-mask hash groups and 24 translation-normalized hash groups. These are groups of descriptor geometry hashes, not acoustic bodies or operator-equivalence classes.
- The reported planar counts are 168/151/149 four-neighbor subgraphs versus 156/143/137 eight-connected descriptor masks, a net 32 extra subgraphs. There are 83/68/72 connected components in the full node graph after Z links, and 3/4/4 components without a Plate pickup. I independently counted the union of local 96-grid masks using eight-neighbor connectivity: 53/44/39 components. These distinct counts are not interchangeable; layer-ID Z connectivity is coarser than the full node graph.
- At 300 s, the REPLACEMENT counts of fully buried, never-directly-struck layers with a Z link and nonzero late raw pickup are 2/4/4. This supports observed state/readout activity in the reference, not a layer's unique causal share or audible contribution. “Fully buried” is an endpoint exposure check, not proof of burial for the whole preceding window.
- CPU medians and CONTROL/REPLACEMENT ratios recompute as 18,927.5/3,037.9 ms (6.23), 11,401.5/2,860.6 ms (3.99), and 25,709.8/4,442.5 ms (5.79) per 10 model seconds. The clean replay has three measured runs per case. Compiler medians also match the report. These values are offline main-realm work; they do not establish web realtime viability.

### Diagnostic and validation boundaries

- The accepted schedule recount corrects **27** exact-window-start strike undercounts in the raw observer counter. The saved raw receipts are preserved, corrected values are derived from accepted schedule events, and the discrepancy does not alter PCM or world trajectories.
- Raw activation/wake counters include topology reinstall activations. The report does not interpret them as physical sleep-to-wake counts. Raw per-layer pickup sum-squares are pre-sum/pre-limiter observer values, not additive output energies; no individual counterfactual contribution is claimed.
- Saved focused test logs report 59/59 existing reference tests and 25/25 research harness tests passing. They do not replace listening, full-history live browser timing, or production-adoption review.

## Remaining gates

No further experiment is needed to accept the current bounded report. The next action depends on the artist's choice of mechanical continuity and readout. If that choice selects a different mechanics model, compare its smallest real prototype against these same fixed histories and declare the information it loses. A listening comparison is required for audibility or aesthetic claims, and an actual browser deadline/underrun run is required for live web claims. Production adoption remains a separate, unapproved decision.

The package manifest and checksums were generated before this acceptance record existed. Regenerate and verify them after adding this file so the final acceptance itself is covered.

## 2026-11-02 addendum: endpoint counts and silent ERB shapes

The endpoint strike counts in [aggregate-independent-review.md](aggregate-independent-review.md) match the six saved schedules and [render receipts](../analysis/audio-render-receipts.json):

| Seed | CONTROL terminal strikes | REPLACEMENT terminal strikes |
|---|---:|---:|
| 20261005 | 0 | 0 |
| 20261006 | 3 | 1 |
| 20261007 | 2 | 3 |

I counted schedule strike messages at frame `14,400,000`, then checked the in-range strike diagnostics and receipt `endpointEvents` for each arm. In every case, rendered in-range strikes plus terminal strikes equal the full schedule strike count; there are no later-frame strikes. All these terminal events are strikes. Thus the aggregate review's `0/0, 3/1, 2/3` CONTROL/REPLACEMENT counts are correct. `VALIDATION.md` currently reports `0/3, 1/2, 2/3`, which does not match the schedules or receipts and should be corrected to `0/0, 3/1, 2/3`. `REPORT.md` says the terminal events are separately receipted but gives no numeric endpoint counts.

The chart issue noted in the aggregate review applied to its earlier generated SVG. The regenerated `erb-unit-shape.svg` now omits undefined null profiles and marks them in the legend: `analysis.json` has 25 defined shape profiles and 5 null silent profiles; the SVG has exactly 25 `<polyline>` traces and five starred window legends, with a footnote stating that silent shapes are undefined and traces omitted. The patched plot source uses an empty series for null profiles and includes a null-profile self-check. The regenerated `plot-manifest.json` SHA-256 is `5ccb73378080183c63b7ec9e59841c1c308453329b6eadba604e3e786cb7d701`; its `erb-unit-shape.svg` receipt SHA-256 is `0a3f79c05b4681229369c088d3f2d808bf004a82bc3c1b547d0296c87664f288`. The aggregate review itself remains unchanged; its earlier chart note is historical for the artifact hash it reviewed.

No new scientific blocker was found. Endpoint messages remain outside the half-open rendered interval, and the chart correction changes only display of undefined silent shapes; neither changes the six worlds, PCM, or the architecture conclusion.
