# Raw previous-turn displacement feedback qualification

Date: 2026-10-23 KST  
Baseline revision: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`  
Parent question: [Gate A](../GATE-A.md) supports a conditional feedback effect and records frequent production-origin high-omega actuator hits. This screen asks whether one derived feedback representation clears the known controlled mirrored-arc and S-curve failures. It does not revisit field representation or natural-history outcomes.

## Candidate law

At each fixed `dt = 1/60 s` tick, let `A` be the updated `trailAdherence`, `omega` the entry-state realized angular velocity, and `s` the existing local trail steering sample. The only candidate behavior change is:

```text
localCue = s * (0.35 + 0.65 * A)
feedback = -0.65 * A * omega * dt
localTurn = clamp(localCue + feedback, -0.45, +0.45)
```

The raw term uses `agent.angularVelocity` directly. It removes the additional `+/-2.2 rad/s` clamp used by production and the existing `dtFeedback` control. The existing local-turn clamp, `turnToward` actuator limit of `4.5 rad/s`, velocity response, collision, gaster deposition, field, material and recruitment remain as implemented. Since the realized previous turn rate is actuator-bounded, this term is at most `0.65 * 4.5 / 60 = 0.04875 rad` before adherence.

This is a raw previous-turn displacement representation. It is not claimed to repair units, to be optimal, or to be production-ready.

## Required controls

Run four generated controllers on identical fixtures:

1. `production`: `-clamp(omega, -2.2, +2.2) * 0.65 * A`.
2. `dtFeedback`: the same clamped rate term multiplied by `dt`.
3. `dampingOff`: feedback term set to zero only.
4. `rawDisplacement`: the candidate law above.

Use the existing `makeSpatialController` source generator for production, `dtFeedback` and `dampingOff`. Generate the raw candidate from the same production controller source, with single-occurrence guards and a receipt for both removal of the clamped-rate temporary and replacement of the feedback expression. All four arms use the same north-initialized, one-ant controlled fixture; arm initialization and each pass reset the same seeded RNG. Do not infer post-divergence RNG parity.

## Fixed controlled family

- Shapes: `straight`, `gentle`, `tight`, `gentleMirror`, `tightMirror`, `sCurve`, using the existing route-probe definitions. The circular arcs retain the existing radii `0.25` and `0.10`; mirrors reverse signed curvature; the S-curve remains the existing synthetic sinusoid.
- Field modes: `analytic` uses the existing fixed smooth Gaussian route sample; `deposited96` uses the existing production segment-deposition helper on the 96x96 field, then freezes field samples during the pass.
- Seeds: `19`, `61`, `193`.
- Duration and step: exactly `3 s`, `180` ticks at `1/60 s`.
- Total: `6 x 2 x 3 x 4 = 144` cases. Preserve every result and per-tick sample; no selection, omission, retuning, or replacement based on outcomes.

The synthetic fields and routes are engineering controls. They do not establish natural route intention, biological curvature sensing, or ecological validity.

## Instrumentation and verification

Keep the existing route fixture and pass implementation. Load its private exports from a source copy, recording the original hash and guarding the one instrumentation substitution that makes its reported feedback term use the generated arm's exact law. The actual generated controller remains the movement intervention. Also record controller-source hashes, the production-generator receipt, the raw-controller before/after hashes and replacement receipts, field construction details, seed, shape, field mode, tick count and random draws.

For every tick, retain the feedback input and term, local steering term, unconstrained and clamped local turn, realized body turn, collision scale and route sample. Preserve the existing complete movement sample and summary metrics, including route progress, route-turn sign agreement, mean and p90 absolute cross-track distance, cap fraction, speed and heading error. Assert one ant, exactly 180 samples/ticks, finite movement state, and the production turn-rate cap. The source guard must fail closed if an expected expression is missing or duplicated. Any reported candidate feedback term must agree with the generated source expression for that tick; a legacy production/dt formula may not be silently used for `rawDisplacement`.

Report each shape × field × seed × controller cell separately. Do not pool seed cases as independent replicates, suppress negative cells, rank/tune parameters, or use an aesthetic threshold.

## Recurrence and counterexample boundary

For a stripped, unsaturated recurrence with fixed adherence `A` and a constant weighted local cue `c`, the candidate reduces to:

```text
deltaTheta[n] = c - 0.65 * A * deltaTheta[n-1]
```

Its pole is `-0.65 * A`, with magnitude at most `0.65` for `A` in `[0,1]`; that reduced recurrence has a decaying alternating transient. Under a sustained cue it settles at `c / (1 + 0.65 * A)`, which is about `0.606 c` at `A = 1` (about 39.4% attenuation). Thus a smoother transient can still suppress a persistent same-sign bend. The full controller has changing cue/adherence, decision clocks, clamps, velocity lag, occupancy, deposition and field feedback; the reduced pole is not a full-loop stability or route-following proof.

The prior deposited-field `gentleMirror`, `tightMirror` and `sCurve` cases are the fixed counterexample family, with all three seeds retained. Examine signed route-turn agreement, progress and cross-track together in those cells, and compare raw against all three controls. A repeated direction-loss or route-departure failure in any of these fixed cases is a valid controlled counterexample: stop candidate escalation and report it. Mixed tradeoffs or too few `|omega| > 2.2` ticks to exercise the changed branch are indeterminate and also stop escalation. Clearing this screen only earns a report to the parent for a next-gate decision; it does not authorize a natural 600 s run, the 66-state replay, a gain grid, or production changes.

## Boundaries

Only new qualification tooling and artifacts under this directory are in scope. Do not edit production source, audio, existing frozen captures/results, existing probes, or existing controller builders. Do not change material union, renderer or recruitment. Preserve complete outputs and logs. No commit, push, PR, merge, or adoption is part of this pass.
