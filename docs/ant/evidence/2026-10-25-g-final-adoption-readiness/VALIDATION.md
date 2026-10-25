# Validation receipt

## Repository state

- Fresh `origin/main`: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- G production-candidate source: `2df9fbfcaf6563157af0b3266b1089a9d8424c7a`.
- Near-stop diagnostic/fix: `bf804200fa1bc8d036a194f5f2f759b9d6a58fcf`.
- Current review branch before this documentation commit: `codex/ant-g-near-stop-fixture-diagnostic-20261025`.
- `src/` diff from G candidate to review tip: empty.
- `docs/ant/README.md` diff from fresh main: empty.

## Candidate source hashes

Recomputed SHA-256 values below match the candidate provenance manifest for the files it records. `AntRenderer.js` and `src/main.js` hashes were also recomputed for this review; those two paths are not in that manifest.

| File | SHA-256 |
| --- | --- |
| `src/lib/agents/ant/PheromoneField.js` | `3e8b2e4059a77c8ca96bc2e591120eda560bb7a1b1456d56b0ce3ba68405662e` |
| `src/lib/agents/ant/AntController.js` | `b5a6344ebed52962a1749d612b0140b6a4249817f159758e13f166877078e9f4` |
| `src/lib/agents/ant/GasterDeposition.js` | `0293e14599dee0c0b2c688247b25a363a22489693824ab7b188faf060233ce41` |
| `src/lib/agents/ant/ColonyActivation.js` | `3f04b44fe81f692ea295b33ce311f239083c5db01a8400e35c0bb6fb9d685abd` |
| `src/lib/agents/ant/TrailPlateBirth.js` | `283de374bc38cd8baae47d99d253d43b71b800edbf4747d19d06299986c12860` |
| `src/lib/renderers/AntRenderer.js` | `36f76459cc5323b846e04b8bced95b19a4d382c645303dbb9b49aa1050354566` |
| `src/main.js` | `7423d22641d79af8df2f8b3d425be00f54825ebccf314c68d0ef47f3201a858c` |
| `docs/ant/README.md` | `0c93aad8d6d5908a192ef2f416e3d7ff2743da8c91c258cbd220abc335a768cb` |

The hashes above were recomputed in this review. `src/lib/agents/ant/PheromoneField.js`, `src/lib/agents/ant/AntController.js`, `src/lib/agents/ant/GasterDeposition.js`, `src/lib/agents/ant/ColonyActivation.js`, `src/lib/agents/ant/TrailPlateBirth.js`, and `docs/ant/README.md` also exactly match the candidate provenance manifest. The candidate-to-review source check was `git diff 2df9fbfcaf6563157af0b3266b1089a9d8424c7a..HEAD -- src/`; it returned no changes. The candidate implementation changes field storage/writing and analysis presentation only. No movement or consumer law changed.

## Reused validation receipts

- Fixed cue: `2026-10-25-g-production-candidate-review/FIXED-CUE-PARITY.json` — 24/24 rasters, 99,792/99,792 local reads, 138,600/138,600 wide reads; exact.
- Natural: `2026-10-25-g-production-candidate-review/NATURAL-CONFORMANCE.json` — all recorded checks true for three seeds, five checkpoints each, no saturation.
- Consumers: `2026-10-25-g-production-candidate-review/CONSUMER-CONFORMANCE.md`.
- Runtime: `2026-10-25-g-production-candidate-review/BROWSER-RUNTIME.json` and `README.md`.
- Near-stop: `2026-10-25-near-stop-fixture-validity/README.md` and `VALIDATION.md`; deterministic timeline and summary SHA-256 values are recorded there.
- Project decision: remote branch `codex/ant-pheromone-project-decision-20261025`, commit `c45e1845bd86a5a6f1082b5c67ef6f521cd860c1`.

## Review checks

- `origin/main` was freshly fetched and matched the required SHA.
- Candidate source hashes matched its provenance receipt.
- Production consumers were searched for 96×96 assumptions and pheromone-mass labels; remaining 96×96 grids are separate SurfaceField/material-analysis grids.
- Near-stop test diff was inspected. The stochastic post-warm-up event-count assertion was replaced by deterministic schedule/brake/resume contract tests; other controller tests retain finite-state, speed, turn, collision, and long-run movement checks.
- The stored full validation after the correction is controller tests 23/23, `npm test` 339/339, and `npm run build` pass.
- Fresh independent review: no concrete blocker found; no source edits or experiments were made by the reviewer.
- This review did not rerun the test suite, build, natural simulation, browser, or exhibition soak. Their existing receipts are the evidence used here.
- Pre-existing untracked survey evidence and `scripts/ant-exhibition-recent-stills.js` were left unstaged and untouched.
