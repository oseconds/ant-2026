# Validation receipt

## Source and worktree

- Candidate branch point: fresh `origin/main` `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Production source files changed: `src/lib/agents/ant/PheromoneField.js`, `src/lib/agents/ant/AntController.js`, `src/main.js`.
- Behavior consumers left unchanged: `AntController` sensing/movement formulas, `GasterDeposition` constants, `ColonyActivation`, `TrailPlateBirth`, renderer mapping, recruitment, materials and audio.
- `docs/ant/README.md` unchanged.
- `git diff --check`: pass (Git warned that one working copy line ending may convert LF to CRLF; no whitespace error).
- Research runner syntax checks (`node --check`): pass.

## Field, consumer and fixed-cue checks

- Focused ANT tests: 35/35 field, deposition, TrailPlateBirth, activation and renderer tests passed; focused controller diagnostic test passed 1/1.
- Frozen candidate replay: 24/24 raster hashes exact; 99,792/99,792 local raw reads exact; 138,600/138,600 wide raw reads exact; zero mismatches.
- Sensor and fixed-cue downstream code did not change. Exact raw inputs preserve the saved Gate 2 result (`16/16` checks, local signs `10/4,012`, all-row MAE `0.013540828 rad`, directional MAE `0.017008594 rad`, wide mismatch `1,415/5,072`). This is a deterministic parity inference; the complete historical Gate 2 generator was not run again on this branch.
- Consumer probes confirm production field sampling and `TrailPlateBirth` raw-array bilinear sampling agree at fixed coordinates; production tests cover 316 dimensions and unchanged display behavior.

## Natural conformance and browser

- Three 600 s / 60 Hz natural G seeds exactly match parent G at recorded trajectory/event/checkpoint arrays; no cap hit or saturation. The conformance verifier was run twice. Both runs passed all checks and emitted the same `NATURAL-CONFORMANCE.json` SHA-256: `d559b9f8490a07279c6f50899bce5128f30cb9911ffb575ed4482a25f44a0b3`.
- Headed Chrome: production Vite preview, Audio Off, 600 simulated-second real-RAF warm-up + 60 s screen + 180 s soak. Zero page errors, console errors, failed requests, AudioContexts, non-finite fields or cap hits. The longest recorded RAF gaps/clamp loss are reported in `README.md`; comparison against the earlier research screen is methodologically non-identical.

## Full regression and build

- `npm test`: 337/338 passed; one existing isolated-ant behavior assertion failed. For seed `240`, post-warmup `nearStops=0` while the contract requires more than 10; `moving=3126`, so this is a behavioral change, not a population/motion collapse. The test was not weakened.
- `npm run build`: pass. Vite emitted its existing chunk-size advisory.
- Because a full-suite behavior gate failed, this review stops at HOLD and did not request independent readiness review. No candidate alternative, movement retune, adoption, merge, or PR was made.
