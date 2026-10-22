import test from 'node:test';
import assert from 'node:assert/strict';
import { runRouteCurvatureSelectorSurvey } from '../scripts/ant-route-curvature-selector.js';

const survey = runRouteCurvatureSelectorSurvey();

test('unchanged TrailPlateBirth selects source-connected controlled curves and preserves its principal path', () => {
  const fixtures = survey.syntheticConnectedRouteFixtures;
  assert.deepEqual(fixtures.map(item => item.name), ['straight', 'gentle-arc', 'tighter-arc', 's-route']);
  for (const item of fixtures) {
    assert.equal(item.candidatePathMatchesDescriptorPrincipalPath, true, item.name);
    assert.equal(item.fixture.supportedCells, item.fixture.chemicalQualifiedCells, item.name);
    assert.ok(item.source.index >= 0 && item.target.index >= 0, item.name);
    assert.ok(item.sourceAnnulusRadius >= item.fixture.sourceAnnulusRadii[0]
      && item.sourceAnnulusRadius <= item.fixture.sourceAnnulusRadii[1], item.name);
    assert.ok(item.targetEdgeDistance <= item.fixture.observationBoundaryDistance, item.name);
    assert.ok(item.productionGeodesicLength >= 0.30, item.name);
    assert.equal(item.candidatePath.pathLength, item.descriptorPrincipalPath.pathLength, item.name);
    assert.equal(item.descriptorCenterlineNetwork.edgeCount, item.descriptorCenterlineNetwork.nodeCount - 1, item.name);
  }
  assert.ok(fixtures[0].descriptorPrincipalPath.tortuosity < fixtures[1].descriptorPrincipalPath.tortuosity);
  assert.ok(fixtures[1].descriptorPrincipalPath.tortuosity < fixtures[2].descriptorPrincipalPath.tortuosity);
  for (const item of fixtures.slice(1)) {
    const raw = item.smoothingScalesWorldUnits[0].smoothedAbsoluteTurnPerWorldUnit;
    const broad = item.smoothingScalesWorldUnits.at(-1).smoothedAbsoluteTurnPerWorldUnit;
    assert.ok(broad < raw, `${item.name}: fixed physical smoothing reduces raster-turn inflation`);
  }
});

test('default field-deposit probes keep grid-alignment qualification visible', () => {
  const probes = survey.defaultDepositQualificationProbe;
  assert.equal(probes.length, 8);
  assert.ok(probes.every(item => item.fieldQualification.includes('real PheromoneField.depositSegment')));
  for (const name of ['straight', 'gentle-arc', 'tighter-arc', 's-route']) {
    const center = probes.find(item => item.name === name && item.baseX === 0.5);
    const cellAligned = probes.find(item => item.name === name && item.baseX === 0.504);
    assert.ok(center && cellAligned);
    assert.ok(center.chemicalQualifiedCells > 0 && center.supportedCells > 0, name);
    assert.ok(cellAligned.chemicalQualifiedCells > 0 && cellAligned.supportedCells > 0, name);
    assert.equal(center.birth, name === 'straight', `${name}: exact half-cell alignment outcome`);
    assert.equal(cellAligned.birth, true, `${name}: one-cell-aligned outcome`);
  }
});
