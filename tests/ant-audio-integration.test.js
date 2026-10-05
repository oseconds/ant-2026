import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { StepEventGenerator } from '../src/lib/agents/ant/StepEventGenerator.js';
import { Lab } from '../src/lib/lab/Lab.js';

function countedRandom(seed) {
  let value = seed >>> 0;
  const random = () => {
    random.calls += 1;
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
  random.calls = 0;
  return random;
}

function recordingBridge() {
  return {
    enabled: false, loading: false, error: null, events: [], stopped: 0, destroyed: false,
    async setEnabled(value) { this.enabled = value; return value; },
    handleStep(event) { if (this.enabled) this.events.push(event); return this.enabled; },
    stop() { this.enabled = false; this.stopped += 1; },
    async destroy() { this.stop(); this.destroyed = true; }
  };
}

test('STEP observation and Audio On/Off preserve movement, field, spawning, and the simulation random stream', async () => {
  for (const seed of [61, 193]) {
    const baselineRandom = countedRandom(seed), audioRandom = countedRandom(seed);
    const baseline = new AntController({ random: baselineRandom,
      stepEventGenerator: { advance: () => [] } });
    const bridge = recordingBridge();
    const audible = new AntController({ random: audioRandom, audioBridge: bridge });
    const generated = [];
    audible.subscribe(({ type, payload }) => { if (type === 'step') generated.push(payload); });
    await Promise.all([baseline.init(), audible.init()]);
    for (let tick = 0; tick < 1200; tick += 1) {
      if (tick === 240 || tick === 840) await audible.setAudioEnabled(true);
      if (tick === 600) await audible.setAudioEnabled(false);
      baseline.tick(1 / 60);
      audible.tick(1 / 60);
      if (tick % 60 === 0) {
        assert.deepEqual(audible.getSnapshot().agents, baseline.getSnapshot().agents);
        assert.deepEqual(audible.getSnapshot().pheromone.values, baseline.getSnapshot().pheromone.values);
        assert.equal(audible.nextSpawnTimeMs, baseline.nextSpawnTimeMs);
        assert.equal(audioRandom.calls, baselineRandom.calls);
      }
    }
    assert.ok(generated.length > bridge.events.length, 'Off still consumes distance thresholds without sending audio');
    assert.ok(bridge.events.length > 0, 'On delivers movement events');
    assert.deepEqual(audible.getState(), baseline.getState());
    await Promise.all([baseline.destroy(), audible.destroy()]);
    assert.equal(bridge.destroyed, true);
    assert.equal(audible.stepEventGenerator.ants.size, 0);
  }
});

test('controller measures post-contact displacement rather than intended velocity for STEP generation', async () => {
  const observations = [];
  const generator = new StepEventGenerator({ variation: 0 });
  let steps = 0;
  const controller = new AntController({ random: countedRandom(7), stepEventGenerator: {
    advance(agent, distance, time) {
      observations.push({ x: agent.x, y: agent.y, distance, time });
      return generator.advance(agent, distance, time);
    }
  } });
  controller.subscribe(({ type }) => { if (type === 'step') steps += 1; });
  await controller.init();
  controller.nextSpawnTimeMs = null;
  const agent = controller.agents[0];
  agent.x = agent.y = 0.5;
  agent.vx = 0.06; agent.vy = 0;
  agent.accelerateToward = () => {};
  controller.occupancy.constrainDisplacements = () => [0.25];
  controller.tick(1 / 60);
  const first = observations[0];
  assert.equal(first.distance, Math.hypot(first.x - 0.5, first.y - 0.5));
  assert.ok(first.distance < 0.06 / 60, 'contact constraint reduces measured travel');
  assert.equal(first.time, controller.simulationTimeMs);
  controller.occupancy.constrainDisplacements = () => [0];
  controller.tick(1 / 60);
  assert.equal(observations[1].distance, 0, 'fully blocked travel cannot create footsteps');
  for (let frame = 0; frame < 180; frame += 1) controller.tick(1 / 60);
  assert.equal(steps, 0, 'blocked bodies emit no footsteps despite their intended motion');
  controller.occupancy.constrainDisplacements = () => [1];
  agent.vx = 0.06;
  for (let frame = 0; frame < 60; frame += 1) controller.tick(1 / 60);
  assert.ok(steps >= 3, 'footstep activity returns when actual travel resumes');
  await controller.destroy();
});

async function isolatedSteps(hesitating) {
  const controller = new AntController({ random: countedRandom(4),
    stepEventGenerator: new StepEventGenerator({ variation: 0 }) });
  await controller.init();
  controller.nextSpawnTimeMs = null;
  const agent = controller.agents[0];
  agent.x = 0.25; agent.y = 0.5;
  agent.heading = agent.intentHeading = 0;
  agent.inspectionRemaining = agent.decisionRemaining = agent.committedRemaining = 100;
  agent.hesitationRemaining = hesitating ? 100 : 0;
  let count = 0;
  controller.subscribe(({ type }) => { if (type === 'step') count += 1; });
  for (let frame = 0; frame < 300; frame += 1) controller.tick(1 / 60);
  const duringMotion = count;
  if (hesitating) {
    agent.hesitationRemaining = 0;
    for (let frame = 0; frame < 300; frame += 1) controller.tick(1 / 60);
    assert.ok(count > duringMotion + 5, 'regular footsteps return after hesitation ends');
  }
  controller.stop();
  const atStop = count;
  for (let frame = 0; frame < 300; frame += 1) controller.tick(1 / 60);
  assert.equal(count, atStop, 'stopped simulation emits no more steps');
  await controller.destroy();
  return duringMotion;
}

test('actual hesitation produces fewer steps than the same freely moving ant', async () => {
  const free = await isolatedSteps(false), hesitating = await isolatedSteps(true);
  assert.ok(free > 5, 'free movement regularly crosses step distances');
  assert.ok(hesitating < free / 4, 'hesitation changes timing through its slower actual movement');
});

test('Lab switching from audible ANT destroys its Plate and reuses the existing engine', async () => {
  const handles = [];
  const audio = { init: async () => {}, createWorklet: async () => {
    const handle = { sent: [], disconnected: false,
      node: { port: { postMessage(message) { handle.sent.push(message); } } },
      disconnect() { this.disconnected = true; }
    };
    handles.push(handle);
    return handle;
  }, destroy: async () => { throw new Error('an injected engine must stay owned by its caller'); } };
  const lab = new Lab({ audioEngine: audio });
  const ant = await lab.setModel('ant');
  assert.equal(handles.length, 0, 'selection does not start audio');
  await ant.setAudioEnabled(true);
  assert.equal(ant.audioBridge.plate.audio, audio);
  const bridge = ant.audioBridge;
  const switching = lab.setModel('plate');
  assert.equal(bridge.enabled, false, 'selection stops ANT audio immediately');
  await switching;
  assert.equal(bridge.destroyed, true);
  assert.equal(handles[0].disconnected, true);
  assert.ok(handles[0].sent.some(message => message.type === 'stop'));
  assert.equal(await bridge.handleStep({ type: 'STEP', position: { x: 0.5, y: 0.5 }, strength: 0.035 }), false);
  assert.equal(lab.model.audio, audio, 'the next model shares the same audio engine');
  await lab.destroy();
});
