# ANT — World Model Design Contract

**Status:** design / not production implementation  
**Date:** 2026-10-08

This document defines the current conceptual target for ANT after the S0–S2c social-observation work and the material-morphology shadow experiments. It is a design contract for future passes, not a claim that the complete loop already exists.

For verified implementation state, use [`docs/ant/README.md`](./README.md).

## Core idea

ANT is not primarily a task-solving agent simulation.

It is a **circulating world** in which agents and environment continuously create the conditions for one another's next state.

```text
not:
agent → goal → optimal action

but:
agent state
+ environmental state
+ accumulated history
→ next local action / condition
```

The agents do not require a prescribed destination, food target, global reward, pathfinding objective or authored narrative goal.

They may later carry internal states such as vitality, but those states should regulate possibilities and consequences rather than encode a destination to optimize.

The artistic observation position remains external:

> The viewer may wonder where an ant is going or what it is doing, while the world itself does not need to contain a single authored answer.

Meaning is therefore observational and relational rather than a hidden reward function.

## Target circulation

The long-term world model is:

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
                          ↓
            STRATIGRAPHY / MATERIAL STATE
                     ↙             ↘
          locomotion condition    vibration
                  ↓               ↙      ↘
             internal state   audible   acoustic
                              sound     climate
                                          ↓
                                  shared colony condition
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

- vitality or other explicit organism-level internal state
- episodic crystallization based on history transitions
- material/depth → locomotion feedback
- physical vibration → acoustic-climate feedback
- acoustic climate → colony or individual behavior
- a closed world loop

The current production `TrailPlateBirth` remains the source→boundary selected-path mechanism until a separate production-adoption pass says otherwise.

## Why the model is changing

Two morphology directions exposed opposite failure modes.

### Selected-path production

The current selector compresses persistent chemical/mechanical history into deterministic source→boundary path families.

This gives readable arterial material, but strongly constrains topology toward rooted path/tree-like forms.

The interior-endpoint production candidate increased branches and births but also increased prior-union overlap and reduced new area per birth. It was rejected for the current sustained-novelty goal.

### Absolute local accretion shadow

The branch `ant-local-accretion-shadow` removed path selection and froze locally mature cells directly from cumulative chemical/mechanical evidence.

That shadow retained broader topology early and reduced repeated-cell freezing, but by the late run all three seeds converged toward one dense fan-shaped mass. The largest component contained more than 99% of local material and most surviving holes/islands were tiny.

This shadow is not merged into production. It is retained as evidence that:

> removing path selection is not sufficient if absolute accumulated state is still translated directly into permanent material.

The next formation hypothesis should therefore examine **changes in history**, not only high accumulated values.

## Material principle

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

Artery, fan, braid, loop, island, fossil and palimpsest are possible observational morphology classes. They must not be generation templates or hard-coded targets.

Material geometry and future acoustic topology are separate concerns. A material shape may be arbitrary raster/continuous geometry even if a later audio compiler derives a simpler solver graph from it.

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

Feedback should modify **conditions of action**, not command an action.

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

## Sound principle

Internal state is **not directly sonified** in the production world.

Avoid mappings such as:

```text
vitality → pitch
vitality → volume
vitality → filter cutoff
```

Instead:

```text
internal state
→ action
→ FOOT_CONTACT
→ material excitation
→ vibration
→ sound
```

Internal-state diagnostic sonification is allowed only as explicitly labeled tooling.

Sound is also not required to remain a terminal output forever. The long-term model may include a shared **acoustic climate** derived from physical vibration.

Critical boundary:

```text
physical vibration state
├─→ render / mix / limiter / speakers
└─→ slow acoustic-climate state → simulation
```

Do **not** feed master output RMS, user volume, limiter output or PA gain back into world dynamics.

The feedback signal must come from a stable pre-master physical/world state so changing playback gain does not change the simulated ecology.

## Acoustic-climate principle

If introduced later, acoustic climate should initially be:

- slow relative to the audio waveform
- shared rather than a direct per-ant control signal
- derived from physical material vibration, not the final mix
- connected to only one small colony/organism tendency in the first test

Examples of future candidate effects include weak changes in arousal, hesitation, recovery or movement persistence.

The sign and strength must be tested rather than chosen to manufacture a desired morphology.

## Social layer

The S0–S2c social observation remains parked and read-only.

The current world model does not require a social graph to close the environmental loop.

If explicit relationship, partner memory or social preference is introduced later, it is a new mechanism and must be compared against the frozen no-relationship baseline.

## Design invariants

Future ANT passes should preserve these rules unless an explicit architecture review changes them:

1. **No prescribed destination by default.** Do not add food targets, waypoint objectives, global rewards or pathfinding merely to create apparent purpose.
2. **State, not command.** Internal/environmental variables alter local conditions and propensities, not explicit desired routes.
3. **No direct internal-state sonification in production.**
4. **No master-output feedback.** World feedback derives from pre-master physical state.
5. **Sound does not directly steer individual ants.** Any first sound feedback is slow/shared and mediated by organism/colony state.
6. **Material is both history and potential environment.** It should eventually be capable of affecting future conditions, but that feedback is not implemented until separately validated.
7. **One new causal link per pass.** Avoid adding vitality, material feedback and acoustic feedback simultaneously.
8. **Preserve negative baselines.** Current production, rejected interior-endpoint candidate, local-accretion shadow and S0–S2c social baseline remain comparison points.
9. **Do not tune to desired pictures.** Morphology classes are observations, not objectives.
10. **Separate evidence from interpretation.** Measured dynamics may support an implementation claim; concepts such as vitality, climate, fossil or world are artistic/modeling interpretations unless separately researched.

## Planned passes

The current sequence is:

```text
W0  WORLD MODEL CONTRACT                         THIS DOCUMENT

W1  vitality shadow
    compute internal-state dynamics without behavior feedback

W2  episodic crystallization shadow
    derive coherent material episodes from history transitions
    using frozen natural inputs first

W3  weak material → organism feedback
    run natural ANT again with one isolated environmental consequence

W4  vibration → acoustic climate shadow
    derive slow shared state from pre-master physical vibration

W5  weak acoustic-climate feedback
    connect one shared state to one organism/colony tendency

W6  closed-world integration
    only after each link is individually stable and interpretable
```

Each stage is separately authorized, measured and reversible.

A successful stage is not one that looks more alive. It is one that adds a clear causal relation while preserving enough openness for multiple future states to remain possible.

## Current next step

**W1 — vitality shadow.**

Do not change ant behavior yet.

First define and replay a candidate internal-state process against frozen natural trajectories to answer:

- does it remain dynamic rather than pinning at a floor/ceiling?
- does it vary meaningfully within and between individuals?
- can cost/recovery be derived from existing events without future leakage?
- is the state interpretable without directly controlling movement or sound?

Only after that shadow pass should vitality be considered for behavioral feedback.
