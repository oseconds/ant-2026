# Route-curvature source audit

Read-only source audit at `8c60e4bba3bd5b476300e90a2936bfebd1f831c2` (`codex/ant-route-curvature-survey-20261022`). This audit wrote only this file; no tests were run. The existing untracked founder/visual survey material was left untouched. `docs/ant/archive/**` was excluded.

## Main finding

There is no single “route curve” in this code path. The controller turns a desired heading into velocity and thorax travel; the gaster converts that travel into a rear secretion path; a coarse field stores and resamples it; `TrailPlateBirth` later thresholds, skeletonizes and prunes the accumulated history. A smooth curve can be weakened at any one of these representations. Measure thorax path, rear deposit path, sensed field and born Plate separately before assigning the loss to “adherence.”

The strongest source-level control concern is the previous-angular-velocity term in `AntController`: it is applied as an opposing *heading offset* before a tight per-tick turn-rate limit. It can consume a full tick of allowed turn at modest angular rates. This makes it a good first falsifiable probe, not a proven cause; current local-field and intent signals may counter it.

## Responsibility map

### Direction choice, hold and local steering

**Code fact.** `AntController.updateIntention` evaluates five headings at offsets `[-0.92, -0.47, 0, 0.47, 0.92]` from the current body heading. Candidate-heading jitter is ±`0.06 × (1 - 0.8 P)` radians, where `P` is pre-choice persistence; it can be as large as ±0.06 at `P=0` and ±0.012 at `P=1`. Each candidate samples pheromone 0.042 ahead over five lateral points spanning ±0.014 and keeps the weighted maximum. Its score is Hill-response trail attraction × individual sensitivity × 2.8, minus directional crowding × 3.2, plus a center-heading penalty, plus score noise. Selection is softmax-weighted, except the exploration branch chooses one of the five options uniformly. See `AntController.js:496–569`, especially `520–551` and `554–569`.

Directional confidence is `max(response) - min(response)` across the five options; absolute field level is not confidence. Current confidence is the maximum of that contrast and local adherence. At confidence 1, exploration still ranges from 4% to 6.8% across the configured personality values and score noise is still ±0.0315. Candidate jitter is based on the *pre-choice* persistence used before fresh directional contrast is calculated, so fresh confidence 1 does not guarantee ±0.012 jitter on that same choice. At low confidence, exploration can reach 40.8% and score noise ±0.21; low pre-choice persistence permits ±0.06 jitter. The controller returns early only while both countdowns remain positive and the ant is not newly blocked; it reconsiders as soon as either expires, or immediately if newly blocked. The far directional sensors therefore remain stale during a hold; their new readings are not consulted every movement tick. The decision interval is about 0.20–0.91 s and the commitment interval about 0.24–1.20 s, so the effective hold is the shorter clock. Inspection can also perturb intent by up to ±0.24 radians at low persistence every 1.2–3.6 s, with probability 0.23, and then impose a 0.7–1.5 s near-stop.

Local steering is different from candidate choice. Every tick samples left/center/right profiles at forward distances 0.016 and 0.028, each with a small lateral footprint. Strength uses the geometric mean of the two profile peaks; coherence is the weaker profile’s contrast after penalizing split side peaks; steering is bounded balance × strength × 0.45 radians. Adherence follows strength × coherence with a 0.25 s rise and 1.8 s fade. See `AntController.js:572–615`.

**Hypotheses, not demonstrated.** Five sparse candidate angles and a peak-only far sensor do not explicitly estimate path curvature or minimize a curvature-continuity error. Smooth sub-degree changes depend on the center candidate’s small jitter and the local profile correction; a needed larger change can select ±0.47/±0.92 and then be held. A curve that weakens either local profile can lose adherence even when the route remains nearby, because the two-depth strength is a geometric mean and coherence takes the weaker profile. The existing straight-line centering tests do not settle these cases.

### Angular-rate feedback and actual travel

**Code fact.** Tick order is: sense occupancy; decay the field; sample local profiles; update adherence/intent; compute local turn; call `turnToward`; update velocity; constrain collisions; integrate position. `localTurn` uses the current tick’s sampled local profile and newly updated adherence, but uses `agent.angularVelocity` from the preceding tick because `turnToward` writes the new value later in the same tick. See `AntController.js:292–338`.

The local-turn expression is:

```text
clamp(localSteering * (0.35 + 0.65 A) - clamp(previousOmega, -2.2, 2.2) * 0.65 A,
      -0.45, 0.45)
```

It is added to a blend that keeps `0.82 A` of the current heading and only `1 - 0.82 A` of intent. `AntAgent.turnToward` then limits the heading change to `4.5 * dt` radians and stores the realized `turn / dt` as angular velocity. See `AntController.js:314–338` and `AntAgent.js:37–48`.

At the production 60 Hz step, the turn limit is 0.075 rad/tick. The velocity-feedback component alone reaches that magnitude at `|previousOmega| = 0.075 / (0.65 A)`: 0.115 rad/s at `A=1`, or 0.231 rad/s at `A=0.5`. At `A=1`, it reaches the local-turn ±0.45 rad clamp at about 0.692 rad/s. These are derived thresholds, not observed run measurements. Intent or local trail steering may offset the term, so they do not prove that it reverses a real route. They do show why a “damping coefficient” cannot be assessed by looking only at `4.5 rad/s`: the negative feedback is converted to a heading target offset first and may saturate the one-tick actuator.

`turnToward` does not move the ant directly. `accelerateToward` relaxes its velocity vector toward the new heading with fixed responses 32/s accelerating and 37/s braking; position then advances from velocity, not heading. Thus measured thorax curvature can lag both intent and body heading. The nominal per-ant `turnResponsiveness`, `acceleration` and `damping` personality fields are created in `AntAgent.js:16–24` but have no reads in the ANT source; actual turn, acceleration and braking constants are shared (`AntAgent.js:37–74`). Do not attribute between-ant curvature differences to those three traits.

**Hypothesis.** The lagged negative term is the highest-priority candidate for suppressing or alternating a sustained turn, especially once adherence is high. Velocity relaxation is a separate, likely smaller smoothing/lag term. The one-tick delay itself is 16.7 ms at production step and should not be conflated with the 0.65 gain. Log previous omega, current target, realized omega, velocity direction and position curvature to distinguish them.

### Deposition path and field resolution

**Code fact.** Controller defaults are a 96×96 field, radius 0.0045, distance dose 4.5, reinforcement gain 5 and deposition mode `dab` (`AntController.js:49–58`; `PheromoneField.js:1–6`). The controller samples local/far cues from the field before movement and writes deposits after the new displacement. Actual traveled thorax distance determines dose; the secretion point is the gaster rear. `BodyPoseController` counter-rotates and relaxes gaster yaw with a 0.45 s time constant (`BodyPoseController.js:21–44`), and `gasterRearPoint` puts the default rear tip about 0.0258 normalized units behind the thorax (`BodyPoseController.js:76–86`; derived from current defaults). This changes the field path geometry without feeding back into movement heading directly.

In `dab` mode, `GasterDeposition` emits point dabs every 0.006 traveled units and interpolates their position along the segment between sampled rear points; dose is conserved from thorax travel. Retirement flushes partial dose at the final rear point. See `GasterDeposition.js:23–45`, `58–96`, `99–114`; controller wiring is `AntController.js:299–304`, `357–389`, `487–493`.

**Hypothesis (unresolved).** During a sustained turn, the lagged gaster yaw plus its rear offset may make rear-point curvature differ from thorax curvature before the field rasterizer is involved. Source establishes the pose lag and transform, not the magnitude or direction of any curvature-metric loss. Compare thorax and rear-point paths under the same controlled arc before attributing a wide bevel or smoothing to field resolution.

`PheromoneField.depositBrush` normalizes a Gaussian over grid cells within the requested radius, but if no grid point lies in that radius it puts the entire dab in the nearest cell (`PheromoneField.js:121–157`). With spacing `h = 1/95 = 0.010526` and default radius 0.0045, the support is smaller than a cell step and smaller than the maximum nearest-grid distance 0.00744. For uniformly phased interior points, circle-area geometry predicts about 42.6% of points fall in a grid cell’s nearest-node square but outside its radius, triggering the fallback. This is only a geometric estimate; actual dab positions are correlated along trajectories and must be counted. Sampling later is bilinear (`PheromoneField.js:31–46`), which smooths the query but does not undo one-cell write quantization.

**Hypothesis.** The production radius / grid / dab spacing combination can create subcell-phase and orientation-dependent sensor contrast. That could make a smooth deposited curve appear locally broken or asymmetric to the controller. It is not established by the existing tests: the point-brush test uses a larger radius; the narrow-route comparison checks occupied-cell count and decay; the deposition dose test confirms dose conservation while explicitly allowing different spatial distributions. None measures fallback frequency or sensor scores over a curved trail at multiple subcell phases. Also inspect field saturation: cells clamp individually at `maxValue=8`, while the steering response is already steep near 0.035, so dose conservation does not guarantee preserved directional contrast in heavily repeated cells.

### Occupancy, speed and lifecycle

**Code fact.** Nearby non-following agents contribute separation, candidate crowding and front/side avoidance; same-flow agents primarily constrain speed. Those forces can override the pheromone-derived target, and the swept collision guard scales colliding displacement and velocity without rotating the path (`LocalOccupancy.js:20–119`, `122–165`; `AntController.js:329–377`). Body position still comes from the velocity vector after separation and collision scaling. Agents can exit the field and are retired; route windows ending at turnover/boundaries are censored observations, not proof that a turn stopped (`AntController.js:365–390`, `AntController.js:378–386`).

**Hypothesis.** Crowding can erase or interrupt curvature in a colony run even if an isolated agent tracks it. It should be excluded from the first control probe, then included only as a later comparison if natural population behavior is the target.

### Plate selection is downstream of route formation

**Code fact.** `TrailPlateBirth` updates a 96×96, 20 s chemical-memory field once per simulated second, intersects thresholded chemical memory with support ≥0.015, then skeletonizes the mask (`TrailPlateBirth.js:1–19`, `49–67`, `190–239`, `332–344`). It only considers 8-connected components reaching both a source annulus around `(0.5, 0.72)` at radii 0.055–0.115 and an observation boundary within 0.05. It uses deterministic shortest paths, requires geodesic length ≥0.30, includes qualifying source-to-boundary branches, and rasterizes a width-bounded ribbon; short dead-end twigs do not become modeled area (`TrailPlateBirth.js:332–429`, `559–575`). Candidate similarity must remain ≥0.6 to accrue 20 s stability (`TrailPlateBirth.js:68–79`, `95–106`).

This selector cannot change an ant’s movement path. It can remove or simplify a curve when the outcome being judged is a Plate: loops or interior curves with no source-to-boundary route are ineligible; short branches are pruned; an 8-neighbor skeleton and 96-grid ribbon quantize the retained geometry; changing candidate shape can reset persistence. The 2026-10-08 morphology diagnosis separately reported source/boundary eligibility and pruning as its strongest observed Plate-selection restriction, with earlier movement and chemical filtering also present. That is prior diagnostic evidence, not a new current-run measurement. `tests/trail-plate-birth.test.js` mainly exercises a straight ridge and short-twig pruning; it does not validate a curved route’s shape retention.

## Existing coverage and evidence boundary

`tests/ant-trail-following.test.js:37–63` checks mirrored centering on a straight trail; `119–152` checks several seconds of narrow straight-trail following; `154–188` checks stochastic departures at high adherence. `tests/ant-controller.test.js:331–369` checks probabilistic attraction over repeated choices; `569–580` checks the turn-rate and velocity-response limits. These tests verify useful local rules but do not exercise sustained smooth curvature end-to-end. `tests/ant-morphology-movement.test.js` uses supplied synthetic trajectories to check metric classification, not production route generation.

The earlier founder survey report at `046b21c` says the continuing-heading condition affected macro spatial distribution and fixed-position responsibility was untested. That result is context for why initial/ongoing heading deserves control; it does not locate the current curvature loss or prove the production mechanism. The current spawn also uses a shared center and near-north heading with ±0.3 rad spread (`AntController.js:39–47`), so preserve identical spawn/heading inputs in any matched comparison.

## Smallest useful falsifiable probes

1. **Controller-only curved-trail A/B.** One ant, no peers or boundary, production 60 Hz, matched initial speed/heading and a deterministic smooth analytic trail field whose sampling is independent of the ant’s own deposits. Use a straight control plus mirrored left/right constant-curvature arcs; test one broad and one tighter radius. Replay the same RNG values. Compare baseline against a diagnostic shadow changing only the `-previousOmega × 0.65 × A` term to zero. Log `A`, local bands/balance, intent, previous/current omega, target heading, velocity angle, thorax coordinates and cross-track error each tick. A repeatable reduction in signed path curvature or new alternating omega under baseline, reversed by that one-term contrast, supports this mechanism; a null result demotes it for those radii.

2. **Fixed-path deposition replay.** Take one recorded smooth rear-point/dose sequence and deposit it with production dab/radius settings into the default field. Count fallback events directly from the nearest-grid distance and sample all production sensor locations along that same frozen path. Repeat the identical path translated by half-cell phases and mirrored/rotated. Compare raw field and sensor scores against a smooth analytic reference. This isolates the field raster from steering; do not infer a feedback effect from this replay alone.

3. **Only if the visible loss is in Plates:** feed the same curved chemical/support mask through the current selector and record input mask, supported mask, skeleton, retained network, principal path and ribbon. Keep source/edge/length/persistence rules unchanged. This locates selection loss without changing movement or birth rules.

No probe above has been run in this audit. No production cause is selected here.
