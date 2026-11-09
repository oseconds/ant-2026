# Validation — Material Sketchbook v1

## Authority, isolation and preserved material

The pass starts from `150dc23f3252c201d18906f1b71570aeea552a7d` on the v0 research branch, with GitHub main `6dc73380b1985102bc2fb50da8963a7de5a89c71`. The primary worktree was clean at start; the new branch is `codex/ant-material-sketchbook-v1-open-laws-20261109`. No additional worktree was created. Existing worktrees and ignored research material were preserved.

Allowed changes are the independent v1 HTML/modules/tests/scripts/evidence/daily, an additional Vite HTML entry, and scoped LF/binary attributes. All production paths, original entry, dependencies, v0 sources/tests and previous evidence remain unchanged against their appropriate authorities. The evidence verifier rejects tracked changes outside this scope. It also hashes the unchanged pure helper imported from v0. Old evidence manifests are not rewritten to describe newer branch code.

## Executed checks

| Command or check | Result | Receipt |
|---|---|---|
| `node --test tests/material-sketchbook-*.test.js` | **29 pass / 0 fail**: 15 existing v0 tests and 14 v1 tests | [focused log](sketch-test-output.txt) |
| `npm test` | **369 pass / 2 fail / 371 total** | [full log](test-output.txt) |
| `npm run build` | **PASS**, production/v0/v1 entries emitted | [build log](build-output.txt) |
| `node scripts/material-sketchbook-v1-observe.js` | **12 cases / 60 checkpoints verified**, saved payloads and reruns match | [verification log](data-verification.txt), [data manifest](data/manifest.json) |
| Built-preview Chrome check | **PASS**, zero page/console errors | [browser receipt](browser/browser-check.json) |

The full suite is **not fully passing**. Both failures are unchanged existing ANT assertions:

- `tests/ant-controller.test.js:166`: expects the old north-biased recruitment heading; current production uses the adopted isotropic/flow-conditioned rule.
- `tests/ant-renderer.test.js:170`: historical-mask draw/cache assertion expects 2 calls but gets 1.

The source/test paths are identical to the starting authority, and v1 is not imported into their execution path. Their failure is retained rather than repaired in this pass. Initial model-agent `node --test` attempts encountered sandbox `spawn EPERM`; direct in-process node:test execution then passed, and the final authorized full/focused commands above exercised the normal runner. EPERM is not counted as a model result. Build retains the existing large shared-lab bundle warning; no unrelated optimization is included.

## Numerical and model checks

The three new test files cover deterministic bounded activity and its stop/dose schedule; subtraction monotonicity, input/control distinction, exact component enumeration, energy accounting, snapshot-copy isolation, scheduled same-state continuation and 1000 s finite states; and local-time input-free equality, same-mean clocks, real organisation/age changes, spatial coupling, condition recovery, bounded fields, snapshot copies and 1000 s energy descent.

Subtraction's fixed-bond energy has graph-Laplacian Hessian with largest eigenvalue at most 8 (degree ≤4 and `b≤1`). Explicit descent with mobility `.5` and `dt=1/60` has `dt*.5*8 < 2`. The next damage update only decreases nonnegative coefficients of squared strain, so it cannot increase that potential. The ledger separately measures relaxation loss and energy removed at each damage update. It does not assert conservation of mechanical energy or measured physical dissipation.

For local time, `q` is a convex Euler update toward `a/(a+.05)` because `dt*(a+.05)≤.0342`; direct counts are bounded by two. Thus `q∈[0,1]` and `r∈[.2,1]`. Organisation remains in `[0,1]` for the chosen step: the largest inward/outward linear coefficient is bounded by `D*degree + γ/2 ≤ .4`. The energy Hessian has an upper/spectral-norm bound `.6` on that cube (diffusion at most `.4`, potential curvature between `−.1` and `.2`). The positive-mobility step has ample descent margin at the declared fixed step. Tests and saved checkpoints independently check finite bounded values and energy nonincrease to numerical tolerance.

These bounds concern this finite graph, polynomial law and fixed parameters. They do not establish a continuum model, resolution independence, physical-material accuracy or calibrated units. No numerical/visual tuning sweep was performed.

## Observation campaign and causal checks

The core campaign has 2 seeds × 2 input patterns × 2 worlds, each at 0/20/40/120/300 s. Two T no-input cases, one S continuation with fatigue disabled at tick 2400, and one T coupling-off case complete the twelve cases. These variants were fixed before accepted observation. The generator supplies 80 node-seconds of activity per active case; no physical pressure, force or deposited mass is inferred.

The saved-state verifier loads all case files, hashes every complete state and checks against its stored digest, the data manifest and a fresh deterministic rerun. It also checks finite state, fixed geometry, monotone bonds, S energy residual, T energy/rate/condition/organisation bounds, paired mean-age agreement, no-input equality and input receipts. The fatigue continuation shares exactly the same physical arrays through 40 s; subsequent bond change is isolated from differences in earlier activity history. T's mean-matched control avoids attributing average slowdown to spatial heterogeneity.

Only two seeds were explored. The second seed's retained organisation difference is bounded to 300 s; no claim about final attractors is made. The D=0 comparison shows that a paired difference can also arise without spatial coupling. S's component count mostly represents isolated single nodes, not multiple large new bodies. See [observations.md](observations.md) for all conditions and negative results.

## Actual browser and fixed presentation

The browser receipt identifies Chrome, viewport, canvas size, fixed seed/pattern and capture method. The accepted route is built Vite preview, not HMR. The page runs both models and their controls. Each of the ten default frames is checked against the requested tick, snapshot tick and visible global time. Replay reconstructs a fresh model and compares full serialized state before the frame is accepted. Thirteen PNGs include those ten frames and S displacement / T rate / T age diagnostics at 120 s.

Captures come from the actual browser canvas at native **1200×520**. The renderer fills the same fixed `#f6f5ef` background used by CSS, then draws state. No image processing, frame normalization, intensity matching or selected favourable seed is used. An initial DOM-element capture clipped a label; native export removed that viewport artifact. An initial native export exposed canvas transparency; filling the existing display background in the renderer makes the exported evidence match the actual page. Only the final opaque native captures are accepted. Neither correction changes numerical state or visual scales. The nearly blank default T300 state is preserved.

The harness checks actual execution advances beyond its starting tick, pause holds state, seed/input resets, model isolation, download/file-upload replay and invalid/tampered record rejection without replacing the current state. Tick 216000 is accepted and tick 216001 rejected. V1 constructs **zero AudioContexts**. Diagnostics describe the last completed update's input at the 40 s boundary, rather than a new input after supply stops.

A fresh v0 page checks A's unchanged probe PCM through a listen gesture with Monitor Gain/peak controls, plus B/C probes at 40 s leaving source state unchanged. The production entry loads ANT with its existing four model controls. This is a browser regression smoke plus byte-preservation guard, not a new natural ANT/audio trajectory campaign. Cross-browser rendering and cross-engine bit-exact replay are unproven.

## Review, fixes and hashes

Fresh independent mathematical/code/claim review checked controls, signs, energy/bounds, state isolation and evidence arithmetic. During implementation, a shallow copy of the local-time configuration array was repaired and given a regression assertion; serialized model values and all physical parameters were unchanged. Before final delivery, the reviewer rechecks the final sources, report, measurements and browser receipt. The initial design review refined controls before observation; no measured outcome prompted law or seed tuning.

The top-level manifest covers v1 source/tests/scripts, fixed evidence, the imported helper, entry/config/line-ending metadata and daily note. It also includes the inner data manifest. SHA256SUMS hashes these files and the top-level manifest; neither self-hashes recursively.

```sh
node scripts/material-sketchbook-v1-evidence.js --write
node scripts/material-sketchbook-v1-evidence.js
```

Normal invocation verifies without writing. `--write` explicitly refreshes the top-level manifest/checksums. Observation/browser `--record` commands intentionally replace only generated v1 data/captures. Preserve a committed copy and compare hashes when regenerating; do not overwrite old evidence packages.

No production coupling, audio implementation, third world, PR, merge or adoption was performed.
