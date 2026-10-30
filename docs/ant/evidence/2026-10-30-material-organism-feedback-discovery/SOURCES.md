# Source responsibility audit

Production authority: fresh `origin/main@4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785`. Research context: `4742aec15d65869c6d9529e147cdb0ee63cb4b63`. These are different authorities. Source/archive historical hypotheses are not substitutes for current code.

## Implemented organism/world paths

- [AntAgent](../../../../src/lib/agents/ant/AntAgent.js): `turnToward` uses a4.5rad/s cap. Personality `turnResponsiveness` exists but is not used by that method. Acceleration relaxes a Cartesian velocity toward heading×desiredSpeed; changing heading can therefore change realized speed without directly changing a speed target.
- [AntController](../../../../src/lib/agents/ant/AntController.js): tick302 onward pins production material only when slowdown is enabled, then relaxes C/decays chemistry, reads occupancy/local profiles, updates intentions, turns, accelerates and collision-clips movement. Gaster writes use realized observed travel and rear geometry; gait/contact follows that travel. Contacts update C, formation load and stratigraphy. Formation/stratigraphy commit later; activation/recruitment follow current shared chemistry. This ordering makes tick-entry candidate material pinning necessary.
- [LocalOccupancy](../../../../src/lib/agents/ant/LocalOccupancy.js): same-flow classification uses actual velocity/heading and geometry. Following limits pace/headway; other interactions supply separation, predictive crowding and lateral response. The final swept guard clips displacement and protects body contact. This is local flow mechanics, not a relationship graph or social-role law.
- [ColonyActivation](../../../../src/lib/agents/ant/ColonyActivation.js): samples sectors around the existing entry and relaxes evidence over45s, giving a recruitment limit. A local motor change can reach it through ordinary field history. No new material-to-population command is necessary.
- [GaitController](../../../../src/lib/agents/ant/GaitController.js): phase increments by actual distance/native per-ID stride. Alternating tripod groups interpolate touchdown along the observed body segment; leg positions can clip at the observation edge. A per-advance emission cap exists. Native contact strength and per-ID variation are distinct from cadence.
- [SurfaceField](../../../../src/lib/agents/ant/SurfaceField.js), [TrailPlateBirth](../../../../src/lib/agents/ant/TrailPlateBirth.js), [MaterialStratigraphy](../../../../src/lib/agents/ant/MaterialStratigraphy.js): contacts change slow mechanics/load; B/support/repeat gates form immutable native Plates; later stacks/load/Nodules evolve. Under slowdown-Off/residence-Off, these outputs have no separate motor/chemical consumer. B's own later stride read is the mechanical return path.
- [BodyPoseController](../../../../src/lib/agents/ant/BodyPoseController.js) and [GasterDeposition](../../../../src/lib/agents/ant/GasterDeposition.js): actual angularVelocity updates gaster yaw, which changes `gasterRear`. Controller reads that point before/after travel and passes it to deposition. BodyPose's comment excludes movement/sensing/gait/contact inputs; it does **not** imply renderer-only state. Turning can affect source placement through articulation as well as thorax motion. Source amount per travel remains a separate law.

## Candidate responsibilities and source-stage decisions

| Candidate | Distinct responsibility | Decision before natural outcomes |
| --- | --- | --- |
| A angular response | Motor follows the same requested heading with a bounded lower rate ceiling; no material direction cue | Deterministic probe, then actual neutral-state leverage gate before independent screen |
| B stride/contact | Actual sequence/placement of touchdown changes at identical body travel; not a contact-dose multiplier | Deterministic contact/phase probe, then independent mechanical-material screen if actual exposure exists |
| C adherence rise/fade / commitment | New organism-state interpretation of already-read coherent chemistry; fans into turning, exploration, decision timing and source rate | Deliberately defer. Material does not yet mean a more trustworthy route; no extra temporal state needed merely because a coefficient is available |
| D same-flow headway | Direct pair-spacing/flow-capacity conditioning, distinct from individual speed cap | Defer until a material-spacing meaning and actual binding-opportunity question are selected. Do not silently shrink safety/avoidance or imply social roles |
| E hesitation / decision interval | Conditions pausing/inspection or psychological timing; existing pauses already strongly reduce desired speed | Defer for weak material meaning and stall/scheduler risk. No new stochastic trigger |
| F articulation / source geometry | Material changes body posture and hence rear secretion location, distinct from source amount | Recognize real path; defer standalone law. A already exposes this native mediator, so its chemical descendants cannot be assigned only to trajectory |
| F acceleration / traction / collision response | Could change velocity relaxation or slip/contact constraints | Park: no measured traction/slip state or new need. Preserve swept collision safety rather than loosen it to manufacture traffic |
| Contact strength alone | Same contacts with different mechanical write | Already close to the screened compaction-write responsibility; no duplicate strength sweep |

Deferred does not mean rejected by experiment, nor information equivalence. No motion/raw-contact state is introduced as a material field. Current column count is aggregate public history, not calibrated friction, roughness, height or exposed stiffness.

## Evidence read and preserved

- [Canonical current status](../../README.md) and [persistent-world future contract](../../world-model.md); the latter does not claim all feedback exists.
- [Latest residence locality](../2026-10-30-material-chemical-residence-locality/REPORT.md): LOCALITY SUPPORTED only for frozen recipient readouts. Residence remains research-only and Off here.
- [Feedback synthesis](../2026-10-30-material-feedback-space/REPORT.md), [source attenuation](../2026-10-30-material-pheromone-attenuation-screen/REPORT.md), [residence world](../2026-10-30-material-chemical-residence-screen/REPORT.md) and relevant daily records. Their slowed control is not this new neutral baseline.
- Existing Screen1/2 references remain pinned in that synthesis. No20% resistance, compaction shielding or attenuation code is inherited as a treatment.
- [Current-G baseline/adoption](../2026-10-25-g-production-adoption/README.md), [native runner](../../../../scripts/ant-g-production-candidate-natural.js), [late qualified opportunity packet](../2026-10-29-late-qualified-opportunity-capture/REPORT.md): reusable source/data with exact hashes and tick conventions. Max-D/X remain observers, not actual formation.

Independent Max-reasoning source critique confirmed A's body-pose/Gaster path and B's neutral traffic null. It recommended measuring actual response availability rather than inferring world leverage from synthetic target reversals. No archive was opened. Old pre-G natural results are not transferred to these current-G worlds.
