import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { runFullBrowserRender } from './ant-local-x-audio-render.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-audio-reassessment');
const ANALYSIS = resolve(EVIDENCE, 'analysis');
const CACHE = resolve(ROOT, '.cache/local-x-audio-reassessment');
const sha = data => createHash('sha256').update(data).digest('hex');
const worlds = ['20261005', '20261006', '20261007'].flatMap(seed => ['control', 'replacement'].map(arm => ({ seed, arm })));
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

export async function verifyAudioReceipts() {
  const [receipts, worldReceipts, granularity, profile, topologyCost, browserParity] = await Promise.all([
    readJson(resolve(ANALYSIS, 'audio-render-receipts.json')),
    readJson(resolve(ANALYSIS, 'receipts.json')),
    readJson(resolve(ANALYSIS, 'granularity-probe.json')),
    readJson(resolve(ANALYSIS, 'ant-local-x-audio-runtime-profile.json')),
    readJson(resolve(ANALYSIS, 'topology-cost-summary.json')),
    readJson(resolve(ANALYSIS, 'validation/browser-parity.json'))
  ]);
  assert.equal(receipts.receipts.length, 6);
  assert.equal(worldReceipts.worlds.length, 6);
  const workletSha = sha(await readFile(resolve(ROOT, 'static/worklets/surface-plate.worklet.js')));
  const compilerSha = sha(await readFile(resolve(ROOT, 'src/lib/audio/compileSurfaceTopology.js')));
  for (const [label, actual] of Object.entries({
    'render receipts': receipts.receipts[0].workletSourceSha256,
    'runtime profile': profile.sourceSha256,
    'granularity probe': granularity.source.workletSha256,
    'browser parity': browserParity.workletSourceSha256
  })) assert.equal(actual, workletSha, `${label} worklet SHA`);
  for (const [label, actual] of Object.entries({
    'runtime profile': profile.compilerSourceSha256,
    'granularity probe': granularity.source.compilerSha256,
    'topology cost summary': topologyCost.runtimeProfile.compilerSourceSha256
  })) assert.equal(actual, compilerSha, `${label} compiler SHA`);

  const verified = [];
  for (const world of worlds) {
    const key = `${world.seed}/${world.arm}`;
    const row = receipts.receipts.find(item => item.seed === world.seed && item.arm === world.arm);
    const worldRow = worldReceipts.worlds.find(item => item.seed === world.seed && item.arm === world.arm);
    assert.ok(row && worldRow, `${key} receipts exist`);
    const wav = await readFile(resolve(ROOT, row.wavPath));
    assert.equal(wav.byteLength, row.wavBytes, `${key} WAV bytes`);
    assert.equal(sha(wav), row.wavSha256, `${key} WAV SHA-256`);
    const schedulePath = resolve(ANALYSIS, `seed-${world.seed}-${world.arm}-schedule.json.gz`);
    const capturePath = resolve(ANALYSIS, `seed-${world.seed}-${world.arm}-capture.json.gz`);
    const scheduleBytes = await readFile(schedulePath), captureBytes = await readFile(capturePath);
    assert.equal(sha(scheduleBytes), row.scheduleSha256, `${key} schedule SHA-256`);
    assert.equal(sha(scheduleBytes), worldRow.schedule.sha256, `${key} schedule/world receipt SHA-256`);
    assert.equal(sha(captureBytes), worldRow.capture.sha256, `${key} capture/world receipt SHA-256`);
    const schedule = JSON.parse(gunzipSync(scheduleBytes));
    assert.equal(schedule.world.frames, 14_400_000, `${key} frame count`);
    assert.equal(row.renderedFrames, worldRow.metrics.totalFrames, `${key} rendered frame receipt`);
    const renderedEvents = schedule.events.filter((event, index) => index !== 0 && event.frame < schedule.world.frames);
    const endpointEvents = schedule.events.filter(event => event.frame === schedule.world.frames);
    assert.equal(sha(Buffer.from(JSON.stringify(renderedEvents))), row.renderedEventSha256, `${key} rendered events SHA-256`);
    assert.equal(sha(Buffer.from(JSON.stringify(endpointEvents))), row.endpointEventSha256, `${key} endpoint events SHA-256`);
    verified.push({ seed: world.seed, arm: world.arm, wavSha256: row.wavSha256, wavBytes: row.wavBytes,
      scheduleSha256: row.scheduleSha256, captureSha256: worldRow.capture.sha256,
      workletSourceSha256: row.workletSourceSha256, frames: row.renderedFrames });
  }
  return { status: 'PASS', worlds: verified.length, workletSourceSha256: workletSha,
    compilerSourceSha256: compilerSha, receipts: verified };
}

async function rerunReplacement05() {
  const expected = JSON.parse(await readFile(resolve(ANALYSIS, 'audio-render-receipts.json'), 'utf8'))
    .receipts.find(row => row.seed === '20261005' && row.arm === 'replacement');
  const capture = JSON.parse(gunzipSync(await readFile(resolve(ANALYSIS, 'seed-20261005-replacement-capture.json.gz'))));
  assert.equal(capture.seed, '20261005'); assert.equal(capture.arm, 'replacement');
  const profile = await readJson(resolve(ANALYSIS, 'granularity-probe.json'));
  const granularityWorld = profile.worlds.find(row => row.seed === '20261005' && row.arm === 'replacement');
  assert.equal(granularityWorld.nodeCount, 1070, 'selected maximum-node replacement case');
  const outputDir = resolve(CACHE, 'rerun'); await mkdir(outputDir, { recursive: true });
  const wavPath = resolve(outputDir, 'seed-20261005-replacement.wav');
  if (await exists(wavPath)) {
    const wav = await readFile(wavPath), rerunSha = sha(wav);
    assert.equal(rerunSha, expected.wavSha256, 'existing rerun WAV matches original receipt');
    assert.equal(wav.byteLength, expected.wavBytes);
    return { status: 'PASS', seed: '20261005', arm: 'replacement', nodeCount: granularityWorld.nodeCount,
      originalWavSha256: expected.wavSha256, rerunWavSha256: rerunSha, wavBytes: wav.byteLength,
      outputPath: wavPath.slice(ROOT.length + 1).replaceAll('\\', '/'), rerunPerformedThisInvocation: false };
  }
  const server = await createServer({ root: ROOT, configFile: false, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  let browser;
  try {
    await server.listen();
    const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}/`;
    browser = await chromium.launch();
    const workletSource = await readFile(resolve(ROOT, 'static/worklets/surface-plate.worklet.js'), 'utf8');
    const result = await runFullBrowserRender({ seed: '20261005', arm: 'replacement',
      schedulePath: resolve(ANALYSIS, 'seed-20261005-replacement-schedule.json.gz'),
      workletSource, browser, baseUrl, wavPath });
    assert.equal(result.wavSha256, expected.wavSha256, 'full rerun WAV bytes match original receipt');
    assert.equal(result.wavBytes, expected.wavBytes);
    return { status: 'PASS', seed: '20261005', arm: 'replacement', nodeCount: granularityWorld.nodeCount,
      originalWavSha256: expected.wavSha256, rerunWavSha256: result.wavSha256, wavBytes: result.wavBytes,
      outputPath: wavPath.slice(ROOT.length + 1).replaceAll('\\', '/'), rerunPerformedThisInvocation: true };
  } finally { await browser?.close(); await server.close(); }
}

async function deterministicArtifactRows() {
  const analysisFiles = ['granularity-probe.json', 'architecture-summary.json', 'layer-contribution-histories.json', 'topology-cost-summary.json'];
  const dataFiles = ['windows.csv', 'erb-power.csv', 'paired-shape.csv', 'analysis.json', 'analysis-manifest.json'];
  const plotManifest = await readJson(resolve(EVIDENCE, 'audio-analysis/visual/plot-manifest.json'));
  assert.equal(plotManifest.pngs.length, 30);
  const visualFiles = [...plotManifest.pngs.map(row => `audio-analysis/visual/${row.file}`),
    'audio-analysis/visual/erb-absolute-power.svg', 'audio-analysis/visual/erb-unit-shape.svg'];
  const outputFiles = [...analysisFiles.map(file => `analysis/${file}`), ...dataFiles.map(file => `audio-analysis/${file}`), ...visualFiles];
  assert.equal(outputFiles.length, 41);
  const baselineDir = resolve(CACHE, 'verification-baseline');
  const saved = new Map();
  for (const relative of outputFiles) {
    const source = resolve(EVIDENCE, relative), copy = resolve(baselineDir, relative), bytes = await readFile(source);
    await mkdir(dirname(copy), { recursive: true }); await copyFile(source, copy);
    saved.set(relative, { source, copy, bytes, sha256: sha(bytes) });
  }
  const plotManifestPath = resolve(EVIDENCE, 'audio-analysis/visual/plot-manifest.json');
  const plotManifestBytes = await readFile(plotManifestPath);
  const plotManifestCopy = resolve(baselineDir, 'audio-analysis/visual/plot-manifest.json');
  await mkdir(dirname(plotManifestCopy), { recursive: true }); await copyFile(plotManifestPath, plotManifestCopy);
  let rows = [];
  try {
    const run = (script, args = []) => execFileSync(process.execPath, [resolve(ROOT, script), ...args], { cwd: ROOT, stdio: 'pipe' });
    const python = process.env.ANT_RESEARCH_PYTHON
      || (existsSync('C:/AI/ComfyUI_windows_portable/python_embeded/python.exe')
        ? 'C:/AI/ComfyUI_windows_portable/python_embeded/python.exe' : 'python');
    run('scripts/ant-local-x-audio-granularity.js');
    run('scripts/ant-local-x-audio-results.js');
    execFileSync(python, ['-B', resolve(ROOT, 'scripts/ant-local-x-audio-analysis.py')], { cwd: ROOT, stdio: 'pipe' });
    run('scripts/ant-local-x-audio-plots.js');
    for (const [relative, { source, bytes, sha256 }] of saved) {
      const regenerated = await readFile(source);
      rows.push({ file: relative, baselineSha256: sha256, rerunSha256: sha(regenerated), bytesEqual: bytes.equals(regenerated) });
    }
    assert.ok(rows.every(row => row.bytesEqual), 'granularity, summaries, Python analyzer and fixed plots regenerate byte-for-byte');
    assert.deepEqual(await readFile(plotManifestPath), plotManifestBytes, 'plot manifest remains byte-identical');
  } catch (error) {
    for (const { source, copy } of saved.values()) await copyFile(copy, source);
    await copyFile(plotManifestCopy, plotManifestPath);
    throw error;
  }
  return { status: 'PASS', byteIdenticalOutputs: rows.length, pythonOutputs: 5, pngs: 30, svgs: 2,
    baselinePath: '.cache/local-x-audio-reassessment/verification-baseline', outputs: rows };
}

async function exists(path) { try { await readFile(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--regenerate-pure')) {
    const pureOutputs = await deterministicArtifactRows();
    const path = resolve(ANALYSIS, 'validation/determinism.json');
    const previous = await readJson(path);
    await writeFile(path, `${JSON.stringify({ ...previous, pureOutputs,
      pythonAnalyzer: { status: 'PASS', outputs: 5, comparison: 'all output hashes match baseline exactly' } }, null, 2)}\n`);
    console.log(JSON.stringify({ status: pureOutputs.status, outputs: pureOutputs.byteIdenticalOutputs,
      validationPath: path.slice(ROOT.length + 1).replaceAll('\\', '/') }));
  } else if (process.argv.includes('--rerun-case')) {
    const receiptCheck = await verifyAudioReceipts();
    const rerun = await rerunReplacement05();
    const pureOutputs = await deterministicArtifactRows();
    const report = { schema: 'ant-local-x-audio-determinism-v1', receiptCheck, pureOutputs, rerun,
      pythonAnalyzer: { status: 'PASS', outputs: 5, comparison: 'all output hashes match baseline exactly' } };
    const path = resolve(ANALYSIS, 'validation/determinism.json');
    await mkdir(resolve(ANALYSIS, 'validation'), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, validationPath: path.slice(ROOT.length + 1).replaceAll('\\', '/') }));
  } else {
    console.log(JSON.stringify(await verifyAudioReceipts()));
  }
}
