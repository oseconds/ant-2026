import test from 'node:test';
import assert from 'node:assert/strict';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { DynamicSocialGraph } from '../src/lib/agents/ant/DynamicSocialGraph.js';
import { TemporalSocialTopology } from '../src/lib/agents/ant/TemporalSocialTopology.js';

const DT = 1 / 60;
const TICKS = 120 * 60;
const SOCIAL_WINDOWS = [0.25, 1, 5, 20];
const S1_SAMPLE_EVERY_TICKS = 3;

function countedRandom(seed) {
  let state = seed >>> 0;
  const random = () => {
    random.calls += 1;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  random.calls = 0;
  random.state = () => state;
  return random;
}

class RecordingAudioBridge {
  constructor() {
    this.enabled = false;
    this.loading = false;
    this.error = null;
    this.volume = 1;
    this.calls = [];
  }

  setMode(mode) { this.calls.push({ type: 'mode', mode }); }
  handleFootContact(event, { responses }) {
    this.calls.push({ type: 'foot-contact', event: structuredClone(event), responses: structuredClone(responses) });
  }
  syncMaterial(state) { this.calls.push({ type: 'material-sync', state: structuredClone(state) }); }
  stop() {}
  async destroy() {}
}

function eventLog() {
  return { contacts: [], plates: [], nodules: [], errors: [] };
}

function clearEventLog(log) {
  log.contacts.length = 0;
  log.plates.length = 0;
  log.nodules.length = 0;
  log.errors.length = 0;
}

function captureEvents(controller, log) {
  return controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') log.contacts.push(structuredClone(payload));
    else if (type === 'plate-birth') log.plates.push(structuredClone(payload));
    else if (type === 'sphere-birth') log.nodules.push(structuredClone(payload));
    else if (type === 'error') log.errors.push(structuredClone(payload));
  });
}

function copiedAnts(controller) {
  return Object.freeze(controller.agents.map(({ id, x, y, radius }) =>
    Object.freeze({ id, x, y, radius })));
}

function assertControllerParity(baseline, observed, baselineRandom, observedRandom, baselineLog, observedLog) {
  // AntAgent data fields include movement, intent, personality, and behavior clocks.
  // JSON visits own data properties only; it does not call snapshot getters.
  assert.equal(JSON.stringify(baseline.agents), JSON.stringify(observed.agents), 'all agent state and clocks');
  assert.deepEqual(baseline.state, observed.state, 'configuration');
  assert.deepEqual({
    simulationTimeMs: baseline.simulationTimeMs,
    nextSpawnTimeMs: baseline.nextSpawnTimeMs,
    nextAgentId: baseline.nextAgentId,
    totalSpawned: baseline.totalSpawned,
    totalRetired: baseline.totalRetired,
    accumulatorMs: baseline.accumulatorMs,
    initialized: baseline.initialized,
    running: baseline.running
  }, {
    simulationTimeMs: observed.simulationTimeMs,
    nextSpawnTimeMs: observed.nextSpawnTimeMs,
    nextAgentId: observed.nextAgentId,
    totalSpawned: observed.totalSpawned,
    totalRetired: observed.totalRetired,
    accumulatorMs: observed.accumulatorMs,
    initialized: observed.initialized,
    running: observed.running
  }, 'simulation and recruitment lifecycle');
  assert.deepEqual([baselineRandom.state(), baselineRandom.calls],
    [observedRandom.state(), observedRandom.calls], 'controller RNG state and call count');
  assert.deepEqual(baseline.field, observed.field, 'pheromone values and field state');
  assert.deepEqual(baseline.surfaceField, observed.surfaceField, 'SurfaceField values and counters');
  assert.deepEqual(baseline.gaitController.ants, observed.gaitController.ants, 'gait state');
  assert.deepEqual(baseline.bodyPoseController.ants, observed.bodyPoseController.ants, 'body-pose state');
  assert.deepEqual(baseline.gasterDeposition, observed.gasterDeposition, 'pending deposition state');
  assert.deepEqual(baseline.colonyActivation, observed.colonyActivation, 'recruitment activation');
  assert.deepEqual(baseline.trailPlateBirth, observed.trailPlateBirth, 'Plate qualification and birth state');
  assert.deepEqual(baseline.materialStratigraphy, observed.materialStratigraphy,
    'Plate and nodule histories, topology, and material fields');
  assert.deepEqual(baselineLog, observedLog, 'all contact, material-birth, and error events this tick');
}

function assertGraphInputsMatchPopulation(graph, controller) {
  assert.deepEqual(graph.getSnapshot(0).nodes.map(node => node.id).sort(),
    controller.agents.map(agent => agent.id).sort(),
    'graph nodes follow the active ant IDs, including retirement');
}

function exerciseDetachedGraphOutputs(graph) {
  const snapshotBefore = graph.getSnapshot(0);
  const eventsBefore = graph.getEvents();
  assert.ok(snapshotBefore.nodes.length > 0);
  assert.ok(eventsBefore.length > 0);

  const consumerSnapshot = graph.getSnapshot(0);
  consumerSnapshot.nodes[0].x = 99;
  consumerSnapshot.nodes.pop();
  consumerSnapshot.edges.push({ antA: 'corrupt', antB: 'corrupt' });
  const consumerEvents = graph.getEvents();
  consumerEvents[0].type = 'CORRUPTED';
  consumerEvents.pop();

  assert.deepEqual(graph.getSnapshot(0), snapshotBefore, 'snapshot consumers cannot alter graph state');
  assert.deepEqual(graph.getEvents(), eventsBefore, 'event consumers cannot alter graph history');
}

function createTopologies() {
  return SOCIAL_WINDOWS.map(windowSeconds => new TemporalSocialTopology({ windowSeconds }));
}

function observeTopologies(graph, topologies, expectedTimeSeconds) {
  const snapshots = SOCIAL_WINDOWS.map(windowSeconds => graph.getSnapshot(windowSeconds));
  const snapshotsBefore = structuredClone(snapshots);
  assert.ok(snapshots.every(snapshot => snapshot.timeSeconds === expectedTimeSeconds),
    'S1 receives current S0 snapshots at the same simulation time');

  snapshots.forEach((snapshot, index) => topologies[index].observe(snapshot));
  assert.deepEqual(snapshots, snapshotsBefore, 'S1 leaves every copied S0 snapshot untouched');
  snapshots.forEach((snapshot, index) => {
    assert.deepEqual(graph.getSnapshot(SOCIAL_WINDOWS[index]), snapshot,
      'S1 cannot mutate S0 graph state through a copied snapshot');
  });
}

function exerciseDetachedTopologyOutputs(topologies) {
  for (const topology of topologies) {
    const snapshotBefore = topology.getSnapshot();
    const eventsBefore = topology.getEvents();
    const lifetimesBefore = topology.getEdgeLifetimes();
    assert.ok(snapshotBefore);

    const consumerSnapshot = topology.getSnapshot();
    consumerSnapshot.nodes[0].x = 99;
    consumerSnapshot.nodes.pop();
    consumerSnapshot.components.push({ id: 'corrupt' });
    const consumerEvents = topology.getEvents();
    consumerEvents.push({ type: 'CORRUPTED' });
    const consumerLifetimes = topology.getEdgeLifetimes();
    consumerLifetimes.push({ lifetimeId: 'corrupt' });

    assert.deepEqual(topology.getSnapshot(), snapshotBefore,
      'S1 snapshot consumers cannot mutate topology state');
    assert.deepEqual(topology.getEvents(), eventsBefore,
      'S1 event consumers cannot mutate topology history');
    assert.deepEqual(topology.getEdgeLifetimes(), lifetimesBefore,
      'S1 edge-lifetime consumers cannot mutate topology history');
  }
}

test('DynamicSocialGraph stays observational across every natural controller tick', async t => {
  const seed = 20261005;
  const baselineRandom = countedRandom(seed);
  const observedRandom = countedRandom(seed);
  const baselineAudio = new RecordingAudioBridge();
  const observedAudio = new RecordingAudioBridge();
  const baseline = new AntController({ random: baselineRandom, audioBridge: baselineAudio });
  const observed = new AntController({ random: observedRandom, audioBridge: observedAudio });
  let baselineLog = eventLog();
  let observedLog = eventLog();
  const unsubscribeBaseline = captureEvents(baseline, baselineLog);
  const unsubscribeObserved = captureEvents(observed, observedLog);
  const graph = new DynamicSocialGraph();
  const topologies = createTopologies();
  let audioCallCursor = 0;
  let s1SampleCount = 0;

  try {
    await Promise.all([baseline.init(), observed.init()]);
    assert.deepEqual(baselineAudio.calls, observedAudio.calls, 'initial audio mode commands');
    audioCallCursor = baselineAudio.calls.length;

    const initialInput = copiedAnts(observed);
    const initialInputCopy = initialInput.map(ant => ({ ...ant }));
    graph.observe(0, initialInput);
    assert.deepEqual(initialInput, initialInputCopy, 'graph leaves copied start-state input untouched');
    assertGraphInputsMatchPopulation(graph, observed);
    exerciseDetachedGraphOutputs(graph);
    observeTopologies(graph, topologies, 0);
    s1SampleCount += 1;
    assertControllerParity(baseline, observed, baselineRandom, observedRandom, baselineLog, observedLog);

    let plateBirthCount = 0;
    let noduleBirthCount = 0;
    let footContactCount = 0;
    for (let tick = 1; tick <= TICKS; tick += 1) {
      clearEventLog(baselineLog);
      clearEventLog(observedLog);
      baseline.tick(DT);
      observed.tick(DT);

      const input = copiedAnts(observed);
      const inputBefore = input.map(ant => ({ ...ant }));
      graph.observe(observed.simulationTimeMs / 1000, input);
      assert.deepEqual(input, inputBefore, 'graph leaves copied per-tick input untouched');
      assertGraphInputsMatchPopulation(graph, observed);
      if (tick % S1_SAMPLE_EVERY_TICKS === 0) {
        observeTopologies(graph, topologies, observed.simulationTimeMs / 1000);
        s1SampleCount += 1;
      }
      assertControllerParity(baseline, observed, baselineRandom, observedRandom, baselineLog, observedLog);

      plateBirthCount += observedLog.plates.length;
      noduleBirthCount += observedLog.nodules.length;
      footContactCount += observedLog.contacts.length;
      assert.deepEqual(baselineAudio.calls.slice(audioCallCursor), observedAudio.calls.slice(audioCallCursor),
        'audio bridge commands and payloads this tick');
      audioCallCursor = baselineAudio.calls.length;
    }

    const graphEvents = graph.getEvents();
    assert.equal(graphEvents.filter(event => event.type === 'NODE_ENTER').length, observed.totalSpawned);
    assert.equal(graphEvents.filter(event => event.type === 'NODE_EXIT').length, observed.totalRetired);
    assert.ok(plateBirthCount > 0, 'seed 20261005 naturally produces a Plate within 120 simulated seconds');
    assert.ok(observedAudio.calls.some(call => call.type === 'material-sync'),
      'the natural Plate birth reaches the audio bridge');
    assert.ok(observedAudio.calls.some(call => call.type === 'foot-contact'), 'natural contacts reach the audio bridge');
    exerciseDetachedTopologyOutputs(topologies);
    assert.deepEqual(topologies.map(topology => topology.getSnapshot()?.timeSeconds),
      SOCIAL_WINDOWS.map(() => observed.simulationTimeMs / 1000),
      'all S1 windows finish at the final S0 time');
    t.diagnostic(JSON.stringify({
      ticks: TICKS,
      simulatedSeconds: TICKS / 60,
      s1WindowsSeconds: SOCIAL_WINDOWS,
      s1SampleEveryTicks: S1_SAMPLE_EVERY_TICKS,
      s1SamplesPerWindow: s1SampleCount,
      footContactGroups: footContactCount,
      plateBirths: plateBirthCount,
      noduleBirths: noduleBirthCount,
      nodeEnters: graphEvents.filter(event => event.type === 'NODE_ENTER').length,
      nodeExits: graphEvents.filter(event => event.type === 'NODE_EXIT').length,
      audioContactCommands: observedAudio.calls.filter(call => call.type === 'foot-contact').length,
      materialSyncCommands: observedAudio.calls.filter(call => call.type === 'material-sync').length
    }));
  } finally {
    unsubscribeBaseline();
    unsubscribeObserved();
    await Promise.all([baseline.destroy(), observed.destroy()]);
  }
});
