import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMaterialIdentity } from '../src/lib/renderers/antMaterialIdentity.js';

function material({ id = 'plate-a', birth = 1, angle = 0, top = true } = {}) {
  const mask = new Uint8Array(96 * 96);
  for (let y = 25; y <= 70; y += 1) for (let x = 15; x <= 80; x += 1) mask[y * 96 + x] = 1;
  const topLayerByCell = new Int32Array(96 * 96).fill(-1);
  if (top) for (let i = 0; i < mask.length; i += 1) if (mask[i]) topLayerByCell[i] = 0;
  const left = 48 * 96 + 18, right = 48 * 96 + 78;
  return { plates: [{ id, bornAtSimulationTimeMs: birth, grid: { width: 96, height: 96 }, mask,
    centerline: [{ index: left, x: 18 / 95, y: 48 / 95, halfWidth: 0.08 },
      { index: right, x: 78 / 95, y: 48 / 95, halfWidth: 0.08 }],
    edges: [[left, right]], principalPath: [left, right] }],
  stratigraphy: { topLayerByCell } };
}

test('material identity is deterministic and does not use Math.random', () => {
  const input = material();
  const random = Math.random;
  Math.random = () => { throw new Error('unexpected random call'); };
  try {
    const a = buildMaterialIdentity(input, 160, 160, 'identity-fine-shuffled');
    const b = buildMaterialIdentity(input, 160, 160, 'identity-fine-shuffled');
    assert.deepEqual(a, b);
  } finally { Math.random = random; }
});

test('registered and shuffled fine modes retain nominal mark count and dimensions', () => {
  const input = material();
  const branch = 70 * 96 + 48;
  input.plates[0].centerline.push({ index: branch, x: 48 / 95, y: 70 / 95 });
  input.plates[0].edges.push([48 * 96 + 18, branch]);
  const registered = buildMaterialIdentity(input, 640, 640, 'identity-fine-registered');
  const shuffled = buildMaterialIdentity(input, 640, 640, 'identity-fine-shuffled');
  assert.equal(registered.primitives.length, shuffled.primitives.length);
  assert.ok(registered.primitives.length > 100);
  assert.ok(registered.primitives.some(p => Math.abs(p.y - 96) > 20), '2D mask anchors extend away from the principal path');
  assert.ok(registered.primitives.every(p => p.length === 4 && p.width === 1 && p.spacing === 4));
  assert.deepEqual(registered.stats.nominalAngleHistogram, shuffled.stats.nominalAngleHistogram);
  assert.notDeepEqual(registered.primitives.map(p => p.angle), shuffled.primitives.map(p => p.angle));
});

test('coarse mode scales all marks by three', () => {
  const result = buildMaterialIdentity(material(), 640, 640, 'identity-coarse-shuffled');
  assert.ok(result.primitives.length > 0);
  assert.ok(result.primitives.every(p => p.length === 12 && p.width === 3 && p.spacing === 12));
});

test('buried material leaves no pixels and invalid occupied references throw', () => {
  const buried = buildMaterialIdentity(material({ top: false }), 96, 96, 'identity-fine-registered');
  assert.ok(buried.pixels.every(value => value === 0));
  const bad = material();
  bad.stratigraphy.topLayerByCell[0] = 2;
  assert.throws(() => buildMaterialIdentity(bad, 96, 96, 'identity-fine-registered'), /plate/i);
  assert.throws(() => buildMaterialIdentity(material(), 96, 96, 'unknown'), /mode/i);
});

test('anchors stay on the immutable footprint and unrelated geometry cannot perturb a plate', () => {
  const input = material();
  const before = buildMaterialIdentity(input, 192, 192, 'identity-fine-shuffled');
  assert.ok(before.primitives.every(p => input.plates[0].mask[
    Math.floor(p.y / 192 * 96) * 96 + Math.floor(p.x / 192 * 96)]));
  const added = material({ id: 'plate-b', birth: 2 });
  added.plates[0].mask.fill(0);
  for (let y = 2; y <= 14; y += 1) for (let x = 2; x <= 14; x += 1) added.plates[0].mask[y * 96 + x] = 1;
  const first = 2 * 96 + 2, last = 14 * 96 + 14;
  added.plates[0].centerline = [{ index: first, x: 2 / 95, y: 2 / 95 }, { index: last, x: 14 / 95, y: 14 / 95 }];
  added.plates[0].edges = [[first, last]]; added.plates[0].principalPath = [first, last];
  const expanded = { plates: [...input.plates, added.plates[0]],
    stratigraphy: { topLayerByCell: new Int32Array(input.stratigraphy.topLayerByCell) } };
  for (let i = 0; i < expanded.stratigraphy.topLayerByCell.length; i += 1) {
    if (added.plates[0].mask[i] && expanded.stratigraphy.topLayerByCell[i] < 0) expanded.stratigraphy.topLayerByCell[i] = 1;
  }
  const after = buildMaterialIdentity(expanded, 192, 192, 'identity-fine-shuffled');
  assert.deepEqual(after.primitives.filter(p => p.plateIndex === 0), before.primitives);
  assert.ok(after.pixels.some((value, index) => index % 4 === 3 && value > 0));
});

test('renderer leaves inputs unchanged and rejects non-finite or out-of-domain paths', () => {
  const input = material();
  const before = structuredClone(input);
  buildMaterialIdentity(input, 96, 96, 'identity-fine-registered');
  assert.deepEqual(input, before);
  const invalid = material(); invalid.plates[0].centerline[0].x = Number.NaN;
  assert.throws(() => buildMaterialIdentity(invalid, 96, 96, 'identity-fine-registered'), /edge/i);
  const outside = material(); outside.plates[0].centerline[0].x = 2;
  assert.throws(() => buildMaterialIdentity(outside, 96, 96, 'identity-fine-registered'), /edge/i);
  assert.throws(() => buildMaterialIdentity(input, 0, 96, 'identity-fine-registered'), /width/i);
});

test('nearest graph edge sets direction even when it is outside the principal path', () => {
  const input = material();
  const branch = 75 * 96 + 48;
  const junction = 48 * 96 + 48;
  input.plates[0].centerline.push({ index: junction, x: 48 / 95, y: 48 / 95 });
  input.plates[0].centerline.push({ index: branch, x: 48 / 95, y: 75 / 95 });
  input.plates[0].edges.push([junction, branch]);
  const result = buildMaterialIdentity(input, 640, 640, 'identity-fine-registered');
  assert.ok(result.primitives.some(p => p.x > 310 && p.x < 330 && p.y > 400 && Math.abs(p.angle - Math.PI / 2) < 0.01));
});

test('coarse shuffled angles approximately preserve the fine orientation distribution', () => {
  const input = material();
  const branch = 70 * 96 + 48;
  const junction = 48 * 96 + 48;
  input.plates[0].centerline.push({ index: junction, x: 48 / 95, y: 48 / 95 });
  input.plates[0].centerline.push({ index: branch, x: 48 / 95, y: 70 / 95 });
  input.plates[0].edges.push([junction, branch]);
  const fine = buildMaterialIdentity(input, 160, 160, 'identity-fine-registered');
  const coarse = buildMaterialIdentity(input, 160, 160, 'identity-coarse-shuffled');
  const a = fine.stats.nominalAngleHistogram, b = coarse.stats.nominalAngleHistogram;
  assert.ok(b.reduce((sum, n) => sum + n, 0) > 0);
  assert.ok(a.every((count, i) => Math.abs(count / fine.primitives.length - b[i] / coarse.primitives.length) < 0.08));
});

test('changing a fully buried plate direction cannot change visible identity', () => {
  const lower = material();
  const upper = material({ id: 'plate-top', birth: 2, angle: 0.35 });
  const top = new Int32Array(lower.stratigraphy.topLayerByCell);
  for (let i = 0; i < top.length; i += 1) if (lower.plates[0].mask[i]) top[i] = 1;
  const a = { plates: [lower.plates[0], upper.plates[0]], stratigraphy: { topLayerByCell: top } };
  const b = structuredClone(a);
  for (const node of b.plates[0].centerline) node.y = Math.min(0.99, node.x);
  assert.deepEqual([...buildMaterialIdentity(a, 160, 160, 'identity-fine-shuffled').pixels],
    [...buildMaterialIdentity(b, 160, 160, 'identity-fine-shuffled').pixels]);
});

test('clipped contribution statistics count marks whose centers are hidden without changing pixels', () => {
  const lower = material();
  const upper = structuredClone(lower.plates[0]);
  upper.id = 'plate-top'; upper.bornAtSimulationTimeMs = 2;
  const top = new Int32Array(lower.stratigraphy.topLayerByCell);
  for (let y = 25; y <= 70; y += 1) for (let x = 47; x <= 80; x += 1) top[y * 96 + x] = 1;
  const result = buildMaterialIdentity({ plates: [lower.plates[0], upper], stratigraphy: { topLayerByCell: top } },
    640, 640, 'identity-fine-registered');
  const clipped = result.primitives.find(p => p.plateIndex === 0 && p.x === 314 && p.y === 322);
  assert.ok(clipped);
  assert.equal(clipped.exposedCenter, false);
  assert.ok(clipped.clippedSampleCount > 0);
  assert.equal(result.stats.visibleCenterAngleHistogram.reduce((a, b) => a + b, 0), result.stats.visibleCenterCount);
  assert.equal(result.stats.clippedContributionAngleWeights.reduce((a, b) => a + b, 0),
    result.primitives.reduce((sum, p) => sum + p.clippedSampleCount, 0));
  let hash = 2166136261;
  for (const byte of result.pixels) hash = Math.imul(hash ^ byte, 16777619);
  assert.equal(hash >>> 0, 1867545541, 'statistics do not alter the established pixel output');
});
