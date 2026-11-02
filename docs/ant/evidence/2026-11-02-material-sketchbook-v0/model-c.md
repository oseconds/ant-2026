# Model C — capacity redistribution

## Model definition

This is an independent invented material rule for the isolated Material Sketchbook v0. It is not a production ANT module or a calibrated physical-material model. The sample is a fixed 8×8 cardinal lattice with 64 nodes and 112 undirected edges. Node positions are lattice cell centers in the unit square. Geometry and unit node masses never change.

Each edge starts with capacity `cₑ = 1`, so the declared global budget is

```text
Σₑ cₑ = 112
```

That sum is the conservation condition for every step. Capacity is positive and moves only among edges that share a node. For the post-integration edge strain `qₑ = tanh(|zᵢ − zⱼ| / 0.01)`, each node's incident edge star is visited in row-major node order. With `η = 0.25` and `Δt = 1/60`, the update is

```text
q̄ᵥ = mean(qₑ for e incident to v)
wₑ = cₑ · exp(η Δt (qₑ − q̄ᵥ))
c'ₑ = (Σ incident cₑ) · wₑ / Σ incident wₑ
```

Each update rescales its incident star to the same incoming star sum, so every local update preserves the global capacity sum. Exponential weights preserve positivity for the finite states in this sketch. Overlapping stars are applied sequentially; row-major order is a deterministic operator bias. This local law does not select a target geometry or pattern.

## Mechanical state and input

Every node has scalar displacement `zᵢ` and velocity `vᵢ`, both initially zero. The mechanical acceleration is

```text
aᵢ = −0.6 zᵢ − 0.5 vᵢ + Σⱼ kᵢⱼ (zⱼ − zᵢ) + Fᵢ(t)
vᵢ(t + Δt) = vᵢ(t) + Δt aᵢ
zᵢ(t + Δt) = zᵢ(t) + Δt vᵢ(t + Δt)
```

This is semi-implicit Euler at the fixed `Δt = 1/60` second. The current state-derived edge stiffness is bounded:

```text
kₑ = 120 cₑ / (1 + cₑ)
```

Uniform initial capacity gives `kₑ = 60`; `0 < kₑ < 120` for positive capacity. The saturation bounds the oscillator stiffness even if capacity concentrates while its global budget remains fixed. Node mass is `1`, ground stiffness is `0.6`, and damping is `0.5`.

For the fixed degree-four lattice, the weighted graph-Laplacian eigenvalues are bounded by `2 × 4 × 120`; adding the ground term gives `λmax ≤ 960.6`. At `Δt = 1/60`, semi-implicit Euler's damped scalar-mode stability condition `Δt² λ < 4 − 2(0.5 Δt)` has a large margin (`0.267 < 3.983`).

The constructor uses the shared seeded random stream to select one driven node, a frequency in `[0.65, 1.15)` Hz, and a phase in `[0, 2π)`. That node receives

```text
Fᵢ(t) = 0.4 sin(2π f t + φ), when i is the selected node and 0 ≤ t < 40 s
Fᵢ(t) = 0, otherwise
```

After the force ends, displacement and velocity continue to evolve under damping, and any remaining edge strain can continue to redistribute capacity. No random values are drawn during stepping. The snapshot records the seed, RNG state, selected drive, full configuration, fixed geometry, masses, displacement, velocity, capacity, and tick.

## Observation contract

`view()` returns copied normal arrays for positions, edge endpoints, capacity, unit masses, and displacement, plus phase and summary statistics. `mechanics()` returns one current-state graph with the same fixed positions and masses and a spring coefficient derived from each current edge capacity. Neither observation advances the model or consumes RNG. The shared probe may read this graph as a frozen-state counterfactual; it is not continuous audio or feedback into formation.
