import { spherePointFromNdc } from '../lib/renderers/sphereMath.js';
import { clamp } from '../lib/utils/state.js';

/** DOM adapter. Converts gestures to model positions; owns and removes its listeners. */
export class CanvasInteraction {
  constructor(canvas, { modelName, getState, onStrike, onPickup, onViewChange } = {}) {
    this.canvas = canvas;
    this.modelName = modelName;
    this.getState = getState;
    this.onStrike = onStrike;
    this.onPickup = onPickup;
    this.onViewChange = onViewChange;
    this.view = { yaw: .38, pitch: -.24 };
    this.mode = 'strike';
    this.pointer = null;
    this.lastStrike = -Infinity;
    this.disposers = [];
    this.listen('pointerdown', (event) => this.down(event));
    this.listen('pointermove', (event) => this.move(event));
    this.listen('pointerup', (event) => this.up(event));
    this.listen('pointercancel', () => { this.pointer = null; });
    this.listen('lostpointercapture', () => { this.pointer = null; });
    this.listen('keydown', (event) => this.key(event));
  }

  listen(type, handler) {
    this.canvas.addEventListener(type, handler);
    this.disposers.push(() => this.canvas?.removeEventListener(type, handler));
  }
  setMode(mode) { this.mode = mode; }
  getView() { return { ...this.view }; }

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (this.modelName === 'sphere') return spherePointFromNdc(x * 2 - 1, 1 - y * 2, { aspect: rect.width / rect.height, diameter: this.getState()?.physical.diameter, ...this.view });
    if (this.modelName === 'string') return clamp(x, 0, 1);
    const radius = Math.min(rect.width, rect.height) * .435;
    const point = { x: (x - .5) * rect.width / radius, y: (y - .5) * rect.height / radius };
    return Math.hypot(point.x, point.y) <= 1 ? point : null;
  }

  center() {
    if (this.modelName === 'sphere') return spherePointFromNdc(0, 0, { diameter: this.getState()?.physical.diameter, ...this.view });
    return this.modelName === 'plate' ? { x: 0, y: 0 } : .5;
  }
  apply(event, pickup = false) {
    const point = this.point(event);
    if (point !== null) (pickup ? this.onPickup : this.onStrike)?.(point);
  }
  down(event) {
    if (event.button !== 0 || this.pointer) return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture(event.pointerId);
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, pickup: this.mode === 'pickup' || event.shiftKey };
    if (this.pointer.pickup || this.modelName !== 'sphere') {
      this.apply(event, this.pointer.pickup);
      this.lastStrike = performance.now();
    }
  }
  move(event) {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.lastX, dy = event.clientY - pointer.lastY;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    pointer.moved ||= Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5;
    if (pointer.pickup) this.apply(event, true);
    else if (this.modelName === 'sphere' && pointer.moved) {
      this.view.yaw += dx * .008;
      this.view.pitch = clamp(this.view.pitch + dy * .008, -Math.PI / 2, Math.PI / 2);
      this.onViewChange?.(this.getView());
    } else if (this.modelName === 'plate' && performance.now() - this.lastStrike > 75) {
      this.apply(event);
      this.lastStrike = performance.now();
    }
  }
  up(event) {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (this.modelName === 'sphere' && !pointer.moved && !pointer.pickup) this.apply(event);
    this.pointer = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  }
  key(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault();
      this.onStrike?.(this.center());
    } else if (this.modelName === 'plate') {
      const keys = ['q', 'w', 'e', 'a', 's', 'd', 'z', 'x', 'c'];
      const index = keys.indexOf(event.key.toLowerCase());
      if (index >= 0) { event.preventDefault(); this.onStrike?.({ x: (index % 3 - 1) * .48, y: (Math.floor(index / 3) - 1) * .48 }); }
    }
  }
  destroy() {
    if (!this.canvas) return;
    if (this.pointer && this.canvas.hasPointerCapture(this.pointer.id)) this.canvas.releasePointerCapture(this.pointer.id);
    this.pointer = null;
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    this.canvas = null;
  }
}
