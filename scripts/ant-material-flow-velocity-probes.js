import assert from 'node:assert/strict';
import { AntAgent } from '../src/lib/agents/ant/AntAgent.js';
import { LocalOccupancy } from '../src/lib/agents/ant/LocalOccupancy.js';
import { materialLocomotionMultiplier } from '../src/lib/agents/ant/AntController.js';

const LAYER_SCALE = 4;
const DECELERATED_RANGE = 0.50;
const HEADWAY_SECONDS = 0.4;
const FOLLOWING_RESPONSE_SECONDS = 0.9;

export const FLOW_VELOCITY_LAWS = Object.freeze({
  following: 'comfortable headway = radius sum + max(0.6*personalSpacing, speed*0.4*(1+0.5*(1-exp(-L/4)))); same-flow classification, response time, separation and swept guard unchanged',
  velocity: 'accelerateToward(speed, dt*q(L)); q(L)=1-0.50*(1-exp(-L/4)); desired speed, heading, actual movement dt and swept guard unchanged'
});

const materialHeadway = layers => HEADWAY_SECONDS * (1 + DECELERATED_RANGE * (1 - Math.exp(-layers / LAYER_SCALE)));
const velocityFactor = layers => 1 - DECELERATED_RANGE * (1 - Math.exp(-layers / LAYER_SCALE));
const nativeTarget = (agent, info, followingLimit, layers, resistanceEnabled) => {
  let speed = agent.personality.preferredSpeed * (0.58 + 0.34 * (Math.sin(agent.speedPhase) + 1) * 0.5);
  speed *= (1 - info.frontCrowding) ** 2;
  speed *= 1 - Math.min(0.45, Math.hypot(info.separationX, info.separationY) * 0.1);
  speed = Math.min(speed, followingLimit);
  if (agent.hesitationRemaining > 0) speed *= 0.05;
  if (resistanceEnabled) speed *= materialLocomotionMultiplier(layers);
  return speed;
};

/** Research-only wrapper; `layersByAnt` is copied at tick entry. */
export function attachFlowVelocity(controller, { kind, enabled = false, layersByAnt = new Map(), onSample = null } = {}) {
  if (!['following', 'velocity'].includes(kind)) throw new TypeError('kind must be following or velocity');
  if (!(layersByAnt instanceof Map)) throw new TypeError('layersByAnt must be a Map');
  if (onSample !== null && typeof onSample !== 'function') throw new TypeError('onSample must be a function or null');
  const nativeTick = controller.tick, tick = nativeTick.bind(controller), records = new Map();
  const originalSense = kind === 'following' ? controller.occupancy?.sense : null;
  const wrappedSense = originalSense && function (agent, agents, ...args) {
    const result = originalSense.call(this, agent, agents, ...args);
    const layers = entryLayers.get(agent) || 0;
    const speed = Math.hypot(agent.vx ?? 0, agent.vy ?? 0);
    const spacingTerm = agent.personality.personalSpacing * 0.6;
    const nativeComfort = Math.max(spacingTerm, speed * HEADWAY_SECONDS);
    const candidateComfort = Math.max(spacingTerm, speed * materialHeadway(layers));
    const row = { kind, antId: agent.id, layers, eligible: Number.isFinite(result.followingSpeedLimit),
      nativeFollowingSpeedLimit: result.followingSpeedLimit,
      candidateFollowingSpeedLimit: Number.isFinite(result.followingSpeedLimit)
        ? Math.max(0, result.followingSpeedLimit - (candidateComfort - nativeComfort) / FOLLOWING_RESPONSE_SECONDS)
        : result.followingSpeedLimit,
      nativeHeadwayTerm: nativeComfort, candidateHeadwayTerm: candidateComfort,
      changed: Number.isFinite(result.followingSpeedLimit) && candidateComfort !== nativeComfort,
      info: { ...result }, speedPhase: agent.speedPhase, hesitationRemaining: agent.hesitationRemaining,
      personality: agent.personality, resistanceEnabled: controller.materialLocomotionResistance === true };
    senseRows.set(agent, row);
    if (enabled && row.eligible) result.followingSpeedLimit = row.candidateFollowingSpeedLimit;
    onSample?.(row);
    return result;
  };
  let entryLayers = new Map(), senseRows = new Map();
  const prepareTick = () => {
    entryLayers = new Map(layersByAnt);
    senseRows = new Map();
    const live = new Set(controller.agents || []);
    for (const [agent, record] of records) if (!live.has(agent)) {
      if (agent.accelerateToward === record.wrapper) agent.accelerateToward = record.original;
      records.delete(agent);
    }
    if (kind === 'following' && originalSense) controller.occupancy.sense = wrappedSense;
    for (const agent of live) if (!records.has(agent)) {
      const original = agent.accelerateToward;
      const wrapper = function (speed, dtSeconds) {
        if (kind === 'following') {
          const sensed = senseRows.get(agent);
          if (sensed) {
            // Intention updates hesitation before this native motor call.
            const agentState = agent;
            const native = nativeTarget(agentState, sensed.info, sensed.nativeFollowingSpeedLimit,
              sensed.layers, sensed.resistanceEnabled);
            const prospective = nativeTarget(agentState, sensed.info, sensed.candidateFollowingSpeedLimit,
              sensed.layers, sensed.resistanceEnabled);
            const unbounded = nativeTarget(agentState, sensed.info, Infinity, sensed.layers, sensed.resistanceEnabled);
            onSample?.({ kind, stage: 'final-target', antId: agent.id, layers: sensed.layers, eligible: sensed.eligible,
              nativeFollowingSpeedLimit: sensed.nativeFollowingSpeedLimit,
              candidateFollowingSpeedLimit: sensed.candidateFollowingSpeedLimit, actualFinalTargetSpeed: speed,
              nativeDesiredSpeed: native, prospectiveDesiredSpeed: prospective,
              prospectiveDesiredSpeedDelta: prospective - native,
              nativeCapBinds: native < unbounded - 1e-12,
              candidateCapBinds: prospective < unbounded - 1e-12,
              actualMatchesNative: Math.abs(speed - native) <= 1e-12,
              actualMatchesProspective: Math.abs(speed - prospective) <= 1e-12,
              changed: Math.abs(prospective - native) > 1e-12 });
          }
          return original.call(this, speed, dtSeconds);
        }
        const layers = entryLayers.get(agent) || 0, factor = velocityFactor(layers);
        const preSpeed = Math.hypot(this.vx, this.vy);
        const nativeCopy = { ...this }, candidateCopy = { ...this };
        original.call(nativeCopy, speed, dtSeconds);
        original.call(candidateCopy, speed, dtSeconds * factor);
        const nativeVx = nativeCopy.vx, nativeVy = nativeCopy.vy;
        const prospectiveVx = candidateCopy.vx, prospectiveVy = candidateCopy.vy;
        const actualFactor = enabled ? factor : 1;
        original.call(this, speed, dtSeconds * actualFactor);
        onSample?.({ kind, antId: agent.id, layers, eligible: true, factor, dtSeconds,
          desiredSpeed: speed, preSpeed, response: speed < preSpeed ? 'braking' : 'accelerating',
          nativeVx, nativeVy, prospectiveVx, prospectiveVy, prospectiveDeltaV: Math.hypot(nativeVx - prospectiveVx, nativeVy - prospectiveVy),
          actualFactor, actualVx: this.vx, actualVy: this.vy,
          nativeSpeed: Math.hypot(nativeVx, nativeVy), prospectiveSpeed: Math.hypot(prospectiveVx, prospectiveVy),
          actualSpeed: Math.hypot(this.vx, this.vy), changed: Math.hypot(nativeVx - prospectiveVx, nativeVy - prospectiveVy) > 1e-12 });
      };
      records.set(agent, { wrapper, original });
      agent.accelerateToward = wrapper;
    }
  };
  const wrappedTick = (...args) => {
    prepareTick();
    return tick(...args);
  };
  controller.tick = wrappedTick;
  return { prepareTick, finish() {
    for (const [agent, record] of records) if (agent.accelerateToward === record.wrapper) agent.accelerateToward = record.original;
    records.clear(); entryLayers.clear(); senseRows.clear();
    if (kind === 'following' && controller.occupancy?.sense === wrappedSense) controller.occupancy.sense = originalSense;
    if (controller.tick === wrappedTick) controller.tick = nativeTick;
  } };
}

export function selfTest() {
  assert.equal(velocityFactor(0), 1);
  assert.equal(materialHeadway(0), HEADWAY_SECONDS);
  assert(velocityFactor(100) >= 0.5 && velocityFactor(100) <= 1);
  assert(materialHeadway(100) > materialHeadway(0));
  const events = [], ant = { id: 'a', vx: 0, vy: 0, heading: 0,
    personality: { preferredSpeed: 1, acceleration: 0.12, damping: 1, personalSpacing: 0.02 },
    accelerateToward(speed, dt) { this.vx += (speed - this.vx) * (1 - Math.exp(-32 * dt)); } };
  const controller = { agents: [ant], tick() {
    ant.accelerateToward(ant.vx === 0 ? 0.1 : 0.02, 1 / 60);
  } };
  const original = ant.accelerateToward;
  const hook = attachFlowVelocity(controller, { kind: 'velocity', enabled: false,
    layersByAnt: new Map([[ant, 8]]), onSample: row => events.push(row) });
  controller.tick(); ant.vx = 0.15; controller.tick(); hook.finish();
  assert.equal(ant.accelerateToward, original);
  assert.equal(events.length, 2);
  assert.equal(events[0].factor, velocityFactor(8));
  assert.equal(events[0].actualFactor, 1);
  assert.equal(events[0].actualVx, events[0].nativeVx);
  assert(events[0].prospectiveDeltaV > 0);
  assert.equal(events[0].response, 'accelerating');
  assert.equal(events[1].actualVx, events[1].nativeVx);
  assert(events[1].prospectiveDeltaV > 0);
  assert.equal(events[1].response, 'braking');
  return { lawBounds: true, nativeDisabledExact: true, prospectiveMotorShadow: true,
    accelerationAndBrakingClassified: true, wrapperRestored: true };
}

export function runProbe() {
  const layers = [0, 1, 4, 8, 100];
  const motor = (dt, material) => {
    const ant = new AntAgent({ id: 'motor', x: 0.5, y: 0.5, heading: 0, random: () => 0.5 });
    const segments = [
      { name: 'step', ticks: Math.round(0.5 / dt), heading: 0, speed: 0.08 },
      { name: 'brake', ticks: Math.round(0.25 / dt), heading: 0, speed: 0.02 },
      { name: 'reversal', ticks: Math.round(0.5 / dt), heading: Math.PI, speed: 0.08 }
    ];
    const out = [];
    for (const segment of segments) {
      for (let i = 0; i < segment.ticks; i += 1) {
        const L = material ? (i < segment.ticks / 2 ? 0 : 4) : 0;
        ant.turnToward(segment.heading, dt);
        ant.accelerateToward(segment.speed, dt * velocityFactor(L));
      }
      out.push({ segment: segment.name, dt, layersTransition: material ? '0->4 halfway through segment' : '0',
        speed: Math.hypot(ant.vx, ant.vy), vx: ant.vx, vy: ant.vy, heading: ant.heading });
    }
    return out;
  };
  const follower = new AntAgent({ id: 'follower', x: 0.3, y: 0.5, heading: 0, random: () => 0.5 });
  const leader = new AntAgent({ id: 'leader', x: 0.35, y: 0.5, heading: 0, random: () => 0.5 });
  follower.vx = leader.vx = 0.04;
  const occupancy = new LocalOccupancy();
  const followingRows = [];
  const followingController = { agents: [follower, leader], occupancy, tick() { occupancy.sense(follower, this.agents); } };
  const followingHook = attachFlowVelocity(followingController, { kind: 'following', enabled: true,
    layersByAnt: new Map([[follower, 4]]), onSample: row => followingRows.push(row) });
  followingController.tick(); followingHook.finish();
  const finalTargetGate = [false, true].map(enabled => {
    const [a, b] = [0, 1].map(i => new AntAgent({ id: `target-${enabled}-${i}`, x: 0.3 + i * 0.05,
      y: 0.5, heading: 0, random: () => 0.5 }));
    a.vx = b.vx = 0.04;
    const occupancy = new LocalOccupancy(), samples = [];
    const c = { agents: [a, b], occupancy, materialLocomotionResistance: false, tick() {
      const info = this.occupancy.sense(a, this.agents);
      let target = a.personality.preferredSpeed * (0.58 + 0.34 * (Math.sin(a.speedPhase) + 1) * 0.5);
      target *= (1 - info.frontCrowding) ** 2;
      target *= 1 - Math.min(0.45, Math.hypot(info.separationX, info.separationY) * 0.1);
      target = Math.min(target, info.followingSpeedLimit);
      if (a.hesitationRemaining > 0) target *= 0.05;
      a.targetSpeed = target; a.accelerateToward(target, 1 / 60);
    } };
    const hook = attachFlowVelocity(c, { kind: 'following', enabled, layersByAnt: new Map([[a, 4]]),
      onSample: row => samples.push(row) });
    c.tick(); hook.finish();
    return samples.find(row => row.stage === 'final-target');
  });
  const scenarios = {
    sameFlow: [{ x: 0.5, vx: 0.04, heading: 0 }, { x: 0.55, vx: 0.04, heading: 0 }],
    opposing: [{ x: 0.5, vx: 0.04, heading: 0 }, { x: 0.55, vx: -0.04, heading: Math.PI }],
    stoppedAhead: [{ x: 0.5, vx: 0.04, heading: 0 }, { x: 0.55, vx: 0, heading: 0 }],
    emergencyClose: [{ x: 0.5, vx: 0.04, heading: 0 }, { x: 0.518, vx: 0.01, heading: 0 }]
  };
  const flowClassifications = Object.entries(scenarios).map(([name, [a, b]]) => {
    const makePair = () => [a, b].map((v, i) => {
      const ant = new AntAgent({ id: `${name}-${i}`, x: v.x, y: 0.5, heading: v.heading, random: () => 0.5 });
      ant.vx = v.vx; return ant;
    });
    const baselinePair = makePair(), baseline = new LocalOccupancy().sense(baselinePair[0], baselinePair);
    const candidatePair = makePair(), [candidateFollower, candidateLeader] = candidatePair;
    const candidateOccupancy = new LocalOccupancy(), sensed = [];
    const c = { agents: [candidateFollower, candidateLeader], occupancy: candidateOccupancy,
      tick() { this.last = this.occupancy.sense(candidateFollower, this.agents); } };
    const h = attachFlowVelocity(c, { kind: 'following', enabled: true,
      layersByAnt: new Map([[candidateFollower, 4]]), onSample: row => sensed.push(row) });
    c.tick(); h.finish();
    const displacements = [{ x: 0.02, y: 0 }, { x: -0.01, y: 0 }];
    const guardBefore = new LocalOccupancy().constrainDisplacements(baselinePair, displacements);
    const guardAfter = candidateOccupancy.constrainDisplacements(candidatePair, displacements);
    return { name, nativeEligible: Number.isFinite(baseline.followingSpeedLimit), candidateEligible: Number.isFinite(c.last.followingSpeedLimit),
      nativeSeparationX: baseline.separationX, candidateSeparationX: c.last.separationX,
      nativeFrontCrowding: baseline.frontCrowding, candidateFrontCrowding: c.last.frontCrowding,
      sweptGuardExact: JSON.stringify(Array.from(guardBefore)) === JSON.stringify(Array.from(guardAfter)),
      sample: sensed[0] };
  });
  return {
    registeredLaws: FLOW_VELOCITY_LAWS,
    rows: layers.map(L => ({ layers: L, followingHeadwaySeconds: materialHeadway(L),
      velocityFactor: velocityFactor(L), maximumVelocityRelaxationReduction: 1 - velocityFactor(L) })),
    fixedMotor: { dtSeconds: [1 / 30, 1 / 60, 1 / 120], control: [1 / 30, 1 / 60, 1 / 120].map(dt => motor(dt, false)),
      conditionedWithMaterialTransition: [1 / 30, 1 / 60, 1 / 120].map(dt => motor(dt, true)) },
    sameFlowGate: followingRows.map(({ eligible, nativeFollowingSpeedLimit, candidateFollowingSpeedLimit,
      nativeHeadwayTerm, candidateHeadwayTerm }) => ({ eligible, nativeFollowingSpeedLimit,
      candidateFollowingSpeedLimit, nativeHeadwayTerm, candidateHeadwayTerm })),
    flowClassifications,
    finalTargetGate,
    probeScope: 'Fixed same-state local response only; no natural-world run.',
    interpretation: 'Authored candidate laws, not measured biology or traction. Candidate worlds require separate registration after actual-neutral leverage and material-binding gates.'
  };
}

if (process.argv[1]?.endsWith('ant-material-flow-velocity-probes.js')) {
  process.stdout.write(`${JSON.stringify(process.argv.includes('--self-test') ? selfTest() : runProbe())}\n`);
}
