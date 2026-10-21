import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AntController } from '../src/lib/agents/ant/AntController.js';

const BASE_OUT = process.env.ANT_LONG_VISUAL_OUT || 'docs/ant/evidence/2026-10-21-long-run-exhibition/visual';
const SEED = 20261005, DT = 1 / 60, DURATION_SECONDS = 7200;
const CAPTURE_SECONDS = [0, 60, 300, 900, 1800, 3600, 7200];
const SOURCE_PATHS = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/renderers/AntRenderer.js', 'scripts/ant-exhibition-long-visual.js'];

if (process.argv.includes('--self-check')) {
  selfCheck();
  console.log('self-check passed');
} else {
  await run();
}

async function run() {
  const historyCapacity = parseHistoryCapacity();
  const out = resolve(historyCapacity === 1024 ? `${BASE_OUT}-capacity-1024` : BASE_OUT);
  const prefixBaseline = historyCapacity === 1024 ? resolve(BASE_OUT) : null;
  assert.equal(await readFile(resolve(out, 'run-manifest.json')).then(() => true, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  }), false, 'refusing to overwrite a completed capture; set ANT_LONG_VISUAL_OUT to a fresh base path');
  await mkdir(out, { recursive: true });
  const started = performance.now();
  const sourceCommit = parseSourceCommit();
  const baselineManifest = historyCapacity === 1024
    ? JSON.parse(await readFile(resolve(prefixBaseline, 'run-manifest.json'), 'utf8')) : null;
  const prefixSeconds = historyCapacity === 1024
    ? CAPTURE_SECONDS.filter(seconds => seconds < baselineManifest.capSnapshot.seconds) : [];
  const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, sha(await readFile(path))])));
  const rng = seededRandom(SEED);
  const controller = new AntController({ random: rng.random });
  await controller.init();
  if (historyCapacity === 1024) {
    controller.trailPlateBirth.maxBirths = 1024;
    controller.materialStratigraphy.maxPlates = 1024;
  }
  assert.equal(controller.getSnapshot().audio.enabled, false, 'audio must remain Off');
  let currentTick = 0, capCapture = null, capSnapshot = null;
  controller.subscribe(event => {
    if (event.type === 'plate-birth' && !capCapture
      && controller.materialStratigraphy.getPlates().length === historyCapacity) {
      capCapture = { tick: currentTick, seconds: event.payload.bornAtSimulationTimeMs / 1000,
        plateCount: historyCapacity };
      capSnapshot = rendererSnapshot(controller.getSnapshot());
    }
  });

  const snapshots = [];
  let capSnapshotRecord = null;
  const minuteMetrics = [];
  let nextCapture = 0, previousTopology = null, wallAtMinuteZero = performance.now();
  let actualTicks = 0, stopError = null;
  try {
    for (let tick = 0; tick <= DURATION_SECONDS * 60; tick += 1) {
      currentTick = tick;
      if (tick) controller.tick(DT);
      actualTicks = tick;
      const seconds = tick / 60;
      if (capCapture && !capSnapshotRecord) {
        const name = `snapshot-cap-${String(historyCapacity).padStart(4, '0')}.json`;
        const bytes = Buffer.from(JSON.stringify(capSnapshot));
        await writeFile(resolve(out, name), bytes);
        capSnapshotRecord = { label: `first ${historyCapacity}-Plate cap`, tick: capCapture.tick,
          seconds: capCapture.seconds, file: name, bytes: bytes.length, sha256: sha(bytes) };
      }
      if (nextCapture < CAPTURE_SECONDS.length && tick === CAPTURE_SECONDS[nextCapture] * 60) {
        const snapshot = rendererSnapshot(controller.getSnapshot());
        const name = `snapshot-${String(seconds).padStart(5, '0')}s.json`;
        const bytes = Buffer.from(JSON.stringify(snapshot));
        if (historyCapacity === 1024 && prefixSeconds.includes(seconds)) {
          const baseline = JSON.parse(await readFile(resolve(prefixBaseline, name), 'utf8'));
          assert.deepEqual(snapshot, baseline, `complete world snapshot must match 256-cap baseline at ${seconds}s`);
        }
        await writeFile(resolve(out, name), bytes);
        snapshots.push({ label: `${seconds}s`, seconds, tick, file: name, bytes: bytes.length, sha256: sha(bytes) });
        nextCapture += 1;
      }
      if (tick % 3600 === 0) {
        const snap = controller.getSnapshot();
        const topo = snap.stratigraphy.stratigraphy;
        const metric = summarizeMinute(snap, tick, previousTopology);
        metric.wallElapsedSeconds = (performance.now() - wallAtMinuteZero) / 1000;
        metric.rssBytes = process.memoryUsage().rss;
        minuteMetrics.push(metric);
        previousTopology = { top: Array.from(topo.topLayerByCell), union: metric.currentUnion };
        delete metric.currentUnion;
        wallAtMinuteZero = performance.now();
        await writeFile(resolve(out, 'minute-metrics.jsonl'), minuteMetrics.map(row => JSON.stringify(row)).join('\n') + '\n');
        console.log(JSON.stringify({ minute: seconds / 60, plates: metric.plateCount,
          birthsThisMinute: metric.birthsThisMinute, wallSeconds: metric.wallElapsedSeconds,
          capReached: metric.birthCapReached }));
      }
    }
  } catch (error) {
    stopError = { name: error?.name || 'Error', message: String(error?.message || error) };
  } finally {
    await controller.destroy();
  }

  const elapsedWallSeconds = (performance.now() - started) / 1000;
  const reachedTarget = actualTicks === DURATION_SECONDS * 60 && !stopError;
  const result = { schemaVersion: 1, purpose: 'Natural long-run ANT visual and material history capture; descriptive only.',
    provenance: { seed: SEED, audio: 'Off', dtSeconds: DT, targetSeconds: DURATION_SECONDS,
      actualTicks, actualSeconds: actualTicks * DT, reachedTarget, wallSeconds: elapsedWallSeconds,
      sourceCommit, sourceHashes, model: 'Fresh default AntController; no forced contacts/births; current laws and RNG unchanged.' },
    snapshots, capSnapshot: capCapture ? { ...capCapture, ...capSnapshotRecord } : null,
    snapshotSchema: 'AntController.getSnapshot() with typed arrays converted to JSON arrays; directly usable as AntRenderer.render(snapshot).',
    minuteMetrics, stopError };
  result.provenance.historyCapacity = historyCapacity;
  result.provenance.capacityOverride = historyCapacity === 1024 ? {
    approvalBoundary: 'User approved increased storage cap for shadow capture only; no production world-law adoption.',
    appliedBeforeFirstTick: true,
    instanceProperties: { 'controller.trailPlateBirth.maxBirths': 1024, 'controller.materialStratigraphy.maxPlates': 1024 },
    snapshotPrefixBaseline: `${BASE_OUT}/snapshot-*.json`,
    comparedSeconds: prefixSeconds,
    comparison: 'Exact full serialized world snapshots; no fields ignored.'
  } : null;
  await writeFile(resolve(out, 'run-manifest.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (reachedTarget) {
    assert.equal(snapshots.length, CAPTURE_SECONDS.length, 'all scheduled visual snapshots captured');
    assert.equal(minuteMetrics.length, DURATION_SECONDS / 60 + 1, 'initial and every minute summarized');
  }
  console.log(JSON.stringify({ result: resolve(out, 'run-manifest.json'), reachedTarget,
    actualSeconds: actualTicks * DT, elapsedWallSeconds, snapshots: snapshots.length, stopError }));
}

function summarizeMinute(snapshot, tick, previousTopology) {
  const material = snapshot.stratigraphy, topology = material.stratigraphy;
  const top = topology.topLayerByCell, histories = topology.plateHistory;
  const plates = material.plates;
  const union = new Uint8Array(top.length), plateRows = [];
  let newArea = 0;
  for (let i = 0; i < plates.length; i += 1) {
    let area = 0, exposedCells = 0;
    const mask = plates[i].mask;
    for (let cell = 0; cell < mask.length; cell += 1) if (mask[cell]) {
      area += 1;
      if (!union[cell]) { union[cell] = 1; newArea += 1; }
      if (top[cell] === i) exposedCells += 1;
    }
    plateRows.push({ id: plates[i].id, bornAtSeconds: plates[i].bornAtSimulationTimeMs / 1000,
      footprintCells: area, exposedCells, buriedCells: area - exposedCells });
  }
  const cohort = (min, max) => {
    const cells = new Uint8Array(top.length);
    for (const plate of plates) if (plate.bornAtSimulationTimeMs / 1000 >= min
      && plate.bornAtSimulationTimeMs / 1000 < max) {
      for (let cell = 0; cell < cells.length; cell += 1) if (plate.mask[cell]) cells[cell] = 1;
    }
    return cells.reduce((sum, value) => sum + value, 0);
  };
  let turnover = null, newlyExposed = null, newlyBuried = null;
  let newlyCovered = union.reduce((sum, value) => sum + value, 0);
  if (previousTopology) {
    turnover = 0; newlyExposed = 0; newlyBuried = 0; newlyCovered = 0;
    for (let i = 0; i < top.length; i += 1) if (top[i] !== previousTopology.top[i]) {
      turnover += 1;
      if (top[i] >= 0) newlyExposed += 1;
      if (previousTopology.top[i] >= 0) newlyBuried += 1;
    }
    for (let i = 0; i < union.length; i += 1) if (union[i] && !previousTopology.union[i]) newlyCovered += 1;
  }
  const birth = snapshot.surfacePlates;
  const field = snapshot.pheromone.values;
  const pheromone = fieldSummary(field);
  const candidate = birth.candidate;
  const minuteEndSeconds = tick / 60;
  const birthsThisMinute = plates.filter(plate => plate.bornAtSimulationTimeMs / 1000 >= minuteEndSeconds - 60
    && plate.bornAtSimulationTimeMs / 1000 < minuteEndSeconds).length;
  return { tick, seconds: minuteEndSeconds, plateCount: plates.length, birthsThisMinute,
    unionFootprintCells: newArea, newlyCoveredCellsThisMinute: newlyCovered, currentUnion: Array.from(union),
    topCellTurnover: turnover, newlyExposedCells: newlyExposed, newlyBuriedCells: newlyBuried,
    exposedCells: histories.reduce((sum, row) => sum + row.exposedCellCount, 0),
    buriedCells: histories.reduce((sum, row) => sum + row.buriedCellCount, 0),
    cohorts: { last5MinutesFootprintCells: cohort(Math.max(0, tick / 60 - 300), tick / 60 + 1),
      last15MinutesFootprintCells: cohort(Math.max(0, tick / 60 - 900), tick / 60 + 1) },
    perPlate: plateRows, pheromone, birthDiagnostics: { limitReached: birth.limitReached,
      qualifiedCandidate: Boolean(candidate?.qualified), birthReady: Boolean(candidate?.birthReady),
      candidateStableSeconds: candidate?.stableSeconds ?? null,
      candidateFootContacts: candidate?.footContacts ?? null,
      repeat: candidate?.repeat ?? null, lastInputDiagnostics: birth.inputDiagnostics,
      globalGapRemainingSeconds: candidate?.globalGapRemainingSeconds ?? null },
    birthCapReached: birth.limitReached || material.diagnostics.maxPlatesReached };
}

function fieldSummary(values) {
  let mass = 0, max = 0, occupied = 0;
  for (const value of values) { mass += value; max = Math.max(max, value); if (value > 1e-6) occupied += 1; }
  return { mass, max, occupiedCells: occupied, sha256: sha(Buffer.from(values.buffer, values.byteOffset, values.byteLength)) };
}

function rendererSnapshot(value) {
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(rendererSnapshot);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rendererSnapshot(v)]));
  return value;
}

function selfCheck() {
  assert.equal(parseHistoryCapacity(['--history-capacity=256']), 256);
  assert.equal(parseHistoryCapacity(['--history-capacity=1024']), 1024);
  assert.throws(() => parseHistoryCapacity(['--history-capacity=257']), /must be 256 or 1024/);
  assert.throws(() => parseHistoryCapacity(['--history-capacity=1024', '--history-capacity=256']), /only be provided once/);
  assert.equal(parseSourceCommit([]), null);
  assert.equal(parseSourceCommit(['--source-commit', 'a'.repeat(40)]), 'a'.repeat(40));
  assert.throws(() => parseSourceCommit(['--source-commit']), /requires a 40-character SHA/);
  const converted = rendererSnapshot({ field: new Float32Array([1, 2]), agents: [{ x: 0.5 }] });
  assert.deepEqual(converted, { field: [1, 2], agents: [{ x: 0.5 }] });
  const makeSnapshot = (plates, top) => ({ stratigraphy: { plates,
    stratigraphy: { topLayerByCell: new Int32Array(top), plateHistory: [] }, diagnostics: {} },
    surfacePlates: { limitReached: false, candidate: null, inputDiagnostics: {} },
    pheromone: { values: new Float32Array(3) } });
  const first = summarizeMinute(makeSnapshot([
    { bornAtSimulationTimeMs: 30000, mask: new Uint8Array([1, 0, 0]) }
  ], [0, -1, -1]), 3600, null);
  assert.equal(first.birthsThisMinute, 1);
  assert.equal(first.unionFootprintCells, 1);
  const second = summarizeMinute(makeSnapshot([
    { bornAtSimulationTimeMs: 30000, mask: new Uint8Array([1, 0, 0]) },
    { bornAtSimulationTimeMs: 60000, mask: new Uint8Array([0, 1, 0]) },
    { bornAtSimulationTimeMs: 90000, mask: new Uint8Array([1, 0, 0]) }
  ], [2, 1, -1]), 7200, { top: [0, -1, -1], union: first.currentUnion });
  assert.equal(second.birthsThisMinute, 2);
  assert.equal(second.unionFootprintCells, 2);
  assert.equal(second.newlyCoveredCellsThisMinute, 1);
  assert.equal(second.topCellTurnover, 2);
  const third = summarizeMinute(makeSnapshot([
    { bornAtSimulationTimeMs: 30000, mask: new Uint8Array([1, 0, 0]) },
    { bornAtSimulationTimeMs: 60000, mask: new Uint8Array([0, 1, 0]) },
    { bornAtSimulationTimeMs: 90000, mask: new Uint8Array([1, 0, 0]) }
  ], [2, 1, -1]), 10800, { top: [2, 1, -1], union: second.currentUnion });
  assert.equal(third.birthsThisMinute, 0);
  assert.equal(third.newlyCoveredCellsThisMinute, 0);
  assert.equal(third.topCellTurnover, 0);
}

function parseHistoryCapacity(args = process.argv.slice(2)) {
  const options = args.filter(arg => arg.startsWith('--history-capacity='));
  assert.ok(options.length <= 1, '--history-capacity may only be provided once');
  if (!options.length) return 256;
  const value = Number(options[0].slice('--history-capacity='.length));
  assert.ok(value === 256 || value === 1024, '--history-capacity must be 256 or 1024');
  return value;
}

function parseSourceCommit(args = process.argv.slice(2)) {
  const index = args.indexOf('--source-commit');
  if (index === -1) return null;
  const value = args[index + 1];
  assert.match(value || '', /^[0-9a-f]{40}$/i, '--source-commit requires a 40-character SHA');
  return value;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return { random() { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; }, state: () => value };
}
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
