# ANT S0/S1 read-only DynamicSocialGraph — 2026-10-07

S0/S1 is complete as a separate observation library and evidence harness. The founder-refined ANT behavior is unchanged. Three matched deterministic seeds ran for 600 simulated seconds with graph instrumentation ON and OFF; trajectories, RNG, chemical field, SurfaceField, FOOT_CONTACT, lifecycle and material/birth hashes match.

The natural result is sparse, short proximity connectivity. At k=2, eleven connector episodes qualify in the 250 ms window, last 0.30–0.65 s, and all occur within 0.019 simulation units of the recruitment origin. No connector qualifies in a window of 1 s or longer. This does not demonstrate social organization, an ant trait, or sustained pioneer behavior.

## 1. Frozen source and encounter definition

Behavior baseline: `e38450ce11f99e63f5ab0cb6e8e8ee4281fcadd9`. The prior founder refinement, steering, commitment, exploration, deposition, speed, gait, collision, recruitment, fields and birth rules remain frozen. The source audit checks 43 original production files: 42 are byte-identical; only `src/lib/index.js` adds two exports. Existing controllers, ANT renderer and worklets have no edits.

AntAgent uses one collision disk with default radius 0.006, clamped to 0.003–0.015. BodyPose renders larger articulated geometry and appendages, so collision-disk proximity is not literal head, antenna or foot contact. LocalOccupancy's existing close and sense scales are 0.022 and 0.085. Its direction-aware behavioral occupancy is not reused as a social graph.

The normalized observable is:

```text
q(A,B) = hypot(xA-xB, yA-yB) / (radiusA+radiusB)
encounter iff q <= k
k = 1, 1.25, 1.5, 2
```

The implementation adds only a four-machine-epsilon distance tolerance at the boundary. For default ants the four center-distance limits are 0.012, 0.015, 0.018 and 0.024. k=1 measures contact-near collision disks; the larger values measure short-range body-scale proximity. All edges are undirected. There is no reliable orientation-aware literal contact classifier in this pass.

Minimum spawn separation is the radius sum plus 0.004: 0.016 for default ants. Therefore a new ant can immediately satisfy the wider proximity definitions. The k=2 default remains an observation setting justified by this sweep, not a fixed biological social radius.

## 2. Architecture and safe observation point

`DynamicSocialGraph` consumes detached scalar observations. `TemporalSocialTopology` consumes detached graph snapshots. Both are framework independent and have no DOM, p5, WebAudio, controller references, random source or steering callback. AntAgent contains no graph algorithms or social state.

The caller observes after a complete 60 Hz fixed tick and can analyze every third tick at 20 Hz:

```js
const graph = new DynamicSocialGraph({ distanceMultiplier: 2 });
const topology = new TemporalSocialTopology({ windowSeconds: 1 });
const ants = () => controller.agents.map(({ id, x, y, radius }) => ({ id, x, y, radius }));
graph.observe(controller.simulationTimeMs / 1000, ants()); // Initial observation.
for (let tick = 1; tick <= ticks; tick++) {
  controller.tick(1 / 60);
  graph.observe(controller.simulationTimeMs / 1000, ants());
  if (tick % 3 === 0) topology.observe(graph.getSnapshot(1));
}
```

This explicit host pattern is the only integration; production does not automatically create the observer or add an overlay. UI `update()` can batch ticks and emit once per rendered frame. Full ANT snapshot getters can lazily initialize pose/gait caches, and FOOT_CONTACT callbacks happen inside a tick. Copied scalar positions after the tick avoid these ambiguous hook points.

Ant IDs are monotonically allocated `ant-N` within a controller run and survive in historical events after retirement. A seed/run namespace is required across controllers. `bornSeconds` means first observation, which equals birth only when observation begins at initialization. Reusing a retired ID, decreasing time, duplicate IDs or invalid geometry is rejected. Returned histories/snapshots are detached; callers cannot mutate simulation objects through the graph.

The deliberately simple implementation keeps full history, scans pairs in O(N²), and reads window history in O(E). This is acceptable for the current population ceiling of 28. It is not a bounded-memory production telemetry service. No paging, graph cache, new dependency or runtime optimization was added.

## 3. Raw temporal stream and edge weight

S0 records NODE_ENTER/EXIT and ENCOUNTER_START/END, not one duplicate event per frame. Episodes retain stable endpoints, encounter ID, start/end/duration, minimum distance and normalized distance, and end reason. A pair key is the serialized canonical ordered ID pair. All records are plain serializable values.

Samples use zero-order-held intervals: the encounter signal observed at one 60 Hz sample applies until the next sample. A new encounter receives no retroactive duration. This is exact for the sampled signal; it is neither continuous-trajectory truth nor a guaranteed lower bound on physical contact duration.

For rolling window W, edge weight is cumulative threshold-proximity duration inside `(t-W,t]`, in seconds. Only positive weight forms a temporal edge. A currently separated pair can retain a recent edge while both endpoints remain alive. `activeEncounter` distinguishes current proximity from retained history. Retiring either endpoint removes the live edge immediately, without deleting historical episodes.

Snapshot minimum distances summarize overlapping episodes and can come from an earlier part of an episode outside the current window. Do not treat them as independently clipped window minima. End-of-run encounters use `endReason: right-censored`; S1 edge lifetimes also carry a `rightCensored` boolean. Completed-duration summaries exclude censored intervals.

## 4. Windows and component events

Windows tested: 0.25, 1, 5 and 20 seconds, at 20 Hz. Each analyzer has a fixed window. Nodes include active isolates. Deterministic component traversal and Tarjan bridge/articulation analysis use the positive-weight undirected graph.

EDGE_FORM/END describe rolling-window edge appearance/expiry or endpoint retirement. COMPONENT_MERGE/SPLIT compare partitions over surviving IDs. Isolated recruitment or retirement alone is not a merge/split. A retiring connected ant can split survivors; recruitment can join an existing component without merging two prior surviving components. Consequently merge and split totals need not balance. Complex repartition can emit both.

Within one observation, deterministic event order is EDGE_END, EDGE_FORM, COMPONENT_SPLIT, COMPONENT_MERGE, BRIDGE_BREAK/FORM/PERSIST, ARTICULATION_BREAK/FORM/PERSIST, CONNECTOR_PERSIST/END; canonical keys resolve ties.

The controlled physical fixture starts with two disconnected pairs, adds a connector, then retires it. With 60 Hz S0 and 20 Hz S1, initial pair merges occur at 0.05 s, connector merge at 0.15 s, persistence at 0.40 s, and retirement/split at 0.45 s. Tests check exact event order as well as window expiry, stable IDs, detached outputs and deterministic ordering.

## 5. Bridge, articulation and connector persistence

Raw structural bridge counts alone are weak evidence in a graph composed of isolated pairs. Snapshots therefore report `bridgeFraction = bridges/edges` and `articulationFraction = articulationNodes/activeNodes`; empty denominators yield zero. Raw, pending, confirmed and persistent counts remain distinct.

A bridge must be a current structural bridge and a currently active encounter. It forms after continuous sampled support for 0.10 s, and persists after `max(0.25, W)` seconds. Loss of fresh support, topology or an observation gap over 0.075 s resets/breaks it. A long rolling edge tail cannot qualify by itself.

An articulation requires fresh incident encounters into at least two distinct components after removing the candidate ant. Merely having two active neighbors is insufficient. Independent review caught the triangle-plus-stale-twig case; the shared cut-branch guard now covers articulation, connector onset and connector continuation. A mutation that weakened this guard failed the targeted regression.

A connector candidate is retrospective: an observed component merge, an actual articulation, new active incident edges into at least two external prior components, and fresh support spanning at least two current cut branches. Its original support groups must continue reaching every recorded prior component and multiple cut branches. CONNECTOR_PERSIST/END records ant ID, onset/confirmation/end times, duration, prior component memberships, merged size and size delta. It conservatively omits many possible single-edge mergers; it does not identify a causal agent or stable trait.

No ANT pioneer state, role, partner preference, centrality, learned edge weight, adaptive social memory or social feedback exists. Persistence is sampled at 20 Hz and can miss breaks shorter than one analysis interval.

## 6. Matched natural runs and threshold sweep

Fresh default controllers use injected LCG seeds 20261005, 20261006 and 20261007, with identical initialization and 1/60 s ticks. Each seed runs 600 s OFF and ON. S0 observes every tick; S1 observes all 16 threshold/window combinations every third tick. Numeric checkpoints are 30/60/120/300/600 s; timelines are 1 Hz. Audio is Off in these natural captures.

| Seed | Active ants at 30/60/120/300/600 s | Stable IDs seen | FOOT_CONTACT groups | Actual foot points |
|---|---|---:|---:|---:|
| 20261005 | 10 / 14 / 20 / 22 / 21 | 765 | 35,751 | 105,759 |
| 20261006 | 10 / 14 / 19 / 18 / 21 | 705 | 35,377 | 104,829 |
| 20261007 | 10 / 12 / 18 / 21 / 21 | 743 | 35,448 | 105,001 |

Initial t=0 population is one; the first stored 1 Hz row has two ants. Contact groups contain one to three actual foot points, so these two counts must not be conflated.

| Seed | k=1 episodes / pair-seconds | k=1.25 | k=1.5 | k=2 |
|---|---:|---:|---:|---:|
| 20261005 | 4 / 1.25 | 33 / 8.48 | 174 / 42.92 | 511 / 184.88 |
| 20261006 | 9 / 4.22 | 35 / 11.62 | 162 / 43.72 | 483 / 169.22 |
| 20261007 | 337 / 18.33 | 37 / 42.00 | 175 / 80.55 | 518 / 240.55 |

The k=1 episode count is unstable at the tangent boundary: narrow fragments can merge into fewer longer episodes at a larger threshold. Episode count is not monotonic evidence strength. Cumulative pair exposure is monotonic across the sweep in all three seeds. No behavior was tuned to make the graph denser.

## 7. Lifetime, stability and topology results

At k=2, completed raw encounter median/p90 seconds are 0.267/0.767, 0.233/0.783 and 0.250/0.867 by seed. Seed 20261006 has one additional right-censored raw k=2 encounter. This is temporal heterogeneity within the sampled proximity definition; it does not establish heterogeneity beyond movement geometry or density.

The following ranges span the three seeds. Jaccard compares adjacent 20 Hz edge sets and excludes empty unions; empty graph fraction is reported separately. Window-edge lifetimes include retention and retirement effects, unlike raw encounter duration.

| W | Adjacent edge Jaccard mean | Empty graph fraction | Completed edge median, s | Bridge PERSIST counts by seed | Articulation PERSIST | Connector PERSIST |
|---:|---:|---:|---:|---|---|---|
| 0.25 s | 0.845–0.860 | 0.571–0.631 | 0.50 | 233 / 192 / 224 | 13 / 10 / 19 | 3 / 3 / 5 |
| 1 s | 0.929–0.934 | 0.316–0.383 | 1.25 | 22 / 14 / 24 | 0 / 0 / 2 | 0 / 0 / 0 |
| 5 s | 0.980–0.982 | 0.035–0.074 | 5.20 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| 20 s | 0.990–0.991 | 0.0008–0.0157 | 10.35–10.55 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

High long-window Jaccard follows retained edge history; it is not evidence of sustained active proximity. A 20 s edge can die sooner because an endpoint retires. Empty graphs and changing population also affect these summaries.

At W=1 s, 1 Hz mean component counts are 17.36 / 17.38 / 17.27, mean edge counts 1.137 / 1.052 / 1.243, and mean largest-component ratios 0.109 / 0.104 / 0.118. Weighted degree is summed proximity-seconds per ant, not an influence score. Its median is zero in all three seeds; mean values are 0.0332 / 0.0306 / 0.0434 seconds across all node observations. Full distributions remain in `data/analysis.json`.

Raw bridge-fraction means at W=1 s are 0.601 / 0.591 / 0.614, including zero for empty graphs. Articulation-fraction means are 0.0137 / 0.0103 / 0.0141. The large bridge fraction mainly describes sparse pair/tree structure. Persistence counts provide the necessary temporal context.

Merge/split counts by seed are 238/484, 233/454, 234/471 at W=0.25; 222/456, 223/437, 222/456 at W=1; 213/421, 216/394, 215/419 at W=5; 208/86, 212/91, 214/85 at W=20. Turnover and recent-edge retention explain why these are not symmetric transition counts.

The eleven k=2/W=0.25 connectors last 0.30–0.65 s, median 0.40 s, and merge components of size 3–5. There is one additional k=1.5/W=0.25 connector in seed 20261007. None qualify at W>=1 anywhere in the sweep. All k=2 events occur within 0.018874 of `(0.5, 0.72)`, the recruitment origin. These are brief recruitment-zone topology events, not evidence of persistent corridor bridges.

## 8. Density, occupancy and interpretation

The descriptive spatial comparators are active population, instantaneous threshold-pair count/density, mean neighbors inside existing center-distance scales 0.022 and 0.085, and coarse 8×8 instantaneous occupancy. Occupancy entropy is `-sum(p log p)/log(64)`; concentration is ant share in the seven most populated cells, the ceiling of 10% of 64. This is instantaneous occupancy, not pheromone-route entropy. A 64×64 grid had made that share trivially one for this small population; the evidence design changed to 8×8 before the natural captures.

Across seeds, W=1 component count correlates 0.953–0.959 with population. W=0.25 largest-component ratio correlates 0.437–0.623 with instantaneous pair count. W=1 edge count correlates 0.497–0.565 with instantaneous pair count. W=20 edge count correlates 0.478–0.747 with population and only 0.172–0.191 with current pair count, consistent with accumulation and turnover rather than simultaneous contact.

All eleven connectors have more neighbors within 0.085 than the colony mean at the exact same 60 Hz frame. Their local counts are 2–5; same-frame colony means are 0.375–2.111. This is partly selection by the connector definition, which already requires multiple nearby contacts. The recruitment-centered positions strengthen the density explanation, but do not prove it sufficient. Population-conditioned descriptive rows and occupancy comparisons remain in the analysis packet. No significance, residual causality or social-organization claim is made.

Per-second split events need not coincide with the instant pair count because rolling expiry and retirement are delayed. An uncorrelated split count is not evidence of a separate social mechanism. Full movement-constrained null models are intentionally deferred.

For subsequent inspection, use **1 s as the primary recent-proximity window**, with 0.25 s alongside it for live transients and 5 s for accumulated context. At 1 s the graph is less empty than at 0.25 s while remaining interpretable as recent local proximity. Keep 20 s as a memory/turnover sensitivity case. None is a biological truth; do not interpret higher Jaccard alone as a better social timescale.

## 9. Visual evidence

![Matched graph window comparison](visuals/social-contact-sheet.png)

The single 1380×3325 contact sheet contains 36 panels: three seeds × 30/120/600 s × four windows, all at k=2. Coordinates are fixed to `[0,1]²`; dots use collision radius. Solid teal edges are currently active proximity, dashed violet edges are retained recent-window memory. Component colors are deterministic within each snapshot and can change when membership changes. There is no pheromone, SurfaceField or Plate overlay to confuse with graph topology.

The parent inspected the sheet, threshold table, a rescaled seed timeline, lifetime plots and a connector selection. Sparse live encounters remain visible; long windows connect ants that are now spatially separated. The artifacts are diagnostic renderings of archived model positions, not a new 600 s browser-motion capture or an aesthetic test of gait.

`visuals/` also contains per-seed spatial panels, fixed-scale timeline and lifetime/event plots, overview and threshold table. Selected connector views use the nearest stored 1 Hz snapshot and explicitly print the signed offset. They are not exact event-frame images. Exact 60 Hz event positions remain in the trajectory and analysis packet.

## 10. Behavior invariance and Plate baseline

For each seed, all 36,001 ON/OFF frames, including t=0, have identical serialized trajectory hashes. There are 108,000 matched simulation ticks across the three pairs. Eight paired digest fields match at every recorded row: agents, RNG state/call count, chemical bytes, surface bytes, contacts, births, lifecycle and material. The first seven are measured each tick; material snapshots update at t=0 and 1 Hz, with the prior material digest retained between those samples. The paired binary files preserve both sides of every comparison.

The focused 120 s test additionally deep-compares controller/activation/birth/stratigraphy state, gait, body pose, gaster deposition, agents, RNG and ordered audio bridge commands after every tick, including adversarial mutation of detached graph outputs. It covers 7,200 ticks, 2,401 S1 samples per window, 5,319 contact groups/audio contact commands, one natural Plate/material sync, 97 enters and 77 exits. This proves observer invariance for these executions; it is not a DSP realtime benchmark.

| Seed | First Plate, s | Plate births at 30/60/120/300/600 s | Nodule births at those times |
|---|---:|---|---|
| 20261005 | 103.017 | 0 / 0 / 1 / 9 / 32 | 0 / 0 / 0 / 2 / 32 |
| 20261006 | 220.017 | 0 / 0 / 0 / 7 / 28 | 0 / 0 / 0 / 4 / 32 |
| 20261007 | 145.017 | 0 / 0 / 0 / 10 / 31 | 0 / 0 / 0 / 5 / 32 |

Birth events and histories are identical ON/OFF. Chemical/support thresholds, persistence, geodesic length, same-corridor refractory, required new foot contacts and global birth gap are unchanged. This observational pass supplies no new basis for a separate birth-threshold tuning pass.

The preserved sonic baseline remains a 3 ms finite contact pulse, 75 ms local recovery and ×50 Plate damping. Natural runs are Audio Off; the unresolved mature 20–30 Plate AudioWorklet realtime collapse remains deferred. There are no audio, sleep/wake, ROM or optimization changes.

## 11. Raw data and null-model readiness

Each seed has a lossless gzip binary trajectory with 36,001 frames, exact Float64 timestamps and positions, velocity, heading and radius for every active ant at 60 Hz. Header: `ANTTRJ01`, uint32 schema=1, Hz=60, record bytes=52. Each frame is little-endian Float64 seconds, uint32 ant count, then uint32 ID index plus six Float64 scalars. ID dictionaries live in the seed summary. The model is 2D; no z coordinate is fabricated.

Raw gzip JSON preserves encounters, lifecycle, real foot events, Plate/sphere birth payloads, and all S1 events/lifetimes for four thresholds and four windows. Timeline `.json.gz` files contain newline-delimited JSON, not one JSON array. Summaries include checkpoints and the digest comparison. Seed IDs are namespaces, not a globally unique ant population.

These records can support later synchrony breaking, trajectory-preserving time shifts, path-segment randomization and movement-constrained comparators without rerunning behavior. Boundary/lifecycle constraints still need a deliberate null-model design. No Erdős–Rényi test, causal result, spectral metric, λ2 or eigenmode was implemented.

## 12. Verification and provenance

- Baseline tests: 241/241. Final full suite: **261/261**, zero failures/skips, approximately 34.9 s.
- Focused S0/S1/invariance: **20/20** (7 S0, 12 S1, 1 invariance).
- Both script syntax checks and executable selfchecks pass.
- Final Vite build passes. Existing zod PURE-comment and large-bundle warnings remain.
- Actual Chrome smoke tests pass for Vite development and production preview.
- Archive replay binds the exact S0 and S1 module hashes; replays every raw S0 episode/event and S1 event/lifetime; compares every stored 1 Hz topology snapshot and checkpoint edges/components against an independent BFS oracle; validates all paired tick-digest rows and trajectory hashes. All three archives pass.
- Parent separately recomputed initial population, birth horizons, cumulative encounter exposure, all 1 Hz population/pair/close-neighbor values, and all eleven exact-frame connector positions/local-versus-colony neighbor values. Those checks are recorded in `validation/parent-analysis-verification.json`.

The archive verifier does not independently recalculate every other timeline aggregate, per-second event bucket or summary correlation. Those values have source/data provenance and descriptive review, but the replay claim is limited to the checks above. The supplementary analysis uses linearly interpolated Type-7 quantiles; capture summaries use the lower order statistic at `floor((n-1)p)`. Reported raw/edge lifetime medians and p90 values in this README use capture summaries.

The capture manifest records implementation HEAD `a6801d609b82f1f1a0b5030b7c6e4b9b5d2ebe72` and 13 core source hashes. The then-untracked capture harness had not been committed and was not self-hashed in that manifest. Its exact 36,225-byte source is preserved in `validation/capture-harness-source.txt.gz`; uncompressed SHA-256 is `1cc7abf3ffbf1bd65069faf15545a454fb361e4c88167c63f0811624346e719c`, independently matched by the parent and reviewer. The later committed harness adds broader archive verification and its own hash to future capture manifests. The captured manifest remains unchanged.

`checksums.json` binds all package files except itself and records current source/tool hashes. Package-local `.gitattributes` disables Git newline conversion for archived artifacts: log bytes and their checksums survive staging/checkout together. It changes no production attributes or configuration. Visual metadata also binds its script, manifest, input summaries/raw/timelines and every generated PNG. Original absolute working paths in metadata are provenance; filenames under `data/` and `visuals/` locate the committed copies.

## 13. Files and reproducible commands

Production additions: `src/lib/agents/ant/DynamicSocialGraph.js`, `TemporalSocialTopology.js`, and two barrel exports. Tests: `tests/ant-dynamic-social-graph.test.js`, `ant-social-topology.test.js`, `ant-social-invariance.test.js`. Tools: `scripts/ant-social-evidence.js`, `ant-social-visual-evidence.js`. Documentation: repository README/AGENTS and this package. Generated package: `data/`, `visuals/`, `validation/`, `checksums.json`.

```powershell
npm test
npm run build
node scripts/ant-social-evidence.js --selfcheck
node scripts/ant-social-visual-evidence.js --selfcheck
node scripts/ant-social-evidence.js --seconds=600 --seeds=20261005,20261006,20261007 --output=test-results/social-evidence
node scripts/ant-social-evidence.js --verify --output=docs/ant/evidence/2026-10-07-social-graph/data
$env:BROWSER_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node scripts/ant-social-visual-evidence.js --input=docs/ant/evidence/2026-10-07-social-graph/data --output=test-results/social-visual-replay
npm run test:browser
node scripts/browser-check.js --production
```

Replay requires the recorded S0/S1 source hashes, including the recorded LF source bytes. Use an ignored output directory for regeneration to preserve historical evidence. Existing unrelated untracked wake-gate diagnostics and the prior founder contact sheet remain untouched and unstaged, with hashes recorded in validation.

## 14. Commits and handoff

1. `8076de6` — Add read-only ANT dynamic social graph: S0 and tightly coupled tests/export.
2. `a6801d6` — Add temporal social topology analysis: S1, focused fixtures and invariance protection/export.
3. `f4365b1` — Add ANT social graph evidence harness: capture/replay and diagnostic visualization tools only.
4. The separate evidence/report commit contains this package and repository guidance. Its SHA and verified push result are reported in the final chat because a commit cannot contain its own resulting SHA.

No generated evidence appears in the implementation/tooling commits. Status, intended diff and staged paths were inspected before each commit. Push occurs only after validation and package review; remote HEAD is checked afterward. Stop after S0/S1. Null-model validation, spectral work, adaptive memory, Plate coupling and behavioral feedback require separate authorization.

## 15. Orchestration record

The parent used current Sol Ultra. The user's model-routing correction superseded the earlier instruction requesting Sol children. All operative children after that correction used GPT-6 Luna; there were no subsequent Sol children.

| Child | Model / reasoning | Bounded responsibility | Skills actually applied |
|---|---|---|---|
| encounter_luna | GPT-6 Luna / High | Body/cadence/ID audit; S0 + tests | superpowers:test-driven-development |
| temporal_luna | GPT-6 Luna / Max | Temporal semantics; S1 + persistence regression fixes | agent-skills:test-driven-development; agent-skills:git-workflow-and-versioning |
| invariance_luna | GPT-6 Luna / Max | Deep observer/RNG/field/gait/audio-input parity | None |
| evidence_luna | GPT-6 Luna / High | Matched natural-run harness; descriptive density packet | None |
| visual_luna | GPT-6 Luna / High | Diagnostic plotting script | None |
| final_review_luna | GPT-6 Luna / Max | Independent source/tests/evidence/provenance review | agent-skills:code-review-and-quality |

Parent decomposition was source/geometry audit, S0 encounter stream, S1 topology, invariance, matched natural evidence, visual evidence, independent review, then separated commits. Children edited disjoint assigned paths; the parent integrated and independently ran important checks. No child spawned nested agents.

Chronology:

1. Inspected current status/diff, README/AGENTS, memory boundary notes and baseline evidence; froze unrelated diagnostics and source hashes.
2. Initial four Sol audit launches happened before the user corrected routing. Pending Sol work was canceled; one audit had already completed. Luna assignments replaced them.
3. Geometry/cadence and temporal/density audits produced concrete evidence packets. Parent checked physical radius, spawn geometry, IDs and post-tick semantics in source.
4. S0 went through failing/passing tests; parent caught recent-edge tails and validated deterministic lifecycle/window semantics. S0 committed separately.
5. S1 and invariance tests followed. Independent review found stale-twig freshness; child corrected the shared cut-branch rule. Parent checked the physical connector fixture and the mutation regression. S1 committed only after tests passed.
6. Parent/child corrected evidence-harness pilot defects, coarse occupancy resolution, finish times and metadata. Natural OFF/ON runs completed once per seed for the full 600 s.
7. Parent replayed all S0/S1 raw histories and 1 Hz topology snapshots, checked checkpoint components independently, rendered/inspected fixed-scale visuals, and corrected caption/provenance limits raised by review.
8. Parent checked the final analysis schema against raw archives: t=0 population, trajectory parity, nodule time field and exact-frame density. Parent recomputed key comparisons independently.
9. Full tests/build/Chrome checks passed. Tools and generated evidence were committed separately; original source and unrelated-file hashes were checked again before push.

Meaningful steering is counted by purpose bundle, not by every routine coordination message. Nine bundles: one user model-routing correction; recent-edge tail semantics; S1 finalization/timestamp semantics; capture-harness pilot/schema/finish fixes; coarse occupancy and qualified-connector density; invariance window 15→20 s; native Git provenance instead of a custom ref parser; exact event versus nearest 1 Hz visual labeling; and fresh cut-branch persistence. Caption, full replay and capture-source provenance corrections are grouped with the evidence/visual verification bundles. Final packet schema correction belongs to the same evidence bundle.

Parent-applied Skills: caveman, ponytail:ponytail, agent-skills:api-and-interface-design, superpowers:dispatching-parallel-agents, superpowers:test-driven-development, agent-skills:git-workflow-and-versioning, superpowers:verification-before-completion, agent-skills:code-review-and-quality. Child-only additional unique Skill: agent-skills:test-driven-development. Total **9 unique Skills actually applied**. Brainstorming was read for applicability, but its workflow was not invoked; no approval pause was introduced for the already specified pass.

Counts: **6 operative Luna children, 10 total launches including the 4 pre-correction Sol audits; 9 steering purpose bundles; 9 unique Skills; 7 available concurrency slots including the parent**. The initial audit replacement duplicated some reading. Sandbox worker/Chrome EPERM attempts, an undefined pilot helper and initial fixture timing expectations caused bounded rework. Parent used native permitted execution instead of adding dependencies or custom process/config workarounds. The final packaging check caught Git newline normalization changing log bytes; the package-local byte-preservation rule resolved it before commit. Full natural captures were not repeated to manufacture a preferred result.

## 16. Remaining limits

Three seeds under one default regime do not establish biological or installation-wide social organization. Collision disks are a proximity proxy; threshold-boundary chatter, spawn spacing, frame cadence, lifetime censoring and turnover all affect the graph. Long-window edges can span large present distances and cannot be read as simultaneous contact paths. Persistent topology can miss sub-50 ms breaks. The conservative connector definition can miss alternative causal interpretations, and qualifying events favor local multi-ant density by construction.

The raw data are ready for the separately scoped movement-constrained null-model pass. No such model or social conclusion is produced here. ANT behavior, Plate qualification and audio stay frozen.
