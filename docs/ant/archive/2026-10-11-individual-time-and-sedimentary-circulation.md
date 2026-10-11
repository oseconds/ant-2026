# ANT — Individual Time, Material Snapshots, and Sedimentary Circulation

**Recorded:** 2026-10-11 (Asia/Seoul)  
**Kind:** retrospective conceptual clarification from the ANT_2026 design conversation  
**Status:** archive / interpretive reference only — **not** a production change, adopted W1 mechanism, experimental result, or new implementation roadmap  
**Production reference:** `main` at `a78249fc02fb7990568d62709e9a087489fe632b`  
**Research context:** `ant-w1-episodic-material-shadow`, loading/constitutive correction `f543531d8e32d5b1479311c31e3605b39ae9e5c8`

## The intention recovered

ANT was not conceived as a mechanically faithful simulation of soil, nor as a machine that turns each ant's traveled path directly into a thicker permanent road.

The intended work is a persistent, circulating world:

> The times of individual ants accumulate and intersect through their shared environment; some interactions become new material organization. Historical configurations can be retained as layers, while the present world continues to change, vibrate, accumulate, bury, and condition subsequent activity.

The ant colony is not a higher-level controller issuing a destination or a global reward. Collective organization is a possible consequence of individual trajectories and environmental mediation. An ant's effect may meet another ant's effect at a different time through the shared world; direct interpersonal/social-graph edges are not a required material cause.

This is an **artistic/system-design interpretation**. It does not assert that the current recorded ants have already formed an independently identified new W1 material state.

## What “fixed” means

A Plate's immutable descriptor is a **snapshot of a formation event or historical configuration**, not a rule that the spatial region must remain physically unchanged forever.

Distinguish three things:

1. **Historical record:** the Plate's birth, identity, frozen geometry, and declared material properties remain attributable to a particular past.
2. **Present world state:** later Plates may overlap, change which material is exposed, bury older layers, and change coupling relationships. Physical vibration/energy may evolve within and between layers.
3. **Possible future reorganization:** a later constitutive/material mechanism might alter local organization or formation conditions, but such long-term rewriting is neither implied by a snapshot nor implemented merely by storing Plate history.

A historical snapshot preserves *what existed at a moment*; it does not freeze the entire current world at that location.

In the implemented stratigraphy, **age is not depth**: burial comes from later spatial overlap, not elapsed time by itself. An older Plate may remain exposed where nothing subsequently covers it. The archive therefore should not be read as mandating automatic burial, endless material growth, or permanent occupation of every previously visited cell.

## One conceptual cycle, not yet a closed production loop

```text
individual activity at different times
       ↓
chemical / mechanical traces in shared environment
       ↓
local interaction and organization of those traces
       ↓
possible material formation or configuration change
       ↓
snapshot / historical provenance / Plate compilation
       ↓
stratigraphy: overlap, exposure, burial, coupling
       ↓
present material and vibration conditions
       ↓
possible consequences for later agents and formation
       ↺
```

This is a **target conceptual cycle**, not a claim of an implemented feedback loop. In particular, the key transition from traces to an independent, persistent local organization remains a W1 research gap. “Snapshot” and “Plate compilation” name representation/recording boundaries; they are not themselves proof that a material transformation occurred.

The cycle combines different timescales:

- **Individual time:** contact, movement, pauses, emergence and disappearance of ants.
- **Formation time:** activity at different moments changes shared local conditions and may organize them into persistent structures.
- **World time:** historical material configurations accumulate, change exposure, exchange vibrational energy, and may influence the conditions of later events.

The desirable phenomenon is not simply `high cumulative evidence → permanent occupied cell`. Neither is it necessarily `episode ended → material was born`. Local formation, if a causal formation law is introduced, could occur while an activity lineage is still active. The historical episode would then help explain provenance, not automatically define material identity or geometry.

## Boundaries supported by code and evidence

**Implemented on the cited `main` baseline:**

- Equal agents, pheromone, six-leg `FOOT_CONTACT`, and contact-derived `SurfaceField`.
- `TrailPlateBirth`: path/corridor-based qualification and immutable Plate descriptors.
- `MaterialStratigraphy`: accumulated Plate records and derived exposure, overlap, burial, depth, and buried-structure relationships.
- Physical Plate vibration and modeled Z-layer coupling; buried structures can be excited indirectly. The vibration state changes even while descriptor geometry is fixed.
- Material history persists within a run, but vibration is a shorter-lived state. Audio/runtime limitations remain documented.

**Not established or not implemented as the proposed W1/world cycle:**

- A new independent local W1 formation/conversion or retained relation that distinguishes actual material contribution from chemical/surface memory.
- Formation by cross-time relationships as a verified causal law; activity connectivity alone is not cohesion.
- Long-term in-place rewriting of frozen Plate material character or geometry.
- Material conditions feeding back into ant locomotion, or physical vibration/acoustic climate feeding back into the colony as a closed loop.
- Physical foot loading, strain, force, or plasticity inferred from `FOOT_CONTACT.strength`. The displacement-controlled retained-reference `p` witness is a separate mathematical example, **not** an adopted ANT loading or material-birth mechanism.

Earlier W1 negative/mixed results remain informative: the selected-path production geometry is source/boundary constrained; direct local accretion tended toward late dense filling; whole-episode closure could leave an enormous active lineage while producing tiny frozen remnants; per-cell completion was mostly singleton; retrospective temporal connectivity formed giant historical components without defining material cohesion. These observations do not select a new formation law or prescribe a preferred shape.

## Principles worth retaining, without prematurely selecting a mechanism

- **Individual → collective → environmental:** locally mediated, potentially asynchronous relationships rather than authored collective objectives.
- **Formation is not a picture of memory:** accumulated field values and connectivity may be inputs or provenance, but material organization needs a separately declared causal process if claimed.
- **History is durable; the present is not static:** freeze attributable records, not all subsequent local possibilities.
- **Layering is relational:** a later layer can change an earlier one's present role without erasing its formation snapshot.
- **Material and sound belong to the same world:** eventual audible differences should arise through modeled material/vibration conditions, not arbitrary direct sonification of ant state.
- **Open outcomes:** paths, branches, islands, networks, fossils and dense masses should be observations, not mandatory target shapes or thresholds to tune toward.
- **Bounded influence:** neither one agent, one episode, nor a persistent layer should become an unlimited hidden global controller.

## Open question carried forward

> When traces from different individual times interact through the shared environment, what *local state transition or retained relationship* makes a new material organization possible, and how can its later consequences be distinguished from a relabeled trace?

This archive deliberately leaves that question open. It records the **original artistic direction and the clarified meaning of snapshots/sedimentation**, not permission to implement a new W1 mechanism, bypass its evidence gate, or proceed to W2.

## Sources and authority

- [Current `main` architecture and implemented/material boundary](../README.md) — authoritative over this archive for implementation facts.
- [Persistent-world conceptual contract](../world-model.md) — future design, not implementation evidence.
- [Stratigraphy/runtime evidence, 2026-10-06](../evidence/2026-10-06-stratigraphy-runtime/README.md) — immutable descriptors with dynamic exposure/burial, coupling, and vibration.
- [Local-accretion decision, 2026-10-08](../daily/2026-10-08-local-accretion-shadow-decision.md) — negative/mixed accumulated-material morphology.
- [W1 design gate on research branch, 2026-10-10](https://github.com/oseconds/ant-2026/blob/ant-w1-episodic-material-shadow/docs/ant/w1-material-formation-design-gate.md) — formation dynamics, provenance, and compilation separated; W1 undecided.
- [W1 response/loading correction on research branch, 2026-10-11](https://github.com/oseconds/ant-2026/blob/f543531d8e32d5b1479311c31e3605b39ae9e5c8/docs/ant/w1-material-response-discrimination-design.md) — `p` is a standalone mathematical witness, not an ANT mechanism.

**Reading rule:** this is an archived retrospective conversation-derived concept note. For later engineering decisions, reread the latest `main` code, `docs/ant/README.md`, current research evidence/daily chronology, and the active W1 gate before proposing a pass. Archive text never overrides newer evidence or decisions.
