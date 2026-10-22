import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { readNaturalCapture } from './ant-route-curvature-natural.js';

const ROOT = process.cwd();
const EVIDENCE = 'docs/ant/evidence/2026-10-22-route-curvature-survey';
const OUTPUT = resolve(ROOT, `${EVIDENCE}/visual`);
const sha = value => createHash('sha256').update(value).digest('hex');
const colors = ['#e66b5b', '#55b7d0', '#f0bf56', '#c17fda', '#72c78e', '#f08db1', '#9ba7ff', '#d69155', '#58c5ab', '#df6e9d', '#a6c95e', '#8e9dab'];

await assert.rejects(readdir(OUTPUT), error => error.code === 'ENOENT', 'refusing existing output directory');
await mkdir(OUTPUT, { recursive: false });
const sourceFiles = [
  ...[20261005, 20261006, 20261007].flatMap(seed => [
    `${EVIDENCE}/readout/seed-${seed}.svg`,
    `${EVIDENCE}/natural/seed-${seed}-trajectory.f64.gz`,
    `${EVIDENCE}/natural/seed-${seed}-trajectory.schema.json`
  ]),
  ...['scoreOff', 'blendOff', 'dampingOff'].map(name => `${EVIDENCE}/shadows/${name}-20261005/visual-trajectories.json.gz`),
  `${EVIDENCE}/controlled/controlled-results.json.gz`,
  'scripts/ant-route-curvature-visuals.js', 'scripts/ant-route-curvature-natural.js'
];
const inputs = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, sha(await readFile(resolve(ROOT, path)))])));

const panels = [];
const natural = await readNaturalCapture(resolve(ROOT, `${EVIDENCE}/natural/seed-20261005-trajectory.f64.gz`));
const baselineTracks = groupRows(natural.filter(row => row.tick >= 18000));
const shadows = {};
for (const name of ['scoreOff', 'blendOff', 'dampingOff']) {
  const rows = await readNaturalCapture(resolve(ROOT, `${EVIDENCE}/shadows/${name}-20261005/visual-trajectories.json.gz`));
  assert.equal(rows.length, 1, `${name} shadow must contain one saved frame sequence`);
  shadows[name] = groupRows(rows[0].filter(row => row.tick >= 18000));
}
const datasets = [
  ['Natural baseline · seed 20261005', baselineTracks], ['scoreOff · 20261005', shadows.scoreOff],
  ['blendOff · 20261005', shadows.blendOff], ['dampingOff · 20261005', shadows.dampingOff]
];
const selectedByPanel = Object.fromEntries(datasets.map(([title, tracks]) => [title,
  [...tracks.keys()].sort(idSort).filter(id => tracks.get(id).length >= 50).slice(0, 12)]));
assert.ok(Object.values(selectedByPanel).every(ids => ids.length === 12), 'each natural/shadow panel must have 12 eligible late-trace IDs');
for (let i = 0; i < datasets.length; i += 1) panels.push(trajectoryPanel(...datasets[i], i, selectedByPanel[datasets[i][0]]));
const naturalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1780" height="590" viewBox="0 0 1780 590"><rect width="1780" height="590" fill="#fff"/><g font-family="sans-serif" fill="#111"><text x="20" y="25" font-size="18">Late trajectories, 300–600 s · shared normalized axes 0..1 · matched seed 20261005</text><text x="20" y="47" font-size="12">All eligible traces are faint; each panel highlights its own first 12 numeric IDs with ≥5 s of late trace. IDs are panel-local, not matched individuals; seed is matched, but late lifecycle and trajectories diverge. Descriptive diagnostic.</text>${panels.join('')}</g></svg>`;
await writeText('natural-seed-20261005-shadows.svg', naturalSvg);

const controlled = JSON.parse(gunzipSync(await readFile(resolve(ROOT, `${EVIDENCE}/controlled/controlled-results.json.gz`))).toString('utf8'));
const cases = ['baseline', 'dampingOff'].map(variant => {
  const result = controlled.capability.find(item => item.shape === 'gentle' && item.fieldMode === 'smooth'
    && item.variant === variant && item.seed === 19);
  assert.ok(result?.samples?.length === 181, `${variant} seed 19 must include all 181 3 s samples`);
  return result;
});
const controlSvg = controlledPlot(cases);
await writeText('controlled-seed19-smooth-gentle.svg', controlSvg);

const chromePath = process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chromePath });
try {
  const toolVersion = await browser.version();
  const rendered = [];
  for (const seed of [20261005, 20261006, 20261007]) {
    const svg = await readFile(resolve(ROOT, `${EVIDENCE}/readout/seed-${seed}.svg`), 'utf8');
    assert.match(svg.slice(0, 250), /width="1780" height="650" viewBox="0 0 1780 650"/);
    rendered.push(await screenshot(browser, `natural-seed-${seed}.png`, svg, 1780, 650));
  }
  rendered.push(await screenshot(browser, 'natural-seed-20261005-shadows.png', naturalSvg, 1780, 590));
  rendered.push(await screenshot(browser, 'controlled-seed19-smooth-gentle.png', controlSvg, 1180, 760));
  const outputHashes = Object.fromEntries(await Promise.all(rendered.map(async ({ file }) => [file, sha(await readFile(resolve(OUTPUT, file)))])));
  await writeFile(resolve(OUTPUT, 'receipt.json'), `${JSON.stringify({
    purpose: 'Diagnostic rendering of frozen route-curvature outputs; not exhibition rendering and not a causal interpretation.',
    viewport: { naturalReadouts: [1780, 650], naturalComparison: [1780, 590], controlled: [1180, 760], deviceScaleFactor: 1 },
    trajectoryWindowTicks: [18000, 36000], trajectoryHz: 60, deterministicSelectedIdsByPanel: selectedByPanel,
    selectionRule: 'Within each panel, first 12 numerically ordered IDs with at least 50 samples in that panel late window; highlights are panel-local and do not identify matched individuals',
    controlledCases: cases.map(({ shape, fieldMode, variant, seed, samples }) => ({ shape, fieldMode, variant, seed, sampleCount: samples.length })),
    browser: { engine: 'Playwright Chromium', version: toolVersion, executablePath: chromePath }, inputsSha256: inputs, outputsSha256: outputHashes
  }, null, 2)}\n`, { flag: 'wx' });
} finally { await browser.close(); }

function groupRows(rows) {
  const tracks = new Map();
  for (const row of rows) {
    assert.ok(Number.isFinite(row.x) && Number.isFinite(row.y) && Number.isFinite(row.tick), 'trajectory coordinates and tick must be finite');
    if (row.x < 0 || row.x > 1 || row.y < 0 || row.y > 1) continue;
    if (!tracks.has(row.id)) tracks.set(row.id, []);
    tracks.get(row.id).push(row);
  }
  return tracks;
}
function idSort(a, b) { return Number(a.match(/\d+$/)?.[0] ?? Infinity) - Number(b.match(/\d+$/)?.[0] ?? Infinity); }
function trajectoryPanel(title, tracks, panelIndex, chosen) {
  const x = 20 + panelIndex * 440, y = 75, size = 410;
  const px = value => x + 10 + value * (size - 20), py = value => y + 30 + (1 - value) * (size - 40);
  const paths = [];
  for (const points of tracks.values()) if (points.length > 1) paths.push(`<path d="${path(points, px, py)}" fill="none" stroke="#bdc5cc" stroke-width=".55" opacity=".045"/>`);
  for (let i = 0; i < chosen.length; i += 1) {
    const points = tracks.get(chosen[i]);
    if (points?.length > 1) paths.push(`<path d="${path(points, px, py)}" fill="none" stroke="${colors[i]}" stroke-width="1.1" opacity=".88"/>`);
  }
  return `<g><text x="${x}" y="${y + 16}" font-size="14">${title}</text><rect x="${x}" y="${y + 25}" width="${size}" height="${size}" fill="#111820" stroke="#59636d"/>${paths.join('')}<text x="${x}" y="${y + size + 44}" font-size="10">x 0 → 1 · y 0 → 1 · ${tracks.size} traces</text></g>`;
}
function path(points, px, py) { return points.map((point, i) => `${i ? 'L' : 'M'}${px(point.x).toFixed(2)},${py(point.y).toFixed(2)}`).join(' '); }
function controlledPlot([baseline, damping]) {
  const left = 295, top = 95, width = 590, height = 590;
  const x = value => left + value * width, y = value => top + (1 - value) * height;
  const circle = Array.from({ length: 180 }, (_, i) => {
    const s = -0.15 + i * 0.35 / 179, r = 0.25;
    return { x: 0.35 + r * Math.sin(s / r), y: 0.5 + r * (1 - Math.cos(s / r)) };
  });
  const series = [
    `<path d="${path(circle, x, y)}" fill="none" stroke="#aaa" stroke-width="2" stroke-dasharray="8 6"/>`,
    samplePath(baseline.samples, x, y, '#1877c9'), samplePath(damping.samples, x, y, '#e06b46')
  ].join('');
  const grid = Array.from({ length: 11 }, (_, i) => `<path d="M${x(i / 10)},${top} V${top + height} M${left},${y(i / 10)} H${left + width}" stroke="#e6e9ec" stroke-width="1"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="760" viewBox="0 0 1180 760"><rect width="1180" height="760" fill="white"/><g font-family="sans-serif" fill="#111"><text x="28" y="30" font-size="20">Controlled smooth gentle route · seed 19 · 3 s · actual saved 60 Hz samples</text><text x="28" y="52" font-size="13">Equal-scale normalized axes 0..1; gray dashed line is the R=0.25 protocol arc from (0.35, 0.5). Capability probe, not natural colony behavior.</text><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#fff" stroke="#222"/>${grid}${series}<text x="900" y="120" fill="#1877c9" font-size="14">baseline · smooth analytic field</text><text x="900" y="145" fill="#e06b46" font-size="14">dampingOff · smooth analytic field</text><text x="515" y="730" font-size="14">x (normalized)</text><text x="255" y="390" font-size="14" transform="rotate(-90 255 390)">y (normalized)</text></g></svg>`;
}
function samplePath(samples, x, y, color) { return `<path d="${path(samples, x, y)}" fill="none" stroke="${color}" stroke-width="2.1" opacity=".9"/>`; }
async function writeText(file, text) { await writeFile(resolve(OUTPUT, file), text, { flag: 'wx' }); }
async function screenshot(browser, file, svg, width, height) {
  assert.ok(!/NaN|Infinity/.test(svg), `${file} SVG must have finite serialized values`);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.setContent(`<style>html,body{margin:0;padding:0;overflow:hidden}</style>${svg}`, { waitUntil: 'load' });
    const rendered = await page.locator('svg').evaluate(node => ({ width: node.width.baseVal.value, height: node.height.baseVal.value }));
    assert.deepEqual(rendered, { width, height }, `${file} SVG dimensions`);
    const png = await page.screenshot({ path: resolve(OUTPUT, file) });
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), width, `${file} PNG width`);
    assert.equal(png.readUInt32BE(20), height, `${file} PNG height`);
    return { file, width, height, sha256: sha(png) };
  } finally { await page.close(); }
}
