const BASE_STRIDE_CYCLE_LENGTH = 0.036;
const STRIDE_VARIATION = 0.08;
const BASE_CONTACT_STRENGTH = 0.035;
const CONTACT_STRENGTH_VARIATION = 0.04;
const MAX_CONTACT_GROUPS_PER_ADVANCE = 4;
const STANCE_FRACTION = 0.62;
const SWING_FRACTION = 1 - STANCE_FRACTION;
const HALF_CYCLE = 0.5;
const PHASE_EPSILON = 1e-12;

const LEGS = Object.freeze([
  Object.freeze({ id: 'FL', side: -1, segment: 0, tripod: 'A' }),
  Object.freeze({ id: 'FR', side: 1, segment: 0, tripod: 'B' }),
  Object.freeze({ id: 'ML', side: -1, segment: 1, tripod: 'B' }),
  Object.freeze({ id: 'MR', side: 1, segment: 1, tripod: 'A' }),
  Object.freeze({ id: 'RL', side: -1, segment: 2, tripod: 'A' }),
  Object.freeze({ id: 'RR', side: 1, segment: 2, tripod: 'B' })
]);

const TRIPOD_LEGS = Object.freeze({
  A: Object.freeze(['FL', 'MR', 'RL']),
  B: Object.freeze(['FR', 'ML', 'RR'])
});

/**
 * Distance-driven tripod gait and foot contacts, independent of behavior,
 * rendering frameworks, and audio. A single phase supplies both feet snapshots
 * and the alternating touchdown events sent to downstream systems.
 */
export class GaitController {
  constructor({
    baseStrideCycleLength = BASE_STRIDE_CYCLE_LENGTH,
    strideVariation = STRIDE_VARIATION,
    baseContactStrength = BASE_CONTACT_STRENGTH,
    contactStrengthVariation = CONTACT_STRENGTH_VARIATION,
    maxContactGroupsPerAdvance = MAX_CONTACT_GROUPS_PER_ADVANCE
  } = {}) {
    this.baseStrideCycleLength = positiveFinite(baseStrideCycleLength, BASE_STRIDE_CYCLE_LENGTH);
    this.strideVariation = clampFinite(strideVariation, 0, 0.25, STRIDE_VARIATION);
    this.baseContactStrength = positiveFinite(baseContactStrength, BASE_CONTACT_STRENGTH);
    this.contactStrengthVariation = clampFinite(contactStrengthVariation, 0, 0.25,
      CONTACT_STRENGTH_VARIATION);
    this.maxContactGroupsPerAdvance = Math.max(1, Math.floor(positiveFinite(maxContactGroupsPerAdvance,
      MAX_CONTACT_GROUPS_PER_ADVANCE)));
    this.ants = new Map();
  }

  advance(agent, travelledDistance, dtSeconds, simulationTimeMs, segment = null) {
    if (!agent || !validId(agent.id) || !validPoint(agent)
      || !Number.isFinite(travelledDistance) || travelledDistance < 0
      || !Number.isFinite(dtSeconds) || dtSeconds <= 0
      || !Number.isFinite(simulationTimeMs)) return [];

    const gait = this.getOrCreate(agent.id);
    if (travelledDistance === 0) return [];

    const phaseTravel = travelledDistance / gait.strideCycleLength;
    const finalPhase = gait.phase + phaseTravel;
    if (!Number.isFinite(phaseTravel) || !Number.isFinite(finalPhase)) return [];

    const firstBoundary = Math.floor((gait.phase + PHASE_EPSILON) / HALF_CYCLE) + 1;
    const finalBoundary = Math.floor((finalPhase + PHASE_EPSILON) / HALF_CYCLE);
    const crossingCount = Math.max(0, finalBoundary - firstBoundary + 1);
    const emitCount = Math.min(crossingCount, this.maxContactGroupsPerAdvance);
    const from = segment?.from && validPoint(segment.from) ? segment.from : agent;
    const to = segment?.to && validPoint(segment.to) ? segment.to : agent;
    const events = [];
    const startTimeMs = simulationTimeMs - dtSeconds * 1000;

    for (let crossing = 0; crossing < emitCount; crossing += 1) {
      const boundary = firstBoundary + crossing;
      const distanceFraction = clamp(((boundary * HALF_CYCLE) - gait.phase) / phaseTravel, 0, 1);
      const bodyAtTouchdown = {
        ...agent,
        x: from.x + (to.x - from.x) * distanceFraction,
        y: from.y + (to.y - from.y) * distanceFraction
      };
      const phaseAtTouchdown = positiveModulo(boundary * HALF_CYCLE, 1);
      const contactGroup = boundary % 2 === 0 ? 'A' : 'B';
      const legs = calculateLegGeometry(bodyAtTouchdown, phaseAtTouchdown);
      const allowedLegs = new Set(TRIPOD_LEGS[contactGroup]);
      const contacts = legs
        .filter((leg) => allowedLegs.has(leg.id) && isInDomain(leg.foot))
        .map((leg) => ({ legId: leg.id, position: { x: leg.foot.x, y: leg.foot.y } }));
      if (!contacts.length) continue;

      const position = contacts.reduce((sum, contact) => ({
        x: sum.x + contact.position.x / contacts.length,
        y: sum.y + contact.position.y / contacts.length
      }), { x: 0, y: 0 });
      events.push({
        type: 'FOOT_CONTACT',
        antId: agent.id,
        contactGroup,
        contacts,
        position,
        strength: gait.contactStrength,
        simulationTimeMs: startTimeMs + dtSeconds * 1000 * distanceFraction
      });
    }

    // Discard any excess events now, but keep the gait at the correct phase.
    gait.phase = positiveModulo(finalPhase, 1);
    return events;
  }

  getSnapshot(agent) {
    if (!agent || !validId(agent.id) || !validPoint(agent)) return null;
    const gait = this.getOrCreate(agent.id);
    return {
      phase: gait.phase,
      strideCycleLength: gait.strideCycleLength,
      legs: calculateLegGeometry(agent, gait.phase)
    };
  }

  retain(ids) {
    const keep = ids instanceof Set ? ids : new Set(ids || []);
    for (const id of this.ants.keys()) if (!keep.has(id)) this.ants.delete(id);
  }

  reset() { this.ants.clear(); }

  getOrCreate(id) {
    let gait = this.ants.get(id);
    if (gait) return gait;
    const hash = hashId(id);
    const strideUnit = hashUnit(hash ^ 0x9e3779b9);
    const phaseUnit = hashUnit(hash ^ 0x85ebca6b);
    const strengthUnit = hashUnit(hash ^ 0xc2b2ae35);
    gait = {
      strideCycleLength: this.baseStrideCycleLength * (1 + (strideUnit * 2 - 1) * this.strideVariation),
      phase: phaseUnit,
      contactStrength: this.baseContactStrength
        * (1 + (strengthUnit * 2 - 1) * this.contactStrengthVariation)
    };
    this.ants.set(id, gait);
    return gait;
  }
}

/** Return six snapshot leg paths from the same gait phase used by contact generation. */
function calculateLegGeometry(agent, phase) {
  const radius =
    Number.isFinite(agent.radius) && agent.radius > 0
      ? agent.radius
      : 0.006;

  const heading =
    Number.isFinite(agent.heading)
      ? agent.heading
      : 0;

  const forward = {
    x: Math.cos(heading),
    y: Math.sin(heading)
  };

  const lateral = {
    x: -forward.y,
    y: forward.x
  };

  // 앞 / 중간 / 뒤 다리의 몸통 부착 위치
  const rootOffsets = [0.45, 0.0, -0.45];

  // 앞 / 중간 / 뒤 다리의 기본 앞뒤 foot 위치
  const footOffsets = [1.95, 0.0, -2.00];
  const lateralReaches = [3.05, 3.10, 3.25];

  // 보행 중 앞뒤 왕복량
  const foreAftAmplitude = 0.52;

  // knee가 root→foot 선분 상에서 놓일 비율
  // 앞다리는 조금 root 쪽, 뒷다리는 조금 foot 쪽
  const kneeAlong = [0.42, 0.50, 0.58];

  // knee를 바깥으로 얼마나 밀지
  const kneeOutwardBySegment = [0.44, 0.48, 0.48];

  // 앞다리는 약간 앞으로, 뒷다리는 약간 뒤로 bias
  const kneeForeAftBias = [0.10, 0.0, -0.10];

  return LEGS.map(({ id, side, segment, tripod }) => {
    const legPhase = positiveModulo(
      phase + (tripod === 'B' ? HALF_CYCLE : 0),
      1
    );

    const stance = legPhase < STANCE_FRACTION;

    let foreAftOffset;
    let lateralReach = lateralReaches[segment];

    if (stance) {
      // stance: 발이 몸 기준 앞 -> 뒤로 이동
      foreAftOffset =
        foreAftAmplitude *
        (1 - 2 * (legPhase / STANCE_FRACTION));
    } else {
      // swing: 발이 뒤 -> 앞으로 복귀
      const swingPhase =
        (legPhase - STANCE_FRACTION) / SWING_FRACTION;

      const eased =
        swingPhase * swingPhase * (3 - 2 * swingPhase);

      foreAftOffset =
        -foreAftAmplitude +
        foreAftAmplitude * 2 * eased;

      // swing 때 살짝 접힘
      lateralReach *=
        1 - 0.10 * Math.sin(Math.PI * swingPhase);
    }

    const root = localPoint(
      agent,
      forward,
      lateral,
      rootOffsets[segment] * radius,
      side * 0.42 * radius
    );

    const foot = localPoint(
      agent,
      forward,
      lateral,
      footOffsets[segment] * radius +
      foreAftOffset * radius,
      side * lateralReach * radius
    );

    const dx = foot.x - root.x;
    const dy = foot.y - root.y;

    const along = kneeAlong[segment];
    const outward = kneeOutwardBySegment[segment] * radius;
    const foreAftBias = kneeForeAftBias[segment] * radius;

    const knee = {
      x:
        root.x +
        dx * along +
        lateral.x * side * outward +
        forward.x * foreAftBias,

      y:
        root.y +
        dy * along +
        lateral.y * side * outward +
        forward.y * foreAftBias
    };

    return {
      id,
      tripod,
      stance,
      root,
      knee,
      foot
    };
  });
}

function localPoint(agent, forward, lateral, along, across) {
  return {
    x: agent.x + forward.x * along + lateral.x * across,
    y: agent.y + forward.y * along + lateral.y * across
  };
}

function hashId(id) {
  const text = String(id);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashUnit(value) {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

function validId(id) { return (typeof id === 'number' && Number.isFinite(id)) || (typeof id === 'string' && id.length > 0); }
function validPoint(point) { return Number.isFinite(point?.x) && Number.isFinite(point?.y); }
function isInDomain(point) { return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1; }
function positiveModulo(value, divisor = 1) { return ((value % divisor) + divisor) % divisor; }
function positiveFinite(value, fallback) { return Number.isFinite(value) && value > 0 ? value : fallback; }
function clampFinite(value, min, max, fallback) { return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

export default GaitController;
