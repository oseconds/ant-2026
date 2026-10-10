# W1 Archived Chemical-input Sufficiency Audit

- **Run date:** 2026-10-10 (Asia/Seoul)
- **Branch / starting research HEAD:** `ant-w1-episodic-material-shadow` / `9eeaa2c1e3254ed7c9bdcac25e79e4d5ee161841`
- **Latest fetched `origin/main`:** `a78249fc02fb7990568d62709e9a087489fe632b`
**Decision:** **Inconclusive — blocked by archived replay-runner source hash mismatch.**

## Question and stop point

This audit asks whether the three frozen archives' `chemical` snapshots are sufficient to reproduce every saved `chemicalMemory` Float32 value with the existing production sampler, bound and 20 s EMA.

The input preflight verified the frozen source hashes, descriptors, offsets, decoded frame sizes and production update-tick coverage. It stopped before running the archived recurrence because the replay manifest records `scripts/ant-morphology-replay.js` at SHA-256 `27bd6ebb8eea0c0a779147e847c2b40637ccd87d781067c60aa9f984376c0e08`, while the available file hashes to `1c54bcacd0873e6a905568a857fae719d9544e9c7ab226231d2c66477a62ffe9`.

The archived `AntController.js`, `PheromoneField.js` and `TrailPlateBirth.js` source hashes match the replay record. The runner mismatch leaves the capture relationship unverified: this audit cannot prove that each stored `chemical` frame is the input consumed by the same `TrailPlateBirth.advance` call whose post-update `chemicalMemory` was saved. Per the stop condition, the script reports a typed gap and does not compare the 16,561,152 values. There is no exact-match or mismatch result.

## Frozen inputs and production source

The existing provenance record is 6,846 bytes, SHA-256 `77889a15a9bf17b20a6e7345a726e2e0a69eac16ee7a5a8e469c752009584577`. The committed `replay-verification.json` is 54,556 bytes, SHA-256 `39e2a0bb3fb1e4b71e6f823a3852d95c730c4d8fedb35b814775ae90974c377c`.

| Seed | Summary bytes / SHA-256 | Snapshot bytes / SHA-256 | Frames | Decoded snapshot bytes |
|---|---|---|---:|---:|
| 20261005 | 225,877,622 / `40141611fb8e8e0e25a9ac4c0cd143e687bf94e10c2d4577594f73c7ac812b0a` | 42,694,915 / `a9eb9cd63ee9fd39271efdf9ea9729507fb3b08990d15d2a5f9aebd7fb992e9f` | 599 | 110,407,680 |
| 20261006 | 219,192,262 / `7139d522adc0886970a44833980aa62373f0c10ae61ab98d3520e8c5a2ca7a39` | 43,440,798 / `a46fec776dff03833ac0551e601b42b4191360e06135e244ebe149edeef22c3e` | 599 | 110,407,680 |
| 20261007 | 220,055,044 / `6822af6225f211136c58d203203e4e9add2818da26d7fa28c4554e7bc1baa452` | 42,321,540 / `80e410278f3a732d7d0784fd8c1d775785d923df1e2cb60da8d79bf12dca4350` | 599 | 110,407,680 |

The audit rechecked these records against the prior post-contact source ledger, its package checksum, and each W1 field-decision metadata checksum. It also rechecked the prior raw-field result ledger before relying on its q/active regression record. The original archives and prior evidence remain unchanged.

## Preflight findings

- All 1,797 descriptors match their W1 metadata timestamps and ticks. The five archived arrays are ordered `chemical`, `chemicalMemory`, `surface`, `support`, `contactCounts`; every per-frame array span is 36,864 bytes and offsets are contiguous.
- XOR decoding produced the expected 110,407,680 bytes per seed. The decoded `chemical` and `chemicalMemory` values are finite little-endian Float32 values.
- The production `TrailPlateBirth.advance` gate yields exactly 599 update ticks per seed, and every archived descriptor tick matches the chronological update schedule. This checks update coverage without using ANT inputs to perform the memory recurrence.
- The simulation clock was rebuilt with repeated `DT = 1/60` millisecond additions. Every resulting `simulationTimeMs / 1000` exactly matches the descriptor `timeSeconds`. The first production update uses elapsed `1`; later elapsed values use the reconstructed millisecond differences, including the occasional `1.016666… s` interval.
- The verified prior raw-field audit reports q, active/EMA, original W1 geometry/character, max-overlap geometry/character, and stored identity frame deep-equality for all 599 observations in each seed. This pass verifies those prior result hashes; it does not regenerate those outputs.

The preflight details and source fingerprints are in [`results/summary.json`](results/summary.json) and [`results/input-fingerprints.json`](results/input-fingerprints.json). `recurrenceExecuted` is `false`; all comparison counts are zero by design.

## Validation and reproduction

The preflight was run in two separate Node processes. All three generated result files matched byte-for-byte; see [`validation/independent-reproducibility.json`](validation/independent-reproducibility.json).

- Focused fixtures: 7/7 pass. They cover first-update elapsed, later actual elapsed, production sampling and Float32 storage, repeated tick clock, descriptor offsets/order, dropped or reordered updates, missing/non-finite input, and typed source-hash stops.
- `npm test`: 407/407 pass.
- `npm run build`: pass, 408 modules transformed. Existing Rollup annotation and large-chunk warnings remain.
- No natural ANT simulation, saved input rewrite, production update, q/active recomputation, geometry change or material ontology decision occurred.

Reproduce the blocked preflight and checks with:

```powershell
node scripts/ant-w1-chemical-input-sufficiency-audit.js docs/ant/evidence/2026-10-10-w1-chemical-input-sufficiency-audit/results
node --experimental-test-isolation=none --test tests/ant-w1-chemical-input-sufficiency-audit.test.js
npm test
npm run build
```

The [daily chronology](../../daily/2026-10-10-w1-chemical-input-sufficiency-audit.md) records the decision. W1 remains **Undecided / Research Gap**; this preflight neither supports nor falsifies chemical-input sufficiency and does not support a material formation claim.
