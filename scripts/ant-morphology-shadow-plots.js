import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Map(process.argv.slice(2).map(value => {
  const split = value.indexOf('=');
  return split < 0 ? [value, true] : [value.slice(0, split), value.slice(split + 1)];
}));
const CASE_KEYS = ['interiorBranchesOmittedByProduction', 'maximumMeasuredCurvature',
  'minimumFootprintAmongChanged', 'exactNoDifference'];

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function world(index) {
  return [index % 96 / 95, Math.floor(index / 96) / 95];
}

function uniquePoints(indices) {
  return [...new Set(indices)].sort((a, b) => a - b).map(world);
}

function circle([x, y], cx, cy, size, color) {
  return `<circle cx="${cx + x * size}" cy="${cy + (1 - y) * size}" r="2" fill="${color}"/>`;
}

function polyline(indices, cx, cy, size, color, width = 1.4) {
  if (indices.length < 2) return '';
  const points = indices.map(world).map(([x, y]) => `${cx + x * size},${cy + (1 - y) * size}`).join(' ');
  return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

function svgPanel({ title, row, panel }) {
  const left = panel * 520 + 52, top = 70, size = 400;
  const production = row.candidate, shadow = row.shadowCandidate;
  const skeleton = new Set([...(production?.prePruneSkeletonIndices || []), ...(shadow?.prePruneSkeletonIndices || [])]);
  const productionNetwork = new Set(production?.skeletonIndices || []);
  const shadowNetwork = new Set(shadow?.skeletonIndices || []);
  const addedNetwork = [...shadowNetwork].filter(index => !productionNetwork.has(index));
  const networks = panel === 0 ? [productionNetwork, '#1769aa']
    : panel === 1 ? [shadowNetwork, '#238636'] : [productionNetwork, '#1769aa'];
  let body = `<text x="${left + size / 2}" y="32" text-anchor="middle" font-size="17" font-weight="600">${xml(title)}</text>`;
  body += `<rect x="${left}" y="${top}" width="${size}" height="${size}" fill="#ffffff" stroke="#333333"/>`;
  for (let tick = 0; tick <= 5; tick += 1) {
    const pos = tick / 5, x = left + pos * size, y = top + (1 - pos) * size;
    body += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + size}" stroke="#e3e3e3"/>`;
    body += `<line x1="${left}" y1="${y}" x2="${left + size}" y2="${y}" stroke="#e3e3e3"/>`;
    body += `<text x="${x}" y="${top + size + 19}" text-anchor="middle" font-size="11">${pos.toFixed(1)}</text>`;
    body += `<text x="${left - 10}" y="${y + 4}" text-anchor="end" font-size="11">${pos.toFixed(1)}</text>`;
  }
  body += `<text x="${left + size / 2}" y="${top + size + 42}" text-anchor="middle" font-size="12">Normalized world x</text>`;
  body += `<text x="${left - 38}" y="${top + size / 2}" text-anchor="middle" font-size="12" transform="rotate(-90 ${left - 38} ${top + size / 2})">Normalized world y</text>`;
  for (const point of uniquePoints(skeleton)) body += circle(point, left, top, size, '#b8b8b8');
  for (const point of uniquePoints(networks[0])) body += circle(point, left, top, size, networks[1]);
  if (panel === 2) for (const point of uniquePoints(addedNetwork)) body += circle(point, left, top, size, '#d73a49');
  const route = panel === 1 ? shadow : panel === 2 ? shadow : production;
  if (route) body += polyline(route.path, left, top, size, panel === 2 ? '#d73a49' : networks[1], 1.6);
  if (production) {
    const p = production.source;
    body += `<circle cx="${left + p.x * size}" cy="${top + (1 - p.y) * size}" r="5" fill="#111111"/>`;
    const pTarget = production.target;
    body += `<circle cx="${left + pTarget.x * size}" cy="${top + (1 - pTarget.y) * size}" r="4" fill="#1769aa"/>`;
  }
  if (shadow) {
    const t = shadow.target;
    const x = left + t.x * size, y = top + (1 - t.y) * size;
    body += `<path d="M${x},${y - 5} L${x - 5},${y + 4} L${x + 5},${y + 4} Z" fill="#d73a49"/>`;
  }
  const legendY = top + size + 63;
  body += `<text x="${left}" y="${legendY}" font-size="10" fill="#777777">● full source-connected skeleton</text>`;
  if (panel !== 1) body += `<text x="${left}" y="${legendY + 15}" font-size="10" fill="#1769aa">● production retained network / target</text>`;
  if (panel === 1) body += `<text x="${left}" y="${legendY + 15}" font-size="10" fill="#238636">● shadow retained network</text>`;
  if (panel === 2) body += `<text x="${left}" y="${legendY + 30}" font-size="10" fill="#d73a49">● shadow-only retained cells / target</text>`;
  return body;
}

function renderExample(caseName, row) {
  const titles = ['Production retained', 'Shadow retained', 'Overlay with additional shadow paths'];
  const panels = titles.map((title, index) => svgPanel({ title, row, panel: index })).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1560" height="590" viewBox="0 0 1560 590"><rect width="100%" height="100%" fill="white"/><text x="780" y="18" text-anchor="middle" font-family="sans-serif" font-size="13">${xml(caseName)} — seed ${row.seed}, t=${row.timeSeconds.toFixed(3)}s; common 0..1 world axes</text>${panels}</svg>\n`;
}

function selectExamples(analysis) {
  const candidates = CASE_KEYS.flatMap(key => analysis.seeds.flatMap(seed => {
    const value = seed.examples?.[key];
    return value ? [{ key, seed: seed.seed, value }] : [];
  }));
  return Object.fromEntries(CASE_KEYS.map(key => {
    const group = candidates.filter(entry => entry.key === key);
    if (!group.length) return [key, null];
    if (key === 'interiorBranchesOmittedByProduction') group.sort((a, b) =>
      b.value.additionalNetworkCells - a.value.additionalNetworkCells);
    else if (key === 'maximumMeasuredCurvature') group.sort((a, b) =>
      b.value.shadowCurvatureAt010 - a.value.shadowCurvatureAt010);
    else if (key === 'minimumFootprintAmongChanged') group.sort((a, b) =>
      a.value.shadowFootprintArea - b.value.shadowFootprintArea);
    else group.sort((a, b) => a.seed - b.seed || a.value.tick - b.value.tick);
    return [key, group[0]];
  }));
}

async function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const input = resolve(String(args.get('--input') || resolve(root, 'test-results/ant-interior-endpoint-shadow')));
  const analysisPath = resolve(String(args.get('--analysis') || resolve(input, 'analysis.json')));
  const output = resolve(String(args.get('--output') || resolve(input, 'plots')));
  await mkdir(output, { recursive: true });
  const analysis = JSON.parse(await readFile(analysisPath, 'utf8'));
  const examples = selectExamples(analysis);
  const replays = new Map();
  const manifest = { coordinateScale: [0, 1], axes: 'common normalized world coordinates; equal aspect; fixed limits 0..1',
    plots: [], omitted: [] };
  for (const [caseName, selected] of Object.entries(examples)) {
    if (!selected) {
      manifest.omitted.push({ case: caseName, reason: 'No matching observed example in replay data.' });
      continue;
    }
    if (!replays.has(selected.seed)) replays.set(selected.seed, JSON.parse(await readFile(
      resolve(input, `seed${selected.seed}-summary.json`), 'utf8')));
    const row = replays.get(selected.seed).morphology.find(item => item.tick === selected.value.tick);
    const filename = `${caseName}-seed${selected.seed}-tick${selected.value.tick}.svg`;
    await writeFile(resolve(output, filename), renderExample(caseName, { ...row, seed: selected.seed }), 'utf8');
    manifest.plots.push({ case: caseName, seed: selected.seed, tick: selected.value.tick,
      timeSeconds: selected.value.timeSeconds, path: filename,
      additionalNetworkCells: selected.value.additionalNetworkCells,
      shadowFootprintArea: selected.value.shadowFootprintArea,
      shadowPrincipalTortuosity: selected.value.shadowPrincipalTortuosity,
      shadowCurvatureAt010: selected.value.shadowCurvatureAt010,
      selectedCandidateExists: Boolean(row?.shadowCandidate) });
  }
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ output, plots: manifest.plots.length, omitted: manifest.omitted }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
