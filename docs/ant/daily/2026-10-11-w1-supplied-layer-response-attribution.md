# 2026-10-11 — W1 supplied-layer response attribution

**Status:** Supported within the existing authored normalized Plate solver. **W1 formation remains Undecided / Research Gap.**

**Evidence:** [Reproducible audit, controls, Float32 traces, and hashes](../evidence/2026-10-11-w1-supplied-layer-response-attribution/README.md).

## Starting state

- Branch `ant-w1-episodic-material-shadow`, HEAD `ab78e07339f120c6e07015de8c6850cfadadebd3`; clean worktree and exact remote research ref.
- Remote `main` was `fbe3959934158f5a05e51926e89287d503804d05`; local `main` was stale. No branch or production source switch was needed.
- Read the ANT state hub, Plate-native contract, prior feasibility evidence, daily chronology, compiler, worklet, existing worklet tests, repository guidance, and required `caveman` skill.
- Prior feasibility fixture source/compiler/worklet hashes matched its committed manifest. That package was preserved unchanged.

## Procedure

Built a detached Node VM runner using the production topology compiler and unchanged worklet source. It ran A–F at fixed geometry and parameters, saved every arm's 3,000-frame current/previous Float32 traces, and recorded per-layer activity plus whole-processor diagnostics.

The baseline and treatment both began with `old`, then reinstalled old or appended `s0` at an all-rest boundary, then received the same single old-target strike. Reinstall, no-probe, disjoint-layer, and deterministic-replay controls used their prescribed message order. No sleep, coupling, pulse, damping, or coefficient behavior was changed.

## Findings

- The old layer maps to the same 39 `(Plate ID, solver cell)` nodes, coefficients, and within-layer topology. The added layer has 30 nodes and creates 21 overlap Z links. The disjoint layer creates zero Z links.
- At the insertion boundary, displacement, awake/quiet, pending wake, contact-memory, and pulse-ring state is zero. Before physics stepping, the old-node contact pulse distributions and memory match exactly; the added layer receives no pulse. The hit region reaches the overlap links through old-layer adjacency.
- The first old displacement difference occurs at step 2 in solver cells 464, 496, and 528. The local update hook records source values immediately after the unchanged source expression. An independent reconstruction of lap/bilaplacian, packed Z terms, source-order binary64 operations, and Float32 assignment reproduces each source `next` and stored result. The bounded Z term crosses the relevant Float32 rounding boundary; no tolerance is used.
- The largest inherited current difference is `0.005292651825584471` at step 2,613. This is normalized solver displacement, not a physical unit. `s0` first wakes at step 6, with 30 node wake transitions and 89,157 awake node-steps; maximum new-layer current/previous magnitude is `0.0022179395891726017`.
- Reinstall-once/twice traces match exactly; no-probe arms remain silent and inactive; the disjoint treatment exactly matches old-node state and leaves its new layer at zero; treatment replay is exact. All arms completed 3,000 physics steps with zero drops, route drops, non-finite state, and trace non-finite values.
- A separate Node process reproduced all nine trace files, results JSON, and artifact manifest byte-for-byte. Prior feasibility compiler/worklet/script/results hashes still match.

## Interpretation and boundary

The controlled result supports the single hypothesis: in this rest-inserted fixture, the first inherited-node difference is caused by the local Z-coupling term already present in the normalized solver. It validates no live insertion work, supplied material history, ANT-generated arrival, physical deposition, constitutive conversion, supply activation, or organism consequence. Reinstallation was checked only at the declared all-rest boundary. There is no claim about global stability or energy, audibility, or W1 material ontology.

## Validation

- `node --check docs/ant/evidence/2026-10-11-w1-supplied-layer-response-attribution/run.mjs` passed.
- Focused `surface-plate-worklet` and new attribution tests passed **26/26** using `node --test --experimental-test-isolation=none --test-concurrency=1 ...`. The default worker launch first hit Windows sandbox `spawn EPERM`; the same tests passed with test isolation disabled, leaving test logic unchanged.
- Independent process trace/result/hash reproduction passed for all 10 listed files plus the artifact manifest.
- Full `npm test` and `npm run build` were not run; no production code changed.

No natural simulation, parameter sweep, additional formation experiment, ontology change, merge, or PR was performed.
