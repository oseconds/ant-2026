import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { AntController } from '../src/lib/agents/ant/AntController.js';
import { AntEnvironmentAudioBridge } from '../src/lib/audio/AntEnvironmentAudioBridge.js';

const out = resolve('docs/ant/evidence/2026-10-26-g-native-av-observation/attempt-02');
const json = async name => JSON.parse(await readFile(resolve(out, name), 'utf8'));
const packed = async name => JSON.parse(gunzipSync(await readFile(resolve(out, name))).toString());
const c = await json('capture.json'), sidecar = await packed('sidecar.json.gz'), final = await packed('world-final.json.gz');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const webm = await readFile(resolve(out, 'native-av.webm'));
const wav = gunzipSync(await readFile(resolve(out, 'native-stereo-f32.wav.gz')));
assert.equal(sha256(webm), c.assets.webm.sha256);
assert.equal(sha256(wav), c.assets.floatWav.sha256);
assert.equal(wav.readUInt16LE(20), 3);
assert.equal(wav.readUInt16LE(22), 2);
assert.equal(wav.readUInt32LE(24), c.conditions.sampleRate);
assert.equal((wav.length - 44) / 8, c.pcmStop.frames);
assert.equal(c.pcmStop.endFrame - c.pcmStop.firstFrame, c.pcmStop.frames);
assert.ok(final.ticks <= 10800);
assert.ok((c.end.performanceMs - c.start.performanceMs) / 1000 <= 241, 'wall watchdog tolerance');
assert.equal(execFileSync('git', ['diff', c.baseline, '--', 'src', 'static'], { encoding: 'utf8' }).trim(), '');

// World-only replay: no AudioWorklet physics or PCM rendering is performed.
let rngState = c.seed >>> 0, rngCalls = 0;
const random = () => { rngCalls++; rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 4294967296; };
const strikes = [], contacts = [];
const bridge = new AntEnvironmentAudioBridge({ audioEngine: { context: { currentTime: 0 } },
  workletFactory: () => ({ node: { port: { postMessage(message) {
    if (message.type === 'strike') strikes.push(structuredClone(message.payload));
  } } }, disconnect() {} }) });
const model = new AntController({ random, state: c.conditions.modelState, audioBridge: bridge });
await model.init(); await model.setAudioEnabled(true);
model.subscribe(event => {
  if (event.type !== 'foot-contact') return;
  const p = event.payload;
  for (const contact of p.contacts) {
    const { x, y } = contact.position;
    if (x < 0 || x > 1 || y < 0 || y > 1) continue;
    contacts.push({ simulationTimeMs: p.simulationTimeMs, antId: p.antId, contactGroup: p.contactGroup, legId: contact.legId, x, y });
  }
});
for (let tick = 0; tick < final.ticks; tick++) model.tick(1 / 60);
const snapshot = model.getSnapshot(); snapshot.audio.diagnostics = null;
function compareValues(actual, expected) {
  const result = { exact: true, numericDifferences: 0, otherDifferences: 0, maximumAbsoluteDifference: 0, examples: [] };
  function visit(a, b, path) {
    if (Object.is(a, b)) return;
    if (typeof a === 'number' && typeof b === 'number') {
      result.exact = false; result.numericDifferences++;
      result.maximumAbsoluteDifference = Math.max(result.maximumAbsoluteDifference, Math.abs(a - b));
      if (result.examples.length < 4) result.examples.push({ path, actual: a, expected: b });
    } else if (a && b && typeof a === 'object' && typeof b === 'object') {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) visit(a[key], b[key], `${path}.${key}`);
    } else { result.exact = false; result.otherDifferences++; }
  }
  visit(actual, expected, 'root'); return result;
}
const crossEngine = { node: process.version, chrome: c.browser,
  world: compareValues(JSON.parse(JSON.stringify({ simulationTimeMs: model.simulationTimeMs, snapshot })), final.fingerprint),
  contacts: compareValues(contacts, sidecar.events.map(({ simulationTimeMs, antId, contactGroup, legId, x, y }) =>
    ({ simulationTimeMs, antId, contactGroup, legId, x, y }))),
  strikes: compareValues(strikes, sidecar.posts.map(post => post.payload)),
  interpretation: 'Cross-runtime/compiled-path comparison is not exact and is not used as the observer parity gate. No numeric tolerance is substituted for exact same-Chrome parity.' };
await writeFile(resolve(out, 'CROSS-ENGINE-COMPARISON.json'), JSON.stringify(crossEngine, null, 2) + '\n');
assert.deepEqual({ state: rngState, calls: rngCalls }, final.rng);
const sameEngine = await json('BROWSER-PARITY.json');
assert.ok(sameEngine.worldFingerprintExact && sameEngine.rngExact && sameEngine.contactOrderAndValuesExact && sameEngine.actualStrikePayloadOrderExact);
assert.ok(sidecar.posts.every((p, i) => p.postOrder === i + 1 && (!i || p.performanceTimeMs >= sidecar.posts[i - 1].performanceTimeMs)));
await model.destroy();

const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries',
  'stream=index,codec_type,codec_name,sample_rate,channels,start_time,nb_read_frames,duration:format=duration',
  '-of', 'json', resolve(out, 'native-av.webm')], { encoding: 'utf8' }));
assert.equal(probe.streams.filter(s => s.codec_type === 'video' && s.codec_name === 'vp8').length, 1);
assert.equal(probe.streams.filter(s => s.codec_type === 'audio' && s.codec_name === 'opus' && s.channels === 2 && Number(s.sample_rate) === c.conditions.sampleRate).length, 1);
const videoTimes = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_frames',
  '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'csv=p=0', resolve(out, 'native-av.webm')],
{ encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim().split(/\r?\n/).map(Number).filter(Number.isFinite);
const frameGaps = videoTimes.slice(1).map((time, i) => time - videoTimes[i]);
assert.ok(videoTimes.length > 1 && frameGaps.every(gap => gap > 0), 'Video timestamps must advance');
const indexReceipt = await json('MEDIA-INDEX.json');
assert.equal(sha256(await readFile(resolve(out, indexReceipt.indexed))), indexReceipt.indexedSha256);
assert.equal(sha256(webm), indexReceipt.sourceSha256);
const packets = name => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_packets', '-show_data_hash', 'sha256',
  '-show_entries', 'packet=stream_index,pts_time,dts_time,duration_time,data_hash', '-of', 'json', resolve(out, name)],
{ encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })).packets;
const rawPackets = packets('native-av.webm'), indexedPackets = packets(indexReceipt.indexed);
for (const stream of [0, 1]) {
  const select = rows => rows.filter(p => p.stream_index === stream).map(({ pts_time, dts_time, data_hash }) => ({ pts_time, dts_time, data_hash }));
  assert.deepEqual(select(rawPackets), select(indexedPackets), 'Stream-copy packet payloads and timestamps must match');
}
const wallSeconds = (c.end.performanceMs - c.start.performanceMs) / 1000;
const audioSeconds = c.end.audioSeconds - c.start.audioSeconds;
const modelSeconds = (c.end.modelMs - c.start.modelMs) / 1000;
const residuals = c.anchors.map(a => ({ wallSeconds: (a.performanceMs - c.start.performanceMs) / 1000,
  audioSeconds: a.audioSeconds - c.start.audioSeconds, modelSeconds: (a.modelMs - c.start.modelMs) / 1000 }));
for (const r of residuals) { r.audioDeficitSeconds = r.wallSeconds - r.audioSeconds; r.modelDeficitSeconds = r.wallSeconds - r.modelSeconds; }
const calibration = ['tap-off-empty-topology', 'tap-on-empty-topology'].map(phase => {
  const a = c.calibration.filter(row => row.phase === phase), first = a[0], last = a.at(-1);
  const raf = c.rafTimes.filter(t => t >= first.performanceMs && t <= last.performanceMs);
  const gaps = raf.slice(1).map((t, i) => t - raf[i]);
  const residuals = a.map(x => (x.performanceMs - first.performanceMs) / 1000 - (x.audioSeconds - first.audioSeconds));
  return { phase, wallSeconds: (last.performanceMs - first.performanceMs) / 1000,
    audioSeconds: last.audioSeconds - first.audioSeconds, rafFrames: raf.length,
    residualScatterSeconds: Math.max(...residuals) - Math.min(...residuals),
    maxRafGapMs: Math.max(...gaps), meanRafGapMs: gaps.reduce((a, b) => a + b, 0) / gaps.length };
});
// Startup delayed the first audio quantum. Preserve the executed gate, then apply a stricter steady-state audit.
const posthocBudget = calibration.find(p => p.phase === 'tap-on-empty-topology').residualScatterSeconds + 256 / c.conditions.sampleRate;
const reasons = [];
if (c.errors.length || c.pageErrors.length) reasons.push('page/audio/recorder errors');
if (c.pcmStop.gapFrames || c.pcmStop.nonStereoBlocks) reasons.push('PCM gap/non-stereo input');
if (c.anchors.some(a => a.visible !== 'visible' || !a.focused || a.state !== 'running')) reasons.push('foreground/context validity');
if (c.stopReason.includes('deficit') || c.stopReason.includes('error') || c.stopReason.includes('foreground')) reasons.push(c.stopReason);
if (Math.max(...residuals.map(r => r.audioDeficitSeconds)) > posthocBudget) reasons.push('audio residual exceeds stricter steady-state posthoc tolerance in a sampled interval');
if (c.diagnostics.some(d => d.payload.dropped || d.payload.droppedRoutes || d.payload.nonFinite)) reasons.push('worklet dropped/non-finite telemetry');
const report = { baseline: c.baseline, stopReason: c.stopReason,
  worldParity: { engine: 'same Chrome and same compiled production bundle', fingerprintExact: true, rngExact: true, validFootResponsesExact: true, actualStrikePayloadOrderExact: true,
    ticks: final.ticks, footResponses: contacts.length, actualStrikePosts: strikes.length, pcmRenderPerformed: false },
  clock: { wallSeconds, modelSeconds, audioSeconds, audioWallRatio: audioSeconds / wallSeconds,
    modelWallRatio: modelSeconds / wallSeconds, executedRuntimeToleranceSeconds: c.clockToleranceSeconds,
    stricterPosthocToleranceSeconds: posthocBudget,
    calibrationCorrection: 'Original runtime gate included audio startup transient. It is retained as executed; acceptance uses the stricter tap-on steady residual scatter plus two 128-frame quanta.',
    maximumSampledAudioDeficitSeconds: Math.max(...residuals.map(r => r.audioDeficitSeconds)),
    maximumSampledModelDeficitSeconds: Math.max(...residuals.map(r => r.modelDeficitSeconds)),
    asynchronousDiagnostics: 'request/receipt bracket retained; cached counters are not simultaneous anchors', residuals },
  recording: { pcmFrames: c.pcmStop.frames, pcmSeconds: c.pcmStop.frames / c.conditions.sampleRate,
    pcmGapFrames: c.pcmStop.gapFrames, nonStereoBlocks: c.pcmStop.nonStereoBlocks, probe,
    videoFrames: videoTimes.length, maximumVideoFrameGapSeconds: Math.max(...frameGaps),
    firstVideoTimestampSeconds: videoTimes[0], lastVideoTimestampSeconds: videoTimes.at(-1),
    containerDurationSeconds: Number.isFinite(Number(probe.format.duration)) ? Number(probe.format.duration) : null,
    rawContainerHasDuration: probe.format.duration !== undefined,
    indexedStreamCopy: { packetPayloadAndPtsDtsExact: true, receipt: 'MEDIA-INDEX.json',
      durationSeconds: indexReceipt.containerDurationSeconds },
    caveat: 'VP8/Opus viewing asset is compressed; separate Float32 PCM is lossless. Clocks do not prove hardware audibility or exact pixel/sample synchronization.' },
  observer: { mainThreadObserverCostMs: sidecar.observerCostMs, wallFraction: sidecar.observerCostMs / (wallSeconds * 1000),
    calibration, caveat: 'Empty-topology calibration is not a loaded-world recorder cost benchmark.' },
  validity: { status: reasons.length ? 'REQUIRES_INTERVAL_REVIEW' : 'NO_RECORDED_VALIDITY_FAILURE', reasons },
  perceptualObservation: 'NOT MEASURED by this technical verifier; obtain human first notes before state interpretation' };
await writeFile(resolve(out, 'VALIDATION.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ worldParity: report.worldParity, clock: { wallSeconds, modelSeconds, audioSeconds }, validity: report.validity }));
