import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { lateFixture, measureCompiler, nearestRank, parseSchedule, summarizeCleanRuns, summarizeProfile } from '../scripts/ant-local-x-audio-profile.js';

const START = 290 * 48_000, END = 300 * 48_000;

function encoded(rows) {
  return gzipSync(JSON.stringify({ schema: 'ant-local-x-audio-world-schedule-v1',
    world: { sampleRate: 48_000, frames: END }, events: rows }));
}

test('late runtime fixture starts with the last pre-window topology and includes start-boundary events only', () => {
  const schedule = parseSchedule(encoded([
    { frame: 0, message: { type: 'topology', payload: { id: 'empty' } } },
    { frame: START - 1, message: { type: 'topology', payload: { id: 'late' } } },
    { frame: START, message: { type: 'strike', payload: { id: 'first' } } },
    { frame: END - 1, message: { type: 'topology', payload: { id: 'last' } } },
    { frame: END, message: { type: 'strike', payload: { id: 'excluded-endpoint' } } }
  ]));
  const fixture = lateFixture(schedule);
  assert.deepEqual(fixture.initialTopology, { id: 'late' });
  assert.equal(fixture.baseTopologyFrame, START - 1);
  assert.deepEqual(fixture.events.map(row => row.frame), [START, END - 1]);
  assert.equal(fixture.contactCount, 1);
  assert.equal(fixture.topologyInstallCount, 1);
});

test('schedule parser rejects out-of-order and out-of-range events', () => {
  assert.throws(() => parseSchedule(encoded([
    { frame: 1, message: { type: 'strike' } }, { frame: 0, message: { type: 'topology' } }
  ])), /schedule order/);
  assert.throws(() => parseSchedule(encoded([{ frame: END + 1, message: { type: 'strike' } }])), /in the 300-second schedule/);
});

test('CDP samples aggregate by function and source location', () => {
  const rows = summarizeProfile({ nodes: [
    { id: 1, callFrame: { functionName: 'process', url: 'worklet.js', lineNumber: 10 } },
    { id: 2, callFrame: { functionName: 'computeLap', url: 'worklet.js', lineNumber: 20 } }
  ], samples: [2, 2, 1], timeDeltas: [1000, 1500, 500] });
  assert.deepEqual(rows, [
    { functionName: 'computeLap', sourceUrl: 'worklet.js', lineNumber: 21, sampledMs: 2.5 },
    { functionName: 'process', sourceUrl: 'worklet.js', lineNumber: 11, sampledMs: 0.5 }
  ]);
});

test('anonymous CDP frames retain an explicit eval source and a nullable line', () => {
  assert.deepEqual(summarizeProfile({ nodes: [{ id: 1, callFrame: {} }], samples: [1], timeDeltas: [1000] }),
    [{ functionName: '(anonymous)', sourceUrl: '(worklet eval)', lineNumber: null, sampledMs: 1 }]);
});

test('nearest-rank quantiles include the 95th-percentile maximum for nine samples', () => {
  assert.equal(nearestRank([9, 1, 8, 2, 7, 3, 6, 4, 5], 0.5), 5);
  assert.equal(nearestRank([9, 1, 8, 2, 7, 3, 6, 4, 5], 0.95), 9);
  assert.throws(() => nearestRank([], 0.5), /at least one sample/);
  assert.throws(() => nearestRank([1], 0), /in \(0, 1\]/);
});

test('compiler timing uses one warmup and nine measured exact-input compiles', () => {
  let calls = 0;
  const result = measureCompiler({ plates: [], nodules: [], stratigraphy: null }, input => {
    assert.deepEqual(input.plates, []);
    calls++;
    return {};
  });
  assert.equal(calls, 10);
  assert.equal(result.warmups, 1);
  assert.equal(result.measuredRuns, 9);
  assert.equal(result.p95Ms, result.samplesMs.reduce((a, b) => Math.max(a, b)));
  assert.ok(result.p50Ms <= result.p95Ms);
});

test('clean process summary requires three separate replays and reports median/range', () => {
  assert.deepEqual(summarizeCleanRuns([{ processTotalMs: 5 }, { processTotalMs: 2 }, { processTotalMs: 8 }]),
    { measuredReplays: 3, quantileMethod: 'nearest-rank: sorted[ceil(p*n)-1]',
      processMsMedian: 5, processMsMin: 2, processMsMax: 8 });
  assert.throws(() => summarizeCleanRuns([{ processTotalMs: 1 }]), /three clean measured replays/);
});
