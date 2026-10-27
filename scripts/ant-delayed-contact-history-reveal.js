import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { CONTACT_REVEAL_DELAY_CANDIDATES, selectContactRevealDelay, selectContactRevealEvents } from './lib/contactRevealDelay.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-27-delayed-contact-history-reveal');
const MAIN = 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292';
const PREREQUISITE = '9233500dad65ff5bbd09d8b604f4ea86b2208932';
const FAILED_PASS = '394bd8136601c832a49b521f47d1ae446a17d0ed';
const PRIOR_TEMPORAL = '1c5ebb250398648d99edf9210f74487a3ddb4661';
const PRIOR_REVIEW = '1f5a396b5e9765944f28719de7b5aa6b2cf8257b';
const BRANCH = 'codex/ant-delayed-contact-history-reveal-20261027';
const FIRST_TICK = 4501, MID_TICK = 5401, END_TICK = 6301, DT = 1 / 60;
const MAX_PREFLIGHT_TICK = END_TICK + 180;
const FPS = 30, WIDTH = 640, HEIGHT = 640;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
const gitText = (...args) => git(...args).toString('utf8').trim();

async function main() {
  await assertProvenance();
  const mode = process.argv[2] || '--preflight';
  assert.ok(['--preflight', '--capture'].includes(mode), 'Use --preflight or --capture');
  const priorMeasurement = JSON.parse(git('show', `${PREREQUISITE}:docs/ant/evidence/2026-10-27-material-contact-readout-prerequisite/measurement.json`));
  const priorAnchors = JSON.parse(git('show', `${PREREQUISITE}:docs/ant/evidence/2026-10-27-material-contact-readout-prerequisite/parity-anchors.json`));
  const controllerPath = 'src/lib/agents/ant/AntController.js';
  const rendererPath = 'src/lib/renderers/AntRenderer.js';
  const controllerSource = await readFile(resolve(ROOT, controllerPath), 'utf8');
  const h1Controller = patchH1(controllerSource);
  const sourcePaths = [controllerPath, rendererPath, 'src/lib/agents/ant/AntAgent.js',
    'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/SurfaceField.js',
    'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
    'src/lib/agents/ant/PheromoneField.js', 'src/lib/audio/SurfaceAudioBridge.js',
    'src/lib/audio/compileSurfaceTopology.js', 'scripts/lib/contactRevealDelay.js'];
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
    [path, sha256(await readFile(resolve(ROOT, path)))])));
  if (mode === '--capture') {
    const registered = JSON.parse(await readFile(resolve(OUTPUT, 'delay-preflight.json'), 'utf8'));
    assert.ok(registered.selectedDelay, 'No registered delay passed the preflight gate');
    const plan = await readFile(resolve(OUTPUT, 'PLAN.md'), 'utf8');
    assert.ok(plan.includes(`**Selected delay: ${registered.selectedDelay.seconds} s**`),
      'Selected delay must be recorded in PLAN.md before capture');
    await captureCandidates({ priorMeasurement, priorAnchors, sourceHashes, h1Controller, rendererPath,
      registered, mode });
    return;
  }
  const server = await createServer({ root: ROOT, logLevel: 'error', appType: 'custom',
    server: { host: '127.0.0.1', port: 0, strictPort: true } });
  let browser, markRenderer;
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
    await routeBrowserModules(preflightPage, server, h1Controller, markRenderer, '__delayed_contact_preflight');
    const preflight = await preflightPage.evaluate(runPreflight, { priorAnchors, priorMeasurement,
      firstTick: FIRST_TICK, midTick: MID_TICK, endTick: END_TICK, maxTick: MAX_PREFLIGHT_TICK,
      dt: DT, width: WIDTH, height: HEIGHT, delayCandidates: CONTACT_REVEAL_DELAY_CANDIDATES });
    assert.deepEqual(pageErrors, [], 'Preflight browser reported errors');
    await preflightPage.close();
    const selectedDelay = selectContactRevealDelay(preflight.delayMeasurements);
    const selectedEvents = selectedDelay
      ? selectContactRevealEvents(preflight.eligibleEvents, END_TICK, selectedDelay.ticks) : [];
    const preflightRecord = { ...preflight.summary, freshMainSha: MAIN, branch: BRANCH,
      parentSha: gitText('rev-parse', 'HEAD'), sourceHashes, headingTransform: 'heading: wrapAngle(-Math.PI + TAU * this.random())',
      candidates: preflight.delayMeasurements, selectedDelay,
      selectedEventCount: selectedEvents.length,
      selectedEventCutoffTick: selectedDelay ? END_TICK - selectedDelay.ticks : null,
      browserErrors: pageErrors.length,
      note: 'Preflight only. No candidate renderer media were created. Ant positions sampled once per model tick through endpoint + 180 ticks.' };
    await writeFile(resolve(OUTPUT, 'delay-preflight.json'), `${JSON.stringify(preflightRecord, null, 2)}\n`);
    await writeFile(resolve(OUTPUT, 'eligible-events.jsonl'), `${selectedEvents.map(row => JSON.stringify(row)).join('\n')}\n`);
    await writeFile(resolve(OUTPUT, 'delay-distance-samples.jsonl'), `${preflight.delaySamples.map(row => JSON.stringify(row)).join('\n')}\n`);
    await writeFile(resolve(OUTPUT, 'parity-anchors.json'), `${JSON.stringify(preflight.anchors, null, 2)}\n`);
    await recordDelayInPlan(selectedDelay, preflight.delayMeasurements, selectedEvents.length);
    console.log(JSON.stringify({ selectedDelay, measurements: preflight.delayMeasurements,
      eligibleEvents: preflight.summary.eligibleEvents, selectedEvents: selectedEvents.length,
      endpoint: END_TICK, extendedPositionSamplesThrough: MAX_PREFLIGHT_TICK }, null, 2));
  } finally {
    if (browser) await browser.close();
    await server.close();
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

function reviewOrder() {
  const bit = createHash('sha256').update('ant-delayed-contact-history-reveal-left-right-20261027').digest()[0] & 1;
  return { bit, first: bit ? 'B' : 'A', second: bit ? 'A' : 'B' };
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

main().catch(error => { console.error(error?.stack || error); process.exitCode = 1; });

async function runPreflight({ priorAnchors, priorMeasurement, firstTick, midTick, endTick, maxTick, dt, width, height, delayCandidates }) {
  const FIRST_TICK = firstTick, MID_TICK = midTick, END_TICK = endTick, MAX_PREFLIGHT_TICK = maxTick;
  const DT = dt, WIDTH = width, HEIGHT = height;
  const [{ AntController }, { SurfaceAudioBridge }] = await Promise.all([
    import('/src/lib/agents/ant/__contact-history-h1.js'), import('/src/lib/audio/SurfaceAudioBridge.js')
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
  function displayCell(position) {
    const x = Math.min(639, Math.max(0, Math.floor(position.x * 640)));
    const y = Math.min(639, Math.max(0, Math.floor(position.y * 640)));
    return Math.floor((y + 0.5) * 96 / 640) * 96 + Math.floor((x + 0.5) * 96 / 640);
  }
  function currentOwner(material, oracle, masks, position) {
    const x = Math.max(0, Math.min(95, Math.round(position.x * 95)));
    const y = Math.max(0, Math.min(95, Math.round(position.y * 95)));
    const index = y * 96 + x, physicalLayer = oracle.routingTopLayerByCell96[index];
    const physicalId = physicalLayer >= 0 ? oracle.topology.layerIds[physicalLayer] : null;
    const displayLayer = material.stratigraphy.topLayerByCell[displayCell(position)];
    const displayId = displayLayer >= 0 ? material.stratigraphy.layerOrder[displayLayer] : null;
    return { physical: physicalId && masks[physicalId]?.[index] === 1 ? physicalId : null,
      display: displayId ?? null };
  }
  let tick = 0, firstPlateTick = null, group = 0, rawGroups = 0;
  let endpointSnapshotHash = null, endpointEventDigest = null, endpointRng = null, endpointEventCount = null;
  const contacts = [], anchors = [], births = [], plateMasks = Object.create(null);
  const eventText = ['', ''], eventCounts = [0, 0], positionsByTick = Object.create(null);
  const routeBridge = new SurfaceAudioBridge({ audioEngine: {}, workletFactory: async () => { throw new Error('Audio prohibited'); } });
  const supportOracle = new SurfaceAudioBridge({ audioEngine: {}, workletFactory: async () => { throw new Error('Audio prohibited'); } });
  const resolutions = [], exposed = routeBridge.exposedPlateAt.bind(routeBridge);
  routeBridge.exposedPlateAt = position => { const plate = exposed(position); resolutions.push({ position: { ...position }, plateId: plate?.id ?? null }); return plate; };
  let world;
  const observer = {
    syncMaterial(material) { ensure(routeBridge.syncMaterial(material) && supportOracle.syncMaterial(material), 'route topology sync failed'); },
    async destroy() { await Promise.all([routeBridge.destroy(), supportOracle.destroy()]); },
    handleFootContact(event, { responses }) {
      const eventGroup = group++;
      rawGroups++;
      const input = JSON.stringify({ event, responses });
      resolutions.length = 0;
      routeBridge.handleFootContact(event, { responses });
      ensure(input === JSON.stringify({ event, responses }), 'route observer mutated contact input');
      if (!resolutions.some(row => row.plateId !== null)) return false;
      const responseByLeg = new Map(responses.map(row => [row.legId, row]));
      const material = world.materialStratigraphy.getSnapshot();
      ensure(supportOracle.syncMaterial(material), 'event-time support topology sync failed');
      for (const plate of material.plates) if (!plateMasks[plate.id]) plateMasks[plate.id] = new Uint8Array(plate.mask);
      let routeIndex = 0;
      for (const contact of event.contacts) {
        const response = responseByLeg.get(contact.legId);
        if (!response) continue;
        const route = resolutions[routeIndex++];
        ensure(route && route.position.x === response.position.x && route.position.y === response.position.y,
          'Route did not preserve exact SurfaceField position/order');
        if (!route.plateId) continue;
        const ownership = currentOwner(material, supportOracle, plateMasks, route.position);
        const id = `${tick}:${eventGroup}:${event.antId}:${event.contactGroup}:${response.legId}`;
        contacts.push({ id, tick, eventTimeMs: event.simulationTimeMs, antId: event.antId,
          contactGroup: event.contactGroup, legId: response.legId, plateId: route.plateId,
          position: { ...route.position }, eventTimePhysicalOwner: ownership.physical,
          eventTimeDisplayOwner: ownership.display,
          sourceEligible: ownership.physical === route.plateId && ownership.display === route.plateId });
      }
      return false;
    }
  };
  const random = randomStream(), twinRandom = randomStream();
  world = new AntController({ random, audioBridge: observer }); const twin = new AntController({ random: twinRandom });
  for (const [index, model] of [world, twin].entries()) model.subscribe(({ type, payload }) => {
    if (!['foot-contact', 'plate-birth', 'sphere-birth', 'error'].includes(type)) return;
    ensure(type !== 'error', JSON.stringify(payload)); eventText[index] += JSON.stringify({ type, payload }); eventCounts[index]++;
    if (index === 0 && type === 'plate-birth') {
      births.push({ tick, id: payload.id, simulationTimeMs: payload.bornAtSimulationTimeMs }); firstPlateTick ??= tick;
    }
  });
  try {
    await world.init(); await twin.init(); world.syncEnvironmentAudio();
    positionsByTick[0] = Object.fromEntries(world.agents.map(agent => [agent.id, { x: agent.x, y: agent.y }]));
    const prior = new Map(priorAnchors.map(row => [Number(row.tick), row]));
    const checkpoint = async () => {
      const snapshot = world.getSnapshot(), rng = random.record(), hash = await objectHash(snapshot);
      ensure(hash === await objectHash(twin.getSnapshot()), `preflight twin snapshot mismatch at ${tick}`);
      same(rng, twinRandom.record(), `preflight twin RNG mismatch at ${tick}`);
      const expected = prior.get(tick);
      if (expected) ensure(String(rng.state) === String(expected.state) && String(rng.calls) === String(expected.calls)
        && hash === expected.fullPublicSnapshotSha256, `prior H1 anchor mismatch at ${tick}`);
      anchors.push({ tick, simulationTimeMs: world.simulationTimeMs, ...rng,
        fullPublicSnapshotSha256: hash, priorMatched: Boolean(expected) });
      if (tick === END_TICK) endpointSnapshotHash = hash;
    };
    await checkpoint(); const started = performance.now();
    while (tick < MAX_PREFLIGHT_TICK) {
      ensure(performance.now() - started < 240000, 'H1 delay preflight exceeded four-minute timeout');
      const offsets = [eventText[0].length, eventText[1].length];
      tick++; world.tick(DT); twin.tick(DT);
      same(random.record(), twinRandom.record(), `preflight twin RNG mismatch at ${tick}`);
      ensure(eventCounts[0] === eventCounts[1] && eventText[0].slice(offsets[0]) === eventText[1].slice(offsets[1]),
        `preflight twin event mismatch at ${tick}`);
      positionsByTick[tick] = Object.fromEntries(world.agents.map(agent => [agent.id, { x: agent.x, y: agent.y }]));
      if (tick === END_TICK) {
        endpointRng = random.record(); endpointEventCount = eventCounts[0];
        endpointEventDigest = await digest(new TextEncoder().encode(eventText[0]));
      }
      if (tick % 6 === 0 || [FIRST_TICK, MID_TICK, END_TICK, MAX_PREFLIGHT_TICK].includes(tick)) await checkpoint();
    }
    ensure(firstPlateTick === FIRST_TICK, `First Plate tick changed: ${firstPlateTick}`);
    ensure(endpointEventDigest === priorMeasurement.eventDigest, 'H1 endpoint event digest differs from prerequisite');
    same(endpointRng, priorMeasurement.rng, 'H1 endpoint RNG differs from prerequisite');
    ensure(anchors.filter(row => row.priorMatched).length === priorAnchors.length, 'Prior H1 anchor count mismatch');
    const eligibleEvents = contacts.filter(row => row.tick >= FIRST_TICK && row.tick <= END_TICK && row.sourceEligible);
    const delaySamples = [], delayMeasurements = delayCandidates.map(candidate => {
      const distances = [];
      let availableCount = 0, atLeast12PxCount = 0;
      for (const event of eligibleEvents) {
        const antPosition = positionsByTick[event.tick + candidate.ticks]?.[event.antId] ?? null;
        const distancePx = antPosition
          ? Math.hypot((antPosition.x - event.position.x) * WIDTH, (antPosition.y - event.position.y) * HEIGHT) : null;
        if (distancePx !== null) { availableCount++; distances.push(distancePx); if (distancePx >= 12) atLeast12PxCount++; }
        delaySamples.push({ eventId: event.id, antId: event.antId, plateId: event.plateId,
          eventTick: event.tick, eventTimeMs: event.eventTimeMs, contactPosition: event.position,
          delaySeconds: candidate.seconds, delayTicks: candidate.ticks, revealTick: event.tick + candidate.ticks,
          antPositionAtReveal: antPosition, distancePx, atLeast12Px: distancePx !== null && distancePx >= 12 });
      }
      const sorted = [...distances].sort((a, b) => a - b);
      const nearestRank = fraction => sorted.length ? sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)] : null;
      return { ...candidate, eligibleCount: eligibleEvents.length, availableCount,
        unavailableCount: eligibleEvents.length - availableCount, atLeast12PxCount,
        atLeast12PxFractionOfEligible: eligibleEvents.length ? atLeast12PxCount / eligibleEvents.length : 0,
        percentAtLeast12Px: eligibleEvents.length ? 100 * atLeast12PxCount / eligibleEvents.length : 0,
        p25Px: nearestRank(0.25), medianPx: nearestRank(0.5), p75Px: nearestRank(0.75),
        percentileMethod: 'nearest-rank over available ant positions; unavailable events remain non-qualifying in the ≥12 px denominator' };
    });
    return { eligibleEvents, delayMeasurements, delaySamples, anchors, summary: {
      firstPlateTick, firstPlateBirths: births, endpointTick: END_TICK,
      positionSamplesThroughTick: tick, endpointSimulationTimeMs: END_TICK * (1000 / 60),
      extendedPositionSimulationTimeMs: world.simulationTimeMs, groupedContactEvents: rawGroups,
      routedFeet: contacts.filter(row => row.tick >= FIRST_TICK && row.tick <= END_TICK).length,
      sourceEligible: eligibleEvents.length,
      physicalOwnerMismatch: contacts.filter(row => row.tick >= FIRST_TICK && row.tick <= END_TICK
        && row.eventTimePhysicalOwner !== row.plateId).length,
      displayOwnerMismatch: contacts.filter(row => row.tick >= FIRST_TICK && row.tick <= END_TICK
        && row.eventTimeDisplayOwner !== row.plateId).length,
      eventDigest: endpointEventDigest, rngAtEndpoint: endpointRng, endpointSnapshotHash,
      endpointEventCount, extendedRng: random.record(), priorAnchorCount: priorAnchors.length,
      priorMatchedAnchors: anchors.filter(row => row.priorMatched).length,
      elapsedSeconds: (performance.now() - started) / 1000 } };
  } finally { await Promise.all([world.destroy(), twin.destroy()]); }
}

async function recordDelayInPlan(selectedDelay, measurements, selectedEventCount) {
  const file = resolve(OUTPUT, 'PLAN.md'), current = await readFile(file, 'utf8');
  const marker = '\n## Preflight-selected delay\n';
  const base = current.includes(marker) ? current.slice(0, current.indexOf(marker)) : current.trimEnd();
  const rows = measurements.map(row => `| ${row.seconds} s | ${row.eligibleCount} | ${row.availableCount} | ${row.atLeast12PxCount} | ${row.percentAtLeast12Px.toFixed(2)}% | ${row.p25Px?.toFixed(2) ?? 'n/a'} | ${row.medianPx?.toFixed(2) ?? 'n/a'} | ${row.p75Px?.toFixed(2) ?? 'n/a'} |`);
  const chosen = selectedDelay ? `**Selected delay: ${selectedDelay.seconds} s**` : '**Selected delay: none — manipulation-invalid**';
  const text = `${base}\n\n## Preflight-selected delay\n\n${chosen}. ${selectedDelay
    ? `Shortest registered delay meeting the 75% ≥12 px rule. Common selected event subset: ${selectedEventCount}, with event tick ≤ ${END_TICK - selectedDelay.ticks}. At the time this pre-capture PLAN amendment was written, candidate media had not yet been rendered.`
    : 'No candidate media were rendered; no longer delay may be added in this pass.'}\n\n| Delay | Eligible | Ant position available | ≥12 px | ≥12 px / all eligible | p25 px | Median px | p75 px |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n`;
  await writeFile(file, text);
}

async function captureCandidates({ priorMeasurement, priorAnchors, sourceHashes, h1Controller, rendererPath, registered }) {
  const selectedEvents = (await readFile(resolve(OUTPUT, 'eligible-events.jsonl'), 'utf8')).trim().split(/\r?\n/)
    .filter(Boolean).map(line => JSON.parse(line));
  const selectedIds = new Set(selectedEvents.map(row => row.id));
  const delaySamples = (await readFile(resolve(OUTPUT, 'delay-distance-samples.jsonl'), 'utf8')).trim().split(/\r?\n/)
    .filter(Boolean).map(line => JSON.parse(line))
    .filter(row => row.delayTicks === registered.selectedDelay.ticks && selectedIds.has(row.eventId));
  assert.equal(delaySamples.length, selectedEvents.length, 'Selected event delay measurements are incomplete');
  assert.deepEqual(registered.sourceHashes, sourceHashes, 'Source changed between preregistration and capture');
  assert.ok(selectedEvents.length > 0, 'Common event subset is empty');
  const server = await createServer({ root: ROOT, logLevel: 'error', appType: 'custom',
    server: { host: '127.0.0.1', port: 0, strictPort: true } });
  let browser, tempRoot, page;
  try {
    await server.listen();
    const transformedRenderer = await server.transformRequest(`/${rendererPath}`);
    assert.ok(transformedRenderer?.code, 'Vite could not resolve the production renderer module');
    const markRenderer = patchRenderer(transformedRenderer.code), viewOrder = reviewOrder();
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--mute-audio'] });
    page = await browser.newPage({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
    const pageErrors = watchPage(page);
    await routeBrowserModules(page, server, h1Controller, markRenderer, '__delayed_contact_capture');
    const preflightAnchors = JSON.parse(await readFile(resolve(OUTPUT, 'parity-anchors.json'), 'utf8'));
    await page.evaluate(prepareDelayedCapture, { selectedEvents, delaySamples, delay: registered.selectedDelay,
      priorAnchors, priorMeasurement, preflightAnchors, registered });
    tempRoot = await mkdtemp(join(tmpdir(), 'ant-delayed-history-'));
    const temp = resolve(tempRoot), base = resolve(tmpdir());
    assert.ok(temp.toLowerCase().startsWith(`${base.toLowerCase()}\\`), 'Temporary frames escaped temp directory');
    const frameDirs = { a: join(tempRoot, 'a'), b: join(tempRoot, 'b') };
    await Promise.all(Object.values(frameDirs).map(path => mkdir(path, { recursive: true })));
    const frameCount = await captureFrames(page, frameDirs, viewOrder);
    const capture = await page.evaluate(finalizeDelayedCapture);
    assert.deepEqual(pageErrors, [], 'Capture browser reported errors');
    assert.equal(frameCount, 901);
    assert.equal(capture.finalTick, END_TICK);
    assert.equal(capture.selectedCount, selectedEvents.length);
    assert.equal(capture.allSelectedEventsSeen, true);
    assert.equal(capture.stateRngEventParity, true);
    assert.equal(capture.renderSnapshotParity, true);
    assert.equal(capture.endpointPositionEquality, true);
    assert.equal(capture.endpointVisibleCounts.a, capture.endpointVisibleCounts.b,
      'Same contact positions and endpoint owner state must produce equal visible counts');
    assert.deepEqual(capture.finalRng, registered.rngAtEndpoint);
    assert.equal(capture.finalSnapshotHash, registered.endpointSnapshotHash);
    await page.close(); page = null;
    const mediaHashes = await encodeAndVerify(frameDirs, viewOrder);
    await writeSynchronizedReviewPage(viewOrder);
    await writeDelayedCaptureEvidence(capture, viewOrder, sourceHashes, frameCount, mediaHashes, selectedEvents, registered);
    await writeDelayedReport(capture, registered, selectedEvents.length, sourceHashes, pageErrors.length);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
    await server.close();
    if (tempRoot) {
      const temp = resolve(tempRoot), base = resolve(tmpdir());
      if (temp.toLowerCase().startsWith(`${base.toLowerCase()}\\`)) await rm(temp, { recursive: true, force: true });
    }
  }
}

async function prepareDelayedCapture({ selectedEvents, delaySamples, delay, priorAnchors, priorMeasurement,
  preflightAnchors, registered }) {
  const FIRST_TICK = 4501, MID_TICK = 5401, END_TICK = 6301, DT = 1 / 60, WIDTH = 640, HEIGHT = 640;
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
  function displayCell(position) {
    const x = Math.min(639, Math.max(0, Math.floor(position.x * 640)));
    const y = Math.min(639, Math.max(0, Math.floor(position.y * 640)));
    return Math.floor((y + 0.5) * 96 / 640) * 96 + Math.floor((x + 0.5) * 96 / 640);
  }
  function currentOwner(material, oracle, masks, position) {
    const x = Math.max(0, Math.min(95, Math.round(position.x * 95)));
    const y = Math.max(0, Math.min(95, Math.round(position.y * 95)));
    const index = y * 96 + x, physicalLayer = oracle.routingTopLayerByCell96[index];
    const physicalId = physicalLayer >= 0 ? oracle.topology.layerIds[physicalLayer] : null;
    const displayLayer = material.stratigraphy.topLayerByCell[displayCell(position)];
    const displayId = displayLayer >= 0 ? material.stratigraphy.layerOrder[displayLayer] : null;
    return { physical: physicalId && masks[physicalId]?.[index] === 1 ? physicalId : null, display: displayId ?? null };
  }
  const eventById = new Map(selectedEvents.map(row => [row.id, row]));
  const sampleById = new Map(delaySamples.map(row => [row.eventId, row]));
  const random = randomStream(), twinRandom = randomStream();
  const eventText = ['', ''], eventCounts = [0, 0], anchors = [];
  const marksA = [], marksB = [], seen = new Set(), visibleCounts = [];
  const plateMasks = Object.create(null);
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
      ensure(supportOracle.syncMaterial(material), 'capture event-time support sync failed');
      for (const plate of material.plates) if (!plateMasks[plate.id]) plateMasks[plate.id] = new Uint8Array(plate.mask);
      let routeIndex = 0;
      for (const contact of event.contacts) {
        const response = responseByLeg.get(contact.legId);
        if (!response) continue;
        const route = resolutions[routeIndex++];
        ensure(route && route.position.x === response.position.x && route.position.y === response.position.y,
          'capture contact route/order changed');
        if (!route.plateId) continue;
        const id = `${tick}:${eventGroup}:${event.antId}:${event.contactGroup}:${response.legId}`;
        const selected = eventById.get(id);
        if (!selected) continue;
        ensure(!seen.has(id), `Selected event repeated: ${id}`);
        ensure(selected.tick === tick && selected.antId === event.antId && selected.plateId === route.plateId
          && selected.eventTimeMs === event.simulationTimeMs
          && selected.position.x === route.position.x && selected.position.y === route.position.y,
        `Selected event changed in capture replay: ${id}`);
        const ownership = currentOwner(material, supportOracle, plateMasks, route.position);
        ensure(ownership.physical === route.plateId && ownership.display === route.plateId,
          `Selected source lost event-time owner during capture: ${id}`);
        const a = { id, plateId: route.plateId, antId: event.antId, x: route.position.x, y: route.position.y,
          eventTick: tick, eventTimeMs: event.simulationTimeMs, revealTick: tick, revealTimeMs: event.simulationTimeMs };
        const b = { ...a, revealTick: tick + delay.ticks,
          scheduledRevealTimeMs: event.simulationTimeMs + delay.seconds * 1000, revealTimeMs: null,
          delayAudit: false, hiddenAtReveal: null, visibleLater: false, antDistanceAtRevealPx: null };
        marksA.push(a); marksB.push(b); seen.add(id);
      }
      return false;
    }
  };
  const twin = new AntController({ random: twinRandom }); world = new AntController({ random, audioBridge: observer });
  for (const [index, model] of [world, twin].entries()) model.subscribe(({ type, payload }) => {
    if (!['foot-contact', 'plate-birth', 'sphere-birth', 'error'].includes(type)) return;
    ensure(type !== 'error', JSON.stringify(payload)); eventText[index] += JSON.stringify({ type, payload }); eventCounts[index]++;
    if (index === 0 && type === 'plate-birth') firstPlateTick ??= tick;
  });
  const rendererA = new AntRenderer(document.querySelector('#view-a'));
  const rendererB = new AntRenderer(document.querySelector('#view-b'));
  try {
    await world.init(); await twin.init(); world.syncEnvironmentAudio();
    await Promise.all([rendererA.init({ width: WIDTH, height: HEIGHT, pixelRatio: 1 }), rendererB.init({ width: WIDTH, height: HEIGHT, pixelRatio: 1 })]);
    rendererA.setDebugOptions({ material: false }); rendererB.setDebugOptions({ material: false });
    ensure(!rendererA.debugOptions.material && !rendererB.debugOptions.material, 'Material renderer did not disable');
    const prior = new Map(priorAnchors.map(row => [Number(row.tick), row]));
    const expectedReplay = new Map(preflightAnchors.filter(row => row.tick <= END_TICK).map(row => [Number(row.tick), row]));
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
          && String(rng.calls) === String(replay.calls), `capture replay differs from delay preflight at ${tick}`);
        preflightAnchorMatches++;
      }
      if ([0, FIRST_TICK, MID_TICK, END_TICK].includes(tick)) anchors.push({ tick, fullPublicSnapshotSha256: hash, ...rng });
      return snapshot;
    }
    function auditDelayedReveal() {
      const due = marksB.filter(mark => !mark.delayAudit && mark.revealTick === tick);
      const stillHidden = marksB.filter(mark => mark.delayAudit && mark.hiddenAtReveal === true && !mark.visibleLater);
      if (!due.length && !stillHidden.length) return;
      const material = world.materialStratigraphy.getSnapshot(); supportOracle.syncMaterial(material);
      for (const mark of due) {
        const sample = sampleById.get(mark.id), ant = world.agents.find(agent => agent.id === mark.antId);
        const position = ant ? { x: ant.x, y: ant.y } : null;
        ensure(sample && sample.revealTick === tick && JSON.stringify(sample.antPositionAtReveal) === JSON.stringify(position),
          `Delayed ant position differs from preflight at ${mark.id}`);
        ensure(world.simulationTimeMs + 1e-6 >= mark.scheduledRevealTimeMs
          && world.simulationTimeMs < mark.scheduledRevealTimeMs + DT * 1000 + 1e-6,
        `Delayed reveal tick does not follow its registered timestamp at ${mark.id}`);
        mark.antDistanceAtRevealPx = position
          ? Math.hypot((position.x - mark.x) * WIDTH, (position.y - mark.y) * HEIGHT) : null;
        mark.revealTimeMs = world.simulationTimeMs;
        mark.observedDelayMs = mark.revealTimeMs - mark.eventTimeMs;
        mark.quantizationOvershootMs = mark.revealTimeMs - mark.scheduledRevealTimeMs;
        if (position && sample.distancePx !== null) ensure(Math.abs(mark.antDistanceAtRevealPx - sample.distancePx) < 1e-9,
          `Delayed ant distance differs from preflight at ${mark.id}`);
        const ownership = currentOwner(material, supportOracle, plateMasks, mark);
        mark.hiddenAtReveal = ownership.physical !== mark.plateId || ownership.display !== mark.plateId;
        mark.delayAudit = true;
      }
      for (const mark of stillHidden) {
        const ownership = currentOwner(material, supportOracle, plateMasks, mark);
        if (ownership.physical === mark.plateId && ownership.display === mark.plateId) mark.visibleLater = true;
      }
    }
    async function advanceOneTick() {
      const offsets = [eventText[0].length, eventText[1].length];
      tick++; world.tick(DT); twin.tick(DT);
      same(random.record(), twinRandom.record(), `capture RNG mismatch at tick ${tick}`);
      ensure(eventCounts[0] === eventCounts[1] && eventText[0].slice(offsets[0]) === eventText[1].slice(offsets[1]),
        `capture event sequence mismatch at tick ${tick}`);
      auditDelayedReveal();
      if (tick % 6 === 0 || [FIRST_TICK, MID_TICK, END_TICK].includes(tick)) await checkpoint();
    }
    async function visibleMarks(marks, snapshot, delayed = false) {
      const material = snapshot.stratigraphy; supportOracle.syncMaterial(material);
      const result = [];
      for (const mark of marks) {
        if (tick < mark.revealTick) continue;
        const ownership = currentOwner(material, supportOracle, plateMasks, mark);
        if (ownership.physical !== mark.plateId || ownership.display !== mark.plateId) continue;
        if (delayed && mark.hiddenAtReveal === true && tick > mark.revealTick) mark.visibleLater = true;
        result.push({ x: mark.x, y: mark.y });
      }
      return result;
    }
    async function renderFrame(snapshot, checkSnapshot = false) {
      const rngBefore = random.record(), eventCountBefore = eventCounts[0];
      const beforeHash = checkSnapshot ? await objectHash(snapshot) : null;
      rendererA.contactMarks = await visibleMarks(marksA, snapshot);
      rendererB.contactMarks = await visibleMarks(marksB, snapshot, true);
      visibleCounts.push({ tick, a: rendererA.contactMarks.length, b: rendererB.contactMarks.length });
      rendererA.render(snapshot); rendererB.render(snapshot);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      ensure(JSON.stringify(random.record()) === JSON.stringify(rngBefore) && eventCounts[0] === eventCountBefore,
        'Renderer consumed simulation RNG or emitted events');
      if (checkSnapshot) { ensure(await objectHash(snapshot) === beforeHash, 'Renderer mutated shared snapshot'); renderParityChecks++; }
      return { a: document.querySelector('#view-a').toDataURL('image/png'),
        b: document.querySelector('#view-b').toDataURL('image/png') };
    }
    while (tick < FIRST_TICK) await advanceOneTick();
    const frameZero = await renderFrame(world.getSnapshot(), true);
    window.__contactCapture = { world, twin, random, twinRandom, rendererA, rendererB, advanceOneTick,
      renderFrame, frameZero, selectedCount: selectedEvents.length, selectedEvents, seen, marksA, marksB,
      eventText, eventCounts, anchors, visibleCounts, objectHash, priorMeasurement, registered, firstPlateTick,
      get tick() { return tick; }, get renderParityChecks() { return renderParityChecks; },
      get preflightAnchorMatches() { return preflightAnchorMatches; } };
  } catch (error) {
    await Promise.all([rendererA.destroy(), rendererB.destroy(), world.destroy(), twin.destroy()]);
    throw error;
  }
}

async function finalizeDelayedCapture() {
  const END_TICK = 6301, FPS = 30, FIRST_TICK = 4501, MID_TICK = 5401, DT = 1 / 60;
  const c = window.__contactCapture;
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
  const final = c.world.getSnapshot(), finalSnapshotHash = await c.objectHash(final);
  const twinHash = await c.objectHash(c.twin.getSnapshot()), eventDigest = await digest(new TextEncoder().encode(c.eventText[0]));
  const positionKey = row => `${row.x},${row.y}`;
  const samePositions = (a, b) => JSON.stringify(a.map(positionKey).sort()) === JSON.stringify(b.map(positionKey).sort());
  const eventPairsExact = c.marksA.length === c.selectedCount && c.marksB.length === c.selectedCount
    && c.marksA.every((a, index) => { const b = c.marksB[index]; return a.id === b.id && a.plateId === b.plateId
      && a.x === b.x && a.y === b.y && b.revealTick - a.revealTick === c.registered.selectedDelay.ticks
      && b.scheduledRevealTimeMs === a.eventTimeMs + c.registered.selectedDelay.seconds * 1000
      && Number.isFinite(b.revealTimeMs)
      && b.revealTimeMs + 1e-6 >= b.scheduledRevealTimeMs
      && b.revealTimeMs < b.scheduledRevealTimeMs + DT * 1000 + 1e-6; });
  const endpointPositionEquality = samePositions(c.rendererA.contactMarks, c.rendererB.contactMarks);
  const delayedDistances = c.marksB.map(mark => mark.antDistanceAtRevealPx).filter(value => value !== null).sort((a,b)=>a-b);
  const eventTimingAudit = c.marksA.map((a, index) => {
    const b = c.marksB[index];
    return { eventId: a.id, antId: a.antId, plateId: a.plateId, contactPosition: { x: a.x, y: a.y },
      eventTick: a.eventTick, revealTick: b.revealTick, eventTimeMs: a.eventTimeMs, revealTimeMs: b.revealTimeMs,
      scheduledRevealTimeMs: b.scheduledRevealTimeMs, observedDelayMs: b.observedDelayMs,
      quantizationOvershootMs: b.quantizationOvershootMs, antDistanceAtRevealPx: b.antDistanceAtRevealPx,
      ownerHiddenAtReveal: b.hiddenAtReveal, visibleLater: b.visibleLater };
  });
  const observedDelays = c.marksB.map(mark => mark.observedDelayMs);
  const result = { finalTick: c.tick, firstPlateTick: c.firstPlateTick, simulationTimeMs: final.analysis.simulationTimeMs,
    delay: c.registered.selectedDelay, selectedCount: c.selectedCount, selectedEventsSeen: c.seen.size,
    allSelectedEventsSeen: c.seen.size === c.selectedCount, eventPairsExact,
    observedDelayMs: { expected: c.registered.selectedDelay.seconds * 1000,
      minimum: Math.min(...observedDelays), maximum: Math.max(...observedDelays),
      maximumAbsoluteError: Math.max(...observedDelays.map(value => Math.abs(value - c.registered.selectedDelay.seconds * 1000))),
      targetQuantizationOvershootMs: { minimum: Math.min(...c.marksB.map(mark => mark.quantizationOvershootMs)),
        maximum: Math.max(...c.marksB.map(mark => mark.quantizationOvershootMs)) } },
    eventTimingAudit,
    sameRealEventPositions: samePositions(c.marksA, c.marksB),
    eventDigest, eventDigestMatchesPrerequisite: eventDigest === c.priorMeasurement.eventDigest,
    finalRng: c.random.record(), expectedFinalRng: c.priorMeasurement.rng,
    finalSnapshotHash, twinSnapshotHash: twinHash,
    pheromoneHash: await c.objectHash(final.pheromone), materialStateHash: await c.objectHash(final.stratigraphy),
    stateRngEventParity: finalSnapshotHash === twinHash && JSON.stringify(c.random.record()) === JSON.stringify(c.twinRandom.record())
      && c.eventCounts[0] === c.eventCounts[1],
    preflightAnchorMatches: c.preflightAnchorMatches, renderSnapshotParity: c.renderParityChecks === 31,
    renderParityChecks: c.renderParityChecks,
    eventsHiddenAtDelayedReveal: c.marksB.filter(mark => mark.hiddenAtReveal === true).length,
    eventsUnavailableAtAntPosition: c.marksB.filter(mark => mark.antDistanceAtRevealPx === null).length,
    eventsVisibleLaterAfterDelayedReveal: c.marksB.filter(mark => mark.visibleLater).length,
    delayedRevealDistance: { eligible: c.marksB.length,
      atLeast12Px: c.marksB.filter(mark => mark.antDistanceAtRevealPx !== null && mark.antDistanceAtRevealPx >= 12).length,
      availableCount: delayedDistances.length, p25Px: delayedDistances[Math.max(0, Math.ceil(delayedDistances.length * .25)-1)] ?? null,
      medianPx: delayedDistances[Math.max(0, Math.ceil(delayedDistances.length * .5)-1)] ?? null,
      p75Px: delayedDistances[Math.max(0, Math.ceil(delayedDistances.length * .75)-1)] ?? null },
    endpointVisibleCounts: { a: c.rendererA.contactMarks.length, b: c.rendererB.contactMarks.length },
    endpointPositionEquality, visibleCounts: c.visibleCounts,
    sampling: { fps: FPS, frameCount: 901, intervalTicks: 2, firstTick: FIRST_TICK, midTick: MID_TICK,
      endTick: END_TICK, endpointSpanSeconds: 30, containerDurationSeconds: 901 / FPS, nativeSizePerView: '640x640' } };
  ensure(result.finalTick === END_TICK && result.firstPlateTick === FIRST_TICK, 'Capture window changed');
  const timingMismatches = eventTimingAudit.filter(row => row.quantizationOvershootMs < -1e-6
    || row.quantizationOvershootMs >= DT * 1000 + 1e-6).slice(0, 3);
  ensure(result.allSelectedEventsSeen && result.eventPairsExact && result.sameRealEventPositions,
    `Event/position/timing contract failed: ${JSON.stringify({ allSelectedEventsSeen: result.allSelectedEventsSeen,
      eventPairsExact, sameRealEventPositions: result.sameRealEventPositions, observedDelayMs: result.observedDelayMs, timingMismatches })}`);
  ensure(result.eventDigestMatchesPrerequisite && JSON.stringify(result.finalRng) === JSON.stringify(result.expectedFinalRng),
    'Capture H1 event digest/RNG differs from prerequisite');
  ensure(result.stateRngEventParity && result.renderSnapshotParity && result.preflightAnchorMatches > 1000,
    'State, renderer, or replay parity failed');
  ensure(result.endpointPositionEquality && result.endpointVisibleCounts.a === result.endpointVisibleCounts.b,
    'A/B endpoint visible marks differ');
  ensure(c.marksB.every(mark => mark.delayAudit), 'Delayed reveal audit incomplete');
  function ensure(condition, message) { if (!condition) throw new Error(message); }
  return result;
}

async function writeSynchronizedReviewPage(viewOrder) {
  const cards = ['view-1', 'view-2'].map((view, index) => {
    const stills = ['birth', 'plus-15s', 'plus-30s'].map((name, i) =>
      `<figure><img src="./stills/${view}-${name}.png" alt="View ${index + 1} still ${i + 1}"><figcaption>Still ${i + 1}</figcaption></figure>`).join('');
    return `<section><h2>View ${index + 1}</h2><video controls muted playsinline preload="metadata" src="./media/${view}.webm"></video><details><summary>Stills</summary><div class="stills">${stills}</div></details></section>`;
  }).join('');
  const html = ['<!doctype html>', '<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>ANT visual review</title>',
    '<style>body{font:16px system-ui,sans-serif;margin:24px;color:#202124;background:#fff}main{max-width:1320px;margin:auto}.views{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}video{display:block;width:100%;aspect-ratio:1;background:#fff}.stills{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.stills img{width:100%}textarea{width:100%;min-height:110px;margin-top:8px;box-sizing:border-box;font:inherit}@media(max-width:760px){.views{grid-template-columns:1fr}}</style>',
    `<main><div class="views">${cards}</div><p>둘을 동시에 봤을 때 뭐가 다르게 느껴지고, 어떤 점이 자연스럽거나 이상하게 느껴지는지 자유롭게 적어 주세요.</p><textarea aria-label="자유 응답"></textarea></main>`,
    '<script>const [a,b]=[...document.querySelectorAll("video")];let lock=false;for(const [v,o] of [[a,b],[b,a]]){v.addEventListener("play",async()=>{if(lock)return;lock=true;o.currentTime=v.currentTime;await o.play().catch(()=>{});lock=false});v.addEventListener("pause",()=>{if(!lock){lock=true;o.pause();lock=false}});v.addEventListener("seeking",()=>{if(!lock){lock=true;o.currentTime=v.currentTime;lock=false}})}for(const [v,o] of [[a,b],[b,a]])v.addEventListener("timeupdate",()=>{if(!lock&&Math.abs(v.currentTime-o.currentTime)>.08){lock=true;o.currentTime=v.currentTime;lock=false}});</script>', '</html>'].join('\n');
  await writeFile(resolve(OUTPUT, 'review.html'), html);
  await writeFile(resolve(OUTPUT, 'REVIEW-KEY.json'), `${JSON.stringify({ left: viewOrder.first, right: viewOrder.second,
    sha256Bit: viewOrder.bit, label: 'ant-delayed-contact-history-reveal-left-right-20261027',
    conditionMapping: { A: 'immediate causal', B: 'delayed causal' } }, null, 2)}\n`);
}

async function writeDelayedCaptureEvidence(capture, viewOrder, sourceHashes, frameCount, mediaHashes, selectedEvents, registered) {
  const { eventTimingAudit, ...summary } = capture;
  const details = { ...summary, timingAuditPath: './event-timing-audit.jsonl', freshMainSha: MAIN, parentSha: MAIN, branch: BRANCH, sourceHashes,
    previousArtistReviewRef: { branch: 'codex/ant-contact-history-temporal-causality-20261027',
      commit: PRIOR_REVIEW, evidencePath: 'docs/ant/evidence/2026-10-27-contact-history-temporal-causality/ARTIST-REVIEW.md', copied: false },
    selectedEventIds: selectedEvents.map(row => row.id), viewOrder: { leftToRight: ['View 1', 'View 2'], keyStoredSeparately: true },
    frameCount, mediaHashes,
    mediaTimeMapping: { frame0: { frame: 0, tick: FIRST_TICK, modelSeconds: FIRST_TICK / 60, relativeSeconds: 0 },
      frame450: { frame: 450, tick: MID_TICK, modelSeconds: MID_TICK / 60, relativeSeconds: 15 },
      frame900: { frame: 900, tick: END_TICK, modelSeconds: END_TICK / 60, relativeSeconds: 30 },
      formula: 'frame=(tick-4501)/2; mediaSeconds=frame/30' },
    codec: 'libvpx-vp9 lossless; full-range yuv444p; decoded RGB framemd5 matches every native PNG frame',
    artistReview: 'pending', delayPreflightPath: './delay-preflight.json', selectedDelay: registered.selectedDelay };
  await writeFile(resolve(OUTPUT, 'capture.json'), `${JSON.stringify(details, null, 2)}\n`);
  await writeFile(resolve(OUTPUT, 'event-timing-audit.jsonl'), `${eventTimingAudit.map(row => JSON.stringify(row)).join('\n')}\n`);
  const files = ['view-1-birth.png', 'view-1-plus-15s.png', 'view-1-plus-30s.png',
    'view-2-birth.png', 'view-2-plus-15s.png', 'view-2-plus-30s.png'];
  const stills = Object.fromEntries(await Promise.all(files.map(async file =>
    [file, sha256(await readFile(resolve(OUTPUT, 'stills', file)))])));
  await writeFile(resolve(OUTPUT, 'media-manifest.json'), `${JSON.stringify({ videos: mediaHashes, stills,
    video: { fps: FPS, frameCount, codec: details.codec }, sizePerView: `${WIDTH}x${HEIGHT}`, audioTracks: 0 }, null, 2)}\n`);
}

async function writeDelayedReport(capture, registered, selectedEventCount, sourceHashes, browserErrors) {
  const rows = registered.candidates.map(row => `| ${row.seconds} s | ${row.eligibleCount} | ${row.availableCount} | ${row.atLeast12PxCount} | ${row.percentAtLeast12Px.toFixed(2)}% | ${row.p25Px?.toFixed(2) ?? 'n/a'} | ${row.medianPx?.toFixed(2) ?? 'n/a'} | ${row.p75Px?.toFixed(2) ?? 'n/a'} |`).join('\n');
  const lines = ['# Delayed contact-history reveal shadow', '', '**Status: TECHNICALLY VALID — artist review pending.**', '',
    '## Question and scope', '', 'Both conditions use the same eligible real foot-contact events and exact contact positions. The only registered difference is whether the mark appears at contact time or after a fixed delay. This is not a literal-footprint simulation or a final material-identity test.', '',
    '## Provenance', '', `- Fresh \`origin/main\`: \`${MAIN}\`.`, `- Parent: \`${MAIN}\`; branch: \`${BRANCH}\`.`,
    `- Contact prerequisite: \`${PREREQUISITE}\`; prior valid temporal-causality comparison: \`${PRIOR_TEMPORAL}\`.`,
    `- Previous artist review remains at [review-update commit ${PRIOR_REVIEW}](https://github.com/oseconds/ant-2026/blob/${PRIOR_REVIEW}/docs/ant/evidence/2026-10-27-contact-history-temporal-causality/ARTIST-REVIEW.md). It is referenced here, not copied.`,
    '- Seed `20261005`, current-G defaults, H1 diagnostic heading, 60 Hz, 640×640, DPR 1, no audio/DSP.',
    `- AntController SHA-256: \`${sourceHashes['src/lib/agents/ant/AntController.js']}\`; AntRenderer SHA-256: \`${sourceHashes['src/lib/renderers/AntRenderer.js']}\`.`, '',
    '## Delay preflight', '', `Shortest registered delay passing the 75% criterion: **${registered.selectedDelay.seconds} s** (${registered.selectedDelay.ticks} ticks). Preflight denominator: ${registered.candidates[0].eligibleCount} eligible contacts across the full review window. Missing ant positions are non-qualifying; percentiles are nearest-rank over available positions.`, '',
    '| Delay | Eligible | Position available | ≥12 px | ≥12 px / eligible | p25 px | Median px | p75 px |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |', rows, '',
    `The common selected subset contains ${selectedEventCount} events with event tick ≤ ${registered.selectedEventCutoffTick}. See [distance samples](./delay-distance-samples.jsonl), [selected events](./eligible-events.jsonl), and [preflight record](./delay-preflight.json). PLAN records the delay before candidate capture.`, '',
    '## Conditions and validity', '',
    '- **A — immediate causal:** black 2.5 native-pixel circle, alpha 72/255, source-over, at the real contact coordinate and event time.',
    `- **B — delayed causal:** the same circle at the same selected event, Plate and coordinate, revealed at event tick +${registered.selectedDelay.ticks} (nominally ${registered.selectedDelay.seconds} s at 60 Hz). No position shuffle.`,
    '- No cap, no decay, hidden material fill, unchanged production pheromone and ants; after reveal, both use current physical/display ownership.',
    `- Event/Plate/coordinate parity passed for ${capture.selectedCount}/${capture.selectedCount}; each B target timestamp is the contact timestamp +${capture.observedDelayMs.expected} ms. The mark becomes renderable at the first 60 Hz model tick at or after that target; sampled clock delay was ${capture.observedDelayMs.minimum.toFixed(6)}–${capture.observedDelayMs.maximum.toFixed(6)} ms. The target-to-tick quantization overshoot was ${capture.observedDelayMs.targetQuantizationOvershootMs.minimum.toFixed(6)}–${capture.observedDelayMs.targetQuantizationOvershootMs.maximum.toFixed(6)} ms; see [per-event timing audit](./event-timing-audit.jsonl).`,
    `- Events hidden at B reveal by owner mismatch: ${capture.eventsHiddenAtDelayedReveal}; observed visible later if ownership permitted: ${capture.eventsVisibleLaterAfterDelayedReveal}; origin ants absent at reveal: ${capture.eventsUnavailableAtAntPosition}.`,
    `- Endpoint position multiset equality passed; visible marks ${capture.endpointVisibleCounts.a}/${capture.endpointVisibleCounts.b}. Convergence is expected.`, '',
    '## State and review assets', '',
    `- H1 event digest, tick-6301 full-state hash, RNG and ${capture.preflightAnchorMatches} capture/preflight anchors match; twin state parity passed.`,
    '- Renderer RNG/event neutrality and snapshot immutability passed. Production `src/` is unchanged; H1 and marks are in-memory research instrumentation.',
    '- Same snapshot stream: ticks 4501–6301, 901 frames at 30 fps. Native 640×640 lossless videos; six birth / +15 s / +30 s stills.',
    '- Primary simultaneous review: [review.html](./review.html). The order key is stored separately in `REVIEW-KEY.json`; the artist knows the general research context, so this is not fully blind.',
    '- Media hashes: [manifest](./media-manifest.json).', '', '**Artist review:** pending. Initial response is not recorded yet.', '',
    '## Interpretation limits', '',
    '- This tests one registered delay and glyph in one H1 scene. It cannot establish archaeological history, invisible-agent meaning, material identity, or a final renderer direction.',
    '- Simultaneous playback reduces sequential order bias but does not remove left/right or research-context effects. Continuous video is primary; endpoint convergence is intentional.',
    `- Browser errors: ${browserErrors}; no audio tracks.`, ''];
  await writeFile(resolve(OUTPUT, 'README.md'), lines.join('\n'));
}
