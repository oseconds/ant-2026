#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'docs/ant/evidence/2026-10-21-long-run-exhibition');
const args = process.argv.slice(2);
const valueAfter = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
const runtimeArg = valueAfter('--runtime');
const outputArg = valueAfter('--output');
const requireTwoHours = args.includes('--require-two-hours');
const findings = [];
const checks = [];
const read = (file) => fs.readFileSync(path.join(evidence, file));
const json = (file) => JSON.parse(read(file).toString('utf8'));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const check = (name, ok, detail = {}) => {
  checks.push({ name, ok: !!ok, ...detail });
  if (!ok) findings.push({ name, ...detail });
};

function verifyManifest(dir) {
  const manifest = json(`${dir}/run-manifest.json`);
  const prov = manifest.provenance;
  let valid = prov.actualTicks === 432000 && prov.actualSeconds === 7200 && prov.reachedTarget;
  const seen = [];
  for (const item of manifest.snapshots) {
    const bytes = read(`${dir}/${item.file}`);
    const digest = sha(bytes);
    valid &&= digest === item.sha256 && bytes.length === item.bytes;
    seen.push({ seconds: item.seconds, tick: item.tick, sha256: digest, bytes: bytes.length });
  }
  check(`${dir} manifest and snapshot SHA/size`, valid, {
    actualTicks: prov.actualTicks, actualSeconds: prov.actualSeconds,
    snapshotCount: seen.length, hashesVerified: seen.length,
    sourceCommit: prov.sourceCommit,
  });
  const currentSourceHashes = Object.fromEntries(Object.entries(prov.sourceHashes || {}).map(([file, captured]) => {
    const full = path.join(root, file);
    const current = fs.existsSync(full) ? sha(fs.readFileSync(full)) : null;
    return [file, { captured, current, matches: current === captured }];
  }));
  return { manifest, snapshots: seen, currentSourceHashes };
}

function compareDescriptors(baseFile, shadowFile) {
  const a = JSON.parse(read(`visual/${baseFile}`).toString('utf8'));
  const b = JSON.parse(read(`visual-capacity-1024/${shadowFile}`).toString('utf8'));
  const left = a.stratigraphy?.plates || [];
  const right = b.stratigraphy?.plates || [];
  const same = left.length >= 256 && right.length >= 256 &&
    JSON.stringify(left.slice(0, 256)) === JSON.stringify(right.slice(0, 256));
  check('first 256 Plate descriptors at baseline cap match shadow', same, {
    baselinePlateDescriptors: left.length, shadowPlateDescriptors: right.length,
    compared: Math.min(256, left.length, right.length),
  });
  return same;
}

function verifyVisual() {
  const base = verifyManifest('visual');
  const shadow = verifyManifest('visual-capacity-1024');
  const sharedSeconds = [0, 60, 300, 900, 1800, 3600];
  let parity = true;
  for (const seconds of sharedSeconds) {
    const name = `snapshot-${String(seconds).padStart(5, '0')}s.json`;
    parity &&= read(`visual/${name}`).equals(read(`visual-capacity-1024/${name}`));
  }
  check('six shared full snapshots byte-identical', parity, { seconds: sharedSeconds });
  const cap = base.manifest.capSnapshot;
  const capSnap = JSON.parse(read(`visual/${cap.file}`).toString('utf8'));
  const shadowEndSnapshot = 'snapshot-07200s.json';
  const descriptorParity = compareDescriptors(cap.file, shadowEndSnapshot);

  const bm = base.manifest.minuteMetrics;
  const sm = shadow.manifest.minuteMetrics;
  const baseEnd = bm.at(-1), shadowEnd = sm.at(-1);
  const capMinute = bm.find((m) => m.birthCapReached === true && m.plateCount === 256);
  const capStop = cap.plateCount === 256 && capMinute?.plateCount === 256 &&
    capMinute?.birthCapReached === true && baseEnd?.plateCount === 256 &&
    baseEnd?.birthsThisMinute === 0 && baseEnd?.topCellTurnover === 0;
  check('baseline cap reached and stopped material formation', capStop, {
    capTick: cap.tick, capSeconds: cap.seconds, capPlateCount: cap.plateCount,
    finalPlateCount: baseEnd?.plateCount, finalBirths: baseEnd?.birthsThisMinute,
    finalTopCellTurnover: baseEnd?.topCellTurnover,
  });
  check('shadow continues material change after baseline cap', shadowEnd?.plateCount > 256 &&
    shadowEnd?.birthsThisMinute > 0 && shadowEnd?.topCellTurnover > 0, {
    finalPlateCount: shadowEnd?.plateCount, birthsLastMinute: shadowEnd?.birthsThisMinute,
    topCellTurnoverLastMinute: shadowEnd?.topCellTurnover,
    unionCells: shadowEnd?.unionFootprintCells,
    newlyCoveredCells: shadowEnd?.newlyCoveredCellsThisMinute,
    classification: 'measured descriptive metrics; no artistic acceptance claim',
  });
  const finalSnap = JSON.parse(read('visual/snapshot-07200s.json').toString('utf8'));
  const capState = capSnap.stratigraphy?.stratigraphy;
  const finalState = finalSnap.stratigraphy?.stratigraphy;
  const countStateStable = capState?.layerCountByCell && finalState?.layerCountByCell &&
    JSON.stringify(capState.layerCountByCell) === JSON.stringify(finalState.layerCountByCell) &&
    JSON.stringify(capState.topLayerByCell) === JSON.stringify(finalState.topLayerByCell);
  check('cap and final baseline top/count state stable', !!countStateStable,
    { capTick: cap.tick, capPlateCount: cap.plateCount, finalPlateCount: baseEnd?.plateCount,
      layerCountCells: capState?.layerCountByCell?.length, topLayerCells: capState?.topLayerByCell?.length });
  check('visual minute metrics have expected measured sample count', bm.length === 121 && sm.length === 121,
    { baselineMetricRows: bm.length, shadowMetricRows: sm.length,
      statement: 'metrics are counted capture outputs; no artistic acceptance inference' });
  return { baseline: base, shadow, sharedPrefixExact: parity, first256DescriptorParity: descriptorParity };
}

function verifyStills() {
  const manifests = ['visual/stills', 'visual/stills-verified', 'visual-capacity-1024/stills-verified']
    .map((folder) => ({ folder, manifest: json(`${folder}/manifest.json`) }));
  const artifacts = [];
  let ok = true;
  const sourceComparisons = [];
  for (const { folder, manifest } of manifests) {
    const captureFile = folder.startsWith('visual-capacity-1024/')
      ? 'visual-capacity-1024/run-manifest.json' : 'visual/run-manifest.json';
    ok &&= manifest.provenance.snapshotsUnmutated === true &&
      manifest.provenance.inputFilesByteIdenticalAfterCapture === true &&
      sha(read(captureFile)) === manifest.provenance.captureManifestSha256;
    for (const [source, capturedSha256] of Object.entries(manifest.provenance.sourceHashes || {})) {
      const sourcePath = path.resolve(root, source);
      const currentSha256 = fs.existsSync(sourcePath) ? sha(fs.readFileSync(sourcePath)) : null;
      sourceComparisons.push({ manifest: folder, source, capturedSha256, currentSha256,
        matches: currentSha256 === capturedSha256 });
    }
    const reference = manifest.provenance.reference;
    if (reference?.source && reference.sha256) {
      const referencePath = path.resolve(root, reference.source);
      const referenceSha256 = fs.existsSync(referencePath) ? sha(fs.readFileSync(referencePath)) : null;
      ok &&= referenceSha256 === reference.sha256;
    }
    for (const item of [...manifest.tiles, ...manifest.timeSeriesSheets]) {
      const bytes = read(`${folder}/${item.file}`);
      const digest = sha(bytes);
      ok &&= digest === item.sha256 && bytes.length === item.bytes;
      artifacts.push({ file: `${folder}/${item.file}`, sha256: digest, bytes: bytes.length });
    }
    for (const tile of manifest.tiles) {
      const sourcePath = path.resolve(evidence, folder, '..', tile.source);
      const sourceBytes = fs.readFileSync(sourcePath);
      ok &&= sha(sourceBytes) === tile.sourceSha256 && tile.snapshotUnmutated === true;
    }
  }
  const source = manifests[0].manifest, verified = manifests[1].manifest, recent = manifests[2].manifest;
  check('still manifests, source/input/output hashes, and input immutability', ok, {
    manifestDirs: manifests.map((x) => x.folder),
    tileCounts: manifests.map((x) => x.manifest.tiles.length),
    snapshotInputUnmutated: manifests.every((x) => x.manifest.provenance.snapshotsUnmutated &&
      x.manifest.provenance.inputFilesByteIdenticalAfterCapture),
    sourceHashComparisons: sourceComparisons,
    overlayParityClaimed: false,
  });
  check('verified post-cap material readout is stable', verified.provenance.postCapReadoutStable === true &&
    verified.postCapMaterialOnlyComparison?.exactPerModePixelMatch === true,
    { exactPerModePixelMatch: verified.postCapMaterialOnlyComparison?.exactPerModePixelMatch });
  return artifacts.length;
}

function verifyAudio() {
  const receipts = json('audio/input-receipts.json').receipts;
  const residency = [];
  let ok = true;
  for (const r of receipts) {
    const gz = read(`audio/${r.artifact}`);
    ok &&= sha(gz) === r.sha256;
    const parent = path.resolve(root, r.parentArtifact);
    const parentSha = fs.existsSync(parent) ? sha(fs.readFileSync(parent)) : null;
    ok &&= parentSha === r.parentSha256;
    const benchmark = json(`audio/benchmark-${r.artifact.startsWith('resident-1') ? 'resident-1' : 'resident-2'}.json`);
    ok &&= benchmark.inputSha256 === r.sha256;
    residency.push({ artifact: r.artifact, sha256: sha(gz), parentSha256: parentSha,
      benchmarkInputSha256: benchmark.inputSha256, cases: r.cases.length });
  }
  check('resident input receipts, parent capture hashes, benchmark links', ok, { receipts: residency });

  const receipt = json('audio/turnover/turnover-inputs-receipt.json');
  const turnoverGz = read('audio/turnover/turnover-inputs.v8.gz');
  const pcm = json('audio/turnover/turnover-pcm.json');
  const turnoverOk = sha(turnoverGz) === receipt.sha256 && pcm.inputSha256 === receipt.sha256 &&
    receipt.naturalStrikes === 1503 && receipt.conditions.length === 2 &&
    receipt.conditions.every((c) => c.routeSelection.commonExcluded.malformed === 0 &&
      c.routeSelection.commonExcluded.staleOrMismatched === 0 &&
      c.routeSelection.conditionRouteMismatch.before === 0 && c.routeSelection.conditionRouteMismatch.after === 0 &&
      c.routeSelection.expectedProcessorDroppedRoutes === 0) &&
    pcm.conditions.every((c) => c.metrics.nonFiniteSamples === 0 && c.diagnostics.dropped === 0 &&
      c.diagnostics.droppedRoutes === 0 && c.diagnostics.nonFinite === 0);
  check('turnover capture inputs, route parity records, finite PCM and no drops', turnoverOk, {
    inputSha256: sha(turnoverGz), naturalStrikes: receipt.naturalStrikes,
    topologyParity: receipt.topologyParity,
    conditions: pcm.conditions.map((c) => ({ id: c.id, sampleCount: c.metrics.sampleCount,
      finiteSamples: c.metrics.finiteSamples, dropped: c.diagnostics.dropped,
      droppedRoutes: c.diagnostics.droppedRoutes, wavSha256: c.wavSha256 })),
  });
  const wav = pcm.conditions.map((c) => ({ id: c.id, path: c.wavPath, ...wavInfo(read(path.relative(evidence, path.resolve(root, c.wavPath)))) }));
  const a = wav[0], b = wav[1];
  const wavEqual = a && b && a.dataLength === b.dataLength && a.prefixBytes === b.prefixBytes &&
    a.prefixSha256 === b.prefixSha256 && a.fileSha256 === pcm.conditions[0].wavSha256 &&
    b.fileSha256 === pcm.conditions[1].wavSha256;
  check('turnover WAV bytes match PCM receipts and equal prefix', !!wavEqual, {
    firstDifferentFrame: pcm.differential.firstDifferentFrame,
    anchorFrame: pcm.differential.anchorFrame, wav: wav.map(({ id, dataLength, prefixBytes, prefixSha256, fileSha256 }) =>
      ({ id, dataLength, prefixBytes, prefixSha256, fileSha256 })),
  });
}

function wavInfo(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') return {};
  let p = 12, dataStart = -1, dataLength = 0;
  while (p + 8 <= bytes.length) {
    const id = bytes.toString('ascii', p, p + 4), len = bytes.readUInt32LE(p + 4);
    if (id === 'data') { dataStart = p + 8; dataLength = len; break; }
    p += 8 + len + (len & 1);
  }
  const data = bytes.subarray(dataStart, dataStart + dataLength);
  return { fileSha256: sha(bytes), dataLength, prefixBytes: Math.min(dataLength, 480000 * 2 * 4),
    prefixSha256: sha(data.subarray(0, Math.min(data.length, 480000 * 2 * 4))) };
}

function qualifiesForTwoHours(end, heartbeat, samplesOk, audioOk, startupOk) {
  return end?.status === 'complete' && heartbeat?.status === 'complete' &&
    Number.isFinite(end.elapsedSeconds) && end.elapsedSeconds >= 7200 &&
    heartbeat.elapsedSeconds === end.elapsedSeconds && samplesOk && audioOk && startupOk;
}

assert.equal(qualifiesForTwoHours({ status: 'complete', elapsedSeconds: 7200 },
  { status: 'complete', elapsedSeconds: 7200 }, true, true, true), true);
assert.equal(qualifiesForTwoHours({ status: 'interrupted', elapsedSeconds: 7200 },
  { status: 'interrupted', elapsedSeconds: 7200 }, true, true, true), false);
assert.equal(qualifiesForTwoHours({ status: 'complete', elapsedSeconds: 7199 },
  { status: 'complete', elapsedSeconds: 7199 }, true, true, true), false);
assert.equal(qualifiesForTwoHours({ status: 'complete', elapsedSeconds: 7200 },
  { status: 'running', elapsedSeconds: 7200 }, true, true, true), false);

function immutableWorldPrefixMatches(initial, final) {
  const plates = initial?.stratigraphy?.plates || [];
  const finalPlates = final?.stratigraphy?.plates || [];
  const order = initial?.stratigraphy?.stratigraphy?.layerOrder || [];
  const finalOrder = final?.stratigraphy?.stratigraphy?.layerOrder || [];
  return plates.length > 0 && finalPlates.length >= plates.length && order.length === plates.length &&
    JSON.stringify(plates) === JSON.stringify(finalPlates.slice(0, plates.length)) &&
    JSON.stringify(order) === JSON.stringify(finalOrder.slice(0, order.length));
}
const continuityFixture = (plates, order) => ({ stratigraphy: {
  plates, stratigraphy: { layerOrder: order },
} });
const initialFixture = continuityFixture([{ id: 'p1', immutable: 1 }], ['p1']);
assert.equal(immutableWorldPrefixMatches(initialFixture,
  continuityFixture([{ id: 'p1', immutable: 1 }, { id: 'p2' }], ['p1', 'p2'])), true);
assert.equal(immutableWorldPrefixMatches(initialFixture,
  continuityFixture([{ id: 'p1', immutable: 2 }], ['p1'])), false);
assert.equal(immutableWorldPrefixMatches(initialFixture,
  continuityFixture([{ id: 'p1', immutable: 1 }, { id: 'p2' }], ['p2', 'p1'])), false);
function countsAreMonotonic(previous, next) {
  return Number.isFinite(previous.simulationTimeMs) && Number.isFinite(next.simulationTimeMs) &&
    next.simulationTimeMs >= previous.simulationTimeMs && next.plateCount >= previous.plateCount &&
    next.historyCount >= previous.historyCount;
}
assert.equal(countsAreMonotonic({ simulationTimeMs: 1, plateCount: 1, historyCount: 1 },
  { simulationTimeMs: 2, plateCount: 2, historyCount: 2 }), true);
assert.equal(countsAreMonotonic({ simulationTimeMs: 2, plateCount: 2, historyCount: 2 },
  { simulationTimeMs: 1, plateCount: 1, historyCount: 1 }), false);

function verifyRuntime(dir, requireDuration) {
  const runtimePath = path.resolve(dir);
  const run = JSON.parse(fs.readFileSync(path.join(runtimePath, 'run.json'), 'utf8'));
  const heartbeat = JSON.parse(fs.readFileSync(path.join(runtimePath, 'heartbeat.json'), 'utf8'));
  const lines = fs.readFileSync(path.join(runtimePath, 'telemetry.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean);
  const rows = lines.map(JSON.parse);
  const samples = rows.filter((r) => r.type === 'sample');
  const start = rows.find((r) => r.type === 'start');
  const end = rows.find((r) => r.type === 'end');
  const continuous = samples.length > 0 && samples.every((r) =>
    r.app?.audioState === 'running' && r.app?.audioEnabled === true && r.app?.visibilityState === 'visible' &&
    r.app?.hasFocus === true && Number.isFinite(r.app?.simulationTimeMs) && Number.isFinite(r.app?.audioTime) &&
    r.app?.residency?.residentPlateCount <= 2);
  const audioClean = samples.length > 0 && samples.every((r) =>
    r.app?.nonFinite === 0 && r.app?.processorDiagnostics?.nonFinite === 0 &&
    r.app?.processorDiagnostics?.dropped === 0 && r.app?.processorDiagnostics?.droppedRoutes === 0 &&
    r.app?.processorDiagnostics?.clipped === 0 && r.app?.bridgeDiagnostics?.dropped === 0 &&
    r.app?.bridgeDiagnostics?.processorErrors === 0 && r.app?.processorErrorsTotal === 0 &&
    Array.isArray(r.app?.processorErrors) && r.app.processorErrors.length === 0 &&
    r.app?.pcmObservation?.nonFinite === 0 && r.app?.pcmObservation?.atOrAboveUnity === 0);
  const shadow = start?.initial?.historyCapacityShadow;
  const requiredFlags = ['--disable-background-networking', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows'];
  const startup = run.config?.audio === true && run.config?.muteAudioFlag === false &&
    run.config?.scheduling === 'no-background-throttling' && requiredFlags.every((flag) => run.config.launchArgs?.includes(flag)) &&
    run.config?.historyCapacity === 1024 &&
    run.config?.startupQuery?.includes('antResidents=2') && run.config?.startupQuery?.includes('antVisual=recent') &&
    start?.initial?.residentLimit === 2 && start?.initial?.visualModeLabel?.includes('amber') &&
    run.config?.sourceProvenance && run.config?.servedDistProvenance && shadow?.capacity === 1024 &&
    shadow?.status?.includes('production cap 256');
  const duration = Number(end?.elapsedSeconds ?? heartbeat.elapsedSeconds ?? 0);
  const endMatchesHeartbeat = !!end && end.status === heartbeat.status && end.elapsedSeconds === heartbeat.elapsedSeconds;
  const worldReceipts = rows.filter((r) => r.type === 'world-checkpoint');
  const initialWorld = worldReceipts.find((r) => r.checkpointSeconds === 0);
  const finalWorld = worldReceipts.find((r) => r.file === 'world-final.json.gz');
  const verifyWorld = (receipt) => {
    if (!receipt) return null;
    const bytes = fs.readFileSync(path.join(runtimePath, receipt.file));
    return { file: receipt.file, sha256: sha(bytes), expectedSha256: receipt.sha256,
      compressedBytes: bytes.length, expectedCompressedBytes: receipt.compressedBytes,
      ok: sha(bytes) === receipt.sha256 && bytes.length === receipt.compressedBytes };
  };
  const world = [verifyWorld(initialWorld), verifyWorld(finalWorld)];
  const worldReceiptsOk = !!initialWorld && world[0]?.ok === true &&
    (!end || (!!finalWorld && world[1]?.ok === true));
  let continuity = { status: 'pending', checkpoints: [], initialPlatePrefixExact: null };
  if (finalWorld && world[0]?.ok && world[1]?.ok) {
    const checkpoints = worldReceipts.map((receipt) => {
      const snapshot = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(runtimePath, receipt.file))).toString('utf8'));
      const history = snapshot.stratigraphy?.stratigraphy?.plateHistory || [];
      return { checkpointSeconds: receipt.checkpointSeconds, file: receipt.file,
        simulationTimeMs: snapshot.analysis?.simulationTimeMs,
        plateCount: snapshot.stratigraphy?.plates?.length ?? 0, historyCount: history.length, snapshot };
    }).sort((a, b) => a.checkpointSeconds - b.checkpointSeconds);
    const initial = checkpoints.find((point) => point.file === 'world-0000.json.gz');
    const final = checkpoints.find((point) => point.file === 'world-final.json.gz');
    const monotonic = checkpoints.every((point, index) => index === 0 || countsAreMonotonic({
      simulationTimeMs: checkpoints[index - 1].simulationTimeMs,
      plateCount: checkpoints[index - 1].plateCount,
      historyCount: checkpoints[index - 1].historyCount,
    }, point));
    const prefixExact = immutableWorldPrefixMatches(initial?.snapshot, final?.snapshot);
    continuity = { status: monotonic && prefixExact ? 'verified' : 'failed',
      checkpoints: checkpoints.map(({ checkpointSeconds, file, simulationTimeMs, plateCount, historyCount }) =>
        ({ checkpointSeconds, file, simulationTimeMs, plateCount, historyCount })),
      initialPlatePrefixExact: prefixExact, monotonicTimeAndCounts: monotonic,
      initialPlateDescriptors: initial?.plateCount,
      initialLayerOrderPrefixLength: initial?.snapshot.stratigraphy?.stratigraphy?.layerOrder?.length,
      finalLayerOrderLength: final?.snapshot.stratigraphy?.stratigraphy?.layerOrder?.length,
      rngParityClaimed: false };
    if (end || requireDuration) check('runtime world continuity across available checkpoints', monotonic && prefixExact, continuity);
  }
  const complete2h = qualifiesForTwoHours(end, heartbeat, continuous, audioClean, startup) &&
    endMatchesHeartbeat && worldReceiptsOk && continuity.status === 'verified';
  check('runtime soak sampled audio, residency, and protected startup evidence', continuous && audioClean && startup, {
    runtime: path.basename(runtimePath), status: heartbeat.status, elapsedSeconds: duration,
    samples: samples.length, continuousAudio: continuous, noNonFiniteOrDrops: audioClean,
    protectedStartupFlags: !!startup, protectedSourceRecorded: !!(run.config?.sourceProvenance && run.config?.servedDistProvenance),
    averageClockRatiosReportedOnly: true,
  });
  check('runtime end record and world-checkpoint receipts verified', worldReceiptsOk && (!end || endMatchesHeartbeat), {
    endStatus: end?.status ?? null, heartbeatStatus: heartbeat.status,
    endElapsedSeconds: end?.elapsedSeconds ?? null, heartbeatElapsedSeconds: heartbeat.elapsedSeconds,
    endMatchesHeartbeat, worldCheckpoints: world,
  });
  if (requireDuration) check('runtime completed at least two hours', complete2h, {
    status: heartbeat.status, elapsedSeconds: duration, minimum: 7200,
    explicitTwoHourClaimAllowed: complete2h,
  });
  else if (!complete2h) {
    findings.push({ name: 'runtime excluded from two-hour claim', status: heartbeat.status, elapsedSeconds: duration });
  }
  return { status: heartbeat.status, elapsedSeconds: duration, samples: samples.length,
    continuousAudio: continuous, noNonFiniteOrDrops: audioClean, complete2h,
    endMatchesHeartbeat, worldReceiptsOk, continuity };
}

try {
  const visual = verifyVisual();
  const stillArtifactCount = verifyStills();
  verifyAudio();
  const runtime = runtimeArg ? verifyRuntime(runtimeArg, requireTwoHours) : null;
  const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), evidence: path.relative(root, evidence),
    summary: { checks: checks.length, passed: checks.filter((c) => c.ok).length,
      failed: checks.filter((c) => !c.ok).length, findings: findings.length,
      visualSnapshots: visual.baseline.snapshots.length + visual.shadow.snapshots.length,
      sharedPrefixSnapshots: 6, stillArtifacts: stillArtifactCount, runtimeIncluded: !!runtime,
      twoHourRuntimeClaim: runtime?.complete2h === true },
    runtime,
    captureSourceComparison: { visual: visual.baseline.currentSourceHashes,
      capacity1024: visual.shadow.currentSourceHashes }, checks, findings };
  const output = outputArg ? path.resolve(root, outputArg) : null;
  if (output && output !== root && !output.startsWith(`${root}${path.sep}`)) {
    throw new Error('--output must stay inside the repository');
  }
  if (output) fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.summary.failed) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 2;
}
