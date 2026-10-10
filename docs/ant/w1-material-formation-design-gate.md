# W1 Material Formation Design Gate

**Date:** 2026-10-10 (Asia/Seoul)

**Decision:** **Undecided / Research Gap — no new material ontology adopted**

**Scope:** architecture/research design investigation; no new experiment or natural simulation.

## Authority, source versions and chronology

This decision was made on `ant-w1-episodic-material-shadow`, starting at `5cec4e4e3a46c72945000729c0378f1d319371f7`, after fetching `origin`. Latest GitHub main was `600e23ac908793b2945b2dfbd25e6012037d0686`. The complete `src/` trees at these two refs are identical. Production facts below therefore come from current main code; W1 results come from the research branch. This branch is not merged into main.

Main's [ANT hub](https://github.com/oseconds/ant-2026/blob/600e23ac908793b2945b2dfbd25e6012037d0686/docs/ant/README.md) still carries the earlier vitality-first roadmap. The research branch's [2026-10-08 ordering decision](daily/2026-10-08-w1-material-before-vitality.md) explicitly places material ontology before vitality. Main receiving later archival documentation does not make its older roadmap the latest research decision. The ordering entry itself is design, not experimental evidence. The initial attribution stop, later continuation, and subsequent negative/mixed results have distinct dates and source revisions.

[`world-model.md`](world-model.md) remains a future design contract. Its persistent-world, history-derived character and bounded-influence principles survive this gate. Its episodic-crystallization proposal is a hypothesis, not a requirement that every material body be one activity episode. Production already implements `TrailPlateBirth` and `MaterialStratigraphy`; the gap concerns the proposed new long-term W1 ontology.

## 1. Diagnosis

### Five different objects were treated as one

| Term | What current code/evidence actually provides | Unsupported substitution in W1 |
| --- | --- | --- |
| Historical record | Admissions, contacts, timestamps, ancestry and unions | Every recorded cell is equally retained material |
| Activity | Binary q followed by 20 s / 90 s EMA contrast; current connected cells | Activity continuity is material identity continuity |
| Environmental memory | Pheromone, bounded chemical EMA, contact-derived SurfaceField | Persistent field magnitude is an independent formation process |
| Material contribution | No independently identified W1 conversion amount or constitutive change | Admission, support duty or contact history is already material contribution |
| Material birth | Production immutable Plate birth exists; W1 shadow freezes a union at closure | Disappearance of activity descendants is formation of a material body |

The original [crystallizer](../../scripts/ant-w1-crystallization.js) computes q from three historical qualification bits, filters q, links adjacent-sample active components through shared cells, gives split descendants one lineage, imports merged histories, and stores each admitted cell permanently. It freezes that historical union only when no current descendant remains and the episode spans at least 20 s. Neither admission nor closure measures a new physical transformation. The historical union is output geometry, not the linkage input; diagnosing the union itself as the cause of identity retention would be incorrect.

The fast/slow contrast is a change detector over already derived memory. The [original design](evidence/2026-10-08-w1-episodic-material-shadow/DESIGN.md) reuses the 90 s production refractory interval as a proxy. It is not a measured material relaxation time. The cumulative same-cell contact bit never becomes unqualified merely because its contacts are old. EMA activity can remain on after q turns off. These clocks answer different questions from a formation rate, irreversible change or retained material amount.

### What each attempted repair actually tested

| Evidence | Observed result | Supported diagnosis / limit |
| --- | --- | --- |
| [Completed episode-wide continuation](evidence/2026-10-08-w1-causal-character-attribution/README.md) | 328 closures; 228 single-cell; largest pending component holds 99.95–100% of pending union | Whole-lineage disappearance is a poor local birth clock for these histories. Character coverage was repaired, not formation ontology. |
| [Max-overlap split](evidence/2026-10-09-w1-max-overlap-split-shadow/README.md) | 617 closures; 300 single-cell; root active for 583–585 s and retains 98.2–99.8% of pending union | Independent child closure is possible. Split inheritance alone does not resolve the continuously active core or repeated inscription. |
| [Per-cell histories](evidence/2026-10-09-w1-per-cell-formation-history/README.md) | Root growth is 71.4–74.3% direct first admission, 25.7–28.6% merge-first; temporal/support histories differ within identities and actual frozen episodes | Blocking imported merge history alone cannot address direct accumulation. One episode is not a homogeneous formation history. No contribution law follows from heterogeneity. |
| [Cell-local supported spells](evidence/2026-10-09-w1-cell-local-supported-formation-shadow/README.md) | 30,828 events during a living root; 95.4–96.0% single-cell; unique area 62.1–62.3% per world; re-inscription 45.9–47.5% | Local event timing does not require global closure. Ending a supported spell still does not identify a material transition. |
| [Spatiotemporal connectivity](evidence/2026-10-09-w1-spatiotemporal-local-coherence-audit/README.md) | Largest group contains 94.0–96.8% of eligible spells; final unique area remains 17,195 cells across three worlds | Activity relations were recovered, but transitive history has no formation-specific spatial selection. Connectivity is not cohesion. |
| [Raw fields](evidence/2026-10-10-w1-raw-field-contact-history-audit/README.md) | Continuous field values vary inside identical q/active/history strata | q is lossy. Recovering its discarded information does not establish material contribution. |
| [Post-contact audit](evidence/2026-10-10-w1-post-contact-field-retention-audit/README.md) | All 16,561,152 saved SurfaceField values match existing updates exactly; 104,754 checkpoint intervals without contact footprints have zero passive residual | Observed surface retention is explained by existing relaxation and contact deposits. There is no extra surface process identified here. |

The initial 82.017 s attribution stop could not establish late-run morphology. The completed continuation can. Its cumulative directional coordinate may reuse contacts roughly 530 s before admission and across overlapping episodes. Complete, bounded coordinates are not exact causal attribution. W1's consolidation coordinate is a support/qualification-duty proxy, not measured solidification or stiffness.

Singletons and dense material are not intrinsically invalid. A real or explicitly modeled local process could produce either. The failures above challenge the proposed identification of activity history with formation and the previous viability claim; they do not establish that a successful world must have loops, islands, narrow Plates or sparse coverage. Existing morphology review sizes remain historical descriptive criteria, not acceptance parameters for a new mechanism.

### Additional counterexamples and hidden assumptions

1. **A moving chain is not one retained body.** A–B can overlap at one time and B–C later. A transitive component joins A and C without simultaneous activity. This is a logical counterexample to inferring common formation from connectivity alone, not a new simulation result. Conversely, an independently justified bonding process could make that same chain one body; W1 has no observed bond state to distinguish the cases.
2. **Closure can penalize sustained formation.** If a locality really transforms while its surroundings remain active, waiting for every descendant to disappear defers its birth indefinitely. Stopping the run cannot be used as an artificial closure; open histories are right-censored.
3. **An endpoint can be a readout loss.** Of eligible local spells, 89.1% end q-off while EMA-active remains on. Conditional support zeros can mean an unsampled value after chemistry fails, not disappearance of surface. An apparent simultaneous chemical/mechanical termination can therefore be caused by the recording gate.
4. **Neighbors matter before invoking a new process.** A cell with no same-cell foot point can receive the production SurfaceField contact kernel from neighboring points. Post-contact reconstruction already accounts for this. No same-cell contact is also not equivalent to no pheromone input.
5. **Retained history can be credited repeatedly.** Reusing old contacts or a previous union does not establish fresh formation. Repeated material layers remain possible, but would need distinguishable new increments/events and provenance rather than another credit for the same evidence.
6. **Sampling and grid scale can affect event geometry.** Same-sample termination grouping tests an observer convention at roughly 1 Hz on 96×96 cells. Its singleton fraction cannot prove an underlying physical formation length or timescale. Cutting long chains by a preferred time or size would add another observer convention, not discover cohesion.
7. **There is no independent W1 target response.** These archives contain fields, events, trajectories and production material outcomes, but no separately measured new W1 mass, bond network, phase, retained stiffness or response to a controlled probe. Fitting a new latent state to its own generated geometry would be circular.

## 2. Competing ontologies

These are different explanatory commitments, not interchangeable algorithm names.

| Ontology | Supported by current evidence | New assumption and advantage | Unknown / counterexample | Minimum discriminating observation |
| --- | --- | --- | --- | --- |
| **A. Existing fields are the relevant slow world state** | Exact surface replay; conditional support; known chemical EMA; production material remains separate | No extra W1 state is needed for the observed field evolution. Keeps the current null explicit. | Not a proof that these fields suffice for future material response. A complete state with identical future forcing could fail to predict an independently defined response. | First verify archived chemical input/EMA recurrence. A later response test must condition on the complete relevant state and input, not q bins alone. |
| **B. Material is a phase or regime of the existing field** | Continuous values and transitions exist | A declared field transition could define local material without activity closure; no extra state if it is fully determined by current fields. | A reversible label gives no new persistence or response. Hysteresis that distinguishes equal field values requires additional stored phase/path information, even if kept inside the same class. | Compare equal relevant fields under the same future input and a separately defined readout. If labels can be deleted with every state/readout unchanged, this remains an observer. |
| **C. Local irreversible conversion changes a world state** | Within-episode histories differ; existing contact deposits provide an input history | A slow local conversion state, retained increment or reference-configuration change can form during activity. Provenance can follow increments rather than a whole episode. | Conversion law, persistence, resource accounting and consequence are absent. Positive accumulated dose can saturate broadly just like earlier shadows; finite state does not guarantee selective geometry. | Declare one conversion law and one independent retention/response prediction before viewing shapes; compare against A under matched inputs. No retained mass/stiffness claim without such a modeled or measured definition. |
| **D. Material is a persistent relation between locations** | Local concurrent activity relations are available | A bond/cohesion state makes connected geometry a consequence of retained relations, not transitive activity. A living episode need not close. | No bonding input, kinetics, breakage or cohesion readout is observed. Persistent bonds can also percolate into a giant network. | Test one bond-state update against mere activity adjacency, with independently specified persistence/response and bounded influence. An 8-neighbor graph alone is not this test. |
| **E. Material object is an export/view of history** | Existing provenance, cell histories and immutable descriptors are traceable | Separates archive, world dynamics and object compilation. Useful when the question only needs a historical artifact. | Does not itself explain a new formation process. Exported pieces can change when grouping/export time changes while the world remains identical. | Change only grouping/export time and verify world state stays the same; if so, call it a view/representation rather than discovered birth. |

For B–D, changing a class name or storage location does not settle independence. A new stored variable that changes future evolution is extra dynamical state. A value computed from the same existing state and with no additional consequence is a derived observation. A distributed continuous material field can be a material ontology without discrete object births; Plate export can be a later representation decision. “Birth” would then refer to a declared local state transition or accounted increment, not cell completion or episode disappearance. This is a design possibility, not an identified transition in current data.

Physical literature offers useful distinctions, not an ANT mechanism. [Keim et al., *Memory formation in matter* (2019)](https://journals.aps.org/rmp/abstract/10.1103/RevModPhys.91.035002) discuss encoding, accessing and erasing historical information in material states. Memory and formation cannot be distinguished merely by whether history persists. [Zhuang et al., phase-field review (2023)](https://arxiv.org/html/2309.03996v1) describe additional field evolution and constitutive assumptions behind fracture geometry; borrowing the word “phase” would not supply those assumptions here. [Bharali et al. (2022)](https://arxiv.org/abs/2202.10040) distinguish an explicit irreversibility constraint from a history-variable approximation in fracture. That cautions against equating accumulated history with a justified irreversible law. These are modeling analogies; none validates ANT crystallization, biological consolidation or stiffness.

### What could justify selecting only some activity?

Selection needs a declared causal commitment: a conversion input/availability budget, a constitutive transition with a distinct readout, or formation/breakage of a retained relation. The model must explain why the same evidence sometimes changes material and sometimes remains reversible memory. Parameters would belong to that declared mechanism and require calibration or prespecified falsification; they would not be searched for attractive geometry.

Thresholds are not automatically illegitimate, and a continuous rate is not automatically justified. A threshold without an independently defined consequence merely segments the existing signal. A continuous weighted field integral can do the same. In the current archives there is no uniquely identifiable history-to-material contribution function. Heterogeneous history permits many mappings; it selects none.

Resource-limited conversion, relaxation with irreversible change, and bonds are possible assumptions, not facts established by these archives. No mass balance is available: the existing normalized dose/compaction scalar and pheromone scalar are not measured material supply. A finite precursor would have to be introduced as an explicit new model, not inferred from `surface`. Widespread conversion remains an admissible possible outcome, not a failure to be fixed by filtering.

## 3. Design decision

**Retain A as the explanatory null for the observed fields; leave the new W1 ontology Undecided / Research Gap.** This is not adoption of a field-only replacement for production Plates, nor rejection of every future independent material state. Existing code can explain the audited surface observations; current data do not establish a phenomenon that requires a new W1 state. Full chemical deposition history remains absent, and neither A's sufficiency for the target world nor B–D's necessity is established.

The most justified architectural direction is to separate **formation dynamics**, **historical provenance**, and **geometry/object compilation**. Episodes may index provenance. They must not automatically supply all three. A viable future proposal must state its operational material change and distinguishing readout before selecting a segmentation rule. Local formation during a living episode is permitted by this direction; the current supported-spell events establish only local activity timing.

For an independent material claim, persistence alone is insufficient because slow environmental memory already persists. A useful discriminator would be a retained constitutive/configuration/relational difference that affects a separately defined response after accounting for the relevant field state and forcing. This is a modeling criterion, not an observed physical property. Even apparent history dependence can arise from omitted field/neighborhood/filter state; matching a few cell scalars is not matching the full relevant state.

Current deterministic simulation cannot reveal an unimplemented hidden physical process through a residual alone. A residual first challenges archive completeness, update timing or the proposed baseline reconstruction. Introducing a new state to make a richer world is still allowed as an explicitly artistic/modeling extension, but it must be evaluated as that extension, not described as a discovery in the old archives.

## 4. Next falsifiable pass — archived chemical-input sufficiency

**One hypothesis:** the archived `chemical` arrays at production analysis times, existing sample/bounding arithmetic and 20 s EMA are sufficient to reproduce every archived `chemicalMemory` value. No reconstruction of intervening 60 Hz gaster deposits is required for this narrower recurrence question.

This is proposed, not executed here. It closes a specific explanatory gap before any conversion/bond/phase shadow. Its result would not select a material ontology.

### Why this is feasible with existing inputs

[`ant-morphology-replay.js`](../../scripts/ant-morphology-replay.js) captures exact `controller.field.values` and `trailPlateBirth.chemicalMemory` after `controller.tick` whenever the instrumented mask build occurs (capture at lines 145–154; array sources at lines 245–248). [`AntController.tick`](../../src/lib/agents/ant/AntController.js) deposits before calling birth analysis, then only samples pheromone for activation/recruitment. [`TrailPlateBirth.advance`](../../src/lib/agents/ant/TrailPlateBirth.js) updates memory at each analysis before building that mask. These facts make the saved chemical array a candidate exact input to the recorded update, subject to a clock/order audit.

The existing update is:

```text
sample[k] = production pheromone sampler at the production grid coordinates
b[k] = max(0, sample[k]) / (max(0, sample[k]) + 0.04)
alpha[k] = 1 - exp(-elapsedSeconds[k] / 20)
memory[k] = Float32(memory[k-1] + alpha[k] * (b[k] - memory[k-1]))
```

The first production update uses elapsed = 1 s even though the first recorded simulation time is 1/60 s. Rebuild production `simulationTimeMs` at each archived tick using the replay source's repeated fixed-`DT` additions, then compute elapsed from the millisecond difference exactly as `advance` does. Verify dividing that clock by 1,000 reproduces the saved `timeSeconds`. Directly subtracting saved seconds can introduce a floating-point difference from production arithmetic. Reuse the production updater/sampler; naive array indexing, regularized timestamps or double-precision storage can produce artificial differences. The equation documents the existing law, not a new parameter choice.

### Data, comparator and measurements

- Use only seeds `20261005`, `20261006`, `20261007`, their existing 599 snapshot descriptors each, XOR-delta packets, summaries, W1 input provenance and source hashes. Confirm every production memory update is represented before accepting recurrence completeness.
- Compare reconstructed memory against exact saved Float32 bytes for all 9,216 cells × 1,797 observations: 16,561,152 comparisons. Preserve the first frame, reconstructed millisecond-clock arithmetic, actual analysis intervals, sampler coordinates, saturation and assignment order. Clock reconstruction alone does not run ANT behavior or regenerate natural inputs.
- Report mismatched values/bytes, maximum absolute error, first differing seed/frame/cell, and mismatch distribution by timestamp; report q/active parity as a preservation check, not a material outcome.
- Use a small synthetic two-update fixture to verify initial elapsed, actual dt, sampling and Float32 storage. A shuffled-frame or omitted-update fixture must fail; this detects an accidentally insensitive check. Do not tune tolerances to obtain a pass.
- Compare against the existing unmodified recurrence only. Use causal prefixes and report each seed separately. No new formation law, new natural run, artificial run-end closure, interpolation or parameter sweep.

### Success, falsification and stop

**Support:** exact recurrence at all recorded updates after input/clock coverage is established. This would account for chemical-memory observations at analysis times without recovering the entire pheromone deposition path. It does not prove material state is unnecessary.

**Falsification of the sufficiency hypothesis:** the saved input/order does not cover a production update, or exact matched arithmetic leaves a reproducible mismatch. Diagnose sampling, update order, serialization and missing input first. If the needed input is unavailable, finish with a typed input gap rather than inventing it. A residual is not an independent material-process finding.

**Stop:** document that result and leave W1 ontology unresolved. If both field recurrences close, the next formation research must introduce an explicit modeled/measurement outcome capable of distinguishing A from one alternative. That is a later design/experiment decision, not automatic permission to implement B–D. A new natural simulation would need a separate proposal identifying the missing information and why these frozen archives cannot provide it; none is proposed as necessary now.

## 5. Implementation boundary and persistent world

- **Decided now:** the separation of observations/provenance from a claimed formation process; no ontology adoption; field-only explanatory null; one proposed input-sufficiency test.
- **Not implemented here:** recurrence audit tooling, a material contribution function, irreversible variable, phase regime, finite precursor, bonding law, geometry compiler or new character estimator. No new evidence package is created for an unexecuted pass.
- **Later shadow authorization:** one specified mechanism plus one discriminating prediction, tested against the preserved baseline. Parameters and output morphology cannot become hidden success targets.
- **Separate production authorization:** replacement/integration of `TrailPlateBirth`, stratigraphy or material/audio behavior. W2, vitality, feedback, audio, social coupling and runtime optimization remain gated. No merge, PR or force-push.

Formation, relaxation or retained state must remain defined when ants are absent. Current production running ticks decay fields and advance material systems outside the agent loop; this does not claim world updates while the controller is stopped. Agent disappearance is neither a birth trigger nor proof that formation is complete. Future material character must be traceable to the same history that caused its state change, with bounded influence; arbitrary stiffness/preset assignment and direct internal-state sonification remain outside this decision.

## Verification and limits of this investigation

- Fetched origin; checked clean starting worktree, starting HEAD, recent commits, current main and complete `src/` equality. Read main production call chains and branch evidence/design/daily records separately.
- Rehashed the 18 frozen-source/evidence references in the post-contact source ledger, including all three local snapshot archives, full summaries and committed contact archives. All recorded byte counts and SHA-256 values match. The large snapshot/summary originals are local ignored inputs, not all committed Git artifacts.
- Verified 321 package-owned/daily entries across nine W1 ledgers, plus the source references above: 338 distinct files, zero mismatches. Raw-field result paths are relative to its `results/` ledger; several older package paths are package-relative. The ledgers' declared exclusions remain exclusions. Fifteen external reproduction-source references in the original/post-contact package ledgers were outside this package-owned check; the three latest post-contact tooling/test references were then separately rehashed and matched. The twelve original external references are not asserted unchanged merely because a historical ledger names them. Production source equality and direct source inspection are separate checks.
- Evidence numeric results above are existing committed results, not rerun measurements. The post-contact audit's analyzed source HEAD is `eb520969fd88fb8c60deb6b46c96f7afd7dfff3f`; the raw-field audit's source HEAD is `aad8c30960a8b8511b855321ecc10450b55057b3`. Current synthesis HEAD does not replace those provenance identities.
- Independent Luna High reviews checked production/chronology and evidence claims; a Luna Max architecture review tested counterexamples and the proposed recurrence boundary. A fresh final document review is recorded in the daily entry after completion.
- No numerical audit, shadow prototype, natural simulation, playback or browser run occurred. Documentation/link/scope checks are appropriate to this document-only change; prior full-test counts belong to their historical evidence packages.

Process and final review are recorded in [the daily chronology](daily/2026-10-10-w1-material-formation-design-gate.md).
