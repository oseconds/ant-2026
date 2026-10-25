# Independent architectural review — 2026-10-25

## Verdict

**Bounded accept: advance G to a separate production-candidate/adoption review. Do not adopt G in this review.** Keep current 96 × 96 production in place until that review makes the adoption decision. The proposed shared quantity is coherent as an authored reference-integral convention; I found no unit or production-consumer contradiction that requires redesign before review.

This verdict does not call G a physical concentration, a biologically calibrated pheromone, or a better natural route system. It means the representation is precise enough to evaluate as one candidate. The separate review must own the public API and diagnostic changes listed below.

## Unit and consumer audit

The area factor is correct for the stated square grids: `h96 = 1/95`, `h316 = 1/315`, and `S = (h96/h316)^2 = 3969/361`. The piecewise-bilinear field integral is the tensor-product trapezoidal nodal sum times `h316²`. A normalized, uncapped interior write therefore has `h316² × Σ(G nodes) ≈ h96² × A`, within storage/accumulation error. This is a conditional equality of integrated authored signal. It does not preserve point samples, route geometry, sensor responses, boundary dose, or capped writes.

The shared point-signal reading is internally consistent across the production consumers I checked:

- `AntController` movement, local adherence and `ColonyActivation` read the same field through bilinear `sample()` calls.
- `TrailPlateBirth` reads the native values with their supplied width and height and uses the same bilinear interpolation; it does not require a 96 × 96 pheromone input.
- `AntRenderer` uploads the field at its native dimensions and uses a fixed alpha curve. It does not normalize values by the current maximum.

These paths can share one authored point-signal unit while responding differently after the field is better resolved. The unchanged thresholds therefore retain their numeric units, but they do not imply unchanged behavior. That is a consequence the adoption review must judge, not a contradiction in the contract. The contract is explicit that the values have no physical or biological calibration.

The edge and cap exceptions are material, but not hidden: the writer renormalizes truncated boundary kernels, segment writes clip travel to the domain, point writes outside the domain are rejected, and per-node cap loss is not redistributed. The bilinear integral is consequently not a universal conservation law. Requiring universal physical-mass conservation or equal point values at every resolution would be a different contract and would require redesign; neither requirement is established for this candidate.

Two integration issues must be resolved before adoption:

1. `PheromoneField.getSnapshot().totalMass` and `AntController`'s `analysis.pheromoneMass` are native node sums, not resolution-comparable integrals; `src/main.js` displays the analysis value. Keep that value explicitly labeled as a node sum, or expose and display the bilinear integral separately.
2. The writer API returns the scaled coefficient request for an in-domain point write and the scaled, domain-clipped request for a segment. Those returns are not actual stored increments when the cap clips nodes. The current controller ignores them, so this does not block candidate review. The adoption diff must document the return unit and preserve the distinction between source request, scaled request, stored increment, bilinear integral and node sum.

The minimum production change described in the project report—select the 316 field, scale both point and segment requests exactly once, and make the API/diagnostics truthful—is a manageable adoption boundary. It should not be represented as already implemented by the research shim.

## Strongest counterargument

G has a real response-range cost. In all three 600-second natural seeds, cumulative coverage was lower and cumulative top-10% occupancy share was higher than C. G's frozen local-strength top-bin share was about 63–65% versus C's 46–49%; far-Hill top-bin share was about 43–45% versus C's 17–18%. The fixed-cue result is not uniformly better than F either: G retained F's 10 local sign errors, improved the registered local MAE, and added 14 wide winner errors; straight and S zero-cue false-nonzero counts stayed high and their mean magnitudes increased from F.

This is the strongest reason to retain 96 if the intended product requirement is a particular sensor operating range, route turnover, or absence of individual trapping. The present evidence does not measure individual trapping, coherent route turnover, or visual quality, and the corrected chain has no C recent-window comparison. G's broad recent occupancy cannot substitute for that missing matched comparison. No authored threshold currently makes these observations a failure, however, and the three runs showed continuing movement, final populations of 19–22, no cap touches, and no recorded state-invariant failures. The evidence therefore supports review while leaving acceptance open; it does not prove that the concentration is harmless or artistically desirable.

R0/H/I narrow one causal question rather than settling concentration's cause. I replays the per-tick G reinforcement budget from the intact G trajectory and redistributes it over I's actual travel. It is an exogenous control schedule, not a candidate world law. Current A still affects ordinary behavior and baseline secretion, and the reports give no equivalence margin. Together the controls justify stopping the specific adherence-allocation branch; they do not show that A or concentration has no effect, or that G has no trapping risk.

## Runtime check

I independently recomputed the frame-clock claims from the saved C/G JSON. Each arm recorded 3,425 accepted RAF intervals. C ran 60,005 ms wall / about 60,000 ms simulated; G ran 60,017 ms wall / about 60,017 ms simulated. The largest interval was 35.9 ms for both, no interval exceeded the 100 ms clamp, and `Σ max(interval − 100 ms, 0)` was zero. The raw `discardedByClampMs` values are wall-minus-simulation differences, not clamp loss; the results report says so. The current source hashes in both raw browser records match the checked files, and the production source/canonical README diff against the stated fresh main is empty.

These data support only the bounded feasibility statement in `runtime/RUNTIME-RESULTS.md`: the tested 60-second, Audio-Off Chrome session maintained real-time clock progression on this machine. Instrumented field/update/snapshot costs and JS heap use were higher for G; the independently evolving worlds are not a matched-state resource comparison. This is not an hours-long, other-hardware, live-audio, memory-leak, or deployment-bundle result.

## Final boundary

No decision-blocking unit/API issue was found for **advancing to review**. API return semantics and node-sum labeling are blockers for a complete adoption diff, not reasons to redesign the research contract first. Keep the 96 field as production authority until that diff is reviewed. If the project instead requires calibrated chemical units, universal edge/cap conservation, or pointwise behavior invariance across resolutions, stop and redesign the contract before adoption.

No new causal experiment, test, browser run, or production edit was performed for this review. The unresolved risk is whether G's higher-response distribution and occupancy concentration meet the project's eventual behavioral and visual requirements under the unchanged renderer thresholds; those requirements were not defined or measured here.
