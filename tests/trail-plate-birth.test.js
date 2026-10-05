import test from 'node:test';
import assert from 'node:assert/strict';
import { TrailPlateBirth, TRAIL_PLATE_MAX_BIRTHS, TRAIL_PLATE_GRID_SIZE,
  TRAIL_PLATE_SOURCE_ORIGIN } from '../src/lib/agents/ant/TrailPlateBirth.js';
import { PheromoneField } from '../src/lib/agents/ant/PheromoneField.js';

function ridgeFields({ y = TRAIL_PLATE_SOURCE_ORIGIN.y, xMin = 0.025, xMax = 0.66,
  chemical = 0.12, support = 0.025, halfWidth = 0.012 } = {}) {
  return {
    pheromone: { width: 96, height: 96, sample(x, sampleY) {
      return x >= xMin && x <= xMax && Math.abs(sampleY - y) <= halfWidth ? chemical : 0;
    } },
    surface: { sampleSupport(x, sampleY, radius) {
      assert.equal(radius, 0.025, 'mechanical support uses the specified local footprint');
      return x >= xMin && x <= xMax && Math.abs(sampleY - y) <= halfWidth ? support : 0;
    } }
  };
}

function observeUntilBirth(births, pheromone, surface, { startMs = 0, seconds = 60 } = {}) {
  const born = [];
  for (let second = 0; second <= seconds; second += 1) {
    const now = startMs + second * 1000;
    born.push(...births.advance({ pheromone, surface, simulationTimeMs: now }));
  }
  return born;
}

test('local annular chemical plus mechanical ridge births a frozen network after stable persistence', () => {
  const system = new TrailPlateBirth();
  const { pheromone, surface } = ridgeFields();
  const first = system.advance({ pheromone, surface, simulationTimeMs: 0 });
  assert.deepEqual(first, [], 'one snapshot cannot satisfy persistence');
  const skipped = system.advance({ pheromone, surface, simulationTimeMs: 500 });
  assert.deepEqual(skipped, [], 'analysis is capped at one observation per simulation second');

  const births = observeUntilBirth(system, pheromone, surface, { startMs: 1000, seconds: 60 });
  assert.equal(births.length, 1);
  const [plate] = births;
  assert.equal(plate.grid.width, TRAIL_PLATE_GRID_SIZE);
  assert.equal(plate.grid.height, TRAIL_PLATE_GRID_SIZE);
  assert.equal(plate.mask.length, TRAIL_PLATE_GRID_SIZE ** 2);
  assert.ok(Object.isFrozen(plate) && Object.isFrozen(plate.mask)
    && Object.isFrozen(plate.centerline) && Object.isFrozen(plate.edges));
  assert.ok(plate.provenance.stableSeconds >= 20);
  assert.ok(plate.metrics.geodesicLength >= 0.30);
  assert.ok(Math.hypot(plate.source.x - TRAIL_PLATE_SOURCE_ORIGIN.x,
    plate.source.y - TRAIL_PLATE_SOURCE_ORIGIN.y) >= 0.055 - 1e-9);
  assert.ok(Math.hypot(plate.source.x - TRAIL_PLATE_SOURCE_ORIGIN.x,
    plate.source.y - TRAIL_PLATE_SOURCE_ORIGIN.y) <= 0.115 + 1e-9);
  const targetEdgeDistance = Math.min(plate.target.x, plate.target.y, 1 - plate.target.x, 1 - plate.target.y);
  assert.ok(targetEdgeDistance <= 0.05 + 1e-9);
  assert.ok(plate.centerline.length > 2 && plate.edges.length >= plate.centerline.length - 1);
  assert.ok(plate.widths.every(width => width >= 0.012 && width <= 0.030));
  assert.ok(plate.pickups.every(pickup => pickup.x >= 0 && pickup.x <= 1
    && pickup.y >= 0 && pickup.y <= 1));
  for (const pickup of plate.pickups) {
    const pickupIndex = Math.round(pickup.y * (TRAIL_PLATE_GRID_SIZE - 1)) * TRAIL_PLATE_GRID_SIZE
      + Math.round(pickup.x * (TRAIL_PLATE_GRID_SIZE - 1));
    assert.equal(plate.mask[pickupIndex], 1, 'pickups are snapped to valid principal-path cells');
  }
  assert.ok(plate.mask.some(value => value === 1), 'the plate mask is a rasterized centerline ribbon');
  for (const [from, to] of plate.edges) {
    assert.ok(Number.isInteger(from) && from >= 0 && from < TRAIL_PLATE_GRID_SIZE ** 2);
    assert.ok(Number.isInteger(to) && to >= 0 && to < TRAIL_PLATE_GRID_SIZE ** 2);
    const dx = Math.abs(from % TRAIL_PLATE_GRID_SIZE - to % TRAIL_PLATE_GRID_SIZE);
    const dy = Math.abs(Math.floor(from / TRAIL_PLATE_GRID_SIZE) - Math.floor(to / TRAIL_PLATE_GRID_SIZE));
    assert.ok(dx <= 1 && dy <= 1 && dx + dy > 0, 'network edges connect neighboring grid cells');
  }
  assert.ok(plate.material.stiffness >= 0.65 && plate.material.stiffness <= 1.15);
  assert.ok(plate.material.density >= 1 && plate.material.density <= 1.2);
  assert.ok(plate.material.damping >= 0.25 && plate.material.damping <= 0.45);

  const frozenMask = plate.mask.slice();
  const frozenPickups = JSON.parse(JSON.stringify(plate.pickups));
  const frozenMaterial = { ...plate.material };
  pheromone.sample = () => 0;
  observeUntilBirth(system, pheromone, surface, { startMs: plate.bornAtSimulationTimeMs + 1000, seconds: 10 });
  assert.deepEqual(plate.mask, frozenMask, 'later field changes do not mutate an existing plate network');
  assert.deepEqual(plate.pickups, frozenPickups);
  assert.deepEqual(plate.material, frozenMaterial);
  assert.equal(system.getPlates()[0], plate, 'getPlates returns the frozen descriptor');

  const repeat = new TrailPlateBirth();
  const repeatedFields = ridgeFields();
  const [sameDescriptor] = observeUntilBirth(repeat, repeatedFields.pheromone, repeatedFields.surface,
    { seconds: 60 });
  assert.deepEqual(sameDescriptor, plate, 'identical fields and simulation times yield identical descriptors');
  assertConnectedPlate(plate);
});

test('short-lived trail signal cannot become a persistent plate and real fields are read without sensing calls', () => {
  const transient = new TrailPlateBirth();
  const route = ridgeFields();
  for (let second = 0; second <= 5; second += 1) {
    transient.advance({ pheromone: route.pheromone, surface: route.surface, simulationTimeMs: second * 1000 });
  }
  route.pheromone.sample = () => 0;
  for (let second = 6; second <= 90; second += 1) {
    assert.deepEqual(transient.advance({ pheromone: route.pheromone, surface: route.surface,
      simulationTimeMs: second * 1000 }), []);
  }
  assert.equal(transient.getPlates().length, 0, 'brief exposure followed by decay does not meet persistence');

  const field = new PheromoneField();
  field.depositSegment({ x: 0.025, y: TRAIL_PLATE_SOURCE_ORIGIN.y }, { x: 0.66, y: TRAIL_PLATE_SOURCE_ORIGIN.y });
  let sensingSamples = 0;
  field.sample = () => { sensingSamples += 1; return 0; };
  const system = new TrailPlateBirth();
  system.advance({ pheromone: field, surface: { sampleSupport: () => 0 }, simulationTimeMs: 0 });
  assert.equal(sensingSamples, 0, 'the birth analysis reads the field grid without calling the locomotion sampler');
});

test('transverse route support changes ribbon width while retaining bounded physical geometry', () => {
  const narrow = new TrailPlateBirth();
  const narrowFields = ridgeFields({ halfWidth: 0.012 });
  const [narrowPlate] = observeUntilBirth(narrow, narrowFields.pheromone, narrowFields.surface, { seconds: 60 });
  const broad = new TrailPlateBirth();
  const broadFields = ridgeFields({ halfWidth: 0.015 });
  const [broadPlate] = observeUntilBirth(broad, broadFields.pheromone, broadFields.surface, { seconds: 60 });
  assert.ok(narrowPlate && broadPlate);
  assert.ok(broadPlate.metrics.maxHalfWidth > narrowPlate.metrics.maxHalfWidth + 0.002,
    'wider transverse chemical and mechanical support creates a wider ribbon');
  for (const plate of [narrowPlate, broadPlate]) {
    assert.ok(plate.widths.every(width => width >= 0.012 && width <= 0.030));
  }
});

test('distant qualifying branches survive skeleton pruning while short dead-end growth stays out of the plate', () => {
  const branches = new TrailPlateBirth();
  const branchPoint = (x, y) => (x >= 0.025 && x <= 0.66
    && Math.abs(y - TRAIL_PLATE_SOURCE_ORIGIN.y) <= 0.012)
    || (Math.abs(x - 0.4) <= 0.012 && y >= 0.025 && y <= TRAIL_PLATE_SOURCE_ORIGIN.y);
  const branchedPheromone = { sample(x, y) { return branchPoint(x, y) ? 0.12 : 0; } };
  const branchedSurface = { sampleSupport(x, y) { return branchPoint(x, y) ? 0.025 : 0; } };
  const [network] = observeUntilBirth(branches, branchedPheromone, branchedSurface, { seconds: 60 });
  assert.ok(network);
  assert.ok(network.centerline.some(node => node.y < 0.1 && Math.abs(node.x - 0.4) < 0.02),
    'the distant source-connected branch is retained');
  assert.ok(network.centerline.some(node => node.y > 0.7 && node.x < 0.2),
    'the other qualifying source-to-boundary branch is retained too');
  assertConnectedPlate(network);

  const growing = new TrailPlateBirth();
  let twigEnabled = false;
  const growingPheromone = { sample(x, y) {
    const main = x >= 0.025 && x <= 0.66 && Math.abs(y - TRAIL_PLATE_SOURCE_ORIGIN.y) <= 0.012;
    const twig = twigEnabled && Math.abs(x - 0.4) <= 0.012 && y >= 0.72 && y <= 0.79;
    return main || twig ? 0.12 : 0;
  } };
  const growingSurface = { sampleSupport(x, y) {
    const main = x >= 0.025 && x <= 0.66 && Math.abs(y - TRAIL_PLATE_SOURCE_ORIGIN.y) <= 0.012;
    const twig = twigEnabled && Math.abs(x - 0.4) <= 0.012 && y >= 0.72 && y <= 0.79;
    return main || twig ? 0.025 : 0;
  } };
  const [original] = observeUntilBirth(growing, growingPheromone, growingSurface, { seconds: 60 });
  assert.ok(original);
  twigEnabled = true;
  const afterGrowth = observeUntilBirth(growing, growingPheromone, growingSurface, {
    startMs: original.bornAtSimulationTimeMs + 100000, seconds: 10
  });
  assert.equal(afterGrowth.length, 0,
    'dead-end branch growth preserves corridor identity and cannot bypass refractory/contact evidence');
  assert.equal(growing.getPlates()[0], original, 'branch growth cannot replace the frozen first plate');
  assert.ok(original.centerline.every(node => node.y <= 0.74), 'short dead-end twigs are pruned');
});

test('spawn-center pixels, remote trails, chemical-only ridges, and short paths cannot qualify', () => {
  const system = new TrailPlateBirth();
  const centerHot = { sample(x, y) {
    return Math.hypot(x - TRAIL_PLATE_SOURCE_ORIGIN.x, y - TRAIL_PLATE_SOURCE_ORIGIN.y) < 0.02 ? 8 : 0;
  } };
  const remote = { sample(x, y) { return x > 0.9 && y > 0.85 ? 2 : 0; } };
  const supported = { sampleSupport: () => 0.04 };
  for (let time = 0; time <= 30000; time += 1000) {
    assert.deepEqual(system.advance({ pheromone: centerHot, surface: supported, simulationTimeMs: time }), []);
    assert.deepEqual(system.advance({ pheromone: remote, surface: supported, simulationTimeMs: time + 500 }), []);
  }

  const { pheromone, surface } = ridgeFields({ chemical: 0.2, support: 0 });
  observeUntilBirth(system, pheromone, surface, { startMs: 31000, seconds: 40 });
  assert.equal(system.getPlates().length, 0, 'pheromone without physical foot support cannot birth a plate');

  const short = ridgeFields({ xMin: 0.3, xMax: 0.6, chemical: 0.2, support: 0.025 });
  observeUntilBirth(system, short.pheromone, short.surface, { startMs: 72000, seconds: 45 });
  assert.equal(system.getPlates().length, 0, 'a connected route shorter than the geodesic threshold is rejected');
});

test('real FOOT_CONTACT accumulation, corridor refractory, global spacing, and birth limit are explicit', () => {
  const system = new TrailPlateBirth();
  const { pheromone, surface } = ridgeFields();
  const [initial] = observeUntilBirth(system, pheromone, surface, { seconds: 60 });
  assert.ok(initial);
  const unchangedRoute = observeUntilBirth(system, pheromone, surface, {
    startMs: Math.max(initial.bornAtSimulationTimeMs + 90000, 90000), seconds: 10
  });
  assert.equal(unchangedRoute.length, 0, 'an unchanged route does not rebirth after refractory without new feet');
  for (let index = 0; index < 40; index += 1) {
    system.observeFootContact({ type: 'FOOT_CONTACT', contacts: [
      { position: { x: 0.35, y: TRAIL_PLATE_SOURCE_ORIGIN.y } }
    ] });
  }
  const afterRefractory = observeUntilBirth(system, pheromone, surface, {
    startMs: initial.bornAtSimulationTimeMs + 105000, seconds: 1
  });
  assert.equal(afterRefractory.length, 1, 'new actual feet plus elapsed refractory permit a second birth');

  const snapshot = system.getSnapshot();
  assert.equal(snapshot.plates.length, 2);
  assert.equal(snapshot.limitReached, false);
  assert.ok(snapshot.candidate.footContacts >= 40);
  assert.equal(system.observeFootContact({ type: 'STEP', contacts: [
    { position: { x: 0.35, y: TRAIL_PLATE_SOURCE_ORIGIN.y } }
  ] }), 0, 'synthetic non-FOOT_CONTACT events do not count as physical evidence');
  assert.ok(TRAIL_PLATE_MAX_BIRTHS === 12);

  const stableDescriptor = system.getPlates()[0];
  system.reset();
  assert.deepEqual(system.getSnapshot(), { plates: [], candidate: null, limitReached: false });
  assert.ok(stableDescriptor.mask.length > 0, 'reset does not mutate descriptors already handed to consumers');
});

test('birth limit reports full and preserves existing descriptors without eviction', () => {
  const system = new TrailPlateBirth({ maxBirths: 1 });
  const firstFields = ridgeFields();
  const [first] = observeUntilBirth(system, firstFields.pheromone, firstFields.surface, { seconds: 60 });
  assert.ok(first);
  const secondFields = ridgeFields({ y: 0.78, xMin: 0.02, xMax: 0.7, halfWidth: 0.034 });
  observeUntilBirth(system, secondFields.pheromone, secondFields.surface, {
    startMs: first.bornAtSimulationTimeMs + 11000, seconds: 60
  });
  const snapshot = system.getSnapshot();
  assert.equal(snapshot.limitReached, true);
  assert.equal(snapshot.plates.length, 1);
  assert.equal(snapshot.plates[0], first, 'capacity never evicts a frozen plate layer');
});

function assertConnectedPlate(plate) {
  const size = TRAIL_PLATE_GRID_SIZE;
  const active = [];
  for (let index = 0; index < plate.mask.length; index += 1) if (plate.mask[index]) active.push(index);
  assert.ok(active.length > 0);
  const seen = new Uint8Array(plate.mask.length), queue = [active[0]];
  seen[active[0]] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head], x = index % size, y = Math.floor(index / size);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      const adjacent = ny * size + nx;
      if (plate.mask[adjacent] && !seen[adjacent]) { seen[adjacent] = 1; queue.push(adjacent); }
    }
  }
  assert.equal(queue.length, active.length, 'the final variable-width ribbon is connected');
  const nodes = new Set(plate.centerline.map(node => node.index));
  const adjacency = new Map([...nodes].map(index => [index, []]));
  for (const [a, b] of plate.edges) { adjacency.get(a)?.push(b); adjacency.get(b)?.push(a); }
  const skeletonSeen = new Set(), pending = [plate.centerline[0].index];
  while (pending.length) {
    const index = pending.pop();
    if (skeletonSeen.has(index)) continue;
    skeletonSeen.add(index);
    pending.push(...(adjacency.get(index) || []));
  }
  assert.equal(skeletonSeen.size, nodes.size, 'the centerline skeleton network is connected');
}
