const CONTACT_TOLERANCE = 1e-10;
const MAX_CONTACT_PASSES = 24;
const CONTACT_SEARCH_ITERATIONS = 24;
// Earlier braking keeps a strong trail from carrying approaching bodies all
// the way into the emergency contact guard.
const BRAKING_HORIZON_SECONDS = 2.1;

/** Local body interaction, kept separate from the shared pheromone memory. */
export class LocalOccupancy {
  constructor({ senseRadius = 0.085, closeRange = 0.022 } = {}) {
    this.senseRadius = senseRadius;
    this.closeRange = closeRange;
  }

  sense(agent, agents) {
    let separationX = 0;
    let separationY = 0;
    let frontCrowding = 0;
    let predictedFrontCrowding = 0;
    let leftCrowding = 0;
    let rightCrowding = 0;
    let neighbors = 0;
    const hx = Math.cos(agent.heading);
    const hy = Math.sin(agent.heading);

    for (const other of agents) {
      if (other === agent) continue;
      const dx = other.x - agent.x;
      const dy = other.y - agent.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1e-9 || distance >= this.senseRadius) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const ahead = nx * hx + ny * hy;
      const frontWeight = ahead > 0 ? 0.35 + 0.65 * ahead * ahead : 0.16;
      const proximity = smoothFalloff(distance / this.senseRadius);
      neighbors += 1;

      // Close neighbors push strongly away; rear neighbors remain perceptible but mild.
      const close = smoothFalloff(distance / this.closeRange);
      const force = proximity * frontWeight + close * (0.5 + 1.8 * Math.max(0, ahead));
      separationX -= nx * force;
      separationY -= ny * force;

      if (ahead > 0.18) {
        frontCrowding += Math.exp(-distance / Math.max(agent.personality.personalSpacing, 0.001))
          * ahead * ahead;
        // Brake before contact using relative approach; a neighbor beside
        // the agent has much less influence on its forward speed.
        const closingSpeed = ((agent.vx ?? 0) - (other.vx ?? 0)) * nx
          + ((agent.vy ?? 0) - (other.vy ?? 0)) * ny;
        if (closingSpeed > 0) {
          const clearance = Math.max(0, distance - agent.radius - other.radius);
          const urgency = clamp(1 - clearance / closingSpeed / BRAKING_HORIZON_SECONDS, 0, 1);
          const lateral = Math.abs(dx * hy - dy * hx);
          const corridorWidth = agent.radius + other.radius + agent.personality.personalSpacing * 0.3;
          const alignment = Math.exp(-lateral * lateral / (2 * corridorWidth * corridorWidth));
          predictedFrontCrowding = Math.max(predictedFrontCrowding, urgency * ahead * ahead * alignment);
        }
      }
      leftCrowding += directionalOccupancy(agent, other, agent.heading - 0.56);
      rightCrowding += directionalOccupancy(agent, other, agent.heading + 0.56);
    }

    const magnitude = Math.hypot(separationX, separationY);
    if (magnitude > 2.8) {
      separationX *= 2.8 / magnitude;
      separationY *= 2.8 / magnitude;
    }
    return {
      separationX, separationY,
      frontCrowding: Math.min(1, Math.max(frontCrowding, predictedFrontCrowding)),
      leftCrowding: Math.min(1, leftCrowding),
      rightCrowding: Math.min(1, rightCrowding),
      neighbors
    };
  }

  /** Occupancy projected ahead along a candidate heading. */
  crowdingInDirection(agent, agents, heading, lookahead = 0.048) {
    const dx = Math.cos(heading);
    const dy = Math.sin(heading);
    let crowding = 0;
    for (const other of agents) {
      if (other === agent) continue;
      const rx = other.x - agent.x;
      const ry = other.y - agent.y;
      const along = rx * dx + ry * dy;
      if (along <= 0 || along >= lookahead) continue;
      const lateral = Math.abs(rx * dy - ry * dx);
      const width = agent.personality.personalSpacing * 0.9 + other.radius;
      if (lateral >= width * 3) continue;
      const alongWeight = Math.exp(-along / Math.max(0.008, lookahead * 0.48));
      const sideWeight = Math.exp(-(lateral * lateral) / (2 * width * width));
      crowding += alongWeight * sideWeight;
    }
    return Math.min(1, crowding);
  }

  /**
   * Swept soft contact guard. It scales only a colliding pair's proposed
   * displacement, preserving path direction and preventing pass-through.
   * Earlier sensing and deceleration normally resolve encounters before this
   * guard has to act.
   */
  constrainDisplacements(agents, displacements) {
    const scales = new Float64Array(agents.length).fill(1);
    for (let pass = 0; pass < MAX_CONTACT_PASSES; pass += 1) {
      let changed = false;
      for (let i = 0; i < agents.length; i += 1) {
        for (let j = i + 1; j < agents.length; j += 1) {
          const a = agents[i], b = agents[j];
          const rx = b.x - a.x, ry = b.y - a.y;
          const initialDistance = Math.hypot(rx, ry);
          const minimumDistance = Math.min(initialDistance, a.radius + b.radius);
          if (minimumDistance <= 0) continue;
          const ad = displacements[i], bd = displacements[j];
          const currentScaleA = scales[i], currentScaleB = scales[j];
          const relativeX = bd.x * currentScaleB - ad.x * currentScaleA;
          const relativeY = bd.y * currentScaleB - ad.y * currentScaleA;
          const closestT = clamp(-(rx * relativeX + ry * relativeY)
            / (relativeX * relativeX + relativeY * relativeY || 1), 0, 1);
          const closest = Math.hypot(rx + relativeX * closestT, ry + relativeY * closestT);
          const safeDistance = minimumDistance - CONTACT_TOLERANCE;
          if (closest >= safeDistance) continue;

          let low = 0, high = 1;
          for (let iteration = 0; iteration < CONTACT_SEARCH_ITERATIONS; iteration += 1) {
            const mid = (low + high) * 0.5;
            const scaledX = relativeX * mid, scaledY = relativeY * mid;
            const t = clamp(-(rx * scaledX + ry * scaledY)
              / (scaledX * scaledX + scaledY * scaledY || 1), 0, 1);
            if (Math.hypot(rx + scaledX * t, ry + scaledY * t) >= safeDistance) low = mid;
            else high = mid;
          }
          scales[i] *= low;
          scales[j] *= low;
          changed = true;
        }
      }
      if (!changed) break;
    }
    return scales;
  }
}

function directionalOccupancy(agent, other, heading) {
  const dx = Math.cos(heading), dy = Math.sin(heading);
  const rx = other.x - agent.x, ry = other.y - agent.y;
  const along = rx * dx + ry * dy;
  const lateral = Math.abs(rx * dy - ry * dx);
  if (along <= 0 || along >= 0.055 || lateral >= 0.035) return 0;
  return Math.exp(-along / 0.025) * Math.exp(-(lateral * lateral) / 0.0002) * 0.24;
}

function smoothFalloff(value) {
  const t = clamp(value, 0, 1);
  return (1 - t) * (1 - t);
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
