import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = resolve(root, 'docs/ant/evidence/2026-10-28-plate-formation-gate');
const prior = resolve(root, 'docs/ant/evidence/2026-10-27-g-formation-information-ledger');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 }).toString('utf8').trim();
const loadJson = async path => JSON.parse(await readFile(path, 'utf8'));

export async function loadLedgerTools() {
  const path = resolve(root, 'scripts/ant-g-formation-information-ledger.js');
  const original = await readFile(path, 'utf8');
  const ledger = await loadJson(resolve(prior, 'data/formation-ledger.json'));
  assert.equal(sha(original), ledger.provenance.diagnosticRunnerSha256, 'sealed ledger runner changed');
  let code = original.replace(/\r\n/g, '\n');
  function replace(before, after) {
    assert.equal(code.split(before).length, 2, `one diagnostic hook: ${before.slice(0, 60)}`);
    code = code.replace(before, after);
  }
  replace("const root = resolve(fileURLToPath(new URL('..', import.meta.url)));", `const root = ${JSON.stringify(root)};`);
  code = code.replace(/from '(\.\.\/[^']+)'/g,
    (_, path) => `from '${pathToFileURL(resolve(root, 'scripts', path)).href}'`);
  replace('async function runScenario({ observe, selector }) {', 'async function runScenario({ observe, selector, onAnalysis = null }) {');
  replace('  const totalTicks = ticks;', '  const totalTicks = ticks;\n  const __captureStarted = performance.now();');
  replace('  for (let tick = 0; tick <= totalTicks; tick += 1) {',
    '  for (let tick = 0; tick <= totalTicks; tick += 1) {\n    assert.ok(performance.now() - __captureStarted < 240000, "240 s capture boundary");');
  replace('  const contactHash = createHash(\'sha256\'), birthHash = createHash(\'sha256\');',
    '  const contactArchive = [];\n  const contactHash = createHash(\'sha256\'), birthHash = createHash(\'sha256\');');
  replace('      pendingContacts.push(event.payload);',
    '      pendingContacts.push(event.payload);\n      contactArchive.push(structuredClone(event.payload));');
  replace('      const after = stateHashes(controller, rngState, rngCalls, pendingContacts, pendingBirths, lifecycle);',
    '      if (onAnalysis) onAnalysis({ controller, analysis, tick });\n      const after = stateHashes(controller, rngState, rngCalls, pendingContacts, pendingBirths, lifecycle);');
  replace('  return { rows, analyses, births, events, final, rngState, rngCalls, observerStateUnchanged, selectorParity };',
    '  return { rows, analyses, births, events, final, rngState, rngCalls, observerStateUnchanged, selectorParity, contactArchive };');
  replace("  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);",
    "  code = replaceOnce(code, '    const path = tracePath(target, parent);', '    const path = tracePath(target, parent);\\n    row.chosenRoot = sourceSeeds[0]; row.qualifiedTargetIndices = targetIndices.filter(index => distance[index] / (TRAIL_PLATE_GRID_SIZE - 1) >= TRAIL_PLATE_MIN_GEODESIC_LENGTH); row.parentEdges = component.filter(index => parent[index] >= 0).map(index => [parent[index], index]);');\n  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);");
  replace('if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {', 'if (false) {');
  code += '\nexport { runScenario, makeDiagnosticSelector, compareTickRows, compareFrozenInputs, writePng, gridImage };\n';
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return { ...module, sourceSha256: sha(original), transformedRunnerSha256: sha(code) };
}

async function main() {
  assert.equal(git('branch', '--show-current'), 'codex/ant-plate-formation-gate-20261028');
  assert.equal(git('rev-parse', 'origin/main'), 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292');
  assert.equal(git('diff', 'origin/main', '--', 'src', 'static', 'docs/ant/README.md'), '');
  await mkdir(resolve(out, 'data'), { recursive: true });
  const target = resolve(out, 'data/history-packet.json.gz');
  await assert.rejects(readFile(target), { code: 'ENOENT' }, 'never overwrite captured evidence');
  const ledger = await loadJson(resolve(prior, 'data/formation-ledger.json'));
  const tools = await loadLedgerTools();
  const source = await readFile(resolve(root, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8');
  const selector = await tools.makeDiagnosticSelector(source);
  const frames = [];
  const run = await tools.runScenario({ observe: true, selector, onAnalysis({ controller, analysis, tick }) {
    const birth = controller.trailPlateBirth;
    const build = birth.buildSupportedMask(controller.surfaceField), funnel = {};
    const candidate = selector.selectCandidateDiagnostic(build.mask, build.supports, birth.chemicalMemory, funnel);
    const priorRow = ledger.stages[frames.length];
    const { maps, ...metadata } = analysis;
    assert.deepEqual(metadata, priorRow, `sealed analysis metadata at ${tick}`);
    const selectedMaps = Object.fromEntries(Object.entries(maps).filter(([name]) => name !== 'A_native'));
    frames.push({ tick, simulationTimeMs: analysis.simulationTimeMs, birthsThisTick: analysis.birthsThisTick,
      plateCount: analysis.plateCount, candidate: candidate ? { source: candidate.source, target: candidate.target,
        geodesicLength: candidate.geodesicLength, meanChemical: candidate.meanChemical, meanSupport: candidate.meanSupport,
        stableSeconds: birth.candidate.stableSeconds, startedAtMs: birth.candidate.startedAtMs } : null,
      principalPath: candidate?.path.slice() ?? [], maps: selectedMaps,
      components: funnel.components.map(row => ({ cells: row.skeletonIndices, chosenRoot: row.chosenRoot ?? null,
        qualifiedTargets: row.qualifiedTargetIndices ?? [], parentEdges: row.parentEdges ?? [],
        sourceCount: row.sourceCount, rejection: row.rejection })) });
  } });
  const chain = tools.compareTickRows(run.rows, run.rows);
  assert.deepEqual(chain, ledger.observerParity, 'all 7201 tick fingerprints match sealed OFF/ON world');
  const frozen120Path = resolve(prior, '../2026-10-25-g-production-candidate-review/data/seed20261005-G-120s.json.gz');
  const frozenRawPath = resolve(prior, '../2026-10-25-g-production-candidate-review/data/seed20261005-G-raw.json.gz');
  const frozenChecks = tools.compareFrozenInputs(run, JSON.parse(gunzipSync(await readFile(frozen120Path))),
    JSON.parse(gunzipSync(await readFile(frozenRawPath))));
  assert.deepEqual(frozenChecks, ledger.frozenChecks);
  const sourceHashes = Object.fromEntries(await Promise.all(Object.keys(ledger.provenance.sourceHashes).map(async path =>
    [path, sha(await readFile(resolve(root, path)))])));
  assert.deepEqual(sourceHashes, ledger.provenance.sourceHashes);
  const packet = { schema: 'ant-omitted-history-packet-v1', seed: 20261005, seconds: 120, audio: 'Off',
    grid: 96, analyses: frames, contacts: run.contactArchive, births: run.births,
    provenance: { parent: 'fd2a42875cc93eedeb319eae14b0e8de21e429d7', main: git('rev-parse', 'origin/main'),
      ledgerSha256: sha(await readFile(resolve(prior, 'data/formation-ledger.json'))), sourceHashes,
      inheritedRunnerSha256: tools.sourceSha256, transformedRunnerSha256: tools.transformedRunnerSha256,
      captureRunnerSha256: sha(await readFile(fileURLToPath(import.meta.url))),
      transformedSelectorSha256: selector.transformedSourceHash, chain, frozenChecks,
      observerNonmutation: run.observerStateUnchanged, selectorParity: run.selectorParity, node: process.version,
      contactStreamSha256: run.events.contactStreamSha256, birthStreamSha256: run.events.birthStreamSha256 } };
  const bytes = Buffer.from(JSON.stringify(packet, (key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value));
  const compressed = gzipSync(bytes, { level: 9 });
  await writeFile(target, compressed);
  const index = await loadJson(resolve(prior, 'data/checkpoint-arrays-index.json'));
  const checkpointBytes = gunzipSync(await readFile(resolve(prior, 'data/checkpoint-arrays.bin.gz')));
  let arraysMatched = 0;
  for (const point of index.checkpoints) {
    const frame = frames.find(frame => frame.tick === point.tick); assert.ok(frame);
    for (const [name, spec] of Object.entries(point.fields)) {
      if (name === 'A_native') continue;
      const array = frame.maps[name];
      const actual = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
      assert.equal(sha(actual), spec.sha256, `checkpoint ${point.tick} ${name}`);
      assert.deepEqual(actual, checkpointBytes.subarray(spec.offset, spec.offset + spec.byteLength)); arraysMatched += 1;
    }
  }
  const receipt = { schema: 'ant-omitted-history-capture-v1', packetSha256: sha(compressed), rawSha256: sha(bytes),
    compressedBytes: compressed.length, rawBytes: bytes.length, analyses: frames.length,
    contactGroups: packet.contacts.length, individualFeet: packet.contacts.reduce((n, event) => n + event.contacts.length, 0),
    matchedTickRows: chain.comparedTicks, matchedDomains: Object.keys(chain.fields).length, checkpointArraysMatched: arraysMatched,
    allAnalysisMetadataExact: true, frozenChecks, sourceHashes, replayCount: 1,
    scope: 'same Node runtime as sealed H0 ledger; one observed replay matched to pre-existing tick chains; no new OFF world' };
  await writeFile(resolve(out, 'data/capture.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
