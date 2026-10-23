# Independent midpass critique — field representation

Reviewed at `8c60e4b` on `codex/ant-spatial-dynamics-research-20261022`. This is a read-only scientific/design review; it does not change the field protocol or its result.

## Decision

The frozen field gate failed: 2 of 24 direct-path phase pairs changed the wide-sensor score winner, and both are mirrored members of the same tight-circle family. The original protocol therefore remains a **no-CIC** result. Running CIC as the conditional continuation would override its preregistration.

The local-sensor data do support a different question. A separately registered local-field-to-turn test would be scientifically reasonable, but it must be labeled a new, hypothesis-generating phase prompted by the observed local differences. Keeping the old gate in the report does not make that follow-up confirmatory. I recommend closing this pass now, then deciding after the fresh final review whether that question is valuable enough to run.

## What the evidence says

The probe establishes phase sensitivity for its prescribed paths. In direct-path readouts the mean absolute phase difference in local steering is `0.124 rad`; straight fixtures show about `±0.214 rad` at stations `0.08` and `0.20` despite retaining the same wide-sensor winner. The default brush radius (`0.0045`) is below the grid pitch (`1/95 ≈ 0.01053`), and about `46.2%` of direct-path requested dose used the no-node fallback in this fixture. There was no cell saturation. These are controlled-path measurements, not estimates of natural exposure.

The local steering output is not the ant's realized turn. In production it is weighted by trail adherence, combined with delayed angular-velocity feedback and other heading influences, clamped, then passed through the `4.5 rad/s` turn-rate cap (`0.075 rad` per 60 Hz tick). A measured `0.124 rad` sensor-output difference is therefore large enough to justify checking the transfer, but it does not prove a `0.124 rad` movement difference. The protocol sampled fixed poses and did not run the paired field states through that full movement step.

The gaster-path checks make the local signal harder to dismiss as an artifact of a large lateral source displacement: mean absolute lateral offset was only `0.0000882`, while continuous and dab paths still showed local steering phase differences (`0.127` and `0.116 rad`). Yet neither gaster path changed a wide-sensor winner in its 24 pairs. The gaster path also has a mean longitudinal offset of `−0.02580`, so it is not identical to the thorax path; neither result establishes which phases occur in naturally deposited trails. See the [field report](../field/REPORT.md) and [frozen protocol](../field/PROTOCOL.md).

## Strongest case for and against a follow-up

The strongest case is that the failed gate measures a coarse, far-sensor winner, while local steering is a separate direct route into body heading. Stable wide-sensor argmax does not imply stable local turn input. The phase differences across straight and gaster-path controls warrant a direct test of whether the current raster changes an actual controller output.

The strongest counterargument is that these local differences are secondary outcomes from prescribed paths, two phases, and three fixed sensing stations. Choosing CIC now because those values look large would be post-result endpoint selection if presented as the original test's success criterion. CIC also changes the field's spatial kernel, not just its grid alignment. Equal pre-cap dose does not guarantee equal post-cap stored mass, and a lower peak or different steering profile would not by itself show a more faithful field. The new test must report cap loss and raw signals, with no post-hoc amplitude matching as its acceptance basis.

## Highest-information next step, if the field question remains open

Do not run a free-running natural CIC arm yet. First preregister one separate **natural-state field-to-turn transfer** diagnostic: use frozen production movement/deposition histories and matched pre-tick agent states from the existing three seeds; reconstruct the same histories with the unchanged Gaussian field and one fixed, normalized CIC splat; then pass both matched field states through the exact production local sensing and one-tick steering/turn path. Keep movement, dose, decay, cap, occupancy, and recorded RNG draws fixed. Measure signed and absolute differences in the actual commanded and realized one-tick turn, including turn-cap saturation, by seed and natural state. Report raw sensor profiles, requested dose, stored mass, cap loss, and decay. Do not tune the kernel or add a wide-sensor rescale. If per-tick source states are unavailable, capture and freeze them before evaluating either arm.

This would answer the missing causal link—whether a field-representation change reaches movement at naturally sampled states—without claiming long-run benefit. The old `2/24`, one-family result remains failed; the new diagnostic has its own question and decision rule. A later free-running comparison would need separate justification and still could not establish macro renewal by itself.

The direct-flow recruitment comparison already passed its availability gate and ran against isotropic recruitment, but its three-seed spatial deltas did not show a consistent direction. Valid-flow accepted-spawn exposure was about `16–18%` in the flow cases. I would park that branch rather than add it to a field test. The movement `dtFeedback` screen changed natural turning across all three seeds, but also had substantially fewer births and Plates than production; later flow availability fell as well. Those coupled changes do not identify a field effect or establish better material renewal. The fixed source-to-boundary birth rule, append-only history, and at-most-10% layer-count speed response remain independent constraints, so any field result should stay local to the tested causal link. See [movement results](../movement/results.md) and [recruitment comparison](../recruitment/natural/analysis/ANALYSIS.md).
