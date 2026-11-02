# Material Sketchbook v0 — bounded discovery protocol

Authority: remote main `6dc73380b1985102bc2fb50da8963a7de5a89c71`, verified at start. Branch: `codex/ant-material-sketchbook-v0-20261102`. This is a discovery page with three independent invented materials, not an ANT production change or a physical-material claim.

## Fixed exploration boundary

All models use a fixed `1/60` model-second update and default seed `20261005`. The initial browser evidence will use exactly that seed and simulation times 0, 30, 120 and 300 seconds for every sketch. No seed search, parameter scan or post-result tuning is used to obtain an attractive image or sound. Slow, silent, stationary and weak results are retained. Additional long-run finite-state checks are validation, not new artistic candidates.

Each model records its equations, parameters, initial state and input schedule before the first accepted browser observation. A has separate mass, disturbance and bond fields, with conservative transport and explicit supply. B applies the same two input types and durations in opposite order to two equal samples; its internal memory changes the mechanical response through one shared law. C keeps geometry and mass fixed while redistributing a declared total coupling capacity. None calls production ANT modules.

## Small common observation contract

The independent model modules export `ActivityWorld`, `MemoryWorld`, and `CapacityWorld`. Each instance has `tick`, `seed`, `step()` at the fixed step, `view()` for the renderer, `snapshot()` for a JSON-serializable complete receipt, and `mechanics()` returning a list of frozen-state observation graphs. Rendering and probe observation consume no simulation RNG and do not mutate a model.

The graph contract is `{label, positions: [[x,y]], masses: [m], ground: [k], damping: [c], springs: [[i,j,k]], contact?: [0…1]}`. Contact defaults to one. Optional contact attenuates both the applied impulse and readout without renormalizing attenuation. It lets A's initially absent material remain silent. This contract is an observation representation only; it does not unify the three formation laws. Graph coefficients are derived from each model's current state. The common probe applies one declared spatial impulse and integrates small scalar displacements on that graph. Time/frequency scaling and pickup geometry are shared across models and documented. No per-sketch preset tone, event sound or RMS matching is used.

The probe is a counterfactual response of a frozen current-state graph, not continuous production audio or feedback into slow material formation. Audio is optional; its waveform and response data can be inspected with sound disabled. Web Audio resources are created only after a user gesture.

## UI and recording

A separate `material-sketchbook.html` entry provides model selection, run/pause/reset, seed, simulation time, display speed, probe, optional diagnostics, and a portable record. Switching models starts a fresh independent instance. Records include seed, model/version, exact tick, input/configuration, full state and a noncryptographic replay digest; replay rebuilds from initial conditions and checks the full regenerated state. SHA-256 evidence hashes are separate from that UI convenience digest.

The default view remains monochrome and state-derived. Diagnostics expose mass/disturbance/bond for A, paired internal memory for B, and connection capacity for C. B remains side-by-side. UI controls do not rewrite material parameters after seeing results.

## Completion checks

- Deterministic same-seed/input states; independent instances and model switches.
- Actual pause/reset/record/replay behavior; finite extended-run states.
- B input ledgers preserve type totals and durations while changing order.
- C's declared capacity condition holds; geometry and masses stay fixed.
- Probe reads current graphs, leaves the source state unchanged, and produces finite deterministic response data.
- Actual browser execution, fixed-time captures, no page errors, optional audio playback path.
- Existing `npm test` and `npm run build`; the original ANT page stays functional.
- Source/evidence independent review, manifest verification and scoped Git delivery.

No production AntController, movement, recruitment, gait, SurfaceField, TrailPlateBirth, MaterialStratigraphy, Plate/Z worklet, renderer, previous evidence or ANT decision register is changed. No new dependency, PR, merge or adoption is required. The Vite build may add the isolated HTML entry while preserving the existing main entry.
