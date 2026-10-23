import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const CONTROLLER = new URL('../src/lib/agents/ant/AntController.js', "file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-spatial-core.js");
const OMEGA = 'steeringAngularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence';
const HEADING = 'SPAWN_HEADING + signed(this.random) * SPAWN_HEADING_SPREAD';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, `Expected one production expression: ${before}`);
  return source.replace(before, after);
}

/** Research-only composition. Each nonbaseline mechanism has an explicit independent receipt. */
export async function makeSpatialController({ movement = 'production', field = 'production',
  recruitment = 'north', instrumentFeedback = false } = {}) {
  assert.ok(['production', 'dtFeedback', 'dampingOff', 'rawDisplacement'].includes(movement));
  assert.equal(field, 'production', 'No field alternative passed the advance gate.');
  assert.ok(['north', 'isotropic', 'flow'].includes(recruitment));
  assert.ok(!instrumentFeedback || movement === 'rawDisplacement', 'only rawDisplacement has an instrumented source arm.');
  const source = await readFile(CONTROLLER, 'utf8'), changes = [];
  let transformed = source;
  if (movement !== 'production') {
    const replacement = movement === 'dtFeedback' ? `${OMEGA} * dt`
      : movement === 'rawDisplacement' ? 'agent.angularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence * dt' : '0';
    transformed = replaceOnce(transformed, OMEGA, replacement);
    changes.push({ mechanism: 'movement', before: OMEGA, after: replacement });
    if (movement === 'rawDisplacement') {
      const clampDeclaration = "            const steeringAngularVelocity = clamp(\n                agent.angularVelocity,\n                -2.2,\n                2.2\n            );\n".replaceAll('\n', source.includes('\r\n') ? '\r\n' : '\n');
      transformed = replaceOnce(transformed, clampDeclaration, '');
      changes.push({ mechanism: 'remove-extra-feedback-clamp', before: clampDeclaration, after: '' });
    }
  }
  if (movement === 'rawDisplacement' && instrumentFeedback) {
    const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
    const localTurnMarker = "            const localTurn = clamp(\n".replaceAll('\n', lineEnding);
    const traceInsertion = "            this.qualificationFeedbackTrace ??= [];\n            this.qualificationFeedbackTrace.push({ id: agent.id, previousOmega: agent.angularVelocity,\n                adherence: agent.trailAdherence,\n                feedbackRadians: -agent.angularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence * dt });\n            const localTurn = clamp(\n".replaceAll('\n', lineEnding);
    transformed = replaceOnce(transformed, localTurnMarker, traceInsertion);
    changes.push({ mechanism: 'feedback-trace-instrumentation', before: localTurnMarker, after: traceInsertion });
  }
  transformed = replaceOnce(transformed, HEADING, 'this.spatialRecruitmentHeading(this.random(), { x, y })');
  changes.push({ mechanism: recruitment === 'north' ? 'heading-observer-only' : 'recruitment',
    before: HEADING, after: 'this.spatialRecruitmentHeading(this.random(), { x, y })' });
  transformed = transformed.replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, CONTROLLER).href}'`);
  const { AntController: Base } = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`);
  const { measureOutgoingFlow, flowRecruitHeading } = await import('file:///C:/Users/5dudt/Documents/Github/ant-2026/scripts/ant-spatial-recruitment.js');
  class SpatialController extends Base {
    constructor(options = {}) {
      super(options);
      this.spatialObserver = {};
      this.spatialTick = 0;
      this.spatialDt = 1 / 60;
      this.spatialSegments = [];
      const advance = this.gaitController.advance.bind(this.gaitController);
      this.gaitController.advance = (agent, travelled, dt, time, segment) => {
        const result = advance(agent, travelled, dt, time, segment);
        if (segment) this.spatialSegments.push({ id: agent.id, from: { ...segment.from }, to: { ...segment.to },
          heading: agent.heading, angularVelocity: agent.angularVelocity, trailAdherence: agent.trailAdherence,
          vx: agent.vx, vy: agent.vy, travelled });
        return result;
      };
    }
    spatialRecruitmentHeading(U, position) {
      const flow = measureOutgoingFlow(this.spatialSegments, { dt: this.spatialDt });
      const heading = recruitment === 'north' ? -Math.PI / 2 + (U * 2 - 1) * 0.3
        : recruitment === 'isotropic' ? -Math.PI + 2 * Math.PI * U : flowRecruitHeading(flow, U);
      this.spatialObserver.onSpawn?.({ tick: this.spatialTick, time: this.simulationTimeMs / 1000,
        id: `ant-${this.nextAgentId - 1}`, U, ...position, heading, flow, policy: recruitment });
      return heading;
    }
    tick(dt) {
      this.spatialTick += 1;
      this.spatialDt = dt;
      this.spatialSegments = [];
      super.tick(dt);
      const flow = measureOutgoingFlow(this.spatialSegments, { dt });
      this.spatialObserver.onTick?.({ tick: this.spatialTick, dt, flow, segments: this.spatialSegments });
    }
  }
  return { Controller: SpatialController, transformedSource: transformed, receipt: { movement, field, recruitment,
    productionControllerSha256: hash(source), transformedControllerSha256: hash(transformed), changes,
    timing: 'Flow uses current tick completed postcollision movement before end-of-tick accepted heading. Init has no segments. Observer emits after tick; newborns supplied no movement to their own spawn.',
    fieldChange: null } };
}
