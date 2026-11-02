import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = 'docs/ant/evidence/2026-11-02-material-sketchbook-v0';
const authority = '6dc73380b1985102bc2fb50da8963a7de5a89c71';
const sha256 = data => createHash('sha256').update(data).digest('hex');
async function filesIn(folder) {
  const entries = await readdir(resolve(root, folder), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await filesIn(path));
    else result.push(path);
  }
  return result;
}
const files = [
  '.gitattributes', 'material-sketchbook.html', 'vite.config.js',
  'scripts/material-sketchbook-browser-check.js', 'scripts/material-sketchbook-evidence.js',
  'docs/ant/daily/2026-11-03-material-sketchbook-v0.md',
  ...await filesIn('src/sketchbook'),
  ...(await filesIn('tests')).filter(path => /\/material-sketchbook-[^/]+\.test\.js$/.test(path)),
  ...(await filesIn(evidence)).filter(path => !['manifest.json', 'SHA256SUMS'].includes(path.split('/').at(-1)))
].sort();
const guard = ['src/lib', 'src/demo', 'src/main.js', 'src/app.js', 'src/styles.css', 'static', 'index.html', 'package.json', 'package-lock.json'];
const diff = execFileSync('git', ['diff', authority, '--', ...guard], { cwd: root, encoding: 'utf8' });
assert.equal(diff, '', 'Production source/dependencies changed');
const changedTests = execFileSync('git', ['diff', '--name-only', authority, '--', 'tests'], { cwd: root, encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(Boolean);
assert.ok(changedTests.every(path => /\/material-sketchbook-[^/]+\.test\.js$/.test(path)), 'Existing test changed');
const entries = [];
for (const path of files) {
  const data = await readFile(resolve(root, path));
  entries.push({ path, bytes: data.length, sha256: sha256(data) });
}
const manifestPath = resolve(root, evidence, 'manifest.json');
const sumsPath = resolve(root, evidence, 'SHA256SUMS');
if (process.argv.includes('--write')) {
  await writeFile(manifestPath, `${JSON.stringify({ schema: 'ant-material-sketchbook-evidence-v0', authority, branch: 'codex/ant-material-sketchbook-v0-20261102', productionGuard: guard, files: entries }, null, 2)}\n`);
  const manifestHash = sha256(await readFile(manifestPath));
  await writeFile(sumsPath, `${entries.map(entry => `${entry.sha256}  ${entry.path}`).join('\n')}\n${manifestHash}  ${evidence}/manifest.json\n`);
} else {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.authority, authority);
  assert.deepEqual(manifest.files, entries, 'Manifest content mismatch');
  const manifestHash = sha256(await readFile(manifestPath));
  const expected = `${entries.map(entry => `${entry.sha256}  ${entry.path}`).join('\n')}\n${manifestHash}  ${evidence}/manifest.json\n`;
  assert.equal(await readFile(sumsPath, 'utf8'), expected, 'SHA256SUMS mismatch');
}
console.log(JSON.stringify({ action: process.argv.includes('--write') ? 'write' : 'verify', authority, files: entries.length, productionGuard: 'PASS' }));
