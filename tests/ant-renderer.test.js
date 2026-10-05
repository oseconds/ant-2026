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
        redraw: () => { calls.push(['redraw']); p.draw(); },
        resizeCanvas: (...args) => calls.push(['resizeCanvas', ...args]),
        background: (...args) => calls.push(['background', ...args]),
        createImage: (width, height) => {
          const image = { width, height, pixels: new Uint8ClampedArray(width * height * 4), loadPixels() {}, updatePixels() {} };
          calls.push(['createImage', image]);
          return image;
        },
        image: (...args) => calls.push(['image', ...args]),
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
        fill: (...args) => calls.push(['fill', ...args]), circle: (...args) => calls.push(['circle', ...args])
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
