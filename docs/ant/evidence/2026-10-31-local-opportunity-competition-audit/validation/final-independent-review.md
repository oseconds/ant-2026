# Fresh independent review — local opportunity audit package

**Review date:** 2026-10-31

**Branch / HEAD checked:** `codex/ant-local-opportunity-competition-audit-20261031` / `594a0cb6c9267d5eeb2e955ccbdcd441076e7c15`

**Pinned production authority:** `bc045dc3caa5954df633ecbee37fbabcb8224f30` (ancestor of HEAD)

## Disposition

No blocking scientific or X-family aggregation issue was found in this review's scope. The audit remains a descriptive **SIGNAL-DEPENDENT / MIXED** result. This is not final package acceptance: the technical visual rerun and final manifest were still in progress, and were not reviewed here.

One low-severity numeric hygiene note is recorded below: the exported minimum angular span is a tiny negative floating-point residue. No report conclusion depends on it.

## Fresh checks performed

- Read the current X-family summarizer and its focused test, the generated `analysis/x-family-geometry.json`, the registered [PLAN](../PLAN.md) and [SIGNALS](../SIGNALS.md), the [REPORT](../REPORT.md), [VALIDATION](../VALIDATION.md), the ANT hub and daily index. Checked the branch authority ancestry and confirmed there is no `src/` or `static/` diff.
- Confirmed the summary script validates index authority/seed, verifies every anchor chunk against its recorded SHA-256, and reports only `.15` (`g15`) observations. It counts center rows separately from unique capture references; deduplicates by capture ID within each boundary/channel; and uses the lowest row-major referenced center for nucleus-dependent measurements. Its stated nearest-order-statistic quantiles match the registered convention. These are summaries only; the script does not add candidate allocation or material-selection behavior.
- Independently inspected raw seed `20261005`, anchor 12 (`12.0167 s`), in `seed-20261005.opportunities-anchors-001.json.gz`. Its compressed-byte SHA matches the hash in `x-family-geometry.json`. The D `g15` row references center 6671 and one unique capture, `X00001`, with cells `[6670, 6671]`. Recomputing coordinates on the 96 × 96 grid gave the saved centroid `(0.4894736842105263, 0.7263157894736842)`, center-to-entry distance `0.008221315448322853`, one 8-neighbor edge, cycle rank 0, and a maximum radius agreeing with the saved value within `2.3e-17`. The output's seed-05 D summary has 28,433 unique X observations; its node-count minimum (2), center-entry-distance minimum, and maximum-radius minimum agree with this raw sample. This is a narrow arithmetic spot check, not a full recomputation of the summary.
- Checked the claims against the registered definitions. The report keeps D's chemical qualification and shared D/C ancestry explicit, treats entry and prior material as diagnostics, distinguishes foot positions from realized ant-center travel at this grid resolution, and states that counts and X masks do not identify material bodies or biological opportunities. It limits the negative max-D result to global allocation and makes no competition law, threshold, novelty rule, production change, or biological/physical discovery claim.
- Checked 254 local file links across nine ANT hub/daily/package Markdown files: 251 resolved. Two references to the package `manifest.json` were unresolved because the manifest had not yet been generated. The third unresolved link is the existing `docs/ant/README.md` reference to `evidence/2026-10-30-material-information-axes/REPORT.md`; that link is already present at the reviewed branch HEAD and is unrelated to this package. HTML links and final visual destinations were not reviewed.

## Small numerical note

`analysis/x-family-geometry.json` records the seed-05 D `angularSpan` minimum as `-8.881784197001252e-16`. Angular span is mathematically nonnegative; this is consistent with floating-point cancellation in `2π - largestGap`, not a negative geometric span. It is far below the report's displayed precision and does not affect the descriptive conclusions. If this field is expected to satisfy a strict nonnegative bound in machine receipts, clamp values within floating-point tolerance to zero in the geometry calculation and regenerate the affected analysis summary and manifest.

## Prior coverage and limits

`VALIDATION.md` documents the prior independent work on the full center census, temporal summaries, rank pairs, X-pair arithmetic, cases and randomized rank-crossing fixtures. Those expensive checks are recorded as prior-review evidence and were not repeated in this narrow pass. The validation document also reports 23/23 focused tests passing, 363/365 broad-suite tests passing with two preserved authority-test failures, and byte equality across 1,296 analysis artifacts; these results were read but not rerun here.

The worktree was active during review. The visual source/canonical and isolated reruns, visual inspection, final manifest generation, complete manifest/link verification, full focused suite and full audit rerun remain outside this review. Add this record to the final manifest and rerun package-level link/hash checks after those artifacts are frozen.
