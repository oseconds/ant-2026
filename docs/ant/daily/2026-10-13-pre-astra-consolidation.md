# 2026-10-13 — Pre-Astra canonical consolidation

## Scope

Consolidate the persistent-world reassessment on canonical `main`, remove stale current wording, inventory the blocked shadow worktree, and refresh cleanup guidance. No causal experiment or simulation was run.

## Canonicalization

GitHub compare verified that remote `main` at `75e53df2ec0d025b4337e360e48829f5c58809ab` was the direct parent of synthesis `8a06d916ba937c57a236ce021c61b399b59cc1ae`, with one commit ahead, zero behind, and six Markdown-only paths. Production/source paths were unchanged. An expected-old guarded GitHub ref update advanced remote `main` to `8a06d91`; local `main` then fast-forwarded with `--ff-only`. Post-update compare reported synthesis identical to `main`. Direct Git fetch/`ls-remote` could not authenticate in this shell, so the live ref relation and update were verified through the connected GitHub API.

## Consistency corrections

- Current README/world-model wording now says **richer episode/order-sensitive character** is unimplemented; bounded aggregate-derived Plate/Nodule properties already exist.
- README now states vitality/social/natural vacancy remain PARK and Nodule extension is technically justified but secondary/PARK.
- The linked 2026-10-09 social-material concept note now labels its W1-first status as historical; it is not current roadmap.
- Existing synthesis separates movement→pheromone from movement→gait/contact; 75 ms is local contact recovery, not vibration lifetime; the Nodule stability interpretation is explicitly limited.

Claim boundaries agree across source, current hub, world-model, synthesis, latest evidence and daily records: retained material→locomotion is production plus causal A/B evidence; pre-cohort is descriptive occupancy; zero-ant regeneration is forced-shadow evidence; natural zero-population lifecycle is unverified; separate organism after-effect is PARK; Nodule extension is secondary/PARK; native material-character attribution is the next conditional discriminator; indefinite turnover/openness remains an unresolved reference risk, not an adopted law.

## Dirty worktree and cleanup

The 13 untracked files in `ant-retained-material-experience-shadow` were read and compared by SHA-256 plus parsed JSON/CSV and source diff against current-main counterparts. Ten are category A canonical data/test duplicates; three are category B historical runner and its original manifest/source hashes. Categories C and D are empty. No file was moved, edited, committed or deleted. The complete per-file inventory and hashes are in the [hygiene map](../2026-10-13-repo-hygiene-map.md).

Main fast-forward kept the existing merged branch candidates safe; the synthesis local/remote ref is now redundant and is a candidate only after Astra review. W1, unique interior/local-accretion candidates, remote unique test refs and the dirty shadow worktree remain preserved. Three clean worktrees remain removal candidates but contain ignored build/test artifacts that must be preserved or explicitly re-disposed first.

## Validation and boundary

Checked ancestry, source/file diff, canonical references, current production formulas and timescale definitions, relevant evidence/daily boundaries, worktree statuses, ignored content, dirty-file hashes/semantic diffs and final Git status. The eight audited Markdown files contain 191 valid internal links and 16 tables with matching column counts; `git diff --check` passes. No tests/build were run because production source was unchanged; no new simulation was run by request. Only Markdown documentation changed.
