# Validation and reproduction

## Authority and scope

- `origin/main` was freshly queried with `git ls-remote` and matched `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research branch starts at `2000d16b361dfeaf4ef915de460ea9c3e0fd0146`.
- Current production source and canonical `docs/ant/README.md` match the authority; this pass adds only research scripts, evidence, and a daily record.
- No allocation, UPDATE, maturation, BODY, material, audio, or production code was changed.

## Replay and frozen input

The frozen seed005 G trajectory and stored 30/60/120/300/600 s packets were read from `docs/ant/evidence/2026-10-25-g-production-candidate-review/`. Read-only deterministic reconstruction was required to obtain late B/E/F and actual per-anchor fields. The existing production runner was called once with the same seed/configuration and an observer around the production `TrailPlateBirth.buildSupportedMask` call. The observer copied fields after the existing update, consumed no RNG, and fed no values back.

`REPLAY-PARITY.json` confirms:

- exact initial state;
- all 600 saved per-second agent identity/position snapshots;
- all 600 contact-count buckets and full FOOT_CONTACT stream hash;
- all 36 birth IDs/times/mask hashes;
- exact stored 30/60/120/300/600 s pheromone, SurfaceField, occupancy and persistent mask checkpoints;
- exact checkpoint and final RNG states/call counts and birth times;
- exact 300/600 stored SurfaceField arrays, with current `.025` D readout hashes;
- exactly 20 retained actual analysis anchors in each late window and their full B/C/D/E/F/S hashes.

The actual material context packet contains 36 immutable masks whose IDs, birth times and mask hashes all match the G raw birth receipts. No C0/shadow descriptor mask or mask-source field replay is used as current geography. Pre-existing material is strictly birth time `<` the analysis timestamp.

Three differences between the stored capture's source hashes and current-main source hashes are retained verbatim in the parity receipt: `src/lib/agents/ant/PheromoneField.js`, `scripts/ant-founder-evidence.js`, and `docs/ant/README.md`. The first is the known post-capture API/resolution conversion; the latter two are runner/documentation revisions. This replay uses current main and matched the frozen trajectory at all listed anchors and checkpoints. No difference was hidden or repaired by tuning.

## Measurement and atlas checks

From repository root:

```powershell
node --check scripts/ant-late-qualified-opportunity-capture.js
node --check scripts/ant-late-qualified-opportunity-analysis.js
node scripts/ant-late-qualified-opportunity-analysis.js --check
& 'C:/Users/5dudt/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/ant-late-qualified-opportunity-atlas.py
git diff --check
```

The measurement script's `--check` path regenerates all frame summaries, all `.025/.075` correspondence receipts, and the summary in memory, then asserts byte equality against the frozen outputs. It also asserts 40 unique states, no missing late S states, `F ⊆ E`, `S` is edge-bearing `F`, channel D values agree with the saved S samples, input nonmutation, and no `Math.random` calls.

The atlas uses the recorded arrays and the same 96×96 frame. Both PNGs were regenerated; their SHA-256 hashes are in `manifest.json`. The atlas uses fixed 0–1 scales for B/C/D across both windows; no eventwise gain normalization is applied. Visual overlays were inspected against the machine-readable center and material data.

## Limitations and checks not run

- No second full 600 s replay was run merely to reproduce the parity receipt; deterministic analysis and atlas generation were rerun against its frozen outputs. The first replay already matched the stored trajectory/checkpoints exactly.
- Full repository build and test suite were not run. This is offline research tooling with no production integration or behavior changes.
- No second seed, new natural campaign, additional time window, or intervening 300–600 s track was created.
- Early-vs-late comparison uses the parent's descriptive peak, grouping, and correspondence conventions. `.15/.30` groups are not natural opportunity counts, and `.025/.075` matches do not establish identity.
- Only seed `20261005` is measured for late qualified fields; early evidence has a broader 0–120 s state sample. The conclusion is limited to this trajectory and the two late windows.
- No allocation meaning, fairness, novelty preference, or material law is validated.

## Receipts

`manifest.json` lists SHA-256 for every new evidence file, script, daily record, reused frozen input, and protected production source fingerprint. Text entries normalize line endings to LF; binary entries hash exact bytes. It excludes itself to avoid recursive hashing. The independent review and final commit/remote-equality receipt are added to the final delivery record after evidence acceptance.

An independent acceptance reviewer found no blocker and confirmed the late D hierarchy claim is defensible for this seed and these two windows. The review caught and prompted clarification that the rank-1 center is stable within each window (cell 6287 near 300 s and 6289 near 600 s), with no cross-window track. The reviewer also confirmed that the higher X/material-overlap median near 600 s is not monotonic across individual snapshots. The report now states both limits.
