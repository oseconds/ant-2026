# Validation — singleton feedback sensitivity

## Control and frozen-receipt conformance

**PASS.** CONTROL used the current production source behavior with the research provider absent and passed all 300 frozen comparison boundaries through 300 s.

- Exact E, F, B, C, D arrays: 300/300.
- Exact production material layer-count and top-layer maps: 300/300.
- Exact production Plate IDs, times, and masks: all 14 births through 300 s.
- Exact boundary RNG calls and state: 300/300.
- Exact live B/C opportunity rows: 25,364 rows across 300 anchors.
- Exact recaptured X memberships: 1,244,304 cells.
- Exact live-to-frozen track identity mapping: one-to-one within B and C.
- Exact frozen maturation-event identities, times, interval ages, center indices, and X masks: 277/277.
- Observer controller fingerprint unchanged before/after each boundary; counted controller RNG unchanged; `Math.random` blocked during every observer call.

The opportunity metadata SHA-256 was `c85ee45de179d0ca47a0dc5f33f904cd35789b59859ba267ccd588db1765b15c`; each loaded frozen opportunity chunk was checked against that packet's stored chunk hash.

## Paired timing and treatment isolation

**PASS.** Both final paired arms contain 18,000 ticks and 300 actual analysis boundaries. TREATMENT matched CONTROL tick-state fingerprints for 2,521 completed ticks through the first overlay boundary at 42.0166667 s. The overlay first affected ant L reads at tick 2,522; the first observed exposed ant tick was at 44.0166667 s.

The same-tick event never affects the movement that generated it. Observer RNG delta was zero at every boundary in both arms. `AudioBridge` was absent. The only source change versus production authority is the default-off `AntController` provider hook; `TrailPlateBirth`, `MaterialStratigraphy`, Nodule, audio, renderer, and `static/` have no source changes.

## Overlay and world invariants

**PASS.** Treatment recorded 151 accepted singleton episode increments and 85 contested no-commit decision groups. Exact same-X coeval `{B,C}` records incremented once. Per-cell layer history independently reconstructs the final overlay: 2,498 layer-cell incidences, 1,812 covered cells, max cell count four. Production layer counts, top identities, material revision, and nodule revision were unchanged by each observer call.

The first treatment exposure encoding converted string IDs such as `ant-1` into a numeric packed tuple, which lost identity. That treatment output was not retained as the final measurement. The final TREATMENT arm was rerun from a fresh controller using ID-bearing tuples and the saved CONTROL was revalidated first. The rerun changed receipt encoding only. `scripts/ant-singleton-feedback-verify.js` independently rebuilt every boundary overlap graph and decision, replayed all per-cell overlay history, and checked all 18,000 per-tick ant-ID/L tuples, formulas, window totals, and direct-consumer counts. Its receipt is `analysis/independent-checks.json`.

Every tick checked finite positions, velocities, and headings, in-domain positions, new-spawn clearance, and production Plate count below the 256 safety ceiling. No check failed. CONTROL and TREATMENT constructed separate controller, observer, RNG, and overlay state. TREATMENT used no research RNG; the later native controller RNG divergence is allowed after movement feedback.

## Tests

| Scope | Result |
|---|---|
| Focused hook and singleton-observer tests | **11 passed, 0 failed** |
| ANT-focused subset (`node --test tests/ant-*.test.js`) | **240 passed, 2 failed** |
| Full suite (`node --test --test-reporter=dot tests/*.test.js`) | **Only the same 2 failures were reported** |

The two unchanged test failures are:

1. `tests/ant-controller.test.js:180` expects all births to stay within the retired authored north heading `-π/2 ± .3`; current production authority instead uses isotropic fallback and the adopted outgoing-flow heading rule.
2. `tests/ant-renderer.test.js:180` expected two historical-mask draw calls and observed one. Renderer code is unchanged by this pass; the renderer test itself was not investigated or modified.

Both new default-off/provider tests, including shared effective-L delivery to speed/A/D and next-tick visibility, pass. No failures were attributed to this change. These two failures were observed on the current authority-based worktree; they were not rerun on a separate checkout of the authority commit.

## Runner comparison note

One initial run stopped at an over-strict serialization-order assertion for same-boundary frozen events. No treatment had run on that attempt, and the CONTROL field and RNG parity checks had already passed. The final comparator matches by `(channel, frozen track ID, interval number)` and then checks exact event fields and X sets; this order-independent identity comparison passed for all 277 events. The final paired CONTROL was rerun before TREATMENT.

## Determinism and hashes

- `node --check` passed for the live observer, paired runner, independent verifier, and manifest generator.
- `git diff --check` passed; Windows reports only a line-ending normalization warning for the reused capture script.
- Machine-readable CONTROL/TREATMENT signals are stored in chunked gzip files; overlay receipts and exposure tuples are included.
- Final per-tick exposure tuples retain actual string ant IDs; the earlier numeric-ID encoding was superseded by the treatment-only repair run.
- The manifest lists source authority, relevant frozen input hashes, and package file hashes. `SHA256SUMS.txt` covers every package file except itself.
