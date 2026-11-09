# V1 model T — local-time coupled phase fields

## Fixed model before observation

This is an isolated v1 discovery model. It does not alter production ANT or create audio. Two 12×12 phase fields start from the same seeded state and share a global `STEP = 1/60` clock. The lattice has 144 nodes and 264 fixed, undirected nearest-neighbor edges. The local and control fields have separate phase and age state but receive the same local activity input and condition field.

`ActivityInput` supplies the integer node count `aᵢ ∈ {0,1,2}`. Every tick, the shared condition updates by forward Euler:

```text
qᵢ ← qᵢ + dt [aᵢ(1 − qᵢ) − qᵢ/20]
rᵢ = 1/(1 + 4qᵢ)
```

The local field advances at node rate `rᵢ`. The control uses one spatially uniform rate equal to the current mean of all `rᵢ`; this matches the local field's mean elapsed time each global tick and isolates where time is applied from a whole-world average slowdown. Both clocks update age and phase from the same tick-entry phase values. The rate is a mobility on the coupled phase dynamics, not a color or display-only mapping.

For both fields, with `D = 0.05` when coupling is on (otherwise `D = 0`) and `γ = 0.4`:

```text
∂φᵢ/∂τ = D Σⱼ∈N(i)(φⱼ − φᵢ) + γ φᵢ(1 − φᵢ)(φᵢ − 1/2)
dφᵢ/dt = rᵢ ∂φᵢ/∂τ
```

Age is accumulated as `d ageᵢ/dt = rᵢ` (the uniform control uses mean `r`). `φ` is a non-conserved order state; its sum is not mass and may change. There is no explicit material deposition, transport of mass, or claimed physical-material correspondence. Rendering and observation do not advance state.

The reported energy for a field is:

```text
E = (D/2) Σ_edges (φᵢ − φⱼ)² + (γ/4) Σᵢ φᵢ²(1 − φᵢ)²
```

Its negative gradient is exactly the unscaled phase right-hand side above. For continuous time with positive nodewise rates, `dE/dt = −Σᵢ rᵢ(∂E/∂φᵢ)² ≤ 0`; thus spatially varying positive mobility preserves gradient-flow energy descent while changing its timing. The discrete implementation is explicit Euler, so this is not an unconditional discrete-time theorem. Here `dt = 1/60`, `D ≤ 0.05`, `γ = 0.4`, degree ≤ 4, and `r ∈ [0.2,1]` put the linearized update inside a small-step regime; the fixed-seed 1000-second assertion checks non-increase to `1e-12` tolerance. Euler `q` remains in `[0,1]`: for `a ∈ [0,2]`, `dt(a+0.05) ≤ 0.0342`, making the update a convex combination of `q` and equilibrium `a/(a+0.05) ∈ [0,1]`.

The condition has no forced clamp. It is common to both samples and only changes the phase/age clock. The input ends after 40 seconds and may use `wander`, `stationary`, or `none`; its seed, pattern, state and dose are captured in the input receipt. The model snapshot records seed, global tick, fixed configuration, both complete sample states, `q`, and the private initial-state RNG state.

## Evidence boundary

Tests cover deterministic replay, inert observations, exact no-input equality, mean-matched ages, local age spread, coupled versus uncoupled phase behavior, post-input condition recovery, bounded states and fixed-seed energy descent. These are implementation and numerical checks. They do not establish a calibrated material, an acoustic mapping, production suitability, or a particular visual outcome.
