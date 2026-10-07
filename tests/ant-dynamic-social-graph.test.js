import test from 'node:test';
import assert from 'node:assert/strict';
import { DynamicSocialGraph } from '../src/lib/agents/ant/DynamicSocialGraph.js';

function pair(distance = 0.014) {
  return [
    { id: 'ant-2', x: 0.5, y: 0.5, radius: 0.006 },
    { id: 'ant-1', x: 0.5 + distance, y: 0.5, radius: 0.006 }
  ];
}
function spreadPair() {
  return [
    { id: 'ant-2', x: 0.5, y: 0.5, radius: 0.006 },
    { id: 'ant-1', x: 0.7, y: 0.5, radius: 0.006 }
  ];
}

test('records undirected encounters from the first inside sample and holds prior status between ticks', () => {
  const graph = new DynamicSocialGraph({ distanceMultiplier: 1.25 });
  graph.observe(10, pair());
  assert.equal(graph.getSnapshot(5).activeEncounterCount, 1);
  assert.deepEqual(graph.getSnapshot(5).edges, [], 'a start sample earns no prior duration');

  graph.observe(12, pair(0.015));
  const snapshot = graph.getSnapshot(5);
  assert.equal(snapshot.activeEncounterCount, 1);
  assert.equal(snapshot.edges.length, 1);
  assert.equal(snapshot.edges[0].key, '["ant-1","ant-2"]');
  assert.equal(snapshot.edges[0].antA, 'ant-1');
  assert.equal(snapshot.edges[0].antB, 'ant-2');
  assert.equal(snapshot.edges[0].weightSeconds, 2);
  assert.equal(snapshot.edges[0].activeEncounter, true);
  assert.equal(snapshot.edges[0].lastSupportSeconds, 12);
  assert.ok(Math.abs(snapshot.edges[0].minDistance - 0.014) < 1e-12);
  assert.ok(Math.abs(snapshot.edges[0].minNormalizedDistance - (0.014 / 0.012)) < 1e-12);
  assert.equal(graph.getEncounters()[0].startSeconds, 10);
  assert.equal(graph.getEncounters()[0].endSeconds, null);
});

test('window weights intersect encounter intervals exactly for active and separated live pairs', () => {
  const graph = new DynamicSocialGraph({ distanceMultiplier: 1.25 });
  graph.observe(0, pair());
  graph.observe(2, pair());
  graph.observe(2, spreadPair());
  const separated = graph.getSnapshot(10).edges[0];
  assert.equal(separated.weightSeconds, 2);
  assert.equal(separated.activeEncounter, false);
  assert.equal(separated.lastSupportSeconds, 2);
  graph.observe(4, pair());
  graph.observe(5, pair());

  const fourSecondWindow = graph.getSnapshot(4);
  const twoSecondWindow = graph.getSnapshot(3);
  assert.equal(fourSecondWindow.edges[0].weightSeconds, 2,
    'one second from the earlier encounter plus one active second');
  assert.equal(twoSecondWindow.edges[0].weightSeconds, 1,
    'the earlier interval ending at the open window boundary contributes zero');
  assert.ok(Math.abs(fourSecondWindow.edges[0].minDistance - 0.014) < 1e-12);
});

test('retains separated live-pair exposure only while its exact time window overlaps', () => {
  const graph = new DynamicSocialGraph({ distanceMultiplier: 1.25 });
  graph.observe(0, pair());
  graph.observe(1, spreadPair());

  const tail = graph.getSnapshot(0.25);
  assert.equal(tail.edges.length, 1);
  assert.equal(tail.edges[0].weightSeconds, 0.25);
  assert.equal(tail.edges[0].activeEncounter, false);
  assert.equal(tail.edges[0].lastSupportSeconds, 1);
  assert.equal(tail.activeEncounterCount, 0);

  graph.observe(1.25, spreadPair());
  assert.deepEqual(graph.getSnapshot(0.25).edges, [], 'a closed interval at the open window boundary has zero weight');

  graph.observe(2, pair());
  graph.observe(3, [{ id: 'ant-1', x: 0.514, y: 0.5, radius: 0.006 }]);
  assert.deepEqual(graph.getSnapshot(10).edges, [], 'retirement removes incident edges immediately');
  assert.equal(graph.getEncounters().length, 2, 'raw closed encounter history remains available');
});

test('ends encounters on distance or node exit and prevents retired ID reuse', () => {
  const graph = new DynamicSocialGraph({ distanceMultiplier: 1.25 });
  graph.observe(0, pair());
  graph.observe(1, [pair()[0], { id: 'ant-1', x: 0.7, y: 0.5, radius: 0.006 }]);
  assert.equal(graph.getEncounters()[0].endReason, 'distance');
  graph.observe(2, pair());
  graph.observe(3, [{ id: 'ant-1', x: 0.5, y: 0.5, radius: 0.006 }]);

  const encounters = graph.getEncounters();
  assert.equal(encounters.length, 2);
  assert.equal(encounters[1].endReason, 'node-exit');
  assert.equal(encounters[1].durationSeconds, 1);
  assert.ok(graph.getEvents().some(event => event.type === 'NODE_EXIT' && event.antId === 'ant-2'));
  assert.throws(() => graph.observe(4, pair()), /retired ID/);
  assert.equal(graph.timeSeconds, 3, 'invalid observations do not partially advance state');
});

test('finishes by right-censoring active encounters and preserves detached final history', () => {
  const graph = new DynamicSocialGraph();
  const input = pair();
  graph.observe(0, input);
  input[0].x = 0.99;
  assert.equal(graph.getSnapshot(5).nodes.find(node => node.id === 'ant-2').x, 0.5,
    'the observer copied primitive inputs');
  graph.observe(2, pair());
  graph.finish(4);

  const encounter = graph.getEncounters()[0];
  assert.equal(encounter.endSeconds, 4);
  assert.equal(encounter.durationSeconds, 4);
  assert.equal(encounter.endReason, 'right-censored');
  assert.equal(graph.getSnapshot(5).timeSeconds, 4);
  assert.equal(graph.getSnapshot(5).nodes.length, 2);
  assert.equal(graph.getSnapshot(5).activeEncounterCount, 0);
  assert.equal(graph.getEvents().at(-1).type, 'ENCOUNTER_END');
  assert.throws(() => graph.observe(5, pair()), /finished/);

  encounter.antA = 'changed';
  const event = graph.getEvents()[0];
  event.antId = 'changed';
  const snapshot = graph.getSnapshot(5);
  snapshot.nodes[0].x = -5;
  assert.equal(graph.getEncounters()[0].antA, 'ant-1');
  assert.notEqual(graph.getEvents()[0].antId, 'changed');
  assert.ok(graph.getSnapshot(5).nodes.every(node => node.x >= 0));
});

test('uses stable encounter IDs and deterministic event and pair ordering', () => {
  const runs = [new DynamicSocialGraph(), new DynamicSocialGraph()];
  for (const graph of runs) {
    graph.observe(0, [
      { id: 'z', x: 0.5, y: 0.5, radius: 0.006 },
      { id: 'b', x: 0.51, y: 0.5, radius: 0.006 },
      { id: 'a', x: 0.49, y: 0.5, radius: 0.006 }
    ]);
    graph.observe(1, [
      { id: 'a', x: 0.49, y: 0.5, radius: 0.006 },
      { id: 'b', x: 0.51, y: 0.5, radius: 0.006 },
      { id: 'z', x: 0.5, y: 0.5, radius: 0.006 }
    ]);
  }
  assert.deepEqual(runs[0].getEvents(), runs[1].getEvents());
  assert.deepEqual(runs[0].getSnapshot(1).nodes.map(node => node.id), ['a', 'b', 'z']);
  assert.deepEqual(runs[0].getEvents().slice(0, 3).map(event => event.antId), ['a', 'b', 'z']);
  assert.deepEqual(runs[0].getEncounters().map(item => item.key), ['["a","b"]', '["a","z"]', '["b","z"]']);
  assert.deepEqual(runs[0].getEncounters().map(item => item.encounterId), ['encounter-1', 'encounter-2', 'encounter-3']);
});

test('validates observations and permits same-time lifecycle refresh without duration', () => {
  const graph = new DynamicSocialGraph();
  assert.throws(() => graph.observe(Number.NaN, []), /finite/);
  assert.throws(() => graph.observe(0, [{ id: '', x: 0, y: 0, radius: 1 }]), /nonempty string/);
  assert.throws(() => graph.observe(0, [{ id: 'a', x: 0, y: 0, radius: 0 }]), /finite and positive/);
  assert.throws(() => graph.observe(0, [
    { id: 'a', x: 0, y: 0, radius: 1 }, { id: 'a', x: 1, y: 1, radius: 1 }
  ]), /duplicate ID/);
  assert.equal(graph.timeSeconds, null);

  graph.observe(0, pair());
  graph.observe(0, [pair()[0]]);
  assert.equal(graph.getEncounters()[0].durationSeconds, 0);
  assert.equal(graph.getEncounters()[0].endReason, 'node-exit');
  assert.equal(graph.getSnapshot(1).edges.length, 0);
  assert.throws(() => graph.observe(-1, []), /cannot decrease/);
});
