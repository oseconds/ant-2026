# Movement-law qualification decision

## Why this single follow-up was earned

Gate A exposed the extra feedback-rate clamp in natural states: strict `abs(previousOmega) > 2.2 rad/s` occurred in 583/607 production-origin observations and all 100 high-entry-adherence observations; in dtFeedback-origin states it occurred in 148/648 and 52/201 respectively. The independent control audit proposed one derived contrast, rather than tuning gains: use the previous realized angular displacement `previousOmega * dt` without additionally clipping the rate at 2.2. Keep gain 0.65, adherence, target/intent, local clamp, 4.5 rad/s body actuator, velocity, field, recruitment, lifecycle and material laws unchanged.

The [protocol](movement-qualification/PROTOCOL.md) was frozen before this candidate's outputs. Production, dtFeedback, dampingOff and rawDisplacement were compared over six shapes, two field modes, three seeds, three seconds each: 144 controlled cases. The reduced scalar recurrence has pole `-0.65*A`, but that is not a full-loop stability proof. It also attenuates a constant cue by `1/(1+0.65*A)`; damping can still oppose a sustained bend.

## CONTROLLED-PROBE RESULT and manipulation check

The changed branch was exercised: rawDisplacement differs from the clipped dt term on 3,131/6,480 candidate ticks, exactly when the prior rate exceeds 2.2. Trajectory samples differ in 35/36 raw-versus-dt fixture pairs. The null that the candidate merely failed to activate is therefore rejected in this fixed family.

The deposited counterexamples persist. At seed 19, gentleMirror, tightMirror and sCurve retain route progress approximately 0.02935/0.01812/0.03740 normalized units and mean absolute cross-track error 0.07637/0.07932/0.07427; route-turn sign agreement is approximately 0.291/0.542/0.285. Those route-outcome metrics are effectively identical to dt/off there, despite adjacent-turn same-sign fraction about 0.983; the actual sampled trajectories need not be identical. Seed 61 also retains failures in this family, while seed 193 is mixed and includes a tightMirror regression. All cases remain available; none is hidden or retuned.

## Decision

**Stop candidate escalation.** Removing the extra clamp while retaining previous-turn damping does not robustly qualify the fixed mirrored/S deposited-field family. No additional 600 s natural run or 66-state raw replay is earned. This rejects this specific law as a production candidate, not every possible damping formulation.

Production delayed feedback remains a supported cause of alternating correction on the tested natural states. dtFeedback remains a useful research contrast with replicated natural movement changes and prior long-run evidence. Neither that evidence nor the raw candidate's smoother scalar recurrence proves a generally qualified authored movement law. No production or exhibition startup mode is adopted here. A remaining field/sensor/cue question must be separated from further feedback gain tuning.

See [controlled qualification report](movement-qualification/REPORT.md) for the full fixed family, metrics, source receipts and packaging/measurement notes. The phase challenge is a different, preregistered fixed-history contrast; its results cannot be inferred from these controlled failures.
