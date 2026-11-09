# Subtractive material model

This document records the fixed law for the isolated `subtractive-v1` model before browser observations. It is an invented material rule for generative-art discovery, not a calibrated material or an ANT production change.

## State and construction

The world is a 12×12 cardinal lattice with 144 fixed unit-mass nodes and 264 fixed edges. Each edge starts with bond strength `b = 1`; each node starts at displacement `u = 0`. One seeded rest offset per edge is drawn uniformly from `[-0.04, 0.04]` using a separate stream seeded by `seed XOR 0x5a17c9e3` (unsigned 32-bit). These incompatible rest offsets create stored strain without an applied load. Two samples share identical geometry, offsets, and initial state: `activity` and `noactivity`.

## Tick law

At each `1/60 s` tick, `ActivityInput(seed, pattern, 12).next(tick)` supplies per-node counts in `[0,2]`. The active sample uses these counts; control activity is zero. Both samples relax synchronously by explicit Euler descent on

```text
E = 0.5 Σ_e b_e ((u_j - u_i) - r_e)^2
du_i/dt = -0.5 ∂E/∂u_i
```

After displacement updates, edge bond strength changes irreversibly:

```text
b_new = max(0, b_old - dt * (0.35 * mean(endpoint activity)
                              + fatigue * 0.005 * strain² / (0.04² + strain²)))
```

`fatigue` is a constructor option, defaulting to enabled. `fatigueStopTick` optionally sets the first tick at which this fatigue term is disabled; it defaults to `null` (never disabled) and exists for a scheduled causal ablation. It does not change the activity exposure term. Damage removes coupling and redistributes no capacity. A zero bond means disconnected; components use the exact `b > 0` test. Nodes, masses, and positions do not change. There is no load, healing, oscillator, sound, or target shape.

## Accounting and limits

The model records initial energy, cumulative energy loss during relaxation, and energy removed by bond damage. `energyBalanceError` is `current energy - initial energy + relaxation loss + damage loss`; floating-point roundoff is allowed and no artificial energy clamp is applied. The overdamped relaxation is an explicit Euler approximation, not a claim of calibrated mechanics. Activity counts are an authored input, damage coefficients are invented, and only these two paired input conditions are compared. The model does not establish biological, physical, acoustic, or production validity.

Snapshots record the fixed parameters and rest-stream XOR alongside the input and stream state: mobility `0.5`, activity damage `0.35`, fatigue rate `0.005`, strain scale `0.04`, and rest-offset range `0.04`.
