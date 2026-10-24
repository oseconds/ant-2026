# 2026-10-24 — 316 Gaussian dose-unit qualification

Started from F result `fcd450885d91b6b1aaec50cf0e9086a1e225e9d1`, with fresh `origin/main` at `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`. Preregistered the geometry-derived factor `(315/95)^2 = 3969/361` before evaluating G.

The 24 frozen 316-Gaussian arms replayed all 1,848 writes without reaching cap 8. G matched the 96-grid interior bilinear-integral convention within derived Float32 error, retained F's write support, and reproduced deterministically. Gate 2 passed all 16 existing checks. Against F, all-row steering MAE improved `0.02297805 → 0.01354083`; local sign errors stayed at 10; wide errors rose `1,401 → 1,415`. F's tight and tightMirror MAE blockers cleared. Straight/S zero-cue magnitudes increased versus F but remained below production C; this remains a material movement-shadow observation.

Decision: **QUALIFIED FOR LATER MOVEMENT SHADOW**, fixed-cue evidence only. No movement test, production adoption, or production source edit. Full suite passed 365/365; build passed with dependency annotation and bundle-size warnings. Full report and receipts: [dose-unit qualification evidence](../evidence/2026-10-24-cic-316-gaussian-dose-unit-qualification/README.md).
