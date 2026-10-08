# W1 continuation: cumulative causal contact-history attribution

The user resumed this pass with the explicit option to revise the single causal attribution window. This supersedes the earlier paused choice to keep a 20 s lookback and report unavailable directions. The original committed W1 stopped package remains immutable. The initial uncommitted 20 s replay is preserved, without rerunning it, in `comparisons/20s-lookback/` with its design, source snapshot and draft report.

## Current sole estimator definition — declared before revised analysis

For each cell in a mechanism-frozen episode, admit actual same-cell FOOT_CONTACT observations from the recorded natural run start (0 s) through that episode's closure, inclusive within the existing 1e-9 s timestamp tolerance. Use the same latest completed consecutive 60 Hz displacement segment at each foot time, travel-distance weighting, unit nematic vector and ant-plus-segment-end deduplication as before. Only the attribution interval changes. There is no second estimator, adaptive fallback or new time parameter.

The interval matches the formation input's cumulative distinct-contact predicate, which starts from zero at the natural run's beginning. It includes older local contact evidence that can precede delayed chemical/mechanical qualification and contrast admission. The interval is finite and causal: zero through closure, at most the final recorded field horizon of 599.25 s. Nothing after closure is accepted. A directional segment ends by its foot timestamp and spans at most one recorded 60 Hz tick. No body-heading substitution, lifecycle bridge, spatial interpolation or stationary direction is invented.

DirectionalOrder remains the normalized magnitude of the travel-weighted resultant of unit nematic vectors (cos 2theta, sin 2theta). It is a cumulative local contact-history directional proxy as of episode closure. It is not an exact decomposition of chemical, mechanical or EMA contributions, nor evidence that one ant caused the episode. Old contacts retain their original travel weight; no recency decay is added. Earlier contacts may be reused by later overlapping episodes, so episode character observations are dependent and can express inherited/stale local history.

Consolidation stays exactly the mean of per-cell joint chemical/mechanical qualification duty fractions from each cell's first admission through closure, inclusive. No raw field amplitude, lifetime or area is substituted. Exactly two primary coordinates remain, bounded [0,1] when defined. An episode with no positive valid directional travel still retains an explicit typed gap and null coordinate rather than zero/isotropy; do not remove its geometry.

## Formation invariance

The exact W1 crystallization recurrence, thresholds, timescales, connectivity, lineage merging/splitting, persistence, closure, discard and frozen geometry remain unchanged from `afa1653ed4798c4f1de0df1f46995dabe0af621e`. Recent/established EMA timescales are still 20/90 s. The supported predicate still requires all original chemical/mechanical/repeated-contact flags. No morphology filter, minimum-size veto, source-to-boundary requirement, target path, tree, template, forced closure or second formation family is added.

No production movement, TrailPlateBirth, MaterialStratigraphy, fields, renderer, audio, substrate, recruitment or social observer changes. No RNG consumption, natural ANT rerun, feedback, vitality or acoustic mapping. Material geometry remains separate from any future acoustic topology.

## Earlier attribution result and new decision

The original admission-only window stopped at seed-05 episode 18 at 82.017 s. A first bounded 20 s pre-admission lookback resolved that closure but left 141 of 328 persistent closures without recent local contacts across the three completed frozen histories. For example, episode 96 admits at 65.017 s and closes at 118.017 s, but its only same-cell contacts occur at 2.0113 and 2.2498 s. The cumulative contact predicate retains their evidence while the recent directional interval excludes them.

The user first chose to retain those gaps, paused the pass, then explicitly resumed with the other option: revise the one causal interval. The present definition follows the cumulative input semantics rather than increasing a cutoff until coverage passes. Do not optimize the interval or coordinate distribution after seeing this replay. Preserve the negative/mixed geometry result independently of any improved character coverage.

## Frozen sources, measurements and validation

Reuse the original W1 frozen input packets and production/local-accretion comparison plus the three complete committed natural trajectory/actual-foot archives for seeds 20261005, 20261006 and 20261007. No source packet is repacked and no saved snapshot or historical summary is rewritten. The previously approved 25-row saved-snapshot input expansion remains documented in the original package.

Analyze every seed through all 599 field observations, ending at 599.2500000000696 s. Keep all mechanism-frozen geometry, any typed character gaps, short discarded closures and right-censored unfrozen lineages. No open giant lineage counts as successful frozen material. Topology, the 18-cell descriptive spatial reference, milestone matching, novelty, traffic mismatch and statistical definitions remain unchanged.

Verify exact formation-source/fixture and protected production/input identity; compare every geometry/consolidation result against the saved 20 s replay; repeat complete analysis and plots into a separate directory and compare bytes. Test causal bounds, finite values, valid indices, no RNG/future leakage, nematic fixtures, consolidation invariance and topology. Run focused/full tests and build. Report distributions without tuning, and distinguish numerical coverage from material-ontology viability.
