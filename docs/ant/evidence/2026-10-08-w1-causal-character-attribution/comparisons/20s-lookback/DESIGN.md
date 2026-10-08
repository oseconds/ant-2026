# W1 continuation: causal pre-admission character attribution

This revision is authorized after the first W1 stop. The original stopped package remains immutable. The exact crystallization recurrence, thresholds, timescales, spatial connectivity, lineage handling, minimum persistence, closure, discard and geometry rules remain unchanged from commit `afa1653ed4798c4f1de0df1f46995dabe0af621e`.

## Sole estimator revision

For each episode cell admitted at time a, directional attribution now accepts actual same-cell FOOT_CONTACT observations with timestamps in [max(0, a − 20 s), episode closure], inclusive within the existing numerical timestamp tolerance. The 20 s pre-admission horizon is the existing recent-history timescale. This includes local contact evidence that predates the threshold/filter response. It is one bounded extension of the existing estimator, not a second estimator or a distribution adjustment.

Keep travel-weighted nematic averaging, ant-plus-completed-segment deduplication, actual foot locations, lifecycle boundaries and completed 60 Hz displacement segments unchanged. Consolidation still measures per-cell joint chemical/mechanical qualification duty from admission through closure; it does not use the extended direction window. Exactly two primary coordinates remain.

The pre-admission extension is bounded at 20 s. A completed displacement segment associated with a boundary contact can begin at most one recorded segment earlier; report that boundary exposure separately. No future foot or segment is accepted. Contacts outside the episode's cells or before the window do not enter through dilation or interpolation. Zero travel remains missing evidence, never isotropy.

The inputs establish that an actual same-cell contact contributes to accumulated contact evidence. They do not identify every chemical/mechanical contribution or prove that one ant caused the region. EMA filters retain older tails; this bounded contact window is an explicit attribution model, not an exact decomposition of all filter history. Report this limitation rather than claim full causal recovery.

No fallback estimator, constant coordinate, morphology filter, minimum-size veto, forced episode closure, shape template, new formation family, production integration or feedback is authorized. Retain the explicit missing-direction error if a closed episode has no valid travel in the revised window.

## Complete-replay reporting decision

The initial 20 s replay resolved the historical episode-18 gap, then exposed another coverage gap at episode 96 in seed 20261005: admission at 65.0167 s, closure at 118.0167 s, and only two local contacts at 2.0113 and 2.2498 s. Those older contacts remain causal accumulated contact evidence, but fall outside the declared recent attribution interval. Do not expand the horizon merely to make the estimator cover this result.

To fulfill the requested complete three-seed replay, continue formation and geometry through missing directional coverage. Keep every mechanism-frozen episode, its defined consolidation, and an explicit null directionalOrder with a typed missing-data reason. This is reporting missing evidence, not an additional estimator or a materialization veto. Report the two-axis population and its missing coverage separately. A completed geometry replay does not satisfy the original requirement that every episode have two measured coordinates; that research gate remains unmet whenever gaps exist.

## Frozen sources and planned evidence

Use the same original W1 frozen input package and its production/local-accretion comparison, with the three committed natural 600 s trajectory/contact archives. No source packet is repacked and no ANT behavior is rerun. Analyze seeds 20261005, 20261006 and 20261007 in canonical order through all 599 field observations, preserving unavailable directional values explicitly.

All topology, 18-cell descriptive review scale, milestone matching, novelty, traffic mismatch and character-statistic definitions remain those of the original W1 analysis. Record full frozen and right-censored histories separately. Open large lineages cannot count as successful completed episodes. Preserve the previous stop as history; write new results into this package.

Verify byte-identical crystallization source and fixtures, protected production source and input packets; deterministic complete reruns; bounded finite characters; valid indices; no RNG/future leakage; focused/full tests and build. Plot only actual geometry and observed coordinate distributions at fixed scales. Do not tune to improve distributions or manufacture substantial shapes.
