# Model B — paired directional memory (pre-observation definition)

This file freezes the model before browser observation. It defines an invented, generic leaky directional memory for the isolated material sketchbook. It is not a claim about calibrated materials or production ANT.

## Paired input

- Two 8×8 samples use the same seed, cell centers, finite masses, input footprint, zero initial memory, and post-initialization random state. Their only initial difference is the order schedule.
- Sample AB receives A for 20 s, B for 20 s, then remains quiet indefinitely. Sample BA receives B, A, then remains quiet indefinitely. All updates use `STEP = 1/60 s`; the model clock has no completion cap.
- A and B use the same half-sine episode envelope `sin(π(n + 1/2)/1200)`, normalized so its 1200 discrete samples sum to one dose unit. Each type therefore has duration 20 s and total dose 1 in either sample.
- A given type's envelope and spatial footprint depend on its local episode tick and the shared seeded footprint, never on absolute world phase or sample label. The footprint is normalized across cells. Seeded mass heterogeneity is identical across the two samples.

## State and rules

Each cell stores two nonnegative memory components, `Mx` and `My`, initially zero. A deposits into `Mx`; B deposits into `My`. At each tick:

```text
λ = exp(-STEP / 45 s)
Mx' = λ Mx + (A ? doseThisTick × footprint : 0)
My' = λ My + (B ? doseThisTick × footprint : 0)
```

The 45 s e-folding time is the declared recency limit: after input ends at 40 s, each component keeps decaying exponentially and does not persist as an immutable history. Checkpoints can extend through the shared 0, 30, 120, and 300 s protocol and beyond. Both samples retain fixed cell positions and masses throughout the run.

The shared observation graph has one node per cell and fixed ground/damping values. Every horizontal edge uses its endpoints' mean `Mx`; every vertical edge uses mean `My`:

```text
k(edge) = 0.8 + 1.2 × mean(endpoint directional memory)
ground = 0.15 per node
damping = 0.03 per node
```

The same mapping and pickup geometry apply to both samples. No sample-label branch assigns a sound or graph. `mechanics()` derives its two current graphs from the state; it does not advance or mutate the world. Geometry distance is consequently zero by construction, while memory distance may differ after ordered input.

## Frozen parameters and limits

`SIZE=8`, episode duration `20 s`, input stop at `40 s`, `DOSE=1` per type, memory retention `exp(-STEP/45)`, base spring `0.8`, memory spring gain `1.2`, ground `0.15`, damping `0.03`, all from the implementation in `src/sketchbook/memory.js`. The memory/spring units are generic model units. This rule demonstrates order-sensitive recency; it does not establish complex material physics, perceptual value, or production suitability.
