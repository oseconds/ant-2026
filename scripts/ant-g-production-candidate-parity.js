import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

const SIZE = 316;
const RADIUS = 0.0045;
const EXPECTED_LOCAL_READS = 99_792;
const EXPECTED_WIDE_READS = 138_600;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find(item => item.startsWith(prefix))?.slice(prefix.length);
  assert(value, `Missing ${prefix}<path>`);
  return resolve(value);
}

function readJson(path) {
  const bytes = readFileSync(path);
  const decoded = path.endsWith('.gz') ? gunzipSync(bytes) : bytes;
  return JSON.parse(decoded.toString('utf8'));
}

function rowKey(row) {
  return `${row.shape}|${row.phase}|${row.station}`;
}

const writeStreams = readJson(argument('write-streams'));
const stations = readJson(argument('station-raw'));
const frozenRows = readJson(argument('gate2-rows'));
const manifest = readJson(argument('manifest'));
assert.equal(writeStreams.arms.length, 24);
assert.equal(stations.length, 5_544);
assert.equal(frozenRows.length, 5_544);
assert.equal(manifest.files.filter(file => file.path.startsWith('gate1/rasters/')).length, 24);

const stationByKey = new Map(stations.map(row => [rowKey(row), row]));
const frozenByKey = new Map(frozenRows.map(row => [row.key, row]));
assert.equal(stationByKey.size, stations.length);
assert.equal(frozenByKey.size, frozenRows.length);

let localReads = 0;
let wideReads = 0;
const rasterReceipts = [];
for (const arm of writeStreams.arms) {
  const field = new PheromoneField({ width: SIZE, height: SIZE, maxValue: 8 });
  assert.equal(field.sourceDoseScale, 3969 / 361);
  assert.equal(arm.writes.length, arm.eventCount);
  for (const write of arm.writes) {
    assert.equal(field.depositPoint(write.gridPosition, { amount: write.requestedAmount, radius: RADIUS }),
      write.requestedAmount, `${arm.id} authored point request`);
  }

  const rasterBytes = Buffer.from(field.values.buffer, field.values.byteOffset, field.values.byteLength);
  const rasterSha256 = hash(rasterBytes);
  const expectedPath = `gate1/rasters/${arm.shape}-${arm.phase.id}.f32le`;
  const expectedRaster = manifest.files.find(file => file.path === expectedPath);
  assert(expectedRaster, `${arm.id} frozen G raster manifest entry`);
  assert.equal(rasterSha256, expectedRaster.sha256, `${arm.id} exact frozen G raster bytes`);

  let nodeSum = 0;
  let maximumNode = 0;
  let nonzeroNodes = 0;
  for (const value of field.values) {
    assert(Number.isFinite(value) && value >= 0, `${arm.id} finite nonnegative node`);
    nodeSum += value;
    maximumNode = Math.max(maximumNode, value);
    if (value > 0) nonzeroNodes += 1;
  }

  let armLocalReads = 0;
  let armWideReads = 0;
  for (const station of stations) {
    if (station.shape !== arm.shape || station.phase !== arm.phase.id) continue;
    const key = rowKey(station);
    const frozen = frozenByKey.get(key);
    assert(frozen, `${key} frozen G row`);
    assert.equal(frozen.G.rasterSha256, rasterSha256, `${key} saved G raster identity`);
    assert.equal(station.localGeometry.length, frozen.G.rawLocal.length, `${key} local geometry length`);
    for (let index = 0; index < station.localGeometry.length; index += 1) {
      const query = station.localGeometry[index];
      assert.equal(field.sample(query.x, query.y), frozen.G.rawLocal[index], `${key} local raw ${index}`);
      armLocalReads += 1;
    }
    assert.equal(station.wideGeometry.length, frozen.G.rawWide.length, `${key} wide candidate count`);
    for (let candidate = 0; candidate < station.wideGeometry.length; candidate += 1) {
      const reads = station.wideGeometry[candidate].reads;
      assert.equal(reads.length, frozen.G.rawWide[candidate].length, `${key} wide read count ${candidate}`);
      for (let index = 0; index < reads.length; index += 1) {
        const query = reads[index];
        assert.equal(field.sample(query.x, query.y), frozen.G.rawWide[candidate][index],
          `${key} wide raw ${candidate}/${index}`);
        armWideReads += 1;
      }
    }
  }
  assert.equal(armLocalReads, 231 * 18, `${arm.id} local read count`);
  assert.equal(armWideReads, 231 * 5 * 5, `${arm.id} wide read count`);
  localReads += armLocalReads;
  wideReads += armWideReads;
  rasterReceipts.push({ id: arm.id, rasterSha256, bytes: rasterBytes.length,
    writes: arm.writes.length, nodeSum, maximumNode, nonzeroNodes,
    localReads: armLocalReads, wideReads: armWideReads });
}

assert.equal(localReads, EXPECTED_LOCAL_READS);
assert.equal(wideReads, EXPECTED_WIDE_READS);
const result = {
  schema: 'ant-g-production-candidate-fixed-cue-parity-v1',
  representation: { width: SIZE, height: SIZE, sourceDoseScale: 3969 / 361, radius: RADIUS },
  frozenRows: frozenRows.length,
  rasterCount: rasterReceipts.length,
  localReads,
  wideReads,
  exactRasterMatches: rasterReceipts.length,
  exactLocalRawMatches: localReads,
  exactWideRawMatches: wideReads,
  mismatches: 0,
  rasterReceipts
};
const output = process.argv.find(item => item.startsWith('--output='));
if (output) writeFileSync(resolve(output.slice('--output='.length)), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
