# Source and evidence inventory

## Authorities

- Production main: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`, freshly fetched; docs-only archive addition, unchanged behavior from the prior production baseline. Archive content was not opened or used here.
- Common opportunity research parent: `afea7ecc076734a6c9fe8b3ccad7efb11c08c36a`.
- Pass3 committed evidence/tooling: `2414d1a9b580296c9c38d4fb796904525a843b78`.
- Research continuation: `codex/ant-material-feedback-space-20261030`.

## Actual source read and responsibility checked

- [Canonical ANT status](../../README.md), [future world contract](../../world-model.md).
- [AntController](../../../../src/lib/agents/ant/AntController.js): tick ordering, material locomotion, local/wide sensing, source rate, contacts, formation. Especially tick lines302 onward, source395 onward, sensors560 onward, material helper708 onward.
- [PheromoneField](../../../../src/lib/agents/ant/PheromoneField.js): native point/segment kernels, source units, decay100 onward, cap and metrics. No diffusion/reservoir.
- [GasterDeposition](../../../../src/lib/agents/ant/GasterDeposition.js): travelled chunks, dose accumulator, dab distance, retirement flush.
- [GaitController](../../../../src/lib/agents/ant/GaitController.js): travelled-distance phase, touchdown interpolation and leg/tripod geometry.
- [SurfaceField](../../../../src/lib/agents/ant/SurfaceField.js), [TrailPlateBirth](../../../../src/lib/agents/ant/TrailPlateBirth.js), [MaterialStratigraphy](../../../../src/lib/agents/ant/MaterialStratigraphy.js): C/support, B/E, native immutable births, later material/load/Nodule context.
- [Native current-G runner](../../../../scripts/ant-g-production-candidate-natural.js): callback-before-init lifecycle, init/tick schedule, original checkpoint/raw format and teardown.
- [Shared analyzer](../../../../scripts/ant-material-feedback-screen-analysis.js): offline map, contact, opportunity and ordinal-birth comparisons. Legacy schema/channel labels are clarified in the new reports rather than mutating the pinned helper.

## Existing experiments, not rerun or stacked

- [Screen1 report at 8ced05b8c27799553f0165a3d9f0c023bbcb1b60](https://github.com/oseconds/ant-2026/blob/8ced05b8c27799553f0165a3d9f0c023bbcb1b60/docs/ant/evidence/2026-10-29-retained-material-locomotion-20pct-screen/REPORT.md). Branch `codex/ant-retained-material-locomotion-20pct-screen-20261029`. MIXED, current-G/H0 same seed600s; max20% treatment is not production.
- [Screen2 report at 6e6231bd9947d18e36800f40ba3eb369d3808c9d](https://github.com/oseconds/ant-2026/blob/6e6231bd9947d18e36800f40ba3eb369d3808c9d/docs/ant/evidence/2026-10-30-material-compaction-shielding-screen/REPORT.md). Branch `codex/ant-material-compaction-shielding-screen-20261029`. MIXED, current-G/H0 same seed600s; no candidate source/code imported.
- [Current-G review corpus](../2026-10-25-g-production-candidate-review/README.md) and [adoption](../2026-10-25-g-production-adoption/README.md): exact native G baseline, not pre-G96-grid outcomes.
- [Late qualified opportunity capture](../2026-10-29-late-qualified-opportunity-capture/REPORT.md):40 exact B/C/D/E/F/S/material anchors and entry/outside opportunity context.
- [Opportunity landscape](../2026-10-29-opportunity-landscape-audit/README.md), [capture upstream sensitivity](../2026-10-29-ant-capture-law-upstream-sensitivity/README.md): max-D/X are research nulls, not adopted allocation/formation.

Source/input SHA-256 receipts reside in the executed packages. Original native raw hash: `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`. Exact late-input hash: `256545feb74c262ceb9474e4975d98838d90017fe90aeb9bbfe2636e015e9f4d`.

## Claim types

Current code is an implementation fact. Previously committed screen outputs are existing evidence. This task's fixed/coupled outputs are new measurements. Choosing a local material responsibility or a next control is research interpretation. Giving a surface chemical residence is authored material semantics. Artistic value is unresolved; no result here is a perceptual verdict.
