import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntEnvironmentAudioBridge, ANT_BASE_SUBSTRATE_DAMPING, ANT_BASE_SUBSTRATE_OUTPUT_RATIO } from '../src/lib/audio/AntEnvironmentAudioBridge.js';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const evidenceDir = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/audio');
const fresh = await captureFreshRun();
const { recording, firstBirthEvent, audioBridge, controller, topology, plateSource, workletSource } = fresh;
const firstBirth = firstBirthEvent.bornAtSimulationTimeMs;
const startPre = firstBirth - 10000, endPre = firstBirth;
const startPost = firstBirth, endPost = firstBirth + 10000;
const preGroups = recording.contacts.filter(event => event.simulationTimeMs >= startPre && event.simulationTimeMs < endPre);
const postGroups = recording.contacts.filter(event => event.simulationTimeMs >= startPost && event.simulationTimeMs < endPost);
if (!preGroups.length || !postGroups.length) throw new Error('Fresh natural contact stream missing from the selected first-birth windows.');
const legacyMessages = recording.legacyStrikes;
const bornMessages = recording.bornStrikes;
const emptyTopology = compileSurfaceTopology({ plates: [], nodules: [], generation: 1, maxLayers: 256 });
const bornFrames = bornMessages.filter(row => row.simulationTimeMs >= startPost && row.simulationTimeMs < endPost)
  .map(row => ({ frame: toFrame(row.simulationTimeMs, startPost), payload: row.payload }))
  .sort((a, b) => a.frame - b.frame);
const baseGain = audioBridge.legacy.plate.output.gain;
const bornGain = audioBridge.surface.worklet.gainNode.gain.value;
const prebirthBornRoutes = bornMessages.filter(row => row.simulationTimeMs >= startPre && row.simulationTimeMs < endPre);
const surfaceRoutePlateIds = [...new Set(bornFrames.map(row => row.payload.plateId))];
if (prebirthBornRoutes.length) throw new Error(`Born Plate received ${prebirthBornRoutes.length} pre-birth route(s).`);
if (!bornFrames.length || surfaceRoutePlateIds.some(id => id !== firstBirthEvent.id))
  throw new Error(`First-birth window has missing or unexpected born Plate routes: ${JSON.stringify(surfaceRoutePlateIds)}`);
if (topology.layerIds.length !== 1 || topology.layerIds[0] !== firstBirthEvent.id)
  throw new Error(`First-birth replay topology includes extra/missing layers: ${JSON.stringify(topology.layerIds)}`);
const legacyPre = legacyMessages.filter(row => row.simulationTimeMs >= startPre && row.simulationTimeMs < endPre)
  .map(row => ({ frame: toFrame(row.simulationTimeMs, startPre), payload: row.payload }))
  .sort((a, b) => a.frame - b.frame);
const legacyPost = legacyMessages.filter(row => row.simulationTimeMs >= startPost && row.simulationTimeMs < endPost)
  .map(row => ({ frame: toFrame(row.simulationTimeMs, startPost), payload: row.payload }))
  .sort((a, b) => a.frame - b.frame);
const bornSchedule = bornFrames;
const surfaceSha = sha(workletSource), plateSha = sha(plateSource);
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`, { waitUntil: 'domcontentloaded' });
  const output = await page.evaluate(async payload => {
    const rate = 48000, seconds = 10, frames = rate * seconds;
    const legacyUrl = URL.createObjectURL(new Blob([payload.plateSource], { type: 'text/javascript' }));
    const surfaceUrl = URL.createObjectURL(new Blob([payload.surfaceSource], { type: 'text/javascript' }));
    const render = async ({ label, baseEvents = [], bornEvents = [], topology, baseEnabled, bornEnabled, baseGain, bornGain }) => {
      const context = new OfflineAudioContext(6, frames, rate);
      if (baseEnabled) await context.audioWorklet.addModule(legacyUrl);
      if (bornEnabled) await context.audioWorklet.addModule(surfaceUrl);
      const merger = context.createChannelMerger(6); merger.connect(context.destination);
      const connectStereo = (node, leftIndex, gainValue) => {
        const gain = context.createGain(); gain.gain.value = gainValue;
        const split = context.createChannelSplitter(2); node.connect(gain); gain.connect(split);
        split.connect(merger, 0, leftIndex); split.connect(merger, 1, leftIndex + 1);
      };
      const watch = (node, label) => {
        let resolveReady, resolveDone, rejectReady, rejectDone;
        const ready = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`${label} scheduler handshake timed out.`)), 10000);
          resolveReady = value => { clearTimeout(timer); resolve(value); };
          rejectReady = error => { clearTimeout(timer); reject(error); };
        });
        const done = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`${label} render timed out.`)), 90000);
          resolveDone = value => { clearTimeout(timer); resolve(value); };
          rejectDone = error => { clearTimeout(timer); reject(error); };
        });
        node.port.onmessage = event => {
          if (event.data?.type === 'evidence-ready') resolveReady(event.data);
          if (event.data?.type === 'evidence-done') resolveDone(event.data);
        };
        node.addEventListener('processorerror', () => {
          const error = new Error(`${label} processor error`); rejectReady(error); rejectDone(error);
        });
        return { ready, done };
      };
      const monitors = [];
      let baseNode;
      if (baseEnabled) {
        baseNode = new AudioWorkletNode(context, 'plate-processor', { numberOfInputs: 0, numberOfOutputs: 1,
          outputChannelCount: [2], processorOptions: { resolution: 'normal', stiffness: 0.92, damping: 100,
            stereoPickups: [{ x: -0.32, y: -0.18 }, { x: 0.32, y: -0.18 }],
            evidenceSchedule: { endFrame: frames, events: baseEvents } } });
        connectStereo(baseNode, 2, baseGain);
        const monitor = watch(baseNode, `${label} legacy Plate`); monitors.push(monitor);
      }
      let bornNode, bornControl;
      if (bornEnabled) {
        const makeBorn = (leftIndex, trackEvents) => {
          const node = new AudioWorkletNode(context, 'surface-plate-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
            processorOptions: { evidenceTopology: { ...topology, maxLayers: 256 },
              evidenceSchedule: { endFrame: frames, events: trackEvents.map(e => ({ frame: e.frame,
                message: { type: 'strike', payload: e.payload } })) } } });
          connectStereo(node, leftIndex, bornGain);
          monitors.push(watch(node, `${label} born Plate${leftIndex === 4 ? ' control' : ''}`));
          return node;
        };
        bornNode = makeBorn(0, bornEvents);
        bornControl = makeBorn(4, bornEvents);
      }
      // Constructor-cloned inputs exist before frame 0; ACK cannot gate starting an offline render.
      const rendering = context.startRendering();
      const allReady = Promise.all(monitors.map(monitor => monitor.ready));
      const allDone = Promise.all(monitors.map(monitor => monitor.done));
      const [buffer, ready, reports] = await Promise.all([rendering, allReady, allDone]);
      if (ready.some(ack => ack.frame !== 0 || ack.endFrame !== frames)) throw new Error(`${label} initial scheduler state differs`);
      const channels = Array.from({ length: 6 }, (_, index) => Array.from(buffer.getChannelData(index)));
      for (const node of [baseNode, bornNode, bornControl]) { node?.disconnect(); node?.port.close(); }
      return { channels, reports, ready };
    };
    const preOff = await render({ label: 'prebirth Off', baseEnabled: false, bornEnabled: true, bornEvents: [], topology: payload.emptyTopology, bornGain: payload.bornGain });
    const preOn = await render({ label: 'prebirth On', baseEnabled: true, baseEvents: payload.preBase, bornEnabled: true,
      bornEvents: [], topology: payload.emptyTopology, baseGain: payload.baseGain, bornGain: payload.bornGain });
    const postOff = await render({ label: 'postbirth Off', baseEnabled: false, bornEnabled: true, bornEvents: payload.bornEvents,
      topology: payload.topology, bornGain: payload.bornGain });
    const post = await render({ label: 'postbirth On', baseEnabled: true, baseEvents: payload.postBase, bornEnabled: true,
      bornEvents: payload.bornEvents, topology: payload.topology, baseGain: payload.baseGain, bornGain: payload.bornGain });
    return { preOff: preOff.channels, preOn: preOn.channels, postOff: postOff.channels, post: post.channels,
      reports: { preOff: preOff.reports, preOn: preOn.reports, postOff: postOff.reports, post: post.reports },
      ready: { preOff: preOff.ready, preOn: preOn.ready, postOff: postOff.ready, post: post.ready } };
  }, { plateSource: instrumentPlate(plateSource), surfaceSource: instrumentSurface(workletSource),
    preBase: legacyPre, postBase: legacyPost, bornEvents: bornSchedule, topology,
    emptyTopology, baseGain, bornGain });

  const offSilence = stereo(Float32Array.from(output.preOff[0]), Float32Array.from(output.preOff[1]));
  const preSubstrate = stereo(Float32Array.from(output.preOn[2]), Float32Array.from(output.preOn[3]));
  const bornL = Float32Array.from(output.post[0]), bornR = Float32Array.from(output.post[1]);
  const bornOffL = output.postOff[0], bornOffR = output.postOff[1];
  const baseL = Float32Array.from(output.post[2]), baseR = Float32Array.from(output.post[3]);
  const controlL = output.post[4], controlR = output.post[5];
  const sumL = Float32Array.from(bornL, (value, i) => value + baseL[i]);
  const sumR = Float32Array.from(bornR, (value, i) => value + baseR[i]);
  const files = {
    'prebirth-off-silence-10s-48khz-f32.wav': offSilence,
    'prebirth-on-substrate-10s-48khz-f32.wav': preSubstrate,
    'postbirth-born-only-10s-48khz-f32.wav': stereo(bornL, bornR),
    'postbirth-off-born-only-10s-48khz-f32.wav': stereo(Float32Array.from(bornOffL), Float32Array.from(bornOffR)),
    'postbirth-substrate-only-10s-48khz-f32.wav': stereo(baseL, baseR),
    'postbirth-on-summed-10s-48khz-f32.wav': stereo(sumL, sumR)
  };
  await mkdir(evidenceDir, { recursive: true });
  const metrics = {};
  for (const [name, pcm] of Object.entries(files)) {
    const wav = encodeFloatWav(pcm.left, pcm.right);
    await writeFile(resolve(evidenceDir, name), wav);
    metrics[name] = { ...measure(pcm.left, pcm.right), sha256: sha(wav) };
  }
  let exactBornControlSamples = 0, maxBornControlAbsDiff = 0;
  for (let i = 0; i < bornL.length; i++) for (const [a,b] of [[bornL[i],controlL[i]],[bornR[i],controlR[i]]]) {
    if (a === b) exactBornControlSamples++;
    maxBornControlAbsDiff = Math.max(maxBornControlAbsDiff, Math.abs(a-b));
  }
  if (maxBornControlAbsDiff !== 0) throw new Error(`Born Plate control diverged during substrate-on render: ${maxBornControlAbsDiff}`);
  let offOnDiffSamples = 0, maxOffOnDiff = 0;
  for (let i = 0; i < bornL.length; i++) for (const [a,b] of [[bornL[i],bornOffL[i]],[bornR[i],bornOffR[i]]]) {
    if (a !== b) offOnDiffSamples++;
    maxOffOnDiff = Math.max(maxOffOnDiff, Math.abs(a-b));
  }
  if (maxOffOnDiff !== 0) throw new Error(`Born Plate OFF/ON PCM differs: ${offOnDiffSamples} samples; max ${maxOffOnDiff}`);
  if (metrics['prebirth-off-silence-10s-48khz-f32.wav'].peak !== 0
    || metrics['prebirth-on-substrate-10s-48khz-f32.wav'].peak === 0) throw new Error('Pre-birth A/B did not produce exact Off silence and nonzero On PCM.');
  const preOffSurface = output.reports.preOff[0];
  const preOnSurface = output.reports.preOn[1];
  const postOffSurface = output.reports.postOff[0];
  const postBase = output.reports.post[0];
  const postSurface = output.reports.post[1];
  if (preOffSurface.strikes !== 0 || preOnSurface.strikes !== 0
    || postOffSurface.strikes !== bornSchedule.length || postBase.injected !== legacyPost.length
    || postSurface.strikes !== bornSchedule.length || output.reports.post[2].strikes !== bornSchedule.length
    || output.reports.preOff[1].strikes !== 0 || output.reports.preOn[2].strikes !== 0
    || output.reports.postOff[1].strikes !== bornSchedule.length
    || output.reports.preOn[0].injected !== legacyPre.length
    || Object.values(output.reports).flat().some(row => row.renderedFrames !== 480000
      || row.scheduled !== (row.injected ?? row.strikes))) {
    throw new Error(`Scheduled/injected route counts differ: ${JSON.stringify({ preOffSurface, preOnSurface, postOffSurface, postBase, postSurface, legacyPost: legacyPost.length, born: bornSchedule.length })}`);
  }
  for (const [rows, schedule] of [[output.reports.preOn[0].receipts, legacyPre], [postBase.receipts, legacyPost]]) {
    if (rows.length !== schedule.length || rows.some((row, index) => row.requestedFrame !== schedule[index].frame
      || row.actualFrame !== Math.ceil(row.requestedFrame / 128) * 128)) {
      throw new Error('Substrate scheduler delivery differs from its declared block clock mapping.');
    }
  }
  const substrateToBornDb = 20 * Math.log10(metrics['postbirth-substrate-only-10s-48khz-f32.wav'].rms / metrics['postbirth-born-only-10s-48khz-f32.wav'].rms);
  const inputStream = gzipSync(Buffer.from(JSON.stringify(recording)));
  await writeFile(resolve(evidenceDir, 'fresh-seed-20261005-through-first-birth-plus-10s.json.gz'), inputStream);
  const report = {
    status: 'real-chrome-offline-audioworklet-captured-state-replay',
    note: 'Fresh AntController run, seed 20261005, current behavior, audio enabled at master volume 0.35. Natural per-tick FOOT_CONTACT and SurfaceField responses are saved verbatim; PCM capture is Chrome OfflineAudioContext replay. Summed energy does not establish psychoacoustic masking.',
    sourceRun: { seed: recording.seed, durationSeconds: recording.simulationDurationSeconds,
      rngCalls: recording.rngCalls, finalRngState: recording.finalRngState,
      eventStreamFile: 'fresh-seed-20261005-through-first-birth-plus-10s.json.gz',
      gzipSha256: sha(inputStream), firstPlateBirthSeconds: firstBirth / 1000,
      firstPlateId: firstBirthEvent.id, firstPlateDescriptorSha256: sha(JSON.stringify(firstBirthEvent)) },
    windows: { prebirthSimulationSeconds: [startPre / 1000, endPre / 1000], postbirthSimulationSeconds: [startPost / 1000, endPost / 1000] },
    clockMapping: { sampleRate: 48000, audioSeconds: [0, 10], audioSampleRange: [0, 480000],
      formula: 'requestedFrame = round((simulationTimeMs - windowStartMs) * 48)',
      simulatedSecondsPerAudioSecond: 1,
      prebirthAnchors: [{ simulationTimeMs: startPre, audioSampleIndex: 0 }, { simulationTimeMs: endPre, audioSampleIndex: 480000 }],
      postbirthAnchors: [{ simulationTimeMs: startPost, audioSampleIndex: 0 }, { simulationTimeMs: endPost, audioSampleIndex: 480000 }],
      bornSchedule: 'sample-exact dispatch before its requested frame',
      substrateSchedule: 'existing replay dispatch at next 128-frame block boundary; 0..127 samples (0..2.645833 ms) late; receipts retain requested/actual frames' },
    replayLimits: { initialConditions: 'Each 10-second condition starts from rest; these windows are not a continuous live audio recording.',
      scheduleOrder: 'Stable requested-frame sort; original payloads/timestamps preserved, equal-frame emission order preserved.',
      baseRandomness: 'Unchanged generic Plate Math.random strike jitter; base PCM noise realization can vary between runs.' },
    settings: { masterVolume: 0.35, substrateOutputRatio: ANT_BASE_SUBSTRATE_OUTPUT_RATIO, substrateDamping: ANT_BASE_SUBSTRATE_DAMPING,
      substrateFinalGain: baseGain, bornPlateFinalGain: bornGain, substratePlateConfiguredDamping: audioBridge.legacy.plate.getState().damping,
      bornPlateDampingMultiplier: 50, bornContactPulseMs: 3, bornContactRecoveryMs: 75 },
    sourceEvents: { prebirthFootContactGroups: preGroups.length,
      prebirthLegacyStrikeMessages: legacyPre.length, postbirthFootContactGroups: postGroups.length,
      postbirthLegacyStrikeMessages: legacyPost.length, postbirthBornPlateStrikeMessages: bornSchedule.length,
      prebirthBornPlateRoutes: prebirthBornRoutes.length, postbirthBornPlateIds: surfaceRoutePlateIds,
      surfaceRoutes: audioBridge.surface.diagnostics.strikeRoutes, workletReports: output.reports,
      schedulerReady: output.ready, schedules: { prebirthBase: legacyPre, postbirthBase: legacyPost, postbirthBorn: bornSchedule } },
    worklets: { legacyPlateSha256: plateSha, bornSurfaceSha256: surfaceSha },
    capture: { createdAtUtc: new Date().toISOString(), chrome: browser.version(), harnessSha256: sha(await readFile(resolve('scripts/ant-base-substrate-audio-evidence.js'))),
      scheduler: 'Schedule and topology cloned through processorOptions; all ready ACKs originate at process frame 0.' },
    bornPlateEquivalenceUnderSubstrate: { comparedChannelSamples: bornL.length * 2,
      exactDuplicateControlSamples: exactBornControlSamples, duplicateControlMaxAbsoluteDifference: maxBornControlAbsDiff,
      offOnDifferentSamples: offOnDiffSamples, offOnMaxAbsoluteDifference: maxOffOnDiff },
    substrateToBorn: { rmsRatioDb: substrateToBornDb,
      interpretation: 'level comparison only; no masking or audibility conclusion from summed energy alone' },
    outputs: metrics
  };
  if (metrics['postbirth-born-only-10s-48khz-f32.wav'].peak === 0
    || metrics['postbirth-substrate-only-10s-48khz-f32.wav'].peak === 0
    || Object.values(metrics).some(row => row.nonFiniteSamples || row.clippingSamples)) throw new Error('Isolated/summed PCM validation failed: non-finite or clipped samples detected.');
  await writeFile(resolve(evidenceDir, 'audio-ab-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(resolve(evidenceDir, 'README.md'), `# Base substrate audio A/B\n\nFresh current AntController run, seed 20261005, at master volume 0.35. Natural per-tick FOOT_CONTACT payloads, exact SurfaceField responses, bridge routes, and the first natural Plate descriptor are saved as a compressed replay stream. PCM comes from actual Chrome OfflineAudioContext and AudioWorklet renders.\n\n- The same 10 s window immediately before first birth runs the real surface processor on an empty topology in both conditions. Off is exact zero PCM; On adds the audio-only legacy substrate.\n- The next 10 s window renders the real first Plate and substrate side by side, then sums their isolated PCM stems. A duplicate born Plate control is sample-identical to the born output in the mix.\n- Summed energy does not establish perceptual masking.\n- Reproduce with: \`node scripts/ant-base-substrate-audio-evidence.js\`\n\nSee [audio-ab-report.json](audio-ab-report.json) for hashes, route counts, gains, PCM levels, clipping, and equivalence checks.\n`);
  console.log(JSON.stringify({ evidenceDir, preOff: metrics['prebirth-off-silence-10s-48khz-f32.wav'],
    preOn: metrics['prebirth-on-substrate-10s-48khz-f32.wav'], postSubstrateToBornDb: substrateToBornDb,
    bornControl: report.bornPlateEquivalenceUnderSubstrate }, null, 2));
} finally {
  await fresh.controller.destroy();
  await browser?.close();
  await server.close();
}

async function captureFreshRun() {
  const seed = 20261005;
  let rngState = seed >>> 0, rngCalls = 0, currentMs = 0, firstBirthEvent = null;
  const contacts = [], legacyStrikes = [], bornStrikes = [];
  const audioEngine = {
    context: { currentTime: 0 },
    async createWorklet(name, _url, _config, _onMessage, _onError, output = {}) {
      const gain = { value: output.gain ?? 1, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; },
        linearRampToValueAtTime(value) { this.value = value; } };
      return { node: { port: { onmessage: null, postMessage(message) {
        if (name === 'surface-plate-processor' && message?.type === 'strike') bornStrikes.push({ simulationTimeMs: currentMs, payload: message.payload });
      }, close() {} }, addEventListener() {}, removeEventListener() {} }, gainNode: { gain }, disconnect() {} };
    }
  };
  const audioBridge = new AntEnvironmentAudioBridge({ audioEngine });
  const controller = new AntController({ materialLocomotionResistance: false, random: () => {
    rngCalls++; rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 0x100000000;
  }, audioBridge, state: { audioExperiment: { mode: 'bornSurface', baseSubstrate: true } } });
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'plate-birth' && !firstBirthEvent) firstBirthEvent = payload;
  });
  await controller.init();
  controller.setAudioVolume(0.35);
  await controller.setAudioEnabled(true);
  if (!audioBridge.legacy.plate || !audioBridge.surface.worklet) throw new Error('Both actual audio bridges must initialize before capture.');
  const originalHandle = audioBridge.handleFootContact.bind(audioBridge);
  audioBridge.handleFootContact = (event, context) => {
    currentMs = event.simulationTimeMs;
    contacts.push({ simulationTimeMs: currentMs, payload: event, responses: context.responses });
    return originalHandle(event, context);
  };
  audioBridge.legacy.plate.strike = async payload => {
    legacyStrikes.push({ simulationTimeMs: currentMs, payload }); return true;
  };
  const step = 1 / 60;
  while (controller.simulationTimeMs < 120000 && (!firstBirthEvent || controller.simulationTimeMs < firstBirthEvent.bornAtSimulationTimeMs + 10000)) {
    controller.tick(step);
    if (controller.simulationTimeMs % 10000 < 17) process.stdout.write(`\rseed 20261005 capture ${controller.simulationTimeMs.toFixed(1)} ms`);
  }
  process.stdout.write('\n');
  unsubscribe();
  if (!firstBirthEvent || controller.simulationTimeMs < firstBirthEvent.bornAtSimulationTimeMs + 9999) throw new Error('Fresh natural run did not reach first birth plus ten seconds.');
  const topology = structuredClone(audioBridge.surface.topology);
  const plateSource = await readFile(resolve('static/worklets/plate.worklet.js'), 'utf8');
  const workletSource = await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');
  return { audioBridge, controller, topology, plateSource, workletSource, firstBirthEvent,
    recording: { seed, simulationDurationSeconds: controller.simulationTimeMs / 1000, rngCalls, finalRngState: rngState,
      contacts, legacyStrikes, bornStrikes } };
}

function instrumentSurface(source) {
  source = source.replace(/\r\n/g, '\n');
  source = source.replace('  constructor() {', '  constructor(options) {');
  source = source.replace('    super();', '    super(); const schedule=options.processorOptions.evidenceSchedule; this.__evFrame=0; this.__evEnd=schedule.endFrame; this.__evEvents=schedule.events; this.__evCursor=0; this.__evDone=false; this.__evReady=false;');
  source = source.replace('    this.port.onmessage = (event) => this.handleMessage(event.data);', "    this.port.onmessage = (event) => this.handleMessage(event.data);\n    this.handleMessage({type:'topology',payload:options.processorOptions.evidenceTopology});");
  source = source.replace('    if (this.destroyed) return false;', "    if (this.destroyed) return false;\n    if (!this.__evReady) { this.__evReady=true; this.port.postMessage({type:'evidence-ready',frame:this.__evFrame,endFrame:this.__evEnd,scheduled:this.__evEvents.length}); }");
  source = source.replace('    if (!this.topology) return true;', "    if (!this.topology) { this.__evFrame += left.length; if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',strikes:this.telemetry.strikes,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,diagnostics:this.getDiagnostics?.()||null}); } return true; }");
  source = source.replace('    for (let frame = 0; frame < left.length; frame++) {', "    for (let frame = 0; frame < left.length; frame++) {\n      while(this.__evCursor<this.__evEvents.length && this.__evEvents[this.__evCursor].frame<=this.__evFrame)this.handleMessage(this.__evEvents[this.__evCursor++].message); this.__evFrame++;");
  source = source.replace('    return true;\n  }\n\n  advancePhysics()', "    if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',strikes:this.telemetry.strikes,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,diagnostics:this.getDiagnostics?.()||null}); }\n    return true;\n  }\n\n  advancePhysics()");
  if (!source.includes("type:'evidence-ready',frame:") || !source.includes('payload:options.processorOptions.evidenceTopology')
    || !source.includes("type:'evidence-done'")) throw new Error('Surface worklet replay scheduler instrumentation failed.');
  return source;
}
function instrumentPlate(source) {
  source = source.replace(/\r\n/g, '\n');
  source = source.replace('    super();', '    super(); const schedule=options.processorOptions.evidenceSchedule; this.__evFrame=0; this.__evEnd=schedule.endFrame; this.__evEvents=schedule.events; this.__evCursor=0; this.__evInjected=0; this.__evDone=false; this.__evReady=false; this.__evReceipts=[];');
  source = source.replace('    if (this.destroyed) return false;', "    if (this.destroyed) return false;\n    if (!this.__evReady) { this.__evReady=true; this.port.postMessage({type:'evidence-ready',frame:this.__evFrame,endFrame:this.__evEnd,scheduled:this.__evEvents.length}); }");
  source = source.replace('    const channels = outputs[0];', "    const channels = outputs[0];\n    while(this.__evCursor<this.__evEvents.length && this.__evEvents[this.__evCursor].frame<=this.__evFrame) { const event=this.__evEvents[this.__evCursor++]; this.applyStrike(event.payload); this.__evInjected++; this.__evReceipts.push({requestedFrame:event.frame,actualFrame:this.__evFrame}); }");
  source = source.replace("    if (!this.active) {\n      for (const channel of channels) channel.fill(0);\n      return true;\n    }", "    if (!this.active) {\n      for (const channel of channels) channel.fill(0);\n      this.__evFrame += output.length;\n      if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',injected:this.__evInjected,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,receipts:this.__evReceipts}); }\n      return true;\n    }");
  source = source.replace('    return true;\n  }\n}', "    this.__evFrame += output.length;\n    if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',injected:this.__evInjected,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,receipts:this.__evReceipts}); }\n    return true;\n  }\n}");
  if (!source.includes("type:'evidence-ready',frame:") || !source.includes("type:'evidence-done'")) throw new Error('Legacy Plate replay scheduler instrumentation failed.');
  return source;
}
function toFrame(timeMs, startMs) { return Math.max(0, Math.min(480000 - 1, Math.round((timeMs - startMs) * 48))); }
function stereo(left, right) { return { left, right }; }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function encodeFloatWav(left, right) {
  const bytes = Buffer.alloc(44 + left.length * 8);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(3, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(48000, 24); bytes.writeUInt32LE(48000 * 8, 28); bytes.writeUInt16LE(8, 32); bytes.writeUInt16LE(32, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(left.length * 8, 40);
  for (let i = 0, offset = 44; i < left.length; i++, offset += 8) { bytes.writeFloatLE(left[i], offset); bytes.writeFloatLE(right[i], offset + 4); }
  return bytes;
}
function measure(left, right) {
  let sum = 0, peak = 0, nonFiniteSamples = 0, clippingSamples = 0;
  for (let i = 0; i < left.length; i++) for (const value of [left[i], right[i]]) {
    if (!Number.isFinite(value)) { nonFiniteSamples++; continue; }
    sum += value * value; peak = Math.max(peak, Math.abs(value)); if (Math.abs(value) >= 1) clippingSamples++;
  }
  const channelMetrics = data => {
    let squareSum = 0, channelPeak = 0;
    for (const value of data) { squareSum += value * value; channelPeak = Math.max(channelPeak, Math.abs(value)); }
    const rms = Math.sqrt(squareSum / data.length);
    return { peak: channelPeak, rms, peakDbfs: 20 * Math.log10(Math.max(1e-30, channelPeak)),
      rmsDbfs: 20 * Math.log10(Math.max(1e-30, rms)) };
  };
  return { sampleRate: 48000, samplesPerChannel: left.length, durationSeconds: left.length / 48000,
    rms: Math.sqrt(sum / (left.length * 2)), rmsDbfs: 20 * Math.log10(Math.max(1e-30, Math.sqrt(sum / (left.length * 2)))),
    peak, peakDbfs: 20 * Math.log10(Math.max(1e-30, peak)), nonFiniteSamples, clippingSamples,
    left: channelMetrics(left), right: channelMetrics(right) };
}
