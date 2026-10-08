import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { AntLocalAccretion } from './ant-local-accretion.js';
import { measureBinaryMask, ANT_LOCAL_ACCRETION_METRIC_DEFINITIONS } from './ant-local-accretion-metrics.js';
import { sha256 } from './ant-local-accretion-inputs.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const GRID = 96, CELLS = GRID * GRID, SEEDS = [20261005, 20261006, 20261007];
const args = new Map(process.argv.slice(2).map(value => {
  const at = value.indexOf('=');
  return at < 0 ? [value, true] : [value.slice(0, at), value.slice(at + 1)];
}));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

async function main() {
  const input = resolve(String(args.get('--input') || resolve(ROOT, 'test-results/ant-local-accretion-inputs')));
  const output = resolve(String(args.get('--output') || resolve(ROOT, 'test-results/ant-local-accretion-analysis')));
  await mkdir(output, { recursive: true });
  const seeds = [], deterministic = [];
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('Shadow analysis must not consume RNG'); };
  try {
    for (const seed of SEEDS) {
      const metadataBytes = await readFile(resolve(input, `seed${seed}-metadata.json`));
      const metadata = JSON.parse(metadataBytes);
      assert.equal(metadata.seed, seed);
      assert.equal(metadata.frameCount, 599);
      assert.deepEqual(metadata.fieldDimensions, [GRID, GRID]);
      const flags = await readPacket(input, metadata.files.flags);
      assert.equal(flags.length, metadata.frames.length * CELLS);
      assert.ok(flags.every(value => value <= 7), 'Only three decision bits are permitted');
      const fields = await readPacket(input, metadata.files.milestones);
      const sourcePath = resolve(ROOT, metadata.sourceFiles.rawFootContacts);
      const sourceBytes = await readFile(sourcePath);
      assert.equal(sha256(sourceBytes), metadata.sourceHashes.rawFootContactsLedgerSha256);
      const raw = JSON.parse(gunzipSync(sourceBytes));
      const options = { seed, metadata, flags, fields, raw };
      const first = analyzeSeed(options), second = analyzeSeed(options);
      const firstBytes = Buffer.from(JSON.stringify(first)), secondBytes = Buffer.from(JSON.stringify(second));
      assert.ok(firstBytes.equals(secondBytes), `Seed ${seed} complete analysis rerun differs`);
      seeds.push(first);
      deterministic.push({ seed, completeAnalysisBytesIdentical: true, sha256: sha256(firstBytes),
        bytes: firstBytes.length, inputFlagsSha256: sha256(flags), metadataSha256: sha256(metadataBytes) });
    }
  } finally { Math.random = originalRandom; }
  const report = { schemaVersion: 1,
    mechanism: { chemicalThreshold: 0.30, supportThreshold: 0.015, persistenceSeconds: 20,
      distinctContactTimes: 2, state: 'One scalar per cell: -1 unsupported, 0 first eligible sample, up to 20 consecutive sampled seconds.',
      freeze: 'Emit newly matured cells together at each observation; remain at 20 until qualification fails; later requalification may freeze again.',
      contactGuard: 'At least two distinct timestamps in the same directly mapped cell, cumulative through the current sample; not two recent contacts.',
      geometry: 'Exact mature cells; no paths, source, boundary, skeleton, dilation, interpolation, or acoustic representation.' },
    definitions: { area: 'Occupied cells / 9216; a raster area fraction, unlike older cell-count / 95^2 area proxies.',
      observation: 'All 599 recorded qualification observations; sampled persistence, with no claim of continuous eligibility between samples.',
      episodes: 'Local maturation batches may be disconnected and are not Plate-equivalent event units.',
      production: 'Actual archived production Plate masks, unioned by exact birth time. No controller or Plate creation.',
      traffic: 'Actual in-domain individual feet in the preceding 20 seconds, rasterized by round(position * 95).',
      ...ANT_LOCAL_ACCRETION_METRIC_DEFINITIONS },
    deterministic, seeds };
  const bytes = Buffer.from(`${JSON.stringify(report)}\n`), compressed = gzipSync(bytes, { level: 6 });
  await writeFile(resolve(output, 'analysis.json.gz'), compressed);
  await writeFile(resolve(output, 'determinism.json'), `${JSON.stringify({ noRngCalls: true, seeds: deterministic,
    analysisRawSha256: sha256(bytes), analysisCompressedSha256: sha256(compressed) }, null, 2)}\n`);
  console.log(JSON.stringify({ output, seeds: seeds.map(seed => ({ seed: seed.seed, final: seed.final })) }));
}

async function readPacket(directory, descriptor) {
  const compressed = await readFile(resolve(directory, descriptor.path));
  assert.equal(compressed.length, descriptor.compressedBytes);
  assert.equal(sha256(compressed), descriptor.compressedSha256);
  const bytes = gunzipSync(compressed);
  assert.equal(bytes.length, descriptor.uncompressedBytes);
  assert.equal(sha256(bytes), descriptor.uncompressedSha256);
  return bytes;
}

export function appendEpisode(episode, union, firstTime) {
  assert.ok(Number.isFinite(episode.timeSeconds) && episode.timeSeconds >= 0);
  assert.equal(union.length, firstTime.length);
  assert.ok(episode.cellIndices.length > 0);
  const seen = new Set();
  for (const index of episode.cellIndices) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < union.length && !seen.has(index));
    seen.add(index);
  }
  let newCells = 0;
  for (const index of episode.cellIndices) {
    if (!union[index]) { newCells += 1; firstTime[index] = episode.timeSeconds; }
    union[index] = 1;
  }
  const cells = episode.cellIndices.length;
  return { timeSeconds: episode.timeSeconds, cells, newCells, overlapCells: cells - newCells,
    priorOverlapFraction: (cells - newCells) / cells, cellIndices: [...episode.cellIndices] };
}

export function recentTrafficMask(contacts, throughSeconds, width = GRID, height = GRID) {
  const mask = new Uint8Array(width * height);
  for (const event of contacts) {
    const seconds = event.simulationTimeMs / 1000;
    if (seconds > throughSeconds + 1e-9 || seconds <= throughSeconds - 20) continue;
    for (const contact of event.contacts) {
      const { x, y } = contact.position;
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      if (x < 0 || x > 1 || y < 0 || y > 1) continue;
      mask[Math.round(y * (height - 1)) * width + Math.round(x * (width - 1))] = 1;
    }
  }
  return mask;
}

export function spatialMismatch(material, traffic) {
  assert.equal(material.length, traffic.length);
  let occupied = 0, current = 0, intersection = 0;
  for (let index = 0; index < material.length; index += 1) {
    occupied += Number(Boolean(material[index])); current += Number(Boolean(traffic[index]));
    intersection += Number(Boolean(material[index] && traffic[index]));
  }
  return { materialCells: occupied, trafficCells: current, intersectionCells: intersection,
    jaccard: occupied + current - intersection ? intersection / (occupied + current - intersection) : null,
    frozenOnlyFraction: occupied ? (occupied - intersection) / occupied : null,
    trafficUnrepresentedFraction: current ? (current - intersection) / current : null };
}

function annulusMask() {
  const mask = new Uint8Array(CELLS);
  for (let index = 0; index < CELLS; index += 1) {
    const radius = Math.hypot(index % GRID / 95 - 0.5, Math.floor(index / GRID) / 95 - 0.72);
    mask[index] = Number(radius >= 0.055 && radius <= 0.115);
  }
  return mask;
}

function analyzeSeed({ seed, metadata, flags, fields, raw }) {
  const model = new AntLocalAccretion(), shadow = new Uint8Array(CELLS), production = new Uint8Array(CELLS);
  const shadowFirst = new Float64Array(CELLS).fill(-1), productionFirst = new Float64Array(CELLS).fill(-1);
  const chemicalMemory = new Float32Array(CELLS), mechanicalSupport = new Float32Array(CELLS), repeated = new Uint8Array(CELLS);
  const history = [], episodes = [], productionEpisodes = [], milestones = [], annulus = annulusMask();
  const births = raw.births.filter(event => event.type === 'plate-birth').map(event => event.payload);
  assert.ok(births.every((birth, index) => !index || birth.bornAtSimulationTimeMs >= births[index - 1].bornAtSimulationTimeMs));
  let birthIndex = 0, occupiedShadow = 0, occupiedProduction = 0;
  for (let frame = 0; frame < metadata.frames.length; frame += 1) {
    const { tick, timeSeconds } = metadata.frames[frame];
    for (let index = 0; index < CELLS; index += 1) {
      const flag = flags[frame * CELLS + index];
      chemicalMemory[index] = Number(Boolean(flag & 1));
      mechanicalSupport[index] = Number(Boolean(flag & 2));
      repeated[index] = flag & 4 ? 2 : 0;
    }
    const frozen = model.advance({ chemicalMemory, mechanicalSupport,
      countDistinctContactTimes: repeated, timeSeconds });
    const episode = frozen ? appendEpisode(frozen, shadow, shadowFirst) : null;
    if (episode) { episodes.push(episode); occupiedShadow += episode.newCells; }
    let productionNewCells = 0;
    while (birthIndex < births.length && births[birthIndex].bornAtSimulationTimeMs / 1000 <= timeSeconds + 1e-9) {
      const birth = births[birthIndex++];
      assert.equal(birth.mask.length, CELLS);
      assert.ok(birth.mask.every(value => value === 0 || value === 1));
      const record = appendEpisode({ timeSeconds: birth.bornAtSimulationTimeMs / 1000,
        cellIndices: birth.mask.flatMap((value, index) => value ? [index] : []) }, production, productionFirst);
      productionEpisodes.push(record); productionNewCells += record.newCells;
    }
    occupiedProduction += productionNewCells;
    history.push({ tick, timeSeconds,
      shadow: { occupiedCells: occupiedShadow, newCells: episode?.newCells ?? 0, episodeCount: episodes.length },
      production: { occupiedCells: occupiedProduction, newCells: productionNewCells, episodeCount: productionEpisodes.length } });
    const descriptor = metadata.files.milestones.descriptors.find(item => item.tick === tick);
    if (descriptor) {
      const traffic = recentTrafficMask(raw.contacts, timeSeconds);
      const readField = name => {
        const range = descriptor.arrays[name];
        assert.equal(range.bytes, CELLS * 4);
        assert.ok(range.offset >= 0 && range.offset + range.bytes <= fields.length);
        return Array.from({ length: CELLS }, (_, index) => fields.readFloatLE(range.offset + index * 4));
      };
      milestones.push({ requestedSeconds: descriptor.requestedSeconds, sampledSeconds: timeSeconds,
        offsetSeconds: descriptor.offsetSeconds, chemicalMemory: readField('chemicalMemory'),
        mechanicalSupport: readField('support'), rawSurface: readField('surface'),
        materializationState: [...model.state], shadowMask: [...shadow], productionMask: [...production],
        shadowFirstFrozenTime: [...shadowFirst], productionFirstFrozenTime: [...productionFirst], trafficMask: [...traffic],
        shadowMetrics: measureBinaryMask({ width: GRID, height: GRID, mask: shadow, annulusMask: annulus }),
        productionMetrics: measureBinaryMask({ width: GRID, height: GRID, mask: production, annulusMask: annulus }),
        shadowTraffic: spatialMismatch(shadow, traffic), productionTraffic: spatialMismatch(production, traffic) });
    }
  }
  assert.equal(milestones.length, 3);
  assert.equal(birthIndex, births.length, 'All archived Plate births fall within recorded horizon');
  assert.ok(model.state.every(value => Number.isFinite(value) && value >= -1 && value <= 20));
  const final = { ...history.at(-1), shadowAreaFraction: occupiedShadow / CELLS, productionAreaFraction: occupiedProduction / CELLS,
    shadowEvents: eventSummary(episodes), productionEvents: eventSummary(productionEpisodes) };
  return { seed, inputProvenance: metadata.sourceHashes, history, episodes, productionEpisodes, milestones, final,
    failureDiagnostics: { arenaSaturation: { descriptiveCutoff: 0.80, shadowFlag: occupiedShadow / CELLS >= 0.80,
      productionFlag: occupiedProduction / CELLS >= 0.80 },
      speckle: { definition: 'Cumulative material components with at most four occupied cells.',
        shadow: tinyComponents(milestones.at(-1).shadowMetrics), production: tinyComponents(milestones.at(-1).productionMetrics) },
      redundancy: { definition: 'Repeated cell freezing / all frozen cell events; batches and Plate births differ in scale.',
        shadow: final.shadowEvents.weightedOverlapFraction, production: final.productionEvents.weightedOverlapFraction },
      blob: { definition: 'Bounding-box fill and area/skeleton-cell width are descriptive raster proxies; visual diagnosis remains separate.',
        shadow: milestones.at(-1).shadowMetrics.shape, production: milestones.at(-1).productionMetrics.shape },
      hiddenTreeBias: { generationUsesPathsOrSkeleton: false, primaryCycles: 'Exact complementary digital holes in original material mask.' } } };
}

export function eventSummary(events) {
  const cells = events.reduce((sum, event) => sum + event.cells, 0), newCells = events.reduce((sum, event) => sum + event.newCells, 0);
  const median = values => { const sorted = values.slice().sort((a, b) => a - b), middle = (sorted.length - 1) / 2;
    return sorted.length ? (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2 : null; };
  return { count: events.length, frozenCellEvents: cells, newlyOccupiedCells: newCells,
    weightedOverlapFraction: cells ? (cells - newCells) / cells : null,
    medianCells: median(events.map(event => event.cells)), medianNewCells: median(events.map(event => event.newCells)),
    medianPriorOverlapFraction: median(events.map(event => event.priorOverlapFraction)) };
}

function tinyComponents(metrics) {
  const tiny = metrics.foreground.components.filter(component => component.areaCellCount <= 4);
  const cells = tiny.reduce((sum, component) => sum + component.areaCellCount, 0);
  return { count: tiny.length, occupiedCells: cells, materialFraction: metrics.occupiedCellCount ? cells / metrics.occupiedCellCount : null };
}
