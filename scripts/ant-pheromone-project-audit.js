import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Read-only scientific input audit; never consume the invalid legacy recent window.
const root = fileURLToPath(new URL('../', import.meta.url));
const base = 'docs/ant/evidence/';
const output = `${base}2026-10-25-pheromone-project-decision/AUDIT.json`;
const receipts = [];
const hash = b => createHash('sha256').update(b).digest('hex');
function read(path) {
  const bytes = readFileSync(resolve(root, path));
  receipts.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  return JSON.parse(bytes);
}
const cue = read(`${base}2026-10-24-cic-316-gaussian-dose-unit-qualification/RESULTS.json`);
const natural = read(`${base}2026-10-24-ant-316-gaussian-dose-unit-movement-shadow/data/SUMMARY.json`);
const corrected = read(`${base}2026-10-25-ant-g-reinforcement-ablation/data/SUMMARY.json`);
const h = read(`${base}2026-10-25-ant-g-adherence-coupling-control/data/SUMMARY.json`);
const i = read(`${base}2026-10-25-ant-g-aggregate-adherence-budget-control/data/i-results/SUMMARY.json`);
const runtime = read(`${base}2026-10-24-ant-316-gaussian-dose-unit-movement-shadow/data/RUNTIME.json`);
const fixedCue = Object.entries(cue.primary.arms).map(([arm, a]) => ({ arm,
  localSignErrors: a.localSignErrors, localMae: a.allRowLocalSteeringMae,
  wideErrors: a.wideWinnerErrors, straightZero: a.straightZero.candidate,
  sZero: a.sCurveAnalyticZero.candidate, phaseSpread: a.phaseSteeringSpread.mean,
  mirrorResidual: a.mirrorSteeringResidual.mean }));
assert.deepEqual(fixedCue.map(a => a.localSignErrors), [552, 0, 334, 10, 10]);
assert.deepEqual(fixedCue.map(a => a.wideErrors), [2378, 2378, 1017, 1401, 1415]);
assert.equal(cue.primary.decision, 'QUALIFIED FOR LATER MOVEMENT SHADOW');

const cumulative = natural.scenarios.flatMap(s => s.arms.filter(a => ['C', 'G'].includes(a.arm)).map(a => {
  const end = a.checkpoints.find(c => c.seconds === 600);
  assert.ok(end);
  const lastBin = histogram => histogram.bins.at(-1) / histogram.count;
  return { seed: s.seed, arm: a.arm, cumulativeCoverage: end.occupancy.cumulativeCoverage,
    cumulativeTop10Share: end.occupancy.cumulative.top10PercentMassShare,
    population: end.activePopulation, travelPerActiveAntSecond: a.movement.travelPerActiveAntSecond,
    plateBirths: a.events.plateBirths, firstPlateSeconds: a.events.firstPlateSeconds,
    maximumFieldValue: a.fieldWrites.maximumNodeValue, capTouches: a.fieldWrites.capTouchCount,
    saturatedUpdates: a.fieldWrites.saturatedUpdateCount, saturationLoss: a.fieldWrites.saturationLoss,
    localStrengthMean: a.trail.localStrength.mean, localStrengthTopBinShare: lastBin(a.trail.localStrength),
    farHillMean: a.trail.farHill.mean, farHillTopBinShare: lastBin(a.trail.farHill),
    invariantFailures: a.invariants };
}));
const recent = i.scenarios.flatMap(s => Object.entries(s.arms).map(([arm, a]) => ({
  seed: s.seed, arm, ...a.checkpoints.find(c => c.seconds === 600).occupancy
})));
for (const s of corrected.scenarios) {
  const g = s.arms.find(a => a.arm === 'G').correctedOccupancyCheckpoints.find(c => c.second === 600);
  const shared = recent.find(r => r.seed === s.seed && r.arm === 'G');
  assert.equal(g.recent30s.coverage, shared.recent30sCoverage);
  assert.equal(g.recent30s.normalizedEntropy, shared.recent30sEntropy);
  const original = cumulative.find(r => r.seed === s.seed && r.arm === 'G');
  assert.equal(g.cumulative.coverage, original.cumulativeCoverage);
  assert.equal(g.cumulative.top10PercentMassShare, original.cumulativeTop10Share);
}
for (const table of h.correctedCheckpointTables) {
  const end = table.checkpoints.find(c => c.seconds === 600);
  for (const arm of ['G', 'H']) {
    const shared = recent.find(r => r.seed === table.seed && r.arm === arm);
    assert.ok(shared);
    for (const key of ['cumulativeCoverage', 'cumulativeTop10Share', 'recent30sCoverage', 'recent30sEntropy']) {
      assert.equal(end[arm][key], shared[key]);
    }
  }
}
for (const [path, expected] of Object.entries(natural.sourceHashes)) {
  const bytes = readFileSync(resolve(root, path));
  assert.equal(hash(bytes), expected, `Inherited production/tool source changed: ${path}`);
  receipts.push({ path, bytes: bytes.length, sha256: expected });
}
const result = { schema: 'ant-pheromone-project-audit/v1', scientificOperation: 'Read existing summaries only; no simulation or cue replay.',
  fixedCue, cumulative, correctedRecent: recent,
  measurementCaveat: 'Legacy original G/C recent-window fields excluded. No corrected C recent comparison is available here.',
  historicalInstrumentedNodeRuntime: runtime, receipts };
writeFileSync(resolve(root, output), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', fixedCueArms: fixedCue.length, cumulativeRows: cumulative.length,
  correctedRecentRows: recent.length, verifiedInputs: receipts.length, output }));
