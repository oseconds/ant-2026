# 2026-10-29 — FOOT_CONTACT organization signal audit

Compared actual P1/P2 contact organization against the current per-cell foot counts and SurfaceField. Production main remains `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; work started from clean traffic-audit parent `86308a9cc8bdb067ecabd33465e127d9d453164d` on a dedicated research branch.

Reused frozen current-G/H0 seed `20261005`, 60 Hz, Audio Off. The pinned contact stream already contains timestamp, ant, tripod, leg, centroid, strength and individual foot positions, so no replay was run. P1 has 832 groups / 2,470 feet; P2 has 849 / 2,507. Both ordered contact-window digests, the 3,655-group / 10,849-foot prefix through P2, 11 production source hashes and commit SurfaceField map hashes match prior frozen receipts.

Per-cell cumulative counts and commit SurfaceField remain strongly correlated (`r=.928` P1, `.936` P2). But at the same exact count, nearest-ranked SurfaceField values accompany changing leg/tripod/time histories in both windows. Exact pairs matching both scalars were absent; all adjacent SurfaceField rank pairs are reported without a chosen cutoff. The A/B alternation and leg membership themselves match the fixed gait exactly, and no force signal or trajectory-conditioned residual was established.

Decision: **INDEPENDENT INFORMATION OBSERVED**, in the bounded descriptive sense that raw contact history contains event-specific leg/tripod/timing detail omitted by scalar endpoints. This does not establish a separate gait law, material need, or Plate/material law. No prototype or production state was created.

[Evidence report](../evidence/2026-10-29-gait-contact-signal-audit/REPORT.md) · [technical atlas](../evidence/2026-10-29-gait-contact-signal-audit/atlas.html) · [validation](../evidence/2026-10-29-gait-contact-signal-audit/VALIDATION.md)
