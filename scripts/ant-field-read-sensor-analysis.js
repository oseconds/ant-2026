import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { aggregateLocalSamples, fieldPhases, hillResponse } from './ant-field-write-read-isolation.js';

const NATURAL_COMMIT = '1dab083b640dbe73bc00f97a59c27568c8ba7866';
const NATURAL_ROOT = 'docs/ant/evidence/2026-10-23-natural-field-transfer';
const PHASE_IDS = ['p00', 'p10', 'p01', 'p11'];
const PHASES = fieldPhases();
const LOCAL_SAMPLE_COUNT = 18;
const WIDE_OFFSETS = [-1, -0.5, 0, 0.5, 1];
const SENSOR_DISTANCE = 0.042;
const SENSOR_WIDTH = 0.014;

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function parseGzipJson(bytes) { return JSON.parse(gunzipSync(bytes)); }
function valueProp(node, key) { return node.props.find(item => item.key === key)?.descriptor?.value; }

export function fieldValuesFromControllerGraph(graph) {
  const root = graph.nodes[graph.root.ref];
  const fieldRef = valueProp(root, 'field')?.ref;
  if (!Number.isInteger(fieldRef)) throw new Error('Frozen controller graph has no field reference.');
  const fieldNode = graph.nodes[fieldRef];
  if (fieldNode.prototype !== 'PheromoneField') throw new Error('Frozen controller field prototype mismatch.');
  const valuesRef = valueProp(fieldNode, 'values')?.ref;
  const valuesNode = graph.nodes[valuesRef];
  const bufferNode = graph.nodes[valuesNode.buffer.ref];
  const bytes = Buffer.from(bufferNode.bytes, 'base64');
  if (valuesNode.kind !== 'typed-array' || valuesNode.prototype !== 'Float32Array'
      || bytes.byteLength !== valuesNode.length * Float32Array.BYTES_PER_ELEMENT) {
    throw new Error('Frozen controller Float32Array payload is invalid.');
  }
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function summary(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { n: 0 };
  const sorted = [...finite].sort((a, b) => a - b);
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const percentile = p => sorted[Math.floor((sorted.length - 1) * p)];
  return { n: finite.length, mean, median: percentile(0.5), p90: percentile(0.9), max: sorted.at(-1) };
}

function signedSummary(values) {
  return { signed: summary(values), absolute: summary(values.map(Math.abs)), exactNonzero: values.filter(value => value !== 0).length };
}

function traceNumber(value) {
  return value && typeof value === 'object' && value.$antNumber === '-0' ? -0 : value;
}

function correlation(left, right) {
  if (left.length !== right.length || left.length < 2) return null;
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;
  let top = 0, squareLeft = 0, squareRight = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] - meanLeft, b = right[index] - meanRight;
    top += a * b; squareLeft += a * a; squareRight += b * b;
  }
  return squareLeft * squareRight ? top / Math.sqrt(squareLeft * squareRight) : null;
}

function sampleMap(arm, kind) {
  const map = new Map();
  for (const sample of arm.samples) {
    if (sample.context?.kind !== kind || typeof sample.context?.antId !== 'string') continue;
    const rows = map.get(sample.context.antId) || [];
    rows.push(sample);
    map.set(sample.context.antId, rows);
  }
  for (const rows of map.values()) rows.sort((a, b) => a.callIndex - b.callIndex);
  return map;
}

function traceMap(arm, type) {
  const map = new Map();
  for (const event of arm.trace) if (event.type === type && event.agentId) map.set(event.agentId, event);
  return map;
}

function fixedGrid(state, dt) {
  const field = new PheromoneField({ width: state.fieldParameters.width, height: state.fieldParameters.height,
    decayHalfLifeSeconds: state.fieldParameters.decayHalfLifeSeconds, maxValue: state.fieldParameters.maxValue });
  const values = fieldValuesFromControllerGraph(state.frozenInput.graph);
  assert.equal(values.length, field.values.length);
  field.values.set(values);
  field.decay(dt);
  return field;
}

function phaseQuery(sample, phaseId) {
  return sample.phaseChecks.find(check => check.phaseId === phaseId);
}

export function decomposeFieldRead(baseValue, fixedRasterShiftedValue, translatedRasterShiftedValue) {
  if (![baseValue, fixedRasterShiftedValue, translatedRasterShiftedValue].every(Number.isFinite)) {
    throw new TypeError('Field-read decomposition requires three finite values.');
  }
  const reader = fixedRasterShiftedValue - baseValue;
  const raster = translatedRasterShiftedValue - fixedRasterShiftedValue;
  const total = translatedRasterShiftedValue - baseValue;
  return { reader, raster, total, residual: total - reader - raster };
}

export function weightedWideSignal(samples) {
  if (!Array.isArray(samples) || samples.some(sample => !Number.isFinite(sample?.value)
      || !WIDE_OFFSETS.includes(sample.offset))) {
    throw new TypeError('Wide signal requires finite values with production transverse offsets.');
  }
  return Math.max(0, ...samples.map(sample => sample.value * (1 - Math.abs(sample.offset) * 0.45)));
}

function sampleMapByWideHeading(arm) {
  const result = new Map();
  for (const sample of arm.samples) {
    if (sample.context?.kind !== 'wide' || typeof sample.context.antId !== 'string') continue;
    const byHeading = result.get(sample.context.antId) || new Map();
    const rows = byHeading.get(sample.context.heading) || [];
    rows.push(sample);
    byHeading.set(sample.context.heading, rows);
    result.set(sample.context.antId, byHeading);
  }
  for (const byHeading of result.values()) for (const rows of byHeading.values()) rows.sort((a, b) => a.callIndex - b.callIndex);
  return result;
}

function inferredOffset(sample, agent, heading) {
  const centerX = agent.x + Math.cos(heading) * SENSOR_DISTANCE;
  const centerY = agent.y + Math.sin(heading) * SENSOR_DISTANCE;
  const normalX = -Math.sin(heading), normalY = Math.cos(heading);
  const offset = ((sample.x - centerX) * normalX + (sample.y - centerY) * normalY) / SENSOR_WIDTH;
  const nearest = WIDE_OFFSETS.reduce((best, candidate) => Math.abs(candidate - offset) < Math.abs(best - offset) ? candidate : best);
  if (Math.abs(nearest - offset) > 1e-9) throw new Error(`Wide sample does not match a production transverse offset: ${offset}`);
  return nearest;
}

function recordedWideTrail(rows, agent, heading) {
  return hillResponse(weightedWideSignal(rows.map(sample => ({ value: sample.value,
    offset: inferredOffset(sample, agent, heading) }))));
}

function wideOffsetMap(rows, agent, heading) {
  const result = new Map();
  for (const sample of rows) {
    const offset = inferredOffset(sample, agent, heading);
    if (result.has(offset)) throw new Error(`Duplicate wide sample at transverse offset ${offset}.`);
    result.set(offset, sample);
  }
  return result;
}

function sampleRowsWithOffset(rows, agent, heading) {
  const byOffset = wideOffsetMap(rows, agent, heading);
  return WIDE_OFFSETS.filter(offset => byOffset.has(offset)).map(offset => {
    const sample = byOffset.get(offset);
    return { offset, x: sample.x, y: sample.y, fieldX: sample.fieldX, fieldY: sample.fieldY, value: sample.value };
  });
}

function fixedRasterWideQueries(field, agent, heading, phase) {
  const centerX = agent.x + Math.cos(heading) * SENSOR_DISTANCE;
  const centerY = agent.y + Math.sin(heading) * SENSOR_DISTANCE;
  const normalX = -Math.sin(heading), normalY = Math.cos(heading);
  const values = [];
  for (const offset of WIDE_OFFSETS) {
    const x = centerX + normalX * SENSOR_WIDTH * offset;
    const y = centerY + normalY * SENSOR_WIDTH * offset;
    if (x < 0 || x > 1 || y < 0 || y > 1) continue;
    values.push({ offset, x, y, fieldX: x + phase.dx, fieldY: y + phase.dy,
      value: field.sample(x + phase.dx, y + phase.dy) });
  }
  return values;
}

function fixedRasterWideTrail(field, agent, heading, phase) {
  return hillResponse(weightedWideSignal(fixedRasterWideQueries(field, agent, heading, phase)));
}

function phaseSampleIndex(arm) {
  return new Map(arm.samples.map(sample => [sample.callIndex, sample]));
}

function localTraceRows(arm) { return traceMap(arm, 'intention-input'); }
function optionRows(arm) { return traceMap(arm, 'wide-options'); }
function choiceRows(arm) { return traceMap(arm, 'intention-chosen'); }
function noChoiceRows(arm) { return traceMap(arm, 'intention-no-choice'); }

function samePointSequence(left, right) {
  return left.length === right.length && left.every((sample, index) => sample.x === right[index].x && sample.y === right[index].y);
}

function compareTraceValue(left, right, keys) {
  return keys.some(key => !Object.is(traceNumber(left?.[key]), traceNumber(right?.[key])));
}

function angleDifference(left, right) {
  const delta = left - right;
  return ((delta + Math.PI) % (2 * Math.PI) + (2 * Math.PI)) % (2 * Math.PI) - Math.PI;
}

function firstDivergence(p00, shifted, localGeometryChanged, rawLocalChanged, localPair,
  rawWideChanged, wideGeometryChanged, p00Options, shiftedOptions, p00Chosen, shiftedChosen,
  p00NoChoice, shiftedNoChoice, movement) {
  if (localGeometryChanged) return 'local-query-geometry';
  if (rawLocalChanged) return 'raw-local-sample';
  if (localPair && compareTraceValue(p00, shifted, ['left', 'center', 'right', 'strength', 'coherence', 'steering'])) {
    return 'local-aggregation';
  }
  if (Boolean(p00Options) !== Boolean(shiftedOptions) || Boolean(p00NoChoice) !== Boolean(shiftedNoChoice)) {
    return 'wide-decision-due-status';
  }
  if (wideGeometryChanged) return 'wide-query-geometry';
  if (rawWideChanged) return 'raw-wide-sample';
  if (p00Options && shiftedOptions) {
    const trailChanged = p00Options.options.some((option, index) => !Object.is(option.trail, shiftedOptions.options[index]?.trail));
    const scoreChanged = p00Options.options.some((option, index) => !Object.is(option.score, shiftedOptions.options[index]?.score));
    if (trailChanged || scoreChanged || p00Chosen?.chosenOffset !== shiftedChosen?.chosenOffset) return 'wide-sensor-choice';
  }
  if (movement.localTurn) return 'local-turn-feedback';
  if (movement.target) return 'target-heading';
  if (movement.bodyTurn) return 'body-turn';
  if (movement.travel) return 'post-collision-travel';
  return 'no-downstream-difference';
}

async function analyze(dataRoot, outputPath) {
  const matrixRoot = path.join(dataRoot, NATURAL_ROOT, 'capture/matrix-20261023');
  const phaseRoot = path.join(dataRoot, NATURAL_ROOT, 'phase/runs');
  const manifestBytes = await readFile(path.join(matrixRoot, 'matrix-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.captures.length, 66);
  const fieldHash = sha256(await readFile(new URL('../src/lib/agents/ant/PheromoneField.js', import.meta.url)));
  const localRows = [], movementRows = [], readerRows = [], dueRows = [], divergenceRows = [];
  const reconstructionErrors = [];
  const phaseHistories = [];
  const stateReceipts = [];
  let verifiedLocalCalls = 0, verifiedWideCalls = 0, matchedLocalCalls = 0, matchedWideCalls = 0;
  let wideOptionReconstructionChecks = 0;
  let localCompleteAgentPairs = 0, localInteriorAgentPairs = 0;

  const captures = [...manifest.captures].sort((a, b) => a.seed - b.seed || a.originPolicy.localeCompare(b.originPolicy) || a.secondsCompleted - b.secondsCompleted);
  for (const capture of captures) {
    const stateBytes = await readFile(path.join(matrixRoot, capture.path));
    assert.equal(sha256(stateBytes), capture.sha256, `${capture.captureId} state hash`);
    const state = parseGzipJson(stateBytes);
    const phasePath = path.join(phaseRoot, `${capture.captureId}-default-gaussian-phase-qualification.json.gz`);
    const phaseBytes = await readFile(phasePath);
    const receipt = parseGzipJson(phaseBytes);
    assert.equal(receipt.sourceAndCapture.captureId, capture.captureId);
    assert.equal(receipt.phaseZeroPassed, true, `${capture.captureId} phase-zero gate`);
    assert.equal(receipt.arms.length, 12, `${capture.captureId} four phases × three modes`);
    assert.equal(state.sourceHashes['src/lib/agents/ant/PheromoneField.js'], fieldHash, 'production field source matches frozen capture');
    const arms = new Map(receipt.arms.filter(arm => arm.movementMode === 'production').map(arm => [arm.phase.id, arm]));
    assert.deepEqual([...arms.keys()].sort(), [...PHASE_IDS].sort());
    const field = fixedGrid(state, state.dtSeconds);
    const armRows = Object.fromEntries(PHASE_IDS.map(id => [id, arms.get(id)]));
    const p00 = armRows.p00;
    const p00Local = sampleMap(p00, 'local');
    const p00Wide = sampleMap(p00, 'wide');
    const phaseLocal = Object.fromEntries(PHASE_IDS.slice(1).map(id => [id, sampleMap(armRows[id], 'local')]));
    const phaseWide = Object.fromEntries(PHASE_IDS.map(id => [id, sampleMapByWideHeading(armRows[id])]));
    const p00LocalTrace = localTraceRows(p00);
    const p00WideTrace = optionRows(p00);
    const p00Choice = choiceRows(p00);
    const p00NoChoice = noChoiceRows(p00);
    let stateLocalChecks = 0, stateWideChecks = 0;

    for (const [kind, groups] of [['local', p00Local], ['wide', p00Wide]]) {
      for (const rows of groups.values()) {
        for (const sample of rows) {
          const p00Value = field.sample(sample.x, sample.y);
          if (Object.is(p00Value, sample.value)) {
            if (kind === 'local') { verifiedLocalCalls += 1; stateLocalChecks += 1; }
            else { verifiedWideCalls += 1; stateWideChecks += 1; }
          } else {
            reconstructionErrors.push({ captureId: capture.captureId, kind, callIndex: sample.callIndex,
              actual: sample.value, reread: p00Value, error: p00Value - sample.value });
          }
        }
      }
    }

    for (const phaseId of PHASE_IDS) {
      const arm = armRows[phaseId];
      const inputs = localTraceRows(arm);
      for (const [antId, optionTrace] of optionRows(arm)) {
        const agent = inputs.get(antId)?.agent;
        if (!agent) throw new Error(`${capture.captureId}/${phaseId}/${antId} has wide options without an intention input.`);
        const byHeading = phaseWide[phaseId].get(antId) || new Map();
        for (const option of optionTrace.options) {
          const rows = byHeading.get(option.heading) || [];
          const reconstructed = recordedWideTrail(rows, agent, option.heading);
          wideOptionReconstructionChecks += 1;
          if (!Object.is(reconstructed, traceNumber(option.trail))) reconstructionErrors.push({ captureId: capture.captureId,
            phase: phaseId, kind: 'wide-option-reconstruction', antId, offset: option.offset,
            reconstructed, productionTrace: option.trail });
        }
      }
    }

    const localPhaseStats = new Map(PHASE_IDS.slice(1).map(id => [id, { reader: [], raster: [], total: [], residual: [], interior: 0, paired: 0, geometryMatched: 0 }]));
    for (const [antId, rows] of p00Local) {
      for (const sample of rows) {
        const interior = sample.interiorAllPhases === true;
        for (const phaseId of PHASE_IDS.slice(1)) {
          const stat = localPhaseStats.get(phaseId);
          const query = phaseQuery(sample, phaseId);
          if (!query) continue;
          const fixedRasterShifted = field.sample(query.fieldX, query.fieldY);
          const reader = fixedRasterShifted - sample.value;
          stat.reader.push(reader);
          if (interior) stat.interior += 1;
          const phaseRows = phaseLocal[phaseId].get(antId) || [];
          const index = rows.indexOf(sample);
          const actual = phaseRows[index];
          if (!actual || actual.x !== sample.x || actual.y !== sample.y) continue;
          stat.geometryMatched += 1;
          stat.paired += 1;
          matchedLocalCalls += 1;
          const split = decomposeFieldRead(sample.value, fixedRasterShifted, actual.value);
          stat.raster.push(split.raster);
          stat.total.push(split.total);
          stat.residual.push(split.residual);
        }
      }
    }
    for (const phaseId of PHASE_IDS.slice(1)) {
      const stat = localPhaseStats.get(phaseId);
      readerRows.push({ captureId: capture.captureId, phase: phaseId, sensor: 'local-raw',
        p00CallCount: p00Local.size ? [...p00Local.values()].reduce((sum, rows) => sum + rows.length, 0) : 0,
        pairedCallCount: stat.paired, interiorCallCount: stat.interior, geometryMatchedCallCount: stat.geometryMatched,
        readerOnlyDelta: signedSummary(stat.reader), rasterStorageDelta: signedSummary(stat.raster),
        totalDelta: signedSummary(stat.total), reconstructionResidual: summary(stat.residual.map(Math.abs)) });
    }

    for (const [antId, rows] of p00Local) {
      const baselineTrace = p00LocalTrace.get(antId)?.localTrail;
      const localComplete = rows.length === LOCAL_SAMPLE_COUNT;
      if (!localComplete) continue;
      const baseValues = rows.map(row => row.value);
      const baseAggregate = aggregateLocalSamples(baseValues);
      if (baselineTrace) {
        for (const key of Object.keys(baseAggregate)) {
          if (!Object.is(baseAggregate[key], traceNumber(baselineTrace[key]))) {
            reconstructionErrors.push({ captureId: capture.captureId, kind: 'local-aggregate-p00', antId,
              key, calculated: baseAggregate[key], productionTrace: baselineTrace[key] });
          }
        }
      }
      const allPhaseInterior = rows.every(row => row.interiorAllPhases === true);
      for (const phaseId of PHASE_IDS.slice(1)) {
        const phaseRows = phaseLocal[phaseId].get(antId) || [];
        if (phaseRows.length !== LOCAL_SAMPLE_COUNT || !samePointSequence(rows, phaseRows)) continue;
        const queryValues = rows.map(row => {
          const check = phaseQuery(row, phaseId);
          if (!check) throw new Error(`${capture.captureId}/${phaseId}/${antId}: missing preregistered query.`);
          return field.sample(check.fieldX, check.fieldY);
        });
        const readerAggregate = aggregateLocalSamples(queryValues);
        const actualValues = phaseRows.map(row => row.value);
        const actualAggregate = aggregateLocalSamples(actualValues);
        const phaseTrace = localTraceRows(armRows[phaseId]).get(antId)?.localTrail;
        if (phaseTrace) {
          for (const key of Object.keys(actualAggregate)) if (!Object.is(actualAggregate[key], traceNumber(phaseTrace[key]))) {
            reconstructionErrors.push({ captureId: capture.captureId, phase: phaseId, kind: 'local-aggregate-phase', antId,
              key, calculated: actualAggregate[key], productionTrace: phaseTrace[key] });
          }
        }
        localCompleteAgentPairs += 1;
        if (allPhaseInterior) localInteriorAgentPairs += 1;
        const rawDelta = actualValues.map((value, index) => value - baseValues[index]);
        localRows.push({ captureId: capture.captureId, originPolicy: capture.originPolicy, seed: capture.seed,
          seconds: capture.secondsCompleted, antId, phase: phaseId, interiorAllPhases: allPhaseInterior,
          rawMeanAbsDelta: rawDelta.reduce((sum, value) => sum + Math.abs(value), 0) / rawDelta.length,
          rawRmsDelta: Math.sqrt(rawDelta.reduce((sum, value) => sum + value * value, 0) / rawDelta.length),
          readerOnlyRawMeanAbsDelta: queryValues.reduce((sum, value, index) => sum + Math.abs(value - baseValues[index]), 0) / queryValues.length,
          writerRasterRawMeanAbsDelta: actualValues.reduce((sum, value, index) => sum + Math.abs(value - queryValues[index]), 0) / actualValues.length,
          localSteeringDelta: actualAggregate.steering - baseAggregate.steering,
          readerOnlySteeringDelta: readerAggregate.steering - baseAggregate.steering,
          writerRasterSteeringDelta: actualAggregate.steering - readerAggregate.steering,
          localStrengthDelta: actualAggregate.strength - baseAggregate.strength,
          readerOnlyStrengthDelta: readerAggregate.strength - baseAggregate.strength,
          writerRasterStrengthDelta: actualAggregate.strength - readerAggregate.strength,
          localCoherenceDelta: actualAggregate.coherence - baseAggregate.coherence,
          localAggregateExactChanged: compareTraceValue(baseAggregate, actualAggregate,
            ['left', 'center', 'right', 'strength', 'coherence', 'steering']) });
      }
    }

    for (const antId of new Set([...p00Local.keys(), ...Object.values(phaseLocal).flatMap(groups => [...groups.keys()])])) {
      const baseRows = p00Local.get(antId) || [];
      const baseTrace = p00LocalTrace.get(antId)?.localTrail;
        const baseAgent = p00LocalTrace.get(antId)?.agent;
      const rawDiffByPhase = {};
      for (const phaseId of PHASE_IDS.slice(1)) {
        const shiftedRows = phaseLocal[phaseId].get(antId) || [];
          const localGeometryChanged = !samePointSequence(baseRows, shiftedRows);
        rawDiffByPhase[phaseId] = baseRows.length === shiftedRows.length
          && baseRows.some((row, index) => row.value !== shiftedRows[index].value);
        const baseOption = p00WideTrace.get(antId);
        const shiftedOption = optionRows(armRows[phaseId]).get(antId);
        const baseChosen = p00Choice.get(antId);
        const shiftedChosen = choiceRows(armRows[phaseId]).get(antId);
        const baseHeld = p00NoChoice.has(antId);
        const shiftedHeld = noChoiceRows(armRows[phaseId]).has(antId);
        const localTrace = localTraceRows(armRows[phaseId]).get(antId)?.localTrail;
        const localPair = baseTrace && localTrace;
        const turnBase = traceMap(p00, 'local-turn').get(antId);
        const turnShift = traceMap(armRows[phaseId], 'local-turn').get(antId);
        const targetBase = traceMap(p00, 'target-heading-base').get(antId);
        const targetShift = traceMap(armRows[phaseId], 'target-heading-base').get(antId);
        const bodyBase = traceMap(p00, 'target-turn-applied').get(antId);
        const bodyShift = traceMap(armRows[phaseId], 'target-turn-applied').get(antId);
        const moveBase = traceMap(p00, 'displacement').get(antId);
        const moveShift = traceMap(armRows[phaseId], 'displacement').get(antId);
        const movement = {
          localTurn: Boolean(turnBase && turnShift) && (!Object.is(turnBase.rawLocalCueU, turnShift.rawLocalCueU)
            || !Object.is(turnBase.clampedLocalTurn, turnShift.clampedLocalTurn)),
          target: Boolean(targetBase && targetShift) && !Object.is(targetBase.targetHeadingBeforeCrowding, targetShift.targetHeadingBeforeCrowding),
          bodyTurn: Boolean(bodyBase && bodyShift) && !Object.is(bodyBase.headingAfterTurn, bodyShift.headingAfterTurn),
          travel: Boolean(moveBase && moveShift) && (moveBase.observedTo.x !== moveShift.observedTo.x || moveBase.observedTo.y !== moveShift.observedTo.y)
        };
        let rawWideChanged = false, wideGeometryChanged = false, widePairCount = 0;
        let maxCandidateHeadingAbsDelta = 0, candidatePoseDelta = 0;
        const candidateOptions = [];
        const shiftedAgent = localTraceRows(armRows[phaseId]).get(antId)?.agent;
        const phaseShift = PHASES.find(item => item.id === phaseId);
        if (baseAgent && shiftedAgent) candidatePoseDelta = Math.hypot(shiftedAgent.x - baseAgent.x, shiftedAgent.y - baseAgent.y);
        if (baseOption && shiftedOption) {
          for (const baseCandidate of baseOption.options) {
            const phaseCandidate = shiftedOption.options.find(option => option.offset === baseCandidate.offset);
            if (!phaseCandidate || !baseAgent || !shiftedAgent || candidatePoseDelta !== 0) {
              wideGeometryChanged = true;
            }
            const baseSamples = phaseWide.p00.get(antId)?.get(baseCandidate.heading) || [];
            const shiftedSamples = phaseCandidate && shiftedAgent
              ? phaseWide[phaseId].get(antId)?.get(phaseCandidate.heading) || [] : [];
            const p00Readings = baseAgent ? sampleRowsWithOffset(baseSamples, baseAgent, baseCandidate.heading) : [];
            const translatedReadings = phaseCandidate && shiftedAgent
              ? sampleRowsWithOffset(shiftedSamples, shiftedAgent, phaseCandidate.heading) : [];
            const fixedRasterReadings = baseAgent
              ? fixedRasterWideQueries(field, baseAgent, baseCandidate.heading, phaseShift) : [];
            const fixedRasterTrail = hillResponse(weightedWideSignal(fixedRasterReadings));
            const candidateHeadingAbsDelta = phaseCandidate
              ? Math.abs(angleDifference(phaseCandidate.heading, baseCandidate.heading)) : null;
            if (candidateHeadingAbsDelta !== null) maxCandidateHeadingAbsDelta = Math.max(maxCandidateHeadingAbsDelta,
              candidateHeadingAbsDelta);
            const comparableGeometry = Boolean(phaseCandidate && baseAgent && shiftedAgent
              && candidateHeadingAbsDelta === 0 && candidatePoseDelta === 0);
            if (comparableGeometry) {
              const p00ByOffset = new Map(p00Readings.map(row => [row.offset, row]));
              const translatedByOffset = new Map(translatedReadings.map(row => [row.offset, row]));
              const offsets = [...new Set([...p00ByOffset.keys(), ...translatedByOffset.keys()])];
              if (offsets.some(offset => !p00ByOffset.has(offset) || !translatedByOffset.has(offset))) wideGeometryChanged = true;
              for (const offset of offsets) {
                const left = p00ByOffset.get(offset), right = translatedByOffset.get(offset);
                if (!left || !right || left.x !== right.x || left.y !== right.y) { wideGeometryChanged = true; continue; }
                widePairCount += 1;
                matchedWideCalls += 1;
                if (left.value !== right.value) rawWideChanged = true;
              }
            } else wideGeometryChanged = true;
            candidateOptions.push({ offset: baseCandidate.offset,
              p00Heading: baseCandidate.heading, translatedHeading: phaseCandidate?.heading ?? null,
              candidateHeadingAbsDelta, p00Trail: baseCandidate.trail, translatedTrail: phaseCandidate?.trail ?? null,
              fixedRasterShiftedTrail: fixedRasterTrail, p00Score: baseCandidate.score,
              translatedScore: phaseCandidate?.score ?? null, p00Crowding: baseCandidate.crowding,
              translatedCrowding: phaseCandidate?.crowding ?? null,
              p00Chosen: baseChosen?.chosenOffset === baseCandidate.offset,
              translatedChosen: shiftedChosen?.chosenOffset === baseCandidate.offset,
              p00RawSamples: p00Readings, translatedRawSamples: translatedReadings,
              fixedRasterShiftedRawSamples: fixedRasterReadings });
            }
        }
        const stage = firstDivergence(baseTrace, localTrace, localGeometryChanged,
          rawDiffByPhase[phaseId], localPair, rawWideChanged, wideGeometryChanged,
          baseOption, shiftedOption, baseChosen, shiftedChosen,
          baseHeld ? {} : null, shiftedHeld ? {} : null, movement);
        divergenceRows.push({ captureId: capture.captureId, antId, phase: phaseId, stage,
          localRawChanged: rawDiffByPhase[phaseId], localAggregateChanged: Boolean(localPair && compareTraceValue(baseTrace, localTrace,
            ['left', 'center', 'right', 'strength', 'coherence', 'steering'])),
          dueP00: Boolean(baseOption), dueShifted: Boolean(shiftedOption),
          localTurnChanged: movement.localTurn, targetChanged: movement.target, bodyTurnChanged: movement.bodyTurn, travelChanged: movement.travel });
        const baseDue = Boolean(baseOption), shiftedDue = Boolean(shiftedOption);
        if (baseDue || shiftedDue) {
          const phase = phaseShift;
          if (baseOption && !baseAgent) throw new Error(`${capture.captureId}/${antId}: missing wide sensor starting pose.`);
          const readerOnlyOptions = baseOption?.options.map(option => ({ offset: option.offset,
            heading: option.heading, trail: fixedRasterWideTrail(field, baseAgent, option.heading, phase) })) || [];
          const completeReader = readerOnlyOptions.length === 5;
          const readerWinner = completeReader
            ? readerOnlyOptions.reduce((best, option) => option.trail > best.trail ? option : best, readerOnlyOptions[0])
            : null;
          const baseTrailWinner = baseOption?.options.reduce((best, option) => option.trail > best.trail ? option : best,
            baseOption.options[0]);
          const shiftedTrailWinner = shiftedOption?.options.reduce((best, option) => option.trail > best.trail ? option : best,
            shiftedOption.options[0]);
          const baseScoreWinner = baseOption?.options.reduce((best, option) => option.score > best.score ? option : best,
            baseOption.options[0]);
          const shiftedScoreWinner = shiftedOption?.options.reduce((best, option) => option.score > best.score ? option : best,
            shiftedOption.options[0]);
          dueRows.push({ captureId: capture.captureId, originPolicy: capture.originPolicy, seed: capture.seed,
            seconds: capture.secondsCompleted, antId, phase: phaseId, p00Fresh: baseDue, shiftedFresh: shiftedDue,
            bothFresh: baseDue && shiftedDue, readerOnlyComplete: completeReader,
            matchedWideRawCalls: widePairCount, rawWideChanged, wideGeometryChanged,
            maxCandidateHeadingAbsDelta, candidatePoseDelta, candidateOptions,
            p00TrailWinnerOffset: baseTrailWinner?.offset ?? null,
            readerOnlyTrailWinnerOffset: readerWinner?.offset ?? null,
            shiftedTrailWinnerOffset: shiftedTrailWinner?.offset ?? null,
            readerOnlyWinnerChanged: completeReader && readerWinner.offset !== baseTrailWinner?.offset,
            shiftedTrailWinnerChanged: Boolean(baseTrailWinner && shiftedTrailWinner && baseTrailWinner.offset !== shiftedTrailWinner.offset),
            p00ScoreWinnerOffset: baseScoreWinner?.offset ?? null,
            shiftedScoreWinnerOffset: shiftedScoreWinner?.offset ?? null,
            scoreWinnerChanged: Boolean(baseScoreWinner && shiftedScoreWinner && baseScoreWinner.offset !== shiftedScoreWinner.offset),
            chosenOffsetP00: baseChosen?.chosenOffset ?? null,
            chosenOffsetShifted: shiftedChosen?.chosenOffset ?? null,
            choiceChanged: Boolean(baseChosen && shiftedChosen && baseChosen.chosenOffset !== shiftedChosen.chosenOffset),
            optionTrailAbsDelta: baseDue && shiftedDue ? summary(baseOption.options.map((option, index) =>
              Math.abs(option.trail - (shiftedOption.options[index]?.trail ?? option.trail)))) : { n: 0 },
            optionScoreAbsDelta: baseDue && shiftedDue ? summary(baseOption.options.map((option, index) =>
              Math.abs(option.score - (shiftedOption.options[index]?.score ?? option.score)))) : { n: 0 },
            headingGeometryChanged: baseDue && shiftedDue ? baseOption.options.some((option, index) =>
              option.heading !== shiftedOption.options[index]?.heading) : false });
        }

        const displacement = moveBase && moveShift ? Math.hypot(moveShift.observedTo.x - moveBase.observedTo.x,
          moveShift.observedTo.y - moveBase.observedTo.y) : null;
        movementRows.push({ captureId: capture.captureId, originPolicy: capture.originPolicy, seed: capture.seed,
          seconds: capture.secondsCompleted, antId, phase: phaseId,
          localCueDelta: turnBase && turnShift ? turnShift.rawLocalCueU - turnBase.rawLocalCueU : null,
          localTurnDelta: turnBase && turnShift ? turnShift.clampedLocalTurn - turnBase.clampedLocalTurn : null,
          targetHeadingDelta: targetBase && targetShift ? angleDifference(targetShift.targetHeadingBeforeCrowding,
            targetBase.targetHeadingBeforeCrowding) : null,
          bodyHeadingDelta: bodyBase && bodyShift ? angleDifference(bodyShift.headingAfterTurn, bodyBase.headingAfterTurn) : null,
          velocityDelta: moveBase && moveShift ? Math.hypot(moveShift.vx - moveBase.vx, moveShift.vy - moveBase.vy) : null,
          travelDistanceDelta: moveBase && moveShift ? moveShift.travelled - moveBase.travelled : null,
          endpointDistance: displacement,
          travelChanged: movement.travel });
      }
    }

    stateReceipts.push({ captureId: capture.captureId, sourceHash: sha256(stateBytes), phaseReceiptHash: sha256(phaseBytes),
      originPolicy: capture.originPolicy, seed: capture.seed, secondsCompleted: capture.secondsCompleted,
      phaseZeroPassed: receipt.phaseZeroPassed, p00SampleRereadCount: stateLocalChecks + stateWideChecks,
      p00LocalRereadCount: stateLocalChecks, p00WideRereadCount: stateWideChecks });
    for (const phaseId of PHASE_IDS) {
      const ledger = receipt.historyByPhase[phaseId];
      phaseHistories.push({ captureId: capture.captureId, originPolicy: capture.originPolicy, seed: capture.seed,
        seconds: capture.secondsCompleted, phase: phaseId, eventCount: ledger.eventCount, depositWriteCount: ledger.depositWriteCount,
        requestedDose: ledger.requestedDose, acceptedDose: ledger.acceptedDose,
        boundaryClippedDose: ledger.boundaryClippedDose, elapsedDecaySeconds: ledger.elapsedDecaySeconds,
        storedMass: ledger.storedMass, uncappedShadowMass: ledger.uncappedShadowMass,
        capStorageLoss: ledger.capStorageLoss, cappedCellCount: ledger.cappedCellCount, peak: ledger.peak,
        fieldValuesSha256: ledger.fieldValuesSha256, phaseZeroRasterExact: ledger.phaseZeroRasterExact });
    }
  }

  assert.equal(stateReceipts.length, 66);
  assert.equal(reconstructionErrors.length, 0,
    `field-read/aggregate reconstruction mismatches: ${reconstructionErrors.length}; ${JSON.stringify(reconstructionErrors.slice(0, 24))}`);
  const localSummary = Object.fromEntries(PHASE_IDS.slice(1).map(phase => {
    const rows = localRows.filter(row => row.phase === phase);
    return [phase, {
      agentPairs: rows.length,
      allPhaseInteriorAgentPairs: rows.filter(row => row.interiorAllPhases).length,
      rawMeanAbsDelta: summary(rows.map(row => row.rawMeanAbsDelta)),
      rawRmsDelta: summary(rows.map(row => row.rawRmsDelta)),
      localSteeringAbsDelta: signedSummary(rows.map(row => row.localSteeringDelta)),
      readerOnlySteeringAbsDelta: signedSummary(rows.map(row => row.readerOnlySteeringDelta)),
      writerRasterSteeringAbsDelta: signedSummary(rows.map(row => row.writerRasterSteeringDelta)),
      localStrengthAbsDelta: signedSummary(rows.map(row => row.localStrengthDelta)),
      readerOnlyStrengthAbsDelta: signedSummary(rows.map(row => row.readerOnlyStrengthDelta)),
      writerRasterStrengthAbsDelta: signedSummary(rows.map(row => row.writerRasterStrengthDelta)),
      localCoherenceAbsDelta: signedSummary(rows.map(row => row.localCoherenceDelta)),
      localAggregateChangedPairs: rows.filter(row => row.localAggregateExactChanged).length,
      rawToSteeringPearson: correlation(rows.map(row => row.rawMeanAbsDelta), rows.map(row => Math.abs(row.localSteeringDelta)))
    }];
  }));
  const readerSummary = Object.fromEntries(PHASE_IDS.slice(1).map(phase => [phase, Object.fromEntries(['local-raw'].map(sensor => {
    const rows = readerRows.filter(row => row.phase === phase && row.sensor === sensor);
    return [sensor, {
      captures: rows.length,
      pairedCalls: rows.reduce((sum, row) => sum + row.pairedCallCount, 0),
      interiorCalls: rows.reduce((sum, row) => sum + row.interiorCallCount, 0),
      perCaptureReaderMeanAbs: summary(rows.map(row => row.readerOnlyDelta.absolute.mean || 0)),
      rasterStorageMeanAbs: summary(rows.map(row => row.rasterStorageDelta.absolute.mean || 0)),
      totalMeanAbs: summary(rows.map(row => row.totalDelta.absolute.mean || 0)),
      maxReconstructionResidual: Math.max(0, ...rows.map(row => row.reconstructionResidual.max || 0))
    }];
  }))]));
  const wideSummary = Object.fromEntries(PHASE_IDS.slice(1).map(phase => {
    const rows = dueRows.filter(row => row.phase === phase);
    const both = rows.filter(row => row.bothFresh);
    return [phase, { p00OrShiftedFreshEvents: rows.length, bothFresh: both.length,
      p00Fresh: rows.filter(row => row.p00Fresh).length, shiftedFresh: rows.filter(row => row.shiftedFresh).length,
      readerOnlyCompletePairs: rows.filter(row => row.readerOnlyComplete).length,
      rawWidePairedCalls: rows.reduce((sum, row) => sum + row.matchedWideRawCalls, 0),
      rawWideChangedEvents: rows.filter(row => row.rawWideChanged).length,
      wideGeometryChangedEvents: rows.filter(row => row.wideGeometryChanged).length,
      maxCandidateHeadingAbsDelta: summary(rows.map(row => row.maxCandidateHeadingAbsDelta)),
      candidatePoseDelta: summary(rows.map(row => row.candidatePoseDelta)),
      recordedRawTransverseSamples: rows.reduce((sum, row) => sum + row.candidateOptions.reduce((inner,
        option) => inner + option.p00RawSamples.length + option.translatedRawSamples.length
          + option.fixedRasterShiftedRawSamples.length, 0), 0),
      readerOnlyTrailWinnerChanges: rows.filter(row => row.readerOnlyWinnerChanged).length,
      shiftedTrailWinnerChanges: both.filter(row => row.shiftedTrailWinnerChanged).length,
      scoreWinnerChanges: both.filter(row => row.scoreWinnerChanged).length,
      chosenOffsetChanges: both.filter(row => row.choiceChanged).length,
      optionTrailAbsDelta: summary(both.flatMap(row => row.optionTrailAbsDelta.mean === undefined ? [] : [row.optionTrailAbsDelta.mean])),
      optionScoreAbsDelta: summary(both.flatMap(row => row.optionScoreAbsDelta.mean === undefined ? [] : [row.optionScoreAbsDelta.mean])) }];
  }));
  const movementSummary = Object.fromEntries(PHASE_IDS.slice(1).map(phase => {
    const rows = movementRows.filter(row => row.phase === phase);
    return [phase, { agentPairs: rows.length,
      localCueAbsDelta: summary(rows.map(row => Math.abs(row.localCueDelta ?? 0))),
      localTurnAbsDelta: summary(rows.map(row => Math.abs(row.localTurnDelta ?? 0))),
      targetHeadingAbsDelta: summary(rows.map(row => Math.abs(row.targetHeadingDelta ?? 0))),
      bodyHeadingAbsDelta: summary(rows.map(row => Math.abs(row.bodyHeadingDelta ?? 0))),
      velocityDelta: summary(rows.map(row => row.velocityDelta ?? 0)),
      travelDistanceAbsDelta: summary(rows.map(row => Math.abs(row.travelDistanceDelta ?? 0))),
      endpointDistance: summary(rows.map(row => row.endpointDistance ?? 0)),
      travelChanged: rows.filter(row => row.travelChanged).length }];
  }));
  const firstDivergenceSummary = Object.fromEntries(PHASE_IDS.slice(1).map(phase => [phase,
    Object.fromEntries([...new Set(divergenceRows.filter(row => row.phase === phase).map(row => row.stage))]
      .map(stage => [stage, divergenceRows.filter(row => row.phase === phase && row.stage === stage).length]))]));
  const longestHistory = new Map();
  for (const row of phaseHistories) if (!longestHistory.has(row.originPolicy + '/' + row.seed)
      || longestHistory.get(row.originPolicy + '/' + row.seed).seconds < row.seconds) longestHistory.set(row.originPolicy + '/' + row.seed, row);

  return {
    schema: 'ant-field-read-sensor-attribution/v1',
    provenance: { naturalFieldTransferCommit: NATURAL_COMMIT, matrixManifestSha256: sha256(manifestBytes),
      currentFieldSha256: fieldHash, cohortStates: stateReceipts.length, phaseZeroPassedStates: stateReceipts.filter(row => row.phaseZeroPassed).length,
      sourceCommitIsResearchInputOnly: true },
    protocol: { phases: fieldPhases(), comparison: 'for each p00 sensor query q, reader-only is G00(q+phase)-G00(q); raster/storage residual is Gphase(q+phase)-G00(q+phase); both sum to the observed full phase delta',
      baselineField: 'captured p00 Float32 raster after the same 1/60 s pre-sensor decay as the phase-run receipt',
      sampleValuePrecision: 'production sample returns JavaScript Number from Float32 grid storage and bilinear arithmetic' },
    gates: { stateCount: stateReceipts.length, p00LocalReadsExact: verifiedLocalCalls, p00WideReadsExact: verifiedWideCalls,
      pairedLocalActualPhaseReads: matchedLocalCalls, pairedWideActualPhaseReads: matchedWideCalls,
      completeLocalAgentPhasePairs: localCompleteAgentPairs, allPhaseInteriorLocalAgentPairs: localInteriorAgentPairs,
      wideOptionReconstructionChecks,
      p00ReadOrAggregateMismatches: reconstructionErrors.length },
    reader: readerSummary,
    localSensor: localSummary,
    wideSensor: wideSummary,
    firstDivergence: firstDivergenceSummary,
    movement: movementSummary,
    phaseHistoryLedger: { longestCapturePerOriginAndSeed: [...longestHistory.values()], allCaptureRows: phaseHistories },
    provenanceReceipts: stateReceipts,
    perAgentLocalPairs: localRows,
    perDecisionWidePairs: dueRows,
    perAgentMovementPairs: movementRows,
    firstDivergenceRows: divergenceRows,
    perCaptureReaderPairs: readerRows
  };
}

async function main() {
  const dataRoot = path.resolve(process.argv[2] || '');
  const outputPath = path.resolve(process.argv[3] || '');
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node scripts/ant-field-read-sensor-analysis.js <materialized natural evidence root> <new output JSON path>');
  const result = await analyze(dataRoot, outputPath);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ outputPath, states: result.gates.stateCount, exactLocalReads: result.gates.p00LocalReadsExact,
    exactWideReads: result.gates.p00WideReadsExact, localAgentPairs: result.gates.completeLocalAgentPhasePairs,
    readerMismatches: result.gates.p00ReadOrAggregateMismatches }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
