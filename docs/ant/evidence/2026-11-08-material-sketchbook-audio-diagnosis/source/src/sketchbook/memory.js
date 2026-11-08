import { DEFAULT_SEED, STEP, lattice, randomStream, seedValue } from './common.js';

const SIZE = 8;
const EPISODE_TICKS = 20 * 60;
const INPUT_STOP_TICK = EPISODE_TICKS * 2;
const ENVELOPE_SUM = 1 / Math.sin(Math.PI / (2 * EPISODE_TICKS));
const RETENTION = Math.exp(-STEP / 45);
const DOSE = 1;
const BASE_SPRING = 0.8;
const MEMORY_SPRING = 1.2;
const GROUND = 0.15;
const DAMPING = 0.03;

function makeSample(label, order, seed) {
  const random = randomStream(seed);
  const { positions, edges } = lattice(SIZE);
  const masses = positions.map(() => 0.8 + random.next() * 0.4);
  const footprint = positions.map((_, index) => 0.5 + (masses[index] - 0.8) / 0.4);
  const totalFootprint = footprint.reduce((sum, value) => sum + value, 0);
  const initialRandomState = random.state();
  return {
    label, order, positions, edges, masses,
    footprint: footprint.map(value => value / totalFootprint),
    memoryX: positions.map(() => 0),
    memoryY: positions.map(() => 0),
    ledger: { A: 0, B: 0 },
    initialRandomState
  };
}

function inputFor(sample, tick) {
  if (tick >= INPUT_STOP_TICK) return null;
  const episode = Math.floor(tick / EPISODE_TICKS);
  const type = sample.order[episode];
  const localTick = tick % EPISODE_TICKS;
  const envelope = Math.sin(Math.PI * (localTick + 0.5) / EPISODE_TICKS);
  // The discrete envelope is normalized so each 20 s episode contributes exactly one unit.
  return { type, amount: DOSE * envelope / ENVELOPE_SUM };
}

function updateSample(sample, tick) {
  const input = inputFor(sample, tick);
  for (let i = 0; i < sample.positions.length; i++) {
    sample.memoryX[i] *= RETENTION;
    sample.memoryY[i] *= RETENTION;
    if (input) {
      const amount = input.amount * sample.footprint[i];
      if (input.type === 'A') sample.memoryX[i] += amount;
      else sample.memoryY[i] += amount;
    }
  }
  if (input) sample.ledger[input.type] += input.amount;
}

function graphFor(sample) {
  return {
    label: sample.label,
    positions: sample.positions.map(p => [...p]),
    masses: [...sample.masses],
    ground: sample.positions.map(() => GROUND),
    damping: sample.positions.map(() => DAMPING),
    springs: sample.edges.map(([i, j]) => {
      const axis = j === i + 1 ? 'memoryX' : 'memoryY';
      const directionalMemory = (sample[axis][i] + sample[axis][j]) / 2;
      return [i, j, BASE_SPRING + MEMORY_SPRING * directionalMemory];
    })
  };
}

export function MemoryWorld(seed = DEFAULT_SEED) {
  const validSeed = seedValue(seed);
  const samples = [makeSample('AB', 'AB', validSeed), makeSample('BA', 'BA', validSeed)];
  let tick = 0;

  function view() {
    const phase = tick < EPISODE_TICKS ? 'episode 1' : tick < INPUT_STOP_TICK ? 'episode 2' : 'quiet';
    const memoryDistance = Math.sqrt(samples[0].memoryX.reduce((sum, value, i) => sum + (value - samples[1].memoryX[i]) ** 2 + (samples[0].memoryY[i] - samples[1].memoryY[i]) ** 2, 0));
    const geometryDistance = Math.sqrt(samples[0].positions.reduce((sum, [x, y], i) => sum + (x - samples[1].positions[i][0]) ** 2 + (y - samples[1].positions[i][1]) ** 2, 0));
    return {
      kind: 'B', size: SIZE,
      samples: samples.map(sample => ({ label: sample.label, mass: sample.masses.reduce((sum, mass) => sum + mass, 0), memoryX: sample.memoryX.reduce((sum, value) => sum + value, 0), memoryY: sample.memoryY.reduce((sum, value) => sum + value, 0) })),
      phase,
      stats: {
        inputA1: samples[0].ledger.A, inputB1: samples[0].ledger.B,
        inputA2: samples[1].ledger.A, inputB2: samples[1].ledger.B,
        memoryDistance,
        geometryDistance
      }
    };
  }

  return {
    seed: validSeed,
    get tick() { return tick; },
    step() {
      samples.forEach(sample => updateSample(sample, tick));
      tick++;
    },
    view,
    snapshot() {
      return {
        model: 'B', version: 0, seed: validSeed, tick, step: STEP,
        config: { size: SIZE, episodeTicks: EPISODE_TICKS, inputStopTick: INPUT_STOP_TICK, retention: RETENTION, dose: DOSE, baseSpring: BASE_SPRING, memorySpring: MEMORY_SPRING, ground: GROUND, damping: DAMPING },
        samples: samples.map(sample => ({ label: sample.label, order: sample.order, positions: sample.positions.map(p => [...p]), edges: sample.edges.map(edge => [...edge]), masses: [...sample.masses], footprint: [...sample.footprint], memoryX: [...sample.memoryX], memoryY: [...sample.memoryY], ledger: { ...sample.ledger }, initialRandomState: sample.initialRandomState }))
      };
    },
    mechanics() { return samples.map(graphFor); }
  };
}
