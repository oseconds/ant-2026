# Validation and scope

## Passed

- One paired current-G/H0 natural acquisition, seed20261005,60Hz,Audio Off:3,601ticks, exact per-tick agent/lifecycle/scheduling/RNG parity. Complete dynamic checkpoints match at0/30/60s and target tick. Duplicate60s anchor is retained as capture chronology, not an independent checkpoint.
- Full F replay exactly reproduces the executed natural target tick, including queries, policy, motor, all-agent state, event hash, field hashes, schedule and random context trace. Both frozen analyses produce identical results.
- Symmetric author sums: all nodal/read values finite and nonnegative; actual replay post-decay Float32 nodes match the captured full input exactly. No subtraction/clamping, extra RNG or input-query-list assumption.
- F-versus-Fhat selected option family/RNG unchanged; motor sham exactly zero and within registered ceilings. The report distinguishes sampled reconstruction error from author-sum residual.
- Strict deep frozen-packet equality, exact nested world/alive/retired/full byte equality and disk packet SHA pass after replay. V8 reserialization hashes are recorded separately. Source correction is confined to two explicit buffer-copy expressions; captured original helper is preserved/hash-verified.
- [Focused tests](validation/focused-final.log):3/3 pass, zero failure. Existing observer fixture plus frozen codec/sampler fixtures.
- [Frozen final check](validation/frozen-final-check.log): `--check` exits0 with deterministic duplicate, exact natural sham and input preservation.
- Both new modules pass syntax checks; Git whitespace/scope checks pass. Production src/static/canonical guide remain identical to fresh main and research parent. Package hashes and staging parity recorded separately.

## Failure retained and diagnosis corrected

Initial replay stopped on `sha(v8.serialize(packet))` changing. Actual captured disk bytes were saved before that replay and remain exact. A buffer-alias explanation was suggested, then downgraded when independent old-path checks on the captured packet did not reproduce actual input-byte mutation. Buffer copying is a defensive isolation change, not an established repair of measured world corruption. Original logs, source and superseded/unaccepted derived outputs are preserved. No natural acquisition was repeated.

## Interpretation gate

The selected case has zero local retired input and no changed selected direction. It establishes a small wide-policy-state change with **no one-tick realized motor effect in this state**. No continuation, retirement-censor window or inscription consequence was measured. It cannot refute the old284/1507 policy effect or transmission in those changed-choice states. Independent review checks this distinction explicitly.

Not run: full `npm test`, build, browser/audio/AV, new seed, mature world or post-tick causal continuation. Production is unchanged; focused tests, exact natural full-tick sham and deterministic frozen replay directly validate this research scope. No repository-wide test/build success or artistic claim is made.
