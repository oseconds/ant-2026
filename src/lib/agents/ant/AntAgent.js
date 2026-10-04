const TAU = Math.PI * 2;

/** Equal, stateful ant agent. It knows neither its neighbors nor how it is drawn. */
export class AntAgent {
  constructor({ id, x, y, heading, random = Math.random, radius = 0.006 } = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.heading = finite(heading) ? heading : random() * TAU;
    this.angularVelocity = 0;
    this.radius = radius;
    this.personality = Object.freeze({
      preferredSpeed: between(random, 0.065, 0.13),
      pheromoneSensitivity: between(random, 1.1, 2.1),
      exploration: between(random, 0.12, 0.34),
      turnResponsiveness: between(random, 2.0, 4.2),
      acceleration: between(random, 0.12, 0.24),
      damping: between(random, 1.0, 2.0),
      personalSpacing: between(random, 0.019, 0.029)
    });
    this.targetSpeed = this.personality.preferredSpeed;
    this.speedPhase = random() * TAU;
    this.speedCycle = between(random, 1.5, 3.2);
    this.hesitationRemaining = between(random, 0, 0.8);
    this.inspectionRemaining = between(random, 0, 1.4);
    this.decisionRemaining = between(random, 0, 0.25);
    this.intentHeading = this.heading;
    this.trailConfidence = 0;
    this.trailAdherence = 0;
    this.committedRemaining = 0;
  }

  /** Keep directional intent smooth while allowing deliberate, slow changes. */
  turnToward(targetHeading, dtSeconds) {
    const error = angleDelta(this.heading, targetHeading);
    this.angularVelocity += clamp(error * this.personality.turnResponsiveness - this.angularVelocity * 1.35,
      -5, 5) * dtSeconds;
    this.angularVelocity = clamp(this.angularVelocity, -2.2, 2.2);
    this.heading = wrapAngle(this.heading + this.angularVelocity * dtSeconds);
  }

  accelerateToward(speed, dtSeconds) {
    const desiredX = Math.cos(this.heading) * speed;
    const desiredY = Math.sin(this.heading) * speed;
    const acceleration = this.personality.acceleration;
    const damping = this.personality.damping;
    let ax = (desiredX - this.vx) * 2 - this.vx * damping * 0.15;
    let ay = (desiredY - this.vy) * 2 - this.vy * damping * 0.15;
    const accelerationMagnitude = Math.hypot(ax, ay);
    if (accelerationMagnitude > acceleration) {
      ax *= acceleration / accelerationMagnitude;
      ay *= acceleration / accelerationMagnitude;
    }
    this.vx += ax * dtSeconds;
    this.vy += ay * dtSeconds;
    const maxSpeed = this.personality.preferredSpeed * 1.35;
    const currentSpeed = Math.hypot(this.vx, this.vy);
    if (currentSpeed > maxSpeed) {
      this.vx *= maxSpeed / currentSpeed;
      this.vy *= maxSpeed / currentSpeed;
    }
  }

  getSnapshot() {
    return {
      id: this.id, x: this.x, y: this.y, vx: this.vx, vy: this.vy,
      heading: this.heading, radius: this.radius,
      trailAdherence: this.trailAdherence,
      personality: { ...this.personality }
    };
  }
}

function between(random, min, max) { return min + random() * (max - min); }
function finite(value) { return Number.isFinite(value); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function wrapAngle(value) { return ((value + Math.PI) % TAU + TAU) % TAU - Math.PI; }
function angleDelta(from, to) { return wrapAngle(to - from); }
