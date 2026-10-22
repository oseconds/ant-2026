# Natural Route Curvature Baseline

Three deterministic production runs, seeds `20261005`, `20261006`, and `20261007`, each advanced for 36,000 fixed ticks at 60 Hz (600 simulated seconds). No movement behavior was changed. The runner records the actual post-collision positions supplied to gait/contact handling, plus body and intent heading, speed, collision scale, local crowding, trail adherence, and the turn-cap indicator.

## Files and replay

Each `seed-*-trajectory.f64.gz` is an exact, lossless column-major capture. Its adjacent `.schema.json` stores the ID dictionary and each block's type, byte offset, and width. ID and tick are unsigned 32-bit little-endian values; continuous measurements are Float64 little-endian; flags are one-byte booleans. Nullable values use NaN and decode back to `null`. The `readNaturalCapture(path)` export in `scripts/ant-route-curvature-natural.js` reads this format and the archived JSONL format.

All 2,020,081 rows were decoded after packing and compared field by field with `Object.is`; every value matched. The original gzip JSONL captures are retained in ignored `test-results/curvature-initial/`. The production capture runner, shared metrics helper, controller sources, codec hashes, artifact hashes, fixed-tick parity check, and four checkpoint summaries are recorded in `manifest.json`.

The manifest preserves the original capture-writer hash. The current runner adds the lossless codec and therefore has a different hash. Three full verification replays with the current source reproduced all captured serialized values and endpoint summaries exactly: [seed 05](../validation/replay-20261005.json), [06](../validation/replay-20261006.json), [07](../validation/replay-20261007.json). This is 40,401,620 field comparisons across the 2,020,081 rows. The original JSONL representation encoded an infinite following-speed limit as `null`; replay comparison explicitly applies that same representation. Finite numbers use `Object.is`. These checks cover captured samples and summaries, not every internal world variable on every tick.

Checkpoint snapshots are taken at ticks 1,800 / 7,200 / 18,000 / 36,000 (30 / 120 / 300 / 600 s). Pheromone and SurfaceField arrays are detached copies. Plate and nodule counts are captured from immutable public lists. The 600 s Float32 field hashes match each corresponding run summary.

## Measurement definitions

Windows are globally anchored, nonoverlapping intervals of 60 / 120 / 300 ticks. Each window requires every per-ant tick from both endpoints. The first sample is the initial state at tick 0; sample `n` is after fixed tick `n`, including an ant's final observed segment if it exits. Windows with path length below `1e-4` are counted as low displacement and excluded from continuous means.

Path-tangent turn is the wrapped angle between consecutive nonzero post-collision displacement segments. A zero-length segment breaks tangent and same-sign continuity. Signed and absolute accumulated turn, turn per distance, chord/path ratio, same-sign turn-pair fraction, longest same-sign run, and lag-1/lag-3 turn correlation stay separate. Body-heading turn is measured separately. Turn-cap saturation means `abs(angularVelocity) >= 4.5 rad/s - 1e-12`. Travel/body alignment is the cosine between a realized segment and its endpoint body heading. Low speed is below `0.01` simulation units/s. A collision-constrained sample has the exact occupancy scale below `0.999`.

These are descriptive measurements of the sampled production trajectories. Window thresholds, low-speed cutoff, cap tolerance, and collision threshold are analyst choices; the measurements do not identify intent or explain why a turn occurred.

## Baseline summaries

Values below average complete per-ant windows within each seed. Signed accumulated path turning is near zero even as absolute turning rises with window duration; the local turn-sign and lag statistics show the oscillatory component that a single curvature score would hide. Chord/path stays near one at 1 s and decreases over 5 s. The body turn-rate cap is active in most sampled ticks, while direct collision scaling is uncommon in these runs.

| Seed | Valid 1 s windows | Abs turn (rad) | Signed turn (rad) | Chord/path | Same-sign pairs | Lag-1 turn r | Body cap fraction | Low-speed fraction | Collision fraction | Mean 5 s chord/path |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 10,555 | 1.339 | -0.010 | 0.991 | 0.094 | -0.632 | 0.883 | 0.111 | 0.00044 | 0.943 |
| 20261006 | 10,480 | 1.361 | 0.004 | 0.989 | 0.107 | -0.595 | 0.873 | 0.119 | 0.00103 | 0.921 |
| 20261007 | 10,447 | 1.355 | -0.005 | 0.991 | 0.093 | -0.642 | 0.882 | 0.116 | 0.00353 | 0.939 |

The shared helper also retains 2 s and 5 s signed/absolute turns, turn per distance, quantiles, same-sign duration, lag-3 correlation, body-turn totals, endpoint alignment, speed, and collision-scale summaries in each seed summary. These results motivate controlled investigation of turn-rate and noise/intent choices; they do not establish which factor produces the observed route geometry.
