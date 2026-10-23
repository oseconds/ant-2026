import test from 'node:test';
import assert from 'node:assert/strict';
import { routeAt, routeTangent } from '../scripts/ant-route-curvature-probes.js';
import { makeSpatialController } from '../scripts/ant-spatial-core.js';
import { angularFeedbackTerm, measureSpatialMovement, unforcedFeedbackRecurrence } from '../scripts/ant-spatial-movement.js';

function arcSamples(shape, stepCount = 60, distancePerTick = 0.001) {
  return Array.from({ length: stepCount + 1 }, (_, tick) => {
    const station = tick * distancePerTick;
    const point = routeAt(shape, station);
    return { tick, ...point, heading: routeTangent(shape, station),
      speed: distancePerTick * 60, angularVelocity: tick ? (routeTangent(shape, station)
        - routeTangent(shape, station - distancePerTick)) * 60 : 0 };
  });
}

test('movement descriptors preserve signed arc direction while retaining absolute turning', () => {
  const left = measureSpatialMovement('gentle', arcSamples('gentle'));
  const right = measureSpatialMovement('gentleMirror', arcSamples('gentleMirror'));
  assert.ok(left.signedPathTurnRadians > 0.2);
  assert.ok(right.signedPathTurnRadians < -0.2);
  assert.ok(Math.abs(left.absolutePathTurnRadians - right.absolutePathTurnRadians) < 1e-8);
  assert.ok(left.routeTurnSignAgreement > 0.99);
  assert.ok(right.routeTurnSignAgreement > 0.99);
  assert.ok(left.meanAbsoluteCrossTrack < 1e-9);
  assert.ok(right.meanAbsoluteCrossTrack < 1e-9);
  assert.ok(left.chordToPath > 0.99);
});

test('alternating lateral motion cannot look like a sustained arc through absolute turn alone', () => {
  const samples = Array.from({ length: 62 }, (_, tick) => ({ tick, x: tick * 0.0005,
    y: tick % 2 ? 0.001 : 0, heading: 0,
    speed: 0.06, angularVelocity: tick ? (tick % 2 ? 4.5 : -4.5) : 0 }));
  const result = measureSpatialMovement('straight', samples);
  assert.ok(result.absolutePathTurnRadians > 5);
  assert.ok(Math.abs(result.signedPathTurnRadians) < 1e-9);
  assert.equal(result.bodyOmegaReversalFraction, 1);
  assert.ok(Math.abs(result.bodyOmegaLag1Correlation + 1) < 1e-12);
  assert.equal(result.bodyTurnCapFraction, 1);
  assert.ok(result.chordToPath < 0.5);
  assert.equal(result.routeTurnSignAgreement, null);
});

test('movement descriptors reject invalid sample geometry and timestep', () => {
  assert.throws(() => measureSpatialMovement('straight', [{ x: 0, y: 0 }, { x: NaN, y: 1 }]), /finite x\/y/);
  assert.throws(() => measureSpatialMovement('straight', [{ x: 0, y: 0 }, { x: 1, y: 0 }], { dtSeconds: 0 }), /positive finite timestep/);
});

test('dt feedback is exactly one fixed-step conversion and its unforced two-cycle decays', async () => {
  assert.ok(Math.abs(angularFeedbackTerm('production', 2.2, 1) + 1.43) < 1e-14);
  assert.ok(Math.abs(angularFeedbackTerm('dtFeedback', 2.2, 1) + 1.43 / 60) < 1e-14);
  assert.ok(Math.abs(angularFeedbackTerm('dtFeedback', -9, 1) - 1.43 / 60) < 1e-14);
  assert.equal(angularFeedbackTerm('dampingOff', 2.2, 1), 0);

  const production = unforcedFeedbackRecurrence('production');
  const candidate = unforcedFeedbackRecurrence('dtFeedback');
  const off = unforcedFeedbackRecurrence('dampingOff');
  assert.ok(production.every((row, index) => Math.abs(row.realizedTurnRadians) === 0.075
    && Math.sign(row.realizedTurnRadians) === (index % 2 ? 1 : -1)));
  assert.ok(candidate.every((row, index) => Math.sign(row.realizedTurnRadians) === (index % 2 ? 1 : -1)));
  assert.ok(candidate[1].realizedTurnRadians < Math.abs(candidate[0].realizedTurnRadians));
  assert.ok(candidate.at(-1).realizedTurnRadians < Math.abs(candidate[1].realizedTurnRadians));
  assert.ok(off.every(row => row.realizedTurnRadians === 0));

  const { receipt } = await makeSpatialController({ movement: 'dtFeedback' });
  const movementChange = receipt.changes.find(change => change.mechanism === 'movement');
  assert.equal(movementChange.after, 'steeringAngularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence * dt');
});
