import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_RELOCATED_SEPARATION_PX, plateMaskCentroid, relocateContact, selectRelocationRule } from '../scripts/lib/antContactHistoryShadow.js';

test('Plate-local relocation center is derived from its immutable binary support mask', () => {
  const plate = { grid: { width: 3, height: 3 }, mask: new Uint8Array([0, 0, 0, 1, 1, 0, 0, 0, 0]) };
  assert.deepEqual(plateMaskCentroid(plate), { x: 0.25, y: 0.5 });
});

test('relocation candidates are deterministic isometries around each Plate support centroid', () => {
  const contacts = [
    { id: 'a', plateId: 'p1', position: { x: 0.2, y: 0.3 } },
    { id: 'b', plateId: 'p1', position: { x: 0.25, y: 0.32 } },
    { id: 'c', plateId: 'p1', position: { x: 0.3, y: 0.35 } }
  ];
  const center = { p1: { x: 0.5, y: 0.5 } };
  const selected = selectRelocationRule({ contacts, centers: center, isSupported: () => true });
  const again = selectRelocationRule({ contacts, centers: center, isSupported: () => true });
  assert.deepEqual(selected, again);
  const a = relocateContact(contacts[0].position, center.p1, selected.transform);
  const b = relocateContact(contacts[1].position, center.p1, selected.transform);
  assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(0.05, 0.02)) < 1e-12);
  assert.notEqual(selected.transform, 'identity');
  assert.equal(MIN_RELOCATED_SEPARATION_PX, 12);
});

test('relocation score rejects unsupported or insufficiently separated targets', () => {
  const contacts = Array.from({ length: 10 }, (_, index) => ({
    id: String(index), plateId: 'p', position: { x: 0.1 + index * 0.01, y: 0.5 }
  }));
  const result = selectRelocationRule({ contacts, centers: { p: { x: 0.5, y: 0.5 } },
    isSupported: () => false });
  assert.equal(result.sourceCount, 10);
  assert.ok(result.validCount < result.sourceCount);
  assert.equal(result.accepted, false);
});

test('same-pixel tie-break compares each valid target with its own source after filtering', () => {
  const contacts = [
    { id: 'unsupported', plateId: 'p', position: { x: 0.201, y: 0.303 } },
    { id: 'supported', plateId: 'p', position: { x: 0.8, y: 0.303 } }
  ];
  const result = selectRelocationRule({ contacts, centers: { p: { x: 0.5005, y: 0.5 } },
    isSupported: (_target, _plateId, contact) => contact.id === 'supported' });
  const reflected = result.candidates.find(candidate => candidate.transform === 'reflect-x');
  assert.equal(reflected.validCount, 1);
  assert.equal(reflected.sameNativePixelCount, 0);
});
