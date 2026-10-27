import test from 'node:test';
import assert from 'node:assert/strict';
import { physicalCell, displayCell, ownerAt, summarizeHistory, createRouteObserver }
  from '../scripts/ant-material-contact-prerequisite.js';

function material(ids, cells) {
  const top = new Int32Array(96 * 96).fill(-1);
  for (const [cell, owner] of cells) top[cell] = owner;
  return { plates: ids.map(id => ({ id })), stratigraphy: { topLayerByCell: top } };
}

test('physical node and canonical display support can disagree at a real in-domain coordinate', () => {
  const position = { x: 0.1, y: 0.5 };
  assert.equal(physicalCell(position), 48 * 96 + 10);
  assert.equal(displayCell(position), 48 * 96 + 9);
  assert.equal(displayCell({ x: 1, y: 1 }), 96 * 96 - 1);
});

test('history keeps event-time Plate ownership when a new Plate replaces the exposed top', () => {
  const position = { x: 0.5, y: 0.5 }, cell = physicalCell(position);
  const exposed = material(['old', 'new'], [[cell, 0]]);
  const buried = material(['old', 'new'], [[cell, 1]]);
  const strikes = [{ payload: { plateId: 'old', position } }], field = { sample: () => 0 };
  assert.equal(ownerAt(exposed, cell), 'old');
  const before = summarizeHistory(strikes, exposed, field), after = summarizeHistory(strikes, buried, field);
  assert.equal(before.noLongerExposedOnOriginalPlate, 0);
  assert.equal(after.noLongerExposedOnOriginalPlate, 1);
  assert.equal(before.stillExposedZeroMappedScalarSamples, 1);
  assert.equal(after.stillExposedZeroMappedScalarSamples, 0);
  assert.equal(after.uniqueNativePointBins, 1);
});

test('real bridge observer posts only exposed feet, preserves order/inputs and stays independent of Off gate', async () => {
  const rows = [], observer = await createRouteObserver({ sink: row => rows.push(row) });
  const center = { x: 0.5, y: 0.5 }, unsupported = { x: 0.1, y: 0.1 };
  const mask = new Array(96 * 96).fill(0); mask[physicalCell(center)] = 1;
  const plate = { id: 'one', bornAtSimulationTimeMs: 0, grid: { width: 96, height: 96 }, mask,
    edges: [], pickups: [center, center], material: { stiffness: 0.9, density: 1.1, damping: 0.35 } };
  const top = new Int32Array(96 * 96).fill(-1); top[physicalCell(center)] = 0;
  const counts = new Uint16Array(96 * 96); counts[physicalCell(center)] = 1;
  observer.wrapper.syncMaterial({ width: 96, height: 96, revision: 1, noduleRevision: 0, plates: [plate], nodules: [],
    stratigraphy: { version: 1, revision: 1, layerOrder: ['one'], topLayerByCell: top, layerCountByCell: counts } });
  const event = { type: 'FOOT_CONTACT', strength: 0.04, contacts: [{ legId: 'FL' }, { legId: 'MR' }] };
  const responses = [center, unsupported].map((position, index) => ({ legId: index ? 'MR' : 'FL', position,
    hardness: 0.5, footprintRadius: 0.01, strengthTransfer: 1 }));
  const before = JSON.stringify({ event, responses });
  assert.equal(observer.wrapper.handleFootContact(event, { responses }), true);
  assert.equal(JSON.stringify({ event, responses }), before);
  assert.equal(rows[0].posts.length, 1);
  assert.equal(rows[0].posts[0].plateId, 'one');
  assert.deepEqual(rows[0].resolutions.map(row => row.plateId), ['one', null]);
  assert.equal(observer.off.diagnostics.directExposedStrikes, 0);
  assert.equal(observer.off.diagnostics.supportedFeet, 1);
  assert.equal(observer.diagnostics().offWorkletCreations, 0);
  await observer.wrapper.destroy();
});
