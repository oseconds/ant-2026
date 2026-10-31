# Validation — B/C dual-material shadow

## Provenance

- Production authority: `bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Frozen source packet commit: `da599d9f385f53d0bb24df3e737c5ed2e2eb6a23`.
- B/C analysis commit: `a75b83ce5dbeece36d60d966b9d86fc85ddb5f54`.
- Author-review package commit: `dfc29559860ec9e6312d2ea556041d956117bc5e`.
- Frozen input manifests, track/chunk files, source hashes, and generated-file hashes are listed in [manifest](manifest.json) and [SHA256SUMS](SHA256SUMS.txt).

## Checks performed

- Reused the exact three frozen seeds and all 599 saved analysis boundaries per seed; no new natural measurement trajectory.
- Verified frozen opportunity chunk hashes and every referenced saved X capture against the B/C track receipts.
- Used one maturation function for both B and C; actual timestamp differences drive the 20 s crossing.
- Independently reloaded event gzip files, recomputed each adjacent X-set Jaccard from fresh sets, checked uninterrupted anchor chains, interval age and first saved crossing, and rebuilt every cell's ordered provenance sequence from event X sets.
- Rebuilt per-cell layer-count histograms over the complete grid and compared them with the saved ledgers.
- The independent artifact review passed for all 2,089 events, 42,344 within-event stability transitions and 19,299 touched cell-seed entries.
- The observer analysis made zero RNG calls and did not write production state.
- Deterministic composite regeneration passed for the objective atlas and stratigraphy atlas. Native presentation-frame replay reconstructed eight missing selected frames after all 599 boundaries matched the frozen state receipts for each replayed seed; the replay preserved the recorded final RNG state/call count.
- `git diff bc045dc3caa5954df633ecbee37fbabcb8224f30 -- src static` is empty.
- `node --check` passed for both analysis scripts; `git diff --check` is recorded at commit validation.

## Independent artifact review receipt

| Seed | Events | Adjacent X transitions checked | Touched cells reconstructed | Event age / first crossing | Ledger order / histogram |
|---|---:|---:|---:|---|---|
| 20261005 | 662 | 13,414 | 6,585 | pass | pass |
| 20261006 | 717 | 14,535 | 6,238 | pass | pass |
| 20261007 | 710 | 14,395 | 6,476 | pass | pass |

The detailed machine-readable review is embedded as `independentArtifactReview` in `analysis/validation.json`. Input hashes were checked before and after analysis. The final package checksum list covers all evidence, visuals, scripts and report material except the checksum list itself.

## Scope

No production `src/` or `static/` file changed. No competition, nucleation, feedback, actual Plate birth, MaterialStratigraphy update, physical/audio material distinction, Residence pass, or parameter tuning was performed. This validates the observer computation and its artifacts, not an artistic decision or future causal law.
