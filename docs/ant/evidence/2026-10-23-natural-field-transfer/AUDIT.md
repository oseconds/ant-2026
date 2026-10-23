# Natural field-to-turn transfer: independent causal source audit

Date: 2026-10-23 KST  
Baseline: 8c60e4bba3bd5b476300e90a2936bfebd1f831c2 (origin/main)  
Scope: read-only pre-experiment audit for the fixed-state production / dtFeedback / dampingOff replay. No simulation, gain search, production edit, or harness change was made.

## Finding

A same-state P/dt/off replay can estimate the one-tick effect of changing the delayed angular-feedback expression conditional on the exact production field raster and the rest of that captured world state. It can trace the local field cue through feedback, requested heading, turn-rate output, velocity and collision-constrained travel. It cannot attribute the same-tick wide-sensor choice to the field: updateIntention() runs before localTurn, so P/dt/off sees identical field reads, decision scores and intent within each frozen state.

It cannot identify the total contribution of field representation. The raster is common input to P/dt/off, and its contents already encode earlier movement, gaster placement, deposition, decay, clipping and cap history. A representation claim needs a separate write/read counterfactual using the same frozen deposition events and poses under an explicitly defined alternative field representation. Comparing naturally grown production and dtFeedback histories does not substitute for that intervention: the histories diverged, and all their downstream state differs.

This agrees with the first-stage boundary in [PLAN.md](PLAN.md): A1 can qualify a conditional movement effect; A2 needs representation intervention and incidence evidence; A3 needs the independent links before combining them; A4 sends unexplained differences to the earliest remaining source-supported stage. The earlier CIC field gate remains failed. Nothing in this audit reopens it.

## Current source path

The relevant order in [AntController.js](../../../../src/lib/agents/ant/AntController.js) is:

1. At tick entry, the controller takes material and gaster-pose snapshots and senses occupancy. It then relaxes the surface field and decays pheromone before reading trail cues (292–304).
2. Every ant gets a local two-depth, three-band trail sample. Local samples use PheromoneField.sample(); the production far sensor is a separate five-offset weighted maximum (AntController.js:554–569, 572–608; [PheromoneField.js](../../../../src/lib/agents/ant/PheromoneField.js):31–47).
3. updateIntention() updates adherence and decrements decision, commitment, inspection and hesitation clocks. The wide sensor is queried only when a decision or commitment expires, or a newly blocked state forces reconsideration. A refreshed choice depends on five heading options, crowding, confidence, adherence, jitter, score noise, exploration and the controller RNG (496–552). Thus a local cue is sampled every tick, but there is no new far-sensor decision on every tick.
4. The local correction uses the just-sampled local steering and the updated adherence, but the previous tick's angular velocity:

    localTurn = clamp(
      localSteering * (0.35 + 0.65 * adherence)
        - clamp(previousOmega, -2.2, 2.2) * 0.65 * adherence,
      -0.45, +0.45
    )

   Intent is blended toward current heading with weight 0.82 * adherence; separation and front crowding can further alter the target. turnToward() limits the actual heading change to 4.5 * dt and writes the new angular velocity ([AntAgent.js](../../../../src/lib/agents/ant/AntAgent.js):37–48; controller 309–338).
5. Desired speed is set from the speed cycle, entry-state front crowding, separation, following cap, hesitation and the tick-entry material snapshot. In a complete same-state one-tick P/dt/off replay, targetSpeed is therefore identical across arms; the changed heading alters the target velocity vector, not the scalar speed target. Later speed targets can diverge after movement changes crowding or other state. accelerateToward() approaches the target vector with a 32 s⁻¹ acceleration or 37 s⁻¹ braking response and caps speed (AntAgent.js:50–74; controller 339–362).
6. Swept occupancy constrains the proposed displacement. The controller scales velocity when constrained and measures the resulting travel (AntController.js:365–385). This is the earliest usable endpoint for a claim about actual movement; body heading alone is insufficient.
7. Only after all ants have sensed and chosen for the tick does the controller advance body pose and deposit from collision-constrained travel. The body-pose/gaster yaw uses the newly written angular velocity and local bands; the gaster rear point is offset and lags the thorax. Deposit quantity is based on thorax travel, while its location follows the gaster path (AntController.js:383–401, 486–494; [BodyPoseController.js](../../../../src/lib/agents/ant/BodyPoseController.js):21–45, 76–85; [GasterDeposition.js](../../../../src/lib/agents/ant/GasterDeposition.js):23–46, 53–96). Those deposits are first sensed on the next tick. TrailPlateBirth then reads the updated field later in the tick (417–420).

The default field is a 96×96 Float32 raster, with 15 s half-life, maximum 8, radius 0.0045 and amount rate 4.5. Segment writes integrate distance slices over a Gaussian support; if no grid node falls inside the support, the dose goes to the nearest node. Reads are bilinear (PheromoneField.js:1–7, 31–47, 54–105, 121–158). The default controller deposition mode is dab, spaced at 0.006 traveled units (AntController.js:49–57; [GasterDeposition.js](../../../../src/lib/agents/ant/GasterDeposition.js):1–3, 10–15). This couples grid phase, body/gaster geometry and sensor values.

## What P/dt/off can identify

For one complete pre-tick state, preserve the exact field array, all ant fields and clocks, RNG state, occupancy inputs, body-pose map, gaster-deposition accumulators, gait state, material/surface/Plate state, activation and spawn schedule, and simulation time. Run the untouched replay first. It must reproduce the same complete endpoint, RNG state/call count and public observations; otherwise the state is not a valid causal replay. The public agent snapshot alone omits intent, confidence, clocks and other state needed for this test.

Under that complete-state null, P/dt/off changes only the feedback expression. Record the local cue term and feedback term separately, then record every subsequent value that already exists in the controller: wide option scores only when a choice is due, local turn, target heading, target speed, current omega, velocity, collision scale and completed displacement. The paired differences identify a one-tick feedback effect at each captured state. They do not identify which field representation should replace production.

The two natural origins in [PLAN.md](PLAN.md) are separate production and dtFeedback histories. Within each origin, P/dt/off are paired from the same frozen state. Across origins, do not call states matched: the policies have different movement, deposits, spawn/RNG histories, fields and material state. In the prior 600 s screen, dtFeedback was close to dampingOff in turn-cap/persistence summaries, yet the three-seed dtFeedback histories also had fewer accepted spawns and Plates and less material union; those are coupled long-run outcomes, not a pure field contrast ([9fcd962 REPORT.md](https://github.com/oseconds/ant-2026/blob/9fcd962/docs/ant/evidence/2026-10-22-spatial-dynamics/REPORT.md); [movement/results.md](https://github.com/oseconds/ant-2026/blob/9fcd962/docs/ant/evidence/2026-10-22-spatial-dynamics/movement/results.md)).

The fixed sampling in the plan is suitable for a bounded descriptive Gate A: seeds 20261005, 20261006 and 20261007; the two policy histories; all ants at 30, 60, 120, 180, 240, 300, 360, 420, 480, 540 and 600 seconds; and strata based only on entry-state adherence, coherence, prior omega, heading, raster phase, crowding and prior travel. This is 66 complete world states before counting ants. Keep every captured case and denominator. Summarize by seed, history and stratum; ants and repeated observations inside one world are not independent replicates. Do not pick a promising route, agent, or window after seeing the branch output.

A1's local-turn decomposition is a mechanical cancellation question, not a route-quality test. It applies to the local sensor branch only. The far decision cue enters intent earlier and is the same in P/dt/off for a frozen state; it needs a field-read counterfactual if its causal contribution to choice is at issue. For each state, compare the signed local sensor correction
u = localSteering × (0.35 + 0.65 × updatedAdherence)
with the production feedback
v = −0.65 × updatedAdherence × clamp(previousOmega, −2.2, +2.2),
then compare clamp(u + v), clamp(u + v × dt) and clamp(u) at the local-turn output, turn actuator and completed travel. Report where the field-derived cue is attenuated, changes sign, or is canceled, including states where it survives. Keep body-heading and travel-angle changes separate. The plan's 1e-9 rad numerical-zero filter is suitable; its word frequently still needs a frozen prevalence rule if it is to produce a binary pass/fail. Otherwise report A1 descriptively, with full denominators and no tuned score.

## Other causes and limits

| Stage | Source-supported alternative | What this replay must preserve or report |
| --- | --- | --- |
| Field to sensor | Local and wide sensors use different footprints and operators. The local cue is a short two-depth balance; the wide cue is a five-point max. Field phase may alter one profile without changing the other. | Preserve both exact call sets and raw values. Do not infer a field failure from a winner alone. |
| Decision clocks | Wide sensing can be stale during a hold; local sensing continues. Inspection can perturb intent and impose hesitation. | Preserve all four clocks and exact RNG state. Mark no-choice ticks rather than treating stale intent as a fresh sensor result. |
| Feedback / actuator | Previous omega is an independently manipulable delayed term. The 0.45 rad local-turn limit and the 4.5 rad/s actuator cap clip later stages differently. | Log raw sensor term, raw feedback, pre/post-local clamp, requested target, actual turn and cap status. Do not give dtFeedback a favorable interpretation in advance. |
| Velocity response | The velocity vector approaches the new heading exponentially, so body turn and travel turn can differ even without a collision. | Record velocity angle/speed before and after accelerateToward(), travel angle and chord. |
| Crowding / collision | Separation and front-crowding alter target heading/speed; swept collision can scale the final displacement and velocity. Front-clear does not exclude lateral or rear effects. | Preserve every ant in occupancy; report exact crowd terms and collision scale rather than discarding constrained samples. |
| Body / gaster | The body pose uses current turn and local bands; gaster yaw/offset changes the writer path. | Preserve private body-pose state and per-ant deposition accumulator, not only the visible agent snapshot. |
| Same-tick field update | All ants read before movement deposits. Deposits occur after collision-constrained travel and are available to the next tick. | Record write events in order. A one-tick replay measures conditional read-side transfer, not recurrent write/read feedback. |
| Downstream material | Tick-entry stratigraphy can change desired speed independently of pheromone. Plate selection reads the just-written field after movement. | Preserve material/surface/Plate state and keep its effects distinct from the one feedback contrast. |

The source contains no explicit curvature sensor. Local steering is a cross-band contrast and the far decision sensor is an ahead-of-body transverse maximum. Sensor geometry, phase, velocity response, sparse decision clocks, body/gaster transformation and collision all remain live explanations if a cue does not reach postcollision travel.

The existing tests cover local steering from prescribed fields, straight-trail following, probabilistic decisions, bilinear sampling, decay, bounded turn rate and exponential velocity response ([ant-trail-following.test.js](../../../../tests/ant-trail-following.test.js):37–64, 109–152; [ant-controller.test.js](../../../../tests/ant-controller.test.js):569–580, 618–629; [pheromone-field.test.js](../../../../tests/pheromone-field.test.js)). They are useful local conformance checks. They do not provide a complete natural-state replay or a writer/read counterfactual, so they cannot resolve A2.

## Gate A and field-representation identifiability

The Gate A output should be a predeclared causal trace, not a visual judgment:

- A1, conditional movement: did a nonzero natural local cue reach the local-turn term, and where did production feedback, the actuator, velocity response or collision reduce or reverse it? Show P/dt/off paired values for every fixed state.
- A2, representation: cannot be established by P/dt/off. It requires fixed deposition events replayed through a separately specified writer and read path, with physical poses, occupancy and RNG held fixed. A no-field read shadow would estimate the present field's read contribution, not the relative merit of a different representation.
- A3, combined links: only after the field-specific write/read contrast and the feedback contrast are separately estimated. A difference between the two naturally grown histories alone is not an interaction estimate.
- A4, residual stages: if the field cue survives production feedback but travel still differs, locate the earliest subsequent divergence in target, actuator, velocity or collision. Do not respond by tuning the field or feedback to an aesthetic outcome.

The prior controlled field probe measured frequent raster-phase sensitivity but failed its preregistered selector gate: 2 of 24 direct-path score-winner pairs changed; the continuous and dab gaster paths each changed 0 of 24. The direct-path fallback brush carried about 46.2% of requested dose in that fixture. The older d0e07d0 controlled real-deposit selector probe had three curved inputs fail at baseX 0.5 and pass after a +0.004 translation. Both show fixture sensitivity; neither estimates natural incidence or representation dominance. The field report therefore correctly did not run CIC and did not recommend a field candidate ([9fcd962 field/REPORT.md](https://github.com/oseconds/ant-2026/blob/9fcd962/docs/ant/evidence/2026-10-22-spatial-dynamics/field/REPORT.md); [d0e07d0 selector/README.md](https://github.com/oseconds/ant-2026/blob/d0e07d0/docs/ant/evidence/2026-10-22-route-curvature-survey/selector/README.md)).

If a later field question is authorized, the minimum useful first contrast is the planned fixed-event default-Gaussian write/read phase challenge. Replay the same ordered dose and decay events for both raster phases; use the same physical poses, occupancy, RNG and query-offset view so the relative source-to-sensor geometry stays fixed. Restrict translated queries to the interior so domain clipping does not become a second treatment. First verify that the production replay exactly reconstructs the captured raster and writes. Do not turn that into a kernel search; any B kernel would need its own protocol. A phase challenge can identify sensitivity under those fixed event histories, not free-running field dominance or ecological validity.

## One conditional discrete-feedback candidate

No additional movement candidate is earned before Gate A. If A1 shows that the existing dtFeedback result is materially censored by the ±2.2 rad/s clamp specifically in high-omega states, the smallest single follow-up is to use the previous realized turn increment rather than the additionally clipped rate:

feedback = −0.65 × adherence × (previousOmega × dt)

At the fixed 1/60 s step, previousOmega is bounded by the existing 4.5 rad/s turn actuator, so this term is bounded by 0.04875 rad before adherence, below the 0.075 rad/tick actuator limit. It changes only the feedback input representation; it does not add state, select a route, or require a gain sweep. It differs from the current dtFeedback shadow only when |previousOmega| > 2.2.

In the stripped fixed-adherence, unsaturated one-step recurrence with constant cue c, the proposed discrete law is
deltaTheta[n] = c − 0.65 × adherence × deltaTheta[n−1].
Its pole is −0.65 × adherence, whose magnitude is at most 0.65 for adherence in [0,1], so this reduced recurrence has a decaying alternating transient. The corresponding production rate-feedback recurrence has approximate pole magnitude 0.65 × adherence / dt = 39 × adherence at 60 Hz before clamps. These are reduced equations, not a stability proof for the controller or world.

A counterexample is sustained same-sign curvature: at constant cue and adherence, the discrete recurrence settles to c / (1 + 0.65 × adherence), attenuating a persistent cue by about 39% at adherence 1. The real loop also has changing sensor profiles, clock-gated intent, local and turn clamps, velocity lag, occupancy, gaster deposition and recurrent field updates. The candidate could therefore reduce oscillation and still suppress the turn the field is asking for. Run it only if A1 establishes the exact clamp limitation, and test both signs plus deposited-field counterexamples under a separately frozen protocol. No candidate is adopted here.

## Source and evidence anchors

- Current state and future boundary: [docs/ant/README.md](../../README.md), [docs/ant/world-model.md](../../world-model.md).
- Current movement and field code: AntController.js:292–420, 486–615; AntAgent.js:37–74; PheromoneField.js:1–158; BodyPoseController.js:17–85; GasterDeposition.js:1–123.
- Required first-stage sampling and Gate A definitions: [PLAN.md](PLAN.md).
- Prior spatial field and movement evidence, read from exact ref 9fcd96205ff8a5c671be26e2e024524c0e9345d1: [REPORT.md](https://github.com/oseconds/ant-2026/blob/9fcd962/docs/ant/evidence/2026-10-22-spatial-dynamics/REPORT.md), [field/REPORT.md](https://github.com/oseconds/ant-2026/blob/9fcd962/docs/ant/evidence/2026-10-22-spatial-dynamics/field/REPORT.md), [field/PROTOCOL.md](https://github.com/oseconds/ant-2026/blob/9fcd962/docs/ant/evidence/2026-10-22-spatial-dynamics/field/PROTOCOL.md), [movement/protocol.md](https://github.com/oseconds/ant-2026/blob/9fcd962/docs/ant/evidence/2026-10-22-spatial-dynamics/movement/protocol.md), [movement/results.md](https://github.com/oseconds/ant-2026/blob/9fcd962/docs/ant/evidence/2026-10-22-spatial-dynamics/movement/results.md).
- Prior route/selector evidence, read from exact ref d0e07d0: [route curvature REPORT.md](https://github.com/oseconds/ant-2026/blob/d0e07d0/docs/ant/evidence/2026-10-22-route-curvature-survey/REPORT.md), [selector/README.md](https://github.com/oseconds/ant-2026/blob/d0e07d0/docs/ant/evidence/2026-10-22-route-curvature-survey/selector/README.md).
- docs/ant/archive/** was not inspected.
