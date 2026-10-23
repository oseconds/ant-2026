import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { makeSpatialController } from './ant-spatial-core.js';
import { runSpatialCase } from './ant-spatial-run.js';

const mode = process.argv[2];
assert.ok(['production', 'dtFeedback'].includes(mode), 'Only the preselected independent movement comparison is allowed.');
const outputDir = resolve(process.argv[3] || `docs/ant/evidence/2026-10-22-spatial-dynamics/long-run/${mode}-20261005`);
await assert.rejects(access(outputDir), 'Refuse to overwrite an existing long-run case.');
const source = await readFile(fileURLToPath(import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const { Controller, receipt } = await makeSpatialController({ movement: mode });
const result = await runSpatialCase({ Controller, receipt, seed: 20261005, seconds: 7200,
  label: `long-${mode}-north-production-field`, output: resolve(outputDir, 'result.json') });
assert.equal(sha(await readFile(fileURLToPath(import.meta.url))), sha(source));
await mkdir(resolve(outputDir, 'source-snapshot'), { recursive: true });
await writeFile(resolve(outputDir, 'source-snapshot/scripts__ant-spatial-long.js'), source, { flag: 'wx' });
await writeFile(resolve(outputDir, 'receipt.json'), JSON.stringify({ seed: 20261005, movement: mode,
  requestedSeconds: 7200, actualModelSeconds: result.modelSeconds, wallSeconds: result.wallSeconds,
  maxPlateCapacity: 256, sourceSha256: sha(source), final: result.final,
  scope: 'Accelerated natural model with default storage cap, unchanged field/recruitment/selector and no audio. This is not a browser soak or combined candidate.',
  checkpoints: result.checkpoints.map(point => ({ second: point.second, material: point.material }))
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ mode, outputDir, modelSeconds: result.modelSeconds, wallSeconds: result.wallSeconds, final: result.final }));
