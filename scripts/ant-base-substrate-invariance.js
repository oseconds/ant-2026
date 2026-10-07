import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';

const args = new Map(process.argv.slice(2).map(arg => {
  const at = arg.indexOf('=');
  return at < 0 ? [arg, true] : [arg.slice(0, at), arg.slice(at + 1)];
}));
const DT = 1 / 60;
const DEFAULT_SEEDS = [20261005, 20261006, 20261007];
const OUTPUT = resolve(String(args.get('--output') || 'docs/ant/evidence/2026-10-07-base-substrate-debug/invariance'));

if (args.has('--selfcheck')) selfcheck();
else await main();

async function main() {
  const seconds = Number(args.get('--seconds') || 600);
  const seeds = String(args.get('--seeds') || DEFAULT_SEEDS.join(',')).split(',').map(Number);
  assert.ok(Number.isInteger(seconds) && seconds > 0, '--seconds must be a positive integer');
  assert.ok(seeds.length && seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff),
    '--seeds must contain unsigned 32-bit integers');
  const controllerPath = fileURLToPath(new URL('../src/lib/agents/ant/AntController.js', import.meta.url));
  const bridgePath = fileURLToPath(new URL('../src/lib/audio/AntEnvironmentAudioBridge.js', import.meta.url));
  const mainBirthSource = execFileSync('git', ['show', 'main:src/lib/agents/ant/TrailPlateBirth.js'], { encoding: 'utf8' });
  const mainBirthHash = digest(Buffer.from(mainBirthSource));
  const { TrailPlateBirth: MainTrailPlateBirth } = await import(`data:text/javascript;base64,${Buffer.from(mainBirthSource).toString('base64')}`);
  const mainCommit = execFileSync('git', ['rev-parse', 'main'], { encoding: 'utf8' }).trim();
  const report = {
    provenance: {
      createdAt: new Date().toISOString(), seeds, seconds, stepSeconds: DT,
      controllerSha256: digest(await readFile(controllerPath)), bridgeSha256: digest(await readFile(bridgePath)),
      mainBaseline: { ref: 'main', commit: mainCommit, trailPlateBirthSha256: mainBirthHash,
        method: 'Inject main TrailPlateBirth source read-only from git show into current AntController; all other simulation modules are current branch.' },
      method: 'Fresh controllers; matched LCG seeds; both use the born-surface bridge with a resolved mock AudioEngine. OFF has baseSubstrate false; ON has it true and enables audio. Every tick hashes RNG, complete agent snapshots (including gait/bodyPose), pheromone, SurfaceField, ordered FOOT_CONTACT payloads, birth descriptors, and stratigraphy state. Audio command posts are captured from the two mock worklet transports.',
      limits: 'This proves deterministic command-level and simulation-state invariance under a mock transport. It does not measure PCM; use the browser OfflineAudioContext capture for acoustic output evidence.'
    }, scenarios: []
  };
  await mkdir(OUTPUT, { recursive: true });
  for (const seed of seeds) {
    const off = await run(seed, seconds, false);
    const mainOff = await run(seed, seconds, false, MainTrailPlateBirth);
    const on = await run(seed, seconds, true);
    const comparisons = compare(off.hashes, on.hashes);
    const mainBaselineComparison = compare(off.hashes, mainOff.hashes);
    const scenario = { seed, off: summarize(off), on: summarize(on), comparisons,
      currentOffVsMainBirthClass: { currentOff: off.hashes, mainClass: summarize(mainOff),
        comparisons: mainBaselineComparison } };
    report.scenarios.push(scenario);
    console.log(JSON.stringify({ seed, seconds, firstBirthSeconds: off.firstBirthSeconds,
      invariance: comparisons, offSurfaceCommands: off.audio.surfaceStrikeCount,
      onSurfaceCommands: on.audio.surfaceStrikeCount, onSubstrate: on.audio.substrate }));
    assert.ok(on.audio.substrate.preBirthDeliveredGroups > 0 && on.audio.substrate.postBirthDeliveredGroups > 0,
      `${seed}: ON substrate must deliver contacts both before and after first birth`);
    assert.ok(Object.values(mainBaselineComparison).every(v => v.equal),
      `${seed}: current OFF differs from main TrailPlateBirth behavior`);
  }
  await writeFile(resolve(OUTPUT, 'matched-seeds.json'), `${JSON.stringify(report, null, 2)}\n`);
  assert.ok(report.scenarios.every(s => Object.values(s.comparisons).every(v => v.equal)
    && Object.values(s.currentOffVsMainBirthClass.comparisons).every(v => v.equal)),
  'base substrate changed simulation/audio commands or current birth diagnostics differ from main birth behavior');
}

async function run(seed, seconds, substrateEnabled, TrailPlateBirthClass = null) {
  let rngState = seed >>> 0, rngCalls = 0;
  const random = () => {
    rngCalls += 1;
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 0x100000000;
  };
  const commands = [];
  const baseDeliveries = [];
  const basePending = [];
  let controller;
  let currentContactMs = null;
  const audioEngine = {
    context: { currentTime: 0 }, init: async () => {},
    async createWorklet(name, _url, _config, _onMessage, _onError, output) {
      return { node: { port: { postMessage: message => {
        if (message?.type === 'strike') commands.push({ name, atMs: currentContactMs ?? controller?.simulationTimeMs ?? 0,
          payload: message.payload, channels: output?.channels ?? null });
      } } }, gainNode: { gain: { value: output?.gain ?? 1, cancelScheduledValues() {},
        setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(value) { this.value = value; } } },
      disconnect() {} };
    }
  };
  const audioBridge = new AntEnvironmentAudioBridge({ audioEngine });
  const legacyHandleFootContact = audioBridge.legacy.handleFootContact.bind(audioBridge.legacy);
  audioBridge.legacy.handleFootContact = event => {
    const pending = Promise.resolve(legacyHandleFootContact(event)).then(delivered => {
    if (delivered) baseDeliveries.push({ simulationTimeMs: event.simulationTimeMs, strength: event.strength });
    return delivered;
    });
    basePending.push(pending);
    return pending;
  };
  controller = new AntController({ random, audioBridge, ...(TrailPlateBirthClass ? { trailPlateBirth: new TrailPlateBirthClass() } : {}),
    state: { audioExperiment: { mode: 'bornSurface', baseSubstrate: substrateEnabled } } });
  const hashes = Object.fromEntries(['rng', 'trajectoriesGaitPose', 'pheromone', 'surfaceField', 'footContacts',
    'plateBirths', 'stratigraphy', 'bornSurfaceAudio'].map(key => [key, createHash('sha256')]));
  const counts = { ticks: 0, contacts: 0, feet: 0, births: 0 };
  const births = [];
  let lastStratigraphyRevision = null, lastNoduleRevision = null;
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'foot-contact') {
      currentContactMs = payload.simulationTimeMs;
      counts.contacts += 1;
      counts.feet += payload.contacts?.length ?? 0;
      hashes.footContacts.update(stable(payload));
    } else if (type === 'plate-birth') {
      counts.births += 1;
      births.push({ id: payload.id, bornAtSimulationTimeMs: payload.bornAtSimulationTimeMs,
        metrics: payload.metrics, source: payload.source, target: payload.target,
        geometry: payload.geometry, material: payload.material });
      hashes.plateBirths.update(stable(payload));
    }
  });
  await controller.init();
  await controller.setAudioEnabled(true);
  assert.equal(audioBridge.enabled, true, 'born-surface audio bridge must be enabled in both conditions');
  assert.equal(audioBridge.baseSubstrateEnabled, substrateEnabled);
  const steps = seconds * 60;
  for (let tick = 0; tick < steps; tick += 1) {
    controller.tick(DT);
    counts.ticks += 1;
    hashes.rng.update(`${rngState}:${rngCalls};`);
    const snapshot = controller.getSnapshot();
    hashes.trajectoriesGaitPose.update(stable(snapshot.agents));
    hashView(hashes.pheromone, controller.field.values);
    hashView(hashes.surfaceField, controller.surfaceField.values);
    const material = snapshot.stratigraphy;
    hashes.stratigraphy.update(stable({ revision: material.revision, noduleRevision: material.noduleRevision,
      acceptedContacts: material.diagnostics.totalAcceptedFootContacts,
      rejectedContacts: material.diagnostics.rejectedFootContacts,
      qualifiedNoduleCandidates: material.diagnostics.qualifiedNoduleCandidateCount,
      plateCount: material.plates.length, noduleCount: material.nodules.length }));
    if (material.revision !== lastStratigraphyRevision || material.noduleRevision !== lastNoduleRevision) {
      hashes.stratigraphy.update(stable({ plates: material.plates, nodules: material.nodules, layers: material.layers,
        layerOrder: material.stratigraphy.layerOrder, plateHistory: material.stratigraphy.plateHistory }));
      lastStratigraphyRevision = material.revision;
      lastNoduleRevision = material.noduleRevision;
    }
    hashView(hashes.stratigraphy, material.stratigraphy.topLayerByCell);
    hashView(hashes.stratigraphy, material.stratigraphy.layerCountByCell);
    hashView(hashes.stratigraphy, material.stratigraphy.totalDepthByCellMeters);
    if (tick % 60 === 0) await Promise.resolve();
    if ((tick + 1) % 7200 === 0) console.log(JSON.stringify({ seed, substrateEnabled, elapsedSeconds: (tick + 1) / 60 }));
  }
  unsubscribe();
  await Promise.all(basePending);
  for (const command of commands) {
    if (command.name === 'surface-plate-processor') hashes.bornSurfaceAudio.update(stable(command));
  }
  const result = { hashes: Object.fromEntries(Object.entries(hashes).map(([key, hash]) => [key, hash.digest('hex')])),
    rngState, rngCalls, counts: { ...counts, platesAtEnd: controller.trailPlateBirth.plates.length }, births,
    firstBirthSeconds: births.length ? births[0].bornAtSimulationTimeMs / 1000 : null,
    audio: { surfaceStrikeCount: commands.filter(c => c.name === 'surface-plate-processor').length,
      substrate: { enabled: substrateEnabled, strikeCount: commands.filter(c => c.name === 'plate-processor').length,
        preBirthDeliveredGroups: baseDeliveries.filter(c => births[0]?.bornAtSimulationTimeMs === undefined
          || c.simulationTimeMs < births[0].bornAtSimulationTimeMs).length,
        postBirthDeliveredGroups: baseDeliveries.filter(c => births[0]?.bornAtSimulationTimeMs !== undefined
          && c.simulationTimeMs >= births[0].bornAtSimulationTimeMs).length,
        peakCommandStrength: max(commands.filter(c => c.name === 'plate-processor').map(c => c.payload?.strength ?? 0)),
        outputChannels: [...new Set(commands.filter(c => c.name === 'plate-processor').map(c => c.channels))],
        bridgeDiagnostics: audioBridge.getDiagnostics().baseSubstrate } } };
  await controller.destroy();
  return result;
}

function compare(a, b) {
  return Object.fromEntries(Object.keys(a).map(key => [key, { equal: a[key] === b[key], offSha256: a[key], onSha256: b[key] }]));
}
function summarize(run) { return { hashes: run.hashes, rngState: run.rngState, rngCalls: run.rngCalls,
  counts: run.counts, firstBirthSeconds: run.firstBirthSeconds, births: run.births, audio: run.audio }; }
function hashView(hash, values) { hash.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength)); }
function stable(value) { return `${JSON.stringify(value, (_key, item) => ArrayBuffer.isView(item) ? Array.from(item) : item)}\n`; }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function max(values) { return values.reduce((largest, value) => Math.max(largest, value), 0); }
function selfcheck() {
  assert.deepEqual(compare({ a: 'same' }, { a: 'same' }).a.equal, true);
  assert.deepEqual(compare({ a: 'off' }, { a: 'on' }).a.equal, false);
  assert.equal(digest(Buffer.from('x')).length, 64);
  console.log('ant-base-substrate-invariance selfcheck: ok');
}
