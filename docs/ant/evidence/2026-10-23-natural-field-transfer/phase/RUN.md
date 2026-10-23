# Phase qualification command

Run this only after the parent accepts the Stage A matrix's complete-state and RNG qualification. The command consumes one matrix state and its ordered write-history slice. It replays phase zero for `production`, `dtFeedback`, and `dampingOff` first; any phase-zero raster, trace, post-state, public-snapshot, or RNG mismatch stops the run before shifted phases execute.

```powershell
node scripts/ant-transfer-phase-runs.js `
  --matrix-dir docs/ant/evidence/2026-10-23-natural-field-transfer/capture/matrix-20261023 `
  --capture-id production-seed-20261005-180s
```

Replace the capture id with a state present in the matrix manifest. The default output is `phase/runs/<capture-id>-default-gaussian-phase-qualification.json.gz`; `--output <path>` selects another repository-local evidence path. Stage A is now accepted by the parent.

## Execution erratum — 2026-10-23

The first authorized run of `production-seed-20261005-30s` stopped during result assembly with `ReferenceError: phaseToolSourceHashes is not defined`. The computed value was named `phaseSourceHashes`; the result field now uses that binding. The failed run exited before writing an evidence artifact. The corrected pilot receipt is `runs/production-seed-20261005-30s-default-gaussian-phase-qualification.json.gz` (SHA-256 `3e8a431a7f5c011c4d8bde0340c40712235245f0aa5c761f4f35a4447cff925f`). Its phase-zero raster reconstruction and production, `dtFeedback`, and `dampingOff` trace/state/snapshot/RNG comparisons all pass exactly. Each mode recorded 228 reads, all interior for every preregistered phase. The run took 1.734 seconds; its sampled peak working set was 310,738,944 bytes at a 200 ms sampling interval.

## Output-size erratum — 2026-10-23

The initial runner revision had SHA-256 `68941ffd288208c8b8c8410d7aa0be757a0b2fa902da9f1d2c3699ea880024b9`; its exact source is preserved at [`runner-revisions/ant-transfer-phase-runs-68941ffd.js`](runner-revisions/ant-transfer-phase-runs-68941ffd.js). It wrote qualified receipts through `production-seed-20261005-480s`, then the 540-second computation reached output assembly and failed because it applied the 100 MiB cap to uncompressed JSON. That attempt wrote no receipt. The 360-second and 480-second gzip trailers report 79,756,561 and 100,403,047 uncompressed bytes; 480 seconds was near the cap. Revision two, SHA-256 `ff6654196ab5fe66a3a8fcf30f600d3be86deee742054a41b6617cb9675c5f06`, is preserved at [`runner-revisions/ant-transfer-phase-runs-ff665419.js`](runner-revisions/ant-transfer-phase-runs-ff665419.js). It capped compressed output files but still capped decompressed matrix input at 100 MiB. As a result, `production-seed-20261006-600s` stopped before replay when its state file expanded to 109,208,431 bytes from 3,540,416 compressed bytes; no receipt was written.

Revision three has SHA-256 `0a87bf61adc59529c6fe60a588e0d453cd7cf35c7cfc80479e9c0545b36975cb`. It validates positive receipt byte counts, checks compressed size and SHA-256 before inflation, caps compressed files at 100 MiB, uses the receipt's declared `uncompressedBytes` as `maxOutputLength`, and then requires the inflated length to match exactly. This is a packaging-integrity change; field replay, interventions, parity checks, and interpretation gates are unchanged. Each result records the runner hash used: the pilot through `production-seed-20261005-480s` uses revision one, `production-seed-20261005-540s` through `production-seed-20261006-540s` uses revision two, and receipts from `production-seed-20261006-600s` onward use revision three.

## Full fixed-state cohort validation — 2026-10-23

All 66 matrix states produced a receipt with all 12 expected arms (`p00`, `p10`, `p01`, `p11` × `production`, `dtFeedback`, `dampingOff`). Phase zero passed for 66/66, including exact history-raster reconstruction and exact trace, post-state, public-snapshot, and RNG comparisons for each movement mode. The three nonzero-phase arm sets are complete for the cohort; this runner/evidence pass does not interpret their responses or any raw snapshot, plate-birth, or later material-consumer state.

Across the 66 receipts, each phase contains 198 arms. Sensor rows are tagged separately: each phase has 76,632 `interiorAllPhases` rows and 2,316 `boundaryExposed` rows. These counts classify sampling geometry only; the boundary-exposed rows remain in the receipts.

The machine-validated file list, hashes, byte counts, p00 parity, matrix/source hashes, phase-helper hash, and runner revisions are recorded in `phase-cohort-20261023-manifest.json` (SHA-256 `307f5841e91260e40013fdb56f579f2ddad51f9e9fcfe74d9bdcf601e6902133`). Rebuild it from the repository root with:

```powershell
node --expose-gc docs/ant/evidence/2026-10-23-natural-field-transfer/phase/build-cohort-manifest.mjs
```

The builder checks all 66 files against the frozen matrix manifest, verifies compressed and inflated sizes, hashes each gzip, confirms the expected mode/phase arm coverage and p00 parity, and verifies the preserved runner-source hashes. It creates the manifest with create-only semantics.

The 66 saved receipts required 873.313 seconds of cumulative serial runner time. Including the three failed attempts documented above, 69 runner invocations used 906.477 seconds. The maximum sampled runner working set was 1,986,342,912 bytes at a 200 ms sampling interval; the states ran one process at a time.
