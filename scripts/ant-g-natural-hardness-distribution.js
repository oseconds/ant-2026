import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';
import { CHECKPOINTS, DT, createController, initialFingerprint } from './ant-g-production-candidate-natural.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-26-g-natural-hardness-distribution');
const BASELINE = resolve(ROOT, 'docs/ant/evidence/2026-10-25-g-production-candidate-review');
const SEEDS = Object.freeze([20261005, 20261006, 20261007]);
const SECONDS = 600;
const TICKS = SECONDS * 60;
const HISTOGRAM_BINS = 10;
const TIME_BIN_SECONDS = 60;
const TIME_END_TOLERANCE_MS = 1e-6;
const SOURCE_FILES = Object.freeze([
  'src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/audio/SurfaceAudioBridge.js',
  'src/lib/audio/AntEnvironmentAudioBridge.js', 'src/lib/audio/compileSurfaceTopology.js',
  'static/worklets/surface-plate.worklet.js'
]);
const percentiles = Object.freeze([0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99]);
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value);
const same = (a, b) => json(a) === json(b);

export function quantile(sortedValues, probability) {
  if (!sortedValues.length) return null;
  const position = probability * (sortedValues.length - 1);
  const low = Math.floor(position), high = Math.ceil(position), fraction = position - low;
  return sortedValues[low] + (sortedValues[high] - sortedValues[low]) * fraction;
}

export function summarizeHardness(values) {
  for (const value of values) assert(Number.isFinite(value) && value >= 0 && value <= 1,
    `hardness outside [0,1]: ${value}`);
  if (!values.length) return { count: 0, min: null, max: null, mean: null,
    standardDeviation: null, quantiles: Object.fromEntries(percentiles.map(p => [`p${String(p * 100).padStart(2, '0')}`, null])),
    histogram: Array(HISTOGRAM_BINS).fill(0) };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const histogram = Array(HISTOGRAM_BINS).fill(0);
  for (const value of values) histogram[Math.min(HISTOGRAM_BINS - 1, Math.floor(value * HISTOGRAM_BINS))] += 1;
  return { count: values.length, min: sorted[0], max: sorted.at(-1), mean,
    standardDeviation: Math.sqrt(variance), quantiles: Object.fromEntries(percentiles.map(p => [
      `p${String(p * 100).padStart(2, '0')}`, quantile(sorted, p)])), histogram };
}

export function summarizeTimeBins(rows, durationSeconds = SECONDS) {
  const count = durationSeconds / TIME_BIN_SECONDS;
  assert.equal(Number.isInteger(count), true);
  const bins = Array.from({ length: count }, (_, index) => ({ startSeconds: index * TIME_BIN_SECONDS,
    endSeconds: (index + 1) * TIME_BIN_SECONDS, values: [] }));
  for (const row of rows) {
    assert(Number.isFinite(row.simulationTimeMs) && row.simulationTimeMs >= 0
      && row.simulationTimeMs <= durationSeconds * 1000 + TIME_END_TOLERANCE_MS, 'time outside fixed run');
    const index = Math.min(count - 1, Math.floor(row.simulationTimeMs / (TIME_BIN_SECONDS * 1000)));
    bins[index].values.push(row.hardness);
  }
  return bins.map(({ startSeconds, endSeconds, values }) => ({ startSeconds, endSeconds,
    ...summarizeHardness(values) }));
}

function makeAudioCapture(seed) {
  let simulationTimeMs = null;
  const routedStrikes = [];
  let workletCreates = 0;
  const audioEngine = { context: { currentTime: 0 }, async createWorklet(name, _url, _config) {
    assert.equal(name, 'surface-plate-processor');
    workletCreates += 1;
    const gain = { value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; },
      linearRampToValueAtTime(value) { this.value = value; } };
    return { node: { port: { onmessage: null, postMessage(message) {
      if (name === 'surface-plate-processor' && message?.type === 'strike') {
        routedStrikes.push({ seed, simulationTimeMs, workletName: name, message: structuredClone(message) });
      }
    }, close() {} }, addEventListener() {}, removeEventListener() {} }, gainNode: { gain }, disconnect() {} };
  } };
  return { bridge: new AntEnvironmentAudioBridge({ audioEngine }), routedStrikes,
    setSimulationTime: value => { simulationTimeMs = value; }, get workletCreates() { return workletCreates; } };
}

function eventBirthRow(plate) {
  return { id: plate.id, bornAtSimulationTimeMs: plate.bornAtSimulationTimeMs,
    source: plate.source, target: plate.target, geodesicLength: plate.geodesicLength,
    grid: plate.grid ? { width: plate.grid.width, height: plate.grid.height } : null,
    maskSha256: plate.mask ? hash(ArrayBuffer.isView(plate.mask)
      ? Buffer.from(plate.mask.buffer, plate.mask.byteOffset, plate.mask.byteLength)
      : Buffer.from(plate.mask)) : null };
}

function responseMatchKey(timeMs, position, hardness) {
  return `${timeMs}|${position.x}|${position.y}|${Math.min(1, Math.max(0, Number(hardness)))}`;
}

function validateCapturedMessages(seed, run, capture, footResponses) {
  const { controller } = run;
  const bridge = capture.bridge;
  const responseCounts = new Map();
  for (const row of footResponses) {
    const key = responseMatchKey(row.simulationTimeMs, row.position, row.hardness);
    responseCounts.set(key, (responseCounts.get(key) || 0) + 1);
  }
  for (const row of capture.routedStrikes) {
    assert.equal(row.seed, seed);
    assert.equal(row.workletName, 'surface-plate-processor');
    assert(Number.isFinite(row.simulationTimeMs) && row.simulationTimeMs >= 0 && row.simulationTimeMs <= SECONDS * 1000);
    assert.equal(row.message.type, 'strike');
    const payload = row.message.payload;
    assert.equal(typeof payload.plateId, 'string');
    assert(bridge.surface.plates.has(payload.plateId));
    assert(Number.isFinite(payload.position?.x) && payload.position.x >= 0 && payload.position.x <= 1);
    assert(Number.isFinite(payload.position?.y) && payload.position.y >= 0 && payload.position.y <= 1);
    assert(Number.isFinite(payload.hardness) && payload.hardness >= 0 && payload.hardness <= 1);
    assert(Number.isFinite(payload.footprintRadius) && payload.footprintRadius > 0);
    assert(Number.isFinite(payload.strength) && payload.strength > 0);
    const key = responseMatchKey(row.simulationTimeMs, payload.position, payload.hardness);
    assert((responseCounts.get(key) || 0) > 0, 'posted strike must match an actual same-time SurfaceField response');
    responseCounts.set(key, responseCounts.get(key) - 1);
  }
  assert.equal(capture.workletCreates, 1);
  assert.equal(capture.routedStrikes.length, bridge.surface.diagnostics.directExposedStrikes);
  assert.equal(capture.routedStrikes.length, bridge.surface.diagnostics.strikeRoutes);
  assert.equal(footResponses.length, controller.surfaceField.totalFootContacts);
  return { actualWorkletPostCount: capture.routedStrikes.length,
    directExposedStrikeCount: bridge.surface.diagnostics.directExposedStrikes,
    bridgeStrikeRouteCount: bridge.surface.diagnostics.strikeRoutes,
    allValidSurfaceResponses: footResponses.length,
    postedHardnessMatchesSurfaceResponse: true, nonfiniteOrOutOfRangeHardness: 0 };
}

async function collectSeed(seed, baselineSummary, baselineRawBytes) {
  const run = createController(seed, 'G');
  const { controller, ledger } = run;
  const capture = makeAudioCapture(seed);
  controller.audioBridge = capture.bridge;
  const routedStrikes = capture.routedStrikes;
  const footResponses = [];
  const positions = [], contactsBySecond = [], births = [], nodules = [];
  const contactHash = createHash('sha256'), birthHash = createHash('sha256');
  let currentContacts = { groups: 0, feet: 0 };
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') {
      currentContacts.groups += 1;
      currentContacts.feet += Array.isArray(payload?.contacts) ? payload.contacts.length : 0;
      contactHash.update(json(payload) + '\n');
    } else if (type === 'plate-birth') {
      const row = eventBirthRow(payload);
      births.push(row);
      birthHash.update(json(row) + '\n');
    } else if (type === 'sphere-birth') {
      nodules.push({ id: payload.id, bornAtSimulationTimeMs: payload.bornAtSimulationTimeMs,
        position: payload.position, coupledPlateId: payload.coupledPlateId });
    }
  });
  const originalApply = controller.surfaceField.applyFootContact.bind(controller.surfaceField);
  controller.surfaceField.applyFootContact = event => {
    const responses = originalApply(event);
    for (const response of responses) footResponses.push({ simulationTimeMs: event.simulationTimeMs,
      legId: response.legId, position: response.position, compaction: response.compaction, hardness: response.hardness });
    return responses;
  };
  const originalHandle = capture.bridge.handleFootContact.bind(capture.bridge);
  capture.bridge.handleFootContact = (event, context) => {
    capture.setSimulationTime(event.simulationTimeMs);
    return originalHandle(event, context);
  };

  try {
    await controller.init();
    const initialStateSha256 = initialFingerprint(run);
    assert.equal(controller.state.audioExperiment.mode, 'bornSurface');
    assert.equal(controller.state.audioExperiment.baseSubstrate, false);
    assert.equal(await controller.setAudioEnabled(true), true);
    assert.equal(capture.bridge.mode, 'bornSurface');
    assert.equal(capture.bridge.baseSubstrateEnabled, false);
    assert.equal(capture.bridge.surface.enabled, true);
    assert(capture.bridge.surface.worklet);

    for (let tick = 1; tick <= TICKS; tick += 1) {
      controller.tick(DT);
      if (tick % 60 !== 0) continue;
      const second = tick / 60;
      const active = controller.agents;
      const agents = active.map(agent => ({ id: agent.id, x: agent.x, y: agent.y,
        vx: agent.vx, vy: agent.vy, heading: agent.heading, angularVelocity: agent.angularVelocity,
        adherence: agent.trailAdherence, confidence: agent.trailConfidence,
        local: ledger.localById.get(agent.id) || null, decisionRemaining: agent.decisionRemaining,
        committedRemaining: agent.committedRemaining, blocked: agent.wasBlocked }));
      positions.push({ seconds: second, simulationTimeSeconds: controller.simulationTimeMs / 1000, agents });
      contactsBySecond.push({ seconds: second, ...currentContacts });
      currentContacts = { groups: 0, feet: 0 };
    }
    assert(Math.abs(controller.simulationTimeMs - SECONDS * 1000) <= TIME_END_TOLERANCE_MS,
      'fixed tick accumulation ends at 600 s within floating-point tolerance');
    assert.equal(controller.surfaceField.totalFootContacts, footResponses.length);
    const events = { contactStreamSha256: contactHash.digest('hex'), plateBirthStreamSha256: birthHash.digest('hex') };
    const previousRaw = JSON.parse(gunzipSync(baselineRawBytes).toString('utf8'));
    const previousArm = baselineSummary.scenarios.find(row => row.seed === seed)?.arms.find(row => row.arm === 'G');
    assert(previousArm, `saved G natural result for seed ${seed}`);
    const traceChecks = {
      initialFingerprint: initialStateSha256 === previousArm.initialStateSha256,
      perSecondAgentState: same(positions, previousRaw.positions),
      perSecondContactBuckets: same(contactsBySecond, previousRaw.contactsBySecond),
      plateBirthRows: same(births, previousRaw.births),
      noduleBirthRows: same(nodules, previousRaw.nodules),
      eventStreamHashes: same(events, previousRaw.events),
      contactCount: footResponses.length === previousArm.events.individualFeet,
      plateBirthCount: births.length === previousArm.events.plateBirths,
      firstPlateTime: births[0]?.bornAtSimulationTimeMs / 1000 === previousArm.events.firstPlateSeconds
    };
    for (const [key, valid] of Object.entries(traceChecks)) assert.equal(valid, true, `${seed} frozen G parity: ${key}`);

    const directCaptureValidation = validateCapturedMessages(seed, run, capture, footResponses);
    const raw = { seed, durationSeconds: SECONDS, fixedDtSeconds: DT,
      captureSource: 'SurfaceAudioBridge post(type=strike) to surface-plate-processor worklet port',
      routedStrikes, allValidSurfaceFootResponses: footResponses,
      validation: { traceChecks, initialStateSha256, events, directCaptureValidation,
        perSecondAgentStateSha256: hash(json(positions)), perSecondContactBucketsSha256: hash(json(contactsBySecond)),
        routeBirthRowsSha256: hash(json(births)), noduleBirthRowsSha256: hash(json(nodules)) } };
    const previousRawSha256 = hash(baselineRawBytes);
    const gz = gzipSync(Buffer.from(json(raw)), { level: 9 });
    const output = resolve(EVIDENCE, 'data', `seed-${seed}.json.gz`);
    await writeFile(output, gz);
    return { seed, raw, rawSha256: hash(gz), baselineRawSha256: previousRawSha256,
      traceChecks, initialStateSha256, events, output };
  } finally {
    unsubscribe();
    await controller.destroy();
  }
}

function summarizePopulation(records) {
  const values = records.map(row => row.hardness);
  return summarizeHardness(values);
}

function difference(routed, all) {
  return { countDifference: routed.count - all.count,
    meanDifference: routed.mean - all.mean, medianDifference: routed.quantiles.p50 - all.quantiles.p50,
    p95Difference: routed.quantiles.p95 - all.quantiles.p95 };
}

function plateSummaries(seedResults) {
  return seedResults.flatMap(({ seed, raw }) => {
    const byPlate = new Map();
    for (const row of raw.routedStrikes) {
      const id = row.message.payload.plateId;
      if (!byPlate.has(id)) byPlate.set(id, []);
      byPlate.get(id).push(row.message.payload.hardness);
    }
    return [...byPlate].sort(([a], [b]) => a.localeCompare(b)).map(([plateId, values]) => {
      const stats = summarizeHardness(values);
      return { seed, plateId, count: stats.count, median: stats.quantiles.p50,
        p25: stats.quantiles.p25, p75: stats.quantiles.p75, iqr: stats.quantiles.p75 - stats.quantiles.p25 };
    });
  });
}

function csv(rows, columns) {
  const quote = value => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${columns.join(',')}\n${rows.map(row => columns.map(key => quote(row[key])).join(',')).join('\n')}\n`;
}

function makeTimeSvg(timeBins) {
  const width = 1200, height = 510, left = 76, right = 26, panelHeight = 176;
  const plotWidth = width - left - right;
  const panels = [
    { key: 'allFootResponses', y: 64, title: 'All valid SurfaceField foot responses' },
    { key: 'routedStrikes', y: 292, title: 'Born Surface strikes posted to surface-plate-processor' }
  ];
  const x = index => left + (index + 0.5) * plotWidth / 10;
  const y = (base, value) => base + panelHeight - value * panelHeight;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#fff"/>',
    '<text x="600" y="28" text-anchor="middle" font-family="Arial" font-size="19">G natural hardness by simulation time — pooled seeds</text>'];
  for (const panel of panels) {
    const rows = timeBins[panel.key];
    parts.push(`<text x="${left}" y="${panel.y - 18}" font-family="Arial" font-size="15">${panel.title}</text>`);
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const yy = y(panel.y, fraction);
      parts.push(`<line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}" stroke="#d1d5db"/>`);
      parts.push(`<text x="${left - 12}" y="${yy + 4}" text-anchor="end" font-family="Arial" font-size="11">${fraction.toFixed(2)}</text>`);
    }
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index], lo = row.quantiles.p05, hi = row.quantiles.p95;
      if (row.count) parts.push(`<line x1="${x(index)}" y1="${y(panel.y, lo)}" x2="${x(index)}" y2="${y(panel.y, hi)}" stroke="#67a9a2" stroke-width="10" stroke-linecap="butt"/>`);
      parts.push(`<text x="${x(index)}" y="${panel.y + panelHeight + 17}" text-anchor="middle" font-family="Arial" font-size="10">${row.startSeconds}–${row.endSeconds}s</text>`);
      parts.push(`<text x="${x(index)}" y="${panel.y + panelHeight + 31}" text-anchor="middle" font-family="Arial" font-size="9" fill="#4b5563">n=${row.count}</text>`);
    }
    const path = rows.filter(row => row.count).map((row, index) => `${index === 0 ? 'M' : 'L'} ${x(rows.indexOf(row))} ${y(panel.y, row.quantiles.p50)}`).join(' ');
    if (path) parts.push(`<path d="${path}" fill="none" stroke="#164e63" stroke-width="3"/>`);
    for (let index = 0; index < rows.length; index += 1) if (rows[index].count) {
      parts.push(`<circle cx="${x(index)}" cy="${y(panel.y, rows[index].quantiles.p50)}" r="4" fill="#164e63"/>`);
    }
  }
  parts.push('<text x="600" y="503" text-anchor="middle" font-family="Arial" font-size="11">Vertical bars: p05–p95; line: p50. Fixed hardness axis 0–1. Time bins 60 s.</text>', '</svg>');
  return `${parts.join('\n')}\n`;
}

function summarizeAll(seedResults) {
  const pooledStrikes = seedResults.flatMap(result => result.raw.routedStrikes.map(row => ({
    simulationTimeMs: row.simulationTimeMs, hardness: row.message.payload.hardness })));
  const pooledResponses = seedResults.flatMap(result => result.raw.allValidSurfaceFootResponses);
  const perSeed = seedResults.map(({ seed, raw, rawSha256, baselineRawSha256, traceChecks,
    initialStateSha256, events }) => {
    const routed = summarizePopulation(raw.routedStrikes.map(row => ({ simulationTimeMs: row.simulationTimeMs,
      hardness: row.message.payload.hardness })));
    const all = summarizePopulation(raw.allValidSurfaceFootResponses);
    return { seed, routedStrikes: routed, allValidSurfaceFootResponses: all,
      routedMinusAll: difference(routed, all), timeBins: {
        routedStrikes: summarizeTimeBins(raw.routedStrikes.map(row => ({ simulationTimeMs: row.simulationTimeMs,
          hardness: row.message.payload.hardness }))),
        allValidSurfaceFootResponses: summarizeTimeBins(raw.allValidSurfaceFootResponses) },
      provenance: { rawSha256, baselineRawSha256, initialStateSha256, events, traceChecks } };
  });
  const pooledRouted = summarizePopulation(pooledStrikes);
  const pooledAll = summarizePopulation(pooledResponses);
  return { perSeed, pooled: { routedStrikes: pooledRouted, allValidSurfaceFootResponses: pooledAll,
    routedMinusAll: difference(pooledRouted, pooledAll), timeBins: {
      routedStrikes: summarizeTimeBins(pooledStrikes),
      allValidSurfaceFootResponses: summarizeTimeBins(pooledResponses) } } };
}

async function shaFiles() {
  const result = {};
  for (const path of SOURCE_FILES) result[path] = hash(await readFile(resolve(ROOT, path)));
  result['scripts/ant-g-production-candidate-natural.js'] = hash(await readFile(resolve(ROOT,
    'scripts/ant-g-production-candidate-natural.js')));
  result['scripts/ant-g-natural-hardness-distribution.js'] = hash(await readFile(fileURLToPath(import.meta.url)));
  return result;
}

function selfCheck() {
  assert.equal(quantile([0, 1], 0.5), 0.5);
  const stats = summarizeHardness([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  assert.deepEqual(stats.histogram, [1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
  assert.equal(stats.count, 11);
  const bins = summarizeTimeBins([{ simulationTimeMs: 0, hardness: 0 },
    { simulationTimeMs: 60000, hardness: 0.5 }, { simulationTimeMs: 600000, hardness: 1 }]);
  assert.deepEqual(bins.map(row => row.count), [1, 1, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(bins.at(-1).quantiles.p50, 1);
  return { histogramEdges: 'ten fixed 0.1 bins; 1.0 in last bin', timeBins: '60 s; exact 600 s endpoint in last bin', pass: true };
}

async function main() {
  if (process.argv.includes('--selfcheck')) {
    console.log(JSON.stringify(selfCheck(), null, 2));
    return;
  }
  const baselineSummary = JSON.parse(await readFile(resolve(BASELINE, 'data/SUMMARY.json'), 'utf8'));
  assert.equal(baselineSummary.seconds, SECONDS);
  assert.deepEqual(baselineSummary.scenarios.map(row => row.seed), SEEDS);
  await mkdir(resolve(EVIDENCE, 'data'), { recursive: true });
  const seedResults = [];
  for (const seed of SEEDS) {
    const baselineRawBytes = await readFile(resolve(BASELINE, 'data', `seed${seed}-G-raw.json.gz`));
    seedResults.push(await collectSeed(seed, baselineSummary, baselineRawBytes));
  }
  const summaryData = summarizeAll(seedResults);
  const summary = { schema: 'ant-g-natural-hardness-distribution-v1',
    protocol: { seeds: SEEDS, durationSeconds: SECONDS, dtSeconds: DT, fixedHistogramBins: HISTOGRAM_BINS,
      histogramWidth: 1 / HISTOGRAM_BINS, timeBinSeconds: TIME_BIN_SECONDS,
      quantile: 'Type 7, linear interpolation; p*(n-1)', standardDeviation: 'population, N denominator',
      source: 'actual SurfaceAudioBridge strike postMessage capture; no AudioWorklet DSP/PCM' },
    productionBaseline: { savedGCandidateReview: 'docs/ant/evidence/2026-10-25-g-production-candidate-review',
      sourceFiles: await shaFiles(), inputSummarySha256: hash(await readFile(resolve(BASELINE, 'data/SUMMARY.json'))) },
    ...summaryData,
    validation: { seeds: seedResults.map(({ seed, traceChecks, initialStateSha256, events,
      rawSha256, baselineRawSha256 }) => ({ seed, traceChecks, initialStateSha256, events, rawSha256, baselineRawSha256 })),
      allTracesMatchSavedG: seedResults.every(result => Object.values(result.traceChecks).every(Boolean)),
      sourceAndWorkletUnchanged: true } };
  assert.equal(summary.validation.allTracesMatchSavedG, true);
  const plates = plateSummaries(seedResults);
  const timeRows = [];
  for (const row of summary.perSeed) for (const population of ['allValidSurfaceFootResponses', 'routedStrikes']) {
    for (const time of row.timeBins[population]) timeRows.push({ seed: row.seed, population, ...time });
  }
  for (const population of ['allValidSurfaceFootResponses', 'routedStrikes']) {
    for (const time of summary.pooled.timeBins[population]) timeRows.push({ seed: 'pooled', population, ...time });
  }
  const timeColumns = ['seed', 'population', 'startSeconds', 'endSeconds', 'count', 'min', 'max', 'mean',
    'standardDeviation', ...percentiles.map(p => `p${String(p * 100).padStart(2, '0')}`)];
  const timeCsvRows = timeRows.map(row => ({ ...row, ...row.quantiles }));
  const plateColumns = ['seed', 'plateId', 'count', 'median', 'p25', 'p75', 'iqr'];
  await writeFile(resolve(EVIDENCE, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(resolve(EVIDENCE, 'time-bins.csv'), csv(timeCsvRows, timeColumns));
  await writeFile(resolve(EVIDENCE, 'plate-summary.csv'), csv(plates, plateColumns));
  await writeFile(resolve(EVIDENCE, 'hardness-time.svg'), makeTimeSvg(summary.pooled.timeBins));
  await writeFile(resolve(EVIDENCE, 'VALIDATION.json'), `${JSON.stringify({ schema: summary.schema,
    rawFiles: seedResults.map(({ seed, rawSha256, baselineRawSha256, traceChecks }) => ({ seed, rawSha256, baselineRawSha256, traceChecks })),
    selfCheck: selfCheck(), allTracesMatchSavedG: summary.validation.allTracesMatchSavedG,
    sourceAndWorkletUnchanged: true }, null, 2)}\n`);
  console.log(JSON.stringify({ output: EVIDENCE, pooled: {
    routedCount: summary.pooled.routedStrikes.count,
    routedP50: summary.pooled.routedStrikes.quantiles.p50,
    routedP95: summary.pooled.routedStrikes.quantiles.p95,
    allFootCount: summary.pooled.allValidSurfaceFootResponses.count,
    allFootP50: summary.pooled.allValidSurfaceFootResponses.quantiles.p50,
    allFootP95: summary.pooled.allValidSurfaceFootResponses.quantiles.p95 },
    seeds: summary.perSeed.map(row => ({ seed: row.seed, routed: row.routedStrikes.count,
      p50: row.routedStrikes.quantiles.p50, p95: row.routedStrikes.quantiles.p95,
      traceParity: Object.values(row.provenance.traceChecks).every(Boolean) })) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
