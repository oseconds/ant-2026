# W1 Post-contact Field Retention Audit

**Run date:** 2026-10-10 (Asia/Seoul)

**Branch / analyzed source HEAD:** `ant-w1-episodic-material-shadow` / `eb520969fd88fb8c60deb6b46c96f7afd7dfff3f`
**Decision:** **Informative / Mixed** — continuous field changes remain observable inside unchanged q, active, and ID 0 history, but this audit does not identify an independent material-forming process.

## Question and scope

This read-only audit asks what the archived `chemicalMemory`, `surface`, and `support` values do after actual same-cell `FOOT_CONTACT` observations. It adds no material contribution, birth, geometry, threshold, weight, state, or episode rule. It uses the existing 599 snapshots per seed, through 599.25 s, for seeds `20261005`, `20261006`, and `20261007`. No natural ANT replay was run.

The observed field set is deliberately kept separate from historical ID 0 footprint, current active mask, binary q, and actual contact history. None of these values is interpreted as material mass, consolidation, stiffness, or physical birth.

## Frozen source and provenance

The audit reads the frozen snapshot and summary pairs under `test-results/ant-interior-endpoint-shadow/seed<seed>-{snapshots.bin.gz,summary.json}` and the committed raw contact archives under `docs/ant/evidence/2026-10-07-social-graph/data/seed<seed>-on-raw-events.json.gz`. It verifies each source's size and SHA-256 against the existing replay/provenance records, and confirms the existing field-provenance and raw-field audit ledgers remain byte-identical before and after the run.

| Seed | Snapshot archive bytes / SHA-256 | Decoded bytes / SHA-256 | Descriptor SHA-256 | FOOT_CONTACT archive bytes / SHA-256 |
|---|---|---|---|---|
| 20261005 | 42,694,915 / `a9eb9cd63ee9fd39271efdf9ea9729507fb3b08990d15d2a5f9aebd7fb992e9f` | 110,407,680 / `9761f3a6ccfee00cf00f78b3958b82185663b0b977bac66f6e5ca5ae9e89d729` | `d1aec747431b0250d5efbfca406e20201911fdc50c89453873fdeadf8befe98b` | 4,446,647 / `4c0b8728a9dd62067c20734f3a4f7628e480fc7565d41dc27270d994be92e503` |
| 20261006 | 43,440,798 / `a46fec776dff03833ac0551e601b42b4191360e06135e244ebe149edeef22c3e` | 110,407,680 / `c8285bd68b2786a3c7c6b7e7bbdddd239bc3718d7dc4505aa14a0742c2f5e545` | `d1aec747431b0250d5efbfca406e20201911fdc50c89453873fdeadf8befe98b` | 4,344,559 / `662fb75f6c5b7a2fc5e84a08628dbc56e0ca26921572ae564a8499e282704ad4` |
| 20261007 | 42,321,540 / `80e410278f3a732d7d0784fd8c1d775785d923df1e2cb60da8d79bf12dca4350` | 110,407,680 / `71bee1ef782524354308efca308fb63d01cbf69f73597fd0b49e08512b9f9ba4` | `d1aec747431b0250d5efbfca406e20201911fdc50c89453873fdeadf8befe98b` | 4,444,163 / `e012b877c53dfb0634db40d97d97af853d4835602e56a4ee0cd1eab8f33689f4` |

Each snapshot has 599 timestamp descriptors and the archived array order `chemical`, `chemicalMemory`, `surface`, `support` (Float32), then `contactCounts` (UInt32). Every descriptor timestamp, frame count, array order, array size, and contiguous byte offset was checked. Each array occupies 36,864 bytes per frame; the first timestamp is 1/60 s and the final timestamp is 599.25 s. First and final descriptors, complete snapshot/source fingerprints, and input packet hashes are recorded in `results/summary.json` and `results/source-fingerprints.json`. The full input-provenance record is `docs/ant/evidence/2026-10-08-w1-episodic-material-shadow/inputs/field-decisions/INPUT-PROVENANCE.md` (6,846 bytes; SHA-256 `77889a15a9bf17b20a6e7345a726e2e0a69eac16ee7a5a8e469c752009584577`).

## Existing field semantics used

- **`surface`:** `SurfaceField` relaxes every controller tick at its existing 1,800 s half-life. In the recorded update order, relaxation occurs first, then archived foot-contact points deposit through the production kernel (`radius = 0.012`, `dose = 0.025`). The spatial footprint was reconstructed from that exact kernel, not an added proximity cutoff. At each saved observation, a passive reference starts from the previous observed surface and receives the same intervening 60 Hz relax updates with no contact deposits. Its per-cell residual is observed surface minus that passive expectation.
- **`chemicalMemory`:** the existing `TrailPlateBirth.updateChemicalMemory` samples the decayed/deposited `PheromoneField` and applies its existing 20 s EMA (`alpha = 1 - exp(-elapsed / 20)`). The pheromone field's 15 s half-life does not directly apply to `chemicalMemory`. Chemical movement and deposition are not fully identified by the frozen FOOT_CONTACT archive; no-contact here therefore does not mean chemical-input-free.
- **`support`:** support is a separate conditional sample of `SurfaceField.sampleSupport` at each grid cell center using the existing 0.025 sampling radius, stored only when `chemicalMemory >= 0.30`. At unsampled cells the snapshot buffer remains zero. Such a zero is conditionally unobserved, not evidence that mechanical influence vanished. Support is not treated as surface or calibrated force.
- Same-cell contact age uses the existing W1 96×96 grid mapping and actual archived contact times. Individual foot points and distinct contact timestamps are counted separately. The final no-contact intervals are right-censored at 599.25 s; never-contacted cells are reported separately. The 0–20, >20–90, and >90 s bins are descriptive only.

All field deltas use neighboring saved observations only. Contact events after the final 599.25 s cutoff (133 archive events across seeds: 40 / 51 / 42) are excluded. No 60 Hz field response is reconstructed between snapshots.

## Results

| Seed | Observations | Final ID 0 historical cells | ID 0 alive at cutoff | Whole-grid median last-contact age* | ID 0 median last-contact age* | Exact surface comparisons | Exact support samples at 4 milestones |
|---|---:|---:|---|---:|---:|---:|---:|
| 20261005 | 599 | 5,960 | yes | 49.58 s | 32.61 s | 5,520,384; max error 0 | 36,864 |
| 20261006 | 599 | 5,936 | yes | 62.69 s | 40.07 s | 5,520,384; max error 0 | 36,864 |
| 20261007 | 599 | 6,031 | yes | 57.02 s | 41.13 s | 5,520,384; max error 0 | 36,864 |

\* These are observed ages at the final cutoff, and the associated no-contact intervals are right-censored. They are not completed durations.

The production SurfaceField update replay matches all **16,561,152** archived per-cell values exactly across all 1,797 observations. The q flags reconstructed from archived fields and actual distinct contact timestamps match the frozen qualification flags at all 1,797 observations; cumulative foot-point counts also match every archived `contactCounts` array. Conditional support is reproduced bit-for-bit at the four requested checkpoints per seed (110,592 cell samples total), not claimed as a new all-frame reconstruction. The passive residual never falls below zero in the replay; its maximum was 0.07845 / 0.08823 / 0.08790 by seed. Across the 12 checkpoint maps, all 104,754 cell intervals with no same-cell or neighboring SurfaceField contact footprint have exactly zero passive-reference residual. Residuals occur in intervals with a production contact footprint, including neighboring-cell-only input.

For a matched descriptive contrast, the table below restricts to the same checkpoint, `q = 1`, `active = 1`, ID 0 historical union, and q unchanged since the previous observation. Rows are also partitioned by the existing eight common prior-field magnitude bins before aggregation. Counts are repeated cell-intervals across seeds and checkpoints, not independent experimental replicates.

| SurfaceField contact exposure during interval | Cell-intervals | Mean Δ chemicalMemory | Mean Δ surface | Mean Δ support |
|---|---:|---:|---:|---:|
| No same-cell or neighboring SurfaceField footprint | 22,008 | -0.0006416 | -0.0001370 | +0.0002590 |
| Neighbor-footprint only | 1,601 | +0.0003566 | +0.0057716 | +0.0052904 |
| Same-cell FOOT_CONTACT | 704 | +0.0001075 | +0.0181463 | +0.0069274 |

The surface directions and zero-input residuals follow the archived model's passive relaxation and exact contact deposits. `chemicalMemory` has both positive and negative observed changes within the same q/active/ID 0 stratum even where there was no SurfaceField footprint, but its complete PheromoneField input history is absent. That is an observed extra temporal distinction, not an identified independent process or a causal effect of contact. Support differences remain conditional SurfaceField samples. Across all observation intervals, the audit reconstructed 78,736 cell-level q transitions (26,689 / 26,165 / 25,882 by seed); these are transitions, not unique cells.

**Interpretation:** the evidence supports **Informative / Mixed**. Continuous values and changes distinguish local histories within the same binary q, active, and ID 0 state. The surface part is accounted for by the existing passive law and contact footprint, support is a conditional sample of surface, and chemicalMemory inputs are incomplete. Location, activity, field magnitude, historical qualification, and contact can share causes. The result does not establish consolidation, mass, stiffness, or material birth.

## Fixed-scale plots

All panels use the full 96×96 extent, shared raw field scales across seed and time, nearest-cell rendering, and actual saved locations only. Contact maps and timelines do not draw inferred connections; cell trace plots show observation markers without interpolated lines. The complete PNG/SVG set and scale manifest are in `plots/`.

| Seed | State / field maps | Interval deltas and passive residual |
|---|---|---|
| 20261005 | [PNG](plots/post-contact-states-seed20261005.png) · [SVG](plots/post-contact-states-seed20261005.svg) | [PNG](plots/post-contact-intervals-seed20261005.png) · [SVG](plots/post-contact-intervals-seed20261005.svg) |
| 20261006 | [PNG](plots/post-contact-states-seed20261006.png) · [SVG](plots/post-contact-states-seed20261006.svg) | [PNG](plots/post-contact-intervals-seed20261006.png) · [SVG](plots/post-contact-intervals-seed20261006.svg) |
| 20261007 | [PNG](plots/post-contact-states-seed20261007.png) · [SVG](plots/post-contact-states-seed20261007.svg) | [PNG](plots/post-contact-intervals-seed20261007.png) · [SVG](plots/post-contact-intervals-seed20261007.svg) |

Additional plots: [age-band delta timeline](plots/post-contact-age-band-deltas.png), [representative cell observation traces](plots/representative-cell-observation-traces.png), and [surface replay exactness](plots/surface-field-replay-exactness.png). Representative cells were selected mechanically before viewing traces: for each seed and final contact-age band, the lowest row-major ID 0 historical-union cell.

## Validation and reproduction

- `node --experimental-test-isolation=none --test tests/ant-w1-post-contact-field-retention-audit.test.js` — 7 fixtures for age/cutoff boundaries, tick and half-cell boundaries, contact footprint at interior and arena edges, exposure classification, conditional support sampling, and fixed magnitude bins.
- `npm test` and `npm run build` — full project validation logs are in `validation/`.
- The default sandbox blocked child processes for Node's isolated test runner and esbuild (`spawn EPERM`). The focused suite passed in-process; full `npm test` and `npm run build` passed through the approved process allowance. The build reported existing Zod annotation and >500 kB chunk warnings.
- The prior raw-field audit was run into a separate directory; all seven result files had the same byte counts and SHA-256 values as the committed raw-field audit. That audit validates 1,797-frame q/EMA/active parity and original W1 / max-overlap geometry, identity, closure, and character equivalence. Its result checksums and every earlier protected evidence/input hash remain unchanged.
- The numeric audit and plot generation were each run in separate processes to independent output paths; every numeric artifact and every plot/manifest byte matched. See `validation/independent-reproducibility.json`, `validation/fixed-scale-plots.json`, and the validation logs.
- The package-level `checksums.json` binds all evidence files, the daily chronology, and the exact tooling/test source files used for reproduction.
- The audit replaces `Math.random` with a throwing guard, checks finite field values and grid/contact indices, verifies timestamp causality and array offsets, and never writes to source archives.

From the repository root, reproduce the audit and plots with:

```powershell
node scripts/ant-w1-post-contact-field-retention-audit.js test-results/w1-post-contact-reproduction/results
uv run --cache-dir ./.codex-tmp/uv-cache --with matplotlib==3.11.2 --with numpy==2.3.5 python scripts/ant-w1-post-contact-field-retention-plots.py test-results/w1-post-contact-reproduction
node --experimental-test-isolation=none --test tests/ant-w1-post-contact-field-retention-audit.test.js
npm test
npm run build
```

The resulting plot package contains the fixed-scale images and a manifest; the numeric package contains summary, per-cell milestone data, observation-level rows, contact-age cohort summaries, matched deltas, representative traces, and source fingerprints. No follow-up experiment is proposed in this pass.
