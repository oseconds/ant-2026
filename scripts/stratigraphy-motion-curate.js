import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const runDir = resolve(process.argv[2] || 'test-results/stratigraphy-motion-2026-10-06T05-30-53-880Z');
const passDir = resolve('docs/ant/evidence/2026-10-06-stratigraphy-runtime');
const motionDir = resolve(passDir, 'motion');
const lifeDir = resolve(passDir, 'lifecycle');
await Promise.all([mkdir(motionDir, { recursive: true }), mkdir(lifeDir, { recursive: true })]);
const name = 'continuous-natural-0-600s';
const run = JSON.parse(await readFile(resolve(runDir, `${name}.json`), 'utf8'));
const anchors = run.clockAnchors;
const sourcePcmBytes = await readFile(resolve(runDir, `${name}.wav`));
const decodedFrames = (await import('./stratigraphy-audio-overview.js')).decodeStereoFloatWav(sourcePcmBytes).sampleCount;
const exec = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const duration = 20;
const secondsToSample = sec => {
  const ms = sec * 1000;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    if (ms <= b.simulationTimeMs) return Math.min(decodedFrames,
      Math.round(a.audioSampleIndex + (ms - a.simulationTimeMs) * (b.audioSampleIndex - a.audioSampleIndex) / (b.simulationTimeMs - a.simulationTimeMs)));
  }
  return decodedFrames;
};
const sampleToSim = sample => {
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    if (sample <= b.audioSampleIndex) return (a.simulationTimeMs + (sample - a.audioSampleIndex) * (b.simulationTimeMs - a.simulationTimeMs) / (b.audioSampleIndex - a.audioSampleIndex)) / 1000;
  }
  return run.simulationDurationSeconds;
};
const windows = [
  { key: 'opening', simStart: 0, label: 'opening colony movement' },
  { key: 'first-plate', simStart: 119.0166583555, label: 'first natural Plate birth window' },
  { key: 'multi-z', simStart: 194.0166666666, label: 'natural overlapping Plates / multi-Z' },
  { key: 'first-sphere', simStart: 246.6499999999, label: 'first natural buried Sphere nodule' },
  { key: 'plate-24', simStart: 462.0166319446, label: '24th natural Plate birth' },
  { key: 'late-stack', simStart: 580.2166666667, label: 'late mature stratigraphy' }
];
const getTime = (args) => exec(ffmpeg, args, { maxBuffer: 16 * 1024 * 1024 });
const outputClips = [];
const wallRatio = run.wallDurationSeconds / run.simulationDurationSeconds;
for (const clip of windows) {
  const videoStart = clip.simStart * wallRatio;
  const simEnd = Math.min(run.simulationDurationSeconds, clip.simStart + duration);
  const audioStartSample = secondsToSample(clip.simStart);
  const audioEndSample = secondsToSample(simEnd);
  const audioMappedStart = sampleToSim(audioStartSample);
  const audioMappedEnd = sampleToSim(audioEndSample);
  const videoPath = resolve(motionDir, `${clip.key}-motion-20s.webm`);
  const audioPath = resolve(motionDir, `${clip.key}-mapped-original-audio.wav`);
  await getTime(['-y', '-hide_banner', '-loglevel', 'warning', '-ss', videoStart.toFixed(6), '-i', resolve(runDir, `${name}-video.webm`), '-t', duration.toFixed(3), '-an', '-vf', 'fps=24,scale=640:640', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-crf', '40', '-b:v', '0', '-row-mt', '1', '-threads', '4', videoPath]);
  await getTime(['-y', '-hide_banner', '-loglevel', 'error', '-i', resolve(runDir, `${name}.wav`), '-map', '0:a:0', '-af', `atrim=start_sample=${audioStartSample}:end_sample=${audioEndSample},asetpts=PTS-STARTPTS`, '-c:a', 'pcm_f32le', audioPath]);
  const sideEvents = run.events.filter(e => e.type === 'FOOT_CONTACT' && e.simulationTimeMs >= clip.simStart * 1000 && e.simulationTimeMs <= simEnd * 1000);
  outputClips.push({ ...clip, videoSimulationStart: clip.simStart, videoSimulationEnd: simEnd, videoStartSeconds: videoStart, videoDurationSeconds: duration,
    audioStartSample, audioEndSample, audioDurationSeconds: (audioEndSample - audioStartSample) / run.browserSampleRate,
    audioMappedSimulationStart: audioMappedStart, audioMappedSimulationEnd: audioMappedEnd,
    footContactGroups: sideEvents.length, individualFootContacts: sideEvents.reduce((n, e) => n + (e.payload?.contacts?.length || 0), 0),
    videoFile: videoPath.replaceAll('\\', '/'), audioFile: audioPath.replaceAll('\\', '/') });
}
await copyFile(resolve(runDir, `${name}-audio.webm`), resolve(motionDir, `${name}-audio.webm`));
await copyFile(resolve(runDir, `${name}-start.png`), resolve(motionDir, `${name}-start.png`));
await copyFile(resolve(runDir, `${name}-end.png`), resolve(motionDir, `${name}-end.png`));
await copyFile(resolve(runDir, `${name}-paused-audio-lifecycle.json`), resolve(lifeDir, `${name}-paused-audio-lifecycle.json`));

const source = resolve(runDir, `${name}-browser-evidence.json`);
const archive = resolve(motionDir, `${name}-browser-evidence.json.gz`);
await new Promise((resolvePromise, reject) => createReadStream(source).pipe(createGzip({ level: 9 })).pipe(createWriteStream(archive)).on('finish', resolvePromise).on('error', reject));
async function sha256(path) {
  return new Promise((resolvePromise, reject) => { const hash = createHash('sha256'); createReadStream(path).on('data', chunk => hash.update(chunk)).on('error', reject).on('end', () => resolvePromise(hash.digest('hex'))); });
}
const sourceFiles = ['continuous-natural-0-600s-video.webm', 'continuous-natural-0-600s-audio.webm', 'continuous-natural-0-600s.wav', 'continuous-natural-0-600s-browser-evidence.json'];
const hashes = {};
for (const file of sourceFiles) hashes[file] = { bytes: (await stat(resolve(runDir, file))).size, sha256: await sha256(resolve(runDir, file)) };
const manifest = { status: 'curated', run: { seed: run.seed, simulationDurationSeconds: run.simulationDurationSeconds, wallDurationSeconds: run.wallDurationSeconds,
  browserAudioDurationSeconds: decodedFrames / run.browserSampleRate, browserSampleRate: run.browserSampleRate, volume: run.end.volume, outputGain: run.end.outputGain,
  decodedAudioNativeFrameCount: decodedFrames,
  terminalAnchorSampleIndex: anchors.at(-1).audioSampleIndex,
  terminalDecoderShortfallFrames: Math.max(0, anchors.at(-1).audioSampleIndex - decodedFrames),
  terminalDecoderShortfallSeconds: Math.max(0, anchors.at(-1).audioSampleIndex - decodedFrames) / run.browserSampleRate,
  audioClockNote: 'The actual Web Audio context advances more slowly than the browser simulation/wall clock. Video clips retain 20 s of motion; matching original PCM segments use the captured nonuniform anchor map and therefore have variable, shorter durations. If the final media decoder yields fewer frames than the final AudioContext anchor, audio endpoints clamp to the decoded PCM boundary and the decoder shortfall is reported. No audio resampling, padding, timeline retiming, or forced milestones were applied.' },
  sourcesInIgnoredTestResults: hashes, curatedAudio: `${name}-audio.webm`, clips: outputClips,
  lifecycleArtifact: `${name}-paused-audio-lifecycle.json`, rawEventAnchorArchive: `${name}-browser-evidence.json.gz`,
  contactMeaning: 'FOOT_CONTACT groups are event callbacks; individual feet are the sum of payload.contacts lengths.' };
await writeFile(resolve(motionDir, `${name}-curated-manifest.json`), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ motionDir, lifeDir, clips: outputClips.map(({ key, audioDurationSeconds, footContactGroups, individualFootContacts }) => ({ key, audioDurationSeconds, footContactGroups, individualFootContacts })), hashes }, null, 2));
