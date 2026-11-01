import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(ROOT, 'docs/ant/evidence/2026-11-01-bc-local-conflict-decomposition');
const GRID = 96, W = 1280, CARD_W = 620, CARD_H = 500, MAP = 420;
const sha = data => createHash('sha256').update(data).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const componentColor = index => `hsl(${(index * 137.508) % 360} 68% 38%)`;

function outline(cells, x0, y0, size) {
  const mask = new Set(cells), step = size / (GRID - 1), half = step / 2, path = [];
  for (const cell of cells) {
    const col = cell % GRID, row = Math.floor(cell / GRID), x = x0 + col * step, y = y0 + row * step;
    if (row === 0 || !mask.has(cell - GRID)) path.push(`M${(x-half).toFixed(2)} ${(y-half).toFixed(2)}H${(x+half).toFixed(2)}`);
    if (col === GRID - 1 || !mask.has(cell + 1)) path.push(`M${(x+half).toFixed(2)} ${(y-half).toFixed(2)}V${(y+half).toFixed(2)}`);
    if (row === GRID - 1 || !mask.has(cell + GRID)) path.push(`M${(x-half).toFixed(2)} ${(y+half).toFixed(2)}H${(x+half).toFixed(2)}`);
    if (col === 0 || !mask.has(cell - 1)) path.push(`M${(x-half).toFixed(2)} ${(y-half).toFixed(2)}V${(y+half).toFixed(2)}`);
  }
  return path.join('');
}

async function main() {
  const cases = await readJson(resolve(OUT, 'analysis/objective-cases.json'));
  const slotsBySeed = new Map();
  for (const seed of ['20261005', '20261006', '20261007']) {
    const packet = JSON.parse(gunzipSync(await readFile(resolve(OUT, `analysis/conflict-slots-${seed}.json.gz`))));
    slotsBySeed.set(seed, new Map(packet.slots.map(slot => [slot.anchorIndex, slot])));
  }
  const selected = [];
  for (const item of cases.cases) {
    if (item.status === 'none') { selected.push({ id: item.id, criterion: item.criterion, status: 'none' }); continue; }
    const row = item.selected, slot = slotsBySeed.get(row.seed)?.get(row.anchorIndex);
    assert.ok(slot, `${item.id}: exact selected slot receipt exists`);
    assert.equal(slot.timeMs, row.timeMs, `${item.id}: exact saved timestamp`);
    assert.equal(slot.nodes.length, row.uniqueSpatialOptionCount, `${item.id}: all unique X options present`);
    const componentByOption = new Map(slot.components.flatMap(component => component.memberOptionIds.map(optionId => [optionId, component])));
    assert.equal(componentByOption.size, slot.nodes.length, `${item.id}: each option belongs to one overlap component`);
    selected.push({ id: item.id, criterion: item.criterion, status: 'selected', seed: row.seed,
      anchorIndex: row.anchorIndex, timeMs: row.timeMs, slot, componentByOption });
  }
  assert.equal(selected.length, cases.cases.length);

  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.ceil(selected.length/2)*CARD_H+104}" viewBox="0 0 ${W} ${Math.ceil(selected.length/2)*CARD_H+104}">`,
    '<rect width="100%" height="100%" fill="#f5f7fa"/>',
    '<text x="24" y="34" font-size="24" font-weight="700" fill="#18232e">B/C mature X overlap · local conflict atlas</text>',
    '<text x="24" y="58" font-size="13" fill="#485463">Exact saved slots and X masks. Each color marks an overlap-connected component; every X has equal status. No winner or commit is selected.</text>',
    '<text x="24" y="80" font-size="12" fill="#485463">Each tile shows the registered 96×96 X cell geometry on a neutral grid; hues are component labels only, not B/C material properties.</text>'];
  let renderedOptions = 0;
  selected.forEach((item, index) => {
    const x = 20 + (index % 2) * (CARD_W + 20), y = 98 + Math.floor(index / 2) * CARD_H;
    parts.push(`<g transform="translate(${x} ${y})"><rect x="0" y="0" width="${CARD_W}" height="${CARD_H-14}" rx="8" fill="#fff" stroke="#d5dce3"/>`);
    if (item.status === 'none') {
      parts.push(`<text x="16" y="28" font-size="17" font-weight="700">${esc(item.id)} · none</text><text x="16" y="56" font-size="12" fill="#485463">${esc(item.criterion)}</text><text x="16" y="105" font-size="14" fill="#485463">No slot contained a coeval {B,C} option with an overlapping distinct X.</text></g>`);
      return;
    }
    const slot = item.slot, step = MAP/(GRID-1), mapX = 18, mapY = 56;
    const clipId = `clip-${index}`;
    parts.push(`<text x="16" y="27" font-size="16" font-weight="700">${esc(item.id)} · ${item.seed} · ${(item.timeMs/1000).toFixed(3)} s</text>`);
    parts.push(`<text x="16" y="47" font-size="11" fill="#485463">${slot.nodes.length} X · ${slot.components.length} components · ${slot.singletonComponentCount} singleton · largest ${slot.largestComponentSize}</text>`);
    parts.push(`<rect x="${mapX}" y="${mapY}" width="${MAP}" height="${MAP}" fill="#fbfcfd" stroke="#71808d" stroke-width="1"/>`);
    for (let tick = 0; tick <= 4; tick++) {
      const p = mapX + tick * MAP/4, q = mapY + tick * MAP/4;
      parts.push(`<path d="M${p} ${mapY}V${mapY+MAP} M${mapX} ${q}H${mapX+MAP}" stroke="#e7ebef" stroke-width="1"/>`);
      parts.push(`<text x="${p}" y="${mapY+MAP+14}" text-anchor="middle" font-size="9" fill="#63717d">${(tick/4).toFixed(2)}</text>`);
    }
    parts.push(`<defs><clipPath id="${clipId}"><rect x="${mapX}" y="${mapY}" width="${MAP}" height="${MAP}"/></clipPath></defs><g clip-path="url(#${clipId})">`);
    const ordered = [...slot.nodes].sort((a,b) => a.optionId.localeCompare(b.optionId));
    for (const option of ordered) {
      const component = item.componentByOption.get(option.optionId), componentIndex = slot.components.indexOf(component);
      const color = componentColor(componentIndex);
      parts.push(`<path d="${outline(option.xCells, mapX, mapY, MAP)}" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="square" vector-effect="non-scaling-stroke" data-option="${esc(option.optionId)}" data-component="${component.componentId}"/>`);
      renderedOptions++;
    }
    parts.push('</g>');
    const legendX = 458, legendY = 70, lineHeight = 17;
    ordered.forEach(option => {
      const component = item.componentByOption.get(option.optionId), ci = slot.components.indexOf(component);
      const row = legendY + ordered.indexOf(option)*lineHeight, color = componentColor(ci);
      const compact = `${component.componentId.slice(2)} / ${option.optionId.slice(0,4)} / ${option.composition === '{B,C}' ? 'BC' : option.composition[0]} / ${option.xNodeCount}c`;
      parts.push(`<rect x="${legendX}" y="${row-9}" width="10" height="10" fill="none" stroke="${color}" stroke-width="2"/><text x="${legendX+15}" y="${row}" font-size="9" fill="#34414c">${esc(compact)}</text>`);
    });
    assert.ok(legendY + ordered.length*lineHeight < CARD_H-28, `${item.id}: option legend fits its panel`);
    parts.push(`<text x="16" y="${CARD_H-34}" font-size="9.5" fill="#485463">Criterion: ${esc(item.criterion)}</text>`);
    parts.push('</g>');
  });
  parts.push('</svg>');
  const svg = Buffer.from(parts.join(''));
  assert.equal((svg.toString('utf8').match(/data-option=/g) ?? []).length, renderedOptions,
    'every selected mature X has one equal-status outline');
  const svgPath = resolve(OUT, 'visual/conflict-component-atlas.svg');
  await mkdir(resolve(OUT, 'visual'), { recursive: true });
  await writeFile(svgPath, svg);
  await writeFile(resolve(OUT, 'analysis/visualization-validation.json'), JSON.stringify({
    schema: 'ant-bc-local-conflict-atlas-validation-v1', sourceSlots: selected.filter(row => row.status === 'selected').map(row => ({
      caseId: row.id, seed: row.seed, anchorIndex: row.anchorIndex, timeMs: row.timeMs,
      optionCount: row.slot.nodes.length, outlinedOptionCount: row.slot.nodes.length,
      componentCount: row.slot.components.length })),
    noReplayOrNewNaturalWorld: true, sourceMasksUsedDirectly: true, gridSize: GRID,
    vectorFormat: 'SVG 1.1', dimensions: { width: W, height: Math.ceil(selected.length/2)*CARD_H+104 },
    svgBytes: svg.length, svgSha256: sha(svg),
    rasterPreview: 'not produced; the sandbox denied Chrome process launch (EPERM), and the installed ffmpeg lacks an SVG decoder.'
  }, null, 2) + '\n');
  console.log(JSON.stringify({ complete: true, cases: selected.length, outlinedOptions: renderedOptions,
    svgBytes: svg.length, svgSha256: sha(svg) }));
}

await main();
