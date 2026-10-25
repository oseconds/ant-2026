# Adoption validation receipt

## Authority and integration

- Previous `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Adoption branch: `codex/ant-g-production-adoption-20261025`.
- The branch was based directly on the freshly fetched previous main; only reviewed G production changes, the validated near-stop test correction, and associated review/test evidence were brought forward.
- Adoption branch tip at production integration: `fe9618db21910393e464d8f619665f340d9599e9`.
- Integrated `origin/main` commit: `fe9618db21910393e464d8f619665f340d9599e9` (non-force fast-forward from the previous main).

## Source and fixture conformance

- All three production-source Git blobs match reviewed Candidate G; see [`SOURCE-CONFORMANCE.json`](SOURCE-CONFORMANCE.json).
- Existing G candidate parity verifier: pass, 24/24 exact raster hashes, 99,792/99,792 exact local raw reads, 138,600/138,600 exact wide raw reads, zero mismatches. Receipt: [`FIXED-CUE-PARITY-RECHECK.json`](FIXED-CUE-PARITY-RECHECK.json).
- Inputs came from pinned, already validated research refs: 96-grid physical write-stream provenance `origin/codex/ant-cic-writer-qualification-20261024`; frozen query positions and 316-G rows/manifests from `origin/codex/ant-raster-backed-fixture-20261024` and `origin/codex/ant-316-gaussian-dose-unit-qualification-20261024`. They were read into a temporary directory for verification and were not added from those research branches.
- Saved natural conformance verifier: pass for all three 600 s G traces and five checkpoints per seed. Reused result: [`NATURAL-CONFORMANCE.json`](../2026-10-25-g-production-candidate-review/NATURAL-CONFORMANCE.json).
- Near-stop diagnostic/test correction: controller 23/23, full suite 339/339, build pass in the validated correction receipt. See [`near-stop validation`](../2026-10-25-near-stop-fixture-validity/VALIDATION.md).

## Adoption-branch validation

- Focused production-path tests (`PheromoneField`, Gaster deposition/integration, controller, ColonyActivation, TrailPlateBirth, renderer): 66/66 pass.
- Full `npm test`: 339/339 pass.
- `npm run build`: pass. Existing Rollup dependency-annotation and Vite large-chunk advisories remain.
- `git diff --check` and `git diff --check origin/main`: pass after the documentation edits.
- Final independent read-only adoption review: approved fast-forward after correcting the visual evidence runner's duplicate-key and missing `audioEnabled` checkpoint field. See [`INDEPENDENT-REVIEW.md`](INDEPENDENT-REVIEW.md). The reviewer did not rerun tests/build or launch the browser capture.
- Production-source comparison against Candidate G: all three Git blobs match exactly; no production source was changed after the comparison.
- Production runtime-source diff against `origin/main` is limited to the reviewed three files: `PheromoneField.js`, `AntController.js` analysis fields, and `src/main.js` diagnostic label.
- Adoption review corrected eight reusable evidence paths for the G default: `surface-long-run-evidence.js`, `ant-deposition-evidence.js`, `ant-long-run-evidence.js`, `ant-founder-controlled-probes.js`, `ant-founder-evidence.js`, `ant-founder-visual-evidence.js`, `surface-audio-evidence.js`, and `stratigraphy-long-run-evidence.js`. Corrections cover stale 96-grid metadata/indexing, native node sum versus authored dose, explicit node-sum/reference-integral diagnostics, and safe rerun destinations. Existing historical packets were not rewritten; no natural, audio, or browser runner was executed. Syntax checks and the two founder evidence selfchecks pass.
- After all eight runner edits, `npm test` passed 339/339 and `npm run build` passed; Rollup dependency-annotation and Vite large-chunk advisories remain. Both commands first hit sandbox `spawn EPERM`; the unchanged commands passed when rerun with child-process permission. `git diff --check` passed.
- `node --check` passed for all eight edited runners. The founder evidence and visual-evidence `--selfcheck` commands passed.
- One-tick seed-61 deposition-runner smoke passed: the fixed-path reference-integral check differed by about `9.6e-9` relative to the expected authored reference integral. Its temporary JSON output was removed. No long natural-run output was generated.

## Final review correction

- The independent reviewer found that a duplicate `pheromone` property discarded diagnostic metadata in `ant-founder-visual-evidence.js`. The corrected object retains dimensions, `nodeSum`, `reconstructedIntegral`, and values until the values are hashed; it also retains `audioEnabled` for the existing Audio-Off assertion.
- `node --check scripts/ant-founder-visual-evidence.js` and `node scripts/ant-founder-visual-evidence.js --selfcheck` passed after this correction. The browser capture was not rerun because this was a metadata-only runner fix, not a production or browser-runtime change.

## Integration verification

- Push/merge method: adoption branch pushed, then direct non-force fast-forward push to `main`; no PR required.
- Fresh fetch confirmed remote `origin/main` and local `HEAD` both at `fe9618db21910393e464d8f619665f340d9599e9` immediately after integration.
- Final merged-tree smoke: `npm test` passed 339/339 (0 failed); `npm run build` passed. Existing Rollup annotation and large-chunk warnings remain.
- Final adoption receipt is a documentation-only descendant of the integration commit; the final remote tip is the commit containing this validation record.

## Limits

No new 600 s natural experiment or browser soak was run for documentation-only adoption integration. Audio-On and exhibition-duration reliability remain unverified. The previously measured rare RAF gaps remain a bounded, non-attributed runtime risk, not a demonstrated G-specific blocker.
