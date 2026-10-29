# Validation

## Provenance and parity

- Verified `origin/main` production authority `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785` and parent branch `origin/codex/ant-authored-materialization-law-synthesis-20261029` at `5b9cd6ba47368cd61c0391cc64f9dc62416c7ef8` at pass start.
- Frozen input gzip, parent analysis canonical-LF text, and current production `TrailPlateBirth.js` canonical-LF SHA-256 match the exact values in `SOURCES.md` and `analysis.json`.
- All ten stored anchor timestamps match their parent counterparts exactly.
- Production E→F thinning output exactly matches saved F cell-for-cell for all ten frozen states.
- Parent X/G cell memberships match exactly for all ten states. Both COMMIT direct-F X/G results also match the parent stress receipts exactly.
- Dense fixture X/G counts match the parent's stored values (X=641, G=577). The parent stores aggregate fixture measurements rather than its member-cell lists, so this dense check is count/metric parity, not an independently checkable set comparison.

## Read-only and deterministic checks

- The one preregistered E cell is removed from a copy for each event. The production thinning function is called unchanged. Original E/F/D arrays and frozen maps are checked against mutation.
- `Math.random` is replaced with a throwing tripwire during analysis; the production source is evaluated with a separate throwing `Math.random` as well. No RNG is used.
- `--self-test` checks deterministic B allocation, exact rooted-edge capacity accounting, connectedness, empty-nucleus handling, exact one-cell stress setup, and the expected ten-state input count.
- `--check` reruns the full measurement and requires byte-identical `analysis.json` and `atlas.svg` output.
- Every X/G/B candidate is checked for one 8-neighbor component and containment in E/F. B checks parent closure, one parent edge per non-root admitted cell, and used capacity not exceeding its single limit.
- The atlas is generated directly from analysis arrays at fixed 96×96 scale. Exact regeneration is compared on rerun.

## Focused test and scope check

- `node --test tests/trail-plate-birth.test.js`: passed 7/7 tests on the final focused run.
- `git diff --check`: performed before commit.
- The full repository test/build suite was not run; this pass uses the frozen packet and read-only research analyzer, and production source is unchanged.
- No natural replay, seed, production state, selector, UPDATE/BODY/audio change, or 600-second campaign was run.

## Artifact hashes

`manifest.json` lists SHA-256 values for this package's source, report, plan, analysis, atlas, and daily record. The manifest intentionally does not recursively hash itself.
