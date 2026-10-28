# Plate body-generation design space — research only

**Outcome:** W's constructive history-parameterized sections are technically viable on P1/P2, with U as the necessary uniform-mean control. The exploration does not select a natural WHERE law or production design. Dense alternative scaffolds remain broad even at constant width; pocket filling is representation-sensitive. Artist judgment remains pending.

- [Open the interactive atlas](atlas.html)
- [Report and signal inventory](REPORT.md)
- [Exploratory protocol and recorded revisions](PLAN.md)
- [Conceptual reduction / technical scope](TECHNICAL-SCOPE.md)
- [Validation](VALIDATION.md)
- [Independent review](validation/independent-review.md)

## Reading the atlas

Choose an actual event and any two entries. Each row shows the scaffold, a fixed0–1 field context and the resulting body in the same640×640 frame. W/U is the final construction comparison. P/K are references, T tests the alternative-scaffold floor, and Q keeps K geometry while changing existing whole-Plate coefficients. S/R/M/L remain inspectable as comparisons; they are not additional accepted families.

U displays chemical context, but uses only mean B on I for its uniform radius. K/T have no geometry field; manual field selections show context only. Raw source fields are not per-panel normalized. The blue scaffold and colored production/C0 outlines are diagnostic overlays, not a proposed ANT visual language. Measurements are collapsed by default.

W/U differ at49 source cells in P1 and 79 in P2, but only5 solver occupancy cells in P1 and 8 in P2 after projection. P2 reaches the observed border, so natural body completeness outside the frame is unknown. No sonic/perceptual significance or artistic naturalness is established.

## Reproduce without nature

```sh
node --test tests/ant-body-generation-exploration.test.js
node scripts/ant-body-generation-exploration.js --check
node scripts/ant-body-generation-exploration.js --technical --check
node scripts/ant-body-atlas-browser-check.js
```

The first runner reads the committed frozen input, generates twice with RNG forbidden, asserts input preservation and unchanged first-iteration bodies, and compares exact atlas/results/HTML bytes. Technical mode reruns only the declared P/K/W/U/Q checks. Browser check uses the existing Playwright dependency, verifies actual native-canvas pixels and controls, and regenerates technical review PNGs/receipt. Browser-version differences may change screenshot bytes; mask definitions and frozen data are authoritative.

`--extract` is only for reconstructing the small input packet from pinned Git history and existing C1 copies. It refuses to overwrite the committed input. No-flag generation and technical output likewise refuse to overwrite their artifacts. Preserve originals in another copy when reproducing extraction.

Main `4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`; parent `54346c0a3018a75ea3fdd94df74f41d1412b9578`. Frozen current-G/H0 seed20261005,60Hz,Audio Off, first commits84.016667/106.016667s. No new natural simulation, production source change, new world law, audio render, PR or merge.
