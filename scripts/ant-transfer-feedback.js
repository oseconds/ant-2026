import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeSpatialController as makeExistingSpatialController } from './ant-spatial-core.js';
import { measureSpatialMovement } from './ant-spatial-movement.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const DT = 1 / 60;
const MOVEMENTS = ['production', 'dtFeedback', 'dampingOff', 'rawDisplacement'];
const SHAPES = ['straight', 'gentle', 'tight', 'gentleMirror', 'tightMirror', 'sCurve'];
const FIELD_MODES = ['analytic', 'deposited96'];
const SEEDS = [19, 61, 193];
const DAMPING = 0.65;
const OMEGA_LIMIT = 2.2;
const TURN_LIMIT = 4.5;
const LOCAL_TURN_LIMIT = 0.45;
const QUALIFICATION_DIR = resolve(ROOT, 'docs/ant/evidence/2026-10-23-natural-field-transfer/movement-qualification');
const RESULTS_PATH = resolve(QUALIFICATION_DIR, 'results.json');
const CORE_URL = new URL('./ant-spatial-core.js', import.meta.url);
const PROBE_URL = new URL('./ant-route-curvature-probes.js', import.meta.url);
const HASH_PATHS = ['src/lib/agents/ant/AntController.js', 'src/lib/agents/ant/AntAgent.js',
  'src/lib/agents/ant/PheromoneField.js', 'src/lib/agents/ant/GasterDeposition.js',
  'scripts/ant-spatial-core.js', 'scripts/ant-spatial-recruitment.js',
  'scripts/ant-route-curvature-probes.js', 'scripts/ant-route-curvature-metrics.js',
  'scripts/ant-spatial-movement.js', 'scripts/ant-transfer-feedback.js'];

const OMEGA_EXPRESSION = 'steeringAngularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence';
const CLAMP_DECLARATION = [
  '            const steeringAngularVelocity = clamp(',
  '                agent.angularVelocity,',
  '                -2.2,',
  '                2.2',
  '            );',
  ''
].join('\n');
const LOCAL_TURN_MARKER = '            const localTurn = clamp(\n';
const TRACE_INSERTION = [
  '            this.qualificationFeedbackTrace ??= [];',
  '            this.qualificationFeedbackTrace.push({ id: agent.id, previousOmega: agent.angularVelocity,',
  '                adherence: agent.trailAdherence,',
  '                feedbackRadians: -agent.angularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence * dt });',
  LOCAL_TURN_MARKER
].join('\n');
const ORIGINAL_HELPER_FEEDBACK = [
  "const dampingTerm = fixture.variant === 'dampingOff' ? 0",
  '      : -clamp(before.angularVelocity, -ANGULAR_VELOCITY_CLAMP, ANGULAR_VELOCITY_CLAMP)',
  '        * LOCAL_TURN_DAMPING * ant.trailAdherence;'
].join('\n');
const QUALIFICATION_HELPER_FEEDBACK = 'const dampingTerm = fixture.feedbackTerm(before.angularVelocity, ant.trailAdherence, DT);';

export function feedbackTerm(movement, previousOmega, adherence, dtSeconds = DT) {
  if (!MOVEMENTS.includes(movement) || ![previousOmega, adherence, dtSeconds].every(Number.isFinite)
    || dtSeconds <= 0) throw new TypeError('Expected a movement mode and finite state values with positive dt.');
  if (movement === 'dampingOff') return 0;
  if (movement === 'production') {
    return -Math.max(-OMEGA_LIMIT, Math.min(OMEGA_LIMIT, previousOmega)) * DAMPING * adherence;
  }
  if (movement === 'dtFeedback') {
    return -Math.max(-OMEGA_LIMIT, Math.min(OMEGA_LIMIT, previousOmega)) * DAMPING * adherence * dtSeconds;
  }
  return -previousOmega * DAMPING * adherence * dtSeconds;
}

export function strippedRecurrence({ cue = 0.2, adherence = 1, ticks = 120 } = {}) {
  if (![cue, adherence].every(Number.isFinite) || adherence < 0 || adherence > 1
    || !Number.isInteger(ticks) || ticks < 1) throw new TypeError('Expected finite cue, adherence in [0,1] and positive tick count.');
  const turns = [];
  let previousTurn = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    previousTurn = cue - DAMPING * adherence * previousTurn;
    turns.push(previousTurn);
  }
  return turns;
}

export function movementSummary(shape, samples) {
  return measureSpatialMovement(shape, samples.map(sample => ({ ...sample, angularVelocity: sample.turnRate })),
    { dtSeconds: DT });
}

export function clampLocalTurn(value) {
  if (!Number.isFinite(value)) throw new TypeError('Expected a finite local-turn value.');
  return Math.max(-LOCAL_TURN_LIMIT, Math.min(LOCAL_TURN_LIMIT, value));
}

export async function deriveTickTransfers({ inputPath = RESULTS_PATH,
  outputPath = resolve(QUALIFICATION_DIR, 'tick-transfer.json') } = {}) {
  const inputBytes = await readFile(inputPath);
  const result = JSON.parse(inputBytes.toString('utf8'));
  const cases = result.cases.map(item => ({ shape: item.shape, fieldMode: item.fieldMode, seed: item.seed,
    movement: item.movement, ticks: item.samples.slice(1).map((sample, index) => {
      const feedback = item.feedbackTrace[index], previous = item.samples[index];
      assert.equal(sample.tick, index + 1);
      assert.ok(Math.abs(sample.dampingTerm - feedback.feedbackRadians) <= 1e-15);
      assert.ok(Math.abs(sample.unconstrainedLocalTurn - (sample.localSteeringTerm + feedback.feedbackRadians)) <= 1e-15);
      const dx = sample.x - previous.x, dy = sample.y - previous.y, distance = Math.hypot(dx, dy);
      return { tick: sample.tick, previousOmega: feedback.previousOmega, adherence: feedback.adherence,
        feedbackRadians: feedback.feedbackRadians, localSteeringTerm: sample.localSteeringTerm,
        unconstrainedLocalTurn: sample.unconstrainedLocalTurn, localTurn: clampLocalTurn(sample.unconstrainedLocalTurn),
        bodyTurnRate: sample.turnRate, turnCapSaturated: sample.turnCapSaturated,
        collisionScale: sample.collisionScale, travelDistance: distance,
        travelAngle: distance > 1e-12 ? Math.atan2(dy, dx) : null,
        x: sample.x, y: sample.y, heading: sample.heading, routeStation: sample.routeStation,
        crossTrack: sample.crossTrack };
    }) }));
  assert.equal(cases.length, result.cases.length);
  assert.ok(cases.every(item => item.ticks.length === 180));
  const transfers = { schemaVersion: 1, createdAt: new Date().toISOString(),
    input: { path: inputPath, sha256: sha256(inputBytes) },
    derivation: 'localTurn = clamp(unconstrainedLocalTurn,-0.45,+0.45); feedback/input and unconstrained term are cross-checked against preserved source-instrumented trace and route samples at 1e-15 tolerance',
    caseCount: cases.length, tickCountPerCase: 180, cases };
  await writeJsonOnce(outputPath, transfers);
  return { outputPath, inputSha256: transfers.input.sha256, caseCount: cases.length, ticksPerCase: 180 };
}

export async function analyzeQualification({ inputPath = RESULTS_PATH,
  outputPath = resolve(QUALIFICATION_DIR, 'analysis.json') } = {}) {
  const inputBytes = await readFile(inputPath);
  const result = JSON.parse(inputBytes.toString('utf8'));
  const cases = result.cases.map(item => ({ shape: item.shape, fieldMode: item.fieldMode, seed: item.seed,
    movement: item.movement, highOmegaTicks: item.feedbackSummary.highOmegaTicks,
    rawVsDtDifferingTicks: item.feedbackSummary.rawVsDtDifferingTicks,
    metrics: movementSummary(item.shape, item.samples) }));
  const metrics = ['routeProgress', 'meanAbsoluteCrossTrack', 'p90AbsoluteCrossTrack', 'routeTurnSignAgreement',
    'sameSignTurnPairFraction', 'bodyTurnCapFraction', 'bodyOmegaReversalFraction', 'meanSpeed'];
  const groupMeans = [];
  for (const shape of SHAPES) for (const fieldMode of FIELD_MODES) for (const movement of MOVEMENTS) {
    const cells = cases.filter(item => item.shape === shape && item.fieldMode === fieldMode && item.movement === movement);
    groupMeans.push({ shape, fieldMode, movement, seedCount: cells.length,
      meanAcrossSeeds: Object.fromEntries(metrics.map(key => [key, mean(cells.map(item => item.metrics[key]))])),
      perSeed: cells.map(item => ({ seed: item.seed, metrics: item.metrics })) });
  }
  const paired = [];
  for (const shape of SHAPES) for (const fieldMode of FIELD_MODES) for (const seed of SEEDS) {
    const arms = Object.fromEntries(MOVEMENTS.map(movement => [movement,
      cases.find(item => item.shape === shape && item.fieldMode === fieldMode && item.seed === seed && item.movement === movement)]));
    paired.push({ shape, fieldMode, seed, arms: Object.fromEntries(MOVEMENTS.map(movement => [movement, arms[movement].metrics])),
      rawMinusDt: Object.fromEntries(metrics.map(key => [key, arms.rawDisplacement.metrics[key] - arms.dtFeedback.metrics[key]])) });
  }
  const executionRunnerPath = resolve(dirname(inputPath), 'sources/runner.ant-transfer-feedback.executed.js');
  let executedRunnerSha256 = null;
  try { executedRunnerSha256 = sha256(await readFile(executionRunnerPath)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const analysis = { schemaVersion: 1, createdAt: new Date().toISOString(), input: { path: inputPath, sha256: sha256(inputBytes),
    executedRunnerPath: executedRunnerSha256 ? executionRunnerPath : null, executedRunnerSha256 },
    analysisSource: { movementMetrics: 'existing measureSpatialMovement plus turnRate mapped to angularVelocity',
      currentSourceHashes: await sourceHashes() },
    caseCount: cases.length, cases, groupMeans, paired,
    counterexampleFamily: paired.filter(item => item.fieldMode === 'deposited96'
      && ['gentleMirror', 'tightMirror', 'sCurve'].includes(item.shape)) };
  await writeJsonOnce(outputPath, analysis);
  return { outputPath, caseCount: cases.length, inputSha256: analysis.input.sha256,
    counterexampleCells: analysis.counterexampleFamily.length };
}

export async function buildQualificationTools() {
  const coreBytes = await readFile(CORE_URL);
  const coreSource = coreBytes.toString('utf8').replaceAll('\r\n', '\n');
  const allowlistBefore = "assert.ok(['production', 'dtFeedback', 'dampingOff'].includes(movement));";
  const allowlistAfter = "assert.ok(['production', 'dtFeedback', 'dampingOff', 'rawDisplacement'].includes(movement));";
  const movementBlockBefore = [
    "  if (movement !== 'production') {",
    "    const replacement = movement === 'dtFeedback' ? `${OMEGA} * dt` : '0';",
    '    transformed = replaceOnce(transformed, OMEGA, replacement);',
    '    changes.push({ mechanism: \'movement\', before: OMEGA, after: replacement });',
    '  }'
  ].join('\n');
  const movementBlockAfter = [
    "  if (movement !== 'production') {",
    "    const replacement = movement === 'dtFeedback' ? `${OMEGA} * dt`",
    "      : movement === 'rawDisplacement' ? 'agent.angularVelocity * LOCAL_TURN_DAMPING * agent.trailAdherence * dt' : '0';",
    '    transformed = replaceOnce(transformed, OMEGA, replacement);',
    '    changes.push({ mechanism: \'movement\', before: OMEGA, after: replacement });',
    "    if (movement === 'rawDisplacement') {",
    "      const clampDeclaration = " + JSON.stringify(CLAMP_DECLARATION) + ".replaceAll('\\n', source.includes('\\r\\n') ? '\\r\\n' : '\\n');",
    "      transformed = replaceOnce(transformed, clampDeclaration, '');",
    "      changes.push({ mechanism: 'remove-extra-feedback-clamp', before: clampDeclaration, after: '' });",
    '    }',
    '  }'
  ].join('\n');
  const sourceReturnBefore = '  return { Controller: SpatialController, receipt: { movement, field, recruitment,';
  const sourceReturnAfter = '  return { Controller: SpatialController, transformedSource: transformed, receipt: { movement, field, recruitment,';
  const traceGuard = [
    "  if (movement === 'rawDisplacement' && instrumentFeedback) {",
    "    const lineEnding = source.includes('\\r\\n') ? '\\r\\n' : '\\n';",
    `    const localTurnMarker = ${JSON.stringify(LOCAL_TURN_MARKER)}.replaceAll('\\n', lineEnding);`,
    `    const traceInsertion = ${JSON.stringify(TRACE_INSERTION)}.replaceAll('\\n', lineEnding);`,
    '    transformed = replaceOnce(transformed, localTurnMarker, traceInsertion);',
    "    changes.push({ mechanism: 'feedback-trace-instrumentation', before: localTurnMarker, after: traceInsertion });",
    '  }'
  ].join('\n');
  const signatureBefore = "  recruitment = 'north' } = {}) {";
  const signatureAfter = "  recruitment = 'north', instrumentFeedback = false } = {}) {";
  const instrumentationAssert = "  assert.ok(!instrumentFeedback || movement === 'rawDisplacement', 'only rawDisplacement has an instrumented source arm.');";
  const afterMovementBlock = `${movementBlockAfter}\n${traceGuard}`;

  let instrumentedCore = coreSource;
  instrumentedCore = replaceOnce(instrumentedCore, allowlistBefore, allowlistAfter, 'movement allowlist');
  instrumentedCore = replaceOnce(instrumentedCore, signatureBefore, signatureAfter, 'builder options');
  instrumentedCore = replaceOnce(instrumentedCore, '  assert.ok([\'north\', \'isotropic\', \'flow\'].includes(recruitment));',
    `  assert.ok(['north', 'isotropic', 'flow'].includes(recruitment));\n${instrumentationAssert}`, 'instrumentation boundary');
  instrumentedCore = replaceOnce(instrumentedCore, movementBlockBefore, afterMovementBlock, 'raw movement builder');
  instrumentedCore = replaceOnce(instrumentedCore, sourceReturnBefore, sourceReturnAfter, 'generated source receipt');
  const coreInstrumentedHash = sha256(Buffer.from(instrumentedCore));
  instrumentedCore = instrumentedCore.replaceAll('import.meta.url', JSON.stringify(CORE_URL.href))
    .replace(/from '(\.{1,2}\/[^']+)'/g, (_, path) => `from '${new URL(path, CORE_URL).href}'`)
    .replace(/import\('(\.{1,2}\/[^']+)'\)/g, (_, path) => `import('${new URL(path, CORE_URL).href}')`);
  const coreModuleUrl = `data:text/javascript;base64,${Buffer.from(instrumentedCore).toString('base64')}`;
  let augmentedCore;
  try { augmentedCore = await import(coreModuleUrl); }
  catch (error) { throw new Error('qualification core import failed', { cause: error }); }
  const existingCompatibility = {};
  for (const movement of ['production', 'dtFeedback', 'dampingOff']) {
    const [expected, actual] = await Promise.all([
      makeExistingSpatialController({ movement, field: 'production', recruitment: 'north' }),
      augmentedCore.makeSpatialController({ movement, field: 'production', recruitment: 'north' })
    ]);
    assert.deepEqual(actual.receipt, expected.receipt, `Existing builder receipt changed for ${movement}.`);
    existingCompatibility[movement] = { match: true, transformedControllerSha256: actual.receipt.transformedControllerSha256 };
  }
  const helperBytes = await readFile(PROBE_URL);
  const helperOriginal = helperBytes.toString('utf8').replaceAll('\r\n', '\n');
  const guard = helperOriginal.lastIndexOf('\nconst mainPath');
  assert.ok(guard > 0, 'route probe CLI guard is present');
  let helperPatched = replaceOnce(helperOriginal, ORIGINAL_HELPER_FEEDBACK, QUALIFICATION_HELPER_FEEDBACK, 'fixture feedback trace');
  const patchedGuard = helperPatched.lastIndexOf('\nconst mainPath');
  assert.ok(patchedGuard > 0, 'instrumented route probe CLI guard is present');
  const helperExportSource = helperPatched.slice(0, patchedGuard)
    .replaceAll('import.meta.url', JSON.stringify(PROBE_URL.href))
    .replace(/from '(\.{1,2}\/[^']+)'/g, (_, path) => `from '${new URL(path, PROBE_URL).href}'`)
    .replace(/import\('(\.{1,2}\/[^']+)'\)/g, (_, path) => `import('${new URL(path, PROBE_URL).href}')`)
    + '\nexport { createFixture, runPass, seedField, smoothRouteSample };\n';
  const helperUrl = `data:text/javascript;base64,${Buffer.from(helperExportSource).toString('base64')}`;
  let helpers;
  try { helpers = await import(helperUrl); }
  catch (error) { throw new Error('instrumented route-helper import failed', { cause: error }); }
  const originalCoreHash = sha256(coreBytes);
  const originalHelperHash = sha256(helperBytes);
  const generated = {};
  for (const movement of MOVEMENTS) {
    const definition = await augmentedCore.makeSpatialController({ movement, field: 'production', recruitment: 'north',
      instrumentFeedback: false });
    generated[movement] = definition;
  }
  const rawPlain = generated.rawDisplacement;
  const rawInstrumented = await augmentedCore.makeSpatialController({ movement: 'rawDisplacement', field: 'production', recruitment: 'north',
    instrumentFeedback: true });
  generated.rawDisplacement = rawInstrumented;
  const strippedInstrumented = replaceOnce(rawInstrumented.transformedSource.replaceAll('\r\n', '\n'), TRACE_INSERTION, LOCAL_TURN_MARKER,
    'instrumented source strip');
  assert.equal(strippedInstrumented, rawPlain.transformedSource.replaceAll('\r\n', '\n'),
    'trace injection must be the only plain/instrumented controller difference');
  const receipt = {
    baselineRevision: '8c60e4bba3bd5b476300e90a2936bfebd1f831c2',
    sourcePaths: { core: 'scripts/ant-spatial-core.js', controller: 'src/lib/agents/ant/AntController.js',
      routeProbe: 'scripts/ant-route-curvature-probes.js' },
    coreSourceSha256: originalCoreHash, qualificationCoreSha256: coreInstrumentedHash,
    helperSourceSha256: originalHelperHash, helperInstrumentedSha256: sha256(Buffer.from(helperExportSource)),
    helperGuard: { before: ORIGINAL_HELPER_FEEDBACK, after: QUALIFICATION_HELPER_FEEDBACK, occurrenceCount: 1 },
    rawControllerCompatibility: { existingBuilderReceipts: existingCompatibility,
      plainSha256: rawPlain.receipt.transformedControllerSha256,
      instrumentedSha256: rawInstrumented.receipt.transformedControllerSha256,
      plainAndInstrumentedDifferOnlyByTrace: true,
      plainChanges: rawPlain.receipt.changes, instrumentedChanges: rawInstrumented.receipt.changes },
    arms: Object.fromEntries(MOVEMENTS.map(movement => [movement, generated[movement].receipt]))
  };
  return { helpers, generated, rawPlain, receipt, helperExportSource, qualificationCoreSource: instrumentedCore };
}

export async function runQualification({ outputPath = RESULTS_PATH } = {}) {
  const before = await sourceHashes();
  const tools = await buildQualificationTools();
  const cases = [];
  for (const shape of SHAPES) for (const fieldMode of FIELD_MODES) for (const seed of SEEDS) {
    for (const movement of MOVEMENTS) {
      cases.push(await runCase(tools, { shape, fieldMode, seed, movement }));
    }
  }
  const after = await sourceHashes();
  assert.deepEqual(after, before, 'production and frozen helper sources changed during qualification');
  assert.equal(cases.length, SHAPES.length * FIELD_MODES.length * SEEDS.length * MOVEMENTS.length);
  const result = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    protocol: { path: 'docs/ant/evidence/2026-10-23-natural-field-transfer/movement-qualification/PROTOCOL.md',
      durationSeconds: 3, dtSeconds: DT, ticks: 180, shapes: SHAPES, fieldModes: FIELD_MODES, seeds: SEEDS,
      movements: MOVEMENTS, oneAgentAfterFixtureNormalization: true,
      candidate: 'localTurn = clamp(localSteering*(0.35+0.65*A) - agent.angularVelocity*0.65*A*dt, -0.45, +0.45); existing turnToward cap remains 4.5 rad/s',
      interpretation: 'Controlled route-tracking engineering screen; not natural route choice, biological curvature sensing, unit repair, optimization, stability proof, or production qualification.' },
    sourceHashes: before,
    sourceReceipt: tools.receipt,
    cases
  };
  const sourceDir = resolve(dirname(outputPath), 'sources');
  await mkdir(sourceDir, { recursive: true });
  for (const movement of MOVEMENTS) {
    const source = movement === 'rawDisplacement' ? tools.rawPlain.transformedSource : tools.generated[movement].transformedSource;
    await writeOnce(resolve(sourceDir, `controller-${movement}.plain.mjs`), source);
  }
  await writeOnce(resolve(sourceDir, 'controller-rawDisplacement.instrumented.mjs'), tools.generated.rawDisplacement.transformedSource);
  await writeOnce(resolve(sourceDir, 'route-probes.instrumented.mjs'), tools.helperExportSource);
  await writeOnce(resolve(sourceDir, 'spatial-core.instrumented.mjs'), tools.qualificationCoreSource);
  await writeJsonOnce(resolve(sourceDir, 'source-receipt.json'), tools.receipt);
  await writeJsonOnce(outputPath, result);
  return { outputPath, caseCount: cases.length, sourceReceiptPath: resolve(sourceDir, 'source-receipt.json'), sourceHashes: before };
}

async function runCase(tools, { shape, fieldMode, seed, movement }) {
  const definition = tools.generated[movement];
  const fixture = await tools.helpers.createFixture({ Controller: definition.Controller, variant: movement }, seed, shape);
  try {
    let fieldSource, frozenGridHash = null;
    if (fieldMode === 'analytic') {
      fixture.controller.field.sample = (x, y) => tools.helpers.smoothRouteSample(shape, x, y);
      fieldSource = { mode: 'analytic', peak: 0.5, gaussianSigma: 0.0025 };
    } else {
      fieldSource = { mode: 'deposited96', ...tools.helpers.seedField(fixture.controller.field, shape, 'preserve') };
      assert.equal(fixture.controller.field.width, 96);
      assert.equal(fixture.controller.field.height, 96);
      const frozen = new PheromoneField({ width: fixture.controller.field.width, height: fixture.controller.field.height,
        decayHalfLifeSeconds: fixture.controller.field.decayHalfLifeSeconds, maxValue: fixture.controller.field.maxValue });
      frozen.values.set(fixture.controller.field.values);
      frozenGridHash = sha256(Buffer.from(frozen.values.buffer, frozen.values.byteOffset, frozen.values.byteLength));
      fixture.controller.field.sample = frozen.sample.bind(frozen);
    }
    fixture.feedbackTerm = (previousOmega, adherence, dtSeconds) => feedbackTerm(movement, previousOmega, adherence, dtSeconds);
    const trace = [];
    const tick = fixture.controller.tick.bind(fixture.controller);
    fixture.controller.tick = dtSeconds => {
      const previousOmega = fixture.ant.angularVelocity;
      tick(dtSeconds);
      trace.push({ previousOmega, adherence: fixture.ant.trailAdherence, feedbackRadians:
        feedbackTerm(movement, previousOmega, fixture.ant.trailAdherence, dtSeconds) });
    };
    const run = await tools.helpers.runPass(fixture, shape, 3, seed);
    assert.equal(run.ticks, 180, `${movement}/${shape}/${fieldMode}/${seed}: tick count`);
    assert.equal(trace.length, run.ticks, `${movement}/${shape}/${fieldMode}/${seed}: feedback trace length`);
    assert.equal(fixture.controller.agents.length, 1, `${movement}/${shape}/${fieldMode}/${seed}: one ant`);
    assert.ok(trace.every((item, index) => Math.abs(item.feedbackRadians - run.samples[index + 1].dampingTerm) <= 1e-15),
      `${movement}/${shape}/${fieldMode}/${seed}: reported term must match the law used by runPass`);
    assert.ok(run.samples.slice(1).every(sample => Math.abs(sample.turnRate) <= TURN_LIMIT + 1e-9),
      `${movement}/${shape}/${fieldMode}/${seed}: turn actuator cap`);
    if (movement === 'rawDisplacement') {
      assert.equal(fixture.controller.qualificationFeedbackTrace.length, run.ticks, 'controller-source feedback trace length');
      for (let index = 0; index < trace.length; index += 1) {
        const sourceTrace = fixture.controller.qualificationFeedbackTrace[index];
        assert.equal(sourceTrace.previousOmega, trace[index].previousOmega);
        assert.equal(sourceTrace.adherence, trace[index].adherence);
        assert.ok(Math.abs(sourceTrace.feedbackRadians - trace[index].feedbackRadians) <= 1e-15,
          'instrumented controller feedback must agree with independent formula trace');
      }
    }
    const highOmegaTicks = trace.filter(item => Math.abs(item.previousOmega) > OMEGA_LIMIT).length;
    const rawVsDtDifferingTicks = movement === 'rawDisplacement'
      ? trace.filter(item => Math.abs(item.feedbackRadians - feedbackTerm('dtFeedback', item.previousOmega, item.adherence)) > 1e-15).length
      : null;
    const material = fixture.controller.materialStratigraphy.getSnapshot();
    return { shape, fieldMode, seed, movement, durationSeconds: run.durationSeconds, ticks: run.ticks,
      survived: run.survived, survivalFraction: run.survivalFraction, randomDraws: run.randomDraws,
      fieldSource, frozenGridHash, feedbackTrace: trace,
      feedbackSummary: { highOmegaTicks, meanAbsoluteTerm: mean(trace.map(row => Math.abs(row.feedbackRadians))),
        maximumAbsoluteTerm: Math.max(...trace.map(row => Math.abs(row.feedbackRadians))), rawVsDtDifferingTicks },
      summary: movementSummary(shape, run.samples), legacyWindows: run.pathCurvatureWindows,
      materialOutcome: { acceptedFootContacts: fixture.controller.materialStratigraphy.totalAcceptedFootContacts,
        plates: material.plates.length, nodules: material.nodules.length,
        pheromoneMass: fixture.controller.field.getSnapshot().totalMass },
      samples: run.samples };
  } finally {
    await fixture.controller.destroy();
  }
}

async function sourceHashes() {
  return Object.fromEntries(await Promise.all(HASH_PATHS.map(async path =>
    [path, sha256(await readFile(resolve(ROOT, path)))])));
}

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  assert.equal(count, 1, `${label}: expected exactly one guarded source occurrence, found ${count}`);
  return source.replace(before, after);
}

async function writeOnce(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text.endsWith('\n') ? text : `${text}\n`, { flag: 'wx' });
}

async function writeJsonOnce(path, value) {
  await writeOnce(path, `${JSON.stringify(value, null, 2)}\n`);
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = process.argv.includes('--analyze') ? await analyzeQualification()
    : process.argv.includes('--derive-ticks') ? await deriveTickTransfers() : await runQualification();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
