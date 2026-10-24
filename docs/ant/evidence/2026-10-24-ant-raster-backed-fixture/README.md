# Deterministic replay-backed pheromone rasters — 2026-10-24

## Decision

**QUALIFIED RASTER-BACKED FIXTURE.** The 24 controlled production rasters were regenerated with the pinned production writer. All 238,392 frozen production C reads and all stored production sensor outputs reproduced exactly. A second complete generation reproduced every raster SHA, write stream, manifest, and validation receipt.

This is input infrastructure for a later reader-only C/D comparison. No reader candidate was selected or tested. Production source, movement, and field behavior were unchanged.

## Baseline and provenance

- Freshly fetched `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Production source SHA-256:
  - `src/lib/agents/ant/PheromoneField.js`: `412798ea9276888bf5bbb28130ae319d970c36f411d6f066e48cff1b478c4afd`
  - `src/lib/agents/ant/GasterDeposition.js`: `0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41`
  - `src/lib/agents/ant/AntController.js`: `e287939aaccc60187695a920d31a87b2f6660eada9699953d60d05ef90f4bb04`
- The three production source Git blob IDs match between this baseline and analytic-reference commit `2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa`.
- Exact route implementation provenance: `scripts/ant-field-analytic-reference.js` at `2f00c300a9b8dc7a34d9efa5fd49cf92f024d9aa`, blob `d401a3ffacbb79f25e85cf53043c4c95e0e04791`, SHA-256 `1a9ba25d6e128a67c3795f6cb1b97bf1ee3e62ee38c8d71d893141ccce9fea2e`. The replay harness reuses its route station, curve, S-curve, phase, and query-coordinate definitions.
- Frozen C query rows came from writer/reader attribution commit `ea3d382c6c849df7505e1d398cef085ca271c8b9`, `inputs/station-raw.json.gz`. Compressed SHA-256: `50547f963041e1505e1caf1bed3da27bbe36d84b0d5f26266313e60e8e573d29`; uncompressed JSON SHA-256: `bdab38fd13ccb8bae6689cdb7af134c52265969849d4cbfdd5c528677628e13d`. The exact compressed input is included at [`inputs/station-raw.json.gz`](inputs/station-raw.json.gz).
- Reader-counterfactual preflight commit `0a61e51f87af1e262aa2f5c022f0dd560485c426` established that prior frozen A/B/C evidence did not contain node arrays.
- Replay harness SHA-256: `b59c58b131dffeb3b8afaa6db17c1eaba550e26cf733415b8ad32d58eb67e9e1`.

The new arrays are a **deterministic replay-backed raster capture**, not recovered historical raster nodes. The only prior historical byte-identity control is straight p00/p01; this replay also confirms those two regenerated arrays are byte-identical to each other. No general claim of byte identity to unavailable historical node arrays is made.

## Frozen cohort and write stream

The exact six prior route fixtures were used: straight, gentle, mirrored gentle, tight, mirrored tight, and S route. Each retained its existing 231 stations and four phases: p00, p10, p01, p11. That gives 24 arms and 5,544 station/phase rows.

Before any field writes, the harness generated and saved the ordered `GasterDeposition` event streams in [`validation/write-streams-preflight.json`](validation/write-streams-preflight.json). Each arm has 77 point writes; 1,848 writes total. The receipt records each event's source segment, unshifted route position, phase-shifted grid position, requested amount, sequence index, and stream SHA-256. Writer settings are the production defaults: 96×96 grid, zero Float32 initial state, dab mode, 0.006 spacing, radius 0.0045, rate 4.5, cap 8, no decay step, and no RNG.

All writes were accepted. Requested dose ranges from `2.069965500172497` to `2.069999999999996` per arm. No cell reached the cap. Stored mass residual ranges from `4.970480604882255e-8` to `5.431473670824971e-8`, from Float32 storage and accumulation.

## Raster package

Each file is the production `Float32Array` node buffer in row-major order (`y * width + x`), encoded little-endian. Each is 96×96, 9,216 nodes, and 36,864 bytes. The 24 files total 884,736 bytes. [`manifest.json`](manifest.json) maps each route/phase to its raster file, offset, SHA-256, write-stream receipt and frozen row indices.

| Route / phase | Raster SHA-256 |
| --- | --- |
| straight / p00 | `863f81053d0414fbf9599b35abaf7cbcbf0cc0643b30cafe1553a80404a65dca` |
| straight / p10 | `c7c55df6d8ffc6568eed2f5b6662beb2afad626526920685846682ed7cac2c5d` |
| straight / p01 | `863f81053d0414fbf9599b35abaf7cbcbf0cc0643b30cafe1553a80404a65dca` |
| straight / p11 | `c7c55df6d8ffc6568eed2f5b6662beb2afad626526920685846682ed7cac2c5d` |
| gentle / p00 | `c2ea4d41719d248b09082ebff12b4c7594df00c7f6f950b5d730aa04f0eadf62` |
| gentle / p10 | `48c2f9207a7812a7cb482e9ad1d7faad886c1fd308c065afafa22a0034a4634e` |
| gentle / p01 | `237dcbae5ac54e71f6dc150008d18064b9fd976b064636eb40e0ec2cfb4b0d89` |
| gentle / p11 | `7a2fc3ff085ae183b63c2106f0cb838a503763d9ca1fd58188f6df247ca8072f` |
| tight / p00 | `065834f890c7cc37103ac9896f9f3f87c132770fb8b19cd60c6b7c97bb3a4165` |
| tight / p10 | `1ccfc2dcaf015898d346faa5e3fb1f29bf0dda45d5371cf19c9a51aef90411fa` |
| tight / p01 | `af38a469926f38e76901bef8c778982794e093184fe24f97e7491114f055f65e` |
| tight / p11 | `d62c9ab63b915ef6b6bb59cd6aed92cbd67b091da16de14760bd5b4a6294cebd` |
| gentleMirror / p00 | `f0fc979c5d5740ccf31d10d17ad188c52e0af80287acb10f4c661065c3a52173` |
| gentleMirror / p10 | `09190bfa2146845030c352f4450314aaf156d4697839976938d6ef98d327b5a0` |
| gentleMirror / p01 | `5e450ef788ec18b8d53765959372deaa9189ee6c36cf30b9805b92a5935a6f5b` |
| gentleMirror / p11 | `10a6be01f3f6e460316f32286cc47c538664f60f272dcc69f54e6338b76ae445` |
| tightMirror / p00 | `0b6fd292364cdace95a07c8a271b3e2b0d496ba8e485a8dfcde1ca3c73834b96` |
| tightMirror / p10 | `f247cf1bf5c7bf5965c11a7b00febe64c2cf14ffedd3ad4477c69f6145891088` |
| tightMirror / p01 | `7ed5b519cd0d0923024771ffea503fba319f0d7685002fb5d973aa3cfc65b50f` |
| tightMirror / p11 | `de0ae76414e0016a5c195fccf11f5a0f758f01a1a4d9c0375af8b4f5c31fb645` |
| sCurve / p00 | `f0c0bb336e3a7506b4c8706a7901f06e3736af35b07a155f8c4a337165428b21` |
| sCurve / p10 | `3a969c2d700419238a42153f7efbd0170dafac6dc19f686ed6d1efd3132acc64` |
| sCurve / p01 | `eb78e4c71d32bb049759c07643b6274031789f5350d41ebb13a3b80931594db4` |
| sCurve / p11 | `00bf299e64112559434b4ccf0c0a0b34c7b4973c8360cae2139c6b0d3dda29c4` |

## Exact parity receipts

[`validation/query-parity.json`](validation/query-parity.json) records:

- Local: **99,792 / 99,792 exact**, 0 non-exact, maximum absolute error 0.
- Wide: **138,600 / 138,600 exact**, 0 non-exact, maximum absolute error 0.
- Total: **238,392 / 238,392 exact**. First mismatch: none.
- All 5,544 regenerated physical query geometries equal their frozen source coordinates exactly.

[`validation/sensor-parity.json`](validation/sensor-parity.json) calls the actual unchanged `AntController.senseLocalTrail` and `senseTrail` methods against the replayed fields, recording their sample calls and comparing with the frozen values. Exact comparisons passed for:

- 99,792 local raw reads and 38,808 local aggregate scalar values (left/center/right, strength, coherence, derived balance, steering).
- 138,600 wide raw reads and 138,600 weighted reads.
- 27,720 wide maxima, 27,720 Hill responses, 27,720 deterministic field-only scores, 27,720 ranks, and 5,544 winners.
- Zero RNG calls. First mismatch: none.

`AntController.senseLocalTrail` returns steering but does not expose `balance`; the harness computes the same balance expression from its returned left/center/right values for parity with the prior frozen diagnostic. Numeric comparisons use JavaScript `===` with no tolerance. The stored query values are non-negative; signed-zero representation in JSON is treated according to JavaScript numeric equality.

## Historical controls

[`validation/special-controls.json`](validation/special-controls.json) contains replay-derived values and checks:

- Straight p00 and p01 raster files are byte-identical, SHA-256 `863f81053d0414fbf9599b35abaf7cbcbf0cc0643b30cafe1553a80404a65dca`.
- At straight station 0.122, replayed steering is `+0.19708966205049175` for p00 and `-1.1730513378528801e-15` for p01; local raw reads match the frozen rows exactly.
- Tight/p00/station 0.294 reproduces C candidate maxima `[0, 0, 0.019411445570753354, 0.03184091903047273, 0]`, with the existing field-only winner at `+0.47` (analytic winner 0).
- Tight/p10/station 0.066 reproduces C candidate maxima `[0, 0, 0.028501675781825334, 0.03676174542825278, 0]`, with the existing field-only winner at `+0.47` (analytic winner 0).

## Determinism and validation

[`validation/determinism.json`](validation/determinism.json) records a second complete write-stream build, production writer replay, frozen-query replay, and sensor replay. All 24 raster SHA values, write streams, manifest, query receipt, sensor receipt, derived summary, and special-control report were identical.

Reproduce from the repository root with:

```powershell
node scripts/ant-raster-backed-fixture.js
```

The harness verifies its frozen input and production source hashes before use. It writes the write-stream preflight before applying any field writes. It writes raster files and the canonical manifest only after exact C parity, exact sensor parity, and full second-generation determinism pass. If an essential gate fails, it writes a failure receipt and stops without replacing canonical raster outputs.

Focused tests passed:

- `node tests/pheromone-field.test.js` — 8/8
- `node tests/ant-gaster-deposition.test.js` — 6/6
- `node tests/ant-gaster-integration.test.js` — 3/3
- `node tests/ant-trail-following.test.js` — 8/8
- `node tests/ant-controller.test.js` — 21/21

Runtime used: Node.js `v22.23.2`, Windows x64. No full build was run because production source was not modified.

## Limits and next step

The package makes the exact same replay-generated raster bytes available to a later current-bilinear C arm and candidate D arm. It establishes reproducible provenance for this fixed dataset; it does not prove that every unavailable historical node array had these exact bytes. It also says nothing about movement outcomes or which reader is preferable.

The smallest next pass is the already scoped fixed-geometry reader-only C/D counterfactual, using these exact 24 files as shared raster inputs. No production change is selected here.
