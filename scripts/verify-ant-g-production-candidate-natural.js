import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const PARENT = 'c45e1845bd86a5a6f1082b5c67ef6f521cd860c1';
const PARENT_DIR = 'docs/ant/evidence/2026-10-24-ant-316-gaussian-dose-unit-movement-shadow/data';
const CURRENT_DIR = resolve('docs/ant/evidence/2026-10-25-g-production-candidate-review/data');
const OUTPUT = resolve('docs/ant/evidence/2026-10-25-g-production-candidate-review/NATURAL-CONFORMANCE.json');
const parseGzip = data => JSON.parse(gunzipSync(data));
const sha256 = data => createHash('sha256').update(data).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const readParent = path => execFileSync('git', ['show', `${PARENT}:${PARENT_DIR}/${path}`],
  { maxBuffer: 32 * 1024 * 1024 });
const oldSummary = JSON.parse(readParent('SUMMARY.json').toString('utf8'));
const currentSummary = JSON.parse(await readFile(resolve(CURRENT_DIR, 'SUMMARY.json'), 'utf8'));
assert.equal(currentSummary.seconds, 600);
assert.deepEqual(currentSummary.scenarios.map(row => row.seed), [20261005, 20261006, 20261007]);

const seeds = [];
for (const scenario of currentSummary.scenarios) {
  const seed = scenario.seed;
  const current = scenario.arms.find(arm => arm.arm === 'G');
  const parentScenario = oldSummary.scenarios.find(row => row.seed === seed);
  const parent = parentScenario?.arms.find(arm => arm.arm === 'G');
  assert(parent && current, `matched G arm for ${seed}`);
  const name = `seed${seed}-G-raw.json.gz`;
  const oldRawBytes = readParent(name);
  const newRawBytes = await readFile(resolve(CURRENT_DIR, name));
  const oldRaw = parseGzip(oldRawBytes), newRaw = parseGzip(newRawBytes);
  const mapChecks = [];
  for (const checkpoint of [30, 60, 120, 300, 600]) {
    const mapName = `seed${seed}-G-${checkpoint}s.json.gz`;
    const oldMap = parseGzip(readParent(mapName));
    const newMap = parseGzip(await readFile(resolve(CURRENT_DIR, mapName)));
    mapChecks.push({ seconds: checkpoint,
      pheromoneResampleExact: same(newMap.pheromone, oldMap.pheromone),
      surfaceExact: same(newMap.surface, oldMap.surface),
      cumulativeOccupancyExact: same(newMap.occupancy.cumulativeAntSeconds, oldMap.occupancy.cumulativeAntSeconds),
      persistentChemicalMaskExact: same(newMap.persistent30sChemicalMask, oldMap.persistent30sChemicalMask) });
    for (const [name, pass] of Object.entries(mapChecks.at(-1))) {
      if (name === 'seconds') continue;
      assert.equal(pass, true, `${seed} ${checkpoint}s ${name}`);
    }
  }
  const checks = {
    initialFingerprint: current.initialStateSha256 === parent.initialStateSha256,
    movement: same(current.movement, parent.movement),
    trail: same(current.trail, parent.trail),
    eventSummary: same(current.events, parent.events),
    rawPositions: same(newRaw.positions, oldRaw.positions),
    rawContactBuckets: same(newRaw.contactsBySecond, oldRaw.contactsBySecond),
    plateBirths: same(newRaw.births, oldRaw.births),
    sphereBirths: same(newRaw.nodules, oldRaw.nodules),
    rawEventHashes: same(newRaw.events, oldRaw.events),
    oldCoefficientRequestMatchesNewScaledSourceRequest:
      Math.abs(parent.fieldWrites.requestedDose - current.fieldWrites.coefficientRequestedDose) < 1e-8,
    oldAcceptedCoefficientMatchesNewScaledSourceAccepted:
      Math.abs(parent.fieldWrites.acceptedDose - current.fieldWrites.acceptedDose * current.sourceConfig.internalDoseScale) < 1e-7,
    writerParityMismatches: current.fieldWrites.writerParityMismatches === 0,
    noSaturation: current.fieldWrites.saturatedUpdateCount === 0 && current.fieldWrites.saturationLoss === 0,
    checkpointTrajectory: same(
      current.checkpoints.map(({ occupancy, field, earlyRouteMassShare, earlyRouteFootShare, ...row }) => ({
        ...row, contacts: { ...row.contacts, earlyRouteFeet: undefined }, field: {
          max: field.max, sum: field.sum, finite: field.finite, maxNodeValueEver: field.maxNodeValueEver,
          cap: field.cap
        }
      })),
      parent.checkpoints.map(({ occupancy, field, earlyRouteMassShare, earlyRouteFootShare, ...row }) => ({
        ...row, contacts: { ...row.contacts, earlyRouteFeet: undefined }, field: {
          max: field.max, sum: field.sum, finite: field.finite, maxNodeValueEver: field.maxNodeValueEver,
          cap: field.cap
        }
      }))
    )
  };
  for (const [key, value] of Object.entries(checks)) assert.equal(value, true, `${seed} ${key}`);
  seeds.push({ seed, checks, mapChecks, currentRawSha256: sha256(newRawBytes), parentRawSha256: sha256(oldRawBytes),
    initialStateSha256: current.initialStateSha256,
    totalTravel: current.movement.totalDistance,
    travelPerActiveAntSecond: current.movement.travelPerActiveAntSecond,
    activePopulation600s: current.checkpoints.at(-1).activePopulation,
    totalSpawned: current.checkpoints.at(-1).totalSpawned,
    totalRetired: current.checkpoints.at(-1).totalRetired,
    contacts: current.events.individualFeet,
    plates: current.events.plateBirths,
    firstPlateSeconds: current.events.firstPlateSeconds,
    maxNodeValueEver: current.fieldWrites.maximumNodeValue,
    capHits: current.fieldWrites.saturatedUpdateCount,
    authoredRequestedDose: current.fieldWrites.requestedDose,
    authoredAcceptedDose: current.fieldWrites.acceptedDose,
    internallyScaledRequestedDose: current.fieldWrites.coefficientRequestedDose,
    correctedRecent30sAt600: current.checkpoints.at(-1).occupancy.recent30sCoverage,
    correctedRecentEntropyAt600: current.checkpoints.at(-1).occupancy.recent30s.normalizedEntropy,
    cumulativeCoverageAt600: current.checkpoints.at(-1).occupancy.cumulativeCoverage,
    cumulativeTop10ShareAt600: current.checkpoints.at(-1).occupancy.cumulative.top10PercentMassShare });
}

const result = { schema: 'ant-g-production-candidate-natural-conformance-v1', parentCommit: PARENT,
  currentRun: resolve(CURRENT_DIR, 'SUMMARY.json'), sourceUnitNote:
    'Research G stored internally scaled nodal requests; candidate public API reports authored source-dose. ' +
    'The receipt compares candidate internal coefficient requests against the research writer dose.',
  recentOccupancyNote: 'Only current values use the corrected 60 Hz per-second occupancy buckets; legacy parent recent arrays are excluded.',
  deterministic: true, seedCount: seeds.length, seeds };
await writeFile(OUTPUT, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: OUTPUT, seeds: seeds.length, allChecks: 'pass' }));
