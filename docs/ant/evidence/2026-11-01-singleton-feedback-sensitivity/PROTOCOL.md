# Protocol — singleton feedback sensitivity

## Registered question

Test whether applying one research-only retained layer for each new, uncontested mature local X changes the subsequent B/C opportunity, conflict, and production-formation history relative to a matched current-production CONTROL.

This is a one-seed, 300 model-second feedback sensitivity probe. It does not select or adopt a material law.

## Authority and frozen inputs

- Production source authority: `main@bc045dc3caa5954df633ecbee37fbabcb8224f30`.
- Experiment parent: `2cfe9cbab78df2af9e77d9df450c67fb603aa22c`.
- Frozen source-signal history: `docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis/seed-20261005.signals.json.gz`.
- Frozen opportunity/X history: `docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis/seed-20261005.opportunities.json.gz`, with anchor chunks named by that metadata packet.
- Frozen B/C event history: `docs/ant/evidence/2026-10-31-bc-dual-material-shadow/analysis/events-20261005.json.gz`.
- Control and treatment each use a fresh controller with seed `20261005`, fixed `dt=1/60`, 18,000 ticks, and no `AudioBridge`.

The available frozen CONTROL packet supplied the exact previous-tick E/F/B/C/D, material maps, production births, and boundary RNG checks. A preflight read-only capture is retained under `analysis/control-capture/`; formal paired results are the separately captured `analysis/control.signals.json.gz` and `analysis/treatment.signals.json.gz`.

## Movement feedback path

At tick entry, the controller reads its production `layerCountByCell` once for the living ant positions. If the optional provider exists, it returns a nonnegative integer overlay addend for that same 96×96 cell. The controller adds that count to the one tick-entry L vector before using that same effective L in:

```text
m(L)  = 1 - 0.10 * (1 - exp(-L/4))
qA(L) = 1 - 0.50 * (1 - exp(-L/4))
hD(L) = 1 + 0.50 * (1 - exp(-L/4))
```

The treatment provider returns `singletonLayerOverlayByCell[cell]`. No other system is passed that array. With no provider, the original production material L vector is used unchanged.

The live ant cell is indexed as `round(y*95)*96 + round(x*95)`, matching `materialLayerCountAtSnapshot`. Each provider call records `(antId, cell, timeMs, L_production, L_research, L_effective)` and arithmetic multiplier values. `LocalOccupancy.sense` is wrapped read-only to count exposed calls where the returned same-flow target is finite and `hD` changed.

## Live B/C observer

At the existing `TrailPlateBirth` analysis boundaries, the wrapper captures native qualified E, existing production F thinning, D, native B chemicalMemory, and C sampled from `SurfaceField`. The analysis times are the actual `lastAnalysisTimeMs` values: the first is 16.666… ms and the subsequent schedule advances by the controller's existing one-second analysis cadence.

The observer uses the already-registered conventions:

- grid: 96×96; positive local maxima on the edge-bearing F skeleton;
- exact-equal 8-neighbor plateaus, canonical lowest row-major coordinate;
- strongest-first `.15` grouping;
- reciprocal-nearest `.025` track matching with the same F-component continuity guard;
- X: 8-neighbor component of `F ∩ Disk(n,.15)`;
- maturation: 20,000 actual elapsed model ms in one uninterrupted track/stability interval, with adjacent X-cell-set Jaccard at least `.60`; emit only the first event in that interval.

The observer streams live observations. The final CONTROL comparison confirms every B/C opportunity row and X set against the frozen packet before the treatment is interpreted.

## Singleton decision and event ordering

At a boundary, distinct mature options are exact-X masks with their B/C provenance preserved. Same exact-X masks collapse to one spatial option. For each new maturation, equal X event records at that same boundary are grouped. The new option is eligible only if it has zero positive-cell-overlap edges to every other currently mature unique-X option. Eligible treatment X deposits one integer layer in each X cell, once per spatial option. A contested option receives no layer and is not queued, retried, fused, or laminated.

The observer and overlay decision run after `controller.tick(dt)` completes and after production `TrailPlateBirth.advance()` builds the boundary. The event's completed movement therefore uses only the prior overlay. The increment becomes readable only at the next tick entry. CONTROL runs the same observer with no overlay and no materialization.

## Instrumentation and receipts

- A counted seed LCG supplies the same production RNG. Around every observer call, controller RNG calls must be unchanged; `Math.random` is blocked during the observer.
- A controller fingerprint is compared before/after every observer call. Production layer map, top map, material revision, and nodule revision are also compared around the observer.
- Treatment records all tick-entry L tuples, exposed-ant arithmetic counterfactuals, per-window consumer opportunities, and the per-cell overlay event history.
- Every tick checks finite position, velocity, heading, in-domain location, clearance for new spawns, and production Plate count below the safety ceiling.
- At 60, 120, 180, 240, and 300 s, both arms record population, cumulative spawn/retirement, realized travel, tick-end blocked flags, pheromone, SurfaceField, B, production Plates/material, and research overlay.
- At each one-second analysis anchor, both arms record active B/C rows, new maturations, unique mature X, singleton/contested counts, overlap graph counts, provenance, entry class, centers, F-component identity, X masks, and production candidate/birth context.

## Analysis

The comparison uses the same-seed paired CONTROL and TREATMENT run only. Summary windows use the actual saved analysis boundaries assigned by `[windowStart, windowEnd)` model time for 0–60, 60–120, 120–180, 180–240, and 240–300 s. Checkpoints use completed ticks exactly at nominal 60 s multiples. No 600 s aggregate from an earlier experiment is used as a matched arm.

Production Plate births are reported as ordinary output of the unchanged production selector on each diverged world. The research overlay is not a Plate, does not write to `MaterialStratigraphy`, and is not an audio or renderer state.

## Reproduction

From the repository root on `codex/ant-singleton-feedback-sensitivity-20261101`:

```powershell
node scripts/ant-singleton-feedback-sensitivity.js
node scripts/ant-singleton-feedback-verify.js
node --test tests/ant-material-locomotion-resistance.test.js tests/ant-singleton-feedback-observer.test.js
node --test tests/ant-*.test.js
node --test --test-reporter=dot tests/*.test.js
```

The first command regenerates the two arms and plots. The test-suite note records two current failures unrelated to the hook: the existing north-heading assertion conflicts with the adopted heading authority, and a renderer historical-mask cache assertion fails its expected draw count. No test was changed to mask either failure.

For receipt-only repair after a saved CONTROL has already passed conformance, `node scripts/ant-singleton-feedback-sensitivity.js --treatment-only` revalidates that saved fresh-controller CONTROL before building a new fresh TREATMENT controller. The final checked packet uses this path because the first treatment-only exposure encoding did not preserve string ant IDs.
