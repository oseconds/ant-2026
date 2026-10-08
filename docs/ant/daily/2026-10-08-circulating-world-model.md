# 2026-10-08 — Circulating-world model design

## Decision

ANT's long-term architecture is reframed from a one-way agent→material→sound pipeline into a **circulating world**.

The agents are not given a prescribed destination or global reward. Future organism-like behavior should come from internal state and local environmental consequences rather than authored pathfinding goals.

The design contract is now [`docs/ant/world-model.md`](../world-model.md).

## Why

The current production selected-path material mechanism is readable but topology-constrained. The rejected interior-endpoint candidate produced more branches while increasingly reinscribing earlier material.

The detached local-accretion shadow on branch `ant-local-accretion-shadow` tested the opposite direction: no path selection, direct local maturation from accumulated history. It retained more early topology but converged late toward dense fan/blob-like material. This suggests that the next material hypothesis should respond to **history transitions** rather than translating absolute accumulated state directly into permanent geometry.

At the same time, material should eventually become part of the environment that conditions future action rather than remaining only an archive.

## World-model principles fixed here

- no prescribed destination by default
- future internal state such as vitality regulates possibilities rather than encoding a target
- material feedback changes local conditions rather than issuing detour commands
- internal state is not directly sonified in production
- sound remains physically mediated through contact/material/vibration
- future acoustic feedback derives from pre-master physical vibration, never speaker/master output
- first acoustic feedback is slow/shared, not direct per-ant steering
- one new causal link is tested per pass
- morphology classes remain observations, not generation targets
- research evidence and artistic interpretation remain separate

## Planned sequence

```text
W1 vitality shadow
W2 episodic crystallization shadow
W3 weak material → organism feedback
W4 vibration → acoustic climate shadow
W5 weak acoustic-climate feedback
W6 closed-world integration
```

No production mechanism was changed by this design pass.

The immediate next step is W1 only: define and evaluate a vitality/internal-state shadow without feeding it back into movement or sound.
