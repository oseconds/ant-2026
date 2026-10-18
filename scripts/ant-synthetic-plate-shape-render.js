import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { encodeStereoFloatWav, renderSurface, sha256 } from './ant-sonic-shadow-render.js';

const evidence = 'docs/ant/evidence/2026-10-18-synthetic-plate-shape-capability';
const listeningDirectory = `${evidence}/listening`;
const rosterPath = `${evidence}/shape-roster.json`;
const workletPath = 'static/worklets/surface-plate.worklet.js';
const compilerPath = 'src/lib/audio/compileSurfaceTopology.js';
const rendererPath = 'scripts/ant-sonic-shadow-render.js';
const rosterScriptPath = 'scripts/ant-synthetic-plate-shape-roster.js';
const frozenMaterialPath = 'docs/ant/evidence/2026-10-13-plate-sonic-individuality/frozen-inputs.json.gz';
const frozenMaterialSha256 = 'f600eb768df2721c98cc607ea8b4b4d4fc64ae74cda6b5bf3f9297e8b0865a2d';
const matchedTargetRms = 0.02;
const finalTargetRms = 0.08;
const roster = JSON.parse(await readFile(rosterPath, 'utf8'));
execFileSync(process.execPath, [rosterScriptPath, '--check'], { stdio: 'ignore' });
for (const file of ['render-manifest.json', 'listening-manifest.json']) {
  try { await readFile(`${evidence}/${file}`); assert.fail(`${file} already exists; refusing to render again`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
try {
  const existingAudio = await readdir(listeningDirectory);
  assert.deepEqual(existingAudio, [], 'refusing to render over pre-existing listening audio');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
assert.equal(roster.shapes.length, 6);
assert.deepEqual(roster.controlledEvent, {
  frame: 480, strength: 0.035, footprintRadius: 0.01, hardness: 0.5,
  sampleRate: 48000, frames: 72000, outputGain: 1
});

const workletSource = await readFile(workletPath, 'utf8');
assert.match(workletSource, /const PLATE_DAMPING_MULTIPLIER = 50;/);
const frozenMaterialBytes = await readFile(frozenMaterialPath);
assert.equal(sha256(frozenMaterialBytes), frozenMaterialSha256);

const topologySha256 = topology => sha256(JSON.stringify(topology, (_key, value) =>
  ArrayBuffer.isView(value) ? Array.from(value) : value));
const pooledStats = ({ left, right }) => {
  let sumSquares = 0, peak = 0;
  for (let index = 0; index < left.length; index += 1) {
    for (const sample of [left[index], right[index]]) {
      assert.ok(Number.isFinite(sample), 'rendered PCM must be finite');
      sumSquares += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  return { rms: Math.sqrt(sumSquares / (left.length * 2)), peak };
};
const wavStats = bytes => {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt16LE(20), 3, 'WAV uses IEEE float PCM');
  assert.equal(bytes.readUInt16LE(22), 2, 'WAV is stereo');
  assert.equal(bytes.readUInt32LE(24), 48000);
  assert.equal(bytes.readUInt16LE(34), 32);
  assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
  let sumSquares = 0, peak = 0;
  for (let offset = 44; offset < bytes.length; offset += 4) {
    const sample = bytes.readFloatLE(offset);
    assert.ok(Number.isFinite(sample), 'WAV samples must be finite');
    sumSquares += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  return { rms: Math.sqrt(sumSquares / ((bytes.length - 44) / 4)), peak };
};

const event = {
  frame: roster.controlledEvent.frame,
  message: { type: 'strike', payload: {
    plateId: '', layerId: '',
    position: { x: roster.commonAnchors.contact.x / 95, y: roster.commonAnchors.contact.y / 95 },
    strength: roster.controlledEvent.strength,
    footprintRadius: roster.controlledEvent.footprintRadius,
    hardness: roster.controlledEvent.hardness
  } }
};
const renders = [];
for (const [index, shape] of roster.shapes.entries()) {
  const mask = Uint8Array.from(shape.maskRows.join(''), character => Number(character));
  assert.equal(mask.length, 96 * 96);
  assert.equal(createHash('sha256').update(mask).digest('hex'), shape.maskSha256);
  const topology = compileSurfaceTopology({ plates: [{
    id: shape.id, grid: { width: 96, height: 96 }, mask, edges: [],
    pickups: [roster.commonAnchors.leftPickup, roster.commonAnchors.rightPickup]
      .map(({ x, y }) => ({ x: x / 95, y: y / 95 })),
    material: { ...roster.sourceMaterial.value }
  }], nodules: [], generation: 0 });
  assert.equal(topology.layerIds.length, 1);
  assert.equal(topology.adjacentLinkCoefficients.length, 0);
  assert.equal(topology.noduleIds.length, 0);
  assert.equal(topology.nodeGridIndices.length, shape.solverGrid.occupiedNodes);
  assert.deepEqual(Array.from(topology.pickupNodeIndices), shape.pickupNodeIndices);
  assert.equal(topologySha256(topology), shape.topologySha256);
  assert.equal(topology.routingTopLayerByCell96[roster.commonAnchors.contact.y * 96 + roster.commonAnchors.contact.x], 0);

  const scheduledEvent = structuredClone(event);
  scheduledEvent.message.payload.plateId = shape.id;
  scheduledEvent.message.payload.layerId = shape.id;
  const result = renderSurface({ source: workletSource, topology, events: [scheduledEvent],
    frames: roster.controlledEvent.frames, sampleRate: roster.controlledEvent.sampleRate, captureFields: true });
  assert.equal(result.telemetry.strikes, 1, `${shape.id}: exactly one accepted strike`);
  assert.equal(result.telemetry.droppedRoutes, 0, `${shape.id}: no rejected contact route`);
  assert.equal(result.telemetry.dropped, 0);
  assert.equal(result.telemetry.clipped, 0, `${shape.id}: no solver clipping`);
  assert.equal(result.telemetry.nonFinite, 0);
  assert.equal(result.telemetry.contactPulseDurationMs, 3);
  assert.equal(result.telemetry.contactRecoveryTimeMs, 75);
  assert.equal(result.telemetry.noduleCount, 0);
  assert.equal(result.telemetry.couplingLinks, 0);
  assert.equal(result.fieldsFinite, true);
  assert.deepEqual(result.renderedFrameReceipts.map(receipt => receipt.frame), [480]);
  assert.equal(result.renderedFrameReceipts[0].message.payload.plateId, shape.id);
  const sourceStats = pooledStats(result.pcm);
  const matchedGain = matchedTargetRms / sourceStats.rms;
  const fixedBytes = encodeStereoFloatWav(result.pcm, { sampleRate: 48000, gain: 1 });
  const matchedBytes = encodeStereoFloatWav(result.pcm, { sampleRate: 48000, gain: matchedGain });
  const fixedStats = wavStats(fixedBytes), matchedStats = wavStats(matchedBytes);
  assert.ok(Math.abs(matchedStats.rms - matchedTargetRms) < 1e-7, `${shape.id}: matched RMS target`);
  const postGainLinear = finalTargetRms / matchedStats.rms;
  const predictedPostGainPeak = matchedStats.peak * postGainLinear;
  assert.ok(predictedPostGainPeak < 1,
    `${shape.id}: target RMS ${finalTargetRms} would exceed full scale (${predictedPostGainPeak})`);
  renders.push({ index: index + 1, shape, topology, event: scheduledEvent, result,
    fixedBytes, matchedBytes, fixedStats, matchedStats, sourceStats, matchedGain,
    predictedPostGainPeak });
  console.log(`${shape.id}: nodes=${topology.nodeGridIndices.length}, rms=${fixedStats.rms.toFixed(8)}, peak=${fixedStats.peak.toFixed(8)}, finalPeak=${predictedPostGainPeak.toFixed(8)}`);
}

assert.equal(renders.length, 6);
await mkdir(listeningDirectory, { recursive: true });

const listening = [], artifacts = [];
const recordArtifact = (path, bytes, role) => artifacts.push({ path, bytes: bytes.length, sha256: sha256(bytes), role });
for (const row of renders) {
  const caseId = `case-${String(row.index).padStart(2, '0')}`;
  const fixedPath = `${listeningDirectory}/${caseId}-fixed.wav`;
  const matchedPath = `${listeningDirectory}/${caseId}-matched.wav`;
  await writeFile(fixedPath, row.fixedBytes);
  await writeFile(matchedPath, row.matchedBytes);
  recordArtifact(fixedPath, row.fixedBytes, 'fixed-gain direct render');
  recordArtifact(matchedPath, row.matchedBytes, 'RMS-matched listening-only copy');
  const dataBytes = row.fixedBytes.subarray(44);
  listening.push({
    id: `shape-${String(row.index).padStart(2, '0')}`,
    fixed: { path: fixedPath, bytes: row.fixedBytes.length, sha256: sha256(row.fixedBytes),
      rmsAfter: row.fixedStats.rms, peakAfter: row.fixedStats.peak },
    levelMatched: { path: matchedPath, bytes: row.matchedBytes.length, sha256: sha256(row.matchedBytes),
      gain: row.matchedGain, targetRms: matchedTargetRms,
      rmsBefore: row.fixedStats.rms, rmsAfter: row.matchedStats.rms,
      peakBefore: row.fixedStats.peak, peakAfter: row.matchedStats.peak,
      sourceWavPath: fixedPath, sourceWavSha256: sha256(row.fixedBytes) },
    generationCommand: 'node scripts/ant-synthetic-plate-shape-render.js',
    sourceToolSha256: sha256(await readFile('scripts/ant-synthetic-plate-shape-render.js')),
    sourcePcmSha256: sha256(dataBytes)
  });
}
const listeningManifest = {
  judgment: 'Synthetic geometry capability listening session prepared. No human listening result collected yet.',
  listening,
  matchedListeningConvention: { targetRms: matchedTargetRms, metric: 'pooled stereo RMS across both channels and all frames' }
};
await writeFile(`${evidence}/listening-manifest.json`, JSON.stringify(listeningManifest, null, 2) + '\n');

const sourceHashes = {};
for (const file of [workletPath, compilerPath, rendererPath, rosterScriptPath])
  sourceHashes[file] = sha256(await readFile(file));
const renderManifest = {
  schemaVersion: 1,
  evidenceId: roster.evidenceId,
  startingMain: 'caada3642f05a97a93541a2d1c684cf34bc57f87',
  geometryFreezeCommit: '9a786fc',
  geometryRoster: { path: rosterPath, bytes: (await readFile(rosterPath)).length, sha256: sha256(await readFile(rosterPath)) },
  sourceMaterial: { path: frozenMaterialPath, bytes: frozenMaterialBytes.length, sha256: frozenMaterialSha256,
    selection: 'Existing observed median material from the 2026-10-13 sonic-individuality controls.' },
  sourceToolHashes: sourceHashes,
  toolVersions: { node: process.version },
  controlledEvent: roster.controlledEvent,
  productionContracts: { contactPulseDurationMs: 3, localRecoveryMs: 75, plateDampingMultiplier: 50,
    pointPickup: true, fixedOutputGain: 1, sampleRate: 48000,
    base: false, z: false, nodules: false, stratigraphy: false, naturalSimulation: false },
  renderCount: renders.length,
  listeningConvention: { matchedTargetRms, finalPlaybackTargetRms: finalTargetRms,
    finalPlaybackGainStage: 'browser Web Audio GainNode after the RMS-matched listening-only WAV',
    noLimiter: true, noCompressor: true, postGainHeadroomChecked: true },
  cases: renders.map(row => ({
    id: `shape-${String(row.index).padStart(2, '0')}`,
    morphology: row.shape.morphology,
    maskSha256: row.shape.maskSha256,
    topologySha256: row.shape.topologySha256,
    occupiedCells: row.shape.sourceGrid.occupiedCells,
    compiledNodes: row.shape.solverGrid.occupiedNodes,
    boundingBox: row.shape.sourceGrid.boundingBox,
    pickupNodeIndices: row.shape.pickupNodeIndices,
    pickupSolverCells: row.shape.pickupSolverCells,
    contactRoute: row.shape.contactRoute,
    event: row.event,
    acceptedStrikes: row.result.telemetry.strikes,
    rejectedRoutes: row.result.telemetry.droppedRoutes,
    solverClippedSteps: row.result.telemetry.clipped,
    nonFinite: row.result.telemetry.nonFinite,
    fieldFinite: row.result.fieldsFinite,
    fixedGain: { path: `${listeningDirectory}/case-${String(row.index).padStart(2, '0')}-fixed.wav`, ...row.fixedStats, gain: 1 },
    matchedListeningOnly: { path: `${listeningDirectory}/case-${String(row.index).padStart(2, '0')}-matched.wav`,
      targetRms: matchedTargetRms, gain: row.matchedGain, ...row.matchedStats,
      finalTargetRms, postGainLinear: finalTargetRms / row.matchedStats.rms,
      postGainDb: 20 * Math.log10(finalTargetRms / row.matchedStats.rms),
      predictedPostGainPeak: row.predictedPostGainPeak }
  })),
  artifacts
};
await writeFile(`${evidence}/render-manifest.json`, JSON.stringify(renderManifest, null, 2) + '\n');

const morphologyCycle = [
  ['compact', 'elongated'], ['elongated', 'curved'], ['curved', 'Y-branch'],
  ['Y-branch', 'loop-like'], ['loop-like', 'concave / irregular broad'],
  ['concave / irregular broad', 'compact']
];
const shapeByMorphology = new Map(roster.shapes.map(shape => [shape.morphology, shape]));
const measurementMetadata = shape => ({
  morphology: shape.morphology,
  geometryRecipe: shape.geometryRecipe,
  sourceGrid: { dimensions: [96, 96], ...shape.sourceGrid },
  solverGrid: { dimensions: [32, 32], ...shape.solverGrid },
  pickupNodeIndices: shape.pickupNodeIndices,
  pickupSolverCells: shape.pickupSolverCells,
  contactRoute: shape.contactRoute,
  material: shape.material,
  maskSha256: shape.maskSha256,
  topologySha256: shape.topologySha256
});
const config = {
  schemaVersion: 1,
  viewerId: 'ant-synthetic-plate-shape-capability',
  evidenceId: roster.evidenceId,
  title: 'Synthetic Plate shape capability blind session',
  metadata: 'Complete and export the natural cross-Plate blind session before opening this session; revealed synthetic geometry and audio associations may bias natural Plate judgments. Matched playback target 0.08 is digital RMS, not calibrated SPL. No human synthetic-shape listening assessment collected yet.',
  sourceListeningManifest: 'listening-manifest.json',
  output: 'synthetic-shape-listening.html',
  validationOutput: 'viewer-validation.json',
  listeningPostGainTargetRms: finalTargetRms,
  blindSession: { enabled: true, preRevealMode: 'matched-only',
    catchTrial: { id: 'shape-catch-aa', sourcePairId: 'shape-pair-01', sourceArm: 'a' } },
  pairs: morphologyCycle.map(([left, right], index) => ({
    id: `shape-pair-${String(index + 1).padStart(2, '0')}`,
    label: `Comparison ${index + 1}`,
    ...Object.fromEntries([['a', left], ['b', right]].map(([arm, morphology]) => {
      const shape = shapeByMorphology.get(morphology);
      assert.ok(shape, `missing frozen shape fixture ${morphology}`);
      const shapeIndex = roster.shapes.indexOf(shape) + 1;
      const caseId = `case-${String(shapeIndex).padStart(2, '0')}`;
      return [arm, { label: morphology, sourcePairLabel: `shape-${String(shapeIndex).padStart(2, '0')}`,
        fixedGainPath: `listening/${caseId}-fixed.wav`,
        rmsMatchedPath: `listening/${caseId}-matched.wav`, measurementMetadata: measurementMetadata(shape) }];
    }))
  }))
};
await writeFile(`${evidence}/viewer-config.json`, JSON.stringify(config, null, 2) + '\n');
console.log(JSON.stringify({ renderCount: renders.length, wavCount: artifacts.length,
  totalWavBytes: artifacts.reduce((sum, item) => sum + item.bytes, 0),
  maxPredictedPostGainPeak: Math.max(...renders.map(row => row.predictedPostGainPeak)) }, null, 2));
