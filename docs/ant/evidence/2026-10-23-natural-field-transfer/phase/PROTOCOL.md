# Fixed-history field-phase challenge

Date: 2026-10-23 KST  
Baseline: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2` (`origin/main`)  
Status: preregistered design and implementation controls; no natural phase outcomes reviewed.

## Question and scope

Under the default Gaussian pheromone writer, bilinear reader, half-life, cap, and grid, does shifting the same recorded physical deposition history by half a grid cell relative to the fixed raster change the sampled trail cues and their one-tick movement transfer? This is a grid-phase sensitivity challenge. It does not compare kernels, test a replacement, or estimate the total ecological contribution or dominance of pheromone.

The fixed histories are the same ordered production decay and deposit events through each captured pre-tick state. For each phase, translate every point and segment write by `(dx, dy)` and translate every field read by the same `(dx, dy)`. Leave ants, headings, occupancy, spawn state, materials, and RNG unchanged. This moves the rasterized field relative to the unchanged physical world while preserving each source-to-query offset away from the finite boundary. The four preregistered offsets are:

| Phase | `dx` | `dy` |
|---|---:|---:|
| `p00` | `0` | `0` |
| `p10` | `0.5 / 95` | `0` |
| `p01` | `0` | `0.5 / 95` |
| `p11` | `0.5 / 95` | `0.5 / 95` |

For general dimensions, use half of the corresponding normalized grid pitch, `0.5 / (width - 1)` and `0.5 / (height - 1)`. The intended default is 96×96. No phase-specific parameter, dose, event, RNG, or world-state selection is permitted.

## Required qualification gates

1. **Source and history identity.** Keep the production source hash, instrumented-source receipt, event-stream hash, capture id, event ordering, event count, elapsed decay time, and requested deposit dose. Each phase consumes the same input event rows in the same order.
2. **Phase-zero raster identity.** Replaying the unshifted initial field and ordered event history must reproduce the captured pre-tick Float32 raster byte-for-byte. Where the source stream records a deposit method return, phase zero must reproduce it exactly. Reject unsupported, misordered, or non-finite events, rasters, samples, and dose summaries. A mismatch rejects that state and every phase comparison derived from it.
3. **Phase-zero movement and RNG identity.** From the complete pre-tick state, phase `p00` must reproduce the uninstrumented production endpoint, RNG state/call count, and public snapshot. Repeat this gate for the matched production, `dtFeedback`, and `dampingOff` controller variants. The read/write wrapper must consume no random values.
4. **Read/write convention.** A logged sample records both the physical call `(x, y)` and translated field query `(x + dx, y + dy)`, plus the returned raw value and call order. A logged write records its original and translated geometry, request parameters, returned in-domain dose, and order. If a one-tick controller replay proceeds past sensing, point and segment writes use the same offset as the reads; decay is unchanged. Never combine translated reads with unshifted deposits.
5. **Dose, storage, and cap accounting.** For every phase and state, retain requested source dose, accepted dose (the sum of field API method returns, not raster mass after per-cell caps), domain-clipped dose, any tiny accepted-above-request discrepancy, elapsed decay time, final stored mass, uncapped-shadow mass, estimated cap-storage loss, capped-cell count, and peak cell. Requested event dose and time are identical by construction. Accepted dose, storage, and cap loss may differ because the finite square clips translated trajectories and because phase changes cell-level cap accumulation; expose those differences rather than correcting them.
6. **Boundary qualification.** Retain all sensor rows. A sensor row is interior-qualified only if its physical query and its translated query in every phase are at least `radius + max(gridPitchX, gridPitchY)` from all four domain edges. Keep any failing row as `boundaryExposed`; exclude it from interior-only summaries. With the default compact Gaussian support (`radius = 0.0045`), one bilinear grid pitch covers the read interpolation footprint. The production field has no diffusion, so no additional transport distance is assumed. This is a sensor-row eligibility rule, not a claim that all boundary history or global field mass is translation invariant.

## Observations

For every captured state and ant, retain all actual field sample calls, including local and wide-sensor reads, in call order. The phase wrapper stores physical and translated coordinates, raw value, call index, and context. Use `instrumentControllerSensorSamples` to tag calls from the existing `senseLocalTrail` and `senseTrail` methods; leave other field reads logged as unclassified rather than assuming they came from an ant sensor. Restore the wrapped methods after each replay. The wrapper is RNG-neutral and does not recalculate controller cues. Join these raw values to the existing controller trace for local bands/strength/coherence/steering, wide option scores and choice when due, target headings, local turn, omega, velocity, collision scale, and completed postcollision travel. A skipped wide choice remains a skipped choice. Report per-call and per-agent interior eligibility, phase contrasts, boundary-tagged rows, counts, and paired denominators. Keep local sensor reads, wide-sensor choices, body turn, and actual travel distinct.

Report each seed, origin policy, capture time, and phase before any aggregation. Captured ants and repeated windows within a world are not independent replicates. Keep both the natural-history strata and the full fixed sample; do not select agents, routes, or capture times after viewing phase outputs. No binary success threshold is set here. Any later interpretation must consider the magnitude, direction, eligible incidence, boundary/dose changes, and earliest controller stage that changes. A nonzero phase contrast alone does not establish field dominance or justify a field alternative.

## Limits and stop conditions

This is a conditional fixed-history contrast, not a free-running counterfactual. The translated `.sample`/write view does not make raw field-value or `getSnapshot()` consumers such as `TrailPlateBirth` or rendering phase-equivariant. The primary sensing, target, turn and postcollision-travel endpoints occur before those later material consumers; do not interpret phase-counterfactual material births or material state as a consistent alternative world. A translated write history followed by a one-tick movement replay cannot identify recurrent benefits after agent paths diverge. The event history preserves the recorded physical sources and request dose/time; it does not preserve identical accepted dose where finite-domain clipping differs. Cap and storage differences are measured outcomes of the phase intervention. Do not infer a universal grid artifact from a selected interior case.

Stop before natural phase-result review or any alternative-field experiment until the parent accepts this protocol and the Stage A complete-state/RNG qualification. A failed phase-zero raster or replay gate means no phase-effect claim for that state. The already failed CIC gate remains closed. No CIC, diffusion, raster-resolution change, kernel candidate, parameter sweep, or production edit is part of this protocol.
