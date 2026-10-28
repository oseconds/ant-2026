import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { analyzeEventSupport } from './lib/antEventSupportAtlas.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const prior = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate/data');
const out = resolve(root, 'docs/ant/evidence/2026-10-28-event-scoped-material-support/data');
const sha = b => createHash('sha256').update(b).digest('hex');
const input = await readFile(resolve(prior, 'history-packet.json.gz'));
const receipt = JSON.parse(await readFile(resolve(prior, 'capture.json'), 'utf8'));
assert.equal(sha(input), receipt.packetSha256);
const raw = gunzipSync(input); assert.equal(sha(raw), receipt.rawSha256);
const packet = JSON.parse(raw);
for (const [path, expected] of Object.entries(receipt.sourceHashes)) assert.equal(sha(await readFile(resolve(root, path))), expected, path);
const terminalBytes = await readFile(resolve(prior, 'terminal-provenance.json'));
assert.equal(sha(terminalBytes), JSON.parse(await readFile(resolve(prior, 'terminal-provenance-validation.json'), 'utf8')).resultSha256);
const terminal = JSON.parse(terminalBytes);
const started = performance.now();
const dist = values => { const a = values.sort((a, b) => a - b), q = p => a[Math.floor((a.length - 1) * p)] ?? null;
  return { n: a.length, min: a[0] ?? null, p25: q(.25), median: q(.5), p75: q(.75), max: a.at(-1) ?? null }; };
function summary(atlas) {
  const rows = atlas.cells, n = atlas.event.anchors;
  const occupancy = Array.from({ length: n + 1 }, (_, count) => ({ presentAnchors: count, fraction: count / n,
    cells: rows.filter(c => c.E.event.sampledPresentAnchors === count).length }));
  const count = f => rows.filter(f).length;
  const list = f => rows.map(f);
  return { event: atlas.event, relevantCells: rows.length, remainderOf9216: 9216 - rows.length, occupancy,
    leftBoundaryCarryIn: count(c => c.E.event.leftBoundaryCarryIn),
    firstAnchorPresent: count(c => c.E.event.firstEventAnchorPresent),
    onsetAfterStart: count(c => c.E.event.onsetOffsetMs > 0),
    EAbsentThroughout: count(c => c.E.event.sampledPresentAnchors === 0),
    sampledEReturnCells: count(c => c.E.event.absenceReturnCount > 0),
    noExactFeetDuringEvent: count(c => c.contacts.exact.eventWindowInclusiveCount === 0),
    noNeighborhoodFeetDuringEvent: count(c => c.contacts.neighborhood3x3.eventWindowInclusiveCount === 0),
    eventExactFeetPerCell: dist(list(c => c.contacts.exact.eventWindowInclusiveCount)),
    eventNeighborhoodFeetPerCell: dist(list(c => c.contacts.neighborhood3x3.eventWindowInclusiveCount)),
    longestEventESpanSeconds: dist(list(c => c.E.event.longestConsecutivePresentAnchorSpanMs / 1000)),
    finalRibbon: count(c => c.ribbon.final),
    finalRibbonNoEInEvent: count(c => c.ribbon.final && !c.E.event.sampledPresentAnchors),
    finalRibbonCarryIn: count(c => c.ribbon.final && c.E.event.leftBoundaryCarryIn),
    sampledPatterns: Object.fromEntries([...new Set(rows.map(c => c.orbitBits.E))].sort().map(bits => [bits, count(c => c.orbitBits.E === bits)])) };
}
function run() {
  const before = sha(JSON.stringify(packet));
  const atlases = [0, 1].map(eventBirthIndex => {
    assert.ok(performance.now() - started < 60000, '60 s frozen atlas boundary');
    return analyzeEventSupport(packet, terminal, { eventBirthIndex });
  });
  assert.equal(sha(JSON.stringify(packet)), before);
  assert.equal(atlases[0].event.anchors, 21); assert.equal(atlases[1].event.anchors, 21);
  assert.equal(atlases[0].cells.filter(c => c.ribbon.final).length, 356);
  assert.equal(atlases[1].cells.filter(c => c.ribbon.final).length, 544);
  return { schema: 'ant-event-support-atlas-package-v1', packetSha256: sha(input), terminalSha256: sha(terminalBytes),
    main: 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292', researchParent: '0d5096a920e1ebb2086fa1dae782c5d4e871b590',
    scope: { seed: 20261005, heading: 'production H0', audio: 'Off', seconds: 120, newNaturalRuns: 0 }, atlases };
}
let first, second; const random = Math.random;
try { Math.random = () => { throw new Error('atlas RNG use'); }; first = JSON.stringify(run()); second = JSON.stringify(run()); }
finally { Math.random = random; }
assert.equal(first, second);
const result = JSON.parse(first), overview = JSON.stringify({ schema: 'ant-event-support-overview-v1', events: result.atlases.map(summary) }, null, 2) + '\n';
await mkdir(out, { recursive: true });
if (process.argv.includes('--check')) {
  assert.equal(gunzipSync(await readFile(resolve(out, 'atlas.json.gz'))).toString(), first);
  assert.equal(await readFile(resolve(out, 'atlas-summary.json'), 'utf8'), overview);
} else {
  await assert.rejects(readFile(resolve(out, 'atlas.json.gz')), { code: 'ENOENT' });
  const zipped = gzipSync(first, { level: 9 }); await writeFile(resolve(out, 'atlas.json.gz'), zipped);
  await writeFile(resolve(out, 'atlas-summary.json'), overview);
  await writeFile(resolve(out, 'atlas-validation.json'), JSON.stringify({ inputSha256: sha(input), resultRawSha256: sha(first), resultGzipSha256: sha(zipped),
    summarySha256: sha(overview), deterministicRerun: true, rngTripwire: true, inputUnchanged: true, productionSourceHashesMatchParent: true,
    helperSha256: sha(await readFile(resolve(root, 'scripts/lib/antEventSupportAtlas.js'))), runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))) }, null, 2) + '\n');
}
console.log(JSON.stringify(JSON.parse(overview).events.map(({ sampledPatterns, ...s }) => s), null, 2));
