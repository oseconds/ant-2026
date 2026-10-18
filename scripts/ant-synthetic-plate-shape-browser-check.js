import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = path.join(root, 'docs/ant/evidence/2026-10-18-synthetic-plate-shape-capability');
const htmlPath = path.join(packagePath, 'synthetic-shape-listening.html');
const config = JSON.parse(await readFile(path.join(packagePath, 'viewer-config.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(packagePath, 'listening-manifest.json'), 'utf8'));
const validation = JSON.parse(await readFile(path.join(packagePath, 'viewer-validation.json'), 'utf8'));
const render = JSON.parse(await readFile(path.join(packagePath, 'render-manifest.json'), 'utf8'));
const roster = JSON.parse(await readFile(path.join(packagePath, 'shape-roster.json'), 'utf8'));
const html = await readFile(htmlPath, 'utf8');
const expectedCycle = [
  ['compact', 'elongated'], ['elongated', 'curved'], ['curved', 'Y-branch'],
  ['Y-branch', 'loop-like'], ['loop-like', 'concave / irregular broad'],
  ['concave / irregular broad', 'compact']
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(config.pairs.length, 6);
assert.deepEqual(config.pairs.map(pair => [pair.a.label, pair.b.label]), expectedCycle);
assert.equal(new Set(manifest.listening.map(item => item.id)).size, 6);
assert.equal(manifest.listening.length, 6);
assert.equal(validation.validatedAudioFiles.length, 12);
assert.equal(validation.listeningPostGain.targetRms, 0.08);
assert.equal(validation.blindSession.trialCount, 7);
assert.equal(validation.blindSession.betweenSourceCount, 6);
assert.equal(validation.blindSession.preRevealMode, 'matched-only');
assert.equal(validation.blindSession.sameBytesAndSha256ForBothSides, true);
assert.equal(validation.fixedGainOnlyErbAnalysis, false);
assert.equal(render.renderCount, 6);
assert.equal(render.artifacts.length, 12);
assert.equal(render.listeningConvention.noLimiter, true);
assert.equal(render.listeningConvention.noCompressor, true);
assert.equal(render.productionContracts.fixedOutputGain, 1);
assert.equal(render.productionContracts.contactPulseDurationMs, 3);
assert.equal(render.productionContracts.localRecoveryMs, 75);
assert.equal(render.productionContracts.plateDampingMultiplier, 50);
assert.equal(roster.shapes.length, 6);
assert.equal(roster.sourceMaterial.value.density, 1.2);
assert.deepEqual(roster.commonAnchors, { coordinateConvention: 'exact integer [x,y] cells in the row-major 96x96 source grid',
  contact: { x: 48, y: 86 }, leftPickup: { x: 39, y: 86 }, rightPickup: { x: 57, y: 86 } });
assert.equal(new Set(roster.shapes.map(shape => JSON.stringify(shape.material))).size, 1,
  'all six frozen masks use the same material');
const sources = new Map(manifest.listening.map(row => [row.id, row]));
assert.deepEqual(config.pairs.flatMap(pair => [pair.a, pair.b]).map(arm => arm.sourcePairLabel),
  ['shape-01', 'shape-02', 'shape-02', 'shape-03', 'shape-03', 'shape-04', 'shape-04', 'shape-05', 'shape-05', 'shape-06', 'shape-06', 'shape-01']);
const wavReceipts = new Map();
for (const row of manifest.listening) {
  wavReceipts.set(row.fixed.path, row.fixed);
  wavReceipts.set(row.levelMatched.path, row.levelMatched);
}
assert.equal(wavReceipts.size, 12);
const listeningNames = (await readdir(path.join(packagePath, 'listening'))).sort();
assert.equal(listeningNames.length, 12);
assert.deepEqual(listeningNames, [...wavReceipts.keys()].map(file => path.basename(file)).sort());
let totalWavBytes = 0;
for (const [relativePath, receipt] of wavReceipts) {
  const bytes = await readFile(path.join(root, relativePath));
  totalWavBytes += bytes.length;
  assert.equal(bytes.length, receipt.bytes, `${relativePath}: byte size`);
  assert.equal(sha256(bytes), receipt.sha256, `${relativePath}: SHA-256`);
  assert.equal(bytes.readUInt16LE(20), 3, `${relativePath}: float WAV`);
  assert.equal(bytes.readUInt16LE(22), 2, `${relativePath}: stereo WAV`);
  assert.equal(bytes.readUInt32LE(24), 48000, `${relativePath}: 48 kHz`);
}
assert.equal(totalWavBytes, render.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0));
assert.equal(totalWavBytes, 6912528);
assert.ok(validation.listeningPostGain.sources.every(item => item.finalTargetRms === 0.08 &&
  item.postGainLinear > 0 && item.predictedPostGainPeak < 1));
for (const pair of config.pairs) {
  const gains = validation.listeningPostGain.sources.filter(item => item.pairId === pair.id);
  assert.equal(gains.length, 2);
  assert.equal(gains[0].postGainLinear, gains[1].postGainLinear);
  assert.ok(Math.abs(gains[0].sourceMatchedRms - gains[1].sourceMatchedRms) < 2e-10,
    `${pair.id}: only Float32 RMS rounding separates matched arms`);
}
assert.deepEqual(validation.blindSession.fixedGainReceipt, {
  relativePath: 'listening/case-01-fixed.wav', bytes: sources.get('shape-01').fixed.bytes,
  sha256: sources.get('shape-01').fixed.sha256
});
assert.deepEqual(validation.blindSession.rmsMatchedReceipt, {
  relativePath: 'listening/case-01-matched.wav', bytes: sources.get('shape-01').levelMatched.bytes,
  sha256: sources.get('shape-01').levelMatched.sha256
});
assert.doesNotMatch(html, /DynamicsCompressor|createDynamicsCompressor|\blimiter\b|\bcompressor\b/i);
assert.doesNotMatch(html, /data:audio\//i);
assert.doesNotMatch(html, /https?:\/\//i, 'generated viewer has no external URL dependency');
assert.ok(html.length < 100_000, 'viewer metadata only; audio remains in committed WAV files');

const localRequests = [], remoteRequests = [], pageErrors = [];
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const target = path.resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const bytes = await readFile(target), ext = path.extname(target).toLowerCase();
    const contentType = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.wav' ? 'audio/wav' : 'application/octet-stream';
    localRequests.push(pathname);
    response.setHeader('Content-Type', contentType);
    response.setHeader('Accept-Ranges', 'bytes');
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]), end = Math.min(Number(range[2] || bytes.length - 1), bytes.length - 1);
      if (start > end || start >= bytes.length) { response.writeHead(416).end(); return; }
      response.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
      response.end(bytes.subarray(start, end + 1));
    } else { response.writeHead(200, { 'Content-Length': bytes.length }); response.end(bytes); }
  } catch { response.writeHead(404).end(); }
});

const browser = await chromium.launch({ headless: true });
function observe(page) {
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (/^https?:/i.test(request.url()) && !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/i.test(request.url()))
      remoteRequests.push(request.url());
  });
}
async function seedPage(page, randomSeed) {
  await page.addInitScript(testSeed => {
    let state = 0x811c9dc5;
    for (let index = 0; index < testSeed.length; index++) state = Math.imul(state ^ testSeed.charCodeAt(index), 0x01000193);
    state = state >>> 0 || 0x9e3779b9;
    Object.defineProperty(window.crypto, 'getRandomValues', { configurable: true, value: values => {
      for (let index = 0; index < values.length; index++) {
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        values[index] = state >>> 0;
      }
      return values;
    }});
  }, randomSeed);
  await page.addInitScript(() => {
    window.__fetchCalls = 0; window.__audioContexts = []; window.__audioGains = [];
    const NativeAudioContext = window.AudioContext;
    const createGain = NativeAudioContext.prototype.createGain;
    NativeAudioContext.prototype.createGain = function(...args) {
      const gain = Reflect.apply(createGain, this, args); window.__audioGains.push(gain); return gain;
    };
    window.AudioContext = new Proxy(NativeAudioContext, {
      construct(target, args) {
        const context = Reflect.construct(target, args); window.__audioContexts.push(context); return context;
      }
    });
    const originalFetch = window.fetch;
    window.fetch = (...args) => { window.__fetchCalls++; return originalFetch(...args); };
  });
}
function expectedRandomization(seed) {
  let value = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) value = Math.imul(value ^ seed.charCodeAt(index), 0x01000193);
  value = value >>> 0 || 0x9e3779b9;
  const random = () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; };
  const catchId = config.blindSession.catchTrial.id;
  const order = [...config.pairs.map(pair => pair.id), catchId];
  for (let index = order.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1)); [order[index], order[swap]] = [order[swap], order[index]];
  }
  const sideMappings = {};
  for (const id of order) {
    if (id === catchId) {
      const same = { sourcePairId: config.blindSession.catchTrial.sourcePairId, sourceArm: config.blindSession.catchTrial.sourceArm };
      sideMappings[id] = { A: same, B: same };
    } else {
      const first = random() < 0.5 ? 'a' : 'b';
      sideMappings[id] = { A: { sourcePairId: id, sourceArm: first }, B: { sourcePairId: id, sourceArm: first === 'a' ? 'b' : 'a' } };
    }
  }
  return { order, sideMappings };
}
async function newPage(context, url, randomSeed) {
  const page = await context.newPage(); observe(page); await seedPage(page, randomSeed);
  await page.goto(url, { waitUntil: 'load' });
  assert.equal(await page.title(), config.title);
  assert.equal(await page.locator('input[name="listening-mode"][value="rms-matched-listening-only"]').isChecked(), true);
  assert.equal(await page.locator('input[name="listening-mode"][value="fixed-gain"]').isDisabled(), true);
  return page;
}
async function assertAnonymousPreReveal(page) {
  const text = await page.locator('body').evaluate(node => node.innerText);
  assert.doesNotMatch(text, /\bcompact\b|\belongated\b|\bcurved\b|\bY-branch\b|\bloop-like\b|concave \/ irregular broad|shape-0[1-6]|shape-catch-aa|case-0[1-6]/i);
  assert.equal(await page.locator('.blind-card audio').count(),
    await page.locator('.blind-card').isVisible() ? 2 : 0);
  assert.equal(await page.locator('.blind-card canvas, .blind-card img, .blind-card svg').count(), 0,
    'no geometry preview appears before Reveal');
  const revealed = page.locator('.revealed-analysis');
  assert.equal(await revealed.count(), await page.locator('.blind-card').isVisible() ? 1 : 0);
  if (await revealed.count()) assert.equal(await revealed.evaluate(node => node.hidden), true);
  assert.equal(await page.locator('.measurement-details').count(), 0);
  assert.equal(await page.locator('.erb-details').count(), 0);
}
async function startSession(page) {
  await assertAnonymousPreReveal(page);
  await page.locator('#start-session').click();
  await assertAnonymousPreReveal(page);
  assert.match(await page.locator('#session-meta').textContent(), /Trial 1 of 7/);
}
function stateKey() { return `ant-audio-evidence-viewer:v2:${config.viewerId}`; }
async function readActiveSession(page) {
  return page.evaluate(key => {
    const store = JSON.parse(localStorage.getItem(key));
    return store.sessions.find(item => item.sessionId === store.activeSessionId);
  }, stateKey());
}
async function playFromStart(page, side) {
  await page.locator(`[data-testid="restart-${side.toLowerCase()}"]`).click();
  await page.waitForFunction(selector => {
    const audio = document.querySelectorAll('.blind-card audio')[selector === 'a' ? 0 : 1];
    return audio && !audio.paused && audio.currentTime > 0.03;
  }, side.toLowerCase(), { timeout: 8000 });
}

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const httpUrl = `http://127.0.0.1:${server.address().port}/${path.relative(root, htmlPath).split(path.sep).join('/')}`;
  let filePlayback = 'unsupported';
  const fileContext = await browser.newContext();
  try {
    const filePage = await newPage(fileContext, pathToFileURL(htmlPath).href, 'synthetic-file-check-seed');
    await startSession(filePage);
    try { await playFromStart(filePage, 'a'); filePlayback = 'passed'; }
    catch (error) { filePlayback = `unsupported: ${error.message}`; }
    assert.equal(await filePage.evaluate(() => window.__fetchCalls), 0);
  } finally { await fileContext.close(); }

  const context = await browser.newContext({ acceptDownloads: true });
  try {
    const page = await newPage(context, httpUrl, 'synthetic-http-check-seed');
    await startSession(page);
    const initial = await readActiveSession(page);
    const expected = expectedRandomization(initial.seed);
    assert.equal(initial.randomizationAlgorithm, 'fnv1a32-xorshift32-fisher-yates-v1');
    assert.deepEqual(initial.trialOrder, expected.order);
    for (const id of initial.trialOrder) assert.deepEqual(initial.trials[id].sideMapping, expected.sideMappings[id]);
    const duplicateContext = await browser.newContext();
    try {
      const duplicate = await newPage(duplicateContext, httpUrl, 'synthetic-http-check-seed');
      await startSession(duplicate);
      const repeated = await readActiveSession(duplicate);
      assert.equal(repeated.seed, initial.seed);
      assert.deepEqual(repeated.trialOrder, initial.trialOrder);
      for (const id of initial.trialOrder) assert.deepEqual(repeated.trials[id].sideMapping, initial.trials[id].sideMapping);
    } finally { await duplicateContext.close(); }

    await playFromStart(page, 'a');
    await page.waitForFunction(() => window.__audioContexts.length === 1 && window.__audioContexts[0].state === 'running');
    const activeId = initial.trialOrder[0], activeTrial = initial.trials[activeId];
    const armA = activeTrial.sideMapping.A.sourceArm;
    const pairId = activeTrial.sideMapping.A.sourcePairId;
    const expectedGain = validation.listeningPostGain.sources.find(row => row.pairId === pairId &&
      row.sourceManifestEntryId === config.pairs.find(pair => pair.id === pairId)[armA].sourcePairLabel).postGainLinear;
    const actualGain = await page.evaluate(() => window.__audioGains[0]?.gain.value);
    assert.equal(actualGain, Math.fround(expectedGain), 'Web Audio GainNode applies the declared gain at its Float32 parameter precision');
    const audioA = page.locator('.blind-card audio').nth(0);
    await audioA.evaluate(audio => { audio.pause(); audio.currentTime = 0.7; });
    await page.locator('[data-testid="restart-a"]').click();
    assert.ok(await audioA.evaluate(audio => audio.currentTime < 0.1), 'restart resets playback to zero');
    await playFromStart(page, 'b');
    assert.equal(await audioA.evaluate(audio => audio.paused), true, 'A/B playback is mutually exclusive');
    assert.equal(await page.locator('.blind-card audio').nth(1).evaluate(audio => audio.paused), false);
    const gainB = await page.evaluate(() => window.__audioGains[1].gain.value);
    assert.equal(gainB, Math.fround(expectedGain), 'paired A/B use one common matched post-gain');

    for (let index = 0; index < 7; index++) {
      const different = page.locator('[data-field="different"]');
      const confidence = page.locator('[data-field="confidence"]');
      const note = page.locator('[data-field="pre-note"]');
      if (index === 0) {
        await different.selectOption('yes'); await confidence.selectOption('4'); await note.fill('first neutral note');
        await page.locator('[data-action="save-judgment"]').click();
        const firstSaved = await readActiveSession(page);
        const firstJudgment = firstSaved.trials[activeId].preRevealJudgmentsByMode['rms-matched-listening-only'].first;
        assert.deepEqual({ different: firstJudgment.different, confidence: firstJudgment.confidence, freeNote: firstJudgment.freeNote },
          { different: 'yes', confidence: 4, freeNote: 'first neutral note' });
        await different.selectOption('no'); await confidence.selectOption('2'); await note.fill('later neutral revision');
        await page.locator('[data-action="save-judgment"]').click();
        const revised = await readActiveSession(page);
        const entry = revised.trials[activeId].preRevealJudgmentsByMode['rms-matched-listening-only'];
        assert.deepEqual({ different: entry.first.different, confidence: entry.first.confidence, freeNote: entry.first.freeNote },
          { different: 'yes', confidence: 4, freeNote: 'first neutral note' });
        assert.deepEqual({ different: entry.latest.different, confidence: entry.latest.confidence, freeNote: entry.latest.freeNote },
          { different: 'no', confidence: 2, freeNote: 'later neutral revision' });
      } else {
        await different.selectOption(index % 2 ? 'unsure' : 'no');
        await confidence.selectOption('3');
        await note.fill('neutral first-listen note');
      }
      await page.locator('[data-action="reveal"]').click();
      assert.equal(await page.locator('.revealed-analysis').evaluate(node => node.hidden), false);
      assert.match(await page.locator('.revealed-identity').textContent(), /compact|elongated|curved|Y-branch|loop-like|concave/);
      if (index === 0) {
        assert.equal(await page.locator('input[name="listening-mode"][value="fixed-gain"]').isDisabled(), false);
        await playFromStart(page, 'a');
        await page.locator('input[name="listening-mode"][value="fixed-gain"]').check();
        await playFromStart(page, 'a');
        assert.equal(await page.evaluate(() => window.__audioGains.at(-1).gain.value), 1, 'fixed-gain playback remains unity');
        await page.locator('input[name="listening-mode"][value="rms-matched-listening-only"]').check();
      }
      await page.locator('#next-trial').click();
    }
    assert.equal(await page.locator('#blind-complete').isVisible(), true);
    assert.equal(await page.locator('#export-notes').isDisabled(), false);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-notes').click()]);
    const exportPath = await download.path();
    const payload = JSON.parse(await readFile(exportPath, 'utf8'));
    const session = payload.sessions[0];
    assert.equal(payload.schemaVersion, 2);
    assert.equal(session.completed, true);
    assert.equal(session.seed, initial.seed);
    assert.deepEqual(session.trialOrder, initial.trialOrder);
    assert.equal(session.randomizationAlgorithm, 'fnv1a32-xorshift32-fisher-yates-v1');
    assert.equal(session.trials.length, 7);
    for (const trial of session.trials) {
      assert.equal(trial.revealed, true);
      assert.ok(trial.sideMapping.A.audioFileHashes.rmsMatchedListeningOnly.sha256);
      assert.ok(trial.sideMapping.A.playbackMetadata.matchedPostGain.postGainLinear > 0);
      for (const side of ['A', 'B']) {
        const source = sources.get(trial.sideMapping[side].sourceManifestEntryId);
        const caseId = `case-${trial.sideMapping[side].sourceManifestEntryId.slice(-2)}`;
        assert.ok(source, `${trial.trialId}/${side}: exported source identity`);
        assert.deepEqual(trial.sideMapping[side].audioFileHashes.fixedGain,
          { path: `listening/${caseId}-fixed.wav`, bytes: source.fixed.bytes, sha256: source.fixed.sha256 });
        assert.deepEqual(trial.sideMapping[side].audioFileHashes.rmsMatchedListeningOnly,
          { path: `listening/${caseId}-matched.wav`, bytes: source.levelMatched.bytes, sha256: source.levelMatched.sha256 });
      }
      if (trial.isCatch) {
        assert.equal(trial.trialId, 'shape-catch-aa');
        assert.deepEqual(trial.sideMapping.A.audioFileHashes, trial.sideMapping.B.audioFileHashes);
        assert.equal(trial.sideMapping.A.sourcePairId, 'shape-pair-01');
        assert.equal(trial.sideMapping.A.sourceArm, 'a');
      } else {
        assert.equal(trial.sideMapping.A.sourcePairId, trial.trialId);
        assert.equal(trial.sideMapping.B.sourcePairId, trial.trialId);
        assert.notEqual(trial.sideMapping.A.sourceArm, trial.sideMapping.B.sourceArm);
      }
    }
    const firstExport = session.trials.find(trial => trial.trialId === activeId).preRevealJudgmentsByMode['rms-matched-listening-only'];
    assert.equal(firstExport.first.different, 'yes');
    assert.equal(firstExport.first.confidence, 4);
    assert.equal(firstExport.latest.different, 'no');
    assert.equal(firstExport.latest.confidence, 2);
    assert.equal(await page.evaluate(() => window.__fetchCalls), 0);
  } finally { await context.close(); }

  assert.deepEqual(remoteRequests, []);
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  assert.ok(localRequests.some(url => url.endsWith('/synthetic-shape-listening.html')));
  assert.ok(localRequests.some(url => /\/case-0[1-6]-matched\.wav$/.test(url)));
  const stats = await stat(htmlPath);
  const result = { passed: true, browser: 'Chromium', browserVersion: browser.version(),
    filePlayback, httpPlayback: true, exportSchemaVersion: 2, randomizedTrials: 7,
    fixedGainUnity: true, matchedPostGain: true, wavCount: wavReceipts.size,
    totalWavBytes, htmlBytes: stats.size, localHttpRequests: localRequests.length,
    remoteRequests: remoteRequests.length, pageErrors: pageErrors.length };
  const reportBytes = Buffer.from(JSON.stringify(result, null, 2) + '\n');
  await writeFile(path.join(packagePath, 'browser-check.json'), reportBytes);
  const validationPath = path.join(packagePath, 'viewer-validation.json');
  const updatedValidation = JSON.parse(await readFile(validationPath, 'utf8'));
  updatedValidation.browserCheck = { path: 'browser-check.json', bytes: reportBytes.length,
    sha256: sha256(reportBytes), command: 'node scripts/ant-synthetic-plate-shape-browser-check.js' };
  await writeFile(validationPath, JSON.stringify(updatedValidation, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
