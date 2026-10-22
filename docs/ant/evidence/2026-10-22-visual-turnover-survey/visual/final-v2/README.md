# Final visual turnover survey

This set uses the requested 0, 15, 30, 60, and 120 minute snapshots. The contact sheets and matching per-recipe time series reuse the same per-snapshot PNG bytes; `manifest.json` records a SHA-256 for each shared panel source and verifies that it matches in both outputs. Every rendered overlay uses alpha 112.

The current exposed-top tenure readout is snapshot simulation time minus the actual top Plate birth time. `addPlate()` appends each accepted Plate index to the covered cell column, and `_rebuildTopology()` selects the last entry as the top ([MaterialStratigraphy.js](../../../../../../src/lib/agents/ant/MaterialStratigraphy.js#L40-L57), [top derivation](../../../../../../src/lib/agents/ant/MaterialStratigraphy.js#L347-L360)); plate history retains birth time and age ([history](../../../../../../src/lib/agents/ant/MaterialStratigraphy.js#L392-L400)). Under this append-only behavior, the readout is time exposed at the current cell, not foot-contact age. Its color scale saturates at 120 minutes. Clock-driven tenure color change does not imply a new birth or geometry change.

The identity palette and boundary sheets remain diagnostic ceilings. The material-only series uses the actual renderer with agents removed and pheromone disabled; the native 96×96 material image is shown at 640×640.
