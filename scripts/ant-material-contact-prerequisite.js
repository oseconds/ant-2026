import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
export { physicalCell, displayCell, ownerAt, summarizeHistory, createRouteObserver }
  from './lib/antContactPrerequisiteCore.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAIN = 'aeefa12d8de9da400cb8a2a3d4b5080a21ba0292';
const PRIOR = 'bee3a6908b36e23c826e1fde00d461b426c75992';
const RESEARCH = 'da70d82';
const OUTPUT = resolve(ROOT, 'docs/ant/evidence/2026-10-27-material-contact-readout-prerequisite');
const BRANCH = 'codex/ant-material-contact-readout-prerequisite-20261027';
const sha = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
const gitText = (...args) => git(...args).toString('utf8').trim();

async function main() {
  assert.equal(gitText('branch', '--show-current'), BRANCH);
  assert.equal(gitText('rev-parse', 'origin/main'), MAIN);
  assert.equal(gitText('diff', MAIN, '--', 'src', 'static'), '', 'production source must remain unchanged');
  await mkdir(OUTPUT, { recursive: true });
  assert.deepEqual((await readdir(OUTPUT)).sort(), ['PLAN.md', 'attempt-01'], 'refusing to overwrite evidence');
  const sourcePaths = gitText('ls-tree', '-r', '--name-only', MAIN,
    'src/lib/agents/ant', 'src/lib/audio', 'src/lib/renderers').split('\n');
  const sourceHashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
    [path, sha(await readFile(resolve(ROOT, path)))])));
  const beforeSources = await sourceHashes();
  const beforeRunner = sha(await readFile(fileURLToPath(import.meta.url)));
  const corePath = resolve(ROOT, 'scripts/lib/antContactPrerequisiteCore.js');
  const beforeCore = sha(await readFile(corePath));
  const priorBytes = git('show', `${PRIOR}:docs/ant/evidence/2026-10-26-heading-material-visibility-shadow/frame-map-H1.csv`);
  const lines = priorBytes.toString('utf8').trim().split(/\r?\n/), headers = lines.shift().split(',');
  const priorRows = lines.map(line => { const cells = line.split(',');
    return Object.fromEntries(headers.map((name, i) => [name, cells[i]])); });
  const controllerPath = 'src/lib/agents/ant/AntController.js';
  const original = await readFile(resolve(ROOT, controllerPath), 'utf8');
  assert.equal(original.replace(/\r\n/g, '\n'), git('show', `${MAIN}:${controllerPath}`).toString('utf8').replace(/\r\n/g, '\n'));
  const from = 'heading: SPAWN_HEADING + signed(this.random) * SPAWN_HEADING_SPREAD';
  const to = 'heading: wrapAngle(-Math.PI + TAU * this.random())';
  assert.equal(original.split(from).length, 2);
  const h1Source = original.replace(from, to);
  const transform = { path: controllerPath, sourceSha256: sha(original), transformedSha256: sha(h1Source), replacement: { from, to } };
  const server = await createServer({ logLevel: 'error', appType: 'custom', server: { host: '127.0.0.1', port: 0 } });
  let browser, watchdog;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH
      || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--mute-audio'] });
    watchdog = setTimeout(() => { void browser?.close(); }, 180000);
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(String(error.stack || error)));
    await page.route('**/__ant_contact_prerequisite', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Contact routing measurement</title>' }));
    await page.route('**/src/lib/agents/ant/__contact-h1.js', route => route.fulfill({ contentType: 'text/javascript', body: h1Source }));
    const port = server.httpServer.address().port;
    await page.goto(`http://127.0.0.1:${port}/__ant_contact_prerequisite`);

    // Identify runtime variance on six ticks before the registered bounded measurement.
    const nodeSource = h1Source.replace(/from '(\.\/[^']+)'/g,
      (_, p) => `from '${pathToFileURL(resolve(ROOT, dirname(controllerPath), p)).href}'`);
    const NodeController = (await import(`data:text/javascript;base64,${Buffer.from(nodeSource).toString('base64')}`)).AntController;
    const sixTicks = async Controller => {
      let state = 20261005;
      const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
      const world = new Controller({ random }); await world.init();
      for (let i = 0; i < 6; i++) world.tick(1 / 60);
      const snapshot = JSON.parse(JSON.stringify(world.getSnapshot())); await world.destroy(); return snapshot;
    };
    const nodeSnapshot = await sixTicks(NodeController);
    const chromeSnapshot = await page.evaluate(async fn => {
      const { AntController } = await import('/src/lib/agents/ant/__contact-h1.js');
      return await (0, eval)(`(${fn})`)(AntController);
    }, sixTicks.toString());
    const differences = [];
    function diff(a, b, path = '') {
      if (typeof a !== 'object' || a === null || b === null) {
        if (!Object.is(a, b)) differences.push({ path, node: a, chrome: b });
      } else for (const key of Object.keys(a)) diff(a[key], b[key], path ? `${path}.${key}` : key);
    }
    diff(nodeSnapshot, chromeSnapshot);
    const runtime = { node: process.version, chrome: await browser.version(), ticks: 6,
      nodeSnapshotSha256: sha(JSON.stringify(nodeSnapshot)), chromeSnapshotSha256: sha(JSON.stringify(chromeSnapshot)),
      changedScalarFields: differences.length, firstDifferences: differences.slice(0, 20) };
    await writeFile(resolve(OUTPUT, 'RUNTIME-CHECK.json'), JSON.stringify(runtime, null, 2) + '\n');
    const measured = await page.evaluate(async priorRows => {
      const [{ AntController }, { runMeasurement }] = await Promise.all([
        import('/src/lib/agents/ant/__contact-h1.js'), import('/scripts/lib/antContactPrerequisiteCore.js')]);
      return await runMeasurement({ AntController, priorRows, wallLimitMs: 180000 });
    }, priorRows);
    assert.deepEqual(errors, []);
    assert.deepEqual(beforeSources, await sourceHashes());
    assert.equal(beforeRunner, sha(await readFile(fileURLToPath(import.meta.url))));
    assert.equal(beforeCore, sha(await readFile(corePath)));
    const summary = { schemaVersion: 1, status: 'TECHNICAL PREREQUISITE COMPLETE; NO ARTISTIC VERDICT',
      main: MAIN, branch: BRANCH, researchReference: gitText('rev-parse', RESEARCH), priorH1: PRIOR,
      seed: 20261005, dtSeconds: 1 / 60, chrome: runtime.chrome, nodeOrchestrator: process.version,
      runnerSha256: beforeRunner, coreSha256: beforeCore, transform,
      noCanvasAudioContextOrDSP: true, nativeGridUsedOnlyForPointMapping: 640,
      priorFrameMapSha256: sha(priorBytes), ...measured.summary,
      sourceHashes: beforeSources, sourceHashesUnchanged: true, pageErrors: errors,
      limits: ['Routing oracle has a ready fake port, not an AudioContext/Worklet or PCM.',
        'Scalar alpha samples are not displayed smoothed pixels or perceptual visibility.',
        'Native point bins are not mark footprint/contrast/ink coverage.',
        'H1 is diagnostic; no H0 transfer, mature-world, human or causal-identity claim.'] };
    await writeFile(resolve(OUTPUT, 'contacts.jsonl'), measured.rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    await writeFile(resolve(OUTPUT, 'strikes.jsonl'), measured.strikes.map(row => JSON.stringify(row)).join('\n') + '\n');
    await writeFile(resolve(OUTPUT, 'parity-anchors.json'), JSON.stringify(measured.anchors, null, 2) + '\n');
    await writeFile(resolve(OUTPUT, 'measurement.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify({ runtime, ...measured.summary }, null, 2));
  } catch (error) {
    await writeFile(resolve(OUTPUT, 'FAILURE-BROWSER.json'), JSON.stringify({ error: String(error.stack) }, null, 2));
    throw error;
  } finally {
    clearTimeout(watchdog);
    await browser?.close(); await server.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
