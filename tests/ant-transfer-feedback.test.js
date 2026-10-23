import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQualificationTools, clampLocalTurn, feedbackTerm, strippedRecurrence } from '../scripts/ant-transfer-feedback.js';

test('raw previous-turn feedback is the clamped dt law below 2.2 rad/s and bounded by the turn actuator', () => {
  for (const omega of [-2.2, -1, 0, 1, 2.2]) {
    assert.equal(feedbackTerm('rawDisplacement', omega, 0.8), feedbackTerm('dtFeedback', omega, 0.8));
  }
  assert.ok(feedbackTerm('rawDisplacement', 4.5, 1) < feedbackTerm('dtFeedback', 4.5, 1));
  assert.ok(Math.abs(feedbackTerm('rawDisplacement', 4.5, 1)) <= 0.04875 + 1e-15);
  assert.equal(feedbackTerm('dampingOff', 4.5, 1), 0);
  assert.equal(clampLocalTurn(0.8), 0.45);
  assert.equal(clampLocalTurn(-0.8), -0.45);
  assert.throws(() => feedbackTerm('rawDisplacement', Number.NaN, 1), TypeError);
});

test('the stripped recurrence has the stated alternating pole and constant-cue attenuation', () => {
  const turns = strippedRecurrence({ cue: 0.2, adherence: 1, ticks: 100 });
  const steady = 0.2 / 1.65;
  const errors = turns.slice(0, 4).map(turn => turn - steady);
  assert.ok(errors[0] > 0 && errors[1] < 0 && errors[2] > 0);
  assert.ok(Math.abs(errors[2]) < Math.abs(errors[1]) && Math.abs(errors[1]) < Math.abs(errors[0]));
  assert.ok(Math.abs(turns.at(-1) - steady) < 1e-12);
  assert.throws(() => strippedRecurrence({ adherence: 1.1 }), TypeError);
});

test('generated controls retain the existing builder and the candidate trace does not alter its law', async () => {
  const tools = await buildQualificationTools();
  assert.deepEqual(Object.values(tools.receipt.rawControllerCompatibility.existingBuilderReceipts).map(item => item.match),
    [true, true, true]);
  assert.equal(tools.receipt.rawControllerCompatibility.plainAndInstrumentedDifferOnlyByTrace, true);
  const rawPlain = tools.rawPlain.transformedSource;
  const rawInstrumented = tools.generated.rawDisplacement.transformedSource;
  assert.match(rawPlain, /agent\.angularVelocity \* LOCAL_TURN_DAMPING \* agent\.trailAdherence \* dt/);
  assert.doesNotMatch(rawPlain, /steeringAngularVelocity/);
  assert.match(rawInstrumented, /this\.qualificationFeedbackTrace\.push/);
  assert.match(rawPlain, /agent\.turnToward\(targetHeading, dt\)/);
  assert.match(rawPlain, /LOCAL_STEERING_LIMIT/);
});
