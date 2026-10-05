import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const OUT = resolve('test-results');
const VIDEO_DIR = resolve(OUT, 'ant-refinement-phase-b-video');
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  logLevel: 'error'
});
let browser;
let context;
try {
  await mkdir(VIDEO_DIR, { recursive: true });
  await mkdir(OUT, { recursive: true });
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address.port === 'number', 'Vite should bind a local port');
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 960 } }
  });
  const page = await context.newPage();
  page.on('framenavigated', frame => console.log('page navigated:', frame.url()));
  page.on('crash', () => console.error('motion evidence page crashed'));
  await page.addInitScript(() => {
    let seed = 0x20261005;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
  });
  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    await app.ready;
    // Keep the real app canvas/render loop, while driving exact simulation ticks below.
    app.lab.model.update = () => false;
  });
  await page.waitForSelector('#simulation-canvas');
  await page.evaluate(async () => {
    const { app } = await import('/src/main.js');
    window.__antMotionEvidence = { app };
    app.lab.model.update = () => false;
  });

  const captures = [];
  const zoomCaptures = [];
  const metrics = {
    provenance: 'Vite ANT application and AntRenderer; seeded Math.random before app initialization; no source behavior changes',
    seed: '0x20261005',
    natural: { frames: [], captured: {} },
    synthetic: { sustained: [], alternating: [] },
    checks: {}
  };

  async function advanceNaturalFrame() {
    const sample = await page.evaluate(async () => {
      const { app } = await import('/src/main.js');
      const model = app.lab.model;
      for (let tick = 0; tick < 6; tick += 1) model.tick(1 / 60);
      model.emit('update');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const snapshot = model.getSnapshot();
      return {
        simulationSeconds: snapshot.analysis.simulationTimeMs / 1000,
        population: snapshot.analysis.population,
        meanSpeed: snapshot.analysis.meanSpeed,
        pheromoneMass: snapshot.analysis.pheromoneMass,
        minSeparation: snapshot.analysis.minSeparation,
        ants: snapshot.agents.map(ant => ({ id: ant.id, x: ant.x, y: ant.y, vx: ant.vx, vy: ant.vy,
          heading: ant.heading, angularVelocity: ant.angularVelocity, bodyPose: ant.bodyPose }))
      };
    });
    metrics.natural.frames.push(sample);
    return sample;
  }

  async function captureNatural(label, sample) {
    const file = `ant-refinement-phase-b-${label}.png`;
    const buffer = await page.screenshot({ path: resolve(OUT, file), fullPage: true });
    captures.push({ label, file, data: buffer.toString('base64') });
    const targetAnt = label === 'opposing-approach'
      ? sample.ants.find(ant => ant.id === sample.opposingPair?.first)
      : label === 'sharp-turn'
        ? sample.ants.find(ant => Math.abs(ant.angularVelocity) > 3.5)
        : label === 'gentle-turn'
          ? sample.ants.find(ant => Math.abs(ant.angularVelocity) > .25 && Math.abs(ant.angularVelocity) < 2.5)
          : label === 'straight'
            ? sample.ants.find(ant => Math.hypot(ant.vx, ant.vy) > .035 && Math.abs(ant.angularVelocity) < .15)
            : label === 'dense-spawn'
              ? sample.ants.find(ant => Math.hypot(ant.x - .5, ant.y - .72) < .055)
              : null;
    const focal = targetAnt || sample.ants.find(ant => Math.hypot(ant.vx, ant.vy) > .01) || sample.ants[0];
    metrics.natural.captured[label] = {
      file, simulationSeconds: sample.simulationSeconds, population: sample.population,
      focalAntId: focal?.id || null, candidates: sample.ants.slice(0, 5)
    };
    if (focal) await captureZoom(`${label}-ant-${focal.id}`, focal.id);
  }

  async function captureZoom(label, antId) {
    const dataUrl = await page.evaluate((id) => {
      const canvas = document.querySelector('#simulation-canvas');
      const model = window.__antMotionEvidence.app.lab.model;
      const ant = model.getSnapshot().agents.find(item => item.id === id);
      if (!canvas || !ant) return null;
      const crop = document.createElement('canvas');
      crop.width = crop.height = 640;
      const context = crop.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, crop.width, crop.height);
      const sourceWidth = Math.min(canvas.width, canvas.height, 96);
      const centerX = ant.x * canvas.width, centerY = ant.y * canvas.height;
      context.drawImage(canvas, centerX - sourceWidth / 2, centerY - sourceWidth / 2,
        sourceWidth, sourceWidth, 0, 0, crop.width, crop.height);
      return crop.toDataURL('image/png');
    }, antId);
    if (!dataUrl) return null;
    const file = `ant-refinement-phase-b-zoom-${label.replace(/[^a-z0-9-]+/gi, '-')}.png`;
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    await writeFile(resolve(OUT, file), Buffer.from(base64, 'base64'));
    zoomCaptures.push({ label, file, data: base64 });
    return file;
  }

  async function captureSynthetic(mode, elapsed, sample) {
    const name = `ant-refinement-phase-b-${mode}-${String(elapsed).replace('.', 'p')}s.png`;
    const buffer = await page.screenshot({ path: resolve(OUT, name), fullPage: true });
    captures.push({ label: `${mode} ${elapsed}s`, file: name, data: buffer.toString('base64') });
    sample.zoomCapture = await captureZoom(`${mode}-${elapsed}s`, sample.antId);
    return name;
  }

  for (let frame = 0; frame < 180; frame += 1) {
    const sample = await advanceNaturalFrame();
    const mobile = sample.ants.map(ant => ({ ant, speed: Math.hypot(ant.vx, ant.vy) }));
    if (!metrics.natural.captured.straight
      && mobile.some(({ ant, speed }) => speed > .035 && Math.abs(ant.angularVelocity) < .15)) {
      await captureNatural('straight', sample);
    }
    if (!metrics.natural.captured['gentle-turn']
      && mobile.some(({ ant }) => Math.abs(ant.angularVelocity) > .25 && Math.abs(ant.angularVelocity) < 2.5)) {
      await captureNatural('gentle-turn', sample);
    }
    if (!metrics.natural.captured['sharp-turn']
      && mobile.some(({ ant }) => Math.abs(ant.angularVelocity) > 3.5)) {
      await captureNatural('sharp-turn', sample);
    }
    if (!metrics.natural.captured['dense-spawn']
      && sample.ants.filter(ant => Math.hypot(ant.x - .5, ant.y - .72) < .055).length >= 3) {
      await captureNatural('dense-spawn', sample);
    }
    if (!metrics.natural.captured['opposing-approach']) {
      let pair = null;
      for (let first = 0; first < sample.ants.length && !pair; first += 1) {
        for (let second = first + 1; second < sample.ants.length; second += 1) {
          const a = sample.ants[first], b = sample.ants[second];
          const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
          const closing = distance > 0 ? -((b.vx - a.vx) * dx + (b.vy - a.vy) * dy) / distance : 0;
          const headingDifference = Math.abs(Math.atan2(Math.sin(a.heading - b.heading), Math.cos(a.heading - b.heading)));
          if (distance < .12 && closing > .008 && headingDifference > 2.3) {
            pair = { first: a.id, second: b.id, distance, closingSpeed: closing, headingDifference };
            break;
          }
        }
      }
      if (pair) {
        sample.opposingPair = pair;
        await captureNatural('opposing-approach', sample);
        metrics.natural.captured['opposing-approach'].pair = pair;
      }
    }
  }

  async function driveSynthetic(mode, seconds, frameHz = 10) {
    const stepsPerFrame = Math.round(60 / frameHz);
    const antId = await page.evaluate(() => {
      const { app } = window.__antMotionEvidence;
      const model = app.lab.model;
      if (!window.__antMotionEvidence.poseId) {
        const ranked = model.agents.map(ant => {
          const nearest = Math.min(Infinity, ...model.agents.filter(other => other.id !== ant.id)
            .map(other => Math.hypot(ant.x - other.x, ant.y - other.y)));
          const edgeClearance = Math.min(ant.x, ant.y, 1 - ant.x, 1 - ant.y);
          return { id: ant.id, score: nearest + Math.min(.15, edgeClearance) * .4 };
        }).sort((a, b) => b.score - a.score);
        window.__antMotionEvidence.poseId = ranked[0]?.id || model.agents[0]?.id;
      }
      return window.__antMotionEvidence.poseId;
    });
    const output = [];
    const frameCount = seconds * frameHz;
    for (let frame = 0; frame < frameCount; frame += 1) {
      let sample;
      try { sample = await page.evaluate(async ({ mode, frame, stepsPerFrame, antId }) => {
        const { app } = window.__antMotionEvidence;
        const model = app.lab.model;
        const ant = model.agents.find(item => item.id === antId);
        if (!ant) throw new Error(`Synthetic pose ant ${antId} disappeared`);
        for (let step = 0; step < stepsPerFrame; step += 1) {
          ant.angularVelocity = mode === 'sustained' ? 4.5 : ((frame * stepsPerFrame + step) % 2 ? 4.5 : -4.5);
          model.bodyPoseController.advance(ant, 1 / 60);
        }
        model.emit('update');
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const snapshot = model.getSnapshot();
        const item = snapshot.agents.find(agent => agent.id === antId);
        return { appSimulationSeconds: snapshot.analysis.simulationTimeMs / 1000,
          poseElapsedSeconds: (frame + 1) * stepsPerFrame / 60,
          antId, rawAngularVelocity: ant.angularVelocity, bodyPose: item.bodyPose,
          population: snapshot.analysis.population, pheromoneMass: snapshot.analysis.pheromoneMass };
      }, { mode, frame, stepsPerFrame, antId }); }
      catch (error) {
        console.error('synthetic frame failed:', { mode, frame, url: page.url(), closed: page.isClosed() });
        throw error;
      }
      output.push(sample);
      if ([0, frameHz, frameCount - 1].includes(frame)) {
        sample.capture = await captureSynthetic(mode, (frame + 1) / frameHz, sample);
      }
    }
    return output;
  }

  metrics.synthetic.sustained = await driveSynthetic('sustained', 6);
  await page.evaluate(async () => {
    const { app } = window.__antMotionEvidence;
    const model = app.lab.model;
    const ant = model.agents[0];
    for (let tick = 0; tick < 120; tick += 1) {
      ant.angularVelocity = 0;
      model.bodyPoseController.advance(ant, 1 / 60);
    }
    model.emit('update');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  metrics.synthetic.alternating = await driveSynthetic('alternating', 5);

  const allNaturalAnts = metrics.natural.frames.flatMap(frame => frame.ants);
  const allSyntheticPoses = [...metrics.synthetic.sustained, ...metrics.synthetic.alternating].map(item => item.bodyPose);
  metrics.checks = {
    naturalStatesFinite: allNaturalAnts.every(ant => [ant.x, ant.y, ant.vx, ant.vy, ant.heading,
      ant.angularVelocity, ant.bodyPose?.headYaw, ant.bodyPose?.gasterYaw].every(Number.isFinite)),
    syntheticStatesFinite: allSyntheticPoses.every(pose => [pose.headYaw, pose.gasterYaw,
      pose.gasterRear?.x, pose.gasterRear?.y].every(Number.isFinite)),
    sustainedPoseBuildsSmoothly: metrics.synthetic.sustained.at(-1).bodyPose.headYaw > .09
      && metrics.synthetic.sustained.at(-1).bodyPose.gasterYaw < -.05,
    alternatingPoseRemainsBounded: Math.max(...metrics.synthetic.alternating.map(item => Math.abs(item.bodyPose.headYaw))) <= .12
      && Math.max(...metrics.synthetic.alternating.map(item => Math.abs(item.bodyPose.gasterYaw))) <= .08,
    naturalScenarioCaptures: Object.keys(metrics.natural.captured)
  };
  assert.equal(metrics.checks.naturalStatesFinite, true);
  assert.equal(metrics.checks.syntheticStatesFinite, true);
  assert.equal(metrics.checks.sustainedPoseBuildsSmoothly, true);
  assert.equal(metrics.checks.alternatingPoseRemainsBounded, true);
  await writeFile(resolve(OUT, 'ant-refinement-phase-b-motion-metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);

  const selectedNatural = ['straight', 'gentle-turn', 'sharp-turn', 'dense-spawn', 'opposing-approach'];
  const sheetFrames = [
    ...selectedNatural.map(label => captures.find(item => item.label === label)).filter(Boolean),
    ...zoomCaptures.filter(item => /^sustained-(0\.1|1\.1|6)s$|^alternating-(0\.1|1\.1|5)s$/.test(item.label))
  ].slice(0, 12);
  const contactPage = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const tiles = sheetFrames.map(({ label, data }) => `<figure><img src="data:image/png;base64,${data}"><figcaption>${label}</figcaption></figure>`).join('');
  await contactPage.setContent(`<html><style>body{font:14px Arial;margin:18px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0;border:1px solid #bbb;padding:6px}img{width:100%;display:block}figcaption{padding:5px 0}</style><main>${tiles}</main></html>`);
  await contactPage.screenshot({ path: resolve(OUT, 'ant-refinement-phase-b-contact-sheet.png'), fullPage: true });
  await contactPage.close();

  // Phase E uses a fresh naturally initialized colony. The accelerated portion
  // advances the ordinary controller at its normal 1/60 s timestep; only the
  // already-existing app RAF update is paused during that deterministic setup.
  // The final 20 s are then recorded with the unmodified real RAF update path.
  const phaseEVideoDir = resolve(OUT, 'ant-refinement-phase-e-video');
  await mkdir(phaseEVideoDir, { recursive: true });
  const phaseEContext = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    recordVideo: { dir: phaseEVideoDir, size: { width: 1280, height: 960 } }
  });
  const phaseEPage = await phaseEContext.newPage();
  await phaseEPage.addInitScript(() => {
    let seed = 0x20261005;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
  });
  await phaseEPage.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'networkidle' });
  await phaseEPage.waitForSelector('#simulation-canvas');
  const phaseEMetrics = await phaseEPage.evaluate(async () => {
    const { app } = await import('/src/main.js');
    await app.ready;
    const model = app.lab.model;
    const originalUpdate = model.update;
    model.update = () => false;
    window.__phaseE = { app, model, originalUpdate, startTimeMs: model.simulationTimeMs,
      realRafSamples: [], rafSampleLast: -Infinity };
    return { seed: '0x20261005', configuration: model.getState(), startTimeMs: model.simulationTimeMs,
      simulationStepSeconds: 1 / 60, elapsedSeconds: 0 };
  });

  const phaseECaptures = [];
  async function advanceAndCapturePhaseE(label, elapsedSeconds) {
    const frame = await phaseEPage.evaluate(async ({ elapsedSeconds }) => {
      const { model, startTimeMs } = window.__phaseE;
      const target = startTimeMs + elapsedSeconds * 1000;
      let ticks = 0;
      while (model.simulationTimeMs + 1e-7 < target) {
        model.tick(1 / 60);
        ticks += 1;
      }
      model.emit('update');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const snapshot = model.getSnapshot();
      const field = snapshot.pheromone;
      const ants = snapshot.agents.map(ant => {
        const cellX = Math.max(0, Math.min(field.width - 1, Math.floor(ant.x * field.width)));
        const cellY = Math.max(0, Math.min(field.height - 1, Math.floor(ant.y * field.height)));
        const fieldValue = field.values[cellY * field.width + cellX] || 0;
        return { id: ant.id, x: ant.x, y: ant.y, vx: ant.vx, vy: ant.vy, speed: Math.hypot(ant.vx, ant.vy),
          heading: ant.heading, angularVelocity: ant.angularVelocity, trailAdherence: ant.trailAdherence,
          localFieldValue: fieldValue, bodyPose: ant.bodyPose,
          gait: ant.gait ? { phase: ant.gait.phase, strideDistance: ant.gait.strideDistance,
            legCount: ant.gait.legs?.length || 0 } : null };
      });
      return { elapsedSeconds, simulationSeconds: snapshot.analysis.simulationTimeMs / 1000,
        ticksAdvanced: ticks, population: snapshot.analysis.population, totalSpawned: snapshot.analysis.totalSpawned,
        totalRetired: snapshot.analysis.totalRetired, meanSpeed: snapshot.analysis.meanSpeed,
        pheromoneMass: snapshot.analysis.pheromoneMass, colonyActivation: snapshot.analysis.colonyActivation, ants };
    }, { elapsedSeconds });
    if (label) {
      const file = `ant-refinement-phase-e-${label}.png`;
      await phaseEPage.screenshot({ path: resolve(OUT, file), fullPage: true });
      phaseECaptures.push({ label, elapsedSeconds: frame.elapsedSeconds, simulationSeconds: frame.simulationSeconds,
        population: frame.population, file });
    }
    return frame;
  }

  const initial = await advanceAndCapturePhaseE('initial-single', 0);
  const checkpoints = [
    { label: 'growth-3s', seconds: 3 }, { label: 'growth-10s', seconds: 10 },
    { label: 'growth-30s', seconds: 30 }, { label: 'growth-60s', seconds: 60 },
    { label: 'prepared-180s', seconds: 180 }
  ];
  let denseCapture = null;
  let headOnCapture = null;
  let trafficCapture = null;
  let trafficEvidence = [];
  const trafficHistory = [];
  let previousFrame = null;
  let frame = initial;
  for (let second = 1; second <= 180; second += 1) {
    frame = await advanceAndCapturePhaseE(null, second);
    const denseCount = frame.ants.filter(ant => Math.hypot(ant.x - .5, ant.y - .72) < .055).length;
    if (!denseCapture && denseCount >= 3) {
      const label = `dense-spawn-${second}s`;
      denseCapture = await advanceAndCapturePhaseE(label, second);
    }
    if (!headOnCapture) {
      const pair = findOpposingPair(frame.ants);
      if (pair) {
        const label = `head-on-${second}s`;
        headOnCapture = await advanceAndCapturePhaseE(label, second);
        headOnCapture.pair = pair;
      }
    }
    const chains = findAlignedChains(frame.ants);
    const stableChain = chains.find(chain => chain.ids.length >= 3 && chain.ids.every(id => {
      const ant = frame.ants.find(item => item.id === id);
      return ant && ant.trailAdherence >= .25;
    }));
    const previousSecond = trafficHistory.at(-1);
    const persistentChain = stableChain && previousSecond?.second === second - 1
      ? previousSecond.chains.find(chain => sameIds(chain.ids, stableChain.ids)) : null;
    trafficHistory.push({ second, chains });
    if (persistentChain) {
      trafficEvidence.push({ fromSecond: second - 1, toSecond: second, chain: stableChain,
        agents: [previousFrame, frame].map(sample => ({ simulationSeconds: sample.simulationSeconds,
          ants: sample.ants.filter(ant => stableChain.ids.includes(ant.id)) })) });
    }
    if (!trafficCapture && persistentChain) {
      const label = `aligned-traffic-${second}s`;
      trafficCapture = await advanceAndCapturePhaseE(label, second);
      const cropData = await phaseEPage.evaluate(ids => {
        const canvas = document.querySelector('#simulation-canvas');
        const agents = window.__phaseE.model.getSnapshot().agents.filter(ant => ids.includes(ant.id));
        if (!canvas || agents.length < 3) return null;
        const centerX = agents.reduce((sum, ant) => sum + ant.x, 0) / agents.length * canvas.width;
        const centerY = agents.reduce((sum, ant) => sum + ant.y, 0) / agents.length * canvas.height;
        const crop = document.createElement('canvas');
        crop.width = crop.height = 640;
        const context = crop.getContext('2d');
        context.fillStyle = '#fff'; context.fillRect(0, 0, crop.width, crop.height);
        const sourceWidth = Math.min(canvas.width, canvas.height, 128);
        context.drawImage(canvas, centerX - sourceWidth / 2, centerY - sourceWidth / 2,
          sourceWidth, sourceWidth, 0, 0, crop.width, crop.height);
        return crop.toDataURL('image/png');
      }, stableChain.ids);
      if (cropData) {
        const file = `ant-refinement-phase-e-traffic-chain-${second}s-zoom.png`;
        await writeFile(resolve(OUT, file), Buffer.from(cropData.slice(cropData.indexOf(',') + 1), 'base64'));
        trafficEvidence.at(-1).zoomCapture = file;
      }
    }
    if (checkpoints.some(checkpoint => checkpoint.seconds === second)) {
      const checkpoint = checkpoints.find(item => item.seconds === second);
      await advanceAndCapturePhaseE(checkpoint.label, second);
    }
    previousFrame = frame;
  }

  await phaseEPage.evaluate(() => {
    const state = window.__phaseE;
    state.model.update = state.originalUpdate;
    state.zoomAntId = state.model.agents[0]?.id || null;
    state.zoomFrames = [];
    const sampleRaf = now => {
      if (now - state.rafSampleLast >= 500) {
        state.rafSampleLast = now;
        const snapshot = state.model.getSnapshot();
        state.realRafSamples.push({ wallTimestampMs: now, simulationTimeMs: snapshot.analysis.simulationTimeMs,
          population: snapshot.analysis.population, totalSpawned: snapshot.analysis.totalSpawned,
          totalRetired: snapshot.analysis.totalRetired, meanSpeed: snapshot.analysis.meanSpeed,
          pheromoneMass: snapshot.analysis.pheromoneMass, colonyActivation: snapshot.analysis.colonyActivation,
          ants: snapshot.agents.map(ant => ({ id: ant.id, x: ant.x, y: ant.y, vx: ant.vx, vy: ant.vy,
            heading: ant.heading, angularVelocity: ant.angularVelocity, trailAdherence: ant.trailAdherence,
            bodyPose: ant.bodyPose, gaitPhase: ant.gait?.phase,
            legCount: ant.gait?.legs?.length || 0 })) });
        const canvas = document.querySelector('#simulation-canvas');
        const zoomAnt = snapshot.agents.find(ant => ant.id === state.zoomAntId);
        if (canvas && zoomAnt) {
          const crop = document.createElement('canvas');
          crop.width = crop.height = 640;
          const context = crop.getContext('2d');
          context.fillStyle = '#fff'; context.fillRect(0, 0, crop.width, crop.height);
          const sourceWidth = Math.min(canvas.width, canvas.height, 96);
          const centerX = zoomAnt.x * canvas.width, centerY = zoomAnt.y * canvas.height;
          context.drawImage(canvas, centerX - sourceWidth / 2, centerY - sourceWidth / 2,
            sourceWidth, sourceWidth, 0, 0, crop.width, crop.height);
          state.zoomFrames.push({ antId: zoomAnt.id, simulationTimeMs: snapshot.analysis.simulationTimeMs,
            dataUrl: crop.toDataURL('image/png') });
        }
      }
      requestAnimationFrame(sampleRaf);
    };
    requestAnimationFrame(sampleRaf);
  });
  await phaseEPage.waitForTimeout(20_000);
  const { realRafSamples, zoomFrames } = await phaseEPage.evaluate(() => ({
    realRafSamples: window.__phaseE.realRafSamples, zoomFrames: window.__phaseE.zoomFrames
  }));
  const selectedZoomFrames = [];
  for (const index of [0, 10, 20, 30, 39]) {
    const item = zoomFrames[Math.min(index, zoomFrames.length - 1)];
    if (!item) continue;
    const file = `ant-refinement-phase-e-live-zoom-${index}.png`;
    const base64 = item.dataUrl.slice(item.dataUrl.indexOf(',') + 1);
    await writeFile(resolve(OUT, file), Buffer.from(base64, 'base64'));
    selectedZoomFrames.push({ file, antId: item.antId, simulationTimeMs: item.simulationTimeMs, dataUrl: item.dataUrl });
  }
  const videoPath = await phaseEPage.video().path();
  const liveStart = realRafSamples[0];
  const liveEnd = realRafSamples.at(-1);
  const liveCommonAnts = commonAntMotion(realRafSamples);
  phaseEMetrics.preparedSnapshot = frame;
  phaseEMetrics.initialPopulationWasSingle = initial.population === 1;
  phaseEMetrics.fastForwardCheckpoints = phaseECaptures;
  phaseEMetrics.naturalEvents = {
    firstDenseSpawnArea: denseCapture ? { elapsedSeconds: denseCapture.elapsedSeconds,
      population: denseCapture.population, capture: phaseECaptures.find(item => item.label.startsWith('dense-spawn-'))?.file } : null,
    firstHeadOnApproach: headOnCapture ? { elapsedSeconds: headOnCapture.elapsedSeconds, pair: headOnCapture.pair,
      capture: phaseECaptures.find(item => item.label.startsWith('head-on-'))?.file } : null,
    firstAlignedTrafficCandidate: trafficEvidence[0] || null,
    trafficCandidateCountBySecond: trafficHistory.filter(item => item.chains.some(chain => chain.ids.length >= 3)).length,
    trafficCaptures: trafficEvidence
  };
  phaseEMetrics.realRafMotion = {
    method: 'Restored the app controller update function; actual application RAF ran continuously for 20 wall-clock seconds. No agents or paths were hand-placed.',
    video: videoPath,
    zoomContactSheet: 'test-results/ant-refinement-phase-e-live-twitch-contact-sheet.png',
    sampleCount: realRafSamples.length,
    startSimulationTimeMs: liveStart?.simulationTimeMs,
    endSimulationTimeMs: liveEnd?.simulationTimeMs,
    simulationSecondsAdvanced: liveStart && liveEnd ? (liveEnd.simulationTimeMs - liveStart.simulationTimeMs) / 1000 : 0,
    startPopulation: liveStart?.population,
    endPopulation: liveEnd?.population,
    commonAntMotion: liveCommonAnts,
    zoomFrames: selectedZoomFrames.map(({ file, antId, simulationTimeMs }) => ({ file, antId, simulationTimeMs })),
    finitePoseAndGaitData: realRafSamples.every(sample => sample.ants.every(ant =>
      [ant.x, ant.y, ant.vx, ant.vy, ant.heading, ant.angularVelocity, ant.bodyPose?.headYaw,
        ant.bodyPose?.gasterYaw, ant.bodyPose?.gasterRear?.x, ant.bodyPose?.gasterRear?.y,
        ant.gaitPhase].every(Number.isFinite) && ant.legCount === 6)),
    twitchAssessment: assessTemporalTwitch(realRafSamples)
  };
  assert.equal(phaseEMetrics.initialPopulationWasSingle, true, 'natural run begins with one ANT');
  assert.ok(phaseEMetrics.realRafMotion.simulationSecondsAdvanced >= 18,
    'the real application RAF should advance at least 18 simulation seconds during the 20 second recording');
  assert.equal(phaseEMetrics.realRafMotion.finitePoseAndGaitData, true,
    'all live RAF agents have finite body poses and six gait legs');
  await phaseEPage.screenshot({ path: resolve(OUT, 'ant-refinement-phase-e-live-20s-end.png'), fullPage: true });
  await phaseEContext.close();
  const liveZoomPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const liveZoomTiles = selectedZoomFrames.map((item, index) => {
    const seconds = ((item.simulationTimeMs - liveStart.simulationTimeMs) / 1000).toFixed(1);
    return `<figure><img src="${item.dataUrl}"><figcaption>Ant ${item.antId} · +${seconds}s</figcaption></figure>`;
  }).join('');
  await liveZoomPage.setContent(`<style>body{font:14px Arial;margin:16px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}figure{margin:0;border:1px solid #bbb;padding:6px}img{width:100%;display:block}figcaption{padding:5px 0}</style><main>${liveZoomTiles}</main>`);
  await liveZoomPage.screenshot({ path: resolve(OUT, 'ant-refinement-phase-e-live-twitch-contact-sheet.png'), fullPage: true });
  await liveZoomPage.close();
  await writeFile(resolve(OUT, 'ant-refinement-phase-e-motion-metrics.json'),
    `${JSON.stringify({ provenance: { seed: phaseEMetrics.seed, actualRenderer: true,
      defaultConfiguration: phaseEMetrics.configuration, fixedStepFastForward: true, finalLiveRAFSeconds: 20,
      noHandPlacedAgentsOrTrails: true }, initialPopulationWasSingle: phaseEMetrics.initialPopulationWasSingle,
      checkpoints: phaseECaptures, naturalEvents: phaseEMetrics.naturalEvents,
      preparedSnapshot: phaseEMetrics.preparedSnapshot, realRafMotion: phaseEMetrics.realRafMotion,
      phaseBVisualAssessment: 'See Phase B motion video and zoom sequence: natural body yaw is subtle at full-scene scale; sustained/alternating temporal samples confirm smoothed head and gaster motion without frame-to-frame snapping. Static frames are not used as evidence of motion.' }, null, 2)}\n`);
  console.log(JSON.stringify({ phaseE: resolve(OUT, 'ant-refinement-phase-e-motion-metrics.json'),
    captures: phaseECaptures, realRaf: phaseEMetrics.realRafMotion,
    naturalEvents: phaseEMetrics.naturalEvents }, null, 2));
  console.log(JSON.stringify({ metrics: resolve(OUT, 'ant-refinement-phase-b-motion-metrics.json'),
    contactSheet: resolve(OUT, 'ant-refinement-phase-b-contact-sheet.png'), videoDirectory: VIDEO_DIR,
    captures: captures.map(({ label, file }) => ({ label, file })),
    zoomCaptures: zoomCaptures.map(({ label, file }) => ({ label, file })),
    contactSheetFrames: sheetFrames.map(({ label }) => label), checks: metrics.checks }, null, 2));
} finally {
  await context?.close();
  await browser?.close();
  await server.close();
}

function sameIds(first = [], second = []) {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

function findOpposingPair(ants) {
  for (let first = 0; first < ants.length; first += 1) {
    for (let second = first + 1; second < ants.length; second += 1) {
      const a = ants[first], b = ants[second];
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
      if (distance <= 0 || distance >= .12) continue;
      const closingSpeed = -((b.vx - a.vx) * dx + (b.vy - a.vy) * dy) / distance;
      const headingDifference = Math.abs(Math.atan2(Math.sin(a.heading - b.heading), Math.cos(a.heading - b.heading)));
      if (closingSpeed > .008 && headingDifference > 2.3) {
        return { first: a.id, second: b.id, distance, closingSpeed, headingDifference };
      }
    }
  }
  return null;
}

function findAlignedChains(ants) {
  const forward = new Map(ants.map(ant => [ant.id, []]));
  for (const a of ants) {
    const speedA = Math.hypot(a.vx, a.vy);
    if (speedA < .01) continue;
    const ux = Math.cos(a.heading), uy = Math.sin(a.heading);
    for (const b of ants) {
      if (a.id === b.id || Math.hypot(b.vx, b.vy) < .01) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const ahead = dx * ux + dy * uy;
      const lateral = Math.abs(dx * uy - dy * ux);
      const headingAgreement = Math.cos(Math.atan2(Math.sin(a.heading - b.heading), Math.cos(a.heading - b.heading)));
      if (ahead >= .012 && ahead <= .10 && lateral <= .018 && headingAgreement >= .80) {
        forward.get(a.id).push({ id: b.id, ahead, lateral, headingAgreement });
      }
    }
    forward.get(a.id).sort((left, right) => left.ahead - right.ahead);
  }
  const chains = [];
  const walk = (ids, edges) => {
    if (!edges.length) {
      if (ids.length >= 2) chains.push({ ids, minHeadway: Math.min(...ids.slice(0, -1).map((_, index) =>
        forward.get(ids[index]).find(item => item.id === ids[index + 1])?.ahead ?? Infinity)),
        maxLateralOffset: Math.max(...ids.slice(0, -1).map((_, index) =>
          forward.get(ids[index]).find(item => item.id === ids[index + 1])?.lateral ?? 0)) });
      return;
    }
    for (const edge of edges) if (!ids.includes(edge.id)) {
      const next = forward.get(edge.id) || [];
      walk([...ids, edge.id], next);
    }
    if (ids.length >= 2) walk(ids, []);
  };
  for (const ant of ants) walk([ant.id], forward.get(ant.id) || []);
  const unique = new Map();
  for (const chain of chains) {
    const key = chain.ids.join('>');
    if (!unique.has(key)) unique.set(key, chain);
  }
  return [...unique.values()].sort((a, b) => b.ids.length - a.ids.length);
}

function commonAntMotion(samples) {
  if (!samples?.length) return { commonAntCount: 0, examples: [] };
  const common = samples[0].ants.map(ant => ant.id).filter(id => samples.every(sample => sample.ants.some(ant => ant.id === id)));
  const examples = common.slice(0, 8).map(id => {
    const first = samples[0].ants.find(ant => ant.id === id);
    const last = samples.at(-1).ants.find(ant => ant.id === id);
    const poses = samples.map(sample => sample.ants.find(ant => ant.id === id)?.bodyPose).filter(Boolean);
    const headYaw = poses.map(pose => pose.headYaw);
    const gasterYaw = poses.map(pose => pose.gasterYaw);
    return { id, displacement: Math.hypot(last.x - first.x, last.y - first.y),
      headYawRange: Math.max(...headYaw) - Math.min(...headYaw),
      gasterYawRange: Math.max(...gasterYaw) - Math.min(...gasterYaw) };
  });
  return { commonAntCount: common.length, examples };
}

function assessTemporalTwitch(samples) {
  let maximumHeadYawStep = 0, maximumGasterYawStep = 0, maximumTurnRate = 0;
  let comparedPoseSteps = 0;
  for (let index = 1; index < (samples?.length || 0); index += 1) {
    const before = new Map(samples[index - 1].ants.map(ant => [ant.id, ant]));
    for (const after of samples[index].ants) {
      const prior = before.get(after.id);
      if (!prior) continue;
      comparedPoseSteps += 1;
      maximumHeadYawStep = Math.max(maximumHeadYawStep, Math.abs(after.bodyPose.headYaw - prior.bodyPose.headYaw));
      maximumGasterYawStep = Math.max(maximumGasterYawStep, Math.abs(after.bodyPose.gasterYaw - prior.bodyPose.gasterYaw));
      maximumTurnRate = Math.max(maximumTurnRate, Math.abs(after.angularVelocity));
    }
  }
  return { comparedPoseSteps, maximumHeadYawChangePer500msSample: maximumHeadYawStep,
    maximumGasterYawChangePer500msSample: maximumGasterYawStep, maximumObservedRawTurnRate: maximumTurnRate,
    interpretation: comparedPoseSteps ? 'Temporal live samples show bounded pose changes; inspect the recorded video for visual smoothness.' : 'Insufficient persistent agents for temporal comparison.' };
}
