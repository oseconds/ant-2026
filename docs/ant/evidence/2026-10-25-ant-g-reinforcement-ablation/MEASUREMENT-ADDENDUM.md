# Measurement addendum — recent occupancy window

This addendum was committed after an initial replay and before the corrected replay. It does not change the preregistered question, primary cumulative occupancy measures, seed set, decision rule, or stop boundary.

## Finding

Inspection of the reused movement-shadow observer found that its 64×64 `currentOccupancy` buffer is never cleared at the end of a second. The rolling-window code therefore does not receive independent one-second buckets; its stored `recent30sCoverage` and `recent30s.normalizedEntropy` values cannot be treated as a valid rolling 30-second measure. Those fields are retained in the parent archive as historical output but are not used here.

## Correction

The ablation runner now adds a passive tick-level occupancy observer. It counts the same post-tick ant positions into the same fixed 64×64 grid, stores a fresh bucket each second, and rolls the last 30 buckets. At each checkpoint its cumulative coverage, top-10% mass share, and normalized entropy must equal the reused movement runner exactly. Only corrected rolling-window values are used for this pass's recent-occupancy comparison; the R0 checkpoint maps also carry the corrected cumulative and recent occupancy arrays. The world, RNG, controller, field, and movement runner remain unchanged.

The first collected output summary (SHA-256 `4a8348ea45ce3b1daba7fd9c359502507ab122e3e156c501b7df1904bdebae03`) is provisional because its recent-window fields came from the inherited observer. It is superseded by the corrected deterministic replay and is excluded from the decision.

This is an instrumentation correction discovered through source inspection, not an outcome-selected metric or threshold. The independent observer must pass ON/OFF state and RNG parity before the corrected replay is interpreted.
