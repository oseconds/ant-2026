# 2026-10-08 — Persistent-world / sounding-world pivot

## Why this is a major conceptual branch

The circulating-world design was refined further after discussing what remains when agents are absent, what sound means inside ANT, how future material should differ, and how exceptional entities should affect the world.

The resulting position is stronger than a simple feedback loop:

> ANT is a persistent world. Agents participate in it, but their current presence is not the condition for the world's existence.

## Persistent world

A zero-ant interval is a valid state.

During such an interval, depending on the implemented layer:

- pheromone may continue to decay,
- material and stratigraphy may remain,
- stored vibration may decay or propagate,
- a future acoustic climate may continue to drift,
- no event needs to be generated merely to create activity.

A later ant enters an already existing world rather than resetting the simulation.

## Sounding world

The conceptual role of the optional Base Substrate changes.

The implementation and calibration evidence are preserved, but the target world model no longer assumes a separate always-present base plate that must emit a sound for every FOOT_CONTACT.

Instead:

```text
activity
→ changes world/material conditions
→ changes vibration
→ the world becomes audible
```

The world itself is the primary sounding body.

FOOT_CONTACT may remain a physical cause, but sound need not be a direct per-step effect.

## Material character

Future material episodes may inherit bounded continuous character from the conditions under which they form.

Possible dimensions include compactness, roughness/porosity, directionality, stiffness, damping and resonance tendency.

These are not adopted parameters and are not categorical personalities. The design rule is only:

> if formation histories differ meaningfully, that difference may remain in the material rather than being erased at birth.

The same material character may later affect both vibration and local environmental consequences.

## Finite influence

Exceptional states are permitted, but no entity may become an unbounded controller of the world.

Strong or unusual ants/materials/resonances may occur, but their effects must remain finite through bounded state, locality, attenuation, damping, burial, turnover, finite energy/coupling or bounded slow aggregation.

```text
strong ≠ infinite
rare ≠ dominant forever
persistent ≠ unlimited influence
```

## Updated design language

The core terms are now:

- **persistent world**
- **state without prescribed goal**
- **episodic crystallization**
- **history-derived material character**
- **world as sounding body**
- **acoustic climate**
- **finite influence**

These are design/modeling concepts, not claims that the corresponding mechanisms already exist.

## Implementation boundary

No production movement, material, stratigraphy or audio mechanism changes in this documentation pass.

The next architecture research step remains **W1 vitality shadow**. W2 now includes both episodic crystallization and a bounded history-derived material-character hypothesis.

The local-accretion shadow remains a branch-only mixed/negative comparison and is not adopted into production.
