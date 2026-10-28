# Retired pheromone motor/inscription fork — research only

**Verdict: BOUNDED NEGATIVE for one prospective current-G state.** Retired removal changes confidence and decision clock, but not chosen direction or realized motion. Local input happens to be zero. Do not describe this as motor absorption of a changed direction or as a general negative for the recursive history loop. No continuation was run.

- [Report, measured limits and Stage 2 priorities](REPORT.md)
- [Registered selection, intervention and stops](PLAN.md)
- [Validation](VALIDATION.md)
- [Raw complete world/input packet](data/fork.v8.gz)
- [Capture/source receipt](data/capture.json)
- [Final result](data/results.json)
- [Replay receipt and narrowly permitted source correction](data/replay-validation.json)

## Reproduction

```sh
node --test tests/ant-motor-frozen-world.test.js tests/ant-pheromone-provenance.test.js
node scripts/ant-retired-pheromone-motor-inscription.js --check
```

`--check` loads the original gzip/V8 packet and performs two exact frozen replays; it does not run nature. Use the recorded Node version (22.23.2) for this V8 artifact. The packet contains a complete plain world at tick entry, counted RNG, post-decay alive/retired nodal arrays, real full nodes, selection metadata and the executed natural target-tick record. No observer closure is restored into a fork.

The acquisition command without flags refuses to overwrite `data/fork.v8.gz`. `--analyze` reuses that frozen file and refuses to overwrite a derived final result. It was used only for the documented replay repair. Preserve originals when reproducing acquisition in another clean copy.

Scope: fresh main `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`, parent `58382d4075a170b4ca1c63cbd75f0b196067a13b`, seed20261005, production H0/G defaults,60Hz,Audio Off/no bridge. Exactly one natural prefix through tick3601; no new seed, outcome-based case search, altered trajectory continuation, audio, renderer or production law.

Original replay preservation failure and buffer-copy repair are documented, with old helper and superseded/unaccepted derived outputs under `data/attempts/v8-alias-01/`. The original disk packet is authoritative and unchanged. Current input guards compare strict deep state, raw world/input bytes and disk SHA; object-graph reserialization metadata alone is not treated as an input change. The final F sham reproduces actual production, and final Fhat/Rhat use finite/nonnegative symmetric author sums.
