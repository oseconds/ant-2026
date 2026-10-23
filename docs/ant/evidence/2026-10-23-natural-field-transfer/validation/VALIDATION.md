# Publication validation

Date: 2026-10-23 KST. Research branch: `codex/ant-natural-field-transfer-20261023`.

- Freshly fetched production baseline: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`; the pre-publication fetch returned the same main revision.
- Final full test run: **397 passed, 0 failed**, 36.431 s. See `full-tests-final.txt`. Earlier failed/intermediate logs remain explicitly named; the unused shard helper and its test are preserved outside this publication in the ignored cache, with receipts in `unused-shard-preservation.json`.
- Build: passed, 3.07 s. Existing Rollup annotation and large-chunk warnings remain in `build.txt`. No production source changed after this build.
- All 14 captured production-source receipts remain exact. The 12 individually reused prior research dependencies match their pinned prior Git blobs; see `reused-source-receipts.json`.
- Fresh independent review accepted the bounded research conclusions, with no remaining publication blocker. It did not qualify a production law or exhibition configuration. Final review SHA-256: `fa062c47af4fe902b2a321f1bf296c61ca04ae70a29dc0ac30700ff809d71ccf`.
- `src/**`, `static/**`, canonical `docs/ant/README.md`, `docs/ant/world-model.md` and the root README have no staged or working changes. Unrelated untracked captures and the separate worktree remain preserved.

## Diff and byte preservation

Byte-hashed source, protocols, raw captures and reviewed reports retain their original bytes. The added `.gitattributes` entries prevent Git from silently normalizing those files. This is necessary for the recorded source and evidence hashes.

The code/config/daily check passed with exit 0:

```powershell
git -c core.whitespace=cr-at-eol,-blank-at-eof diff --cached --check -- scripts tests .gitattributes docs/ant/daily/2026-10-23-natural-field-transfer.md
```

`cr-at-eol` recognizes preserved CRLF. The EOF exception preserves one already-hashed analyzer's final blank line; trailing-space checks remain enabled for code.

The all-file CRLF-aware check has exactly twelve known findings: ten intentional Markdown hard breaks (two spaces) and two preserved EOF blank lines. No other whitespace finding is accepted:

| File within the evidence package, unless prefixed otherwise | Lines | Reason |
| --- | --- | --- |
| `AUDIT.md` | 3, 4 | Markdown hard break |
| `movement-qualification/PROTOCOL.md` | 3, 4 | Markdown hard break |
| `movement-qualification/REPORT.md` | 3, 4 | Markdown hard break |
| `phase/PROTOCOL.md` | 3, 4 | Markdown hard break |
| `validation/independent-review.md` | 3, 4 | Markdown hard break in the exact reviewed artifact |
| `analysis/matrix-20261023/REPORT.md` | 148 | Preserved EOF blank line |
| repository `scripts/ant-transfer-analysis.js` | 1363 | Preserved EOF blank line |

These exceptions do not change source semantics, raw measurements, or reviewed conclusions. No persistent Git whitespace configuration was changed.

## Published scope

`changed-files.txt` enumerates the exact publication paths. `package-files-sha256.json` records the byte-preserved research files, excluding itself to avoid a hash cycle; `.gitattributes` and the daily entry use normal repository text handling and are covered by Git rather than this byte inventory. The inventory is packaging evidence, not another scientific run.

No ANT headed-browser run, browser soak, new long natural candidate run, audio validation, production adoption, or artistic acceptance is claimed. The only new browser use rasterized a static diagnostic SVG with headless Chromium.
