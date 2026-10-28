import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { runFrozenDecision, runFrozenLocal } from './lib/antPheromoneDecisionShadow.js';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = resolve(root, 'docs/ant/evidence/2026-10-28-causal-memory-responsibilities/data');
const sha = b => createHash('sha256').update(b).digest('hex');
const bytes = await readFile(resolve(base, 'frozen-cases.json.gz'));
const packet = JSON.parse(gunzipSync(bytes).toString(), (_k, v) => v && typeof v === 'object'
  && Object.keys(v).length === 1 && v.$antNegativeZero === true ? -0 : v);
const receipt = JSON.parse(await readFile(resolve(base, 'capture.json'), 'utf8'));
assert.equal(sha(bytes), receipt.packetSha256);
const start = performance.now();
const copyReads = reads => reads.map(p => {
  assert.ok(p.self >= 0 && p.aliveOther >= 0 && p.retired >= 0);
  return { ...p, full: p.self + p.aliveOther + p.retired, residual: 0 };
});
const mean = a => a.length ? a.reduce((n, v) => n + v, 0) / a.length : null;
const stats = a => ({ n: a.length, mean: mean(a), max: a.length ? Math.max(...a) : null,
  median: a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : null });
function facade(item) {
  return { state: packet.state, updateTrailAdherence: AntController.prototype.updateTrailAdherence,
    occupancy: { crowdingInDirection(_a, _b, heading) {
      const p = item.crowding.find(p => Math.abs(p.heading - heading) < 1e-10);
      assert.ok(p); return p.value;
    } } };
}
function run() {
  const wide = [], local = [], invalid = { localCases: 0, localWithNegativeReads: 0,
    localRNonfinite: 0, localRCoherenceOutsideUnitInterval: 0, negativeRReadCount: 0, mostNegativeRRead: 0 };
  for (const item of packet.cases) {
    assert.ok(performance.now() - start < 30000, '30s frozen residual audit boundary');
    const c = facade(item);
    if (item.localCase) {
      invalid.localCases++;
      const negative = item.localReads.map(p => p.full - p.retired).filter(v => v < 0);
      if (negative.length) invalid.localWithNegativeReads++;
      invalid.negativeRReadCount += negative.length;
      invalid.mostNegativeRRead = Math.min(invalid.mostNegativeRRead, ...negative);
      try {
        const r = runFrozenLocal(c, item.before, item.localReads, 1 / 60, 'removeRetired');
        if (r.profile.coherence < 0 || r.profile.coherence > 1) invalid.localRCoherenceOutsideUnitInterval++;
      } catch (e) { if (!(e instanceof RangeError)) throw e; invalid.localRNonfinite++; }
      const f = runFrozenLocal(c, item.before, item.localReads);
      const reads = copyReads(item.localReads);
      const pair = Object.fromEntries(['full', 'removeRetired', 'flatRetired'].map(k =>
        [k, runFrozenLocal(c, item.before, reads, 1 / 60, k)]));
      for (const r of Object.values(pair)) {
        assert.ok(r.profile.strength >= 0 && r.profile.strength <= 1);
        assert.ok(r.profile.coherence >= 0 && r.profile.coherence <= 1);
      }
      local.push({ f, pair });
    }
    if (item.wideCase) {
      const original = runFrozenDecision(c, item.before, [item.before], item.info, 1 / 60,
        item.local, item.wide, item.randomTape);
      const rebuilt = item.wide.map(p => ({ ...p, reads: copyReads(p.reads) }));
      const clean = runFrozenDecision(c, item.before, [item.before], item.info, 1 / 60,
        item.local, rebuilt, item.randomTape);
      wide.push({ seconds: item.fieldTimeSeconds,
        original: Object.fromEntries(Object.entries(original.conditions).map(([k, v]) => [k, v.selectedOptionIndex])),
        clean: Object.fromEntries(Object.entries(clean.conditions).map(([k, v]) => [k, v.selectedOptionIndex])),
        fullConfidenceShamDelta: Math.abs(original.conditions.full.agentAfter.trailConfidence - clean.conditions.full.agentAfter.trailConfidence) });
    }
  }
  const delta = (rows, left, right, get) => stats(rows.map(row => Math.abs(get(left(row)) - get(right(row)))));
  const f = row => row.f, clean = row => row.pair.full;
  return { schema: 'ant-pheromone-residual-counterfactual-validity-v1', packetSha256: sha(bytes),
    condition: 'Symmetric zero residual author-sum pair, not residual assigned to retired or clamped',
    originalLocalRemovalInvalidity: invalid,
    wide: { cases: wide.length, fullNumericShamChoiceChanged: wide.filter(r => r.original.full !== r.clean.full).length,
      fullNumericShamConfidenceDelta: stats(wide.map(r => r.fullConfidenceShamDelta)),
      residualFreeRemovedChoiceChanged: wide.filter(r => r.clean.full !== r.clean.removeRetired).length,
      residualFreeFlatChoiceChanged: wide.filter(r => r.clean.full !== r.clean.flatRetired).length,
      originalVersusResidualFreeRemovalChoiceChanged: wide.filter(r => r.original.removeRetired !== r.clean.removeRetired).length,
      originalVersusResidualFreeFlatChoiceChanged: wide.filter(r => r.original.flatRetired !== r.clean.flatRetired).length },
    local: { cases: local.length, fullNumericSham: {
      strength: delta(local, f, clean, r => r.profile.strength),
      steering: delta(local, f, clean, r => r.profile.steering),
      nextAdherence: delta(local, f, clean, r => r.trailAdherenceAfter) },
      residualFreePairs: Object.fromEntries(['removeRetired', 'flatRetired'].map(k => [k, {
        strength: delta(local, clean, r => r.pair[k], r => r.profile.strength),
        coherence: delta(local, clean, r => r.pair[k], r => r.profile.coherence),
        steering: delta(local, clean, r => r.pair[k], r => r.profile.steering),
        nextAdherence: delta(local, clean, r => r.pair[k], r => r.trailAdherenceAfter) }])) }, wideCases: wide };
}
const originalRandom = Math.random;
let first, second;
try { Math.random = () => { throw Error('Frozen residual audit RNG use'); }; first = JSON.stringify(run()); second = JSON.stringify(run()); }
finally { Math.random = originalRandom; }
assert.equal(first, second);
const target = resolve(base, 'residual-validity.json');
if (process.argv.includes('--check')) assert.equal(sha(await readFile(target)), sha(first + '\n'));
else { await assert.rejects(readFile(target), { code: 'ENOENT' }); await writeFile(target, first + '\n');
  await writeFile(resolve(base, 'residual-validation.json'), JSON.stringify({ deterministicDuplicate: true,
    resultSha256: sha(first + '\n'), runnerSha256: sha(await readFile(fileURLToPath(import.meta.url))) }, null, 2) + '\n'); }
const { wideCases, ...summary } = JSON.parse(first); console.log(JSON.stringify(summary, null, 2));
