# Preregistration arithmetic erratum

The frozen `PREREGISTRATION.md` contains a mistyped decimal in the displayed value of `sqrt(2) / 315`. Its formula and candidate were correct. The correct value is `0.004489566864676492`, not `0.004489117907990024`; the latter was a transcription/arithmetic error.

The implemented pitch is exactly `1 / 315`, and the qualification checks `Math.SQRT2 * (1 / 315) <= 0.0045`. The measured maximum positive-node distance is `0.00448956686049532`. The corrected bound remains below `R=0.0045`; this correction changes no candidate parameter, fixture, cohort, metric, or acceptance rule. It was found while reconciling the final report with the saved Gate 1 receipt, after the first cue run, and is recorded rather than rewriting the frozen preregistration.
