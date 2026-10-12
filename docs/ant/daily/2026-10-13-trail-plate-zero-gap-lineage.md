# 2026-10-13 — TrailPlateBirth zero-ant gap lineage

- **Question:** Were gap-born Plates delayed completions of a pre-gap candidate, or can retained environment rebuild a candidate and lead to a birth after all ants are removed?
- **User-selected direction:** retained material history remains part of the environment later living ants encounter. This pass changed no production state or behavior.
- **Baseline:** remote `main` was `214c59cbc31684aa5c1f3fd70dd1d21533c48ab2`; prior zero-ant result `d729072b16dd44c1c4d8b245394d02c278556da8` was its direct child. Fast-forwarded and pushed `d729072` to `main`, then branched `research/ant-plate-gap-birth-lineage-20261013` from it.

## Method

- Read current ANT README/world-model, prior zero-ant continuity evidence, and relevant retained-material/Plate evidence. Archive was excluded.
- Reused seeds `20261005/06/07`, 60 Hz, default material locomotion On, no audio. Fresh 600 s natural replay exactly matched the committed canonical replay.
- Ran two matched controllers through 400 s. At 400 s, both used the established research-only zero-ant removal/retirement flush; all other state was preserved. In the counterfactual arm, changed only `TrailPlateBirth.candidate` to `null`.
- Advanced unchanged production ticks for exactly 3,600 ticks with zero ants through 460 s. Sampled every one-second TrailPlateBirth analysis boundary.
- Candidate lineage used `startedAtMs`, production continuity semantics (adjacent mask/path similarity at least 0.6), and exact candidate-to-Plate mask/path matching. Ambiguous classification was allowed but none resulted.
- Initial paired V8 whole-object hashes differed despite deep-equal controller values. Cross-arm equality therefore used normalized deep value comparison at 401 checkpoints including RNG state/calls; V8 hash was retained only for same-instance observer-purity checks. Isolated natural replay exact-match also passed.

## Result

**MIXED.** Natural gap: 8 Plate births total—4 PRE-GAP and 4 POST-GAP. The four PRE-GAP births were all seed `20261006`, continuing the candidate started at `307016.667 ms` and stable about 92 s at gap entry. The four POST-GAP births were in seeds `20261005` and `20261007`; the entry candidate was replaced at the first post-gap analysis. With only the candidate cleared, retained inputs formed new candidates and produced 7 POST-GAP Plate births across all three seeds (3/3/1).

At each post-gap first analysis (`400016.667 ms`), the reselected candidate had nonzero existing chemical and support evidence in every seed. Every resulting Plate descriptor exactly matched its birth candidate mask/path. The result demonstrates both latent completion in one seed and regeneration after candidate clear in the matched shadow arms; it does not isolate which retained input is individually necessary.

All 15 arm-level birth records had no same-corridor repeat gate at birth. Persistence and global birth-gap gates were satisfied; `footContactCounts` did not grow and no `FOOT_CONTACT` occurred. Some early candidate rows reported previously accumulated repeat contacts/refractory state; those diagnostics did not remain active at birth. Existing pre-gap contact counts were not new gap evidence.

## Stop boundary and evidence

No production `TrailPlateBirth`, lifecycle, candidate thresholds, refractory timing, nodule formation, or material law was changed. Nodule causal analysis remains separate. No second duration or ablation was run.

Evidence package: [TrailPlateBirth zero-ant gap candidate lineage](../evidence/2026-10-13-trail-plate-zero-gap-lineage/README.md). Per-second candidate observations, gate ledgers and manifests are in its `data/` directory.

The verified claim is limited to the imposed shadow: **retained environmental inputs can regenerate the current authored Plate-formation process after clearing the pending candidate, while natural gap births also include latent pre-gap completion.** This does not show natural zero-ant production lifecycle or natural-science autonomous formation.

## Validation and independent review

- Focused candidate-lineage tests: **4 passed**.
- Full `npm test`: **310 passed, 0 failed**.
- `npm run build`: passed. Vite reported existing dependency annotation and large-chunk warnings.
- Documented fresh reproduction completed; canonical natural replay hash matches, and the evidence manifest plus all three seed JSONs byte-match the fresh output.
- Fresh independent review: **no blocking findings**. It confirmed candidate-only isolation, lineage/birth-descriptor matching, gate records, source hashes and replay provenance. The runner's `MIXED` label combines natural PRE-GAP births with POST-GAP births from either arm; this run also has both classes in the natural arm itself.
