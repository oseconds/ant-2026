# ANT — Plate, Deposit, and Material: a Retrospective Terminology Boundary

**Recorded:** 2026-10-11 (Asia/Seoul)  
**Kind:** conversation-derived conceptual clarification / historical design rationale  
**Status:** archived interpretation and working vocabulary, **not** an implemented Deposit model, an adopted W1 material ontology, a revised production birth rule, or a newly authorized roadmap  
**Production checked:** `main` at `52619c848391fe8e7cc26c2f18a38b227b2dfc3d`  
**Research context:** `ant-w1-episodic-material-shadow` (W1 unresolved)

## Why this distinction arose

The original artistic approach to sedimentation and circulation was **not** necessarily “continuous Material first, Plate merely an optional later export.” The project initially made the time of many individuals materially legible **by giving their accumulated histories Plate form and stacking those Plates along Z**. Older Plates remain part of a physical world that later Plates may cover or couple to.

The conversation returned to the intention expressed as **“개체가 모여 군집이 변화하며 환경이 흐른다”**: individual times shape collective/environmental conditions, and successive conditions leave layered history. The question is whether the *current Plate birth qualification* actually captures meaningful formation in that world, not whether the entire Plate/Z approach must be discarded.

A separate conceptual problem also emerged: using “Material” interchangeably for a material property, a single Plate, and the many-layer aggregate makes formation, character and world state difficult to reason about.

## Working vocabulary — distinct roles, without inventing new implementation

| Term | Working meaning | Boundary |
| --- | --- | --- |
| **Plate** | One identifiable, historically born **depositional layer** with a frozen birth descriptor; in production also a real modeled physical/vibrating unit. | More than a visual snapshot. Its frozen geometry/character does not freeze future exposure, burial, Z coupling or vibration. |
| **Deposit** *(provisional)* | A **composite accumulation of multiple Plates** through Z, potentially the present layered material body in a locality. | A naming distinction, **not yet** a separately tracked entity, identity, formation law or independent material response. A mere overlap does not prove a coherent body. |
| **Stratigraphy** | The organization and changing relationships of Plate layers: historical order, per-location stacking, overlap, exposure, burial/depth and coupling. | Relationship/lifecycle model, **not automatically identical to one Deposit**. Age alone does not imply burial. |
| **Material** | The broad subject of what materially forms, persists, responds, and what constitutes its properties or state. | **Its exact scope remains open to W1 evidence and experiments.** Do not prematurely require a separate continuous material field, a new object class, or equate Material with Deposit. |
| **Material Character** | Properties attributable to material formation history (possible compactness, anisotropy, damping, etc.). | Intrinsic material character is **not** the same variable as its consequences for an ant, which depend on current conditions and organism state. |

The words `Plate`, `Deposit`, and `Material` are deliberately not treated as three mandatory classes in code. `Deposit` is the currently favored *working term* for the layered aggregate; whether there is one Deposit, many spatially distinct Deposits, or only a relational stack remains an unanswered modeling question.

## What was actually implemented by this point

- `TrailPlateBirth` qualifies paths/corridors from persistent chemical/support evidence, source-annulus-to-boundary geometry, candidate similarity/persistence, and birth scheduling, then freezes a Plate descriptor.
- `MaterialStratigraphy.addPlate` retains each layer and updates per-cell bottom-to-top stacks, exposure/burial and relations when later overlapping Plates arrive.
- Layers participate in physical vibration/audio and modeled Z coupling. This means Plate is **not** merely an archival picture or render/export representation.
- **No independent `Deposit` identity or lifecycle** is implemented. Existing per-cell stacks, overlap and Z coupling demonstrate multi-layer relations, not a newly verified composite material ontology.
- A new W1 local material-formation law and material-character model have not been adopted. The present formation selection and property calculations do not by themselves establish causal consolidation or a novel material body.
- Material-to-organism behavior feedback and the full circulating-world loop remain future hypotheses.

## Questions deliberately left unresolved

1. **Formation vs Plate birth.** Does an event in the environment justify a new deposited layer? Are the existing source-to-boundary path, duration and refractory requirements formation evidence or primarily geometric/scheduling conventions?
2. **Material vs Plate.** Must a material state exist independently of Plate birth, or can some material organization be embodied directly in discrete layers? The early Z-stratification intent favors not pre-emptively discarding the latter.
3. **Plate vs Deposit.** When do multiple overlapping or coupled Plates warrant *one* composite identity? Does that aggregate exhibit an independently defined response beyond the per-Plate/coupling model? Do not infer cohesion merely from adjacency or overlap.
4. **Character vs consequence.** What properties originate in formation history, and what *separately modeled* present conditions and organism states mediate their effects? Avoid labeling material as intrinsically good/bad for ants.
5. **Chronology of experiments.** Distinguish environment/traces, formation, material character, Plate birth, Deposit/stratigraphic consequence, organism consequence and eventual feedback. This is a conceptual dependency map, **not a passed W1 gate or a mandated sequence of implementations**.

The design is allowed to learn that `Deposit` needs no persistent ID, or that `Material` does not need a separate storage layer. Neither outcome would erase the artistic role of historically born Z Plates. Equally, the existing production birth selector does not become a validated formation law just because a Plate is an actual modeled stratum.

## Relationship to the prior concept archive

This note **qualifies, rather than replaces**, [Individual time, material snapshots, and sedimentary circulation](2026-10-11-individual-time-and-sedimentary-circulation.md). In that note “snapshot” means an immutable *historical birth descriptor*. It must **not** be read as “Plate is only a passive representation.” The original Plate/Z stack was already intended to be the physical mechanism of sedimentary history.

## Sources, authority, and reading policy

- [Implemented ANT baseline](../README.md) and [`TrailPlateBirth`](../../../src/lib/agents/ant/TrailPlateBirth.js) / [`MaterialStratigraphy`](../../../src/lib/agents/ant/MaterialStratigraphy.js) — production implementation authority.
- [2026-10-06 stratigraphy runtime evidence](../evidence/2026-10-06-stratigraphy-runtime/README.md) — actual overlap/burial/Z/vibration behavior.
- [2026-10-08 morphology diagnosis](../evidence/2026-10-08-movement-material-morphology/README.md) — qualification and source-to-boundary geometry funnel.
- [Persistent-world contract](../world-model.md) — future artistic/system design, not implementation.
- [Material-mediated social dynamics](../material-mediated-social-dynamics.md) — distinguishes Plate character, current condition and organism consequence; future hypothesis.
- [W1 formation design gate (research branch)](https://github.com/oseconds/ant-2026/blob/ant-w1-episodic-material-shadow/docs/ant/w1-material-formation-design-gate.md) — formation, provenance and geometry separated; ontology unresolved.

**Archive policy:** this is a dated conceptual record, not current implementation truth or instructions to adopt a mechanism. For any later ANT work, check then-current `main` code, the hub, current evidence and daily chronology. Do not load this archive routinely into implementation agents.
