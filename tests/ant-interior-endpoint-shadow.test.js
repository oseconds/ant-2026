import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { makeDiagnosticSelector } from '../scripts/ant-morphology-replay.js';
import { createShadowTemporalQualifier } from '../scripts/ant-morphology-shadow-temporal.js';

const SIZE = 96;
const CELL_COUNT = SIZE * SIZE;

test('production and shadow selectors retain the same qualifying source-connected interior endpoint', async () => {
  const source = await readFile(new URL('../src/lib/agents/ant/TrailPlateBirth.js', import.meta.url), 'utf8');
  const selectors = await makeDiagnosticSelector(source);
  const mask = new Uint8Array(CELL_COUNT), supports = new Float32Array(CELL_COUNT), chemical = new Float32Array(CELL_COUNT);
  vertical(mask, 48, 0, 80);
  horizontal(mask, 48, 80, 45);
  const original = Buffer.from(mask);
  const production = selectors.selectCandidateDiagnostic(mask, supports, chemical, {});
  const shadowFunnel = {};
  const shadow = selectors.selectCandidateShadowDiagnostic(mask, supports, chemical, shadowFunnel);
  const branchEndpoint = 45 * SIZE + 80;

  assert.ok(production);
  assert.ok(shadow);
  assert.equal(shadow.source.index, production.source.index);
  assert.ok(production.skeletonIndices.includes(branchEndpoint));
  assert.ok(shadow.skeletonIndices.includes(branchEndpoint));
  assert.deepEqual(shadow.skeletonIndices, production.skeletonIndices);
  assert.deepEqual(shadow.path, production.path);
  assert.ok(shadowFunnel.components.some(component => component.interiorEndpointIndices.includes(branchEndpoint)));
  assert.ok(Buffer.from(mask).equals(original));
});

test('shadow selector can admit a qualifying interior-only route while production remains null', async () => {
  const source = await readFile(new URL('../src/lib/agents/ant/TrailPlateBirth.js', import.meta.url), 'utf8');
  const selectors = await makeDiagnosticSelector(source);
  const mask = new Uint8Array(CELL_COUNT), supports = new Float32Array(CELL_COUNT), chemical = new Float32Array(CELL_COUNT);
  horizontal(mask, 40, 90, 68);
  const production = selectors.selectCandidateDiagnostic(mask, supports, chemical, {});
  const shadow = selectors.selectCandidateShadowDiagnostic(mask, supports, chemical, {});

  assert.equal(production, null);
  assert.ok(shadow);
  assert.ok(shadow.geodesicLength >= 0.30);
  assert.equal(shadow.target.x, 90 / 95);
});

test('shadow temporal state applies persistence, global gap, refractory, and new-contact gates independently', async () => {
  const source = await readFile(new URL('../src/lib/agents/ant/TrailPlateBirth.js', import.meta.url), 'utf8');
  const { corridorSimilarityDiagnostic } = await makeDiagnosticSelector(source);
  const qualifier = createShadowTemporalQualifier(corridorSimilarityDiagnostic);
  const productionState = { lastBirthTimeMs: null, plates: [] };
  const mask = new Uint8Array(CELL_COUNT);
  mask[100] = 1;
  const candidate = { mask, path: [100, 101], geodesicLength: 0.4 };
  const contacts = new Uint32Array(CELL_COUNT);

  let last;
  for (let second = 1; second <= 21; second += 1) last = qualifier.advance(candidate, second * 1000, contacts);
  assert.equal(last.stableSeconds, 20);
  assert.equal(last.persistenceQualified, true);
  assert.equal(last.virtualBirth, true);
  assert.equal(last.virtualBirthCount, 1);

  const insideGlobalGap = qualifier.advance(candidate, 25_000, contacts);
  assert.equal(insideGlobalGap.globalGapOpen, false);
  assert.equal(insideGlobalGap.virtualBirth, false);

  contacts[100] = 29;
  const atRefractoryEnd = qualifier.advance(candidate, 111_000, contacts);
  assert.equal(atRefractoryEnd.sameCorridorRefractoryOpen, true);
  assert.equal(atRefractoryEnd.enoughNewFootContacts, false);
  assert.equal(atRefractoryEnd.virtualBirth, false);

  contacts[100] = 30;
  const ready = qualifier.advance(candidate, 112_000, contacts);
  assert.equal(ready.enoughNewFootContacts, true);
  assert.equal(ready.virtualBirth, true);
  assert.equal(ready.virtualBirthCount, 2);
  const isolated = createShadowTemporalQualifier(corridorSimilarityDiagnostic)
    .advance(candidate, 112_000, contacts);
  assert.equal(isolated.stableSeconds, 0);
  assert.equal(isolated.virtualBirthCount, 0);
  assert.deepEqual(productionState, { lastBirthTimeMs: null, plates: [] });
});

function vertical(mask, x, y1, y2) {
  for (let y = y1; y <= y2; y += 1) mask[y * SIZE + x] = 1;
}

function horizontal(mask, x1, x2, y) {
  for (let x = x1; x <= x2; x += 1) mask[y * SIZE + x] = 1;
}
