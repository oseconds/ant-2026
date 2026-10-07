import test from 'node:test';
import assert from 'node:assert/strict';
import { TemporalSocialTopology } from '../src/lib/agents/ant/TemporalSocialTopology.js';
import { DynamicSocialGraph } from '../src/lib/agents/ant/DynamicSocialGraph.js';

const WINDOW = 0.25;

test('sampled disk encounters reproduce pair merge, connector persistence, and retirement split', () => {
  const encounters = new DynamicSocialGraph({ distanceMultiplier: 1.5 });
  const analysis = new TemporalSocialTopology({ windowSeconds: WINDOW });
  const pairs = [node('A', 0.472), node('B', 0.487), node('C', 0.523), node('D', 0.538)];
  for (let tick = 0; tick <= 30; tick += 1) {
    const ants = tick >= 6 && tick < 27 ? [...pairs, node('E', 0.505, 0.1)] : pairs;
    encounters.observe(tick / 60, ants);
    if (tick % 3 === 0) analysis.observe(encounters.getSnapshot(WINDOW));
  }
  const events = analysis.getEvents();
  assert.deepEqual(events.filter(event => event.type.startsWith('COMPONENT_'))
    .map(event => [event.type, event.timeSeconds]), [
      ['COMPONENT_MERGE', 0.05], ['COMPONENT_MERGE', 0.05],
      ['COMPONENT_MERGE', 0.15], ['COMPONENT_SPLIT', 0.45]
    ]);
  assert.deepEqual(events.filter(event => event.type.startsWith('CONNECTOR_'))
    .map(event => [event.type, event.antId, event.timeSeconds]), [
      ['CONNECTOR_PERSIST', 'E', 0.4], ['CONNECTOR_END', 'E', 0.45]
    ]);
  assert.deepEqual(events.filter(event => event.timeSeconds === 0.45).map(event => event.type), [
    'EDGE_END', 'EDGE_END', 'COMPONENT_SPLIT', 'BRIDGE_BREAK', 'BRIDGE_BREAK',
    'ARTICULATION_BREAK', 'ARTICULATION_BREAK', 'ARTICULATION_BREAK', 'CONNECTOR_END'
  ]);
  assert.equal(encounters.getEncounters().filter(event => event.endReason === 'node-exit').length, 2);
});

function node(id, x, bornSeconds = 0) {
  return { id, x, y: 0.72, radius: 0.006, bornSeconds };
}

function edge(antA, antB, timeSeconds, { activeEncounter = true, weightSeconds = 0.05 } = {}) {
  const [a, b] = antA < antB ? [antA, antB] : [antB, antA];
  return {
    key: JSON.stringify([a, b]), antA: a, antB: b, weightSeconds, activeEncounter,
    lastSupportSeconds: activeEncounter ? timeSeconds : timeSeconds - 0.05,
    minDistance: 0.01, minNormalizedDistance: 0.83
  };
}

function snapshot(timeSeconds, nodes, edges, windowSeconds = WINDOW) {
  return { timeSeconds, windowSeconds, distanceMultiplier: 1.5, nodes, edges };
}

function topology(options = {}) {
  return new TemporalSocialTopology({
    windowSeconds: WINDOW,
    formationSeconds: 0.1,
    persistenceSeconds: 0.25,
    ...options
  });
}

function eventTypesAt(graph, timeSeconds) {
  return graph.getEvents().filter(event => event.timeSeconds === timeSeconds).map(event => event.type);
}

test('two pairs merge through a supported bridge ant, persist, then split when it leaves', () => {
  const graph = topology();
  const pairs = [node('A', 0.472), node('B', 0.482), node('C', 0.518), node('D', 0.528)];
  const pairEdges = [edge('A', 'B', 0.05), edge('C', 'D', 0.05)];

  let state = graph.observe(snapshot(0.05, pairs, pairEdges));
  assert.deepEqual(state.components.map(component => component.members), [['A', 'B'], ['C', 'D']]);
  assert.deepEqual(graph.getEvents().filter(event => event.type.startsWith('COMPONENT_')), []);

  const withBridge = [...pairs, node('E', 0.5, 0.15)];
  graph.observe(snapshot(0.1, pairs, pairEdges));
  state = graph.observe(snapshot(0.15, withBridge, [
    ...pairEdges, edge('B', 'E', 0.15), edge('C', 'E', 0.15)
  ]));
  assert.equal(state.components.length, 1);
  assert.deepEqual(state.articulationNodes, ['B', 'C', 'E']);
  assert.deepEqual(state.bridges.map(item => item.key), [
    '["A","B"]', '["B","E"]', '["C","D"]', '["C","E"]'
  ]);
  assert.deepEqual(eventTypesAt(graph, 0.15), [
    'EDGE_FORM', 'EDGE_FORM', 'COMPONENT_MERGE', 'BRIDGE_FORM', 'BRIDGE_FORM'
  ]);

  for (const time of [0.2, 0.25, 0.3, 0.35, 0.4]) {
    graph.observe(snapshot(time, withBridge, [
      ...pairEdges, edge('B', 'E', time), edge('C', 'E', time)
    ]));
  }
  assert.ok(graph.getEvents().some(event => event.type === 'BRIDGE_FORM'
    && event.key === '["B","E"]' && event.onsetSeconds === 0.15
    && event.confirmedSeconds === 0.25 && event.timeSeconds === 0.25));
  assert.ok(graph.getEvents().some(event => event.type === 'ARTICULATION_FORM'
    && event.antId === 'E' && event.onsetSeconds === 0.15 && event.timeSeconds === 0.25));
  assert.ok(graph.getEvents().some(event => event.type === 'BRIDGE_PERSIST'
    && event.key === '["B","E"]' && event.confirmedSeconds === 0.25
    && event.persistentSeconds === 0.4 && event.timeSeconds === 0.4));
  assert.ok(graph.getEvents().some(event => event.type === 'CONNECTOR_PERSIST'
    && event.antId === 'E' && event.timeSeconds === 0.4));

  state = graph.observe(snapshot(0.45, pairs, pairEdges));
  assert.deepEqual(state.components.map(component => component.members), [['A', 'B'], ['C', 'D']]);
  assert.deepEqual(eventTypesAt(graph, 0.45), [
    'EDGE_END', 'EDGE_END', 'COMPONENT_SPLIT', 'BRIDGE_BREAK', 'BRIDGE_BREAK',
    'ARTICULATION_BREAK', 'ARTICULATION_BREAK', 'ARTICULATION_BREAK', 'CONNECTOR_END'
  ]);
  assert.ok(graph.getEvents().some(event => event.type === 'CONNECTOR_END'
    && event.antId === 'E' && event.reason === 'node-exit'));

  graph.finish(0.5);
  assert.ok(graph.getEdgeLifetimes().filter(lifetime => lifetime.endReason === 'RUN_END')
    .every(lifetime => lifetime.rightCensored));
});

test('Tarjan topology reports no bridge or articulation in a triangle', () => {
  const graph = topology({ formationSeconds: 0.05, persistenceSeconds: 0.25 });
  const nodes = [node('A', 0), node('B', 0.1), node('C', 0.2)];
  const edges = [edge('A', 'B', 0), edge('A', 'C', 0), edge('B', 'C', 0)];
  const state = graph.observe(snapshot(0, nodes, edges));
  assert.equal(state.bridges.length, 0);
  assert.deepEqual(state.articulationNodes, []);
  assert.equal(state.metrics.bridgeFraction, 0);
  assert.equal(state.metrics.articulationFraction, 0);
});

test('one evaluation of bridge structure resets pending candidates without confirming them', () => {
  const graph = topology();
  const nodes = [node('A', 0), node('B', 0.1), node('C', 0.2)];
  graph.observe(snapshot(0, nodes, [edge('A', 'B', 0), edge('B', 'C', 0)]));
  graph.observe(snapshot(0.05, nodes, [edge('A', 'B', 0.05), edge('B', 'C', 0.05)]));
  graph.observe(snapshot(0.1, nodes, []));
  assert.equal(graph.getEvents().some(event => event.type === 'BRIDGE_FORM'
    || event.type === 'ARTICULATION_FORM'), false);
  assert.ok(graph.getSnapshot().metrics.bridgeCandidateResetCount > 0);
  assert.ok(graph.getSnapshot().metrics.articulationCandidateResetCount > 0);
});

test('articulation freshness must reach distinct cut branches, not two contacts in one triangle branch', () => {
  const graph = topology({ formationSeconds: 0.05, persistenceSeconds: 0.1 });
  const nodes = [node('A', 0), node('B', 0.1), node('C', 0.2), node('D', 0.3)];
  const edges = [
    edge('A', 'B', 0), edge('B', 'D', 0), edge('A', 'D', 0),
    edge('B', 'C', 0, { activeEncounter: false })
  ];
  let state = graph.observe(snapshot(0, nodes, edges));
  assert.deepEqual(state.articulationNodes, ['B']);
  for (const time of [0.05, 0.1, 0.15]) {
    state = graph.observe(snapshot(time, nodes, edges.map(item => ({
      ...item, lastSupportSeconds: item.activeEncounter ? time : time - 0.05
    }))));
  }
  assert.equal(state.metrics.confirmedArticulationCount, 0);
  assert.equal(graph.getEvents().some(event => event.type === 'ARTICULATION_FORM'
    || event.type === 'ARTICULATION_PERSIST'), false);
});

test('positive rolling weight without current contact cannot form or persist a connector', () => {
  const graph = topology();
  const nodes = [node('A', 0), node('B', 0.1), node('C', 0.2)];
  const stalePath = [
    edge('A', 'B', 0, { activeEncounter: false }),
    edge('B', 'C', 0, { activeEncounter: false })
  ];
  let state = graph.observe(snapshot(0, nodes, stalePath));
  assert.deepEqual(state.bridges.map(item => item.key), ['["A","B"]', '["B","C"]']);
  assert.deepEqual(state.articulationNodes, ['B']);
  for (const time of [0.05, 0.1, 0.2, 0.3, 1]) {
    state = graph.observe(snapshot(time, nodes, stalePath));
  }
  assert.equal(state.metrics.confirmedBridgeCount, 0);
  assert.equal(state.metrics.confirmedArticulationCount, 0);
  assert.equal(graph.getEvents().some(event => /^(BRIDGE|ARTICULATION|CONNECTOR)_/.test(event.type)), false);
});

test('connector onset requires new contacts to cross distinct cut branches', () => {
  const graph = topology({ formationSeconds: 0.05, persistenceSeconds: 0.1 });
  const initialNodes = [node('D', 0), node('E', 0.1), node('A', 0.3), node('B', 0.5)];
  const mergedNodes = initialNodes;
  const initialEdges = [edge('D', 'E', 0)];
  graph.observe(snapshot(0, initialNodes, initialEdges));
  const mergedEdges = [
    ...initialEdges,
    edge('E', 'A', 0.05), edge('E', 'B', 0.05), edge('A', 'B', 0.05)
  ];
  for (const time of [0.05, 0.1, 0.15, 0.2]) {
    graph.observe(snapshot(time, mergedNodes, mergedEdges.map(item => ({
      ...item, lastSupportSeconds: time
    }))));
  }
  assert.ok(graph.getSnapshot().articulationNodes.includes('E'));
  assert.equal(graph.getEvents().some(event => event.type.startsWith('CONNECTOR_')), false);
});

test('connector persistence resets when its original supported contacts collapse into one cut branch', () => {
  const graph = topology({ formationSeconds: 0.05, persistenceSeconds: 0.15 });
  const nodes = [node('D', 0), node('E', 0.1), node('A', 0.3), node('B', 0.5), node('C', 0.7)];
  const initialEdges = [edge('D', 'E', 0)];
  graph.observe(snapshot(0, nodes, initialEdges));
  const mergeEdges = [
    ...initialEdges, edge('E', 'A', 0.05), edge('E', 'B', 0.05), edge('E', 'C', 0.05)
  ];
  graph.observe(snapshot(0.05, nodes, mergeEdges));
  const collapsedSupportEdges = [
    ...mergeEdges, edge('A', 'B', 0.1), edge('B', 'C', 0.1)
  ];
  for (const time of [0.1, 0.15, 0.2, 0.25, 0.3]) {
    graph.observe(snapshot(time, nodes, collapsedSupportEdges.map(item => ({
      ...item, lastSupportSeconds: time
    }))));
  }
  assert.ok(graph.getSnapshot().articulationNodes.includes('E'));
  assert.ok(graph.getSnapshot().metrics.connectorCandidateResetCount > 0);
  assert.equal(graph.getEvents().some(event => event.type === 'CONNECTOR_PERSIST'), false);
});

test('finish right-censors confirmed roles while preserving final observed metrics', () => {
  const graph = topology({ formationSeconds: 0.05, persistenceSeconds: 0.05 });
  const nodes = [node('A', 0), node('B', 0.1), node('C', 0.2)];
  const edges = [edge('A', 'B', 0), edge('B', 'C', 0)];
  graph.observe(snapshot(0, nodes, edges));
  graph.observe(snapshot(0.05, nodes, edges));
  const final = graph.finish(0.1);
  assert.equal(final.metrics.persistentBridgeCount, 2);
  assert.equal(final.metrics.persistentArticulationCount, 1);
  assert.ok(graph.getEvents().filter(event => event.type.endsWith('_BREAK'))
    .every(event => event.rightCensored && event.reason === 'RUN_END'));
});

test('isolated node birth and retirement do not create component merge or split events', () => {
  const graph = topology();
  const nodes = [node('A', 0), node('B', 0.1)];
  const edges = [edge('A', 'B', 0)];
  graph.observe(snapshot(0, nodes, edges));
  graph.observe(snapshot(0.05, [...nodes, node('X', 0.8, 0.05)], edges));
  graph.observe(snapshot(0.1, nodes, edges));
  assert.equal(graph.getEvents().some(event => event.type === 'COMPONENT_MERGE'
    || event.type === 'COMPONENT_SPLIT'), false);
});

test('input order does not change topology or event order; snapshots and histories are detached', () => {
  const runs = [topology(), topology()];
  const nodes = [node('A', 0), node('B', 0.1), node('C', 0.2)];
  const edges = [edge('A', 'B', 0), edge('B', 'C', 0)];
  runs[0].observe(snapshot(0, nodes, edges));
  runs[1].observe(snapshot(0, [...nodes].reverse(), [...edges].reverse()));
  for (const graph of runs) {
    graph.observe(snapshot(0.05, nodes, edges));
    graph.observe(snapshot(0.1, nodes, edges));
  }
  assert.deepEqual(runs[0].getEvents(), runs[1].getEvents());
  assert.deepEqual(runs[0].getSnapshot(), runs[1].getSnapshot());

  const detached = runs[0].getSnapshot();
  detached.nodes[0].x = -1;
  detached.components[0].members.push('corrupt');
  detached.metrics.weightedDegrees[0].weightSeconds = 99;
  const event = runs[0].getEvents()[0];
  event.type = 'corrupt';
  const lifetime = runs[0].getEdgeLifetimes()[0];
  lifetime.antA = 'corrupt';
  assert.ok(runs[0].getSnapshot().nodes.every(item => item.x >= 0));
  assert.ok(!runs[0].getEvents().some(item => item.type === 'corrupt'));
  assert.ok(!runs[0].getEdgeLifetimes().some(item => item.antA === 'corrupt'));
});

test('rejects mismatched windows, invalid timestamps, and malformed graph snapshots atomically', () => {
  const graph = topology();
  assert.throws(() => graph.observe(snapshot(0, [], [], 1)), /windowSeconds/);
  assert.throws(() => graph.observe(snapshot(Number.NaN, [], [])), /finite/);
  assert.throws(() => graph.observe(snapshot(0, [node('A', 0), node('A', 1)], [])), /duplicate/);
  assert.throws(() => graph.observe(snapshot(0, [node('A', 0)], [edge('A', 'B', 0)])), /endpoint/);
  assert.equal(graph.getSnapshot(), null, 'invalid inputs do not advance state');
  graph.observe(snapshot(0, [node('A', 0)], []));
  assert.throws(() => graph.observe(snapshot(-0.1, [node('A', 0, -0.1)], [])), /cannot decrease/);
  assert.equal(graph.getSnapshot().timeSeconds, 0);
  assert.throws(() => new TemporalSocialTopology({ windowSeconds: 0 }), /windowSeconds/);
  assert.throws(() => new TemporalSocialTopology({ windowSeconds: 1, formationSeconds: -1 }), /formationSeconds/);
});
