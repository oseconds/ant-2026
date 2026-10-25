# 2026-10-25 — G isolated-ant near-stop fixture validity

Replayed the exact 60 s isolated-ant fixture for C/G and seeds 9/52/240 with passive lifecycle, hesitation-state, and RNG-call capture. G/240 retired at 22.3667 s; the only hesitation began during the excluded warm-up and reached the authored near-stop. Its eight measured-window inspection draws all exceeded 0.23. The old test then counted 2,259 post-removal moving samples from the detached object, including the exit-tick sample; only 867 moving samples came from active ticks.

Controlled scheduler and braking/resumption probes pass for 96 and 316 fields. Replaced the stochastic count assertion with those deterministic behavior-contract tests; production source and constants are unchanged. Controller tests passed 23/23, full `npm test` passed 339/339, and `npm run build` passed with existing dependency/chunk warnings. Repeated diagnostic output is byte-identical.

**Decision: TEST CONTRACT OVER-SPECIFIED — NEAR-STOP BLOCKER CLEARED.** This clears only the isolated-ant test blocker; the separate browser frame-gap risk remains open. Full details: [evidence package](../evidence/2026-10-25-near-stop-fixture-validity/README.md).
