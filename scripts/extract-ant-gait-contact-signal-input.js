import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const OUTPUT = 'docs/ant/evidence/2026-10-29-gait-contact-signal-audit/data/frozen-contact-input.json.gz';
const ANCHORS = 'docs/ant/evidence/2026-10-29-traffic-direction-signal-audit/data/frozen-parity-anchors.json.gz';
const EXPECTED_PACKET_SHA = '909516b870b4ddce04ab661c4e7cd4113c52dc16ed35e414142fceb2cff0b1bc';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const streamHash = rows => { const hash = createHash('sha256'); for (const row of rows) hash.update(JSON.stringify(row) + '\n'); return hash.digest('hex'); };

async function main() {
  const sourcePath = process.argv[2];
  assert(sourcePath && !sourcePath.startsWith('--'), 'usage: node scripts/extract-ant-gait-contact-signal-input.js <history-packet.json.gz> [--check]');
  const check = process.argv.includes('--check');
  const packetBytes = await readFile(resolve(sourcePath));
  assert.equal(sha256(packetBytes), EXPECTED_PACKET_SHA, 'pinned history packet SHA-256');
  const packet = JSON.parse(gunzipSync(packetBytes));
  const anchorsBytes = await readFile(resolve(ROOT, ANCHORS));
  const anchors = JSON.parse(gunzipSync(anchorsBytes));
  assert.equal(anchors.source.sha256, EXPECTED_PACKET_SHA, 'frozen anchor source packet hash');
  assert.equal(anchors.source.commit, '0d5096a920e1ebb2086fa1dae782c5d4e871b590', 'pinned packet commit');

  const windows = anchors.analysisSnapshots.map((anchor, index) => {
    const analysis = packet.analyses.find(row => row.tick === anchor.tick);
    assert(analysis && analysis.simulationTimeMs === anchor.simulationTimeMs, 'frozen P1/P2 analysis anchor');
    assert.equal(sha256(Buffer.from(JSON.stringify(analysis.maps.C_surface))), anchor.criticalMapHashes.C_surface,
      'frozen SurfaceField endpoint hash');
    const id = `trail-plate-${anchor.plateCount}`;
    const birth = packet.births.find(row => row.payload?.id === id)?.payload;
    assert(birth, id + ' selected scaffold birth descriptor');
    const window = { id, tick: analysis.tick, simulationTimeMs: analysis.simulationTimeMs,
      startMs: analysis.candidate.startedAtMs, contactGroups: null, feet: null,
      surface: analysis.maps.C_surface,
      selectedI: Array.from(analysis.maps.I_retained_network, (value, cell) => value ? cell : null).filter(Number.isInteger),
      edges: birth.edges };
    const contacts = packet.contacts.filter(row => row.simulationTimeMs > window.startMs
      && row.simulationTimeMs <= window.simulationTimeMs);
    const expected = anchors.eventRanges[index];
    const feet = contacts.reduce((sum, row) => sum + row.contacts.length, 0);
    assert.deepEqual({ id, startMs: window.startMs, endMs: window.simulationTimeMs,
      contactGroups: contacts.length, feet, contactStreamSha256: streamHash(contacts) }, expected, id + ' exact event window');
    window.contactGroups = contacts.length;
    window.feet = feet;
    return window;
  });
  assert.equal(windows.length, 2, 'only the frozen P1/P2 pair is included');
  const endpointMs = windows.at(-1).simulationTimeMs;
  const contacts = packet.contacts.filter(row => row.simulationTimeMs <= endpointMs);
  assert.equal(contacts.length, anchors.contactPrefix.groups, 'ordered contact prefix group count');
  assert.equal(contacts.reduce((sum, row) => sum + row.contacts.length, 0), anchors.contactPrefix.feet,
    'ordered contact prefix foot count');
  assert.equal(streamHash(contacts), anchors.contactPrefix.sha256, 'ordered contact prefix digest');

  const input = { schema: 'ant-gait-contact-signal-input-v1',
    provenance: { packetCommit: anchors.source.commit,
      packetPath: 'docs/ant/evidence/2026-10-28-plate-formation-gate/data/history-packet.json.gz',
      packetSha256: EXPECTED_PACKET_SHA, packetBytes: packetBytes.length,
      sourceMain: packet.provenance.main, sourceParent: packet.provenance.parent,
      sourceHashes: packet.provenance.sourceHashes, parityAnchorPath: ANCHORS, parityAnchorSha256: sha256(anchorsBytes) },
    scope: { seed: packet.seed, seconds: packet.seconds, tickRate: 60, audio: packet.audio, grid: packet.grid }, windows, contacts };
  const outputBytes = gzipSync(Buffer.from(JSON.stringify(input)), { level: 9, mtime: 0 });
  const target = resolve(ROOT, OUTPUT);
  if (check) assert((await readFile(target)).equals(outputBytes), OUTPUT + ' differs from deterministic extraction');
  else {
    try { await writeFile(target, outputBytes, { flag: 'wx' }); }
    catch (error) { if (error.code === 'EEXIST') throw new Error(OUTPUT + ' already exists; use --check instead of overwriting'); throw error; }
  }
  console.log(JSON.stringify({ mode: check ? 'check' : 'write', sourcePacketSha256: EXPECTED_PACKET_SHA,
    inputSha256: sha256(outputBytes), inputBytes: outputBytes.length,
    contactPrefixGroups: contacts.length, contactPrefixFeet: contacts.reduce((sum, row) => sum + row.contacts.length, 0),
    windows: windows.map(({ id, startMs, simulationTimeMs, contactGroups, feet }) =>
      ({ id, startMs, endMs: simulationTimeMs, contactGroups, feet })) }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
