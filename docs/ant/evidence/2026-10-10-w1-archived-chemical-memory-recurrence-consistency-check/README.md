# W1 Archived Chemical–Memory Recurrence Consistency Check

**Run date:** 2026-10-10  
**Decision:** **Consistent** (archive-internal numerical check)  
**Research branch starting HEAD:** `22ead7669af28145e9c6966d4a042a692c905057`  
**Main baseline inspected:** `a78249fc02fb7990568d62709e9a087489fe632b`

## Question and scope

Can the frozen archive's `chemical` snapshots, passed through the current production `PheromoneField` sampler and `TrailPlateBirth.updateChemicalMemory`, reproduce every stored `chemicalMemory` Float32 value byte-for-byte?

This is an archive-internal numerical consistency check. It does not assume that the archived `chemical` input and `chemicalMemory` output were captured around the same production update. It does not prove the original runner provenance, alter the earlier sufficiency audit's **Inconclusive / Blocked** result, or select a W1 material ontology.

No natural ANT replay ran. No production source, snapshot, manifest, prior evidence package, or material rule changed.

## Frozen inputs and provenance

The three frozen seeds are `20261005`, `20261006`, and `20261007`, each with 599 observations over a 96×96 grid. The archives are:

- `test-results/ant-interior-endpoint-shadow/seed<seed>-snapshots.bin.gz`
- `test-results/ant-interior-endpoint-shadow/seed<seed>-summary.json`

Existing provenance and prior evidence ledgers, compressed and decoded snapshot hashes, descriptor metadata, XOR-delta encoding, array offsets, little-endian Float32 decoding, finite-value checks, update ticks, and reconstructed simulation clock were rechecked. Exact paths, byte sizes, and SHA-256 values are in [`results/input-fingerprints.json`](results/input-fingerprints.json). The 599 frame descriptors and five arrays remain in their archived order: `chemical`, `chemicalMemory`, `surface`, `support`, `contactCounts`.

The manifest records runner SHA-256 `27bd6ebb8eea0c0a779147e847c2b40637ccd87d781067c60aa9f984376c0e08`; the available file is `1c54bcacd0873e6a905568a857fae719d9544e9c7ab226231d2c66477a62ffe9`. The original runner bytes remain unrecovered. `runnerProvenanceVerified` is therefore `false`, and archived same-update capture timing is explicitly unverified in the result metadata.

## Comparison method

The audit uses the production updater and sampler without changing their arithmetic or storage order:

1. Reconstruct `simulationTimeMs` by accumulating the replay's `1/60` second tick.
2. Use `elapsedSeconds = 1` for the first `TrailPlateBirth.advance`; later elapsed values are differences between reconstructed `simulationTimeMs` values.
3. At each archived update tick, load that frame's `chemical` Float32 array into the production `PheromoneField.values` array and call `TrailPlateBirth.advance`.
4. Compare every resulting `chemicalMemory` cell's Float32 bytes against that frame's stored array.

The production path is `createPheromoneSampler` → `max(0, sample)` → `raw / (raw + 0.04)` → Float32 in-place `memory += (bounded - memory) * (1 - exp(-max(0, elapsedSeconds) / 20))`. No tolerance, alternate interpolation, parameter change, input correction, or higher precision accumulator was used.

The comparison treats each archived `chemical` as an input candidate for the observation update solely to check numerical consistency. A byte match cannot establish that this was the archived capture relationship.

## Results

| Seed | Frames | Values compared | Byte matches | Mismatches | Fraction | Maximum absolute error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261005 | 599 | 5,520,384 | 5,520,384 | 0 | 0 | 0 |
| 20261006 | 599 | 5,520,384 | 5,520,384 | 0 | 0 | 0 |
| 20261007 | 599 | 5,520,384 | 5,520,384 | 0 | 0 | 0 |
| **Total** | **1,797** | **16,561,152** | **16,561,152** | **0** | **0** | **0** |

There is no first mismatch or mismatch propagation. Every row in [`results/frame-mismatch-counts.csv`](results/frame-mismatch-counts.csv) has zero mismatches. Each seed covers ticks 1 through 35,955 and ends at reconstructed time `599.2500000000696` s, matching its archived descriptor clock. Per-seed descriptor hashes, exact update ticks, and elapsed interval details are in [`results/summary.json`](results/summary.json).

The pre-existing W1 parity ledgers were revalidated for all three seeds: raw flag/q parity, original and max-overlap geometry/character equality, EMA/active parity, and stored candidate identity frames remain true. Those checks are regression preservation, not material evidence.

## Reproducibility and validation

The numerical audit ran in two separate Node processes. The primary and independent output SHA-256 values matched for all three data artifacts and their checksum manifest:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `summary.json` | 40,316 | `b2ce53a7067915f075ca8eb07c730746eabafe175429965a928c00d995ba5b6b` |
| `frame-mismatch-counts.csv` | 69,873 | `97603b3ccf4bcc360952de5378c15f66068d4464aac18c757f09cae1091c7019` |
| `input-fingerprints.json` | 5,908 | `c17f2102cd5afc80be5f911319e5a6c2023d4558d657b06e7dd624674a5e5612` |
| `checksums.json` | 509 | `a815d20d1de930066342a27c987e27365f15c3e4b55b08f061c8400a906490e0` |

The independent copy is in [`reproduction-2/`](reproduction-2/). Each run has its own `checksums.json`.

- Focused sufficiency/consistency fixtures: **9/9 passed**. The synthetic checks distinguish the exact recurrence from changed input, an omitted frame, and reordered inputs.
- Full `npm test`: **409/409 passed**.
- `npm run build`: passed; Vite transformed 408 modules. It emitted existing third-party annotation and large-chunk warnings.
- The legacy sufficiency command, directed to [`validation/legacy-default-route/`](validation/legacy-default-route/), still returns `Inconclusive / BLOCKED` with `recurrenceExecuted: false` on the runner-hash gap. The earlier evidence package was not overwritten.
- `rngUsed: false`; the read-only recurrence audit consumes no simulation RNG.

Machine-readable validation is in [`validation.json`](validation.json); package artifacts and the updated source/docs are listed in [`package-checksums.json`](package-checksums.json).

Reproduction commands from the repository root:

```powershell
node --test tests/ant-w1-chemical-input-sufficiency-audit.test.js
node scripts/ant-w1-chemical-input-sufficiency-audit.js --consistency-check
node scripts/ant-w1-chemical-input-sufficiency-audit.js --consistency-check docs/ant/evidence/2026-10-10-w1-archived-chemical-memory-recurrence-consistency-check/reproduction-2
node scripts/ant-w1-chemical-input-sufficiency-audit.js docs/ant/evidence/2026-10-10-w1-archived-chemical-memory-recurrence-consistency-check/validation/legacy-default-route
npm test
npm run build
```

## Interpretation and limits

**Consistent** means only that the archived `chemical` values are sufficient to reproduce the stored `chemicalMemory` values under the current verified production recurrence and exact Float32 update order. It does not establish that those arrays bracketed the same archived update, identify the runner code loaded at replay time, or rule out capture timing differences that happen to preserve the same values.

The prior runner provenance recovery remains **Partially Resolved**; the original runner hash remains unmatched. The earlier Chemical-input Sufficiency Audit remains **Inconclusive / Blocked**. W1 material ontology remains **Undecided / Research Gap**. No material mass, physical contribution, consolidation, stiffness, or birth is inferred.
