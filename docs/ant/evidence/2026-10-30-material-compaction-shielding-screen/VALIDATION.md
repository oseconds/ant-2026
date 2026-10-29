# Validation and reproduction

## Reproduction

From repository root on branch `codex/ant-material-compaction-shielding-screen-20261029`:

```powershell
node --check scripts/ant-material-compaction-shielding-screen.js
node scripts/ant-material-compaction-shielding-screen.js --self-test
node scripts/ant-material-compaction-shielding-screen.js
git diff --check
```

The full runner executes the existing 600 s natural G scenario for seed `20261005` twice, with audio Off, and writes temporary raw replay files under ignored `test-results/`. It stores the shielded raw run and 30/60/120/300/600 s field checkpoints in this evidence package. It retains the two late 20 s windows and hashes C/D/E/F/layer maps at every anchor; full contact streams and 299/599 s spatial maps are stored in `matched-shadow.json.gz`.

## Assertions

- The control compressed raw packet is byte-identical to the frozen production packet. Initial state, 600 per-second agent snapshots, contact buckets, Plate records, event hashes and all five frozen checkpoint maps also match.
- Both arms have the same initial state, valid-contact count, contact positions/timing/order, complete contact stream, ant snapshots, Plate births and Plate stream.
- RNG state and calls match at 30/60/120/300/600 s and at the end.
- Direct self-checks prove `L=0` exact identity, unchanged response/count for the same pre-contact state at positive `L`, lower positive-`L` dose, and tick-entry reference survival when a later layer-map rebuild assigns a new typed array. Later full-run responses can change because C changed.
- Production source order is checked: the contact loop and SurfaceField writes precede `TrailPlateBirth.advance` and `MaterialStratigraphy.addPlate`. Every observed same-tick Plate birth reports a replaced layer-map reference after contacts.
- Native support values match the `.025` D readout on qualified S cells. E/F and layer map hashes are compared across all 40 late anchors.
- Across the 40 sampled anchors, C and D maps differ in 40/40, E and F maps match in 40/40, and layer maps match in 40/40.
- `git diff --check` passes. No production files changed; full repository test suite and build were not run because the pass adds research-only instrumentation.

## Provenance and limits

The control input is `docs/ant/evidence/2026-10-25-g-production-candidate-review/data/seed20261005-G-raw.json.gz` (SHA-256 `a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414`). The runner source and all wrapped production source hashes are in `MANIPULATION-RECEIPT.json`. The receipt distinguishes exact event/path parity from treatment-only C/D and Nodule outcomes. Control reached the 32-Nodule cap; treatment still produced a Nodule near 598.1 s, so the 600 s count difference is not an uncapped final-count comparison.

One seed only. No amplitude sweep, locomotion treatment, second seed, allocation feedback, audio change, PR, merge, or force-push.
