# Controlled route curvature probes — 2026-10-22

This package tests what the current production controller can follow under fixed curved-trail cues, whether its angular damping contributes to turn reversals, and how a few forced repeat visits alter a deposited field. These are controlled probes, not observations of natural route choice or biological curvature sensing.

The complete per-tick record, all 156 cases, frozen-grid hashes, controller-shadow receipts and source hashes are in the canonical [controlled-results.json.gz](controlled-results.json.gz). The raw JSON remains local and unselected. The final runner SHA-256 is `e3abb4e67257a94bd3197a389bf55eb9ecda89b0934b37a2c6b6cc7f42aa6f38`; the raw JSON is 28,396,187 bytes with SHA-256 `9615a86610e651753e89b3abea0a2a15527f26af6a12b63d86dc21f348b19578`. The gzip is 4,351,690 bytes with SHA-256 `56378c7dc975bc6e5ea0c42a57acfc27369f6eb52458c3096a3be46022bb9bd6`; decompression reproduced the raw JSON byte-for-byte.

Reproduce from the repository root in a fresh checkout, where the local raw `controlled-results.json` does not exist. The runner writes that local raw path; do not overwrite an earlier raw capture in the research working directory.

```powershell
node tests/ant-route-curvature-probes.test.js
node scripts/ant-route-curvature-probes.js
```

The test file passed when run directly. An initial sandbox worker launch returned `spawn EPERM`; the parent subsequently ran the normal Node test runner with approved process permissions. The final focused suite passed 13/13; the full suite passed 347/347. Logs are in `../validation/`. The experiment runner completed and its source guards confirmed that every captured source file stayed unchanged during execution.

## Production loop used

The probe imports the exact `AntController`, `AntAgent`, `PheromoneField` and `GasterDeposition` sources. One initialized ant executes production `tick(1/60)` calls. The public state normalizer floors population count at eight, so this explicit fixture sets the controller's internal population count to one immediately after `init()`, turns activation feedback off, clears the scheduled spawn and asserts at most one agent after every tick. This suppresses recruitment while leaving the production movement and field path unchanged. No production source file is patched.

The causal order in `AntController.tick()` is: decay the trail field; sample local trails; update intention, including the wider `senseTrail()` probes; calculate local turn and call `turnToward()`; accelerate and collision-constrain movement; advance body pose; then deposit from observed post-collision travel. A deposit from the current movement is therefore available to sensing on the next tick, not earlier in that same tick. The exact damping expression is:

```text
localTurn = clamp(
  localTrail.steering * (0.35 + 0.65 * trailAdherence)
  - clamp(previousAngularVelocity, -2.2, 2.2) * 0.65 * trailAdherence,
  -0.45, +0.45
)
```

The controller blends intention toward the current heading with weight `0.82 * trailAdherence`, adds `localTurn`, and `AntAgent.turnToward()` caps heading change at 4.5 rad/s. Dynamic deposits use the production multiplier `0.5 * (0.75 + 0.25 * localStrength) + reinforcementGain * adherence²`, with the default reinforcement gain 5. See `AntController.js:292-390`, `AntController.js:496-606`, and `AntAgent.js:38-52`; the JSON records source hashes and the exact source-guarded shadow substitutions.

As a theory-only diagnostic, dropping all clamps and other coupled terms gives a per-tick coefficient `-(0.65 * adherence / dt) = -39 * adherence` at 60 Hz; its magnitude crosses one near adherence 0.0256. Production clamps previous angular velocity to ±2.2, local turn to ±0.45 rad, and actual heading change to ±0.075 rad/tick, while trail sensing and intention also change. The linearized expression is a reason to inspect two-cycle turns, not a proof of full-loop instability.

## Fixed fixtures

All passes used 60 Hz, three repeatable seeds (19, 61, 193), the one-agent fixture described above, entry `(0.35, 0.5)` with a 0.004-unit left-normal offset, tangent-aligned heading, and 0.08 initial velocity. Capability passes lasted 3 s; one-encounter and repeat visits lasted 2 s. The six geometries were straight, circles with radii 0.25 and 0.10, their mirrored orientations, and a synthetic sine S-curve `y = 0.018 sin(2πu / 0.32)`. The S-curve is a fixture only and makes no biological claim.

Capability used either no trail, a frozen analytic Gaussian with peak 0.5 and sigma 0.0025 (the fixed profile from `tests/ant-trail-following.test.js`), or a frozen field built by production `PheromoneField.depositSegment()` on its actual 96×96 grid. Deposited sources used rate 4.5 and radius 0.0045. The grid cell pitch is `1/95` normalized units, larger than the deposit radius. Baseline and `dampingOff` were compared on matched seeds for the analytic and deposited cues. The separate one-encounter probes compared baseline, `dampingOff`, `blendOff` and `scoreOff` on the two positive-curvature circles; the mirrored circles received baseline and `dampingOff` only.

The repeat-feedback stage used positive-curvature circles only. Its initial field treatment was preserve, straighten, split by omitting reference stations 0.08–0.15, or add a fixed sinusoidal offset of one deposit radius (0.0045) at wavelength 0.112. Each ant then made three forced revisits from the same entry and tangent with a reset pose, velocity, adherence, confidence and random stream. The actual trail field remained active and continued to decay and receive production deposits across visits. `dampingOff` was also run for the preserve treatment only. Forced re-entry is an intervention, not natural revisitation.

Field ridges were measured without screenshots: at each 0.002-unit reference station, the probe takes the maximum production field sample across a fixed ±0.24-unit cross-section. It records coverage at the production local-trail half-saturation threshold 0.018, component count, longest below-threshold gap, and signed/absolute ridge offset. This is a geometric projection onto the chosen reference route; it does not classify a biological route.

## Findings

With the smooth frozen cue, production baseline repeatedly reversed its body turn direction and failed to stay close to all tested curved paths. `dampingOff` was a source-guarded intervention that zeroed only the angular-velocity damping term; the remaining controller, field, movement and random draw sites stayed in place. Across the three seeds, these are mean absolute cross-track distances and the fraction of ticks at the 4.5 rad/s heading cap:

| Fixed route | Baseline cross-track / cap | Damping off cross-track / cap |
| --- | ---: | ---: |
| Circle R = 0.25 | 0.0281 / 84.3% | 0.0016 / 1.9% |
| Circle R = 0.10 | 0.0486 / 87.6% | 0.0027 / 4.6% |
| Mirrored R = 0.25 | 0.0325 / 88.2% | 0.0014 / 2.8% |
| Mirrored R = 0.10 | 0.0569 / 83.0% | 0.0013 / 3.3% |
| Synthetic S-curve | 0.0327 / 87.6% | 0.0015 / 1.7% |

Baseline per-tick body-turn lag-1 correlation was −0.89 to −0.97 for those smooth cues, with adjacent nonzero turn signs reversing on 92.7–97.6% of pairs. With damping off, lag-1 correlation ranged from −0.10 to +0.60 and reversals fell to 3.0–12.5%. Mean speed stayed about 0.082 normalized units/s and survival was 100% in both variants. Thus the smooth cue demonstrates controller capability under an idealized field and a strong damping-linked oscillatory failure mode; it does not establish that real deposited trails have that smoothness.

The realized path turns separate net curvature from wiggle. Over the full 3 s R = 0.10 pass, baseline mean signed path turn was 0.420 rad while mean absolute path turn was 3.892 rad. With damping off those were 2.546 and 2.566 rad. The large baseline absolute turn is not evidence that the ant followed the arc: opposite-direction turns mostly cancel in the signed net.

The 96×96 deposited fields gave a different result. Baseline mean absolute cross-track was 0.0176 on the positive R = 0.25 arc and 0.0463 on R = 0.10; mirrored values were 0.0627 and 0.0809. With damping off, these became 0.0036, 0.0060, 0.0552 and 0.0634, respectively. Turn-cap saturation and alternating body turns decreased strongly under damping off, but tracking and progress remained seed- and orientation-sensitive. The synthetic S-curve moved from 0.0356 to 0.0602 mean cross-track when damping was off. On mirrored arcs, damping off reduced oscillation more reliably than reference error. This separates a damping-linked turn oscillation from field-selection failure and shows why the smooth-field improvement cannot be transferred directly to deposited fields.

The paired one-encounter shadows support that separation. On the positive R = 0.25 deposited field, mean cross-track was 0.0081 for baseline, 0.0035 for damping off, 0.0084 for blend off and 0.0081 for score off. On R = 0.10 it was 0.0212, 0.0064, 0.0205 and 0.0212. Damping off reduced turn-cap saturation (95.0% to 6.1% on R = 0.25; 91.4% to 14.2% on R = 0.10) and adjacent turn reversals, with similar improvement in cross-track for these positive arcs. The blend and score results are limited to these fixtures and three seeds; they do not establish general irrelevance of either term.

Three forced dynamic visits altered thresholded ridge structure in treatment-dependent ways. Means below use three seeds; full per-seed values are in the JSON.

| Route / source treatment | Initial field: coverage, components, longest gap, abs offset | After visit 3: coverage, components, longest gap, abs offset |
| --- | --- | --- |
| R = 0.25 preserve | 99.6%, 1, 0.002, 0.002 | 99.1%, 1, 0.002, 0.003 |
| R = 0.25 straighten | 76.6%, 1, 0.102, 0.033 | 75.8%, 1, 0.104, 0.031 |
| R = 0.25 split | 84.4%, 2, 0.070, 0.002 | 94.7%, 1.67, 0.021, 0.003 |
| R = 0.25 noisy | 100%, 1, 0, 0.003 | 99.1%, 1, 0.002, 0.005 |
| R = 0.10 preserve | 100%, 1, 0, 0.063 | 100%, 1, 0, 0.067 |
| R = 0.10 straighten | 73.2%, 2, 0.094, 0.094 | 73.2%, 2, 0.094, 0.090 |
| R = 0.10 split | 85.3%, 2, 0.068, 0.073 | 91.3%, 2, 0.040, 0.073 |
| R = 0.10 noisy | 100%, 1, 0, 0.068 | 100%, 1, 0, 0.070 |

Repeated deposits partly filled the R = 0.25 split gap, reducing its mean longest gap from 0.070 to 0.021; the R = 0.10 split gap reduced from 0.068 to 0.040 and remained two components in all three seeds. Other treatments changed less over three visits. Preserve fields remained one thresholded component; the tight-circle offset was already large before visits because of the coarse grid. These observations show that exact deposit/sense/reinforcement can modify a fixed starting field in a few forced passes. They do not establish cumulative natural route reinforcement, stable route copying, or long-term material formation.

In the preserve repeat probe, damping off again changed turn dynamics: for R = 0.25 mean cross-track was 0.0089 baseline versus 0.0031 damping off, cap fraction 97.0% versus 5.1%; for R = 0.10, cross-track was 0.0233 versus 0.0048 and cap fraction 94.2% versus 9.8%. The three-visit horizon, forced reset and coarse field limit interpretation.

## Limits and interpretation

- The analytic cue is an idealized static function, not a calibration of the actual deposited field. The grid pitch is more than twice the deposit radius, and mirror probes show substantial orientation sensitivity.
- The runs keep `senseLocalTrail()` and the wider `senseTrail()` intention probes active together. They provide partial evidence that the combined loop can follow an ideal smooth cue when damping is removed, but do not establish local-sensor dominance. No isolated sensor response-versus-angle assay was run; the wider sensor's curvature-following contribution remains inconclusive.
- Only one ant, three seeds, fixed entry/tangent, and 2–3 s passes were tested. No natural return or free selection of the curved source was tested.
- The repeated-visit stage resets the ant but intentionally retains and decays the environment. Its outcomes are controlled deposit/sense/reinforcement feedback, not evidence for how often ants would revisit a route.
- Heading and realized displacement were both measured. Mean absolute heading-to-displacement error stayed small (roughly 0.008–0.039 rad in frozen cue passes), but reference cross-track could still be large; close body/velocity alignment does not mean close route tracking.
- No biological curvature-sensing claim, source-radius threshold, or production tuning follows from this probe. The evidence motivates a separate controlled follow-up on grid sampling/selection before any behavior change.
