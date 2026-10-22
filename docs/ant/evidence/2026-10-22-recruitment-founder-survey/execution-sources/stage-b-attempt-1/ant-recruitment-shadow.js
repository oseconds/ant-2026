import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE = 'src/lib/agents/ant/AntController.js';
const HEADING_EXPR = 'SPAWN_HEADING + signed(this.random) * SPAWN_HEADING_SPREAD';
const TICK_END = `if (this.nextSpawnTimeMs !== null && this.simulationTimeMs + 1e-9 >= this.nextSpawnTimeMs) {\n            this.spawnNextAnt();\n        }\n    }\n\n    spawnNextAnt()`;
const SOURCE_PATHS = [SOURCE, 'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/LocalOccupancy.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GaitController.js',
  'src/lib/agents/ant/BodyPoseController.js', 'src/lib/agents/ant/GasterDeposition.js',
  'src/lib/agents/ant/ColonyActivation.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/agents/ant/TrailPlateBirth.js', 'src/lib/agents/ant/MaterialStratigraphy.js'];
const DT = 1 / 60;
const VARIANTS = new Set(['baseline', 'rotate90', 'reverse', 'isotropic', 'pheromoneDirect', 'pheromoneSlow']);
const CONDITIONED = new Set(['pheromoneDirect', 'pheromoneSlow']);
const POLICY_RADII = [0.06, 0.09, 0.12];
const MILESTONES = new Set([30, 60, 120, 300, 600, 900, 1800]);
const CLI = new Map(process.argv.slice(2).map(arg => {
  const i = arg.indexOf('='); return i < 0 ? [arg, true] : [arg.slice(0, i), arg.slice(i + 1)];
}));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

export function measurePheromoneDirection(field) {
  let sx = 0, sy = 0, total = 0;
  for (let sector = 0; sector < 16; sector += 1) {
    const angle = Math.PI * 2 * sector / 16;
    let weight = 0;
    for (const radius of POLICY_RADII) {
      const value = field?.sample?.(0.5 + Math.cos(angle) * radius, 0.72 + Math.sin(angle) * radius) ?? 0;
      const concentration = Number.isFinite(value) ? Math.max(0, value) : 0;
      weight += concentration / (concentration + 0.04) / POLICY_RADII.length;
    }
    sx += weight * Math.cos(angle); sy += weight * Math.sin(angle); total += weight;
  }
  const magnitude = Math.hypot(sx, sy), R = total > 0 ? Math.min(1, magnitude / total) : 0;
  if (total <= 0 || R <= 1e-9) return { x: 0, y: 0, R: 0, angle: null, totalWeight: total };
  return { x: sx / total, y: sy / total, R, angle: Math.atan2(sy, sx), totalWeight: total };
}

export function filterPheromoneDirection(previous, q, dtSeconds) {
  const alpha = 1 - Math.exp(-dtSeconds / 45);
  return { x: (1 - alpha) * (previous?.x || 0) + alpha * q.x,
    y: (1 - alpha) * (previous?.y || 0) + alpha * q.y };
}

export function policyWrapAngle(angle) { return ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }

export function conditionedHeading(draw, vector, spread = 0.3) {
  const R = Math.min(1, Math.hypot(vector?.x || 0, vector?.y || 0));
  if (R <= 1e-9) return { heading: -Math.PI + draw * Math.PI * 2, R: 0, angle: null, halfSpread: Math.PI };
  const angle = Math.atan2(vector.y, vector.x), halfSpread = Math.PI - (Math.PI - spread) * R;
  return { heading: policyWrapAngle(angle + (draw * 2 - 1) * halfSpread), R, angle, halfSpread };
}

export async function makeControllerClass(variant = 'baseline') {
  assert.ok(VARIANTS.has(variant), `unknown variant: ${variant}`);
  const path = resolve(ROOT, SOURCE), original = await readFile(path, 'utf8');
  assert.equal(original.split(HEADING_EXPR).length - 1, 1, 'production heading expression must occur exactly once');
  const replacement = `__shadowHeading(this.random(), SPAWN_HEADING, SPAWN_HEADING_SPREAD, ${JSON.stringify(variant)}, this)`;
  const importsResolved = original.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,
    (_all, before, specifier, after) => before + pathToFileURL(resolve(dirname(path), specifier)).href + after).replace(/\r\n/g, '\n');
  assert.equal(importsResolved.split(HEADING_EXPR).length - 1, 1, 'production heading expression must occur exactly once');
  let source = importsResolved.replace(HEADING_EXPR, replacement);
  if (CONDITIONED.has(variant)) {
    assert.equal(source.split(TICK_END).length - 1, 1, 'tick completion boundary must occur exactly once');
    source = source.replace(TICK_END, TICK_END.replace('\n    }\n\n    spawnNextAnt()',
      `\n        __shadowConditionTick(this.field, dt, this, ${JSON.stringify(variant)});\n    }\n\n    spawnNextAnt()`));
  }
  const sharedPolicy = [measurePheromoneDirection, filterPheromoneDirection, conditionedHeading, policyWrapAngle].map(fn => fn.toString()).join('\n');
  const headingPolicy = `const POLICY_RADII = [0.06, 0.09, 0.12];\n` + sharedPolicy + `\nfunction __shadowHeading(draw, heading, spread, variant, controller) {\n` +
    `  if (variant === 'pheromoneDirect' || variant === 'pheromoneSlow') {\n` +
    `    const input = controller.__conditionState;\n` +
    `    const result = conditionedHeading(draw, input?.vector, spread);\n` +
    `    controller.__lastHeadingEvidence = { draw, ...result, input: input ? JSON.parse(JSON.stringify(input)) : null };\n` +
    `    return result.heading;\n` +
    `  }\n` +
    `  let result;\n` +
    `  if (variant === 'rotate90') result = heading + Math.PI / 2 + (draw * 2 - 1) * spread;\n` +
    `  else if (variant === 'reverse') result = heading + Math.PI + (draw * 2 - 1) * spread;\n` +
    `  else if (variant === 'isotropic') result = -Math.PI + draw * Math.PI * 2;\n` +
    `  else result = heading + (draw * 2 - 1) * spread;\n` +
    `  controller.__lastHeadingEvidence = { draw, heading: result };\n` +
    `  return result;\n}\n`;
  const conditionTick = `function __shadowConditionTick(field, dt, controller, variant) {\n` +
    `  const q = measurePheromoneDirection(field);\n` +
    `  const g = variant === 'pheromoneSlow' ? filterPheromoneDirection(controller.__conditionState?.vector, q, dt) : null;\n` +
    `  const vector = variant === 'pheromoneSlow' ? g : { x: q.x, y: q.y };\n` +
    `  const magnitude = Math.min(1, Math.hypot(vector.x, vector.y));\n` +
    `  controller.__conditionState = { completedTimeMs: controller.simulationTimeMs, q, g, vector, R: magnitude, angle: magnitude > 1e-9 ? Math.atan2(vector.y, vector.x) : null };\n` +
    `}\n`;
  const moduleSource = headingPolicy + conditionTick + source;
  const module = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
  return { AntController: module.AntController, source, transformedSourceHash: sha256(source),
    policySha256: sha256(headingPolicy + conditionTick), originalSourceHash: sha256(original) };
}

export async function runShadow({ variant = 'baseline', seed = 20261022, seconds = 1, output } = {}) {
  assert.ok(VARIANTS.has(variant));
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
  assert.ok(Number.isInteger(seconds) && seconds > 0);
  assert.ok(output, 'output directory required');
  const out = resolve(output);
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out, { recursive: false });
  const { AntController, transformedSourceHash, originalSourceHash, policySha256 } = await makeControllerClass(variant);
  const referenceClass = variant === 'baseline'
    ? (await import(pathToFileURL(resolve(ROOT, SOURCE)).href)).AntController : null;
  const sourceHashes = Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, sha256(await readFile(resolve(ROOT, path)))])));
  const descriptorPath = resolve(ROOT, 'scripts/ant-recruitment-descriptors.js');
  const { describeSnapshot } = await import(pathToFileURL(descriptorPath).href);
  sourceHashes['scripts/ant-recruitment-descriptors.js'] = sha256(await readFile(descriptorPath));
  const runnerPath = fileURLToPath(import.meta.url);
  sourceHashes['scripts/ant-recruitment-shadow.js'] = sha256(await readFile(runnerPath));
  const rng = makeRng(seed), controller = new AntController({ random: rng.random });
  const referenceRng = referenceClass ? makeRng(seed) : null;
  const reference = referenceClass ? new referenceClass({ random: referenceRng.random }) : null;
  const events = { contacts: [], plates: [], nodules: [], errors: [] }, spawns = [], frames = [], snapshots = [];
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') events.contacts.push(structuredClone(payload));
    else if (type === 'plate-birth') events.plates.push(structuredClone(payload));
    else if (type === 'sphere-birth') events.nodules.push(structuredClone(payload));
    else if (type === 'error') events.errors.push(structuredClone(payload));
  });
  const referenceEvents = { contacts: [] };
  const unsubscribeReference = reference?.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') referenceEvents.contacts.push(structuredClone(payload));
  });
  const spawnNext = controller.spawnNextAnt.bind(controller);
  controller.spawnNextAnt = function (...args) {
    const before = rng.calls, result = spawnNext(...args);
    if (result) {
      const agent = this.agents.at(-1);
      spawns.push({ id: agent.id, simulationTimeMs: this.simulationTimeMs,
        position: { x: agent.x, y: agent.y }, initialHeading: agent.heading,
        headingEvidence: this.__lastHeadingEvidence || null,
        policyInputAgeMs: this.__lastHeadingEvidence?.input
          ? this.simulationTimeMs - this.__lastHeadingEvidence.input.completedTimeMs : null,
        rngCallsBefore: before, rngCallsAfter: rng.calls, rngState: rng.state() });
      this.__lastHeadingEvidence = null;
    }
    return result;
  };
  const started = performance.now(), ticks = seconds * 60, rngTrace = Buffer.alloc(seconds * 60 * 8);
  await controller.init();
  if (reference) await reference.init();
  let lastPositions = new Map();
  const contactHash = createHash('sha256');
  const prefixContactHash = createHash('sha256');
  const referenceContactHash = reference ? createHash('sha256') : null;
  const referenceRngTrace = reference ? Buffer.alloc(seconds * 60 * 8) : null;
  const parityCheckpoints = [];
  try {
    if (reference) assert.equal(stable(controller.getSnapshot()), stable(reference.getSnapshot()),
      'baseline dynamic source differs from direct production after init');
    for (let tick = 0; tick < ticks; tick += 1) {
      const atSecond = tick % 60 === 0;
      if (atSecond) {
        const agents = controller.agents.map(agent => ({ ...agent.getSnapshot(),
          gait: controller.gaitController.getSnapshot(agent), bodyPose: controller.bodyPoseController.getSnapshot(agent) })).map(agent => {
          const previous = lastPositions.get(agent.id);
          return { ...agent, dx: previous ? agent.x - previous.x : null, dy: previous ? agent.y - previous.y : null };
        });
        const pheromone = controller.field.getSnapshot();
        frames.push({ timeSeconds: controller.simulationTimeMs / 1000, agents,
          descriptors: describeSnapshot(agents, { pheromone, dtSeconds: 1 }), population: agents.length,
          pheromoneMass: pheromone.totalMass, conditioning: controller.__conditionState
            ? { ...JSON.parse(JSON.stringify(controller.__conditionState)), observationLagMs: controller.simulationTimeMs - controller.__conditionState.completedTimeMs }
            : null });
        if (MILESTONES.has(Math.round(controller.simulationTimeMs / 1000))) snapshots.push({
          timeSeconds: controller.simulationTimeMs / 1000, snapshot: controller.getSnapshot() });
        lastPositions = new Map(agents.map(a => [a.id, { x: a.x, y: a.y }]));
      }
      const contactsBefore = events.contacts.length;
      const referenceContactsBefore = referenceEvents.contacts.length;
      rngTrace.writeUInt32LE(rng.state(), tick * 8);
      rngTrace.writeUInt32LE(rng.calls >>> 0, tick * 8 + 4);
      if (reference) {
        referenceRngTrace.writeUInt32LE(referenceRng.state(), tick * 8);
        referenceRngTrace.writeUInt32LE(referenceRng.calls >>> 0, tick * 8 + 4);
      }
      controller.tick(DT);
      if (reference) reference.tick(DT);
      for (const contact of events.contacts.slice(contactsBefore)) {
        contactHash.update(stable(contact));
        if (tick < 36000) prefixContactHash.update(stable(contact));
      }
      if (reference) for (const contact of referenceEvents.contacts.slice(referenceContactsBefore)) {
        referenceContactHash.update(stable(contact));
      }
      const elapsedSecond = tick + 1;
      if (reference && (MILESTONES.has(elapsedSecond / 60) || elapsedSecond === ticks)) {
        const actual = sha256(stable(controller.getSnapshot())), expected = sha256(stable(reference.getSnapshot()));
        assert.equal(actual, expected, `baseline public snapshot differs from production at ${elapsedSecond / 60}s`);
        parityCheckpoints.push({ seconds: elapsedSecond / 60, snapshotSha256: actual });
      }
      if ((tick + 1) % 3600 === 0) console.log(JSON.stringify({ variant, seed, seconds: (tick + 1) / 60,
        population: controller.agents.length, elapsedWallSeconds: (performance.now() - started) / 1000 }));
    }
    if (reference && parityCheckpoints.at(-1)?.seconds !== seconds) {
      const actual = sha256(stable(controller.getSnapshot())), expected = sha256(stable(reference.getSnapshot()));
      assert.equal(actual, expected, `baseline final public snapshot differs from production at ${seconds}s`);
      parityCheckpoints.push({ seconds, snapshotSha256: actual });
    }
    const finalSnapshot = controller.getSnapshot();
    const baselineParity = reference ? {
      productionSource: 'direct import of current src/lib/agents/ant/AntController.js',
      comparedTicks: ticks, allTickRngTraceExact: rngTrace.equals(referenceRngTrace),
      firstRngMismatchTick: firstDifferentRngTick(rngTrace, referenceRngTrace),
      checkpointSnapshotsExact: true, checkpoints: parityCheckpoints,
      contactHashExact: contactHash.copy().digest('hex') === referenceContactHash.copy().digest('hex'),
      contactSha256: contactHash.copy().digest('hex'), productionContactSha256: referenceContactHash.copy().digest('hex'),
      finalRngCalls: rng.calls, productionFinalRngCalls: referenceRng.calls,
      finalRngState: rng.state(), productionFinalRngState: referenceRng.state()
    } : null;
    if (reference) {
      assert.ok(baselineParity.allTickRngTraceExact, 'baseline RNG trace differs from direct production');
      assert.ok(baselineParity.contactHashExact, 'baseline contact hash differs from direct production');
      assert.equal(baselineParity.finalRngState, baselineParity.productionFinalRngState);
      assert.equal(baselineParity.finalRngCalls, baselineParity.productionFinalRngCalls);
    }
    const lastFrame = frames.at(-1);
    const finalAgents = finalSnapshot.agents.map(agent => {
      const previous = lastFrame?.agents.find(item => item.id === agent.id);
      return { ...agent, dx: previous ? agent.x - previous.x : null, dy: previous ? agent.y - previous.y : null };
    });
    frames.push({ timeSeconds: seconds, agents: finalAgents,
      descriptors: describeSnapshot(finalAgents, { pheromone: finalSnapshot.pheromone, dtSeconds: 1 }),
      population: finalAgents.length, pheromoneMass: finalSnapshot.analysis.pheromoneMass,
      conditioning: controller.__conditionState ? { ...JSON.parse(JSON.stringify(controller.__conditionState)),
        observationLagMs: controller.simulationTimeMs - controller.__conditionState.completedTimeMs } : null });
    if (MILESTONES.has(seconds)) snapshots.push({ timeSeconds: seconds, snapshot: finalSnapshot });
    const sourceHashesFinal = Object.fromEntries(await Promise.all(Object.keys(sourceHashes).map(async path =>
      [path, sha256(await readFile(resolve(ROOT, path)))])));
    assert.deepEqual(sourceHashesFinal, sourceHashes, 'production source changed during shadow run');
    const frameBytes = gzipSync(Buffer.from(frames.map(row => JSON.stringify(row)).join('\n') + '\n'));
    const snapshotBytes = gzipSync(Buffer.from(jsonString(snapshots)));
    const rngBytes = gzipSync(rngTrace);
    const stageAPrefix = seconds === 1800 && ['baseline', 'isotropic'].includes(variant)
      ? await compareStageAPrefix({ variant, seed, rngTrace, contactHash: prefixContactHash.digest('hex'), snapshots, spawns }) : null;
    const births = { plates: controller.trailPlateBirth.getPlates(), birthRecords: controller.trailPlateBirth.birthRecords,
      nodules: controller.materialStratigraphy.nodules };
    const conditionedCounts = CONDITIONED.has(variant) ? {
      acceptedSpawns: spawns.length,
      isotropicFallbacks: spawns.filter(spawn => !spawn.headingEvidence?.input || spawn.headingEvidence.R <= 1e-9).length,
      directionalSpawns: spawns.filter(spawn => spawn.headingEvidence?.input && spawn.headingEvidence.R > 1e-9).length,
      finiteHeadingEvidence: spawns.every(spawn => Number.isFinite(spawn.headingEvidence?.draw)
        && Number.isFinite(spawn.headingEvidence?.heading)
        && (!spawn.headingEvidence.input || Number.isFinite(spawn.headingEvidence.input.R))),
      completedTickUpdates: ticks,
      observationLagMs: 'one fixed tick; completed tick q/g is installed after that tick spawn attempt and is available to later tick spawn attempts'
    } : null;
    const manifest = { schemaVersion: 1, variant, seed, seconds, ticks, dtSeconds: DT,
      commit: await readHeadCommit(), node: process.version,
      productionSourceSha256: originalSourceHash, transformedControllerSha256: transformedSourceHash,
      injectedPolicySha256: policySha256, sourceHashes,
      runnerSha256: sourceHashes['scripts/ant-recruitment-shadow.js'],
      rng: { algorithm: 'LCG 1664525/1013904223', calls: rng.calls, finalState: rng.state() }, spawns,
      eventCounts: { footContacts: events.contacts.length, plateBirths: events.plates.length,
        noduleBirths: events.nodules.length, errors: events.errors.length },
      conditionedCounts,
      footContactsSha256: contactHash.digest('hex'), finalPopulation: finalSnapshot.agents.length,
      baselineParity,
      stageAPrefix,
      finalBirthDescriptors: births, simulationTimeMs: controller.simulationTimeMs,
      wallSeconds: (performance.now() - started) / 1000,
      capture: { frameFile: 'frames.jsonl.gz', frameCount: frames.length, snapshotFile: 'snapshots.json.gz',
        snapshotSeconds: snapshots.map(s => s.timeSeconds), rngTraceFile: 'rng-trace-u32le.gz',
        rngTraceRow: 'state,calls at each pre-tick boundary', frameBytes: frameBytes.length,
        snapshotBytes: snapshotBytes.length, rngTraceBytes: rngBytes.length },
      parity: variant === 'baseline' ? 'Focused tests compare this dynamic-source baseline to the directly imported production controller at every tick.' : 'Not compared by this single-variant invocation.' };
    await writeFile(resolve(out, 'frames.jsonl.gz'), frameBytes);
    await writeFile(resolve(out, 'snapshots.json.gz'), snapshotBytes);
    await writeFile(resolve(out, 'rng-trace-u32le.gz'), rngBytes);
    await writeFile(resolve(out, 'births.json'), jsonString(births, 2));
    await writeFile(resolve(out, 'manifest.json'), jsonString(manifest, 2) + '\n');
    manifest.outputBytes = { frames: (await stat(resolve(out, 'frames.jsonl.gz'))).size,
      snapshots: (await stat(resolve(out, 'snapshots.json.gz'))).size,
      rngTrace: (await stat(resolve(out, 'rng-trace-u32le.gz'))).size };
    await writeFile(resolve(out, 'manifest.json'), jsonString(manifest, 2) + '\n');
    return manifest;
  } finally {
    unsubscribe(); unsubscribeReference?.();
    await controller.destroy(); if (reference) await reference.destroy();
  }
}

async function main() {
  const variant = String(CLI.get('--variant') || 'baseline'), seed = Number(CLI.get('--seed') || 20261022);
  const seconds = Number(CLI.get('--seconds') || 1), output = CLI.get('--output');
  assert.ok(output, 'usage: node scripts/ant-recruitment-shadow.js --variant=baseline --seed=20261022 --seconds=60 --output=PATH');
  const result = await runShadow({ variant, seed, seconds, output: String(output) });
  console.log(JSON.stringify({ variant, seed, seconds, wallSeconds: result.wallSeconds,
    events: result.eventCounts, finalPopulation: result.finalPopulation }));
}

function makeRng(seed) {
  let state = seed >>> 0, calls = 0;
  return { random() { calls += 1; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; },
    state: () => state, get calls() { return calls; } };
}
async function readHeadCommit() {
  const gitDir = resolve(ROOT, '.git'), head = (await readFile(resolve(gitDir, 'HEAD'), 'utf8')).trim();
  if (!head.startsWith('ref: ')) return head;
  const ref = head.slice(5), loose = resolve(gitDir, ref);
  try { return (await readFile(loose, 'utf8')).trim(); }
  catch {
    const packed = await readFile(resolve(gitDir, 'packed-refs'), 'utf8');
    return packed.split(/\r?\n/).find(line => line.endsWith(` ${ref}`))?.split(' ')[0] ?? null;
  }
}
function stable(value) { return JSON.stringify(value, (_key, item) => item instanceof Map
  ? [...item.entries()] : item instanceof Set ? [...item] : ArrayBuffer.isView(item) ? Array.from(item) : item); }
function jsonString(value, space = 0) { return JSON.stringify(value, (_key, item) => item instanceof Map
  ? [...item.entries()] : item instanceof Set ? [...item] : ArrayBuffer.isView(item) ? Array.from(item) : item, space); }
function firstDifferentRngTick(a, b) {
  for (let offset = 0; offset < Math.min(a.length, b.length); offset += 8) {
    if (a.readUInt32LE(offset) !== b.readUInt32LE(offset)
        || a.readUInt32LE(offset + 4) !== b.readUInt32LE(offset + 4)) return offset / 8;
  }
  return a.length === b.length ? null : Math.min(a.length, b.length) / 8;
}
async function compareStageAPrefix({ variant, seed, rngTrace, contactHash, snapshots, spawns }) {
  const directory = resolve(ROOT, `docs/ant/evidence/2026-10-22-recruitment-founder-survey/controls/${variant}-${seed}`);
  const priorManifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  assert.equal(priorManifest.seconds, 600, 'Stage A prefix must be the frozen 600-second run');
  const priorRng = gunzipSync(await readFile(resolve(directory, 'rng-trace-u32le.gz')));
  assert.equal(priorRng.length, 36000 * 8, 'Stage A RNG trace must cover all 36000 prefix ticks');
  const priorSnapshots = JSON.parse(gunzipSync(await readFile(resolve(directory, 'snapshots.json.gz'))));
  const oldSnapshot = priorSnapshots.find(row => row.timeSeconds === 600)?.snapshot;
  const newSnapshot = snapshots.find(row => row.timeSeconds === 600)?.snapshot;
  assert.ok(oldSnapshot && newSnapshot, 'both Stage A and extension need a 600-second snapshot');
  const priorSpawns = priorManifest.spawns.map(spawn => ({ id: spawn.id, simulationTimeMs: spawn.simulationTimeMs,
    initialHeading: spawn.initialHeading, rngCallsBefore: spawn.rngCallsBefore,
    rngCallsAfter: spawn.rngCallsAfter, rngState: spawn.rngState }));
  const nextSpawns = spawns.filter(spawn => spawn.simulationTimeMs <= 600000).map(spawn => ({ id: spawn.id,
    simulationTimeMs: spawn.simulationTimeMs, initialHeading: spawn.initialHeading,
    rngCallsBefore: spawn.rngCallsBefore, rngCallsAfter: spawn.rngCallsAfter, rngState: spawn.rngState }));
  const rngExact = rngTrace.subarray(0, priorRng.length).equals(priorRng);
  const contactsExact = contactHash === priorManifest.footContactsSha256;
  const snapshotExact = stable(normalizeNumericArrays(oldSnapshot)) === stable(normalizeNumericArrays(newSnapshot));
  const spawnsExact = stable(priorSpawns) === stable(nextSpawns);
  assert.ok(rngExact && contactsExact && snapshotExact && spawnsExact,
    `Stage A ${variant}/${seed} 600-second prefix diverged: rng=${rngExact}, contacts=${contactsExact}, snapshot=${snapshotExact}, spawns=${spawnsExact}`);
  return { stageASource: `${variant}-${seed}`, comparedTicks: 36000, rngTraceExact: rngExact,
    contactHashExact: contactsExact, snapshot600Exact: snapshotExact, acceptedSpawnSequenceExact: spawnsExact,
    priorRunnerSha256: priorManifest.runnerSha256 };
}
function normalizeNumericArrays(value) {
  if (Array.isArray(value)) return value.map(normalizeNumericArrays);
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  if (keys.length && keys.every((key, index) => key === String(index))) return keys.map(key => normalizeNumericArrays(value[key]));
  return Object.fromEntries(keys.map(key => [key, normalizeNumericArrays(value[key])]));
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
