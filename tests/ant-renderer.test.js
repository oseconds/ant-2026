import test from 'node:test';
import assert from 'node:assert/strict';
import { AntRenderer } from '../src/lib/renderers/AntRenderer.js';

test('AntRenderer paints supplied snapshots through an instance and removes it once', async () => {
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
  renderer.render({
    trajectory: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.6 }],
    leader: { x: 0.8, y: 0.6 },
    followers: [{ x: 0.5, y: 0.4 }]
  });
  assert.ok(calls.some(([name]) => name === 'beginShape'));
  assert.equal(calls.filter(([name]) => name === 'circle').length, 2);

  renderer.resize(300, 200, 1.5);
  assert.ok(calls.some(([name, ...args]) => name === 'resizeCanvas' && args[0] === 300 && args[1] === 200));
  await renderer.destroy();
  await renderer.destroy();
  renderer.render({ leader: { x: 0, y: 0 } });
  assert.equal(calls.filter(([name]) => name === 'remove').length, 1);
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

test('keyboard shortcuts run only while the canvas is focused', async () => {
  const calls = [];
  const canvas = { tabIndex: -1 };
  let loops = 0, releases = 0;
  const renderer = new AntRenderer(canvas, {
    loadP5: async () => ({ default: makeP5(calls) }),
    onLoop: () => loops++, onRelease: () => releases++
  });
  await renderer.init();
  const previousDocument = globalThis.document;
  globalThis.document = { activeElement: null };
  try {
    calls.find(([name]) => name === 'keyPressed')[1]('l');
    assert.equal(loops, 0);
    globalThis.document.activeElement = canvas;
    calls.find(([name]) => name === 'keyPressed')[1]('L');
    calls.find(([name]) => name === 'keyPressed')[1]('r');
    assert.equal(loops, 1);
    assert.equal(releases, 1);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    renderer.destroy();
  }
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
        P2D: '2d', width: 0, height: 0,
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
        noFill: () => calls.push(['noFill']), stroke: (...args) => calls.push(['stroke', ...args]),
        strokeWeight: (...args) => calls.push(['strokeWeight', ...args]),
        beginShape: () => calls.push(['beginShape']), vertex: (...args) => calls.push(['vertex', ...args]),
        endShape: () => calls.push(['endShape']), noStroke: () => calls.push(['noStroke']),
        fill: (...args) => calls.push(['fill', ...args]), circle: (...args) => calls.push(['circle', ...args]),
        key: '', keyPressed: null
      };
      sketch(p);
      calls.push(['keyPressed', (key) => { p.key = key; p.keyPressed(); }]);
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
