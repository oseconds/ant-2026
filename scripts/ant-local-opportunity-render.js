import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { readRun } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EVIDENCE = resolve(ROOT, 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit');
const ANALYSIS = resolve(EVIDENCE, 'analysis'), DEFAULT_VISUAL = resolve(EVIDENCE, 'visual');
let VISUAL = DEFAULT_VISUAL;
const SEEDS = ['20261005', '20261006', '20261007'], TIMES = [60, 120, 300, 600], GRID = 96, COUNT = GRID * GRID;
const CHANNELS = ['E', 'F', 'D', 'B', 'C', 'feet1', 'feet5', 'feet20', 'travel1', 'travel5', 'travel20',
  'deltaD1', 'deltaD5', 'deltaD20', 'deltaB1', 'deltaB5', 'deltaB20', 'deltaC5'];
const SELECTED = ['D', 'B', 'C', 'feet5', 'travel5', 'deltaD5', 'deltaB5', 'deltaC5'];
const UNIT = name => name === 'E' || name === 'F' ? 'binary' : name === 'D' ? 'support@.025' : name === 'B' ? 'bounded chem. memory' : name === 'C' ? 'normalized compaction'
  : name.startsWith('feet') ? `contacts/cell/${name.slice(4)}s` : name.startsWith('travel') ? `world units/${name.slice(6)}s`
    : name.startsWith('delta') ? `Δ${name[5]}/${name.slice(6)}s` : '';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const svgDimensions = svg => {
  const source = Buffer.isBuffer(svg) ? svg.toString('utf8', 0, Math.min(svg.length, 256)) : String(svg).slice(0, 256);
  const match = source.match(/<svg[^>]*width="(\d+)"[^>]*height="(\d+)"/);
  assert.ok(match, 'SVG width and height present');
  return { width: Number(match[1]), height: Number(match[2]) };
};
export function outputDirectory(args = []) {
  const option = args.find(arg => arg.startsWith('--out='));
  const target = resolve(ROOT, option ? option.slice('--out='.length) : DEFAULT_VISUAL);
  const within = relative(ROOT, target);
  assert.ok(within && within !== '..' && !within.startsWith('..' + sep) && !isAbsolute(within),
    '--out must resolve inside the repository');
  return target;
}

export function unpack(packed, expectedLength = COUNT) {
  if (!packed) return null;
  assert.equal(packed.length, expectedLength, 'packed array length');
  const raw = Buffer.from(packed.data, 'base64');
  const types = { Uint8Array: [Uint8Array, 1, 'getUint8'], Uint16Array: [Uint16Array, 2, 'getUint16'], Uint32Array: [Uint32Array, 4, 'getUint32'],
    Float32Array: [Float32Array, 4, 'getFloat32'], Float64Array: [Float64Array, 8, 'getFloat64'], Int8Array: [Int8Array, 1, 'getInt8'],
    Int16Array: [Int16Array, 2, 'getInt16'], Int32Array: [Int32Array, 4, 'getInt32'] };
  const [Type, width, getter] = types[packed.type] || [];
  assert.ok(Type, 'known packed typed array'); assert.equal(raw.byteLength, packed.length * width, 'packed byte length');
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), output = new Type(packed.length);
  for (let i = 0; i < output.length; i++) output[i] = view[getter](i * width, width > 1);
  return output;
}

export function fixedAnchor(run, requestedSeconds) {
  const capture = run.captures.find(row => (row.requestedSeconds ?? row.seconds) === requestedSeconds);
  assert.ok(capture, 'fixed frame capture exists at ' + requestedSeconds + ' s');
  const index = capture.anchorIndex;
  const anchor = Number.isInteger(index) ? run.anchors[index] : run.anchors.find(row => row.timeMs === capture.analysisTimeMs);
  assert.ok(anchor, 'capture joins exact signal anchor');
  assert.equal(anchor.index, capture.anchorIndex ?? anchor.index, 'capture anchor index agrees');
  assert.equal(anchor.timeMs, capture.analysisTimeMs, 'capture analysis time exactly matches anchor time');
  return { capture, anchor };
}

function opportunityAt(opportunities, anchor) {
  return opportunities?.anchors?.find(row => row.index === anchor.index && row.timeMs === anchor.timeMs) || null;
}
function channelData(anchor, opAnchor, name) {
  const packedName = name.startsWith('delta') ? name : ({ feet1: 'feet1', feet5: 'feet5', feet20: 'feet20', travel1: 'travel1', travel5: 'travel5', travel20: 'travel20' }[name] || name);
  if (name.startsWith('delta')) return unpack(opAnchor?.delta?.[name] || opAnchor?.channels?.[name]?.raw);
  if (name.startsWith('feet')) return unpack(anchor.feet?.[name.slice(4)]?.count);
  if (name.startsWith('travel')) return unpack(anchor.traffic?.[name.slice(6)]?.travel);
  return unpack(anchor[packedName]);
}
function rowsAt(opAnchor, name, representation = 'g15') {
  const channel = opAnchor?.channels?.[name];
  const rows = channel?.[representation] || channel?.maxima || channel?.rows || [];
  return Array.isArray(rows) ? rows : [];
}
function rowCell(row) {
  if (Number.isInteger(row.index)) return row.index;
  if (Number.isInteger(row.cell)) return row.cell;
  if (Number.isInteger(row.centerIndex)) return row.centerIndex;
  if (Number.isInteger(row.center)) return row.center;
  return Number.isInteger(row.x) && Number.isInteger(row.y) ? row.y * GRID + row.x : -1;
}
function peaks(opAnchor, name, representation) { return rowsAt(opAnchor, name, representation).map(rowCell).filter(cell => cell >= 0 && cell < COUNT); }

function color(value, min, max, signed) {
  if (signed) {
    const q = Math.max(-1, Math.min(1, value / max));
    return q < 0 ? `rgb(${Math.round(245 + 10 * q)},${Math.round(245 + 20 * q)},${Math.round(245 + 190 * -q)})`
      : `rgb(${Math.round(245 - 190 * q)},${Math.round(245 - 165 * q)},${Math.round(245 - 130 * q)})`;
  }
  const q = Math.max(0, Math.min(1, (value - min) / Math.max(Number.EPSILON, max - min)));
  return `rgb(${Math.round(248 - q * 190)},${Math.round(250 - q * 95)},${Math.round(252 - q * 20)})`;
}
function nice(v) { return Number.isFinite(v) ? Number(v.toPrecision(3)) : 0; }
function maxAbs(arrays) { return Math.max(1e-12, ...arrays.map(a => a ? Math.max(...a.map(Math.abs)) : 0)); }

export function atlasSvg({ seed, requestedSeconds, capture, anchor, opAnchor, scales }) {
  const cols = 6, tile = 154, gap = 10, left = 12, top = 76, labelH = 21, footer = 42;
  const rows = Math.ceil(CHANNELS.length / cols), width = left * 2 + cols * (tile + gap) - gap,
    height = top + rows * (tile + labelH + gap) + footer;
  const cells = [];
  for (let i = 0; i < CHANNELS.length; i++) {
    const name = CHANNELS[i], values = channelData(anchor, opAnchor, name);
    assert.ok(values, 'raster available: ' + name);
    const x = left + (i % cols) * (tile + gap), y = top + Math.floor(i / cols) * (tile + labelH + gap), px = tile / GRID;
    const isSigned = name.startsWith('delta'), upper = isSigned ? scales.signed[name] : scales[name];
    cells.push(`<text x="${x}" y="${y - 11}" class="label">${esc(name)}</text><text x="${x}" y="${y - 2}" class="unit">${esc(UNIT(name))} · ${isSigned ? `±${nice(upper)}` : `0–${nice(upper)}`}</text>`);
    cells.push(`<rect x="${x}" y="${y}" width="${tile}" height="${tile}" fill="#fbfcfd"/>`);
    for (let c = 0; c < COUNT; c++) {
      const value = values[c]; if (!Number.isFinite(value) || value === 0) continue;
      cells.push(`<rect x="${(x + c % GRID * px).toFixed(2)}" y="${(y + Math.floor(c / GRID) * px).toFixed(2)}" width="${px + .1}" height="${px + .1}" fill="${color(value, 0, upper, isSigned)}"/>`);
    }
    const marks = peaks(opAnchor, name, 'raw');
    for (const cell of marks) cells.push(`<circle cx="${x + (cell % GRID + .5) * px}" cy="${y + (Math.floor(cell / GRID) + .5) * px}" r="1.4" fill="#18222e" fill-opacity=".62"/>`);
    if (marks.length) {
      const representative = peaks(opAnchor, name, 'g15');
      for (const cell of representative) cells.push(`<circle cx="${x + (cell % GRID + .5) * px}" cy="${y + (Math.floor(cell / GRID) + .5) * px}" r="4.4" fill="none" stroke="#d3412f" stroke-width="1.3"/>`);
    }
    if (name === 'D') {
      cells.push(`<circle cx="${x + .5 * tile}" cy="${y + .72 * tile}" r="${.15 * tile}" fill="none" stroke="#7356a7" stroke-width="1.4" stroke-dasharray="4 3"/>`);
    }
    cells.push(`<rect x="${x}" y="${y}" width="${tile}" height="${tile}" fill="none" stroke="#aab5c2"/>`);
  }
  const time = (capture.analysisTimeMs ?? anchor.timeMs) / 1000, frame = (capture.frameTimeMs ?? capture.requestedSeconds * 1000) / 1000;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:Arial,sans-serif;fill:#17202b}.title{font-size:20px;font-weight:bold}.sub{font-size:12px;fill:#485463}.label{font-size:10.5px;font-weight:bold}.unit{font-size:8.5px;fill:#465362}</style><rect width="100%" height="100%" fill="white"/><text x="12" y="26" class="title">Seed ${seed} · local opportunity technical raster atlas</text><text x="12" y="47" class="sub">Requested frame ${frame.toFixed(3)} s · exact analysis anchor ${time.toFixed(3)} s (tick ${anchor.tick}) · full normalized x/y 0–1 · grid row y increases downward</text>${cells.join('')}<text x="12" y="${height - 20}" class="sub">Each channel uses one fixed native scale shared across seeds/times; color intensity is not comparable across channels. Dark dots: raw maxima; red rings: g15 centers. Dashed ring: .15 radius around entry center (.5,.72).</text></svg>`;
}

export function associatedXSvg({ seed, requestedSeconds, capture, anchor, opAnchor, scales }) {
  const size = 224, panelW = 250, panelH = 294, gapX = 14, left = 16, top = 82, cols = 3, rows = 3;
  const width = left * 2 + cols * panelW + (cols - 1) * gapX, height = top + rows * panelH + 45;
  const px = size / GRID, Xs = opAnchor?.captures || [], F = unpack(anchor.F);
  const rankColors = ['#c43b32', '#1578b5', '#da8b16'];
  const layerColors = [];
  const addMap = (x, y, values, fill) => {
    for (let cell = 0; cell < COUNT; cell++) if (values[cell]) {
      const color = fill(cell, values[cell]);
      if (color) layerColors.push(`<rect x="${x + cell % GRID * px}" y="${y + Math.floor(cell / GRID) * px}" width="${px + .08}" height="${px + .08}" ${color}/>`);
    }
  };
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const x = left + (i % cols) * (panelW + gapX), y = top + Math.floor(i / cols) * panelH, mx = x + 10, my = y + 20;
    const materialPanel = i === 8, channel = SELECTED[i], panelLabel = materialPanel ? 'Existing material layers' : `${channel} · ${UNIT(channel)}`;
    parts.push(`<text x="${x}" y="${y + 12}" class="label">${esc(panelLabel)}</text>`);
    parts.push(`<rect x="${mx}" y="${my}" width="${size}" height="${size}" fill="#fbfcfd"/>`);
    if (materialPanel) {
      const layers = unpack(anchor.material?.layers); assert.ok(layers, 'material layer raster available');
      addMap(mx, my, layers, (_cell, value) => {
        const shade = Math.round(245 - 160 * Math.min(1, value / scales.materialLayers));
        return `fill="rgb(${shade},${shade},${shade})"`;
      });
      parts.push(...layerColors.splice(0));
      parts.push(`<text x="${mx}" y="${my + size + 13}" class="legend">Global layer scale 0–${nice(scales.materialLayers)} · reference only</text>`);
    } else {
      addMap(mx, my, F, () => 'fill="#e3e8ec"'); parts.push(...layerColors.splice(0));
      const ranked = rowsAt(opAnchor, channel, 'g15').slice(0, 3).map((row, rank) => ({ row, rank, cell: rowCell(row), capture: Xs.find(item => item.id === row.captureId) }))
        .filter(item => item.cell >= 0 && item.capture);
      const painted = new Set();
      for (const item of ranked) if (!painted.has(item.capture.id)) {
        painted.add(item.capture.id);
        const cells = Uint8Array.from({ length: COUNT }, () => 0); for (const cell of item.capture.cells) cells[cell] = 1;
        addMap(mx, my, cells, () => `fill="${rankColors[item.rank]}" fill-opacity=".22"`); parts.push(...layerColors.splice(0));
      }
      for (const item of ranked) {
        const cx = mx + (item.cell % GRID + .5) * px, cy = my + (Math.floor(item.cell / GRID) + .5) * px;
        parts.push(`<circle cx="${cx}" cy="${cy}" r="3.1" fill="${rankColors[item.rank]}" stroke="white" stroke-width=".8"/>`);
        parts.push(`<text x="${cx + 3}" y="${cy + 2.5}" class="rank" style="fill:${rankColors[item.rank]}">r${item.rank + 1}</text>`);
      }
      for (let rank = 0; rank < 3; rank++) {
        const item = ranked.find(entry => entry.rank === rank), ly = my + size + 13 + rank * 12;
        parts.push(item ? `<text x="${mx}" y="${ly}" class="legend" style="fill:${rankColors[rank]}">r${rank + 1} · ${esc(item.capture.id)} · n=${item.capture.nodeCount}</text>`
          : `<text x="${mx}" y="${ly}" class="legend muted">r${rank + 1} · no g15 center</text>`);
      }
    }
    parts.push(`<rect x="${mx}" y="${my}" width="${size}" height="${size}" fill="none" stroke="#aab5c2"/>`);
  }
  const time = (capture.analysisTimeMs ?? anchor.timeMs) / 1000;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:Arial,sans-serif;fill:#17202b}.title{font-size:19px;font-weight:bold}.sub{font-size:11px;fill:#465362}.label{font-size:11px;font-weight:bold}.legend{font-size:8.5px}.rank{font-size:7px;font-weight:bold;paint-order:stroke;stroke:white;stroke-width:1.8px}.muted{fill:#818b96}</style><rect width="100%" height="100%" fill="white"/><text x="${left}" y="25" class="title">Seed ${seed} · associated X and material · ${requestedSeconds}s frame</text><text x="${left}" y="45" class="sub">Analysis anchor ${time.toFixed(3)} s · eight source channels shown separately · full normalized x/y 0–1, y down.</text><text x="${left}" y="63" class="sub">Grey: F mask. Rank-color fills: exact X F-cell membership. r1/r2/r3 show top three g15 centers within each channel; their IDs and node counts appear below each map.</text>${parts.join('')}<text x="${left}" y="${height - 10}" class="sub">Illustrative top three only; machine receipts retain all maxima, groups, captures and material records. No ranking across channels.</text></svg>`;
}

function pathFor(values, x, y, w, h, min, max) {
  if (!values.length) return '';
  const span = Math.max(Number.EPSILON, max - min);
  return values.map((point, i) => `${i ? 'L' : 'M'}${(x + point.t * w).toFixed(2)},${(y + h - (point.v - min) / span * h).toFixed(2)}`).join(' ');
}
export function caseSvg({ item, run, opportunities, cases }) {
  const observations = item.observations || [];
  assert.ok(observations.length >= 2, 'case has at least two observations');
  const start = observations[0].timeMs, end = observations.at(-1).timeMs, span = Math.max(1, end - start);
  const panels = [
    ['B', o => sampleAt(run, opportunities, o, 'B'), 'B at tracked center · bounded chemical memory'], ['C', o => sampleAt(run, opportunities, o, 'C'), 'C at tracked center · normalized compaction'],
    ['D', o => sampleAt(run, opportunities, o, 'D'), 'D at tracked center · support (.025)'], ['deltaD5', o => sampleAt(run, opportunities, o, 'deltaD5'), 'signed ΔD at center · 5 s'],
    ['deltaB5', o => sampleAt(run, opportunities, o, 'deltaB5'), 'signed ΔB at center · 5 s'], ['deltaC5', o => sampleAt(run, opportunities, o, 'deltaC5'), 'signed ΔC at center · 5 s'],
    ['feet5', o => sampleAt(run, opportunities, o, 'feet5'), 'center foot contacts · 5 s'], ['travel5', o => sampleAt(run, opportunities, o, 'travel5'), 'center travel · world units/5 s'],
    ['rank', o => o.rank, 'within-channel rank'], ['entryDistance', o => o.entryDistance, 'distance from entry center'],
    ['overlapFraction', o => o.material?.overlapFraction, 'existing material overlap'], ['meanLayers', o => o.material?.meanLayers, 'mean material layers'],
    ['xJaccard', o => o.xJaccard, 'adjacent X Jaccard'], ['xNodeCount', o => o.xNodeCount, 'moving X F-cell node count'],
    ['xRegionB', o => o.xRegionSignals?.B, 'moving X F-cell mean · B'], ['xRegionC', o => o.xRegionSignals?.C, 'moving X F-cell mean · C'],
    ['xRegionD', o => o.xRegionSignals?.D, 'moving X F-cell mean · D'], ['xRegionDeltaD5', o => o.xRegionSignals?.deltaD5, 'moving X F-cell mean · signed ΔD 5 s'],
    ['xRegionDeltaB5', o => o.xRegionSignals?.deltaB5, 'moving X F-cell mean · signed ΔB 5 s'], ['xRegionDeltaC5', o => o.xRegionSignals?.deltaC5, 'moving X F-cell mean · signed ΔC 5 s'],
    ['xRegionFeet5', o => o.xRegionSignals?.feet5, 'moving X F-cell foot-contact total · 5 s'],
    ['xRegionTravel5', o => o.xRegionSignals?.travel5, 'moving X F-cell realized-travel total · 5 s'],
    ['xTimeSinceLatestContactSeconds', o => o.xTimeSinceLatestContactSeconds, 'moving X F-cell time since latest contact'],
    ['xCentroidX', o => o.xCentroid?.x, 'moving X centroid · x'], ['xCentroidY', o => o.xCentroid?.y, 'moving X centroid · y'],
    ['xAngularSpan', o => o.xGeometry?.angularSpanRadians, 'moving X angular span · radians'],
    ['xExtentWidth', o => o.xGeometry?.extent?.width, 'moving X extent width · normalized units'],
    ['xExtentHeight', o => o.xGeometry?.extent?.height, 'moving X extent height · normalized units'],
    ['xEdgeCount', o => o.xGeometry?.edgeCount, 'moving X eight-neighbor edge count'],
    ['xEndpoints', o => o.xGeometry?.endpoints, 'moving X endpoints'], ['xJunctions', o => o.xGeometry?.junctions, 'moving X junctions'],
    ['xCycleRank', o => o.xGeometry?.cycleRank, 'moving X cycle rank']
  ];
  const cols = 3, pw = 275, ph = 118, gx = 20, gy = 25, left = 24, top = 119, rows = Math.ceil(panels.length / cols), width = left * 2 + cols * pw + (cols - 1) * gx, height = top + rows * (ph + gy) + 34;
  const focus = observations.map(o => ({ t: (o.timeMs - start) / span, o }));
  const parts = [];
  for (let i = 0; i < panels.length; i++) {
    const [key, get, label] = panels[i], x = left + (i % cols) * (pw + gx), y = top + Math.floor(i / cols) * (ph + gy);
    const values = focus.map(p => ({ t: p.t, v: get(p.o) })).filter(p => Number.isFinite(p.v));
    parts.push(`<text x="${x}" y="${y - 7}" class="label">${esc(label)}</text>`);
    parts.push(`<rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="#fbfcfd" stroke="#aab5c2"/>`);
    if (values.length) {
      let min = Math.min(...values.map(p => p.v)), max = Math.max(...values.map(p => p.v));
      if (min === max) { const pad = Math.abs(min) * .08 || 1; min -= pad; max += pad; }
      const ticks = [min, (min + max) / 2, max];
      for (const t of ticks) {
        const yy = y + ph - (t - min) / (max - min) * ph;
        parts.push(`<path d="M${x} ${yy}H${x + pw}" stroke="#e2e7ec"/><text x="${x + 3}" y="${yy - 2}" class="tick">${nice(t)}</text>`);
      }
      const chart = { x: x + 24, y: y + 5, w: pw - 29, h: ph - 22 };
      parts.push(`<path d="${pathFor(values, chart.x, chart.y, chart.w, chart.h, min, max)}" fill="none" stroke="#176ca5" stroke-width="1.7"/>`);
      for (const [q, anchor] of [[0, 'start'], [.5, 'middle'], [1, 'end']]) {
        const label = (start + q * span) / 1000;
        parts.push(`<text x="${chart.x + q * chart.w}" y="${y + ph - 2}" text-anchor="${anchor}" class="timeTick">${label.toFixed(3)}s</text>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:Arial,sans-serif;fill:#17202b}.title{font-size:19px;font-weight:bold}.sub{font-size:11px;fill:#465362}.label{font-size:12px;font-weight:bold}.tick{font-size:9px;fill:#637181}.timeTick{font-size:7.5px;fill:#637181}</style><rect width="100%" height="100%" fill="white"/><text x="${left}" y="27" class="title">${esc(item.seed)} · ${esc(item.category)} · moving X F-cell region trajectory</text><text x="${left}" y="48" class="sub">Track ${esc(item.trackId)} · ${esc(item.channel)} g15 · ${observations.length} exact observations · model seconds ${(start / 1000).toFixed(3)}–${(end / 1000).toFixed(3)}</text><text x="${left}" y="68" class="sub">Every panel x-axis uses model seconds; start, midpoint and end are labeled. Exact sample times remain in the machine receipt.</text><text x="${left}" y="88" class="sub">Center panels sample the exact moving center; X panels summarize its exact connected F-cell region at each anchor.</text><text x="${left}" y="102" class="sub">X node count is a cell count, not area or force. Region means and contact/travel totals use separate axes.</text>${parts.join('')}<text x="${left}" y="${height - 8}" class="sub">Signed Δ panels preserve direction. These descriptive tracks do not establish causes.</text></svg>`;
}
export function jointSvg({ seed, run, opportunities }) {
  const series = [
    { key: 'D×ΔD5', channel: 'D', xName: 'D', yName: 'deltaD5', xLabel: 'D support (.025)', yLabel: 'signed ΔD · 5 s' },
    { key: 'D×feet5', channel: 'D', xName: 'D', yName: 'feet5', xLabel: 'D support (.025)', yLabel: 'foot contacts/cell · 5 s' },
    { key: 'B×ΔB5', channel: 'B', xName: 'B', yName: 'deltaB5', xLabel: 'B bounded chemical memory', yLabel: 'signed ΔB · 5 s' }
  ];
  const points = series.map(s => ({ ...s, rows: [] }));
  for (const anchor of run.anchors) {
    const op = opportunityAt(opportunities, anchor); if (!op) continue;
    for (const s of points) {
      const centers = rowsAt(op, s.channel, 'g15');
      const xValues = channelData(anchor, op, s.xName), yValues = channelData(anchor, op, s.yName);
      if (!xValues || !yValues) continue;
      for (const row of centers) {
        const cell = rowCell(row), x = xValues[cell], y = yValues[cell];
        if (cell < 0 || cell >= COUNT || !Number.isFinite(x) || !Number.isFinite(y)) continue;
        s.rows.push({ x, y, inside: row.entryDistance <= .15, timeMs: anchor.timeMs, rank: row.rank });
      }
    }
  }
  const width = 1120, height = 470, panelW = 350, panelH = 365, gap = 18, left = 17, top = 79, parts = [];
  for (let i = 0; i < points.length; i++) {
    const panel = points[i], x0 = left + i * (panelW + gap), y0 = top;
    const xs = panel.rows.map(p => p.x), ys = panel.rows.map(p => p.y);
    let xmin = Math.min(0, ...xs), xmax = Math.max(1, ...xs), ymin = Math.min(0, ...ys), ymax = Math.max(1e-12, ...ys);
    if (panel.yName.startsWith('delta')) { const extent = Math.max(Math.abs(ymin), Math.abs(ymax), 1e-12); ymin = -extent; ymax = extent; }
    if (xmin === xmax) xmax = xmin + 1; if (ymin === ymax) ymax = ymin + 1;
    const plot = { x: x0 + 52, y: y0 + 12, w: panelW - 67, h: panelH - 62 };
    parts.push(`<text x="${x0}" y="${y0 - 13}" class="label">${esc(panel.key)} · ${panel.rows.length} g15 observations</text>`);
    parts.push(`<rect x="${plot.x}" y="${plot.y}" width="${plot.w}" height="${plot.h}" fill="#fbfcfd" stroke="#aab5c2"/>`);
    for (let tick = 0; tick <= 4; tick++) {
      const q = tick / 4, xx = plot.x + q * plot.w, yy = plot.y + (1 - q) * plot.h;
      const xv = xmin + q * (xmax - xmin), yv = ymin + q * (ymax - ymin);
      parts.push(`<path d="M${xx} ${plot.y}V${plot.y + plot.h}M${plot.x} ${yy}H${plot.x + plot.w}" stroke="#e5e9ed"/>`);
      parts.push(`<text x="${xx}" y="${plot.y + plot.h + 15}" text-anchor="middle" class="tick">${nice(xv)}</text>`);
      parts.push(`<text x="${plot.x - 5}" y="${yy + 3}" text-anchor="end" class="tick">${nice(yv)}</text>`);
    }
    for (const p of panel.rows) {
      const cx = plot.x + (p.x - xmin) / (xmax - xmin) * plot.w, cy = plot.y + plot.h - (p.y - ymin) / (ymax - ymin) * plot.h;
      if (p.inside) parts.push(`<path d="M${cx} ${cy - 2.2}L${cx + 2.2} ${cy}L${cx} ${cy + 2.2}L${cx - 2.2} ${cy}Z" fill="#d94832" fill-opacity=".46"/>`);
      else parts.push(`<circle cx="${cx}" cy="${cy}" r="1.9" fill="#176ca5" fill-opacity=".35"/>`);
    }
    parts.push(`<text x="${plot.x + plot.w / 2}" y="${plot.y + plot.h + 34}" text-anchor="middle" class="axis">${esc(panel.xLabel)}</text>`);
    parts.push(`<text x="${x0 + 13}" y="${plot.y + plot.h / 2}" text-anchor="middle" class="axis" transform="rotate(-90 ${x0 + 13} ${plot.y + plot.h / 2})">${esc(panel.yLabel)}</text>`);
    parts.push(`<text x="${plot.x + 3}" y="${plot.y + plot.h + 50}" class="tick"><tspan fill="#d94832">◆ inside</tspan><tspan dx="14" fill="#176ca5">● outside</tspan></text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:Arial,sans-serif;fill:#17202b}.title{font-size:19px;font-weight:bold}.sub{font-size:11px;fill:#465362}.label{font-size:13px;font-weight:bold}.tick{font-size:9px;fill:#637181}.axis{font-size:10px;fill:#465362}</style><rect width="100%" height="100%" fill="white"/><text x="17" y="27" class="title">Seed ${seed} · accumulated versus recent joint distributions</text><text x="17" y="47" class="sub">All exact g15 center observations across analysis anchors. Separate pairs and units; diamonds are entryDistance ≤ .15, circles are &gt; .15.</text><text x="17" y="64" class="sub">Rank history is shown in the selected-track case figures. These plots are descriptive distributions, not causal evidence.</text>${parts.join('')}</svg>`;
}
function sampleAt(run, opportunities, obs, name) {
  const anchor = run.anchors.find(row => row.index === obs.anchorIndex);
  if (!anchor) return NaN;
  assert.equal(anchor.timeMs, obs.timeMs, 'case observation exact anchor time');
  assert.ok(Number.isInteger(obs.centerIndex) && obs.centerIndex >= 0 && obs.centerIndex < COUNT, 'case center index is in the grid');
  const op = opportunityAt(opportunities, anchor);
  const arr = channelData(anchor, op, name);
  return arr?.[obs.centerIndex] ?? NaN;
}

async function renderContactSheet(rows) {
  const browserPath = process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1350 }, deviceScaleFactor: 1 });
    const payload = rows.map(row => {
      const svg = row.svg.toString();
      return { label: `${row.seed} · ${row.requestedSeconds}s`, svg: Buffer.from(svg).toString('base64'),
        width: Number(svg.match(/<svg[^>]*width="(\d+)"/)?.[1]), height: Number(svg.match(/<svg[^>]*height="(\d+)"/)?.[1]) };
    });
    await page.setContent('<canvas id="c"></canvas>');
    await page.evaluate(async rows => {
      const c = document.querySelector('#c'), ctx = c.getContext('2d'), cols = 3, tileW = 590, gap = 10, header = 22;
      const heights = rows.map(row => tileW * row.height / row.width), rowHeights = [];
      for (let r = 0; r < Math.ceil(rows.length / cols); r++) rowHeights.push(Math.max(...heights.slice(r * cols, (r + 1) * cols)) + header);
      c.width = cols * tileW + (cols - 1) * gap; c.height = rowHeights.reduce((sum, h) => sum + h + gap, -gap);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < rows.length; i++) {
        const im = new Image(); im.src = 'data:image/svg+xml;base64,' + rows[i].svg;
        await new Promise((resolve, reject) => { im.onload = resolve; im.onerror = reject; });
        const row = Math.floor(i / cols), x = (i % cols) * (tileW + gap), y = rowHeights.slice(0, row).reduce((sum, h) => sum + h + gap, 0);
        ctx.fillStyle = '#17202b'; ctx.font = 'bold 14px Arial'; ctx.fillText(rows[i].label, x + 5, y + 16);
        ctx.drawImage(im, x, y + header, tileW, heights[i]);
      }
    }, payload);
    const dimensions = await page.locator('#c').evaluate(c => ({ width: c.width, height: c.height }));
    const bytes = await page.locator('#c').screenshot({ type: 'png' });
    const pngDimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    assert.deepEqual(pngDimensions, dimensions, 'PNG pixel dimensions match contact-sheet canvas');
    return { bytes, dimensions: pngDimensions };
  } finally { await browser.close(); }
}

async function loadSeed(seed) {
  const run = await readRun(resolve(ANALYSIS, `seed-${seed}.signals.json.gz`));
  assert.equal(run.seed, seed); assert.equal(run.hz, 60);
  const opportunities = await readRun(resolve(ANALYSIS, `seed-${seed}.opportunities.json.gz`));
  assert.equal(opportunities.schema, 'ant-local-opportunity-analysis-v1');
  assert.equal(opportunities.seed, run.seed); assert.equal(opportunities.authority, run.authority);
  assert.equal(opportunities.anchors.length, run.anchors.length, 'signal and opportunity anchor count');
  for (let i = 0; i < run.anchors.length; i++) {
    assert.equal(opportunities.anchors[i].index, run.anchors[i].index, `opportunity anchor index ${i}`);
    assert.equal(opportunities.anchors[i].timeMs, run.anchors[i].timeMs, `opportunity anchor time ${i}`);
  }
  return { seed, run, opportunities };
}
function addScales(scales, { run, opportunities }) {
  const maxima = Object.fromEntries(CHANNELS.filter(n => !n.startsWith('delta')).map(n => [n, 0]));
  const signed = Object.fromEntries(CHANNELS.filter(n => n.startsWith('delta')).map(name => [name, 0]));
  scales.materialLayers ||= 1;
  for (const requestedSeconds of TIMES) {
    const { anchor } = fixedAnchor(run, requestedSeconds), op = opportunityAt(opportunities, anchor);
    scales.materialLayers = Math.max(scales.materialLayers, ...unpack(anchor.material.layers));
    for (const name of CHANNELS) {
      const arr = channelData(anchor, op, name); assert.ok(arr, 'raster available to scale: ' + name);
      if (name.startsWith('delta')) signed[name] = Math.max(signed[name], ...arr.map(Math.abs));
      else maxima[name] = Math.max(maxima[name], ...arr);
    }
  }
  for (const [key, value] of Object.entries(maxima)) scales[key] = Math.max(scales[key] ?? 0, value);
  for (const [key, value] of Object.entries(signed)) scales.signed[key] = Math.max(scales.signed[key] ?? 0, value);
}
export function assertEnrichedCases(data) {
  assert.equal(data.schema, 'ant-local-opportunity-cases-v1', 'final global cases schema');
  assert.ok(typeof data.xRegionSignalDefinitions === 'string' && data.xRegionSignalDefinitions.length > 0,
    'case X-region signal definitions are present');
  for (const item of data.cases) {
    if (item.none) continue;
    assert.ok(Array.isArray(item.jointHistory) && item.jointHistory.length > 0, `${item.category} enriched joint history`);
    assert.equal(item.jointHistory.length, item.anchorIndices.length, `${item.category} joint-history anchor count`);
    assert.equal(item.jointHistory.length, item.centerIndices.length, `${item.category} joint-history center count`);
    for (let i = 0; i < item.jointHistory.length; i++) {
      const row = item.jointHistory[i];
      assert.equal(row.anchorIndex, item.anchorIndices[i], `${item.category} joint-history anchor ${i}`);
      assert.equal(row.centerIndex, item.centerIndices[i], `${item.category} joint-history center ${i}`);
      if (item.observations?.[i]) {
        assert.equal(row.anchorIndex, item.observations[i].anchorIndex, `${item.category} enriched center anchor ${i}`);
        assert.equal(row.centerIndex, item.observations[i].centerIndex, `${item.category} enriched center index ${i}`);
        assert.equal(row.timeMs, item.observations[i].timeMs, `${item.category} enriched center time ${i}`);
      }
      assert.ok(Number.isFinite(row.timeMs), `${item.category} joint-history time ${i}`);
      assert.ok(Number.isInteger(row.xNodeCount) && row.xNodeCount > 0, `${item.category} X F-cell node count ${i}`);
      assert.ok(row.xRegionSignals && Object.keys(row.xRegionSignals).length > 0
        && Object.entries(row.xRegionSignals).every(([, value]) => Number.isFinite(value)),
      `${item.category} finite X-region signals ${i}`);
      assert.ok(Number.isFinite(row.xCentroid?.x) && Number.isFinite(row.xCentroid?.y), `${item.category} X centroid ${i}`);
      assert.ok(Number.isFinite(row.xGeometry?.angularSpanRadians) && Number.isFinite(row.xGeometry?.extent?.width)
        && Number.isFinite(row.xGeometry?.extent?.height), `${item.category} X geometry ${i}`);
    }
  }
  return true;
}

async function main() {
  VISUAL = outputDirectory(process.argv.slice(2));
  const scales = { signed: {} };
  for (const seed of SEEDS) addScales(scales, await loadSeed(seed));
  for (const name of ['E', 'F', 'B', 'C', 'D']) scales[name] = 1;
  for (const name of CHANNELS.filter(n => n.startsWith('feet') || n.startsWith('travel'))) scales[name] ||= 1;
  for (const name of CHANNELS.filter(n => n.startsWith('delta'))) scales.signed[name] ||= 1;
  await mkdir(VISUAL, { recursive: true });
  const first = await loadSeed(SEEDS[0]);
  const manifest = { schema: 'ant-local-opportunity-visual-manifest-v1', authority: first.run.authority,
    grid: { width: GRID, height: GRID, yDirection: 'down' }, seeds: SEEDS, requestedSeconds: TIMES,
    scalePolicy: 'E/F and B/C/D use native [0,1] bounds; feet/travel and signed delta limits are the observed global maxima across all seeds and requested anchors (symmetric for deltas), falling back to 1 only for all-zero channels. Scales are channel-specific; color intensity is not comparable across channels.',
    scales, figures: [], cases: [] };
  first.run = null; first.opportunities = null;
  const contacts = [], xContacts = [], caseContacts = [], jointContacts = [];
  const casePackage = JSON.parse(await readFile(resolve(ANALYSIS, 'cases.json'), 'utf8'));
  assertEnrichedCases(casePackage);
  for (const seed of SEEDS) {
    const item = await loadSeed(seed);
    for (const requestedSeconds of TIMES) {
    const { capture, anchor } = fixedAnchor(item.run, requestedSeconds), opAnchor = opportunityAt(item.opportunities, anchor);
    const svg = Buffer.from(atlasSvg({ ...item, requestedSeconds, capture, anchor, opAnchor, scales }));
    const file = `seed-${item.seed}-${requestedSeconds}s-atlas.svg`;
    await writeFile(resolve(VISUAL, file), svg);
    manifest.figures.push({ file, bytes: svg.length, sha256: sha256(svg), dimensions: svgDimensions(svg),
      seed: item.seed, requestedSeconds, anchorIndex: anchor.index, anchorTimeMs: anchor.timeMs,
      frameTimeMs: capture.frameTimeMs ?? capture.requestedSeconds * 1000, channels: CHANNELS });
    contacts.push({ seed: item.seed, requestedSeconds, svg });
    if (opAnchor) {
      const xSvg = Buffer.from(associatedXSvg({ ...item, requestedSeconds, capture, anchor, opAnchor, scales }));
      const xFile = `seed-${item.seed}-${requestedSeconds}s-associated-x.svg`;
      await writeFile(resolve(VISUAL, xFile), xSvg);
      manifest.figures.push({ file: xFile, bytes: xSvg.length, sha256: sha256(xSvg), dimensions: svgDimensions(xSvg),
        seed: item.seed, requestedSeconds, anchorIndex: anchor.index, anchorTimeMs: anchor.timeMs,
        note: 'Illustrative top-three g15 centers per source channel, with existing material as a separate reference.' });
      xContacts.push({ seed: item.seed, requestedSeconds, svg: xSvg });
    }
    }
    const joint = Buffer.from(jointSvg(item)), jointFile = `seed-${seed}-joint-distributions.svg`;
    await writeFile(resolve(VISUAL, jointFile), joint);
    manifest.figures.push({ file: jointFile, bytes: joint.length, sha256: sha256(joint), dimensions: svgDimensions(joint),
      seed, note: 'All exact g15 centers at available anchors; separate D/ΔD5, D/feet5 and B/ΔB5 pairs.' });
    jointContacts.push({ seed, requestedSeconds: 'joint', svg: joint });
    for (const category of ['longest-nonentry-D', 'longest-entry-D', 'integrated-positive-deltaD5', 'integrated-positive-deltaB5']) {
      const row = casePackage.cases.find(x => x.category === category && x.seed === seed);
      if (!row || row.none || !row.trackId) continue;
      const jointByIndex = new Map((row.jointHistory || []).map(observation => [observation.anchorIndex, observation]));
      for (const observation of row.jointHistory) {
        const sourceAnchor = item.run.anchors[observation.anchorIndex];
        assert.ok(sourceAnchor, `${category} enriched signal anchor exists`);
        assert.equal(sourceAnchor.timeMs, observation.timeMs, `${category} enriched history matches exact signal anchor`);
      }
      const observations = (row.observations || row.anchorIndices.map((anchorIndex, i) => ({ anchorIndex,
        timeMs: item.run.anchors.find(a => a.index === anchorIndex).timeMs, centerIndex: row.centerIndices[i] })))
        .map(observation => ({ ...(jointByIndex.get(observation.anchorIndex) || {}), ...observation,
          ...Object.fromEntries(['xNodeCount', 'xCentroid', 'xGeometry', 'xRegionSignals', 'xTimeSinceLatestContactSeconds']
            .filter(key => jointByIndex.get(observation.anchorIndex)?.[key] !== undefined)
            .map(key => [key, jointByIndex.get(observation.anchorIndex)[key]])) }));
      const normalized = { ...row, observations };
      const svg = Buffer.from(caseSvg({ item: normalized, run: item.run, opportunities: item.opportunities }));
      const file = `case-${category}.svg`; await writeFile(resolve(VISUAL, file), svg);
      const caseRow = { category, file, bytes: svg.length, sha256: sha256(svg), dimensions: svgDimensions(svg),
        seed: row.seed, trackId: row.trackId, channel: row.channel, anchorIndices: observations.map(o => o.anchorIndex),
        centerIndices: observations.map(o => o.centerIndex), startTimeMs: observations[0].timeMs, endTimeMs: observations.at(-1).timeMs };
      manifest.cases.push(caseRow); manifest.figures.push(caseRow); caseContacts.push({ seed, requestedSeconds: category, svg });
    }
  }
  for (const category of ['longest-nonentry-D', 'longest-entry-D', 'integrated-positive-deltaD5', 'integrated-positive-deltaB5']) {
    if (!manifest.cases.some(row => row.category === category)) manifest.cases.push({ category, none: true });
  }
  for (const [kind, rows] of [['signals-atlas', contacts], ['associated-x', xContacts], ['joint-distributions', jointContacts], ['cases', caseContacts]]) if (rows.length) {
    const sheet = await renderContactSheet(rows), file = `${kind}-contact-sheet.png`;
    await writeFile(resolve(VISUAL, file), sheet.bytes);
    manifest.figures.push({ file, bytes: sheet.bytes.length, sha256: sha256(sheet.bytes), dimensions: sheet.dimensions });
  }
  const linked = manifest.figures.map(f => `<li><a href="${esc(f.file)}">${esc(f.file)}</a>${f.seed ? ` · ${f.seed} · ${f.requestedSeconds ?? ''} s` : ''}</li>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><title>ANT local opportunity atlas</title><style>body{font:16px Arial;color:#17202b;margin:24px}li{margin:8px 0}img{max-width:100%}</style><h1>Local opportunity technical atlas</h1><p>Fixed channel-specific scales are shared across seeds and times; exact signal anchor and requested frame times appear in each SVG. Color intensity is not comparable across channels. Grid covers normalized x/y 0–1 with y increasing downward.</p><h2>Signal atlas contact sheet</h2><img src="signals-atlas-contact-sheet.png" alt="All seed and time signal atlases"><h2>Joint distributions</h2><img src="joint-distributions-contact-sheet.png" alt="Three separate joint-distribution panels per seed"><h2>Figures</h2><ul>${linked}</ul><h2>Associated X</h2><p>Illustrative top three g15 centers per registered channel and boundary; associated X is shown separately from existing material. This does not rank channels together or establish causal association.</p><h2>Cases</h2><p>Case selection is machine-defined in analysis/cases.json. Traces distinguish exact-center samples from the moving X F-cell region. X node count reports cells, not area or force.</p><p><a href="visual-determinism.json">Visual output hashes, sizes and dimensions</a></p>`;
  const htmlBytes = Buffer.from(html); await writeFile(resolve(VISUAL, 'index.html'), htmlBytes);
  manifest.figures.push({ file: 'index.html', bytes: htmlBytes.length, sha256: sha256(htmlBytes), dimensions: null });
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(resolve(VISUAL, 'manifest.json'), manifestBytes);
  const inventory = manifest.figures.map(({ file, bytes, sha256: hash, dimensions }) => ({ file, bytes, sha256: hash, dimensions }));
  inventory.push({ file: 'manifest.json', bytes: manifestBytes.length, sha256: sha256(manifestBytes), dimensions: null });
  const inventoryBytes = Buffer.from(JSON.stringify(inventory) + '\n');
  const determinism = { schema: 'ant-local-opportunity-visual-determinism-v1',
    inventoryExcludesSelfToAvoidRecursiveHash: true, fileCount: inventory.length,
    totalBytes: inventory.reduce((sum, row) => sum + row.bytes, 0),
    inventorySha256: sha256(inventoryBytes), files: inventory };
  await writeFile(resolve(VISUAL, 'visual-determinism.json'), JSON.stringify(determinism, null, 2) + '\n');
  console.log(JSON.stringify({ complete: true, figures: manifest.figures.length - 1, visual: VISUAL }));
}

export function checkGeometry() {
  assert.equal(outputDirectory(['--out=.cache/ant-local-opportunity-visual-rerun']),
    resolve(ROOT, '.cache/ant-local-opportunity-visual-rerun'));
  assert.throws(() => outputDirectory(['--out=../visual-outside-repo']), /inside the repository/);
  const packedScalar = { type: 'Float32Array', length: 2, data: Buffer.from('0000c03f000010c0', 'hex').toString('base64') };
  assert.deepEqual(Array.from(unpack(packedScalar, 2)), [1.5, -2.25], 'little-endian packed float decode');
  const packed = { type: 'Float32Array', length: COUNT, data: Buffer.alloc(COUNT * 4).toString('base64') };
  assert.equal(unpack(packed).length, COUNT);
  const run = { anchors: [{ index: 0, timeMs: 60000 }], captures: [{ requestedSeconds: 60, anchorIndex: 0, analysisTimeMs: 60000 }] };
  assert.equal(fixedAnchor(run, 60).anchor.timeMs, 60000, 'exact fixed-anchor join');
  const pointValues = new Float32Array(COUNT); pointValues[0] = .25;
  const pointPacked = { type: 'Float32Array', length: COUNT, data: Buffer.from(pointValues.buffer).toString('base64') };
  const anchor = { index: 0, timeMs: 1000, D: pointPacked, B: pointPacked,
    feet: { 5: { count: pointPacked } }, traffic: { 5: { travel: pointPacked } } };
  const center = { index: 0, x: 0, y: 0, entryDistance: .1, rank: 1 };
  const op = { index: 0, timeMs: 1000, delta: { deltaD5: pointPacked, deltaB5: pointPacked }, channels: {
    D: { raw: [center], g15: [center] }, B: { raw: [center], g15: [center] } } };
  const joint = jointSvg({ seed: 'test', run: { anchors: [anchor] }, opportunities: { anchors: [op] } });
  assert.ok(joint.includes('D×ΔD5') && joint.includes('D×feet5') && joint.includes('B×ΔB5'));
  assert.ok(joint.includes('diamonds are entryDistance ≤ .15'));
  const associatedAnchor = { ...anchor, F: packed, material: { layers: packed } }, associatedRow = { ...center, captureId: 'X1' };
  const associatedOp = { ...op, captures: [{ id: 'X1', centerIndex: 0, cells: [0], nodeCount: 1 }],
    channels: { ...op.channels, D: { raw: [associatedRow], g15: [associatedRow] } } };
  const xFigure = associatedXSvg({ seed: 'test', requestedSeconds: 60,
    capture: { analysisTimeMs: 1000 }, anchor: associatedAnchor, opAnchor: associatedOp, scales: { materialLayers: 1 } });
  assert.ok(xFigure.includes('F mask') && xFigure.includes('X1') && xFigure.includes('n=1'));
  assert.deepEqual(svgDimensions(Buffer.from(xFigure)), { width: 810, height: 1009 }, 'associated-X nine-panel geometry');
  const caseAnchors = [{ ...anchor, index: 0, timeMs: 1000 }, { ...anchor, index: 1, timeMs: 2000 }];
  const caseOps = [0, 1].map(index => ({ index, timeMs: (index + 1) * 1000, delta: {
    deltaD5: pointPacked, deltaB5: pointPacked, deltaC5: pointPacked } }));
  const observations = [0, 1].map(index => ({ anchorIndex: index, timeMs: (index + 1) * 1000, centerIndex: 0,
    rank: index + 1, entryDistance: index ? .2 : .1, material: { overlapFraction: .5, meanLayers: 1.5 }, xJaccard: .25 }));
  const guardedCase = { category: 'fixture', seed: 'test', anchorIndices: [0], centerIndices: [0], jointHistory: [{
    anchorIndex: 0, centerIndex: 0, timeMs: 1000, xNodeCount: 1, xRegionSignals: { B: 0.2, deltaC5: -0.1, feet5: 0, travel5: 0 },
    xCentroid: { x: .5, y: .5 }, xGeometry: { angularSpanRadians: 0, extent: { width: 0, height: 0 } }
  }] };
  assert.ok(assertEnrichedCases({ schema: 'ant-local-opportunity-cases-v1', xRegionSignalDefinitions: 'exact F-cell stats', cases: [guardedCase] }));
  assert.throws(() => assertEnrichedCases({ schema: 'ant-local-opportunity-cases-v1', xRegionSignalDefinitions: 'x',
    cases: [{ ...guardedCase, jointHistory: [{ ...guardedCase.jointHistory[0], xRegionSignals: { feet5: null } }] }] }),
  /finite X-region signals/);
  const caseFigure = caseSvg({ item: { seed: 'test', category: 'fixture', trackId: 'T1', channel: 'D', representation: 'g15',
    cutoff: .025, observations }, run: { anchors: caseAnchors }, opportunities: { anchors: caseOps } });
  assert.ok(caseFigure.includes('moving X F-cell region trajectory') && caseFigure.includes('moving X F-cell mean · signed ΔC 5 s'));
  assert.ok(caseFigure.includes('Every panel x-axis uses model seconds') && caseFigure.includes('1.500s'));
  assert.deepEqual(svgDimensions(Buffer.from(caseFigure)), { width: 913, height: 1726 }, 'case SVG dimensions follow panel count');
  const svg = atlasSvg({ seed: 'test', requestedSeconds: 60,
    capture: { requestedSeconds: 60, analysisTimeMs: 60000, frameTimeMs: 60000 },
    anchor: { index: 0, tick: 3600, timeMs: 60000, E: packed, F: packed, B: packed, C: packed, D: packed,
      feet: Object.fromEntries(['1', '5', '20'].map(w => [w, { count: packed }])),
      traffic: Object.fromEntries(['1', '5', '20'].map(w => [w, { travel: packed }])) },
    opAnchor: { delta: Object.fromEntries(['deltaD1','deltaD5','deltaD20','deltaB1','deltaB5','deltaB20','deltaC5'].map(k => [k, packed])), channels: {} },
    scales: { ...Object.fromEntries(CHANNELS.map(n => [n, 1])),
      signed: Object.fromEntries(CHANNELS.filter(n => n.startsWith('delta')).map(name => [name, 1])) } });
  assert.ok(svg.includes('viewBox="0 0 ')); assert.ok(svg.includes('row y increases downward'));
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) { checkGeometry(); console.log('geometry and packed-array checks passed'); }
  else await main();
}
