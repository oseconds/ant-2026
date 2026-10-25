# Validation receipt

## Source and branch provenance

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- G candidate tip: `2df9fbfcaf6563157af0b3266b1089a9d8424c7a`.
- Research branch starts at that candidate tip; the frozen diagnostic preregistration is commit `44e27d579cddd946fbc512f37aa58b6d97badf20`.
- Remote candidate branch actually present: `codex/ant-pheromone-g-production-candidate-review-20261025` at `2df9fbfcaf6563157af0b3266b1089a9d8424c7a`. The supplied alias `codex/ant-g-production-candidate-review-20261025` is absent remotely.
- `git diff 2df9fbfcaf6563157af0b3266b1089a9d8424c7a -- src/` is empty. No production source changed.

SHA-256 at validation:

| File | SHA-256 |
| --- | --- |
| `src/lib/agents/ant/AntController.js` | `b5a6344ebed52962a1749d612b0140b6a4249817f159758e13f166877078e9f4` |
| `src/lib/agents/ant/PheromoneField.js` | `3e8b2e4059a77c8ca96bc2e591120eda560bb7a1b1456d56b0ce3ba68405662e` |
| `tests/ant-controller.test.js` (corrected) | `6bc403e03f8bfda5d556ac625ef6df1ce68853699fac6d7f8cdeb7c667e04a0e` |
| `scripts/ant-near-stop-fixture-diagnostic.js` | `6ea049619ea087341d3363b2e0e823fd84e6e16f15dfb017d917fab65a78acee` |
| G review `README.md` | `be3a84693f9417fbe358ad6bd431035c5472237723bff01efaf633a4ca738986` |
| G review `VALIDATION.md` | `60439d6da3184439eab36cff3f07ebad52928bad79cc9bdd522d379d2771d678` |
| founder refinement `README.md` | `6c0d085db3b0b2de7092318ac24c823a63ac3a9462ed5623b4c9e69b184f5438` |

## Evidence regeneration and observer validity

- Exact C/G fixture: 6 arms, 3,600 ticks each, 60 Hz, original seed set `[9, 52, 240]`, warm-up exclusion exactly `tick <= 300`.
- The G/240 original-test totals reproduce: 0 near-stops and 3,126 moving samples.
- Per seed, C and G initial-agent fingerprints and initialization RNG draw counts matched.
- The compressed lifecycle artifact was generated twice; both runs had the same timeline SHA-256 `7d5c762b0797ea8826b91ca733854face69d109d8a6808e8a8b5548a04766275` and summary SHA-256 `0726dfd503c6c2dad550295f6fa86df6849d55540d003e100b8064d568b2f0a4`.
- In 120-tick observer OFF/ON comparisons, 96 and 316 fields had identical controller-state-plus-raster hashes. Both arms used 106 RNG calls; the observer captured the existing local-sensor return once per tick (120 reads), with zero extra random calls.
- Controlled scheduler probes used exactly four existing random draws and returned the expected `2.4 s` inspection interval / `0.9 s` episode in both fields.
- Controlled braking probes passed in both fields: target ratio `0.0375`, minimum speed `0.004052 < 0.014625`, resumed speed `0.080344 > 0.0585`.

## Test and build status

- `node --check scripts/ant-near-stop-fixture-diagnostic.js`: pass.
- `node tests/ant-controller.test.js`: **23/23 pass**.
- `npm test`: **339/339 pass**.
- `npm run build`: pass. Existing advisories remain: Rollup strips two dependency pure-comment annotations and Vite reports the existing ~1.16 MB app chunk above 500 kB.
- `git diff --check`: pass.
- The first sandboxed `node --test --test-name-pattern=...` and build attempts failed with `spawn EPERM`; rerunning the requested full test/build commands with the authorized process execution completed successfully. This is an environment permission note, not a code failure.

## Changed scope

Only these files are intended for this pass:

- `tests/ant-controller.test.js` (replace invalid stochastic assertion with deterministic authored-contract probes).
- `scripts/ant-near-stop-fixture-diagnostic.js` (read-only source-level runner).
- `docs/ant/evidence/2026-10-25-near-stop-fixture-validity/**`.
- `docs/ant/daily/2026-10-25-near-stop-fixture-validity.md`.

Canonical `docs/ant/README.md`, production `src/`, renderer, movement laws, and field parameters are unchanged.
