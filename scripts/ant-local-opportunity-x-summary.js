import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, sha256, writeJson } from './ant-local-opportunity-io.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_INPUT = 'docs/ant/evidence/2026-10-31-local-opportunity-competition-audit/analysis';
const DEFAULT_OUTPUT = DEFAULT_INPUT;
const AUTHORITY = 'bc045dc3caa5954df633ecbee37fbabcb8224f30';
const SEEDS = ['20261005', '20261006', '20261007'];
const CHANNELS = ['D', 'B', 'C', 'feet1', 'feet5', 'feet20', 'travel1', 'travel5', 'travel20',
  'deltaD1', 'deltaD5', 'deltaD20', 'deltaB1', 'deltaB5', 'deltaB20', 'deltaC1', 'deltaC5', 'deltaC20'];
const METRICS = ['nodeCount', 'centroidDistanceToEntry', 'chosenCenterEntryDistance', 'angularSpan', 'maxRadius',
  'width', 'height', 'major', 'minor', 'edgeCount', 'endpoints', 'junctions', 'cycleRank', 'overlapFraction',
  'meanLayers', 'maxLayers'];

function distribution(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = p => sorted[Math.round((sorted.length - 1) * p)];
  return { n: sorted.length, min: sorted[0] ?? null, p10: sorted.length ? at(.1) : null,
    median: sorted.length ? at(.5) : null, p90: sorted.length ? at(.9) : null,
    max: sorted.at(-1) ?? null, mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null };
}

function captureMetrics(capture, center) {
  assert.ok(Number.isInteger(capture.nodeCount) && capture.nodeCount > 0, 'X capture must contain positive cells');
  const values = { nodeCount: capture.nodeCount,
    centroidDistanceToEntry: Math.hypot(capture.centroid.x - .5, capture.centroid.y - .72),
    chosenCenterEntryDistance: center.entryDistance, angularSpan: center.angularSpan, maxRadius: center.maxRadius,
    width: capture.extent.width, height: capture.extent.height, major: capture.extent.major, minor: capture.extent.minor,
    edgeCount: capture.edgeCount, endpoints: capture.endpoints, junctions: capture.junctions,
    cycleRank: capture.cycleRank, overlapFraction: capture.material.overlapFraction,
    meanLayers: capture.material.meanLayers, maxLayers: capture.material.maxLayers };
  for (const [name, value] of Object.entries(values)) assert.ok(Number.isFinite(value), `finite ${name}`);
  return values;
}

function makeAccumulators() {
  return Object.fromEntries(CHANNELS.map(channel => [channel, {
    boundaryCount: 0, observedBoundaryCount: 0, centerObservationCount: 0, uniqueCaptureObservationCount: 0,
    materialLayerCellObservations: {}, metrics: Object.fromEntries(METRICS.map(metric => [metric, []]))
  }]));
}

export function addAnchor(anchor, accumulators) {
  const captures = new Map(anchor.captures.map(capture => [capture.id, capture]));
  assert.equal(captures.size, anchor.captures.length, `unique capture ids at anchor ${anchor.index}`);
  for (const channel of CHANNELS) {
    const accumulator = accumulators[channel]; accumulator.boundaryCount += 1;
    const channelData = anchor.channels[channel];
    assert.ok(channelData === null || (channelData && (channelData.g15 === null || Array.isArray(channelData.g15))),
      `g15 rows present or explicitly absent: ${channel}`);
    if (channelData === null || channelData.g15 === null) continue;
    const rows = channelData.g15;
    accumulator.observedBoundaryCount += 1;
    const byCapture = new Map();
    for (const row of rows) {
      assert.ok(Number.isInteger(row.index) && row.index >= 0, 'candidate center index must be nonnegative');
      assert.ok(row.captureId && captures.has(row.captureId), `known capture ${row.captureId}`);
      accumulator.centerObservationCount += 1;
      const candidate = byCapture.get(row.captureId);
      if (!candidate || row.index < candidate.index) byCapture.set(row.captureId, row);
    }
    for (const [captureId, row] of byCapture) {
      const capture = captures.get(captureId);
      const center = capture.centers.find(item => item.channel === channel && item.representation === 'g15' && item.index === row.index);
      assert.ok(center, `selected g15 center is recorded on ${captureId}`);
      accumulator.uniqueCaptureObservationCount += 1;
      for (const [layer, count] of Object.entries(capture.material.layerHistogram)) {
        accumulator.materialLayerCellObservations[layer] = (accumulator.materialLayerCellObservations[layer] ?? 0) + count;
      }
      const metrics = captureMetrics(capture, center);
      for (const metric of METRICS) accumulator.metrics[metric].push(metrics[metric]);
    }
  }
}

async function seedSummary(inputDir, seed) {
  const index = await readJson(resolve(inputDir, `seed-${seed}.opportunities.json.gz`));
  assert.equal(index.schema, 'ant-local-opportunity-analysis-v1');
  assert.equal(index.authority, AUTHORITY);
  assert.equal(String(index.seed), seed);
  assert.ok(Array.isArray(index.anchorsFiles) && index.anchorsFiles.length > 0);
  const accumulators = makeAccumulators();
  const inputAnchorHashes = [];
  let boundaryCount = 0;
  for (const file of index.anchorsFiles) {
    assert.equal(basename(file), file, 'anchor chunk must stay beside its index');
    const bytes = await readFile(resolve(inputDir, file));
    const hash = sha256(bytes);
    assert.equal(hash, index.chunkHashes[file], `anchor chunk hash ${file}`);
    inputAnchorHashes.push({ seed, file, sha256: hash });
    const chunk = await readJson(resolve(inputDir, file));
    assert.ok(Array.isArray(chunk.anchors));
    for (const anchor of chunk.anchors) {
      boundaryCount += 1;
      addAnchor(anchor, accumulators);
    }
  }
  assert.equal(boundaryCount, index.anchorsCount, `${seed} anchor boundary count`);
  const channels = {};
  for (const channel of CHANNELS) {
    const a = accumulators[channel];
    channels[channel] = { boundaryCount: a.boundaryCount, observedBoundaryCount: a.observedBoundaryCount,
      centerObservationCount: a.centerObservationCount, uniqueCaptureObservationCount: a.uniqueCaptureObservationCount,
      duplicateCenterObservationCount: a.centerObservationCount - a.uniqueCaptureObservationCount,
      metricQuantiles: Object.fromEntries(METRICS.map(metric => [metric, distribution(a.metrics[metric])])),
      materialLayerCellObservations: Object.fromEntries(Object.entries(a.materialLayerCellObservations)
        .sort((left, right) => Number(left[0]) - Number(right[0]))) };
  }
  return { seed, boundaryCount, channels, inputAnchorHashes };
}

export async function summarize(inputDir = resolve(ROOT, DEFAULT_INPUT)) {
  const seeds = [];
  for (const seed of SEEDS) seeds.push(await seedSummary(inputDir, seed));
  return { schema: 'ant-local-opportunity-x-family-geometry-v1', authority: AUTHORITY,
    seeds: seeds.map(({ seed, boundaryCount, channels }) => ({ seed, boundaryCount, channels })),
    definitions: { population: 'g15 candidate centers at every available production analysis boundary, grouped by seed and channel',
      deduplication: 'Within each boundary and channel, count every center row; count each referenced captureId once. Duplicate center observations equal row count minus unique capture ids.',
      nucleusConvention: 'For each boundary/channel/captureId, choose its lowest row-major g15 center index. angularSpan, maxRadius, and chosen-center entry distance come from that exact center record. This is a reporting convention, not a selector.',
      quantiles: 'Nearest observed order statistic at rank round((n - 1) * p), matching the local-opportunity core convention; mean is arithmetic.',
      materialContext: 'materialLayerCellObservations pools layerHistogram cell counts across deduplicated X observations; repeated cells across boundaries remain repeated context.',
      interpretation: 'X geometry is a descriptive mask around candidate centers, not a material object, opportunity law, or selection rule.' },
    inputAnchorHashes: seeds.flatMap(item => item.inputAnchorHashes) };
}

const inputArg = process.argv.find(arg => arg.startsWith('--input='))?.slice('--input='.length);
const outputArg = process.argv.find(arg => arg.startsWith('--out='))?.slice('--out='.length);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputDir = resolve(ROOT, outputArg ?? DEFAULT_OUTPUT);
  const output = await summarize(resolve(ROOT, inputArg ?? DEFAULT_INPUT));
  await writeJson(resolve(outputDir, 'x-family-geometry.json'), output);
  process.stdout.write(`wrote ${resolve(outputDir, 'x-family-geometry.json')}\n`);
}
