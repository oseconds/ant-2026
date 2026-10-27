import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-27-contact-history-temporal-causality');
const MAIN = 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292';
const PREREQUISITE = '9233500dad65ff5bbd09d8b604f4ea86b2208932';
const FAILED_PASS = '394bd8136601c832a49b521f47d1ae446a17d0ed';
const BRANCH = 'codex/ant-contact-history-temporal-causality-20261027';
const FIRST_TICK = 4501, MID_TICK = 5401, END_TICK = 6301, DT = 1 / 60;
const FPS = 30, WIDTH = 640, HEIGHT = 640;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
const gitText = (...args) => git(...args).toString('utf8').trim();

async function main() {
  await assertProvenance();
  const priorMeasurement = JSON.parse(git('show', `${PREREQUISITE}:docs/ant/evidence/2026-10-27-material-contact-readout-prerequisite/measurement.json`));
  const priorAnchors = JSON.parse(git('show', `${PREREQUISITE}:docs/ant/evidence/2026-10-27-material-contact-readout-prerequisite/parity-anchors.json`));
  const controllerPath = 'src/lib/agents/ant/AntController.js';
  const rendererPath = 'src/lib/renderers/AntRenderer.js';
  const controllerSource = await readFile(resolve(ROOT, controllerPath), 'utf8');
  const h1Controller = patchH1(controllerSource);
  const sourcePaths = [controllerPath, rendererPath, 'src/lib/agents/ant/GaitController.js',
    'src/lib/agents/ant/SurfaceField.js', 'src/lib/agents/ant/TrailPlateBirth.js',
    'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/audio/SurfaceAudioBridge.js',
    'src/lib/audio/compileSurfaceTopology.js', 'scripts/lib/antContactTemporalCausality.js'];
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
    [path, sha256(await readFile(resolve(ROOT, path)))])));
  const viewOrder = reviewOrder();
  const server = await createServer({ root: ROOT, logLevel: 'error', appType: 'custom',
    server: { host: '127.0.0.1', port: 0, strictPort: true } });
  let browser, tempRoot, markRenderer;
  try {
    await server.listen();
    const transformedRenderer = await server.transformRequest(`/${rendererPath}`);
    assert.ok(transformedRenderer?.code, 'Vite could not resolve the production renderer module');
    markRenderer = patchRenderer(transformedRenderer.code);
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--mute-audio'] });
    const preflightPage = await browser.newPage({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
    const pageErrors = watchPage(preflightPage);
    await routeBrowserModules(preflightPage, server, h1Controller, markRenderer, '__contact_temporal_preflight');
    const preflight = await preflightPage.evaluate(runPreflight, { priorAnchors, priorMeasurement });
    assert.deepEqual(pageErrors, [], 'Preflight browser reported errors');
    await preflightPage.close();

    const eventById = new Map(preflight.contacts.map(row => [row.id, row]));
    const assignment = preflight.assignment;
    const assignmentRows = assignment.events.map(row => ({ ...row,
      sourcePosition: eventById.get(row.id).position,
      sourceTick: eventById.get(row.id).tick,
      targetTick: eventById.get(row.targetEventId).tick }));
    validateAssignment(assignmentRows, preflight.contacts, assignment);
    const mapping = { accepted: assignment.accepted,
      registeredRules: { minSeparationPx: 4, minMedianSeparationPx: 12, minimumCoverage: 0.95,
        algorithm: 'deterministic Hopcroft-Karp; sources sorted by Plate/time/id; neighbors by descending distance then target ID; keep closed cycles only' },
      summary: assignment.summary, rows: assignmentRows };
    await persistPreflight(preflight, mapping, sourceHashes, viewOrder, h1Controller, markRenderer);
    if (!assignment.accepted) {
      await writeReport(preflight, mapping, sourceHashes, null, false);
      console.log(`STOP: manipulation-invalid / inconclusive; ${assignment.summary.assignedCount}/${assignment.summary.sourceCount} events mapped.`);
      return;
    }

    tempRoot = await mkdtemp(join(tmpdir(), 'ant-contact-temporal-'));
    const temp = resolve(tempRoot), tempBase = resolve(tmpdir());
    assert.ok(temp.toLowerCase().startsWith(`${tempBase.toLowerCase()}\\`), 'Temporary frames escaped temp directory');
    const frameDirs = { a: join(tempRoot, 'a'), b: join(tempRoot, 'b') };
    await Promise.all(Object.values(frameDirs).map(path => mkdir(path, { recursive: true })));
    const capturePage = await browser.newPage({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
    const captureErrors = watchPage(capturePage);
    await routeBrowserModules(capturePage, server, h1Controller, markRenderer, '__contact_temporal_capture');
    await capturePage.evaluate(prepareCapture, { assignmentRows, priorAnchors, priorMeasurement,
      preflightAnchors: preflight.anchors });
    const frameCount = await captureFrames(capturePage, frameDirs, viewOrder);
    const capture = await capturePage.evaluate(finalizeCapture);
    assert.deepEqual(captureErrors, [], 'Capture browser reported errors');
    assert.equal(frameCount, 901);
    assert.equal(capture.finalTick, END_TICK);
    assert.equal(capture.firstPlateTick, FIRST_TICK);
    assert.equal(capture.selectedSourceEventsSeen, assignmentRows.length);
    assert.equal(capture.stateRngEventParity, true);
    assert.equal(capture.renderSnapshotParity, true);
    assert.deepEqual(capture.endpointVisibleMarks.a, capture.endpointVisibleMarks.b,
      'A/B endpoint visible mark counts should converge with the same final position multiset');
    await capturePage.close();

    const mediaHashes = await encodeAndVerify(frameDirs, viewOrder);
    await writeReviewPage(viewOrder);
    await writeCaptureEvidence(capture, mapping, viewOrder, sourceHashes, frameCount, mediaHashes);
    await writeReport(preflight, mapping, sourceHashes, capture, true);
  } finally {
    if (browser) await browser.close();
    await server.close();
    if (tempRoot) {
      const temp = resolve(tempRoot), base = resolve(tmpdir());
      if (temp.toLowerCase().startsWith(`${base.toLowerCase()}\\`)) await rm(temp, { recursive: true, force: true });
    }
  }
}

function watchPage(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error?.stack || error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

async function assertProvenance() {
  assert.equal(gitText('branch', '--show-current'), BRANCH);
  assert.equal(gitText('rev-parse', 'origin/main'), MAIN);
  assert.equal(gitText('merge-base', 'HEAD', 'origin/main'), MAIN);
  assert.equal(gitText('rev-parse', 'HEAD'), MAIN, 'Branch must be fresh before capture');
  assert.equal(gitText('diff', MAIN, '--', 'src'), '', 'Production source must remain unchanged');
}

function patchH1(source) {
  const from = 'heading: SPAWN_HEADING + signed(this.random) * SPAWN_HEADING_SPREAD';
  const to = 'heading: wrapAngle(-Math.PI + TAU * this.random())';
  assert.equal(source.split(from).length, 2, 'H1 accepted-heading source anchor changed');
  return source.replace(from, to);
}

function patchRenderer(source) {
  const anchor = '    const field = snapshot?.pheromone;';
  assert.equal(source.split(anchor).length, 2, 'AntRenderer draw-order anchor changed');
  const marks = '    if (renderer.contactMarks?.length) {\n'
    + '        p.noStroke();\n        p.fill(0, 72);\n'
    + '        for (const mark of renderer.contactMarks) p.circle(mark.x * width, mark.y * height, 2.5);\n'
    + '    }\n\n';
  return source.replace(anchor, `${marks}${anchor}`);
}

async function routeBrowserModules(page, server, h1Controller, markRenderer, routeName) {
  await page.route(`**/${routeName}`, route => route.fulfill({ status: 200,
    contentType: 'text/html', body: '<!doctype html><html><head><style>body{margin:0}canvas{display:block}</style><script type="module">/* Models are imported by the evidence harness. */</script></head><body><canvas id="view-a"></canvas><canvas id="view-b"></canvas></body></html>' }));
  await page.route('**/src/lib/agents/ant/__contact-history-h1.js', route => route.fulfill({ status: 200,
    contentType: 'text/javascript', body: h1Controller }));
  await page.route('**/src/lib/renderers/__contact-history-renderer.js', route => route.fulfill({ status: 200,
    contentType: 'text/javascript', body: markRenderer }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${routeName}`, { waitUntil: 'domcontentloaded' });
}

async function runPreflight({ priorAnchors, priorMeasurement }) {
  const [{ AntController }, { SurfaceAudioBridge }, { assignTemporalDerangement }] = await Promise.all([
    import('/src/lib/agents/ant/__contact-history-h1.js'), import('/src/lib/audio/SurfaceAudioBridge.js'),
    import('/scripts/lib/antContactTemporalCausality.js')
  ]);
  const ensure = (condition, message) => { if (!condition) throw new Error(message); };
  const same = (a, b, message) => ensure(JSON.stringify(a) === JSON.stringify(b), message);
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
  async function objectHash(value) {
    const arrays = [];
    const text = JSON.stringify(value, (key, item) => {
      if (ArrayBuffer.isView(item)) { arrays.push(new Uint8Array(item.buffer, item.byteOffset, item.byteLength));
        return { typed: item.constructor.name, arrayIndex: arrays.length - 1, byteLength: item.byteLength }; }
      return item instanceof Map ? { map: [...item] } : item instanceof Set ? { set: [...item] } : item;
    });
    const chunks = [new TextEncoder().encode(text), ...arrays];
    const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
    let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return digest(bytes);
  }
  function randomStream() {
    let state = 20261005 >>> 0, calls = 0;
    const random = () => { calls++; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
    random.record = () => ({ state, calls }); return random;
  }
  function supportState(material, oracle) {
    return { physicalTop: new Int16Array(oracle.routingTopLayerByCell96), physicalLayerIds: [...oracle.topology.layerIds],
      displayTop: new Int16Array(material.stratigraphy.topLayerByCell), displayLayerOrder: [...material.stratigraphy.layerOrder] };
  }
  function displayCell(position) {
    const x = Math.min(639, Math.max(0, Math.floor(position.x * 640)));
    const y = Math.min(639, Math.max(0, Math.floor(position.y * 640)));
    return Math.floor((y + 0.5) * 96 / 640) * 96 + Math.floor((x + 0.5) * 96 / 640);
  }
  function displayOwner(state, position) {
    const layer = state.displayTop[displayCell(position)];
    return layer >= 0 ? state.displayLayerOrder[layer] ?? null : null;
  }
  function physicalOwner(state, masks, position) {
    const x = Math.max(0, Math.min(95, Math.round(position.x * 95)));
    const y = Math.max(0, Math.min(95, Math.round(position.y * 95)));
    const cell = y * 96 + x, layer = state.physicalTop[cell];
    const id = layer >= 0 ? state.physicalLayerIds[layer] : null;
    return id && masks[id]?.[cell] === 1 ? id : null;
  }
  function targetSupportedAtSource(source, target) {
    const state = supportStates[source.eventGroupId];
    const x = Math.max(0, Math.min(95, Math.round(target.position.x * 95)));
    const y = Math.max(0, Math.min(95, Math.round(target.position.y * 95)));
    const index = y * 96 + x, physicalLayer = state.physicalTop[index];
    const physicalId = physicalLayer >= 0 ? state.physicalLayerIds[physicalLayer] : null;
    const displayLayer = state.displayTop[displayCell(target.position)];
    const displayId = displayLayer >= 0 ? state.displayLayerOrder[displayLayer] : null;
    return physicalId === source.plateId && displayId === source.plateId && plateMasks[source.plateId]?.[index] === 1;
  }
  let tick = 0, firstPlateTick = null, group = 0, rawGroups = 0, rawFeet = 0, responsesTotal = 0;
  const contacts = [], supportStates = Object.create(null), plateMasks = Object.create(null);
  const eventChunks = ['', ''], eventCounts = [0, 0], anchors = [], births = [];
  const routeBridge = new SurfaceAudioBridge({ audioEngine: {}, workletFactory: async () => { throw new Error('Audio prohibited'); } });
  const supportOracle = new SurfaceAudioBridge({ audioEngine: {}, workletFactory: async () => { throw new Error('Audio prohibited'); } });
  const resolutions = [], exposed = routeBridge.exposedPlateAt.bind(routeBridge);
  routeBridge.exposedPlateAt = position => { const plate = exposed(position); resolutions.push({ position: { ...position }, plateId: plate?.id ?? null }); return plate; };
  let world;
  const observer = {
    syncMaterial(material) { ensure(routeBridge.syncMaterial(material) && supportOracle.syncMaterial(material), 'route topology sync failed'); },
    async destroy() { await Promise.all([routeBridge.destroy(), supportOracle.destroy()]); },
    handleFootContact(event, { responses }) {
      const currentGroup = group++;
      rawGroups++; rawFeet += event.contacts.length; responsesTotal += responses.length;
      const before = JSON.stringify({ event, responses }); resolutions.length = 0;
      routeBridge.handleFootContact(event, { responses });
      ensure(before === JSON.stringify({ event, responses }), 'route observer mutated contact input');
      if (!resolutions.some(row => row.plateId !== null)) return false;
      const responseByLeg = new Map(responses.map(row => [row.legId, row]));
      const material = world.materialStratigraphy.getSnapshot();
      ensure(supportOracle.syncMaterial(material), 'event-time support topology sync failed');
      const stateId = `${tick}:${currentGroup}`, state = supportState(material, supportOracle);
      supportStates[stateId] = state;
      for (const plate of material.plates) if (!plateMasks[plate.id]) plateMasks[plate.id] = new Uint8Array(plate.mask);
      let resolutionIndex = 0;
      for (const contact of event.contacts) {
        const response = responseByLeg.get(contact.legId);
        if (!response) continue;
        const route = resolutions[resolutionIndex++];
        ensure(route && route.position.x === response.position.x && route.position.y === response.position.y,
          'Route did not preserve exact SurfaceField response order/position');
        if (!route.plateId) continue;
        const physical = physicalOwner(state, plateMasks, route.position), display = displayOwner(state, route.position);
        const id = `${tick}:${currentGroup}:${event.antId}:${event.contactGroup}:${response.legId}`;
        contacts.push({ id, tick, eventGroupId: stateId, eventTimeMs: event.simulationTimeMs,
          antId: event.antId, contactGroup: event.contactGroup, legId: response.legId, plateId: route.plateId,
          position: { ...route.position }, eventTimePhysicalOwner: physical, eventTimeDisplayOwner: display,
          sourceEligible: physical === route.plateId && display === route.plateId });
      }
      return false;
    }
  };
  const random = randomStream(), twinRandom = randomStream();
  world = new AntController({ random, audioBridge: observer }); const twin = new AntController({ random: twinRandom });
  for (const [index, model] of [world, twin].entries()) model.subscribe(({ type, payload }) => {
    if (!['foot-contact', 'plate-birth', 'sphere-birth', 'error'].includes(type)) return;
    ensure(type !== 'error', JSON.stringify(payload)); eventChunks[index] += JSON.stringify({ type, payload }); eventCounts[index]++;
    if (index === 0 && type === 'plate-birth') { births.push({ tick, id: payload.id, simulationTimeMs: payload.bornAtSimulationTimeMs }); firstPlateTick ??= tick; }
  });
  try {
    await world.init(); await twin.init(); world.syncEnvironmentAudio();
    const prior = new Map(priorAnchors.map(row => [Number(row.tick), row]));
    const checkpoint = async () => {
      const snapshot = world.getSnapshot(), rng = random.record(), hash = await objectHash(snapshot);
      ensure(hash === await objectHash(twin.getSnapshot()), `instrumented twin mismatch at tick ${tick}`);
      same(rng, twinRandom.record(), `instrumented twin RNG mismatch at ${tick}`);
      const expected = prior.get(tick);
      if (expected) ensure(String(rng.state) === String(expected.state) && String(rng.calls) === String(expected.calls)
        && hash === expected.fullPublicSnapshotSha256, `prior H1 anchor mismatch at ${tick}`);
      anchors.push({ tick, simulationTimeMs: world.simulationTimeMs, ...rng, fullPublicSnapshotSha256: hash,
        priorMatched: Boolean(expected) });
    };
    await checkpoint(); const started = performance.now();
    while (tick < 6301) {
      ensure(performance.now() - started < 240000, 'H1 replay exceeded four-minute timeout');
      const offsets = [eventChunks[0].length, eventChunks[1].length];
      tick++; world.tick(1 / 60); twin.tick(1 / 60);
      same(random.record(), twinRandom.record(), `H1 twin RNG mismatch at ${tick}`);
      ensure(eventCounts[0] === eventCounts[1] && eventChunks[0].slice(offsets[0]) === eventChunks[1].slice(offsets[1]),
        `H1 twin event mismatch at ${tick}`);
      if (tick % 6 === 0 || [4501, 5401, 6301].includes(tick)) await checkpoint();
    }
    const eventDigest = await digest(new TextEncoder().encode(eventChunks[0]));
    ensure(firstPlateTick === 4501, `First Plate tick changed: ${firstPlateTick}`);
    ensure(eventDigest === priorMeasurement.eventDigest, 'H1 event digest differs from prerequisite');
    same(random.record(), priorMeasurement.rng, 'H1 final RNG differs from prerequisite');
    ensure(anchors.filter(row => row.priorMatched).length === priorAnchors.length, 'Prior H1 anchor count mismatch');
    const eligible = contacts.filter(row => row.sourceEligible), routesByPlate = {};
    for (const row of contacts) routesByPlate[row.plateId] = (routesByPlate[row.plateId] || 0) + 1;
    const assignment = assignTemporalDerangement({ events: eligible, isSupported: targetSupportedAtSource,
      width: 640, height: 640, minSeparationPx: 4, minMedianSeparationPx: 12, minimumCoverage: 0.95 });
    const eligibleById = new Map(eligible.map(row => [row.id, row]));
    assignment.events = assignment.events.map(row => {
      const source = eligibleById.get(row.id), target = eligibleById.get(row.targetEventId);
      const state = supportStates[source.eventGroupId];
      return { ...row, sourcePosition: source.position,
        targetPhysicalOwnerAtSource: physicalOwner(state, plateMasks, target.position),
        targetDisplayOwnerAtSource: displayOwner(state, target.position) };
    });
    return { contacts, assignment, anchors, summary: { tickCount: tick, firstPlateTick,
      firstPlateBirths: births, endpointSimulationTimeMs: world.simulationTimeMs, elapsedSeconds: (performance.now() - started) / 1000,
      rawGroupedEvents: rawGroups, rawFeet, responseFeet: responsesTotal, routedFeet: contacts.length,
      sourceEligible: eligible.length, physicalOwnerMismatch: contacts.filter(row => row.eventTimePhysicalOwner !== row.plateId).length,
      displayOwnerMismatch: contacts.filter(row => row.eventTimeDisplayOwner !== row.plateId).length,
      routeCountsByPlate: routesByPlate, eventCounts: eventCounts[0], eventDigest, rngFinal: random.record(),
      anchorCount: anchors.length, priorMatchedAnchors: anchors.filter(row => row.priorMatched).length,
      eventSupportStateCount: Object.keys(supportStates).length,
      routeBridge: { topologyGeneration: routeBridge.topologyGeneration, directPosts: routeBridge.diagnostics.directExposedStrikes,
        disabledIgnored: routeBridge.diagnostics.ignoredWhileDisabled } } };
  } finally {
    await Promise.all([world.destroy(), twin.destroy()]);
  }
}

function validateAssignment(rows, contacts, assignment) {
  const byId = new Map(contacts.map(row => [row.id, row])), sourceIds = new Set(), targetIds = new Set();
  for (const row of rows) {
    assert.ok(byId.has(row.id) && byId.has(row.targetEventId));
    assert.notEqual(row.id, row.targetEventId);
    assert.ok(byId.get(row.id).sourceEligible && byId.get(row.targetEventId).sourceEligible);
    assert.equal(row.targetPhysicalOwnerAtSource, row.plateId);
    assert.equal(row.targetDisplayOwnerAtSource, row.plateId);
    assert.equal(byId.get(row.id).plateId, byId.get(row.targetEventId).plateId);
    assert.ok(!sourceIds.has(row.id) && !targetIds.has(row.targetEventId));
    sourceIds.add(row.id); targetIds.add(row.targetEventId);
  }
  assert.deepEqual([...sourceIds].sort(), [...targetIds].sort(), 'Event instances are not a bijection');
  const counts = (values, keyOf) => { const result = new Map(); for (const value of values) {
    const key = keyOf(value); result.set(key, (result.get(key) || 0) + 1); } return [...result].sort(); };
  assert.deepEqual(counts(rows, row => `${row.plateId}:${byId.get(row.id).position.x},${byId.get(row.id).position.y}`),
    counts(rows, row => `${row.plateId}:${row.targetPosition.x},${row.targetPosition.y}`), 'A/B per-Plate position multisets differ');
  assert.equal(assignment.summary.sameNativePixelPairs, 0);
  assert.ok(rows.every(row => row.distancePx >= 4));
}

async function persistPreflight(preflight, mapping, sourceHashes, viewOrder, h1Controller, markRenderer) {
  const summary = preflight.summary;
  const preflightRecord = { ...summary, freshMainSha: MAIN, branch: BRANCH, parentSha: gitText('rev-parse', 'HEAD'),
    sourceHashes, h1ControllerPatchSha256: sha256(h1Controller), rendererPatchSha256: sha256(markRenderer),
    headingTransform: 'heading: wrapAngle(-Math.PI + TAU * this.random())',
    registeredGlyph: { grayscale: 'black', diameterNativePx: 2.5, alpha: 72, unit: '0–255',
      blend: 'source-over', accumulation: 'uncapped', decay: 'none', drawOrder: 'hidden material < mark < production pheromone < ants' },
    assignment: mapping.summary, assignmentAccepted: mapping.accepted,
    reviewOrderHashBit: viewOrder.bit,
    note: 'Event-time support states were used before any candidate media was rendered.' };
  await writeFile(resolve(OUTPUT, 'preflight.json'), `${JSON.stringify(preflightRecord, null, 2)}\n`);
  await writeFile(resolve(OUTPUT, 'contacts.jsonl'), `${preflight.contacts.map(row => JSON.stringify(row)).join('\n')}\n`);
  await writeFile(resolve(OUTPUT, 'assignment.json'), `${JSON.stringify(mapping, null, 2)}\n`);
  await writeFile(resolve(OUTPUT, 'parity-anchors.json'), `${JSON.stringify(preflight.anchors, null, 2)}\n`);
  await writeFile(resolve(OUTPUT, 'REVIEW-KEY.json'), `${JSON.stringify({ view1: viewOrder.first, view2: viewOrder.second,
    derivedFrom: 'low bit of SHA-256 over fixed pass-specific label; independent of world RNG', bit: viewOrder.bit }, null, 2)}\n`);
  await writePriorFailureReference();
  await writeDiagnosticSvg(mapping.rows);
}

async function writePriorFailureReference() {
  const prior = git('show', `${FAILED_PASS}:docs/ant/evidence/2026-10-27-contact-history-causal-readout/README.md`).toString('utf8');
  assert.ok(prior.includes('MANIPULATION INVALID / INCONCLUSIVE'));
  const text = [
    '# Prior failed manipulation retained as context', '',
    'The rigid Plate-local relocation family remains **manipulation-invalid / inconclusive**. Its best registered transform reached only 354/760 valid contacts (46.58%) and stopped before artist-facing capture. This applies to that fixed isometry family; it does not rule out event-position permutation. No candidate images or artist review were produced.', '',
    `- Source commit: \`${FAILED_PASS}\`.`,
    `- Original evidence: [contact-history causal readout](https://github.com/oseconds/ant-2026/blob/${FAILED_PASS}/docs/ant/evidence/2026-10-27-contact-history-causal-readout/README.md).`,
    '- This pass starts directly from fresh `origin/main`; the failed branch is not an ancestor.', ''
  ].join('\n');
  await writeFile(resolve(OUTPUT, 'PRIOR-FAILED-PASS.md'), text);
}

async function writeDiagnosticSvg(rows) {
  const lines = rows.map(row => `<line x1="${fmt(row.sourcePosition.x * WIDTH)}" y1="${fmt(row.sourcePosition.y * HEIGHT)}" x2="${fmt(row.targetPosition.x * WIDTH)}" y2="${fmt(row.targetPosition.y * HEIGHT)}"/>`).join('');
  const sources = rows.map(row => `<circle cx="${fmt(row.sourcePosition.x * WIDTH)}" cy="${fmt(row.sourcePosition.y * HEIGHT)}" r="1.1"/>`).join('');
  const targets = rows.map(row => `<circle cx="${fmt(row.targetPosition.x * WIDTH)}" cy="${fmt(row.targetPosition.y * HEIGHT)}" r="1.1"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="white"/><g fill="none" stroke="#999" stroke-opacity=".18" stroke-width=".5">${lines}</g><g fill="#111">${sources}</g><g fill="#b33">${targets}</g></svg>`;
  const folder = resolve(OUTPUT, 'diagnostics'); await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'event-position-correspondence.svg'), svg);
  await writeFile(join(folder, 'README.md'), '# Diagnostic assignment asset\n\nThe SVG shows each retained source-to-target event edge, separately from artist-facing media. Black dots are A positions, red dots are B positions, and gray lines connect event instances. Exact identities and coordinates are in `../assignment.json`.\n');
}

function reviewOrder() {
  const bit = createHash('sha256').update('ant-contact-history-temporal-causality-review-order-20261027').digest()[0] & 1;
  return { bit, first: bit ? 'B' : 'A', second: bit ? 'A' : 'B' };
}

function fmt(value) { return Number(value.toFixed(3)); }

async function prepareCapture({ assignmentRows, priorAnchors, priorMeasurement, preflightAnchors }) {
  const [{ AntController }, { AntRenderer }, { SurfaceAudioBridge }] = await Promise.all([
    import('/src/lib/agents/ant/__contact-history-h1.js'), import('/src/lib/renderers/__contact-history-renderer.js'),
    import('/src/lib/audio/SurfaceAudioBridge.js')
  ]);
  const ensure = (condition, message) => { if (!condition) throw new Error(message); };
  const same = (a, b, message) => ensure(JSON.stringify(a) === JSON.stringify(b), message);
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
  async function objectHash(value) {
    const arrays = [];
    const text = JSON.stringify(value, (key, item) => {
      if (ArrayBuffer.isView(item)) { arrays.push(new Uint8Array(item.buffer, item.byteOffset, item.byteLength));
        return { typed: item.constructor.name, arrayIndex: arrays.length - 1, byteLength: item.byteLength }; }
      return item instanceof Map ? { map: [...item] } : item instanceof Set ? { set: [...item] } : item;
    });
    const chunks = [new TextEncoder().encode(text), ...arrays];
    const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
    let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return digest(bytes);
  }
  function randomStream() {
    let state = 20261005 >>> 0, calls = 0;
    const random = () => { calls++; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
    random.record = () => ({ state, calls }); return random;
  }
  function displayOwner(material, position) {
    const x = Math.min(639, Math.max(0, Math.floor(position.x * 640)));
    const y = Math.min(639, Math.max(0, Math.floor(position.y * 640)));
    const cell = Math.floor((y + 0.5) * 96 / 640) * 96 + Math.floor((x + 0.5) * 96 / 640);
    const index = material.stratigraphy.topLayerByCell[cell];
    return index >= 0 ? material.stratigraphy.layerOrder[index] ?? null : null;
  }
  const mapping = new Map(assignmentRows.map(row => [row.id, row]));
  const random = randomStream(), twinRandom = randomStream();
  const eventChunks = ['', ''], eventCounts = [0, 0], anchors = [];
  const marksA = [], marksB = [], seen = new Set(), curveA = new Map(), curveB = new Map(), visibleCounts = [];
  let tick = 0, group = 0, firstPlateTick = null, renderParityChecks = 0, preflightAnchorMatches = 0;
  const bridge = new SurfaceAudioBridge({ audioEngine: {}, workletFactory: async () => { throw new Error('Audio prohibited'); } });
  const supportOracle = new SurfaceAudioBridge({ audioEngine: {}, workletFactory: async () => { throw new Error('Audio prohibited'); } });
  const resolutions = [], exposed = bridge.exposedPlateAt.bind(bridge);
  bridge.exposedPlateAt = position => { const plate = exposed(position); resolutions.push({ position: { ...position }, plateId: plate?.id ?? null }); return plate; };
  let world;
  const observer = {
    syncMaterial(material) { ensure(bridge.syncMaterial(material) && supportOracle.syncMaterial(material), 'capture topology sync failed'); },
    async destroy() { await Promise.all([bridge.destroy(), supportOracle.destroy()]); },
    handleFootContact(event, { responses }) {
      const eventGroup = group++, input = JSON.stringify({ event, responses });
      resolutions.length = 0; bridge.handleFootContact(event, { responses });
      ensure(input === JSON.stringify({ event, responses }), 'capture observer mutated contact input');
      const responseByLeg = new Map(responses.map(row => [row.legId, row]));
      const material = world.materialStratigraphy.getSnapshot();
      ensure(supportOracle.syncMaterial(material), 'capture event-time topology sync failed');
      let resolutionIndex = 0;
      for (const contact of event.contacts) {
        const response = responseByLeg.get(contact.legId);
        if (!response) continue;
        const route = resolutions[resolutionIndex++];
        ensure(route && route.position.x === response.position.x && route.position.y === response.position.y,
          'capture route order/position changed');
        if (!route.plateId) continue;
        const id = `${tick}:${eventGroup}:${event.antId}:${event.contactGroup}:${response.legId}`;
        const selected = mapping.get(id);
        if (!selected) continue;
        ensure(!seen.has(id), `Selected event repeated: ${id}`);
        ensure(selected.plateId === route.plateId && selected.sourceEventTimeMs === event.simulationTimeMs,
          `Selected event identity/time changed: ${id}`);
        ensure(selected.sourcePosition.x === route.position.x && selected.sourcePosition.y === route.position.y,
          `Selected source position changed: ${id}`);
        ensure(supportOracle.exposedPlateAt(route.position)?.id === route.plateId,
          `Selected source physical support changed: ${id}`);
        ensure(displayOwner(material, route.position) === route.plateId, `Selected source display support changed: ${id}`);
        marksA.push({ id, plateId: route.plateId, x: route.position.x, y: route.position.y,
          eventTimeMs: event.simulationTimeMs });
        marksB.push({ id, plateId: route.plateId, x: selected.targetPosition.x, y: selected.targetPosition.y,
          eventTimeMs: event.simulationTimeMs });
        seen.add(id); curveA.set(tick, (curveA.get(tick) || 0) + 1); curveB.set(tick, (curveB.get(tick) || 0) + 1);
      }
      return false;
    }
  };
  const twin = new AntController({ random: twinRandom }); world = new AntController({ random, audioBridge: observer });
  for (const [index, model] of [world, twin].entries()) model.subscribe(({ type, payload }) => {
    if (!['foot-contact', 'plate-birth', 'sphere-birth', 'error'].includes(type)) return;
    ensure(type !== 'error', JSON.stringify(payload)); eventChunks[index] += JSON.stringify({ type, payload }); eventCounts[index]++;
    if (index === 0 && type === 'plate-birth') firstPlateTick ??= tick;
  });
  const rendererA = new AntRenderer(document.querySelector('#view-a'));
  const rendererB = new AntRenderer(document.querySelector('#view-b'));
  try {
    await world.init(); await twin.init(); world.syncEnvironmentAudio();
    await Promise.all([rendererA.init({ width: 640, height: 640, pixelRatio: 1 }), rendererB.init({ width: 640, height: 640, pixelRatio: 1 })]);
    rendererA.setDebugOptions({ material: false }); rendererB.setDebugOptions({ material: false });
    ensure(!rendererA.debugOptions.material && !rendererB.debugOptions.material, 'Material renderer did not disable');
    const prior = new Map(priorAnchors.map(row => [Number(row.tick), row]));
    const expectedReplay = new Map(preflightAnchors.map(row => [Number(row.tick), row]));
    async function checkpoint() {
      const snapshot = world.getSnapshot(), hash = await objectHash(snapshot), rng = random.record();
      ensure(hash === await objectHash(twin.getSnapshot()), `capture twin snapshot mismatch at ${tick}`);
      same(rng, twinRandom.record(), `capture twin RNG mismatch at ${tick}`);
      const old = prior.get(tick);
      if (old) ensure(hash === old.fullPublicSnapshotSha256 && String(rng.state) === String(old.state)
        && String(rng.calls) === String(old.calls), `prerequisite H1 anchor mismatch at ${tick}`);
      const replay = expectedReplay.get(tick);
      if (replay) {
        ensure(hash === replay.fullPublicSnapshotSha256 && String(rng.state) === String(replay.state)
          && String(rng.calls) === String(replay.calls), `capture replay differs from preflight at ${tick}`);
        preflightAnchorMatches++;
      }
      if ([0, 4501, 5401, 6301].includes(tick)) anchors.push({ tick, fullPublicSnapshotSha256: hash, ...rng,
        preflightMatched: Boolean(replay) });
      return snapshot;
    }
    async function advanceOneTick() {
      const offsets = [eventChunks[0].length, eventChunks[1].length];
      tick++; world.tick(1 / 60); twin.tick(1 / 60);
      same(random.record(), twinRandom.record(), `capture RNG mismatch at tick ${tick}`);
      ensure(eventCounts[0] === eventCounts[1] && eventChunks[0].slice(offsets[0]) === eventChunks[1].slice(offsets[1]),
        `capture event sequence mismatch at tick ${tick}`);
      if (tick % 6 === 0 || [4501, 5401, 6301].includes(tick)) await checkpoint();
    }
    async function visibleMarks(marks, snapshot) {
      const material = snapshot.stratigraphy;
      supportOracle.syncMaterial(material);
      return marks.filter(mark => supportOracle.exposedPlateAt({ x: mark.x, y: mark.y })?.id === mark.plateId
        && displayOwner(material, mark) === mark.plateId).map(({ x, y }) => ({ x, y }));
    }
    async function renderFrame(snapshot, checkSnapshot = false) {
      const rngBefore = random.record(), eventCountBefore = eventCounts[0];
      const beforeHash = checkSnapshot ? await objectHash(snapshot) : null;
      rendererA.contactMarks = await visibleMarks(marksA, snapshot);
      rendererB.contactMarks = await visibleMarks(marksB, snapshot);
      visibleCounts.push({ tick, a: rendererA.contactMarks.length, b: rendererB.contactMarks.length });
      rendererA.render(snapshot); rendererB.render(snapshot);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      ensure(JSON.stringify(random.record()) === JSON.stringify(rngBefore) && eventCounts[0] === eventCountBefore,
        'Renderer consumed RNG or emitted simulation events');
      if (checkSnapshot) {
        ensure(await objectHash(snapshot) === beforeHash, 'Renderer mutated the shared snapshot');
        renderParityChecks++;
      }
      return { a: document.querySelector('#view-a').toDataURL('image/png'),
        b: document.querySelector('#view-b').toDataURL('image/png') };
    }
    while (tick < 4501) await advanceOneTick();
    const frameZero = await renderFrame(world.getSnapshot(), true);
    window.__contactCapture = { world, twin, random, twinRandom, rendererA, rendererB, advanceOneTick,
      renderFrame, frameZero, mappingCount: mapping.size, seen, marksA, marksB, eventChunks, eventCounts, anchors,
      curveA, curveB, visibleCounts, objectHash, priorMeasurement, firstPlateTick, get tick() { return tick; },
      get renderParityChecks() { return renderParityChecks; }, get preflightAnchorMatches() { return preflightAnchorMatches; } };
  } catch (error) {
    await Promise.all([rendererA.destroy(), rendererB.destroy(), world.destroy(), twin.destroy()]);
    throw error;
  }
}

async function captureFrames(page, frameDirs, viewOrder) {
  let written = 0;
  const save = async (frame, index) => {
    const data = { A: Buffer.from(frame.a.split(',')[1], 'base64'), B: Buffer.from(frame.b.split(',')[1], 'base64') };
    const order = { 'view-1': viewOrder.first, 'view-2': viewOrder.second };
    for (const [view, condition] of Object.entries(order)) {
      const bytes = data[condition];
      assert.ok(bytes.length > 0, `Empty ${view} frame ${index}`);
      await writeFile(join(frameDirs[condition.toLowerCase()], `${String(index).padStart(6, '0')}.png`), bytes);
      if ([0, 450, 900].includes(index)) {
        const name = ['birth', 'plus-15s', 'plus-30s'][[0, 450, 900].indexOf(index)];
        const folder = resolve(OUTPUT, 'stills'); await mkdir(folder, { recursive: true });
        await writeFile(join(folder, `${view}-${name}.png`), bytes);
      }
    }
    written++;
  };
  await save(await page.evaluate(() => window.__contactCapture.frameZero), 0);
  for (let start = 1; start < 901; start += 15) {
    const size = Math.min(15, 901 - start);
    const frames = await page.evaluate(async ({ size, start }) => {
      const c = window.__contactCapture, result = [];
      for (let frame = 0; frame < size; frame++) {
        await c.advanceOneTick(); await c.advanceOneTick();
        const index = start + frame;
        result.push(await c.renderFrame(c.world.getSnapshot(), index % 30 === 0));
      }
      return result;
    }, { size, start });
    assert.equal(frames.length, size);
    for (let index = 0; index < frames.length; index++) await save(frames[index], start + index);
    console.log(`Captured ${start}–${start + size - 1} / 900 frames.`);
  }
  return written;
}

async function finalizeCapture() {
  const c = window.__contactCapture;
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
  const final = c.world.getSnapshot();
  const finalHash = await c.objectHash(final), twinHash = await c.objectHash(c.twin.getSnapshot());
  const digestEvents = await digest(new TextEncoder().encode(c.eventChunks[0]));
  const positionCounts = rows => {
    const counts = new Map();
    for (const mark of rows) {
      const key = `${mark.plateId}:${mark.x},${mark.y}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts].sort();
  };
  const aCurve = [...c.curveA].sort((a, b) => a[0] - b[0]);
  const bCurve = [...c.curveB].sort((a, b) => a[0] - b[0]);
  const result = { finalTick: c.tick, firstPlateTick: c.firstPlateTick,
    simulationTimeMs: final.analysis.simulationTimeMs, eventDigest: digestEvents,
    eventDigestMatchesPrerequisite: digestEvents === c.priorMeasurement.eventDigest,
    finalRng: c.random.record(), expectedFinalRng: c.priorMeasurement.rng,
    finalSnapshotHash: finalHash, twinSnapshotHash: twinHash,
    selectedSourceEventsSeen: c.seen.size, selectedSourceEventCount: c.mappingCount,
    totalEvents: c.eventCounts[0], twinEvents: c.eventCounts[1],
    aMarkCount: c.marksA.length, bMarkCount: c.marksB.length,
    sameEventTickCurve: JSON.stringify(aCurve) === JSON.stringify(bCurve),
    samePerPlatePositionMultiset: JSON.stringify(positionCounts(c.marksA)) === JSON.stringify(positionCounts(c.marksB)),
    allSelectedEventsSeenOnce: c.seen.size === c.mappingCount,
    stateRngEventParity: finalHash === twinHash && JSON.stringify(c.random.record()) === JSON.stringify(c.twinRandom.record())
      && c.eventCounts[0] === c.eventCounts[1],
    renderSnapshotParity: c.renderParityChecks === 31, renderParityChecks: c.renderParityChecks,
    preflightAnchorMatches: c.preflightAnchorMatches,
    endpointVisibleMarks: { a: c.rendererA.contactMarks.length, b: c.rendererB.contactMarks.length },
    visibleCountDivergence: { framesWithDifferentVisibleCounts: c.visibleCounts.filter(row => row.a !== row.b).length,
      maximumAbsoluteDifference: Math.max(0, ...c.visibleCounts.map(row => Math.abs(row.a - row.b))),
      perFrame: c.visibleCounts },
    sampling: { fps: 30, frameCount: 901, intervalTicks: 2, firstTick: 4501, midTick: 5401,
      endTick: 6301, endpointSpanSeconds: 30, containerDurationSeconds: 901 / 30, nativeSize: '640x640' } };
  ensure(result.eventDigestMatchesPrerequisite, 'Capture event digest changed');
  ensure(JSON.stringify(result.finalRng) === JSON.stringify(result.expectedFinalRng),
    'Capture final RNG differs from prerequisite');
  ensure(result.allSelectedEventsSeenOnce, 'Not all selected source events appeared once');
  ensure(result.sameEventTickCurve && result.samePerPlatePositionMultiset, 'A/B event or position parity failed');
  ensure(result.stateRngEventParity && result.renderSnapshotParity, 'Capture renderer/world parity failed');
  ensure(result.preflightAnchorMatches > 1000, 'Capture replay did not match the preflight anchor stream');
  function ensure(condition, message) { if (!condition) throw new Error(message); }
  return result;
}

async function encodeAndVerify(frameDirs, viewOrder) {
  const ffmpeg = execFileSync('where.exe', ['ffmpeg'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
  const mediaDir = resolve(OUTPUT, 'media'); await mkdir(mediaDir, { recursive: true });
  const hashes = {};
  for (const [condition, folder] of Object.entries(frameDirs)) {
    const view = viewOrder.first === condition.toUpperCase() ? 'view-1' : 'view-2';
    const output = join(mediaDir, `${view}.webm`);
    execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS),
      '-i', join(folder, '%06d.png'), '-frames:v', '901', '-c:v', 'libvpx-vp9', '-lossless', '1',
      '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-pix_fmt', 'yuv444p', '-color_range', 'pc', '-an', output],
    { cwd: ROOT, maxBuffer: 16 * 1024 * 1024, stdio: 'pipe' });
    const source = ffmpegFrameHashes(ffmpeg, ['-framerate', String(FPS), '-i', join(folder, '%06d.png'), '-frames:v', '901']);
    const decoded = ffmpegFrameHashes(ffmpeg, ['-i', output, '-frames:v', '901']);
    assert.deepEqual(decoded, source, `${view} lossless decoded frames differ from source PNGs`);
    hashes[`${view}.webm`] = sha256(await readFile(output));
  }
  return hashes;
}

function ffmpegFrameHashes(ffmpeg, input) {
  const text = execFileSync(ffmpeg, ['-v', 'error', ...input, '-vf', 'format=rgb24', '-f', 'framemd5', '-'],
    { cwd: ROOT, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' });
  return text.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
}

async function writeReviewPage(viewOrder) {
  const cards = ['view-1', 'view-2'].map(view => {
    const stills = ['birth', 'plus-15s', 'plus-30s'].map((name, index) => `<figure><img src="./stills/${view}-${name}.png" alt="Still ${index + 1}"><figcaption>Still ${index + 1}</figcaption></figure>`).join('');
    return `<section><h2>${view === 'view-1' ? 'View 1' : 'View 2'}</h2><video controls muted playsinline preload="metadata" src="./media/${view}.webm"></video><details><summary>Stills</summary><div class="stills">${stills}</div></details></section>`;
  }).join('');
  const html = ['<!doctype html>', '<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>ANT visual review</title>',
    '<style>body{font:16px system-ui,sans-serif;margin:24px;color:#202124;background:#fff}main{max-width:1320px;margin:auto}.views{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}video{display:block;width:100%;aspect-ratio:1;background:#fff}.stills{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.stills img{width:100%}textarea{width:100%;min-height:110px;margin-top:8px;box-sizing:border-box;font:inherit}@media(max-width:760px){.views{grid-template-columns:1fr}}</style>',
    `<main><div class="views">${cards}</div><p>무엇이 달라 보이고, 어떤 점이 자연스럽거나 이상하게 느껴졌는지 자유롭게 적어 주세요.</p><textarea aria-label="자유 응답"></textarea></main>`,
    '<script>const a=document.querySelector(".views section:nth-child(1) video"),b=document.querySelector(".views section:nth-child(2) video");let lock=false;for(const [v,o] of [[a,b],[b,a]]){v.addEventListener("play",()=>{if(!lock)o.play().catch(()=>{})});v.addEventListener("pause",()=>{if(!lock)o.pause()});v.addEventListener("seeking",()=>{if(!lock){lock=true;o.currentTime=v.currentTime;lock=false}})}a.addEventListener("timeupdate",()=>{if(!lock&&Math.abs(a.currentTime-b.currentTime)>.12){lock=true;b.currentTime=a.currentTime;lock=false}});</script>', '</html>'].join('\n');
  await writeFile(resolve(OUTPUT, 'review.html'), html);
  await writeFile(resolve(OUTPUT, 'review-order.json'), `${JSON.stringify({ view1: viewOrder.first, view2: viewOrder.second }, null, 2)}\n`);
}

async function writeCaptureEvidence(capture, mapping, viewOrder, sourceHashes, frameCount, mediaHashes) {
  const details = { ...capture, sourceHashes, viewOrder, frameCount, mediaHashes,
    mediaTimeMapping: { frame0: { frame: 0, tick: 4501, modelSeconds: 4501 / 60, relativeSeconds: 0 },
      frame450: { frame: 450, tick: 5401, modelSeconds: 5401 / 60, relativeSeconds: 15 },
      frame900: { frame: 900, tick: 6301, modelSeconds: 6301 / 60, relativeSeconds: 30 },
      formula: 'frame=(tick-4501)/2; mediaSeconds=frame/30' },
    codec: 'libvpx-vp9 lossless; full-range yuv444p; decoded RGB framemd5 matches every native PNG frame',
    endpointSimilarityExpected: true, assignmentCoverage: mapping.summary.coverage, artistReview: 'pending' };
  await writeFile(resolve(OUTPUT, 'capture.json'), `${JSON.stringify(details, null, 2)}\n`);
  const stillFiles = ['view-1-birth.png', 'view-1-plus-15s.png', 'view-1-plus-30s.png',
    'view-2-birth.png', 'view-2-plus-15s.png', 'view-2-plus-30s.png'];
  const stillHashes = Object.fromEntries(await Promise.all(stillFiles.map(async file =>
    [file, sha256(await readFile(resolve(OUTPUT, 'stills', file)))])));
  await writeFile(resolve(OUTPUT, 'media-manifest.json'), `${JSON.stringify({ videos: mediaHashes,
    stills: stillHashes, video: { fps: 30, frameCount, codec: details.codec }, size: '640x640', audioTracks: 0 }, null, 2)}\n`);
}

async function writeReport(preflight, mapping, sourceHashes, capture, rendered) {
  const s = preflight.summary, prereq = JSON.parse(git('show', `${PREREQUISITE}:docs/ant/evidence/2026-10-27-material-contact-readout-prerequisite/measurement.json`));
  const rows = Object.entries(mapping.summary.byPlate).map(([id, r]) => `| ${id} | ${r.sourceCount} | ${r.assignedCount} | ${(r.coverage * 100).toFixed(2)}% | ${r.minimumDistancePx?.toFixed(2) ?? 'n/a'} | ${r.medianDistancePx?.toFixed(2) ?? 'n/a'} |`).join('\n');
  const lines = [
    '# Contact-history temporal-causality shadow', '',
    `**Status: ${rendered ? 'TECHNICALLY VALID — artist review pending' : 'MANIPULATION INVALID / INCONCLUSIVE'}.**`, '',
    '## Question and scope', '',
    'This pass compares exact foot-contact-to-mark timing with a deterministic within-Plate event-position permutation. It changes no simulation law and does not claim this glyph is a final material identity.', '',
    '## Provenance', '',
    `- Fresh \`origin/main\`: \`${MAIN}\`.`, `- Branch: \`${BRANCH}\`; created directly from fresh main.`,
    `- Prior rigid relocation failure: [separate retained record](./PRIOR-FAILED-PASS.md).`,
    `- Contact prerequisite: \`${PREREQUISITE}\`; H1 is a diagnostic heading transform only.`,
    '- Seed `20261005`, current-G defaults, 60 Hz, 640×640, DPR 1, no audio/DSP.',
    `- Controller source SHA-256: \`${sourceHashes['src/lib/agents/ant/AntController.js']}\`; renderer source SHA-256: \`${sourceHashes['src/lib/renderers/AntRenderer.js']}\`.`, '',
    '## Conditions', '',
    '- **A:** selected event adds a 2.5 native-pixel black circle at its exact contact position and event time.',
    '- **B:** the same selected event adds the same mark at another eligible event position from the same Plate.',
    '- Both use alpha 72/255, source-over accumulation, no cap/decay; mark is drawn under unchanged production pheromone and ants. Material fill is hidden.',
    '- Current physical/display ownership hides marks once buried or unsupported. H1 and renderer patches exist only in memory.', '',
    '## H1 event and state audit', '',
    '| Measure | Result |', '| --- | ---: |',
    `| First Plate | tick ${s.firstPlateTick} / ${(s.firstPlateTick / 60).toFixed(9)} s |`,
    `| Second Plate | tick ${s.firstPlateBirths[1]?.tick ?? 'none'} / ${s.firstPlateBirths[1] ? (s.firstPlateBirths[1].tick / 60).toFixed(9) : 'n/a'} s |`,
    `| Endpoint | tick ${s.tickCount} / ${(s.tickCount / 60).toFixed(9)} s |`,
    `| Grouped contacts / feet / responses | ${s.rawGroupedEvents} / ${s.rawFeet} / ${s.responseFeet} |`,
    `| Exposed routed feet | ${s.routedFeet} |`,
    `| Event-time physical + display eligible | ${s.sourceEligible} / ${s.routedFeet} (${(s.sourceEligible / Math.max(1,s.routedFeet) * 100).toFixed(2)}%) |`,
    `| Event digest vs prerequisite | ${s.eventDigest === prereq.eventDigest ? 'exact match' : 'MISMATCH'} |`,
    `| Prior H1 anchors | ${s.priorMatchedAnchors}/${preflight.anchors.filter(row => row.priorMatched).length} matched |`,
    `| Final RNG | state ${s.rngFinal.state}; ${s.rngFinal.calls} calls |`, '',
    'Routed feet with event-time physical or display ownership mismatch were excluded from both conditions; see `contacts.jsonl` for each row.', '',
    '## Event-position assignment', '',
    'Per-Plate deterministic Hopcroft-Karp matching used only locations supported by the same Plate in both event-time physical and display topology. Only closed cycles were retained, so source and target event instances are the same set. No second mapping order was tried.', '',
    '| Plate | Eligible sources | Assigned | Coverage | Min px | Median px |', '| --- | ---: | ---: | ---: | ---: | ---: |', rows, '',
    `Overall: ${mapping.summary.assignedCount}/${mapping.summary.sourceCount} (${(mapping.summary.coverage * 100).toFixed(2)}%); minimum ${mapping.summary.minimumDistancePx?.toFixed(2) ?? 'n/a'} px; median ${mapping.summary.medianDistancePx?.toFixed(2) ?? 'n/a'} px; same-native-pixel pairs ${mapping.summary.sameNativePixelPairs}. Gate: **${mapping.accepted ? 'passed' : 'failed'}**.`, '',
    `A and B use the same matched events, tick curve, per-Plate mark count, and position multiset. ${rendered ? 'Endpoint convergence is expected; visual interpretation remains with the artist.' : 'The gate failed, so no comparison media were created.'}`, '',
    '## Capture and review', '',
    rendered ? `- A and B rendered the exact same snapshot stream in lockstep: ${capture.sampling.frameCount} frames at ${capture.sampling.fps} fps.\n- Snapshot/RNG/event parity: ${capture.stateRngEventParity && capture.renderSnapshotParity ? 'passed' : 'failed'}; selected events reproduced ${capture.selectedSourceEventsSeen}/${mapping.summary.assignedCount}.\n- Native videos and milestone stills: [neutral synchronized review page](./review.html).\n- Exact mapping: [capture metadata](./capture.json), [media hashes](./media-manifest.json).` : 'No artist-facing review page or video was produced because the registered assignment gate failed.', '',
    'Diagnostics are separate: [event ledger](./contacts.jsonl), [assignment](./assignment.json), [event-position SVG](./diagnostics/event-position-correspondence.svg), [state anchors](./parity-anchors.json).', '',
    '**Human review:** pending. The neutral page asks only for free description. No artistic verdict is recorded.', '',
    '## Technical result and limits', '',
    '- Production `src/` remains unchanged; H1 and mark rendering are in-memory research instrumentation.',
    `- Replay matched prerequisite event digest and final RNG: ${s.eventDigest === prereq.eventDigest && JSON.stringify(s.rngFinal) === JSON.stringify(prereq.rng) ? 'yes' : 'no'}.`,
    `- Capture performed: ${rendered ? 'yes' : 'no'}. Browser errors: ${rendered ? capture.browserErrors ?? 0 : 0}.`,
    '- Focused/full tests, build, and `git diff --check` are recorded in the daily log before commit.',
    '- This result is limited to temporal event-position correspondence for one registered glyph and one H1 scene. It does not establish material identity, naturalness, or a production renderer direction.', ''
  ];
  await writeFile(resolve(OUTPUT, 'README.md'), lines.join('\n'));
}

main().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });
