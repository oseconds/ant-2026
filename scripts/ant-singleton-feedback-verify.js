import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CELL_COUNT } from './ant-local-opportunity-core.js';
import { readJson, readRun, sha256, unpack, writeJson } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ANALYSIS = resolve(ROOT, 'docs/ant/evidence/2026-11-01-singleton-feedback-sensitivity/analysis');

function maskKey(cells) { return cells.join(','); }

function intersectionCount(a, b) {
  let i = 0, j = 0, count = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { count++; i++; j++; }
    else if (a[i] < b[j]) i++;
    else j++;
  }
  return count;
}

function verifyBoundary(run, anchor, expectedDisposition) {
  const f = anchor.formation, options = f.matureOptions;
  let edges = 0;
  const adjacency = options.map(() => []);
  for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) {
    if (!intersectionCount(options[i].xCells, options[j].xCells)) continue;
    edges++; adjacency[i].push(j); adjacency[j].push(i);
  }
  const seen = new Set(); let components = 0, contestedComponents = 0;
  for (let i = 0; i < options.length; i++) {
    if (seen.has(i)) continue;
    components++;
    const stack = [i], members = [];
    seen.add(i);
    while (stack.length) {
      const node = stack.pop(); members.push(node);
      for (const next of adjacency[node]) if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
    if (members.length > 1) contestedComponents++;
  }
  assert.equal(edges, f.overlapEdges, `${run.arm} edges at ${anchor.index}`);
  assert.equal(components, f.overlapComponents, `${run.arm} overlap components at ${anchor.index}`);
  assert.equal(adjacency.filter(row => row.length === 0).length, f.singletonOptions,
    `${run.arm} singleton option count at ${anchor.index}`);
  assert.equal(adjacency.filter(row => row.length > 0).length, f.contestedOptions,
    `${run.arm} contested option count at ${anchor.index}`);
  assert.equal(contestedComponents, f.contestedComponents, `${run.arm} contested component count at ${anchor.index}`);

  const grouped = new Map();
  for (const event of f.events) {
    const key = maskKey(event.xCells), rows = grouped.get(key) ?? [];
    rows.push(event); grouped.set(key, rows);
  }
  assert.equal(grouped.size, f.decisions.length, `${run.arm} decision groups at ${anchor.index}`);
  const decisions = new Map(f.decisions.map(row => [maskKey(row.xCells), row]));
  assert.equal(decisions.size, f.decisions.length, `${run.arm} unique decision X keys at ${anchor.index}`);
  for (const [key, events] of grouped) {
    const optionIndex = options.findIndex(option => maskKey(option.xCells) === key);
    assert.notEqual(optionIndex, -1, `${run.arm} new event exists in current options at ${anchor.index}`);
    const hasOverlap = adjacency[optionIndex].length > 0;
    const decision = decisions.get(key);
    assert.ok(decision, `${run.arm} decision exists at ${anchor.index}`);
    assert.deepEqual(decision.eventIds, events.map(event => event.eventId).sort());
    assert.equal(decision.disposition, hasOverlap ? 'contested-no-commit' : expectedDisposition,
      `${run.arm} singleton/contested disposition at ${anchor.index}`);
    assert.equal(decision.overlayIncrement, expectedDisposition === 'singleton-overlay-layer' && !hasOverlap ? 1 : 0);
  }
}

function verifyOverlay(run) {
  const overlay = new Uint16Array(CELL_COUNT), histories = new Map();
  let incidences = 0, previousTime = -Infinity;
  for (const row of run.overlayHistory) {
    assert.ok(row.timeMs >= previousTime, 'overlay episodes are time ordered');
    previousTime = row.timeMs;
    for (const cell of row.xCells) {
      assert.ok(Number.isInteger(cell) && cell >= 0 && cell < CELL_COUNT, 'overlay cell index is in bounds');
      assert.ok(overlay[cell] < 0xffff, 'overlay does not overflow');
      overlay[cell]++; incidences++;
      const layers = histories.get(cell) ?? [];
      layers.push({ eventId: row.eventId, timeMs: row.timeMs, provenance: row.provenance });
      histories.set(cell, layers);
    }
  }
  const storedOverlay = run.overlay ? unpack(run.overlay) : new Uint16Array(CELL_COUNT);
  assert.deepEqual(overlay, storedOverlay, `${run.arm} per-cell overlay reconstruction`);
  const perCell = [...histories].sort((a, b) => a[0] - b[0]).map(([cell, layers]) => ({ cell, layers }));
  assert.deepEqual(perCell, run.overlayPerCellHistory, `${run.arm} ordered provenance reconstruction`);
  assert.equal(incidences, overlay.reduce((sum, value) => sum + value, 0));
  return { episodes: run.overlayHistory.length, layerCellIncidences: incidences,
    coverageCells: overlay.reduce((sum, value) => sum + Number(value > 0), 0),
    maxLayerCount: overlay.reduce((max, value) => Math.max(max, value), 0),
    perCellProvenanceRows: perCell.length, overlaySha256: sha256(Buffer.from(overlay.buffer)) };
}

function m(L) { return 1 - 0.10 * (1 - Math.exp(-L / 4)); }
function qA(L) { return 1 - 0.50 * (1 - Math.exp(-L / 4)); }
function hD(L) { return 1 + 0.50 * (1 - Math.exp(-L / 4)); }

function verifyExposure(exposure) {
  assert.equal(exposure.perTickLayerReadings.length, 18_000);
  const windows = Array.from({ length: 5 }, () => ({ living: 0, exposed: 0, speed: 0, A: 0, D: 0, ids: new Set() }));
  let antTicks = 0, exposed = 0, dTargets = 0, speedCalls = 0, aCalls = 0;
  const exposedRows = new Map(exposure.exposedAntTicks.map(row => [`${row.timeMs}:${row.antId}`, row]));
  for (let index = 0; index < exposure.perTickLayerReadings.length; index++) {
    const tick = exposure.perTickLayerReadings[index], ids = new Set();
    assert.equal(tick.tick, index + 1, 'one ordered tick-entry read per tick');
    assert.equal(tick.layerReadings.length, tick.livingAnts, `one ID-bearing L tuple per ant at tick ${tick.tick}`);
    const window = windows[Math.min(4, Math.floor(tick.timeMs / 60_000))];
    window.living += tick.livingAnts; antTicks += tick.livingAnts;
    let exposedThisTick = 0;
    for (const tuple of tick.layerReadings) {
      assert.equal(tuple.length, 4);
      const [antId, production, research, effective] = tuple;
      assert.equal(typeof antId, 'string'); assert.ok(antId.startsWith('ant-'));
      assert.equal(ids.has(antId), false, `unique living-ant ID at tick ${tick.tick}`); ids.add(antId);
      assert.ok(Number.isInteger(production) && production >= 0);
      assert.ok(Number.isInteger(research) && research >= 0);
      assert.equal(effective, production + research);
      if (!research) continue;
      exposed++; exposedThisTick++;
      const row = exposedRows.get(`${tick.timeMs}:${antId}`);
      assert.ok(row, `exposed detail row ${antId} at tick ${tick.tick}`);
      assert.deepEqual([row.productionLayers, row.researchLayers, row.effectiveLayers], [production, research, effective]);
      assert.ok(Math.abs(row.mProduction - m(production)) < 1e-12);
      assert.ok(Math.abs(row.mEffective - m(effective)) < 1e-12);
      assert.ok(Math.abs(row.qAProduction - qA(production)) < 1e-12);
      assert.ok(Math.abs(row.qAEffective - qA(effective)) < 1e-12);
      assert.ok(Math.abs(row.hDProduction - hD(production)) < 1e-12);
      assert.ok(Math.abs(row.hDEffective - hD(effective)) < 1e-12);
      speedCalls += Number(row.speedEffectApplicable);
      aCalls += Number(row.aTurnRateChanged);
      dTargets += Number(row.dSameFlowOpportunity);
      window.exposed++; window.speed += Number(row.speedEffectApplicable);
      window.A += Number(row.aTurnRateChanged); window.D += Number(row.dSameFlowOpportunity);
      window.ids.add(antId);
    }
    assert.equal(exposedThisTick, tick.exposedAntTicks, `exposure count at tick ${tick.tick}`);
  }
  assert.equal(exposedRows.size, exposed);
  assert.equal(antTicks, exposure.summary.antTicks);
  assert.equal(exposed, exposure.summary.exposedAntTicks);
  assert.equal(speedCalls, exposure.summary.directConsumerOpportunities.speedEffectApplicable);
  assert.equal(aCalls, exposure.summary.directConsumerOpportunities.aTurnRateCeilingCallChanged);
  assert.equal(dTargets, exposure.summary.directConsumerOpportunities.dSameFlowHeadwayTargetChanged);
  assert.equal(windows.reduce((sum, row) => sum + (row.exposed ?? 0), 0), exposed);
  const windowReceipts = windows.map((row, index) => {
    const saved = exposure.windows[index];
    assert.equal(row.living, saved.antTicks);
    assert.equal(row.exposed, saved.exposedAntTicks);
    assert.equal(row.speed, saved.speedEffectApplicable);
    assert.equal(row.A, saved.aTurnRateCallsChanged);
    assert.equal(row.D, saved.dSameFlowHeadwayTargetsChanged);
    assert.equal(row.ids.size, saved.uniqueAntIds);
    return { startSeconds: index * 60, endSeconds: (index + 1) * 60,
      livingAntTicks: row.living, exposedAntTicks: row.exposed, speedApplicable: row.speed,
      aChanged: row.A, dSameFlowTargetsChanged: row.D, uniqueAntIds: row.ids.size };
  });
  return { ticks: exposure.perTickLayerReadings.length, antTicks, exposedAntTicks: exposed,
    uniqueExposedAntIds: new Set(exposure.exposedAntTicks.map(row => row.antId)).size,
    speedApplicable: speedCalls, aChanged: aCalls, dSameFlowTargetsChanged: dTargets,
    windows: windowReceipts };
}

async function main() {
  const receipt = { schema: 'ant-singleton-feedback-independent-validation-v1', arms: {}, exposure: null };
  for (const arm of ['control', 'treatment']) {
    const run = await readRun(resolve(ANALYSIS, `${arm}.signals.json.gz`));
    assert.equal(run.anchors.length, 300); assert.equal(run.events.length, arm === 'control' ? 277 : 336);
    for (const anchor of run.anchors) verifyBoundary(run, anchor,
      arm === 'treatment' ? 'singleton-overlay-layer' : 'singleton-control-observation');
    const overlay = verifyOverlay(run);
    assert.equal(run.decisions.length, run.anchors.reduce((sum, anchor) => sum + anchor.formation.decisions.length, 0));
    receipt.arms[arm] = { anchors: run.anchors.length, events: run.events.length,
      decisionGroups: run.decisions.length, overlay, observerRngCalls: run.validation.observerRngCalls };
    assert.equal(run.validation.observerRngCalls, 0);
  }
  receipt.exposure = verifyExposure(await readJson(resolve(ANALYSIS, 'treatment-exposure.json.gz')));
  const out = resolve(ANALYSIS, 'independent-checks.json');
  await mkdir(dirname(out), { recursive: true });
  await writeJson(out, receipt);
  console.log(JSON.stringify(receipt));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
