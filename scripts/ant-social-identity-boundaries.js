import assert from 'node:assert/strict';
import { describe, durations } from './ant-social-null.js';

const TICK = 1 / 60;
const EPSILON = 1e-6;
const WINDOWS = [0.25, 1, 5, 20];
const PHASE_BINS = Array.from({ length: 20 }, (_, index) => index * 0.25);
const scheduledTypes = new Set(['BLOCK_REMAP']);
const identityChanges = boundary => boundary.changes.filter(change => change.oldBody != null
  && change.newBody != null && change.oldBody !== change.newBody);
const bodyMap = boundaries => boundaries.map(boundary => ({ ...boundary,
  changedLabels: identityChanges(boundary).map(change => change.label) }));
const boundariesOf = (ledger, predicate) => bodyMap(ledger.filter(item => predicate(item.type)));
const within = (a, b, tolerance = EPSILON) => Math.abs(a - b) <= tolerance;
const crosses = (start, end, boundary) => start <= boundary.timeSeconds + EPSILON
  && end >= boundary.timeSeconds - EPSILON;

function endpointIds(item) { return new Set([item.antA, item.antB, item.antId].filter(id => id != null)); }
function eventIds(event) {
  const ids = endpointIds(event);
  for (const group of [event.from, event.to]) for (const component of group || []) {
    for (const id of (Array.isArray(component) ? component : component.members || [])) ids.add(id);
  }
  for (const key of [...(event.newIncidentEdges || []), ...(event.supportByComponent || []).flatMap(item => item.edgeKeys || [])]) {
    try { for (const id of JSON.parse(key)) ids.add(id); } catch { /* unusable edge key */ }
  }
  return ids;
}

function eventBoundarySummary(events, boundaries) {
  const eventTypes = [...new Set(events.map(event => event.type))].sort();
  return Object.fromEntries(eventTypes.map(type => {
    const selected = events.filter(event => event.type === type);
    const eventBands = {};
    for (const windowSeconds of WINDOWS) {
      eventBands[windowSeconds] = selected.filter(event => boundaries.some(boundary => {
        const age = event.timeSeconds - boundary.timeSeconds;
        return age > EPSILON && age <= windowSeconds + EPSILON;
      })).length;
    }
    const exact = selected.filter(event => boundaries.some(boundary => within(event.timeSeconds, boundary.timeSeconds)));
    const relevant = selected.filter(event => {
      const start = event.onsetSeconds ?? event.startSeconds;
      if (!Number.isFinite(start) || !Number.isFinite(event.timeSeconds)) return false;
      const ids = eventIds(event);
      return boundaries.some(boundary => boundary.changedLabels.some(id => ids.has(id))
        && crosses(start, event.timeSeconds, boundary));
    });
    const timeBandIdentityExposure = selected.filter(event => {
      const start = event.onsetSeconds ?? event.startSeconds;
      return Number.isFinite(start) && Number.isFinite(event.timeSeconds)
        && boundaries.some(boundary => boundary.changedLabels.length && crosses(start, event.timeSeconds, boundary));
    });
    const relevantCrossings = new Set(relevant);
    return [type, { count: selected.length, exactBoundaryCount: exact.length,
      postBoundaryBandCounts: eventBands, relevantLabelIntervalCrossingCount: relevant.length,
      noRelevantLabelIntervalCrossingCount: selected.length - relevantCrossings.size,
      timeBandIdentityExposureCount: timeBandIdentityExposure.length }];
  }));
}

function intervalSummary(items, boundaries, censored) {
  const exposed = item => {
    const start = item.startSeconds;
    const end = Number.isFinite(item.endSeconds) ? item.endSeconds : start + item.durationSeconds;
    const ids = endpointIds(item);
    return boundaries.some(boundary => boundary.changedLabels.some(id => ids.has(id))
      && crosses(start, end, boundary));
  };
  const directStarts = items.filter(item => boundaries.some(boundary =>
    Math.abs(item.startSeconds - boundary.timeSeconds) <= TICK + EPSILON));
  const directEnds = items.filter(item => Number.isFinite(item.endSeconds) && boundaries.some(boundary =>
    Math.abs(item.endSeconds - boundary.timeSeconds) <= TICK + EPSILON));
  const crossed = items.filter(exposed), completedExposed = crossed.filter(item => !censored(item));
  const completedUnexposed = items.filter(item => !exposed(item) && !censored(item));
  return { count: items.length, directStartCount: directStarts.length, directEndCount: directEnds.length,
    identityJumpCrossingCount: crossed.length,
    durations: durations(items, censored), completedIdentityJumpExposedDurations: durations(completedExposed, censored),
    completedIdentityJumpUnexposedDurations: durations(completedUnexposed, censored) };
}

function persistenceLifetimes(events, boundaries) {
  const asIntervals = selected => selected.map(event => ({ ...event,
    startSeconds: event.onsetSeconds, endSeconds: event.timeSeconds }));
  const bridge = asIntervals(events.filter(event => event.type === 'BRIDGE_BREAK' && event.persistentSeconds != null));
  const articulation = asIntervals(events.filter(event => event.type === 'ARTICULATION_BREAK'
    && event.persistentSeconds != null));
  const connector = asIntervals(events.filter(event => event.type === 'CONNECTOR_END'));
  const censored = event => event.rightCensored === true;
  return { bridge: intervalSummary(bridge, boundaries, censored),
    articulation: intervalSummary(articulation, boundaries, censored),
    connector: intervalSummary(connector, boundaries, censored) };
}

function sampleMetrics(sample) {
  return { edgeCount: sample.edgeCount, weightedDegree: sample.nodeCount ? sample.weightedDegreeSum / sample.nodeCount : null,
    persistentBridgeCount: sample.persistentBridgeCount,
    persistentArticulationCount: sample.persistentArticulationCount,
    persistentConnectorCount: sample.persistentConnectorCount };
}

function sampleMeans(samples) {
  const keys = ['edgeCount', 'persistentBridgeCount', 'persistentArticulationCount', 'persistentConnectorCount'];
  const result = Object.fromEntries(keys.map(key => [key, describe(samples.map(sample => sample[key]).filter(Number.isFinite))]));
  const nodeCount = samples.reduce((sum, sample) => sum + sample.nodeCount, 0);
  const degreeSum = samples.reduce((sum, sample) => sum + sample.weightedDegreeSum, 0);
  result.weightedDegree = { n: nodeCount, mean: nodeCount ? degreeSum / nodeCount : null };
  return result;
}

function pairedSamples(observed, nullRun, scheduled, lifecycle, windowSeconds) {
  const observedByTick = new Map(observed.samples.map(sample => [sample.tick, sample]));
  assert.equal(observedByTick.size, nullRun.samples.length, 'matched sample counts');
  const scheduledJumps = scheduled.filter(boundary => boundary.changedLabels.length);
  const lifecycleJumps = lifecycle.filter(boundary => boundary.changedLabels.length);
  const groups = { all: [], scheduledExposed: [], lifecycleExposed: [], boundaryFree: [],
    lifecycleIdentityJumpExposed: [], identityJumpFree: [] };
  for (const sample of nullRun.samples) {
    assert.ok(observedByTick.has(sample.tick), 'matched sample tick ' + sample.tick);
    const before = sample.timeSeconds - windowSeconds;
    const hasBoundary = boundaries => boundaries.some(boundary => boundary.timeSeconds >= before - EPSILON
      && boundary.timeSeconds <= sample.timeSeconds + EPSILON);
    const scheduledHit = hasBoundary(scheduled), lifecycleHit = hasBoundary(lifecycle);
    const scheduledJumpHit = hasBoundary(scheduledJumps), lifecycleJumpHit = hasBoundary(lifecycleJumps);
    const observedSample = observedByTick.get(sample.tick);
    const row = { observed: sampleMetrics(observedSample), null: sampleMetrics(sample),
      observedNodeCount: observedSample.nodeCount, observedWeightedDegreeSum: observedSample.weightedDegreeSum,
      nullNodeCount: sample.nodeCount, nullWeightedDegreeSum: sample.weightedDegreeSum };
    groups.all.push(row);
    if (scheduledHit) groups.scheduledExposed.push(row);
    if (lifecycleHit) groups.lifecycleExposed.push(row);
    if (!scheduledHit && !lifecycleHit) groups.boundaryFree.push(row);
    if (lifecycleJumpHit) groups.lifecycleIdentityJumpExposed.push(row);
    if (!scheduledJumpHit && !lifecycleJumpHit) groups.identityJumpFree.push(row);
  }
  return Object.fromEntries(Object.entries(groups).map(([name, rows]) => [name, {
    n: rows.length,
    observed: sampleMeans(rows.map(row => ({ ...row.observed, nodeCount: row.observedNodeCount,
      weightedDegreeSum: row.observedWeightedDegreeSum }))),
    null: sampleMeans(rows.map(row => ({ ...row.null, nodeCount: row.nullNodeCount,
      weightedDegreeSum: row.nullWeightedDegreeSum }))),
    matchedDeltaNullMinusObserved: {
      edgeCount: describe(rows.map(row => row.null.edgeCount - row.observed.edgeCount)),
      persistentBridgeCount: describe(rows.map(row => row.null.persistentBridgeCount - row.observed.persistentBridgeCount)),
      persistentArticulationCount: describe(rows.map(row => row.null.persistentArticulationCount - row.observed.persistentArticulationCount)),
      persistentConnectorCount: describe(rows.map(row => row.null.persistentConnectorCount - row.observed.persistentConnectorCount)),
      weightedDegreePooled: (() => {
        const observedNodes = rows.reduce((sum, row) => sum + row.observedNodeCount, 0);
        const nullNodes = rows.reduce((sum, row) => sum + row.nullNodeCount, 0);
        const nullSum = rows.reduce((sum, row) => sum + row.nullWeightedDegreeSum, 0);
        const observedSum = rows.reduce((sum, row) => sum + row.observedWeightedDegreeSum, 0);
        const observedMean = observedNodes ? observedSum / observedNodes : null;
        const nullMean = nullNodes ? nullSum / nullNodes : null;
        return { observed: observedMean, null: nullMean,
          delta: observedMean !== null && nullMean !== null ? nullMean - observedMean : null,
          observedNodeTimeSamples: observedNodes, nullNodeTimeSamples: nullNodes };
      })()
    }
  }]));
}

function phaseMeans(observed, nullRun) {
  const obsByTick = new Map(observed.samples.map(sample => [sample.tick, sample]));
  return PHASE_BINS.map(phaseStartSeconds => {
    const values = nullRun.samples.filter(sample => sample.tick >= 300 && sample.tick < 36000
      && sample.tick % 300 / 60 >= phaseStartSeconds - EPSILON
      && sample.tick % 300 / 60 < phaseStartSeconds + 0.25 - EPSILON);
    const observedValues = values.map(sample => obsByTick.get(sample.tick));
    const mean = (items, key) => items.length ? items.reduce((sum, item) => sum + item[key], 0) / items.length : null;
    const pooledDegree = items => {
      const nodes = items.reduce((sum, item) => sum + item.nodeCount, 0);
      return nodes ? items.reduce((sum, item) => sum + item.weightedDegreeSum, 0) / nodes : null;
    };
    return { phaseStartSeconds, phaseEndSeconds: phaseStartSeconds + 0.25, n: values.length,
      edgeCountObservedMean: mean(observedValues, 'edgeCount'), edgeCountNullMean: mean(values, 'edgeCount'),
      edgeCountDelta: values.length ? mean(values, 'edgeCount') - mean(observedValues, 'edgeCount') : null,
      weightedDegreeObservedPooled: pooledDegree(observedValues), weightedDegreeNullPooled: pooledDegree(values),
      weightedDegreePooledDelta: values.length ? pooledDegree(values) - pooledDegree(observedValues) : null };
  });
}

function boundaryBlock(items) {
  const actualIdentityJumpBoundaryCount = items.filter(item => item.changedLabels.length > 0).length;
  return { boundaryCount: items.length, actualIdentityJumpBoundaryCount,
    membershipOnlyBoundaryCount: items.length - actualIdentityJumpBoundaryCount,
    remapCount: items.filter(item => item.type === 'BLOCK_REMAP').length,
    lifecycleRepairCount: items.filter(item => item.type === 'LIFECYCLE_REPAIR').length,
    changedLabelCount: items.reduce((sum, item) => sum + item.changedLabels.length, 0),
    mappingOnlyEntryExitCount: items.reduce((sum, item) => sum + item.changes.filter(change =>
      (change.oldBody == null) !== (change.newBody == null)).length, 0) };
}

export function boundaryAnalysis(runDetails, ledger, observedDetails) {
  const scheduled = boundariesOf(ledger, type => scheduledTypes.has(type));
  const lifecycle = boundariesOf(ledger, type => type === 'LIFECYCLE_REPAIR');
  const combined = [...scheduled, ...lifecycle];
  const lifecycleReport = boundaries => {
    const timeMatchedBoundaries = boundaries.map(boundary => ({ ...boundary, changedLabels: [] }));
    return { ledger: boundaryBlock(boundaries),
      rawEncounters: intervalSummary(runDetails.encounters, boundaries, item => item.endReason === 'right-censored'),
      windows: runDetails.windows.map(window => ({ windowSeconds: window.windowSeconds,
        eventCounts: eventBoundarySummary(window.events, boundaries),
        edgeLifetimes: intervalSummary(window.edgeLifetimes, boundaries, item => item.rightCensored),
        persistenceLifetimes: persistenceLifetimes(window.events, boundaries) })),
      observedAtSameTimes: {
        label: 'Time-matched observed-run control; observed identities do not jump at null remap times.',
        rawEncounters: intervalSummary(observedDetails.encounters, timeMatchedBoundaries,
          item => item.endReason === 'right-censored'),
        windows: runDetails.windows.map(window => {
          const observed = observedDetails.windows.find(item => item.windowSeconds === window.windowSeconds);
          assert.ok(observed, 'missing observed detail window ' + window.windowSeconds);
          return { windowSeconds: window.windowSeconds,
            eventCounts: eventBoundarySummary(observed.events, timeMatchedBoundaries),
            persistenceLifetimes: persistenceLifetimes(observed.events, timeMatchedBoundaries) };
        })
      }
    };
  };
  const matched = runDetails.windows.map(window => {
    const observed = observedDetails.windows.find(item => item.windowSeconds === window.windowSeconds);
    assert.ok(observed, 'missing observed detail window ' + window.windowSeconds);
    return { windowSeconds: window.windowSeconds,
      cohorts: pairedSamples(observed, window, scheduled, lifecycle, window.windowSeconds),
      scheduledBoundaryPhaseBins: phaseMeans(observed, window) };
  });
  return { definitions: { tickSeconds: TICK, directEncounterStartEnd: 'Within one 60 Hz tick of a boundary.',
    identityJumpCrossing: 'An interval spans a boundary where at least one relevant label maps from one non-null body to another.',
    relevantEventLabels: 'Relevant labels are only event antId/endpoints, listed from/to component members, and available incident-support edge keys. This does not inspect full graph support and cannot imply unaffected persistence.',
    persistenceLifetimes: 'Uses existing persistent BRIDGE_BREAK and ARTICULATION_BREAK events with non-null persistentSeconds, plus all CONNECTOR_END events. Actor association remains limited to event labels and does not establish full graph support.',
    timeBandIdentityExposure: 'Count an event when its onset/start-to-time interval spans any actual surviving-label jump, regardless of event actors. Exact and post-boundary W counts remain the primary timing associations.',
    postBoundaryBand: 'Event time is in (boundary, boundary + W]; exact-boundary events are reported separately; rolling sample exposure is [t-W, t].',
    weightedDegree: 'Pooled sum of weightedDegreeSum divided by pooled node-time count.',
    lifecycleOverlap: 'A window or event can be exposed to both scheduled remaps and lifecycle repairs; free cohort excludes both.',
    identityJumpCohorts: 'Identity-jump exposure requires a surviving label to move between two non-null bodies; identityJumpFree can still contain lifecycle turnover and persistent state carried into the window.',
    phaseBins: 'Scheduled BLOCK_REMAP phase from 0 through <5 seconds, in fixed 0.25 second bins.' },
    scheduled: lifecycleReport(scheduled), lifecycleRepairs: lifecycleReport(lifecycle),
    allIdentityBoundaries: lifecycleReport(combined), matchedRollingSamples: matched,
    exposureCaveat: 'At W=5 and W=20, scheduled remap exposure is expected to cover nearly all samples; empty boundary-free cohorts remain empty. Identity-jump-free excludes actual surviving-label jumps only and is not a washout for persistence state.' };
}

function selfcheck() {
  const boundary = { type: 'BLOCK_REMAP', tick: 300, timeSeconds: 5, changes: [
    { label: 'a', oldBody: 'body-1', newBody: 'body-2', jumpDistance: 0.2 },
    { label: 'b', oldBody: 'body-3', newBody: null, jumpDistance: null }] };
  const lifecycleBoundary = { type: 'LIFECYCLE_REPAIR', tick: 300, timeSeconds: 5, changes: [
    { label: 'a', oldBody: 'body-2', newBody: 'body-4', jumpDistance: 0.1 }] };
  const membershipBoundary = { type: 'LIFECYCLE_REPAIR', tick: 360, timeSeconds: 6, changes: [
    { label: 'c', oldBody: null, newBody: 'body-5', jumpDistance: null }] };
  const encounter = (startSeconds, endSeconds, antA, antB) => ({ startSeconds, endSeconds,
    durationSeconds: endSeconds - startSeconds, antA, antB, endReason: 'distance' });
  const sample = (tick, edgeCount, weightedDegreeSum, nodeCount = 2) => ({ tick, timeSeconds: tick / 60,
    nodeCount, edgeCount, weightedDegreeSum, persistentBridgeCount: 0,
    persistentArticulationCount: 0, persistentConnectorCount: 0 });
  const events = [{ type: 'EDGE_END', timeSeconds: 5, startSeconds: 4.9, antA: 'a', antB: 'z' },
    { type: 'COMPONENT_MERGE', timeSeconds: 5.1, onsetSeconds: 4.8,
      from: [['a', 'x'], ['b', 'y']], to: [['a', 'b', 'x', 'y']] },
    { type: 'BRIDGE_BREAK', timeSeconds: 5.1, onsetSeconds: 4.8, persistentSeconds: 4.95,
      antA: 'a', antB: 'z', durationSeconds: 0.3 },
    { type: 'ARTICULATION_BREAK', timeSeconds: 5.1, onsetSeconds: 4.8, persistentSeconds: 4.95,
      antId: 'z', durationSeconds: 0.3 },
    { type: 'CONNECTOR_END', timeSeconds: 5.1, onsetSeconds: 4.8, antId: 'a', durationSeconds: 0.3 }];
  const lifetimes = [{ startSeconds: 4.8, endSeconds: 5.2, durationSeconds: 0.4, antA: 'a', antB: 'z', rightCensored: false },
    { startSeconds: 6, endSeconds: 7, durationSeconds: 1, antA: 'x', antB: 'y', rightCensored: false }];
  const detail = { encounters: [encounter(4.99, 5.02, 'a', 'z'), encounter(6, 7, 'x', 'y')],
    windows: [{ windowSeconds: 0.25, events, edgeLifetimes: lifetimes,
      samples: [sample(297, 1, 2), sample(300, 2, 6)] }] };
  const observed = { encounters: [encounter(5, 5.01, 'a', 'z')], windows: [
    { windowSeconds: 0.25, events: [
      { type: 'EDGE_END', timeSeconds: 5, startSeconds: 4.9, antA: 'a', antB: 'z' },
      { type: 'COMPONENT_MERGE', timeSeconds: 5.1, onsetSeconds: 4.8,
        from: [['a', 'x'], ['b', 'y']], to: [['a', 'b', 'x', 'y']] }
    ], samples: [sample(297, 1, 2), sample(300, 1, 2)] }
  ] };
  const result = boundaryAnalysis(detail, [boundary, lifecycleBoundary, membershipBoundary], observed);
  const w = result.scheduled.windows[0];
  assert.equal(result.scheduled.rawEncounters.directStartCount, 1);
  assert.equal(result.scheduled.rawEncounters.identityJumpCrossingCount, 1);
  assert.equal(w.edgeLifetimes.completedIdentityJumpExposedDurations.count, 1);
  assert.equal(w.edgeLifetimes.completedIdentityJumpUnexposedDurations.count, 1);
  assert.equal(w.eventCounts.EDGE_END.exactBoundaryCount, 1);
  assert.equal(w.eventCounts.COMPONENT_MERGE.relevantLabelIntervalCrossingCount, 1);
  assert.equal(w.eventCounts.ARTICULATION_BREAK.relevantLabelIntervalCrossingCount, 0);
  assert.equal(w.eventCounts.ARTICULATION_BREAK.timeBandIdentityExposureCount, 1);
  assert.equal(w.persistenceLifetimes.bridge.identityJumpCrossingCount, 1);
  assert.equal(w.persistenceLifetimes.articulation.identityJumpCrossingCount, 0);
  assert.equal(w.persistenceLifetimes.connector.durations.count, 1);
  assert.equal(result.scheduled.observedAtSameTimes.windows[0].persistenceLifetimes.bridge.identityJumpCrossingCount, 0);
  assert.equal(result.scheduled.observedAtSameTimes.rawEncounters.directStartCount, 1);
  assert.equal(result.scheduled.observedAtSameTimes.rawEncounters.directEndCount, 1);
  assert.equal(result.scheduled.observedAtSameTimes.rawEncounters.identityJumpCrossingCount, 0);
  assert.equal(result.scheduled.observedAtSameTimes.windows[0].eventCounts.EDGE_END.exactBoundaryCount, 1);
  assert.equal(result.scheduled.observedAtSameTimes.windows[0].eventCounts.COMPONENT_MERGE.postBoundaryBandCounts[0.25], 1);
  assert.equal(result.matchedRollingSamples[0].cohorts.scheduledExposed.n, 1);
  assert.equal(result.matchedRollingSamples[0].cohorts.boundaryFree.n, 1);
  assert.equal(result.matchedRollingSamples[0].cohorts.scheduledExposed.matchedDeltaNullMinusObserved.edgeCount.mean, 1);
  assert.equal(result.matchedRollingSamples[0].scheduledBoundaryPhaseBins[0].n, 1);
  assert.equal(result.matchedRollingSamples[0].cohorts.lifecycleExposed.n, 1);
  assert.equal(result.matchedRollingSamples[0].cohorts.lifecycleIdentityJumpExposed.n, 1);
  assert.equal(result.matchedRollingSamples[0].cohorts.identityJumpFree.n, 1);
  assert.equal(result.scheduled.ledger.actualIdentityJumpBoundaryCount, 1);
  assert.equal(result.scheduled.ledger.membershipOnlyBoundaryCount, 0);
  assert.equal(result.lifecycleRepairs.ledger.actualIdentityJumpBoundaryCount, 1);
  assert.equal(result.lifecycleRepairs.ledger.membershipOnlyBoundaryCount, 1);
  console.log('ant-social-identity-boundaries selfcheck passed');
}

if (process.argv[1] && process.argv[1].endsWith('ant-social-identity-boundaries.js')
  && process.argv.includes('--selfcheck')) selfcheck();
