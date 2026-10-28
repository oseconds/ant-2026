# Pheromone cross-lifecycle provenance — preregistration

## Question

At current production G, does an ant's pheromone input contain repeated signal from authors that have already retired, or is the sampled signal mainly from the reader itself and currently alive ants?

This is a read-only provenance measurement. It does not test a new social or carrier mechanism and does not claim behavioral causal importance.

## Baseline and fixed conditions

- Fresh `origin/main`: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Production defaults, current G `PheromoneField`, seed `20261005`, `20261006`, and `20261007`.
- 60 Hz, 600 model seconds, Audio Off; no audio bridge.
- No change to `src/`, movement, pheromone parameters, material, lifecycle, or `TrailPlateBirth`.
- Existing G production adoption evidence is the reference for the three natural seeds and no-saturation prior.

## Observer and attribution rule

The observer wraps the existing controller/field methods in research code only. It records each actual positive Float32 node change made by the production `depositBrush()` and assigns that stored delta to the author of the corresponding `GasterDeposition` output. It does not reconstruct requested dose as stored signal.

Each cell/author contribution is held in double precision and lazily decayed with the production half-life at the field's explicit simulation clock. First and second signal-weighted age moments are carried with the contribution. At a sensor read, author components are bilinearly sampled at the same four nodes as production. A separate signed numeric residual is the production Float32 field value minus the sum of author components; it is never assigned to an ant.

The observer records only `PheromoneField.sample()` calls made inside the actual `senseLocalTrail()` and `senseTrail()` methods. Each sample is classified as self, alive-other, or retired-author at sample time. The sensor point is also accumulated in a fixed 32×32 spatial grid and by distance from the current recruitment origin `(0.5, 0.72)`.

Age reporting uses signal-weighted first/second moments and fixed 0.1-second bins of per-read signal-weighted mean age, with the bin method and limits included in the receipt. These are descriptive summaries, not a threshold for success.

## Validity gates registered before measurement

- Observer-on/off ants, RNG calls/state, event stream, Plate/Nodule births, and checkpoints must match for every seed.
- All 316×316 pheromone, SurfaceField, and material checkpoints must match exactly.
- Any production cap touch invalidates author attribution for that seed; it is recorded, not reallocated.
- Segment clipping and out-of-domain point rejection are counted separately from stored in-domain contributions.
- Every instrumented sensor sample must reconstruct the production sample within `max(1e-9, abs(sample) × 1e-6)` after including the signed numeric residual.
- At each checkpoint, absolute node residual sum must remain at or below `1e-4` of native field node sum. Exceeding this makes author fractions invalid; no post-hoc correction is allowed.

## Planned outputs

- Reproducible research runner and focused observer parity test.
- Per-seed and pooled signal fractions, retired-read frequency/magnitude, age moments/distribution, and origin/spatial summaries.
- Parity and reconstruction receipts, implementation/evidence report, and one daily chronology entry.
- No Plate author attribution, formation-law, material, or carrier experiment.
