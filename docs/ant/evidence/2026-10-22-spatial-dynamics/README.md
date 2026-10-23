# Spatial dynamics coordinated research

Research started 2026-10-22, finalized 2026-10-23 KST. Fresh production baseline: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. Branch: `codex/ant-spatial-dynamics-research-20261022`. No production adoption, renderer change, audio change, capacity increase or combined candidate.

Read the [decision and responsibility map](REPORT.md) first. The strongest movement effect survives three natural seeds, but deposited-cue failures and the one-seed two-hour saturation counterexample prevent an exhibition claim. Direct-flow recruitment is mixed versus isotropic. The field continuation gate failed and CIC was not run.

## Evidence navigation

- [Frozen plan and gates](PLAN.md), [source/prior evidence audit](AUDIT.md).
- [Movement protocol](movement/protocol.md) and [controlled/natural results](movement/results.md).
- [Baseline three-seed runs](baseline/README.md), [runner](runner/README.md), [recruitment plan](recruitment/PLAN.md) and [six-run comparison](recruitment/natural/analysis/ANALYSIS.md).
- [Field protocol](field/PROTOCOL.md) and [controlled phase/dose report](field/REPORT.md).
- [Continuous and material analysis](analysis/README.md); final outputs are `baseline-final/`, `natural-final/` and [long-run-final](analysis/validated/long-run-final/README.md). All use the same final analysis tool hash; rebuilding the 13 short analyses preserved their window/temporal values. Older local output directories are superseded and not part of this evidence commit.
- [Exact short/long prefix verification](validation/long-prefix-parity.json), [final reviewed full tests](validation/full-tests-reviewed.txt), [build](validation/build.txt).
- [Independent midpass field critique](review/midpass-critique.md), [fresh final review](review/final-independent-review.md), [publication resolution](review/parent-resolution.md).
- [Publication integrity](validation/publication-integrity.json), [exact changed-file inventory](validation/committed-files.txt) and [staged-byte verification](validation/staged-byte-verification.json). All 270 frozen source copies and 15 final analysis receipts were rehashed.
- [Visual comparison assets](visual/README.md) and [direct user assessment](HUMAN-REVIEW.md). The user read both route difference and temporal change; material saturation and exhibition stability remain separate.

## Stored inputs and reproduction

Large captures are committed as byte-preserving `result.json.gz` (and `movement/controlled-results.json.gz`). The [packing manifest](validation/packed-results.json) records raw and gzip SHA-256 and verifies exact decompression. Raw JSON copies remain local and ignored; source snapshots and compact summaries remain plain files. Restore raw files before the existing explicit-input analysis and verifier scripts:

```powershell
node docs/ant/evidence/2026-10-22-spatial-dynamics/validation/restore-results.mjs
node docs/ant/evidence/2026-10-22-spatial-dynamics/validation/verify-long-prefix.mjs test-results/spatial-prefix-recheck.json
npm test
npm run build
```

The restore script validates the manifest, refuses a conflicting existing raw file, and verifies every restored byte hash. Restoration does not run the simulation. For new experiments use fresh output paths; runners refuse replacement. Exact rerun commands, frozen tooling provenance and known limits are in [REPRODUCE.md](REPRODUCE.md).

The two-hour outputs are accelerated model evidence. They are not two-hour browser stability, artistic acceptance, biological regimes or a new exhibition operating mode.
