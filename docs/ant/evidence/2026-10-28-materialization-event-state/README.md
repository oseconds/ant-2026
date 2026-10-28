# Materialization event-state research

**Outcome:** this mission's **Gate 2**, retaining existing authored temporal/commit/reissue semantics. This is not a new formation adoption or a claim that current source/boundary geometry implements the working path-provenance/local-support separation.

Read [GATE-REPORT.md](GATE-REPORT.md) for the decision, responsibilities and limits. [PLAN.md](PLAN.md) registers both passes and cost boundaries. [data/timeline.csv](data/timeline.csv) is the compact 120-anchor trace. Detailed reproducible outputs are [event-state.json](data/event-state.json) and [reuse-contract.json](data/reuse-contract.json).

## Provenance and scope

Main `aeefa12d8de9da400cb8a2a3d4b5080a21ba0292`; research parent `f47a9dcaa5d127f0ac7c4547ee8a240f9ff5af4a`; branch `codex/ant-materialization-event-state-20261028`. Production and prior evidence remain unchanged. No new natural run, renderer, audio, alternate formation selector, parameter tuning, PR or merge.

Frozen current-G/H0 seed 20261005 history is inherited from the preceding formation gate: 60 Hz, 0–120 s, Audio Off. The last actual production analysis is 119.016667 s. Reconstruction accepts 12,807 individual feet through that analysis; the packet's remaining 147 feet between that anchor and 120 s are outside this analysis scope, not lost or re-timed. No new live observer parity is claimed; exact saved candidate and full birth receipt parity is the relevant manipulation check. The original capture's controller/RNG parity is recorded in the parent evidence.

Pass 2 is a clamped class-only logical fixture, not natural world replay. B/E/support remain fixed while prescribed post-commit contacts differ. Existing 600 s G summaries for three seeds are hash-verified and reused solely for observed birth cadence; they lack repeat-match states.

## Reproduction

From repository root, Node 22.23.2, no dependencies beyond the repository and Node standard library:

```powershell
node --test tests/ant-material-event-state.test.js tests/trail-plate-birth.test.js tests/material-stratigraphy.test.js tests/compile-surface-topology.test.js
node scripts/ant-material-event-reconstruct.js --check
node scripts/ant-material-event-reuse.js --check
```

Each frozen runner evaluates twice internally and asserts byte-identical results; `--check` compares the committed outputs without overwriting them. Without `--check`, each runner refuses to overwrite its output. Each uses the registered 60 s process wall boundary; no controller or audio resources are created. Both use a Math.random tripwire, source/input hashes and immutable input checks. Reuse exercises 3×601 class analyses twice and immutable previous commits. The reconstruction exports private selector functions only in memory; no production file is patched.

The archived G provenance JSON was checked against its recorded LF checksum while preserving the working CRLF copy. Gzip archives and current source hashes are checked as bytes. Both provenance representations are recorded in `reuse-contract.json`; no historical receipt was rewritten. Source/capture compatibility is explicit, and the archive remains adoption-conformant current-G evidence rather than a new capture on this branch.

## Validation and receipts

- [State receipt](data/state-validation.json): exact 120-anchor candidate geometry/metadata and two complete birth descriptors, accepted contact totals, deterministic result/timeline and tool hashes.
- [Reuse receipt](data/reuse-validation.json): deterministic fixture, fixed cue, archived checksums and runner hash.
- `validation/`: focused test output, frozen `--check` output, protected-source comparison, independent review and package/staged byte receipts.
- Full repository tests/build are not required for this scope: production source, app, browser and dependencies are unchanged. The focused suite includes the touched diagnostic plus formation/stratigraphy/compiler contracts; technical checks do not establish artistic success.

Executed results: **24/24 focused tests passed**; both frozen `--check` commands passed, including their internal duplicate calculations. Protected source diff is empty against main and the verified research parent. No browser or audio validity claim is made by these Node checks.

[Fresh independent review](validation/independent-review.md) found no blocker to the bounded Gate 2 conclusion. It checked source responsibilities and stored results, not another execution of the tests or world. Final package and staging checks follow the review.

## Reading used

Current canonical guide, G adoption/conformance evidence, formation information ledger, formation-gate packet, event-support atlas/gate and corresponding daily records; actual formation/SurfaceField/pheromone/gait/stratigraphy/compiler/worklet source and focused tests. Historical local-accretion (`13ffc9f42bc32083c87c6b1c97bc82092e03e472`), rejected interior-endpoint (`bb970505eb63e9f69d2d00bc302ee72fbe19419e`) and strict temporal-comparator (`70bef249a`, 2026-10-13 seed07 README) evidence were read from immutable Git commits, labeled pre-G and not copied into current results. No `docs/ant/archive/**` was accessed. `world-model.md` is a design contract, not proof of current implementation.

## Limits

One reconstructed seed, two actual births, sampled analyses, Audio Off. Class fixtures establish policy behavior under held inputs; they do not forecast natural sustained fields or world coverage. Existing 600 s evidence does not classify repeat gates or verify mature Audio-On operation. No new masks, human perceptual evaluation, architecture change or production implementation is supplied. Current temporal semantics remain defensible while spatial support and open-world selection remain open.
