# 2026-10-24 — 316-grid CIC fixed-cue qualification

Started from fresh `main` `8c60e4b` and representation-contract evidence tip `c3babbf`; created a separate research branch. Preregistered the single `316 × 316` four-node CIC candidate before evaluating its cue outputs. Production source and canonical ANT README remain unchanged.

Gate 1 passed: `sqrt(2)/315 = 0.0044895668647 ≤ R=0.0045`; all positive-weight write nodes stayed within R over the dense deterministic position check. Uncapped dose and nodal first moment stayed within derived Float32 bounds. The bilinear read footprint extends beyond R, though its furthest sampled value was about `1.19e-22`.

Gate 2 remains **MIXED / NOT QUALIFIED**. E reduced wide errors from 2,378 to 1,017 and fixed the straight false-steering control. Local sign errors fell from 552 to 334, with 267 new errors on rows correct under C; S-route wide errors rose from 120 to 201. All prior 92 D new errors were correct under E, all 92 D recoveries stayed correct, and the 26 saved target-profile switches were revalidated. Existing Gate 2 family/phase nonregression checks failed; movement Gate 3 remains not run.

During write-up, found a decimal typo in the frozen preregistration's displayed `sqrt(2)/315` value. Preserved the preregistration commit and added a transparent arithmetic erratum; formula, candidate and gate were unchanged. A fresh independent review also caught and prompted correction of the global local-error wording and its stale manifest checksum; final source/artifact hash verification passed. Focused tests passed 3/3; full suite 358/358; build passed with existing dependency/chunk warnings. See the evidence package for rows, raster receipts, hashes, and reproduction.
