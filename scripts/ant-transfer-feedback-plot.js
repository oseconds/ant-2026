import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeAt } from './ant-route-curvature-probes.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PACKAGE = resolve(ROOT, 'docs/ant/evidence/2026-10-23-natural-field-transfer/movement-qualification');
const PLOT_DIR = resolve(PACKAGE, 'plots');
const RESULTS_PATH = resolve(PACKAGE, 'results.json');
const HELPER_PATH = resolve(ROOT, 'scripts/ant-route-curvature-probes.js');
const SVG_PATH = resolve(PLOT_DIR, 'sCurve-seed19-field-controls.svg');
const RECEIPT_PATH = resolve(PLOT_DIR, 'plot-receipt.json');
const EXPECTED_RESULTS_SHA256 = 'b9a9e75c4c0bcd8506d5ba8d8d5bd4264ac5539f61d6964e338a1be8b21948d2';
const MOVEMENTS = ['production', 'dtFeedback', 'dampingOff', 'rawDisplacement'];
const COLORS = {
  production: '#d55e00',
  dtFeedback: '#0072b2',
  dampingOff: '#009e73',
  rawDisplacement: '#a64d8f'
};
const DASHES = {
  production: '',
  dtFeedback: '6 3',
  dampingOff: '1.5 3',
  rawDisplacement: '8 2 2 2'
};
const MARKERS = {
  production: 'circle',
  dtFeedback: 'square',
  dampingOff: 'diamond',
  rawDisplacement: 'triangle'
};
const X_LIMITS = [0.30, 0.72];
const Y_LIMITS = [0.45, 0.72];
const PANEL = { width: 280, height: 180, top: 116, lefts: [66, 439] };
const SVG_SIZE = { width: 795, height: 374 };
const FIELD_PANELS = [
  { mode: 'deposited96', title: 'Deposited field (96 x 96)' },
  { mode: 'analytic', title: 'Analytic field' }
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const resultBytes = await readFile(RESULTS_PATH);
const resultsHash = sha256(resultBytes);
assert.equal(resultsHash, EXPECTED_RESULTS_SHA256, 'Plot must use the preserved 144-case result file.');
const results = JSON.parse(resultBytes.toString('utf8'));
assert.equal(results.cases.length, 144);
const selected = new Map();
for (const panel of FIELD_PANELS) {
  for (const movement of MOVEMENTS) {
    const matches = results.cases.filter(item => item.shape === 'sCurve' && item.fieldMode === panel.mode
      && item.seed === 19 && item.movement === movement);
    assert.equal(matches.length, 1, `Expected one preserved case for ${panel.mode}/${movement}.`);
    assert.equal(matches[0].samples.length, 181, 'Every plotted case must retain all 181 samples.');
    selected.set(`${panel.mode}/${movement}`, matches[0]);
  }
}

const route = Array.from({ length: 171 }, (_, index) => routeAt('sCurve', 0.34 * index / 170));
const px = (x, left) => left + (x - X_LIMITS[0]) / (X_LIMITS[1] - X_LIMITS[0]) * PANEL.width;
const py = y => PANEL.top + (Y_LIMITS[1] - y) / (Y_LIMITS[1] - Y_LIMITS[0]) * PANEL.height;
const fmt = value => Number(value).toFixed(2);
const line = (x1, y1, x2, y2, attrs = '') => `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" ${attrs}/>`;
const text = (x, y, value, attrs = '') => `<text x="${fmt(x)}" y="${fmt(y)}" ${attrs}>${value}</text>`;

function marker(sample, left, movement) {
  const x = px(sample.x, left), y = py(sample.y), color = COLORS[movement];
  const common = `fill="#ffffff" stroke="${color}" stroke-width="1.4"`;
  if (MARKERS[movement] === 'square') return `<rect x="${fmt(x - 2.4)}" y="${fmt(y - 2.4)}" width="4.8" height="4.8" ${common}/>`;
  if (MARKERS[movement] === 'diamond') return `<polygon points="${fmt(x)},${fmt(y - 3)} ${fmt(x + 3)},${fmt(y)} ${fmt(x)},${fmt(y + 3)} ${fmt(x - 3)},${fmt(y)}" ${common}/>`;
  if (MARKERS[movement] === 'triangle') return `<polygon points="${fmt(x)},${fmt(y - 3.2)} ${fmt(x + 3)},${fmt(y + 2.6)} ${fmt(x - 3)},${fmt(y + 2.6)}" ${common}/>`;
  return `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="2.5" ${common}/>`;
}

function polyline(points, left, attrs = '') {
  return `<polyline points="${points.map(point => `${fmt(px(point.x, left))},${fmt(py(point.y))}`).join(' ')}" ${attrs}/>`;
}

const parts = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_SIZE.width}" height="${SVG_SIZE.height}" viewBox="0 0 ${SVG_SIZE.width} ${SVG_SIZE.height}">`,
  '<rect width="100%" height="100%" fill="#ffffff"/>',
  '<style>text{font-family:Arial,Helvetica,sans-serif;fill:#222} .small{font-size:10px} .tick{font-size:9px;fill:#555} .paneltitle{font-size:12px;font-weight:600} .title{font-size:16px;font-weight:700} .caption{font-size:10px;fill:#333}</style>',
  text(SVG_SIZE.width / 2, 25, 'Raw previous-turn feedback: path tracking by fixed field', 'text-anchor="middle" class="title"'),
  text(SVG_SIZE.width / 2, 44, 'sCurve, seed 19 · same start, route, duration, and controls', 'text-anchor="middle" class="small"'),
  text(66, 68, 'Constructed S route', 'class="small"'),
  line(157, 64.5, 185, 64.5, 'stroke="#252525" stroke-width="2.2" stroke-dasharray="6 4"'),
  ...MOVEMENTS.map((movement, index) => {
    const x = [218, 352, 484, 617][index];
    const dash = DASHES[movement] ? `stroke-dasharray="${DASHES[movement]}"` : '';
    return `${line(x, 64.5, x + 26, 64.5, `stroke="${COLORS[movement]}" stroke-width="2.2" ${dash}`)}${text(x + 32, 68, movement, 'class="small"')}`;
  })
];

for (const [panelIndex, panel] of FIELD_PANELS.entries()) {
  const left = PANEL.lefts[panelIndex], top = PANEL.top, right = left + PANEL.width, bottom = top + PANEL.height;
  parts.push(text((left + right) / 2, 99, panel.title, 'text-anchor="middle" class="paneltitle"'));
  for (const xTick of [0.30, 0.40, 0.50, 0.60, 0.70]) {
    const x = px(xTick, left);
    parts.push(line(x, top, x, bottom, 'stroke="#e7e7e7" stroke-width="0.7"'));
    parts.push(text(x, bottom + 14, fmt(xTick), 'text-anchor="middle" class="tick"'));
  }
  for (const yTick of [0.45, 0.50, 0.55, 0.60, 0.65, 0.70]) {
    const y = py(yTick);
    parts.push(line(left, y, right, y, 'stroke="#e7e7e7" stroke-width="0.7"'));
    parts.push(text(left - 8, y + 3, fmt(yTick), 'text-anchor="end" class="tick"'));
  }
  parts.push(`<rect x="${left}" y="${top}" width="${PANEL.width}" height="${PANEL.height}" fill="none" stroke="#777" stroke-width="0.9"/>`);
  parts.push(polyline(route, left, 'fill="none" stroke="#252525" stroke-width="2.1" stroke-dasharray="6 4" stroke-linecap="round" stroke-linejoin="round"'));

  for (const movement of MOVEMENTS) {
    const item = selected.get(`${panel.mode}/${movement}`);
    const samples = item.samples;
    const dash = DASHES[movement] ? `stroke-dasharray="${DASHES[movement]}"` : '';
    parts.push(polyline(samples, left, `fill="none" stroke="${COLORS[movement]}" stroke-width="1.7" ${dash} stroke-linecap="round" stroke-linejoin="round"`));
    for (const tick of [60, 120, 180]) parts.push(marker(samples[tick], left, movement));
  }
  parts.push(text((left + right) / 2, bottom + 31, 'world x', 'text-anchor="middle" class="small"'));
  parts.push(`<text x="${left - 43}" y="${top + PANEL.height / 2}" text-anchor="middle" class="small" transform="rotate(-90 ${left - 43} ${top + PANEL.height / 2})">world y</text>`);
}

parts.push(text(SVG_SIZE.width / 2, 354, '3 s controlled fixture (180 ticks at 60 Hz), not natural trajectories. Colored paths show position; turn persistence alone does not establish route tracking.', 'text-anchor="middle" class="caption"'));
parts.push(text(SVG_SIZE.width / 2, 369, 'Both panels use shared world limits x = 0.30–0.72, y = 0.45–0.72 and equal x/y scale.', 'text-anchor="middle" class="caption"'));
parts.push('</svg>');

await mkdir(PLOT_DIR, { recursive: true });
const svgBytes = Buffer.from(parts.join('\n'), 'utf8');
await writeFile(SVG_PATH, svgBytes, { flag: 'wx' });
const [sourceBytes, helperBytes] = await Promise.all([readFile(fileURLToPath(import.meta.url)), readFile(HELPER_PATH)]);
const receipt = {
  schemaVersion: 1,
  asset: 'sCurve-seed19-field-controls.svg',
  assetSha256: sha256(svgBytes),
  plotSourcePath: 'scripts/ant-transfer-feedback-plot.js',
  plotSourceSha256: sha256(sourceBytes),
  preservedResultsPath: 'docs/ant/evidence/2026-10-23-natural-field-transfer/movement-qualification/results.json',
  preservedResultsSha256: resultsHash,
  routeHelperPath: 'scripts/ant-route-curvature-probes.js',
  routeHelperSha256: sha256(helperBytes),
  routeDefinition: { shape: 'sCurve', stationStart: 0, stationEnd: 0.34, sampleCount: route.length },
  cases: FIELD_PANELS.flatMap(panel => MOVEMENTS.map(movement => ({ fieldMode: panel.mode, shape: 'sCurve', seed: 19, movement, allSamples: 181 }))),
  axisLimits: { x: X_LIMITS, y: Y_LIMITS, equalWorldUnitScale: true },
  caption: '3 s controlled fixture (180 ticks at 60 Hz), not natural trajectories.',
  filteringOrTuning: false
};
await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ svg: SVG_PATH, sha256: receipt.assetSha256, receipt: RECEIPT_PATH, sourceSha256: receipt.plotSourceSha256 })}\n`);
