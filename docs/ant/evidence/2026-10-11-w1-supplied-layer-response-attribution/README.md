# W1 supplied-layer response attribution — 2026-10-11

**Decision: Supported, inside the existing authored normalized solver only.** Under the prescribed rest-boundary fixture, adding the supplied `s0` layer changes the inherited `old` Plate's Float32 displacement. The first changes are reproduced by the added local Z-link terms in the existing worklet update. This is not evidence for ANT material formation, deposition work, intrinsic material character, supply generation, or organism consequence. W1 remains **Undecided / Research Gap**.

## Frozen setup

The audit starts from research HEAD `ab78e07339f120c6e07015de8c6850cfadadebd3` on `ant-w1-episodic-material-shadow`. At start the worktree was clean and the remote research ref matched HEAD. Remote `main` was `fbe3959934158f5a05e51926e89287d503804d05`; local `main` was stale and was not changed. The compiler and worklet hashes match the prior feasibility package.

The detached runner uses the existing compiler and an isolated VM of the production AudioWorklet source. It does not import or alter Plate-birth logic.

| Input | Fixed value |
| --- | --- |
| Source / solver grids | 96×96 / 32×32 |
| Old `old` mask | inclusive `x=30..66, y=44..50`; 39 solver nodes |
| Added `s0` mask | inclusive `x=48..76, y=44..50`; 30 solver nodes |
| Material / thickness | stiffness `.9`, density `1.1`, damping `.35`, thickness `.001` |
| Probe | one `old` strike at `(45/95,48/95)`, strength `.035`, radius `.012` |
| Solver / horizon | 48,000 Hz, 6,000 physics steps/s, 3,000 steps / 0.5 s |

The disjoint control moves only `s0` to `x=48..76, y=54..60` and pickup Y `58/95`. There was no parameter sweep, natural simulation, PCM analysis, or source change under `src/` or `static/`.

## Manipulation validity and controls

All validity checks passed:

- The old layer maps to the same 39 `(Plate ID, solver cell)` keys, coefficients, and within-layer neighbors in all comparisons.
- Before insertion and before the strike, both arms were at the declared all-rest boundary: zero current/previous displacement, awake and quiet state, pending wake, contact memory, and pulse ring.
- The strike target is inside the old source mask and outside the `s0` source mask. Its old-node ring increment matches across baseline and treatment at every node and pulse slot; `s0` receives no pulse increment.
- The overlap compiler produces 21 positive old/new Z links. The disjoint control produces zero. The strike's old-layer graph reaches those links.
- No changed message order, remapping, drops, route drops, non-finite state, or missed physics step was found.

| Control | Result |
| --- | --- |
| A/B: old-only reinstall baseline vs. old then supplied layer | Valid matched pre-step old state and pulse ring |
| C: install once vs. identical old-only reinstall | Exact dynamic-state parity for all 3,000 steps |
| D: no probe | Both topologies remain fully quiescent for 3,000 steps |
| E: disjoint supplied layer | Zero Z links; old state matches exactly and new layer stays zero |
| F: deterministic treatment replay | Exact full Float32 trace and dynamic-state equality |

Topology reinstallation was evaluated only at this all-rest boundary. No state-preservation claim is made for a moving or awake Plate.

## Results

The first old-node difference occurs at step 2. All three cells that differ at that first step lie on compiled old/new Z links; all are negative in treatment, as expected from a positive spring coefficient with zero new-layer displacement and positive old-layer displacement.

| Old solver cell | Old current before update | Added Z term after density normalization | First Float32 displacement delta |
| --- | ---: | ---: | ---: |
| 464 | `5.608144615365518e-9` | `-4.248594360728577e-14` | `-1.1368683772161603e-13` |
| 496 | `2.1634432414430194e-6` | `-4.916916227041998e-11` | `-4.9112713895738125e-11` |
| 528 | `4.314248144510202e-6` | `-9.805108959123457e-11` | `-9.822542779147625e-11` |

At cell 464, the new-node current is zero and the packed coefficient is `8.333333425980527e-6`. The local source update reconstructs binary64 next values `-1.851967703735967e-6` without that link and `-1.8519677462219107e-6` with it. Their Float32 outputs have bits `0xb5f89120` and `0xb5f89121`. Outward-rounded binary64 intervals put the linked result beyond the baseline Float32 rounding-cell boundary; the margin is about `7.95e-15`. The extra term excludes zero, the independently computed local update matches the instrumented source result, and all three first-step cells pass the same attribution checks. No arbitrary tolerance was used.

Over the fixed horizon, the maximum absolute old-node current difference is `0.005292651825584471` normalized solver displacement units at step 2,613. The treatment's new layer first wakes at step 6; it records 30 node wake transitions, 89,157 awake node-steps, and maximum absolute current/previous displacement `0.0022179395891726017`. These are solver states and layer-filtered metrics. Whole-processor telemetry is labeled separately in `artifacts/results.json`.

The complete 3,000-frame current/previous Float32 trace is saved for every arm. Each `trace-*.f32le` frame stores all current values, then all previous values, in the node order recorded in `traceInfo`. Per-step mismatch counts and maxima are included in the result JSON.

## Reproduction

From the repository root:

```powershell
node docs/ant/evidence/2026-10-11-w1-supplied-layer-response-attribution/run.mjs
node --test --experimental-test-isolation=none --test-concurrency=1 tests/w1-supplied-layer-response-attribution.test.js tests/surface-plate-worklet.test.js
```

The runner writes the deterministic traces, `results.json`, and `artifact-hashes.json` under this package's `artifacts/` directory. The test runner isolation flag avoids a Windows sandbox `spawn EPERM` when Node tries to create a worker; it does not change test logic.

## Integrity and limits

`artifacts/artifact-hashes.json` records every trace/result byte length and SHA-256 plus source fingerprints. It also records the exact compiler/worklet and prior feasibility fixture hashes; all four match the prior feasibility manifest. `reproduction-check.json` records an independent process replay and exact artifact parity. The prior feasibility package remains unchanged.

The local attribution hook exists only in the isolated VM replay. It adds a read-only capture immediately after the unchanged worklet update expression; the production worklet file stays unchanged. Its captured Float32 source locals are checked against an independent reconstruction of the Laplacian, bilaplacian, Z terms, source operation order, and Float32 output.

This result supports only the causal attribution of the fixture's marginal response within the existing authored normalized solver. It does not validate live insertion work, a physical deposition event, material conversion, natural ANT arrival, generalized state transfer outside rest, or any W1 ontology. Full suite, build, PCM, global solver stability/energy, and natural ANT replay were not run because this pass changed no production code and none is required to interpret the bounded raw-state comparator.
