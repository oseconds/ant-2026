import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AntController as ProductionAntController } from '../src/lib/agents/ant/AntController.js';
import {
  canonicalCapture, instrumentControllerSource,
  loadInstrumentedAntController, loadPlainAntController,
  transformOmegaSource
} from '../scripts/ant-transfer-capture.js';
import { captureControllerState, createSeededRandom, rngCheckpoint } from '../scripts/ant-transfer-state.js';

const SOURCE_PATH = new URL('../src/lib/agents/ant/AntController.js', import.meta.url);

test('capture source hooks only the selected omega expression and retains non-finite trace values', async () => {
  const source = await readFile(SOURCE_PATH, 'utf8');
  const production = transformOmegaSource(source, 'production');
  assert.equal(production, source);
  const dt = transformOmegaSource(source, 'dtFeedback');
  assert.equal((dt.match(/steeringAngularVelocity \* LOCAL_TURN_DAMPING \* agent\.trailAdherence \* dt/g) || []).length, 1);
  const off = transformOmegaSource(source, 'dampingOff');
  assert.doesNotMatch(off, /steeringAngularVelocity \* LOCAL_TURN_DAMPING/);

  for (const movementMode of ['production', 'dtFeedback', 'dampingOff']) {
    const injected = instrumentControllerSource(source, undefined, movementMode);
    assert.match(injected.source, /\$antNumber: 'Infinity'/);
    assert.match(injected.source, /type: 'intention-no-choice'.*rngCalls/s);
    assert.match(injected.source, /target-turn-applied'.*headingAfterTurn: agent\.heading, currentOmega: agent\.angularVelocity/s);
    assert.doesNotMatch(injected.source, /agent\.heading - agent\.angularVelocity \* dt/);
    assert.doesNotMatch(injected.source, /previousOmega: agent\.angularVelocity - agent\.angularVelocity/);
  }
});

test('all instrumented movement arms preserve exact controller, RNG and snapshot state', async () => {
  for (const movementMode of ['production', 'dtFeedback', 'dampingOff']) {
    const [plainModule, traceModule] = await Promise.all([
      loadPlainAntController(movementMode), loadInstrumentedAntController({ movementMode })
    ]);
    const plain = new plainModule.AntController({ random: createSeededRandom(20261023) });
    const traced = new traceModule.AntController({ random: createSeededRandom(20261023) });
    await Promise.all([plain.init(), traced.init()]);
    const trace = [];
    traceModule.watchTransferTrace(traced, event => trace.push(event));
    for (let tick = 0; tick < 360; tick += 1) {
      plain.tick(1 / 60);
      traced.tick(1 / 60);
    }
    traceModule.clearTransferTrace(traced);

    const plainTypes = plainModule.AntController === ProductionAntController
      ? [] : [{ Type: plainModule.AntController, id: 'VariantAntController' }];
    const tracedTypes = [{ Type: traceModule.AntController, id: 'InstrumentedAntController' }];
    assert.deepEqual(canonicalCapture(captureControllerState(traced, { extraTypes: tracedTypes })),
      canonicalCapture(captureControllerState(plain, { extraTypes: plainTypes })),
      `${movementMode} trace changed complete controller state`);
    assert.deepEqual(rngCheckpoint(traced.random), rngCheckpoint(plain.random),
      `${movementMode} trace consumed or reordered RNG draws`);
    assert.deepEqual(traced.getSnapshot(), plain.getSnapshot(), `${movementMode} snapshots diverged`);

    const input = trace.find(event => event.type === 'intention-input');
    const updated = trace.find(event => event.type === 'intention-updated');
    const localTurn = trace.find(event => event.type === 'local-turn');
    const target = trace.find(event => event.type === 'target-turn');
    const applied = trace.find(event => event.type === 'target-turn-applied');
    const noChoice = trace.find(event => event.type === 'intention-no-choice');
    assert.ok(input && updated && localTurn && target && applied && noChoice,
      `${movementMode} did not produce the required decision/turn trace rows`);
    assert.equal(input.agent.x >= 0 && input.agent.x <= 1, true);
    assert.equal(input.entryAdherence, input.agent.trailAdherence);
    assert.ok(Number.isFinite(updated.updatedAdherence));
    assert.equal(decodeTraceNumber(localTurn.unclampedLocalTurn),
      decodeTraceNumber(localTurn.rawLocalCueU) + decodeTraceNumber(localTurn.feedbackContributionV));
    assert.ok(Number.isFinite(target.headingBeforeTurn));
    assert.ok(Number.isFinite(applied.headingAfterTurn));
    assert.equal(typeof noChoice.rngCalls, 'number');
    assert.equal(Object.hasOwn(noChoice, 'options'), false);
    assert.ok(trace.every((event, index) => index === 0 || trace[index - 1].sequence < event.sequence));

    await Promise.all([plain.destroy(), traced.destroy()]);
  }
});

function decodeTraceNumber(value) {
  if (!value || typeof value !== 'object' || value.$antNumber === undefined) return value;
  return ({ NaN: NaN, Infinity, '-Infinity': -Infinity, '-0': -0 })[value.$antNumber];
}
