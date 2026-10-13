import test from 'node:test';
import assert from 'node:assert/strict';
import { createTemporalObserver, differenceCounters } from '../scripts/ant-material-formation-temporal-observer.js';
import { comparableLineageGroups } from '../scripts/run-ant-material-formation-temporal-observer.js';

function makeInput(timeMs, options = {}) {
  const size = options.size || 3;
  const bytes = values => Uint8Array.from(values || Array(size).fill(0));
  return {
    timeMs,
    ordinal: options.ordinal || Math.round(timeMs / 1000),
    intervalStart: options.intervalStart || { timeMs: Math.max(0, timeMs - 1000), plateIds: [] },
    birthsAtEndBoundary: options.birthsAtEndBoundary || [],
    chemicalMemory: Float32Array.from(options.chemicalMemory || Array(size).fill(0)),
    chemicalQualifiedMask: bytes(options.chemicalQualifiedMask),
    mechanicalSupport: Float32Array.from(options.mechanicalSupport || Array(size).fill(0)),
    mechanicalQualifiedMask: bytes(options.mechanicalQualifiedMask),
    supportedMask: bytes(options.eligible),
    contactCounts: Uint32Array.from(options.contactCounts || Array(size).fill(0)),
    candidate: options.candidate ? { ...options.candidate, mask: bytes(options.candidate.mask) } : null,
    priorMatch: options.priorMatch ? { ...options.priorMatch, mask: bytes(options.priorMatch.mask) } : null
  };
}

const route = (startedAtMs, mask = [1, 0, 0]) => ({ startedAtMs, stableSeconds: 0,
  similarity: 1, source: { index: 0 }, target: { index: 2 }, path: [0, 1, 2], mask });

test('observer copies state without mutating production-owned arrays or records', () => {
  const observer = createTemporalObserver();
  const row = makeInput(1000, { eligible: [1, 0, 0], contactCounts: [2, 0, 0], candidate: route(1000) });
  const before = structuredClone(row);
  observer.observe(row);
  assert.deepEqual(row, before);
  assert.notEqual(observer.records[0].supportedMask, row.supportedMask);
});

test('counter differencing records saturated monotonic totals without changing either input', () => {
  const before = Uint32Array.from([1, 4, 0xffffffff]);
  const after = Uint32Array.from([3, 4, 0xffffffff]);
  const result = differenceCounters(before, after);
  assert.deepEqual([...result], [2, 0, 0]);
  assert.deepEqual([...before], [1, 4, 0xffffffff]);
  assert.deepEqual([...after], [3, 4, 0xffffffff]);
});

test('interval contacts use interval-start prior material and keep ending-boundary births separate', () => {
  const observer = createTemporalObserver();
  observer.observe(makeInput(1000, { contactCounts: [2, 3, 0], intervalStart: {
    timeMs: 0, plateIds: ['prior-plate'], columns: ['prior-plate', '', '']
  }, priorMatch: { id: 'prior-plate', mask: [1, 1, 0], bornAtSimulationTimeMs: 0 },
  birthsAtEndBoundary: [{ id: 'new-plate', bornAtSimulationTimeMs: 1000 }] }));
  const row = observer.records[0];
  assert.deepEqual(row.intervalStart.plateIds, ['prior-plate']);
  assert.deepEqual(row.birthsAtEndBoundary.map(item => item.id), ['new-plate']);
  assert.equal(row.freshContactsInsidePriorMask, 5);
  assert.deepEqual([...row.contactIncrements], [2, 3, 0]);
});

test('candidate restart classification follows production start continuity independently of cells', () => {
  const observer = createTemporalObserver();
  observer.observe(makeInput(1000, { candidate: route(1000), eligible: [1, 0, 0] }));
  observer.observe(makeInput(2000, { candidate: route(1000), eligible: [1, 0, 0] }));
  observer.observe(makeInput(3000, { candidate: route(3000), eligible: [1, 0, 0] }));
  observer.observe(makeInput(4000, { candidate: null, eligible: [1, 0, 0] }));
  observer.observe(makeInput(5000, { candidate: route(5000), eligible: [1, 0, 0] }));
  assert.deepEqual(observer.records.map(row => row.candidateTransition), [
    'INITIAL', 'CONTINUED', 'RESTARTED', 'DISAPPEARED', 'RESTARTED'
  ]);
  assert.equal(observer.records[2].candidateRestartWithoutLocalLoss, true);
});

test('sampled eligibility loss and return remain separate from candidate continuity', () => {
  const observer = createTemporalObserver();
  observer.observe(makeInput(1000, { candidate: route(1000), eligible: [1, 0, 0] }));
  observer.observe(makeInput(2000, { candidate: route(1000), eligible: [0, 0, 0] }));
  observer.observe(makeInput(3000, { candidate: route(1000), eligible: [1, 0, 0] }));
  assert.equal(observer.records[1].eligibilityLossCellCount, 1);
  assert.equal(observer.records[2].sampledLocalReturnCellCount, 1);
  assert.equal(observer.records[2].candidateTransition, 'CONTINUED');
  assert.equal(observer.records[2].localReturnWithoutCandidateRestart, true);
  assert.deepEqual(observer.records[1].eligibilityTransitionCounts, {
    eligibleToEligible: 0, eligibleToIneligible: 1, ineligibleToEligible: 0, ineligibleToIneligible: 0
  });
  assert.deepEqual(observer.records[2].eligibilityTransitionCounts, {
    eligibleToEligible: 0, eligibleToIneligible: 0, ineligibleToEligible: 1, ineligibleToIneligible: 0
  });
});

test('a loss outside tracked territory does not qualify a later in-territory return', () => {
  const observer = createTemporalObserver();
  observer.observe(makeInput(1000, { candidate: route(1000), eligible: [1, 1, 1] }));
  observer.observe(makeInput(2000, { candidate: route(1000), eligible: [1, 1, 0] }));
  observer.observe(makeInput(3000, { candidate: route(1000), eligible: [1, 1, 1],
    intervalStart: { timeMs: 2000, plateIds: ['plate-1'] },
    priorMatch: { id: 'plate-1', mask: [0, 0, 1] } }));
  assert.equal(observer.records[1].eligibilityLossCellCount, 0);
  assert.equal(observer.records[2].sampledLocalReturnCellCount, 0);
  assert.equal(observer.records[2].sampledLocalReturnInsidePriorMask, 0);
});

test('lineage comparators use exact candidate geometry and prior identity, not monotone summaries', () => {
  const candidateIdentity = 'same-geometry';
  const rows = [
    { priorMatch: { id: 'plate-1', ageMs: 1000 }, candidateIdentity, candidateTransition: 'CONTINUED' },
    { priorMatch: { id: 'plate-1', ageMs: 2000 }, candidateIdentity, candidateTransition: 'RESTARTED' },
    { priorMatch: { id: 'plate-2', ageMs: 1000 }, candidateIdentity, candidateTransition: 'CONTINUED' },
    { priorMatch: { id: 'plate-1', ageMs: 3000 }, candidateIdentity: 'other-geometry', candidateTransition: 'CONTINUED' }
  ];
  const groups = comparableLineageGroups(rows);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map(row => row.candidateTransition), ['CONTINUED', 'RESTARTED']);
});

test('finish reports right-censored sampled loss and candidate state at the run boundary', () => {
  const observer = createTemporalObserver();
  observer.observe(makeInput(1000, { candidate: route(1000), eligible: [1, 0, 0] }));
  observer.observe(makeInput(2000, { candidate: route(1000), eligible: [0, 0, 0] }));
  const boundary = observer.finish(2500);
  assert.equal(boundary.leftCensored, true);
  assert.equal(boundary.rightCensored, true);
  assert.equal(boundary.openEligibilityLossCellCount, 1);
  assert.equal(boundary.candidateRightCensored, true);
  assert.equal(boundary.trailingUnobservedMs, 500);
});

test('prior Plate match changes are explicit and do not merge lineages', () => {
  const observer = createTemporalObserver();
  observer.observe(makeInput(1000, { intervalStart: { timeMs: 0, plateIds: ['plate-1'] },
    priorMatch: { id: 'plate-1', mask: [1, 0, 0] } }));
  observer.observe(makeInput(2000, { intervalStart: { timeMs: 1000, plateIds: ['plate-1'] },
    priorMatch: { id: 'plate-1', mask: [1, 0, 0] } }));
  observer.observe(makeInput(3000, { intervalStart: { timeMs: 2000, plateIds: ['plate-1', 'plate-2'] },
    priorMatch: { id: 'plate-2', mask: [0, 1, 0] } }));
  assert.deepEqual(observer.records.map(row => row.priorMatchChange), [
    { kind: 'INITIAL', previousId: null, currentId: 'plate-1' },
    { kind: 'UNCHANGED', previousId: 'plate-1', currentId: 'plate-1' },
    { kind: 'CHANGED', previousId: 'plate-1', currentId: 'plate-2' }
  ]);
});

test('observer records remain finite and identifies the unsampled left boundary', () => {
  const observer = createTemporalObserver();
  observer.observe(makeInput(1000, { candidate: route(1000), eligible: [1, 0, 0],
    chemicalMemory: [0.3, 0, 0], mechanicalSupport: [0.02, 0, 0] }));
  const record = observer.records[0];
  assert.equal(record.boundaryCensoring.left, true);
  assert.equal(record.chemicalQualificationOnsetCellCount, null);
  assert.equal(record.mechanicalSupportOnsetCellCount, null);
  assert.equal(record.combinedQualificationOnsetCellCount, null);
  assert.equal(allFinite(record), true);
});

function allFinite(value) {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (ArrayBuffer.isView(value) || Array.isArray(value)) return [...value].every(allFinite);
  if (typeof value === 'object') return Object.values(value).every(allFinite);
  return false;
}
