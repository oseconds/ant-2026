import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = 'docs/ant/evidence/2026-11-09-material-sketchbook-v1';
const base = '150dc23f3252c201d18906f1b71570aeea552a7d';
const main = '6dc73380b1985102bc2fb50da8963a7de5a89c71';
const sha = data => createHash('sha256').update(data).digest('hex');
async function filesIn(folder) {
  const files = [];
  for (const entry of await readdir(resolve(root, folder), { withFileTypes: true })) {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesIn(path)); else files.push(path);
  }
  return files;
}
const allowed = path => ['.gitattributes', 'vite.config.js', 'material-sketchbook-v1.html', 'docs/ant/daily/2026-11-09-material-sketchbook-v1.md'].includes(path)
  || path.startsWith('src/sketchbook-v1/') || path.startsWith(`${evidence}/`)
  || /^scripts\/material-sketchbook-v1-[^/]+\.js$/.test(path)
  || /^tests\/material-sketchbook-v1-[^/]+\.test\.js$/.test(path);
const changed = execFileSync('git', ['diff', '--name-only', base], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
assert.ok(changed.every(allowed), `Outside v1 scope: ${changed.filter(path => !allowed(path)).join(', ')}`);
const protectedPaths = ['src/lib', 'src/demo', 'src/main.js', 'src/app.js', 'src/styles.css', 'static', 'index.html', 'package.json', 'package-lock.json'];
assert.equal(execFileSync('git', ['diff', main, '--', ...protectedPaths], { cwd: root, encoding: 'utf8' }), '', 'Production changed');
const files = [
  '.gitattributes', 'vite.config.js', 'material-sketchbook-v1.html', 'src/sketchbook/common.js',
  'scripts/material-sketchbook-v1-observe.js', 'scripts/material-sketchbook-v1-browser-check.js', 'scripts/material-sketchbook-v1-evidence.js',
  'docs/ant/daily/2026-11-09-material-sketchbook-v1.md', ...await filesIn('src/sketchbook-v1'),
  ...(await filesIn('tests')).filter(path => /^tests\/material-sketchbook-v1-[^/]+\.test\.js$/.test(path)),
  ...(await filesIn(evidence)).filter(path => path !== `${evidence}/manifest.json` && path !== `${evidence}/SHA256SUMS`)
].sort();
const entries = [];
for (const path of files) { const data = await readFile(resolve(root, path)); entries.push({ path, bytes: data.length, sha256: sha(data) }); }
const manifestPath = resolve(root, evidence, 'manifest.json'), sumPath = resolve(root, evidence, 'SHA256SUMS');
if (process.argv.includes('--write')) {
  await writeFile(manifestPath, `${JSON.stringify({ schema: 'ant-material-sketchbook-v1-evidence', main, base, branch: 'codex/ant-material-sketchbook-v1-open-laws-20261109', files: entries }, null, 2)}\n`);
  await writeFile(sumPath, `${entries.map(entry => `${entry.sha256}  ${entry.path}`).join('\n')}\n${sha(await readFile(manifestPath))}  ${evidence}/manifest.json\n`);
} else {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.main, main); assert.equal(manifest.base, base); assert.deepEqual(manifest.files, entries);
  assert.equal(await readFile(sumPath, 'utf8'), `${entries.map(entry => `${entry.sha256}  ${entry.path}`).join('\n')}\n${sha(await readFile(manifestPath))}  ${evidence}/manifest.json\n`);
}
console.log(JSON.stringify({ action: process.argv.includes('--write') ? 'write' : 'verify', files: entries.length, production: 'PASS', v0Preserved: 'PASS', base, main }));
