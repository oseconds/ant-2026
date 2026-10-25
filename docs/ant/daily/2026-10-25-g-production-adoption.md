# Candidate G production adoption — 2026-10-25

## Decision

**ADOPTED G.** The user authorized production adoption after the candidate passed the independent readiness review. The adoption branch was cut from freshly fetched `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`; it was integrated to `origin/main` by non-force fast-forward at `fe9618db21910393e464d8f619665f340d9599e9`. Research histories were not merged wholesale.

## What changed

- Integrated the reviewed 316×316 Gaussian field and reference-area source conversion. The point-signal and authored source-dose API contract is explicit; native node sum is separated from the reconstructed/reference integral.
- Updated only the ANT chemical-memory section of the canonical hub to reflect G and its qualification limits.
- Included the validated test-only near-stop correction. Production movement code and authored movement constants remain unchanged.
- Preserved the production-candidate, near-stop, and readiness evidence packages, and added this adoption record.
- Corrected eight reusable evidence paths' stale 96×96 provenance/indexing, node-sum/source-dose comparisons, or unsafe historical-output defaults. No natural, audio, or browser runner was executed and no historical result was regenerated.
- Final validation after those runner corrections passed: `npm test` 339/339, build, `git diff --check`, `node --check` for all eight edited runners, and both founder evidence selfchecks. The default test/build attempts hit sandbox `spawn EPERM`; identical reruns with child-process permission passed. A one-tick seed-61 deposition-runner smoke passed its fixed-path reference-integral check (~`9.6e-9` relative error); its temporary output was deleted.
- Fresh adoption review caught and resolved one visual-evidence checkpoint metadata overwrite; the final read-only review approved fast-forward. The final metadata correction passed that runner's syntax and selfcheck; no browser capture was run.

## Validation and evidence boundary

- Candidate fixed-cue parity verifier: 24/24 raster hashes, 99,792/99,792 local reads, 138,600/138,600 wide reads exact.
- Saved three-seed 600 s natural-conformance verifier passed; no new world experiment was needed because production source blobs match reviewed G.
- Focused ANT production-path tests: 66/66. Full suite: 339/339. Build: pass with existing bundle/dependency advisories.
- Short Audio-Off browser evidence remains bounded: occasional RAF gaps are unattributed; Audio-On and exhibition-duration reliability are not established.

See [`adoption evidence`](../evidence/2026-10-25-g-production-adoption/README.md) for source hashes, integration receipt, validation commands/results, known limits, and the next broader ANT question.
