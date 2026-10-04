import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { resolve } from 'node:path';
import { createServer, build, preview } from 'vite';
import { chromium } from 'playwright';

const useProduction = process.env.CHECK_PRODUCTION === '1' || process.argv.includes('--production');
let server;
let browser;

const probeSource = `
(() => {
  const probe = window.__physicalAudioProbe = {
    audioContexts: [], contextCloseCalls: 0, worklets: [], processorErrors: 0, workletModules: [],
    pcmRms: [], workletRms: [], gl: { contexts: 0, deletedBuffers: 0, deletedPrograms: 0 },
    canvasListenersAdded: 0, canvasListenersRemoved: 0,
    rafScheduled: 0, rafCanceled: 0, liveRaf: new Set()
  };
  const OriginalAudioContext = window.AudioContext;
  window.AudioContext = class extends OriginalAudioContext {
    constructor(...args) {
      super(...args); probe.audioContexts.push(this);
      const audioWorklet = this.audioWorklet;
      if (audioWorklet && !audioWorklet.__physicalProbeWrapped) {
        const addModule = audioWorklet.addModule.bind(audioWorklet);
        audioWorklet.addModule = (url, ...moduleOptions) => {
          const record = { url: String(url), loaded: false };
          probe.workletModules.push(record);
          return addModule(url, ...moduleOptions).then(value => { record.loaded = true; return value; });
        };
        audioWorklet.__physicalProbeWrapped = true;
      }
    }
    async close() {
      probe.contextCloseCalls += 1;
      for (const worklet of probe.worklets) if (worklet.context === this) clearInterval(worklet.timer);
      return super.close();
    }
  };

  const OriginalAudioWorkletNode = window.AudioWorkletNode;
  if (OriginalAudioWorkletNode) {
    window.AudioWorkletNode = new Proxy(OriginalAudioWorkletNode, {
      construct(Target, args) {
        const node = Reflect.construct(Target, args);
        const context = args[0];
        const record = { name: args[1], context, node, portCloses: 0, rms: 0, timer: null };
        probe.worklets.push(record);
        node.addEventListener('processorerror', () => { probe.processorErrors += 1; });
        const close = node.port.close.bind(node.port);
        node.port.close = () => { record.portCloses += 1; clearInterval(record.timer); return close(); };
        try {
          const analyser = context.createAnalyser();
          analyser.fftSize = 2048;
          const silent = context.createGain();
          silent.gain.value = 0;
          node.connect(analyser);
          analyser.connect(silent);
          silent.connect(context.destination);
          const samples = new Float32Array(analyser.fftSize);
          record.timer = setInterval(() => {
            if (context.state === 'closed') return;
            analyser.getFloatTimeDomainData(samples);
            let energy = 0;
            for (const value of samples) energy += value * value;
            record.rms = Math.sqrt(energy / samples.length);
            probe.workletRms.push({ name: record.name, rms: record.rms });
          }, 40);
        } catch (error) { record.probeError = String(error); }
        return node;
      }
    });
  }

  if (window.AudioBufferSourceNode) {
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args) {
      const data = this.buffer?.getChannelData(0);
      if (data?.length) {
        let energy = 0;
        for (const value of data) energy += value * value;
        probe.pcmRms.push(Math.sqrt(energy / data.length));
      }
      return start.apply(this, args);
    };
  }

  const canvasGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    if (this.id === 'simulation-canvas' && (type === 'webgl' || type === 'webgl2')) probe.gl.contexts += 1;
    return canvasGetContext.call(this, type, ...args);
  };
  const gl = window.WebGLRenderingContext?.prototype;
  if (gl) {
    for (const [method, key] of [['deleteBuffer', 'deletedBuffers'], ['deleteProgram', 'deletedPrograms']]) {
      const original = gl[method];
      if (original) gl[method] = function(...args) { probe.gl[key] += 1; return original.apply(this, args); };
    }
  }

  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function(type, ...args) {
    if (this instanceof HTMLCanvasElement && this.id === 'simulation-canvas' && type.startsWith('pointer')) probe.canvasListenersAdded += 1;
    return add.call(this, type, ...args);
  };
  EventTarget.prototype.removeEventListener = function(type, ...args) {
    if (this instanceof HTMLCanvasElement && this.id === 'simulation-canvas' && type.startsWith('pointer')) probe.canvasListenersRemoved += 1;
    return remove.call(this, type, ...args);
  };

  const raf = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => {
    let id;
    id = raf(time => { probe.liveRaf.delete(id); callback(time); });
    probe.liveRaf.add(id); probe.rafScheduled += 1; return id;
  };
  window.cancelAnimationFrame = id => {
    if (probe.liveRaf.delete(id)) probe.rafCanceled += 1;
    return cancel(id);
  };
})();
`;

async function reservePort() {
  const probe = createTcpServer();
  await new Promise((resolvePromise, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolvePromise);
  });
  const port = probe.address().port;
  await new Promise((resolvePromise, reject) => probe.close(error => error ? reject(error) : resolvePromise()));
  return port;
}

async function startServer() {
  const port = await reservePort();
  if (useProduction) {
    await build();
    server = await preview({ preview: { host: '127.0.0.1', port, strictPort: true } });
  } else {
    server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
    await server.listen();
  }
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object', 'Vite bound an ephemeral local port');
  return `http://127.0.0.1:${address.port}/`;
}

async function setControl(page, path, value) {
  const selector = `[data-path="${path}"]`;
  await page.locator(selector).evaluate((input, nextValue) => {
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForFunction(({ path, value }) => {
    const state = JSON.parse(document.querySelector('#state-json').textContent);
    const actual = path.split('.').reduce((current, key) => current?.[key], state);
    return String(actual) === String(value);
  }, { path, value });
}

async function readState(page) {
  return page.locator('#state-json').evaluate(element => JSON.parse(element.textContent));
}

async function waitForModel(page, name) {
  await page.locator(`[data-model="${name}"]`).click();
  await page.waitForFunction(model => document.querySelector('#state-json').textContent.includes(`"model": "${model}"`), name);
  await page.locator('#simulation-canvas').waitFor({ state: 'attached' });
  await page.locator(`#experiment[data-model-view="${name}"]`).waitFor({ state: 'visible' });
}

async function verifyDocumentPresentation(page) {
  const presentation = await page.evaluate(() => {
    const rgb = value => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
    const background = getComputedStyle(document.body).backgroundColor;
    const [red, green, blue] = rgb(background);
    const article = document.querySelector('#experiment');
    const articleStyle = getComputedStyle(article);
    const nav = document.querySelector('nav[aria-label]');
    const buttons = [...nav.querySelectorAll('button[data-model]')];
    return {
      background,
      lightBackground: red > 225 && green > 225 && blue > 225,
      h1Count: document.querySelectorAll('h1').length,
      navCount: Boolean(nav),
      modelButtons: buttons.length,
      modelName: article?.dataset.modelView,
      currentButtonPressed: buttons.some(button => button.getAttribute('aria-pressed') === 'true'),
      titleHeading: article?.querySelector('h2')?.textContent.trim(),
      articleGradient: /gradient\(/i.test(articleStyle.backgroundImage),
      articleShadow: articleStyle.boxShadow !== 'none',
      articleRadius: articleStyle.borderRadius,
      canvasCount: article?.querySelectorAll('canvas#simulation-canvas').length,
      controls: [...article.querySelectorAll('[data-path]')].map(input => ({
        tag: input.tagName.toLowerCase(),
        type: input.type || '',
        associatedLabel: Boolean(input.labels?.length)
      }))
    };
  });
  assert.ok(presentation.lightBackground, `body background is light: ${presentation.background}`);
  assert.equal(presentation.h1Count, 1, 'document has one primary heading');
  assert.ok(presentation.navCount, 'model selection uses a labeled nav');
  assert.equal(presentation.modelButtons, 4, 'all model choices remain available');
  assert.ok(presentation.currentButtonPressed, 'selected native model button exposes aria-pressed');
  assert.ok(presentation.titleHeading, 'the active experiment has a semantic heading');
  assert.equal(presentation.articleGradient, false, 'experiment has no gradient background');
  assert.equal(presentation.articleShadow, false, 'experiment has no dashboard shadow');
  assert.ok(presentation.articleRadius === '0px' || presentation.articleRadius === '0%',
    `experiment wrapper has square document-like edges: ${presentation.articleRadius}`);
  assert.equal(presentation.canvasCount, 1, 'the simulation remains the primary experiment canvas');
  if (presentation.modelName !== 'ant') assert.ok(presentation.controls.length > 0, 'active experiment exposes its controls');
  assert.ok(presentation.controls.every(control => control.associatedLabel), 'every parameter has a native label');
  assert.ok(presentation.controls.every(control => control.tag === 'input' || control.tag === 'select'),
    'parameters use native form controls');
}

async function verifyModelSemantics(page, name) {
  const actual = await page.evaluate(() => ({
    legends: [...document.querySelectorAll('#experiment fieldset')].map(fieldset => fieldset.querySelector('legend')?.textContent.trim()),
    analysisHeaders: [...document.querySelectorAll('#analysis th')].map(cell => cell.textContent.trim()),
    notes: [...document.querySelectorAll('#model-notes, #state-details')].map(element => element.tagName.toLowerCase()),
    inspectorVisible: Boolean(document.querySelector('#string-inspector') && !document.querySelector('#string-inspector').hidden),
    tableRows: document.querySelectorAll('#analysis tbody tr').length
  }));
  if (name === 'ant') assert.equal(actual.legends.length, 0, 'ANT has no retired playback control fieldset');
  else assert.ok(actual.legends.length > 0 && actual.legends.every(Boolean), 'control groups have descriptive native legends');
  assert.ok(actual.analysisHeaders.length > 0 && actual.tableRows > 0, 'analysis uses a semantic table');
  assert.deepEqual(actual.notes, ['details', 'details'], 'model notes and JSON state use native details');
  assert.equal(actual.inspectorVisible, name === 'string', 'String inspector visibility follows the selected model');
  if (name === 'string') {
    assert.ok(await page.locator('#string-inspector h3').count(), 'String inspector has its own heading');
    assert.ok(await page.locator('#buffer-metrics tbody tr').count() > 0, 'buffer metrics render in a table');
    await page.locator('#string-pattern').waitFor({ state: 'attached' });
  }
  if (name === 'plate') await page.locator('#pickup-settings').waitFor({ state: 'attached' });
  if (name === 'sphere') await page.locator('#sphere-excitation').waitFor({ state: 'attached' });
}

async function readCanvasFrame(page) {
  return page.locator('#simulation-canvas').evaluate(canvas => canvas.toDataURL());
}

async function readAntAnalysis(page) {
  return page.locator('#analysis tbody').evaluate(tbody => [...tbody.rows].map(row => row.textContent.trim()));
}

async function readAntPopulation(page) {
  return page.locator('#analysis tbody').evaluate(tbody => {
    const row = [...tbody.rows].find(item => /population|agents|개체/i.test(item.cells[0]?.textContent || ''));
    return Number((row?.cells[row.cells.length - 1]?.textContent || '').replace(/[^\d.-]/g, ''));
  });
}

async function verifyAnt(page, requestedUrls) {
  await waitForModel(page, 'ant');
  await verifyDocumentPresentation(page);
  await verifyModelSemantics(page, 'ant');

  const state = await readState(page);
  assert.equal(state.model, 'ant');
  assert.equal(state.population.count, 28, 'ANT retains the default target population');
  assert.equal(state.pheromone.halfLifeSeconds, 3, 'ANT uses the tuned pheromone half-life');
  assert.equal(state.pheromone.radius, .0045, 'ANT uses the tuned deposit radius');
  assert.equal(await page.locator('#ant-playback').count(), 0, 'ANT has no obsolete loop/release controls');
  assert.equal(await page.locator('[data-action="ant-loop"], [data-action="ant-release"]').count(), 0,
    'ANT has no obsolete playback actions');
  assert.equal(await page.evaluate(() => typeof window.setup === 'undefined'
    && typeof window.draw === 'undefined' && typeof window.circle === 'undefined'), true,
  'p5 runs in instance mode without global sketch functions');
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.audioContexts.length), 0,
    'ANT does not initialize Web Audio');
  assert.equal(requestedUrls.some(url => /p5[./-]sound/i.test(url)), false,
    'ANT does not load p5.sound');

  const initialPopulation = await readAntPopulation(page);
  assert.ok(initialPopulation >= 1 && initialPopulation < state.population.count,
    'ANT begins below its target population and does not spawn all agents at once');
  const initialFrame = await readCanvasFrame(page);
  const initialAnalysis = await readAntAnalysis(page);
  assert.ok(initialAnalysis.some(row => /population|agents|개체/i.test(row)), 'analysis reports population');
  assert.ok(initialAnalysis.some(row => /mean speed|평균 속도/i.test(row)), 'analysis reports mean speed');
  const initialMass = initialAnalysis.find(row => /pheromone|페로몬/i.test(row));
  assert.ok(initialMass, 'analysis reports pheromone mass');
  await page.waitForTimeout(900);
  const activeFrame = await readCanvasFrame(page);
  assert.notEqual(activeFrame, initialFrame, 'ANT agents continue moving in the active simulation');
  await page.waitForFunction(initial => {
    const rows = [...document.querySelectorAll('#analysis tbody tr')];
    const row = rows.find(item => /population|agents|개체/i.test(item.cells[0]?.textContent || ''));
    const value = Number((row?.cells[row.cells.length - 1]?.textContent || '').replace(/[^\d.-]/g, ''));
    return value > initial;
  }, initialPopulation, { timeout: 5000 });
  const activeAnalysis = await readAntAnalysis(page);
  const activeMass = activeAnalysis.find(row => /pheromone|페로몬/i.test(row));
  assert.notEqual(activeMass, initialMass, 'active simulation updates pheromone mass');
  const activePopulation = await readAntPopulation(page);
  assert.ok(activePopulation > initialPopulation, 'simulation-time spawns gradually grow the population');
  assert.ok(activePopulation < state.population.count, 'population remains below target during startup');
  assert.ok(activeAnalysis.find(row => /mean speed|평균 속도/i.test(row)), 'mean speed remains visible');
  if (!useProduction) {
    const summary = await page.evaluate(async () => {
      const { app } = await import('/src/main.js');
      const snapshot = app.lab.model.getSnapshot();
      return {
        status: snapshot.status,
        agents: snapshot.agents.length,
        radii: [...new Set(snapshot.agents.map(agent => agent.radius))],
        pheromoneIsFloat32: snapshot.pheromone.values instanceof Float32Array,
        pheromoneSize: snapshot.pheromone.values.length,
        pheromoneGridSize: snapshot.pheromone.width * snapshot.pheromone.height,
        totalMass: snapshot.pheromone.totalMass,
        meanSpeed: snapshot.analysis.meanSpeed
      };
    });
    assert.equal(summary.status, 'active');
    assert.ok(summary.agents >= activePopulation && summary.agents < state.population.count,
      'the live population keeps growing gradually between UI and snapshot reads');
    assert.equal(summary.radii.length, 1, 'agents share one body radius');
    assert.equal(summary.pheromoneIsFloat32, true);
    assert.ok(summary.pheromoneGridSize > 0 && summary.pheromoneSize === summary.pheromoneGridSize,
      'pheromone field values match its configured grid');
    assert.ok(Number.isFinite(summary.totalMass) && summary.totalMass > 0);
    assert.ok(Number.isFinite(summary.meanSpeed));
  }
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.liveRaf.size), 1,
    'ANT uses the single application animation frame');
  assert.equal(await page.locator('#scene canvas').count(), 1, 'ANT mounts one canvas');
  await verifyMobileLayout(page, 'ant');
  if (!useProduction) {
    await page.evaluate(async () => {
      const { app } = await import('/src/main.js');
      const model = app.lab.model;
      for (let step = 0; step < 40 * 60; step += 1) model.tick(1 / 60);
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'test-results/ant-matured.png', fullPage: true });
  } else {
    await page.screenshot({ path: 'test-results/ant-production.png', fullPage: true });
  }

  if (!useProduction) {
    await page.evaluate(async () => {
      const { app } = await import('/src/main.js');
      window.__oldAntController = app.lab.model;
    });
  }
  await waitForModel(page, 'string');
  assert.equal(await page.locator('#scene canvas').count(), 1, 'switching away leaves one current canvas');
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.liveRaf.size), 1,
    'switching away cancels the old render loop before starting the next one');
  if (!useProduction) {
    assert.equal(await page.evaluate(() => window.__oldAntController.destroyed), true,
      'switching away destroys the ANT controller');
    await page.evaluate(() => { delete window.__oldAntController; });
  }
}

async function verifyMobileLayout(page, filename) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport,
    `mobile document has no horizontal overflow (${dimensions.document}px > ${dimensions.viewport}px)`);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: `test-results/${filename}-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function clickCanvas(page, xRatio, yRatio) {
  const canvas = page.locator('#simulation-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  assert.ok(bounds, 'simulation canvas has layout bounds');
  await page.mouse.click(bounds.x + bounds.width * xRatio, bounds.y + bounds.height * yRatio);
}

async function verifyBrowser(baseUrl) {
  const chromePath = process.env.BROWSER_EXECUTABLE_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const launch = { headless: true };
  if (existsSync(chromePath)) launch.executablePath = chromePath;
  browser = await chromium.launch(launch);
  const page = await browser.newPage();
  const consoleErrors = [], pageErrors = [], failedRequests = [], requestedUrls = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('request', request => requestedUrls.push(request.url()));
  await page.addInitScript(probeSource);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  if (useProduction) {
    await page.waitForFunction(() => document.querySelector('#state-json')?.textContent.includes('"model": "string"'));
  } else {
    await page.evaluate(async () => { const { app } = await import('/src/main.js'); await app.ready; });
  }
  await page.locator('#simulation-canvas').waitFor({ state: 'visible' });

  assert.equal((await readState(page)).model, 'string');
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.audioContexts.length), 0,
    'initial String selection does not initialize Web Audio before interaction');
  await verifyAnt(page, requestedUrls);
  assert.equal((await readState(page)).model, 'string', 'ANT verification returns to the String instrument');
  await verifyDocumentPresentation(page);
  await verifyModelSemantics(page, 'string');
  await verifyMobileLayout(page, 'string');
  await setControl(page, 'physical.frequency', 330);
  await setControl(page, 'duration', .5);
  await page.locator('[data-action="step"]').click();
  await page.locator('[data-action="cycle"]').click();
  await page.locator('[data-action="generate-pattern"]').click();
  const notes = await page.locator('#pattern-notes').textContent();
  assert.match(notes, /1\./, 'String pattern status remains available to screen readers and existing consumers');
  assert.equal(await page.locator('#pattern-steps tr').count(), 8, 'String pattern generator renders eight table rows');
  await page.locator('[data-action="play-pattern"]').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('재생'));
  await page.locator('[data-action="stop-pattern"]').click();
  await page.locator('[data-action="strike"]').click();
  await page.waitForFunction(() => window.__physicalAudioProbe.pcmRms.some(rms => rms > 1e-5));
  await page.locator('[data-action="stop"]').click();
  await page.waitForFunction(() => window.__physicalAudioProbe.audioContexts.length === 1
    && window.__physicalAudioProbe.audioContexts[0].state === 'running');

  await waitForModel(page, 'plate');
  await verifyDocumentPresentation(page);
  await verifyModelSemantics(page, 'plate');
  await verifyMobileLayout(page, 'plate');
  await setControl(page, 'quality', 'high');
  await setControl(page, 'physical.stiffness', 1.05);
  const pickupButton = page.locator('[data-action="pickup"]');
  await pickupButton.click();
  await clickCanvas(page, .7, .45);
  const movedPickup = (await readState(page)).pickup.position;
  assert.notDeepEqual(movedPickup, { x: .28, y: -.18 }, 'plate pickup can be moved independently');
  await pickupButton.click();
  await page.locator('[data-action="strike"]').click();
  await page.waitForFunction(() => window.__physicalAudioProbe.worklets.some(item => item.name === 'plate-processor'));
  await page.waitForFunction(() => window.__physicalAudioProbe.workletRms.some(item => item.name === 'plate-processor' && item.rms > 1e-7), null, { timeout: 8000 });
  assert.deepEqual((await readState(page)).pickup.position, movedPickup, 'plate strike leaves pickup unchanged');
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/plate.png', fullPage: true });

  await waitForModel(page, 'sphere');
  await verifyDocumentPresentation(page);
  await verifyModelSemantics(page, 'sphere');
  await verifyMobileLayout(page, 'sphere');
  await setControl(page, 'physical.material', 'aluminum6061');
  await setControl(page, 'physical.diameter', 2.5);
  await setControl(page, 'quality', 'high');
  await page.locator('[data-action="strike"]').click();
  await page.waitForFunction(() => window.__physicalAudioProbe.worklets.some(item => item.name === 'sphere-processor'));
  await page.waitForFunction(() => window.__physicalAudioProbe.workletRms.some(item => item.name === 'sphere-processor' && item.rms > 1e-7), null, { timeout: 8000 });
  await page.locator('[data-action="pickup"]').click();
  await clickCanvas(page, .5, .5);
  const sphereState = await readState(page);
  assert.equal(sphereState.physical.material, 'aluminum6061');
  assert.equal(sphereState.physical.diameter, 2.5);
  assert.equal(Math.round(Math.hypot(...Object.values(sphereState.pickup.position)) * 1e6), 1000000,
    'sphere pickup stays normalized to the surface');
  await page.locator('[data-action="pickup"]').click();
  const sphereCanvas = page.locator('#simulation-canvas');
  await sphereCanvas.scrollIntoViewIfNeeded();
  const sphereBounds = await sphereCanvas.boundingBox();
  await page.mouse.move(sphereBounds.x + sphereBounds.width * .35, sphereBounds.y + sphereBounds.height * .5);
  await page.mouse.down();
  await page.mouse.move(sphereBounds.x + sphereBounds.width * .55, sphereBounds.y + sphereBounds.height * .45, { steps: 4 });
  await page.mouse.up();
  await page.locator('[data-action="strike"]').click();
  const rotatedState = await readState(page);
  assert.notDeepEqual(rotatedState.excitation.position, sphereState.excitation.position,
    'sphere drag changes the local point under the center strike');
  assert.deepEqual(rotatedState.pickup.position, sphereState.pickup.position,
    'sphere rotation and strikes leave the independent pickup fixed in local coordinates');
  await page.screenshot({ path: 'test-results/sphere.png', fullPage: true });
  await page.waitForFunction(() => window.__physicalAudioProbe.workletRms.length > 0);

  const beforeSwitch = await page.evaluate(() => ({
    portCloses: window.__physicalAudioProbe.worklets.reduce((sum, item) => sum + item.portCloses, 0),
    deletedBuffers: window.__physicalAudioProbe.gl.deletedBuffers,
    deletedPrograms: window.__physicalAudioProbe.gl.deletedPrograms,
    listenersAdded: window.__physicalAudioProbe.canvasListenersAdded,
    listenersRemoved: window.__physicalAudioProbe.canvasListenersRemoved,
    rafCanceled: window.__physicalAudioProbe.rafCanceled
  }));
  await waitForModel(page, 'string');
  const afterSwitch = await page.evaluate(() => ({
    portCloses: window.__physicalAudioProbe.worklets.reduce((sum, item) => sum + item.portCloses, 0),
    deletedBuffers: window.__physicalAudioProbe.gl.deletedBuffers,
    deletedPrograms: window.__physicalAudioProbe.gl.deletedPrograms,
    listenersAdded: window.__physicalAudioProbe.canvasListenersAdded,
    listenersRemoved: window.__physicalAudioProbe.canvasListenersRemoved,
    rafCanceled: window.__physicalAudioProbe.rafCanceled
  }));
  assert.ok(afterSwitch.portCloses > beforeSwitch.portCloses, 'old worklet port closes on model switch');
  assert.ok(afterSwitch.deletedBuffers > beforeSwitch.deletedBuffers, 'SphereRenderer deletes geometry buffers');
  assert.ok(afterSwitch.deletedPrograms > beforeSwitch.deletedPrograms, 'SphereRenderer deletes shader programs');
  assert.equal(afterSwitch.listenersRemoved - beforeSwitch.listenersRemoved,
    beforeSwitch.listenersAdded - beforeSwitch.listenersRemoved,
    'all Sphere canvas pointer listeners are removed when switching');
  assert.ok(afterSwitch.rafCanceled > beforeSwitch.rafCanceled, 'the old render animation frame is canceled');

  await waitForModel(page, 'plate');
  await waitForModel(page, 'sphere');
  await waitForModel(page, 'string');
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: resolve('test-results/lab.png'), fullPage: true });
  await waitForModel(page, 'ant');
  if (!useProduction) {
    await page.evaluate(async () => {
      const { app } = await import('/src/main.js');
      window.__finalAntController = app.lab.model;
    });
  }
  if (useProduction) {
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForFunction(() => window.__physicalAudioProbe.contextCloseCalls === 1
      && document.querySelector('#scene').children.length === 0);
  } else {
    await page.evaluate(async () => {
      const { app } = await import('/src/main.js');
      await app.destroy();
    });
  }
  if (!useProduction) {
    assert.equal(await page.evaluate(() => window.__finalAntController.destroyed), true,
      'destroying the app while ANT is active destroys the controller');
    await page.evaluate(() => { delete window.__finalAntController; });
  }
  const modelAfterDestroy = useProduction ? undefined : await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    return app.lab.model;
  });
  const appResult = await page.evaluate(model => ({
      model,
      sceneChildren: document.querySelector('#scene').children.length,
      activeSceneCanvases: document.querySelectorAll('#scene canvas').length,
      simulationCanvases: document.querySelectorAll('canvas#simulation-canvas').length,
      p5Canvases: document.querySelectorAll('canvas.p5Canvas').length,
      contextStates: window.__physicalAudioProbe.audioContexts.map(context => context.state),
      closeCalls: window.__physicalAudioProbe.contextCloseCalls,
      unclosedPorts: window.__physicalAudioProbe.worklets.filter(item => item.portCloses === 0).length,
      processorErrors: window.__physicalAudioProbe.processorErrors,
      activeRaf: window.__physicalAudioProbe.liveRaf.size
  }), modelAfterDestroy);
  if (!useProduction) assert.equal(appResult.model, null);
  assert.equal(appResult.sceneChildren, 0);
  assert.equal(appResult.activeSceneCanvases, 0);
  assert.equal(appResult.simulationCanvases, 0, 'ANT canvas is removed from the document');
  assert.equal(appResult.p5Canvases, 0, 'p5 canvas is not left behind outside the scene');
  assert.ok(appResult.contextStates.every(state => state === 'closed'));
  assert.equal(appResult.closeCalls, 1);
  assert.equal(appResult.unclosedPorts, 0);
  assert.equal(appResult.processorErrors, 0);
  assert.equal(appResult.activeRaf, 0);
  const workletModules = await page.evaluate(() => window.__physicalAudioProbe.workletModules);
  for (const filename of ['plate.worklet.js', 'sphere.worklet.js']) {
    assert.ok(workletModules.some(module => module.loaded
      && new URL(module.url, baseUrl).pathname.endsWith(`/worklets/${filename}`)),
    `worklet URL loads successfully: ${filename}`);
  }
  await page.waitForTimeout(100);

  assert.deepEqual(consoleErrors, [], `browser console errors: ${consoleErrors.join('\n')}`);
  assert.deepEqual(pageErrors, [], `uncaught page errors: ${pageErrors.join('\n')}`);
  assert.deepEqual(failedRequests, [], `failed requests: ${failedRequests.join('\n')}`);
  console.log(`Browser smoke test passed (${useProduction ? 'production preview' : 'Vite dev'}).`);
}

try {
  const baseUrl = await startServer();
  await verifyBrowser(baseUrl);
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (server) {
    if (typeof server.close === 'function') await server.close().catch(() => {});
    else await new Promise(resolve => server.httpServer.close(resolve));
  }
}
