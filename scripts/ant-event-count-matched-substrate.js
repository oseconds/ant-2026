import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { gunzipSync } from 'node:zlib';
import { decodeStereoFloatWav } from './stratigraphy-audio-overview.js';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';

const root = resolve('docs/ant/evidence/2026-10-07-base-substrate-debug/audio');
const out = resolve(root, 'event-count-matched-substrate');
const prior = JSON.parse(await readFile(resolve(root, 'audio-ab-report.json'), 'utf8'));
const priorMix = JSON.parse(await readFile(resolve(root, 'mix-audibility/mix-ab-report.json'), 'utf8'));
const frozenBytes = await readFile(resolve(root, prior.sourceRun.eventStreamFile));
assert.equal(sha(frozenBytes), prior.sourceRun.gzipSha256, 'frozen event stream hash');
const frozen = JSON.parse(gunzipSync(frozenBytes));
const priorBornBytes = await readFile(resolve(root, 'postbirth-born-only-10s-48khz-f32.wav'));
const priorAllSubstrateBytes = await readFile(resolve(root, 'postbirth-substrate-only-10s-48khz-f32.wav'));
assert.equal(sha(priorBornBytes), prior.outputs['postbirth-born-only-10s-48khz-f32.wav'].sha256);
assert.equal(sha(priorAllSubstrateBytes), prior.outputs['postbirth-substrate-only-10s-48khz-f32.wav'].sha256);

const fresh = await captureFreshRun();
const { recording, firstBirthEvent, audioBridge, topology } = fresh;
let browser;
const moduleFiles = new Map([
  ['/scripts/audio-snapshot-renderer.js', resolve('scripts/audio-snapshot-renderer.js')],
  ['/scripts/stratigraphy-audio-overview.js', resolve('scripts/stratigraphy-audio-overview.js')]
]);
const server = createHttpServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><meta charset=\"utf-8\"><title>ANT matched substrate PCM</title>');
    return;
  }
  const path = moduleFiles.get(request.url);
  if (!path) { response.writeHead(404); response.end(); return; }
  readFile(path).then(bytes => {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    response.end(bytes);
  }).catch(() => { response.writeHead(500); response.end(); });
});
try {
  assert.deepEqual(recording, frozen, 'fresh deterministic run must match the frozen recording');
  assert.equal(firstBirthEvent.id, prior.sourceRun.firstPlateId);
  assert.equal(firstBirthEvent.bornAtSimulationTimeMs / 1000, 103.01666666667376);
  assert.equal(sha(JSON.stringify(firstBirthEvent)), prior.sourceRun.firstPlateDescriptorSha256);
  assert.deepEqual(topology.layerIds, [firstBirthEvent.id]);
  assert.equal(sha(await readFile(resolve('static/worklets/plate.worklet.js'))), prior.worklets.legacyPlateSha256);
  assert.equal(sha(await readFile(resolve('static/worklets/surface-plate.worklet.js'))), prior.worklets.bornSurfaceSha256);

  const startMs = firstBirthEvent.bornAtSimulationTimeMs, endMs = startMs + 10000;
  const bornRows = recording.bornStrikes
    .map((row, recordingIndex) => ({ ...row, recordingIndex }))
    .filter(row => row.simulationTimeMs >= startMs && row.simulationTimeMs < endMs
      && row.payload.plateId === firstBirthEvent.id);
  const bornSchedule = bornRows.map(row => ({ frame: toFrame(row.simulationTimeMs, startMs), payload: row.payload }))
    .sort((a, b) => a.frame - b.frame);
  assert.equal(bornSchedule.length, 63);
  assert.deepEqual(bornSchedule, prior.sourceEvents.schedules.postbirthBorn);
  assert.equal(sha(JSON.stringify(bornSchedule)), priorMix.scheduleEquality.scheduleSha256);

  const matches = mapBornStrikesToContactGroups(recording, bornRows);
  const matchedIndices = [...new Set(matches.map(row => row.contactIndex))].sort((a, b) => a - b);
  const contactRows = recording.contacts;
  const legacyRows = recording.legacyStrikes;
  assert.equal(contactRows.length, legacyRows.length, 'one generic legacy payload per source FOOT_CONTACT group');
  for (let index = 0; index < contactRows.length; index += 1) {
    assert.equal(contactRows[index].simulationTimeMs, legacyRows[index].simulationTimeMs);
    assertProductionLegacyMapping(contactRows[index], legacyRows[index]);
  }
  const matchedGroups = matchedIndices.map(contactIndex => ({ contactIndex, ...contactRows[contactIndex] }));
  assert.ok(matchedGroups.every(row => row.simulationTimeMs >= startMs && row.simulationTimeMs < endMs));
  const matchedSchedule = matchedIndices.map(contactIndex => ({
    frame: toFrame(legacyRows[contactIndex].simulationTimeMs, startMs),
    payload: legacyRows[contactIndex].payload,
    contactIndex,
    simulationTimeMs: legacyRows[contactIndex].simulationTimeMs
  })).sort((a, b) => a.frame - b.frame || a.contactIndex - b.contactIndex);
  const matchedEvents = matchedSchedule.map(({ frame, payload }) => ({ frame, payload }));
  const allPostRows = legacyRows.filter(row => row.simulationTimeMs >= startMs && row.simulationTimeMs < endMs);
  const allEvents = allPostRows.map(row => ({ frame: toFrame(row.simulationTimeMs, startMs), payload: row.payload }))
    .sort((a, b) => a.frame - b.frame);
  assert.deepEqual(allEvents, prior.sourceEvents.schedules.postbirthBase);
  const allEventSha = sha(JSON.stringify(allEvents));
  const matchedEventSha = sha(JSON.stringify(matchedEvents));
  const matchedContactSha = sha(JSON.stringify(matchedGroups));
  assert.equal(matchedEvents.length, matchedIndices.length);
  assert.ok(matchedEvents.length < bornSchedule.length,
    'do not duplicate one group-level substrate strike for multiple P1 feet from the same group');

  const baseGain = audioBridge.legacy.plate.output.gain;
  const bornGain = audioBridge.surface.worklet.gainNode.gain.value;
  assert.equal(baseGain, prior.settings.substrateFinalGain);
  assert.equal(bornGain, prior.settings.bornPlateFinalGain);

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'domcontentloaded' });
  const plateSource = await readFile(resolve('static/worklets/plate.worklet.js'), 'utf8');
  const surfaceSource = await readFile(resolve('static/worklets/surface-plate.worklet.js'), 'utf8');
  const captured = await page.evaluate(async input => {
    const rate = 48000, frames = 480000;
    const context = new OfflineAudioContext(8, frames, rate);
    const plateUrl = URL.createObjectURL(new Blob([input.plateSource], { type: 'text/javascript' }));
    const surfaceUrl = URL.createObjectURL(new Blob([input.surfaceSource], { type: 'text/javascript' }));
    await context.audioWorklet.addModule(plateUrl);
    await context.audioWorklet.addModule(surfaceUrl);
    URL.revokeObjectURL(plateUrl); URL.revokeObjectURL(surfaceUrl);
    const merger = context.createChannelMerger(8);
    merger.connect(context.destination);
    const connectFinal = (node, firstChannel, level) => {
      const gain = context.createGain(); gain.gain.value = level;
      const splitter = context.createChannelSplitter(2);
      node.connect(gain); gain.connect(splitter);
      splitter.connect(merger, 0, firstChannel); splitter.connect(merger, 1, firstChannel + 1);
    };
    const connectRaw = (node, firstChannel) => {
      const splitter = context.createChannelSplitter(2);
      node.connect(splitter);
      splitter.connect(merger, 0, firstChannel); splitter.connect(merger, 1, firstChannel + 1);
    };
    const watch = (node, label) => {
      let resolveReady, resolveDone, rejectReady, rejectDone;
      const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(label + ' scheduler handshake timed out')), 10000);
        resolveReady = value => { clearTimeout(timer); resolve(value); };
        rejectReady = error => { clearTimeout(timer); reject(error); };
      });
      const done = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(label + ' render timed out')), 90000);
        resolveDone = value => { clearTimeout(timer); resolve(value); };
        rejectDone = error => { clearTimeout(timer); reject(error); };
      });
      node.port.onmessage = event => {
        if (event.data?.type === 'evidence-ready') resolveReady(event.data);
        if (event.data?.type === 'evidence-done') resolveDone(event.data);
      };
      node.addEventListener('processorerror', () => {
        const error = new Error(label + ' AudioWorklet processor error');
        rejectReady(error); rejectDone(error);
      }, { once: true });
      return { ready, done };
    };
    const plateNode = new AudioWorkletNode(context, 'plate-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { resolution: 'normal', stiffness: 0.92, damping: 100,
        stereoPickups: [{ x: -0.32, y: -0.18 }, { x: 0.32, y: -0.18 }],
        evidenceSchedule: { endFrame: frames, events: input.substrateEvents } }
    });
    connectFinal(plateNode, 4, input.baseGain);
    connectRaw(plateNode, 6);
    const surfaceNode = new AudioWorkletNode(context, 'surface-plate-processor', {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { evidenceTopology: { ...input.topology, maxLayers: 256 },
        evidenceSchedule: { endFrame: frames, events: input.bornEvents.map(event => ({
          frame: event.frame, message: { type: 'strike', payload: event.payload }
        })) } }
    });
    connectFinal(surfaceNode, 0, input.bornGain);
    connectRaw(surfaceNode, 2);
    const monitors = [watch(plateNode, 'matched substrate'), watch(surfaceNode, 'born P1')];
    const render = context.startRendering();
    const [buffer, ready, reports] = await Promise.all([render,
      Promise.all(monitors.map(row => row.ready)), Promise.all(monitors.map(row => row.done))]);
    if (ready.some((row, index) => row.frame !== 0 || row.endFrame !== frames
      || row.scheduled !== (index === 0 ? input.substrateEvents.length : input.bornEvents.length))) {
      throw new Error('Initial scheduler acknowledgements differ from the frozen schedules.');
    }
    if (reports[0].injected !== input.substrateEvents.length || reports[0].renderedFrames !== frames
      || reports[1].strikes !== input.bornEvents.length || reports[1].renderedFrames !== frames) {
      throw new Error('AudioWorklet delivery counts differ from the frozen schedules.');
    }
    const makeWav = (left, right) => {
      const bytes = new Uint8Array(44 + frames * 8), view = new DataView(bytes.buffer);
      bytes.set([82, 73, 70, 70]); view.setUint32(4, bytes.length - 8, true);
      bytes.set([87, 65, 86, 69, 102, 109, 116, 32], 8); view.setUint32(16, 16, true);
      view.setUint16(20, 3, true); view.setUint16(22, 2, true); view.setUint32(24, rate, true);
      view.setUint32(28, rate * 8, true); view.setUint16(32, 8, true); view.setUint16(34, 32, true);
      bytes.set([100, 97, 116, 97], 36); view.setUint32(40, frames * 8, true);
      for (let i = 0, offset = 44; i < frames; i += 1, offset += 8) {
        view.setFloat32(offset, left[i], true); view.setFloat32(offset + 4, right[i], true);
      }
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    };
    const channels = Array.from({ length: 8 }, (_, index) => buffer.getChannelData(index));
    const wavs = {
      bornConfigured: makeWav(channels[0], channels[1]),
      bornRaw: makeWav(channels[2], channels[3]),
      substrateConfigured: makeWav(channels[4], channels[5]),
      substrateRaw: makeWav(channels[6], channels[7])
    };
    plateNode.disconnect(); surfaceNode.disconnect();
    plateNode.port.close(); surfaceNode.port.close();
    return { wavs, ready, reports };
  }, { plateSource: instrumentPlate(plateSource), surfaceSource: instrumentSurface(surfaceSource),
    topology, bornEvents: bornSchedule, substrateEvents: matchedEvents, baseGain, bornGain });

  const bornConfiguredBytes = Buffer.from(captured.wavs.bornConfigured, 'base64');
  const bornRawBytes = Buffer.from(captured.wavs.bornRaw, 'base64');
  const matchedConfiguredBytes = Buffer.from(captured.wavs.substrateConfigured, 'base64');
  const matchedRawBytes = Buffer.from(captured.wavs.substrateRaw, 'base64');
  assert.equal(sha(bornConfiguredBytes), sha(priorBornBytes), 'born P1 final configured PCM must match the frozen render');
  const bornConfigured = decodeStereoFloatWav(bornConfiguredBytes);
  const bornRaw = decodeStereoFloatWav(bornRawBytes);
  const matchedConfigured = decodeStereoFloatWav(matchedConfiguredBytes);
  const matchedRaw = decodeStereoFloatWav(matchedRawBytes);
  const allConfigured = decodeStereoFloatWav(priorAllSubstrateBytes);
  assert.equal(allConfigured.sampleCount, 480000);
  const allRawChannels = {
    left: Float32Array.from(allConfigured.channels.left, value => value / baseGain),
    right: Float32Array.from(allConfigured.channels.right, value => value / baseGain)
  };
  const allRawBytes = encodeFloatWav(allRawChannels.left, allRawChannels.right);
  const allRaw = { sampleRate: 48000, sampleCount: allConfigured.sampleCount, channels: allRawChannels };
  const stems = {
    bornP1: { configured: bornConfigured, raw: bornRaw },
    matchedSubstrate: { configured: matchedConfigured, raw: matchedRaw },
    allEventSubstrate: { configured: allConfigured, raw: allRaw }
  };
  const metrics = Object.fromEntries(Object.entries(stems).map(([name, tracks]) => [name, {
    configured: measure(tracks.configured.channels.left, tracks.configured.channels.right),
    rawWorklet: measure(tracks.raw.channels.left, tracks.raw.channels.right)
  }]));
  const eventFrames = bornSchedule.map(event => event.frame);
  const eventAligned = [100, 250, 500].map(durationMs => {
    const length = durationMs * 48;
    const windowStats = {};
    for (const [name, tracks] of Object.entries(stems)) for (const [level, pcm] of Object.entries(tracks)) {
      const values = eventFrames.filter(frame => frame + length <= pcm.sampleCount)
        .map(frame => pooledRms(pcm.channels.left, pcm.channels.right, frame, length));
      const sorted = [...values].sort((a, b) => a - b);
      windowStats[name + '.' + level] = {
        eligibleWindows: values.length, excludedIncompleteTailWindows: eventFrames.length - values.length,
        medianRms: median(sorted), medianRmsDbfs: dbfs(median(sorted))
      };
    }
    return { durationMs, samplesPerChannel: length, start: 'P1 requested strike sample',
      end: 'exclusive; start + duration', alignmentSchedule: 'all 63 accepted P1 strike frames; duplicate frames retain P1 route multiplicity',
      windowStats };
  });
  const eventDensityDeltaDb = dbRatio(metrics.matchedSubstrate.rawWorklet.rms, metrics.allEventSubstrate.rawWorklet.rms);
  const intrinsicReadoutDeltaDb = dbRatio(metrics.matchedSubstrate.rawWorklet.rms, metrics.bornP1.rawWorklet.rms);
  const configuredGainDeltaDb = dbRatio(baseGain, bornGain);
  const finalMatchedGapDb = dbRatio(metrics.matchedSubstrate.configured.rms, metrics.bornP1.configured.rms);
  const allVersusBornGapDb = dbRatio(metrics.allEventSubstrate.configured.rms, metrics.bornP1.configured.rms);
  assert.ok(Math.abs(allVersusBornGapDb - (dbRatio(metrics.allEventSubstrate.rawWorklet.rms,
    metrics.matchedSubstrate.rawWorklet.rms) + intrinsicReadoutDeltaDb + configuredGainDeltaDb)) < 0.002,
    'level decomposition must close within float32 branch precision');

  await mkdir(out, { recursive: true });
  const newWavs = {
    'born-p1-63-configured-10s-48khz-f32.wav': bornConfiguredBytes,
    'born-p1-63-raw-worklet-10s-48khz-f32.wav': bornRawBytes,
    'substrate-matched-parent-groups-configured-10s-48khz-f32.wav': matchedConfiguredBytes,
    'substrate-matched-parent-groups-raw-worklet-10s-48khz-f32.wav': matchedRawBytes,
    'substrate-all-events-raw-worklet-derived-10s-48khz-f32.wav': allRawBytes
  };
  for (const [name, bytes] of Object.entries(newWavs)) await writeFile(resolve(out, name), bytes);
  const visualEvents = matchedGroups.map(row => ({ type: 'FOOT_CONTACT',
    simulationTimeMs: row.simulationTimeMs - startMs, payload: row.payload, contactIndex: row.contactIndex }))
    .concat([{ type: 'PLATE_BIRTH', simulationTimeMs: 0, payload: { id: firstBirthEvent.id }, label: 'P1' }]);
  const visuals = await renderVisuals({ page, out, startMs, events: visualEvents, tracks: [
    { key: 'born-p1', label: 'Born P1 · 63 accepted foot strikes', configured: bornConfiguredBytes, raw: bornRawBytes },
    { key: 'substrate-matched', label: 'Generic substrate · matched parent groups', configured: matchedConfiguredBytes, raw: matchedRawBytes },
    { key: 'substrate-all-events', label: 'Generic substrate · all 624 events', configured: priorAllSubstrateBytes, raw: allRawBytes }
  ] });

  const report = {
    status: 'frozen-input-production-mapped-event-subset-captured',
    note: '63 accepted P1 foot strikes originate from 44 unique FOOT_CONTACT groups. Production sends one generic substrate excitation per group, so this report preserves those 44 mapped payloads rather than duplicating group events to force 63.',
    source: { seed: recording.seed, inputFile: prior.sourceRun.eventStreamFile,
      inputGzipSha256: sha(frozenBytes), deepEqualToFreshDeterministicRun: true,
      firstPlateId: firstBirthEvent.id, firstPlateBirthSeconds: startMs / 1000,
      firstPlateDescriptorSha256: sha(JSON.stringify(firstBirthEvent)),
      postbirthWindowSimulationSeconds: [startMs / 1000, endMs / 1000],
      clockMapping: { sampleRate: 48000, durationSeconds: 10, samplesPerChannel: 480000,
        requestedFrame: 'round((simulationTimeMs - firstPlateBirthMs) * 48)',
        bornDispatch: 'sample-exact before requested frame',
        genericSubstrateDispatch: 'next 128-frame quantum; actualFrame = ceil(requestedFrame / 128) * 128' } },
    eventMapping: { rule: 'Match each accepted P1 born strike to exactly one same-timestamp FOOT_CONTACT leg and its SurfaceField response by exact position; deduplicate parent contact-group index; select that group’s original legacy-strike payload once.',
      acceptedBornP1Strikes: bornRows.length, uniqueMatchedContactGroups: matchedGroups.length,
      substrateMatchedGroupEvents: matchedEvents.length, allPostbirthContactGroups: allPostRows.length,
      allPostbirthLegacyEvents: allEvents.length, sourceGroupMultiplicity: multiplicitySummary(matches),
      originalGroupScheduleEmissionOrder: 'retained for equal-frame rows using original recording index',
      matchedContactGroupRows: matchedGroups.map(row => ({ contactIndex: row.contactIndex,
        simulationTimeMs: row.simulationTimeMs, payload: row.payload })),
      acceptedP1ToParentGroup: matches.map(row => ({ bornRecordingIndex: row.bornRecordingIndex,
        contactIndex: row.contactIndex, contactLegId: row.legId, simulationTimeMs: row.simulationTimeMs,
        requestedFrame: toFrame(row.simulationTimeMs, startMs) })) },
    scheduleHashes: { p1AcceptedScheduleSha256: sha(JSON.stringify(bornSchedule)),
      matchedSourceContactGroupsSha256: matchedContactSha,
      p1ToParentMappingSha256: sha(JSON.stringify(matches.map(row => ({ bornRecordingIndex: row.bornRecordingIndex,
        contactIndex: row.contactIndex, legId: row.legId, simulationTimeMs: row.simulationTimeMs })))),
      matchedSubstrateScheduleSha256: matchedEventSha,
      allEventsSubstrateScheduleSha256: allEventSha,
      priorP1ScheduleSha256: priorMix.scheduleEquality.scheduleSha256,
      schedules: { bornP1: bornSchedule, matchedSubstrate: matchedSchedule.map(({ frame, payload,
        contactIndex, simulationTimeMs }) => ({ frame, payload, sourceContactIndex: contactIndex, simulationTimeMs })) } },
    measurements: { units: 'linear float32 full-scale; dBFS uses 20*log10(rms or peak)',
      stems: metrics,
      eventAlignedMedianRms: eventAligned,
      decomposition: { matchedVsAllEventSubstrateLevelDeltaDb: eventDensityDeltaDb,
        matchedSubstrateVsBornRawWorkletLevelDeltaDb: intrinsicReadoutDeltaDb,
        configuredGainSubstrateRelativeToBornDb: configuredGainDeltaDb,
        matchedSubstrateVsBornFinalConfiguredLevelDeltaDb: finalMatchedGapDb,
        allEventSubstrateVsBornFinalConfiguredLevelDeltaDb: allVersusBornGapDb,
        closureCheckDbError: allVersusBornGapDb - (dbRatio(metrics.allEventSubstrate.rawWorklet.rms,
          metrics.matchedSubstrate.rawWorklet.rms) + intrinsicReadoutDeltaDb + configuredGainDeltaDb),
        interpretation: 'The first term reflects both the lower event count and selection of P1-supporting groups; the raw comparison also includes production-mapped group-centroid/strength versus per-foot excitation payloads and different worklet/resonator/readout paths; the third is the fixed external bridge/output gain difference. These are level decompositions, not psychoacoustic masking measurements.' } },
    settings: { masterVolume: 0.35, substrateOutputRatio: 0.22, substrateBridgeOutputGain: baseGain,
      bornPlateBridgeOutputGain: bornGain, substrateBridgeDampingControl: 1,
      genericPlateWorkletProcessorOptions: { resolution: 'normal', stiffness: 0.92, damping: 100,
        stereoPickups: [{ x: -0.32, y: -0.18 }, { x: 0.32, y: -0.18 }] },
      bornPlatePulseMs: 3, bornPlateRecoveryMs: 75, bornPlateDampingMultiplier: 50 },
    capture: { browser: browser.version(), sampleRate: 48000, processorErrors: 0,
      schedulerReady: captured.ready, workletReports: captured.reports,
      bornConfiguredExactPcmMatchToFrozenStem: sha(bornConfiguredBytes) === sha(priorBornBytes),
      configuredBranchConsistencyMaxAbsError: {
        born: branchError(bornRaw, bornConfigured, bornGain),
        matchedSubstrate: branchError(matchedRaw, matchedConfigured, baseGain)
      },
      rawOutputDefinition: 'Direct AudioWorklet output branch before the external bridge/output GainNode; includes each worklet’s internal processing and limiter.',
      genericPlateRandomness: 'The unchanged generic worklet uses production Math.random strike jitter; the frozen event schedule is exact, but a fresh PCM replay may have a different noise realization.',
      allEventsRawDerivation: 'Existing all-events configured float32 PCM divided sample-by-sample by its fixed static 0.0539 bridge/output gain; original configured WAV kept unchanged.' },
    immutableReferences: { priorBornPcmSha256: sha(priorBornBytes), priorAllEventsSubstratePcmSha256: sha(priorAllSubstrateBytes),
      allEventsSubstratePcmPath: '../postbirth-substrate-only-10s-48khz-f32.wav',
      allEventsSubstratePcmRemainsByteIdentical: true, priorBaseScheduleCount: allEvents.length },
    outputs: Object.fromEntries(Object.entries(newWavs).map(([name, bytes]) => [name, {
      sha256: sha(bytes), ...measure(decodeStereoFloatWav(bytes).channels.left, decodeStereoFloatWav(bytes).channels.right)
    }])),
    visuals
  };
  const oldBornAfter = await readFile(resolve(root, 'postbirth-born-only-10s-48khz-f32.wav'));
  const oldSubstrateAfter = await readFile(resolve(root, 'postbirth-substrate-only-10s-48khz-f32.wav'));
  assert.equal(sha(oldBornAfter), sha(priorBornBytes), 'frozen born P1 reference must remain byte-identical');
  assert.equal(sha(oldSubstrateAfter), sha(priorAllSubstrateBytes), 'frozen all-events substrate reference must remain byte-identical');
  await writeFile(resolve(out, 'event-count-matched-report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'README.md'), makeReadme(report));
  console.log(JSON.stringify({ out, acceptedP1Strikes: bornRows.length, uniqueMatchedContactGroups: matchedGroups.length,
    allEventGroups: allEvents.length, scheduleHashes: Object.fromEntries(Object.entries(report.scheduleHashes)
      .filter(([, value]) => typeof value === 'string')),
    levels: Object.fromEntries(Object.entries(metrics).map(([name, track]) => [name, {
      rawRms: track.rawWorklet.rms, configuredRms: track.configured.rms,
      rawPeak: track.rawWorklet.peak, configuredPeak: track.configured.peak
    }])), decomposition: report.measurements.decomposition,
    outputs: Object.keys(newWavs), visuals: visuals.images.map(row => row.file) }, null, 2));
} finally {
  await fresh.controller.destroy();
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}

async function captureFreshRun() {
  const seed = 20261005;
  let rngState = seed >>> 0, rngCalls = 0, currentMs = 0, firstBirthEvent = null;
  const contacts = [], legacyStrikes = [], bornStrikes = [];
  const audioEngine = { context: { currentTime: 0 }, async createWorklet(name, _url, _config, _onMessage, _onError, output = {}) {
    const gain = { value: output.gain ?? 1, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; },
      linearRampToValueAtTime(value) { this.value = value; } };
    return { node: { port: { onmessage: null, postMessage(message) {
      if (name === 'surface-plate-processor' && message?.type === 'strike') bornStrikes.push({ simulationTimeMs: currentMs, payload: message.payload });
    }, close() {} }, addEventListener() {}, removeEventListener() {} }, gainNode: { gain }, disconnect() {} };
  } };
  const audioBridge = new AntEnvironmentAudioBridge({ audioEngine });
  const controller = new AntController({ random: () => {
    rngCalls += 1; rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 0x100000000;
  }, audioBridge, state: { audioExperiment: { mode: 'bornSurface', baseSubstrate: true } } });
  const unsubscribe = controller.subscribe(({ type, payload }) => {
    if (type === 'plate-birth' && !firstBirthEvent) firstBirthEvent = payload;
  });
  try {
    await controller.init(); controller.setAudioVolume(0.35); await controller.setAudioEnabled(true);
    if (!audioBridge.legacy.plate || !audioBridge.surface.worklet) throw new Error('Both frozen audio bridge paths must initialize.');
    const originalHandle = audioBridge.handleFootContact.bind(audioBridge);
    audioBridge.handleFootContact = (event, context) => {
      currentMs = event.simulationTimeMs;
      contacts.push({ simulationTimeMs: currentMs, payload: event, responses: context.responses });
      return originalHandle(event, context);
    };
    audioBridge.legacy.plate.strike = async payload => {
      legacyStrikes.push({ simulationTimeMs: currentMs, payload }); return true;
    };
    const step = 1 / 60;
    while (controller.simulationTimeMs < 120000 && (!firstBirthEvent
      || controller.simulationTimeMs < firstBirthEvent.bornAtSimulationTimeMs + 10000)) controller.tick(step);
    if (!firstBirthEvent || controller.simulationTimeMs < firstBirthEvent.bornAtSimulationTimeMs + 9999) {
      throw new Error('Fresh deterministic run did not reach first birth plus ten seconds.');
    }
    return { controller, audioBridge, firstBirthEvent, topology: structuredClone(audioBridge.surface.topology),
      recording: { seed, simulationDurationSeconds: controller.simulationTimeMs / 1000, rngCalls,
        finalRngState: rngState, contacts, legacyStrikes, bornStrikes } };
  } catch (error) {
    unsubscribe(); await controller.destroy(); throw error;
  } finally { unsubscribe(); }
}

function mapBornStrikesToContactGroups(recording, bornRows) {
  const matches = bornRows.map((born, bornRecordingIndex) => {
    const candidates = [];
    for (let contactIndex = 0; contactIndex < recording.contacts.length; contactIndex += 1) {
      const group = recording.contacts[contactIndex];
      if (group.simulationTimeMs !== born.simulationTimeMs) continue;
      const contacts = group.payload.contacts || [];
      for (const foot of contacts) {
        if (foot.position?.x !== born.payload.position?.x || foot.position?.y !== born.payload.position?.y) continue;
        const response = group.responses?.find(row => row.legId === foot.legId);
        if (response && response.position?.x === foot.position.x && response.position?.y === foot.position.y) {
          candidates.push({ bornRecordingIndex, contactIndex, simulationTimeMs: group.simulationTimeMs,
            legId: foot.legId, group, foot, response, born });
        }
      }
    }
    assert.equal(candidates.length, 1, 'each P1 strike must map to exactly one same-time FOOT_CONTACT leg response');
    const match = candidates[0];
    assert.equal(match.born.payload.layerId, match.born.payload.plateId);
    assert.equal(match.born.payload.plateId, 'trail-plate-1');
    assert.equal(match.born.payload.footprintRadius, clamp(Number(match.response.footprintRadius), 0.009, 0.014));
    assert.equal(match.born.payload.hardness, clamp(Number(match.response.hardness), 0, 1));
    return match;
  });
  const byGroup = new Map();
  for (const match of matches) {
    const list = byGroup.get(match.contactIndex) || [];
    list.push(match); byGroup.set(match.contactIndex, list);
  }
  for (const [contactIndex, routes] of byGroup) {
    const group = recording.contacts[contactIndex];
    const feet = (group.payload.contacts || []).filter(foot => {
      const response = group.responses?.find(row => row.legId === foot.legId);
      return response && Number.isFinite(Number(response.strengthTransfer))
        && Number.isFinite(Number(response.footprintRadius));
    });
    const norm = Math.sqrt(routes.reduce((sum, route) => sum
      + clamp(Number(route.response.strengthTransfer), 0.95, 1.05) ** 2, 0));
    const scale = Math.min(1, Math.sqrt(feet.length) / norm);
    const perFoot = Math.min(0.05, Number(group.payload.strength)) / Math.sqrt(feet.length);
    for (const route of routes) {
      const expected = perFoot * clamp(Number(route.response.strengthTransfer), 0.95, 1.05) * scale;
      assert.ok(Math.abs(route.born.payload.strength - expected) < 1e-12,
        'P1 strike strength must equal the production group/foot/response mapping');
    }
  }
  return matches;
}

function assertProductionLegacyMapping(contact, legacy) {
  const feet = contact.payload.contacts;
  const x = feet.reduce((sum, row) => sum + row.position.x, 0) / feet.length;
  const y = feet.reduce((sum, row) => sum + row.position.y, 0) / feet.length;
  const scale = 0.92 / Math.sqrt(2);
  const expectedX = (clamp(x, 0, 1) * 2 - 1) * scale;
  const expectedY = (clamp(y, 0, 1) * 2 - 1) * scale;
  const expectedStrength = clamp(Number(contact.payload.strength), 0, 0.05);
  assert.ok(Math.abs(legacy.payload.position.x - expectedX) < 1e-12);
  assert.ok(Math.abs(legacy.payload.position.y - expectedY) < 1e-12);
  assert.equal(legacy.payload.strength, expectedStrength);
}

function instrumentPlate(source) {
  source = source.replace(/\r\n/g, '\n');
  source = source.replace('    super();', '    super(); const schedule=options.processorOptions.evidenceSchedule; this.__evFrame=0; this.__evEnd=schedule.endFrame; this.__evEvents=schedule.events; this.__evCursor=0; this.__evInjected=0; this.__evDone=false; this.__evReady=false; this.__evReceipts=[];');
  source = source.replace('    if (this.destroyed) return false;', "    if (this.destroyed) return false;\n    if (!this.__evReady) { this.__evReady=true; this.port.postMessage({type:'evidence-ready',frame:this.__evFrame,endFrame:this.__evEnd,scheduled:this.__evEvents.length}); }");
  source = source.replace('    const channels = outputs[0];', "    const channels = outputs[0];\n    while(this.__evCursor<this.__evEvents.length && this.__evEvents[this.__evCursor].frame<=this.__evFrame) { const event=this.__evEvents[this.__evCursor++]; this.applyStrike(event.payload); this.__evInjected++; this.__evReceipts.push({requestedFrame:event.frame,actualFrame:this.__evFrame}); }");
  source = source.replace("    if (!this.active) {\n      for (const channel of channels) channel.fill(0);\n      return true;\n    }", "    if (!this.active) {\n      for (const channel of channels) channel.fill(0);\n      this.__evFrame += output.length;\n      if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',injected:this.__evInjected,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,receipts:this.__evReceipts}); }\n      return true;\n    }");
  source = source.replace('    return true;\n  }\n}', "    this.__evFrame += output.length;\n    if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',injected:this.__evInjected,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,receipts:this.__evReceipts}); }\n    return true;\n  }\n}");
  assert.ok(source.includes("type:'evidence-ready',frame:") && source.includes("type:'evidence-done'"),
    'generic Plate worklet scheduler instrumentation anchors');
  return source;
}

function instrumentSurface(source) {
  source = source.replace(/\r\n/g, '\n');
  source = source.replace('  constructor() {', '  constructor(options) {');
  source = source.replace('    super();', '    super(); const schedule=options.processorOptions.evidenceSchedule; this.__evFrame=0; this.__evEnd=schedule.endFrame; this.__evEvents=schedule.events; this.__evCursor=0; this.__evDone=false; this.__evReady=false;');
  source = source.replace('    this.port.onmessage = (event) => this.handleMessage(event.data);', "    this.port.onmessage = (event) => this.handleMessage(event.data);\n    this.handleMessage({type:'topology',payload:options.processorOptions.evidenceTopology});");
  source = source.replace('    if (this.destroyed) return false;', "    if (this.destroyed) return false;\n    if (!this.__evReady) { this.__evReady=true; this.port.postMessage({type:'evidence-ready',frame:this.__evFrame,endFrame:this.__evEnd,scheduled:this.__evEvents.length}); }");
  source = source.replace('    if (!this.topology) return true;', "    if (!this.topology) { this.__evFrame += left.length; if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',strikes:this.telemetry.strikes,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,diagnostics:this.getDiagnostics?.()||null}); } return true; }");
  source = source.replace('    for (let frame = 0; frame < left.length; frame++) {', "    for (let frame = 0; frame < left.length; frame++) {\n      while(this.__evCursor<this.__evEvents.length && this.__evEvents[this.__evCursor].frame<=this.__evFrame)this.handleMessage(this.__evEvents[this.__evCursor++].message); this.__evFrame++;");
  source = source.replace('    return true;\n  }\n\n  advancePhysics()', "    if (!this.__evDone && this.__evEnd>0 && this.__evFrame>=this.__evEnd) { this.__evDone=true; this.port.postMessage({type:'evidence-done',strikes:this.telemetry.strikes,scheduled:this.__evEvents.length,renderedFrames:this.__evFrame,diagnostics:this.getDiagnostics?.()||null}); }\n    return true;\n  }\n\n  advancePhysics()");
  assert.ok(source.includes("type:'evidence-ready',frame:") && source.includes('payload:options.processorOptions.evidenceTopology')
    && source.includes("type:'evidence-done'"), 'surface Plate scheduler instrumentation anchors');
  return source;
}

async function renderVisuals({ page, out, startMs, events, tracks }) {
  const result = await page.evaluate(async input => {
    const { decodeStereoFloatWav, buildStratigraphyAudioOverview, renderStratigraphyAudioZooms } =
      await import('/scripts/stratigraphy-audio-overview.js');
    const { buildStratigraphyAudioSnapshot, renderStratigraphyAudioComparison } =
      await import('/scripts/audio-snapshot-renderer.js');
    const encode = canvas => canvas.toDataURL('image/png').split(',')[1];
    const decodeBytes = encoded => {
      const binary = atob(encoded), bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return decodeStereoFloatWav(bytes);
    };
    const images = [], configuredRows = [], rawRows = [];
    for (const track of input.tracks) {
      const configured = decodeBytes(track.configured), raw = decodeBytes(track.raw);
      const overview = buildStratigraphyAudioOverview({ channels: configured.channels, sampleRate: 48000,
        simulationDurationSeconds: 10, clockAnchors: [{ simulationTimeMs: 0, audioSampleIndex: 0 },
          { simulationTimeMs: 10000, audioSampleIndex: configured.sampleCount }], events: input.events });
      const canvas = document.createElement('canvas');
      renderStratigraphyAudioZooms(canvas, overview, [0]);
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, 34);
      context.fillStyle = '#111'; context.font = '15px sans-serif';
      context.fillText(track.label + ' · P1 birth ' + input.startMs.toFixed(3) + ' ms · audio 0–10 s', 14, 23);
      images.push({ file: track.key + '-configured-fixed-scale-events.png', png: encode(canvas) });
      const configuredSnapshot = buildStratigraphyAudioSnapshot(configured.channels, { sampleRate: 48000, sourceDurationSeconds: 10 });
      configuredSnapshot.label = track.label; configuredRows.push({ label: track.label, snapshot: configuredSnapshot });
      const rawSnapshot = buildStratigraphyAudioSnapshot(raw.channels, { sampleRate: 48000, sourceDurationSeconds: 10 });
      rawSnapshot.label = track.label + ' · raw worklet'; rawRows.push({ label: rawSnapshot.label, snapshot: rawSnapshot });
    }
    for (const [name, rows] of [['configured-fixed-scale-comparison.png', configuredRows],
      ['raw-worklet-fixed-scale-comparison.png', rawRows]]) {
      const canvas = document.createElement('canvas');
      renderStratigraphyAudioComparison(canvas, rows);
      images.push({ file: name, png: encode(canvas) });
    }
    return { images, renderer: { detailPreset: 'ant-surface-stratigraphy-v1',
      comparisonPreset: 'ant-surface-stratigraphy-v1', waveformAmplitude: [-1, 1],
      fftSize: 1024, window: 'Hann', hopSize: 256, frequencyHz: [0, 8000],
      dbfs: [-100, 0], grayscaleGamma: 1, normalization: 'none; fixed-scale',
      eventMarkers: '44 unique matched FOOT_CONTACT groups plus P1 birth at audio 0 s' } };
  }, { startMs, events, tracks: tracks.map(track => ({ key: track.key, label: track.label,
    configured: Buffer.from(track.configured).toString('base64'), raw: Buffer.from(track.raw).toString('base64') })) });
  const images = [];
  for (const image of result.images) {
    const bytes = Buffer.from(image.png, 'base64');
    await writeFile(resolve(out, image.file), bytes);
    images.push({ file: image.file, bytes: bytes.length, sha256: sha(bytes) });
  }
  return { renderer: result.renderer, images };
}

function multiplicitySummary(matches) {
  const counts = new Map();
  for (const row of matches) counts.set(row.contactIndex, (counts.get(row.contactIndex) || 0) + 1);
  const distribution = {};
  for (const value of counts.values()) distribution[value] = (distribution[value] || 0) + 1;
  return { groupsByAcceptedP1StrikeCount: distribution, uniqueGroups: counts.size,
    extraP1StrikesFromSharedGroups: matches.length - counts.size };
}
function toFrame(timeMs, startMs) { return Math.max(0, Math.min(479999, Math.round((timeMs - startMs) * 48))); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function encodeFloatWav(left, right) {
  const bytes = Buffer.alloc(44 + left.length * 8);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(3, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(48000, 24); bytes.writeUInt32LE(48000 * 8, 28); bytes.writeUInt16LE(8, 32); bytes.writeUInt16LE(32, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(left.length * 8, 40);
  for (let i = 0, offset = 44; i < left.length; i += 1, offset += 8) {
    bytes.writeFloatLE(left[i], offset); bytes.writeFloatLE(right[i], offset + 4);
  }
  return bytes;
}
function measure(left, right) {
  let sum = 0, peak = 0, nonFiniteSamples = 0, clippingSamples = 0;
  const channel = values => {
    let squareSum = 0, channelPeak = 0;
    for (const value of values) {
      if (!Number.isFinite(value)) { nonFiniteSamples += 1; continue; }
      squareSum += value * value; channelPeak = Math.max(channelPeak, Math.abs(value));
      if (Math.abs(value) >= 1) clippingSamples += 1;
    }
    const rms = Math.sqrt(squareSum / values.length);
    sum += squareSum; peak = Math.max(peak, channelPeak);
    return { peak: channelPeak, peakDbfs: dbfs(channelPeak), rms, rmsDbfs: dbfs(rms) };
  };
  const leftMetrics = channel(left), rightMetrics = channel(right);
  const rms = Math.sqrt(sum / (left.length + right.length));
  return { sampleRate: 48000, samplesPerChannel: left.length, durationSeconds: left.length / 48000,
    peak, peakDbfs: dbfs(peak), rms, rmsDbfs: dbfs(rms), left: leftMetrics, right: rightMetrics,
    nonFiniteSamples, clippingSamples, clippingThreshold: '|sample| >= 1' };
}
function pooledRms(left, right, start, length) {
  let sum = 0;
  for (let i = start; i < start + length; i += 1) sum += left[i] * left[i] + right[i] * right[i];
  return Math.sqrt(sum / (length * 2));
}
function branchError(raw, configured, gain) {
  let maxAbs = 0;
  for (let i = 0; i < raw.sampleCount; i += 1) {
    maxAbs = Math.max(maxAbs,
      Math.abs(raw.channels.left[i] * gain - configured.channels.left[i]),
      Math.abs(raw.channels.right[i] * gain - configured.channels.right[i]));
  }
  return maxAbs;
}
function dbfs(value) { return 20 * Math.log10(Math.max(1e-30, value)); }
function dbRatio(a, b) { return 20 * Math.log10(a / b); }
function median(sorted) { return sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
  : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2; }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function makeReadme(report) {
  const d = report.measurements.decomposition;
  return '# Event-count matched substrate vs born P1\n\n'
    + 'Frozen seed 20261005, P1 ' + report.source.firstPlateId + ' at '
    + report.source.firstPlateBirthSeconds + ' s. The exact 63 accepted P1 strike schedule is replayed. Those 63 foot-level accepts map to '
    + report.eventMapping.uniqueMatchedContactGroups + ' unique source FOOT_CONTACT groups; the production generic substrate receives one centroid/strength event per group. No duplicate generic events were fabricated.\n\n'
    + '- Born P1 configured and direct pre-bridge worklet stems are newly rendered. Configured born PCM matches the existing frozen stem exactly.\n'
    + '- Matched generic substrate uses the original legacy payload for each unique parent contact group. The existing all-events substrate WAV remains unchanged; its pre-gain raw level is derived by division by the fixed static bridge gain.\n'
    + '- Waveform/spectrogram output reuses the repository fixed-scale renderers: ±1 waveform, 1024 Hann FFT, 256 hop, 0–8 kHz, −100…0 dBFS, gamma 1, no normalization.\n'
    + '- Results decompose matched-parent-group subset versus all events (' + d.matchedVsAllEventSubstrateLevelDeltaDb.toFixed(3)
    + ' dB), matched substrate raw versus born raw (' + d.matchedSubstrateVsBornRawWorkletLevelDeltaDb.toFixed(3)
    + ' dB), and configured output gain delta (' + d.configuredGainSubstrateRelativeToBornDb.toFixed(3)
    + ' dB). Raw substrate-vs-born also includes group-centroid/strength versus per-foot input mapping and different worklet paths. Generic Plate PCM may vary from the unchanged production strike jitter even when schedule hashes match; this is not a psychoacoustic masking test.\n\n'
    + 'See [event-count-matched-report.json](event-count-matched-report.json) for schedules, hashes, receipts, per-channel and pooled RMS/peak, event-aligned medians, finite/clipping checks, gains and plots.\n';
}
