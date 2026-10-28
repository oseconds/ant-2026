# Validation — commit-relative space-time attachment support

## Provenance

- Baseline `origin/main`: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Prior C0 result: `6e9ab09b6c3ddf286b23b61fc58081e50f76ece`.
- Frozen history packet: source commit `0d5096a920e1ebb2086fa1dae782c5d4e871b590`, SHA-256 `909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc`.
- Event-support atlas: source commit `f47a9dcaa5d127f0ac7c4547ee8a240f9ff5af4a`, SHA-256 `fe2fc6d299ba05bc257d0f5c1ac905ed5c13bfd2db9291ac659434e0c3bee0ed`.
- Ownership arrays and ledger: source commit `d27034306019f2a348e49a6723332fc10b10cc9c`; array SHA-256 `69d2bdc936408dd31e0f936e5b423f66490643a689667d1656ae128894b6e5c9`; ledger SHA-256 `32d0aa9a52bc08a15fd68fb1f71a21434fd88d573f098091e05bbc3009a6a78e`.
- Current G raw production receipt: SHA-256 `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`.
- All 11 relevant current source hashes matched the baseline. Exact paths and hashes: [`data/inputs/provenance.json`](data/inputs/provenance.json).
- P1/P2 exact C0 hashes equal the prior C0 masks: `b00a677b9b114883ba1f1a562ebe7914dc06c636748691fe5749a2d3afc5df42` and `2bef1ec85a943482cf8f947f90bd17a9beff35774b1e3d86cfc00316bacd8341`.

## Checks performed

- `node --check scripts/ant-spacetime-attachment-support.js` — passed.
- Default runner reconstruction — recorded Stage 1 outputs; it refused to overwrite existing outputs.
- Runner's four assert-based small-grid checks — passed: same-anchor 8-connectivity association, temporal adjacency, diagonal-only 4-neighbor exclusion, and no within-anchor ancestry propagation.
- `node scripts/ant-spacetime-attachment-support.js --check` — passed after packaging; verifies source/input hashes, exact C0 masks, frozen reconstructed JSON, exact saved C0/C1-8/C1-4 masks, validation receipts, and package manifest.
- `git diff --check` and staged equivalent — passed.
- Scoped path review — no production `src/`, static assets, canonical `docs/ant/README.md`, `docs/ant/world-model.md`, or existing evidence changed.
- Push verification — branch tip and `origin/codex/ant-space-time-attachment-support-20261028` resolved to the same commit SHA; no PR or merge was created.

## Conditional work and omissions

Stage 2's 600 s shadow was **not run** because Stage 1 was bounded negative. No new simulation, full test suite, build, browser, audio, visual, perceptual, or artistic review was run. Those checks are outside this frozen-data reconstruction and would not change the conditional Stage-2 gate.
