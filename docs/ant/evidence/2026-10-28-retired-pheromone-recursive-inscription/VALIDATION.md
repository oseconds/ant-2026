# Validation

## Provenance

- Fresh `origin/main`: `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: same fresh-main SHA.
- Prior changed-choice source evidence: `58382d4075a170b4ca1c63cbd75f0b196067a13b`.
- A final fetch immediately before publication still resolved `origin/main` to `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- `data/analysis-validation.json` binds the result, target-input, precondition, and runner hashes and records deterministic duplicate replay, production-source integrity, and observer parity. `--check` recomputes the target-input and precondition file hashes.
- Final result SHA-256: `8b33720bedda5cb8e4aa49dd597b1ed75c4792dbec094af24f16957ead3ce5de`; target-input: `d0a4bf98dafbd09a246069192a296523fb1c58832fa018c0b5b22990941d5228`; precondition: `f94b2b5ad0b8f36ea01304e7622fd206fe11af1a28e3983e6c18ddad18ac0e20`.

## Manipulation and state checks

- Target selection independently checks the frozen prior packet checksum and residual-validity receipt; all 284 residual-free choice changes match the original changed-choice index set.
- The natural prefix exactly reproduces the target state, local profile, `frontCrowding`, all five candidate headings/crowding values, valid sensor coordinates and values, and the 14-draw random tape. See `data/precondition-validation.json`.
- `F` reproduces the frozen production result; `F` observer-on and ordinary observer-off twin have exact audited world, event, and RNG parity.
- `F`/`Fhat` is the registered numerical sham and has zero motor delta. `Fhat`/`Rhat` use the same target geometry and random tape, and end the target tick at the same RNG state/call count.
- All arms have the same `SurfaceField` SHA after the pre-contact relaxation. Every emitted contact point equals one accepted `SurfaceField` point; the tick's accepted point count equals the `totalFootContacts` increment. The target event's field nodes and stored delta are recorded per arm.
- `results.json` is produced by two complete fresh replays and byte-equivalent JSON comparison before it is written.
- Independent review initially found that the broad `recursive re-inscription` label exceeded the receipt: contact and SurfaceField write differed before censor, but no stored pheromone dab appeared. The output status and report were narrowed to `SUPPORTED — bounded motor-to-SurfaceField contact inscription`; the missing dab and offset-1 censor remain explicit.
- Independent review also found target-input integrity was marked by a constant. The runner now hashes the exact input bytes before replay, verifies them again after replay, and checks that hash in `--check`.
- The reviewer did not independently decompress the prior frozen event packet to re-derive the packet-index mapping; this remains supported by the runner's checksum/decompression assertions and saved selection receipt rather than by that reviewer.

## Execution history

- The first analysis attempt was rejected because the heading validator compared 25 individual sensor reads against five candidate headings. It did not run continuation. The mismatch and correction are recorded in `data/attempts/gate-audit-01.json` and `PLAN.md`.
- Before adding the direct `SurfaceField` write receipt, the valid motor/contact run was preserved with its result and validation hashes in `data/attempts/valid-run-before-surface-receipt.json`. The later instrumentation only observes the existing relax/contact calls; it adds no condition, horizon, input, or threshold.

## Tests and repository checks

- Focused test: `node --test tests/ant-retired-pheromone-recursive-inscription.test.js` — 2 passed, 0 failed.
- Full suite: `npm test` — 341 passed, 0 failed.
- Production build: `npm run build` — passed. Vite emitted two upstream `zod` annotation warnings and the existing large-chunk warning; it did not fail.
- Production source parity: `git diff --exit-code 4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785 -- src/` — no differences.
- `node scripts/ant-retired-pheromone-recursive-inscription.js --check` — result checksum and all tracked source hashes match.
- Focused test, full suite, build, source parity and runner hash check were rerun after the final hash/status correction and passed.
- `git diff --check` and `git diff --cached --check` both passed after final documentation and status changes.
- Final independent read-only review passed the status boundary, input hash binding, production source parity, runner `--check`, and contact-write receipts. The reviewers did not independently rerun the full suite or production build; those are recorded above from the primary run. See [review record](./REVIEW.md).
