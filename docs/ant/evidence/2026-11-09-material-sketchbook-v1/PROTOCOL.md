# Material Sketchbook v1 — design and bounded observation protocol

Date: 2026-11-09 (Asia/Seoul). Main authority is `6dc73380b1985102bc2fb50da8963a7de5a89c71`; starting research authority is `150dc23f3252c201d18906f1b71570aeea552a7d`. Both GitHub refs were fetched and checked before work. Branch: `codex/ant-material-sketchbook-v1-open-laws-20261109`.

The author delegates concrete law/input/observation design. The choices below are research implementation choices, not artist approval of a material ontology. This pass builds two independent invented laws with controls. It preserves v0 A/B/C, Monitor Gain, frozen probes and all old evidence. It adds no audio, production integration or third model.

## Alternatives and chosen minimal representations

For subtraction, erasing an image or bond mask alone would show the input footprint without an internal material process. A moving-fragment/contact solver would add a different physical responsibility. We choose fixed-mass nodes, initially connected, with an incompatible preferred scalar edge offset, overdamped internal relaxation and irreversible bond weakening. Activity removes coupling; remaining strain can continue removal after activity stops. The control has the same initial mismatch and internal fatigue, but no activity. Thus autonomous initial-state relaxation is not misattributed to contact.

For local time, a displayed clock alone has no material consequence. A nonuniform local step applied to a claimed conservative mass flux can also create an unintended balance defect. We choose a nonconserved bistable organisation field with explicit energy and local positive mobility. Clock rate multiplies actual neighbouring-state/reaction updates. A paired sample uses exactly the same initial field and incoming activity with a spatially uniform rate equal to the local-rate field's mean at each tick. This distinguishes heterogeneous timing from merely slowing the whole material. The global mean is a diagnostic control, not an ANT behavioral input. Organisation is not mass; fixed unit node masses do not grow or vanish when organisation changes. This is richer than v0's independent leaky memory but is not a calibrated phase transition.

## Fixed laws before accepted observation

Both worlds have a 12×12 cardinal lattice, fixed `dt=1/60` global seconds and two unit-rate local virtual activity sources. Initial source positions are seeded; wandering sources choose one available cardinal neighbour every 0.5 s. Activity lasts exactly 40 s. The stationary condition keeps the same two initial positions. No-input is an explicit condition. These are synthetic activity counts, not observed force, ant deposition or real FOOT_CONTACT replay.

Subtraction uses scalar displacement `u=0`, bond `b=1`, preferred edge offsets uniform in `[-.04,.04]` from a separate seeded stream. Energy is `E=Σ b[(u_j-u_i)-r]^2/2`. Synchronous overdamped relaxation has mobility `.5`. After relaxation, `b'=max(0,b-dt[.35*mean(endpoint activity)+.005*s²/(.04²+s²)])`, where `s` is current edge strain. The no-activity control shares offsets and fatigue. A fatigue-off continuation removes only the `.005` term starting at tick 2400 (40 s), preserving exactly the earlier trajectory. Zero is an exact absent edge; no display/prominence threshold defines components. No mass transport, node motion, healing or acoustic interpretation is included.

Local time starts with organisation `phi=.5+.1*(2U-1)` from a separate seeded stream. Condition `q` evolves by `dq/dt=a(1-q)-q/20`, where activity is the direct count of the two sources and lies in `[0,2]`; local rate `r=1/(1+4q)` is positive and bounded. Local age integrates `r dt`. Each sample updates `phi` with `dt*r[.05 Σ(phi_j-phi_i)+.4 phi(1-phi)(phi-.5)]`; the uniform control uses the current spatial mean of `r` at every site. Both use one common global tick and identical external activity. Energy is `.05 Σ_edge(phi_i-phi_j)^2/2 + .4 Σ phi²(1-phi)²/4`. A coupling-off ablation removes only `.05 Σ`; it checks the contribution of spatial interaction, not a third material model. No-input must make the two samples exactly equal with rate one.

Boundaries have only existing cardinal edges. Fixed positions are observation sites, not a growing mesh. Model notes detail ordering, numerical bounds, state and omitted responsibilities.

## Bounded exploration

Before measured results, fix seeds **20261005 and 20261006**, input patterns **wander and stationary**, and checkpoints **0, 20, 40, 120, 300 s**. Record every case, including no split, weak difference, simple destruction, convergence and nearly invisible change. The no-activity subtraction control is paired in every case. Local-time uniform control is paired in every case; additionally run no-input once per seed. The fatigue-off and spatial-coupling-off ablations use only seed 20261005 / wander at the same checkpoints.

No aesthetic seed search, parameter sweep or result-driven retuning follows this declaration. Before implementation observations, independent design review refined the local-time comparator to mean-matched rate and the fatigue ablation to an identical-state continuation. Repairs to correctness/interface errors must be disclosed and invalid captures rejected. Default browser frames are the fixed seed 20261005 / wander at every checkpoint, plus an internal-state view at 120 s. Other cases retain numeric records rather than selected attractive images. A 1000 s finite-state check is validation, not an enlarged art search.

## Page, recording and scope

Add `material-sketchbook-v1.html` and `src/sketchbook-v1/`; add a third Vite HTML build entry. Reuse unchanged v0 pure helpers only. Both paired samples remain visible, with run/pause/reset, seed, input pattern, simulation time, speed and optional diagnostics. Normal view is monochrome, fixed scale and state-derived. Internal scalar displacement is not rendered as a claim of moving fragments; local age is distinguished from actual organisation.

Records store schema, model, seed, input pattern, tick, configuration and full state. Replay reconstructs the declared law from initial conditions and checks the full state before replacing the current world. One-hour page/replay bound prevents unbounded file-driven work. Rendering reads state; it never steps a model or consumes RNG. No AudioContext/AudioWorklet/monitor/probe is installed in v1.

## Implementation plan and acceptance

1. Add a small shared deterministic activity-input module and schedule validation. It is an external input helper, not a shared material law.
2. Implement subtraction and its paired control in `subtractive.js`; test energy accounting, monotone bonds, exact edge/component semantics, deterministic/inert observations and long finite states.
3. Implement local time and its paired uniform control in `local-time.js`; test bounded fields, real state/age change, no-input equality, energy descent, spatial coupling and long finite states.
4. Add the isolated page/app/styles and Vite entry. Test real controls, seed/input reset, recording/replay, rejection of malformed records and state isolation.
5. Run bounded cases/ablations into the new evidence package. Capture built-preview browser frames with requested tick, state tick and displayed time asserted before accepting a frame. Keep numeric and visual inference distinct.
6. Run existing tests/build, fresh v0 browser smoke and production-entry load; independently review equations and final claims. Guard all production paths and existing v0 sources/evidence against the starting research SHA. Generate/verify SHA-256 manifest. Commit/push scoped results; no PR/merge/adoption.

Review focus: autonomous fatigue in the subtraction control; exact versus merely weak connectivity; confusion between organisation and mass; unequal local integration with one global tick; replay limits/validation; stale HMR captures; old v0 regression failures. The accepted browser route uses a built preview rather than live HMR.
