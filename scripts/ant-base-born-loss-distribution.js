import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { compileSurfaceTopology } from '../src/lib/audio/compileSurfaceTopology.js';
import { q4MatchedFlatLossTopology, transformSurface } from './ant-base-born-shadow.js';
import { renderSurface, sha256 } from './ant-sonic-shadow-render.js';

const evidence = 'docs/ant/evidence/2026-10-14-base-born-loss-distribution';
const output = 'test-results/ant-base-born-loss-distribution-20261014';
const inputPath = 'docs/ant/evidence/2026-10-13-plate-sonic-individuality/frozen-inputs.json.gz';
const priorIndexPath = 'test-results/ant-base-born-causal-decomposition-20261014/render-index.json';
const frames = 72_000, sampleRate = 48_000, strikeFrame = 480;
const gammaBase48 = 0.0000616140594288357, gammaStar = 8 * gammaBase48;
const command = 'node --expose-gc scripts/ant-base-born-loss-distribution.js';
const inputBytes = await readFile(inputPath);
assert.equal(sha256(inputBytes), 'f600eb768df2721c98cc607ea8b4b4d4fc64ae74cda6b5bf3f9297e8b0865a2d');
const inputs = JSON.parse(gunzipSync(inputBytes));
const sorted = [...inputs.selected].sort((a, b) => a.solverNodes - b.solverNodes || a.key.localeCompare(b.key));
const maximum = sorted.at(-1).solverNodes;
const selected = [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted.find(row => row.solverNodes === maximum)];
assert.deepEqual(selected.map(row => row.key), [
  '20261005-trail-plate-1', '20261005-trail-plate-24', '20261007-trail-plate-26'
]);
for (const row of selected) assert.equal(sha256(JSON.stringify(row.plate)), row.descriptorSha256);

const source = await readFile('static/worklets/surface-plate.worklet.js', 'utf8');
assert.equal(sha256(source), '14c7461f1412f0d6897a6683d46e582dbb80711f2ba74e8ea53e026895eeea5e');
const previousIndex = JSON.parse(await readFile(priorIndexPath, 'utf8'));
assert.equal(previousIndex.baseline, '2a65dc892f96fef2254afdb3c0621e3023e67c0b');
assert.equal(previousIndex.productionMain, 'd45823d40c9a87c1b333fa9872f3c897ee9ab01b');
await mkdir(output, { recursive: true });
await mkdir(evidence, { recursive: true });

function pathPosition(plate, fraction) {
  const lengths = [0], path = plate.principalPath;
  for (let i = 1; i < path.length; i++) lengths.push(lengths.at(-1)
    + Math.hypot(path[i] % 96 - path[i - 1] % 96,
      Math.floor(path[i] / 96) - Math.floor(path[i - 1] / 96)));
  const cell = path[lengths.findIndex(value => value >= lengths.at(-1) * fraction)];
  return { x: cell % 96 / 95, y: Math.floor(cell / 96) / 95 };
}

function eventsFor(plate) {
  return [{ frame: strikeFrame, message: { type: 'strike', payload: {
    plateId: plate.id, layerId: plate.id, position: pathPosition(plate, 0.5),
    strength: 0.035, footprintRadius: 0.01, hardness: 0.5
  } } }];
}

const packedHash = topology => sha256(JSON.stringify(topology, (_key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value));
function interleave(left, right) {
  const values = new Float32Array(left.length * 2);
  for (let i = 0; i < left.length; i++) { values[2 * i] = left[i]; values[2 * i + 1] = right[i]; }
  return Buffer.from(values.buffer);
}

const artifacts = [];
async function save(path, data, role) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  await writeFile(path, bytes);
  artifacts.push({ path, role, bytes: bytes.length, sha256: sha256(bytes), generationCommand: command });
  return sha256(bytes);
}

function q4(b, tau, d, gamma) {
  const q = 4, a = 2 - d - b * q * q - tau * q - gamma * q, product = 1 - d - gamma * q;
  const discriminant = a * a - 4 * product;
  const poleRadius = Math.sqrt(product);
  return { a, product, inputGain: product, poleRadius,
    frequencyHz: discriminant < 0 ? 6000 * Math.acos(a / (2 * poleRadius)) / (2 * Math.PI) : null,
    decayTauSeconds: discriminant < 0 ? -2 / (6000 * Math.log(product)) : null };
}

const geometries = [], rows = [], manipulation = [];
for (const selectedPlate of selected) {
  const key = selectedPlate.key, topology = compileSurfaceTopology({ plates: [selectedPlate.plate] });
  assert.equal(topology.layerIds.length, 1);
  assert.equal(topology.nodeGridIndices.length, selectedPlate.solverNodes);
  assert.equal(topology.adjacentLinkNodes.length, 0);
  assert.equal(topology.noduleIds.length, 0);
  const frequency = transformSurface(source, { frequencyLoss: gammaStar });
  const flatTopology = q4MatchedFlatLossTopology(topology, gammaStar);
  const events = eventsFor(selectedPlate.plate);
  const oldFrequency = previousIndex.rows.find(row => row.id === `${key}-loss-frequency`);
  assert.ok(oldFrequency, `${key}: existing frequency-loss response is required`);
  assert.equal(oldFrequency.definition.frequencyLoss, gammaStar);
  assert.equal(oldFrequency.scheduleSha256, sha256(JSON.stringify(events)));
  assert.equal(oldFrequency.geometryKey, selectedPlate.descriptorSha256);
  assert.equal(oldFrequency.topologySha256, packedHash(topology));
  assert.equal(oldFrequency.sourceSha256, sha256(frequency.source));

  const dBorn = 50 * topology.materialCoefficients[3];
  const requestedFlatD = dBorn + 4 * gammaStar;
  const storedFlatD = 50 * flatTopology.materialCoefficients[3];
  const b = topology.materialCoefficients[0], tau = topology.materialCoefficients[1] / topology.materialCoefficients[2];
  const realFlat = q4(b, tau, requestedFlatD, 0), realFrequency = q4(b, tau, dBorn, gammaStar);
  const storedFlat = q4(b, tau, storedFlatD, 0), storedFrequency = q4(b, tau, dBorn, gammaStar);
  manipulation.push({ key, dBorn, gammaStar, requestedFlatD, storedFlatD,
    float32DResidual: storedFlatD - requestedFlatD,
    realValuedQ4Residual: { a: realFlat.a - realFrequency.a, inputGain: realFlat.inputGain - realFrequency.inputGain,
      poleRadius: realFlat.poleRadius - realFrequency.poleRadius },
    storedQ4Residual: { a: storedFlat.a - storedFrequency.a, inputGain: storedFlat.inputGain - storedFrequency.inputGain,
      poleRadius: storedFlat.poleRadius - storedFrequency.poleRadius },
    q4: { flatLoss: storedFlat, frequencyLoss: storedFrequency } });

  const geometry = { key, descriptorSha256: selectedPlate.descriptorSha256, solverNodes: topology.nodeGridIndices.length,
    topologySha256: packedHash(topology), nodeGridIndices: Array.from(topology.nodeGridIndices),
    neighborIndices: Array.from(topology.neighborIndices), pickupNodeIndices: Array.from(topology.pickupNodeIndices) };
  geometries.push(geometry);
  const arms = [
    { condition: 'flat', source, topology: flatTopology, gamma: 0, damping: storedFlatD,
      definition: { lossOperator: 'uniform', gamma: 0, d: storedFlatD, requestedD: requestedFlatD, matchedAtQ: 4 } },
    { condition: 'frequency', source: frequency.source, topology, gamma: gammaStar, damping: dBorn,
      definition: { lossOperator: 'frequency-selective', gamma: gammaStar, d: dBorn, matchedAtQ: 4 } }
  ];

  for (const arm of arms) {
    assert.equal(arm.topology.solverRateHz, topology.solverRateHz);
    assert.equal(arm.topology.generation, topology.generation);
    for (const field of ['nodeOffsets', 'nodeGridIndices', 'neighborIndices', 'pickupNodeIndices', 'layerIds',
      'routingTopLayerByCell96', 'columnOffsets', 'columnLayerIndices', 'columnNodeIndices',
      'adjacentLinkOffsets', 'adjacentLinkNodes', 'adjacentLinkCoefficients', 'noduleIds']) {
      assert.deepEqual(arm.topology[field], topology[field], `${key} ${arm.condition}: ${field} unchanged`);
    }
    for (let i = 0; i < topology.materialCoefficients.length; i++) {
      if (i % 4 !== 3) assert.equal(arm.topology.materialCoefficients[i], topology.materialCoefficients[i],
        `${key} ${arm.condition}: elastic/material coefficient ${i} unchanged`);
    }
    assert.equal(arm.source, arm.condition === 'flat' ? source : frequency.source);
    const result = renderSurface({ source: arm.source, topology: arm.topology, events, frames });
    assert.equal(result.telemetry.strikes, 1);
    assert.equal(result.telemetry.physicsRate, 6000);
    assert.equal(result.telemetry.contactPulseDurationMs, 3);
    assert.equal(result.telemetry.contactRecoveryTimeMs, 75);
    assert.equal(result.telemetry.nonFinite, 0);
    assert.equal(result.telemetry.droppedRoutes, 0);
    assert.equal(result.telemetry.dropped, 0);
    assert.equal(result.telemetry.clipped, 0);
    assert.equal(result.fields.frames, 9000);
    assert.equal(result.fields.sampleRate, 6000);
    assert.deepEqual(result.renderedFrameReceipts.map(receipt => receipt.frame), [strikeFrame]);
    let repeatChecks = null;
    if (arm.condition === 'flat') {
      const repeat = renderSurface({ source: arm.source, topology: arm.topology, events, frames });
      assert.deepEqual(repeat.pcm, result.pcm, `${key} flat control repeat PCM`);
      assert.deepEqual(repeat.fields, result.fields, `${key} flat control repeat field`);
      assert.deepEqual(repeat.rawPickup, result.rawPickup, `${key} flat control repeat pickup`);
      repeatChecks = { pcm: true, fields: true, rawPickup: true };
    }

    const id = `${key}-${arm.condition}`;
    const files = { pcm: `${id}.pcm.f32le`, fields: `${id}.field.f32le`,
      rawPickup: `${id}.pickup.f32le`, preLimiter: `${id}.pickup.f32le` };
    const pcmHash = await save(`${output}/${files.pcm}`, interleave(result.pcm.left, result.pcm.right),
      'fixed gain 1 measured stereo PCM after limiter and interpolation');
    const fieldHash = await save(`${output}/${files.fields}`, Buffer.from(result.fields.values.buffer),
      'all-node 6 kHz displacement; squared values are not joules');
    const pickupHash = await save(`${output}/${files.rawPickup}`, interleave(result.rawPickup.left, result.rawPickup.right),
      'unscaled stereo Born pickups before limiter at 6 kHz');
    const row = { id, plateKey: key, condition: arm.condition, positionLabel: 'p50', frames, sampleRate,
      physicsRate: 6000, fieldSampleRate: 6000, strikeFrame, nodeCount: result.nodeCount,
      fieldFrames: result.fields.frames, fieldFirstStep: 0, rawPickupFirstStep: 0,
      geometryKey: selectedPlate.descriptorSha256, topologySha256: packedHash(arm.topology),
      sourceSha256: sha256(arm.source), schedule: events, scheduleSha256: sha256(JSON.stringify(events)),
      coefficients: Array.from(arm.topology.materialCoefficients), definition: arm.definition,
      telemetry: result.telemetry, deterministicRepeat: repeatChecks,
      files, fileSha256: { pcm: pcmHash, fields: fieldHash, rawPickup: pickupHash } };
    rows.push(row);

    if (arm.condition === 'frequency') {
      for (const [kind, path] of Object.entries({ pcm: oldFrequency.files.pcm,
        fields: oldFrequency.files.fields, rawPickup: oldFrequency.files.rawPickup })) {
        const original = await readFile(path);
        const reproduced = await readFile(`${output}/${files[kind]}`);
        assert.equal(sha256(reproduced), sha256(original), `${id} reproduces prior ${kind} byte-for-byte`);
      }
    }
    console.log(`${id}: rendered; peak=${result.telemetry.maxOutputAbs.toFixed(7)}`);
    globalThis.gc?.();
  }
}

assert.equal(rows.length, 6);
const index = { schemaVersion: 1, question: 'Does frequency-selective loss create pickup character beyond q=4-matched flat loss?',
  productionMain: 'd45823d40c9a87c1b333fa9872f3c897ee9ab01b',
  researchBranch: 'codex/ant-base-born-causal-decomposition-20261014',
  researchHead: '7761c4b10d77c657bc23c1691c95c04ea78bb739',
  baselinePackage: 'docs/ant/evidence/2026-10-14-base-born-causal-decomposition',
  baselineIndexPath: priorIndexPath, baselineIndexSha256: sha256(await readFile(priorIndexPath)),
  frozenInputPath: inputPath, frozenInputSha256: sha256(inputBytes),
  render: { frames, sampleRate, physicsRate: 6000, physicsFrames: 9000, strikeFrame, strikeTimeMs: 10,
    contactPulseMs: 3, complianceRecoveryMs: 75, plateDampingMultiplier: 50, fixedGain: 1,
    contact: { strength: 0.035, footprintRadius: 0.01, hardness: 0.5, position: 'principal-path p50' } },
  loss: { gammaBase48, gammaStar, flatControl: 'gamma=0; d=dBorn+4*gammaStar',
    frequencyArm: 'gamma=gammaStar; d=dBorn', q4MatchesInRealArithmetic: true },
  manipulation, geometries, rows };
const indexPath = `${output}/render-index.json`;
const indexBytes = Buffer.from(JSON.stringify(index, null, 2) + '\n');
await writeFile(indexPath, indexBytes);
const tools = ['scripts/ant-base-born-loss-distribution.js', 'scripts/ant-base-born-shadow.js',
  'scripts/ant-sonic-shadow-render.js', 'src/lib/audio/compileSurfaceTopology.js', 'static/worklets/surface-plate.worklet.js'];
const sourceToolHashes = {};
for (const path of tools) sourceToolHashes[path] = sha256(await readFile(path));
await writeFile(`${evidence}/render-manifest.json`, JSON.stringify({ command, node: process.version,
  indexPath, indexSha256: sha256(indexBytes), output, ignored: true,
  frozenInputPath: inputPath, frozenInputSha256: sha256(inputBytes), sourceToolHashes,
  oldFrequencyArmReproducedByteExact: true, cases: rows.length, artifacts }, null, 2) + '\n');
console.log(JSON.stringify({ cases: rows.length, bytes: artifacts.reduce((sum, item) => sum + item.bytes, 0),
  output, evidence, gammaStar }, null, 2));
