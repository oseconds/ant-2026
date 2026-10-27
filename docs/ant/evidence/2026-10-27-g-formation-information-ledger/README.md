# G Formation Information Ledger — 2026-10-27

**Status: completed diagnostic; no production or formation-law change.** The run began from fresh `origin/main` `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292` and was completed on 2026-10-28. The requested package date is retained in this path.

## [Implementation]

- Research branch: `codex/ant-g-formation-information-ledger-20261027`, created directly from fresh main at `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`.
- Production source, `TrailPlateBirth`, `SurfaceField`, pheromone, movement, renderer, material law, audio, defaults, and `docs/ant/README.md` are unchanged.
- `scripts/ant-g-formation-information-ledger.js` ran default `AntController` worlds at seed `20261005`, 60 Hz, Audio Off, through 120 model seconds. One plain and one read-only-observed run were compared.
- The observer sampled only after each actual production qualification analysis. It captured exact current field/memory arrays, re-read production `sampleSupport` and supported-mask inputs, and used an in-memory copy of the current selector to expose its component/filter funnel. It creates no candidate state, Plate, event, or RNG draw.
- The observer's diagnostic selector matched the live candidate at all 120 qualification analyses. At each actual Plate birth, the candidate ribbon bytes were also asserted equal to the newly frozen descriptor mask.
- Measurement audit: after an initial complete diagnostic pair, final instrumentation was amended to keep the first frozen descriptor, union of all `TrailPlateBirth` descriptor masks, and mutable `MaterialStratigraphy` union separate. It also reports graph-degree proxies only for skeletons, not filled masks. The frozen archive has a 600 s ordered-contact digest, so it cannot prove equality with the 120 s contact prefix; the prefix is compared between observer OFF/ON, and first-120 s group/foot totals are compared with archived per-second totals.
- Runner QA required four complete same-seed observer OFF/ON replay pairs while these measurement issues were corrected. The package contains only the final pair's output. No world parameter, threshold, selector rule, seed, horizon, anchor rule, or candidate geometry changed; the repeated executions were tooling QA and exceeded the intended single capture.

## [Existing ANT evidence]

- Current production G authority is the 2026-10-25 adoption on the fresh main above; the matching frozen 120 s and raw 600 s packets are in [`2026-10-25-g-production-candidate-review/data`](../2026-10-25-g-production-candidate-review/data/).
- The 2026-10-08 local-accretion shadow was pre-G and mixed: early topology broadened, but late material converged to one component containing 99.43–99.72% of the local material. See [`daily/2026-10-08-local-accretion-shadow-decision.md`](../../daily/2026-10-08-local-accretion-shadow-decision.md). This is context only; it is not current-G natural evidence.
- The 2026-10-08 interior-endpoint shadow was also an earlier selector diagnostic. It found larger retained networks when source-connected interior endpoints were admitted, but did not justify adoption. See [`2026-10-08-interior-endpoint-shadow`](../2026-10-08-interior-endpoint-shadow/README.md). Its older-world results are not transferred to this run.
- The earlier morphology diagnosis identified source-to-boundary selection and pruning as a plausible restriction, while also finding chemical qualification can filter local mechanical traces. See [`2026-10-08-movement-material-morphology`](../2026-10-08-movement-material-morphology/README.md).

## [New measurement]

### Replay and parity

- Seed `20261005`, production defaults, 60 Hz, Audio Off, 0–120 s; 7,201 tick rows including initialization.
- Observer OFF/ON hashes match at every tick for agents and lifecycle, controller state, RNG state/calls, pheromone field, `SurfaceField`, chemical memory, foot-contact counts, candidate/birth state, material state, and per-tick events. The complete report is [`data/observer-parity.json`](data/observer-parity.json).
- Both runs end at `120000.00000001203 ms`; projected frozen pheromone and frozen `SurfaceField` endpoint arrays are exact. First Plate time, descriptor coordinates, and mask SHA match the frozen G receipt. The replay records `49,734` RNG calls and final LCG state `1968417963`.
- First 120 s contact totals match the frozen raw packet: `4,368` contact groups and `12,954` feet. The archived contact digest covers 600 s and is explicitly marked not comparable to this prefix; no prefix digest equality is claimed.
- First natural Plate: `84.016666668 s`, stable candidate `20.000000000 s`, 356 raster cells, mask SHA `3a5a0f5a7252a19e54ce1db0666226e5fd3a4382d6fda0bb4ba8dcc0ce2417ce`. Second Plate: `106.016666667 s`, 544 cells. At the latest qualification analysis (`119.016667 s`), the union of both frozen Plate masks and the mutable material union each cover 677 cells in one 8-connected component. The frozen endpoint field receipts are at 120 s.

### Stage funnel

Cell/component counts below use the fixed 96×96 analysis grid. `B` is the unchanged production chemical threshold; `E` is the production chemical AND support qualification; `F` is the full skeleton; `G` source-annulus-connected components; `H` source-connected components with a qualifying boundary target and minimum geodesic; `I` is the production winner's retained network and principal path. Filled-mask cells are not assigned skeleton endpoint/junction counts.

| Actual analysis time | B `≥0.30` | E qualified | F skeleton | G source-connected | H boundary + length | I network / path | J candidate raster | Frozen Plate union |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 30.016667 s | 169 | 165 | 131 / 7 comps | 121 / 1 | 0 | 0 / 0 | 0 | 0 |
| 74.016667 s | 882 | 882 | 639 / 44 | 526 / 1 | 526 / 1 | 86 / 66 | 269 | 0 |
| 83.016667 s | 1,057 | 1,056 | 771 / 40 | 627 / 1 | 627 / 1 | 122 / 69 | 357 | 0 |
| **84.016667 s (first birth)** | **1,075** | **1,074** | **775 / 41** | **628 / 1** | **628 / 1** | **122 / 69** | **356** | **356** |
| 119.016667 s (last production analysis ≤120 s) | 1,536 | 1,536 | 967 / 35 | 898 / 3 | 893 / 1 | 358 / 65 | 1,076 active candidate | 677 |

At the first birth, the support gate rejects only 1 of 1,075 chemically qualified cells. Thinning reduces the qualified area from 1,074 cells to 775 skeleton cells while retaining 41 components. The source-annulus stage retains one 628-cell component and excludes 40 disconnected components (147 cells total). Its 14 boundary targets all meet the 0.30 minimum; that gate removes no cells from the qualifying source component at this checkpoint. The winning network then retains 122/628 skeleton cells (19.4%), omitting 506 cells. The 69-cell principal path is rasterized to the 356-cell frozen Plate mask; candidate and descriptor bytes match exactly.

At 119.016667 s, source filtering leaves 898 cells in three components; boundary/length eligibility leaves 893 cells in one component, removing the other two components (five cells). The current selected network has 358 cells. Its 1,076-cell ribbon is an active candidate at that analysis, **not** another frozen Plate. The exact 120 s endpoint is 0.983333 s later than this last qualification analysis; no synthetic 120 s qualification snapshot is reported.

### Chemical and mechanical relationship

- At first Plate birth, native chemical is preserved as 316×316 Float32 and projected onto the fixed 96×96 comparison coordinates. Projection and chemical memory each have 3,105 literal-positive cells; memory changes values but adds no positive support in this snapshot. The production `≥0.30` memory mask contains 1,075 cells in 42 components.
- Raw compaction `SurfaceField ≥0.015` contains 4,244 cells in 95 components. The production `sampleSupport` readout at the same 96×96 coordinates contains 4,634 cells in 37 components: +390 thresholded cells and fewer connected pieces. This is a readout expansion/merging measurement, not stored-field diffusion. Among the 1,075 chemical-qualified production queries, 1,074 pass support.
- Twelve chemical ridge anchors were selected mechanically at the 60.016667 s analysis: positive 8-neighbor maxima, row-major tie rule, descending value, and >3-cell spacing. At each review checkpoint, fixed-coordinate profiles use the registered covariance-derived normal and offsets `−8..+8` in 0.5-cell increments.
- At first birth, the raw-compaction peak and raw-chemical peak share the same sampled offset at 1/12 anchors. Median absolute peak displacement is 2.5 analysis-grid cells (range 0–6.5); signed offsets occur on both sides (6 positive, 5 negative, 1 zero). `sampleSupport` versus raw-compaction peak displacement has median absolute 0.5 cell. Whole-grid Pearson correlations are 0.529 for projected chemical/raw compaction and 0.614 for chemical memory/raw compaction; these include the shared zero background and remain descriptive.
- The largest full-skeleton component's maximum Jaccard overlap with any component at the immediately preceding one-second analysis is 0.949 at 83.016667 s, 0.955 at birth, and 0.945 at 119.016667 s. This is short-interval raster overlap continuity, not evidence of an independent material-history law.

## [Modeling hypothesis]

**Supported narrow conclusion:** current G has spatially richer qualified/skeleton input than the winning Plate network retains in this early seed. The largest single observed reduction at first birth is within the source-connected component, from 628 eligible skeleton cells to a 122-cell retained network. This supports a current selector/pruning bottleneck for this seed and window; it does not establish that all excluded branches are stable or artistically desirable.

Raw mechanical and chemical ridge profiles are measurably non-coincident in several cross-sections, but offsets are mixed rather than consistently lateral. Verdict for the secondary Family 3 availability question: **weak/mixed**. No levee or lateral-margin formation claim follows.

## [Artistic interpretation]

Not evaluated. This pass did not render material or test perception. [`review.html`](review.html) is a fixed-scale technical map viewer, not an aesthetic verdict.

## Evidence files and reproduction

- Preregistered scope and pre-result audit: [`PLAN.md`](PLAN.md).
- Machine-readable measures, source/input SHA-256, and every analysis row: [`data/formation-ledger.json`](data/formation-ledger.json).
- Exact checkpoint arrays and field hashes: [`data/checkpoint-arrays.bin.gz`](data/checkpoint-arrays.bin.gz), [`data/checkpoint-arrays-index.json`](data/checkpoint-arrays-index.json).
- Frozen input comparison, sequential overlap, and cross-sections: [`data/frozen-input-parity.json`](data/frozen-input-parity.json), [`data/continuity.json`](data/continuity.json), [`data/cross-sections.json`](data/cross-sections.json).
- Same-coordinate technical views: [`review.html`](review.html), with native-grid values retained in the exact checkpoint packet. Review PNGs use fixed grayscale scaling per field and the same 0–1 world extent.
- Command outcomes and validation scope: [`data/validation.json`](data/validation.json).
- Reproduce with `node scripts/ant-g-formation-information-ledger.js`; the runner reads the committed 120 s and raw 600 s G packets listed in `formation-ledger.json`.
- `node --check` and the runner's seven-assertion self-check passed. The final deterministic replay itself passed tick parity, live-selector parity, endpoint receipts, birth-mask identity, and frozen contact-prefix totals. No `src/` files changed; repository-wide `npm test` and build were not run.

## Limits and next pass

One seed and a 120 s horizon do not establish generality. The late checkpoint is the last production qualification analysis before 120 s, not an exact 120 s analysis. The 316→96 projection is analytical resampling, and topology is a raster proxy. Raw-correlation values include many zeros; cross-sections are 12 fixed local probes, not a population estimate. This pass neither validates a new Plate ontology nor selects a formation rule.

Recommended next pass: a **current-G persistence audit of the skeleton branches omitted between H and I**, using the same production replay and exact component provenance. The current birth retains 122 of 628 eligible source-connected skeleton cells, but this ledger does not show whether the 506 omitted cells are transient or sustained. Measure that before proposing any formation alternative; do not repeat the pre-G direct local-accretion shadow.
