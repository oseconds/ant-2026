import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { executeScenario } from './ant-g-production-candidate-natural.js';
import { descriptiveSpacing, enumeratePlateauMaxima, neighbors8 } from './ant-opportunity-core.js';
import { SurfaceField } from '../src/lib/agents/ant/SurfaceField.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGE = 'docs/ant/evidence/2026-10-30-material-compaction-shielding-screen';
const OUTPUT = resolve(ROOT, 'test-results/ant-material-compaction-shielding-screen');
const SEED = 20261005, SECONDS = 600, N = 96, COUNT = N * N, DOSE = 0.025;
const WINDOWS = [{ start: 280, end: 300 }, { start: 580, end: 600 }];
const SOURCE_FILES = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/MaterialStratigraphy.js', 'src/lib/agents/ant/TrailPlateBirth.js',
  'scripts/ant-g-production-candidate-natural.js', 'scripts/ant-opportunity-core.js'];
const sha = value => createHash('sha256').update(value).digest('hex');
const shieldingScale = layers => 1 - 0.70 * (1 - Math.exp(-layers / 4));
const point = index => ({ x: index % N / 95, y: Math.floor(index / N) / 95 });
const distanceToEntry = index => {
  const p = point(index);
  return Math.hypot(p.x - 0.5, p.y - 0.72);
};

function loadThinner(source) {
  return runInNewContext(source.replace(/^export /gm, '') + '\n({ zhangSuen })').zhangSuen;
}

function readLayer(counts, x, y) {
  return counts[Math.round(y * 95) * N + Math.round(x * 95)] || 0;
}

function quantiles(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const at = p => sorted[Math.round((sorted.length - 1) * p)];
  return { n: sorted.length, min: sorted[0], p10: at(.1), p25: at(.25), median: at(.5),
    p75: at(.75), p90: at(.9), p99: at(.99), max: sorted.at(-1), mean: sorted.reduce((a, b) => a + b, 0) / sorted.length };
}

function components(mask) {
  const ids = new Int32Array(COUNT).fill(-1), sizes = [];
  let id = 0;
  for (let start = 0; start < COUNT; start += 1) if (mask[start] && ids[start] < 0) {
    const queue = [start]; ids[start] = id;
    for (let head = 0; head < queue.length; head += 1) for (const next of neighbors8(queue[head])) {
      if (mask[next] && ids[next] < 0) { ids[next] = id; queue.push(next); }
    }
    sizes.push(queue.length); id += 1;
  }
  return { ids, sizes };
}

function summarizeFrame(controller, supports, E, zhangSuen, recentContacts) {
  const F = zhangSuen(E), S = new Uint8Array(COUNT);
  for (let i = 0; i < COUNT; i += 1) if (F[i] && neighbors8(i).some(j => F[j])) S[i] = 1;
  const surface = controller.surfaceField;
  const C = surface.values.slice(), D = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i += 1) {
    D[i] = Math.fround(surface.sampleSupport(i % N / 95, Math.floor(i / N) / 95, 0.025));
    if (S[i]) assert.equal(supports[i], D[i], `production D readout mismatch at ${controller.simulationTimeMs}/${i}`);
  }
  const strata = controller.materialStratigraphy.getSnapshot().stratigraphy.layerCountByCell;
  const layers = strata.slice();
  const peaks = enumeratePlateauMaxima({ S, values: D }).peaks;
  const componentsF = components(F);
  const grouped = descriptiveSpacing(peaks, componentsF.ids, 0.15);
  const centers = grouped.representatives.map((row, i) => ({ rank: i + 1, index: row.index,
    value: row.value, entryDistance: distanceToEntry(row.index), layers: layers[row.index],
    recentFeet: recentContacts[row.index] || 0, component: componentsF.ids[row.index] }));
  const winner = centers[0] || null, outside = centers.find(row => row.entryDistance > 0.15) || null;
  let surfaceMass = 0, exposedCells = 0, buriedLayerCount = 0, maxLayerCount = 0;
  for (let i = 0; i < COUNT; i += 1) {
    surfaceMass += C[i];
    if (layers[i]) exposedCells += 1;
    buriedLayerCount += Math.max(0, layers[i] - 1);
    maxLayerCount = Math.max(maxLayerCount, layers[i]);
  }
  return { timeSeconds: controller.simulationTimeMs / 1000, surface: { mass: surfaceMass,
    distribution: quantiles(C), totalFootContacts: surface.totalFootContacts,
    mapSha256: sha(Buffer.from(C.buffer, C.byteOffset, C.byteLength)) },
    D: { distribution: quantiles(Array.from(D)), qualifiedDistribution: quantiles(Array.from(D).filter((_, i) => S[i])),
      mapSha256: sha(Buffer.from(D.buffer, D.byteOffset, D.byteLength)) },
    qualification: { E: E.reduce((a, b) => a + b, 0), F: F.reduce((a, b) => a + b, 0),
      S: S.reduce((a, b) => a + b, 0), FComponents: componentsF.sizes.length,
      largestFComponent: Math.max(0, ...componentsF.sizes),
      EMapSha256: sha(Buffer.from(E.buffer, E.byteOffset, E.byteLength)),
      FMapSha256: sha(Buffer.from(F.buffer, F.byteOffset, F.byteLength)),
      SMapSha256: sha(Buffer.from(S.buffer, S.byteOffset, S.byteLength)) },
    material: { plates: controller.materialStratigraphy.plates.length, exposedCells,
      buriedLayerCount, maxLayerCount,
      layerMapSha256: sha(Buffer.from(layers.buffer, layers.byteOffset, layers.byteLength)) },
    opportunities: { candidateRule: 'allocation=max-D; capture=X; read-only', centers: centers.slice(0, 8),
      top2ToTop1: centers.length > 1 && winner.value > 0 ? centers[1].value / winner.value : null,
      strongestOutsideEntry: outside && winner ? { ...outside, ratioToWinner: outside.value / winner.value } : null,
      winnerOverlapLayers: winner?.layers ?? null,
      winnerRecentFeet20s: winner?.recentFeet ?? 0 } };
}

function installArmInstrumentation(controller, treatment, zhangSuen, contactLog, frames) {
  let tickEntryLayers = null, tickId = 0, tickEntryRevision = null, tickSequence = 0;
  const material = controller.materialStratigraphy;
  const originalTick = controller.tick.bind(controller);
  controller.tick = dt => {
    tickId += 1;
    tickSequence = 0;
    const snapshot = material.getSnapshot();
    tickEntryLayers = snapshot.stratigraphy.layerCountByCell;
    tickEntryRevision = snapshot.revision;
    return originalTick(dt);
  };
  const surface = controller.surfaceField;
  const deposit = surface.depositContact.bind(surface);
  surface.depositContact = (x, y) => {
    assert.ok(tickEntryLayers, 'contact write must occur inside a tick');
    const layers = readLayer(tickEntryLayers, x, y);
    const scale = treatment ? shieldingScale(layers) : 1;
    const beforeDose = surface.contactDose;
    const timeMs = controller.simulationTimeMs + 1000 / 60;
    contactLog.count += 1;
    contactLog.layers[layers] = (contactLog.layers[layers] || 0) + 1;
    contactLog.nominalDose += beforeDose;
    contactLog.effectiveDose += beforeDose * scale;
    contactLog.spatial[Math.round(y * 95) * N + Math.round(x * 95)] += 1;
    tickSequence += 1;
    contactLog.rows.push({ tickId, sequence: tickSequence, timeMs, x, y, layers, scale, tickEntryRevision });
    if (scale === 1) return deposit(x, y);
    surface.contactDose = beforeDose * scale;
    try { return deposit(x, y); } finally { surface.contactDose = beforeDose; }
  };
  controller.subscribe(event => {
    if (event.type === 'plate-birth') {
      const currentLayers = material.getSnapshot().stratigraphy.layerCountByCell;
      assert.notStrictEqual(tickEntryLayers, currentLayers, 'same-tick Plate birth replaces the layer map after contact writes');
      contactLog.birthOrder.push({ tickId, afterContactSequence: tickSequence,
        tickEntryRevision, mapReplacedAfterContact: true });
    }
  });
  const build = controller.trailPlateBirth.buildSupportedMask.bind(controller.trailPlateBirth);
  controller.trailPlateBirth.buildSupportedMask = input => {
    const result = build(input);
    const timeSeconds = controller.simulationTimeMs / 1000;
    const window = WINDOWS.find(row => timeSeconds >= row.start - 1 && timeSeconds < row.end);
    if (window) {
      const recent = new Uint32Array(COUNT), minTime = controller.simulationTimeMs - 20000;
      for (let i = contactLog.rows.length - 1; i >= 0; i -= 1) {
        const contact = contactLog.rows[i];
        if (contact.timeMs <= minTime) break;
        recent[Math.round(contact.y * 95) * N + Math.round(contact.x * 95)] += 1;
      }
      const frame = summarizeFrame(controller, result.supports, result.mask, zhangSuen, recent);
      if (timeSeconds >= window.end - 1.1) frame.mapData = { C: Array.from(surface.values),
        D: Array.from({ length: COUNT }, (_, i) => Math.fround(surface.sampleSupport(i % N / 95,
          Math.floor(i / N) / 95, 0.025))),
        layers: Array.from(material.getSnapshot().stratigraphy.layerCountByCell),
        E: Array.from(result.mask), F: Array.from(zhangSuen(result.mask)),
        timeWindowEnd: window.end };
      frames.push({ ...frame,
        contactWindowFeet: contactLog.rows.filter(row => row.timeMs > minTime && row.timeMs <= controller.simulationTimeMs).length });
    }
    return result;
  };
  return { getTickId: () => tickId, getEntryRevision: () => tickEntryRevision };
}

function selfCheck() {
  assert.equal(shieldingScale(0), 1);
  for (const L of [1, 2, 4, 8, 16, 1000]) {
    assert.ok(shieldingScale(L) >= 0.30 && shieldingScale(L) < 1);
  }
  assert.ok(Math.abs(shieldingScale(4) - (1 - 0.70 * (1 - Math.exp(-1)))) < 1e-15);
  let current = new Uint16Array(COUNT); current[100] = 2;
  const entry = current; current = new Uint16Array(current); current[100] = 9;
  assert.notStrictEqual(entry, current, 'material topology rebuild replaces the layer array');
  assert.equal(readLayer(entry, 4 / 95, 1 / 95), 2, 'later array replacement cannot leak into tick-entry reference');
  for (const layers of [0, 1, 2, 4, 8, 16]) assert.ok(DOSE * shieldingScale(layers) <= DOSE);
  const a = new SurfaceField(), b = new SurfaceField();
  for (let i = 0; i < COUNT; i += 1) a.values[i] = b.values[i] = (i % 17) / 34;
  const event = { type: 'FOOT_CONTACT', contacts: [{ legId: 'test', position: { x: .5, y: .5 } }] };
  const responseA = a.applyFootContact(event), responseB = b.applyFootContact(event);
  assert.deepEqual(responseA, responseB);
  assert.deepEqual(a.values, b.values, 'L=0 treatment is exact identity');
  assert.equal(a.totalFootContacts, b.totalFootContacts);
  const c = new SurfaceField(), d = new SurfaceField();
  const responseC = c.applyFootContact(event);
  d.contactDose *= shieldingScale(4);
  const responseD = d.applyFootContact(event);
  assert.deepEqual(responseC, responseD, 'same pre-contact state keeps response unchanged');
  assert.ok(d.values.reduce((sum, value) => sum + value, 0) < c.values.reduce((sum, value) => sum + value, 0));
  assert.equal(c.totalFootContacts, d.totalFootContacts, 'shielding never drops a contact');
}

async function main() {
  selfCheck();
  await mkdir(OUTPUT, { recursive: true });
  await mkdir(resolve(ROOT, PACKAGE), { recursive: true });
  const zhangSuen = loadThinner(await readFile(resolve(ROOT, 'src/lib/agents/ant/TrailPlateBirth.js'), 'utf8'));
  const controllerSource = await readFile(resolve(ROOT, 'src/lib/agents/ant/AntController.js'), 'utf8');
  const contactLoop = controllerSource.indexOf('for (const event of contacts)');
  const contactWrite = controllerSource.indexOf('this.surfaceField.applyFootContact(event)');
  const plateAdvance = controllerSource.indexOf('const births = this.trailPlateBirth.advance');
  const plateAdd = controllerSource.indexOf('this.materialStratigraphy.addPlate(plate)');
  assert.ok(contactLoop < contactWrite && contactWrite < plateAdvance && plateAdvance < plateAdd,
    'tick order keeps all contact writes before Plate birth and stratigraphy update');
  const strataSource = await readFile(resolve(ROOT, 'src/lib/agents/ant/MaterialStratigraphy.js'), 'utf8');
  assert.ok(strataSource.indexOf('const layerCountByCell = new Uint16Array(this.cellCount)')
    < strataSource.indexOf('this.layerCountByCell = layerCountByCell'),
  'material births replace immutable tick-entry layer map with a new typed array');
  const arms = {};
  for (const treatment of [false, true]) {
    const name = treatment ? 'shielded' : 'control', dir = resolve(OUTPUT, name);
    await mkdir(dir, { recursive: true });
    const contactLog = { count: 0, layers: {}, nominalDose: 0, effectiveDose: 0,
      spatial: new Uint32Array(COUNT), rows: [], birthOrder: [] }, frames = [];
    const scenario = await executeScenario(SEED, 'G', SECONDS, dir, null, controller => {
      installArmInstrumentation(controller, treatment, zhangSuen, contactLog, frames);
    });
    const raw = JSON.parse(gunzipSync(await readFile(resolve(dir, `seed${SEED}-G-raw.json.gz`))));
    arms[name] = { scenario, contacts: contactLog, frames, raw };
    console.log(JSON.stringify({ arm: name, wallSeconds: scenario.wallSeconds,
      contacts: contactLog.count, plates: scenario.events.plateBirths }));
  }
  assert.equal(arms.control.scenario.initialStateSha256, arms.shielded.scenario.initialStateSha256);
  const baselineDirectory = resolve(ROOT, 'docs/ant/evidence/2026-10-25-g-production-candidate-review/data');
  const frozenBaselineBytes = await readFile(resolve(baselineDirectory, `seed${SEED}-G-raw.json.gz`));
  assert.equal(sha(frozenBaselineBytes), 'a52dd67cd3cab53e8bbdd6df7bb2e536a211d0a6872ebc03342111c8127f0414');
  assert.equal(sha(await readFile(resolve(OUTPUT, 'control', `seed${SEED}-G-raw.json.gz`))), sha(frozenBaselineBytes),
    'control compressed raw replay is byte-identical to frozen production packet');
  const frozenBaseline = JSON.parse(gunzipSync(frozenBaselineBytes));
  assert.deepEqual(arms.control.raw.positions, frozenBaseline.positions, 'control agent snapshots match frozen production replay');
  assert.deepEqual(arms.control.raw.contactsBySecond, frozenBaseline.contactsBySecond,
    'control contact counts match frozen production replay');
  assert.deepEqual(arms.control.raw.births, frozenBaseline.births, 'control Plate births match frozen production replay');
  assert.equal(arms.control.raw.events.contactStreamSha256, frozenBaseline.events.contactStreamSha256);
  assert.equal(arms.control.raw.events.plateBirthStreamSha256, frozenBaseline.events.plateBirthStreamSha256);
  for (const seconds of [30, 60, 120, 300, 600]) {
    const saved = JSON.parse(gunzipSync(await readFile(resolve(baselineDirectory, `seed${SEED}-G-${seconds}s.json.gz`))));
    const replay = JSON.parse(gunzipSync(await readFile(resolve(OUTPUT, 'control', `seed${SEED}-G-${seconds}s.json.gz`))));
    assert.deepEqual(replay.pheromone, saved.pheromone, `${seconds}s control pheromone map matches frozen checkpoint`);
    assert.deepEqual(replay.surface, saved.surface, `${seconds}s control SurfaceField map matches frozen checkpoint`);
    assert.deepEqual(replay.occupancy, saved.occupancy, `${seconds}s control occupancy matches frozen checkpoint`);
    assert.deepEqual(replay.persistent30sChemicalMask, saved.persistent30sChemicalMask,
      `${seconds}s control persistent mask matches frozen checkpoint`);
  }
  assert.deepEqual(arms.control.raw.positions, arms.shielded.raw.positions,
    'agent snapshots remain identical across matched arms');
  assert.deepEqual(arms.control.raw.contactsBySecond, arms.shielded.raw.contactsBySecond,
    'contact count buckets remain identical across matched arms');
  assert.deepEqual(arms.control.raw.births, arms.shielded.raw.births,
    'Plate births remain identical across matched arms');
  assert.equal(arms.control.raw.events.contactStreamSha256, arms.shielded.raw.events.contactStreamSha256);
  assert.equal(arms.control.raw.events.plateBirthStreamSha256, arms.shielded.raw.events.plateBirthStreamSha256);
  const withoutScale = rows => rows.map(({ scale, tickEntryRevision, ...row }) => row);
  assert.deepEqual(withoutScale(arms.control.contacts.rows), withoutScale(arms.shielded.contacts.rows),
    'contact tick, order, position and layer count remain matched');
  for (const arm of Object.values(arms)) arm.frames = WINDOWS.flatMap(window => arm.frames
    .filter(frame => frame.timeSeconds >= window.start - 1 && frame.timeSeconds < window.end).slice(-20));
  assert.equal(arms.control.scenario.events.individualFeet, arms.control.contacts.count);
  assert.equal(arms.shielded.scenario.events.individualFeet, arms.shielded.contacts.count);
  assert.equal(arms.control.frames.length, 40);
  assert.equal(arms.shielded.frames.length, 40);
  assert.equal(arms.control.contacts.birthOrder.length, arms.control.scenario.events.plateBirths);
  assert.equal(arms.shielded.contacts.birthOrder.length, arms.shielded.scenario.events.plateBirths);
  for (const arm of Object.values(arms)) for (const window of WINDOWS) {
    assert.equal(arm.frames.filter(frame => frame.timeSeconds >= window.start - 1
      && frame.timeSeconds < window.end).length, 20);
  }
  const sampledParity = { exactC: 0, exactD: 0, exactE: 0, exactF: 0, exactLayers: 0, anchors: 40 };
  for (let i = 0; i < 40; i += 1) {
    if (arms.control.frames[i].surface.mapSha256 === arms.shielded.frames[i].surface.mapSha256) sampledParity.exactC += 1;
    if (arms.control.frames[i].D.mapSha256 === arms.shielded.frames[i].D.mapSha256) sampledParity.exactD += 1;
    if (arms.control.frames[i].qualification.EMapSha256 === arms.shielded.frames[i].qualification.EMapSha256) sampledParity.exactE += 1;
    if (arms.control.frames[i].qualification.FMapSha256 === arms.shielded.frames[i].qualification.FMapSha256) sampledParity.exactF += 1;
    if (arms.control.frames[i].material.layerMapSha256 === arms.shielded.frames[i].material.layerMapSha256) sampledParity.exactLayers += 1;
  }
  for (const seconds of [30, 60, 120, 300, 600]) {
    const control = arms.control.scenario.checkpoints.find(row => row.seconds === seconds);
    const shielded = arms.shielded.scenario.checkpoints.find(row => row.seconds === seconds);
    assert.equal(control.rngState, shielded.rngState, `${seconds}s RNG state remains matched`);
    assert.equal(control.rngCalls, shielded.rngCalls, `${seconds}s RNG call count remains matched`);
  }
  for (const arm of Object.values(arms)) {
    assert.ok(arm.contacts.birthOrder.every(row => row.afterContactSequence >= 0 && row.mapReplacedAfterContact));
  }

  const receipt = { schema: 'ant-material-compaction-shielding-screen-v1',
    baseline: { productionMain: '4135d4fb4ab8ec5d46297893fbc9c1c5f4f3e785', researchParent: 'afea7ecc076734a6c9fe8b3ccad7efb11c08c36a',
      branch: 'codex/ant-material-compaction-shielding-screen-20261029', seed: SEED, seconds: SECONDS, audio: 'Off',
      locomotionResistance: 'current 10% production law On in both arms' },
    frozenControl: { path: 'docs/ant/evidence/2026-10-25-g-production-candidate-review/data/seed20261005-G-raw.json.gz',
      sha256: sha(frozenBaselineBytes), rawGzipExact: true, snapshotsAndEventsExact: true,
      checkpointMapsExactAtSeconds: [30, 60, 120, 300, 600] },
    candidate: { s: '1 - 0.70 * (1 - exp(-L / 4))', dose: '0.025 * s(L)',
      responses: Object.fromEntries([0, 1, 2, 4, 8, 16].map(L => [L, { scale: shieldingScale(L), effectiveDose: DOSE * shieldingScale(L) }])) },
    semantics: { tickEntryArrayReference: true, contactTime: 'tick-entry simulation time + 1/60 s',
      observedContactWritesOnly: true, contactRemoval: false, birthOrderSource: 'AntController.tick: contact loop precedes TrailPlateBirth.advance/addPlate',
      noFutureLeakage: { rule: 'each wrapped deposit reads tick-entry layerCountByCell reference; Plate birth builds and assigns a new array after all contact writes',
        sourceOrderOffsets: { contactLoop, contactWrite, plateAdvance, plateAdd },
        sameTickPlateBirths: { control: arms.control.contacts.birthOrder.length, shielded: arms.shielded.contacts.birthOrder.length,
          allReplacedAfterContactLoop: true } },
      D: 'native SurfaceField.sampleSupport(x,y,0.025)', qualifiedFields: 'native TrailPlateBirth mask E, production zhangSuen thinning F, edge-bearing F subset S',
      maxD: 'read-only separated plateau centers in S; no allocation feedback' },
    validity: { selfChecks: { emptyGroundExact: true, layerBoundsAndDoses: true, tickEntryReferenceSurvivesArrayReplacement: true,
      samePrecontactResponseAndContactCount: true }, matchedInitialState: true,
      controlFrozenReplayParity: true,
      controlFrozenCheckpointMapsExactAt30_60_120_300_600s: true,
      matchedArmParity: { agentSnapshotsExact: true, contactBucketsExact: true, contactPayloadHashExact: true,
        perContactTickOrderPositionAndLayersExact: true, plateBirthRecordsExact: true, plateBirthHashExact: true,
        RNGStateAndCallsExactAtAllFiveCheckpoints: true, sampledQualificationAndLayerMapParity: sampledParity },
      contactGroupsRemainObservedPerArm: true,
      contactWriteCountsMatchRunner: arms.control.scenario.events.individualFeet === arms.control.contacts.count
        && arms.shielded.scenario.events.individualFeet === arms.shielded.contacts.count,
      observedBirthsFollowContactLoop: true },
    sources: Object.fromEntries(await Promise.all(SOURCE_FILES.map(async file => [file, sha(await readFile(resolve(ROOT, file)))]))),
    arms: Object.fromEntries(await Promise.all(Object.entries(arms).map(async ([name, data]) => [name, {
      scenario: { seed: data.scenario.seed, arm: data.scenario.arm, seconds: data.scenario.seconds,
        ticks: data.scenario.ticks, initialStateSha256: data.scenario.initialStateSha256,
        wallSeconds: data.scenario.wallSeconds, movement: data.scenario.movement,
        events: data.scenario.events, finalRng: data.scenario.finalRng,
        checkpoints: data.scenario.checkpoints.map(row => ({ seconds: row.seconds, activePopulation: row.activePopulation,
          totalSpawned: row.totalSpawned, totalRetired: row.totalRetired, totalRealizedTravel: row.totalRealizedTravel,
          travelPerActiveAntSecond: row.travelPerActiveAntSecond, contacts: row.contacts, plateCount: row.plateCount,
          field: row.field, surface: row.surface, material: row.material, occupancy: row.occupancy,
          persistent30sCells: row.persistent30sCells, persistent30sRegions: row.persistent30sRegions,
          rngState: row.rngState, rngCalls: row.rngCalls })) },
      contacts: { count: data.contacts.count, layerHistogram: data.contacts.layers,
        nominalDoseSum: data.contacts.nominalDose, effectiveDoseSum: data.contacts.effectiveDose,
        spatialMapSha256: sha(Buffer.from(data.contacts.spatial.buffer)),
        plateBirthOrder: data.contacts.birthOrder,
        contactGroups: data.scenario.events.contactGroups,
        rawContactStreamSha256: data.raw.events.contactStreamSha256,
        plateBirthStreamSha256: data.raw.events.plateBirthStreamSha256 },
      frames: data.frames.map(({ mapData, ...frame }) => frame),
      rawSha256: sha(await readFile(resolve(OUTPUT, name, `seed${SEED}-G-raw.json.gz`)))
    }]))), diagnosticBoundary: 'single seed and two sampled 20 s windows; no population inference; max-D/X remains read-only' };
  await writeFile(resolve(ROOT, PACKAGE, 'MANIPULATION-RECEIPT.json'), JSON.stringify(receipt, null, 2) + '\n');
  await writeFile(resolve(ROOT, PACKAGE, 'matched-shadow.json.gz'), gzipSync(JSON.stringify({
    controlContacts: arms.control.contacts.rows, treatmentContacts: arms.shielded.contacts.rows,
    controlSpatial: Array.from(arms.control.contacts.spatial), treatmentSpatial: Array.from(arms.shielded.contacts.spatial),
    frames: Object.fromEntries(Object.entries(arms).map(([name, arm]) => [name, arm.frames
      .filter(frame => frame.mapData).map(({ timeSeconds, mapData }) => ({ timeSeconds, ...mapData }))]))
  }) + '\n', { level: 9, mtime: 0 }));
  const dataDirectory = resolve(ROOT, PACKAGE, 'data');
  await mkdir(dataDirectory, { recursive: true });
  for (const file of [`seed${SEED}-G-raw.json.gz`, `seed${SEED}-G-300s.json.gz`, `seed${SEED}-G-600s.json.gz`]) {
    await copyFile(resolve(OUTPUT, 'shielded', file), resolve(dataDirectory, `shielded-${file}`));
  }
  console.log(JSON.stringify({ receipt: resolve(ROOT, PACKAGE, 'MANIPULATION-RECEIPT.json'), status: 'capture complete' }));
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/scripts/ant-material-compaction-shielding-screen.js')) {
  if (process.argv.includes('--self-test')) selfCheck();
  else main().catch(error => { console.error(error); process.exitCode = 1; });
}
