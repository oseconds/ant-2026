import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HZ = 10;
const ROUTELET_SECONDS = 1;
const SAMPLES_PER_ROUTELET = HZ * ROUTELET_SECONDS;
const BODY_DIAMETER_NORMALIZED_UNITS = 0.012;
const DISTANCE_SCALES = [0.012, 0.024];
const MINIMUM_GAP_SECONDS = 1;
const MINIMUM_GAP_SAMPLES = HZ * MINIMUM_GAP_SECONDS;
const MINIMUM_PATH_LENGTH_NORMALIZED_UNITS = 1e-4;
const MINIMUM_OVERLAP_FRACTION = 0.75;
const MINIMUM_TANGENT_ALIGNED_FRACTION = 0.75;
const MINIMUM_CURVATURE_SAMPLES = 3;
const MINIMUM_CURVATURE_SIGN_AGREEMENT = 0.75;
const CURVATURE_NUMERIC_EPSILON_PER_NORMALIZED_UNIT = 1e-6;
const TANGENT_COSINE_GATE = Math.cos(Math.PI / 6);
const MAXIMUM_REPRESENTATIVES_PER_SCALE = 5;

const FROZEN_CASES = [
  { label: 'production-seed-20261005', path: 'docs/ant/evidence/2026-10-22-spatial-dynamics/baseline/seed-20261005/result.json', sha256: '9c88acf923ccf798e81a3ec04f68bece7eebe3c8bb6aab8b32ec8a7173c29fc1', windows: [{ label: '0-600s', startSeconds: 0, endSeconds: 600 }] },
  { label: 'production-seed-20261006', path: 'docs/ant/evidence/2026-10-22-spatial-dynamics/baseline/seed-20261006/result.json', sha256: '48131a7b25b687e47891803a595716bb4d386b110ee99dd34052e143fe1cabf1', windows: [{ label: '0-600s', startSeconds: 0, endSeconds: 600 }] },
  { label: 'production-seed-20261007', path: 'docs/ant/evidence/2026-10-22-spatial-dynamics/baseline/seed-20261007/result.json', sha256: 'a1f67c04d2f1c3822527365cff8a96565e6d6d69eba023bc933d88b8a5405371', windows: [{ label: '0-600s', startSeconds: 0, endSeconds: 600 }] },
  { label: 'dtFeedback-seed-20261005', path: 'docs/ant/evidence/2026-10-22-spatial-dynamics/movement/natural/dtFeedback-20261005/result.json', sha256: '418142326ea2fea06aee7a8fb1ba49360c493b541cff0c581dfa0451bd9ad70a', windows: [{ label: '0-600s', startSeconds: 0, endSeconds: 600 }] },
  { label: 'dtFeedback-seed-20261006', path: 'docs/ant/evidence/2026-10-22-spatial-dynamics/movement/natural/dtFeedback-20261006/result.json', sha256: 'e248a10f4a168bcbb1f23aa957a281882a8a7033fa1d01c24fb0c500f3d9c904', windows: [{ label: '0-600s', startSeconds: 0, endSeconds: 600 }] },
  { label: 'dtFeedback-seed-20261007', path: 'docs/ant/evidence/2026-10-22-spatial-dynamics/movement/natural/dtFeedback-20261007/result.json', sha256: '3c8a551b92ed956709bdcb6cd73c7acc14da85f36bc2e1c792603cec62e333c3', windows: [{ label: '0-600s', startSeconds: 0, endSeconds: 600 }] },
  { label: 'long-production-seed-20261005', path: 'docs/ant/evidence/2026-10-22-spatial-dynamics/long-run/production-20261005/result.json', sha256: 'd7d1bbacc671638e79a0e68170d23edc50587f19ee37f6c7c2bdbb2b12e91179', windows: [{ label: '480-600s', startSeconds: 480, endSeconds: 600 }, { label: '1680-1800s', startSeconds: 1680, endSeconds: 1800 }, { label: '7080-7200s', startSeconds: 7080, endSeconds: 7200 }] },
  { label: 'long-dtFeedback-seed-20261005', path: 'docs/ant/evidence/2026-10-22-spatial-dynamics/long-run/dtFeedback-20261005/result.json', sha256: '81581cc2a74be95f5dcf3aa52a3f37b2f590c2bd007eebe51311bb67d3412496', windows: [{ label: '480-600s', startSeconds: 480, endSeconds: 600 }, { label: '1680-1800s', startSeconds: 1680, endSeconds: 1800 }, { label: '7080-7200s', startSeconds: 7080, endSeconds: 7200 }] }
];

export function analyzeCollectiveRoutes(samples) {
  if (!Array.isArray(samples)) throw new TypeError('Expected a sample array.');

  const byAnt = new Map();
  const seen = new Set();
  for (const sample of samples) {
    if (!sample || !Number.isInteger(sample.sampleIndex) || typeof sample.id !== 'string'
      || !Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
      throw new TypeError('Each sample needs integer sampleIndex, string id, and finite x/y.');
    }
    const key = `${sample.id}\u0000${sample.sampleIndex}`;
    if (seen.has(key)) throw new TypeError(`Duplicate sample for ant ${sample.id} at sample ${sample.sampleIndex}.`);
    seen.add(key);
    const rows = byAnt.get(sample.id) || new Map();
    rows.set(sample.sampleIndex, { sampleIndex: sample.sampleIndex, x: sample.x, y: sample.y });
    byAnt.set(sample.id, rows);
  }

  const routelets = [];
  for (const [id, bySampleIndex] of byAnt) {
    const sampleIndices = [...bySampleIndex.keys()].sort((a, b) => a - b);
    if (!sampleIndices.length) continue;
    for (let startSampleIndex = Math.ceil(sampleIndices[0] / SAMPLES_PER_ROUTELET) * SAMPLES_PER_ROUTELET;
      startSampleIndex + SAMPLES_PER_ROUTELET <= sampleIndices.at(-1); startSampleIndex += SAMPLES_PER_ROUTELET) {
      const points = Array.from({ length: SAMPLES_PER_ROUTELET + 1 }, (_, offset) => bySampleIndex.get(startSampleIndex + offset));
      if (!points.every(Boolean)) continue;
      const routelet = makeRoutelet(id, startSampleIndex, points);
      if (routelet.pathLengthNormalizedUnits >= MINIMUM_PATH_LENGTH_NORMALIZED_UNITS) routelets.push(routelet);
    }
  }

  routelets.sort((a, b) => a.startSampleIndex - b.startSampleIndex || a.id.localeCompare(b.id));
  return summarizeRoutelets(routelets, samples.length);
}

export function analyzeCollectiveRouteletAnchors(samples) {
  const routelets = buildRouteletsV4(samples);
  return summarizeRouteletAnchors(routelets, samples.length);
}

export function renderAnchorRepresentativeSvg(representative, metadata = {}) {
  if (!representative?.anchor || !Array.isArray(representative.partners)) {
    throw new TypeError('Expected a fixed-anchor representative with partner routelets.');
  }
  const width = 1240;
  const margin = 34, panelWidth = 570, panelGap = 26;
  const panelTop = 110, panelSize = 500;
  const plotInset = 42;
  const anchor = representative.anchor;
  const routes = [{ id: anchor.id, routelet: anchor, color: '#152b39', isAnchor: true },
    ...representative.partners.map((partner, index) => ({
      id: partner.id, routelet: partner.earliestMatch.routelet,
      color: ['#d1495b', '#00798c', '#edae49', '#6a4c93', '#4f772d', '#e07a5f', '#577590'][index % 7],
      isAnchor: false
    }))];
  const allPoints = routes.flatMap(route => route.routelet.polylineNormalizedUnits);
  const localBounds = paddedBounds(allPoints);
  const worldPlot = { x: margin + plotInset, y: panelTop + plotInset, size: panelSize - 2 * plotInset,
    minX: 0, maxX: 1, minY: 0, maxY: 1 };
  const localPlot = { ...worldPlot, x: margin + panelWidth + panelGap + plotInset,
    minX: localBounds.minX, maxX: localBounds.maxX, minY: localBounds.minY, maxY: localBounds.maxY };
  const escaped = escapeXml;
  const title = `${metadata.caseLabel ?? 'case'} · ${metadata.windowLabel ?? 'window'} · scale ${metadata.scaleNormalizedUnits ?? ''}`;
  const routeLine = (route, plot) => {
    const points = route.routelet.polylineNormalizedUnits.map(([x, y]) => `${plotX(x, plot)},${plotY(y, plot)}`).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${route.color}" stroke-width="${route.isAnchor ? 3.4 : 2.2}" stroke-linecap="round" stroke-linejoin="round" opacity="${route.isAnchor ? 1 : 0.88}"/>`;
  };
  const supportPoints = (plot) => anchor.curvatureSupportLocations.map(location => {
    const [x, y] = location.midpointNormalizedUnits;
    return `<circle cx="${plotX(x, plot)}" cy="${plotY(y, plot)}" r="3.1" fill="#152b39" stroke="white" stroke-width="1.1"/>`;
  }).join('');
  const panels = [
    { title: 'World view: normalized coordinates [0,1] × [0,1]', plot: worldPlot, clipId: 'world-clip', fixed: true },
    { title: 'Local inset (display only)', plot: localPlot, clipId: 'local-clip', fixed: false }
  ].map(panel => {
    const x = panel.plot.x, y = panel.plot.y, size = panel.plot.size;
    return `<g>
      <text x="${x}" y="${panelTop - 10}" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#17212b">${escaped(panel.title)}</text>
      <rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fbfcfd" stroke="#72808c" stroke-width="1"/>
      <defs><clipPath id="${panel.clipId}"><rect x="${x}" y="${y}" width="${size}" height="${size}"/></clipPath></defs>
      ${axisTicks(panel.plot, panel.fixed)}
      <g clip-path="url(#${panel.clipId})">${routes.map(route => routeLine(route, panel.plot)).join('')}${supportPoints(panel.plot)}</g>
    </g>`;
  }).join('\n');
  const routeLabelStartY = 612;
  const height = routeLabelStartY + routes.length * 18 + 18;
  const routeLabels = routes.map((route, index) => {
    const time = `${route.routelet.startSeconds.toFixed(1)}–${route.routelet.endSeconds.toFixed(1)} s`;
    const label = `${route.isAnchor ? 'ANCHOR' : 'PARTNER'} · ${route.id} · ${time}`;
    const y = routeLabelStartY + index * 18;
    return `<text x="${margin}" y="${y}" font-family="Arial,sans-serif" font-size="13" fill="${route.color}">${escaped(label)}</text>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="white"/>
  <text x="${margin}" y="30" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="#17212b">${escaped(title)}</text>
  ${routeLabels}
  ${panels}
  </svg>\n`;
}

export function sourceTrajectoryFrameToSamples(frame) {
  if (!frame || !Number.isInteger(frame.tick) || frame.tick % 6 !== 0 || !Array.isArray(frame.agents)) {
    throw new TypeError('Expected a trajectory10Hz frame with tick divisible by six and an agents array.');
  }
  const sampleIndex = frame.tick / 6;
  return frame.agents.map(agent => {
    if (!Array.isArray(agent) || typeof agent[0] !== 'string'
      || !Number.isFinite(agent[1]) || !Number.isFinite(agent[2])) {
      throw new TypeError(`Malformed agent tuple at source tick ${frame.tick}.`);
    }
    return { id: agent[0], sampleIndex, x: agent[1], y: agent[2] };
  });
}

export function analyzeFrozenCases(repoRoot = process.cwd()) {
  const results = [];
  for (const frozenCase of FROZEN_CASES) {
    const absolutePath = resolve(repoRoot, frozenCase.path);
    const bytes = readFileSync(absolutePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== frozenCase.sha256) {
      throw new Error(`Frozen input hash mismatch for ${frozenCase.path}: ${sha256}`);
    }
    const samplesByWindow = new Map(frozenCase.windows.map(window => [window.label, []]));
    const frameCountByWindow = new Map(frozenCase.windows.map(window => [window.label, 0]));
    let priorTick = null, firstTick = null, rowCount = 0;
    const frameKey = Buffer.from('"trajectory10Hz"');
    const keyOffset = bytes.indexOf(frameKey);
    if (keyOffset < 0) throw new Error(`trajectory10Hz not found in ${frozenCase.path}`);
    let position = keyOffset + frameKey.length;
    while (isJsonWhitespace(bytes[position])) position += 1;
    if (bytes[position++] !== 0x3a) throw new Error(`Missing trajectory10Hz colon in ${frozenCase.path}`);
    while (isJsonWhitespace(bytes[position])) position += 1;
    if (bytes[position++] !== 0x5b) throw new Error(`trajectory10Hz is not an array in ${frozenCase.path}`);

    while (position < bytes.length) {
      while (isJsonWhitespace(bytes[position]) || bytes[position] === 0x2c) position += 1;
      if (bytes[position] === 0x5d) break;
      if (bytes[position] !== 0x7b) throw new Error(`Expected frame object in ${frozenCase.path} at byte ${position}`);
      const frameEnd = findObjectEnd(bytes, position);
      const tick = readLeadingTick(bytes, position, frozenCase.path);
      if (firstTick === null) firstTick = tick;
      if (priorTick !== null && tick !== priorTick + 6) {
        throw new Error(`Unexpected source tick step in ${frozenCase.path}: ${priorTick} to ${tick}`);
      }
      priorTick = tick;
      const sampleIndex = tick / 6;
      const matchingWindows = frozenCase.windows.filter(window =>
        sampleIndex >= window.startSeconds * HZ && sampleIndex <= window.endSeconds * HZ);
      if (matchingWindows.length) {
        const frame = JSON.parse(bytes.subarray(position, frameEnd + 1).toString('utf8'));
        const samples = sourceTrajectoryFrameToSamples(frame);
        for (const window of matchingWindows) {
          samplesByWindow.get(window.label).push(...samples);
          frameCountByWindow.set(window.label, frameCountByWindow.get(window.label) + 1);
        }
      }
      rowCount += 1;
      position = frameEnd + 1;
    }
    const durationSeconds = Math.max(...frozenCase.windows.map(window => window.endSeconds));
    if (firstTick !== 6 || priorTick !== durationSeconds * HZ * 6 || rowCount !== durationSeconds * HZ) {
      throw new Error(`Unexpected trajectory extent in ${frozenCase.path}: ticks ${firstTick}..${priorTick}, ${rowCount} rows`);
    }

    for (const window of frozenCase.windows) {
      const samples = samplesByWindow.get(window.label);
      results.push({
        source: { label: frozenCase.label, path: frozenCase.path, byteLength: bytes.length, sha256, rowCount },
        window: { ...window, firstObservedSampleIndex: samples.length ? samples[0].sampleIndex : null,
          lastObservedSampleIndex: samples.length ? samples.at(-1).sampleIndex : null,
          trajectoryFrameCount: frameCountByWindow.get(window.label) },
        analysis: analyzeCollectiveRoutes(samples)
      });
    }
  }
  return {
    protocolVersion: 3,
    sourceReceipt: 'git show 9fcd962:docs/ant/evidence/2026-10-22-spatial-dynamics/validation/packed-results.json',
    generatedBySha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    protocolSha256: createHash('sha256').update(readFileSync(resolve(repoRoot,
      'docs/ant/evidence/2026-10-23-natural-field-transfer/collective/README.md'))).digest('hex'),
    interpretation: 'Candidate local curved routelet reuse only; no claim of a persistent long corridor or causal field effect.',
    results
  };
}

export function analyzeFrozenAnchorCases(repoRoot = process.cwd(), selectedCaseLabels = null,
  figureDirectory = 'anchor-representatives-v4') {
  const results = [];
  const selectedCases = selectedCaseLabels
    ? FROZEN_CASES.filter(frozenCase => selectedCaseLabels.includes(frozenCase.label))
    : FROZEN_CASES;
  if (selectedCaseLabels && selectedCases.length !== selectedCaseLabels.length) {
    throw new Error(`Unknown frozen case label: ${selectedCaseLabels.find(label => !selectedCases.some(item => item.label === label))}`);
  }
  for (const frozenCase of selectedCases) {
    const absolutePath = resolve(repoRoot, frozenCase.path);
    const bytes = readFileSync(absolutePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== frozenCase.sha256) throw new Error(`Frozen input hash mismatch for ${frozenCase.path}: ${sha256}`);
    const samplesByWindow = new Map(frozenCase.windows.map(window => [window.label, []]));
    const frameCountByWindow = new Map(frozenCase.windows.map(window => [window.label, 0]));
    let priorTick = null, firstTick = null, rowCount = 0;
    const frameKey = Buffer.from('"trajectory10Hz"');
    const keyOffset = bytes.indexOf(frameKey);
    if (keyOffset < 0) throw new Error(`trajectory10Hz not found in ${frozenCase.path}`);
    let position = keyOffset + frameKey.length;
    while (isJsonWhitespace(bytes[position])) position += 1;
    if (bytes[position++] !== 0x3a) throw new Error(`Missing trajectory10Hz colon in ${frozenCase.path}`);
    while (isJsonWhitespace(bytes[position])) position += 1;
    if (bytes[position++] !== 0x5b) throw new Error(`trajectory10Hz is not an array in ${frozenCase.path}`);

    while (position < bytes.length) {
      while (isJsonWhitespace(bytes[position]) || bytes[position] === 0x2c) position += 1;
      if (bytes[position] === 0x5d) break;
      if (bytes[position] !== 0x7b) throw new Error(`Expected frame object in ${frozenCase.path} at byte ${position}`);
      const frameEnd = findObjectEnd(bytes, position);
      const tick = readLeadingTick(bytes, position, frozenCase.path);
      if (firstTick === null) firstTick = tick;
      if (priorTick !== null && tick !== priorTick + 6) {
        throw new Error(`Unexpected source tick step in ${frozenCase.path}: ${priorTick} to ${tick}`);
      }
      priorTick = tick;
      const sampleIndex = tick / 6;
      const matchingWindows = frozenCase.windows.filter(window =>
        sampleIndex >= window.startSeconds * HZ && sampleIndex <= window.endSeconds * HZ);
      if (matchingWindows.length) {
        const frame = JSON.parse(bytes.subarray(position, frameEnd + 1).toString('utf8'));
        const samples = sourceTrajectoryFrameToSamples(frame);
        for (const window of matchingWindows) {
          samplesByWindow.get(window.label).push(...samples);
          frameCountByWindow.set(window.label, frameCountByWindow.get(window.label) + 1);
        }
      }
      rowCount += 1;
      position = frameEnd + 1;
    }

    const durationSeconds = Math.max(...frozenCase.windows.map(window => window.endSeconds));
    if (firstTick !== 6 || priorTick !== durationSeconds * HZ * 6 || rowCount !== durationSeconds * HZ) {
      throw new Error(`Unexpected trajectory extent in ${frozenCase.path}: ticks ${firstTick}..${priorTick}, ${rowCount} rows`);
    }
    for (const window of frozenCase.windows) {
      const samples = samplesByWindow.get(window.label);
      const analysis = analyzeCollectiveRouteletAnchors(samples);
      for (const [scale, summary] of Object.entries(analysis.scales)) {
        if (summary.representative) {
          summary.representativeFigurePath = `docs/ant/evidence/2026-10-23-natural-field-transfer/collective/${figureDirectory}/${slug(frozenCase.label)}--${slug(window.label)}--d${scale.replace('.', '-')}.svg`;
        }
      }
      results.push({
        source: { label: frozenCase.label, path: frozenCase.path, byteLength: bytes.length, sha256, rowCount },
        window: { ...window, firstObservedSampleIndex: samples.length ? samples[0].sampleIndex : null,
          lastObservedSampleIndex: samples.length ? samples.at(-1).sampleIndex : null,
          trajectoryFrameCount: frameCountByWindow.get(window.label) },
        analysis
      });
    }
  }
  const v3Root = resolve(repoRoot, 'docs/ant/evidence/2026-10-23-natural-field-transfer/collective/v3');
  return {
    protocolVersion: 4,
    status: 'exploratory fixed-anchor follow-up; v3 predicate reused without new gates',
    caseSelection: selectedCaseLabels ? [...selectedCaseLabels] : 'all frozen cases/windows',
    sourceReceipt: 'git show 9fcd962:docs/ant/evidence/2026-10-22-spatial-dynamics/validation/packed-results.json',
    generatedBySha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    protocolSha256: createHash('sha256').update(readFileSync(resolve(repoRoot,
      'docs/ant/evidence/2026-10-23-natural-field-transfer/collective/protocol-v4-fixed-anchor-followup.md'))).digest('hex'),
    v3ExecutedScriptSha256: createHash('sha256').update(readFileSync(resolve(v3Root, 'ant-transfer-collective.js'))).digest('hex'),
    v3ProtocolSha256: createHash('sha256').update(readFileSync(resolve(v3Root, 'protocol.md'))).digest('hex'),
    results
  };
}

function buildRouteletsV4(samples) {
  if (!Array.isArray(samples)) throw new TypeError('Expected a sample array.');
  const byAnt = new Map(), seen = new Set();
  for (const sample of samples) {
    if (!sample || !Number.isInteger(sample.sampleIndex) || typeof sample.id !== 'string'
      || !Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
      throw new TypeError('Each sample needs integer sampleIndex, string id, and finite x/y.');
    }
    const key = `${sample.id}\u0000${sample.sampleIndex}`;
    if (seen.has(key)) throw new TypeError(`Duplicate sample for ant ${sample.id} at sample ${sample.sampleIndex}.`);
    seen.add(key);
    const rows = byAnt.get(sample.id) || new Map();
    rows.set(sample.sampleIndex, { sampleIndex: sample.sampleIndex, x: sample.x, y: sample.y });
    byAnt.set(sample.id, rows);
  }
  const routelets = [];
  for (const [id, bySampleIndex] of byAnt) {
    const sampleIndices = [...bySampleIndex.keys()].sort((a, b) => a - b);
    if (!sampleIndices.length) continue;
    for (let startSampleIndex = Math.ceil(sampleIndices[0] / SAMPLES_PER_ROUTELET) * SAMPLES_PER_ROUTELET;
      startSampleIndex + SAMPLES_PER_ROUTELET <= sampleIndices.at(-1); startSampleIndex += SAMPLES_PER_ROUTELET) {
      const points = Array.from({ length: SAMPLES_PER_ROUTELET + 1 }, (_, offset) => bySampleIndex.get(startSampleIndex + offset));
      if (!points.every(Boolean)) continue;
      const routelet = makeRoutelet(id, startSampleIndex, points);
      if (routelet.pathLengthNormalizedUnits >= MINIMUM_PATH_LENGTH_NORMALIZED_UNITS) routelets.push(routelet);
    }
  }
  routelets.sort((a, b) => a.startSampleIndex - b.startSampleIndex || a.id.localeCompare(b.id));
  return routelets;
}

function summarizeRouteletAnchors(routelets, sampleCount) {
  const scales = Object.fromEntries(DISTANCE_SCALES.map(scale => [String(scale), {
    comparisonCount: 0, candidatePairCount: 0, candidateAntPairCounts: new Map(),
    candidateGapSeconds: [], geometry: createAnchorGeometryBuckets(), anchorByKey: new Map()
  }]));
  for (const state of Object.values(scales)) {
    for (const routelet of routelets) state.anchorByKey.set(routeletKey(routelet), { routelet, partners: new Map() });
  }
  let comparisonCount = 0;
  const allAntPairs = new Set();

  for (const { first, second, temporalGapSamples } of findRouteletPairs(routelets,
    Math.max(...DISTANCE_SCALES), MINIMUM_GAP_SAMPLES)) {
    comparisonCount += 1;
    allAntPairs.add([first.id, second.id].sort().join('\u0000'));
    for (const scale of DISTANCE_SCALES) {
      const state = scales[String(scale)];
      const firstToSecond = measureDirection(first, second, scale);
      const secondToFirst = measureDirection(second, first, scale);
      state.comparisonCount += 1;
      if (!passesGates(firstToSecond, secondToFirst)) continue;
      state.candidatePairCount += 1;
      const antPair = [first.id, second.id].sort().join('\u0000');
      state.candidateAntPairCounts.set(antPair, (state.candidateAntPairCounts.get(antPair) || 0) + 1);
      state.candidateGapSeconds.push(temporalGapSamples / HZ);

      addAnchorPartnerEvent(state.anchorByKey, first, second, temporalGapSamples, firstToSecond, secondToFirst);
      addAnchorPartnerEvent(state.anchorByKey, second, first, temporalGapSamples, secondToFirst, firstToSecond);
      recordAnchorGeometry(state.geometry, first, second, firstToSecond, secondToFirst);
    }
  }

  const scaleSummaries = Object.fromEntries(Object.entries(scales).map(([scale, state]) => {
    const routeletAnchors = [...state.anchorByKey.values()];
    const counts = routeletAnchors.map(anchor => distinctPartnerCount(anchor));
    const withPartners = routeletAnchors.filter(anchor => distinctPartnerCount(anchor) > 0);
    const eventCounts = routeletAnchors.map(anchor => totalPartnerEvents(anchor));
    const partnerCountsWithinAnchors = routeletAnchors.flatMap(anchor => [...anchor.partners.values()].map(events => events.length));
    const spans = withPartners.map(anchor => partnerStartTimeSpan(anchor));
    const offsets = withPartners.flatMap(anchor => allPartnerEvents(anchor).map(event => event.signedStartOffsetSeconds));
    const gaps = withPartners.flatMap(anchor => allPartnerEvents(anchor).map(event => event.intervalGapSeconds));
    const recurrenceGaps = withPartners.flatMap(anchor => partnerRecurrenceGaps(anchor));
    const countThresholds = Object.fromEntries([1, 2, 3, 5].map(threshold =>
      [`>=${threshold}`, counts.filter(count => count >= threshold).length]));
    const histogram = Object.create(null);
    for (const count of counts) histogram[String(count)] = (histogram[String(count)] || 0) + 1;
    const pairCounts = [...state.candidateAntPairCounts.values()];
    const representativeAnchor = selectRepresentativeAnchor(withPartners);
    return [scale, {
      comparisonCount: state.comparisonCount,
      candidatePairCount: state.candidatePairCount,
      anchorPartnerEventCount: withPartners.reduce((sum, anchor) => sum + totalPartnerEvents(anchor), 0),
      candidateTemporalIntervalGapSeconds: describe(state.candidateGapSeconds),
      distinctCandidateAntPairCount: state.candidateAntPairCounts.size,
      antPairsWithMultipleCandidateComparisons: pairCounts.filter(count => count > 1).length,
      anchors: {
        totalRouteletCount: routeletAnchors.length,
        withAtLeastOnePartnerCount: withPartners.length,
        partnerCountThresholds: countThresholds,
        distinctPartnerAntCountPerAnchor: describe(counts),
        distinctPartnerAntCountHistogram: histogram,
        qualifyingPartnerEventCountPerAnchor: describe(eventCounts),
        matchingRouteletCountPerPartnerAnt: describe(partnerCountsWithinAnchors),
        partnerStartTimeSpanSeconds: describe(spans),
        signedPartnerStartOffsetSeconds: describe(offsets),
        anchorToPartnerIntervalGapSeconds: describe(gaps),
        withinPartnerRecurrenceGapSeconds: describe(recurrenceGaps),
        geometryAllRoutelets: summarizeAnchorRouteletGeometry(routeletAnchors.map(anchor => anchor.routelet)),
        geometryWithAtLeastOnePartner: summarizeAnchorRouteletGeometry(withPartners.map(anchor => anchor.routelet))
      },
      candidateGeometryPerAnchorPartnerEvent: summarizeCandidateGeometry(state.geometry),
      representative: representativeAnchor ? publicAnchorRepresentative(representativeAnchor) : null
    }];
  }));

  return {
    parameters: {
      hz: HZ, routeletSeconds: ROUTELET_SECONDS, samplesPerRoutelet: SAMPLES_PER_ROUTELET,
      sourceTickDivisor: 6, bodyDiameterNormalizedUnits: BODY_DIAMETER_NORMALIZED_UNITS,
      distanceScalesNormalizedUnits: [...DISTANCE_SCALES], minimumTemporalGapSeconds: MINIMUM_GAP_SECONDS,
      minimumPathLengthNormalizedUnits: MINIMUM_PATH_LENGTH_NORMALIZED_UNITS,
      tangentAngleGateRadians: Math.PI / 6, curvatureNumericEpsilonPerNormalizedUnit: CURVATURE_NUMERIC_EPSILON_PER_NORMALIZED_UNIT,
      minimumOverlapFraction: MINIMUM_OVERLAP_FRACTION,
      minimumTangentAlignedFraction: MINIMUM_TANGENT_ALIGNED_FRACTION,
      minimumCurvatureSamples: MINIMUM_CURVATURE_SAMPLES,
      minimumCurvatureSignAgreement: MINIMUM_CURVATURE_SIGN_AGREEMENT,
      representativeSelection: 'maximum distinct partner ants; tie earliest anchor start time then ant ID',
      descriptivePartnerThresholds: [1, 2, 3, 5]
    },
    sampleCount,
    routeletCount: routelets.length,
    distinctRouteletAntCount: new Set(routelets.map(routelet => routelet.id)).size,
    comparisonCount,
    distinctAntPairCount: allAntPairs.size,
    scales: scaleSummaries
  };
}

function addAnchorPartnerEvent(anchorByKey, anchorRoutelet, partnerRoutelet, intervalGapSamples, anchorToPartner, partnerToAnchor) {
  const anchor = anchorByKey.get(routeletKey(anchorRoutelet));
  const partnerEvents = anchor.partners.get(partnerRoutelet.id) || [];
  const event = {
    partnerRoutelet,
    partnerStartSampleIndex: partnerRoutelet.startSampleIndex,
    partnerEndSampleIndex: partnerRoutelet.endSampleIndex,
    signedStartOffsetSeconds: (partnerRoutelet.startSampleIndex - anchorRoutelet.startSampleIndex) / HZ,
    intervalGapSeconds: intervalGapSamples / HZ,
    anchorToPartner,
    partnerToAnchor
  };
  partnerEvents.push(event);
  anchor.partners.set(partnerRoutelet.id, partnerEvents);
}

function createAnchorGeometryBuckets() {
  return Object.fromEntries([
    'anchorSignedTravelTurnRadians', 'partnerSignedTravelTurnRadians',
    'anchorAbsoluteTravelTurnRadians', 'partnerAbsoluteTravelTurnRadians',
    'anchorNetTurnRadians', 'partnerNetTurnRadians',
    'anchorMaximumChordDeviationNormalizedUnits', 'partnerMaximumChordDeviationNormalizedUnits',
    'anchorCurvatureSupportSegments', 'partnerCurvatureSupportSegments',
    'anchorToPartnerOverlapFraction', 'partnerToAnchorOverlapFraction',
    'anchorToPartnerTangentAlignedFraction', 'partnerToAnchorTangentAlignedFraction',
    'anchorToPartnerTangentAxisAngleRadians', 'partnerToAnchorTangentAxisAngleRadians',
    'anchorToPartnerDirectedTangentCosine', 'partnerToAnchorDirectedTangentCosine',
    'anchorToPartnerMeanNearestDistanceNormalizedUnits', 'partnerToAnchorMeanNearestDistanceNormalizedUnits',
    'anchorToPartnerCurvatureSignAgreementFraction', 'partnerToAnchorCurvatureSignAgreementFraction',
    'anchorToPartnerCurvatureMatchedSamples', 'partnerToAnchorCurvatureMatchedSamples',
    'anchorToPartnerCurvatureMatchedRunCount', 'partnerToAnchorCurvatureMatchedRunCount'
  ].map(key => [key, []]));
}

function recordAnchorGeometry(buckets, first, second, firstToSecond, secondToFirst) {
  for (const [anchor, partner, anchorToPartner, partnerToAnchor] of [
    [first, second, firstToSecond, secondToFirst], [second, first, secondToFirst, firstToSecond]
  ]) {
    const values = {
      anchorSignedTravelTurnRadians: anchor.signedTravelTurnRadians,
      partnerSignedTravelTurnRadians: partner.signedTravelTurnRadians,
      anchorAbsoluteTravelTurnRadians: anchor.absoluteTravelTurnRadians,
      partnerAbsoluteTravelTurnRadians: partner.absoluteTravelTurnRadians,
      anchorNetTurnRadians: anchor.netTurnRadians,
      partnerNetTurnRadians: partner.netTurnRadians,
      anchorMaximumChordDeviationNormalizedUnits: anchor.maximumChordDeviationNormalizedUnits,
      partnerMaximumChordDeviationNormalizedUnits: partner.maximumChordDeviationNormalizedUnits,
      anchorCurvatureSupportSegments: anchor.curvatureSupportSegmentIndices.length,
      partnerCurvatureSupportSegments: partner.curvatureSupportSegmentIndices.length,
      anchorToPartnerOverlapFraction: anchorToPartner.overlapFraction,
      partnerToAnchorOverlapFraction: partnerToAnchor.overlapFraction,
      anchorToPartnerTangentAlignedFraction: anchorToPartner.tangentAlignedFraction,
      partnerToAnchorTangentAlignedFraction: partnerToAnchor.tangentAlignedFraction,
      anchorToPartnerTangentAxisAngleRadians: anchorToPartner.tangentAxisAngleRadians,
      partnerToAnchorTangentAxisAngleRadians: partnerToAnchor.tangentAxisAngleRadians,
      anchorToPartnerDirectedTangentCosine: anchorToPartner.directedTangentCosine,
      partnerToAnchorDirectedTangentCosine: partnerToAnchor.directedTangentCosine,
      anchorToPartnerMeanNearestDistanceNormalizedUnits: anchorToPartner.meanNearestDistanceNormalizedUnits,
      partnerToAnchorMeanNearestDistanceNormalizedUnits: partnerToAnchor.meanNearestDistanceNormalizedUnits,
      anchorToPartnerCurvatureSignAgreementFraction: anchorToPartner.curvatureSignAgreementFraction,
      partnerToAnchorCurvatureSignAgreementFraction: partnerToAnchor.curvatureSignAgreementFraction,
      anchorToPartnerCurvatureMatchedSamples: anchorToPartner.curvatureMatchedSamples,
      partnerToAnchorCurvatureMatchedSamples: partnerToAnchor.curvatureMatchedSamples,
      anchorToPartnerCurvatureMatchedRunCount: anchorToPartner.curvatureMatchedRunLengths.length,
      partnerToAnchorCurvatureMatchedRunCount: partnerToAnchor.curvatureMatchedRunLengths.length
    };
    for (const [key, value] of Object.entries(values)) if (Number.isFinite(value)) buckets[key].push(value);
  }
}

function summarizeAnchorRouteletGeometry(routelets) {
  return {
    pathLengthNormalizedUnits: describe(routelets.map(routelet => routelet.pathLengthNormalizedUnits)),
    signedTravelTurnRadians: describe(routelets.map(routelet => routelet.signedTravelTurnRadians)),
    absoluteTravelTurnRadians: describe(routelets.map(routelet => routelet.absoluteTravelTurnRadians)),
    netTurnRadians: describe(routelets.map(routelet => routelet.netTurnRadians)),
    maximumChordDeviationNormalizedUnits: describe(routelets.map(routelet => routelet.maximumChordDeviationNormalizedUnits)),
    curvatureSupportSegments: describe(routelets.map(routelet => routelet.curvatureSupportSegmentIndices.length))
  };
}

function routeletKey(routelet) { return `${routelet.id}\u0000${routelet.startSampleIndex}`; }
function distinctPartnerCount(anchor) { return anchor.partners.size; }
function totalPartnerEvents(anchor) { return [...anchor.partners.values()].reduce((sum, events) => sum + events.length, 0); }
function allPartnerEvents(anchor) { return [...anchor.partners.values()].flat(); }

function partnerStartTimeSpan(anchor) {
  const starts = allPartnerEvents(anchor).map(event => event.partnerStartSampleIndex);
  return starts.length ? (Math.max(...starts) - Math.min(...starts)) / HZ : 0;
}

function partnerRecurrenceGaps(anchor) {
  const gaps = [];
  for (const events of anchor.partners.values()) {
    const starts = events.map(event => event.partnerStartSampleIndex).sort((a, b) => a - b);
    for (let index = 1; index < starts.length; index += 1) gaps.push((starts[index] - starts[index - 1]) / HZ);
  }
  return gaps;
}

function selectRepresentativeAnchor(anchors) {
  return [...anchors].sort((a, b) => distinctPartnerCount(b) - distinctPartnerCount(a)
    || a.routelet.startSampleIndex - b.routelet.startSampleIndex
    || a.routelet.id.localeCompare(b.routelet.id))[0] ?? null;
}

function publicAnchorRepresentative(anchor) {
  const events = allPartnerEvents(anchor).sort((a, b) => a.partnerStartSampleIndex - b.partnerStartSampleIndex
    || a.partnerRoutelet.id.localeCompare(b.partnerRoutelet.id));
  const partners = [...anchor.partners.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, rawEvents]) => {
    const ordered = [...rawEvents].sort((a, b) => a.partnerStartSampleIndex - b.partnerStartSampleIndex
      || a.partnerRoutelet.id.localeCompare(b.partnerRoutelet.id));
    const earliest = ordered[0];
    return {
      id,
      eventCount: ordered.length,
      firstPartnerStartSeconds: ordered[0].partnerStartSampleIndex / HZ,
      lastPartnerStartSeconds: ordered.at(-1).partnerStartSampleIndex / HZ,
      partnerStartTimeSpanSeconds: (ordered.at(-1).partnerStartSampleIndex - ordered[0].partnerStartSampleIndex) / HZ,
      recurrenceGapSeconds: describe(ordered.slice(1).map((event, index) =>
        (event.partnerStartSampleIndex - ordered[index].partnerStartSampleIndex) / HZ)),
      events: ordered.map(event => ({
        partnerStartSeconds: event.partnerStartSampleIndex / HZ,
        partnerEndSeconds: event.partnerEndSampleIndex / HZ,
        signedStartOffsetSeconds: event.signedStartOffsetSeconds,
        intervalGapSeconds: event.intervalGapSeconds
      })),
      earliestMatch: {
        routelet: publicRoutelet(earliest.partnerRoutelet, true),
        signedStartOffsetSeconds: earliest.signedStartOffsetSeconds,
        intervalGapSeconds: earliest.intervalGapSeconds,
        anchorToPartner: earliest.anchorToPartner,
        partnerToAnchor: earliest.partnerToAnchor
      }
    };
  });
  const partnerStarts = events.map(event => event.partnerStartSampleIndex);
  return {
    anchor: publicRoutelet(anchor.routelet, true),
    distinctPartnerAntCount: anchor.partners.size,
    partnerEventCount: events.length,
    partnerStartTimeSpanSeconds: partnerStarts.length
      ? (Math.max(...partnerStarts) - Math.min(...partnerStarts)) / HZ : 0,
    signedPartnerStartOffsetSeconds: describe(events.map(event => event.signedStartOffsetSeconds)),
    anchorToPartnerIntervalGapSeconds: describe(events.map(event => event.intervalGapSeconds)),
    withinPartnerRecurrenceGapSeconds: describe(partnerRecurrenceGaps(anchor)),
    partners
  };
}

function paddedBounds(points) {
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const boundAxis = values => {
    let min = Math.min(...values), max = Math.max(...values);
    if (max - min < 0.01) {
      const center = (max + min) / 2;
      min = center - 0.005;
      max = center + 0.005;
    }
    const padding = (max - min) * 0.1;
    return { min: min - padding, max: max + padding };
  };
  const x = boundAxis(xs), y = boundAxis(ys);
  return { minX: x.min, maxX: x.max, minY: y.min, maxY: y.max };
}

function plotX(x, plot) { return plot.x + ((x - plot.minX) / (plot.maxX - plot.minX)) * plot.size; }
function plotY(y, plot) { return plot.y + plot.size - ((y - plot.minY) / (plot.maxY - plot.minY)) * plot.size; }

function axisTicks(plot, fixed) {
  const values = fixed ? [0, 0.5, 1] : [plot.minX, plot.maxX];
  const yValues = fixed ? [0, 0.5, 1] : [plot.minY, plot.maxY];
  const xTicks = values.map(value => {
    const x = plotX(value, plot);
    return `<line x1="${x}" y1="${plot.y + plot.size}" x2="${x}" y2="${plot.y + plot.size + 5}" stroke="#52616b"/><text x="${x}" y="${plot.y + plot.size + 19}" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#52616b">${value.toFixed(2)}</text>`;
  }).join('');
  const yTicks = yValues.map(value => {
    const y = plotY(value, plot);
    return `<line x1="${plot.x - 5}" y1="${y}" x2="${plot.x}" y2="${y}" stroke="#52616b"/><text x="${plot.x - 8}" y="${y + 3}" text-anchor="end" font-family="Arial,sans-serif" font-size="10" fill="#52616b">${value.toFixed(2)}</text>`;
  }).join('');
  return xTicks + yTicks;
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function summarizeRoutelets(routelets, sampleCount) {
  const allAntPairs = new Set();
  const routeletAnts = new Set(routelets.map(routelet => routelet.id));
  const comparisonGapSeconds = [];
  const scales = Object.fromEntries(DISTANCE_SCALES.map(scale => [String(scale), {
    comparisonCount: 0,
    candidatePairCount: 0,
    candidateAnts: new Set(),
    candidateAntPairCounts: new Map(),
    candidateLaterSampleIndicesByAntPair: new Map(),
    candidateLaterRoutelets: new Set(),
    candidateGapSeconds: [],
    candidateGeometry: createCandidateGeometryBuckets(),
    representatives: []
  }]));
  let comparisonCount = 0;
  for (const { first, second, temporalGapSamples } of findRouteletPairs(routelets,
    Math.max(...DISTANCE_SCALES), MINIMUM_GAP_SAMPLES)) {
    comparisonCount += 1;
    comparisonGapSeconds.push(temporalGapSamples / HZ);
    const antPair = [first.id, second.id].sort().join('\u0000');
    allAntPairs.add(antPair);
    for (const scale of DISTANCE_SCALES) {
      const state = scales[String(scale)];
      const firstToSecond = measureDirection(first, second, scale);
      const secondToFirst = measureDirection(second, first, scale);
      state.comparisonCount += 1;
      if (!passesGates(firstToSecond, secondToFirst)) continue;
      state.candidatePairCount += 1;
      state.candidateGapSeconds.push(temporalGapSamples / HZ);
      state.candidateAnts.add(first.id);
      state.candidateAnts.add(second.id);
      state.candidateAntPairCounts.set(antPair, (state.candidateAntPairCounts.get(antPair) || 0) + 1);
      const laterSamples = state.candidateLaterSampleIndicesByAntPair.get(antPair) || new Set();
      laterSamples.add(second.startSampleIndex);
      state.candidateLaterSampleIndicesByAntPair.set(antPair, laterSamples);
      state.candidateLaterRoutelets.add(`${second.id}\u0000${second.startSampleIndex}`);
      recordCandidateGeometry(state.candidateGeometry, first, second, firstToSecond, secondToFirst);
      state.representatives.push({
        _sortKey: [first.startSampleIndex, first.id, second.startSampleIndex, second.id],
        first: publicRoutelet(first), second: publicRoutelet(second),
        temporalGapSeconds: temporalGapSamples / HZ,
        scaleNormalizedUnits: scale,
        firstToSecond, secondToFirst
      });
      state.representatives.sort(compareRepresentatives);
      if (state.representatives.length > MAXIMUM_REPRESENTATIVES_PER_SCALE) state.representatives.pop();
    }
  }

  const scaleSummaries = Object.fromEntries(Object.entries(scales).map(([scale, state]) => {
    const candidatePairCounts = [...state.candidateAntPairCounts.values()];
    const recurrenceGaps = [];
    const laterOccurrenceCounts = [];
    for (const sampleIndices of state.candidateLaterSampleIndicesByAntPair.values()) {
      const ordered = [...sampleIndices].sort((a, b) => a - b);
      laterOccurrenceCounts.push(ordered.length);
      for (let index = 1; index < ordered.length; index += 1) {
        recurrenceGaps.push((ordered[index] - ordered[index - 1]) / HZ);
      }
    }
    return [scale, {
      comparisonCount: state.comparisonCount,
      candidatePairCount: state.candidatePairCount,
      candidateTemporalGapSeconds: describe(state.candidateGapSeconds),
      distinctCandidateAntCount: state.candidateAnts.size,
      distinctCandidateAntPairCount: state.candidateAntPairCounts.size,
      candidatePairCountPerAntPair: describe(candidatePairCounts),
      distinctCandidateLaterRouteletCount: state.candidateLaterRoutelets.size,
      laterCandidateOccurrencesPerAntPair: describe(laterOccurrenceCounts),
      antPairsWithMultipleCandidateComparisons: candidatePairCounts.filter(count => count > 1).length,
      antPairsWithMultipleCandidateLaterWindows: laterOccurrenceCounts.filter(count => count > 1).length,
      recurrenceGapSecondsWithinAntPair: describe(recurrenceGaps),
      candidateGeometry: summarizeCandidateGeometry(state.candidateGeometry),
      representatives: state.representatives.map(({ _sortKey, ...representative }) => representative)
    }];
  }));

  return {
    parameters: {
      hz: HZ, routeletSeconds: ROUTELET_SECONDS, samplesPerRoutelet: SAMPLES_PER_ROUTELET,
      sourceTickDivisor: 6,
      bodyDiameterNormalizedUnits: BODY_DIAMETER_NORMALIZED_UNITS,
      distanceScalesNormalizedUnits: [...DISTANCE_SCALES],
      minimumTemporalGapSeconds: MINIMUM_GAP_SECONDS,
      minimumPathLengthNormalizedUnits: MINIMUM_PATH_LENGTH_NORMALIZED_UNITS,
      tangentAngleGateRadians: Math.PI / 6,
      curvatureNumericEpsilonPerNormalizedUnit: CURVATURE_NUMERIC_EPSILON_PER_NORMALIZED_UNIT,
      minimumOverlapFraction: MINIMUM_OVERLAP_FRACTION,
      minimumTangentAlignedFraction: MINIMUM_TANGENT_ALIGNED_FRACTION,
      minimumCurvatureSamples: MINIMUM_CURVATURE_SAMPLES,
      minimumCurvatureSignAgreement: MINIMUM_CURVATURE_SIGN_AGREEMENT,
      maximumRepresentativesPerScale: MAXIMUM_REPRESENTATIVES_PER_SCALE
    },
    sampleCount,
    routeletCount: routelets.length,
    distinctRouteletAntCount: routeletAnts.size,
    comparisonCount,
    comparisonTemporalGapSeconds: describe(comparisonGapSeconds),
    distinctAntPairCount: allAntPairs.size,
    routeletStepLengthNormalizedUnits: describe(routelets.flatMap(routelet =>
      routelet.segments.map(segment => segment.lengthNormalizedUnits))),
    routeletGeometry: {
      signedTravelTurnRadians: describe(routelets.map(routelet => routelet.signedTravelTurnRadians)),
      absoluteTravelTurnRadians: describe(routelets.map(routelet => routelet.absoluteTravelTurnRadians)),
      netTurnRadians: describe(routelets.map(routelet => routelet.netTurnRadians)),
      maximumChordDeviationNormalizedUnits: describe(routelets.map(routelet => routelet.maximumChordDeviationNormalizedUnits)),
      curvatureSupportSegments: describe(routelets.map(routelet => routelet.curvatureSupportSegmentIndices.length))
    },
    scales: scaleSummaries
  };
}

function createCandidateGeometryBuckets() {
  return Object.fromEntries([
    'firstSignedTravelTurnRadians', 'secondSignedTravelTurnRadians',
    'firstAbsoluteTravelTurnRadians', 'secondAbsoluteTravelTurnRadians',
    'firstNetTurnRadians', 'secondNetTurnRadians',
    'firstMaximumChordDeviationNormalizedUnits', 'secondMaximumChordDeviationNormalizedUnits',
    'firstCurvatureSupportSegments', 'secondCurvatureSupportSegments',
    'firstToSecondOverlapFraction', 'secondToFirstOverlapFraction',
    'firstToSecondTangentAlignedFraction', 'secondToFirstTangentAlignedFraction',
    'firstToSecondTangentAxisAngleRadians', 'secondToFirstTangentAxisAngleRadians',
    'firstToSecondDirectedTangentCosine', 'secondToFirstDirectedTangentCosine',
    'firstToSecondMeanNearestDistanceNormalizedUnits', 'secondToFirstMeanNearestDistanceNormalizedUnits',
    'firstToSecondMeanAbsoluteSourceCurvaturePerNormalizedUnit',
    'firstToSecondMeanAbsoluteTargetCurvaturePerNormalizedUnit',
    'secondToFirstMeanAbsoluteSourceCurvaturePerNormalizedUnit',
    'secondToFirstMeanAbsoluteTargetCurvaturePerNormalizedUnit',
    'firstToSecondCurvatureSignAgreementFraction', 'secondToFirstCurvatureSignAgreementFraction',
    'firstToSecondCurvatureMatchedSamples', 'secondToFirstCurvatureMatchedSamples',
    'firstToSecondCurvatureMatchedRunCount', 'secondToFirstCurvatureMatchedRunCount',
    'firstToSecondLongestCurvatureMatchedRun', 'secondToFirstLongestCurvatureMatchedRun'
  ].map(key => [key, []]));
}

function recordCandidateGeometry(buckets, first, second, firstToSecond, secondToFirst) {
  const longest = lengths => lengths.length ? Math.max(...lengths) : 0;
  const values = {
    firstSignedTravelTurnRadians: first.signedTravelTurnRadians,
    secondSignedTravelTurnRadians: second.signedTravelTurnRadians,
    firstAbsoluteTravelTurnRadians: first.absoluteTravelTurnRadians,
    secondAbsoluteTravelTurnRadians: second.absoluteTravelTurnRadians,
    firstNetTurnRadians: first.netTurnRadians,
    secondNetTurnRadians: second.netTurnRadians,
    firstMaximumChordDeviationNormalizedUnits: first.maximumChordDeviationNormalizedUnits,
    secondMaximumChordDeviationNormalizedUnits: second.maximumChordDeviationNormalizedUnits,
    firstCurvatureSupportSegments: first.curvatureSupportSegmentIndices.length,
    secondCurvatureSupportSegments: second.curvatureSupportSegmentIndices.length,
    firstToSecondOverlapFraction: firstToSecond.overlapFraction,
    secondToFirstOverlapFraction: secondToFirst.overlapFraction,
    firstToSecondTangentAlignedFraction: firstToSecond.tangentAlignedFraction,
    secondToFirstTangentAlignedFraction: secondToFirst.tangentAlignedFraction,
    firstToSecondTangentAxisAngleRadians: firstToSecond.tangentAxisAngleRadians,
    secondToFirstTangentAxisAngleRadians: secondToFirst.tangentAxisAngleRadians,
    firstToSecondDirectedTangentCosine: firstToSecond.directedTangentCosine,
    secondToFirstDirectedTangentCosine: secondToFirst.directedTangentCosine,
    firstToSecondMeanNearestDistanceNormalizedUnits: firstToSecond.meanNearestDistanceNormalizedUnits,
    secondToFirstMeanNearestDistanceNormalizedUnits: secondToFirst.meanNearestDistanceNormalizedUnits,
    firstToSecondMeanAbsoluteSourceCurvaturePerNormalizedUnit: firstToSecond.meanAbsoluteSourceCurvaturePerNormalizedUnit,
    firstToSecondMeanAbsoluteTargetCurvaturePerNormalizedUnit: firstToSecond.meanAbsoluteTargetCurvaturePerNormalizedUnit,
    secondToFirstMeanAbsoluteSourceCurvaturePerNormalizedUnit: secondToFirst.meanAbsoluteSourceCurvaturePerNormalizedUnit,
    secondToFirstMeanAbsoluteTargetCurvaturePerNormalizedUnit: secondToFirst.meanAbsoluteTargetCurvaturePerNormalizedUnit,
    firstToSecondCurvatureSignAgreementFraction: firstToSecond.curvatureSignAgreementFraction,
    secondToFirstCurvatureSignAgreementFraction: secondToFirst.curvatureSignAgreementFraction,
    firstToSecondCurvatureMatchedSamples: firstToSecond.curvatureMatchedSamples,
    secondToFirstCurvatureMatchedSamples: secondToFirst.curvatureMatchedSamples,
    firstToSecondCurvatureMatchedRunCount: firstToSecond.curvatureMatchedRunLengths.length,
    secondToFirstCurvatureMatchedRunCount: secondToFirst.curvatureMatchedRunLengths.length,
    firstToSecondLongestCurvatureMatchedRun: longest(firstToSecond.curvatureMatchedRunLengths),
    secondToFirstLongestCurvatureMatchedRun: longest(secondToFirst.curvatureMatchedRunLengths)
  };
  for (const [key, value] of Object.entries(values)) if (Number.isFinite(value)) buckets[key].push(value);
}

function summarizeCandidateGeometry(buckets) {
  return Object.fromEntries(Object.entries(buckets).map(([key, values]) => [key, describe(values)]));
}

function makeRoutelet(id, startSampleIndex, points) {
  const segments = [];
  let pathLengthNormalizedUnits = 0;
  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1], after = points[index];
    const dx = after.x - before.x, dy = after.y - before.y;
    const lengthNormalizedUnits = Math.hypot(dx, dy);
    pathLengthNormalizedUnits += lengthNormalizedUnits;
    segments.push({
      x1: before.x, y1: before.y, x2: after.x, y2: after.y,
      midX: (before.x + after.x) / 2, midY: (before.y + after.y) / 2,
      lengthNormalizedUnits,
      tangent: lengthNormalizedUnits > 0 ? { x: dx / lengthNormalizedUnits, y: dy / lengthNormalizedUnits } : null,
      curvaturePerNormalizedUnit: null
    });
  }

  const turnAngles = segments.slice(1).map((next, index) => {
    const previous = segments[index];
    if (!previous.tangent || !next.tangent) return null;
    return Math.atan2(previous.tangent.x * next.tangent.y - previous.tangent.y * next.tangent.x,
      previous.tangent.x * next.tangent.x + previous.tangent.y * next.tangent.y);
  });
  const localCurvatures = turnAngles.map((angle, index) => {
    const distance = (segments[index].lengthNormalizedUnits + segments[index + 1].lengthNormalizedUnits) / 2;
    return Number.isFinite(angle) && distance > 0 ? angle / distance : null;
  });
  for (let index = 0; index < segments.length; index += 1) {
    const neighboring = [localCurvatures[index - 1], localCurvatures[index]].filter(Number.isFinite);
    if (neighboring.length) segments[index].curvaturePerNormalizedUnit = neighboring.reduce((sum, value) => sum + value, 0) / neighboring.length;
  }

  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const first = points[0], last = points.at(-1);
  const firstTangent = segments.find(segment => segment.tangent)?.tangent ?? null;
  const lastTangent = [...segments].reverse().find(segment => segment.tangent)?.tangent ?? null;
  const signedTravelTurnRadians = turnAngles.filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
  const absoluteTravelTurnRadians = turnAngles.filter(Number.isFinite).reduce((sum, value) => sum + Math.abs(value), 0);
  const netTurnRadians = firstTangent && lastTangent
    ? signedAngle(Math.atan2(lastTangent.y, lastTangent.x) - Math.atan2(firstTangent.y, firstTangent.x)) : null;
  const maximumChordDeviationNormalizedUnits = Math.max(...points.map(point =>
    pointSegmentDistance(point.x, point.y, first.x, first.y, last.x, last.y)));
  const curvatureSupportSegmentIndices = segments.flatMap((segment, index) => Number.isFinite(segment.curvaturePerNormalizedUnit)
    && Math.abs(segment.curvaturePerNormalizedUnit) > CURVATURE_NUMERIC_EPSILON_PER_NORMALIZED_UNIT ? [index] : []);
  return {
    id, startSampleIndex, endSampleIndex: startSampleIndex + points.length - 1,
    points: points.map(point => [point.x, point.y]),
    pathLengthNormalizedUnits, segments, signedTravelTurnRadians, absoluteTravelTurnRadians,
    netTurnRadians, maximumChordDeviationNormalizedUnits, curvatureSupportSegmentIndices,
    curvatureSupportRunLengths: runLengths(curvatureSupportSegmentIndices),
    minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys)
  };
}

function* findRouteletPairs(routelets, maximumScale, minimumGapSamples) {
  // Spatial buckets shortlist pairs; continuous Euclidean polyline measures classify them.
  const buckets = new Map();
  const cellSize = maximumScale;
  for (let index = 0; index < routelets.length; index += 1) {
    const routelet = routelets[index];
    const minCellX = Math.floor((routelet.minX - maximumScale) / cellSize);
    const maxCellX = Math.floor((routelet.maxX + maximumScale) / cellSize);
    const minCellY = Math.floor((routelet.minY - maximumScale) / cellSize);
    const maxCellY = Math.floor((routelet.maxY + maximumScale) / cellSize);
    const alreadyVisited = new Set();
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const key = `${cellX},${cellY}`;
        const bucket = buckets.get(key) || [];
        for (const priorIndex of bucket) {
          if (alreadyVisited.has(priorIndex)) continue;
          alreadyVisited.add(priorIndex);
          const earlier = routelets[priorIndex], later = routelet;
          if (earlier.id === later.id) continue;
          const first = earlier.startSampleIndex <= later.startSampleIndex ? earlier : later;
          const second = first === earlier ? later : earlier;
          const temporalGapSamples = second.startSampleIndex - first.endSampleIndex;
          if (temporalGapSamples < minimumGapSamples) continue;
          if (bboxDistance(first, second) <= maximumScale) yield { first, second, temporalGapSamples };
        }
        bucket.push(index);
        buckets.set(key, bucket);
      }
    }
  }
}

function bboxDistance(a, b) {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

function measureDirection(source, target, scale) {
  let overlapLength = 0, distanceWeighted = 0, tangentLength = 0;
  let tangentAxisCosineWeighted = 0, tangentAngleWeighted = 0, directedCosineWeighted = 0;
  let tangentAlignedLength = 0, curvatureLength = 0, curvatureMatchedLength = 0;
  let curvatureSignAgreementLength = 0, curvatureMatchedSamples = 0;
  let sourceCurvatureWeighted = 0, targetCurvatureWeighted = 0;
  const curvatureMatchedSegmentIndices = [], curvatureSignAgreementSegmentIndices = [];
  for (let sourceIndex = 0; sourceIndex < source.segments.length; sourceIndex += 1) {
    const segment = source.segments[sourceIndex];
    if (!segment.lengthNormalizedUnits || !segment.tangent) continue;
    const nearest = nearestSegment(segment.midX, segment.midY, target.segments);
    if (!nearest) continue;
    distanceWeighted += nearest.distance * segment.lengthNormalizedUnits;
    if (nearest.distance > scale) continue;
    overlapLength += segment.lengthNormalizedUnits;
    const other = target.segments[nearest.index];
    if (!other.tangent) continue;
    const directedCosine = clamp(segment.tangent.x * other.tangent.x + segment.tangent.y * other.tangent.y, -1, 1);
    const axisCosine = Math.abs(directedCosine);
    const angle = Math.acos(clamp(axisCosine, -1, 1));
    tangentLength += segment.lengthNormalizedUnits;
    tangentAxisCosineWeighted += axisCosine * segment.lengthNormalizedUnits;
    tangentAngleWeighted += angle * segment.lengthNormalizedUnits;
    directedCosineWeighted += directedCosine * segment.lengthNormalizedUnits;
    if (axisCosine >= TANGENT_COSINE_GATE) tangentAlignedLength += segment.lengthNormalizedUnits;

    if (Number.isFinite(segment.curvaturePerNormalizedUnit) && Number.isFinite(other.curvaturePerNormalizedUnit)
      && Math.abs(segment.curvaturePerNormalizedUnit) > CURVATURE_NUMERIC_EPSILON_PER_NORMALIZED_UNIT
      && Math.abs(other.curvaturePerNormalizedUnit) > CURVATURE_NUMERIC_EPSILON_PER_NORMALIZED_UNIT) {
      const canonicalTargetSign = Math.sign(other.curvaturePerNormalizedUnit) * (directedCosine < 0 ? -1 : 1);
      curvatureLength += segment.lengthNormalizedUnits;
      curvatureMatchedSamples += 1;
      curvatureMatchedLength += segment.lengthNormalizedUnits;
      curvatureMatchedSegmentIndices.push(sourceIndex);
      if (Math.sign(segment.curvaturePerNormalizedUnit) === canonicalTargetSign) {
        curvatureSignAgreementLength += segment.lengthNormalizedUnits;
        curvatureSignAgreementSegmentIndices.push(sourceIndex);
      }
      sourceCurvatureWeighted += Math.abs(segment.curvaturePerNormalizedUnit) * segment.lengthNormalizedUnits;
      targetCurvatureWeighted += Math.abs(other.curvaturePerNormalizedUnit) * segment.lengthNormalizedUnits;
    }
  }
  return {
    overlapFraction: source.pathLengthNormalizedUnits ? overlapLength / source.pathLengthNormalizedUnits : null,
    meanNearestDistanceNormalizedUnits: source.pathLengthNormalizedUnits ? distanceWeighted / source.pathLengthNormalizedUnits : null,
    tangentAxisCosine: tangentLength ? tangentAxisCosineWeighted / tangentLength : null,
    tangentAxisAngleRadians: tangentLength ? tangentAngleWeighted / tangentLength : null,
    directedTangentCosine: tangentLength ? directedCosineWeighted / tangentLength : null,
    tangentAlignedFraction: tangentLength ? tangentAlignedLength / tangentLength : null,
    curvatureMatchedSamples, curvatureMatchedLengthNormalizedUnits: curvatureMatchedLength,
    curvatureMatchedSegmentIndices,
    curvatureMatchedRunLengths: runLengths(curvatureMatchedSegmentIndices),
    curvatureSignAgreementFraction: curvatureLength ? curvatureSignAgreementLength / curvatureLength : null,
    curvatureSignAgreementSegmentIndices,
    curvatureSignAgreementRunLengths: runLengths(curvatureSignAgreementSegmentIndices),
    meanAbsoluteSourceCurvaturePerNormalizedUnit: curvatureLength ? sourceCurvatureWeighted / curvatureLength : null,
    meanAbsoluteTargetCurvaturePerNormalizedUnit: curvatureLength ? targetCurvatureWeighted / curvatureLength : null
  };
}

function nearestSegment(x, y, segments) {
  let best = null;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment.lengthNormalizedUnits) continue;
    const dx = segment.x2 - segment.x1, dy = segment.y2 - segment.y1;
    const t = clamp(((x - segment.x1) * dx + (y - segment.y1) * dy) / (segment.lengthNormalizedUnits ** 2), 0, 1);
    const distance = Math.hypot(x - (segment.x1 + t * dx), y - (segment.y1 + t * dy));
    if (!best || distance < best.distance) best = { index, distance };
  }
  return best;
}

function passesGates(firstToSecond, secondToFirst) {
  return [firstToSecond, secondToFirst].every(metrics =>
    metrics.overlapFraction >= MINIMUM_OVERLAP_FRACTION
    && metrics.tangentAlignedFraction >= MINIMUM_TANGENT_ALIGNED_FRACTION
    && metrics.curvatureMatchedSamples >= MINIMUM_CURVATURE_SAMPLES
    && metrics.curvatureSignAgreementFraction >= MINIMUM_CURVATURE_SIGN_AGREEMENT);
}

function publicRoutelet(routelet, includePolyline = false) {
  const result = {
    id: routelet.id,
    startSeconds: routelet.startSampleIndex / HZ,
    endSeconds: routelet.endSampleIndex / HZ,
    pathLengthNormalizedUnits: routelet.pathLengthNormalizedUnits,
    signedTravelTurnRadians: routelet.signedTravelTurnRadians,
    absoluteTravelTurnRadians: routelet.absoluteTravelTurnRadians,
    netTurnRadians: routelet.netTurnRadians,
    maximumChordDeviationNormalizedUnits: routelet.maximumChordDeviationNormalizedUnits,
    curvatureSupportSegmentIndices: routelet.curvatureSupportSegmentIndices,
    curvatureSupportRunLengths: routelet.curvatureSupportRunLengths,
    curvatureSupportLocations: routelet.curvatureSupportSegmentIndices.map(segmentIndex => {
      const segment = routelet.segments[segmentIndex];
      return {
        segmentIndex,
        midpointNormalizedUnits: [segment.midX, segment.midY],
        curvaturePerNormalizedUnit: segment.curvaturePerNormalizedUnit
      };
    })
  };
  if (includePolyline) result.polylineNormalizedUnits = routelet.points;
  return result;
}

function describe(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const quantile = p => {
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * p, lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * (position - lower);
  };
  return { count: sorted.length, p50: quantile(0.5), p90: quantile(0.9), maximum: sorted.at(-1) ?? null };
}

function compareRepresentatives(a, b) {
  for (let index = 0; index < a._sortKey.length; index += 1) {
    if (a._sortKey[index] < b._sortKey[index]) return -1;
    if (a._sortKey[index] > b._sortKey[index]) return 1;
  }
  return 0;
}

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
function signedAngle(angle) { return ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }

function pointSegmentDistance(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? clamp(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0, 1) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function runLengths(indices) {
  const runs = [];
  for (const index of indices) {
    if (!runs.length || index !== runs.at(-1).end + 1) runs.push({ start: index, end: index });
    else runs.at(-1).end = index;
  }
  return runs.map(run => run.end - run.start + 1);
}

function isJsonWhitespace(byte) { return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d; }

function findObjectEnd(bytes, start) {
  let depth = 0, inString = false, escaped = false;
  for (let position = start; position < bytes.length; position += 1) {
    const byte = bytes[position];
    if (inString) {
      if (escaped) escaped = false;
      else if (byte === 0x5c) escaped = true;
      else if (byte === 0x22) inString = false;
      continue;
    }
    if (byte === 0x22) inString = true;
    else if (byte === 0x7b) depth += 1;
    else if (byte === 0x7d && --depth === 0) return position;
  }
  throw new Error(`Unclosed trajectory frame at byte ${start}`);
}

function readLeadingTick(bytes, start, path) {
  let position = start + 1;
  while (isJsonWhitespace(bytes[position])) position += 1;
  if (bytes[position++] !== 0x22) throw new Error(`Expected first frame key to be tick in ${path}`);
  const keyStart = position;
  while (bytes[position] !== 0x22 && position < bytes.length) position += 1;
  if (bytes.subarray(keyStart, position).toString('utf8') !== 'tick') {
    throw new Error(`Expected first frame key to be tick in ${path}`);
  }
  position += 1;
  while (isJsonWhitespace(bytes[position])) position += 1;
  if (bytes[position++] !== 0x3a) throw new Error(`Expected tick colon in ${path}`);
  while (isJsonWhitespace(bytes[position])) position += 1;
  const valueStart = position;
  while (bytes[position] >= 0x30 && bytes[position] <= 0x39) position += 1;
  const tick = Number(bytes.subarray(valueStart, position).toString('ascii'));
  if (!Number.isInteger(tick)) throw new Error(`Invalid tick in ${path}`);
  return tick;
}

function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function runAnchorCli(repoRoot, selectedCaseLabels, pilot) {
  const figureDirectory = pilot ? 'anchor-representatives-v4-pilot' : 'anchor-representatives-v4';
  const summary = analyzeFrozenAnchorCases(repoRoot, selectedCaseLabels, figureDirectory);
  const collectiveRoot = resolve(repoRoot, 'docs/ant/evidence/2026-10-23-natural-field-transfer/collective');
  const figuresRoot = resolve(collectiveRoot, figureDirectory);
  mkdirSync(figuresRoot, { recursive: true });
  for (const result of summary.results) {
    for (const [scale, scaleSummary] of Object.entries(result.analysis.scales)) {
      if (!scaleSummary.representative) continue;
      const svg = renderAnchorRepresentativeSvg(scaleSummary.representative, {
        caseLabel: result.source.label,
        windowLabel: result.window.label,
        scaleNormalizedUnits: scale
      });
      const fileName = `${slug(result.source.label)}--${slug(result.window.label)}--d${scale.replace('.', '-')}.svg`;
      writeFileSync(resolve(figuresRoot, fileName), svg, 'utf8');
    }
  }
  const outputName = pilot ? 'anchor-summary-v4-pilot.json' : 'anchor-summary-v4.json';
  const output = resolve(collectiveRoot, outputName);
  writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  process.stdout.write(`Wrote ${output} (${summary.results.length} case-windows; ${figureDirectory}).\n`);
}

function runCli() {
  const repoRoot = process.cwd();
  if (process.argv.includes('--anchors-v4')) {
    const selectedCaseLabels = process.argv.filter(argument => argument.startsWith('--case='))
      .map(argument => argument.slice('--case='.length));
    runAnchorCli(repoRoot, selectedCaseLabels.length ? selectedCaseLabels : null, process.argv.includes('--pilot'));
    return;
  }
  const summary = analyzeFrozenCases(repoRoot);
  const output = resolve(repoRoot, 'docs/ant/evidence/2026-10-23-natural-field-transfer/collective/analysis-summary.json');
  writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  process.stdout.write(`Wrote ${output} (${summary.results.length} case-windows).\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();
