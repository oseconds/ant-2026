# Validation receipt

## Source and input identity

- Remote `origin/main` was checked before work and resolved to `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Work began on `codex/ant-material-feedback-space-20261030@3b61f995c8e514e848b1d4133812fa855db92c04`; the worktree was clean.
- Every file listed in the frozen source-hash receipt was re-hashed and matched. The paired input, source stream and saved raw-position hashes also match the existing probe's receipt.
- The final locality data gzip is `687c45a39553da389f6fda0d0f12414475cfb65f402bd486a71aabda8266b3e7`.

## Replay and solver checks

- The replay consumes all 100,882 frozen control requests in order, uses all 36 actual masks at tick entry, and evaluates all 600 saved post-tick snapshots (10,880 recipient rows).
- No `AntController.tick`, movement, source creation, contact, Plate formation or RNG call occurs. A/B/C are observational field inputs only.
- Native and residence profile parity with the prior probe passes for all 10,880 saved recipients. The five saved native projected maps, five residence projected maps, native node sums and reconstructed integrals pass exact parity.
- Solver self-checks cover an uncapped scale, cap clipping, impossible support capacity, zero field and the native wide Hill response. At all analyzed times C is feasible, the cap affects zero nodes, and the maximum relative residual is `6.2031e-10`.
- `node scripts/ant-material-chemical-residence-locality.js --check` completed a full deterministic rerun and matched compressed data and compact results byte-for-byte.
- `git diff --check` passes. No production `src/`, `static/` or canonical `docs/ant/README.md` edits were made.

## Verification corrections and test-runner limit

Two early analysis attempts stopped on verifier issues before interpretation. First, JavaScript JSON receipts normalize negative zero, while strict in-memory equality distinguishes `-0` from `0`; parity now compares the JSON representation used by the frozen artifact. Second, checkpoint summary statistics are in the compact `results.json`, while projected arrays are in the detailed gzip; the verifier now reads each from its actual source. Neither correction changed the field law, frozen data or measured values. The final exact parity and deterministic rerun pass.

A fresh independent Max-reasoning review accepted the narrow readout decision with no measurement blocker. It found that the initial plan described bisection at every time, while the implementation uses the closed-form scalar ratio when it is uncapped and only bisects if clipping would occur. This discrepancy is now recorded in the plan and here. Every actual read was uncapped, the closed-form ratio is the node-sum root for those reads, and observed residuals remain as reported; the result was not regenerated under a different field or control.

The focused `node --test` invocation could not start its child process in this environment (`spawn EPERM`). Equivalent mass-solver assertions ran in-process and passed, and the diagnostic's `--self-test` also passed. Full repository build/test was not run; it is outside this research-only scope.

## Review and interpretation boundary

The decision uses descriptive paired distributions from one frozen history. Repeated seconds/ants are not independent trials. It supports local information at the native local-sensor/readout level in the available snapshots; it does not validate behavioral response, a favorable artistic meaning, a cross-seed effect or production adoption.
