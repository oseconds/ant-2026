# Review of the resumed base substrate / Plate Debug branch

Review baseline: `main` at `96bcc263827a762000e1fb67b5c0795b919c497e`; resumed branch at `c63634a9ac92019682f86e236794caf0681c5bc5`.

## Resolved findings

- `AntEnvironmentAudioBridge.setBaseSubstrateEnabled(false)` could stop the selected primary legacy experiment after a mode switch. The stop is now limited to `bornSurface`. The new regression failed before the fix and passed after it.
- The existing browser assertion rejected every ANT fieldset. It now exempts only fieldsets inside `#ant-plate-debug`, retaining the assertion against retired controls elsewhere.
- A late development smoke rerun exposed a stale population lower bound after the audio lifecycle delays. Natural retirement and model remounting can reduce the count below the earlier startup sample. The check retains startup growth, the configured upper bound and spawn/retirement reconciliation; only the invalid monotonic comparison was removed. The failed run is preserved in `browser-dev-population-failure.txt`.
- Existing browser coverage checked only the presence of the collapsed panel. The suite now opens/closes the panel, checks all 15 diagnostic cells and seven overlay controls, and restores their defaults. The renderer test also checks the Plate ID label.
- The supplemental browser evidence freezes the display clock while taking natural fixed-tick milestones. Each overlay must change the actual canvas pixels while the simulation state is stationary. Development and production preview both exercise the same controls and mobile layout.

## Preserved boundaries

- No movement, steering, collision, gait, pheromone, SurfaceField, recruitment, material qualification or stratigraphy settings were tuned.
- The born-surface worklet, generic Plate worklet, topology compiler and material implementation have no diff against the main baseline.
- Born Plate contact remains 3 ms, local recovery remains 75 ms, and damping remains multiplied by 50.
- Base substrate uses the existing isolated generic Plate transport. It never adds a Plate or nodule to material history.
- Candidate diagnostics perform a same-corridor comparison earlier than the old qualification gate. Main-class parity is checked by the invariance harness. No runtime optimization was introduced into this pass.

## Verification limits

The long invariance pass uses a mock audio transport to compare simulation state and born-surface commands. The dedicated browser PCM capture failed during the prebirth On scheduler handshake, so it supplies no passing acoustic evidence. Offline replay would not be a realtime stress test. The debug audio/wall value is cumulative from worklet creation and uses the latest asynchronous diagnostics response; startup and response latency affect it. Awake/sleeping values describe layers, not social roles or biological modes. The exposure depth overlay shows column layer count greater than one, not a per-Plate exposure percentage. PCM level comparisons alone would not establish perceptual masking across arbitrary playback systems.

## Visualization-only follow-up

The final UI has ten controls, adding separate mask-boundary, full frozen graph and current compiled pickup overlays. Every new control defaults false. Plate IDs share the geometry palette and label route starts/ends. Candidate turquoise is distinct from P1 blue. Covered/exposed drawing reads the existing top-layer grid; audio pickup drawing reads the compiled topology from an ephemeral render snapshot. No simulation/material/audio settings or frozen descriptors were edited for this follow-up.

Renderer tests verify closed contour joins, all frozen graph edges, covered/exposed opacity, two actual solver pickup locations, distinct fallback targets and an unchanged snapshot. Natural Chrome captures verify one, two overlapping and three Plates, plus exact restoration of the default canvas. A final independent read-only review found no functional blocker. Crowded upper-left legends were moved to the lower-left. PCM/invariance harnesses were neither restarted nor broadened for this visualization change.
