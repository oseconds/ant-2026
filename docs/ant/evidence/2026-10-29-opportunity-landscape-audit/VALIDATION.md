# Validation and reproduction

## Scope and authority

Production authority was freshly fetched as `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; the research branch starts at `b0ecad708bff8421cd01c384e4a3dad34203a3f2`. All new computations use existing frozen evidence. No natural simulation, replay, world observer, allocation law or feedback was run in this pass.

Production `src/`, `static/` and canonical `docs/ant/README.md` are preserved. Their Git tree/blob identities are recorded in `manifest.json`. Original primary main `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292` and fresh main have identical source/static trees. All 11 production file hashes recorded by the primary capture match the current checkout's raw bytes. The extractor also pins canonical-LF TrailPlateBirth and SurfaceField hashes before calling unchanged pure readouts.

## Executed checks

From the repository root, with Node v22.23.2:

```powershell
node scripts/ant-opportunity-core.js --self-test
node scripts/ant-opportunity-inputs.js --check
node scripts/ant-opportunity-landscape.js --check
node --test tests/surface-field.test.js tests/trail-plate-birth.test.js
```

All passed. The focused production suites passed **17/17 tests**. They cover contact deposition/readout, deterministic SurfaceField behavior, qualification, frozen births, refractory/contact gates and birth limits. No production test was altered.

Using the installed Python 3.12.14 runtime with Pillow 12.3.0:

```powershell
& 'C:/Users/5dudt/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/ant-opportunity-atlas.py --check
```

The two PNGs regenerate byte-for-byte. The parent visually inspected both final images: square world coordinates, fixed scale, correct F/S overlays, actual X membership and pre-material phase, visible grouping sensitivity, and the primary `.025` temporal correspondence rather than the wider sensitivity result.

`git diff --check`, manifest verification, scoped staging and protected-path equality are also required before commit. Final commit/push SHA and remote equality are reported in the delivery message; this pre-commit receipt does not predict its own commit hash.

Full `npm test` and `npm run build` were **not run**. This pass adds offline research analysis and documentation only; no production module, browser flow, audio path, dependency or configuration changed. The relevant production modules were tested above.

## Frozen input and manipulation validity

- The extractor reads the original pinned Git blob, verifies compressed and decoded hashes, and verifies the exact seed, grid and Audio Off state. The primary artifact is not replaced by a later research summary.
- Current production thinning of E matches stored F in **120/120** analyses. Pure current C-to-D readout matches **53,581/53,581** sampled S values exactly. Reconstruction from the two actual immutable masks matches the saved post-analysis material union in **120/120** frames.
- The independent reviewer additionally sampled current C-to-D at every 96-grid coordinate in all 120 raw snapshots. All **1,105,920** Float32 values matched the stored full diagnostic D maps, supporting full-field maximum/domain classification as well as the S-restricted analysis.
- Contact data contain **4,368 groups / 12,954 individual feet**. Exact-cell and nearby-foot counts are separate. Rolling `(t−20 s,t]` windows are independently checked by timestamp filtering at the fixed 20, 84 and 119 s anchors; all 9,216 cells match. A separate reviewer also brute-checked the S-aligned values at those anchors. Partial initial exposure remains labeled, not extrapolated.
- Actual pre-existing material uses commit time strictly earlier than the sampled analysis. The current commit is not incorrectly counted as an existing layer at its exact birth anchor.
- All 15 longer G checkpoint hashes match their original checksum file. D is derived by pure sampling of stored SurfaceField, not by simulating missing time. No B/E/F, late recent feet or qualified opportunity identity is inferred from those checkpoints.
- Every one of the 36 secondary actual mask IDs, commit times and byte hashes matches the original seed005 600 s birth receipts. The first two masks also match the exact primary packet. Replayed field samples from that mask source are excluded because of its disclosed source-version caveat. There is no material reference for seeds006/007 in this audit.
- The analysis checks frozen-input nonmutation and runs its primary calculations with a throwing `Math.random` tripwire. It never instantiates AntController or advances production time. The pure readouts consume no simulation RNG. The source/input files remain unchanged.
- Core self-checks cover exact-equal plateaus, higher-neighbor rejection, row boundaries, zero context, deterministic ties, component-aware grouping, reciprocal matching, missing matches, input nonmutation and no RNG.
- Analysis regeneration requires identical decoded full measurements and identical canonical-LF summary text. Missing top2/top3 ranks stay null; the same-component top3 statistic excludes frames without three centers.
- End-to-end assertions require the material/X reference's D winner to equal the S-conditioned rank1 coordinate and value at **all 109 usable snapshots**. The actual material-context X rows also reproduce the **10/10** saved parent X memberships exactly. This checks the consumed rows, not a separate unused helper.

## Inherited versus new parity

**[Existing evidence]** The primary capture already checked 7,201 tick-chain rows, observer nonmutation, 120 production-selector comparisons, endpoint fields and first-birth receipt. Those validations are inherited provenance, not a new live replay claim. A 120 s contact-prefix/internal hash is not equated with a full 600 s digest.

**[New diagnostic result]** This pass adds exact extraction, current-source readout/thinning parity, separate-channel peaks and grouping, explicit correspondence sensitivity, contact context, verified actual-material references and deterministic plots. Technical success validates those computations; it does not validate an allocation law or turn diagnostic peaks into natural material entities.

## Corrections preserved before acceptance

1. **Inventory:** an initial interpretation treated C0's cloned descriptor mask as actual material. Direct hashes, occupied-cell counts and runner source disproved that interpretation. Actual masks were then independently verified from the separate stratigraphy packet. C0 masks never enter the accepted material measurements.
2. **Input expansion:** the initial compact extract preceded that secondary mask discovery. `data/input-evolution.json` records both hashes. Removing only `secondary.actualMaterial` recreates the initial gzip hash; the primary 120-frame content hash is unchanged. This added material context, not a new opportunity-channel definition.
3. **Analysis:** intermediate checks found an undefined component reference, missing-rank handling, an incorrect overlap label, and a raw-vector/statistics-object mismatch that could choose the first S node for the material reference. These were fixed before report acceptance. The final all-109 winner invariant and consumed-row 10-anchor X check now guard the latter error. Rank changes, continuing-track rank inversions and winner changes have distinct fields. Switch totals used in prose exclude the initial appearance.
4. **Rendering:** the first plots stretched the world frame, mixed `.075` tracks into the primary display and used an off-S raw global coordinate for a winner-distance plot. The final renderer uses a square frame, `.025` primary tracks, S-conditioned winners and explicit X-cell overlays. Data-driven overlay checks and deterministic byte checks pass after correction.
5. **Protocol scope:** an intermediate run calculated `.30` temporal summaries in addition to the registered `.15` correspondence. They were removed; final measurements contain only the eight registered channel/cutoff combinations. `.30` remains a spatial grouping sensitivity only. No inference uses the discarded intermediate outputs.
6. **Prose cleanup:** a copyediting attempt split several bare abbreviated IDs. The parent restored exact quoted references and checked the final text. No code, input or numerical output was changed by that attempt.

The independent acceptance reviewer used fresh reads and separate reconstruction checks, and found no blocking methodology, provenance, scope or current-G compatibility issue on final acceptance. Its methodological concerns were resolved or retained as limitations: component-aware group counts are not an exact opportunity cardinality; correspondence does not establish true birth/death; D is not causally decomposed into old/new loading; late E/F is missing. Its two final editorial notes were corrected without changing numerical outputs or methods.

## Environment and receipts

The restricted process environment initially blocked Node's Git subprocess during read-only extraction (`EPERM`) and a test-runner child process. Identical commands succeeded with the approved process permission. The bare `python` command resolves to a WindowsApps stub; the recorded bundled interpreter was used. These failures did not produce accepted measurement files.

`manifest.json` records canonical-LF text hashes and raw binary hashes for research outputs, scripts, daily records, reused inputs and protected production identities. It intentionally excludes itself from recursive hashing. No previous evidence, canonical README, production selector or ignored material is modified.
