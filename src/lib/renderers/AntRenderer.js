/**
 * p5 instance-mode view for the ANT experiment.
 *
 * The sketch only paints the most recent snapshot supplied by `render()`.
 * Trajectory recording, follower playback, timing, and loop state belong to
 * the model/controller. No p5 object is created until `init()` is called.
 */
export class AntRenderer {
  constructor(canvas, { loadP5 = () => import('p5'), onLoop, onRelease } = {}) {
    if (!canvas) throw new TypeError('AntRenderer requires a canvas element');
    this.canvas = canvas;
    this.canvasParent = canvas.parentElement || null;
    this.canvasId = canvas.getAttribute ? canvas.getAttribute('id') : (canvas.id || null);
    this.canvasAriaAttributes = [...(canvas.attributes || [])]
      .filter((attribute) => attribute.name?.startsWith('aria-'))
      .map((attribute) => [attribute.name, attribute.value]);
    this.loadP5 = loadP5;
    this.onLoop = onLoop;
    this.onRelease = onRelease;
    this.instance = null;
    this.snapshot = null;
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.destroyed = false;
    this.initializing = null;
    this.resolveInitialization = null;
    this.rejectInitialization = null;
    this.setupStarted = false;
    this.pendingRemovedInstance = null;
  }

  async init({ width, height, pixelRatio = 1 } = {}) {
    if (this.destroyed) return false;
    if (this.initializing) return this.initializing;
    if (this.instance) return true;

    const bounds = this.canvas.getBoundingClientRect?.();
    this.width = positiveSize(width ?? bounds?.width ?? this.canvas.clientWidth ?? 1);
    this.height = positiveSize(height ?? bounds?.height ?? this.canvas.clientHeight ?? this.width);
    this.pixelRatio = positiveRatio(pixelRatio);

    this.initializing = new Promise((resolve, reject) => {
      this.resolveInitialization = resolve;
      this.rejectInitialization = reject;
      Promise.resolve()
        .then(() => this.loadP5())
        .then((module) => {
          if (this.destroyed) {
            resolve(false);
            return;
          }
          const P5 = module?.default || module;
          if (typeof P5 !== 'function') throw new TypeError('The p5 module did not provide a constructor');
          this.instance = new P5((p) => this.#createSketch(p), this.canvasParent || undefined);
          if (this.destroyed || this.initializationFailed) this.#removeInstance();
        })
        .catch((error) => {
          if (this.destroyed) resolve(false);
          else this.#failInitialization(error);
        });
    });

    try {
      return await this.initializing;
    } finally {
      this.initializing = null;
      this.resolveInitialization = null;
      this.rejectInitialization = null;
      this.initializationFailed = false;
    }
  }

  /** Paint a detached model snapshot. Calling this after destroy is harmless. */
  render(snapshot) {
    if (this.destroyed) return;
    this.snapshot = snapshot || null;
    this.instance?.redraw?.();
  }

  /** Resize the p5 canvas without changing simulation coordinates. */
  resize(width, height, pixelRatio = this.pixelRatio) {
    if (this.destroyed) return;
    this.width = positiveSize(width);
    this.height = positiveSize(height);
    this.pixelRatio = positiveRatio(pixelRatio);
    if (!this.instance) return;
    this.instance.pixelDensity(this.pixelRatio);
    this.instance.resizeCanvas(this.width, this.height, true);
    this.instance.redraw();
  }

  destroy() {
    if (this.destroyed) return this.removalPromise || Promise.resolve();
    this.destroyed = true;
    this.snapshot = null;
    this.resolveInitialization?.(false);
    this.rejectInitialization = null;
    const removal = this.#removeInstance();
    this.canvas = null;
    this.loadP5 = null;
    return removal || Promise.resolve();
  }

  #removeInstance() {
    if (!this.instance) return;
    const instance = this.instance;
    this.instance = null;
    if (this.destroyed && this.initializing && !this.setupStarted) {
      this.pendingRemovedInstance = instance;
    }
    const removal = instance.remove?.();
    this.removalPromise = Promise.resolve(removal).catch(() => undefined);
    return this.removalPromise;
  }

  #createSketch(p) {
    p.setup = () => {
      this.setupStarted = true;
      if (this.destroyed) {
        // p5 2.x creates its default canvas immediately before calling setup.
        // If destroy raced that asynchronous startup, remove the instance a
        // second time so this late canvas cannot survive the first cleanup.
        const instance = this.pendingRemovedInstance;
        this.pendingRemovedInstance = null;
        if (instance) {
          const removal = instance.remove?.();
          this.removalPromise = Promise.resolve(removal).catch(() => undefined);
        }
        return;
      }
      try {
        p.pixelDensity(this.pixelRatio);
        p.createCanvas(this.width, this.height, p.P2D, this.canvas);
        this.#restoreCanvasIdentity();
        p.noLoop();
        // p5 dispatches keyboard events through window; handlers below require
        // explicit canvas focus before forwarding an experiment shortcut.
        if (this.canvas && this.canvas.tabIndex < 0) this.canvas.tabIndex = 0;
        p.redraw();
        this.resolveInitialization?.(true);
      } catch (error) {
        this.#restoreCanvasIdentity();
        this.#failInitialization(error);
      }
    };

    p.draw = () => {
      if (this.destroyed) return;
      drawSnapshot(p, this.snapshot);
    };

    p.keyPressed = () => {
      // p5 dispatches keyboard events through the window. Restrict these
      // shortcuts to an explicitly focused experiment canvas.
      if (typeof document === 'undefined' || document.activeElement !== this.canvas) return;
      const key = String(p.key || '').toLowerCase();
      if (key === 'l') this.onLoop?.();
      if (key === 'r') this.onRelease?.();
    };
  }

  #failInitialization(error) {
    if (this.destroyed || this.initializationFailed) return;
    this.initializationFailed = true;
    this.rejectInitialization?.(error);
    this.#removeInstance();
  }

  #restoreCanvasIdentity() {
    const canvas = this.canvas;
    if (!canvas) return;
    if (canvas.setAttribute && canvas.removeAttribute) {
      if (this.canvasId === null) canvas.removeAttribute('id');
      else if (canvas.getAttribute('id') !== this.canvasId) canvas.setAttribute('id', this.canvasId);
      for (const attribute of [...(canvas.attributes || [])]) {
        if (attribute.name?.startsWith('aria-')) canvas.removeAttribute(attribute.name);
      }
      for (const [name, value] of this.canvasAriaAttributes) canvas.setAttribute(name, value);
    } else if (canvas.id !== (this.canvasId || '')) canvas.id = this.canvasId || '';
    if (this.canvasParent && canvas.parentNode !== this.canvasParent) this.canvasParent.appendChild(canvas);
  }
}

function drawSnapshot(p, snapshot) {
  const width = p.width, height = p.height;
  p.background(255);

  const trajectory = snapshot?.trajectory || [];
  if (trajectory.length > 1) {
    p.noFill();
    p.stroke(155, 155, 155, 105);
    p.strokeWeight(1);
    p.beginShape();
    for (const sample of trajectory) p.vertex(sample.x * width, sample.y * height);
    p.endShape();
  }

  const leader = snapshot?.leader;
  if (isPoint(leader)) drawAntMark(p, leader, width, height, 4, [55, 55, 55]);

  for (const follower of snapshot?.followers || []) {
    if (isPoint(follower)) drawAntMark(p, follower, width, height, 2.7, [130, 130, 130]);
  }
}

function drawAntMark(p, point, width, height, diameter, color) {
  p.noStroke();
  p.fill(...color);
  p.circle(point.x * width, point.y * height, diameter);
}

function isPoint(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function positiveSize(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function positiveRatio(value) {
  return Number.isFinite(value) && value > 0 ? Math.min(2, value) : 1;
}

export default AntRenderer;
