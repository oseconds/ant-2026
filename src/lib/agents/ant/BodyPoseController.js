import { ANT_MAX_TURN_RATE } from './AntAgent.js';

export const BODY_GEOMETRY = Object.freeze({
  radiusScale: 2,
  headPivotX: 0.54,
  gasterPivotX: -0.90,
  gasterCenterX: -0.45,
  gasterHalfLength: 0.80
});

export const BODY_POSE_LIMITS = Object.freeze({
  headYaw: 0.12, gasterYaw: 0.08,
  turnSeconds: 0.30, headSeconds: 0.12, gasterSeconds: 0.45,
  antennaSeconds: 0.40, turnDeadZone: 0.04
});

/** Read-only body kinematics: never supplies movement, sensing, gait or contact inputs. */
export class BodyPoseController {
  constructor() { this.ants = new Map(); }

  advance(agent, dtSeconds, localTrail = null) {
    if (!validAgent(agent) || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    const pose = this.getOrCreate(agent.id);
    const raw = clamp((Number.isFinite(agent.angularVelocity) ? agent.angularVelocity : 0)
      / ANT_MAX_TURN_RATE, -1, 1);
    const turn = Math.sign(raw) * Math.max(0, Math.abs(raw) - BODY_POSE_LIMITS.turnDeadZone)
      / (1 - BODY_POSE_LIMITS.turnDeadZone);
    pose.turnSignal = relax(pose.turnSignal, turn, dtSeconds, BODY_POSE_LIMITS.turnSeconds);
    pose.headYaw = relax(pose.headYaw, pose.turnSignal * BODY_POSE_LIMITS.headYaw,
      dtSeconds, BODY_POSE_LIMITS.headSeconds);
    pose.gasterYaw = relax(pose.gasterYaw, -pose.turnSignal * BODY_POSE_LIMITS.gasterYaw,
      dtSeconds, BODY_POSE_LIMITS.gasterSeconds);

    // These are the already-computed local bands, never samples at antenna tips.
    const left = positive(localTrail?.left), right = positive(localTrail?.right);
    const leftSignal = left / (left + 0.018), rightSignal = right / (right + 0.018);
    const difference = leftSignal - rightSignal;
    const bias = Math.sign(difference) * Math.max(0, Math.abs(difference) - 0.04) / 0.96;
    const bilateral = Math.min(leftSignal, rightSignal) * 0.35;
    pose.antennae.left = relax(pose.antennae.left, clamp(bilateral + Math.max(0, bias) * 0.65, 0, 1),
      dtSeconds, BODY_POSE_LIMITS.antennaSeconds);
    pose.antennae.right = relax(pose.antennae.right, clamp(bilateral + Math.max(0, -bias) * 0.65, 0, 1),
      dtSeconds, BODY_POSE_LIMITS.antennaSeconds);
  }

  getSnapshot(agent) {
    if (!validAgent(agent)) return null;
    const pose = this.getOrCreate(agent.id);
    return {
      turnSignal: pose.turnSignal,
      headYaw: pose.headYaw,
      gasterYaw: pose.gasterYaw,
      antennae: { ...pose.antennae },
      gasterRear: gasterRearPoint(agent, pose.gasterYaw)
    };
  }

  getOrCreate(id) {
    if (!this.ants.has(id)) this.ants.set(id, {
      turnSignal: 0, headYaw: 0, gasterYaw: 0, antennae: { left: 0, right: 0 }
    });
    return this.ants.get(id);
  }

  retain(ids) {
    const keep = new Set(ids || []);
    for (const id of this.ants.keys()) if (!keep.has(id)) this.ants.delete(id);
  }

  reset() { this.ants.clear(); }
}

/** Same petiole pivot and ellipse rear tip used to draw the gaster. No domain clamp. */
export function gasterRearPoint(agent, gasterYaw = 0) {
  const radius = Number.isFinite(agent.radius) && agent.radius > 0 ? agent.radius : 0.006;
  const r = radius * BODY_GEOMETRY.radiusScale;
  const heading = Number.isFinite(agent.heading) ? agent.heading : 0;
  const localTip = BODY_GEOMETRY.gasterCenterX - BODY_GEOMETRY.gasterHalfLength;
  const x = (BODY_GEOMETRY.gasterPivotX + Math.cos(gasterYaw) * localTip) * r;
  const y = Math.sin(gasterYaw) * localTip * r;
  return { x: agent.x + Math.cos(heading) * x - Math.sin(heading) * y,
    y: agent.y + Math.sin(heading) * x + Math.cos(heading) * y };
}

function relax(value, target, dt, seconds) { return value + (target - value) * -Math.expm1(-dt / seconds); }
function positive(value) { return Number.isFinite(value) && value > 0 ? value : 0; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function validAgent(agent) {
  return agent && (typeof agent.id === 'string' || Number.isFinite(agent.id))
    && Number.isFinite(agent.x) && Number.isFinite(agent.y);
}
