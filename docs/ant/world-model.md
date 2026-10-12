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
→ TrailPlateBirth (current authored corridor-to-Plate formation law)
→ MaterialStratigraphy
→ local stratigraphic column count at current cell
→ bounded desiredSpeed resistance
→ later movement / environmental history

MaterialStratigraphy
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
- physical vibration → acoustic-climate feedback
- acoustic climate → colony or individual behavior
- a fully integrated persistent-world circulation beyond the adopted local material→locomotion link

The current production `TrailPlateBirth` remains the authored source→boundary corridor formation law. Alternative formation laws remain unadopted and are not prerequisites for the current retained-material locomotion feedback.

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
4. **Material records history and can condition future activity.** The adopted local locomotion law is one bounded example.
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

## Current production causal link

`TrailPlateBirth` remains the current authored corridor-to-Plate formation law. `MaterialStratigraphy` retains the exposed/buried layer structure produced by that history. The first adopted production feedback reads the current ant cell's public `layerCountByCell` value L: the local stratigraphic column count, including the top and any underlying layers. Only this aggregate scalar enters locomotion; individual buried-Plate identities do not:

    m(L) = 1 - 0.10 * (1 - exp(-L / 4))

One tick-entry stratigraphy snapshot supplies L before intention and movement. After the existing movement decisions, this multiplier is applied once to final `desiredSpeed` before `targetSpeed` is set and `accelerateToward()` runs. L = 0 gives exactly 1; increasing L approaches a maximum 10% slowdown. Contacts, births and topology changes later in that tick affect locomotion from the next tick. Material does not directly change heading, steering, targets or attraction/avoidance. This aggregate count does not identify or individually sense buried Plates. The law is an authored local-history condition, not a measured physical friction law.

The fixed candidate was supported by the three-seed causal A/B and adopted after default-On / explicit-On and explicit-Off conformance checks. The A/B found lower travel and realized speed, longer exposed episodes, and later history differences without observed trapping or collapse; Plate-birth and coverage directions varied by seed. It does not support a claim that retained material increases either. [Causal A/B evidence](evidence/2026-10-11-retained-material-locomotion-ab-final/README.md) · [adoption verification](evidence/2026-10-12-retained-material-locomotion-adoption/README.md).

## Future hypotheses

There is no mandatory W1→W2→W3 sequence. Vitality is a separate future hypothesis only if an organism after-effect must persist after an ant leaves material. Alternative formation laws, history-derived material character, C2 and retained relations are not prerequisites for the adopted feedback. Acoustic climate remains future work. Each additional causal link needs separate evidence and authorization; one link is added per pass.

The 2026-10-12 causal-tail investigation judged the existing movement/environment state **SUFFICIENT CURRENTLY** for carrying local material consequences beyond center-cell exposure. Temporary organism after-effect / vitality is **PARK**; a future proposal must name a temporal responsibility that identical current production state cannot supply. [Evidence and limits](evidence/2026-10-12-material-causal-tail/README.md).

A successful future pass must preserve enough openness for multiple states to remain possible. It is not defined by looking more alive or more varied.
