# Independent read-only review

## Scope

A fresh reviewer inspected the research runner, focused test, target and result receipts, and production `AntController` / `SurfaceField` ordering. The reviewer did not modify the repository or independently decompress the earlier frozen packet.

## Findings and resolution

1. **Status was too broad.** The first label said `SUPPORTED — bounded recursive re-inscription`, although the registered continuation had contact events at offset 0, no actual stored pheromone dab in either arm, and a non-focal-state censor at offset 1. The measured contact-to-`SurfaceField` write was valid, but the result did not establish a later return path. The status and report are now scoped to `SUPPORTED — bounded motor-to-SurfaceField contact inscription`; missing dab and censor are explicit. The prior result and validation hashes are preserved at `data/attempts/valid-run-before-review-correction.json`.

2. **Target-input integrity receipt was a constant.** The runner now hashes the exact target-input bytes before replay, checks them after replay, records the digest in `analysis-validation.json`, and recomputes it in `--check`.

## Independent confirmations and limits

- Instrumented `SurfaceField.relax` and `applyFootContact` delegate the original production methods once; the wrappers restore their patches in `finally`. The random tracer delegates each draw. Observer-on `F` matches the plain fork's audited world, events, and RNG.
- `F`/`Fhat` remains a zero-delta motor sham. `Fhat`/`Rhat` share target geometry, field input, random tape and end-of-tick RNG. The target contact events differ and occur before the offset-1 censor.
- Production order is intention, movement, gait contact, then `SurfaceField.applyFootContact`. Receipts show the same post-relax field in both arms, three accepted contact points per arm, the expected `totalFootContacts` increment, 13 versus 12 changed nodes, and distinct post-tick field hashes.
- The review did not independently re-derive the prior frozen-packet case-index mapping; this remains supported by the research runner's prior-packet checksum/decompression assertions and selection receipt.
- No later `SurfaceField` read, later focal pheromone dab, Plate consequence, or persistent social relationship was demonstrated.

## Final reviewer disposition

The original broad label was not accepted. The corrected evidence supports only the bounded motor-to-real-contact-to-`SurfaceField` write for this selected case. The target-input integrity flag is now hash-backed. Final rerun and tests are recorded in `VALIDATION.md`.

## Final independent check

A second fresh reviewer checked the corrected package. It found no remaining blocker after the result status was narrowed and input hashing was added. It confirmed the current `--check`, production source parity, staged/unstaged whitespace checks, and receipt agreement. It clarified that changed-node counts/sums are per `FOOT_CONTACT` event across that event's three foot points, not per-foot attribution; the report now states this. The reviewer did not rerun the full suite or production build. Its default focused-test launch initially hit `spawn EPERM`; its no-isolation retry passed 2/2, and the primary execution path separately passed the focused test, full suite, and build.
