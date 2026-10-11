# ANT — Authored Formation Law and World-Model Clarification

**Date:** 2026-10-11  
**Status:** archived review synthesis / historical clarification  
**Source:** independent Astra review of current `main`, latest W1 research, selected evidence, daily logs and archive context  
**Production change:** none  
**Experiment rerun:** none

This document preserves the main conclusions that emerged from the 2026-10-11 independent review sequence around Dimensional Formation, W1 endogenous formation, and the larger ANT world model.

It is **not** the current implementation hub, an adopted production change, or a replacement for the latest W1 evidence. Its purpose is to record the reasoning boundary that was reached so later work does not have to reconstruct the same conceptual distinction from scratch.

Current implementation truth remains the actual repository code plus [the ANT hub](../README.md), current [evidence](../evidence/) and [daily chronology](../daily/). Future design remains separate in [world-model.md](../world-model.md).

At the time of review:

- remote `main`: `3d81b1f6b416c1e8827d00f3fb00569f1a475b06`
- W1 research reference: `a181898fb2cd46b394da0bcd80852b378e19b03f`
- production `src` / `static` were reported identical between those references
- stored evidence values were reviewed, not reproduced
- selected archive and daily documents were read for context; this was not a complete archive-wide historical audit

Related concept archives:

- [Individual time, material snapshots, and sedimentary circulation](2026-10-11-individual-time-and-sedimentary-circulation.md)
- [Plate, Deposit, and Material terminology boundary](2026-10-11-plate-deposit-material-boundary.md)
- [Dimensional Formation: influence, relations, and physical commitment](2026-10-11-dimensional-formation-influence-and-relations.md)

---

## 1. High-level conclusion

The most economical current description of ANT is:

> **a world where behavior modifies environmental memory, and some behavioral history is retained as physical layered configuration.**

ANT is not currently best described as:

- a system that has discovered a new material ontology,
- a closed material-mediated autonomous world,
- or a proven dimensional progression from point to line to surface to time.

The current system already contains real causal structure:

```text
movement / action
├─→ pheromone memory ─→ later movement / recruitment
│
└─→ gait / FOOT_CONTACT
      └─→ SurfaceField / contact history
              │
pheromone ────┴─→ current formation law
                    ↓
             retained Plate configuration
                    ↓
             stratigraphy / partition
                    ↓
              physical response
```

The missing link is not “formation” in the general sense. A formation rule already exists.

The larger unresolved design question is:

> **What should retained history change later?**

This moves the project-level question above the narrower W1 question of finding a new pre-Plate material state.

---

## 2. What the historical process clarified

The project history is better understood as repeated separation of responsibilities than as one hypothesis becoming progressively verified.

Important transitions included:

1. **contact → environmental memory → Plate**  
   Long-lived environmental memory and frozen Plate history were separated from immediate footstep sound.

2. **Plate → stratigraphy**  
   Immutable birth descriptors were separated from later mutable exposure, burial, depth and Z-coupling relationships.

3. **social topology → read-only baseline**  
   Proximity and temporal graph structure were observed and tested without promoting them to a new causal layer. The selected social predictors did not justify automatic escalation into social roles, spectral entities or social→material control.

4. **morphology experiments → limits of selector changes**  
   More branching, interior endpoints or different spatial grouping did not by themselves identify a better material law.

5. **local accretion / episode / spell / temporal linkage → W1 boundary**  
   Multiple ways to segment activity produced useful descriptions but did not independently identify a privileged material unit, extent or closure law.

6. **existing fields restored as the explanatory null**  
   SurfaceField persistence and archived chemical recurrence could be explained by already-implemented updates within their verified scope; persistence alone did not imply a latent new conversion process.

7. **Plate-native physicality re-established**  
   Existing Plate/Z structures are already physically interpreted by the implemented compiler/solver. The unresolved issue is not whether Plate is “real enough,” but how activity should choose retained configuration, extent, partition and repetition.

8. **Dimensional Formation reviewed as a conceptual framework**  
   C2, Influence, retained Relation and C1 helped separate responsibilities, but the current evidence did not require them as a sequence of new causal states.

The key historical caution is that rejected implementations do not automatically reject the larger hypothesis:

- social organization in general was not disproved;
- local formation in general was not disproved;
- repeated layering is not intrinsically a failure;
- a failed grouping rule is not evidence that all grouping is invalid.

The archive is useful here as historical context, not as current authority.

---

## 3. Minimal current causal ontology

The review found no need to add a new material ontology to explain current operation.

A minimal current model needs the following.

### Dynamic agent state

- position, velocity, heading and behavior clocks
- gait/body pose and contact generation state
- deposition/recruitment/activation-related state
- RNG or equivalent reproducibility state where required

### Environmental memory

- `PheromoneField`
- `SurfaceField`
- TrailPlateBirth's bounded chemical EMA

These already provide locality, persistence, decay/relaxation, saturation/history dependence and later causal influence.

### Formation-decision memory

- accumulated foot-contact counts
- current candidate and persistence time
- prior-corridor repeat records and contact baselines
- analysis/birth clocks

These are causal because they alter whether a later birth occurs, but they do not need to be called material state.

### Retained physical configuration

- ordered immutable Plate descriptors
- existing retained nodule descriptors
- body partition, geometry and material coefficients that affect physical compilation

### Physical dynamic state

- displacement/history
- pulse/recovery state
- sleep/wake and pending state
- nodule vibration state
- topology installation/version state where required for execution

### Derived state

- stack
- exposure
- burial
- depth
- compiled in-layer and Z topology
- current proximity/social summaries

Derived state can be physically meaningful without requiring a duplicate ontology.

### Provenance / observation

- contributor identity
- contribution times
- descriptive metrics
- social observer windows/components

These are useful for attribution and analysis but should not be promoted into material identity without an explicit law.

---

## 4. Current world laws already present

The review distinguishes implementation facts, authored modeling choices, evidence and future design.

### Implemented

- movement deposits pheromone;
- pheromone affects later movement and recruitment/activation;
- actual gait produces `FOOT_CONTACT`;
- `FOOT_CONTACT` modifies the slowly relaxing `SurfaceField`;
- current chemical/mechanical history can satisfy TrailPlateBirth qualification;
- accepted Plate descriptors remain after the activity/qualification that produced them disappears;
- later overlap changes exposure, burial, depth and vertical relationship;
- physical compilation makes Plate partition and layer order consequential;
- direct contact/excitation and existing material state affect physical response;
- existing nodule qualification provides a limited separate material-conditioned path.

Thus ANT already contains environmental feedback through pheromone.

What it does **not** yet contain as a general mechanism is material history feeding back into:

- later ant locomotion/behavior, or
- later TrailPlateBirth formation decisions.

### Evidence-supported within limited scope

Stored evidence supports, among other bounded claims:

- existing SurfaceField update reproducing the audited retained field;
- archive-internal chemical recurrence consistency under the recorded limitations;
- locality of the five audited repeat births;
- supplied-layer Z coupling accounting for a controlled response difference in the specified rest fixture.

These do not establish a new C2 state or a general retained-relation law.

### Authored modeling choices

The current corridor-to-Plate rule is authored. Its spatial and temporal conventions are part of the current model even when they originated as engineering/modeling choices.

### Future design

The persistent circulating world, material→organism feedback, acoustic-climate feedback, and additional relation/character laws remain future or conditional architecture, not current implementation.

---

## 5. TrailPlateBirth as the current authored formation law

The review supports treating current `TrailPlateBirth` as the current ANT corridor-to-Plate formation law.

This does **not** mean the archives empirically discovered a unique or natural material law.

It means:

> ANT currently uses this rule to decide when and how environmental history becomes retained Plate configuration.

The law includes more than field thresholds. Causal commitments include:

- chemical/support qualification and sampling
- source annulus
- observation-boundary eligibility
- component/candidate selection
- shortest/path-network selection
- ribbon construction and width clamp
- analysis clock
- candidate persistence
- corridor similarity
- global birth gap
- repeat matching
- refractory period
- required additional contact count
- one selected result → one Plate partition
- birth-time material parameter generation

If changing a convention changes which Plate is born, when it is born, its footprint, partition or solver coefficients, that convention participates in the current model.

This does not make every implementation detail a natural law. Data structures, cache strategy, logging, naming and explicitly technical capacity ceilings should remain distinguished from material semantics.

The W1 conclusion and this authored-law interpretation are compatible:

- **implementation fact:** ANT already has an endogenous computational Plate birth rule;
- **design choice:** that current rule may be accepted as the baseline world law;
- **research claim:** existing evidence does not uniquely select that law over all alternatives.

The third claim remains unsupported.

---

## 6. C1 — Structural Commitment

C1 remains useful if it is redefined as a boundary of responsibility rather than a new substance or force.

Recommended operational definition:

> **C1 is the transition at which a formation decision is accepted as retained world configuration such that geometry, body partition, material parameters and layer order constrain later possible physical interaction.**

The review separates:

```text
formation decision
→ descriptor generation
→ persistent-world acceptance
→ physical topology compilation
→ active solver installation
```

These responsibilities are not identical.

In current code terms:

- `TrailPlateBirth.advance` performs qualification/selection/time/repeat decisions;
- descriptor creation/freezing produces an immutable formation result;
- `MaterialStratigraphy.addPlate` is the world-level acceptance into retained layers/stacks;
- `compileSurfaceTopology` / bridge synchronization provide physical interpretation;
- worklet topology installation realizes that topology in the active solver.

Therefore:

- generating an ID is not C1;
- writing provenance is not C1;
- drawing/exporting a candidate is not C1;
- emitting a `plate-birth` event alone is not proof of world acceptance;
- active audio output is not required for material existence.

C1 is valuable because it marks where ephemeral eligibility becomes retained physical obligation.

It does not need a new class or stored C1 state.

---

## 7. C2, Influence and retained material relation

These concepts do not currently deserve equal causal status.

### C2 — Local Formation

Current status: **PARK**

If C2 merely renames persistent local field state, it adds no independent causal content.

A separate C2 becomes justified only if it has:

- independently identifiable state/configuration,
- explicit creation/change/loss rules,
- and later consequences not already explained by the complete existing state.

No such necessity is established by current evidence.

### Influence

Current status: **REDEFINE**

“Influence” is useful as relational language:

> some existing state changes a later condition or result.

It should name the actual mediator—pheromone, SurfaceField, candidate history, stack, topology, etc.—rather than become another field/state by default.

### Retained Material Relation

Current status: **PARK as a new law**

Existing in-layer and Z connections are already retained physical relationships.

A **new** retained relation would need history-dependent creation/maintenance/change that is not already determined by the complete current state.

A minimal future counterfactual would require:

```text
same existing sufficient state X
same future input U
different retained relation history R
→ different later relation or physical result
```

If the initial link/partition/coefficients are already different, the current null explains the difference.

If relation history can be derived from existing retained records, a new **transition law** may be needed without a new stored ontology.

No current W1 evidence requires this additional mechanism.

---

## 8. Dimensional Formation after review

Dimensional Formation is better retained as descriptive/artistic grammar than as the current causal theory.

The sequence

```text
point → line → surface → stratification → time
```

mixes different categories:

- event/location/local state
- trajectory/history/relation/coupling
- geometry/body identity
- ordering/layer relationship
- time, which is already present throughout

Therefore the review places Dimensional Formation primarily in:

- **useful descriptive/modeling grammar**
- **artistic metaphor**

rather than:

- a required ontological progression
- a proven new material state machine
- a mandatory development roadmap

The concept can survive by describing how traces of activity become spatially and materially organized without requiring each visual “dimension” to be a distinct causal substance.

---

## 9. Shift in the project-level research question

The strongest outcome of the review is a change in question hierarchy.

Earlier W1 framing concentrated on:

> How should material form?

The larger project framing is now better stated as:

1. **What history does the world retain, and what does it forget after current activity disappears?**
2. **What later physical consequences differ because that history was retained?**
3. **Must retained material history eventually alter organism behavior, or is a physically responsive historical world sufficient for the work?**

Formation remains important, but it is a subproblem of historical retention and consequence.

This prevents repeatedly inventing new pre-Plate ontology when current retention, stratigraphy and response may already be the more important artistic/systemic structure.

---

## 10. Current concept disposition

This is a review recommendation, not a repository-state mutation.

| Concept | Recommended status | Reason |
| --- | --- | --- |
| PheromoneField | KEEP | Real shared memory and behavior input |
| SurfaceField | KEEP | Real slow contact-derived environmental state |
| FOOT_CONTACT | KEEP | Real event connecting gait, memory, formation records and excitation |
| TrailPlateBirth | KEEP | Current authored corridor-to-Plate formation law |
| Plate | KEEP | Retained physical configuration / partition unit |
| MaterialStratigraphy | KEEP | Ordered layers and current relationships |
| C1 Structural Commitment | REDEFINE | Acceptance/physical-interpretation boundary, not new state |
| C2 Local Formation | PARK | No independent necessity established |
| Influence | REDEFINE | Language for an identified existing causal mediator |
| Retained Material Relation | PARK | Existing Z/internal relationships remain; new relation law unsupported |
| Individual Formation | ARCHIVE | Provenance distinction, not separate constitutive law |
| Shared Formation | ARCHIVE | Multiple contributors can remain provenance under one law |
| Dimensional Formation | REDEFINE | Descriptive/artistic grammar rather than required causal ontology |
| DynamicSocialGraph | PARK | Valid read-only baseline; not current causal generator |
| TemporalSocialTopology | PARK | Useful observation history; no automatic spectral escalation |
| Persistent World | REDEFINE | Separate current run-local retention from future closed circulation |
| material-mediated social dynamics | PARK | Requires several unimplemented links |
| W1 | REDEFINE | Boundary/formation-law selection research, not proof that a new ontology is required |
| W2+ roadmap | PARK / conditional | Future sequence, not automatically unlocked |
| Deposit | REDEFINE | Useful layered aggregate description; independent identity not required |
| Material Character | REDEFINE | Separate current physical coefficients, history summaries and future constitutive claims |

`ARCHIVE` here means “not required as an active causal category,” not “false” or “delete the record.”

---

## 11. Complexity risks identified by the review

The largest risk is allowing the urge to name a phenomenon to outrun the need to explain a missing responsibility.

Specific risks:

- turning observation language into causal entities;
- turning repeated proximity into relationship;
- turning historical connectivity into present cohesion;
- turning observer lineage/component identity into material body identity;
- adding a new state before identifying a result the old state cannot explain;
- storing the same responsibility as field memory, C2, influence state and formation state;
- counting birth, C1 and compilation as separate physical transformations when they are responsibility boundaries of one retained configuration;
- using attractive morphology as evidence that a law was discovered;
- hiding source/boundary/path heuristics while presenting the result as natural law;
- confusing representation or batching changes with physical discovery;
- treating technical ceilings as physical saturation laws.

The opposite risk is also important:

> ANT is an authored artistic system, not only a natural-science model.

Failure to empirically “discover” a world law does not forbid choosing one.

The useful distinction is between arbitrary tuning and principled artistic modeling.

---

## 12. Principled artistic modeling boundary

The review recommends the following criteria for future authored world laws.

1. **State the desired property of the world before selecting the morphology.**  
   For example: locality, repeated sedimentation, long retention, spatial novelty, bounded influence.

2. **State the causal commitment and accept its costs.**  
   The same law should also own undesirable outputs unless the law itself is revised.

3. **Declare invariances and exceptions.**  
   Observer batching, display mode and irrelevant provenance should not alter material results unless explicitly part of the law. Grid/clock/spatial conventions should be disclosed when they matter.

4. **Define predictions and failure conditions before judging the result.**  
   A singleton or a giant connected structure is not automatically a failure unless it violates the declared world property.

5. **Change one causal commitment at a time.**  
   Distinguish implementation conformance, model difference, empirical support and artistic satisfaction.

This allows authored rules without misrepresenting them as discoveries.

---

## 13. Recommended next-order logic

Within the formation problem alone, the previous recommendation remained:

```text
A → B → C
```

where:

- **A:** accept the current TrailPlateBirth rule as authored baseline;
- **B:** design one narrow alternative only when one current commitment is explicitly rejected;
- **C:** add C2/new retained relation only when a new effect actually requires it.

At the project level the ordering becomes:

```text
D → A → (B only if needed) → C only if independently motivated
```

where **D** is the higher-level design decision:

> What should retained history change later?

A suggested sequence from the review was:

1. decide whether the next target is physical consequence only or organism-condition feedback;
2. document the current formation law and C1 boundary as baseline;
3. optionally close a narrow existing physical runtime contract if it is actually needed;
4. only then design one alternative formation commitment if a specific conflict has been identified.

No new relation/C2 ontology is required by default.

---

## 14. Current causal structure after clarification

A compact current model is:

```text
agent state / movement
    ├─→ pheromone
    │     └─→ later movement / activation / recruitment
    │
    └─→ gait / FOOT_CONTACT
           └─→ SurfaceField / contact history

pheromone + SurfaceField + formation-decision history
    └─→ authored corridor-to-Plate formation law
           └─→ retained Plate configuration
                  └─→ stratigraphy / partition / topology
                         └─→ physical vibration / sound

social graph / provenance
    └─→ observation only
```

Not currently present as general causal arrows:

```text
Plate / vibration ─X→ later ant behavior

current Plate stack ─X→ TrailPlateBirth formation decision
```

Those arrows would be new world laws, not clarifications of the existing system.

---

## 15. Design question left open

The review converged on one project-level question that should be answered before adding more material ontology:

> **Is ANT complete in its intended core if retained history changes later physical response, or must retained material history also change the conditions experienced by living ants?**

A related but separate future question is whether retained material structure should influence later material formation.

These should not be merged automatically.

---

## Archive status

This document records the 2026-10-11 review synthesis only.

It does **not**:

- change production behavior;
- select a new W1 formation mechanism;
- add C2;
- add a retained-relation system;
- implement material→organism feedback;
- declare Dimensional Formation a verified causal theory;
- modify the current roadmap;
- claim that archived evidence was rerun.

If these conclusions are later adopted into current project policy, they should be reflected separately in the canonical ANT hub / current research documents rather than treating this archive file as the active source of truth.
