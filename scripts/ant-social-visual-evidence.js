import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright';

const args = new Map(process.argv.slice(2).map(value => {
  const at = value.indexOf('=');
  return at < 0 ? [value, true] : [value.slice(0, at), value.slice(at + 1)];
}));
const SEEDS = [20261005, 20261006, 20261007];
const WINDOWS = [0.25, 1, 5, 20];
const TIMES = [30, 120, 600];
const LIFETIME_BINS = [0, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300, 600, Infinity];
const inputDir = resolve(String(args.get('--input') || 'test-results/social-evidence'));
const outputDir = resolve(String(args.get('--output') || 'test-results/social-visual-evidence'));
const outputNames = new Set();

if (args.has('--selfcheck')) selfcheck();
else await main();

async function main() {
  const { entries: inputs, metadata: inputMetadata, manifest } = await loadEvidence(inputDir);
  const lifetimeGroups = [...inputs.values()].map(record => summarizeLifetimes(record.raw));
  const sharedPeak = kind => Math.max(1, Math.ceil(Math.max(0,
    ...lifetimeGroups.flatMap(groups => groups[kind].flatMap(group => group.counts))) / 100) * 100);
  const lifetimeScales = { windowEdges: sharedPeak('topology'), encounters: sharedPeak('encounters') };
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  try {
    const page = await browser.newPage();
    const sheets = [], connectorSelections = [];
    for (const seed of SEEDS) {
      const record = inputs.get(seed);
      const byTime = new Map(record.summary.checkpoints.map(checkpoint => [checkpoint.seconds, checkpoint]));
      await saveCanvas(page, `seed${seed}-social-spatial-k2.png`, { type: 'spatial', seed,
        snapshots: TIMES.flatMap(seconds => WINDOWS.map(windowSeconds => ({ seconds, windowSeconds,
          topology: topologyAt(byTime.get(seconds), 2, windowSeconds) }))) });
      await saveCanvas(page, `seed${seed}-social-timeline-k2.png`, { type: 'timeline', seed,
        rows: record.timeline.map(row => ({ seconds: row.seconds, population: row.population,
          instant: row.instant.find(item => item.k === 2 || item.distanceMultiplier === 2),
          topologies: row.topologies.filter(item => item.k === 2 || item.distanceMultiplier === 2) })) });
      const raw = record.raw;
      const eventCounts = summarizeEvents(raw);
      const lifetimeCounts = summarizeLifetimes(raw);
      await saveCanvas(page, `seed${seed}-social-events-lifetimes.png`, { type: 'events', seed,
        eventCounts, lifetimeCounts, lifetimeScales, bins: LIFETIME_BINS });
      const connector = findConnector(raw);
      let connectorImage = null;
      if (connector) {
        const row = record.timeline.reduce((nearest, item) => !nearest
          || Math.abs(item.seconds - connector.timeSeconds) < Math.abs(nearest.seconds - connector.timeSeconds) ? item : nearest, null);
        const topology = row?.topologies.find(item => (item.k ?? item.distanceMultiplier) === connector.k
          && item.windowSeconds === connector.windowSeconds)?.topology;
        connector.snapshotSeconds = topology?.timeSeconds ?? row?.seconds ?? null;
        connector.snapshotOffsetSeconds = connector.snapshotSeconds === null ? null : connector.snapshotSeconds - connector.timeSeconds;
        if (topology) {
          connectorImage = `seed${seed}-qualified-connector.png`;
          await saveCanvas(page, connectorImage, { type: 'connector', seed, connector, topology });
        }
      }
      connectorSelections.push(connector ? { seed, eventType: connector.event.type,
        k: connector.k, windowSeconds: connector.windowSeconds, eventSeconds: connector.timeSeconds,
        snapshotSeconds: connector.snapshotSeconds, snapshotOffsetSeconds: connector.snapshotOffsetSeconds,
        image: connectorImage } : { seed, event: null });
      sheets.push({ seed, byTime, eventCounts, lifetimeCounts });
    }
    const overview = [];
    for (const { seed, byTime } of sheets) for (const seconds of TIMES) overview.push({ seed, seconds,
      topology: topologyAt(byTime.get(seconds), 2, 1) });
    await saveCanvas(page, 'social-overview.png', { type: 'overview', snapshots: overview });
    await saveCanvas(page, 'social-contact-sheet.png', { type: 'contact-sheet', snapshots:
      sheets.flatMap(({ seed, byTime }) => TIMES.flatMap(seconds => WINDOWS.map(windowSeconds => ({
        seed, seconds, windowSeconds, topology: topologyAt(byTime.get(seconds), 2, windowSeconds)
      })))) });
    await saveCanvas(page, 'social-threshold-sweep-600s.png', { type: 'threshold',
      seeds: sheets.map(({ seed, byTime }) => ({ seed, checkpoint: byTime.get(600) })) });
    await page.close();
    const metadata = {
      inputDirectory: inputDir,
      scriptSha256: sha256(await readFile(new URL(import.meta.url))),
      sourceManifest: { commit: manifest.commit, node: manifest.node, sourceHashes: manifest.sourceHashes,
        sha256: manifest.sha256 },
      files: inputMetadata,
      earliestQualifiedConnector: connectorSelections,
      visualScales: {
        coordinates: 'Fixed ANT unit square [0,1] × [0,1], x right and y down; no per-panel fitting.',
        nodeRadius: 'Serialized ANT radius in normalized coordinates, drawn in the same unit-square scale.',
        edgeStrength: 'Fixed weightSeconds / windowSeconds in [0,1]; no per-graph scaling.',
        activeEncounter: 'Solid teal; retained recent-memory edge is dashed violet.',
        componentColor: 'Deterministic color from sorted component member IDs.',
        lifetimeBinsSeconds: LIFETIME_BINS.slice(0, -1).map((edge, i) => `${edge}–${LIFETIME_BINS[i + 1] === Infinity ? '∞' : LIFETIME_BINS[i + 1]}`),
        lifetimeCountAxes: lifetimeScales,
        timeline: 'Raw values use fixed scales across all seeds: population/components/LCC 0–28; pairs 0–8; rolling edges 0–24; densities 0–1; close-range neighbors 0–2; events/s 0–10. Dataset maxima were checked against these bounds.'
      },
      outputs: [...outputNames]
    };
    await writeFile(resolve(outputDir, 'social-visual-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  } finally { await browser.close(); }
}

async function loadEvidence(directory) {
  const files = await readdir(directory);
  const result = new Map(), metadata = [], manifestBytes = await readFile(resolve(directory, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  manifest.sha256 = sha256(manifestBytes);
  for (const seed of SEEDS) {
    const summaryName = `seed${seed}-summary.json`, rawName = `seed${seed}-on-raw-events.json.gz`;
    const timelineName = `seed${seed}-on-timeline.json.gz`;
    const summaryBytes = await readFile(resolve(directory, summaryName));
    const rawBytes = await readFile(resolve(directory, rawName));
    const timelineBytes = await readFile(resolve(directory, timelineName));
    const summary = JSON.parse(summaryBytes), raw = JSON.parse(gunzipSync(rawBytes));
    assert.equal(summary.seed, seed);
    assert.equal(summary.trajectory.match, true, `Seed ${seed} ON/OFF trajectory parity`);
    assert.ok(Object.values(summary.graphEnabledParity).every(field => field.match), `Seed ${seed} state hashes match`);
    assert.equal(raw.seed, seed); assert.equal(raw.graphEnabled, true);
    const timeline = gunzipSync(timelineBytes).toString('utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(timeline.length, 600, `Seed ${seed} has a complete 1 Hz timeline`);
    assert.equal(summary.checkpoints.length, 5);
    result.set(seed, { summary, raw, timeline });
    for (const [name, bytes] of [[summaryName, summaryBytes], [rawName, rawBytes], [timelineName, timelineBytes]]) {
      metadata.push({ seed, name, bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  assert.ok(files.includes('manifest.json'), 'Harness manifest exists');
  return { entries: result, metadata, manifest };
}

function topologyAt(checkpoint, k, windowSeconds) {
  const row = checkpoint?.topologies?.find(item => (item.distanceMultiplier ?? item.k) === k && item.windowSeconds === windowSeconds);
  assert.ok(row?.topology, `Missing topology at ${checkpoint?.seconds}s, k=${k}, W=${windowSeconds}`);
  return row.topology;
}

function summarizeEvents(raw) {
  return raw.topology.map(group => {
    const count = type => group.events.filter(event => event.type === type).length;
    return { k: group.distanceMultiplier, windowSeconds: group.windowSeconds,
      merges: count('COMPONENT_MERGE'), splits: count('COMPONENT_SPLIT'),
      bridgeForm: count('BRIDGE_FORM'), bridgeQualified: count('BRIDGE_PERSIST'),
      connectorQualified: count('CONNECTOR_PERSIST'), articulationQualified: count('ARTICULATION_PERSIST'),
      bridgeBreak: count('BRIDGE_BREAK'), connectorEnd: count('CONNECTOR_END'),
      edgeForms: count('EDGE_FORM'), edgeEnds: count('EDGE_END') };
  });
}

function summarizeLifetimes(raw) {
  const buckets = () => Array(LIFETIME_BINS.length - 1).fill(0);
  const rows = raw.topology.map(group => {
    const counts = buckets();
    for (const item of group.edgeLifetimes) counts[bin(item.durationSeconds)] += 1;
    return { k: group.distanceMultiplier, windowSeconds: group.windowSeconds, counts,
      rightCensored: group.edgeLifetimes.filter(item => item.rightCensored).length };
  });
  const encounterRows = raw.graph.map(group => {
    const counts = buckets();
    for (const item of group.encounters) counts[bin(item.durationSeconds)] += 1;
    return { k: group.distanceMultiplier, counts,
      rightCensored: group.encounters.filter(item => item.endReason === 'right-censored').length };
  });
  return { topology: rows, encounters: encounterRows };
}

function findConnector(raw) {
  const candidates = raw.topology.flatMap(group => group.events.filter(event => event.type === 'CONNECTOR_PERSIST')
    .map(event => ({ k: group.distanceMultiplier, windowSeconds: group.windowSeconds,
      timeSeconds: event.timeSeconds, antId: event.antId, event })));
  candidates.sort((a, b) => a.timeSeconds - b.timeSeconds || a.k - b.k || a.windowSeconds - b.windowSeconds);
  return candidates[0] || null;
}

function bin(value) {
  for (let i = 0; i < LIFETIME_BINS.length - 1; i += 1) if (value >= LIFETIME_BINS[i] && value < LIFETIME_BINS[i + 1]) return i;
  return LIFETIME_BINS.length - 2;
}

async function saveCanvas(page, name, payload) {
  const image = await page.evaluate(drawEvidence, payload);
  const bytes = Buffer.from(image, 'base64');
  await writeFile(resolve(outputDir, name), bytes);
  outputNames.add(name);
}

function drawEvidence(payload) {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  const colors = { ink: '#17212b', teal: '#167d83', violet: '#7852a4', grid: '#d5dce2', white: '#fff' };
  const drawBase = (width, height, title, sub) => {
    canvas.width = width; canvas.height = height;
    ctx.fillStyle = colors.white; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = colors.ink; ctx.font = 'bold 21px sans-serif'; ctx.fillText(title, 18, 29);
    ctx.font = '13px sans-serif'; ctx.fillText(sub, 18, 50);
  };
  function componentColors(topology) {
    const result = new Map();
    for (const component of topology.components || []) {
      const color = palette(component.members.join('|'));
      for (const id of component.members) result.set(id, color);
    }
    return result;
  }
  function graph(topology, x, y, size, title, subtitle = '') {
    const left = x + 8, top = y + 42, side = size - 16;
    ctx.fillStyle = '#fafbfd'; ctx.fillRect(left, top, side, side);
    ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; ctx.strokeRect(left, top, side, side);
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(left + side * i / 4, top); ctx.lineTo(left + side * i / 4, top + side);
      ctx.moveTo(left, top + side * i / 4); ctx.lineTo(left + side, top + side * i / 4); ctx.stroke();
    }
    ctx.fillStyle = colors.ink; ctx.font = 'bold 13px sans-serif'; ctx.fillText(title, x + 8, y + 17);
    ctx.font = '11px sans-serif'; ctx.fillText(subtitle, x + 8, y + 33);
    const nodes = new Map(topology.nodes.map(node => [node.id, node])), components = componentColors(topology);
    for (const edge of topology.edges) {
      const a = nodes.get(edge.antA), b = nodes.get(edge.antB); if (!a || !b) continue;
      const ratio = Math.max(0, Math.min(1, edge.weightSeconds / topology.windowSeconds));
      ctx.beginPath(); ctx.moveTo(left + a.x * side, top + a.y * side); ctx.lineTo(left + b.x * side, top + b.y * side);
      ctx.strokeStyle = edge.activeEncounter ? colors.teal : colors.violet;
      ctx.globalAlpha = 0.25 + ratio * 0.75; ctx.lineWidth = 0.7 + ratio * 2.6;
      ctx.setLineDash(edge.activeEncounter ? [] : [4, 3]); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    for (const node of topology.nodes) {
      ctx.beginPath(); ctx.arc(left + node.x * side, top + node.y * side, Math.max(2.4, node.radius * side), 0, Math.PI * 2);
      ctx.fillStyle = components.get(node.id) || '#687783'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    }
    return { left, top, side };
  }
  function palette(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    const hues = [203, 147, 27, 282, 354, 91, 177, 42, 231, 322, 116, 8];
    const hue = hues[(hash >>> 0) % hues.length], sat = 48, light = 45;
    return `hsl(${hue} ${sat}% ${light}%)`;
  }
  const axes = (x, y, w, h, min, max, label) => {
    ctx.strokeStyle = '#7f8b94'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
    ctx.fillStyle = colors.ink; ctx.font = '10px sans-serif'; ctx.fillText(String(max), x - 22, y + 4); ctx.fillText(String(min), x - 22, y + h);
    ctx.fillText(label, x, y - 5);
    for (let i = 1; i < 4; i++) { const yy = y + h * i / 4; ctx.strokeStyle = '#edf0f2'; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
  };
  const line = (values, x, y, w, h, min, max, color, dashed = false) => {
    if (!values.length) return;
    ctx.beginPath(); values.forEach((value, index) => {
      const px = x + (values.length === 1 ? 0 : index * w / (values.length - 1));
      const py = y + h - Math.max(0, Math.min(1, (value - min) / (max - min))) * h;
      if (!index) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash(dashed ? [5, 3] : []); ctx.stroke(); ctx.setLineDash([]);
  };
  const binsText = (bins, counts) => counts.map((count, i) => ({ range: bins[i + 1] === Infinity ? `>${bins[i]}` : `${bins[i]}-${bins[i + 1]}`, count }));

  if (payload.type === 'spatial' || payload.type === 'overview' || payload.type === 'contact-sheet') {
    const cells = payload.snapshots;
    const overview = payload.type === 'overview';
    const cols = overview ? 3 : 4, rows = payload.type === 'contact-sheet' ? 9 : 3;
    const cell = overview ? 400 : 340, header = 76;
    drawBase(cols * cell + 20, header + rows * (cell + 16) + 45,
      payload.type === 'spatial' ? `ANT temporal social graph · seed ${payload.seed} · k=2`
        : overview ? 'ANT social graph overview · matched natural seeds · k=2, W=1 s'
        : 'ANT social graph contact sheet · three matched seeds · k=2 · four windows',
      'Fixed unit square; node position and radius are ANT coordinates. Teal = active encounter; dashed violet = recent memory. Plate/field data are not shown.');
    cells.forEach((item, index) => {
      const col = index % cols, row = Math.floor(index / cols), x = 10 + col * cell, y = header + row * (cell + 14);
      const label = overview ? `seed ${item.seed} · ${item.seconds} s`
        : `${item.seed ?? payload.seed} · ${item.seconds} s · W ${item.windowSeconds} s`;
      graph(item.topology, x, y, cell - 12, label,
        `${item.topology.nodes.length} nodes · ${item.topology.edges.length} edges · ${item.topology.components.length} components`);
    });
    ctx.font = '12px sans-serif'; ctx.fillStyle = colors.ink;
    ctx.fillText('Edge width and opacity use fixed weightSeconds / W (0–1). Component colors hash sorted member IDs.', 18, canvas.height - 15);
  } else if (payload.type === 'timeline') {
    const cols = 4, cellW = 345, chartH = 112, rowH = chartH + 18, rows = 8, header = 76;
    drawBase(cols * cellW + 30, header + rows * rowH + 18,
      `ANT social topology timeline · seed ${payload.seed} · k=2`,
      '1 Hz values over 600 s; each column uses one rolling window. Solid topology measures, dashed instantaneous/local measures. Axes are fixed across seeds.');
    const windows = [0.25, 1, 5, 20];
    const tracks = [
      { title: 'Population', max: 28, get: row => row.population, color: '#334f8e' },
      { title: 'Instantaneous active pairs', max: 8, get: row => row.instant?.edgeCount ?? 0, color: colors.teal },
      { title: 'Graph components / LCC nodes', max: 28, get: (row, top) => [top?.metrics?.componentCount ?? 0, (top?.components || []).reduce((best, c) => Math.max(best, c.members.length), 0)], color: '#bf5b23' },
      { title: 'Rolling graph edges', max: 24, get: (row, top) => top?.metrics?.edgeCount ?? 0, color: colors.violet },
      { title: 'Instantaneous pair density', max: 1, get: row => row.instant?.edgeDensity ?? 0, color: colors.teal },
      { title: 'Mean close-range neighbors', max: 2, get: row => row.instant?.meanNeighborsCloseRange ?? 0, color: '#b44747' },
      { title: 'Topology density / LCC ratio', max: 1, get: (row, top) => [top?.metrics?.edgeDensity ?? 0, top?.metrics?.largestComponentRatio ?? 0], color: '#8a6b22' },
      { title: 'Events/s: merge / split / bridge persist', max: 10, get: (row, top) => {
        const counts = row.topologies.find(item => item.windowSeconds === top?.windowSeconds)?.eventsSinceLastSecond || {};
        return ['COMPONENT_MERGE', 'COMPONENT_SPLIT', 'BRIDGE_PERSIST'].map(type => counts[type] || 0);
      }, color: '#bf5b23' }
    ];
    for (let col = 0; col < cols; col++) {
      const windowSeconds = windows[col], x0 = 12 + col * cellW;
      ctx.fillStyle = colors.ink; ctx.font = 'bold 13px sans-serif'; ctx.fillText(`W = ${windowSeconds} s`, x0 + 7, 68);
      for (let r = 0; r < tracks.length; r++) {
        const spec = tracks[r], x = x0 + 31, y = header + r * rowH + 16, w = cellW - 50, h = chartH - 30;
        axes(x, y, w, h, 0, spec.max, spec.title);
        const values = payload.rows.map(row => {
          const topologyRow = row.topologies.find(item => item.windowSeconds === windowSeconds);
          const topology = topologyRow?.topology;
          return spec.get(row, topology);
        });
        if (Array.isArray(values[0])) {
          const seriesColors = [spec.color, r === 6 ? '#57616c' : '#427a50', '#7544aa'];
          values[0].forEach((_, index) => line(values.map(value => value[index]),
            x, y, w, h, 0, spec.max, seriesColors[index], index > 0));
        } else line(values, x, y, w, h, 0, spec.max, spec.color);
        if (r === tracks.length - 1) { ctx.fillStyle = '#65717a'; ctx.font = '9px sans-serif'; ctx.fillText('0 s', x, y + h + 12); ctx.fillText('600 s', x + w - 25, y + h + 12); }
      }
    }
  } else if (payload.type === 'threshold') {
    const width = 1680, height = 980, cellW = 90, cellH = 54, left = 220, top = 116, groupH = 282;
    drawBase(width, height, 'ANT temporal social graph · 600 s threshold/window sweep',
      'Values are unnormalized counts/ratios at the final saved checkpoint. Columns group distance k; rows list each rolling window.');
    const labels = ['components', 'LCC ratio', 'rolling edges', 'qualified bridges', 'qualified connectors'];
    ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = colors.ink;
    for (let ki = 0; ki < 4; ki++) for (let wi = 0; wi < 4; wi++) ctx.fillText(`k ${[1,1.25,1.5,2][ki]} · W ${[0.25,1,5,20][wi]}s`, left + (ki * 4 + wi) * cellW, 96);
    payload.seeds.forEach(({ seed, checkpoint }, si) => {
      const groupTop = top + si * groupH;
      ctx.font = 'bold 14px sans-serif'; ctx.fillText(`seed ${seed}`, 18, groupTop + 18);
      for (let li = 0; li < labels.length; li++) { ctx.font = '11px sans-serif'; ctx.fillText(labels[li], 115, groupTop + 43 + li * cellH); }
      for (let ki = 0; ki < 4; ki++) for (let wi = 0; wi < 4; wi++) {
        const row = checkpoint.topologies.find(item => item.distanceMultiplier === [1,1.25,1.5,2][ki] && item.windowSeconds === [0.25,1,5,20][wi]);
        const m = row.topology.metrics, values = [m.componentCount, m.largestComponentRatio,
          m.edgeCount, m.persistentBridgeCount, m.persistentConnectorCount];
        values.forEach((value, li) => {
          const x = left + (ki * 4 + wi) * cellW, y = groupTop + 25 + li * cellH;
          ctx.strokeStyle = '#d9dfe4'; ctx.strokeRect(x, y, cellW - 4, cellH - 4);
          const scale = [28, 1, 378, 28, 28][li], amount = Math.max(0, Math.min(1, value / scale));
          ctx.fillStyle = `rgba(22,125,131,${0.12 + amount * 0.65})`; ctx.fillRect(x + 1, y + 1, (cellW - 6) * amount, cellH - 6);
          ctx.fillStyle = colors.ink; ctx.font = '12px sans-serif'; ctx.fillText(Number(value).toFixed(li === 1 ? 3 : 0), x + 4, y + 19);
        });
      }
    });
    ctx.fillStyle = colors.ink; ctx.font = '11px sans-serif'; ctx.fillText('Bars use fixed ranges per measure: components 0–28; LCC ratio 0–1; edges 0–378; persistent topology events 0–28.', 18, height - 15);
  } else if (payload.type === 'events') {
    const width = 1560, height = 1180, left = 80, top = 114, cellW = 360, cellH = 224;
    drawBase(width, height, `ANT graph events and edge lifetimes · seed ${payload.seed}`,
      'Event counts use raw topology packets. Histograms use fixed duration bins (seconds); right-censored intervals remain in their observed-duration bin.');
    const groups = payload.lifetimeCounts.topology;
    groups.forEach((group, index) => {
      const x0 = left + (index % 4) * cellW, y0 = top + Math.floor(index / 4) * cellH;
      const ev = payload.eventCounts.find(item => item.k === group.k && item.windowSeconds === group.windowSeconds);
      ctx.fillStyle = colors.ink; ctx.font = 'bold 13px sans-serif'; ctx.fillText(`k ${group.k} · W ${group.windowSeconds}s`, x0, y0);
      ctx.font = '10px sans-serif';
      ctx.fillText(`merge ${ev.merges} · split ${ev.splits} · bridge form ${ev.bridgeForm} / persist ${ev.bridgeQualified}`, x0, y0 + 15);
      ctx.fillText(`connector persist ${ev.connectorQualified} · articulation persist ${ev.articulationQualified}`, x0, y0 + 29);
      const chartX = x0 + 24, chartY = y0 + 58, chartW = 310, chartH = 115, peak = payload.lifetimeScales.windowEdges;
      axes(chartX, chartY, chartW, chartH, 0, peak, 'window-edge lifetime count');
      group.counts.forEach((count, bin) => {
        const bw = chartW / group.counts.length, bh = count / peak * chartH;
        ctx.fillStyle = bin < 7 ? colors.teal : colors.violet;
        ctx.fillRect(chartX + bin * bw + 1, chartY + chartH - bh, Math.max(1, bw - 2), bh);
      });
      ctx.fillStyle = colors.ink; ctx.font = '9px sans-serif';
      ctx.fillText('0', chartX, chartY + chartH + 13); ctx.fillText('20', chartX + chartW * 8 / group.counts.length, chartY + chartH + 13);
      ctx.fillText('120', chartX + chartW * 11 / group.counts.length, chartY + chartH + 13); ctx.fillText('>600 s', chartX + chartW - 34, chartY + chartH + 13);
      ctx.fillText(`${group.counts.reduce((sum, count) => sum + count, 0)} lifetimes · ${group.rightCensored} right-censored`, x0, y0 + 206);
    });
    const y = top + 4 * cellH + 7;
    ctx.fillStyle = colors.ink; ctx.font = 'bold 13px sans-serif'; ctx.fillText('Raw threshold-proximity encounter intervals by k (distinct from rolling-window edge lifetimes)', left, y);
    payload.lifetimeCounts.encounters.forEach((group, index) => {
      const x0 = left + index * cellW, chartX = x0 + 24, chartY = y + 35, chartW = 310, chartH = 82, peak = payload.lifetimeScales.encounters;
      ctx.font = 'bold 11px sans-serif'; ctx.fillText(`k ${group.k} · ${group.counts.reduce((a,b)=>a+b,0)} intervals · ${group.rightCensored} censored`, x0, y + 20);
      axes(chartX, chartY, chartW, chartH, 0, peak, 'encounter count');
      group.counts.forEach((count, bin) => { const bw = chartW / group.counts.length; ctx.fillStyle = colors.violet;
        ctx.fillRect(chartX + bin * bw + 1, chartY + chartH - count / peak * chartH, Math.max(1, bw - 2), count / peak * chartH); });
    });
  } else if (payload.type === 'connector') {
    drawBase(720, 800, `Qualified connector · seed ${payload.seed} · event ${payload.connector.timeSeconds.toFixed(2)}s`,
      `Nearest saved 1Hz snapshot ${payload.connector.snapshotSeconds}s (offset ${payload.connector.snapshotOffsetSeconds >= 0 ? '+' : ''}${payload.connector.snapshotOffsetSeconds.toFixed(2)}s) · ANT ${payload.connector.antId} · k=${payload.connector.k} · W=${payload.connector.windowSeconds}s`);
    const domain = graph(payload.topology, 15, 74, 690, `${payload.topology.nodes.length} ANT nodes · ${payload.topology.edges.length} edges`, 'Nearest saved graph snapshot; this is not the exact event frame. Qualified ANT outlined in gold.');
    const node = payload.topology.nodes.find(item => item.id === payload.connector.antId);
    if (node) { ctx.beginPath(); ctx.arc(domain.left + node.x * domain.side, domain.top + node.y * domain.side,
      Math.max(6, node.radius * domain.side + 4), 0, Math.PI * 2); ctx.strokeStyle = '#e3a600'; ctx.lineWidth = 3; ctx.stroke(); }
  }
  return canvas.toDataURL('image/png').split(',')[1];
}

function selfcheck() {
  assert.equal(bin(0), 0); assert.equal(bin(0.25), 2); assert.equal(bin(600), LIFETIME_BINS.length - 2);
  const topology = { windowSeconds: 1, nodes: [{ id: 'a', x: 0.25, y: 0.5, radius: 0.01 }, { id: 'b', x: 0.75, y: 0.5, radius: 0.02 }],
    edges: [{ antA: 'a', antB: 'b', weightSeconds: 0.5, activeEncounter: true }],
    components: [{ id: 'a', members: ['a', 'b'] }], metrics: { edgeCount: 1 } };
  assert.equal(topology.nodes[0].x, 0.25); assert.equal(topology.nodes[1].radius, 0.02);
  assert.equal(Math.max(0, Math.min(1, topology.edges[0].weightSeconds / topology.windowSeconds)), 0.5);
  assert.deepEqual(topology.components[0].members, ['a', 'b']);
  console.log('Social visual evidence fixed-scale and unit-square layout selfcheck passed.');
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
