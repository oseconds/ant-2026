# ANT — Persistent World Design Contract

**Status:** design contract / not production implementation  
**Date:** 2026-10-08

This document defines the current conceptual target for ANT. It is intentionally separate from the verified implementation state in [`docs/ant/README.md`](./README.md).

The central shift is:

> **ANT is not a task-solving agent simulation. It is a persistent world in which agents, memories, materials and vibrations become conditions for one another.**

No part of this document implies that all proposed feedback links already exist.

## Core idea

ANT does not require a prescribed destination, food target, global reward, pathfinding objective or authored narrative goal.

```text
not:
agent → goal → optimal action

but:
agent state
+ environmental state
+ accumulated history
→ next local action / condition
```

A future ant may carry internal state such as vitality, but that state regulates possibilities and consequences rather than encoding a destination to optimize.

The viewer remains outside the world and may ask:

> Where is this ant going?  
> Why did it stop here?  
> Why did this material form?  
> Why does the world sound like this now?

The world does not need to contain a single authored answer. Meaning is observational and relational rather than a hidden reward function.

## Persistent world

The world is not created by the current presence of ants.

Agents may appear and disappear while slower layers continue according to their own state and timescale.

```text
ants may reach zero

pheromone        may decay
material         may remain
stratigraphy     may remain
vibration        may decay / propagate
acoustic climate may drift
world state      continues
```

A new ant therefore does not enter a reset simulation. It enters a world that may already contain history.

```text
new ant ≠ new world

new ant
enters an already existing world
```

Nothing is required to happen merely to keep the simulation interesting.

> **Things happen because the current conditions allow them to happen.**

Periods with little visible activity are valid world states.

## Multiple timescales

The target world contains processes with different characteristic times.

```text
FAST
gait / collision / contact

MEDIUM
movement / pheromone / internal state

SLOW
material formation / stratigraphy

VERY SLOW
world resonance / acoustic climate / environmental drift
```

Removing one fast process temporarily should not imply that all slower layers stop existing.

## Target circulation

The long-term conceptual loop is:

```text
                    INTERNAL STATE
                       vitality
                          ↓
                        ACTION
             movement / hesitation / gait
                          ↓
              CHEMICAL + MECHANICAL TRACE
                          ↓
                ENVIRONMENTAL MEMORY
                          ↓
               MATERIAL CRYSTALLIZATION
                    + CHARACTER
                          ↓
            STRATIGRAPHY / MATERIAL STATE
                     ↙             ↘
          locomotion condition    vibration
                  ↓               ↙      ↘
             internal state   audible   acoustic
                              world     climate
                              sound        ↓
                                  shared world/colony
                                       condition
                                          ↓
                                        action
```

This is a target architecture. Only parts of it exist in production today.

## Current production facts

Implemented now:

```text
movement
→ pheromone
→ gait / FOOT_CONTACT
→ SurfaceField
→ TrailPlateBirth
→ MaterialStratigraphy
→ physical Plate vibration
→ audible sound
```

Also implemented separately:

```text
current/recent proximity
→ DynamicSocialGraph
→ TemporalSocialTopology
(read-only)
```

Not currently implemented as production feedback:

- vitality or another explicit organism-level internal state
- episodic crystallization based on history transitions
- history-derived variable material character at birth
- material/depth → locomotion feedback
- physical vibration → acoustic-climate feedback
- acoustic climate → colony or individual behavior
- a persistent-world closed circulation

The current production `TrailPlateBirth` remains the source→boundary selected-path mechanism until a separate production-adoption pass says otherwise.

The optional Base Substrate implementation remains default Off and its calibration evidence is preserved. The target world model no longer assumes a separate always-present "base plate" that emits a direct sound for every foot event.

## Why the material model is changing

Two morphology experiments exposed opposite failure modes.

### Selected-path production

The current selector compresses persistent chemical/mechanical history into deterministic source→boundary path families.

This gives readable arterial material, but strongly constrains topology toward rooted path/tree-like forms.

The rejected interior-endpoint production candidate increased branches and births while also increasing prior-union overlap and reducing new area per birth. It demonstrated richer branching but not better sustained material novelty.

### Absolute local-accretion shadow

The branch `ant-local-accretion-shadow` removed path selection and froze locally mature cells directly from cumulative chemical/mechanical evidence.

That shadow retained broader topology early and reduced repeated-cell freezing, but by the late run all three seeds converged toward a dense fan-shaped mass. At the final observation the largest component contained more than 99% of local material and most surviving holes/islands were tiny.

This shadow is not production. It is retained as a negative/mixed comparison showing that:

> removing path selection is not sufficient if absolute accumulated state is still translated directly into permanent material.

The next formation hypothesis should therefore examine **history transitions**, not only high accumulated values.

## Material formation principle

**2026-10-10 design gate:** the episode-based proposal below remains a historical working hypothesis, not an adopted formation requirement. The [material formation design decision](w1-material-formation-design-gate.md) keeps the new W1 ontology **Undecided / Research Gap** and separates formation dynamics, provenance and object compilation. A future local state change may occur during a living episode; activity closure/connectivity alone does not identify it. This clarifies the hypothesis without changing the persistent-world contract or production material.

A future material mechanism should move conceptually from:

```text
high accumulated state
→ material
```

toward:

```text
recent change
relative to established history
→ coherent material episode
→ freeze
```

Working name: **episodic crystallization**.

The desired unit is neither:

- one-cell-per-sample maturation batches, nor
- one globally selected source→boundary path,

but a spatially coherent, temporally related **material episode**.

Artery, fan, braid, loop, island, fossil and palimpsest are possible observational morphology classes. They are not generation templates or hard-coded targets.

Material geometry and future acoustic topology remain separate concerns. A material shape may have arbitrary geometry even if a later audio compiler derives a simpler solver graph.

## Material character principle

A material episode should eventually be able to inherit a **character from its formation history**.

Do not assign fixed moral or categorical types such as good/bad, safe/dangerous, type A/type B.

Prefer bounded continuous properties such as, conceptually:

- compactness
- porosity / roughness
- directionality / anisotropy
- stiffness
- damping
- resonance tendency

These are candidate dimensions, not adopted production parameters.

The key rule is:

```text
formation history
→ material character

not:
random character preset
→ material
```

Different histories may produce similar characters, and similar histories may produce only small differences. Diversity itself is not an optimization target.

The purpose is only to prevent meaningful formation differences from being erased when material is born.

A future material descriptor may therefore contain:

```text
geometry
+ provenance
+ bounded material character
```

The same material character may have both acoustic and environmental consequences without directly mapping behavior to sound.

## Organism principle

A future ant should have **state without a prescribed destination**.

The first candidate state is `vitality`, but this name does not imply a hidden score that must be maximized.

Conceptually:

```text
movement / effort / environmental condition
→ cost

rest / recovery conditions
→ recovery

internal state
→ small changes in movement dynamics
```

The intended role is self-maintenance / state regulation, not navigation to a target.

Do not introduce a global reward function merely to make behavior appear purposeful.

## Feedback principle

Feedback changes **conditions of action**, not commanded actions.

Prefer:

```text
material state
→ local locomotion consequence
→ changed trajectory as an emergent result
```

over:

```text
material state
→ explicit target avoidance
→ prescribed detour
```

Likewise, sound/vibration feedback should not provide heading vectors or target coordinates.

A feedback link is useful only if the system can continue producing new states without collapsing immediately into one fixed attractor, runaway reinforcement or featureless randomness.

## World as sounding body

The target concept is not:

```text
every ant step
→ a base-platform sound
```

Instead:

```text
activity
→ changes the world
→ changes material / vibration conditions
→ the current world becomes audible
```

> **The world itself is the primary sounding body.**

FOOT_CONTACT can remain an important physical cause without every contact needing a one-to-one audible event.

Localized material structures may have distinct resonant responses, but they exist inside the same world rather than as a stack of unrelated instruments.

This reframes sound from an event effect into a phenomenon of world state.

## Acoustic climate

Sound is not required to remain a terminal output.

The long-term model may derive a slow shared **acoustic climate** from physical world vibration.

Critical boundary:

```text
physical vibration state
├─→ render / mix / limiter / speakers
└─→ slow acoustic-climate state → world
```

Do **not** feed master output RMS, user volume, limiter output or PA gain back into world dynamics.

The feedback signal must come from a stable pre-master physical/world state so playback gain does not change the simulated ecology.

If introduced later, acoustic climate should initially be:

- slow relative to the audio waveform
- shared rather than a direct per-ant control signal
- derived from physical material/world vibration
- connected to only one small organism/colony tendency in the first test

Possible future effects include weak changes in arousal, hesitation, recovery or movement persistence.

The sign and strength must be tested rather than chosen to manufacture a desired morphology.

Internal state is not directly sonified in production.

Avoid:

```text
vitality → pitch
vitality → volume
vitality → filter cutoff
```

Prefer:

```text
internal state
→ action
→ world/material consequence
→ vibration
→ audible world
```

Diagnostic sonification is allowed only as explicitly labeled tooling.

## Finite influence principle

Exceptional states are allowed.

A rare ant trajectory, unusual material episode, high stiffness, long resonance or deep local history may strongly affect its surroundings.

But:

> **No entity is larger than the world.**

```text
strong      ≠ infinite
rare        ≠ globally dominant forever
persistent  ≠ unlimited influence
```

Future mechanisms should therefore keep influence finite through one or more of:

- bounded state ranges
- spatial locality
- attenuation with distance
- damping / decay
- burial / occlusion
- turnover
- finite energy or finite coupling
- slow bounded global aggregation for climate-like variables

A global/shared variable such as acoustic climate may exist, but its response and influence must still be bounded.

This is not a requirement that all states become average or harmless. Strong events may occur. They must remain world-internal finite events rather than hidden global controllers.

## Social layer

The S0–S2c social observation remains parked and read-only.

The persistent-world model does not require a social graph to close the environmental loop.

If explicit relationship, partner memory or social preference is introduced later, it is a new mechanism and must be compared against the frozen no-relationship baseline.

## Design invariants

Future ANT passes should preserve these rules unless an explicit architecture review changes them:

1. **Persistent world.** Agent presence is not the existence condition of the world; zero-ant intervals are valid.
2. **No prescribed destination by default.** Do not add food targets, waypoint objectives, global rewards or pathfinding merely to create apparent purpose.
3. **State, not command.** Internal/environmental variables alter local conditions and propensities, not explicit desired routes.
4. **Material records history without being only an archive.** It may later condition future activity.
5. **Material character comes from formation history.** Do not assign arbitrary personality presets merely for variety.
6. **The world is the sounding body.** Do not assume every contact needs a direct audible event.
7. **No direct internal-state sonification in production.**
8. **No master-output feedback.** World feedback derives from pre-master physical state.
9. **Sound does not directly steer individual ants.** Any first acoustic feedback is slow/shared and mediated by world/organism state.
10. **Finite influence.** Exceptional entities are allowed, but every influence is bounded in magnitude, space, time, energy or coupling.
11. **One new causal link per pass.** Avoid adding vitality, material feedback and acoustic feedback simultaneously.
12. **Preserve negative baselines.** Current production, rejected interior-endpoint candidate, local-accretion shadow and S0–S2c social baseline remain comparison points.
13. **Do not tune to desired pictures.** Morphology classes are observations, not objectives.
14. **Separate evidence from interpretation.** Measured dynamics support implementation claims; concepts such as vitality, climate, fossil, character or world remain modeling/artistic interpretations unless separately researched.

## Planned passes

```text
W0  PERSISTENT-WORLD CONTRACT                    COMPLETE

W1  episodic crystallization + 2D material-character shadow  SPLIT SHADOW MIXED / ONTOLOGY UNRESOLVED
    derive coherent material episodes from history transitions
    and test bounded consolidation and directional-order axes

W2  material-conditions shadow
    derive potential local consequences from material conditions
    without feeding them back into movement

W3  vitality shadow
    derive movement- and environmental-condition cost/recovery
    without behavior feedback

W4  weak vitality/material → movement feedback
    test one weak, bounded vitality/material consequence on movement

W5  sounding-world / acoustic-climate shadow
    derive slow shared state from pre-master physical vibration

W6  weak acoustic-climate feedback
    connect one shared state to one organism/colony tendency

W7  persistent-world integration
    only after each causal link is independently stable and interpretable
```

Each stage is separately authorized, measured and reversible.

A successful stage is not one that merely looks more alive or more varied. It adds a clear causal relation while preserving enough openness for multiple future states to remain possible.

## Current next step

**Latest decision:** [W1 Material Formation Design Gate](w1-material-formation-design-gate.md), 2026-10-10 — **Undecided / Research Gap**. Existing fields are the explanatory null for their observed evolution. The archived chemical-input sufficiency preflight validated archive descriptors and update-clock coverage, but stopped before recurrence because the recorded replay-runner SHA-256 does not match the available runner. Sufficiency is inconclusive; no recurrence match/mismatch result or material claim follows. No new material state or production mechanism is adopted. The completed shadow history below remains evidence, not an implementation instruction.

**W1 analysis is complete; viable coherent material ontology remains unresolved.**

Material ontology precedes vitality so that future vitality can respond to properties of the actual world. This pass remains a shadow: no production material or behavior changes, and no feedback or audio mapping.

Test two bounded, continuous axes derived from formation history:

- consolidation [0, 1], from repeated, consistent chemical/mechanical evidence during formation
- directional order [0, 1], from actual nematic movement/contact directions

Do not prescribe a fixed class, artificial distribution, or mapping to feedback, audio, or stiffness.

The [first W1 shadow evidence](evidence/2026-10-08-w1-episodic-material-shadow/README.md) preserves its 82.017 s attribution stop. The later [causal-attribution continuation](evidence/2026-10-08-w1-causal-character-attribution/README.md) completes the same three frozen histories through 599.25 s. The user authorized one directional-window revision: actual same-cell contacts from recorded run start through episode closure, matching cumulative contact evidence. Crystallization and consolidation remain exact. All 328 closures have two bounded coordinates, but cumulative directional history can include contacts roughly 530 s before admission and can be reused by overlapping episodes; it is not exact causal attribution of field state or recent flow.

The morphology result remains negative: most completed episodes are tiny residues while a giant lineage stays open and accumulates dense history. Complete character coverage does not establish coherent episode formation or successful late-blob avoidance. The completed continuity/closure diagnosis is recorded below; finite use of inherited character remains unresolved. W1 is not accepted as a viable material ontology; W2 and later links remain separately gated and unimplemented. The [ordering entry](daily/2026-10-08-w1-material-before-vitality.md), [original stop](daily/2026-10-08-w1-episodic-material-shadow.md) and [2026-10-09 continuation](daily/2026-10-09-w1-causal-attribution.md) preserve the decision chronology.

The subsequent [continuity / closure diagnosis](evidence/2026-10-09-w1-continuity-diagnostic/README.md) is read-only and preserves that result. Adjacent-sample overlap, shared split descendants and merged ancestry retain one canonical episode after its original active anchors disappear. Old point-contact qualification and EMA carry-over are observed separately; exact field attribution and counterfactual contact-memory effects remain unavailable.

The later, separately authorized [maximum-overlap split inheritance shadow](evidence/2026-10-09-w1-max-overlap-split-shadow/README.md) changes only which child retains episode identity. It preserves all natural inputs, formation masks, later merge rules, geometry and character definitions. **Mixed:** independent closures and larger isolated material appear, but absolute speckle and re-inscription increase and a single continuously active root retains 98.2–99.8% of pending history. All 617 candidate closures have two finite bounded coordinates, including two zero-consolidation EMA carry-over forks; no substantial frozen cycle appears. Independent child identities alone do not establish coherent material ontology or late-blob avoidance. One provenance-only nonwinning merge-history candidate is proposed for design review, not implemented or automatically authorized; a continuously active core may still never close. These passes advance no material-condition, vitality, feedback or acoustic link.

The subsequent [per-cell formation-history audit](evidence/2026-10-09-w1-per-cell-formation-history/README.md) preserves both mechanisms and characters. The giant root's unique union growth is mainly direct admission, with substantial actual imported history; many cells retain geometry long after their last owned/global activity. Temporal and threshold-support differences occur within the same pending identity and within actual frozen multi-cell episodes. Chemical and mechanical predicate duties coincide in this analyzed population, so these proxies do not identify separate physical contributions. The evidence motivates separating a historical record from material contribution as a future hypothesis, but establishes no weighting, threshold, decay or geometry conversion. The [new chronology](daily/2026-10-09-w1-per-cell-formation-history.md) records that limited decision without rewriting earlier proposals. No material contribution function, character revision or continuity/closure rule is implemented; W1 ontology remains unresolved and W2–W7 remain separately gated.
