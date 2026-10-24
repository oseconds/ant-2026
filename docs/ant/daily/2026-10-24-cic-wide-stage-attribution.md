# CIC wide failure stage attribution — 2026-10-24

Started from CIC qualification commit `1fbfec5943c41ad6c8b3828fb48c47828d9be817`; it is two commits ahead of freshly fetched `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. Preregistered row identity, stage definitions, cohorts, and stop boundary before deriving the saved-row census.

**Read-only result:** both production C and CIC D retain 2,378 / 5,072 final mismatches, but 92 rows recover and 92 new errors appear. Among new errors, D's full order first diverges from A at the pre-weight raw-maximum diagnostic in all 92; the analytic final target first leaves top there in 66 and at the unchanged weighted-maximum stage in 26. No new target failure first appears at Hill response or deterministic score. The recovered rows are mixed: D restores 14 targets at weighted maximum and 10 at final score. Route and phase differences remain visible; p11 has the largest named net increase (+11). The separate 392-row S analytic-zero local control has 364→377 false-nonzero cues while mean absolute steering drops from 0.03539 to 0.01790 rad.

No writer, reader, sensor, movement, or qualification change follows. Gate 2 remains **MIXED / NOT QUALIFIED**; Gate 3 remains **NOT RUN**. Evidence and limits: [CIC wide stage-attribution package](../evidence/2026-10-24-cic-wide-stage-attribution/README.md).

Fresh read-only independent review found no blocking issue. It confirmed that the 26 weighting-first new errors already differ in full order at the raw diagnostic stage while retaining A's target until weighted max; the target-specific attribution above remains the basis for the claim. Review did not rerun tests or regenerate the analysis.
