# Material feedback A+D composition — preregistration

## Question and decision

Test whether the already-screened A angular rate ceiling and D same-flow headway can coexist through their existing consumer paths. Primary evidence is same-tick direct-consumer opportunity and response in AD, with N/A/D as frozen references. Do not judge a preferred morphology.

Final interpretation will be one of `COMPLEMENTARY`, `REDUNDANT / MASKED`, `ANTAGONISTIC`, `PATHOLOGICAL`, or `INCONCLUSIVE`, justified from observed distributions and invariants without a post-result numeric cutoff.

## Authority and provenance

- Production authority: `origin/main = 4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`.
- Research parent: `codex/ant-organism-feedback-candidate-survey-20261030@9b5ef8d6247fc3c9d6237d9d0c9082d8c3546a49`.
- New research branch: `codex/ant-material-feedback-ad-composition-20261030`.
- Frozen baseline: current-G/H0, seed `20261005`, 60 Hz, 600 model seconds, Audio Off, production material slowdown Off, chemical residence Off.
- Reuse frozen N/A/D worlds only after their source/input pins, initial state, checkpoint/map receipts and early-position parity match. Execute only one new natural treatment: AD.

The registered mechanisms are unchanged:

```text
A: qA(L) = 1 - .50 * (1 - exp(-L/4)); native 4.5 rad/s turn ceiling is multiplied by qA.
D: hD(L) = 1 + .50 * (1 - exp(-L/4)); native .4 s same-flow headway is multiplied by hD.
```

Both read the public tick-entry local column count. No source, destination, mode selector, shared knob, production slowdown, residence, other candidate, or RNG change is added.

## Direct definitions fixed before AD

One observation unit is an ant movement tick. Record A and D from the same pre-movement state.

- **A direct opportunity:** `L > 0`, same requested heading is passed to native and conditioned `turnToward`, and the conditioned heading differs from its same-state native shadow. Separately record whether the native and conditioned caps would bind, requested heading, both angular rates, and rate suppression.
- **D direct opportunity:** `L > 0`, native `sameFlowAhead` classified a finite following cap, and changing only the .4 s headway changes the final desired-speed target after native crowding, separation, and post-intention hesitation. Retain native/candidate cap and target values, same-flow pair geometry, and actual target-consumer parity.
- **Joint context partition:** `A only`, `D only`, `A and D`, `neither`, classified per ant movement tick by those definitions. Also report whether each one-second interval contains each context. Do not treat `L > 0` alone as active.

No cutoffs beyond exact floating-point equality tolerance already used by the parent probes. No percentile-derived threshold, post-hoc window, or active/inactive mode state will be introduced.

## Run and event windows

Run one AD arm from the exact scenario factory with both research wrappers enabled. Native desired-speed resistance remains Off. Residence and all other candidate laws remain absent. Preserve 40 parent late anchors, raw/checkpoint outputs, contacts, birth masks, 1 Hz context and source/input receipts.

Short-window diagnostics use deterministic earliest occurrences: first A direct opportunity, first D direct opportunity, and first same-ant simultaneous A+D opportunity. Report the containing one-second anchor and following ten seconds where available. These windows describe the combined arm; once A changes movement, they are not claimed to be matched trajectories against A/D-only arms.

## Comparisons

1. **Primary:** AD same-state direct angular and final-target measurements; joint context counts; pair-flow and angular opportunity distributions.
2. **Reference:** previously saved A-only and D-only measurements under the same neutral architecture. Cross-arm frequency differences are descriptive because endogenous states diverge.
3. **Secondary world consequences:** travel, active-ant seconds, speed/turn distributions, zero-displacement runs, same-flow and clearance summaries, FOOT_CONTACT, source/pheromone, C/D, E/F, actual Plate timing/masks, layers, activation and recruitment. Late max-D/X remain observers.

Large map divergence, Plate count, or outward opportunity motion is not a success criterion. Do not use admissions or Plate identity as common lineages after divergence.

## Fixed controls and stop

Verify L=0 identity, exact A/D formula values, no RNG calls from observers, unchanged requested heading and same-flow classification, final-target shadow equals actual target, swept collision guard parity, finite/cap/overlap/population invariants, exact pre-material position parity, exact frozen N/A/D input hashes, deterministic saved-data analysis, and atlas/data agreement if any plot is generated.

Stop after this AD arm and its analysis. No coefficient sweep, additional seed, production 10% interaction, residence, other candidate, UPDATE, allocation, BODY, audio, source change, or production adoption.
