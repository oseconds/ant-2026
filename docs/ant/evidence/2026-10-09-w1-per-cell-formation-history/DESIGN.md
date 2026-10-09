# W1 per-cell formation-history audit — read-only contract

Start from `92ba2117b10bd3f559eca9866602ab8d430a649b` on `ant-w1-episodic-material-shadow`. Inspect the original W1 and latest max-overlap candidate on the same three frozen natural inputs through 599.25 s. This pass adds observers and measurements only. It defines no material contribution function, weighted mask, geometry rule, threshold, character estimator or continuity/closure change.

## Accounting and temporal scope

Reconstruct actual component-processing operations from existing archived identity/merge diagnostics. Preserve component order and merge-before-admission order. Baseline has same-frame redirects: a source may admit cells in an earlier component and then transfer them later in that frame. Use its actual operation-time union, not a pre-frame approximation or final ancestry tag. Candidate winning parent sets are disjoint, but use the same ordered accounting.

Direct admission means a new cell insertion under the focal identity when that cell is absent from its current union. An inherited cell means an actual source-union transfer, including overlapping cells. Preserve exclusive direct-only / inherited-only / both sets; their disjoint sum must equal the actual historical union. Retain first union-entry route separately. Later focal activity on an inherited-only cell is component exposure/revisitation, not a rewrite of its original insertion route. Count sample/events separately from unique union cells. Split provenance is not geometry transfer. Any ambiguous metadata remains explicit.

Primary temporal activity is the focal episode's owned active observations, including recorded source-owned histories inherited by real merges. Sets deduplicate same-cell/frame records. Secondary global same-position activity can belong to another identity and is labeled separately. Spells consist only of adjacent recorded active sample indices; report first/last timestamps and their observed spans. Do not fill ~1 s sampling gaps or infer exact cessation times.

Support duty uses chemical bit, mechanical bit and their conjunction from earliest canonical admission through the actual causal cutoff, inclusive. It matches the existing consolidation observation interval. q-true/q-false fractions use owned active cell-samples as their denominator; q-false active is the existing EMA carry-over proxy. Contact ages use actual same-cell FOOT_CONTACTs at or before earliest canonical admission, first focal direct insertion and first focal import separately. No prior foot is null. These are history proxies; exact DAB/field contribution decomposition is unavailable.

## Selection and validation

At nearest actual observations to 120 / 300 / 480 / 599.25 s, inspect then-current canonical ID 0. That frame-local snapshot uses no future ancestry cohort. Archive all naturally frozen episodes at their actual closure frame; choose the largest multi-cell episode and earliest one-cell closure per seed/model for visual cases. Also identify an actual zero-consolidation one-cell example when it exists. Those are retrospective case selections, not formation gates.

Reanalyze original and candidate results with their unchanged factories/character functions and deep-compare complete committed results. Independently reconstruct per-frame unions/admissions from archived operations and compare with the live frozen-input model replay. Compare candidate full identity diagnostics and baseline canonical identity/clock snapshots, active masks, EMA and all terminal geometry. Assert per-cell duties reproduce existing consolidation. No natural ANT behavior is rerun.

Focused fixtures cover ordered merges, repeated/overlapping admission, same-frame redirects, provenance without transfer, multi-hop history, contact nulls, causal prefix/no RNG, observed spells and indices. Run full tests/build, independent numerical and plot reproduction, raw-byte protection of historical evidence/inputs/production, package hashes and staged bytes. Fixed-scale plots use full 96×96 world extent, duty [0,1], age [0,600] and fixed categorical provenance; no per-panel contrast normalization.

Interpret measured heterogeneity before proposing at most one next hypothesis. Do not infer that differences justify a particular material contribution function, causal ant ownership, or a production geometry change. Preserve tooling/evidence as separate commits, push this existing shadow branch, verify remote HEAD, and stop without main merge, PR, feedback or audio work.
