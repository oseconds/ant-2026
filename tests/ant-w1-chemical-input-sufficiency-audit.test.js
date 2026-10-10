import test from 'node:test';
import assert from 'node:assert/strict';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';
import { TrailPlateBirth, TRAIL_PLATE_CHEMICAL_HALF_SATURATION,
  TRAIL_PLATE_CHEMICAL_TAU_SECONDS } from '../src/lib/agents/ant/TrailPlateBirth.js';
import { CELLS, DT, FIELD_BYTES, HEIGHT, WIDTH, reconstructTickTimes,
  consistencyCheckMayProceed, sourceHashGap, validateEncoding, validateFiniteFloat32,
  validateUpdateCoverage } from '../scripts/ant-w1-chemical-input-sufficiency-audit.js';

function memoryBytes(memory) {
  return Buffer.from(memory.buffer, memory.byteOffset, memory.byteLength);
}

test('advance uses initial one second, then elapsed reconstructed from actual tick clock', () => {
  const model = new TrailPlateBirth();
  const pheromone = new PheromoneField({ width: WIDTH, height: HEIGHT });
  pheromone.values.fill(0.08);
  const tickMs = DT * 1000;
  let simulationTimeMs = 0;
  const firstElapsed = [];
  const originalUpdate = model.updateChemicalMemory.bind(model);
  model.updateChemicalMemory = (field, elapsed) => { firstElapsed.push(elapsed); originalUpdate(field, elapsed); };

  simulationTimeMs += tickMs;
  model.advance({ pheromone, surface: null, simulationTimeMs });
  assert.deepEqual(firstElapsed, [1]);
  const bounded = 0.08 / (0.08 + TRAIL_PLATE_CHEMICAL_HALF_SATURATION);
  const firstAlpha = 1 - Math.exp(-1 / TRAIL_PLATE_CHEMICAL_TAU_SECONDS);
  const expected = new Float32Array(CELLS);
  for (let cell = 0; cell < CELLS; cell += 1) expected[cell] += (bounded - expected[cell]) * firstAlpha;
  assert.deepEqual(memoryBytes(model.chemicalMemory), memoryBytes(expected));

  const firstTime = simulationTimeMs;
  for (let tick = 0; tick < 61; tick += 1) simulationTimeMs += tickMs;
  model.advance({ pheromone, surface: null, simulationTimeMs });
  assert.equal(firstElapsed.length, 2);
  const actualElapsed = (simulationTimeMs - firstTime) / 1000;
  assert.equal(firstElapsed[1], actualElapsed);
  const secondAlpha = 1 - Math.exp(-Math.max(0, actualElapsed) / TRAIL_PLATE_CHEMICAL_TAU_SECONDS);
  for (let cell = 0; cell < CELLS; cell += 1) expected[cell] += (bounded - expected[cell]) * secondAlpha;
  assert.deepEqual(memoryBytes(model.chemicalMemory), memoryBytes(expected));
});

test('production grid sampler and Float32 in-place storage match every cell byte', () => {
  const model = new TrailPlateBirth();
  const pheromone = new PheromoneField({ width: WIDTH, height: HEIGHT });
  for (let row = 0; row < HEIGHT; row += 1) {
    for (let column = 0; column < WIDTH; column += 1) {
      pheromone.values[row * WIDTH + column] = ((row * 31 + column * 17) % 997) / 211;
    }
  }
  const elapsed = 1;
  const alpha = 1 - Math.exp(-Math.max(0, elapsed) / TRAIL_PLATE_CHEMICAL_TAU_SECONDS);
  const expected = new Float32Array(CELLS);
  for (let row = 0; row < HEIGHT; row += 1) {
    const y = row / (HEIGHT - 1);
    for (let column = 0; column < WIDTH; column += 1) {
      const cell = row * WIDTH + column, x = column / (WIDTH - 1);
      const raw = Math.max(0, pheromone.sample(x, y));
      const bounded = raw / (raw + TRAIL_PLATE_CHEMICAL_HALF_SATURATION);
      expected[cell] += (bounded - expected[cell]) * alpha;
    }
  }
  model.updateChemicalMemory(pheromone, elapsed);
  assert.deepEqual(memoryBytes(model.chemicalMemory), memoryBytes(expected));
});

test('synthetic archived memories distinguish exact recurrence from changed, omitted and reordered inputs', () => {
  const profiles = [0.08, 0.4, 0.02];
  const replay = frames => {
    const model = new TrailPlateBirth();
    const pheromone = new PheromoneField({ width: WIDTH, height: HEIGHT });
    return frames.map(({ value, elapsed }) => {
      pheromone.values.fill(value);
      model.updateChemicalMemory(pheromone, elapsed);
      return Buffer.from(memoryBytes(model.chemicalMemory));
    });
  };
  const archived = replay(profiles.map(value => ({ value, elapsed: 1 })));
  const byteMatch = (actual, expected) => actual.length === expected.length
    && actual.every((frame, index) => frame.equals(expected[index]));
  assert.equal(byteMatch(replay(profiles.map(value => ({ value, elapsed: 1 }))), archived), true);
  assert.equal(byteMatch(replay(profiles.map((value, index) => ({
    value: index === 1 ? value + 0.01 : value, elapsed: 1
  }))), archived), false, 'changed chemical input changes archived Float32 output');
  const withoutMiddleFrame = replay([{ value: profiles[0], elapsed: 1 },
    { value: profiles[2], elapsed: 2 }]);
  assert.equal(withoutMiddleFrame.at(-1).equals(archived.at(-1)), false,
    'omitting an update changes the later archived memory');
  assert.equal(byteMatch(replay([profiles[0], profiles[2], profiles[1]].map(value => ({ value, elapsed: 1 }))), archived), false,
    'reordering archived inputs changes the frame-by-frame memories');
});

test('production tick clock reconstructs cumulative tick additions exactly', () => {
  const times = reconstructTickTimes(61);
  let expectedMs = 0;
  for (let tick = 1; tick <= 61; tick += 1) {
    expectedMs += DT * 1000;
    assert.equal(times[tick], expectedMs);
  }
  assert.equal(times[1] / 1000, DT);
});

test('descriptor timestamps, offsets, array order and row-major byte spans are validated', () => {
  let offset = 0;
  const descriptors = [];
  const frames = [];
  for (let frame = 0; frame < 599; frame += 1) {
    const arrays = {};
    for (const key of ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts']) {
      arrays[key] = { offset, bytes: FIELD_BYTES };
      offset += FIELD_BYTES;
    }
    const tick = frame + 1;
    const timeSeconds = frame === 598 ? 599.2500000000696 : (frame === 0 ? DT : frame + DT);
    descriptors.push({ tick, timeSeconds, arrays });
    frames.push({ tick, timeSeconds });
  }
  const bytes = validateEncoding({ type: 'per-array XOR delta of exact Float32/Uint32 bytes, concatenated in snapshot order',
    arrayOrder: ['chemical', 'chemicalMemory', 'surface', 'support', 'contactCounts'], descriptors },
  { frameCount: 599, fieldDimensions: [WIDTH, HEIGHT], frames });
  assert.equal(bytes, 599 * 5 * FIELD_BYTES);
  const row = 37, column = 82, cell = row * WIDTH + column;
  const array = Buffer.alloc(FIELD_BYTES);
  array.writeFloatLE(0.625, cell * 4);
  assert.equal(array.readFloatLE((row * WIDTH + column) * 4), 0.625);
});

test('reordered or missing update descriptors fail causal coverage', () => {
  const expectedTicks = [1, 61, 121];
  assert.equal(validateUpdateCoverage(expectedTicks, expectedTicks.map(tick => ({ tick }))), 3);
  assert.throws(() => validateUpdateCoverage(expectedTicks, [61, 1, 121].map(tick => ({ tick }))));
  assert.throws(() => validateUpdateCoverage(expectedTicks, [1, 121].map(tick => ({ tick }))));
  assert.throws(() => validateUpdateCoverage(expectedTicks, [{ tick: 1 }, undefined, { tick: 121 }]));
});

test('missing, malformed, NaN and infinite Float32 inputs are rejected', () => {
  assert.throws(() => validateFiniteFloat32(undefined, 'missing'));
  assert.throws(() => validateFiniteFloat32(Buffer.alloc(FIELD_BYTES - 4), 'short'));
  const nonFinite = Buffer.alloc(FIELD_BYTES);
  nonFinite.writeFloatLE(Number.NaN, 0);
  assert.throws(() => validateFiniteFloat32(nonFinite, 'NaN'));
  nonFinite.writeFloatLE(Number.POSITIVE_INFINITY, 0);
  assert.throws(() => validateFiniteFloat32(nonFinite, 'Infinity'));
});

test('an unverifiable archived capture-source hash creates a typed stop gap', () => {
  assert.equal(sourceHashGap('runner.js', 'a'.repeat(64), 'a'.repeat(64)), null);
  assert.deepEqual(sourceHashGap('runner.js', 'a'.repeat(64), 'b'.repeat(64)), {
    code: 'ARCHIVED_REPLAY_RUNNER_SOURCE_HASH_MISMATCH', path: 'runner.js',
    recordedSha256: 'a'.repeat(64), observedSha256: 'b'.repeat(64),
    effect: 'The archived capture source cannot be verified, so same-update chemical-input / chemicalMemory-output timing is not established.'
  });
});

test('consistency path bypasses only the known runner hash gap while legacy audit still sees it as a gap', () => {
  const runnerGap = sourceHashGap('scripts/ant-morphology-replay.js', 'a'.repeat(64), 'b'.repeat(64));
  assert.equal(consistencyCheckMayProceed([]), true);
  assert.equal(consistencyCheckMayProceed([runnerGap]), true);
  assert.equal(consistencyCheckMayProceed([{ ...runnerGap, path: 'src/production.js' }]), false);
  assert.equal(consistencyCheckMayProceed([runnerGap, runnerGap]), false);
  assert.notEqual(runnerGap, null, 'the unchanged sufficiency audit still receives a provenance stop gap');
});
