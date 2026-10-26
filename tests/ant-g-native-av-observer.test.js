import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';
import { installNativeAvObserver } from '../scripts/ant-g-native-av-page.js';

function randomSource(seed) {
  let state = seed >>> 0, calls = 0;
  const random = () => { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  random.state = () => ({ state, calls });
  return random;
}

function makeBridge(sent) {
  const bridge = new AntEnvironmentAudioBridge({ audioEngine: { context: { currentTime: 0 } } });
  const mask = new Uint8Array(96 * 96).fill(1);
  bridge.syncPlates([{ id: 'fixture-plate', grid: { width: 96, height: 96 }, mask,
    pickups: [{ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.5 }],
    material: { stiffness: 0.9, density: 1.1, damping: 0.3 }, edges: [] }]);
  bridge.surface._enabled = true;
  bridge.surface.worklet = { node: { port: { postMessage: (message) => sent.push(structuredClone(message)) } } };
  return bridge;
}

async function makeModel(seed, sent) {
  const model = new AntController({ random: randomSource(seed), state: { population: { count: 1 } },
    audioBridge: makeBridge(sent) });
  await model.init();
  return model;
}

test('observer records contact responses and routed strikes while preserving RNG and world state', async () => {
  const sentObserved = [], sentPlain = [];
  const observed = await makeModel(91, sentObserved);
  const plain = await makeModel(91, sentPlain);
  const randomObserved = observed.random, randomPlain = plain.random;
  let clock = 0;
  const observer = installNativeAvObserver(observed, { performanceNow: () => ++clock });

  for (let tick = 0; tick < 120; tick += 1) {
    observed.tick(1 / 60);
    plain.tick(1 / 60);
  }

  const rows = observer.data.events;
  assert.ok(rows.length > 0, 'actual gait contacts are observed');
  assert.ok(rows.every((row) => row.source === 'FOOT_CONTACT' && row.simulationTimeMs !== null));
  assert.ok(rows.every((row) => Number.isFinite(row.preContactCompaction)
    && Number.isFinite(row.rawPheromonePostGasterPreNextTick) && Number.isInteger(row.localL)));
  assert.ok(rows.every((row) => Number.isFinite(row.performanceTimeMs)));
  assert.ok(rows.every((row, index) => index === 0
    || row.performanceTimeMs >= rows[index - 1].performanceTimeMs));
  assert.ok(rows.some((row) => row.exposedPlateId === 'fixture-plate'));
  assert.deepEqual(sentObserved.filter(({ type }) => type === 'strike'), sentPlain.filter(({ type }) => type === 'strike'));
  assert.deepEqual(observer.data.posts.map(({ type, payload }) => ({ type, payload })),
    sentObserved.filter(({ type }) => type === 'strike').map(({ type, payload }) => ({ type, payload })));
  assert.deepEqual(observer.data.posts.map(({ postOrder }) => postOrder),
    observer.data.posts.map((_, index) => index + 1));
  assert.ok(observer.data.posts.every(({ performanceTimeMs, simulationTimeMs, postSimulationTimeMs }) =>
    Number.isFinite(performanceTimeMs) && Number.isFinite(simulationTimeMs)
      && Number.isFinite(postSimulationTimeMs)));
  assert.ok(observer.data.posts.every((post, index) => index === 0
    || post.performanceTimeMs >= observer.data.posts[index - 1].performanceTimeMs));
  assert.deepEqual(randomObserved.state(), randomPlain.state());
  assert.deepEqual(observer.fingerprint(), (() => {
    const snapshot = plain.getSnapshot(); snapshot.audio.diagnostics = null;
    return { simulationTimeMs: plain.simulationTimeMs, snapshot };
  })());
  assert.ok(observer.data.observerCostMs > 0);
  observer.restore();
  await observed.destroy();
  await plain.destroy();
});

test('observer records valid contacts without an exposed plate and restores wrappers', async () => {
  const sent = [];
  const model = await makeModel(31, sent);
  model.audioBridge.surface.exposedPlateAt = () => null;
  const original = model.surfaceField.applyFootContact;
  let clock = 0;
  const observer = installNativeAvObserver(model, { performanceNow: () => ++clock });
  for (let tick = 0; tick < 120; tick += 1) model.tick(1 / 60);
  assert.ok(observer.data.events.some((row) => row.exposedPlateId === null));
  assert.equal(observer.data.posts.length, 0, 'unsupported feet do not create observed strikes');
  observer.restore();
  assert.equal(model.surfaceField.applyFootContact, original);
  await model.destroy();
});
