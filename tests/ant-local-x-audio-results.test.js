import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResults, countScheduleStrikesInWindow, graphSummary, partitionScheduleStrikes } from '../scripts/ant-local-x-audio-results.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-audio-reassessment/analysis');
const read = async path => JSON.parse(await readFile(resolve(BASE, path), 'utf8'));
const readGzip = async path => JSON.parse(gunzipSync(await readFile(resolve(BASE, path))).toString('utf8'));

test('schedule direct-strike recount uses exact half-open 48 kHz boundaries', () => {
  const events = [
    { frame: 2_399_999, message: { type: 'strike', payload: { layerId: 'a' } } },
    { frame: 2_400_000, message: { type: 'strike', payload: { layerId: 'a' } } },
    { frame: 2_880_000, message: { type: 'strike', payload: { layerId: 'a' } } },
    { frame: 2_400_000, message: { type: 'topology' } }
  ];
  assert.deepEqual([...countScheduleStrikesInWindow(events, 50, 60, ['a'])], [['a', 1]]);
});

test('Z graph follows packed cell-pair contract and separates disconnected layers', () => {
  const offsets = new Uint32Array(1025);
  for (let cell = 0; cell < 1024; cell++) offsets[cell + 1] = cell >= 10 ? 1 : 0;
  const graph = graphSummary({ layerIds: ['a', 'b', 'c'], nodeOffsets: new Int32Array([0, 1, 2, 3]),
    nodeGridIndices: new Uint16Array([1, 2, 3]), adjacentLinkOffsets: offsets,
    adjacentLinkNodes: new Uint32Array([0, 1]), adjacentLinkCoefficients: new Float32Array([0.5]) });
  assert.deepEqual(graph.zDegrees, { a: 1, b: 1, c: 0 });
  assert.deepEqual(graph.zBridges, [{ layers: ['a', 'b'], links: 1 }]);
  assert.deepEqual(graph.components, [['a', 'b'], ['c']]);
});

test('frame 300-second endpoint is counted separately from rendered history', () => {
  const parts = partitionScheduleStrikes([
    { frame: 0, message: { type: 'strike' } },
    { frame: 14_399_999, message: { type: 'strike' } },
    { frame: 14_400_000, message: { type: 'strike' } }
  ], 14_400_000);
  assert.deepEqual(parts.rendered.map(x => x.frame), [0, 14_399_999]);
  assert.deepEqual(parts.endpoint.map(x => x.frame), [14_400_000]);
});

test('six-world synthesis preserves the full granularity census and schedule-authoritative strike counts', async () => {
  const probe = await read('granularity-probe.json'), renderReceipts = await read('audio-render-receipts.json');
  const captures = [], schedules = [];
  for (const world of renderReceipts.receipts) {
    captures.push(await readGzip(`seed-${world.seed}-${world.arm}-capture.json.gz`));
    schedules.push(await readGzip(`seed-${world.seed}-${world.arm}-schedule.json.gz`));
  }
  const result = buildResults({ probe, renderReceipts, captures, schedules });
  assert.equal(result.architecture.census.descriptors, 468);
  assert.deepEqual(result.architecture.census.byProvenance, { production: 32, 'research-local-singleton-X': 436 });
  assert.equal(result.architecture.worlds.length, 6);
  assert.equal(result.histories.layers.length, 1183);
  assert.equal(result.architecture.worlds.flatMap(w => w.windows).length, 30);
  for (const row of result.architecture.worlds.flatMap(w => w.windows)) {
    const layers = result.histories.layers.filter(layer => layer.seed === row.seed && layer.arm === row.arm && layer.start === row.start && layer.end === row.end);
    assert.equal(row.correctedDirectStrikeCount, layers.reduce((n, layer) => n + layer.inWindowDirectStrikes, 0));
    assert.equal(row.topology.components.length > 0, row.layerCount > 0);
    assert.ok(row.observerCounterMismatches.every(m => m.difference === m.observerCount - m.scheduleCount));
    assert.ok(Array.isArray(row.fullyBuriedNeverDirectStruckZReachableWithNonzeroRawPickup));
  }
  assert.ok(result.architecture.rawReadoutLimits.some(line => line.includes('not additive acoustic energy')));
});
