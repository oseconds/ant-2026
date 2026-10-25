# Adoption validation receipt

## Authority and integration

- Previous `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Adoption branch: `codex/ant-g-production-adoption-20261025`.
- The branch was based directly on the freshly fetched previous main; only reviewed G production changes, the validated near-stop test correction, and associated review/test evidence were brought forward.
- Adoption branch commit: pending final commit.
- Integrated `origin/main` commit: pending integration verification.

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
- Independent adoption review: pending final read-only review.
- Production-source comparison against Candidate G: all three Git blobs match exactly; no production source was changed after the comparison.
- Production runtime-source diff against `origin/main` is limited to the reviewed three files: `PheromoneField.js`, `AntController.js` analysis fields, and `src/main.js` diagnostic label.

## Integration verification

- Push/merge method: pending.
- Adoption branch commit: pending.
- Post-integration `origin/main` SHA: pending.
- Final smoke/source check from remote main: pending.

## Limits

No new 600 s natural experiment or browser soak was run for documentation-only adoption integration. Audio-On and exhibition-duration reliability remain unverified. The previously measured rare RAF gaps remain a bounded, non-attributed runtime risk, not a demonstrated G-specific blocker.
