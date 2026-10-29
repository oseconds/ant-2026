# 2026-10-29 — Peak–saddle domain reproducibility

Evidence: [peak–saddle domain reproducibility audit](../evidence/2026-10-29-peak-saddle-domain-reproducibility/README.md)

- **Question:** do finite B peak–saddle domains themselves persist, or did the earlier one-second winner-spine switch mainly reflect global contrast ranking?
- **Baseline:** production `main@4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; frozen research parent `3a3eb22def8c6b89983458f9e5ffb73b0ec5d1db`; current-G/H0 seed `20261005`, 60 Hz, Audio Off.
- **Implementation fact:** current `TrailPlateBirth` and production selector stayed unchanged. The audit reads the parent’s exact ten B/E snapshots. No simulation or RNG was used.
- **Measurement:** enumerated every finite and essential peak under 8- and 4-neighbor adjacency; recorded full lobe cells, levels and elder relations; compared all 16 consecutive-state transitions and the ten same-state adjacency pairs. Parent B results matched all ten 8-neighbor states exactly.
- **Finding:** at both late 1 s 8-neighbor winner changes, the former winner’s finite domain persisted and the newly ranked winner already had strong spatial overlap in the previous state. Their contrast order crossed. The broad 4/8 census and winner differences, plus many-to-many temporal overlaps, prevent treating the family as representation-independent.
- **Decision:** **DOMAIN FAMILY PARTIALLY REPRODUCIBLE.** Domain availability merits limited further study independently of global ranking; the family remains research-only. The persistent essential root is recorded as a possible omitted structural context, not a finite candidate or demonstrated cause.
- **Artistic/modeling implication:** none. No Plate body, material law, selector, UPDATE/hysteresis, seed, 600 s run or audio work was made.
- **Validation:** frozen input/source hashes, parent B parity, focused self-checks, exact rerun, SVG/data consistency and artifact SHA-256 manifest.
