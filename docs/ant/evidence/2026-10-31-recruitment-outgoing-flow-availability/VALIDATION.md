# Validation receipt

- Authority checkout was verified at 301f0740c9fe2e0697e31a716f7226cb2112ede7 before execution.
- Node syntax check passed for scripts/ant-recruitment-outgoing-flow-availability.js.
- Runner source-lock checks and signal self-checks passed.
- Three natural 600 s histories completed: 20261005, 20261006, 20261007.
- Seed 20261005 observer parity passed: 36,000 RNG/state boundaries, 36,000 complete agent-state checks, 600 full public snapshots plus initialization.
- Final event readback independently recalculated segment eligibility, unit directions, N, q, R, w, availability, per-window counts, placement attempt totals, and the GO gate. All assertions passed.
- Final SHA-256 manifest covers this receipt, the report and protocol, runner, daily note, source hashes, and all raw result files.
- Staged blob bytes matched every manifest entry and .gitattributes; staged diff whitespace check passed. No production source path is staged.
