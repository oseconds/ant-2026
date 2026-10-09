import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE = 'docs/ant/evidence/2026-10-09-w1-cell-local-supported-formation-shadow';
const GRID = 96, CELLS = GRID * GRID;
const COLORS = { background: '#101820', empty: '#172630', text: '#ecf2f4', muted: '#a7b6be',
  historical: '#78858d', active: '#54d6c5', local: '#9a7be8', newCell: '#78d69a', overlap: '#f0a65b',
  baseline: '#67a9dc', candidate: '#e6cb66', primary: '#a78bfa', contact: '#f0a65b', alive: '#55d69a', dead: '#8b969c' };
const ROWS = [
  ['ID 0 historical union', 'id0HistoricalCellIndices', COLORS.historical],
  ['Current active geometry', 'currentActiveCellIndices', COLORS.active],
  ['Local events at this observation', 'event', null],
  ['Cumulative local materialized union', 'localMaterializedCellIndices', COLORS.local],
  ['Original W1 frozen union', 'baselineFrozenCellIndices', COLORS.baseline],
  ['Max-overlap frozen union', 'candidateFrozenCellIndices', COLORS.candidate]
];

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const svgStart = (width, height, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><rect width="100%" height="100%" fill="${COLORS.background}"/><style>text{font-family:Arial,sans-serif;fill:${COLORS.text}}.muted{fill:${COLORS.muted}}</style><text x="24" y="30" font-size="22" font-weight="700">${esc(title)}</text>`;
const svgEnd = '</svg>\n';

function checkedCells(cells) {
  assert.ok(Array.isArray(cells));
  const unique = new Set(cells);
  assert.equal(unique.size, cells.length, 'map geometry contains unique cells');
  for (const cell of unique) assert.ok(Number.isSafeInteger(cell) && cell >= 0 && cell < CELLS, 'map cell inside fixed 96×96 grid');
  return [...unique].sort((a, b) => a - b);
}

export function buildMilestoneMap(seed, milestones) {
  assert.equal(milestones.length, 4, 'four requested observation targets');
  const width = 1290, panelWidth = 315, rowHeight = 284, cellSize = 2.25, gridPixels = GRID * cellSize;
  const height = 1850;
  let svg = svgStart(width, height, `W1 cell-local supported-spell shadow · seed ${seed} · exact 96×96 cell maps`);
  svg += `<text x="24" y="50" class="muted" font-size="12">Observed cells only; no geometry interpolation · common map extent 96×96 · one cell = ${cellSize} SVG units</text>`;
  milestones.forEach((milestone, column) => {
    const panelX = 16 + column * panelWidth;
    svg += `<text x="${panelX}" y="74" font-size="15" font-weight="700">Target ${milestone.nominalTargetSeconds} s</text><text x="${panelX}" y="91" class="muted" font-size="11">observation ${milestone.actualTimeSeconds.toFixed(3)} s · frame ${milestone.frameIndex} · ID 0 ${milestone.id0Alive ? 'alive' : 'closed'}</text>`;
  });
  ROWS.forEach(([label, key, color], row) => {
    for (let column = 0; column < milestones.length; column += 1) {
      const milestone = milestones[column], panelX = 16 + column * panelWidth, panelY = 104 + row * rowHeight;
      const mapX = panelX + 43, mapY = panelY + 25;
      svg += `<text x="${panelX}" y="${panelY + 14}" font-size="12" font-weight="700">${esc(label)}</text><rect x="${mapX}" y="${mapY}" width="${gridPixels}" height="${gridPixels}" fill="${COLORS.empty}"/>`;
      if (key === 'event') {
        for (const event of milestone.currentEventGeometry) {
          const overlap = new Set(checkedCells(event.overlapCellIndices));
          for (const cell of checkedCells(event.cellIndices)) {
            const x = mapX + (cell % GRID) * cellSize, y = mapY + Math.floor(cell / GRID) * cellSize;
            svg += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(cellSize - 0.12).toFixed(2)}" height="${(cellSize - 0.12).toFixed(2)}" fill="${overlap.has(cell) ? COLORS.overlap : COLORS.newCell}"/>`;
          }
        }
      } else {
        const cells = checkedCells(milestone[key]);
        for (const cell of cells) {
          const x = mapX + (cell % GRID) * cellSize, y = mapY + Math.floor(cell / GRID) * cellSize;
          svg += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(cellSize - 0.12).toFixed(2)}" height="${(cellSize - 0.12).toFixed(2)}" fill="${color}"/>`;
        }
      }
      const count = key === 'event' ? milestone.currentEventGeometry.reduce((sum, event) => sum + event.size, 0) : milestone[key].length;
      const area = `${count.toLocaleString('en-US')} cells · ${(100 * count / CELLS).toFixed(2)}%`;
      svg += `<text x="${mapX}" y="${mapY + gridPixels + 14}" class="muted" font-size="10">${area}</text><text x="${mapX}" y="${mapY + gridPixels + 26}" class="muted" font-size="9">x: 0 — 95</text><text x="${panelX + 6}" y="${mapY + 10}" class="muted" font-size="9">0</text><text x="${panelX + 6}" y="${mapY + gridPixels / 2}" class="muted" font-size="9">48</text><text x="${panelX + 6}" y="${mapY + gridPixels}" class="muted" font-size="9">95</text>`;
    }
  });
  svg += `<g transform="translate(24 ${height - 17})"><rect width="10" height="10" fill="${COLORS.newCell}"/><text x="15" y="9" font-size="10">new local area</text><rect x="125" width="10" height="10" fill="${COLORS.overlap}"/><text x="140" y="9" font-size="10">repeat local area</text></g>`;
  svg += svgEnd;
  assert.equal((svg.match(/<rect /g) ?? []).length > 0, true, 'map encodes cell geometry as individual rectangles');
  return svg;
}

function dots(rows, { x, y, color, xMax, yMax, width, height, radius = 1.4 }) {
  return rows.map(row => `<circle cx="${(x + row.x / xMax * width).toFixed(2)}" cy="${(y + height - row.y / yMax * height).toFixed(2)}" r="${radius}" fill="${color}"/>`).join('');
}

function chartFrame({ title, x, y, width, height, xMax, yMax, xLabel, yLabel }) {
  return `<text x="${x}" y="${y - 9}" font-size="12" font-weight="700">${esc(title)}</text><path d="M ${x} ${y} V ${y + height} H ${x + width}" fill="none" stroke="#82939c" stroke-width="1"/><text x="${x}" y="${y + height + 15}" class="muted" font-size="9">0</text><text x="${x + width - 24}" y="${y + height + 15}" class="muted" font-size="9">${esc(String(xMax))}</text><text x="${x + width - 32}" y="${y + height + 29}" class="muted" font-size="9">${esc(xLabel)}</text><text x="${x - 22}" y="${y + 5}" class="muted" font-size="9">${esc(String(yMax))}</text><text x="${x - 22}" y="${y + height}" class="muted" font-size="9">0</text><text x="${x}" y="${y - 1}" class="muted" font-size="8">${esc(yLabel)}</text>`;
}

export function buildTimeline(analysis) {
  const width = 1120, columnWidth = 360, chartHeight = 92, rowGap = 50, chartRows = 5;
  const height = 96 + chartRows * (chartHeight + rowGap) + 24;
  let svg = svgStart(width, height, 'W1 cell-local supported-spell shadow · observed full timeline');
  svg += `<text x="24" y="50" class="muted" font-size="12">Three frozen seeds · dots are exact archive observations · no between-sample activity inferred · time 0–599.25 s</text>`;
  analysis.seeds.forEach((seed, column) => {
    const x0 = 22 + column * columnWidth;
    svg += `<text x="${x0}" y="76" font-size="14" font-weight="700">seed ${seed.seed}</text>`;
    const frames = seed.timeline, maxTime = frames.at(-1).timeSeconds;
    const specs = [
      { title: 'ID 0 survival + local event timing', yMax: 1, yLabel: 'alive / event', draw: (x, y, w, h) => {
        const alive = frames.map(frame => ({ x: frame.timeSeconds, y: frame.id0Alive ? 1 : 0 }));
        const events = frames.filter(frame => frame.eventCount > 0).map(frame => ({ x: frame.timeSeconds, y: Math.min(0.4, frame.eventCount / Math.max(1, ...frames.map(value => value.eventCount)) * 0.4) }));
        return dots(alive, { x, y, color: COLORS.alive, xMax: maxTime, yMax: 1, width: w, height: h, radius: 1.1 }) + dots(events, { x, y, color: COLORS.primary, xMax: maxTime, yMax: 1, width: w, height: h, radius: 1.4 });
      } },
      { title: 'Local event cell area per observation', yMax: Math.max(1, ...frames.map(frame => frame.eventCellCount)), yLabel: 'cells / sample', draw: (x, y, w, h, yMax) => dots(frames.map(frame => ({ x: frame.timeSeconds, y: frame.eventCellCount })), { x, y, color: COLORS.primary, xMax: maxTime, yMax, width: w, height: h, radius: 1.2 }) },
      { title: 'New vs repeated local area per observation', yMax: Math.max(1, ...frames.flatMap(frame => [frame.newEventCells, frame.repeatedEventCells])), yLabel: 'cells / sample', draw: (x, y, w, h, yMax) => dots(frames.map(frame => ({ x: frame.timeSeconds, y: frame.newEventCells })), { x, y, color: COLORS.newCell, xMax: maxTime, yMax, width: w, height: h, radius: 1.2 }) + dots(frames.map(frame => ({ x: frame.timeSeconds, y: frame.repeatedEventCells })), { x, y, color: COLORS.overlap, xMax: maxTime, yMax, width: w, height: h, radius: 1.2 }) },
      { title: 'ID 0 historical union vs current active area', yMax: Math.max(1, ...frames.flatMap(frame => [frame.id0HistoricalCells, frame.id0CurrentActiveCells])), yLabel: 'cells', draw: (x, y, w, h, yMax) => dots(frames.map(frame => ({ x: frame.timeSeconds, y: frame.id0HistoricalCells })), { x, y, color: COLORS.historical, xMax: maxTime, yMax, width: w, height: h, radius: 1.1 }) + dots(frames.map(frame => ({ x: frame.timeSeconds, y: frame.id0CurrentActiveCells })), { x, y, color: COLORS.active, xMax: maxTime, yMax, width: w, height: h, radius: 1.1 }) },
      { title: 'Existing frozen union: original W1 vs max-overlap', yMax: Math.max(1, ...frames.flatMap(frame => [frame.baselineFrozenCells, frame.candidateFrozenCells])), yLabel: 'cells', draw: (x, y, w, h, yMax) => dots(frames.map(frame => ({ x: frame.timeSeconds, y: frame.baselineFrozenCells })), { x, y, color: COLORS.baseline, xMax: maxTime, yMax, width: w, height: h, radius: 1.1 }) + dots(frames.map(frame => ({ x: frame.timeSeconds, y: frame.candidateFrozenCells })), { x, y, color: COLORS.candidate, xMax: maxTime, yMax, width: w, height: h, radius: 1.1 }) }
    ];
    specs.forEach((spec, row) => {
      const chartX = x0 + 35, chartY = 104 + row * (chartHeight + rowGap), plotWidth = 290;
      svg += chartFrame({ title: spec.title, x: chartX, y: chartY, width: plotWidth, height: chartHeight,
        xMax: maxTime, yMax: spec.yMax, xLabel: 'time seconds', yLabel: spec.yLabel });
      svg += spec.draw(chartX, chartY, plotWidth, chartHeight, spec.yMax);
    });
  });
  svg += `<g transform="translate(24 ${height - 12})"><circle r="4" fill="${COLORS.alive}"/><text x="9" y="4" font-size="10">ID 0 alive</text><circle cx="92" r="4" fill="${COLORS.primary}"/><text x="101" y="4" font-size="10">local event</text><circle cx="192" r="4" fill="${COLORS.newCell}"/><text x="201" y="4" font-size="10">new area</text><circle cx="274" r="4" fill="${COLORS.overlap}"/><text x="283" y="4" font-size="10">repeated area</text><circle cx="395" r="4" fill="${COLORS.historical}"/><text x="404" y="4" font-size="10">ID 0 history</text><circle cx="495" r="4" fill="${COLORS.active}"/><text x="504" y="4" font-size="10">ID 0 current active</text><circle cx="646" r="4" fill="${COLORS.baseline}"/><text x="655" y="4" font-size="10">original W1</text><circle cx="744" r="4" fill="${COLORS.candidate}"/><text x="753" y="4" font-size="10">max-overlap</text></g>`;
  return svg + svgEnd;
}

function cdf(values, xMax, x, y, width, height, color) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return '';
  const points = sorted.map((value, index) => [x + Math.min(xMax, value) / xMax * width, y + height - (index + 1) / sorted.length * height]);
  let path = `M ${x} ${y + height}`;
  for (const [px, py] of points) path += ` H ${px.toFixed(2)} V ${py.toFixed(2)}`;
  path += ` H ${x + width}`;
  return `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.6"/>`;
}

export function buildDistribution(analysis, kind) {
  assert.ok(kind === 'size' || kind === 'duration' || kind === 'contact-age');
  const width = 1120, columnWidth = 360, plotWidth = 280, plotHeight = 210, height = 900;
  const title = kind === 'size' ? 'Local event size distribution vs frozen W1 episode sizes (ECDF)' :
    kind === 'duration' ? 'Observed local supported-spell duration vs frozen episode persistence (ECDF)' :
      'Age of latest actual same-cell FOOT_CONTACT at spell endpoint (ECDF)';
  let svg = svgStart(width, height, title);
  svg += `<text x="24" y="50" class="muted" font-size="12">Exact measured samples · step ECDF · local completion requires an observed spell ≥20 s</text>`;
  analysis.seeds.forEach((seed, index) => {
    const x = 52 + index * columnWidth, y = 102, xMax = kind === 'size' ? Math.max(10, ...seed.eventSizes, ...seed.existingFrozenDistributions.candidate.sizes) : 600;
    const yMax = 1;
    svg += `<text x="${x}" y="83" font-size="14" font-weight="700">seed ${seed.seed}</text>`;
    svg += chartFrame({ title: kind === 'size' ? 'Fraction of episodes at or below size' : kind === 'duration' ? 'Fraction at or below observed seconds' : 'Fraction at or below contact age (seconds)', x, y, width: plotWidth, height: plotHeight, xMax, yMax, xLabel: kind === 'size' ? 'cell count' : 'seconds', yLabel: 'fraction' });
    if (kind === 'size') {
      svg += cdf(seed.eventSizes, xMax, x, y, plotWidth, plotHeight, COLORS.primary);
      svg += cdf(seed.existingFrozenDistributions.baseline.sizes, xMax, x, y, plotWidth, plotHeight, COLORS.baseline);
      svg += cdf(seed.existingFrozenDistributions.candidate.sizes, xMax, x, y, plotWidth, plotHeight, COLORS.candidate);
    } else if (kind === 'duration') {
      svg += cdf(seed.eventDurationsSeconds, xMax, x, y, plotWidth, plotHeight, COLORS.primary);
      svg += cdf(seed.existingFrozenDistributions.baseline.persistenceSeconds, xMax, x, y, plotWidth, plotHeight, COLORS.baseline);
      svg += cdf(seed.existingFrozenDistributions.candidate.persistenceSeconds, xMax, x, y, plotWidth, plotHeight, COLORS.candidate);
    } else svg += cdf(seed.eventContactAgesSeconds, xMax, x, y, plotWidth, plotHeight, COLORS.contact);
  });
  const legend = kind === 'contact-age' ? [['same-cell FOOT_CONTACT age', COLORS.contact]] :
    [['local supported spell / event', COLORS.primary], ['original W1 frozen episodes', COLORS.baseline], ['max-overlap frozen episodes', COLORS.candidate]];
  svg += `<g transform="translate(24 850)">${legend.map(([label, color], index) => `<path d="M ${index * 270} 0 h 24" stroke="${color}" stroke-width="2"/><text x="${index * 270 + 30}" y="4" font-size="10">${esc(label)}</text>`).join('')}</g>`;
  return svg + svgEnd;
}

export function buildTerminationReasons(analysis) {
  const width = 800, height = 440, bars = ['q-off', 'active-off', 'both'], colors = [COLORS.primary, COLORS.active, COLORS.overlap];
  let svg = svgStart(width, height, 'Eligible local spell termination reason');
  svg += `<text x="24" y="50" class="muted" font-size="12">Eligible spells only · q reflects cumulative qualification history, not current physical support quantity</text>`;
  const groupW = 240, maxFraction = Math.max(...analysis.seeds.flatMap(seed => bars.map(reason => seed.localSummary.eligibleTerminationReasonCounts[reason] / seed.localSummary.eligibleSpellCount)));
  analysis.seeds.forEach((seed, si) => {
    const x0 = 90 + si * groupW;
    svg += `<text x="${x0}" y="88" font-size="14" font-weight="700">seed ${seed.seed}</text>`;
    bars.forEach((reason, bi) => {
      const fraction = seed.localSummary.eligibleTerminationReasonCounts[reason] / seed.localSummary.eligibleSpellCount;
      const barX = x0 + bi * 66, barY = 350 - fraction / maxFraction * 220;
      svg += `<rect x="${barX}" y="${barY.toFixed(2)}" width="42" height="${(350 - barY).toFixed(2)}" fill="${colors[bi]}"/><text x="${barX - 5}" y="367" font-size="10">${reason}</text><text x="${barX - 4}" y="${(barY - 8).toFixed(2)}" class="muted" font-size="9">${(fraction * 100).toFixed(1)}%</text>`;
    });
  });
  svg += `<path d="M 64 350 H 776" fill="none" stroke="#82939c"/><text x="24" y="220" class="muted" font-size="10" transform="rotate(-90 24 220)">fraction of eligible spells</text>`;
  return svg + svgEnd;
}

async function run() {
  const root = resolve(process.argv[2] ?? `${PACKAGE}/results`), output = resolve(process.argv[3] ?? `${PACKAGE}/plots`);
  const analysis = JSON.parse(gunzipSync(await readFile(resolve(root, 'analysis.json.gz'))));
  assert.deepEqual(analysis.seedOrder, [20261005, 20261006, 20261007]);
  await mkdir(output, { recursive: true });
  for (const seed of analysis.seeds) {
    assert.equal(seed.timeline.length, 599);
    assert.equal(seed.milestones.length, 4);
    assert.equal(seed.milestones.at(-1).actualTimeSeconds, seed.timeline.at(-1).timeSeconds);
    await writeFile(resolve(output, `milestones-seed-${seed.seed}.svg`), buildMilestoneMap(seed.seed, seed.milestones));
  }
  await writeFile(resolve(output, 'timeline.svg'), buildTimeline(analysis));
  await writeFile(resolve(output, 'event-size-ecdf.svg'), buildDistribution(analysis, 'size'));
  await writeFile(resolve(output, 'spell-duration-ecdf.svg'), buildDistribution(analysis, 'duration'));
  await writeFile(resolve(output, 'contact-age-ecdf.svg'), buildDistribution(analysis, 'contact-age'));
  await writeFile(resolve(output, 'termination-reasons.svg'), buildTerminationReasons(analysis));
  process.stdout.write(`Wrote eight fixed-scale SVG plots for ${analysis.seeds.length} seeds.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
