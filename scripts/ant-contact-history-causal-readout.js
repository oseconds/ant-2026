import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-27-contact-history-causal-readout');
const MAIN = 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292';
const PREREQUISITE = '9233500dad65ff5bbd09d8b604f4ea86b2208932';
const PRIOR_REVIEW = 'da70d82822fa4d424744eaf6d50c53a728029ace';
const BRANCH = 'codex/ant-contact-history-causal-readout-20261027';
const DT = 1 / 60, END_TICK = 6301;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 });
const gitText = (...args) => git(...args).toString('utf8').trim();

async function main() {
  assert.equal(gitText('branch', '--show-current'), BRANCH);
  assert.equal(gitText('rev-parse', 'origin/main'), MAIN);
  assert.equal(gitText('merge-base', 'HEAD', 'origin/main'), MAIN);
  assert.equal(gitText('diff', MAIN, '--', 'src'), '', 'production source must remain unchanged');

  const priorMeasurement = JSON.parse(git('show', `${PREREQUISITE}:docs/ant/evidence/2026-10-27-material-contact-readout-prerequisite/measurement.json`));
  const priorAnchors = JSON.parse(git('show', `${PREREQUISITE}:docs/ant/evidence/2026-10-27-material-contact-readout-prerequisite/parity-anchors.json`));
  const priorReview = git('show', `${PRIOR_REVIEW}:docs/ant/evidence/2026-10-27-material-conditioned-pheromone-readout/ARTIST-REVIEW.md`).toString('utf8');
  const quote = '“응 2 3 은 미묘해 딱히 모르겠어\n근데 4는 괜찮은거같아 일단 접근방식 자체는 ㅇㅇ\n크게 이질적이지않고 근데 영역이 느껴지진않고 그냥 트레일중에 몇개가 다르다고는 보여”';
  assert.ok(priorReview.includes(quote));
  assert.ok((await readFile(resolve(OUTPUT, 'PRIOR-REVIEWS.md'), 'utf8')).includes(quote));

  const controllerPath = 'src/lib/agents/ant/AntController.js';
  const controller = await readFile(resolve(ROOT, controllerPath), 'utf8');
  const mainController = git('show', `${MAIN}:${controllerPath}`).toString('utf8');
  assert.equal(controller.replace(/\r\n/g, '\n'), mainController.replace(/\r\n/g, '\n'));
  const from = 'heading: SPAWN_HEADING + signed(this.random) * SPAWN_HEADING_SPREAD';
  const to = 'heading: wrapAngle(-Math.PI + TAU * this.random())';
  assert.equal(controller.split(from).length, 2);
  const h1Controller = controller.replace(from, to);
  const controllerTransform = { path: controllerPath, sourceSha256: sha256(controller), transformedSha256: sha256(h1Controller), from, to };
  const sourcePaths = ['scripts/ant-contact-history-causal-readout.js', controllerPath,
    'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/SurfaceField.js',
    'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/audio/SurfaceAudioBridge.js',
    'src/lib/audio/compileSurfaceTopology.js', 'scripts/lib/antContactHistoryShadow.js'];
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
    [path, sha256(await readFile(resolve(ROOT, path)))])));

  const server = await createServer({ root: ROOT, logLevel: 'error', appType: 'custom',
    server: { host: '127.0.0.1', port: 0, strictPort: true } });
  let browser;
  const pageErrors = [];
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--mute-audio'] });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
    await page.route('**/__contact_history_preflight', route => route.fulfill({ status: 200,
      contentType: 'text/html', body: '<!doctype html><title>Contact geometry preflight</title>' }));
    await page.route('**/src/lib/agents/ant/__contact-history-h1.js', route => route.fulfill({ status: 200,
      contentType: 'text/javascript', body: h1Controller }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__contact_history_preflight`,
      { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async ({ priorAnchors, priorMeasurement }) => {
      const [{ AntController }, { SurfaceAudioBridge }, {
        RELOCATION_TRANSFORMS, MIN_RELOCATED_SEPARATION_PX, plateMaskCentroid, relocateContact, selectRelocationRule
      }] = await Promise.all([
        import('/src/lib/agents/ant/__contact-history-h1.js'), import('/src/lib/audio/SurfaceAudioBridge.js'),
        import('/scripts/lib/antContactHistoryShadow.js')
      ]);
      const DT = 1 / 60, END_TICK = 6301;
      const ensure = (condition, message) => { if (!condition) throw new Error(message); };
      const same = (a, b, message) => ensure(JSON.stringify(a) === JSON.stringify(b), message);
      const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      async function objectHash(value) {
        const arrays = [];
        const text = JSON.stringify(value, (key, item) => {
          if (ArrayBuffer.isView(item)) {
            arrays.push(new Uint8Array(item.buffer, item.byteOffset, item.byteLength));
            return { typed: item.constructor.name, arrayIndex: arrays.length - 1, byteLength: item.byteLength };
          }
          return item instanceof Map ? { map: [...item] } : item instanceof Set ? { set: [...item] } : item;
        });
        const chunks = [new TextEncoder().encode(text), ...arrays];
        const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return digest(bytes);
      }
      function randomStream() {
        let state = 20261005 >>> 0, calls = 0;
        const random = () => { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
        random.record = () => ({ state, calls });
        return random;
      }
      function displayCell(position) {
        const px = Math.min(639, Math.floor(position.x * 640)), py = Math.min(639, Math.floor(position.y * 640));
        return Math.floor((py + 0.5) * 96 / 640) * 96 + Math.floor((px + 0.5) * 96 / 640);
      }
      function displayOwner(material, position) {
        const index = material.stratigraphy.topLayerByCell[displayCell(position)];
        return index >= 0 ? material.plates[index]?.id ?? null : null;
      }
      function inWorld(point) { return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1; }

      let tick = 0, firstPlateTick = null, contactGroup = 0, rawGroupedEvents = 0, rawFeet = 0, responseFeet = 0;
      const centers = Object.create(null), contacts = [], eventChunks = ['', ''], eventCounts = [0, 0];
      const anchors = [], births = [], topologySyncs = [], onPosts = [], resolutions = [];
      const on = new SurfaceAudioBridge({ audioEngine: {}, workletFactory: async () => ({
        node: { port: { postMessage(message) { if (message.type === 'strike') onPosts.push(structuredClone(message.payload));
          if (message.type === 'topology') topologySyncs.push(message.payload.generation ?? null); } } }, disconnect() {}
      }) });
      const off = new SurfaceAudioBridge({ audioEngine: {}, workletFactory: async () => {
        throw new Error('disabled route observer must not request audio transport');
      } });
      const exposed = on.exposedPlateAt.bind(on);
      on.exposedPlateAt = position => {
        const plate = exposed(position); resolutions.push({ position: { ...position }, plateId: plate?.id ?? null });
        return plate;
      };
      ensure(await on.setEnabled(true), 'recording route oracle failed to start');
      let world;
      const routeObserver = {
        syncMaterial(material) {
          ensure(on.syncMaterial(material), 'ready bridge topology sync failed');
          ensure(off.syncMaterial(material), 'disabled bridge topology sync failed');
        },
        handleFootContact(event, { responses }) {
          const group = contactGroup++;
          rawGroupedEvents += 1; rawFeet += event.contacts.length; responseFeet += responses.length;
          const inputs = JSON.stringify({ event, responses });
          onPosts.length = 0; resolutions.length = 0;
          const onResult = on.handleFootContact(event, { responses });
          const offResult = off.handleFootContact(event, { responses });
          ensure(offResult === false, 'disabled observer unexpectedly delivered a route');
          ensure(inputs === JSON.stringify({ event, responses }), 'route observer mutated contact inputs');
          const routed = resolutions.filter(row => row.plateId !== null);
          ensure(onPosts.length === routed.length, 'ready bridge route count differs from exposed feet');
          ensure(onResult === (onPosts.length > 0), 'ready bridge delivery result differs from routed count');
          ensure(on.diagnostics.supportedFeet === off.diagnostics.supportedFeet
            && on.diagnostics.unsupportedFeet === off.diagnostics.unsupportedFeet,
          'Audio-On/Off exposed-foot eligibility diverged');
          const material = world.materialStratigraphy.getSnapshot();
          for (const plate of material.plates) if (!(plate.id in centers)) centers[plate.id] = plateMaskCentroid(plate);
          for (let index = 0; index < onPosts.length; index += 1) {
            const post = onPosts[index], route = routed[index];
            ensure(route && post.plateId === route.plateId, 'posted Plate differs from ordered exposure route');
            const response = responses.find(row => row.position.x === route.position.x && row.position.y === route.position.y);
            ensure(response && response.position.x === post.position.x && response.position.y === post.position.y,
              'bridge route lost the exact SurfaceField response position');
            const center = centers[post.plateId], candidateSupport = Object.create(null);
            const candidatePlacements = Object.create(null);
            for (const transform of RELOCATION_TRANSFORMS) {
              const target = relocateContact(post.position, center, transform);
              const physicalOwner = inWorld(target) ? exposed(target)?.id ?? null : null;
              const screenOwner = inWorld(target) ? displayOwner(material, target) : null;
              candidateSupport[transform] = physicalOwner === post.plateId && screenOwner === post.plateId;
              candidatePlacements[transform] = { target, physicalOwnerAtTarget: physicalOwner,
                displayOwnerAtTarget: screenOwner, separationPx: Math.hypot(
                  (target.x - post.position.x) * 640, (target.y - post.position.y) * 640) };
            }
            const sourceDisplayOwner = displayOwner(material, post.position);
            contacts.push({ id: `${tick}:${group}:${response.legId}`, tick,
              eventGroupId: `${tick}:${group}:${event.antId}:${event.contactGroup}`,
              eventTimeMs: event.simulationTimeMs, antId: event.antId, contactGroup: event.contactGroup,
              legId: response.legId, plateId: post.plateId, position: { ...response.position },
              physicalOwnerAtContact: route.plateId, displayOwnerAtContact: sourceDisplayOwner,
              sourceDisplaySupported: sourceDisplayOwner === post.plateId,
              supportRevision: material.stratigraphy.revision, candidateSupport, candidatePlacements });
          }
          return onResult;
        },
        async destroy() { await Promise.all([on.destroy(), off.destroy()]); }
      };
      const random = randomStream(), twinRandom = randomStream();
      world = new AntController({ random, audioBridge: routeObserver });
      const twin = new AntController({ random: twinRandom });
      for (const [index, controller] of [world, twin].entries()) controller.subscribe(({ type, payload }) => {
        if (!['foot-contact', 'plate-birth', 'sphere-birth', 'error'].includes(type)) return;
        ensure(type !== 'error', JSON.stringify(payload));
        eventChunks[index] += JSON.stringify({ type, payload }); eventCounts[index] += 1;
        if (index === 0 && type === 'plate-birth') {
          births.push({ tick, id: payload.id, simulationTimeMs: payload.bornAtSimulationTimeMs });
          firstPlateTick ??= tick;
        }
      });
      await world.init(); await twin.init(); world.syncEnvironmentAudio();
      const prior = new Map(priorAnchors.map(row => [Number(row.tick), row]));
      const checkpoint = async () => {
        const snapshot = world.getSnapshot(), rng = random.record(), hash = await objectHash(snapshot);
        ensure(hash === await objectHash(twin.getSnapshot()), `instrumented twin mismatch at tick ${tick}`);
        same(rng, twinRandom.record(), `instrumented RNG mismatch at tick ${tick}`);
        const expected = prior.get(tick);
        if (expected) {
          ensure(String(rng.state) === String(expected.state) && String(rng.calls) === String(expected.calls),
            `prior H1 RNG mismatch at tick ${tick}`);
          ensure(hash === expected.fullPublicSnapshotSha256, `prior H1 state mismatch at tick ${tick}`);
        }
        anchors.push({ tick, simulationTimeMs: world.simulationTimeMs, ...rng,
          fullPublicSnapshotSha256: hash, priorMatched: Boolean(expected) });
      };
      await checkpoint();
      const started = performance.now();
      while (tick < END_TICK) {
        ensure(performance.now() - started < 180000, 'registered H1 replay exceeded its wall-time limit');
        const eventOffsets = [eventChunks[0].length, eventChunks[1].length];
        tick += 1; world.tick(DT); twin.tick(DT);
        same(random.record(), twinRandom.record(), `world RNG mismatch at tick ${tick}`);
        ensure(eventCounts[0] === eventCounts[1], `event count mismatch at tick ${tick}`);
        ensure(eventChunks[0].slice(eventOffsets[0]) === eventChunks[1].slice(eventOffsets[1]),
          `event sequence mismatch at tick ${tick}`);
        if (tick % 6 === 0 || tick === END_TICK) await checkpoint();
      }
      ensure(firstPlateTick === 4501, `H1 first Plate tick changed: ${firstPlateTick}`);
      ensure(await digest(new TextEncoder().encode(eventChunks[0])) === priorMeasurement.eventDigest,
        'H1 event digest changed from prerequisite');
      const rngFinal = random.record();
      same(rngFinal, priorMeasurement.rng, 'H1 final RNG changed from prerequisite');
      ensure(anchors.filter(row => row.priorMatched).length === priorAnchors.length,
        `prior anchor count mismatch: ${anchors.filter(row => row.priorMatched).length}/${priorAnchors.length}`);
      ensure(contacts.length === priorMeasurement.transport.on.directExposedStrikes,
        `eligible route count changed: ${contacts.length}/${priorMeasurement.transport.on.directExposedStrikes}`);
      ensure(on.diagnostics.directExposedStrikes === contacts.length, 'ready route/record count mismatch');
      ensure(off.diagnostics.directExposedStrikes === 0 && off.diagnostics.ignoredWhileDisabled > 0,
        'Audio-Off observer posted or missed its route gate');

      const candidates = contacts.filter(row => row.sourceDisplaySupported);
      const rule = selectRelocationRule({ contacts: candidates, centers,
        isSupported: (_target, _plateId, contact, transform) => contact.candidateSupport[transform],
        minSeparationPx: MIN_RELOCATED_SEPARATION_PX, width: 640, height: 640, minimumValidRatio: 0.9 });
      const routesByPlate = Object.create(null);
      for (const row of contacts) routesByPlate[row.plateId] = (routesByPlate[row.plateId] || 0) + 1;
      const summary = { tickCount: tick, firstPlateTick, endpointSimulationTimeMs: world.simulationTimeMs,
        elapsedSeconds: (performance.now() - started) / 1000, rawGroupedContactEvents: rawGroupedEvents,
        rawFeet, responseFeet, eligibleRoutes: contacts.length, sourceDisplaySupported: candidates.length,
        sourceDisplayUnsupported: contacts.length - candidates.length,
        eventDigest: await digest(new TextEncoder().encode(eventChunks[0])), eventCounts: eventCounts[0],
        rngFinal, firstPlateBirths: births, routesByPlate, anchorCount: anchors.length,
        priorMatchedAnchors: anchors.filter(row => row.priorMatched).length,
        bridge: { ready: { ...on.diagnostics }, disabled: { ...off.diagnostics }, topologySyncs: topologySyncs.length },
        relocation: { transform: rule.transform, accepted: rule.accepted, sourceCount: rule.sourceCount,
          validCount: rule.validCount, supportCount: rule.supportCount, validRatio: rule.validRatio,
          uniqueTargetPixels: rule.uniqueTargetPixels, sameNativePixelCount: rule.sameNativePixelCount,
          medianSeparationPx: rule.medianSeparationPx, candidates: rule.candidates } };
      await world.destroy(); await twin.destroy();
      return { summary, contacts, anchors };
    }, { priorAnchors, priorMeasurement });

    assert.deepEqual(pageErrors, []);
    const preflight = { schemaVersion: 1, status: result.summary.relocation.accepted
      ? 'geometry rule accepted before artist-facing comparison' : 'manipulation-invalid/inconclusive; stop before artist-facing capture',
      main: MAIN, branch: BRANCH, parent: MAIN, prerequisite: PREREQUISITE, priorH1: 'bee3a6908b36e23c826e1fde00d461b426c75992',
      runtime: { node: process.version, chrome: await browser.version(), modelHz: 60, nativeWidth: 640, nativeHeight: 640, dpr: 1 },
      threshold: { minimumValidRatio: 0.9, minimumSeparationPx: 12 },
      selectedRule: result.summary.relocation.transform, accepted: result.summary.relocation.accepted,
      summary: result.summary, controllerTransform, sourceHashes };
    await mkdir(OUTPUT, { recursive: true });
    await writeFile(resolve(OUTPUT, 'preflight.json'), `${JSON.stringify(preflight, null, 2)}\n`);
    await writeFile(resolve(OUTPUT, 'preflight-contacts.jsonl'), `${result.contacts.map(row => JSON.stringify(row)).join('\n')}\n`);
    await writeFile(resolve(OUTPUT, 'parity-anchors.json'), `${JSON.stringify(result.anchors, null, 2)}\n`);
    console.log(JSON.stringify({ status: preflight.status, selectedRule: result.summary.relocation.transform,
      valid: `${result.summary.relocation.validCount}/${result.summary.relocation.sourceCount}`,
      validRatio: result.summary.relocation.validRatio, elapsedSeconds: result.summary.elapsedSeconds }));
  } finally {
    await browser?.close();
    await server.close();
  }
}

await main();
