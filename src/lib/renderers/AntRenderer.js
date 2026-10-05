import { ANT_MAX_TURN_RATE } from '../agents/ant/AntAgent.js';

const HEAD_YAW_MAX = 0.23;
const GASTER_YAW_MAX = 0.12;
const HEAD_PIVOT_X = 0.54;

/**
 * p5 instance-mode view for the ANT experiment.
 *
 * The sketch only paints the most recent snapshot supplied by `render()`.
 * Agent movement and pheromone state belong to the framework-independent
 * model/controller. No p5 object is created until `init()` is called.
 */
export class AntRenderer {
  constructor(canvas, { loadP5 = () => import('p5') } = {}) {
    if (!canvas) throw new TypeError('AntRenderer requires a canvas element');
    this.canvas = canvas;
    this.canvasParent = canvas.parentElement || null;
    this.canvasId = canvas.getAttribute ? canvas.getAttribute('id') : (canvas.id || null);
    this.canvasAriaAttributes = [...(canvas.attributes || [])]
      .filter((attribute) => attribute.name?.startsWith('aria-'))
      .map((attribute) => [attribute.name, attribute.value]);
    this.loadP5 = loadP5;
    this.instance = null;
    this.snapshot = null;
    this.fieldImage = null;
    this.fieldSize = null;
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
    this.fieldImage = null;
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
      drawSnapshot(p, this.snapshot, this);
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

const BASE_TRACE_ALPHA = 22;
const ESTABLISHED_ROUTE_ALPHA = 90;

function drawSnapshot(p, snapshot, renderer) {
  const width = p.width, height = p.height;
  p.background(255);

  const field = snapshot?.pheromone;
  if (field?.values?.length && field.width > 0 && field.height > 0) {
    const image = updateFieldImage(p, renderer, field);
    p.image(image, 0, 0, width, height);
  }

  const diameterScale = Math.min(width, height) * 2;
  for (const agent of snapshot?.agents || []) {
    if (!isPoint(agent)) continue;
    drawAnt(p, agent, width, height, diameterScale);
  }
}

function drawAnt(p, agent, width, height, diameterScale) {
  const radius =
    Number.isFinite(agent.radius) && agent.radius > 0
      ? agent.radius
      : 0.006;

  const centerX = agent.x * width;
  const centerY = agent.y * height;

  const legs = Array.isArray(agent.gait?.legs) ? agent.gait.legs : null;

  const isPointLike = (point) =>
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y);

  // gait 데이터가 없으면 fallback 점
  if (!legs || legs.length === 0) {
    p.noStroke();
    p.fill(40);
    p.circle(centerX, centerY, Math.max(1.5, radius * diameterScale));
    return;
  }

  const r = radius * diameterScale;
  const turnSignal = clamp(
    Number.isFinite(agent.angularVelocity) ? agent.angularVelocity / ANT_MAX_TURN_RATE : 0,
    -1,
    1
  );
  const headYaw = turnSignal * HEAD_YAW_MAX;
  const gasterYaw = -turnSignal * GASTER_YAW_MAX;

  // ----------------------------
  // LEGS
  // gait geometry 그대로 그림
  // ----------------------------
  p.stroke(70);
  p.strokeWeight(Math.max(0.55, r * 0.075));
  p.strokeCap(p.ROUND);
  p.strokeJoin(p.ROUND);
  p.noFill();

  for (const leg of legs) {
    if (!isPointLike(leg.root) || !isPointLike(leg.knee) || !isPointLike(leg.foot)) {
      continue;
    }

    p.line(
      leg.root.x * width,
      leg.root.y * height,
      leg.knee.x * width,
      leg.knee.y * height
    );

    p.line(
      leg.knee.x * width,
      leg.knee.y * height,
      leg.foot.x * width,
      leg.foot.y * height
    );
  }

  p.noStroke();
  p.fill(70);

  for (const leg of legs) {
    if (!isPointLike(leg.knee)) continue;
    p.circle(
      leg.knee.x * width,
      leg.knee.y * height,
      Math.max(0.7, r * 0.06)
    );
  }

  // ----------------------------
  // LOCAL BODY SPACE
  // 다리 좌표는 기존처럼 thorax heading을 기준으로 유지합니다.
  // ----------------------------
  p.push();
  p.translate(centerX, centerY);
  p.rotate(Number.isFinite(agent.heading) ? agent.heading : 0);

  // 몸통은 뒤에서 앞으로 그려 좁은 petiole이 두 부분을 이어 주게 합니다.
  // gaster
  drawGaster(p, r, gasterYaw);
  p.noStroke();
  p.fill(28);
  // petiole
  p.ellipse(-0.90 * r, 0, 0.28 * r, 0.22 * r); // petiole
  // thorax
  p.ellipse(0, 0, 1.05 * r, 0.70 * r); // thorax
  // head
  drawHead(p, r, headYaw);

  p.pop();
}

function drawGaster(p, r, yaw) {
  p.push();
  p.translate(-0.90 * r, 0); // petiole 연결점 근처를 축으로 반대 방향으로 살짝 늦춥니다.
  p.rotate(yaw);
  p.noStroke();
  p.fill(28);
  p.ellipse(-0.45 * r, 0, 1.60 * r, 1.02 * r);
  p.pop();
}

function drawHead(p, r, yaw) {
  p.push();
  p.translate(HEAD_PIVOT_X * r, 0); // thorax 앞쪽을 축으로 head와 antennae를 함께 움직입니다.
  p.rotate(yaw);
  p.stroke(85);
  p.strokeWeight(Math.max(0.35, r * 0.055));
  p.strokeCap(p.ROUND);
  p.noFill();

  // ----------------------------
  // ANTENNAE
  // 너무 ㄱ자처럼 과하게 말고,
  // 길게 뻗었다가 살짝 꺾이는 느낌
  // 얇은 두 분절을 head-local 좌표로 그려, 긴 형태는 유지하고 회전만 따라가게 합니다.
  // ----------------------------
  const rootX = (1.28 - HEAD_PIVOT_X) * r;
  const elbowX = (1.85 - HEAD_PIVOT_X) * r;
  const tipX = (2.45 - HEAD_PIVOT_X) * r;
  // left antenna
  p.line(rootX, -0.23 * r, elbowX, -0.42 * r);
  p.line(elbowX, -0.42 * r, tipX, -0.68 * r);
  // right antenna
  p.line(rootX, 0.23 * r, elbowX, 0.42 * r);
  p.line(elbowX, 0.42 * r, tipX, 0.68 * r);

  // ----------------------------
  // BODY
  // 몸통을 마지막에 그려서
  // 다리/더듬이 뿌리 부분을 자연스럽게 덮음
  // 여기서는 head가 마지막 body part라 antenna 뿌리를 덮습니다.
  // ----------------------------
  p.noStroke();
  p.fill(28);
  p.ellipse((1.09 - HEAD_PIVOT_X) * r, 0, 1.08 * r, 0.86 * r);
  p.pop();
}

function updateFieldImage(p, renderer, field) {
  const width = Math.floor(field.width), height = Math.floor(field.height);
  if (!renderer.fieldImage || renderer.fieldSize?.width !== width || renderer.fieldSize?.height !== height) {
    renderer.fieldImage = p.createImage(width, height);
    renderer.fieldSize = { width, height };
  }
  const image = renderer.fieldImage;
  image.loadPixels();
  const pixels = image.pixels;
  const values = field.values;
  const limit = Math.min(values.length, width * height);
  pixels.fill(0);
  for (let index = 0; index < limit; index++) {
    const opacity = pheromoneValueToAlpha(values[index]);
    const offset = index * 4;
    pixels[offset] = 0;
    pixels[offset + 1] = 0;
    pixels[offset + 2] = 0;
    pixels[offset + 3] = opacity;
  }
  image.updatePixels();
  return image;
}

/** Two-scale fixed mapping; it never normalizes contrast to the current field maximum. */
export function pheromoneValueToAlpha(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const base = smoothstep(0.004, 0.050, value);
  const route = smoothstep(0.040, 0.180, value);
  return Math.min(112, Math.round(base * BASE_TRACE_ALPHA + route * ESTABLISHED_ROUTE_ALPHA));
}

function smoothstep(min, max, value) {
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

function isPoint(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function positiveSize(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function positiveRatio(value) {
  return Number.isFinite(value) && value > 0 ? Math.min(2, value) : 1;
}

export default AntRenderer;
