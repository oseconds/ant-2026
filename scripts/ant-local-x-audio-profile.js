import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-11-01-local-x-audio-reassessment/analysis');
const WORKLET_PATH = resolve(ROOT, 'static/worklets/surface-plate.worklet.js');
const START_FRAME = 290 * 48_000, END_FRAME = 300 * 48_000;
const SEEDS = ['20261005', '20261006', '20261007'];
const ARMS = ['control', 'replacement'];
const hash = value => createHash('sha256').update(value).digest('hex');
export const QUANTILE_METHOD = 'nearest-rank: sorted[ceil(p*n)-1]';

export function nearestRank(values, p) {
  assert.ok(Array.isArray(values) && values.length > 0, 'quantile requires at least one sample');
  assert.ok(Number.isFinite(p) && p > 0 && p <= 1, 'quantile probability must be in (0, 1]');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1];
}

export function parseSchedule(bytes) {
  const schedule = JSON.parse(gunzipSync(bytes));
  assert.equal(schedule.schema, 'ant-local-x-audio-world-schedule-v1');
  assert.equal(schedule.world?.sampleRate, 48_000);
  assert.equal(schedule.world?.frames, 300 * 48_000);
  assert.ok(Array.isArray(schedule.events));
  for (let i = 0; i < schedule.events.length; i++) {
    const event = schedule.events[i];
    assert.ok(Number.isSafeInteger(event.frame) && event.frame >= 0 && event.frame <= schedule.world.frames,
      `event ${i} frame is in the 300-second schedule`);
    assert.equal(typeof event.message?.type, 'string', `event ${i} has a message type`);
    if (i) assert.ok(schedule.events[i - 1].frame <= event.frame, 'events remain in schedule order');
  }
  return schedule;
}

export function lateFixture(schedule) {
  const topologies = schedule.events.filter(event => event.message.type === 'topology' && event.frame < START_FRAME);
  assert.ok(topologies.length, 'schedule has a topology to install before the late window');
  const initial = topologies.at(-1);
  const events = schedule.events.filter(event => event.frame >= START_FRAME && event.frame < END_FRAME);
  return { initialTopology: initial.message.payload, baseTopologyFrame: initial.frame, events,
    contactCount: events.filter(event => event.message.type === 'strike').length,
    topologyInstallCount: events.filter(event => event.message.type === 'topology').length };
}

function unpack(value) {
  if (Array.isArray(value)) return value.map(unpack);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.__typedArray === 'string') {
    const types = { Float32Array, Float64Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array };
    const Type = types[value.__typedArray]; assert.ok(Type, `supported typed array ${value.__typedArray}`);
    const bytes = Buffer.from(value.data, 'base64');
    assert.equal(bytes.byteLength, value.length * Type.BYTES_PER_ELEMENT);
    return new Type(Uint8Array.from(bytes).buffer);
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, unpack(child)]));
}

export function measureCompiler(state, compile = compileSurfaceTopology) {
  const input = unpack(state);
  let topology = compile(input);
  topology = null;
  const samplesMs = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now();
    topology = compile(input);
    samplesMs.push(performance.now() - start);
  }
  topology = null;
  return { warmups: 1, measuredRuns: samplesMs.length, quantileMethod: QUANTILE_METHOD,
    p50Ms: nearestRank(samplesMs, 0.5), p95Ms: nearestRank(samplesMs, 0.95), samplesMs,
    scope: 'compileSurfaceTopology on exact late-window stratigraphy snapshot in Node; bridge-side validation and browser message transfer excluded' };
}

export function summarizeProfile(profile) {
  const byId = new Map(profile.nodes.map(node => [node.id, node]));
  const times = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    if (!node) continue;
    const callFrame = node.callFrame;
    const key = JSON.stringify([callFrame.functionName || '(anonymous)', callFrame.url || '(worklet eval)',
      Number.isInteger(callFrame.lineNumber) ? callFrame.lineNumber + 1 : null]);
    times.set(key, (times.get(key) || 0) + (profile.timeDeltas?.[i] || 0));
  }
  return [...times].map(([key, microseconds]) => {
    const [functionName, sourceUrl, lineNumber] = JSON.parse(key);
    return { functionName, sourceUrl, lineNumber, sampledMs: microseconds / 1000 };
  })
    .sort((a, b) => b.sampledMs - a.sampledMs);
}

export function summarizeCleanRuns(runs) {
  assert.equal(runs.length, 3, 'three clean measured replays are required');
  const values = runs.map(row => row.processTotalMs);
  return { measuredReplays: runs.length, quantileMethod: QUANTILE_METHOD,
    processMsMedian: nearestRank(values, 0.5), processMsMin: Math.min(...values), processMsMax: Math.max(...values) };
}

async function run() {
  const source = await readFile(WORKLET_PATH, 'utf8');
  const compilerSource = await readFile(resolve(ROOT, 'src/lib/audio/compileSurfaceTopology.js'), 'utf8');
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const report = { schema: 'ant-local-x-audio-runtime-profile-v1', timestamp: new Date().toISOString(),
    sourceSha256: hash(source), compilerSourceSha256: hash(compilerSource), browserVersion: browser.version(), nodeVersion: process.version,
    quantileMethod: QUANTILE_METHOD,
    platform: process.platform, arch: process.arch, sampleRate: 48_000,
    window: { startSeconds: 290, endSeconds: 300, startFrame: START_FRAME, endFrame: END_FRAME,
      state: 'Install latest topology before 290 s into a fresh processor; vibration state starts at rest.' },
    method: 'Unmodified SurfacePlateProcessor source executed in a Chrome main-realm AudioWorkletProcessor stub. Each case uses one untimed warmup plus three clean measured 10-second replays, then a separate CDP sampling replay. Events are dispatched at exact scheduled frame boundaries.',
    attribution: 'V8 samples report function/source locations for process, advancePhysics, computeLap, advanceNodules and other called worklet code. Contact dispatch is timed separately. Intra-Plate recurrence, Z-link loops and pickup/output mixing are inline within advancePhysics, so their sampled cost cannot be separated without changing the profiled source.',
    limitation: 'Main-realm CPU profile and processor wall time are not AudioWorklet deadline, realtime, or underrun measurements. Rest initialization omits pre-290 s vibration history. Schedule files contain compiled topology payloads, so source topology compilation time is unavailable; structured-clone cost is reported separately as a transfer proxy.',
    cases: [] };
  try {
    const page = await browser.newPage();
    for (const seed of SEEDS) for (const arm of ARMS) {
      const schedulePath = resolve(EVIDENCE, `seed-${seed}-${arm}-schedule.json.gz`);
      const compressed = await readFile(schedulePath);
      const readStart = performance.now();
      const schedule = parseSchedule(compressed);
      const parseMs = performance.now() - readStart;
      const fixture = lateFixture(schedule);
      const capturePath = resolve(EVIDENCE, `seed-${seed}-${arm}-capture.json.gz`);
      const captureBytes = await readFile(capturePath);
      const capture = JSON.parse(gunzipSync(captureBytes));
      const captureTopology = capture.topologyStates.filter(row => row.tick * 800 < START_FRAME).at(-1);
      assert.ok(captureTopology?.state, 'capture has the latest pre-window material snapshot');
      const compiler = measureCompiler(captureTopology.state);
      const setup = await page.evaluate(({ source, initialTopology, events, sampleRate }) => {
        const types = { Float32Array, Float64Array, Int16Array, Int32Array, Uint8Array, Uint16Array, Uint32Array };
        const unpack = value => {
          if (Array.isArray(value)) return value.map(unpack);
          if (!value || typeof value !== 'object') return value;
          if (typeof value.__typedArray === 'string') {
            const Type = types[value.__typedArray]; if (!Type) throw new Error(`Unsupported typed array ${value.__typedArray}`);
            const bytes = Uint8Array.from(atob(value.data), char => char.charCodeAt(0));
            if (bytes.byteLength !== value.length * Type.BYTES_PER_ELEMENT) throw new Error('Packed typed array length mismatch');
            return new Type(bytes.buffer);
          }
          return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, unpack(child)]));
        };
        let Processor;
        class Base { constructor() { this.port = { postMessage() {}, onmessage: null }; } }
        new Function('AudioWorkletProcessor', 'sampleRate', 'registerProcessor', source)(Base, sampleRate,
          (_name, implementation) => { Processor = implementation; });
        const initial = unpack(initialTopology), decodedEvents = events.map(row => ({ frame: row.frame, message: unpack(row.message) }));
        const cloneTimes = [];
        for (let i = 0; i < 9; i++) { const t = performance.now(); structuredClone(initial); cloneTimes.push(performance.now() - t); }
        cloneTimes.sort((a, b) => a - b);
        const runFixture = ({ measure = false, captureActivity = false } = {}) => {
          const processor = new Processor();
          const installs = [], activeSamples = [];
          let messageCursor = 0;
          const installStart = performance.now(); processor.handleMessage({ type: 'topology', payload: initial });
          installs.push(performance.now() - installStart);
          const output = [[new Float32Array(128), new Float32Array(128)]];
          let frame = 290 * sampleRate, processMs = 0, processBatches = 0, processCalls = 0, contactMs = 0;
          while (frame < 300 * sampleRate) {
            while (messageCursor < decodedEvents.length && decodedEvents[messageCursor].frame === frame) {
              const row = decodedEvents[messageCursor++], t = measure ? performance.now() : 0;
              processor.handleMessage(row.message);
              const elapsed = measure ? performance.now() - t : 0;
              if (row.message.type === 'topology') installs.push(elapsed);
              else if (row.message.type === 'strike') contactMs += elapsed;
            }
            const nextEvent = decodedEvents[messageCursor]?.frame ?? 300 * sampleRate;
            if (nextEvent === frame) throw new Error(`Unexpected frame scheduler stall at ${frame}`);
            const t = measure ? performance.now() : 0;
            while (frame < 300 * sampleRate && frame < nextEvent) {
              const nextTick = (Math.floor(frame / 800) + 1) * 800;
              const count = Math.min(128, 300 * sampleRate - frame, nextEvent - frame, nextTick - frame);
              const left = output[0][0].subarray(0, count), right = output[0][1].subarray(0, count);
              processor.process([], [[left, right]]); processCalls++; frame += count;
              if (captureActivity && frame % 800 === 0) activeSamples.push(processor.activeCount);
            }
            if (measure) processMs += performance.now() - t;
            processBatches++;
          }
          if (messageCursor !== decodedEvents.length) throw new Error('Unconsumed late-window events');
          const diagnostics = processor.getDiagnostics();
          const state = { layers: processor.topology.layerIds.length, nodes: processor.current.length,
            activeNodesEnd: processor.activeCount, adjacentLinks: processor.topology.adjacentLinkCoefficients.length,
            sphereFoundationLinks: processor.sphereLinkModes.length, pickupNodes: processor.topology.pickupNodeIndices.length,
            nodules: processor.noduleIds.length, physicsSteps: diagnostics.physicsSteps,
            strikes: diagnostics.strikes, dropped: diagnostics.dropped, droppedRoutes: diagnostics.droppedRoutes,
            nonFinite: diagnostics.nonFinite, contactPulseNodeSteps: diagnostics.contactPulseNodeSteps,
            deepPlateCouplingTransfers: diagnostics.deepPlateCouplingTransfers,
            sphereCouplingTransfers: diagnostics.sphereCouplingTransfers };
          if (!measure) return { state, ...(captureActivity ? { activeSamples } : {}) };
          return { processTotalMs: processMs, processCalls, processBatches, contactDispatchTotalMs: contactMs,
            topologyInstallTotalMs: installs.slice(1).reduce((a, b) => a + b, 0), initialTopologyInstallMs: installs[0],
            topologyInstallMs: installs.slice(1), state };
        };
        globalThis.__antAudioProfile = { runFixture };
        const nearestRank = p => cloneTimes[Math.ceil(p * cloneTimes.length) - 1];
        return { structuredCloneP50Ms: nearestRank(0.5), structuredCloneP95Ms: nearestRank(0.95),
          structuredCloneQuantileMethod: 'nearest-rank: sorted[ceil(p*n)-1]' };
      }, { source, initialTopology: fixture.initialTopology, events: fixture.events, sampleRate: 48_000 });
      const warmup = await page.evaluate(() => globalThis.__antAudioProfile.runFixture());
      const cleanRuns = [];
      for (let replay = 0; replay < 3; replay++) cleanRuns.push(await page.evaluate(() => globalThis.__antAudioProfile.runFixture({ measure: true })));
      for (const row of cleanRuns.slice(1)) assert.deepEqual(row.state, cleanRuns[0].state, 'clean replays reach identical runtime diagnostics');
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
      await cdp.send('Profiler.start');
      const profiled = await page.evaluate(() => globalThis.__antAudioProfile.runFixture({ captureActivity: true }));
      const { profile } = await cdp.send('Profiler.stop');
      await cdp.detach();
      assert.deepEqual(warmup.state, cleanRuns[0].state, 'warmup and clean replays reach identical runtime diagnostics');
      assert.deepEqual(profiled.state, cleanRuns[0].state, 'sampling replay reaches identical runtime diagnostics');
      const processSummary = summarizeCleanRuns(cleanRuns);
      const activeSamples = profiled.activeSamples;
      const activeSummary = activeSamples.length ? { samples: activeSamples.length,
        activeNodesAverageAt60Hz: activeSamples.reduce((sum, value) => sum + value, 0) / activeSamples.length,
        activeNodesMaxAt60Hz: Math.max(...activeSamples) } : null;
      report.cases.push({ seed, arm, scheduleSha256: hash(compressed), scheduleBytesGzip: compressed.byteLength,
        captureSha256: hash(captureBytes), captureTopologyTick: captureTopology.tick, compiler,
        scheduleUnpackParseMsNode: parseMs, baseTopologyFrame: fixture.baseTopologyFrame,
        scheduleContactCount: fixture.contactCount, scheduleTopologyInstallCount: fixture.topologyInstallCount,
        warmupState: warmup.state, cleanProcessTiming: { ...processSummary, processWallMsPerSimulatedSecond: processSummary.processMsMedian / 10 },
        cleanRunDetails: cleanRuns.map(({ processTotalMs, processCalls, processBatches, contactDispatchTotalMs,
          topologyInstallTotalMs, initialTopologyInstallMs, topologyInstallMs }) =>
          ({ processTotalMs, processCalls, processBatches, contactDispatchTotalMs,
            topologyInstallTotalMs, initialTopologyInstallMs, topologyInstallMs })),
        lateEvents: fixture.events.length, strikeCount: fixture.contactCount,
        topologyInstallCount: fixture.topologyInstallCount, ...setup, profiledState: profiled.state,
        activeNodeSummary: activeSummary, cpuProfileProcessMs: null,
        v8SampledFunctions: summarizeProfile(profile).slice(0, 30) });
      console.log(JSON.stringify({ seed, arm, cleanProcessTiming: processSummary, activeNodeSummary: activeSummary,
        topFunctions: summarizeProfile(profile).slice(0, 8) }));
    }
  } finally { await browser.close(); }
  const output = resolve(EVIDENCE, 'ant-local-x-audio-runtime-profile.json');
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${output}`);
}

if (process.argv.includes('--self-test')) {
  const { gzipSync } = await import('node:zlib');
  const schedule = { schema: 'ant-local-x-audio-world-schedule-v1', world: { sampleRate: 48_000, frames: 14_400_000 },
    events: [{ frame: 0, message: { type: 'topology', payload: { id: 'rest' } } },
      { frame: START_FRAME - 1, message: { type: 'topology', payload: { id: 'late-rest' } } },
      { frame: START_FRAME, message: { type: 'strike', payload: {} } },
      { frame: END_FRAME, message: { type: 'topology', payload: { id: 'endpoint' } } }] };
  const parsed = parseSchedule(gzipSync(JSON.stringify(schedule)));
  const fixture = lateFixture(parsed);
  assert.deepEqual(fixture.initialTopology, { id: 'late-rest' });
  assert.equal(fixture.events.length, 1);
  assert.equal(fixture.contactCount, 1);
  assert.equal(fixture.topologyInstallCount, 0);
  assert.deepEqual(summarizeProfile({ nodes: [], samples: [], timeDeltas: [] }), []);
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
