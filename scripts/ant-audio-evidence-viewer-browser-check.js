import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const playwrightVersion = require('playwright/package.json').version;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'docs/ant/evidence/2026-10-14-base-born-natural-event-erb');
const htmlPath = path.join(evidence, 'listening.html');
const crossEvidence = path.join(root, 'docs/ant/evidence/2026-10-13-plate-sonic-individuality');
const crossEvidenceRelative = 'docs/ant/evidence/2026-10-13-plate-sonic-individuality';
const crossAudioDirectory = 'cross-plate-listening';
const crossAudioPath = path.join(crossEvidence, crossAudioDirectory);
const crossHtmlPath = path.join(crossEvidence, 'cross-plate-listening.html');
const manifest = JSON.parse(await readFile(path.join(evidence, 'listening-manifest.json'), 'utf8'));
const viewerValidation = JSON.parse(await readFile(path.join(evidence, 'viewer-validation.json'), 'utf8'));
const crossManifest = JSON.parse(await readFile(path.join(crossEvidence, 'listening-manifest.json'), 'utf8'));
const crossConfig = JSON.parse(await readFile(path.join(crossEvidence, 'cross-plate-viewer-config.json'), 'utf8'));
const descriptorRoster = JSON.parse(await readFile(path.join(crossEvidence, 'descriptor-roster.json'), 'utf8'));
const crossValidation = JSON.parse(await readFile(path.join(crossEvidence, 'cross-plate-viewer-validation.json'), 'utf8'));
const htmlBytes = await readFile(htmlPath);
const crossHtmlBytes = await readFile(crossHtmlPath);
const checkScriptBytes = await readFile(fileURLToPath(import.meta.url));
const remoteRequests = [], pageErrors = [], localServerRequests = [];
const wavReceipts = new Map();
for (const pair of manifest.pairs) for (const record of Object.values(pair.files)) wavReceipts.set(record.path, record);
assert.equal(wavReceipts.size, 12, 'natural-event manifest retains exactly 12 WAV files');
for (const [relativePath, receipt] of wavReceipts) {
  const bytes = await readFile(path.join(root, relativePath));
  assert.equal(bytes.length, receipt.bytes, relativePath + ' byte length matches manifest');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sha256, relativePath + ' SHA-256 matches manifest');
}
assert.equal(viewerValidation.validatedAudioFiles.length, 12, 'viewer receipt list covers all 12 WAVs');
assert.equal(viewerValidation.fixedGainOnlyErbAnalysis, true, 'ERB input remains fixed gain only');
assert.equal(viewerValidation.blindSession.sameBytesAndSha256ForBothSides, true, 'generator verified exact A/A source identity');
assert.deepEqual(viewerValidation.erbDisplay.absolutePowerDbScale, [-180, 0]);
assert.deepEqual(viewerValidation.erbDisplay.differenceDbScale, [-120, 120]);
assert.equal(viewerValidation.listeningPostGain.targetRms, 0.08);
assert.equal(viewerValidation.listeningPostGain.allPredictedPeaksBelowFullScale, true);
assert.ok(viewerValidation.listeningPostGain.sources.every(item => item.finalTargetRms === 0.08 &&
  item.predictedPostGainPeak < 1));
for (const pair of manifest.pairs) {
  const gains = viewerValidation.listeningPostGain.sources.filter(item => item.pairId === pair.label);
  const matchedManifestRecord = Object.entries(pair.files).find(([key]) => key.startsWith('rms-matched-listening-only:'))[1];
  assert.equal(gains.length, 2, pair.label + ' has one common playback gain for both arms');
  assert.equal(gains[0].postGainLinear, 0.08 / matchedManifestRecord.rmsAfter);
  assert.equal(gains[0].postGainLinear, gains[1].postGainLinear);
}
assert.ok(viewerValidation.erbAnalysisParity.every(item => item.passed && item.maxAbsoluteErrorDb === 0),
  'existing q25/q50/q75 ERB measurements retain exact parity');
const crossAudioReceipts = new Map();
for (const entry of crossManifest.listening) {
  crossAudioReceipts.set(path.posix.join(crossEvidenceRelative, crossAudioDirectory, path.posix.basename(entry.fixed.path)), entry.fixed);
  crossAudioReceipts.set(path.posix.join(crossEvidenceRelative, crossAudioDirectory, path.posix.basename(entry.levelMatched.path)), entry.levelMatched);
}
assert.equal(crossAudioReceipts.size, 24, 'cross-Plate manifest retains 24 fixed and matched WAV receipts');
const committedWavNames = await readdir(crossAudioPath);
assert.equal(committedWavNames.length, 24, 'committed listening subset contains exactly 24 files');
assert.ok(committedWavNames.every(name => name.endsWith('.wav')), 'committed listening subset contains only WAVs');
const crossValidationReceipts = new Map(crossValidation.validatedAudioFiles.map(record => [record.path, record]));
assert.equal(crossValidationReceipts.size, 24);
for (const [relativePath, receipt] of crossAudioReceipts) {
  const bytes = await readFile(path.join(root, relativePath));
  assert.equal(bytes.length, receipt.bytes, relativePath + ' byte length matches manifest');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sha256, relativePath + ' SHA-256 matches manifest');
  const validationReceipt = crossValidationReceipts.get(path.posix.join(crossAudioDirectory, path.posix.basename(relativePath)));
  assert.deepEqual(validationReceipt && { bytes: validationReceipt.bytes, sha256: validationReceipt.sha256 },
    { bytes: receipt.bytes, sha256: receipt.sha256 }, relativePath + ' committed copy matches original validation receipt');
}
assert.equal(crossValidation.validatedAudioFiles.length, 24);
assert.equal(crossValidation.listeningPostGain.targetRms, 0.08);
assert.equal(crossValidation.listeningPostGain.allPredictedPeaksBelowFullScale, true);
assert.ok(crossValidation.listeningPostGain.sources.every(item => item.postGainLinear === 4 &&
  Math.abs(item.postGainDb - 12.041199826559248) < 1e-12 && item.predictedPostGainPeak < 1));
assert.equal(crossValidation.blindSession.pairingRule, 'manifest-order-adjacent-v1');
assert.equal(crossValidation.blindSession.trialCount, 7);
assert.equal(crossValidation.blindSession.betweenSourceCount, 12);
assert.equal(crossValidation.blindSession.sourceManifestEntryId, crossManifest.listening[0].id);
assert.equal(crossValidation.blindSession.sameBytesAndSha256ForBothSides, true);
assert.equal(crossValidation.fixedGainOnlyErbAnalysis, false, 'cross-Plate blind reveal does not require ERB');
assert.equal(crossValidation.erbHelper, null);
const expectedPairs = [
  ['20261005-trail-plate-15-p50-native', '20261006-trail-plate-17-p50-native'],
  ['20261007-trail-plate-20-p50-native', '20261005-trail-plate-1-p50-native'],
  ['20261006-trail-plate-14-p50-native', '20261005-trail-plate-24-p50-native'],
  ['20261007-trail-plate-1-p50-native', '20261007-trail-plate-26-p50-native'],
  ['20261006-trail-plate-24-p50-native', '20261005-trail-plate-23-p50-native'],
  ['20261005-trail-plate-27-p50-native', '20261007-trail-plate-31-p50-native']
];
assert.deepEqual(crossValidation.blindSession.pairingOrder, expectedPairs,
  'pairs follow the requested adjacent listening-manifest order exactly');
assert.deepEqual(crossConfig.pairs.map(pair => [pair.a.sourcePairLabel, pair.b.sourcePairLabel]), expectedPairs);
const descriptorByKey = new Map(descriptorRoster.corpus.map(item => [item.key, item]));
for (const pair of crossConfig.pairs) for (const arm of [pair.a, pair.b]) {
  const item = descriptorByKey.get(arm.measurementMetadata.corpusKey);
  const source = crossManifest.listening.find(entry => entry.id === arm.sourcePairLabel);
  assert.ok(item, arm.measurementMetadata.corpusKey + ' exists in descriptor roster');
  assert.ok(source, arm.sourcePairLabel + ' exists in original listening manifest');
  assert.equal(arm.fixedGainPath, path.posix.join(crossEvidenceRelative, crossAudioDirectory, path.posix.basename(source.fixed.path)));
  assert.equal(arm.rmsMatchedPath, path.posix.join(crossEvidenceRelative, crossAudioDirectory, path.posix.basename(source.levelMatched.path)));
  assert.deepEqual(arm.measurementMetadata, { corpusKey: item.key, seed: item.seed, plateId: item.plateId,
    geometry: { solverNodes: item.solverNodes, geodesicLength: item.geodesicLength,
      meanHalfWidth: item.meanHalfWidth, boundaryFraction: item.boundaryFraction, pickupDistance: item.pickupDistance },
    material: item.material }, item.key + ' Reveal metadata matches the stored descriptor roster');
}
assert.doesNotMatch(crossHtmlBytes.toString('utf8'), /DynamicsCompressor|createDynamicsCompressor|\blimiter\b/i,
  'cross-Plate playback contains no limiter or compressor stage');
assert.doesNotMatch(crossHtmlBytes.toString('utf8'), /test-results\//,
  'cross-Plate viewer embeds no ignored source paths');
assert.ok(crossHtmlBytes.length < 100_000, 'cross-Plate HTML contains metadata, not the frozen PCM');
assert.doesNotMatch(crossHtmlBytes.toString('utf8'), /data:audio\//i, 'cross-Plate HTML does not embed audio data');

let serverRoot = root, isolatedHttpRoot = null;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const target = path.resolve(serverRoot, '.' + pathname);
    if (target !== serverRoot && !target.startsWith(serverRoot + path.sep)) { response.writeHead(403).end(); return; }
    const bytes = await readFile(target);
    const ext = path.extname(target).toLowerCase();
    const contentType = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.wav' ? 'audio/wav' : 'application/octet-stream';
    localServerRequests.push(pathname);
    response.writeHead(200, { 'Content-Type': contentType }); response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
const browser = await chromium.launch({ headless: true });
function observe(page) {
  page.on('request', request => {
    if (/^https?:/i.test(request.url()) && !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/i.test(request.url()))
      remoteRequests.push(request.url());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
}
async function freshBlindPage(seed) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage(); observe(page);
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
  }, seed);
  await page.addInitScript(() => {
    window.__fetchCalls = 0;
    const original = window.fetch;
    window.fetch = (...args) => { window.__fetchCalls++; return original(...args); };
  });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  assert.equal(await page.title(), 'Natural-event listening session');
  assert.equal(await page.locator('input[name="listening-mode"][value="rms-matched-listening-only"]').isChecked(), true,
    'RMS-matched listening mode is the first-listen default');
  assert.equal(await page.locator('#session-seed').count(), 0, 'seed is not exposed before first-listen trials');
  await page.locator('#start-session').click();
  assert.equal(await page.locator('.blind-card').isVisible(), true, 'blind trial starts after session creation');
  return { context, page };
}
async function freshCrossBlindPage(seed, url = pathToFileURL(crossHtmlPath).href) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage(); observe(page);
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
  }, seed);
  await page.addInitScript(() => {
    window.__fetchCalls = 0; window.__audioContexts = []; window.__audioGains = [];
    const NativeAudioContext = window.AudioContext;
    NativeAudioContext.prototype.createGain = new Proxy(NativeAudioContext.prototype.createGain, {
      apply(target, context, args) {
        const gain = Reflect.apply(target, context, args); window.__audioGains.push(gain); return gain;
      }
    });
    window.AudioContext = new Proxy(NativeAudioContext, {
      construct(target, args) {
        const context = Reflect.construct(target, args); window.__audioContexts.push(context); return context;
      }
    });
    const originalFetch = window.fetch;
    window.fetch = (...args) => { window.__fetchCalls++; return originalFetch(...args); };
  });
  await page.goto(url, { waitUntil: 'load' });
  assert.equal(await page.title(), 'Cross-Plate p50 blind listening session');
  assert.equal(await page.locator('input[name="listening-mode"][value="rms-matched-listening-only"]').isChecked(), true);
  assert.equal(await page.locator('input[name="listening-mode"][value="fixed-gain"]').isDisabled(), true,
    'fixed-gain mode is unavailable before Reveal');
  await page.locator('#start-session').click();
  assert.equal(await page.locator('.blind-card').isVisible(), true);
  return { context, page };
}
async function revealCrossTrial(page, different = 'unsure', note = '') {
  const visibleText = await page.locator('body').evaluate(node => node.innerText);
  assert.doesNotMatch(visibleText, /2026100[567]|trail-plate-\d+|control-aa|A\/A catch/i,
    'cross-Plate identity and catch stay out of visible pre-reveal text');
  assert.equal(await page.locator('.erb-details').count(), 0, 'ERB is absent from the cross-Plate blind workflow');
  await page.locator('[data-field="different"]').selectOption(different);
  await page.locator('[data-field="confidence"]').selectOption('4');
  if (note) await page.locator('[data-field="pre-note"]').fill(note);
  await page.locator('[data-action="reveal"]').click();
  assert.equal(await page.locator('.revealed-analysis').isVisible(), true);
  assert.equal(await page.locator('.erb-details').count(), 0, 'Reveal works without ERB configuration');
}
async function assertBlindText(page) {
  const text = await page.locator('body').evaluate(node => node.innerText);
  assert.doesNotMatch(text, /\bBase\b|\bBorn\b|A\/A catch/i, 'condition and catch identity stay out of pre-reveal DOM text');
  assert.equal(await page.locator('.pair-card').count(), 0, 'legacy named pairs are not rendered in blind mode');
  assert.equal(await page.locator('.erb-details').count(), 0, 'ERB panels do not exist before Reveal');
}
async function revealCurrent(page, values = {}) {
  await assertBlindText(page);
  await page.locator('[data-field="different"]').selectOption(values.different || 'unsure');
  await page.locator('[data-field="confidence"]').selectOption(String(values.confidence || 3));
  if (values.note) await page.locator('[data-field="pre-note"]').fill(values.note);
  await page.locator('[data-action="reveal"]').click();
  assert.equal(await page.locator('.revealed-analysis').isVisible(), true, 'Reveal opens analysis and identity');
  assert.equal(await page.locator('.erb-details').count(), 1, 'Reveal displays one fixed-scale A/B/difference ERB view');
  assert.equal(await page.locator('.erb-details').evaluate(node => node.open), true, 'ERB is expanded by Reveal');
  assert.equal(await page.locator('.measurement-details').evaluate(node => node.open), true,
    'existing measurement metadata is expanded by Reveal');
  const erbLabels = await page.locator('.erb-details figcaption').allTextContents();
  assert.equal(erbLabels.length, 3, 'ERB contains A, B, and difference panels');
  assert.match(erbLabels[0], /^A — /);
  assert.match(erbLabels[1], /^B — /);
  assert.match(erbLabels[2], /^B − A difference$/);
  assert.match(await page.locator('.erb-details').textContent(), /Fixed-gain WAVs only/);
  assert.match(await page.locator('.erb-details').textContent(), /No per-pair autoscale/);
}

try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const firstSeed = 'blind-browser-check-20261015';
  const { context, page } = await freshBlindPage(firstSeed);
  try {
    await assertBlindText(page);
    assert.match(await page.locator('#mode-status').textContent(), /not audibility evidence/);
    assert.match(await page.locator('#session-meta').textContent(), /Trial 1 of 4/);
    assert.equal(await page.locator('.blind-card audio').count(), 2, 'only anonymous A/B playbacks are shown');
    assert.deepEqual(await page.locator('[data-field="different"] option').evaluateAll(nodes => nodes.map(node => node.value)),
      ['', 'yes', 'unsure', 'no'], 'pre-reveal response scale has only the requested three choices');
    assert.deepEqual(await page.locator('[data-field="confidence"] option').evaluateAll(nodes => nodes.map(node => node.value)),
      ['', '1', '2', '3', '4', '5'], 'confidence scale is bounded from 1 to 5');

    const a = page.locator('.blind-card audio').nth(0), b = page.locator('.blind-card audio').nth(1);
    await page.locator('[data-testid="restart-a"]').click();
    await page.waitForFunction(() => {
      const audio = document.querySelector('.blind-card audio');
      return audio && !audio.paused && audio.currentTime > 0.02;
    }, null, { timeout: 5000 });
    assert.match(await a.getAttribute('src'), /rms-matched-listening-only\.wav$/, 'A uses the selected RMS-matched file');
    const beforeReplay = await a.evaluate(audio => audio.currentTime);
    await page.locator('[data-testid="restart-a"]').click();
    assert.ok(beforeReplay > 0.02 && await a.evaluate(audio => audio.currentTime) < 0.1,
      'A restarts from time zero');
    await page.locator('[data-testid="restart-b"]').click();
    await page.waitForFunction(() => {
      const audio = document.querySelectorAll('.blind-card audio');
      return audio[0].paused && !audio[1].paused && audio[1].currentTime > 0.02;
    }, null, { timeout: 5000 });
    assert.equal(await a.evaluate(audio => audio.paused), true, 'A and B remain exclusive');
    assert.match(await b.getAttribute('src'), /rms-matched-listening-only\.wav$/);
    await page.locator('input[name="listening-mode"][value="fixed-gain"]').check();
    await page.locator('[data-testid="restart-a"]').click();
    assert.match(await a.getAttribute('src'), /fixed-gain\.wav$/, 'selected fixed-gain mode loads its own WAV');
    await page.locator('input[name="listening-mode"][value="rms-matched-listening-only"]').check();
    await page.locator('[data-testid="restart-a"]').click();
    assert.match(await a.getAttribute('src'), /rms-matched-listening-only\.wav$/, 'selected RMS mode loads its own WAV');

    await page.locator('[data-field="different"]').selectOption('yes');
    await page.locator('[data-field="confidence"]').selectOption('4');
    await page.locator('[data-field="pre-note"]').fill('first RMS judgment');
    await page.locator('[data-action="save-judgment"]').click();
    await page.locator('[data-field="different"]').selectOption('no');
    await page.locator('[data-field="confidence"]').selectOption('3');
    await page.locator('[data-field="pre-note"]').fill('latest RMS pre-reveal revision');
    await page.locator('[data-action="save-judgment"]').click();
    await page.locator('input[name="listening-mode"][value="fixed-gain"]').check();
    assert.equal(await page.locator('[data-field="different"]').inputValue(), '', 'mode switch starts a separate judgment draft');
    await page.locator('[data-field="different"]').selectOption('unsure');
    await page.locator('[data-field="confidence"]').selectOption('2');
    await page.locator('[data-field="pre-note"]').fill('first fixed-gain judgment');
    await page.locator('[data-action="save-judgment"]').click();
    await page.locator('input[name="listening-mode"][value="rms-matched-listening-only"]').check();
    assert.equal(await page.locator('[data-field="different"]').inputValue(), 'no', 'RMS draft restores independently');
    await page.locator('[data-action="reveal"]').click();
    assert.equal(await page.locator('.revealed-analysis').isVisible(), true);
    assert.match(await page.locator('.revealed-identity').textContent(), /Base|Born|A\/A catch/,
      'condition identity appears only after Reveal');
    assert.equal(await page.locator('#reveal-mode-status .current-listening-mode').textContent(), 'Listening: RMS matched');
    assert.equal(await page.locator('#reveal-mode-status .analysis-view').textContent(), 'Analysis view: fixed gain');
    assert.match(await page.locator('.pre-reveal-summary').textContent(), /first RMS judgment/);
    assert.match(await page.locator('.pre-reveal-summary').textContent(), /latest RMS pre-reveal revision/);
    assert.match(await page.locator('.pre-reveal-summary').textContent(), /first fixed-gain judgment/);
    await page.locator('[data-field="post-note"]').fill('RMS post-reveal interpretation');
    await page.locator('input[name="listening-mode"][value="fixed-gain"]').check();
    assert.equal(await page.locator('#reveal-mode-status .current-listening-mode').textContent(), 'Listening: fixed gain');
    assert.equal(await page.locator('#reveal-mode-status .analysis-view').textContent(), 'Analysis view: fixed gain');
    assert.equal(await page.locator('[data-field="post-note"]').inputValue(), '', 'post-reveal notes are mode-specific');
    await page.locator('[data-field="post-note"]').fill('fixed-gain post-reveal interpretation');
    await page.locator('input[name="listening-mode"][value="rms-matched-listening-only"]').check();
    assert.equal(await page.locator('[data-field="post-note"]').inputValue(), 'RMS post-reveal interpretation',
      'switching modes restores, rather than replaces, the other post-reveal note');

    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('.revealed-analysis').isVisible(), true, 'revealed trial state survives reload');
    assert.match(await page.locator('.pre-reveal-summary').textContent(), /first RMS judgment/,
      'first pre-reveal judgment survives reload');
    await page.locator('#next-trial').click();
    for (let index = 1; index < 4; index++) {
      await revealCurrent(page, { different: index % 2 ? 'no' : 'unsure', confidence: index + 1, note: 'blind note ' + index });
      if ((await page.locator('.revealed-identity').textContent()).includes('A/A catch trial')) {
        assert.match(await page.locator('.revealed-identity').textContent(), /exact same .* source/,
          'A/A identity appears only in revealed analysis');
      }
      await page.locator('#next-trial').click();
    }
    assert.equal(await page.locator('#blind-complete').isVisible(), true, 'four randomized trials complete');
    assert.equal(await page.locator('#export-notes').isEnabled(), true, 'full mapping export unlocks after all Reveals');
    assert.equal(await page.evaluate(() => window.__fetchCalls), 0, 'standalone page performs no runtime fetch');

    await page.locator('[data-action="review-last"]').click();
    await page.locator('[data-field="post-note"]').evaluate(node => { node.value = 'unsaved visible edit included in export'; });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-notes').click();
    const download = await downloadPromise;
    const payload = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(payload.schemaVersion, 2);
    assert.equal(payload.viewerId, 'ant-base-born-natural-event-erb');
    assert.equal(payload.evidenceId, '2026-10-14-base-born-natural-event-erb');
    assert.equal(payload.sessions.length, 1);
    const session = payload.sessions[0];
    assert.match(session.seed, /^[0-9a-f]{16}$/, 'export carries a browser-random reproducibility seed');
    assert.match(session.randomizationAlgorithm, /fisher-yates-v1/);
    assert.equal(session.trialOrder.length, 4);
    assert.equal(new Set(session.trialOrder).size, 4, 'trial order contains each normal/catch trial once');
    assert.deepEqual(session.trials.map(item => item.trialSequence), [1, 2, 3, 4]);
    assert.ok(session.trials.every(item => item.revealed && item.sideMapping && item.audioFileHashes),
      'revealed condition mapping, audio hashes, and Reveal status are exported');
    assert.deepEqual(new Set(session.trials.filter(item => !item.isCatch).map(item => item.trialId)), new Set(['q25', 'q50', 'q75']));
    const firstTrial = session.trials.find(item => item.trialSequence === 1);
    const rmsJudgment = firstTrial.preRevealJudgmentsByMode['rms-matched-listening-only'];
    const fixedJudgment = firstTrial.preRevealJudgmentsByMode['fixed-gain'];
    assert.equal(rmsJudgment.first.different, 'yes', 'first pre-reveal value is immutable');
    assert.equal(rmsJudgment.first.confidence, 4);
    assert.equal(rmsJudgment.first.freeNote, 'first RMS judgment');
    assert.equal(rmsJudgment.latest.different, 'no', 'latest pre-reveal revision is separate from first');
    assert.equal(rmsJudgment.latest.freeNote, 'latest RMS pre-reveal revision');
    assert.equal(fixedJudgment.first.different, 'unsure', 'fixed-gain judgment is stored separately');
    assert.equal(fixedJudgment.first.confidence, 2);
    assert.equal(firstTrial.postRevealNotesByMode['rms-matched-listening-only'].note, 'RMS post-reveal interpretation');
    assert.equal(firstTrial.postRevealNotesByMode['fixed-gain'].note, 'fixed-gain post-reveal interpretation');
    const finalTrial = session.trials.find(item => item.trialSequence === 4);
    assert.equal(finalTrial.postRevealNotesByMode['rms-matched-listening-only'].note,
      'unsaved visible edit included in export', 'export synchronizes the current UI value');
    const catchTrial = session.trials.find(item => item.isCatch);
    assert.ok(catchTrial, 'exactly one revealed A/A catch is exported');
    for (const mode of ['fixedGain', 'rmsMatchedListeningOnly']) {
      assert.deepEqual(catchTrial.audioFileHashes.A[mode], catchTrial.audioFileHashes.B[mode],
        'A/A catch uses identical ' + mode + ' path, bytes, and SHA-256');
    }
    assert.ok(session.events.some(event => event.type === 'analysis_revealed' && event.timestamp));

    const deterministic = await freshBlindPage(firstSeed);
    try {
      for (let index = 0; index < 4; index++) {
        await revealCurrent(deterministic.page, { different: 'yes', confidence: 4 });
        await deterministic.page.locator('#next-trial').click();
      }
      const repeatDownloadPromise = deterministic.page.waitForEvent('download');
      await deterministic.page.locator('#export-notes').click();
      const repeatDownload = await repeatDownloadPromise;
      const repeated = JSON.parse(await readFile(await repeatDownload.path(), 'utf8')).sessions[0];
      assert.equal(repeated.seed, session.seed, 'test fixture repeats the same generated session seed');
      assert.deepEqual(repeated.trialOrder, session.trialOrder, 'same seed reproduces trial order');
      assert.deepEqual(repeated.trials.map(item => item.sideMapping), session.trials.map(item => item.sideMapping),
        'same seed reproduces anonymous side mapping');
    } finally { await deterministic.context.close(); }
  } finally { await context.close(); }

  const serverPageContext = await browser.newContext();
  const serverPage = await serverPageContext.newPage(); observe(serverPage);
  try {
    await serverPage.goto('http://127.0.0.1:' + server.address().port +
      '/docs/ant/evidence/2026-10-14-base-born-natural-event-erb/listening.html', { waitUntil: 'load' });
    assert.equal(await serverPage.title(), 'Natural-event listening session');
    assert.equal(await serverPage.locator('.blind-card').count(), 1, 'standalone viewer also loads from local HTTP');
    await serverPage.locator('#start-session').click();
    await assertBlindText(serverPage);
    await serverPage.locator('[data-testid="restart-a"]').click();
    await serverPage.waitForFunction(() => {
      const audio = document.querySelector('.blind-card audio');
      return audio && !audio.paused && audio.currentTime > 0.02;
    }, null, { timeout: 5000 });
    assert.ok(localServerRequests.includes('/docs/ant/evidence/2026-10-14-base-born-natural-event-erb/listening.html'),
      'repository-root local server serves Base/Born viewer HTML');
    assert.ok(localServerRequests.some(url => /listening\/q(25|50|75)-(base|born)-(fixed-gain|rms-matched-listening-only)\.wav$/.test(url)),
      'local server serves one of the existing relative WAVs');
  } finally { await serverPageContext.close(); }
  const crossSeed = 'cross-plate-browser-check-20261018';
  const crossRun = await freshCrossBlindPage(crossSeed);
  let crossSession;
  try {
    const text = await crossRun.page.locator('body').evaluate(node => node.innerText);
    assert.doesNotMatch(text, /2026100[567]|trail-plate-\d+|control-aa|A\/A catch/i,
      'pre-reveal UI contains no source identity or catch name');
    assert.match(await crossRun.page.locator('#mode-status').textContent(), /digital playback target RMS 0\.08/);
    assert.match(await crossRun.page.locator('#mode-status').textContent(), /not calibrated SPL/);
    assert.equal(await crossRun.page.locator('.blind-card audio').count(), 2);
    assert.equal(await crossRun.page.locator('.erb-details').count(), 0);
    const a = crossRun.page.locator('.blind-card audio').nth(0), b = crossRun.page.locator('.blind-card audio').nth(1);
    await crossRun.page.locator('[data-testid="restart-a"]').click();
    await crossRun.page.waitForFunction(() => {
      const audio = document.querySelector('.blind-card audio');
      return audio && !audio.paused && audio.currentTime > 0.02 && window.__audioContexts[0]?.state === 'running';
    }, null, { timeout: 5000 });
    assert.match(await a.getAttribute('src'), /cross-plate-listening\/.*\.listening-only\.wav$/);
    assert.deepEqual(await crossRun.page.evaluate(() => window.__audioGains.map(node => node.gain.value)), [4],
      'matched audio uses a Web Audio GainNode at the declared 4x gain');
    assert.equal(await a.evaluate(audio => audio.volume), 1, 'HTMLMediaElement volume stays at unity');
    assert.equal(await crossRun.page.evaluate(() => window.__fetchCalls), 0, 'cross-Plate viewer performs no fetch');
    const beforeReplay = await a.evaluate(audio => audio.currentTime);
    await crossRun.page.evaluate(() => window.__audioContexts[0].suspend());
    await crossRun.page.locator('[data-testid="restart-a"]').click();
    assert.ok(await a.evaluate(audio => audio.currentTime) < 0.1, 'restart resets matched playback to zero');
    await crossRun.page.waitForFunction(() => window.__audioContexts[0]?.state === 'running', null, { timeout: 5000 });
    assert.ok(beforeReplay > 0.02, 'first playback advanced before restart');
    await crossRun.page.locator('[data-testid="restart-b"]').click();
    await crossRun.page.waitForFunction(() => {
      const audio = document.querySelectorAll('.blind-card audio');
      return audio[0].paused && !audio[1].paused && audio[1].currentTime > 0.02;
    }, null, { timeout: 5000 });
    assert.deepEqual(await crossRun.page.evaluate(() => window.__audioGains.map(node => node.gain.value)), [4, 4],
      'A and B use the same matched-listening gain');

    await crossRun.page.locator('[data-field="different"]').selectOption('yes');
    await crossRun.page.locator('[data-field="confidence"]').selectOption('4');
    await crossRun.page.locator('[data-field="pre-note"]').fill('synthetic browser-check first judgment');
    await crossRun.page.locator('[data-action="save-judgment"]').click();
    await crossRun.page.locator('[data-field="different"]').selectOption('no');
    await crossRun.page.locator('[data-field="confidence"]').selectOption('3');
    await crossRun.page.locator('[data-field="pre-note"]').fill('synthetic browser-check revision');
    await crossRun.page.locator('[data-action="save-judgment"]').click();
    await revealCrossTrial(crossRun.page, 'no', 'synthetic browser-check revision');
    const revealed = JSON.parse(await crossRun.page.locator('.measurement-json').textContent());
    assert.match(await crossRun.page.locator('.revealed-identity').textContent(), /2026100[567]-trail-plate-\d+/);
    assert.equal(revealed.listeningPostGain.targetRms, 0.08);
    assert.equal(revealed.sideMapping.A.playbackMetadata.matchedPostGain.postGainLinear, 4);
    assert.equal(revealed.sideMapping.B.playbackMetadata.matchedPostGain.postGainLinear, 4);
    assert.ok(revealed.sideMapping.A.playbackMetadata.matchedPostGain.predictedPostGainPeak < 1);
    assert.ok(revealed.sideMapping.B.playbackMetadata.matchedPostGain.predictedPostGainPeak < 1);
    for (const side of ['A', 'B']) {
      assert.ok(crossManifest.listening.some(entry => entry.id === revealed.sideMapping[side].sourceManifestEntryId),
        'Reveal exposes exact manifest identity only after judgment');
      const metadata = revealed.sideMapping[side].measurementMetadata;
      assert.deepEqual(Object.keys(metadata.geometry).sort(),
        ['boundaryFraction', 'geodesicLength', 'meanHalfWidth', 'pickupDistance', 'solverNodes']);
      assert.deepEqual(Object.keys(metadata.material).sort(), ['damping', 'density', 'stiffness']);
      assert.equal(metadata.corpusKey, revealed.sideMapping[side].condition);
    }
    assert.equal(await crossRun.page.locator('input[name="listening-mode"][value="fixed-gain"]').isDisabled(), false,
      'fixed-gain context is available after Reveal');
    await crossRun.page.locator('input[name="listening-mode"][value="fixed-gain"]').check();
    await crossRun.page.locator('[data-testid="restart-a"]').click();
    await crossRun.page.waitForFunction(() => {
      const audio = document.querySelector('.blind-card audio'); return audio && !audio.paused && audio.currentTime > 0.02;
    }, null, { timeout: 5000 });
    assert.equal(await a.evaluate(audio => audio.volume), 1, 'fixed-gain playback stays at unity');
    await crossRun.page.locator('input[name="listening-mode"][value="rms-matched-listening-only"]').check();
    await crossRun.page.locator('[data-testid="restart-a"]').click();
    await crossRun.page.waitForFunction(() => {
      const audio = document.querySelector('.blind-card audio'); return audio && !audio.paused && audio.currentTime > 0.02;
    }, null, { timeout: 5000 });
    assert.equal(await crossRun.page.evaluate(() => window.__audioGains.at(-1).gain.value), 4,
      'matched playback restores its explicit gain after fixed-gain context');
    assert.equal(await crossRun.page.locator('#export-notes').isDisabled(), true,
      'JSON export remains locked until every trial is revealed');
    for (let index = 1; index < 7; index++) {
      await crossRun.page.locator('#next-trial').click();
      await revealCrossTrial(crossRun.page, index % 2 ? 'unsure' : 'yes', 'synthetic browser-check note');
    }
    await crossRun.page.locator('#next-trial').click();
    assert.equal(await crossRun.page.locator('#blind-complete').isVisible(), true);
    assert.equal(await crossRun.page.locator('#export-notes').isEnabled(), true);
    const downloadPromise = crossRun.page.waitForEvent('download');
    await crossRun.page.locator('#export-notes').click();
    const download = await downloadPromise;
    const payload = JSON.parse(await readFile(await download.path(), 'utf8'));
    crossSession = payload.sessions[0];
    assert.equal(payload.listeningPostGain.targetRms, 0.08);
    assert.match(crossSession.seed, /^[0-9a-f]{16}$/);
    assert.match(crossSession.randomizationAlgorithm, /fnv1a32-xorshift32-fisher-yates-v1/);
    assert.equal(crossSession.trialOrder.length, 7);
    assert.equal(new Set(crossSession.trialOrder).size, 7);
    assert.deepEqual(crossSession.trials.map(item => item.trialSequence), [1, 2, 3, 4, 5, 6, 7]);
    assert.ok(crossSession.trials.every(item => item.revealed && item.sideMapping && item.audioFileHashes));
    for (const trial of crossSession.trials) for (const side of ['A', 'B']) {
      const mapping = trial.sideMapping[side];
      const entry = crossManifest.listening.find(item => item.id === mapping.sourceManifestEntryId);
      assert.equal(trial.audioFileHashes[side].fixedGain.sha256, entry.fixed.sha256);
      assert.equal(trial.audioFileHashes[side].fixedGain.bytes, entry.fixed.bytes);
      assert.equal(trial.audioFileHashes[side].rmsMatchedListeningOnly.sha256, entry.levelMatched.sha256);
      assert.equal(trial.audioFileHashes[side].rmsMatchedListeningOnly.bytes, entry.levelMatched.bytes);
    }
    const firstJudgment = crossSession.trials.find(item => item.trialSequence === 1)
      .preRevealJudgmentsByMode['rms-matched-listening-only'];
    assert.equal(firstJudgment.first.different, 'yes');
    assert.equal(firstJudgment.first.freeNote, 'synthetic browser-check first judgment');
    assert.equal(firstJudgment.latest.different, 'no');
    assert.equal(firstJudgment.latest.freeNote, 'synthetic browser-check revision');
    const catchTrial = crossSession.trials.find(item => item.isCatch);
    assert.ok(catchTrial);
    assert.equal(catchTrial.sideMapping.A.sourceManifestEntryId, crossManifest.listening[0].id);
    assert.deepEqual(catchTrial.audioFileHashes.A.fixedGain, catchTrial.audioFileHashes.B.fixedGain);
    assert.deepEqual(catchTrial.audioFileHashes.A.rmsMatchedListeningOnly, catchTrial.audioFileHashes.B.rmsMatchedListeningOnly);

    const repeat = await freshCrossBlindPage(crossSeed);
    try {
      for (let index = 0; index < 7; index++) {
        await revealCrossTrial(repeat.page, 'yes');
        await repeat.page.locator('#next-trial').click();
      }
      const repeatDownloadPromise = repeat.page.waitForEvent('download');
      await repeat.page.locator('#export-notes').click();
      const repeatedSession = JSON.parse(await readFile(await (await repeatDownloadPromise).path(), 'utf8')).sessions[0];
      assert.equal(repeatedSession.seed, crossSession.seed);
      assert.deepEqual(repeatedSession.trialOrder, crossSession.trialOrder);
      assert.deepEqual(repeatedSession.trials.map(item => item.sideMapping), crossSession.trials.map(item => item.sideMapping),
        'exported seed reproduces cross-Plate trial order and A/B side mapping');
    } finally { await repeat.context.close(); }
  } finally { await crossRun.context.close(); }

  const crossHttpUrl = 'http://127.0.0.1:' + server.address().port +
    '/docs/ant/evidence/2026-10-13-plate-sonic-individuality/cross-plate-listening.html';
  isolatedHttpRoot = await mkdtemp(path.join(root, '.tmp-cross-plate-http-'));
  const isolatedEvidence = path.join(isolatedHttpRoot, crossEvidenceRelative);
  const isolatedAudio = path.join(isolatedEvidence, crossAudioDirectory);
  await mkdir(isolatedAudio, { recursive: true });
  await copyFile(crossHtmlPath, path.join(isolatedEvidence, path.basename(crossHtmlPath)));
  for (const name of committedWavNames) await copyFile(path.join(crossAudioPath, name), path.join(isolatedAudio, name));
  assert.equal((await readdir(isolatedHttpRoot)).includes('test-results'), false,
    'fresh repository-style root has no ignored test-results directory');
  serverRoot = isolatedHttpRoot;
  const isolatedRequestStart = localServerRequests.length;
  const crossServerRun = await freshCrossBlindPage('cross-plate-http-check-20261018', crossHttpUrl);
  const crossServerPage = crossServerRun.page;
  try {
    await crossServerPage.locator('[data-testid="restart-a"]').click();
    await crossServerPage.waitForFunction(() => {
      const audio = document.querySelector('.blind-card audio');
      return audio && !audio.paused && audio.currentTime > 0.02 && window.__audioContexts[0]?.state === 'running';
    }, null, { timeout: 5000 });
    assert.ok(localServerRequests.includes('/docs/ant/evidence/2026-10-13-plate-sonic-individuality/cross-plate-listening.html'));
    const isolatedRequests = localServerRequests.slice(isolatedRequestStart);
    assert.ok(isolatedRequests.some(url => url.startsWith('/docs/ant/evidence/2026-10-13-plate-sonic-individuality/cross-plate-listening/') &&
      url.endsWith('.listening-only.wav')), 'fresh HTTP root serves committed matched WAVs');
    assert.ok(isolatedRequests.every(url => !url.includes('test-results/')), 'fresh HTTP playback does not use test-results');
    assert.deepEqual(await crossServerPage.evaluate(() => window.__audioGains.map(node => node.gain.value)), [4]);
  } finally { await crossServerRun.context.close(); }
  assert.deepEqual(remoteRequests, [], 'file and local-server modes make no remote requests');
  assert.deepEqual(pageErrors, [], 'headless Chromium reports no uncaught page errors');
  console.log(JSON.stringify({ browser: 'Chromium', browserVersion: browser.version(), playwrightVersion, headless: true,
    protocols: ['file://', 'http://127.0.0.1'], htmlBytes: htmlBytes.length,
    htmlSha256: createHash('sha256').update(htmlBytes).digest('hex'),
    checkScriptSha256: createHash('sha256').update(checkScriptBytes).digest('hex'),
    receipts: { baseBornWavFiles: wavReceipts.size, crossPlateWavFiles: crossAudioReceipts.size,
      allManifestHashesMatch: true, aaCatchSideHashesAndBytesMatch: true },
    checks: { blindedDomUntilReveal: true, randomizedTrialOrderAndSideMapping: true,
      seededSessionReproducibility: true, firstAndLatestPreRevealJudgmentsPreserved: true,
      modeSpecificJudgmentsAndPostNotes: true, catchOnlyNamedAfterReveal: true,
      fixedGainOnlyErbScalesAndReveal: true, modeSpecificPlaybackSources: true, samePairExclusivePlayback: true,
      replayStartsAtZero: true, currentUnsavedUiValueExported: true,
      sessionOrderMappingHashesAndTimestampsExported: true, localStorageResume: true,
      crossPlateMatchedOnlyBeforeReveal: true, crossPlateNoErbReveal: true, crossPlateWebAudioGain: true,
      audioContextResumesAfterGesture: true, crossPlateSeededOrderAndMapping: true,
      repositoryRelativeFileAndHttpPlayback: true, freshHttpRootWithoutTestResults: true, fixedGainUnity: true,
      noRuntimeFetch: true, remoteNetworkRequests: 0, uncaughtPageErrors: 0 },
    localServerRequests: localServerRequests.length }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  if (isolatedHttpRoot) {
    if (!isolatedHttpRoot.startsWith(root + path.sep) || !path.basename(isolatedHttpRoot).startsWith('.tmp-cross-plate-http-'))
      throw new Error('Refusing to clean an unexpected temporary HTTP root');
    await rm(isolatedHttpRoot, { recursive: true, force: true });
  }
}
