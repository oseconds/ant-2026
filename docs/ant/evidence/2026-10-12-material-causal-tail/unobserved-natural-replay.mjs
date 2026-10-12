import assert from 'node:assert/strict';
import { AntController } from '../../../../src/lib/agents/ant/AntController.js';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { serialize } from 'node:v8';

const results = [], expected = [[755, 734, 104222, 29], [689, 668, 102250, 33], [736, 717, 101772, 38]];
for (const [index, seed] of [20261005, 20261006, 20261007].entries()) {
  let value = seed >>> 0, calls = 0, contacts = 0;
  const random = () => { calls++; value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
  const c = new AntController({ random });
  c.subscribe(e => { if (e.type === 'foot-contact') contacts += e.payload.contacts.length; });
  await c.init();
  for (let tick = 0; tick < 36000; tick++) c.tick(1 / 60);
  assert.deepEqual([c.totalSpawned, c.totalRetired, contacts, c.trailPlateBirth.plates.length], expected[index]);
  const hash = data => createHash('sha256').update(data).digest('hex');
  const owned = { ...c, listeners: null, random: { value, calls }, fieldFactory: null, audioBridge: null };
  results.push({ seed, seconds: 600, hz: 60, population: c.agents.length, spawned: c.totalSpawned,
    retired: c.totalRetired, contacts, plateCount: c.trailPlateBirth.plates.length,
    noduleCount: c.materialStratigraphy.nodules.length, rngState: value, rngCalls: calls,
    pheromoneSha256: hash(Buffer.from(c.field.values.buffer)), surfaceSha256: hash(Buffer.from(c.surfaceField.values.buffer)),
    agentsJsonSha256: hash(JSON.stringify(c.agents)), ownStateV8Sha256: hash(serialize(owned)) });
  console.log(JSON.stringify(results.at(-1)));
  await c.destroy();
}
await writeFile(process.argv[2], JSON.stringify({ baselineCommit: '37131e0c408a9692ecc364ef7298a71c5e7182ad',
  semantics: 'Fresh default-On controllers; counted production LCG; only passive FOOT_CONTACT listener; no per-tick snapshots, clone, runner import or state instrumentation.', results }, null, 2) + '\n', { flag: 'wx' });
