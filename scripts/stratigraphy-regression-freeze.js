import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const startingHead = 'd281d341f5abe68ff98ca4cbf837838c7b7b45a2';
const protectedFiles = [
  'src/lib/agents/ant/AntAgent.js', 'src/lib/agents/ant/LocalOccupancy.js',
  'src/lib/agents/ant/GaitController.js', 'src/lib/agents/ant/BodyPoseController.js',
  'src/lib/agents/ant/GasterDeposition.js', 'src/lib/agents/ant/PheromoneField.js',
  'src/lib/agents/ant/ColonyActivation.js', 'src/lib/agents/ant/SurfaceField.js',
  'src/lib/audio/AntAudioBridge.js', 'src/lib/audio/AudioEngine.js',
  'src/lib/models/WorkletModel.js', 'src/lib/models/plate/PlateModel.js',
  'src/lib/models/sphere/SphereModel.js', 'src/lib/models/sphere/materials.js',
  'src/lib/models/string/StringModel.js', 'static/worklets/plate.worklet.js',
  'static/worklets/sphere.worklet.js'
];
const normalize = (text) => text.replace(/\r\n/g, '\n');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const sources = [];
for (const path of protectedFiles) {
  const baseline = normalize(execFileSync('git', ['show', `${startingHead}:${path}`], { encoding: 'utf8' }));
  const current = normalize(await readFile(path, 'utf8'));
  sources.push({ path, baselineSha256: hash(baseline), currentSha256: hash(current), identical: baseline === current });
}
const historicalDirectories = [
  'docs/ant/evidence/2026-10-05-integrated-refinement/',
  'docs/ant/evidence/2026-10-05-surface-plates/'
];
const historicalChanges = execFileSync('git', ['diff', '--name-only', startingHead, '--', ...historicalDirectories],
  { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const report = { startingHead, checkedAtUtc: new Date().toISOString(),
  normalization: 'CRLF to LF for source comparison only; historical binary diff uses Git',
  sources, historicalChanges, passed: sources.every((source) => source.identical) && !historicalChanges.length };
const directory = 'docs/ant/evidence/2026-10-06-stratigraphy-runtime';
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/regression-freeze.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, protectedFiles: sources.length, historicalChanges }));
if (!report.passed) process.exitCode = 1;
