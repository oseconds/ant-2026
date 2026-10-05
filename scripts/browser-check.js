import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
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
    audioContexts: [], contextCloseCalls: 0, worklets: [], gainNodes: [], processorErrors: 0, workletModules: [],
    workletMessages: [], stereoPanners: 0,
    pcmRms: [], workletRms: [], gl: { contexts: 0, deletedBuffers: 0, deletedPrograms: 0 },
    canvasListenersAdded: 0, canvasListenersRemoved: 0,
    rafScheduled: 0, rafCanceled: 0, liveRaf: new Set()
  };
  const OriginalAudioContext = window.AudioContext;
  window.AudioContext = class extends OriginalAudioContext {
    constructor(...args) {
      super(...args); probe.audioContexts.push(this);
      const createGain = this.createGain.bind(this);
      this.createGain = (...gainArgs) => {
        const node = createGain(...gainArgs);
        const record = { index: probe.gainNodes.length, context: this, node, ramps: [] };
        probe.gainNodes.push(record);
        try {
          const linearRamp = node.gain.linearRampToValueAtTime.bind(node.gain);
          node.gain.linearRampToValueAtTime = (value, endTime) => {
            record.ramps.push({ value, endTime, at: performance.now() });
            return linearRamp(value, endTime);
          };
        } catch (error) { record.rampProbeError = String(error); }
        return node;
      };
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
        const nodeOptions = args[2] || {};
        const record = { index: probe.worklets.length, name: args[1], context, node, portCloses: 0, messagesAfterClose: 0,
          outputChannelCount: [...(nodeOptions.outputChannelCount || [])], processorOptions: nodeOptions.processorOptions || {},
          outputGainNodes: [], rms: 0, leftRms: 0, rightRms: 0, timer: null };
        probe.worklets.push(record);
        node.addEventListener('processorerror', () => { probe.processorErrors += 1; });
        const close = node.port.close.bind(node.port);
        node.port.close = () => { record.portCloses += 1; clearInterval(record.timer); return close(); };
        const postMessage = node.port.postMessage.bind(node.port);
        node.port.postMessage = (message, ...transfer) => {
          if (record.portCloses > 0) record.messagesAfterClose += 1;
          let captured = message;
          try { captured = structuredClone(message); } catch {}
          probe.workletMessages.push({ index: record.index, name: record.name, message: captured, at: performance.now(), closed: record.portCloses > 0 });
          return postMessage(message, ...transfer);
        };
        const connect = node.connect.bind(node);
        node.connect = (destination, ...connectArgs) => {
          if (probe.gainNodes.some(item => item.node === destination)
            && !record.outputGainNodes.includes(destination)) record.outputGainNodes.push(destination);
          return connect(destination, ...connectArgs);
        };
        try {
          const stereo = record.outputChannelCount[0] === 2;
          const analyserSize = 2048;
          const left = context.createAnalyser(), leftSamples = new Float32Array(analyserSize);
          left.fftSize = analyserSize;
          let right = null, rightSamples = null, splitter = null;
          if (stereo) {
            right = context.createAnalyser(); right.fftSize = analyserSize;
            rightSamples = new Float32Array(analyserSize);
            splitter = context.createChannelSplitter(2);
            node.connect(splitter);
            splitter.connect(left, 0);
            splitter.connect(right, 1);
          } else node.connect(left);
          for (const analyser of [left, ...(right ? [right] : [])]) {
            const silent = context.createGain();
            silent.gain.value = 0;
            analyser.connect(silent);
            silent.connect(context.destination);
          }
          record.timer = setInterval(() => {
            if (context.state === 'closed') return;
            const rms = samples => {
              let energy = 0;
              for (const value of samples) energy += value * value;
              return Math.sqrt(energy / samples.length);
            };
            left.getFloatTimeDomainData(leftSamples);
            record.leftRms = rms(leftSamples);
            record.rightRms = 0;
            if (right) { right.getFloatTimeDomainData(rightSamples); record.rightRms = rms(rightSamples); }
            record.rms = stereo ? Math.max(record.leftRms, record.rightRms) : record.leftRms;
            probe.workletRms.push({ index: record.index, name: record.name, rms: record.rms,
              leftRms: record.leftRms, rightRms: record.rightRms });
          }, 40);
        } catch (error) { record.probeError = String(error); }
        return node;
      }
    });
  }

  if (window.AudioContext?.prototype?.createStereoPanner) {
    const createStereoPanner = window.AudioContext.prototype.createStereoPanner;
    window.AudioContext.prototype.createStereoPanner = function(...args) {
      probe.stereoPanners += 1;
      return createStereoPanner.apply(this, args);
    };
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
  assert.equal(await page.locator('h1').textContent(), 'Lab');
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
  if (name === 'ant') {
    assert.equal(actual.analysisHeaders.length, 0, 'ANT diagnostics use a compact line instead of a table');
    assert.equal(actual.tableRows, 0);
    assert.deepEqual(actual.notes, ['details'], 'ANT retains only its collapsed JSON detail');
  } else {
    assert.ok(actual.analysisHeaders.length > 0 && actual.tableRows > 0, 'analysis uses a semantic table');
    assert.deepEqual(actual.notes, ['details', 'details'], 'model notes and JSON state use native details');
  }

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
  return page.locator('#ant-diagnostics').evaluate(element => [element.textContent.trim()]);
}

async function readAntPopulation(page) {
  return page.locator('#ant-diagnostics').evaluate(element => Number(element.textContent.match(/^\s*(\d+)/)?.[1] || 0));
}

async function setAntVolume(page, value) {
  const slider = page.locator('#ant-volume');
  await slider.evaluate((input, nextValue) => {
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForFunction(expected => document.querySelector('#ant-volume')?.value === String(expected)
    && document.querySelector('#ant-volume-value')?.value === `${expected}%`, value);
}

async function readAntAudioVolume(page) {
  return page.evaluate(async production => {
    if (!production) {
      const { app } = await import('/src/main.js');
      return app.lab.model.getSnapshot().audio.volume;
    }
    return Number(document.querySelector('#ant-volume')?.value) / 100;
  }, useProduction);
}

async function assertAntOutputGain(page, volume) {
  const expectedGain = .7 * volume;
  await page.waitForFunction(async ({ production, target }) => {
    if (!production) {
      const { app } = await import('/src/main.js');
      const gain = app.lab.model.audioBridge?.plate?.worklet?.gainNode?.gain?.value;
      return Number.isFinite(gain) && Math.abs(gain - target) < 1e-4;
    }
    return window.__physicalAudioProbe.gainNodes.some(record => record.ramps.some(ramp =>
      Math.abs(ramp.value - target) < 1e-9) && Math.abs(record.node.gain.value - target) < 1e-4);
  }, { production: useProduction, target: expectedGain }, { timeout: 8000 });
  await page.waitForTimeout(60);
  const actualGain = await page.evaluate(async production => {
    if (!production) {
      const { app } = await import('/src/main.js');
      return app.lab.model.audioBridge.plate.worklet.gainNode.gain.value;
    }
    const records = window.__physicalAudioProbe.gainNodes.filter(record => record.ramps.length > 0);
    return records.at(-1)?.node.gain.value;
  }, useProduction);
  assert.ok(Number.isFinite(actualGain));
  assert.ok(Math.abs(actualGain - expectedGain) < 1e-4,
    `ANT output gain is Plate baseline 0.7 × selected volume ${volume} (${actualGain} ≈ ${expectedGain})`);
}

async function runDeterministicTurnoverEvidence(page) {
  return page.evaluate(async () => {
    const { AntController, GaitController } = await import('/src/lib/index.js');
    const seed = 0x20261005;
    let randomState = seed >>> 0;
    const random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 0x100000000;
    };
    const gaitController = new GaitController();
    const model = new AntController({ random, gaitController });
    await model.init();
    let footContactCount = 0, tripodAContactCount = 0, tripodBContactCount = 0;
    let invalidContactCount = 0;
    model.subscribe(({ type, payload }) => {
      if (type !== 'foot-contact') return;
      footContactCount += 1;
      if (payload.contactGroup === 'A') tripodAContactCount += 1;
      if (payload.contactGroup === 'B') tripodBContactCount += 1;
      const inDomain = position => Number.isFinite(position?.x) && Number.isFinite(position?.y)
        && position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1;
      if (payload.type !== 'FOOT_CONTACT' || !inDomain(payload.position)
        || !Array.isArray(payload.contacts) || payload.contacts.length < 1 || payload.contacts.length > 3
        || !payload.contacts.every(contact => inDomain(contact.position))) invalidContactCount += 1;
    });
    const samples = [];
    const spawnEvents = [{ second: 0, id: model.agents[0]?.id }];
    const retirementEvents = [];
    const seenIds = new Set(model.agents.map(agent => agent.id));
    let maxSpawnsInOneTick = 0;
    let firstRetirementField = null;
    const sample = (second) => {
      const snapshot = model.getSnapshot();
      samples.push({
        requestedSeconds: second,
        simulationSeconds: snapshot.analysis.simulationTimeMs / 1000,
        population: snapshot.analysis.population,
        totalSpawned: snapshot.analysis.totalSpawned,
        totalRetired: snapshot.analysis.totalRetired,
        pheromoneMass: snapshot.analysis.pheromoneMass
      });
    };
    sample(0);
    const checkpoints = new Set([5, 10, 20, 40, 60, 120]);
    for (let tick = 1; tick <= 120 * 60; tick += 1) {
      const previousIds = new Set(model.agents.map(agent => agent.id));
      const previousRetired = model.totalRetired;
      const previousSpawned = model.totalSpawned;
      const massBefore = model.field.values.reduce((sum, value) => sum + value, 0);
      const nonzeroCellsBefore = model.field.values.reduce((count, value) => count + (value > 0 ? 1 : 0), 0);
      model.tick(1 / 60);
      const currentIds = new Set(model.agents.map(agent => agent.id));
      const newIds = [...currentIds].filter(id => !seenIds.has(id));
      if (newIds.length) {
        maxSpawnsInOneTick = Math.max(maxSpawnsInOneTick, newIds.length);
        for (const id of newIds) {
          seenIds.add(id);
          const agent = model.agents.find(candidate => candidate.id === id);
          spawnEvents.push({
            second: model.simulationTimeMs / 1000,
            id,
            distanceFromEntrance: agent ? Math.hypot(agent.x - .5, agent.y - .72) : null,
            initialTrailAdherence: agent?.trailAdherence ?? null
          });
        }
      }
      const departed = [...previousIds].filter(id => !currentIds.has(id));
      if (departed.length) {
        retirementEvents.push({
          second: model.simulationTimeMs / 1000,
          ids: departed,
          gaitStateRemoved: departed.every(id => !gaitController.ants.has(id))
        });
        if (!firstRetirementField) {
          firstRetirementField = {
            massBefore: massBefore,
            massAfter: model.field.values.reduce((sum, value) => sum + value, 0),
            nonzeroCellsBefore: nonzeroCellsBefore,
            nonzeroCellsAfter: model.field.values.reduce((count, value) => count + (value > 0 ? 1 : 0), 0)
          };
        }
      }
      if (model.totalRetired < previousRetired || model.totalSpawned - previousSpawned > 1) {
        throw new Error('turnover counters moved backwards or spawned multiple replacements in one tick');
      }
      const seconds = tick / 60;
      if (checkpoints.has(seconds)) sample(seconds);
    }
    const activeIds = new Set(model.agents.map(agent => agent.id));
    const final = model.getSnapshot();
    const spawnIntervals = spawnEvents.slice(2).map((event, index) => event.second - spawnEvents[index + 1].second);
    const result = {
      scenario: 'deterministic standalone AntController run; no forced exits, no audio bridge; default population and field settings',
      seed,
      halfLifeSeconds: model.state.pheromone.halfLifeSeconds,
      populationTarget: model.state.population.count,
      samples,
      spawnEvents: { count: spawnEvents.length, first: spawnEvents.slice(0, 8), last: spawnEvents.slice(-4) },
      retirementEvents: { count: retirementEvents.reduce((count, event) => count + event.ids.length, 0), first: retirementEvents.slice(0, 8) },
      firstRetirementField,
      finalActiveIds: [...activeIds],
      uniqueIdsSeen: seenIds.size,
      footContactCount,
      tripodAContactCount,
      tripodBContactCount,
      invalidContactCount,
      meanSpeed: final.analysis.meanSpeed,
      maxSpawnsInOneTick,
      spawnIntervalsSeconds: spawnIntervals,
      finalAnalysis: final.analysis,
      validations: {
        multipleRetirements: model.totalRetired >= 2,
        replacementsOccur: model.totalSpawned > model.state.population.count,
        fieldPersistsAcrossRetirement: Boolean(firstRetirementField?.massBefore > 0 && firstRetirementField?.massAfter > 0
          && firstRetirementField?.nonzeroCellsAfter > 0),
        replacementIdsAreUnique: seenIds.size === model.totalSpawned,
        gaitStatesRemovedOnExit: retirementEvents.every(event => event.gaitStateRemoved),
        bothTripodsTouchDown: tripodAContactCount > 0 && tripodBContactCount > 0,
        gradualOneAtATime: maxSpawnsInOneTick <= 1 && spawnIntervals.every(interval => interval >= .4 - 1e-9),
        contactsRemainInDomain: invalidContactCount === 0,
        activePopulationWithinTarget: final.analysis.population <= model.state.population.count
      }
    };
    await model.destroy();
    return result;
  });
}

async function verifyAntStatusStates(page) {
  if (useProduction) return;
  await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    app.lab.model.audioBridge._loading = true;
    app.lab.model.emit('update');
  });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Loading audio…'
    && document.querySelector('#status')?.getAttribute('role') === 'status'
    && document.querySelector('#status')?.getAttribute('aria-live') === 'polite');
  await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    app.lab.model.audioBridge._loading = false;
    app.lab.model.audioBridge._error = 'Audio initialization test error';
    app.lab.model.emit('update');
  });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Audio initialization test error'
    && document.querySelector('#status')?.getAttribute('role') === 'alert'
    && document.querySelector('#status')?.getAttribute('aria-live') === 'assertive'
    && document.querySelector('#status')?.dataset.status === 'error');
  await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    app.lab.model.audioBridge._error = null;
    app.lab.model.emit('update');
  });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === ''
    && document.querySelector('#status')?.getAttribute('role') === 'status'
    && document.querySelector('#status')?.getAttribute('aria-live') === 'polite');
}

async function verifyAnt(page, requestedUrls) {
  await waitForModel(page, 'ant');
  await verifyDocumentPresentation(page);
  await verifyModelSemantics(page, 'ant');

  const state = await readState(page);
  assert.equal(state.model, 'ant');
  const navigation = await page.locator('nav button[data-model]').evaluateAll(buttons => buttons.map(button => button.dataset.model));
  assert.deepEqual(navigation, ['ant', 'string', 'plate', 'sphere'], 'navigation starts with ANT and retains all supporting models');
  assert.equal((await page.locator('#model-title').textContent()).trim(), 'ANT');
  assert.equal(await page.locator('#model-description, #interaction-hint, #experiment figcaption, #model-notes, #analysis').count(), 0,
    'ANT hides descriptive prose, figure caption, explanatory notes, and the analysis table');
  assert.equal(await page.locator('#ant-diagnostics').count(), 1);
  assert.equal(await page.locator('#ant-diagnostics').getAttribute('aria-label'), 'Live ANT diagnostics');
  assert.equal(await page.locator('footer').count(), 0, 'the generic footer copy is removed');
  assert.equal(await page.locator('#state-details').evaluate(details => details.open), false,
    'raw JSON stays collapsed in the normal view');
  assert.equal(await page.locator('#state-details summary').textContent(), 'State (JSON)');
  const statusAttributes = await page.locator('#status').evaluate(status => ({
    role: status.getAttribute('role'), live: status.getAttribute('aria-live'), text: status.textContent.trim()
  }));
  assert.equal(statusAttributes.role, 'status');
  assert.equal(statusAttributes.live, 'polite');
  assert.equal(statusAttributes.text, '', 'ANT ready status is visually empty and takes no text space');
  await verifyAntStatusStates(page);
  assert.equal(state.population.count, 28, 'ANT retains the default target population');
  assert.equal(state.pheromone.halfLifeSeconds, 15, 'ANT uses the longer environmental memory');
  assert.equal(state.pheromone.radius, .0045, 'ANT uses the tuned deposit radius');
  assert.equal(await page.locator('#ant-playback').count(), 0, 'ANT has no obsolete loop/release controls');
  assert.equal(await page.locator('[data-action="ant-loop"], [data-action="ant-release"]').count(), 0,
    'ANT has no obsolete playback actions');
  assert.equal(await page.evaluate(() => typeof window.setup === 'undefined'
    && typeof window.draw === 'undefined' && typeof window.circle === 'undefined'), true,
  'p5 runs in instance mode without global sketch functions');
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.audioContexts.length), 0,
    'ANT audio stays uninitialized before its explicit Audio On action');
  assert.equal(await page.locator('[data-action="ant-audio"]').count(), 1,
    'ANT exposes one explicit audio toggle');
  const audioButton = page.locator('[data-action="ant-audio"]');
  assert.equal(await audioButton.getAttribute('aria-pressed'), 'false', 'ANT audio starts off');
  assert.match(await audioButton.textContent(), /Audio Off/i);
  const volumeSlider = page.locator('#ant-volume');
  assert.equal(await volumeSlider.count(), 1, 'ANT exposes one dedicated volume range');
  assert.equal(await volumeSlider.getAttribute('type'), 'range');
  assert.equal(await volumeSlider.getAttribute('min'), '0');
  assert.equal(await volumeSlider.getAttribute('max'), '100');
  assert.equal(await volumeSlider.getAttribute('step'), '1');
  assert.equal(await page.locator('label[for="ant-volume"]').textContent().then(text => text.trim()), 'Volume');
  assert.equal(await volumeSlider.inputValue(), '100', 'ANT volume defaults to 100 percent');
  assert.equal(await page.locator('#ant-volume-value').evaluate(output => output.value), '100%');
  if (!useProduction) {
    const initialAudio = await page.evaluate(async () => {
      const { app } = await import('/src/main.js');
      return app.lab.model.getSnapshot().audio;
    });
    assert.equal(initialAudio.enabled, false);
    assert.equal(initialAudio.loading, false);
    assert.equal(initialAudio.error, null);
    assert.equal(initialAudio.volume, 1);
  }
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.workletModules.length), 0,
    'the explicit ANT audio toggle is off before any audio module loads');
  assert.equal(requestedUrls.some(url => /p5[./-]sound/i.test(url)), false,
    'ANT does not load p5.sound');

  const initialPopulation = await readAntPopulation(page);
  assert.ok(initialPopulation >= 1 && initialPopulation < state.population.count,
    'ANT begins below its target population and does not spawn all agents at once');
  const initialFrame = await readCanvasFrame(page);
  const initialAnalysis = await readAntAnalysis(page);
  assert.match(initialAnalysis[0], /ants/ , 'compact diagnostics reports population');
  assert.match(initialAnalysis[0], /mean speed/, 'compact diagnostics reports mean speed');
  assert.match(initialAnalysis[0], /pheromone/, 'compact diagnostics reports pheromone mass');
  const initialMass = initialAnalysis[0];
  await page.waitForTimeout(900);
  const activeFrame = await readCanvasFrame(page);
  assert.notEqual(activeFrame, initialFrame, 'ANT agents continue moving in the active simulation');
  await page.waitForFunction(initial => {
    const value = Number(document.querySelector('#ant-diagnostics')?.textContent.match(/^\s*(\d+)/)?.[1] || 0);
    return value > initial;
  }, initialPopulation, { timeout: 5000 });
  // Weak exploratory deposits can remain below the UI's two-decimal precision
  // during initial hesitation. Observe an update instead of assuming its timing.
  await page.waitForFunction(initial => {
    const diagnostics = document.querySelector('#ant-diagnostics')?.textContent.trim();
    return Boolean(diagnostics && diagnostics !== initial);
  }, initialMass, { timeout: 5000 });
  const activeAnalysis = await readAntAnalysis(page);
  const activeMass = activeAnalysis.find(row => /pheromone|페로몬/i.test(row));
  assert.notEqual(activeMass, initialMass, 'active simulation updates pheromone mass');
  const activePopulation = await readAntPopulation(page);
  assert.ok(activePopulation > initialPopulation, 'simulation-time spawns gradually grow the population');
  assert.ok(activePopulation < state.population.count, 'population remains below target during startup');
  assert.ok(activeAnalysis.find(row => /mean speed|평균 속도/i.test(row)), 'mean speed remains visible');
  await verifyAntAudioToggle(page, audioButton);
  let progressedAudioMetrics;
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
        meanSpeed: snapshot.analysis.meanSpeed,
        analysis: snapshot.analysis
      };
    });
    assert.equal(summary.status, 'active');
    assert.ok(summary.agents >= activePopulation && summary.agents <= state.population.count,
      'the live population remains within the configured target');
    assert.equal(summary.analysis.totalSpawned, summary.agents + summary.analysis.totalRetired,
      'cumulative spawn and retirement counters reconcile with active population');
    assert.equal(summary.radii.length, 1, 'agents share one body radius');
    assert.equal(summary.pheromoneIsFloat32, true);
    assert.ok(summary.pheromoneGridSize > 0 && summary.pheromoneSize === summary.pheromoneGridSize,
      'pheromone field values match its configured grid');
    assert.ok(Number.isFinite(summary.totalMass) && summary.totalMass > 0);
    assert.ok(Number.isFinite(summary.meanSpeed));

    const turnover = await runDeterministicTurnoverEvidence(page);
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/ant-turnover-dev-metrics.json', `${JSON.stringify(turnover, null, 2)}\n`);
    for (const [name, passed] of Object.entries(turnover.validations)) {
      assert.equal(passed, true, `default turnover evidence: ${name}`);
    }
    assert.ok(turnover.samples.every(sample => sample.population <= state.population.count));
  }
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.liveRaf.size), 1,
    'ANT uses the single application animation frame');
  assert.equal(await page.locator('#scene canvas').count(), 1, 'ANT mounts one canvas');
  await verifyMobileLayout(page, 'ant');
  if (!useProduction) {
    await page.evaluate(async () => {
      const { app } = await import('/src/main.js');
      const model = app.lab.model;
      await model.setAudioEnabled(false);
      for (let step = 0; step < 20 * 60; step += 1) model.tick(1 / 60);
      await model.setAudioEnabled(true);
      model.emit('update');
    });
    await page.waitForFunction(() => {
      const probe = window.__physicalAudioProbe;
      const plate = probe.worklets.filter(item => item.name === 'plate-processor').at(-1);
      return plate && probe.workletMessages.some(item => item.index === plate.index && item.message?.type === 'strike')
        && probe.workletRms.some(item => item.index === plate.index && item.rms > 1e-7);
    }, null, { timeout: 12000 });
    await page.waitForTimeout(200);
    const turnoverCapture = await page.evaluate(async () => {
      const { app } = await import('/src/main.js');
      const snapshot = app.lab.model.getSnapshot();
      const probe = window.__physicalAudioProbe;
      const plate = probe.worklets.filter(item => item.name === 'plate-processor').at(-1);
      const contactEvents = window.__antFootContactEvents || [];
      const contactGroups = contactEvents.reduce((groups, event) => {
        groups[event.contactGroup] = (groups[event.contactGroup] || 0) + 1;
        return groups;
      }, {});
      const contactCountByLeg = contactEvents.flatMap(event => event.contacts.map(contact => contact.legId))
        .reduce((counts, legId) => ({ ...counts, [legId]: (counts[legId] || 0) + 1 }), {});
      const invalidContactEvents = contactEvents.filter(event => !Array.isArray(event.contacts)
        || event.contacts.length < 1 || event.contacts.length > 3
        || event.contacts.some(contact => contact.position.x < 0 || contact.position.x > 1
          || contact.position.y < 0 || contact.position.y > 1));
      const strikes = probe.workletMessages.filter(item => item.index === plate?.index
        && item.message?.type === 'strike');
      const gaitPhases = snapshot.agents.map(agent => agent.gait?.phase);
      return {
        scenario: 'default live ANT app after 20 additional simulated seconds with audio active; existing canvas renderer',
        observedAt: new Date().toISOString(),
        analysis: snapshot.analysis,
        activeAnts: snapshot.agents.length,
        gait: {
          antsWithSixLegs: snapshot.agents.filter(agent => agent.gait?.legs?.length === 6).length,
          finitePhases: gaitPhases.every(Number.isFinite),
          contactEvents: contactEvents.length,
          contactGroups,
          contactsByLeg: contactCountByLeg,
          uniqueContactingAnts: new Set(contactEvents.map(event => event.antId)).size,
          invalidContactEvents: invalidContactEvents.length
        },
        pheromone: {
          halfLifeSeconds: snapshot.state.pheromone.halfLifeSeconds,
          radius: snapshot.state.pheromone.radius,
          amountPerUnitDistance: snapshot.state.pheromone.amountPerUnitDistance,
          reinforcementGain: snapshot.state.pheromone.reinforcementGain,
          grid: [snapshot.pheromone.width, snapshot.pheromone.height],
          totalMass: snapshot.pheromone.totalMass,
          maxValue: snapshot.pheromone.maxValue
        },
        audio: {
          enabled: snapshot.audio.enabled,
          volumePercent: Math.round(snapshot.audio.volume * 100),
          outputChannels: plate?.outputChannelCount,
          pickupPositions: plate?.processorOptions?.stereoPickups,
          plateStrikes: strikes.length,
          peakPcmRms: Math.max(0, ...probe.workletRms.filter(item => item.index === plate?.index).map(item => item.rms))
        }
      };
    });
    assert.equal(turnoverCapture.gait.antsWithSixLegs, turnoverCapture.activeAnts,
      'the live renderer snapshot contains articulated six-leg gaits');
    assert.ok(turnoverCapture.gait.contactEvents > 0 && turnoverCapture.gait.uniqueContactingAnts > 0,
      'natural movement generates tripod contact events');
    assert.ok(turnoverCapture.gait.contactGroups.A > 0 && turnoverCapture.gait.contactGroups.B > 0,
      'both tripod groups occur in the live simulation');
    assert.equal(turnoverCapture.gait.invalidContactEvents, 0, 'all live foot contacts stay in the ANT domain');
    assert.ok(turnoverCapture.audio.enabled && turnoverCapture.audio.plateStrikes > 0,
      'live tripod contacts reach the shared Plate while the screenshot audio is on');
    await writeFile('test-results/ant-gait-dev-metrics.json', `${JSON.stringify(turnoverCapture, null, 2)}\n`);
    await writeFile('test-results/ant-turnover-dev-capture.json', `${JSON.stringify(turnoverCapture, null, 2)}\n`);
    await page.screenshot({ path: 'test-results/ant-gait-dev.png', fullPage: true });
  } else {
    await page.waitForTimeout(30000);
    const turnoverCapture = await page.evaluate(() => ({
      scenario: 'default live production ANT app after an additional approximately 30 seconds of wall-clock RAF progression',
      observedAt: new Date().toISOString(),
      diagnostics: document.querySelector('#ant-diagnostics')?.textContent.trim() || null,
      audioEnabled: document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'true'
    }));
    await writeFile('test-results/ant-gait-production-metrics.json', `${JSON.stringify(turnoverCapture, null, 2)}\n`);
    await writeFile('test-results/ant-turnover-production-metrics.json', `${JSON.stringify(turnoverCapture, null, 2)}\n`);
    await page.screenshot({ path: 'test-results/ant-gait-production.png', fullPage: true });
  }
  progressedAudioMetrics = await page.evaluate(production => {
    const probe = window.__physicalAudioProbe;
    const records = probe.worklets.filter(item => item.name === 'plate-processor');
    const currentStereoWorklet = records.at(-1);
    const stereoSamples = probe.workletRms.filter(item => item.index === currentStereoWorklet?.index);
    let simulationSeconds = null;
    if (!production && window.__antAudioController) {
      simulationSeconds = window.__antAudioController.getSnapshot().analysis.simulationTimeMs / 1000;
    }
    return {
      phase: 'after progressed ANT screenshot, before model switch',
      simulationSeconds: production ? { approximate: 30, basis: 'additional live RAF progression wait; earlier startup time excluded' }
        : { exact: simulationSeconds },
      contextCount: probe.audioContexts.length,
      contextState: probe.audioContexts[0]?.state,
      selectedVolumePercent: Number(document.querySelector('#ant-volume')?.value),
      effectiveOutputGainTarget: probe.gainNodes.flatMap(record => record.ramps.map(ramp => ramp.value)).at(-1) ?? null,
      stereo: {
        outputChannelCount: currentStereoWorklet?.outputChannelCount,
        pickupPositions: currentStereoWorklet?.processorOptions?.stereoPickups,
        outputGainNodeCount: currentStereoWorklet?.outputGainNodes.length,
        leftPeakRms: Math.max(0, ...stereoSamples.map(item => item.leftRms || 0)),
        rightPeakRms: Math.max(0, ...stereoSamples.map(item => item.rightRms || 0)),
        maxChannelDifference: Math.max(0, ...stereoSamples.map(item => Math.abs((item.leftRms || 0) - (item.rightRms || 0))))
      },
      loadedPlateWorkletModules: probe.workletModules.filter(item => item.loaded && /plate\.worklet\.js(?:$|\?)/.test(item.url)).length,
      processorErrors: probe.processorErrors,
      plateWorklets: records.map(record => ({
        index: record.index,
        portCloses: record.portCloses,
        messagesAfterClose: record.messagesAfterClose,
        strikes: probe.workletMessages.filter(item => item.index === record.index && item.message?.type === 'strike').length,
        peakPcmRms: Math.max(0, ...probe.workletRms.filter(item => item.index === record.index).map(item => item.rms))
      }))
    };
  }, useProduction);

  if (!useProduction) {
    await page.evaluate(async () => {
      const { app } = await import('/src/main.js');
      window.__oldAntController = app.lab.model;
    });
  }
  const antAudioBeforeSwitch = await page.evaluate(() => {
    const probe = window.__physicalAudioProbe;
    window.__antAudioSwitchController = window.__antAudioController;
    window.__antAudioSwitchRecordIndex = probe.worklets.map(item => item.name).lastIndexOf('plate-processor');
    return { index: window.__antAudioSwitchRecordIndex };
  });
  assert.ok(antAudioBeforeSwitch.index >= 0, 'the re-enabled ANT Plate worklet is present before switching away');
  await waitForModel(page, 'string');
  await page.waitForFunction(index => {
    const record = window.__physicalAudioProbe.worklets[index];
    return record && record.portCloses > 0;
  }, antAudioBeforeSwitch.index);
  const strikesAtSwitchClose = await page.evaluate(() => window.__physicalAudioProbe.workletMessages.filter(item =>
    item.name === 'plate-processor' && item.message?.type === 'strike').length);
  await page.waitForTimeout(180);
  const afterAntAudioSwitch = await page.evaluate(async production => {
    let appModel;
    if (!production) {
      const { app } = await import('/src/main.js');
      appModel = app.lab.model?.getState?.().model;
    }
    const record = window.__physicalAudioProbe.worklets[window.__antAudioSwitchRecordIndex];
    return {
      enabled: window.__antAudioSwitchController?.getSnapshot().audio?.enabled,
      contextCount: window.__physicalAudioProbe.audioContexts.length,
      contextState: window.__physicalAudioProbe.audioContexts[0]?.state,
      strikeCount: window.__physicalAudioProbe.workletMessages.filter(item => item.name === 'plate-processor'
        && item.message?.type === 'strike').length,
      messagesAfterClose: record?.messagesAfterClose,
      appModel
    };
  }, useProduction);
  if (!useProduction) assert.equal(afterAntAudioSwitch.appModel, 'string');
  if (!useProduction) assert.equal(afterAntAudioSwitch.enabled, false, 'switching away disables the old ANT audio bridge');
  assert.equal(afterAntAudioSwitch.contextCount, 1, 'switching away does not create an extra AudioContext');
  assert.equal(afterAntAudioSwitch.contextState, 'running', 'the shared Lab audio engine remains available');
  assert.equal(afterAntAudioSwitch.strikeCount, strikesAtSwitchClose,
    'switching away sends no stale ANT strikes');
  assert.equal(afterAntAudioSwitch.messagesAfterClose, 0,
    'the ANT Plate worklet receives no message after its port closes');
  const afterSwitchAudioMetrics = await page.evaluate(() => {
    const probe = window.__physicalAudioProbe;
    const records = probe.worklets.filter(item => item.name === 'plate-processor');
    return {
      phase: 'after switching away and 180ms settling interval',
      contextCount: probe.audioContexts.length,
      contextState: probe.audioContexts[0]?.state,
      processorErrors: probe.processorErrors,
      allPortsClosed: records.length > 0 && records.every(record => record.portCloses > 0),
      totalStrikes: probe.workletMessages.filter(item => item.name === 'plate-processor' && item.message?.type === 'strike').length,
      plateWorklets: records.map(record => ({
        index: record.index,
        portCloses: record.portCloses,
        messagesAfterClose: record.messagesAfterClose,
        strikes: probe.workletMessages.filter(item => item.index === record.index && item.message?.type === 'strike').length,
        peakPcmRms: Math.max(0, ...probe.workletRms.filter(item => item.index === record.index).map(item => item.rms))
      }))
    };
  });
  assert.equal(afterSwitchAudioMetrics.allPortsClosed, true, 'switching away closes every ANT Plate worklet');
  assert.equal(afterSwitchAudioMetrics.totalStrikes, strikesAtSwitchClose, 'no Plate strikes arrive after all ports close');
  assert.equal(afterSwitchAudioMetrics.processorErrors, 0);
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/ant-stereo-${useProduction ? 'production' : 'dev'}-metrics.json`,
    `${JSON.stringify({ progressedCapture: progressedAudioMetrics, afterSwitch: afterSwitchAudioMetrics,
      verifiedNoFutureStrikes: true }, null, 2)}\n`);
  assert.equal(await page.locator('#scene canvas').count(), 1, 'switching away leaves one current canvas');
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.liveRaf.size), 1,
    'switching away cancels the old render loop before starting the next one');
  if (!useProduction) {
    assert.equal(await page.evaluate(() => window.__oldAntController.destroyed), true,
      'switching away destroys the ANT controller');
    await page.evaluate(() => { delete window.__oldAntController; });
  }
}

async function verifyAntAudioToggle(page, audioButton) {
  if (!useProduction) await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    const controller = app.lab.model;
    const bridge = controller.audioBridge;
    if (!bridge || typeof bridge.handleFootContact !== 'function') throw new Error('ANT audio bridge is not injected');
    window.__antAudioController = controller;
    window.__antFootContactEvents = [];
    const handleFootContact = bridge.handleFootContact.bind(bridge);
    bridge.handleFootContact = event => {
      window.__antFootContactEvents.push({ ...event,
        position: { ...event.position },
        contacts: event.contacts.map(contact => ({ ...contact, position: { ...contact.position } }))
      });
      return handleFootContact(event);
    };
  });
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.audioContexts.length), 0,
    'the ANT bridge has no AudioContext before Audio On');
  await setAntVolume(page, 65);
  assert.ok(Math.abs(await readAntAudioVolume(page) - .65) < 1e-9,
    'changing volume while Audio Off persists in ANT state');
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.audioContexts.length), 0,
    'changing volume while Audio Off does not initialize AudioContext');
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.workletModules.length), 0,
    'changing volume while Audio Off does not load the Plate worklet');
  await audioButton.click();
  await page.waitForFunction(() => document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'true'
    && !/오디오 준비 중|오디오 오류/i.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 10000 });
  assert.equal(await audioButton.getAttribute('aria-pressed'), 'true');
  assert.match(await audioButton.textContent(), /Audio On/i);
  await page.waitForFunction(() => {
    const probe = window.__physicalAudioProbe;
    const stereoIndex = probe.worklets.find(item => item.name === 'plate-processor' && item.outputChannelCount[0] === 2)?.index;
    return probe.worklets.some(item => item.name === 'plate-processor' && item.outputChannelCount[0] === 2)
      && probe.workletMessages.some(item => item.name === 'plate-processor' && item.message?.type === 'strike')
      && probe.workletRms.some(item => item.index === stereoIndex && item.leftRms > 1e-7 && item.rightRms > 1e-7);
  }, null, { timeout: 12000 });
  const firstOn = await page.evaluate(() => {
    const probe = window.__physicalAudioProbe;
    window.__antContext = probe.audioContexts[0];
    const worklets = probe.worklets.map((item, index) => ({ index, name: item.name, contextMatches: item.context === window.__antContext }));
    const strikes = probe.workletMessages.filter(item => item.name === 'plate-processor' && item.message?.type === 'strike');
    const plate = probe.worklets.find(item => item.name === 'plate-processor');
    const channelSamples = probe.workletRms.filter(item => item.index === plate?.index);
    const channelPeak = key => Math.max(0, ...channelSamples.map(item => item[key] || 0));
    const channelDifference = Math.max(0, ...channelSamples.map(item => Math.abs((item.leftRms || 0) - (item.rightRms || 0))));
    return { contextCount: probe.audioContexts.length, contextState: window.__antContext?.state, worklets,
      plateModules: probe.workletModules.filter(item => item.loaded && /plate\.worklet\.js(?:$|\?)/.test(item.url)).length,
      stereo: { outputChannelCount: plate?.outputChannelCount, processorOptions: plate?.processorOptions,
        leftPeakRms: channelPeak('leftRms'), rightPeakRms: channelPeak('rightRms'),
        maxChannelDifference: channelDifference, outputGainNodeCount: plate?.outputGainNodes.length,
        stereoPanners: probe.stereoPanners },
      strikes, events: window.__antFootContactEvents || [] };
  });
  assert.equal(firstOn.contextCount, 1, 'Audio On lazily creates exactly one shared AudioContext');
  assert.equal(firstOn.contextState, 'running');
  assert.equal(firstOn.worklets.filter(item => item.name === 'plate-processor').length, 1,
    'ANT uses one existing Plate processor');
  assert.ok(firstOn.worklets.filter(item => item.name === 'plate-processor').every(item => item.contextMatches),
    'the Plate worklet is attached to Lab.audio’s shared context');
  assert.equal(firstOn.plateModules, 1, 'ANT lazily loads the existing Plate worklet module');
  assert.deepEqual(firstOn.stereo.outputChannelCount, [2], 'ANT Plate worklet requests two output channels');
  const stereoPickups = firstOn.stereo.processorOptions.stereoPickups;
  assert.deepEqual(stereoPickups, [{ x: -.32, y: -.18 }, { x: .32, y: -.18 }],
    'the one shared ANT Plate uses two fixed symmetric physical pickups');
  assert.ok(firstOn.stereo.leftPeakRms > 1e-7 && firstOn.stereo.rightPeakRms > 1e-7,
    'both physical pickup channels produce nonzero worklet output');
  assert.ok(firstOn.stereo.maxChannelDifference > 1e-8,
    'the observed stereo pickup signals differ during the natural ANT run');
  assert.equal(firstOn.stereo.outputGainNodeCount, 1,
    'both channels use one shared output gain node for equal volume scaling');
  assert.equal(firstOn.stereo.stereoPanners, 0, 'stereo is not implemented with an x-position panner');
  if (!useProduction) assert.ok(firstOn.events.length > 0, 'ANT generated gait-derived FOOT_CONTACT events');
  assert.ok(firstOn.strikes.length > 0, 'tripod contacts reach the Plate worklet');
  assert.ok(Math.abs(await readAntAudioVolume(page) - .65) < 1e-9,
    'Audio On preserves the volume selected while Audio Off');
  await assertAntOutputGain(page, .65);
  await setAntVolume(page, 0);
  assert.ok(Math.abs(await readAntAudioVolume(page)) < 1e-9, 'ANT volume can reach mute while audio is On');
  await assertAntOutputGain(page, 0);
  await setAntVolume(page, 35);
  assert.ok(Math.abs(await readAntAudioVolume(page) - .35) < 1e-9,
    'the volume range updates ANT audio state while audio is live');
  await assertAntOutputGain(page, .35);
  const sqrtTwo = Math.SQRT2;
  for (const strike of firstOn.strikes) {
    const payload = strike.message.payload;
    const position = payload?.position;
    assert.ok(position && Number.isFinite(position.x) && Number.isFinite(position.y), 'Plate strike has finite position coordinates');
    assert.ok(Math.hypot(position.x, position.y) <= .92 + 1e-7, 'normalized ANT positions map inside the Plate disk');
    assert.ok(Number.isFinite(payload.strength) && payload.strength > 0 && payload.strength <= .05 + 1e-9,
      'foot-contact strike strength is positive and safely capped');
    assert.ok(position.x >= -.92 / Math.SQRT2 - 1e-7 && position.x <= .92 / Math.SQRT2 + 1e-7
      && position.y >= -.92 / Math.SQRT2 - 1e-7 && position.y <= .92 / Math.SQRT2 + 1e-7);
    const matched = firstOn.events.some(event => {
      const expected = { x: (2 * event.position.x - 1) * .92 / sqrtTwo,
        y: (2 * event.position.y - 1) * .92 / sqrtTwo };
      return Math.abs(position.x - expected.x) < 1e-7 && Math.abs(position.y - expected.y) < 1e-7
        && Math.abs(payload.strength - Math.min(.05, event.strength)) < 1e-7;
    });
    if (!useProduction) assert.ok(matched, 'Plate strike preserves normalized tripod-centroid mapping and contact strength');
  }
  if (!useProduction) {
    assert.ok(firstOn.events.some(event => event.type === 'FOOT_CONTACT' && event.contactGroup === 'A'));
    assert.ok(firstOn.events.some(event => event.type === 'FOOT_CONTACT' && event.contactGroup === 'B'));
    assert.ok(firstOn.events.every(event => event.contacts.length >= 1 && event.contacts.length <= 3
      && event.contacts.every(contact => contact.position.x >= 0 && contact.position.x <= 1
        && contact.position.y >= 0 && contact.position.y <= 1)));
  }

  const firstRecordIndex = firstOn.worklets.find(item => item.name === 'plate-processor').index;
  await audioButton.click();
  await page.waitForFunction(async index => {
    const record = window.__physicalAudioProbe.worklets[index];
    const audioOff = document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'false';
    return audioOff && record?.portCloses > 0;
  }, firstRecordIndex, { timeout: 8000 });
  assert.equal(await audioButton.getAttribute('aria-pressed'), 'false');
  assert.match(await audioButton.textContent(), /Audio Off/i);
  const offStrikeCount = await page.evaluate(() => window.__physicalAudioProbe.workletMessages.filter(item =>
    item.name === 'plate-processor' && item.message?.type === 'strike').length);
  await page.waitForTimeout(180);
  const offState = await page.evaluate(async index => {
    const probe = window.__physicalAudioProbe;
    return { audio: { enabled: document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'true' }, contextCount: probe.audioContexts.length,
      contextState: window.__antContext?.state, strikes: probe.workletMessages.filter(item => item.name === 'plate-processor'
        && item.message?.type === 'strike').length, record: probe.worklets[index] };
  }, firstRecordIndex);
  offState.audio.volume = await readAntAudioVolume(page);
  assert.equal(offState.audio.enabled, false);
  assert.ok(Math.abs(offState.audio.volume - .35) < 1e-9,
    'Audio Off retains the live-selected volume');
  assert.equal(offState.contextCount, 1, 'Audio Off releases its worklet without closing the shared engine');
  assert.equal(offState.contextState, 'running');
  assert.equal(offState.strikes, offStrikeCount, 'Audio Off stops future Plate strikes');
  assert.equal(offState.record.messagesAfterClose, 0, 'Audio Off sends no messages after closing the worklet port');

  await audioButton.click();
  await page.waitForFunction(async () => {
    const probe = window.__physicalAudioProbe;
    return document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'true'
      && probe.worklets.filter(item => item.name === 'plate-processor').length >= 2;
  }, null, { timeout: 10000 });
  await page.waitForFunction(() => {
    const probe = window.__physicalAudioProbe;
    const records = probe.worklets.filter(item => item.name === 'plate-processor');
    const second = records[records.length - 1];
    return records.length >= 2 && probe.workletMessages.some(item => item.index === second.index
      && item.message?.type === 'strike')
      && probe.workletRms.some(item => item.index === second.index && item.rms > 1e-7);
  }, null, { timeout: 12000 });
  const reenabled = await page.evaluate(() => ({
    contextCount: window.__physicalAudioProbe.audioContexts.length,
    sameContext: window.__physicalAudioProbe.audioContexts[0] === window.__antContext,
    plateWorklets: window.__physicalAudioProbe.worklets.filter(item => item.name === 'plate-processor').map(item => ({
      index: item.index, contextMatches: item.context === window.__antContext, portCloses: item.portCloses,
      outputChannelCount: item.outputChannelCount, outputGainNodeCount: item.outputGainNodes.length
    })),
    freshStrikes: window.__physicalAudioProbe.workletMessages.filter(item => item.name === 'plate-processor'
      && item.message?.type === 'strike' && item.index === window.__physicalAudioProbe.worklets
        .filter(worklet => worklet.name === 'plate-processor').at(-1)?.index).length
  }));
  assert.equal(reenabled.contextCount, 1, 're-enabling ANT reuses the same shared AudioContext');
  assert.equal(reenabled.sameContext, true);
  assert.ok(Math.abs(await readAntAudioVolume(page) - .35) < 1e-9,
    'Off/On preserves the selected volume');
  await assertAntOutputGain(page, .35);
  assert.equal(reenabled.plateWorklets.length, 2, 're-enabling creates a fresh Plate worklet after the previous one closes');
  assert.ok(reenabled.plateWorklets.every(item => item.contextMatches));
  assert.deepEqual(reenabled.plateWorklets[1].outputChannelCount, [2], 're-enabled ANT creates a stereo Plate worklet');
  assert.equal(reenabled.plateWorklets[1].outputGainNodeCount, 1);
  assert.ok(reenabled.freshStrikes > 0, 're-enabled Plate worklet receives fresh tripod contacts');
  assert.ok(reenabled.plateWorklets[0].portCloses > 0, 'the prior Plate worklet was closed before re-enabling');
  assert.ok(reenabled.plateWorklets[1].portCloses === 0);
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
    await page.waitForFunction(() => document.querySelector('#state-json')?.textContent.includes('"model": "ant"'));
  } else {
    await page.evaluate(async () => { const { app } = await import('/src/main.js'); await app.ready; });
  }
  await page.locator('#simulation-canvas').waitFor({ state: 'visible' });

  assert.equal((await readState(page)).model, 'ant', 'the demo opens directly on ANT');
  const initialNav = await page.locator('nav button[data-model]').evaluateAll(buttons => buttons.map(button => button.textContent.trim()));
  assert.deepEqual(initialNav, ['ANT', 'String', 'Plate', 'Sphere']);
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.audioContexts.length), 0,
    'initial ANT selection does not initialize Web Audio before interaction');
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
  const standalonePlateOutput = await page.evaluate(() => window.__physicalAudioProbe.worklets
    .filter(item => item.name === 'plate-processor' && item.portCloses === 0).at(-1)?.outputChannelCount);
  assert.deepEqual(standalonePlateOutput, [1], 'the standalone Plate demo remains mono');
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
  const sphereOutput = await page.evaluate(() => window.__physicalAudioProbe.worklets
    .filter(item => item.name === 'sphere-processor' && item.portCloses === 0).at(-1)?.outputChannelCount);
  assert.deepEqual(sphereOutput, [1], 'the Sphere model remains mono');
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
