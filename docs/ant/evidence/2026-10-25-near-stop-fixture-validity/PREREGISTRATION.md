# Isolated-ant near-stop fixture validity

## Frozen question

The seed-240 failure in the G production-candidate review may be an active movement regression, a shared-RNG path with no hesitation episode, or a test that keeps sampling an ant after the controller retires it. This pass separates those cases. It does not change the field, movement law, hesitation constants, or production source.

## Provenance and scope

- G candidate parent: `2df9fbfcaf6563157af0b3266b1089a9d8424c7a`.
- Production main reference: `8c60e4bba3bd5b476300e90a2936bfebd1f831c2`.
- Comparison fields use the same controller and fixture, with only `PheromoneField` dimensions set to 96 (C) or the default 316 (G).
- Seeds: 9, 52, 240; 3,600 ticks at 60 Hz; the existing test's warm-up exclusion remains `tick <= 300`.
- The existing test assertion and random stream are reproduced before any test edit. A counting wrapper returns each seeded RNG value unchanged and records calls; no additional draw is made.

## Frozen measurements

For every tick, record active membership before/after the tick, position, velocity-derived speed, preferred speed, heading, angular velocity, inspection/hesitation/decision/commitment clocks, local strength, adherence, trail confidence, and the original near-stop/moving predicates. The observed local strength is captured from the controller's existing `senseLocalTrail` invocation; it is not sampled a second time.

- A hesitation start is an inspection transition that raises `hesitationRemaining` from no active episode (`<= dt` before the tick) to a positive duration after `updateIntention`.
- An inspection opportunity is a tick-entry inspection clock at or below `dt` while the ant is in the controller's entry set.
- A decision reschedule is the observed decision clock increasing above its decremented pre-tick value.
- Retirement time is the first post-tick state where the referenced ant is absent from `controller.agents`.
- The old test's post-warm-up samples use its exact predicate boundary (`tick > 300`). Report samples while present separately from samples after removal; do not infer movement from the stale object.

## Controlled contract probes

Run the existing production controller law against both 96 and 316 fields. First, a scripted RNG supplied only after initialization forces one inspection event while decision clocks remain open; verify the authored 1.2–3.6 s next inspection interval and 0.7–1.5 s hesitation duration. Second, initialize ordinary forward velocity and set only the existing hesitation clock to a valid positive duration; verify the target-speed computation includes the 0.05 multiplier, actual speed crosses below `0.15 × preferredSpeed`, and speed later exceeds `0.6 × preferredSpeed`. No method such as `accelerateToward()` is stubbed.

## Decision rules

- **TEST CONTRACT OVER-SPECIFIED** only if the failure is explained by post-retirement sampling or by a stochastic path with no hesitation start, both controlled probes pass under G, and the existing passing G seeds still show natural near-stops and resumed movement while active.
- **G BEHAVIOR REGRESSION CONFIRMED** if a live G ant receives ordinary hesitation episodes but those episodes systematically fail the existing near-stop behavior.
- **INCONCLUSIVE** if lifecycle, RNG preservation, or mechanism separation cannot be established.

If and only if the first rule is supported, replace the stochastic assertion with focused scheduler/braking/resumption contract tests. Do not change constants or production source. Then run focused controller tests, full `npm test`, and `npm run build`.
