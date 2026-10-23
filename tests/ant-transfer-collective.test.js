import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeCollectiveRouteletAnchors,
  analyzeCollectiveRoutes,
  renderAnchorRepresentativeSvg,
  sourceTrajectoryFrameToSamples
} from '../scripts/ant-transfer-collective.js';

function addRoutelet(samples, id, startTick, points) {
  points.forEach(([x, y], offset) => samples.push({ id, sampleIndex: startTick + offset, x, y }));
}

function arcPoints(radius = 0.05, reverse = false) {
  const points = Array.from({ length: 11 }, (_, index) => {
    const angle = index * Math.PI / 20;
    return [0.1 + radius * Math.cos(angle), 0.1 + radius * Math.sin(angle)];
  });
  return reverse ? points.reverse() : points;
}

function resultForPair(first, second, firstTick = 0, secondTick = 20) {
  const samples = [];
  addRoutelet(samples, 'ant-a', firstTick, first);
  addRoutelet(samples, 'ant-b', secondTick, second);
  return analyzeCollectiveRoutes(samples);
}

test('distinct ants reuse a one-second curved routelet across a separated reverse-direction pass', () => {
  const samples = [];
  addRoutelet(samples, 'ant-a', 0, arcPoints());
  addRoutelet(samples, 'ant-b', 20, arcPoints(0.05, true));
  const result = analyzeCollectiveRoutes(samples);
  assert.equal(result.routeletCount, 2);
  assert.equal(result.sampleCount, 22);
  assert.equal(result.distinctRouteletAntCount, 2);
  assert.equal(result.comparisonCount, 1);
  assert.equal(result.scales['0.012'].candidatePairCount, 1);
  assert.equal(result.scales['0.012'].distinctCandidateAntPairCount, 1);
  assert.equal(analyzeCollectiveRouteletAnchors(samples).scales['0.012'].candidatePairCount, 1);
  const pair = result.scales['0.012'].representatives[0];
  assert.equal(pair.temporalGapSeconds, 1);
  for (const scale of ['0.012', '0.024']) {
    const metrics = result.scales[scale].representatives[0];
    assert.ok(metrics.firstToSecond.overlapFraction > 0.99);
    assert.ok(metrics.secondToFirst.overlapFraction > 0.99);
    assert.ok(metrics.firstToSecond.tangentAxisAngleRadians < 1e-8);
    assert.ok(metrics.firstToSecond.directedTangentCosine < -0.99);
    assert.equal(metrics.firstToSecond.curvatureSignAgreementFraction, 1);
    assert.ok(metrics.firstToSecond.curvatureMatchedSamples >= 3);
  }
  assert.equal(result.scales['0.012'].candidateGeometry.firstToSecondCurvatureSignAgreementFraction.p50, 1);
  assert.ok(result.scales['0.012'].candidateGeometry.firstToSecondOverlapFraction.p50 > 0.99);
});

test('gentle shared arcs remain candidates and report their integrated turns', () => {
  const result = resultForPair(arcPoints(0.25), arcPoints(0.25, true));
  const pair = result.scales['0.024'].representatives[0];
  assert.ok(pair);
  assert.ok(Math.abs(pair.first.signedTravelTurnRadians - Math.PI * 0.45) < 1e-8);
  assert.ok(Math.abs(pair.second.netTurnRadians + Math.PI * 0.45) < 1e-8);
  assert.ok(pair.first.maximumChordDeviationNormalizedUnits > 0.01);
  assert.ok(pair.firstToSecond.curvatureMatchedRunLengths.includes(10));
  assert.ok(Math.abs(pair.first.absoluteTravelTurnRadians - pair.first.signedTravelTurnRadians) < 1e-8);
});

test('straight parallel routes can overlap but do not count as curved reuse', () => {
  const first = Array.from({ length: 11 }, (_, index) => [index * 0.01, 0.2]);
  const second = first.map(([x]) => [x, 0.206]);
  const result = resultForPair(first, second);
  assert.equal(result.comparisonCount, 1);
  assert.equal(result.scales['0.012'].candidatePairCount, 0);
});

test('matching microscopic jitter exposes the screen false-positive limit', () => {
  const jitter = [0, 1, -1, 1, -1, 1, -1, 1, -1, 1, 0].map(value => value * 0.00005);
  const first = jitter.map((y, index) => [index * 0.01, 0.2 + y]);
  const second = jitter.map((y, index) => [index * 0.01, 0.206 + y]);
  const result = resultForPair(first, second);
  const pair = result.scales['0.012'].representatives[0];
  assert.ok(pair.first.absoluteTravelTurnRadians > 0);
  assert.ok(pair.first.maximumChordDeviationNormalizedUnits < 0.0012);
  assert.ok(pair.first.curvatureSupportSegmentIndices.length >= 3);
  assert.equal(pair.firstToSecond.curvatureSignAgreementFraction, 1);
  assert.equal(result.scales['0.012'].candidatePairCount, 1);
  const anchorResult = analyzeCollectiveRouteletAnchors([
    ...first.map(([x, y], index) => ({ id: 'ant-a', sampleIndex: index, x, y })),
    ...second.map(([x, y], index) => ({ id: 'ant-b', sampleIndex: index + 20, x, y }))
  ]);
  assert.equal(anchorResult.scales['0.012'].candidatePairCount, 1);
  assert.ok(anchorResult.scales['0.012'].representative.anchor.maximumChordDeviationNormalizedUnits < 0.0012);
});

test('one independent crossing cannot satisfy sustained overlap', () => {
  const vertical = Array.from({ length: 11 }, (_, index) => [0.05, -0.05 + index * 0.01]);
  const horizontal = Array.from({ length: 11 }, (_, index) => [index * 0.01, 0]);
  const result = resultForPair(vertical, horizontal);
  assert.equal(result.scales['0.024'].candidatePairCount, 0);
});

test('independent deterministic zigzags fail local route agreement', () => {
  const firstY = [0, 0.006, -0.003, 0.008, -0.005, 0.004, -0.008, 0.003, -0.006, 0.007, 0];
  const secondY = [0, -0.005, 0.008, -0.002, 0.006, -0.007, 0.004, -0.009, 0.005, -0.003, 0];
  const first = firstY.map((y, index) => [index * 0.01, y]);
  const second = secondY.map((y, index) => [index * 0.01, y]);
  const result = resultForPair(first, second);
  assert.equal(result.comparisonCount, 1);
  assert.equal(result.scales['0.024'].candidatePairCount, 0);
});

test('candidate recurrence gaps count unique later windows within an unordered ant pair', () => {
  const samples = [];
  addRoutelet(samples, 'ant-a', 0, arcPoints());
  addRoutelet(samples, 'ant-b', 20, arcPoints(0.05, true));
  addRoutelet(samples, 'ant-a', 40, arcPoints());
  const result = analyzeCollectiveRoutes(samples);
  const summary = result.scales['0.012'];
  assert.equal(summary.candidatePairCount, 2);
  assert.equal(summary.distinctCandidateAntPairCount, 1);
  assert.equal(summary.laterCandidateOccurrencesPerAntPair.maximum, 2);
  assert.equal(summary.recurrenceGapSecondsWithinAntPair.p50, 2);
});

test('one fixed arc anchor records distinct partner ants and temporal support', () => {
  const samples = [];
  addRoutelet(samples, 'ant-a', 0, arcPoints());
  addRoutelet(samples, 'ant-b', 20, arcPoints(0.05, true));
  addRoutelet(samples, 'ant-c', 40, arcPoints());
  addRoutelet(samples, 'ant-d', 60, arcPoints(0.05, true));

  const result = analyzeCollectiveRouteletAnchors(samples);
  const summary = result.scales['0.012'];
  assert.equal(summary.candidatePairCount, 6);
  assert.equal(summary.anchorPartnerEventCount, 12);
  assert.equal(summary.anchors.withAtLeastOnePartnerCount, 4);
  assert.equal(summary.anchors.partnerCountThresholds['>=2'], 4);
  assert.equal(summary.anchors.partnerCountThresholds['>=3'], 4);
  assert.equal(summary.anchors.partnerCountThresholds['>=5'], 0);

  const representative = summary.representative;
  assert.equal(representative.anchor.id, 'ant-a');
  assert.equal(representative.anchor.startSeconds, 0);
  assert.equal(representative.distinctPartnerAntCount, 3);
  assert.deepEqual(representative.partners.map(partner => partner.id), ['ant-b', 'ant-c', 'ant-d']);
  assert.equal(representative.partnerStartTimeSpanSeconds, 4);
  const events = representative.partners.flatMap(partner => partner.events);
  assert.deepEqual(events.map(event => event.signedStartOffsetSeconds), [2, 4, 6]);
  assert.deepEqual(events.map(event => event.intervalGapSeconds), [1, 3, 5]);
  assert.ok(representative.anchor.absoluteTravelTurnRadians > 0);
  assert.ok(representative.anchor.maximumChordDeviationNormalizedUnits > 0);
  assert.equal(representative.partners[0].earliestMatch.routelet.polylineNormalizedUnits.length, 11);
  assert.ok(summary.candidateGeometryPerAnchorPartnerEvent.anchorAbsoluteTravelTurnRadians.p50 > 0);
});

test('repeated matches by one ant pair in separate regions do not create fixed-anchor multispecies support', () => {
  const samples = [];
  const near = arcPoints();
  const far = arcPoints().map(([x, y]) => [x + 0.6, y + 0.6]);
  addRoutelet(samples, 'ant-a', 0, near);
  addRoutelet(samples, 'ant-b', 20, near.slice().reverse());
  addRoutelet(samples, 'ant-a', 40, far);
  addRoutelet(samples, 'ant-b', 60, far.slice().reverse());

  const pairSummary = analyzeCollectiveRoutes(samples).scales['0.012'];
  const anchorSummary = analyzeCollectiveRouteletAnchors(samples).scales['0.012'];
  assert.equal(pairSummary.candidatePairCount, 2);
  assert.equal(pairSummary.distinctCandidateAntPairCount, 1);
  assert.equal(pairSummary.antPairsWithMultipleCandidateComparisons, 1);
  assert.equal(anchorSummary.candidatePairCount, 2);
  assert.equal(anchorSummary.anchors.partnerCountThresholds['>=2'], 0);
  assert.equal(anchorSummary.anchors.withAtLeastOnePartnerCount, 4);
});

test('fixed-anchor SVG shows the shared world frame, inset, times, and actual polylines', () => {
  const samples = [];
  addRoutelet(samples, 'ant<&-a', 0, arcPoints());
  addRoutelet(samples, 'ant-b', 20, arcPoints(0.05, true));
  addRoutelet(samples, 'ant-c', 40, arcPoints());
  const representative = analyzeCollectiveRouteletAnchors(samples).scales['0.012'].representative;
  const svg = renderAnchorRepresentativeSvg(representative, {
    caseLabel: 'synthetic-case', windowLabel: '0-10s', scaleNormalizedUnits: 0.012
  });
  assert.match(svg, /World view: normalized coordinates \[0,1\] × \[0,1\]/);
  assert.match(svg, /Local inset/);
  assert.match(svg, /ant&lt;&amp;-a/);
  assert.match(svg, /0\.0–1\.0 s/);
  assert.match(svg, /<polyline/);
});

test('same-ant replay and simultaneous distinct-ant routelets are excluded', () => {
  const arc = arcPoints();
  const sameAgent = [];
  addRoutelet(sameAgent, 'ant-a', 0, arc);
  addRoutelet(sameAgent, 'ant-a', 20, arc);
  assert.equal(analyzeCollectiveRoutes(sameAgent).comparisonCount, 0);

  const simultaneous = [];
  addRoutelet(simultaneous, 'ant-a', 0, arc);
  addRoutelet(simultaneous, 'ant-b', 0, arc);
  assert.equal(analyzeCollectiveRoutes(simultaneous).comparisonCount, 0);
});

test('rejects malformed and duplicate samples; gaps do not get interpolated', () => {
  assert.throws(() => analyzeCollectiveRoutes([{ id: 'a', sampleIndex: 0, x: NaN, y: 0 }]), /finite x\/y/);
  assert.throws(() => analyzeCollectiveRoutes([
    { id: 'a', sampleIndex: 0, x: 0, y: 0 }, { id: 'a', sampleIndex: 0, x: 1, y: 0 }
  ]), /Duplicate sample/);
  const samples = [];
  addRoutelet(samples, 'ant-a', 0, arcPoints().slice(0, 10));
  addRoutelet(samples, 'ant-b', 20, arcPoints());
  const result = analyzeCollectiveRoutes(samples);
  assert.equal(result.routeletCount, 1);
  assert.equal(result.comparisonCount, 0);
});

test('source 10 Hz rows map simulation tick 6 to sample index 1', () => {
  assert.deepEqual(sourceTrajectoryFrameToSamples({
    tick: 6, agents: [['ant-1', 0.2, 0.3, -1.1]]
  }), [{ id: 'ant-1', sampleIndex: 1, x: 0.2, y: 0.3 }]);
  assert.throws(() => sourceTrajectoryFrameToSamples({ tick: 7, agents: [] }), /divisible by six/);
});
