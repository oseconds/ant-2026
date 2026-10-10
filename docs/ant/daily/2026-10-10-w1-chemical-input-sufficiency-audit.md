# W1 archived chemical-input sufficiency audit — blocked

- **Run date:** 2026-10-10 (Asia/Seoul)
- **Branch:** `ant-w1-episodic-material-shadow`
- **Starting HEAD:** `9eeaa2c1e3254ed7c9bdcac25e79e4d5ee161841`
**Fetched latest `origin/main`:** `a78249fc02fb7990568d62709e9a087489fe632b`; `src/` matches the research branch.

## Question

Can the frozen `chemical` snapshots and existing production sampler/bound/20 s EMA reproduce every archived `chemicalMemory` Float32 value?

## Preflight and stop

- Rehashed the archived provenance, replay-verification record, snapshot/summary inputs, prior evidence ledgers and committed contact archives. Recorded sizes and hashes match their existing ledgers.
- Verified three seeds × 599 descriptors; array order, 36,864-byte spans, contiguous offsets, XOR decoding, expected decoded length and finite `chemical`/`chemicalMemory` Float32 values.
- Reconstructed the exact repeated 60 Hz millisecond clock and ran the production `TrailPlateBirth.advance` update gate. Each seed has 599 archived descriptors for 599 expected updates; every tick and saved time matches.
- Stopped before recurrence. The replay manifest records runner SHA-256 `27bd6ebb8eea0c0a779147e847c2b40637ccd87d781067c60aa9f984376c0e08`; the available `scripts/ant-morphology-replay.js` hashes to `1c54bcacd0873e6a905568a857fae719d9544e9c7ab226231d2c66477a62ffe9`. Production `AntController`, `PheromoneField` and `TrailPlateBirth` hashes do match.
- The runner hash gap means same-update input/output capture timing is unverified. No archived recurrence or 16,561,152-value comparison ran.
- Prior q/active parity and original/max-overlap geometry/character deep-equality records were verified in the raw-field result ledger for all three 599-frame histories.

## Decision

**Inconclusive / blocked:** archive update coverage matches the production gate, but the capture-source mismatch prevents proving that each saved `chemical` frame immediately precedes the stored `chemicalMemory` update. No match or mismatch count is available. The W1 design gate remains **Undecided / Research Gap**. No production, material or ontology change followed.

Focused fixtures pass 7/7; full `npm test` passes 407/407; `npm run build` passes with existing warnings. Independent preflight output is byte-identical across two Node processes.

Full preflight, hashes and commands: [evidence package](../evidence/2026-10-10-w1-chemical-input-sufficiency-audit/README.md). No follow-up experiment is proposed in this pass.
