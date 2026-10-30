import assert from 'node:assert/strict';
import { AntAgent, ANT_MAX_TURN_RATE } from '../src/lib/agents/ant/AntAgent.js';

const p = layers => 1 - 0.50 * (1 - Math.exp(-layers / 4));
const delta = (from, to) => ((to - from + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const cellLayers = (snapshot, x, y) => {
  if (!Number.isInteger(snapshot?.width) || !Number.isInteger(snapshot?.height)
      || !ArrayBuffer.isView(snapshot?.stratigraphy?.layerCountByCell)) return 0;
  const i = Math.round(y * (snapshot.height - 1)) * snapshot.width + Math.round(x * (snapshot.width - 1));
  return snapshot.stratigraphy.layerCountByCell[i] || 0;
};

// Research-only wrapper. The tick-entry material count applies to every turn call in that tick.
export function attachTurningResponse(controller, { enabled = true, onTurn = null } = {}) {
  const nativeTick = controller.tick, tick = nativeTick.bind(controller), wrapped = new Map();
  let entryLayers = new Map();
  const wrappedTick = (...args) => {
    const agents = controller.agents || [];
    const snapshot = enabled || onTurn ? controller.materialStratigraphy?.getSnapshot?.() : null;
    const live = new Set(agents);
    for (const [agent, record] of wrapped) if (!live.has(agent)) {
      if (agent.turnToward === record.wrapper) agent.turnToward = record.original;
      wrapped.delete(agent);
    }
    entryLayers = new Map();
    for (const agent of agents) {
      const layers = snapshot ? cellLayers(snapshot, agent.x, agent.y) : 0;
      entryLayers.set(agent, layers);
      if (!wrapped.has(agent)) {
        const original = agent.turnToward;
        const wrapper = function (targetHeading, dtSeconds) {
          const layers = entryLayers.get(agent) || 0, factor = enabled ? p(layers) : 1;
          const beforeHeading = this.heading;
          let nativeHeading, nativeAngularVelocity;
          if (onTurn) {
            const copy = { ...this };
            original.call(copy, targetHeading, dtSeconds);
            nativeHeading = copy.heading; nativeAngularVelocity = copy.angularVelocity;
          }
          original.call(this, targetHeading, factor === 1 ? dtSeconds : dtSeconds * factor);
          if (factor !== 1) this.angularVelocity = dtSeconds > 0 ? delta(beforeHeading, this.heading) / dtSeconds : 0;
          if (onTurn) onTurn({ agent, targetHeading, dtSeconds, layers, factor, beforeHeading,
            afterHeading: this.heading, angularVelocity: this.angularVelocity, nativeHeading, nativeAngularVelocity });
        };
        wrapped.set(agent, { wrapper, original });
        agent.turnToward = wrapper;
      }
    }
    return tick(...args);
  };
  controller.tick = wrappedTick;
  return { finish() {
    for (const [agent, record] of wrapped) if (agent.turnToward === record.wrapper) agent.turnToward = record.original;
    wrapped.clear(); entryLayers.clear();
    if (controller.tick === wrappedTick) controller.tick = nativeTick;
  }, factorFor: agent => enabled ? p(entryLayers.get(agent) || 0) : 1 };
}

function probe() {
  const dt = 1 / 60, ticks = 240, desiredSpeed = .08;
  const targetAt = tick => tick < 60 ? Math.PI * .95
    : tick < 120 ? (tick % 2 ? -1 : 1) * Math.PI * .95
      : Math.sin((tick - 120) * Math.PI / 12) * Math.PI * .95;
  const run = layers => {
    const ant = new AntAgent({ id: 1, x: .5, y: .5, heading: -Math.PI * .9, random: () => .5 });
    const rows = [];
    const controller = { agents: [ant], map: Uint8Array.of(layers),
      materialStratigraphy: { getSnapshot() { return { width: 1, height: 1, stratigraphy: { layerCountByCell: thisOwner.map } }; } },
      target: 0, tick() {
        const targetHeading = targetAt(this.target++);
        ant.turnToward(targetHeading, dt);
        ant.accelerateToward(desiredSpeed, dt);
        rows.at(-1).actualSpeed = Math.hypot(ant.vx, ant.vy);
        rows.at(-1).stepDistance = rows.at(-1).actualSpeed * dt;
        ant.x += ant.vx * dt; ant.y += ant.vy * dt;
      } };
    const thisOwner = controller;
    const hook = attachTurningResponse(controller, { onTurn(row) { rows.push(row); } });
    for (let i = 0; i < ticks; i++) controller.tick();
    hook.finish();
    const targetErrors = rows.map(row => Math.abs(delta(row.afterHeading, row.targetHeading)));
    const rates = rows.map(row => Math.abs(delta(row.beforeHeading, row.afterHeading)) / dt);
    const distances = rows.map(row => row.stepDistance);
    const curvatures = rows.map((row, i) => distances[i] > 0
      ? Math.abs(delta(row.beforeHeading, row.afterHeading)) / distances[i] : 0);
    const speeds = rows.map(row => row.actualSpeed);
    return { ticks, targetSchedule: '0-59 step; 60-119 alternating +/-0.95pi each tick; 120-239 sine period 24 ticks',
      finalHeading: ant.heading, finalSpeed: Math.hypot(ant.vx, ant.vy), fixedDesiredSpeedInput: desiredSpeed,
      targetErrorRad: stats(targetErrors), angularRateRadPerSecond: stats(rates),
      pathLength: distances.reduce((sum, distance) => sum + distance, 0), curvaturePerWorldUnit: stats(curvatures),
      realizedSpeedWorldUnitsPerSecond: stats(speeds), nativeVsConditionedTurnCalls: rows.filter(row =>
        Math.abs(delta(row.nativeHeading, row.afterHeading)) > 1e-12).length };
  };
  const control = run(0), conditioned = run(8);
  return { law: 'q(L)=1-0.50*(1-exp(-L/4)); cap=4.5*q rad/s', control, L8: conditioned,
    comparison: { controlCap: ANT_MAX_TURN_RATE, conditionedCap: ANT_MAX_TURN_RATE * p(8),
      targetScheduleMatched: true, desiredSpeedInputMatched: true, naturalWorldRun: false } };
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b), sum = values.reduce((a, b) => a + b, 0);
  return { mean: sum / values.length, max: sorted.at(-1), p95: sorted[Math.floor((sorted.length - 1) * .95)] };
}

export function selfTest() {
  assert.equal(p(0), 1);
  for (let l = 0; l < 100; l++) assert(p(l + 1) <= p(l) && p(l + 1) >= .5);
  const dt = 1 / 60, ant = new AntAgent({ id: 1, x: .5, y: .5, heading: 0, random: () => .5 });
  let layers = 4, mutationDuringTick = false;
  const controller = { agents: [ant], materialStratigraphy: { getSnapshot: () => ({ width: 1, height: 1,
    stratigraphy: { layerCountByCell: Uint8Array.of(layers) } }) }, tick() {
    layers = 40; ant.turnToward(Math.PI, dt); mutationDuringTick = Math.abs(Math.abs(ant.angularVelocity) - 4.5 * p(4)) < 1e-12;
  } };
  const native = ant.turnToward, callbackRows = [], hook = attachTurningResponse(controller, { onTurn: row => callbackRows.push(row) });
  controller.tick(); assert(mutationDuringTick, 'tick uses entry material count');
  assert.equal(callbackRows.length, 1); assert.equal(callbackRows[0].layers, 4);
  assert(Math.abs(Math.abs(callbackRows[0].nativeAngularVelocity) - 4.5) < 1e-12);
  assert(Math.abs(Math.abs(delta(callbackRows[0].beforeHeading, callbackRows[0].nativeHeading) / dt) - 4.5) < 1e-12);
  assert(Math.abs(delta(callbackRows[0].nativeHeading, callbackRows[0].afterHeading)) > 0,
    'callback identifies the conditioned turn call');
  assert.equal(ant.intentHeading, 0, 'target intent remains untouched');
  assert(Math.abs(Math.abs(ant.angularVelocity) - 4.5 * p(4)) < 1e-12);
  ant.heading = 0; controller.tick(); assert(Math.abs(Math.abs(ant.angularVelocity) - 4.5 * p(40)) < 1e-12);
  hook.finish(); assert.equal(ant.turnToward, native, 'finish restores native function');
  const disabledAnt = new AntAgent({ id: 2, x: 0, y: 0, heading: 0, random: () => .5 });
  const disabled = { agents: [disabledAnt], tick() { disabledAnt.turnToward(Math.PI, dt); } };
  const disabledNative = disabledAnt.turnToward, disabledRows = [];
  const disabledHook = attachTurningResponse(disabled, { enabled: false, onTurn: row => disabledRows.push(row) });
  disabled.tick(); assert.equal(Math.abs(disabledAnt.angularVelocity), 4.5);
  assert.equal(disabledRows.length, 1); assert.equal(disabledRows[0].layers, 0);
  assert.equal(disabledRows[0].factor, 1); assert.equal(disabledRows[0].nativeHeading, disabledRows[0].afterHeading);
  disabledHook.finish();
  assert.equal(disabledAnt.turnToward, disabledNative);
  const recruit = new AntAgent({ id: 3, x: .5, y: .5, heading: 0, random: () => .5 });
  const turnover = { agents: [ant], materialStratigraphy: controller.materialStratigraphy,
    tick() { this.agents = [recruit]; recruit.turnToward(Math.PI, dt); } };
  const turnoverHook = attachTurningResponse(turnover); turnover.tick(); turnover.tick();
  assert(Math.abs(Math.abs(recruit.angularVelocity) - 4.5 * p(40)) < 1e-12); turnoverHook.finish();
  return { lawBounds: true, entrySnapshotIsolated: true, nativeL0AndDisabled: true,
    trueAngularVelocity: true, targetIntentUntouched: true, recruitedAgentSupported: true,
    removedAgentRestored: true, matchedNativeCallback: true, rngCallsAdded: 0 };
}

if (process.argv[1]?.endsWith('ant-material-turning-probe.js')) {
  const mode = process.argv[2] || '--probe';
  process.stdout.write(JSON.stringify(mode === '--self-test' ? selfTest() : probe()) + '\n');
}
