import test from 'node:test';
import assert from 'node:assert/strict';
import { AntRenderer, pheromoneValueToAlpha } from '../src/lib/renderers/AntRenderer.js';
import { AntAgent } from '../src/lib/agents/ant/AntAgent.js';
import { BODY_GEOMETRY } from '../src/lib/agents/ant/BodyPoseController.js';
import { GaitController } from '../src/lib/agents/ant/GaitController.js';

test('AntRenderer paints equal agent marks and a cached pheromone field without changing the snapshot', async () => {
  const calls = [];
  const parent = makeParent();
  const canvas = makeCanvas(parent, { id: 'simulation-canvas', 'aria-label': 'Ant trajectories', role: 'img' });
  canvas.tabIndex = -1;
  canvas.getBoundingClientRect = () => ({ width: 240, height: 180 });
  const renderer = new AntRenderer(canvas, {
    loadP5: async () => ({ default: makeP5(calls, { alterCanvas: true }) })
  });

  assert.equal(await renderer.init({ pixelRatio: 3 }), true);
  assert.ok(calls.some(([name, ...args]) => name === 'createCanvas' && args[3] === canvas));
  assert.ok(calls.some(([name, ...args]) => name === 'p5-parent' && args[0] === parent));
  assert.equal(canvas.parentNode, parent);
  assert.equal(canvas.id, 'simulation-canvas');
  assert.equal(canvas.getAttribute('aria-label'), 'Ant trajectories');
  assert.equal(canvas.getAttribute('role'), 'img');
  assert.ok(calls.some(([name]) => name === 'noLoop'));
  const values = new Float32Array([0, 0.005, 0.05, 0.25]);
  const snapshot = {
    agents: [
      { id: 'a', x: 0.1, y: 0.2, vx: 0, vy: 0, heading: 0, radius: 0.006, personality: 'curious' },
      { id: 'b', x: 0.8, y: 0.6, vx: 0, vy: 0, heading: 1, radius: 0.006, personality: 'steady' },
      { id: 'c', x: 0.5, y: 0.4, vx: 0, vy: 0, heading: 2, radius: 0.006, personality: 'bold' }
    ],
    pheromone: { width: 2, height: 2, values, maxValue: 8, totalMass: 12 }
  };
  const savedValues = [...values];
  Object.freeze(snapshot.agents);
  for (const agent of snapshot.agents) Object.freeze(agent);
  renderer.render(snapshot);
  const circles = calls.filter(([name]) => name === 'circle');
  assert.equal(circles.length, 3);
  assert.equal(new Set(circles.map(([, , , diameter]) => diameter)).size, 1);
  assert.equal(calls.filter(([name]) => name === 'image').length, 1);
  assert.equal(calls.find(([name]) => name === 'imageSmoothingEnabled')[1], true);
  assert.equal(calls.find(([name]) => name === 'imageSmoothingQuality')[1], 'high');
  assert.deepEqual([...values], savedValues);
  const fieldImage = calls.find(([name]) => name === 'createImage')[1];
  assert.deepEqual([...fieldImage.pixels].filter((_, i) => i % 4 === 3), [0, 0, 23, 112]);
  assert.ok(!calls.some(([name]) => name === 'beginShape'));

  renderer.resize(300, 200, 1.5);
  assert.ok(calls.some(([name, ...args]) => name === 'resizeCanvas' && args[0] === 300 && args[1] === 200));
  await renderer.destroy();
  await renderer.destroy();
  renderer.render({ agents: [{ x: 0, y: 0, radius: 0.006 }] });
  assert.equal(calls.filter(([name]) => name === 'remove').length, 1);
});

test('Plate debug overlays are opt-in and do not mutate detached snapshots', async () => {
  const calls = [];
  const canvas = makeCanvas(makeParent());
  const renderer = new AntRenderer(canvas, { loadP5: async () => ({ default: makeP5(calls) }) });
  await renderer.init({ width: 120, height: 120 });
  const snapshot = {
    agents: [],
    pheromone: { width: 2, height: 2, values: new Float32Array([0, 0.1, 0, 0]) },
    surface: { width: 2, height: 2, values: new Float32Array([0, 0.2, 0, 0]) },
    surfacePlates: {
      requirements: { sourceAnnulus: { origin: { x: 0.5, y: 0.72 }, radii: [0.055, 0.115] } },
      candidate: { source: { x: 0.45, y: 0.72 }, target: { x: 0.05, y: 0.72 },
        pathPoints: [{ x: 0.45, y: 0.72 }, { x: 0.3, y: 0.72 }, { x: 0.05, y: 0.72 }] }
    },
    stratigraphy: { width: 2, height: 2, revision: 1, plates: [],
      stratigraphy: { topLayerByCell: new Int32Array([-1, -1, -1, -1]),
        layerCountByCell: new Uint16Array([0, 2, 0, 0]) } }
  };
  snapshot.stratigraphy.plates = [{ id: 'trail-plate-1', source: { x: 0.4, y: 0.4 } }];
  const before = structuredClone(snapshot);
  renderer.render(snapshot);
  const baselineLines = calls.filter(([name]) => name === 'line').length;
  const baselineCircles = calls.filter(([name]) => name === 'circle').length;
  renderer.setDebugOptions({ surface: true, candidate: true, source: true, exposure: true, plateIds: true });
  renderer.render(snapshot);
  assert.ok(calls.filter(([name]) => name === 'line').length > baselineLines,
    'candidate path is drawn only after opt-in');
  assert.ok(calls.filter(([name]) => name === 'circle').length > baselineCircles,
    'surface/exposure diagnostics add debug marks only after opt-in');
  assert.ok(calls.some(([name, label]) => name === 'text' && label === 'P1'),
    'Plate IDs are labeled only after opt-in');
  assert.deepEqual(snapshot, before, 'debug rendering leaves the detached model snapshot unchanged');
  await renderer.destroy();
});

test('Plate geometry debug draws joined outlines, exposed graph lines, and compiled audio pickup nodes', async () => {
  const calls = [];
  const renderer = new AntRenderer(makeCanvas(makeParent()), { loadP5: async () => ({ default: makeP5(calls) }) });
  await renderer.init({ width: 120, height: 120 });
  const plate = {
    id: 'trail-plate-1', grid: { width: 4, height: 4 },
    mask: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    centerline: [4, 5, 6, 7].map(index => ({ index, x: index % 4 / 3, y: 1 / 3 })),
    edges: [[4, 5], [5, 6], [6, 7]],
    pickups: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }]
  };
  const topLayerByCell = new Int32Array(16).fill(0);
  topLayerByCell[6] = 1;
  topLayerByCell[7] = 1;
  const snapshot = {
    agents: [],
    stratigraphy: { width: 4, height: 4, plates: [plate],
      stratigraphy: { topLayerByCell } },
    debugAudioTopology: { solverGrid: 4, layerIds: [plate.id],
      pickupNodeIndices: new Uint32Array([0, 1]), nodeGridIndices: new Uint16Array([6, 9]) }
  };
  const before = structuredClone(snapshot);
  renderer.render(snapshot);
  assert.equal(calls.filter(([name]) => name === 'line').length, 0,
    'new Plate geometry stays hidden by default');
  assert.equal(calls.filter(([name]) => name === 'circle').length, 0);

  renderer.setDebugOptions({ plateOutlines: true, plateCenterlines: true, platePickups: true, plateIds: true });
  const lines = calls.filter(([name]) => name === 'line');
  assert.equal(lines.length, 17, '12 rectangle boundary segments, 3 centerline edges, and 2 legend samples draw');
  const contourVertices = new Map();
  for (const [, x1, y1, x2, y2] of lines.slice(0, 12)) {
    for (const key of [`${x1},${y1}`, `${x2},${y2}`]) contourVertices.set(key, (contourVertices.get(key) || 0) + 1);
  }
  assert.equal(contourVertices.size, 12);
  assert.ok([...contourVertices.values()].every(degree => degree === 2),
    'boundary edges join into a closed connected contour');
  const plateStrokes = calls.filter(([name, red, green, blue]) => name === 'stroke'
    && red === 65 && green === 95 && blue === 145);
  assert.ok(plateStrokes.some(([, , , , alpha]) => alpha === 225), 'exposed Plate lines use full debug opacity');
  assert.ok(plateStrokes.some(([, , , , alpha]) => alpha === 65), 'covered Plate lines use subdued opacity');
  const pickupMarkers = calls.filter(([name]) => name === 'circle');
  assert.deepEqual(pickupMarkers.map(([, x, y]) => [x, y]), [[80, 40], [40, 80]],
    'filled pickup markers follow compiled solver nodes, not the descriptor target points');
  const labelIndex = calls.findIndex(([name, label]) => name === 'text' && label === 'P1');
  assert.ok(labelIndex > 0);
  assert.equal(calls.filter(([name, label]) => name === 'text' && label === 'P1').length, 2,
    'Plate ID labels follow both source and route end');
  const labelColor = calls.slice(0, labelIndex).filter(([name]) => name === 'fill').at(-1).slice(1, 4);
  assert.deepEqual(labelColor, [65, 95, 145], 'Plate ID uses the same restrained color as its geometry');
  assert.ok(calls.some(([name, label]) => name === 'text' && label === 'solid = exposed · faint = buried'),
    'legend explains exposed and covered geometry styles');
  assert.ok(calls.some(([name, label]) => name === 'text' && label === 'filled = audio pickup node'),
    'pickup legend identifies compiled audio nodes');
  renderer.render({ ...snapshot, debugAudioTopology: null });
  assert.deepEqual(calls.filter(([name]) => name === 'circle').slice(-2).map(([, x, y]) => [x, y]),
    [[12, 12], [108, 12]], 'missing topology falls back to the frozen descriptor target markers');
  assert.ok(calls.some(([name, label]) => name === 'text'
    && label === 'hollow = Plate pickup target (audio topology unavailable)'),
  'fallback targets have a distinct hollow-marker legend');
  assert.deepEqual(snapshot, before, 'Plate overlays leave frozen descriptors and topology unchanged');
  await renderer.destroy();
});

test('pheromone display uses two fixed scales with monotonic weak trace and strong route contrast', () => {
  const values = [0, 0.004, 0.01, 0.02, 0.04, 0.05, 0.1, 0.18, 0.4];
  const alpha = values.map(pheromoneValueToAlpha);
  assert.equal(alpha[0], 0);
  assert.equal(pheromoneValueToAlpha(Number.NaN), 0);
  assert.equal(pheromoneValueToAlpha(-1), 0);
  assert.ok(alpha.every((value, index) => index === 0 || value >= alpha[index - 1]));
  assert.ok(alpha[2] < alpha[3] && alpha[3] < alpha[6], 'weak traces stay faint while medium paths show');
  assert.ok(alpha[7] >= 110 && alpha[7] > alpha[6] + 40, 'strong routes become substantially darker');
  assert.ok(alpha.every(value => value <= 112));
});

test('historical plate masks draw beneath live pheromone and cache frozen geometry', async () => {
  const calls = [], parent = makeParent(), canvas = makeCanvas(parent);
  const renderer = new AntRenderer(canvas, { loadP5: async () => ({ default: makeP5(calls) }) });
  await renderer.init({ width: 100, height: 100 });
  const plate = Object.freeze({ grid: Object.freeze({ width: 2, height: 2 }),
    mask: Object.freeze([1, 0, 1, 0]) });
  const snapshot = { agents: [], surfacePlates: { plates: [plate] },
    pheromone: { width: 2, height: 2, values: new Float32Array([0, 0.1, 0, 0]) } };
  renderer.render(snapshot);
  const images = calls.filter(([name]) => name === 'createImage').map(([, image]) => image);
  assert.equal(images.length, 2);
  assert.deepEqual([...images[0].pixels].filter((_, i) => i % 4 === 3), [10, 0, 10, 0]);
  assert.ok(calls.filter(([name]) => name === 'image')[0][1] === images[0], 'material draws first');
  renderer.render(snapshot);
  assert.equal(calls.filter(([name]) => name === 'createImage').length, 2, 'both images are reused');
  assert.deepEqual(plate.mask, [1, 0, 1, 0]);
  await renderer.destroy();
});

test('material rediscovery candidates add restrained contrast and coordinate-stable light texture only inside material', async () => {
  const width = 64, height = 64;
  const cells = Array.from({ length: 32 * 32 }, (_, localIndex) => [
    Math.floor(localIndex / 32) * width + localIndex % 32, 1
  ]);
  const snapshot = makeMaterialSnapshot(width, height, cells, 1);
  const production = await renderMaterialPixels(snapshot);
  const surface = await renderMaterialPixels(snapshot, 'surface');
  const textured = await renderMaterialPixels(snapshot, 'textured');

  for (const [index] of cells) {
    const offset = index * 4;
    assert.deepEqual([...production.slice(offset, offset + 3)], [100, 100, 100]);
    assert.equal(production[offset + 3], 10, 'default retains production alpha');
    assert.equal(surface[offset + 3], 19, 'B uses its preregistered one-layer alpha');
    assert.ok(textured[offset + 3] <= surface[offset + 3], 'C never darkens the B surface');
    assert.ok([surface[offset + 3], surface[offset + 3] - 8].includes(textured[offset + 3]));
  }
  const textureCells = cells.filter(([index]) => textured[index * 4 + 3] < surface[index * 4 + 3]);
  assert.ok(textureCells.length >= 40 && textureCells.length <= 90, 'C marks a sparse coordinate-fixed subset');

  const later = makeMaterialSnapshot(width, height, [...cells, [32 * width, 1]], 2);
  const texturedLater = await renderMaterialPixels(later, 'textured');
  for (const [index] of cells) {
    assert.equal(texturedLater[index * 4 + 3], textured[index * 4 + 3],
      `a later material birth must not move existing texture at cell ${index}`);
  }
  assert.ok([11, 19].includes(texturedLater[(32 * width) * 4 + 3]),
    'the added cell uses only its own fixed world coordinate');
});

test('strong material presence keeps RGB and mask fixed while using alpha 96 for every occupied cell', async () => {
  const width = 64, cells = [[width + 1, 1], [2 * width + 2, 5]];
  const pixels = await renderMaterialPixels(makeMaterialSnapshot(width, width, cells, 1), 'presence-96');
  const occupied = new Set(cells.map(([index]) => index));
  for (let index = 0; index < width * width; index += 1) {
    const offset = index * 4;
    if (occupied.has(index)) {
      assert.deepEqual([...pixels.slice(offset, offset + 3)], [100, 100, 100]);
      assert.equal(pixels[offset + 3], 96);
    } else assert.equal(pixels[offset + 3], 0);
  }
});

test('articulated ants draw snapshot gait legs and a four-part body without mutating the snapshot', async () => {
  const calls = [];
  const parent = makeParent();
  const canvas = makeCanvas(parent);
  canvas.getBoundingClientRect = () => ({ width: 240, height: 240 });
  const renderer = new AntRenderer(canvas, {
    loadP5: async () => ({ default: makeP5(calls) })
  });
  await renderer.init();
  const ant = movingAnt('ant-7', 0.4, 0.6, Math.PI / 4);
  const gait = new GaitController();
  const snapshot = { agents: [{ ...ant, gait: gait.getSnapshot(ant) }],
    pheromone: { width: 0, height: 0, values: new Float32Array() } };
  const before = structuredClone(snapshot.agents[0]);
  renderer.render(snapshot);
  assert.deepEqual(snapshot.agents[0], before, 'the renderer does not write to its model snapshot');
  assert.equal(calls.filter(([name]) => name === 'line').length, 16, 'six legs and two two-segment antennae are drawn');
  assert.equal(calls.filter(([name]) => name === 'ellipse').length, 4, 'gaster, petiole, thorax, and head are drawn');
  assert.equal(calls.filter(([name]) => name === 'circle').length, 6, 'the existing visible knee markers are retained');
  assert.ok(calls.some(([name, ...args]) => name === 'rotate' && args[0] === ant.heading));
  await renderer.destroy();
});

test('renderer uses the detached smoothed body pose instead of raw angular velocity', async () => {
  const turnSnapshots = [];
  const cases = [
    { angularVelocity: 0, headYaw: 0.1, gasterYaw: -0.06 },
    { angularVelocity: 2.25, headYaw: 0.1, gasterYaw: -0.06 },
    { angularVelocity: -2.25, headYaw: 0.1, gasterYaw: -0.06 },
    { angularVelocity: 100, headYaw: -0.1, gasterYaw: 0.06 },
    { angularVelocity: -100, headYaw: -0.1, gasterYaw: 0.06 }
  ];
  for (const { angularVelocity, headYaw, gasterYaw } of cases) {
    const calls = [];
    const parent = makeParent();
    const canvas = makeCanvas(parent);
    canvas.getBoundingClientRect = () => ({ width: 240, height: 240 });
    const renderer = new AntRenderer(canvas, { loadP5: async () => ({ default: makeP5(calls) }) });
    await renderer.init();

    const ant = new AntAgent({ id: 'ant-articulation', x: 0.4, y: 0.6, heading: 0.7, random: () => 0.5 });
    ant.angularVelocity = angularVelocity;
    const agentSnapshot = { ...ant.getSnapshot(),
      bodyPose: { turnSignal: 0.5, headYaw, gasterYaw, antennae: { left: 0.8, right: 0.2 },
        gasterRear: { x: 0.3, y: 0.6 } },
      gait: new GaitController().getSnapshot(ant) };
    const stateBeforeDraw = structuredClone(agentSnapshot);
    const movementBeforeDraw = {
      x: ant.x, y: ant.y, vx: ant.vx, vy: ant.vy,
      heading: ant.heading, angularVelocity: ant.angularVelocity
    };
    renderer.render({ agents: [agentSnapshot], pheromone: { width: 0, height: 0, values: new Float32Array() } });

    const rotations = calls.filter(([name]) => name === 'rotate').map(([, angle]) => angle);
    assert.equal(rotations.length, 3, 'thorax frame, gaster joint, and head joint each rotate once');
    assert.ok(Math.abs(rotations[0] - ant.heading) < 1e-12, 'the thorax remains on agent.heading');
    assert.ok(Math.abs(rotations[1] - gasterYaw) < 1e-12, 'the gaster consumes the model pose');
    assert.ok(Math.abs(rotations[2] - headYaw) < 1e-12, 'the head consumes the model pose');
    assert.equal(Math.abs(rotations[2]) <= .12, true, 'the model pose stays within the subtler head range');
    assert.equal(Math.abs(rotations[1]) <= .08, true, 'the model pose stays within the subtler gaster range');
    assert.deepEqual(agentSnapshot, stateBeforeDraw, 'rendering leaves the snapshot and leg geometry unchanged');
    assert.deepEqual({ x: ant.x, y: ant.y, vx: ant.vx, vy: ant.vy,
      heading: ant.heading, angularVelocity: ant.angularVelocity }, movementBeforeDraw,
    'rendering does not modify AntAgent movement state');
    const headRotationIndex = calls.findIndex(([name, angle]) => name === 'rotate' && Math.abs(angle - rotations[2]) < 1e-12);
    assert.equal(calls.slice(headRotationIndex + 1).filter(([name]) => name === 'line').length, 4,
      'all four antenna segments are drawn in the head-local transform');
    const lines = calls.filter(([name]) => name === 'line');
    turnSnapshots.push({ legs: lines.slice(0, 12), antennae: lines.slice(12) });
    await renderer.destroy();
  }
  assert.deepEqual(turnSnapshots[0].legs, turnSnapshots[1].legs,
    'head articulation does not rotate or rewrite gait leg geometry');
  assert.deepEqual(turnSnapshots[0].antennae, turnSnapshots[1].antennae,
    'raw angular-velocity changes do not alter antenna geometry when the pose stays fixed');
  assert.deepEqual(turnSnapshots[3].antennae, turnSnapshots[4].antennae,
    'opposite raw turn values do not alter a shared detached antenna pose');
});

test('antenna engagement changes only its own antenna and remains in the articulated head frame', async () => {
  const getAntennaLines = async (antennae) => {
    const calls = [];
    const canvas = makeCanvas(makeParent());
    canvas.getBoundingClientRect = () => ({ width: 240, height: 240 });
    const renderer = new AntRenderer(canvas, { loadP5: async () => ({ default: makeP5(calls) }) });
    await renderer.init();
    const ant = movingAnt('ant-antenna-posture', .5, .5, 0);
    const gait = new GaitController();
    renderer.render({ agents: [{ ...ant, bodyPose: { headYaw: 0, gasterYaw: 0, antennae },
      gait: gait.getSnapshot(ant) }], pheromone: { width: 0, height: 0, values: new Float32Array() } });
    const lines = calls.filter(([name]) => name === 'line').slice(12);
    await renderer.destroy();
    return lines;
  };

  const neutral = await getAntennaLines({ left: 0, right: 0 });
  const leftActive = await getAntennaLines({ left: 1, right: 0 });
  const rightActive = await getAntennaLines({ left: 0, right: 1 });
  assert.equal(neutral.length, 4);
  assert.ok(leftActive[1][3] > neutral[1][3] && leftActive[1][4] < neutral[1][4],
    'left engagement subtly extends and opens only the left tip');
  assert.deepEqual(leftActive.slice(2), neutral.slice(2), 'left engagement leaves the right antenna unchanged');
  assert.ok(rightActive[3][3] > neutral[3][3] && rightActive[3][4] > neutral[3][4],
    'right engagement mirrors the subtle extension and spread');
  assert.deepEqual(rightActive.slice(0, 2), neutral.slice(0, 2), 'right engagement leaves the left antenna unchanged');
});

test('sharp material scopes nearest filtering and retains identical source pixels', async () => {
  const snapshot = makeMaterialSnapshot(96, 96, [[96 + 1, 1]], 1);
  snapshot.pheromone = { width: 2, height: 2, values: new Float32Array([0, .1, 0, .1]) };
  const baseline = await renderMaterialPixels(snapshot, 'presence-96');
  const calls = [];
  const renderer = new AntRenderer(makeCanvas(makeParent()), {
    materialPresentation: 'presence-96-sharp', loadP5: async () => ({ default: makeP5(calls) })
  });
  await renderer.init({ width: 640, height: 640 });
  const repaint = renderer.render(snapshot);
  assert.equal(typeof repaint?.then, 'function', 'capture must be able to await draw completion');
  await repaint;
  assert.deepEqual(renderer.materialImage.pixels, baseline);
  const draws = calls.filter(([name]) => name === 'image');
  assert.equal(draws[0].at(-1).smoothing, false);
  assert.equal(draws.at(-1).at(-1).smoothing, true, 'pheromone retains smoothing');
  assert.equal(draws.at(-1).at(-1).quality, 'high');
  await renderer.destroy();
});

test('faint and edge material views scope native filtering and leave pheromone smoothing unchanged', async () => {
  const calls = [];
  const snapshot = makeMaterialSnapshot(96, 96, [[48 * 96 + 48, 1]], 1);
  snapshot.pheromone = { width: 2, height: 2, values: new Float32Array([0, 0.1, 0, 0.1]) };
  const before = [...snapshot.stratigraphy.stratigraphy.topLayerByCell];
  const renderer = new AntRenderer(makeCanvas(makeParent()), {
    materialPresentation: 'presence-20-directional-edge', loadP5: async () => ({ default: makeP5(calls) })
  });
  await renderer.init({ width: 640, height: 640 });
  await renderer.render(snapshot);
  const surface = renderer.materialSurface, fill = renderer.materialImage, edge = renderer.materialEdgeImage;
  const draws = calls.filter(([name]) => name === 'image');
  assert.equal(draws.length, 3, 'fill and edge draw before pheromone');
  assert.equal(draws[0].at(-1).smoothing, false);
  assert.equal(draws[1].at(-1).smoothing, false);
  assert.equal(draws.at(-1).at(-1).smoothing, true);
  assert.equal(draws.at(-1).at(-1).quality, 'high');
  await renderer.render(structuredClone(snapshot));
  assert.equal(renderer.materialSurface, surface, 'same detached topology reuses cached surface');
  assert.equal(renderer.materialImage, fill);
  assert.equal(renderer.materialEdgeImage, edge);
  assert.deepEqual([...snapshot.stratigraphy.stratigraphy.topLayerByCell], before);
  await renderer.destroy();
});

test('native identity cache distinguishes dimensions and reset worlds with the same revision', async () => {
  const calls = [];
  const renderer = new AntRenderer(makeCanvas(makeParent()), {
    materialPresentation: 'identity-fine-registered', loadP5: async () => ({ default: makeP5(calls) })
  });
  await renderer.init({ width: 64, height: 64 });
  const snapshot = makeMaterialSnapshot(96, 96, [[48 * 96 + 48, 1]], 1);
  snapshot.stratigraphy.plates = [{ id: 'p1', bornAtSimulationTimeMs: 0, grid: { width: 96, height: 96 },
    mask: Array.from(snapshot.stratigraphy.stratigraphy.topLayerByCell, x => x >= 0 ? 1 : 0),
    centerline: [{ index: 0, x: 0, y: .5 }, { index: 1, x: 1, y: .5 }], edges: [[0, 1]], principalPath: [0, 1] }];
  await renderer.render(snapshot);
  const image = renderer.materialImage;
  await renderer.render(structuredClone(snapshot));
  assert.equal(renderer.materialImage, image, 'equivalent detached snapshots reuse the bitmap');
  renderer.resize(80, 80);
  await renderer.render(snapshot);
  assert.equal(renderer.materialImage.width, 80);
  const reset = structuredClone(snapshot);
  reset.stratigraphy.stratigraphy.topLayerByCell.fill(-1);
  reset.stratigraphy.plates = [];
  await renderer.render(reset);
  assert.ok(renderer.materialImage.pixels.every(x => x === 0), 'same revision does not reuse another world bitmap');
  assert.equal(renderer.materialIdentity.stats.nominalCenterCount, 0);
  await renderer.destroy();
});

test('destroy cancels initialization while the p5 module is still loading', async () => {
  let finishLoading;
  let constructed = false;
  const renderer = new AntRenderer({}, {
    loadP5: () => new Promise((resolve) => { finishLoading = resolve; })
  });
  const init = renderer.init();
  await Promise.resolve();
  renderer.destroy();
  finishLoading({ default: class { constructor() { constructed = true; } } });
  assert.equal(await init, false);
  assert.equal(constructed, false);
});

test('destroy racing p5 setup removes a canvas created immediately before setup', async () => {
  const calls = [];
  let signalCreated;
  const created = new Promise((resolve) => { signalCreated = resolve; });
  const renderer = new AntRenderer({}, {
    loadP5: async () => ({ default: makeP5(calls, { deferSetup: true, manualSetup: true, onConstruct: signalCreated }) })
  });
  const initialization = renderer.init();
  await created;
  await renderer.destroy();
  calls.find(([name]) => name === 'lateSetup')[1]();
  assert.equal(await initialization, false);
  assert.equal(calls.filter(([name]) => name === 'remove').length, 2);
});

test('p5 setup failures reject init and remove the failed instance', async () => {
  const calls = [];
  const renderer = new AntRenderer({}, {
    loadP5: async () => ({ default: makeP5(calls, { deferSetup: true, failSetup: true }) })
  });
  await assert.rejects(renderer.init(), /setup failed/);
  assert.equal(calls.filter(([name]) => name === 'remove').length, 1);
  renderer.destroy();
});

function makeP5(calls, { deferSetup = false, manualSetup = false, failSetup = false, alterCanvas = false, onConstruct } = {}) {
  return class FakeP5 {
    constructor(sketch, parent) {
      calls.push(['p5-parent', parent]);
      const p = {
        P2D: '2d', ROUND: 'round', width: 0, height: 0,
        drawingContext: {
          get imageSmoothingEnabled() { return this.smoothing ?? true; },
          set imageSmoothingEnabled(value) { this.smoothing = value; calls.push(['imageSmoothingEnabled', value]); },
          get imageSmoothingQuality() { return this.quality ?? 'low'; },
          set imageSmoothingQuality(value) { this.quality = value; calls.push(['imageSmoothingQuality', value]); }
        },
        pixelDensity: (...args) => calls.push(['pixelDensity', ...args]),
        createCanvas: (...args) => {
          calls.push(['createCanvas', ...args]); p.width = args[0]; p.height = args[1];
          if (alterCanvas) {
            args[3].id = 'defaultCanvas0';
            args[3].setAttribute('aria-label', 'altered');
            makeParent().appendChild(args[3]);
          }
        },
        noLoop: () => calls.push(['noLoop']),
        redraw: () => { calls.push(['redraw']); p.draw(); return Promise.resolve(); },
        resizeCanvas: (...args) => { p.width = args[0]; p.height = args[1]; calls.push(['resizeCanvas', ...args]); },
        background: (...args) => calls.push(['background', ...args]),
        createImage: (width, height) => {
          const image = { width, height, pixels: new Uint8ClampedArray(width * height * 4), loadPixels() {}, updatePixels() {} };
          calls.push(['createImage', image]);
          return image;
        },
        image: (...args) => calls.push(['image', ...args, { smoothing: p.drawingContext.imageSmoothingEnabled, quality: p.drawingContext.imageSmoothingQuality }]),
        noStroke: () => calls.push(['noStroke']), stroke: (...args) => calls.push(['stroke', ...args]),
        strokeWeight: (...args) => calls.push(['strokeWeight', ...args]),
        strokeCap: (...args) => calls.push(['strokeCap', ...args]),
        strokeJoin: (...args) => calls.push(['strokeJoin', ...args]),
        line: (...args) => calls.push(['line', ...args]),
        push: () => calls.push(['push']), pop: () => calls.push(['pop']),
        translate: (...args) => calls.push(['translate', ...args]),
        rotate: (...args) => calls.push(['rotate', ...args]),
        ellipse: (...args) => calls.push(['ellipse', ...args]),
        noFill: () => calls.push(['noFill']),
        fill: (...args) => calls.push(['fill', ...args]), circle: (...args) => calls.push(['circle', ...args]),
        textSize: (...args) => calls.push(['textSize', ...args]), text: (...args) => calls.push(['text', ...args])
      };
      sketch(p);
      const setup = () => {
        if (failSetup) p.createCanvas = () => { throw new Error('setup failed'); };
        p.setup();
      };
      this.redraw = p.redraw;
      this.pixelDensity = p.pixelDensity;
      this.resizeCanvas = p.resizeCanvas;
      onConstruct?.();
      if (deferSetup) {
        calls.push(['lateSetup', setup]);
        if (!manualSetup) queueMicrotask(setup);
      } else setup();
    }
    remove() { calls.push(['remove']); }
  };
}

function movingAnt(id, x, y, heading) { return { id, x, y, heading, radius: 0.006 }; }

function makeMaterialSnapshot(width, height, cells, revision) {
  const topLayerByCell = new Int32Array(width * height).fill(-1);
  const layerCountByCell = new Uint16Array(width * height);
  for (const [index, count] of cells) {
    topLayerByCell[index] = 0;
    layerCountByCell[index] = count;
  }
  return { agents: [], pheromone: { width: 0, height: 0, values: new Float32Array() },
    stratigraphy: { width, height, revision,
      stratigraphy: { topLayerByCell, layerCountByCell } } };
}

async function renderMaterialPixels(snapshot, materialPresentation = 'production') {
  const calls = [];
  const renderer = new AntRenderer(makeCanvas(makeParent()), {
    materialPresentation,
    loadP5: async () => ({ default: makeP5(calls) })
  });
  await renderer.init({ width: 640, height: 640 });
  renderer.render(snapshot);
  const pixels = new Uint8ClampedArray(renderer.materialImage.pixels);
  await renderer.destroy();
  return pixels;
}

function makeParent() {
  return {
    appendChild(element) {
      element.parentNode = this;
      element.parentElement = this;
      return element;
    }
  };
}

function makeCanvas(parent, initialAttributes = {}) {
  const values = new Map(Object.entries(initialAttributes));
  const canvas = {
    tabIndex: -1,
    attributes: [],
    get id() { return values.get('id') || ''; },
    set id(value) { values.set('id', String(value)); sync(); },
    getAttribute(name) { return values.has(name) ? values.get(name) : null; },
    setAttribute(name, value) { values.set(name, String(value)); sync(); },
    removeAttribute(name) { values.delete(name); sync(); }
  };
  function sync() {
    canvas.attributes = [...values].map(([name, value]) => ({ name, value }));
  }
  sync();
  parent.appendChild(canvas);
  return canvas;
}
