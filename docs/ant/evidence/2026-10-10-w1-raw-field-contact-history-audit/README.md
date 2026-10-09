# W1 raw-field / contact-history contrast audit

## Question and boundary

This read-only audit asks whether the existing binary qualification and EMA-derived activity conceal differences that remain in the archived local fields and actual same-cell FOOT_CONTACT history. It defines no material birth, contribution function, threshold, weight, geometry, or closure rule. No natural ANT replay or production change was made.

**Decision: Informative.** In all three frozen seeds, `chemicalMemory`, `support`, and `surface` vary broadly inside the same `q=1` state of candidate ID 0's historical union. `chemicalMemory` and `surface` also vary inside `q=0` there. Field deltas are repeatedly different in cell intervals containing an archived FOOT_CONTACT. These findings show additional descriptive information beyond binary qualification and the historical union. The contact contrast is associational, and none of these values establishes material contribution, mass, consolidation, stiffness, or physical birth.

The comparison keeps five records separate: historical footprint, current active mask, binary `q`, continuous field history, and actual contact history. `support` and `surface` are distinct model fields. A raw field magnitude, contact, or temporal correlation is not interpreted as a physical force or causal effect.

## Frozen inputs and provenance gate

All source files were present and matched the committed provenance before analysis. Snapshots and summaries came from `test-results/ant-interior-endpoint-shadow/seed<seed>-snapshots.bin.gz` and `seed<seed>-summary.json`; FOOT_CONTACT points came from `docs/ant/evidence/2026-10-07-social-graph/data/seed<seed>-on-raw-events.json.gz`. Each snapshot archive contains 599 observations through 599.25 s. Every observation has 9,216 row-major cells and five contiguous arrays in this order: Float32 `chemical`, `chemicalMemory`, `surface`, `support`, then UInt32 `contactCounts`. Each array occupies 36,864 bytes. Each decompressed archive is 110,407,680 bytes. The first descriptor starts at byte 0; the last starts at byte 110,223,360 and ends at byte 110,407,680. The descriptor SHA-256 is the same for all seeds.

| Seed | Summary bytes / SHA-256 | Snapshot gzip bytes / SHA-256 | Decoded bytes / SHA-256 | FOOT_CONTACT points / archive bytes / SHA-256 | Descriptor SHA-256 |
|---|---|---|---|---|---|
| 20261005 | 225,877,622 / `40141611fb8e8e0e25a9ac4c0cd143e687bf94e10c2d4577594f73c7ac812b0a` | 42,694,915 / `a9eb9cd63ee9fd39271efdf9ea9729507fb3b08990d15d2a5f9aebd7fb992e9f` | 110,407,680 / `9761f3a6ccfee00cf00f78b3958b82185663b0b977bac66f6e5ca5ae9e89d729` | 105,641 / 4,446,647 / `4c0b8728a9dd62067c20734f3a4f7628e480fc7565d41dc27270d994be92e503` | `d1aec747431b0250d5efbfca406e20201911fdc50c89453873fdeadf8befe98b` |
| 20261006 | 219,192,262 / `7139d522adc0886970a44833980aa62373f0c10ae61ab98d3520e8c5a2ca7a39` | 43,440,798 / `a46fec776dff03833ac0551e601b42b4191360e06135e244ebe149edeef22c3e` | 110,407,680 / `c8285bd68b2786a3c7c6b7e7bbdddd239bc3718d7dc4505aa14a0742c2f5e545` | 104,676 / 4,344,559 / `662fb75f6c5b7a2fc5e84a08628dbc56e0ca26921572ae564a8499e282704ad4` | `d1aec747431b0250d5efbfca406e20201911fdc50c89453873fdeadf8befe98b` |
| 20261007 | 220,055,044 / `6822af6225f211136c58d203203e4e9add2818da26d7fa28c4554e7bc1baa452` | 42,321,540 / `80e410278f3a732d7d0784fd8c1d775785d923df1e2cb60da8d79bf12dca4350` | 110,407,680 / `71bee1ef782524354308efca308fb63d01cbf69f73597fd0b49e08512b9f9ba4` | 104,876 / 4,444,163 / `e012b877c53dfb0634db40d97d97af853d4835602e56a4ee0cd1eab8f33689f4` | `d1aec747431b0250d5efbfca406e20201911fdc50c89453873fdeadf8befe98b` |

The shared provenance files also matched:

- `docs/ant/evidence/2026-10-08-interior-endpoint-shadow/data/replay-verification.json`: 54,556 bytes, SHA-256 `39e2a0bb3fb1e4b71e6f823a3852d95c730c4d8fedb35b814775ae90974c377c`.
- `docs/ant/evidence/2026-10-08-w1-episodic-material-shadow/inputs/field-decisions/INPUT-PROVENANCE.md`: 6,846 bytes, SHA-256 `77889a15a9bf17b20a6e7345a726e2e0a69eac16ee7a5a8e469c752009584577`.
- Committed social-archive checksum ledger: SHA-256 `77bfc7f34174b1853acf6a77e6bdbc2409d69e22271d4ab7e509c26d04343dbb`.

The exact descriptor offsets are, for the first observation: `chemical=0`, `chemicalMemory=36864`, `surface=73728`, `support=110592`, `contactCounts=147456`. The final observation starts at `chemical=110223360`, `chemicalMemory=110260224`, `surface=110297088`, `support=110333952`, `contactCounts=110370816`; each final array ends 36,864 bytes after its offset. The first sample is at 0.016666666666666666 s; the final descriptor is tick 35,955 at 599.2500000000696 s.

The actual FOOT_CONTACT point archives, rather than counts alone, supplied positions and exact `simulationTimeMs`. Reconstructed per-cell cumulative point counts equal the snapshot UInt32 arrays. The W1 distinct-timestamp condition was reconstructed from archived same-cell timestamps; repeated points in one timestamp do not add a distinct timestamp.

## Reconstruction and parity

For each observation, `q=1` was reconstructed from the frozen predicates:

1. `chemicalMemory >= 0.30`;
2. conditional mechanical `support >= 0.015`;
3. at least two distinct archived FOOT_CONTACT timestamps at that cell through the observation time.

The existing active mask was replayed with the frozen 20 s / 90 s EMA state and original activity condition. Exact q/raw-flag parity, EMA active-mask parity, and W1 geometry/character equality hold for all 1,797 seed-observations. Original W1, max-overlap candidate geometry and character, stored candidate identity frames, and the previous cell-history and spatiotemporal ID 0 milestones all deep-equal their archived results. Randomness is disabled in the audit. The analysis uses adjacent stored samples only, with no between-sample field interpolation.

## Findings

The raw field ranges across the frozen inputs were:

| Field | Archived range | Interpretation in this audit |
|---|---:|---|
| `chemicalMemory` | 0 to 0.9519418 | Dimensionless model memory scalar |
| `support` | 0 to 0.9651266 | Raw simulation support scalar; not calibrated force |
| `surface` | 0 to 0.9761037 | Raw SurfaceField scalar; not equivalent to `support` |
| `chemical` | 0 to 1.0095540 | Validated auxiliary field; not interpreted |
| `contactCounts` | 0 to 183 per cell | Cumulative individual archived FOOT_CONTACT foot points |

Within ID 0's historical union, all three measured continuous fields vary across observations while `q` remains 1:

| Seed | `chemicalMemory` q=1 min–max (mean) | `support` q=1 min–max (mean) | `surface` q=1 min–max (mean) |
|---|---:|---:|---:|
| 20261005 | 0.3000004–0.9451364 (0.52735) | 0.0442548–0.9651243 (0.35722) | 0.0367743–0.9746085 (0.35789) |
| 20261006 | 0.3000001–0.9447043 (0.52370) | 0.0509901–0.9635124 (0.36111) | 0.0351563–0.9755689 (0.36189) |
| 20261007 | 0.3000013–0.9519418 (0.52705) | 0.0408422–0.9651266 (0.35748) | 0.0342031–0.9761037 (0.35856) |

The historical union also contains q=0 observations with `chemicalMemory` means 0.11149–0.12288 and `surface` means 0.30032–0.31450 across seeds. In this candidate footprint the stored `support` value is exactly zero for q=0. That conditioning limits what the q=0 support comparison can say; it is not evidence of an absence of physical support.

Actual same-cell FOOT_CONTACT in `(previous observation, current observation]` was compared with the raw field delta for that cell interval. The per-seed mean delta ranges were:

| Field | Contacted interval mean Δ | No-contact interval mean Δ | Descriptive reading |
|---|---:|---:|---|
| `chemicalMemory` | +0.00118 to +0.00133 | +0.00032 to +0.00034 | Contact intervals have a larger mean rise in these archives |
| `support` | +0.00391 to +0.00401 | +0.00019 to +0.00021 | Contact intervals have a larger mean rise, with both positive and negative cell deltas |
| `surface` | +0.02032 to +0.02052 | +0.00019 to +0.00019 | Contact intervals are associated with larger observed rises |

There are about 86,000 contacted cell-interval samples per seed versus about 5.42 million without a same-cell contact. These are cell interval aggregates; multiple individual foot points in an interval do not multiply the field sample. The contrast can reflect location, activity, stored history, or other shared conditions. It does not identify a contact's instantaneous response, contribution amount, or causal effect. Snapshot spacing is approximately one second.

At 599.25 s, every cell in each ID 0 historical union has at least two distinct archived contact timestamps, consistent with the original q admission predicate. Yet the latest actual same-cell FOOT_CONTACT age within those unions has a median of 32.62 / 40.07 / 41.13 s, a 90th percentile of 150.38 / 141.86 / 154.86 s, and maxima of 527.73 / 585.97 / 512.72 s for seeds 20261005 / 20261006 / 20261007. Thus cumulative contact qualification can remain true long after the last observed contact. This is an explicit stale-history risk, not current physical support evidence.

In the final archived interval, only 50–65 cells change q per seed, while raw fields show both increases and decreases across the arena: `chemicalMemory` has 1,539–1,810 increases and 5,911–6,475 decreases; `support` has 671–877 increases and 2,000–2,347 decreases; `surface` has 431–553 increases and 8,264–8,583 decreases. Exact-zero counts are preserved in `results/time-series.csv`. This quantifies changes occurring without a q transition; the delta maps localize the changes without adding links or geometry.

At the four requested cutoffs, ID 0 remains alive in all seeds. The historical union grows while the active and q masks change independently:

| Seed | Requested time (s) | Actual sample (s) | ID 0 union cells | ID 0 currently active | q=1 cells | Current active cells | Contact points / cells in preceding interval |
|---|---:|---:|---:|---:|---:|---:|---:|
| 20261005 | 120 | 120.017 | 1,318 | 1,280 | 1,379 | 1,462 | 192 / 162 |
| 20261005 | 300 | 300.017 | 4,592 | 2,667 | 2,763 | 2,752 | 185 / 149 |
| 20261005 | 480 | 480.017 | 5,531 | 953 | 2,836 | 2,473 | 180 / 144 |
| 20261005 | 599.25 | 599.250 | 5,960 | 2,291 | 3,067 | 2,628 | 205 / 168 |
| 20261006 | 120 | 120.017 | 965 | 939 | 1,006 | 1,077 | 149 / 125 |
| 20261006 | 300 | 300.017 | 4,185 | 2,649 | 2,673 | 2,774 | 173 / 135 |
| 20261006 | 480 | 480.017 | 5,480 | 2,509 | 3,048 | 2,609 | 166 / 135 |
| 20261006 | 599.25 | 599.250 | 5,936 | 1,654 | 2,811 | 2,358 | 187 / 150 |
| 20261007 | 120 | 120.017 | 1,167 | 1,143 | 1,197 | 1,238 | 182 / 154 |
| 20261007 | 300 | 300.017 | 4,305 | 2,654 | 2,674 | 2,754 | 192 / 160 |
| 20261007 | 480 | 480.017 | 5,436 | 898 | 2,762 | 2,462 | 177 / 142 |
| 20261007 | 599.25 | 599.250 | 6,031 | 2,000 | 2,978 | 2,490 | 167 / 139 |

This separation is descriptive: a historical union records candidate history, `q` records existing qualification, the active mask records the frozen EMA predicate, and the contact archive records observed FOOT_CONTACT events.

## Figures and scales

`plots/field-contact-milestones-seed20261005.png` through `seed20261007.png` show the nearest archived observations to 120 / 300 / 480 / 599.25 s. Each uses a 96×96 fixed world extent and actual cells only. Panels include ID 0 historical union, current active mask, q mask, raw fields, latest same-cell contact age, preceding-interval contact locations, field deltas, cumulative contact points, and distinct contact timestamps. No paths, links, interpolation, per-panel normalization, or morphology adjustments are drawn.

Each raw field uses its all-seed / all-time stored range, printed with its unit in the panel title: `chemicalMemory` [0, 0.9519418], `support` [0, 0.9651266], `surface` [0, 0.9761037]. Each delta field uses a symmetric scale around zero from its global maximum absolute delta. Contact age uses [0, 599.25] seconds; contact counts use [0, 183]. The pooled distribution plot uses 64 equal-width bins on common raw ranges and unnormalized counts. `field-temporal-means` preserves exact samples without smoothing. The contact delta plot is associational.

PNG and SVG figures are provided. `plots/plot-manifest.json` records display ranges, input hashes, the 96×96 cell extent, and figure hashes. `validation/fixed-scale-plots.json` records output pixel dimensions and range checks; the milestone sheet was visually inspected.

## Limitations

- q compresses the continuous fields into existing binary predicates, and the active mask adds the frozen EMA history. This audit measures information left in source fields; it does not propose a replacement predicate.
- q includes cumulative distinct FOOT_CONTACT qualification. A stale qualifying contact can remain part of q even after current contact has ended.
- EMA carry-over separates present activity from an instantaneous physical measurement.
- Raw `support`, `surface`, and memory values are model state. Their magnitude is not calibrated material mass, stiffness, consolidation, or contact force.
- A contact and a field change in the same roughly one-second interval do not determine which caused the other or recover the sub-frame response.
- `surface` is never treated as `support`. `chemical` was validated and retained only as an auxiliary range, not used to strengthen the decision.
- No threshold search, field transformation, candidate geometry, material event, W2 promotion, feedback, vitality, audio, or production modification was made.

## Reproduction and validation

From the repository root, reproduce the numerical package and figures with:

```powershell
node scripts/ant-w1-raw-field-contact-audit.js docs/ant/evidence/2026-10-10-w1-raw-field-contact-history-audit/results
uv run --cache-dir ./.codex-tmp/uv-cache --with matplotlib==3.11.2 --with numpy==2.3.5 python scripts/ant-w1-raw-field-contact-plots.py
```

An independent second process wrote the same numerical and plot outputs to `test-results/w1-raw-field-contact-reproduction/`; every one of the 8 result files and 15 plot/manifest files matched byte-for-byte. See `validation/independent-reproducibility.json`.

Input hashes, source fingerprints, numerical outputs, plots, and test/build logs live in this package. `results/checksums.json` protects numerical outputs; `plots/plot-manifest.json` protects figure outputs. Focused tests pass 5/5; unchanged `npm test` passes 393/393; `npm run build` passes with 408 modules transformed. The build retains existing Rollup annotation and large-chunk warnings. The sandbox initially blocked child process creation; after process permission review, the unchanged full test and build commands passed. Diagnostic sandbox attempts are retained separately and explicitly labeled. Fixed-scale checks, all input/output parity, and independent reproduction pass. See `validation/` for logs and results.
