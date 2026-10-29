# Proposal-update diagnostic — preregistered plan

## Question and authority

Measure how much P1/P2 representative turnover follows loss of saved environmental qualification, and how much follows production selecting another still-qualified subset. Assess whether the observed scope-update responsibility merits further design. This pass measures UPDATE only; initial emergence, BODY, material meaning, and production behavior remain outside scope.

Production authority is main 4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785. Research parent is codex/ant-event-evolved-scope-20261029 at 849f324dfc6ea4c7da89ac7153a7e2a7fa8c4bad. Use only the saved current-G/H0, seed 20261005, 60 Hz, Audio Off P1/P2 frames already frozen by the parent event-evolved-scope packet. Do not replay or reconstruct unavailable frames.

## Fixed measurements

For each of the 20 consecutive saved transitions per event:

- Previous proposal is I_prev; current environmental validity is E_current; current production proposal is I_current.
- surviving = I_prev ∩ E_current; invalidated = I_prev − E_current; retained = I_prev ∩ I_current; still_valid_dropped = (I_prev ∩ E_current) − I_current; gained = I_current − I_prev.
- Assert |I_prev| = invalidated + retained + still_valid_dropped and |I_current| = retained + gained.
- Report still_valid_dropped against dropped cells, I_prev, and E_current. Also split still-valid cells by current H versus E-only availability.

For the START survival curve, use the exact START I as a measurement reference and calculate |I_START ∩ E_t| / |I_START| at all 21 saved anchors. Do not feed START membership into the actual selector.

For each transition occurrence where a previous-I cell is dropped but remains in current E, calculate sample-resolution age as the number of consecutive one-second saved intervals from its first continuously E-qualified anchor through the current anchor. Retain the exact interval histogram; do not create material thresholds or infer unsampled tick-level age. Report unique coordinates separately from repeated drop occurrences.

For structural role, classify each previous-I loss by membership in the saved previous principal path versus selected non-principal I. Classify gains by current principal path versus selected non-principal I. Do not call these branch genealogy, physical lineage, or material relevance. Inspect the maximum-turnover transition per event (maximum lost + gained, earliest tie); also inspect P2 destination anchors 94.016667 s and 104.016667 s.

## Strict-retention diagnostic counterfactual

Apply the parent-recommended all-or-replace proxy to each frozen event only:

1. Initialize incumbent I, principal path, and ribbon from the actual START proposal.
2. At each later saved anchor, if every incumbent-I cell remains in that anchor's E, hold the entire incumbent I, path, and ribbon unchanged.
3. If one or more incumbent-I cells are absent from current E, count the exact invalidating cells and replace the entire incumbent with that anchor's actual production proposal and its saved path/ribbon.
4. Compare previous/current counterfactual path and ribbon with the unchanged production relation: ribbon-mask Jaccard versus neighbor-tolerant forward path similarity; use their existing maximum and existing 0.6 threshold. Held intervals therefore score 1 by construction. Carry/restart only the unchanged maturity clock from those comparisons.
5. At the original COMMIT anchor, report only whether the existing 20 s maturity clock is compatible. Do not change COMMIT timing or simulate repeat/contact/global/cap gates.

This is a diagnostic proxy, not a candidate law. It tests pointwise E admissibility only; it does not establish current skeleton, source, boundary, route, geodesic, or winner eligibility.

## Atlas selection

Use the same full 96×96 grid and scale for both events. For each event, display START, midpoint anchor floor((n−1)/2), maximum-turnover destination (earliest tie), the last pre-COMMIT anchor, and COMMIT. Sort selected anchors chronologically and deduplicate if necessary. Relative to the immediately previous production I, color retained, still-valid-but-dropped, no-longer-E-qualified, and newly selected cells separately; START shows its E and I directly. No width, BODY fill, smoothing, crop tuning, or gain normalization.

## Decision

Choose exactly one based on the full P1/P2 measurements:

- INCUMBENCY DESERVES FURTHER DESIGN
- INCUMBENCY MAY ONLY STABILIZE FRINGE
- INCUMBENCY IS POORLY SUPPORTED
- MIXED / UPDATE LAW NEEDS MORE STRUCTURE

Environmental validity is not production selection and is not event continuity. In particular, cell in E is evidence against immediate environmental invalidation, not proof that it should remain selected. Emergence remains separate and unresolved unless existing evidence directly settles it.

## Validation and stop boundary

Verify source/input hashes, exact event identity/times, 21 anchors per event, I/E domains and subset invariants, deterministic analysis rerun, original source continuity parity, counterfactual accounting, atlas center-cell/data agreement, and manifest hashes. No RNG, natural run, new seed, BODY, selector or hysteresis implementation, emergence experiment, event/lifecycle change, production source change, audio, or PR/merge/force-push.
