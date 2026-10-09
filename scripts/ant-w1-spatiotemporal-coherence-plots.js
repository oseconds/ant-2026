import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { parseCsv } from './ant-w1-spatiotemporal-coherence-audit.js';

const PACKAGE = 'docs/ant/evidence/2026-10-09-w1-spatiotemporal-local-coherence-audit';
const GRID = 96, CELLS = GRID * GRID, TARGETS = [120, 300, 480, 599.25];
const COLORS = { background: '#101820', empty: '#172630', text: '#ecf2f4', muted: '#a7b6be',
  history: '#697a84', supported: '#47d8bd', newCell: '#86df9d', repeatCell: '#f2a65a', local: '#9380e8',
  groupSingle: '#aab3b9', groupSmall: '#4ab2dd', groupMedium: '#e3bd52', groupLarge: '#b67aef',
  largest: '#ff725e', baseline: '#58d69c', candidate: '#a78bfa', event: '#f3b752', edge: '#67b7f5',
  component: '#8e7aff', spell: '#51d6bc', marker: '#53616a' };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const json = value => value === '' ? [] : JSON.parse(value);
const num = value => Number(value);
const binLabels = ['1', '2', '3–4', '5–8', '9–16', '17–32', '33–64', '65–256', '257+'];
const edgeBinLabels = ['1', '2–4', '5–8', '9–16', '17–32', '33–64', '65–128', '129+'];

function svgStart(width, height, title, description) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><rect width="100%" height="100%" fill="${COLORS.background}"/><style>text{font-family:Arial,sans-serif;fill:${COLORS.text}}.muted{fill:${COLORS.muted}}.axis{stroke:#82939c;stroke-width:1}.grid{stroke:#45545d;stroke-width:1;stroke-dasharray:3 3}</style><title>${esc(title)}</title><desc>${esc(description)}</desc><text x="24" y="28" font-size="21" font-weight="700">${esc(title)}</text>`;
}
const svgEnd = '</svg>\n';

function checkedCells(cells) {
  assert.ok(Array.isArray(cells));
  const unique = new Set(cells);
  assert.equal(unique.size, cells.length, 'geometry has unique cells');
  for (const cell of unique) assert.ok(Number.isSafeInteger(cell) && cell >= 0 && cell < CELLS, 'cell lies in fixed 96×96 grid');
  return [...unique].sort((a, b) => a - b);
}

function cellRect(x, y, cell, size, fill) {
  const col = cell % GRID, row = Math.floor(cell / GRID);
  return `<rect x="${(x + col * size).toFixed(2)}" y="${(y + row * size).toFixed(2)}" width="${(size - .12).toFixed(2)}" height="${(size - .12).toFixed(2)}" fill="${fill}"/>`;
}

function groupFill(size) {
  if (size === 1) return COLORS.groupSingle;
  if (size <= 9) return COLORS.groupSmall;
  if (size <= 99) return COLORS.groupMedium;
  return COLORS.groupLarge;
}

function milestoneMap(seed, milestones, groups) {
  const width = 1320, panelWidth = 322, cellSize = 2.05, mapSize = GRID * cellSize;
  const rows = ['ID 0 historical union', 'Current q = 1 AND active = 1', 'Same-frame events ending at cutoff',
    'Cumulative local event union', 'Spatiotemporal groups by component area', 'Largest group footprint (observed cells)'];
  const rowHeight = 255, top = 108, height = top + rows.length * rowHeight + 35;
  let svg = svgStart(width, height, `W1 spatiotemporal coherence · seed ${seed} · fixed 96×96 maps`,
    'Exact archived cells at four nearest-observation cutoffs. No connecting paths or interpolated cells are drawn.');
  svg += `<text x="24" y="51" class="muted" font-size="12">96×96 world at identical scale · observed cells only · q/active is the exact supported mask · group colors are display bins</text>`;
  milestones.forEach((milestone, column) => {
    const px = 20 + column * panelWidth;
    svg += `<text x="${px}" y="76" font-size="15" font-weight="700">${milestone.nominalTargetSeconds} s</text><text x="${px}" y="94" class="muted" font-size="10">${milestone.cutoffTimeSeconds.toFixed(3)} s · frame ${milestone.cutoffFrameIndex} · ID 0 ${milestone.id0Alive ? 'alive' : 'closed'}</text>`;
  });
  rows.forEach((label, rowIndex) => {
    for (let column = 0; column < milestones.length; column += 1) {
      const milestone = milestones[column], panelX = 20 + column * panelWidth, panelY = top + rowIndex * rowHeight;
      const mapX = panelX + 42, mapY = panelY + 24;
      const viewGroups = groups.filter(group => group.seed === seed && group.cutoffFrameIndex === milestone.cutoffFrameIndex);
      const groupCellClass = new Map();
      for (const group of viewGroups) for (const cell of group.cellIndices) {
        const prior = groupCellClass.get(cell) ?? 0;
        groupCellClass.set(cell, Math.max(prior, group.uniqueCellCount));
      }
      const largest = [...viewGroups].sort((a, b) => b.uniqueCellCount - a.uniqueCellCount || b.spellCount - a.spellCount ||
        a.firstTerminationFrameIndex - b.firstTerminationFrameIndex || a.groupId - b.groupId)[0] ?? null;
      const largeCells = new Set(largest?.cellIndices ?? []);
      svg += `<text x="${panelX}" y="${panelY + 13}" font-size="12" font-weight="700">${esc(label)}</text><rect x="${mapX}" y="${mapY}" width="${mapSize}" height="${mapSize}" fill="${COLORS.empty}"/>`;
      let count = 0;
      if (rowIndex === 0) {
        const cells = checkedCells(milestone.id0HistoricalCellIndices); count = cells.length;
        for (const cell of cells) svg += cellRect(mapX, mapY, cell, cellSize, COLORS.history);
      } else if (rowIndex === 1) {
        const cells = checkedCells(milestone.currentSupportedCellIndices); count = cells.length;
        for (const cell of cells) svg += cellRect(mapX, mapY, cell, cellSize, COLORS.supported);
      } else if (rowIndex === 2) {
        const fresh = new Set(milestone.currentEventGeometry.flatMap(event => event.newCellIndices));
        const repeated = new Set(milestone.currentEventGeometry.flatMap(event => event.overlapCellIndices));
        count = new Set(milestone.currentEventGeometry.flatMap(event => event.cellIndices)).size;
        for (const cell of [...fresh].sort((a, b) => a - b)) svg += cellRect(mapX, mapY, cell, cellSize, COLORS.newCell);
        for (const cell of [...repeated].sort((a, b) => a - b)) svg += cellRect(mapX, mapY, cell, cellSize, COLORS.repeatCell);
      } else if (rowIndex === 3) {
        const cells = checkedCells(milestone.cumulativeLocalCellIndices); count = cells.length;
        for (const cell of cells) svg += cellRect(mapX, mapY, cell, cellSize, COLORS.local);
      } else if (rowIndex === 4) {
        count = groupCellClass.size;
        for (const cell of [...groupCellClass.keys()].sort((a, b) => a - b)) svg += cellRect(mapX, mapY, cell, cellSize, groupFill(groupCellClass.get(cell)));
      } else {
        count = largeCells.size;
        for (const cell of [...largeCells].sort((a, b) => a - b)) svg += cellRect(mapX, mapY, cell, cellSize, COLORS.largest);
      }
      const summary = milestone.summary;
      const note = rowIndex === 4 ? `${summary.groupCount.toLocaleString()} groups · largest ${summary.largestComponent.uniqueCellCount.toLocaleString()} cells · ${summary.singleCellGroupCount.toLocaleString()} one-cell groups` :
        rowIndex === 5 ? `${count.toLocaleString()} cells · ${summary.largestComponent.spellCount.toLocaleString()} spells · ${summary.largestComponent.terminationTimeCount} termination times` :
          `${count.toLocaleString()} cells`;
      svg += `<text x="${mapX}" y="${mapY + mapSize + 14}" class="muted" font-size="10">${esc(note)}</text><text x="${mapX}" y="${mapY + mapSize + 26}" class="muted" font-size="9">x: 0–95 · y: 0–95</text>`;
    }
  });
  svg += `<g transform="translate(24 ${height - 14})"><rect width="10" height="10" fill="${COLORS.history}"/><text x="14" y="9" font-size="9">ID 0 history</text><rect x="112" width="10" height="10" fill="${COLORS.supported}"/><text x="126" y="9" font-size="9">q&amp;active</text><rect x="207" width="10" height="10" fill="${COLORS.newCell}"/><text x="221" y="9" font-size="9">event new</text><rect x="294" width="10" height="10" fill="${COLORS.repeatCell}"/><text x="308" y="9" font-size="9">event repeat</text><rect x="392" width="10" height="10" fill="${COLORS.local}"/><text x="406" y="9" font-size="9">cumulative union</text><rect x="526" width="10" height="10" fill="${COLORS.groupLarge}"/><text x="540" y="9" font-size="9">group ≥100 cells</text><rect x="654" width="10" height="10" fill="${COLORS.largest}"/><text x="668" y="9" font-size="9">largest group</text></g>`;
  assert.equal((svg.match(/<rect /g) ?? []).length > 0, true);
  return svg + svgEnd;
}

function representativeMap(seed, selection, groups) {
  const width = 920, height = 520, cellSize = 3.25, mapSize = GRID * cellSize, top = 92;
  const finalFrame = Math.max(...groups.filter(group => group.seed === seed).map(group => group.cutoffFrameIndex));
  const finalGroups = groups.filter(group => group.seed === seed && group.cutoffFrameIndex === finalFrame);
  let svg = svgStart(width, height, `W1 retrospective groups · seed ${seed} · representative footprints`,
    'The smallest non-single-cell and largest unique-cell connected groups selected by documented deterministic rules. Cell geometry only; no path is drawn.');
  svg += `<text x="24" y="52" class="muted" font-size="11">Selection: ${esc(selection.selectionRule.small)} · ${esc(selection.selectionRule.largest)} · same map scale 96×96</text>`;
  for (const [index, [key, color]] of [['small', COLORS.groupSmall], ['largest', COLORS.largest]].entries()) {
    const selected = selection[key], group = finalGroups.find(item => item.groupId === selected?.groupId);
    const x = 145 + index * 430, y = top;
    if (!selected || !group) continue;
    svg += `<text x="${x}" y="${y - 18}" font-size="15" font-weight="700">${key === 'small' ? 'Small multi-cell representative' : 'Largest component'}</text><rect x="${x}" y="${y}" width="${mapSize}" height="${mapSize}" fill="${COLORS.empty}"/>`;
    for (const cell of checkedCells(group.cellIndices)) svg += cellRect(x, y, cell, cellSize, color);
    svg += `<text x="${x}" y="${y + mapSize + 18}" class="muted" font-size="10">group ${group.groupId} · ${group.spellCount.toLocaleString()} spells · ${group.uniqueCellCount.toLocaleString()} unique cells · ${group.edgeCount.toLocaleString()} edges</text><text x="${x}" y="${y + mapSize + 33}" class="muted" font-size="10">${group.terminationTimeCount} termination times · ${group.startTimeSeconds.toFixed(1)}–${group.lastTerminationTimeSeconds.toFixed(1)} s</text>`;
  }
  return svg + svgEnd;
}

function histogramBin(value, labels) {
  if (labels === binLabels) return value <= 1 ? 0 : value <= 2 ? 1 : value <= 4 ? 2 : value <= 8 ? 3 :
    value <= 16 ? 4 : value <= 32 ? 5 : value <= 64 ? 6 : value <= 256 ? 7 : 8;
  return value <= 1 ? 0 : value <= 4 ? 1 : value <= 8 ? 2 : value <= 16 ? 3 : value <= 32 ? 4 :
    value <= 64 ? 5 : value <= 128 ? 6 : 7;
}

function buildDistributionPlot(analysis, groups, edges, kind) {
  const width = 1320, height = kind === 'size' ? 620 : 570, panelWidth = 420, panelHeight = 480;
  const labels = kind === 'size' ? binLabels : edgeBinLabels, title = kind === 'size'
    ? 'W1 spatiotemporal connected-component unique-cell size distribution'
    : 'W1 concurrent-support observations per graph edge';
  const colors = [COLORS.edge, COLORS.component, COLORS.event, COLORS.largest];
  let svg = svgStart(width, height, title,
    kind === 'size' ? 'Descriptive histogram bins; component cell sets use only archived cells. No size bin filters graph membership.' :
      'Exact count of shared archived frames on each edge; edge is available only after both spells terminate.');
  svg += `<text x="24" y="50" class="muted" font-size="11">${kind === 'size' ? 'Display bins only; no component is removed.' : 'Prefix edge sets include only edges available by that observation.'} · 96×96 source grid</text>`;
  analysis.seeds.forEach((seedRow, column) => {
    const x0 = 28 + column * panelWidth, y0 = 97;
    svg += `<text x="${x0}" y="${y0 - 13}" font-size="14" font-weight="700">seed ${seedRow.seed}</text>`;
    const series = TARGETS.map((target, index) => {
      const frame = seedRow.targetFrames.find(item => item.nominalTargetSeconds === target).frameIndex;
      const values = kind === 'size'
        ? groups.filter(group => group.seed === seedRow.seed && group.cutoffFrameIndex === frame).map(group => group.uniqueCellCount)
        : edges.filter(edge => edge.seed === seedRow.seed && edge.availableAtFrameIndex <= frame).map(edge => edge.concurrentObservationCount);
      const bins = Array(labels.length).fill(0); for (const value of values) bins[histogramBin(value, labels)] += 1;
      return { target, bins, color: colors[index], total: values.length };
    });
    const plotX = x0 + 38, plotY = y0 + 18, plotW = 320, plotH = 320;
    const max = Math.max(1, ...series.flatMap(row => row.bins)), logMax = Math.log10(max + 1);
    svg += `<path d="M ${plotX} ${plotY} V ${plotY + plotH} H ${plotX + plotW}" class="axis"/>`;
    for (let tick = 0; tick <= 4; tick += 1) {
      const value = Math.round(max * tick / 4), y = plotY + plotH - (Math.log10(value + 1) / logMax) * plotH;
      svg += `<path d="M ${plotX} ${y.toFixed(2)} H ${plotX + plotW}" class="grid"/><text x="${plotX - 24}" y="${y + 3}" class="muted" font-size="9">${value}</text>`;
    }
    const groupW = plotW / labels.length;
    series.forEach((row, seriesIndex) => row.bins.forEach((value, index) => {
      const barW = Math.max(4, groupW / 5), x = plotX + index * groupW + 4 + seriesIndex * barW;
      const barH = (Math.log10(value + 1) / logMax) * plotH;
      svg += `<rect x="${x.toFixed(2)}" y="${(plotY + plotH - barH).toFixed(2)}" width="${(barW - 1).toFixed(2)}" height="${Math.max(1, barH).toFixed(2)}" fill="${row.color}"/>`;
    }));
    labels.forEach((label, index) => svg += `<text x="${(plotX + index * groupW + groupW / 2).toFixed(2)}" y="${plotY + plotH + 14}" class="muted" font-size="8" text-anchor="middle">${esc(label)}</text>`);
    svg += `<text x="${plotX}" y="${plotY + plotH + 33}" class="muted" font-size="9">${kind === 'size' ? 'unique cells per group' : 'concurrent archived observations per edge'}</text>`;
    series.forEach((row, index) => svg += `<rect x="${x0 + 38}" y="${y0 + 390 + index * 18}" width="9" height="9" fill="${row.color}"/><text x="${x0 + 52}" y="${y0 + 399 + index * 18}" font-size="9">${row.target} s · n=${row.total.toLocaleString()}</text>`);
  });
  return svg + svgEnd;
}

function buildTimeline(analysis) {
  const width = 1400, panelWidth = 445, chartHeight = 118, rowGap = 67, top = 94;
  const specs = [
    { key: 'componentCount', title: 'Connected components at each observation', color: COLORS.component },
    { key: 'largestComponentSpellFraction', title: 'Largest component share (spells)', color: COLORS.largest, max: 1 },
    { key: 'largestComponentUniqueCellFraction', title: 'Largest component share (unique cells)', color: COLORS.edge, max: 1 },
    { key: 'edgeCount', title: 'Cumulative observed concurrent-support edges', color: COLORS.spell },
    { key: 'baselineEventCountAtFrame', title: 'ID 0 survival and same-frame event creation', color: COLORS.event, id0: true }
  ];
  const height = top + specs.length * (chartHeight + rowGap) + 55;
  let svg = svgStart(width, height, 'W1 spatiotemporal graph · exact observed-prefix timeline',
    'Metrics are captured after each archived frame is processed. The vertical markers are nearest observed 120, 300, 480 and 599.25 second cutoffs.');
  svg += `<text x="24" y="52" class="muted" font-size="11">One point per archived observation · no natural run · event nodes enter only at their termination frame</text>`;
  analysis.seeds.forEach((seedRow, column) => {
    const x0 = 28 + column * panelWidth;
    svg += `<text x="${x0}" y="78" font-size="14" font-weight="700">seed ${seedRow.seed}</text>`;
    specs.forEach((spec, rowIndex) => {
      const plotX = x0 + 42, plotY = top + rowIndex * (chartHeight + rowGap), plotW = panelWidth - 80, plotH = chartHeight;
      const rows = seedRow.timeline, xMax = rows.at(-1).timeSeconds, yMax = spec.max ?? Math.max(1, ...rows.map(row => row[spec.key]));
      svg += `<text x="${plotX}" y="${plotY - 8}" font-size="10" font-weight="700">${esc(spec.title)}</text><path d="M ${plotX} ${plotY} V ${plotY + plotH} H ${plotX + plotW}" class="axis"/>`;
      for (const target of seedRow.targetFrames) {
        const x = plotX + target.actualTimeSeconds / xMax * plotW;
        svg += `<path d="M ${x.toFixed(2)} ${plotY} V ${plotY + plotH}" stroke="${COLORS.marker}" stroke-dasharray="3 4"/><text x="${x.toFixed(2)}" y="${plotY - 1}" class="muted" font-size="7" text-anchor="middle">${target.nominalTargetSeconds}</text>`;
      }
      let path = '';
      rows.forEach((row, index) => {
        const x = plotX + row.timeSeconds / xMax * plotW;
        const value = spec.id0 ? row[spec.key] / Math.max(1, ...rows.map(frame => frame[spec.key])) : row[spec.key];
        const y = plotY + plotH - value / (spec.id0 ? 1 : yMax) * plotH;
        path += `${index ? ' L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      });
      svg += `<path d="${path}" fill="none" stroke="${spec.color}" stroke-width="1.5"/>`;
      if (spec.id0) {
        const alivePath = rows.map((row, index) => {
          const x = plotX + row.timeSeconds / xMax * plotW, y = plotY + plotH - (row.id0Alive ? .82 : .18) * plotH;
          return `${index ? ' L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join('');
        svg += `<path d="${alivePath}" fill="none" stroke="${COLORS.baseline}" stroke-width="1.4"/>`;
      }
      for (const value of [0, yMax]) {
        const y = plotY + plotH - value / yMax * plotH;
        svg += `<text x="${plotX - 28}" y="${y + 3}" class="muted" font-size="8">${Number(value.toPrecision(2)).toLocaleString('en-US')}</text>`;
      }
      svg += `<text x="${plotX}" y="${plotY + plotH + 14}" class="muted" font-size="8">0 s</text><text x="${plotX + plotW - 30}" y="${plotY + plotH + 14}" class="muted" font-size="8">599.25 s</text>`;
      if (spec.id0) svg += `<text x="${plotX + 2}" y="${plotY + 12}" class="muted" font-size="8">green = ID 0 alive · event curve is normalized within seed</text>`;
    });
  });
  return svg + svgEnd;
}

export function buildMilestoneMapForTest(seed, milestones, groups) { return milestoneMap(seed, milestones, groups); }

async function run() {
  const resultsPath = resolve(process.argv[2] ?? `${PACKAGE}/results`), outputPath = resolve(process.argv[3] ?? `${PACKAGE}/plots`);
  const analysis = JSON.parse(gunzipSync(await readFile(resolve(resultsPath, 'analysis.json.gz'))));
  const groups = parseCsv(gunzipSync(await readFile(resolve(resultsPath, 'groups.csv.gz'))).toString('utf8')).map(row => ({
    ...row, seed: num(row.seed), cutoffFrameIndex: num(row.cutoffFrameIndex), groupId: num(row.groupId),
    uniqueCellCount: num(row.uniqueCellCount), spellCount: num(row.spellCount), edgeCount: num(row.edgeCount),
    firstTerminationFrameIndex: num(row.firstTerminationFrameIndex),
    terminationTimeCount: num(row.terminationTimeCount), startTimeSeconds: num(row.startTimeSeconds),
    lastTerminationTimeSeconds: num(row.lastTerminationTimeSeconds), baselineEventCount: num(row.baselineEventCount),
    cellIndices: json(row.cellIndices) }));
  const edges = parseCsv(gunzipSync(await readFile(resolve(resultsPath, 'concurrent-edges.csv.gz'))).toString('utf8')).map(row => ({
    seed: num(row.seed), concurrentObservationCount: num(row.concurrentObservationCount), availableAtFrameIndex: num(row.availableAtFrameIndex) }));
  assert.equal(analysis.seeds.length, 3); assert.equal(groups.every(row => row.cellIndices.length === row.uniqueCellCount), true);
  const files = {};
  for (const seed of analysis.seeds) {
    const name = String(seed.seed);
    const milestones = seed.milestones.map(item => ({ ...item, summary: seed.summaryByTarget.find(row =>
      row.nominalTargetSeconds === item.nominalTargetSeconds) }));
    files[`milestones-seed-${name}.svg`] = milestoneMap(seed.seed, milestones, groups);
    files[`representatives-seed-${name}.svg`] = representativeMap(seed.seed, seed.representatives, groups);
  }
  files['timeline.svg'] = buildTimeline(analysis);
  files['component-sizes.svg'] = buildDistributionPlot(analysis, groups, edges, 'size');
  files['concurrent-observations.svg'] = buildDistributionPlot(analysis, groups, edges, 'edge');
  await mkdir(outputPath, { recursive: true });
  const manifest = { schemaVersion: 1, grid: [GRID, GRID], sameScaleAllSeedsAndCutoffs: true,
    plots: Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, text]) => {
      const bytes = Buffer.from(text); await writeFile(resolve(outputPath, name), bytes);
      return [name, { sha256: sha(bytes), bytes: bytes.length }];
    }))), representativeSelection: analysis.seeds.map(seed => ({ seed: seed.seed, ...seed.representatives })),
    componentSizeBins: binLabels, edgeConcurrencyBins: edgeBinLabels,
    geometricRendering: 'individual source cells only; no lines, interpolation or invented connection paths' };
  await writeFile(resolve(outputPath, 'plot-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run();
