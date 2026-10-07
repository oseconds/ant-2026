import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { resolve } from 'node:path';
import { createServer, build, preview } from 'vite';
import { chromium } from 'playwright';

const useProduction = process.env.CHECK_PRODUCTION === '1' || process.argv.includes('--production');
const recordAntEvidence = process.argv.includes('--record-ant-evidence');
let server;
let browser;

const probeSource = `
(() => {
  const probe = window.__physicalAudioProbe = {
    audioContexts: [], contextCloseCalls: 0, worklets: [], gainNodes: [], processorErrors: 0, workletModules: [],
    workletMessages: [], audioConnections: [], stereoPanners: 0,
    pcmRms: [], workletRms: [], gl: { contexts: 0, deletedBuffers: 0, deletedPrograms: 0 },
    canvasListenersAdded: 0, canvasListenersRemoved: 0,
    rafScheduled: 0, rafCanceled: 0, liveRaf: new Set()
  };
  const audioNodeConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(destination, ...args) {
    probe.audioConnections.push({ source: this, destination, at: performance.now() });
    return audioNodeConnect.call(this, destination, ...args);
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
  return page.locator('#ant-diagnostics').evaluate(element => {
    const text = element.textContent.trim();
    const match = text.match(/(?:^|[·/])\s*(\d+)\s+ants?\b/i) || text.match(/^\s*(\d+)/);
    return Number(match?.[1] || 0);
  });
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

async function recordAntAudioEvidence(page) {
  const captured = await page.evaluate(async () => {
    const probe = window.__physicalAudioProbe;
    const context = probe.audioContexts[0];
    const plate = probe.worklets.filter(item => item.name === 'plate-processor' && item.portCloses === 0).at(-1);
    const gain = plate?.outputGainNodes.at(-1);
    const controller = window.__antAudioController || null;
    if (!context || context.state !== 'running' || !plate || !gain) {
      throw new Error('ANT audio evidence requires an active shared Plate and running AudioContext');
    }
    if (document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') !== 'true') {
      throw new Error('ANT Audio On must be enabled before recording evidence');
    }
    const contextDestinationWasConnected = probe.audioConnections.some(connection =>
      connection.source === gain && connection.destination === context.destination);
    if (!contextDestinationWasConnected) {
      throw new Error('Existing Plate-to-AudioContext output connection was not observed');
    }

    const mediaDestination = context.createMediaStreamDestination();
    const gainBefore = gain.gain.value;
    gain.connect(mediaDestination);
    const parallelTapObserved = probe.audioConnections.some(connection =>
      connection.source === gain && connection.destination === mediaDestination);
    if (!parallelTapObserved || gain.gain.value !== gainBefore || !probe.audioConnections.some(connection =>
      connection.source === gain && connection.destination === context.destination)) {
      gain.disconnect(mediaDestination);
      mediaDestination.stream.getTracks().forEach(track => track.stop());
      throw new Error('Parallel evidence tap changed or failed to preserve the live output path');
    }

    const mimeType = ['audio/webm;codecs=opus', 'audio/webm']
      .find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      gain.disconnect(mediaDestination);
      mediaDestination.stream.getTracks().forEach(track => track.stop());
      throw new Error('This Chrome build has no supported audio/webm MediaRecorder format');
    }

    const diagnosticsRead = () => {
      if (controller) {
        const snapshot = controller.getSnapshot();
        return { simulationTimeMs: snapshot.analysis.simulationTimeMs, population: snapshot.analysis.population };
      }
      const text = document.querySelector('#ant-diagnostics')?.textContent?.trim() || '';
      const match = text.match(/^\s*(?:(\d+):)?(\d+):(\d{2})\s*[·/]\s*(\d+)\s+ants?\b/i);
      if (!match) {
        const population = text.match(/(?:^|[·/])\s*(\d+)\s+ants?\b/i) || text.match(/^\s*(\d+)/);
        return { simulationTimeMs: null, population: Number(population?.[1] ?? NaN) };
      }
      const elapsedSeconds = match[1]
        ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
        : Number(match[2]) * 60 + Number(match[3]);
      return { simulationTimeMs: elapsedSeconds * 1000, population: Number(match[4]) };
    };

    const recorder = new MediaRecorder(mediaDestination.stream, { mimeType });
    const chunks = [];
    recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
    const startTime = diagnosticsRead();
    const startWallTime = performance.now();
    const populationSamples = [];
    const simulationSamples = [];
    const sampleState = () => {
      const state = diagnosticsRead();
      if (Number.isFinite(state.population)) populationSamples.push(state.population);
      if (Number.isFinite(state.simulationTimeMs)) simulationSamples.push(state.simulationTimeMs);
    };
    sampleState();
    const interval = setInterval(sampleState, 250);
    const startStrikeIndex = probe.workletMessages.length;
    const startContactEventIndex = window.__antFootContactEvents?.length ?? null;
    const plateIndex = plate.index;
    try {
      recorder.start(1000);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => recorder.stop(), 20000);
        recorder.addEventListener('error', () => { clearTimeout(timeout); reject(recorder.error || new Error('MediaRecorder failed')); }, { once: true });
        recorder.addEventListener('stop', () => { clearTimeout(timeout); resolve(); }, { once: true });
      });
      const stopTime = diagnosticsRead();
      const encoded = await new Blob(chunks, { type: mimeType }).arrayBuffer();
      const decoded = await context.decodeAudioData(encoded.slice(0));
      const perChannel = [];
      let totalSamples = 0, nonFiniteSamples = 0, clippedSamples = 0, discontinuities = 0;
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const data = decoded.getChannelData(channel);
        let energy = 0, peak = 0, previous = 0;
        for (let index = 0; index < data.length; index += 1) {
          const value = data[index];
          if (!Number.isFinite(value)) { nonFiniteSamples += 1; continue; }
          const magnitude = Math.abs(value);
          energy += value * value;
          peak = Math.max(peak, magnitude);
          if (magnitude >= .999) clippedSamples += 1;
          if (index > 0 && Math.abs(value - previous) > .8) discontinuities += 1;
          previous = value;
        }
        totalSamples += data.length;
        perChannel.push({ channel, sampleCount: data.length, rms: Math.sqrt(energy / Math.max(1, data.length)), peak });
      }
      const durationSeconds = decoded.duration;
      const contactEvents = startContactEventIndex === null ? null
        : (window.__antFootContactEvents || []).slice(startContactEventIndex)
          .filter(event => event.simulationTimeMs >= startTime.simulationTimeMs
            && event.simulationTimeMs <= stopTime.simulationTimeMs);
      const contactCountsByLeg = contactEvents?.flatMap(event => event.contacts.map(contact => contact.legId))
        .reduce((counts, legId) => ({ ...counts, [legId]: (counts[legId] || 0) + 1 }), {}) ?? null;
      const individualContacts = contactEvents?.flatMap(event => event.contacts.map(contact => ({
        antId: event.antId, contactGroup: event.contactGroup, legId: contact.legId,
        position: { x: contact.position.x, y: contact.position.y }, simulationTimeMs: event.simulationTimeMs
      }))) ?? null;
      const strikes = probe.workletMessages.slice(startStrikeIndex).filter(item => item.index === plateIndex
        && item.message?.type === 'strike');
      const bytes = new Uint8Array(encoded);
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return {
        mimeType,
        durationSeconds,
        byteLength: encoded.byteLength,
        webmBase64: btoa(binary),
        simulationTimeMs: { start: startTime.simulationTimeMs, end: stopTime.simulationTimeMs },
        population: { min: Math.min(...populationSamples), max: Math.max(...populationSamples), samples: populationSamples.length },
        audioContext: { state: context.state, sampleRate: context.sampleRate },
        parallelTap: { preservedContextDestination: contextDestinationWasConnected,
          gainUnchanged: gain.gain.value === gainBefore, outputGain: gain.gain.value },
        events: {
          plateStrikes: strikes.length,
          contactEventCount: contactEvents?.length ?? null,
          contactGroups: contactEvents?.reduce((counts, event) => ({
            ...counts, [event.contactGroup]: (counts[event.contactGroup] || 0) + 1
          }), {}) ?? null,
          uniqueContactingAnts: contactEvents ? new Set(contactEvents.map(event => event.antId)).size : null,
          individualContactsByLeg: contactCountsByLeg,
          individualContacts,
          contactDetailSource: contactEvents ? 'captured FOOT_CONTACT events and individual positions in Vite development' : null
        },
        pcm: { channelCount: decoded.numberOfChannels, channels: perChannel, totalSamples,
          nonFiniteSamples, clippedSamples, clippedFraction: clippedSamples / Math.max(1, totalSamples),
          discontinuitiesAbove0_8: discontinuities,
          stereoChannelRmsDifference: perChannel.length === 2 ? Math.abs(perChannel[0].rms - perChannel[1].rms) : null,
          silent: perChannel.every(channel => channel.rms < 1e-7) },
        wallClockDurationSeconds: (performance.now() - startWallTime) / 1000,
        simulationSamples
      };
    } finally {
      clearInterval(interval);
      if (recorder.state !== 'inactive') recorder.stop();
      gain.disconnect(mediaDestination);
      mediaDestination.stream.getTracks().forEach(track => track.stop());
      mediaDestination.disconnect();
    }
  });
  const { webmBase64, ...metrics } = captured;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const evidenceDirectory = resolve('test-results', `ant-refinement-${stamp}-${useProduction ? 'production' : 'dev'}`);
  await mkdir(evidenceDirectory, { recursive: true });
  const audioPath = resolve(evidenceDirectory, 'natural-run-audio.webm');
  const screenshotPath = resolve(evidenceDirectory, 'natural-run-final.png');
  const metricsPath = resolve(evidenceDirectory, 'natural-run-audio.json');
  await writeFile(audioPath, Buffer.from(webmBase64, 'base64'));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await writeFile(metricsPath, `${JSON.stringify({ ...metrics,
    audioFile: audioPath, screenshotFile: screenshotPath,
    evidenceMode: useProduction ? 'production preview' : 'Vite development' }, null, 2)}\n`);
  assert.equal(metrics.audioContext.state, 'running', 'AudioContext remains running through the recorded interval');
  assert.equal(metrics.parallelTap.preservedContextDestination, true, 'the existing live audio destination remains connected');
  assert.equal(metrics.parallelTap.gainUnchanged, true, 'the evidence tap does not change output gain');
  assert.ok(metrics.durationSeconds >= 19, 'the natural audio evidence contains approximately 20 seconds');
  assert.ok(Number.isFinite(metrics.simulationTimeMs.start) && Number.isFinite(metrics.simulationTimeMs.end)
    && metrics.simulationTimeMs.end > metrics.simulationTimeMs.start,
  'simulation time is recorded and advances during the clip');
  assert.ok(metrics.population.samples > 0 && Number.isFinite(metrics.population.min)
    && Number.isFinite(metrics.population.max), 'active population is sampled throughout the clip');
  assert.ok(metrics.population.min >= 2, 'multiple ants remain active throughout recorded evidence');
  assert.ok(metrics.events.plateStrikes > 0, 'the recording contains natural Plate strikes');
  assert.equal(metrics.pcm.channelCount, 2, 'the captured ANT Plate stream preserves both pickup channels');
  assert.equal(metrics.pcm.silent, false, 'decoded recorded Plate output is not silent');
  assert.equal(metrics.pcm.nonFiniteSamples, 0, 'decoded Plate output has no non-finite PCM samples');
  assert.ok(metrics.pcm.clippedFraction < .001, 'decoded Plate output contains no material clipped sample run');
  if (!useProduction) {
    assert.ok(metrics.events.contactEventCount > 0 && metrics.events.individualContacts?.length > 0,
      'the natural recording interval includes individual FOOT_CONTACT positions');
  }
  console.log(`ANT audio evidence saved: ${audioPath}`);
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
    app.lab.model.audioBridge.selected._loading = true;
    app.lab.model.emit('update');
  });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Loading audio…'
    && document.querySelector('#status')?.getAttribute('role') === 'status'
    && document.querySelector('#status')?.getAttribute('aria-live') === 'polite');
  await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    app.lab.model.audioBridge.selected._loading = false;
    app.lab.model.audioBridge.selected._error = 'Audio initialization test error';
    app.lab.model.emit('update');
  });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Audio initialization test error'
    && document.querySelector('#status')?.getAttribute('role') === 'alert'
    && document.querySelector('#status')?.getAttribute('aria-live') === 'assertive'
    && document.querySelector('#status')?.dataset.status === 'error');
  await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    app.lab.model.audioBridge.selected._error = null;
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
  assert.equal(state.audioExperiment?.mode, 'bornSurface', 'ANT opens with surface-born audio selected');
  assert.equal(state.audioExperiment?.baseSubstrate, false,
    'base substrate starts as an explicit A/B option, preserving the born-surface baseline');
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
  const substrateButton = page.locator('[data-action="ant-substrate"]');
  assert.equal(await substrateButton.count(), 1, 'ANT exposes one base-substrate A/B toggle');
  assert.equal(await substrateButton.getAttribute('aria-pressed'), 'false', 'base substrate starts off');
  assert.equal(await page.locator('#ant-plate-debug').count(), 1, 'ANT exposes one collapsed Plate debug panel');
  assert.equal(await page.locator('#ant-plate-debug').evaluate(details => details.open), false,
    'Plate debug stays collapsed in the normal view');
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
  assert.match(initialAnalysis[0], /^\s*\d{2,}:\d{2}(?::\d{2})?\s*·\s*\d+\s+ants?\b/i,
    'ANT diagnostics begins with elapsed simulation time and then active population');
  if (!useProduction) {
    const elapsedCheck = await page.evaluate(async () => {
      const { app } = await import('/src/main.js');
      const text = document.querySelector('#ant-diagnostics')?.textContent.trim() || '';
      const displayed = text.match(/^\s*((?:\d+:)?\d+:\d{2})\s*·/)?.[1];
      const time = displayed?.split(':').map(Number) || [];
      const displayedSeconds = time.length === 3 ? time[0] * 3600 + time[1] * 60 + time[2]
        : time.length === 2 ? time[0] * 60 + time[1] : NaN;
      return { displayedSeconds, simulationSeconds: Math.floor(app.lab.model.simulationTimeMs / 1000) };
    });
    assert.equal(elapsedCheck.displayedSeconds, elapsedCheck.simulationSeconds,
      'elapsed diagnostics are derived from the current simulation clock, not wall time');
  }
  const initialMass = initialAnalysis[0];
  await page.waitForTimeout(900);
  const activeFrame = await readCanvasFrame(page);
  assert.notEqual(activeFrame, initialFrame, 'ANT agents continue moving in the active simulation');
  await page.waitForFunction(initial => {
    const text = document.querySelector('#ant-diagnostics')?.textContent.trim() || '';
    const match = text.match(/(?:^|[·/])\s*(\d+)\s+ants?\b/i) || text.match(/^\s*(\d+)/);
    const value = Number(match?.[1] || 0);
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
      const { BODY_POSE_LIMITS } = await import('/src/lib/agents/ant/BodyPoseController.js');
      await model.setAudioEnabled(false);
      const startingSimulationTimeMs = model.simulationTimeMs;
      const turnSamples = {};
      const turnObservationCounts = { straight: 0, gentle: 0, sharp: 0, opposingClosePair: 0 };
      const bodyPosePrevious = new Map();
      const bodyPoseMetrics = { samples: 0, finite: true, maxHeadAbs: 0, maxGasterAbs: 0,
        maxAntenna: 0, maxHeadStep: 0, maxGasterStep: 0, maxAntennaStep: 0, maxGasterRearRadius: 0 };
      let denseSpawnAreaPeak = 0;
      const snapshotAnt = ant => ({ ...ant.getSnapshot(), gait: model.gaitController.getSnapshot(ant),
        bodyPose: model.bodyPoseController.getSnapshot(ant) });
      for (let step = 0; step < 120 * 60; step += 1) {
        model.tick(1 / 60);
        const ants = model.agents;
        for (const ant of ants) {
          const pose = model.bodyPoseController.getSnapshot(ant);
          const values = [pose?.headYaw, pose?.gasterYaw, pose?.antennae?.left, pose?.antennae?.right,
            pose?.gasterRear?.x, pose?.gasterRear?.y];
          bodyPoseMetrics.samples += 1;
          bodyPoseMetrics.finite &&= values.every(Number.isFinite);
          bodyPoseMetrics.maxHeadAbs = Math.max(bodyPoseMetrics.maxHeadAbs, Math.abs(pose?.headYaw ?? 0));
          bodyPoseMetrics.maxGasterAbs = Math.max(bodyPoseMetrics.maxGasterAbs, Math.abs(pose?.gasterYaw ?? 0));
          bodyPoseMetrics.maxAntenna = Math.max(bodyPoseMetrics.maxAntenna, pose?.antennae?.left ?? 0,
            pose?.antennae?.right ?? 0);
          bodyPoseMetrics.maxGasterRearRadius = Math.max(bodyPoseMetrics.maxGasterRearRadius,
            Math.hypot(pose?.gasterRear?.x - ant.x, pose?.gasterRear?.y - ant.y));
          const previousPose = bodyPosePrevious.get(ant.id);
          if (previousPose) {
            bodyPoseMetrics.maxHeadStep = Math.max(bodyPoseMetrics.maxHeadStep, Math.abs(pose.headYaw - previousPose.headYaw));
            bodyPoseMetrics.maxGasterStep = Math.max(bodyPoseMetrics.maxGasterStep,
              Math.abs(pose.gasterYaw - previousPose.gasterYaw));
            bodyPoseMetrics.maxAntennaStep = Math.max(bodyPoseMetrics.maxAntennaStep,
              Math.abs(pose.antennae.left - previousPose.antennae.left),
              Math.abs(pose.antennae.right - previousPose.antennae.right));
          }
          bodyPosePrevious.set(ant.id, { headYaw: pose.headYaw, gasterYaw: pose.gasterYaw,
            antennae: { ...pose.antennae } });
          const speed = Math.hypot(ant.vx, ant.vy);
          const turnRate = Math.abs(ant.angularVelocity);
          if (speed > 0.02 && turnRate < 0.25) {
            turnObservationCounts.straight += 1;
            if (!turnSamples.straight) turnSamples.straight = {
              simulationTimeMs: model.simulationTimeMs,
              turnRate: ant.angularVelocity,
              agents: [snapshotAnt(ant)]
            };
          } else if (speed > 0.02 && turnRate >= 0.25 && turnRate < 2) {
            turnObservationCounts.gentle += 1;
            if (!turnSamples.gentle) turnSamples.gentle = {
              simulationTimeMs: model.simulationTimeMs,
              turnRate: ant.angularVelocity,
              agents: [snapshotAnt(ant)]
            };
          } else if (speed > 0.02 && turnRate >= 3) {
            turnObservationCounts.sharp += 1;
            if (!turnSamples.sharp) turnSamples.sharp = {
              simulationTimeMs: model.simulationTimeMs,
              turnRate: ant.angularVelocity,
              agents: [snapshotAnt(ant)]
            };
          }
        }

        const spawnArea = ants.filter(ant => Math.hypot(ant.x - 0.5, ant.y - 0.72) <= 0.055);
        denseSpawnAreaPeak = Math.max(denseSpawnAreaPeak, spawnArea.length);
        if (spawnArea.length >= 3 && !turnSamples.denseSpawnArea) {
          turnSamples.denseSpawnArea = {
            simulationTimeMs: model.simulationTimeMs,
            count: spawnArea.length,
            agents: spawnArea.map(snapshotAnt)
          };
        }

        if (!turnSamples.opposingClosePair) {
          for (let first = 0; first < ants.length && !turnSamples.opposingClosePair; first += 1) {
            const a = ants[first];
            for (let second = first + 1; second < ants.length; second += 1) {
              const b = ants[second];
              const dx = b.x - a.x, dy = b.y - a.y;
              const distance = Math.hypot(dx, dy);
              if (distance <= 1e-9 || distance > 0.07 || Math.cos(a.heading - b.heading) >= -0.5) continue;
              const closingSpeed = ((a.vx - b.vx) * dx + (a.vy - b.vy) * dy) / distance;
              if (closingSpeed <= 0.004) continue;
              turnObservationCounts.opposingClosePair += 1;
              turnSamples.opposingClosePair = {
                simulationTimeMs: model.simulationTimeMs,
                distance,
                closingSpeed,
                agents: [snapshotAnt(a), snapshotAnt(b)]
              };
              break;
            }
          }
        }

        if (step >= 20 * 60 && turnSamples.straight && turnSamples.gentle && turnSamples.sharp
          && turnSamples.denseSpawnArea && turnSamples.opposingClosePair) break;
      }
      window.__antArticulationSamples = turnSamples;
      window.__antArticulationMetrics = {
        additionalSimulatedSeconds: (model.simulationTimeMs - startingSimulationTimeMs) / 1000,
        totalSimulationTimeMs: model.simulationTimeMs,
        rawAngularVelocityObservationCounts: turnObservationCounts,
        bodyPose: { ...bodyPoseMetrics, expectedHeadLimit: BODY_POSE_LIMITS.headYaw,
          expectedGasterLimit: BODY_POSE_LIMITS.gasterYaw,
          rearPointsFinite: bodyPoseMetrics.finite },
        denseSpawnAreaPeak,
        sampledStates: Object.fromEntries(Object.entries(turnSamples).map(([name, sample]) => [name, {
          simulationTimeMs: sample.simulationTimeMs,
          angularVelocities: sample.agents.map(ant => ant.angularVelocity),
          bodyPoses: sample.agents.map(ant => ant.bodyPose),
          antCount: sample.agents.length,
          distance: sample.distance ?? null,
          closingSpeed: sample.closingSpeed ?? null
        }]))
      };
      await model.setAudioEnabled(true);
      model.emit('update');
    });
    await page.waitForFunction(() => {
      const probe = window.__physicalAudioProbe;
      const plate = probe.worklets.filter(item => item.name === 'plate-processor').at(-1);
      return plate && probe.workletMessages.some(item => item.index === plate.index && item.message?.type === 'strike')
        && probe.workletRms.some(item => item.index === plate.index && item.rms > 1e-7);
    }, null, { timeout: 12000 });
    await page.waitForFunction(() => (window.__antRendererPoseProbe?.framesWithBodyPose || 0) > 0,
      null, { timeout: 8000 });
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
        scenario: `default live ANT app at ${(snapshot.analysis.simulationTimeMs / 1000).toFixed(1)} total simulated seconds with audio active; existing canvas renderer`,
        observedAt: new Date().toISOString(),
        analysis: snapshot.analysis,
        activeAnts: snapshot.agents.length,
        articulation: { ...window.__antArticulationMetrics,
          rendererPoseConsumption: window.__antRendererPoseProbe || null },
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
    assert.ok(turnoverCapture.articulation.bodyPose.samples > 0
      && turnoverCapture.articulation.bodyPose.finite
      && turnoverCapture.articulation.bodyPose.rearPointsFinite,
    'body pose and its gaster secretion point remain finite in the live framework-independent snapshot');
    assert.ok(turnoverCapture.articulation.bodyPose.maxHeadAbs <= turnoverCapture.articulation.bodyPose.expectedHeadLimit + 1e-9
      && turnoverCapture.articulation.bodyPose.maxGasterAbs <= turnoverCapture.articulation.bodyPose.expectedGasterLimit + 1e-9,
    'continuous head and gaster articulation stay within their pose limits');
    assert.ok(turnoverCapture.articulation.bodyPose.maxHeadStep < .03
      && turnoverCapture.articulation.bodyPose.maxGasterStep < .02
      && turnoverCapture.articulation.bodyPose.maxAntennaStep < .08,
    'body and antenna poses evolve continuously between simulation steps instead of snapping with raw turn rate');
    assert.ok(Object.values(turnoverCapture.articulation.sampledStates).every(sample =>
      sample.bodyPoses.every(pose => pose && Number.isFinite(pose.headYaw)
        && Number.isFinite(pose.gasterYaw) && Number.isFinite(pose.gasterRear?.x)
        && Number.isFinite(pose.gasterRear?.y))),
    'captured renderer snapshots include finite body poses and gaster tips');
    assert.ok(turnoverCapture.articulation.rendererPoseConsumption?.frames > 0
      && turnoverCapture.articulation.rendererPoseConsumption?.framesWithBodyPose > 0
      && turnoverCapture.articulation.rendererPoseConsumption?.framesWithoutBodyPose === 0,
    'the live AntRenderer receives the framework-independent body pose from controller snapshots');
    await writeFile('test-results/ant-gait-dev-metrics.json', `${JSON.stringify(turnoverCapture, null, 2)}\n`);
    await writeFile('test-results/ant-turnover-dev-capture.json', `${JSON.stringify(turnoverCapture, null, 2)}\n`);
    await writeFile('test-results/ant-articulation-turns.json', `${JSON.stringify(turnoverCapture.articulation, null, 2)}\n`);
    for (const poseName of Object.keys(turnoverCapture.articulation.sampledStates)) {
      const dataUrl = await page.evaluate(async name => {
        const { app } = await import('/src/main.js');
        const model = app.lab.model;
        const sample = window.__antArticulationSamples[name];
        const { AntRenderer } = await import('/src/lib/renderers/AntRenderer.js');
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:640px;z-index:9999';
        const canvas = document.createElement('canvas');
        host.appendChild(canvas);
        document.body.appendChild(host);
        const preview = new AntRenderer(canvas);
        await preview.init({ width: 640, height: 640, pixelRatio: 1 });
        const focus = sample.agents.reduce((sum, ant) => ({ x: sum.x + ant.x, y: sum.y + ant.y }), { x: 0, y: 0 });
        focus.x /= sample.agents.length;
        focus.y /= sample.agents.length;
        const zoom = sample.agents.length > 1 ? 4.5 : 8;
        const focusedAgents = sample.agents.map(ant => ({
          ...ant,
          x: 0.5 + (ant.x - focus.x) * zoom,
          y: 0.5 + (ant.y - focus.y) * zoom,
          radius: ant.radius * zoom,
          gait: {
            ...ant.gait,
            legs: ant.gait.legs.map(leg => Object.fromEntries(
              ['root', 'knee', 'foot'].map(key => [key, {
                x: 0.5 + (leg[key].x - focus.x) * zoom,
                y: 0.5 + (leg[key].y - focus.y) * zoom
              }])
            ))
          }
        }));
        preview.render({ agents: focusedAgents });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const image = canvas.toDataURL('image/png');
        await preview.destroy();
        host.remove();
        return image;
      }, poseName);
      const imageBytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      await writeFile(`test-results/ant-articulation-${poseName}.png`, imageBytes);
    }
    await page.screenshot({ path: 'test-results/ant-articulation-live.png', fullPage: true });
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
  if (recordAntEvidence && !useProduction) await recordAntAudioEvidence(page);
  progressedAudioMetrics = await page.evaluate(production => {
    const probe = window.__physicalAudioProbe;
    const processorName = production ? 'surface-plate-processor' : 'plate-processor';
    const records = probe.worklets.filter(item => item.name === processorName);
    const currentStereoWorklet = records.at(-1);
    const stereoSamples = probe.workletRms.filter(item => item.index === currentStereoWorklet?.index);
    let simulationSeconds = null;
    if (!production && window.__antAudioController) {
      simulationSeconds = window.__antAudioController.getSnapshot().analysis.simulationTimeMs / 1000;
    }
    return {
      phase: 'after progressed ANT screenshot, before model switch',
      processorName,
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
      loadedAntWorkletModules: probe.workletModules.filter(item => item.loaded
        && /(?:surface-plate|plate)\.worklet\.js(?:$|\?)/.test(item.url)).length,
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
    const state = JSON.parse(document.querySelector('#state-json').textContent);
    window.__antAudioSwitchProcessorName = state.audioExperiment?.mode === 'legacy'
      ? 'plate-processor' : 'surface-plate-processor';
    window.__antAudioSwitchRecordIndex = probe.worklets.map(item => item.name)
      .lastIndexOf(window.__antAudioSwitchProcessorName);
    return { index: window.__antAudioSwitchRecordIndex, processorName: window.__antAudioSwitchProcessorName };
  });
  assert.ok(antAudioBeforeSwitch.index >= 0, 'the selected ANT audio worklet is present before switching away');
  await waitForModel(page, 'string');
  await page.waitForFunction(index => {
    const record = window.__physicalAudioProbe.worklets[index];
    return record && record.portCloses > 0;
  }, antAudioBeforeSwitch.index);
  const strikesAtSwitchClose = await page.evaluate(() => window.__physicalAudioProbe.workletMessages.filter(item =>
    (item.name === 'plate-processor' || item.name === 'surface-plate-processor')
      && item.message?.type === 'strike').length);
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
      strikeCount: window.__physicalAudioProbe.workletMessages.filter(item => (item.name === 'plate-processor'
        || item.name === 'surface-plate-processor') && item.message?.type === 'strike').length,
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
    'the ANT audio worklet receives no message after its port closes');
  const afterSwitchAudioMetrics = await page.evaluate(() => {
    const probe = window.__physicalAudioProbe;
    const records = probe.worklets.filter(item => item.name === 'plate-processor'
      || item.name === 'surface-plate-processor');
    const strikes = probe.workletMessages.filter(item => (item.name === 'plate-processor'
      || item.name === 'surface-plate-processor') && item.message?.type === 'strike');
    return {
      phase: 'after switching away and 180ms settling interval',
      contextCount: probe.audioContexts.length,
      contextState: probe.audioContexts[0]?.state,
      processorErrors: probe.processorErrors,
      allPortsClosed: records.length > 0 && records.every(record => record.portCloses > 0),
      totalStrikes: strikes.length,
      plateWorklets: records.map(record => ({
        index: record.index,
        portCloses: record.portCloses,
        messagesAfterClose: record.messagesAfterClose,
        strikes: probe.workletMessages.filter(item => item.index === record.index && item.message?.type === 'strike').length,
        peakPcmRms: Math.max(0, ...probe.workletRms.filter(item => item.index === record.index).map(item => item.rms))
      }))
    };
  });
  assert.equal(afterSwitchAudioMetrics.allPortsClosed, true, 'switching away closes every ANT audio worklet');
  assert.equal(afterSwitchAudioMetrics.totalStrikes, strikesAtSwitchClose, 'no ANT strikes arrive after all ports close');
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
  await verifyBornSurfaceAudioLifecycle(page, audioButton);
  if (useProduction) return;
  await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    app.lab.model.configure({ audioExperiment: { mode: 'legacy' } });
  });
  await page.waitForFunction(() => JSON.parse(document.querySelector('#state-json').textContent)
    .audioExperiment?.mode === 'legacy'
    && document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'false');

  if (!useProduction) await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    const controller = app.lab.model;
    const bridge = controller.audioBridge;
    if (!bridge || typeof bridge.handleFootContact !== 'function') throw new Error('ANT audio bridge is not injected');
    const { AntRenderer } = await import('/src/lib/renderers/AntRenderer.js');
    const originalRender = AntRenderer.prototype.render;
    window.__antRendererPoseProbe = { frames: 0, framesWithBodyPose: 0, framesWithoutBodyPose: 0 };
    AntRenderer.prototype.render = function(snapshot, ...args) {
      const probe = window.__antRendererPoseProbe;
      if (probe && Array.isArray(snapshot?.agents)) {
        probe.frames += 1;
        if (snapshot.agents.length > 0 && snapshot.agents.every(agent => agent.bodyPose
          && Number.isFinite(agent.bodyPose.headYaw) && Number.isFinite(agent.bodyPose.gasterYaw))) {
          probe.framesWithBodyPose += 1;
        } else probe.framesWithoutBodyPose += 1;
      }
      return originalRender.call(this, snapshot, ...args);
    };
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
  const legacyBaseline = await page.evaluate(() => ({
    contexts: window.__physicalAudioProbe.audioContexts.length,
    plateModules: window.__physicalAudioProbe.workletModules.filter(item => /\/plate\.worklet\.js(?:$|\?)/.test(item.url)).length
  }));
  assert.equal(legacyBaseline.plateModules, 0, 'legacy Plate module remains unloaded before selecting its backend');
  await setAntVolume(page, 65);
  assert.ok(Math.abs(await readAntAudioVolume(page) - .65) < 1e-9,
    'changing volume while Audio Off persists in ANT state');
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.audioContexts.length), legacyBaseline.contexts,
    'changing volume while Audio Off does not create another AudioContext');
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.workletModules
    .filter(item => /\/plate\.worklet\.js(?:$|\?)/.test(item.url)).length), legacyBaseline.plateModules,
  'changing volume while Audio Off does not load the legacy Plate worklet');
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
  if (!useProduction) await page.waitForFunction(() => {
    const events = window.__antFootContactEvents || [];
    return events.some(event => event.contactGroup === 'A') && events.some(event => event.contactGroup === 'B');
  }, null, { timeout: 8000 });
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
      plateModules: probe.workletModules.filter(item => item.loaded && /\/plate\.worklet\.js(?:$|\?)/.test(item.url)).length,
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
  await verifyBaseSubstrateAB(page, audioButton);
}

async function verifyBaseSubstrateAB(page, audioButton) {
  if (audioButton && await audioButton.getAttribute('aria-pressed') === 'true') {
    await audioButton.click();
    await page.waitForFunction(() =>
      document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'false');
  }
  await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    app.lab.model.configure({ audioExperiment: { mode: 'bornSurface', baseSubstrate: false } });
  });
  await page.waitForFunction(() => {
    const state = JSON.parse(document.querySelector('#state-json').textContent);
    return state.audioExperiment?.mode === 'bornSurface' && state.audioExperiment?.baseSubstrate === false;
  });

  const selectedVolume = await readAntAudioVolume(page);
  const baseline = await page.evaluate(() => ({
    surfaces: window.__physicalAudioProbe.worklets.filter(item => item.name === 'surface-plate-processor').length,
    plates: window.__physicalAudioProbe.worklets.filter(item => item.name === 'plate-processor').length
  }));
  await audioButton.click();
  await page.waitForFunction(count =>
    window.__physicalAudioProbe.worklets.filter(item => item.name === 'surface-plate-processor').length > count,
  baseline.surfaces, { timeout: 10000 });

  const substrateButton = page.locator('[data-action="ant-substrate"]');
  await substrateButton.click();
  await page.waitForFunction(count =>
    document.querySelector('[data-action="ant-substrate"]')?.getAttribute('aria-pressed') === 'true'
    && window.__physicalAudioProbe.worklets.filter(item => item.name === 'plate-processor').length > count,
  baseline.plates, { timeout: 10000 });
  const indices = await page.evaluate(() => ({
    base: window.__physicalAudioProbe.worklets
      .map((item, index) => item.name === 'plate-processor' ? index : -1).filter(index => index >= 0).at(-1),
    surface: window.__physicalAudioProbe.worklets
      .map((item, index) => item.name === 'surface-plate-processor' ? index : -1).filter(index => index >= 0).at(-1)
  }));
  await page.waitForFunction(index => {
    const probe = window.__physicalAudioProbe;
    return probe.workletMessages.some(item => item.index === index && item.message?.type === 'strike')
      && probe.workletRms.some(item => item.index === index
        && Math.max(item.leftRms || 0, item.rightRms || 0, item.rms || 0) > 1e-7);
  }, indices.base, { timeout: 12000 });

  const result = await page.evaluate(({ base, surface }) => {
    const probe = window.__physicalAudioProbe;
    const baseRecord = probe.worklets[base];
    const configure = probe.workletMessages.filter(item => item.index === base
      && item.message?.type === 'configure').at(-1)?.message;
    const peak = Math.max(0, ...probe.workletRms.filter(item => item.index === base)
      .map(item => Math.max(item.leftRms || 0, item.rightRms || 0, item.rms || 0)));
    return {
      baseOutputChannelCount: baseRecord?.outputChannelCount,
      baseGain: baseRecord?.outputGainNodes?.[0]?.gain?.value,
      damping: configure?.payload?.damping,
      peak,
      surfaceClosed: probe.worklets[surface]?.portCloses > 0
    };
  }, indices);
  assert.deepEqual(result.baseOutputChannelCount, [2], 'base substrate uses the preserved stereo Plate transport');
  assert.equal(result.damping, 100, 'base substrate uses maximum generic Plate damping');
  assert.ok(result.peak > 1e-7, 'base substrate produces nonzero output before the first born Plate');
  assert.ok(result.baseGain <= 0.7 * selectedVolume * 0.22 + 1e-6,
    'base substrate stays below the current ANT master output');
  assert.equal(result.surfaceClosed, false, 'base substrate runs beside, not instead of, the born-surface processor');

  await substrateButton.click();
  await page.waitForFunction(index => {
    const record = window.__physicalAudioProbe.worklets[index];
    return document.querySelector('[data-action="ant-substrate"]')?.getAttribute('aria-pressed') === 'false'
      && record?.portCloses > 0;
  }, indices.base, { timeout: 8000 });
  assert.equal(await page.evaluate(index => window.__physicalAudioProbe.worklets[index]?.portCloses,
    indices.surface), 0, 'substrate Off leaves born-surface audio running');
  await audioButton.click();
  await page.waitForFunction(() =>
    document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'false');
}

async function verifyBornSurfaceAudioLifecycle(page, audioButton) {
  const initial = await readState(page);
  assert.equal(initial.audioExperiment?.mode, 'bornSurface', 'new ANT sessions default to born-surface audio');
  assert.equal(initial.audioExperiment?.baseSubstrate, false,
    'base substrate remains an explicit A/B option instead of changing the baseline implicitly');
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.audioContexts.length), 0,
    'born-surface ANT creates no audio context before an explicit gesture');

  const waitForSurfaceWorklet = async (minimumCount) => page.waitForFunction(count =>
    window.__physicalAudioProbe.worklets.filter(item => item.name === 'surface-plate-processor').length >= count,
  minimumCount, { timeout: 10000 });
  const surfaceWorkletIndices = async () => page.evaluate(() => window.__physicalAudioProbe.worklets
    .map((item, index) => item.name === 'surface-plate-processor' ? index : -1).filter(index => index >= 0));
  const assertQuietBeforeBirth = async (index, label) => {
    await page.waitForFunction(workletIndex => window.__physicalAudioProbe.workletMessages
      .some(item => item.index === workletIndex && item.message?.type === 'topology'), index, { timeout: 4000 });
    await page.waitForFunction(workletIndex => window.__physicalAudioProbe.workletRms
      .some(item => item.index === workletIndex), index, { timeout: 3000 });
    const protocol = await page.evaluate(workletIndex => window.__physicalAudioProbe.workletMessages
      .filter(item => item.index === workletIndex).map(item => item.message), index);
    const topology = protocol.find(message => message?.type === 'topology')?.payload;
    assert.ok(topology, `${label} receives a compiled topology message after Audio On`);
    assert.equal(topology.version, 1, `${label} uses topology protocol v1`);
    assert.equal(topology.sourceGrid, 96, `${label} preserves the 96-cell material grid`);
    assert.equal(topology.solverGrid, 32, `${label} uses the packed 32-cell solver grid`);
    assert.equal(topology.maxLayers, 256, `${label} exposes the explicit 256-layer runtime ceiling`);
    assert.deepEqual(topology.layerIds, [], `${label} receives an empty topology before natural material births`);
    assert.equal(topology.nodeGridIndices.length, 0, `${label} does not allocate solver nodes before a plate exists`);
    const messages = protocol.map(message => message?.type);
    assert.equal(messages.some(type => type === 'birth' || type === 'strike'), false,
      `${label} has no fabricated plate birth or strike before natural route evidence exists`);
    const rms = await page.evaluate(workletIndex => window.__physicalAudioProbe.workletRms
      .filter(item => item.index === workletIndex).map(item => item.rms), index);
    assert.ok(rms.length > 0 && Math.max(...rms) <= 1e-8,
      `${label} remains silent while it has no naturally born surface (samples=${rms.length}, peak=${Math.max(0, ...rms)})`);
    if (!useProduction) {
      const plateCount = await page.evaluate(async () => {
        const { app } = await import('/src/main.js');
        return app.lab.model.getSnapshot().surfacePlates.plates.length;
      });
      assert.equal(plateCount, 0, `${label} begins with no surface plate descriptors`);
    }
  };

  await audioButton.click();
  await page.waitForFunction(() => document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'true');
  await waitForSurfaceWorklet(1);
  await page.waitForTimeout(250);
  let indices = await surfaceWorkletIndices();
  assert.equal(indices.length, 1, 'born-surface Audio On creates one surface processor');
  await assertQuietBeforeBirth(indices[0], 'first born-surface processor');

  await audioButton.click();
  await page.waitForFunction(index => {
    const record = window.__physicalAudioProbe.worklets[index];
    return document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'false'
      && record?.portCloses > 0;
  }, indices[0], { timeout: 8000 });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(index => window.__physicalAudioProbe.worklets[index].messagesAfterClose,
    indices[0]), 0, 'Audio Off closes the surface processor without later messages');

  await audioButton.click();
  await page.waitForFunction(() => document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'true');
  await waitForSurfaceWorklet(2);
  indices = await surfaceWorkletIndices();
  await assertQuietBeforeBirth(indices[1], 're-enabled born-surface processor');
  const contextCount = await page.evaluate(() => window.__physicalAudioProbe.audioContexts.length);
  assert.equal(contextCount, 1, 'surface Off/On reuses the shared Lab AudioContext');

  await waitForModel(page, 'plate');
  await page.waitForFunction(index => window.__physicalAudioProbe.worklets[index]?.portCloses > 0,
    indices[1], { timeout: 8000 });
  await waitForModel(page, 'ant');
  assert.equal(await audioButton.getAttribute('aria-pressed'), 'false', 'returning to ANT starts with audio off');
  assert.equal((await readState(page)).audioExperiment?.mode, 'bornSurface',
    'returning to ANT keeps the default born-surface experiment');

  await audioButton.click();
  await page.waitForFunction(() => document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'true');
  await waitForSurfaceWorklet(3);
  indices = await surfaceWorkletIndices();
  await assertQuietBeforeBirth(indices[2], 'ANT processor after Plate-to-ANT return');

  const beforeSphereSwitch = await page.evaluate(index => ({
    contextCount: window.__physicalAudioProbe.audioContexts.length,
    strikes: window.__physicalAudioProbe.workletMessages.filter(item => item.index === index
      && item.message?.type === 'strike').length,
    messages: window.__physicalAudioProbe.workletMessages.filter(item => item.index === index).length
  }), indices[2]);
  await waitForModel(page, 'sphere');
  await page.waitForFunction(index => window.__physicalAudioProbe.worklets[index]?.portCloses > 0,
    indices[2], { timeout: 8000 });
  await page.waitForTimeout(180);
  const afterSphereSwitch = await page.evaluate(index => ({
    contextCount: window.__physicalAudioProbe.audioContexts.length,
    portCloses: window.__physicalAudioProbe.worklets[index]?.portCloses,
    messagesAfterClose: window.__physicalAudioProbe.worklets[index]?.messagesAfterClose,
    strikes: window.__physicalAudioProbe.workletMessages.filter(item => item.index === index
      && item.message?.type === 'strike').length
  }), indices[2]);
  assert.equal(afterSphereSwitch.contextCount, beforeSphereSwitch.contextCount,
    'ANT to Sphere keeps the single shared AudioContext');
  assert.ok(afterSphereSwitch.portCloses > 0, 'ANT to Sphere closes the active surface worklet');
  assert.equal(afterSphereSwitch.messagesAfterClose, 0, 'ANT sends no material or strike messages after its worklet closes');
  assert.equal(afterSphereSwitch.strikes, beforeSphereSwitch.strikes, 'ANT sends no new strikes after switching to Sphere');

  await waitForModel(page, 'ant');
  assert.equal(await audioButton.getAttribute('aria-pressed'), 'false', 'Sphere to ANT requires a fresh Audio On gesture');
  assert.equal(await page.evaluate(() => window.__physicalAudioProbe.audioContexts.length), 1,
    'Sphere to ANT reuses the existing Lab AudioContext');
  await audioButton.click();
  await page.waitForFunction(() => document.querySelector('[data-action="ant-audio"]')?.getAttribute('aria-pressed') === 'true');
  await waitForSurfaceWorklet(4);
  indices = await surfaceWorkletIndices();
  await assertQuietBeforeBirth(indices[3], 'ANT processor after Sphere round-trip');
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
  for (const filename of ['plate.worklet.js', 'surface-plate.worklet.js', 'sphere.worklet.js']) {
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
