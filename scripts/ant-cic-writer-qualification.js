import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { CicPheromoneField } from './ant-cic-writer.js';
import { localStages, evaluateWide, loadFrozenRows, SOURCE_HASHES } from './ant-field-writer-reader-failure-attribution.js';

export const PACKAGE = 'docs/ant/evidence/2026-10-24-ant-cic-writer-qualification';
export const PROTOCOL_SHA = '6a4aadc894ec5175b0ba1111e5e2b82e9b81c6c9aeb8d6f5e9b16541f26eb7ca';
const FAMILIES = ['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve'];
const PHASES = ['p00', 'p10', 'p01', 'p11'];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mean = xs => xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : null;
const sign = x => Math.abs(x) <= 64 * Number.EPSILON * Math.max(1, Math.abs(x)) ? 0 : Math.sign(x);
const json = p => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const save = (p, data) => { mkdirSync(dirname(resolve(ROOT, p)), { recursive: true }); writeFileSync(resolve(ROOT, p), data); };
const saveJson = (p, data) => save(p, `${JSON.stringify(data, null, 2)}\n`);
const winner = result => result.candidates[result.scoreOrder[0]].offset;

export function evaluateCueGate(metrics) {
  const checks = [];
  const check = (id, passed) => checks.push({ id, passed: Boolean(passed) });
  const valid = (group, keys) => group?.count > 0 && keys.every(k =>
    Number.isFinite(group.baseline?.[k]) && Number.isFinite(group.candidate?.[k]));
  const primary = ['localSignErrors', 'localSteeringMae', 'wideErrors'];
  const g = metrics?.global;
  check('global denominators and metrics exist', valid(g, primary));
  check('global local sign errors strictly decrease', valid(g, primary) && g.candidate.localSignErrors < g.baseline.localSignErrors);
  check('global local steering MAE strictly decreases', valid(g, primary) && g.candidate.localSteeringMae < g.baseline.localSteeringMae);
  check('global wide winner errors do not increase', valid(g, primary) && g.candidate.wideErrors <= g.baseline.wideErrors);
  for (const [kind, names] of [['families', FAMILIES], ['phases', PHASES]]) for (const name of names) {
    const group = metrics?.[kind]?.[name];
    check(`${kind}:${name} all three primary measures nonregress`, valid(group, primary)
      && primary.every(k => group.candidate[k] <= group.baseline[k]));
  }
  for (const name of ['straight', 'sCurveAnalyticZero']) {
    const group = metrics?.zeroControls?.[name];
    const keys = ['falseNonzero', 'falseSteeringMae'];
    check(`zero-control:${name} false steering nonregresses`, valid(group, keys)
      && keys.every(k => group.candidate[k] <= group.baseline[k]));
  }
  return { passed: checks.every(c => c.passed), checks };
}

/** Receipt and original-writer checks do not evaluate candidate cue outcomes. */
export function preflight() {
  assert.equal(sha(readFileSync(resolve(ROOT, PACKAGE, 'PROTOCOL.md'))), PROTOCOL_SHA, 'Preregistration changed');
  const receipts = json(`${PACKAGE}/validation/reused-inputs.json`);
  for (const input of receipts.inputs) {
    assert.equal(sha(readFileSync(resolve(ROOT, input.destination))), input.sourceSha256, input.destination);
  }
  for (const [path, hash] of Object.entries(SOURCE_HASHES)) {
    assert.equal(sha(readFileSync(resolve(ROOT, path))), hash, path);
  }
  const streams = json(`${PACKAGE}/inputs/raster-fixture/validation/write-streams-preflight.json`);
  const manifest = json(`${PACKAGE}/inputs/raster-fixture/manifest.json`);
  const rows = loadFrozenRows(resolve(ROOT, PACKAGE, 'inputs/station-raw.json.gz'));
  const keys = new Set();
  for (const row of rows) {
    const key = `${row.shape}|${row.phase}|${row.station}`;
    assert(!keys.has(key), `Duplicate row ${key}`); keys.add(key);
  }
  const fields = new Map();
  for (const arm of streams.arms) {
    assert.equal(arm.writes.length, 77);
    const field = new PheromoneField();
    for (const write of arm.writes) field.depositPoint(write.gridPosition, { amount: write.requestedAmount, radius: 0.0045 });
    const entry = manifest.rasters.find(r => r.id === arm.id);
    const bytes = readFileSync(resolve(ROOT, PACKAGE, 'inputs/raster-fixture', entry.file));
    assert.equal(sha(bytes), entry.rasterSha256);
    assert(bytes.equals(Buffer.from(field.values.buffer)), `Original raster parity: ${arm.id}`);
    assert.equal(rows.filter(r => `${r.shape}|${r.phase}` === arm.id).length, 231);
    fields.set(arm.id, field);
  }
  assert.equal(fields.size, 24);
  const baselineRows = rows.map(row => {
    const field = fields.get(`${row.shape}|${row.phase}`);
    const rawLocal = row.localGeometry.map(q => field.sample(q.x, q.y));
    const rawWide = row.wideGeometry.map(c => c.reads.map(q => field.sample(q.x, q.y)));
    assert.deepEqual(rawLocal, row.localProductionRaw, 'Current local raw parity');
    assert.deepEqual(rawWide, row.wideProduction.map(c => c.raw), 'Current wide raw parity');
    const local = localStages(rawLocal);
    for (const key of ['left', 'center', 'right', 'strength', 'coherence', 'balance', 'steering']) {
      // JSON preserves numeric zero but not its IEEE sign bit.
      assert(local[key] === row.localProduction[key], `Current local ${key} numeric parity`);
    }
    const wide = evaluateWide(rawWide.map((raw, i) => ({ offset: row.wideGeometry[i].offset, raw })), row.wideGeometry);
    assert.equal(winner(wide), row.productionWinner);
    wide.candidates.forEach((c, i) => assert(c.score === row.wideProduction[i].score));
    const analytic = evaluateWide(row.wideReference.map(c => ({ offset: c.offset, raw: c.raw })), row.wideGeometry);
    assert.equal(winner(analytic), row.referenceWinner);
    analytic.candidates.forEach((c, i) => assert(c.score === row.wideReference[i].score));
    crossCheckProductionSensors(row, rawLocal, rawWide, local, wide);
    return { local, wide };
  });
  const directional = rows.filter(r => sign(r.localReference.steering) !== 0);
  assert.equal(directional.length, 4012);
  assert.equal(directional.filter(r => sign(r.localProduction.steering) !== sign(r.localReference.steering)).length, 552);
  assert.equal(rows.filter(r => r.referenceWinnerUnique).length, 5072);
  assert.equal(rows.filter(r => r.referenceWinnerUnique && r.productionWinner !== r.referenceWinner).length, 2378);
  assert.equal(rows.filter(r => r.shape === 'straight').length, 924);
  assert.equal(rows.filter(r => r.shape === 'sCurve' && sign(r.localReference.steering) === 0).length, 392);
  return { rows, streams, fields, baselineRows, receipt: {
    passed: true, rows: rows.length, originalRasterParities: fields.size,
    localRawQueriesExact: rows.length * 18, wideRawQueriesExact: rows.length * 25,
    localSensorMethodChecks: rows.length, wideSensorMethodChecks: rows.length * 5,
    directionalLocal: 4012, baselineSignErrors: 552, uniqueWide: 5072, baselineWideErrors: 2378,
    inputFilesVerified: receipts.inputs.length, protocolSha256: PROTOCOL_SHA, sourceHashes: SOURCE_HASHES
  } };
}

/** Frozen query values through the real production sensor methods, never a tick. */
function crossCheckProductionSensors(row, rawLocal, rawWide, local, wide) {
  const heading = row.wideGeometry[2].heading;
  const agent = { heading, x: row.localGeometry[4].x - Math.cos(heading) * 0.016,
    y: row.localGeometry[4].y - Math.sin(heading) * 0.016 };
  const fake = { state: { behavior: { sensorDistance: 0.042, sensorWidth: 0.014 } } };
  const replay = (queries, samples) => {
    let index = 0;
    fake.field = { sample(x, y) {
      const q = queries[index];
      assert(q, 'Unexpected extra production sensor query');
      assert(Math.abs(x - q.x) <= 64 * Number.EPSILON && Math.abs(y - q.y) <= 64 * Number.EPSILON, 'Physical sensor geometry parity');
      return samples[index++];
    } };
    return () => assert.equal(index, samples.length, 'Missing production sensor query');
  };
  let done = replay(row.localGeometry, rawLocal);
  const actual = AntController.prototype.senseLocalTrail.call(fake, agent); done();
  for (const key of ['left', 'center', 'right', 'strength', 'coherence', 'steering']) assert(actual[key] === local[key]);
  for (let i = 0; i < row.wideGeometry.length; i++) {
    const geometry = row.wideGeometry[i];
    done = replay(geometry.reads, rawWide[i]);
    const value = AntController.prototype.senseTrail.call(fake, agent, geometry.heading); done();
    assert.equal(value, wide.candidates[i].maximum);
  }
}

function summarize(rows) {
  const directional = rows.filter(r => sign(r.reference.steering) !== 0);
  const unique = rows.filter(r => r.uniqueWinner);
  const measure = arm => ({
    localSignErrors: directional.filter(r => sign(r[arm].local.steering) !== sign(r.reference.steering)).length,
    localSteeringMae: mean(rows.map(r => Math.abs(r[arm].local.steering - r.reference.steering))),
    wideErrors: unique.filter(r => r[arm].winner !== r.referenceWinner).length
  });
  const baseWrong = r => sign(r.baseline.local.steering) !== sign(r.reference.steering);
  const candWrong = r => sign(r.candidate.local.steering) !== sign(r.reference.steering);
  return { count: rows.length, directionalLocalCount: directional.length, uniqueWideCount: unique.length,
    baseline: measure('baseline'), candidate: measure('candidate'),
    directionalLocalSteeringMae: Object.fromEntries(['baseline', 'candidate'].map(a => [a,
      mean(directional.map(r => Math.abs(r[a].local.steering - r.reference.steering)))])),
    localRecovered: directional.filter(r => baseWrong(r) && !candWrong(r)).length,
    localNewErrors: directional.filter(r => !baseWrong(r) && candWrong(r)).length,
    wideRecovered: unique.filter(r => r.baseline.winner !== r.referenceWinner && r.candidate.winner === r.referenceWinner).length,
    wideNewErrors: unique.filter(r => r.baseline.winner === r.referenceWinner && r.candidate.winner !== r.referenceWinner).length,
    rawLocalMae: Object.fromEntries(['baseline', 'candidate'].map(a => [a, mean(rows.flatMap(r => r[a].rawLocal.map((x, i) => Math.abs(x - r.referenceRawLocal[i]))))])),
    rawWideMae: Object.fromEntries(['baseline', 'candidate'].map(a => [a, mean(rows.flatMap(r => r[a].rawWide.flatMap((c, k) => c.map((x, i) => Math.abs(x - r.referenceRawWide[k][i])))))])),
    wideAmbiguity: Object.fromEntries(['baseline', 'candidate'].map(a => [a, {
      analyticUniqueRows: unique.length,
      exactFinalTies: unique.filter(r => finalMargin(r[a].wide) === 0).length,
      precisionNearFinalTies: unique.filter(r => sign(finalMargin(r[a].wide)) === 0).length,
      finalMargin: distribution(unique.map(r => finalMargin(r[a].wide)))
    }])),
    analyticMarginOfNewWideErrors: distribution(unique.filter(r =>
      r.baseline.winner === r.referenceWinner && r.candidate.winner !== r.referenceWinner).map(r => r.referenceWinnerMargin)),
    localContrast: Object.fromEntries(['baseline', 'candidate'].map(a => [a, {
      strength: distribution(rows.map(r => r[a].local.strength)), coherence: distribution(rows.map(r => r[a].local.coherence)),
      absoluteBalance: distribution(rows.map(r => Math.abs(r[a].local.balance)))
    }]))
  };
}

function finalMargin(wide) {
  return wide.candidates[wide.scoreOrder[0]].score - wide.candidates[wide.scoreOrder[1]].score;
}

function zeroControl(rows) {
  return { count: rows.length, ...Object.fromEntries(['baseline', 'candidate'].map(a => [a, {
    falseNonzero: rows.filter(r => sign(r[a].local.steering) !== 0).length,
    falseSteeringMae: mean(rows.map(r => Math.abs(r[a].local.steering)))
  }])) };
}

function distribution(values) {
  if (!values.length) return { count: 0, mean: null, min: null, p50: null, p90: null, max: null };
  const sorted = values.toSorted((a, b) => a - b);
  const at = q => sorted[Math.round(q * (sorted.length - 1))];
  return { count: values.length, mean: mean(values), min: at(0), p50: at(0.5), p90: at(0.9), max: at(1) };
}

function rasterStats(field) {
  const values = [...field.values];
  return { mass: values.reduce((a, b) => a + b, 0), peak: Math.max(...values),
    supportNodes: values.filter(v => v !== 0).length, cappedNodes: values.filter(v => v >= 8).length };
}

export async function runQualification() {
  const { rows, streams, fields, baselineRows, receipt } = preflight();
  saveJson(`${PACKAGE}/validation/preflight.json`, receipt);
  const { runMomentGate } = await import('./ant-cic-writer-moments.js');
  const moment = await runMomentGate({ streams, outputDir: resolve(ROOT, PACKAGE, 'gate1') });
  assert.equal(moment.passed, true, 'Gate 1 did not qualify; Gate 2 cannot run');
  const candidates = new Map();
  const rasters = [];
  for (const arm of streams.arms) {
    const field = new CicPheromoneField();
    for (const w of arm.writes) field.depositPoint(w.gridPosition, { amount: w.requestedAmount, radius: 0.0045 });
    candidates.set(arm.id, field);
    const bytes = Buffer.from(field.values.buffer);
    save(`${PACKAGE}/gate2/rasters/${arm.id.replace('|', '-')}.f32le`, bytes);
    rasters.push({ id: arm.id, baseline: rasterStats(fields.get(arm.id)), candidate: rasterStats(field), sha256: sha(bytes) });
    assert.equal(rasters.at(-1).candidate.cappedNodes, 0);
  }
  const compared = rows.map((row, index) => {
    const field = candidates.get(`${row.shape}|${row.phase}`);
    const rawLocal = row.localGeometry.map(q => field.sample(q.x, q.y));
    const rawWide = row.wideGeometry.map(c => c.reads.map(q => field.sample(q.x, q.y)));
    const local = localStages(rawLocal);
    const wide = evaluateWide(rawWide.map((raw, i) => ({ offset: row.wideGeometry[i].offset, raw })), row.wideGeometry);
    crossCheckProductionSensors(row, rawLocal, rawWide, local, wide);
    return { shape: row.shape, phase: row.phase, station: row.station,
      reference: row.localReference, referenceRawLocal: row.localReferenceRaw,
      referenceRawWide: row.wideReference.map(c => c.raw), referenceWinner: row.referenceWinner,
      referenceWinnerMargin: row.referenceWinnerMargin, uniqueWinner: row.referenceWinnerUnique,
      baseline: { ...baselineRows[index], winner: row.productionWinner, rawLocal: row.localProductionRaw,
        rawWide: row.wideProduction.map(c => c.raw) },
      candidate: { local, wide, winner: winner(wide), rawLocal, rawWide } };
  });
  const metrics = {
    global: summarize(compared),
    families: Object.fromEntries(FAMILIES.map(k => [k, summarize(compared.filter(r => r.shape === k))])),
    phases: Object.fromEntries(PHASES.map(k => [k, summarize(compared.filter(r => r.phase === k))])),
    arms: Object.fromEntries(streams.arms.map(a => [a.id, summarize(compared.filter(r => `${r.shape}|${r.phase}` === a.id))])),
    zeroControls: { straight: zeroControl(compared.filter(r => r.shape === 'straight')),
      sCurveAnalyticZero: zeroControl(compared.filter(r => r.shape === 'sCurve' && sign(r.reference.steering) === 0)) },
    phaseSteeringSpread: Object.fromEntries(['baseline', 'candidate'].map(a => [a, distribution(
      FAMILIES.flatMap(shape => [...new Set(compared.filter(r => r.shape === shape).map(r => r.station))].map(station => {
        const values = compared.filter(r => r.shape === shape && r.station === station).map(r => r[a].local.steering);
        return Math.max(...values) - Math.min(...values);
      })))])),
    mirrorSteeringResidual: Object.fromEntries(['baseline', 'candidate'].map(a => [a, distribution(
      compared.filter(r => ['gentle', 'tight'].includes(r.shape)).map(r => {
        const mirror = compared.find(s => s.shape === `${r.shape}Mirror` && s.phase === r.phase && s.station === r.station);
        return Math.abs(r[a].local.steering + mirror[a].local.steering);
      }))]))
  };
  const gate = evaluateCueGate(metrics);
  const summary = { schema: 'ant-cic-writer-qualification/v1', protocolSha256: PROTOCOL_SHA,
    gate1: { status: moment.status, scope: moment.scope },
    gate2: { status: gate.passed ? 'PASS' : 'MIXED / NOT QUALIFIED', ...gate, metrics, rasters },
    gate3: { status: 'NOT RUN', reason: gate.passed ? 'Requires separate movement preregistration before evaluation.' : 'Fixed cue advancement gate failed.' } };
  const rowBytes = gzipSync(Buffer.from(JSON.stringify(compared)), { level: 9 });
  save(`${PACKAGE}/gate2/rows.json.gz`, rowBytes);
  summary.rowArtifact = { path: 'gate2/rows.json.gz', sha256: sha(rowBytes), bytes: rowBytes.length, rows: compared.length };
  saveJson(`${PACKAGE}/RESULTS.json`, summary);
  save(`${PACKAGE}/gate2/REPORT.md`, renderReport(summary));
  save(`${PACKAGE}/gate2/steering-comparison.svg`, renderPlot(compared, summary.gate2.status));
  return summary;
}

function renderReport(summary) {
  const g = summary.gate2.metrics.global;
  const table = [ ['all', g], ...Object.entries(summary.gate2.metrics.families), ...Object.entries(summary.gate2.metrics.phases) ]
    .map(([id, s]) => `| ${id} | ${s.count} | ${s.baseline.localSignErrors} / ${s.candidate.localSignErrors} | ${s.baseline.localSteeringMae.toFixed(9)} / ${s.candidate.localSteeringMae.toFixed(9)} | ${s.baseline.wideErrors} / ${s.candidate.wideErrors} |`).join('\n');
  return `# Fixed-cue qualification\n\nGate 1: ${summary.gate1.status}, conservation only. Gate 2: ${summary.gate2.status}. Gate 3: NOT RUN.\n\nSame frozen writes, production reader and sensor operators. Analytic A is the frozen engineering reference, not natural-path truth. Every number below is C / CIC. Global local sign errors use 4,012 directional rows; wide errors use 5,072 strict-unique analytic winners. Steering MAE uses every local row (5,544 globally), including analytic-zero cues. The previous QAKR report's approximately 0.063132 baseline uses the 4,012 directional cohort; that separate denominator remains available in RESULTS.json and is not this preregistered all-row MAE.\n\n| Cohort | Rows | Local sign errors | Steering MAE (rad) | Wide winner errors |\n| --- | ---: | ---: | ---: | ---: |\n${table}\n\n## Preregistered checks\n\n${summary.gate2.checks.map(c => `- ${c.passed ? 'PASS' : 'FAIL'}: ${c.id}`).join('\n')}\n\nComplete arm-level measures, recovery/regression counts, zero controls, ties/margins, contrast and raster statistics are in ../RESULTS.json. Raw comparisons are in rows.json.gz. Additional margin/contrast readouts are descriptive, not added qualification gates. No ant was advanced by this assay.\n`;
}

function renderPlot(rows, status) {
  const W = 1200, H = 1120, pad = 65, panelH = 160, panelW = 510;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" fill="#222"><text x="30" y="28" font-size="19">Fixed cue only: local steering, shared scale ±0.45 rad</text><text x="30" y="51" font-size="13">black analytic A · blue production C · orange CIC D. Static stations; no movement.</text>`;
  FAMILIES.forEach((shape, index) => ['p00', 'p11'].forEach((phase, column) => {
    const group = rows.filter(r => r.shape === shape && r.phase === phase).toSorted((a, b) => a.station - b.station);
    const x = pad + column * 570, y = 88 + index * panelH;
    const px = s => x + (s - group[0].station) / (group.at(-1).station - group[0].station) * panelW;
    const py = v => y + 50 - v / 0.45 * 42;
    svg += `<text x="${x}" y="${y-12}" font-size="13">${shape} / ${phase}</text><path d="M${x} ${py(0)}h${panelW}" stroke="#bbb"/><text x="${x-34}" y="${py(0.45)+4}" font-size="10">+.45</text><text x="${x-34}" y="${py(-0.45)+4}" font-size="10">−.45</text>`;
    for (const [key, color] of [['reference', '#111'], ['baseline', '#2478bb'], ['candidate', '#e17a13']]) {
      const points = group.map(r => `${px(r.station).toFixed(3)},${py(key === 'reference' ? r.reference.steering : r[key].local.steering).toFixed(3)}`).join(' ');
      svg += `<polyline fill="none" stroke="${color}" stroke-width="1.2" points="${points}"/>`;
    }
    for (const station of [group[0].station, (group[0].station + group.at(-1).station) / 2, group.at(-1).station]) {
      svg += `<text x="${px(station)}" y="${y+112}" text-anchor="middle" font-size="10">${station.toFixed(2)}</text>`;
    }
    svg += `<text x="${x+panelW/2}" y="${y+128}" text-anchor="middle" font-size="10">frozen route station parameter</text>`;
  }));
  return `${svg}<text x="30" y="1060" font-size="14" fill="#923b2a">Gate 2: ${status}. Local panels do not display all wide/zero-cue regression guards.</text><text x="30" y="1085" font-size="13">See REPORT.md / RESULTS.json for complete criteria. Gate 3 movement: NOT RUN.</text></g></svg>\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runQualification();
  console.log(JSON.stringify({ gate1: result.gate1, gate2: { status: result.gate2.status, global: result.gate2.metrics.global,
    failed: result.gate2.checks.filter(c => !c.passed) }, gate3: result.gate3 }, null, 2));
}
