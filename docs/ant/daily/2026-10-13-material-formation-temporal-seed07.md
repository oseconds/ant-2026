# 2026-10-13 — Material formation temporal observer, seed 20261007

Ran the final bounded read-only temporal-observer pass from `5edc906326bbf01f27dba0dbc264df49f061f95f` on branch `codex/ant-material-formation-temporal-seed07-20261013`. Live `origin/main` was `d45823d40c9a87c1b333fa9872f3c897ee9ab01b`. Production ANT source and formation semantics remained unchanged.

- Seed `20261007`, 600 s, fixed 60 Hz; 599 production-cadence analyses.
- Plain/observer parity: 36,001 boundaries × 14 domains exact; RNG state/calls matched; final-world digest matched; observer nonmutation checks 599/599.
- Matched prior observations: 300; `CONTINUED` 299, `RESTARTED` 1; strict same-prior/same-geometry comparator groups: 0.
- Sampled local loss→return: 255 matched observations / 788 cells. Candidate restart without local loss: 0; local loss/return without restart: 299; local return without restart: 254; restart plus local return: 1.
- Seed06 and seed07 both lack the required comparator. Decision: **TEMPORAL HISTORY PARK — CURRENT PRIORITY**. Current authored formation law stays production; local transitions remain observations, not a reason to add history state.
- Stop formation seed hunting. Next project pass: previously parked Plate sonic-individuality/audio investigation. No audio work in this pass.
- Full lossless temporal records and final-world snapshot remain reproducible but ignored under `test-results/`; exact sizes and SHA-256 hashes are in the evidence manifest. Full per-tick parity rows were not persisted.

Evidence: [seed07 temporal-observer package](../evidence/2026-10-13-material-formation-temporal-seed07/README.md) · [seed06 temporal-observer package](../evidence/2026-10-13-material-formation-temporal-observer/README.md).
