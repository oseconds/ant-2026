# Validation

Frozen inputs: production `bc045dc3caa5954df633ecbee37fbabcb8224f30`; conflict decomposition `86f0b57bb67bc2b60794108ce5e04dc5e761d45a`; 163 slots, 1,846 option appearances, and 1,352 exact-X components. No new simulation or replay. Observer RNG calls: 0.

The analysis independently rebuilds the exact-X overlap partition, recomputes member-mask min/max/intersection/union, checks that every realization uses an existing option mask, matches MIN/MAX incidence totals to the bounds, independently reconstructs per-cell ledger counts, and rebuilds the previous raw event ledger from all saved event masks. Current production material maps are taken from the checksum-verified anchor 598 (599.25 s) packet.

The 256 count is reported only as an implementation reference. No production `src/` or `static/` behavior changes.
